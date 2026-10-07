// 녹음 + Scene 화면 + 자막을 하나의 YouTube 영상(mp4)으로 합친다. ffmpeg·playwright 필요.
import { execFile } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { readEpisodeFile } from "../episode.js";
import { findSection, parseBlocks } from "../parse.js";
import { analyzeStoryboard } from "../validate.js";
import { FRAME, renderFrames, sceneFrameHtml } from "./frames.js";
import { buildTimeline, formatClock, parseScriptChapters, subtitleCues } from "./timeline.js";

const run = promisify(execFile);
const FPS = 30;
const MEDIA = /\.(png|jpe?g|webp|mp4|mov|m4v)$/i;
const ASSET_FIELDS = ["SCENE", "NEEDED MATERIAL", "BRAND", "SOURCE TYPE", "SEARCH KEYWORD", "EXPECTED SOURCE", "PRIORITY"];

async function ffmpeg(args) {
  try {
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 1 << 26 });
  } catch (error) {
    throw new Error(`ffmpeg 실패: ${error.stderr || error.message}`);
  }
}

export async function probeSeconds(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`길이를 읽지 못했습니다: ${file}`);
  return seconds;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

// Scene에 쓸 사진·영상: AI 생성물(status.generated) → 사용자가 준 실제 자료(assets/references/<EP>/<ASSET ID 또는 SCENE ID>.*)
async function mediaFor(scene, episode, referenceDir, root) {
  const generated = episode.status.generated?.[scene.id]?.files ?? [];
  for (const file of generated) {
    const resolved = path.isAbsolute(file) ? file : path.join(root, file);
    if (MEDIA.test(resolved) && (await exists(resolved))) return resolved;
  }
  let names = [];
  try {
    names = await readdir(referenceDir);
  } catch {
    return null;
  }
  const keys = [scene.id, ...String(scene.asset).split(/[,\s]+/).filter((key) => /^A\d+/i.test(key))];
  for (const key of keys) {
    const hit = names.find((name) => MEDIA.test(name) && path.parse(name).name.toUpperCase() === key.toUpperCase());
    if (hit) return path.join(referenceDir, hit);
  }
  return null;
}

function assTime(seconds) {
  const cs = Math.round(seconds * 100);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

function srtTime(seconds) {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

export function buildAss(cues) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${FRAME.width}
PlayResY: ${FRAME.height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Pretendard SemiBold,52,&H00FFFFFF,&H00FFFFFF,&H64111111,&H64111111,0,0,0,0,100,100,0,0,3,14,0,2,160,160,70,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = cues.map((cue) => `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${cue.text.replace(/[{}]/g, "")}`);
  return `${header}${lines.join("\n")}\n`;
}

export function buildSrt(cues) {
  return cues.map((cue, index) => `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`).join("\n");
}

function list(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean);
}

export function buildUploadKit(episode, brief, timeline) {
  const titles = list(findSection(brief, "Title Candidates"));
  const thesis = list(findSection(brief, "One Sentence Thesis"))[0] ?? "";
  const chapters = [...timeline.chapters];
  if (!chapters.length || chapters[0].start > 0.5) chapters.unshift({ title: "오프닝", start: 0 });
  chapters[0].start = 0;
  const chapterLines = chapters.map((chapter) => `${formatClock(chapter.start)} ${chapter.title}`);
  const description = [
    thesis,
    "",
    `브런치 원문 ▶ ${episode.status.article.url}`,
    "",
    ...chapterLines,
    "",
    "인스타그램 @bruce.insight · 브런치 @heoboram · bruceheo.com",
    "#마케팅 #브랜딩 #브루스인사이트",
  ].join("\n");
  return [
    `# ${episode.status.episode} 업로드 정보`,
    "",
    "## 제목 (1순위)",
    "",
    titles[0] ?? episode.status.article.title,
    "",
    "## 다른 제목 후보",
    "",
    ...titles.slice(1).map((title) => `- ${title}`),
    "",
    "## 설명 (그대로 붙여넣기)",
    "",
    "```",
    description,
    "```",
    "",
    "## 태그",
    "",
    "마케팅, 브랜딩, 광고, 브랜드 사례, 마케터, 캠페인, 콘텐츠 마케팅, 브루스 인사이트",
    "",
    "## 설정",
    "",
    "- 썸네일: thumbnail.png",
    "- 자막: 영상에 들어가 있음. 검색용으로 subtitles.srt를 '자막 → 업로드'에 올려도 된다(선택).",
    `- 변경된 콘텐츠 표시: ${Object.keys(episode.status.generated ?? {}).length ? "AI 생성 장면 있음 → 사실적인 장면이면 '예'" : "AI 생성 장면 없음 → '아니요'"}`,
    "- 공개: 비공개로 올려 확인 후 공개 또는 예약",
    "",
  ].join("\n");
}

function thumbnailHtml(copy, pill, imageUrl) {
  const lines = String(copy).split(/\s*\/\s*|\n/).filter(Boolean);
  const text = lines.length > 1 ? lines : String(copy).length > 9 ? splitHalf(String(copy)) : [String(copy)];
  return `<!doctype html><meta charset="utf-8"><style>__FONT__
*{box-sizing:border-box;margin:0}body{width:1280px;height:720px;background:#F2F1ED;position:relative;overflow:hidden;font-family:P,sans-serif;word-break:keep-all}
.img{position:absolute;right:0;top:0;width:46%;height:100%;background:${imageUrl ? `url('${imageUrl}') center/cover` : "#111"}}
.copy{position:absolute;left:64px;top:64px;width:720px;height:592px;display:flex;flex-direction:column}
.pill{align-self:flex-start;border:4px solid #65B98A;border-radius:999px;padding:10px 22px 13px;color:#23744c;font-size:26px;font-weight:800;line-height:1}
h1{margin-top:auto;font-size:${Math.max(...text.map((l) => l.length)) > 8 ? 78 : 92}px;font-weight:900;letter-spacing:-.055em;line-height:1.08;color:#111}
.dot{color:#65B98A}.mark{width:84px;height:84px;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-size:31px;font-weight:900;letter-spacing:-.08em;margin-top:40px}
</style><body><div class="img"></div><div class="copy"><span class="pill">${pill}</span><h1>${text.join("<br>")}<span class="dot">.</span></h1><div class="mark">BR.</div></div></body>`;
}

function splitHalf(value) {
  const words = value.split(" ");
  if (words.length < 2) return [value];
  let best = 1;
  let diff = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const d = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (d < diff) {
      diff = d;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/**
 * 영상 만들기. audioFiles: 녹음 파일 경로(챕터 순서). outDir에 <EP>.mp4, subtitles.srt, thumbnail.png, upload.md를 만든다.
 */
export async function renderEpisode(episode, audioFiles, { root, outDir, preview = false, log = () => {} }) {
  const storyboardText = await readEpisodeFile(episode, "03_storyboard.md");
  const script = await readEpisodeFile(episode, "02_script.md");
  const brief = (await readEpisodeFile(episode, "01_brief.md")) ?? "";
  const assetsText = (await readEpisodeFile(episode, "04_assets.md")) ?? "";
  if (!storyboardText || !script) throw new Error("02_script.md 또는 03_storyboard.md가 없습니다.");

  const storyboard = analyzeStoryboard(storyboardText);
  const chapters = parseScriptChapters(script);
  const audio = [];
  for (const file of audioFiles) audio.push({ file, seconds: await probeSeconds(file) });
  const timeline = buildTimeline(storyboard.scenes, chapters, audio);
  log(`타임라인 ${formatClock(timeline.total)} · Scene ${timeline.scenes.length}개 · ${timeline.mode === "chapter" ? "챕터별 맞춤" : "전체 비율 맞춤"}`);

  const work = path.join(outDir, "work");
  await mkdir(work, { recursive: true });
  const assets = new Map(parseBlocks(assetsText, "ASSET ID", ASSET_FIELDS).map((block) => [block["ASSET ID"]?.split(/\s/)[0], block]));
  const referenceDir = path.join(root, "assets", "references", episode.status.episode);
  const labels = { REAL: "사례", TYPE: "브루스 인사이트", GRAPHIC: "브루스 인사이트", AI: "브루스 인사이트" };

  // 1) Scene 화면 그리기
  const jobs = [];
  for (const [index, scene] of timeline.scenes.entries()) {
    const media = await mediaFor(scene, episode, referenceDir, root);
    const assetId = String(scene.asset).match(/A\d+/i)?.[0];
    const { html, transparent } = sceneFrameHtml(scene, { label: labels[scene.sourceType] ?? "브루스 인사이트", asset: assets.get(assetId), media });
    scene.media = media;
    scene.frame = `frame_${String(index).padStart(3, "0")}.png`;
    jobs.push({ file: scene.frame, html, transparent });
  }
  log(`화면 ${jobs.length}장 그리는 중`);
  await renderFrames(jobs, work);

  // 2) Scene별 영상 조각
  const size = preview ? "960:540" : `${FRAME.width}:${FRAME.height}`;
  const encode = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-r", String(FPS), "-an"];
  const clips = [];
  for (const [index, scene] of timeline.scenes.entries()) {
    const seconds = Math.max(scene.end - scene.start, 1 / FPS).toFixed(3);
    const frames = Math.max(1, Math.round((scene.end - scene.start) * FPS));
    const clip = path.join(work, `clip_${String(index).padStart(3, "0")}.mp4`);
    const frame = path.join(work, scene.frame);
    if (!scene.media) {
      await ffmpeg(["-loop", "1", "-framerate", String(FPS), "-t", seconds, "-i", frame, "-vf", `scale=${size}`, ...encode, clip]);
    } else if (/\.(mp4|mov|m4v)$/i.test(scene.media)) {
      await ffmpeg([
        "-stream_loop", "-1", "-i", scene.media, "-i", frame, "-t", seconds,
        "-filter_complex", `[0:v]scale=${FRAME.width}:${FRAME.height}:force_original_aspect_ratio=increase,crop=${FRAME.width}:${FRAME.height},setsar=1,fps=${FPS}[v];[v][1:v]overlay=0:0,scale=${size}`,
        ...encode, clip,
      ]);
    } else {
      // 정지 이미지는 천천히 밀어 들어가는 움직임을 준다 (크레딧 0)
      await ffmpeg([
        "-loop", "1", "-i", scene.media, "-i", frame, "-t", seconds,
        "-filter_complex",
        `[0:v]scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='min(zoom+0.0005,1.10)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${FRAME.width}x${FRAME.height}:fps=${FPS}[v];[v][1:v]overlay=0:0,scale=${size}`,
        ...encode, clip,
      ]);
    }
    clips.push(clip);
  }
  const clipList = path.join(work, "clips.txt");
  await writeFile(clipList, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"));
  const video = path.join(work, "video.mp4");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", clipList, "-c", "copy", video]);

  // 3) 녹음 이어붙이기 + 유튜브 기준 음량(-14 LUFS)
  const audioOut = path.join(work, "narration.m4a");
  const inputs = audio.flatMap((item) => ["-i", item.file]);
  const join = audio.map((_, index) => `[${index}:a]`).join("");
  await ffmpeg([...inputs, "-filter_complex", `${join}concat=n=${audio.length}:v=0:a=1,loudnorm=I=-14:TP=-1.5:LRA=11[a]`, "-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", audioOut]);

  // 4) 자막을 입혀 최종본
  const cues = subtitleCues(timeline);
  const assFile = path.join(work, "subtitles.ass");
  await writeFile(assFile, buildAss(cues));
  await writeFile(path.join(outDir, "subtitles.srt"), buildSrt(cues));
  const fontsDir = path.dirname(createRequire(import.meta.url).resolve("pretendard/dist/public/static/Pretendard-SemiBold.otf"));
  const finalFile = path.join(outDir, `${episode.status.episode}${preview ? "_preview" : ""}.mp4`);
  log("최종 인코딩 중");
  await ffmpeg([
    "-i", video, "-i", audioOut,
    "-vf", `ass=${assFile.replace(/:/g, "\\:")}:fontsdir=${fontsDir}`,
    "-c:v", "libx264", "-preset", preview ? "ultrafast" : "veryfast", "-crf", preview ? "30" : "21", "-pix_fmt", "yuv420p",
    "-c:a", "copy", "-shortest", "-movflags", "+faststart", finalFile,
  ]);

  // 5) 썸네일과 업로드 정보
  const thumbCopy = list(findSection(brief, "Thumbnail Copy"))[0] || episode.status.article.title;
  const aiImage = timeline.scenes.find((scene) => scene.media && /\.(png|jpe?g|webp)$/i.test(scene.media))?.media;
  const imageUrl = aiImage ? `data:image/${path.extname(aiImage).slice(1).replace("jpg", "jpeg")};base64,${(await readFile(aiImage)).toString("base64")}` : null;
  await renderFrames([{ file: "thumbnail.png", html: thumbnailHtml(thumbCopy, "브랜드 사례", imageUrl), viewport: { width: 1280, height: 720 } }], outDir);
  await writeFile(path.join(outDir, "upload.md"), buildUploadKit(episode, brief, timeline));
  return { file: finalFile, seconds: timeline.total, scenes: timeline.scenes.length, cues: cues.length };
}
