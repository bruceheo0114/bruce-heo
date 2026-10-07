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
import { FRAME, logoHtml, overlayHtml, renderFrames, sceneFrameHtml, screenLines } from "./frames.js";
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
const SHOT_SECONDS = 3.5; // 그림 한 컷 길이. 영상 호흡이 늘어지지 않게 3~4초마다 넘긴다
const CARD_SECONDS = 4; // 문구 카드를 보여주는 최대 시간
const GRAPHIC_SECONDS = 6; // 도식 카드를 보여주는 최대 시간

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
    else if (media.kind !== "scroll") pool.push(media);
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

// 기사 전체 스크롤 화면은 글자가 작아 비어 보이므로, 그 장면에 다른 그림이 없을 때만 쓴다.
function sceneMedia(scene, byKey) {
  const keys = [scene.id, ...String(scene.asset).split(/[,\s]+/).filter((key) => /^A\d+/i.test(key))].map((key) => key.toUpperCase());
  const seen = new Set();
  const all = keys.flatMap((key) => byKey.get(key) ?? []).filter((media) => !seen.has(media.file) && seen.add(media.file));
  const rest = all.filter((media) => media.kind !== "scroll");
  return rest.length ? rest : all;
}

function splitShots(start, end, count) {
  const span = (end - start) / count;
  return Array.from({ length: count }, (_, index) => ({ start: start + span * index, end: index === count - 1 ? end : start + span * (index + 1) }));
}

const MAX_REUSE = 2;
const XFADE = 0.3; // 같은 장면 안 컷 사이 부드러운 전환(초)

/**
 * 장면을 컷으로 나눈다. 같은 그림을 되풀이하지 않는다.
 * - GRAPHIC: 도식 카드 하나 (움직이지 않음)
 * - TYPE: 그 장면 그림(실제 자료·AI 배경)이 있으면 그림 위에 큰 문구, 없으면 문구 카드 → 길면 공용 그림 위에 문구
 * - REAL·AI: 자료 그림을 5초 안팎으로 돌려 가며(첫 컷에 설명 한 줄), 없으면 사례 카드
 */
export function planShots(timeline, { byKey, pool }) {
  const shots = [];
  // 그림이 모자란 장면은 같은 챕터의 다른 장면 그림을 먼저 빌려 쓰고(내용이 맞는 그림), 그다음 공용 그림.
  // 한 그림은 영상 전체에서 최대 MAX_REUSE번까지만 쓴다.
  const used = new Map();
  const canUse = (media) => (used.get(media.file) ?? 0) < MAX_REUSE;
  const markUsed = (media) => used.set(media.file, (used.get(media.file) ?? 0) + 1);
  const chapterIndexAt = (time) => (timeline.chapters ?? []).reduce((found, chapter, index) => (chapter.start <= time + 0.01 ? index : found), -1);
  const chapterMedia = new Map();
  for (const other of timeline.scenes) {
    const index = chapterIndexAt(other.start);
    chapterMedia.set(index, [...(chapterMedia.get(index) ?? []), ...sceneMedia(other, byKey).filter((media) => media.kind !== "scroll")]);
  }
  const takePool = (count, scene, exclude = []) => {
    const picked = [];
    const candidates = [...(chapterMedia.get(chapterIndexAt(scene.start)) ?? []), ...pool];
    for (const media of candidates) {
      if (picked.length >= count) break;
      if (!canUse(media) || picked.some((item) => item.file === media.file) || exclude.some((item) => item.file === media.file)) continue;
      picked.push(media);
    }
    picked.forEach(markUsed);
    return picked;
  };
  const chapterAt = (time) => {
    let current = null;
    (timeline.chapters ?? []).forEach((chapter, index) => {
      if (chapter.start <= time + 0.01) current = { no: `CH${String(index + 1).padStart(2, "0")}`, title: chapter.title };
    });
    return current;
  };
  const push = (scene, start, end, media, mode) => shots.push({ start, end, scene, media, mode, chapter: chapterAt(start) });

  for (const scene of timeline.scenes) {
    const own = sceneMedia(scene, byKey);
    const span = scene.end - scene.start;
    const isType = scene.sourceType === "TYPE";
    const wanted = (seconds) => Math.max(1, Math.round(seconds / SHOT_SECONDS));
    // 그 장면 그림 → 모자라면 공용 그림. 같은 그림을 한 장면에서 되풀이하지 않는다.
    const fillsFor = (seconds, first = []) => {
      const count = wanted(seconds);
      const fills = [...first].slice(0, count);
      fills.forEach(markUsed);
      if (fills.length < count) fills.push(...takePool(count - fills.length, scene, fills));
      return fills;
    };

    // 도식: 최대 6초 보여주고, 길면 그림 위에 같은 장면 설명으로 이어 간다.
    // 문구 카드(그림 없는 TYPE·REAL·AI): 최대 4초.
    const cardLimit = scene.sourceType === "GRAPHIC" ? GRAPHIC_SECONDS : CARD_SECONDS;
    const startWithCard = scene.sourceType === "GRAPHIC" || !own.length;
    let at = scene.start;
    if (startWithCard) {
      const cardEnd = span <= cardLimit + 1.5 ? scene.end : scene.start + cardLimit;
      push(scene, scene.start, cardEnd, null, null);
      at = cardEnd;
      if (at >= scene.end - 0.01) continue;
    }
    const fills = fillsFor(scene.end - at, own);
    if (!fills.length) {
      shots.at(-1).end = scene.end;
      continue;
    }
    splitShots(at, scene.end, fills.length).forEach((shot, index) => {
      const mode = isType ? "type" : !startWithCard && index === 0 ? "caption" : scene.sourceType === "GRAPHIC" ? "none" : "none";
      push(scene, shot.start, shot.end, fills[index], mode);
    });
  }
  return shots;
}

// 정지 그림은 모두 같은 방식으로 아주 천천히 밀고 들어간다(1.00 → 1.05). 방향을 바꾸지 않아 산만하지 않다.
function pushIn(frames) {
  return `zoompan=z='1+0.05*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${FRAME.width}x${FRAME.height}:fps=${FPS}`;
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
Style: Default,Pretendard SemiBold,50,&H00FFFFFF,&H00FFFFFF,&H64111111,&H64111111,0,0,0,0,100,100,0,0,3,14,0,2,260,260,92,1

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
    "- 썸네일: thumbnail_1.png ~ thumbnail_3.png 중 하나 (thumbnail.png = 1안)",
    "- 자막: 영상에 들어가 있음. 검색용으로 subtitles.srt를 '자막 → 업로드'에 올려도 된다(선택).",
    `- 변경된 콘텐츠 표시: ${Object.keys(episode.status.generated ?? {}).length ? "AI 생성 장면 있음 → 사실적인 장면이면 '예'" : "AI 생성 장면 없음 → '아니요'"}`,
    "- 공개: 비공개로 올려 확인 후 공개 또는 예약",
    "",
  ].join("\n");
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
  const media = await loadMedia(episode, referenceDir, root);
  const shots = planShots(timeline, media);
  log(`화면 ${shots.length}컷 (실제 자료 ${shots.filter((shot) => shot.media && shot.media.kind !== "ai").length}컷, AI 이미지 ${shots.filter((shot) => shot.media?.kind === "ai").length}컷, 카드 ${shots.filter((shot) => !shot.media).length}컷)`);

  // 1) 컷마다 카드 또는 투명 레이어(챕터·출처·문구) 그리기, 그리고 고정 로고
  const jobs = [{ file: "logo.png", html: logoHtml(), transparent: true }];
  shots.forEach((shot, index) => {
    const scene = shot.scene;
    const assetId = String(scene.asset).match(/A\d+/i)?.[0];
    shot.frame = `frame_${String(index).padStart(4, "0")}.png`;
    if (shot.media) {
      const lines = shot.mode === "type" || shot.mode === "caption" ? screenLines(scene) : [];
      jobs.push({ file: shot.frame, html: overlayHtml({ chapter: shot.chapter, credit: shot.media.credit, mode: shot.mode, lines }), transparent: true });
    } else {
      jobs.push({ file: shot.frame, html: sceneFrameHtml(scene, { chapter: shot.chapter, asset: assets.get(assetId) }).html });
    }
  });
  await renderFrames(jobs, work);

  // 2) 컷별 영상 조각. 같은 장면 안에서 다음 컷이 있으면 겹칠 시간(XFADE)만큼 길게 만든다.
  const size = preview ? "960:540" : `${FRAME.width}:${FRAME.height}`;
  const encode = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-r", String(FPS), "-an"];
  shots.forEach((shot, index) => {
    shot.overlap = shots[index + 1]?.scene === shot.scene ? XFADE : 0;
  });
  log(`컷 ${shots.length}개 인코딩 중 (동시 ${CONCURRENCY}개)`);
  const clips = await mapLimit(shots, CONCURRENCY, async (shot, index) => {
    const length = Math.max(shot.end - shot.start, 1 / FPS) + shot.overlap;
    const seconds = length.toFixed(3);
    const frames = Math.max(1, Math.round(length * FPS));
    const clip = path.join(work, `clip_${String(index).padStart(4, "0")}.mp4`);
    const frame = path.join(work, shot.frame);
    const still = ["-loop", "1", "-framerate", String(FPS), "-t", seconds];
    if (!shot.media) {
      // 카드는 움직이지 않는다(글자가 흔들리지 않게)
      await ffmpeg([...still, "-i", frame, "-vf", `scale=${size}`, ...encode, clip]);
    } else if (shot.media.kind === "video") {
      await ffmpeg(["-stream_loop", "-1", "-i", shot.media.file, "-i", frame, "-t", seconds, "-filter_complex",
        `[0:v]scale=${FRAME.width}:${FRAME.height}:force_original_aspect_ratio=increase,crop=${FRAME.width}:${FRAME.height},setsar=1,fps=${FPS}[v];[v][1:v]overlay=0:0,scale=${size}`,
        ...encode, clip]);
    } else if (shot.media.kind === "scroll") {
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
        `${base};[b]${pushIn(frames)}[v];[v][1:v]overlay=0:0,scale=${size}`,
        "-t", seconds, ...encode, clip]);
    }
    return clip;
  });

  // 같은 장면의 컷끼리는 부드럽게 겹쳐 넘기고(크로스페이드), 장면이 바뀔 때는 바로 넘긴다.
  const groups = [];
  shots.forEach((shot, index) => {
    if (!index || shots[index - 1].scene !== shot.scene) groups.push([]);
    groups.at(-1).push({ shot, clip: clips[index] });
  });
  const sceneClips = await mapLimit(groups, CONCURRENCY, async (group, index) => {
    if (group.length === 1) return group[0].clip;
    const out = path.join(work, `scene_${String(index).padStart(3, "0")}.mp4`);
    const inputs = group.flatMap((item) => ["-i", item.clip]);
    const normalize = group.map((_, i) => `[${i}:v]settb=AVTB,fps=${FPS},format=yuv420p[n${i}]`).join(";");
    let chain = "";
    let previous = "n0";
    let offset = 0;
    group.slice(0, -1).forEach((item, i) => {
      offset += item.shot.end - item.shot.start;
      const label = i === group.length - 2 ? "out" : `x${i}`;
      chain += `;[${previous}][n${i + 1}]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}[${label}]`;
      previous = label;
    });
    await ffmpeg([...inputs, "-filter_complex", `${normalize}${chain}`, "-map", "[out]", ...encode, out]);
    return out;
  });
  const clipList = path.join(work, "clips.txt");
  await writeFile(clipList, sceneClips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"));
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
    "-i", video, "-i", audioOut, "-loop", "1", "-i", path.join(work, "logo.png"),
    "-filter_complex", `[2:v]scale=${size}[logo];[0:v][logo]overlay=0:0:shortest=1,ass=${assFile.replace(/:/g, "\\:")}:fontsdir=${fontsDir}[v]`,
    "-map", "[v]", "-map", "1:a",
    "-c:v", "libx264", "-preset", preview ? "ultrafast" : "veryfast", "-crf", preview ? "30" : "21", "-pix_fmt", "yuv420p",
    "-c:a", "copy", "-shortest", "-movflags", "+faststart", finalFile,
  ]);

  // 5) 썸네일과 업로드 정보
  const { renderThumbnails } = await import("./thumbnail.js");
  await renderThumbnails(episode, root, outDir);
  const sources = [];
  for (const shot of shots) {
    if (!shot.media?.credit || sources.some((item) => item.source === shot.media.credit && item.url === shot.media.url)) continue;
    sources.push({ source: shot.media.credit, url: shot.media.url });
  }
  await writeFile(path.join(outDir, "upload.md"), buildUploadKit(episode, brief, timeline, sources));
  return { file: finalFile, seconds: timeline.total, scenes: timeline.scenes.length, shots: shots.length, cues: cues.length };
}
