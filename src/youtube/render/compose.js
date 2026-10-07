// 녹음 + Scene 화면 + 자막을 하나의 YouTube 영상(mp4)으로 합친다. ffmpeg·playwright 필요.
import { execFile } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { mapLimit, readJson } from "../../lib/files.js";
import { cpus } from "node:os";
import { readEpisodeFile } from "../episode.js";
import { findSection, parseBlocks } from "../parse.js";
import { analyzeStoryboard } from "../validate.js";
import { FRAME, overlayHtml, renderFrames, sceneFrameHtml, screenLines } from "./frames.js";
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

const CONCURRENCY = Math.max(1, Math.min(4, cpus().length));
const SHOT_SECONDS = 5; // 한 화면이 이보다 길면 다음 그림으로 넘긴다
const CARD_SECONDS = 6; // 타이포 카드를 보여주는 최대 시간

async function imageSize(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]);
  const [width, height] = stdout.trim().split(",").map(Number);
  return { width, height };
}

/**
 * 장면에 쓸 그림 모음.
 * - 장면 전용: AI 생성물(status.generated) + credits.json에서 그 장면(또는 ASSET ID)에 붙은 자료 + 사용자가 준 파일(<Scene|Asset>.*)
 * - 공용 풀: 장면이 정해지지 않은 자료(브런치 원문 이미지 등). 지루한 긴 장면을 채우는 데 쓴다.
 */
async function loadMedia(episode, referenceDir, root) {
  const credits = await readJson(path.join(referenceDir, "credits.json"), { items: [] });
  // references.json의 exclude: 받아 보니 쓸모없는 그림(광고 배너·아이콘·유료벽 화면 등). 파일 이름(확장자 생략 가능)
  const references = await readJson(path.join(episode.dir, "references.json"), {});
  const excluded = new Set((references.exclude ?? []).map((name) => String(name).replace(/\.[a-z]+$/i, "").toUpperCase()));
  const isExcluded = (file) => excluded.has(path.parse(file).name.toUpperCase());
  const byKey = new Map();
  const pool = [];
  const add = (key, media) => byKey.set(key, [...(byKey.get(key) ?? []), media]);
  for (const item of credits.items ?? []) {
    const file = path.join(referenceDir, item.file);
    if (isExcluded(item.file) || !(await exists(file))) continue;
    const media = { file, kind: item.kind, credit: item.source, url: item.url };
    if (item.scenes?.length) for (const scene of item.scenes) add(scene.toUpperCase(), media);
    else if (/^A\d+/i.test(item.id)) add(item.id.toUpperCase(), media);
    else pool.push(media);
  }
  const known = new Set((credits.items ?? []).map((item) => item.file));
  let names = [];
  try {
    names = await readdir(referenceDir);
  } catch {
    names = [];
  }
  for (const name of names) {
    if (!MEDIA.test(name) || known.has(name) || isExcluded(name)) continue;
    const key = path.parse(name).name.toUpperCase().replace(/[-_].*$/, "");
    if (/^(S|A)\d+$/.test(key)) add(key, { file: path.join(referenceDir, name), kind: /\.(mp4|mov|m4v)$/i.test(name) ? "video" : "image", credit: "제공 자료" });
  }
  for (const [scene, info] of Object.entries(episode.status.generated ?? {})) {
    for (const file of info.files ?? []) {
      const resolved = path.isAbsolute(file) ? file : path.join(root, file);
      if (MEDIA.test(resolved) && (await exists(resolved))) {
        add(scene.toUpperCase(), { file: resolved, kind: /\.(mp4|mov|m4v)$/i.test(resolved) ? "video" : "ai", credit: null });
      }
    }
  }
  return { byKey, pool };
}

function sceneMedia(scene, byKey) {
  const keys = [scene.id, ...String(scene.asset).split(/[,\s]+/).filter((key) => /^A\d+/i.test(key))].map((key) => key.toUpperCase());
  const seen = new Set();
  return keys.flatMap((key) => byKey.get(key) ?? []).filter((media) => !seen.has(media.file) && seen.add(media.file));
}

function splitShots(start, end, count) {
  const span = (end - start) / count;
  return Array.from({ length: count }, (_, index) => ({ start: start + span * index, end: index === count - 1 ? end : start + span * (index + 1) }));
}

/**
 * 장면을 3~6초 컷으로 나눈다. 같은 그림을 되풀이하지 않는다.
 * - TYPE: 문구 카드 먼저(최대 6초) → 그 장면 자료 → 공용 풀(브런치 이미지 등)
 * - GRAPHIC: 도식이 내용이라 카드만 (천천히 확대)
 * - REAL·AI: 자료가 있으면 자료만(첫 컷에 문구), 없으면 카드 → 공용 풀
 */
export function planShots(timeline, { byKey, pool }) {
  const shots = [];
  let poolIndex = 0;
  let motionIndex = 0;
  for (const scene of timeline.scenes) {
    const own = sceneMedia(scene, byKey);
    const span = scene.end - scene.start;
    const mediaFirst = (scene.sourceType === "REAL" || scene.sourceType === "AI") && own.length;
    let at = scene.start;

    if (scene.sourceType === "GRAPHIC" || (!own.length && !pool.length)) {
      shots.push({ start: scene.start, end: scene.end, scene, media: null });
      continue;
    }
    if (!mediaFirst) {
      const cardEnd = span <= CARD_SECONDS + 2 && !own.length ? scene.end : scene.start + Math.min(CARD_SECONDS, span / 2);
      shots.push({ start: scene.start, end: cardEnd, scene, media: null });
      at = cardEnd;
    }
    const rest = scene.end - at;
    if (rest < 0.5) {
      shots.at(-1).end = scene.end;
      continue;
    }
    const wanted = Math.max(1, Math.round(rest / SHOT_SECONDS));
    const fills = own.slice(0, wanted);
    while (fills.length < wanted && pool.length && fills.length < pool.length + own.length) {
      fills.push(pool[poolIndex++ % pool.length]);
    }
    if (!fills.length) {
      shots.at(-1).end = scene.end;
      continue;
    }
    // 기사 전체 화면(위→아래 스크롤)은 다른 컷보다 길게
    const weights = fills.map((media) => (media.kind === "scroll" ? 2 : 1));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    fills.forEach((media, index) => {
      const length = (rest * weights[index]) / total;
      shots.push({ start: at, end: index === fills.length - 1 ? scene.end : at + length, scene, media, motion: motionIndex++ });
      at += length;
    });
  }
  return shots;
}

// 정지 화면도 천천히 움직이게: 확대·축소·좌우 이동을 번갈아 쓴다.
function motion(index, frames) {
  const kinds = [
    { z: `1+0.08*on/${frames}`, x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    { z: `1.08-0.08*on/${frames}`, x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" },
    { z: "1.1", x: `(iw-iw/zoom)*on/${frames}`, y: "ih/2-(ih/zoom/2)" },
    { z: "1.1", x: `(iw-iw/zoom)*(1-on/${frames})`, y: "ih/2-(ih/zoom/2)" },
  ];
  const kind = kinds[index % kinds.length];
  return `zoompan=z='${kind.z}':x='${kind.x}':y='${kind.y}':d=1:s=${FRAME.width}x${FRAME.height}:fps=${FPS}`;
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

export function buildUploadKit(episode, brief, timeline, sources = []) {
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
    ...(sources.length ? ["자료 출처", ...sources.map((item) => `- ${item.source}${item.url ? ` ${item.url}` : ""}`), ""] : []),
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
export async function renderEpisode(episode, audioFiles, { root, outDir, preview = false, cleanup = true, log = () => {} }) {
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
  const media = await loadMedia(episode, referenceDir, root);
  const shots = planShots(timeline, media);
  log(`화면 ${shots.length}컷 (실제·브런치 자료 ${shots.filter((shot) => shot.media && shot.media.kind !== "ai").length}컷, AI ${shots.filter((shot) => shot.media?.kind === "ai").length}컷)`);

  // 1) 컷마다 카드 또는 투명 오버레이(라벨·문구·출처) 그리기
  const jobs = [];
  shots.forEach((shot, index) => {
    const scene = shot.scene;
    const assetId = String(scene.asset).match(/A\d+/i)?.[0];
    const label = scene.sourceType === "REAL" ? `사례 · ${assets.get(assetId)?.BRAND || "사례"}` : labels[scene.sourceType] ?? "브루스 인사이트";
    shot.frame = `frame_${String(index).padStart(4, "0")}.png`;
    if (shot.media) {
      const first = index === 0 || shots[index - 1].scene !== scene;
      jobs.push({ file: shot.frame, html: overlayHtml({ label, lines: first || shot.media.kind === "ai" ? screenLines(scene) : [], credit: shot.media.credit }), transparent: true });
    } else {
      jobs.push({ file: shot.frame, html: sceneFrameHtml(scene, { label: labels[scene.sourceType] ?? "브루스 인사이트", asset: assets.get(assetId) }).html });
    }
  });
  await renderFrames(jobs, work);

  // 2) 컷별 영상 조각
  const size = preview ? "960:540" : `${FRAME.width}:${FRAME.height}`;
  const encode = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-r", String(FPS), "-an"];
  log(`컷 ${shots.length}개 인코딩 중 (동시 ${CONCURRENCY}개)`);
  const clips = await mapLimit(shots, CONCURRENCY, async (shot, index) => {
    const seconds = Math.max(shot.end - shot.start, 1 / FPS).toFixed(3);
    const frames = Math.max(1, Math.round((shot.end - shot.start) * FPS));
    const clip = path.join(work, `clip_${String(index).padStart(4, "0")}.mp4`);
    const frame = path.join(work, shot.frame);
    const still = ["-loop", "1", "-framerate", String(FPS), "-t", seconds];
    if (!shot.media) {
      // 카드: 아주 천천히 확대
      await ffmpeg([...still, "-i", frame, "-filter_complex",
        `[0:v]scale=2112:1188,zoompan=z='1+0.03*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${FRAME.width}x${FRAME.height}:fps=${FPS},scale=${size}`,
        ...encode, clip]);
    } else if (shot.media.kind === "video") {
      await ffmpeg(["-stream_loop", "-1", "-i", shot.media.file, "-i", frame, "-t", seconds, "-filter_complex",
        `[0:v]scale=${FRAME.width}:${FRAME.height}:force_original_aspect_ratio=increase,crop=${FRAME.width}:${FRAME.height},setsar=1,fps=${FPS}[v];[v][1:v]overlay=0:0,scale=${size}`,
        ...encode, clip]);
    } else if (shot.media.kind === "scroll") {
      // 기사 전체 화면: 위에서 아래로 천천히 내려간다
      await ffmpeg([...still, "-i", shot.media.file, "-loop", "1", "-i", frame, "-filter_complex",
        `[0:v]scale=${FRAME.width}:-2,crop=${FRAME.width}:${FRAME.height}:0:'(ih-${FRAME.height})*t/${seconds}'[v];[v][1:v]overlay=0:0,scale=${size}`,
        "-t", seconds, ...encode, clip]);
    } else {
      const { width, height } = await imageSize(shot.media.file);
      const wide = width / height >= 1.3;
      const base = wide
        ? `[0:v]scale=2304:1296:force_original_aspect_ratio=increase,crop=2304:1296[b]`
        : `[0:v]split[a][f];[a]scale=2304:1296:force_original_aspect_ratio=increase,crop=2304:1296,boxblur=40:2,eq=brightness=-0.18[bg];[f]scale=-2:1150[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[b]`;
      await ffmpeg([...still, "-i", shot.media.file, "-loop", "1", "-i", frame, "-filter_complex",
        `${base};[b]${motion(shot.motion ?? index, frames)}[v];[v][1:v]overlay=0:0,scale=${size}`,
        "-t", seconds, ...encode, clip]);
    }
    return clip;
  });
  const clipList = path.join(work, "clips.txt");
  await writeFile(clipList, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"));
  const video = path.join(work, "video.mp4");
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", clipList, "-c", "copy", video]);

  // 3) 녹음 이어붙이기 + 저음 웅웅거림·일정한 잡음(에어컨·팬) 줄이기 + 유튜브 기준 음량(-14 LUFS)
  //    ElevenLabs Voice Isolator로 이미 정리한 파일이면 cleanup=false로 건너뛴다.
  const audioOut = path.join(work, "narration.m4a");
  const inputs = audio.flatMap((item) => ["-i", item.file]);
  const join = audio.map((_, index) => `[${index}:a]`).join("");
  await ffmpeg([...inputs, "-filter_complex", `${join}concat=n=${audio.length}:v=0:a=1,${cleanup ? "highpass=f=80,afftdn=nf=-25:tn=1," : ""}loudnorm=I=-14:TP=-1.5:LRA=11[a]`, "-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", audioOut]);

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
  const aiImage = shots.find((shot) => shot.media && shot.media.kind !== "video" && shot.media.kind !== "scroll")?.media.file;
  const imageUrl = aiImage ? `data:image/${path.extname(aiImage).slice(1).replace("jpg", "jpeg")};base64,${(await readFile(aiImage)).toString("base64")}` : null;
  await renderFrames([{ file: "thumbnail.png", html: thumbnailHtml(thumbCopy, "브랜드 사례", imageUrl), viewport: { width: 1280, height: 720 } }], outDir);
  const sources = [];
  for (const shot of shots) {
    if (!shot.media?.credit || sources.some((item) => item.source === shot.media.credit && item.url === shot.media.url)) continue;
    sources.push({ source: shot.media.credit, url: shot.media.url });
  }
  await writeFile(path.join(outDir, "upload.md"), buildUploadKit(episode, brief, timeline, sources));
  return { file: finalFile, seconds: timeline.total, scenes: timeline.scenes.length, shots: shots.length, cues: cues.length };
}
