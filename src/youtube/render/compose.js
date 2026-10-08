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
import { FRAME, isTransition, logoHtml, overlayHtml, renderFrames, sceneFrameHtml, screenLines } from "./frames.js";
import { alignedCues, alignScenes, insertChapterCards } from "./align.js";
import { buildTimeline, chapterNarrationTexts, displayText, formatClock, parseScriptChapters, readingPairs, subtitleCues } from "./timeline.js";

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

async function measureLoudness(args) {
  try {
    const { stderr } = await run("ffmpeg", ["-hide_banner", "-nostats", ...args, "-f", "null", "-"], { maxBuffer: 1 << 26 });
    const json = stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1);
    const values = JSON.parse(json);
    return [values.input_i, values.input_tp, values.input_lra, values.input_thresh].every((value) => Number.isFinite(Number(value))) ? values : null;
  } catch {
    return null;
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

const SFX_VOLUME = 0.7; // 효과음 크기(내레이션 대비)
const CHAPTER_GAP = 2.6; // 챕터 사이 무음(초). 이 자리에 챕터 간지와 효과음이 들어간다
// 채널 BGM(bruce-youtube/channel/bgm/bgm.mp3). 영상 내내 반복해서 깔고, 내레이션이 나오면 자동으로 줄였다가
// 말이 멈추는 곳(챕터 간지·마지막 여운)에서 다시 올라온다(사이드체인 덕킹).
const BGM_LUFS = -27; // 말이 없을 때 BGM 크기(내레이션 -14 LUFS 대비 약 13dB 아래)
const BGM_DUCK_RATIO = 2.5; // 말할 때 추가로 줄이는 정도(약 10dB)
const BGM_XFADE = 4; // 곡을 이어 붙일 때 겹치는 길이(초)
const OUTRO_TAIL = 4; // BGM이 있으면 마지막 말 뒤에 마지막 화면을 이만큼 더 두고 음악으로 마무리한다

async function readWords(audioFile) {
  const file = audioFile.replace(/\.[^./]+$/, ".words.json");
  if (!(await exists(file))) return null;
  const data = JSON.parse(await readFile(file, "utf8"));
  const words = Array.isArray(data) ? data : data.words;
  return Array.isArray(words) && words.length ? words : null;
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
  const byName = new Map();
  const pool = [];
  const add = (key, media) => byKey.set(key, [...(byKey.get(key) ?? []), media]);
  for (const item of credits.items ?? []) {
    const file = path.join(referenceDir, item.file);
    if (isExcluded(item.file) || !(await exists(file))) continue;
    const media = { file, kind: item.kind, credit: item.source, url: item.url };
    byName.set(path.parse(item.file).name.toUpperCase(), media);
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
  // references.json의 scene_images: { "S001": ["G000", "A006-img2"], ... } 내레이션에 맞춰 장면마다 고른 그림
  let sceneImages = null;
  if (references.scene_images && typeof references.scene_images === "object") {
    sceneImages = new Map();
    for (const [scene, names] of Object.entries(references.scene_images)) {
      if (scene.startsWith("_")) continue;
      const picked = (Array.isArray(names) ? names : []).map((name) => byName.get(String(name).replace(/\.[a-z]+$/i, "").toUpperCase())).filter(Boolean);
      sceneImages.set(scene.toUpperCase(), picked);
    }
  }
  return { byKey, pool, sceneImages };
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
export function planShots(timeline, { byKey, pool, sceneImages }) {
  if (sceneImages) return planMappedShots(timeline, sceneImages);
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
      // 설명 줄은 장면 첫 컷에만 두면 그림이 바뀔 때 나타났다 사라져 산만하다. 장면 내내 같은 자리에 둔다.
      const mode = isType ? "type" : !startWithCard ? "caption" : "none";
      push(scene, shot.start, shot.end, fills[index], mode);
    });
  }
  return shots;
}

function chapterLabelAt(timeline, time) {
  let current = null;
  (timeline.chapters ?? []).forEach((chapter, index) => {
    if (chapter.start <= time + 0.01) current = { no: `CH${String(index + 1).padStart(2, "0")}`, title: chapter.title };
  });
  return current;
}

/**
 * scene_images가 있으면 그 배치를 그대로 따른다(내레이션과 그림을 맞추기 위해 다른 장면 그림으로 채우지 않는다).
 * - 목록이 빈 장면: 카드 하나
 * - GRAPHIC: 도식 카드(최대 6초) → 남은 시간은 목록 그림
 * - TYPE: 목록 그림 위에 큰 문구
 * - REAL·AI: 목록 그림을 차례로(첫 컷에 설명 한 줄). 장면이 길면 같은 그림을 다시 쓰지 않고 컷을 길게 둔다.
 */
export function planMappedShots(timeline, sceneImages) {
  const shots = [];
  const push = (scene, start, end, media, mode) => shots.push({ start, end, scene, media, mode, chapter: chapterLabelAt(timeline, start) });
  for (const scene of timeline.scenes) {
    const images = sceneImages.get(scene.id.toUpperCase()) ?? [];
    const span = scene.end - scene.start;
    let at = scene.start;
    if (!images.length || scene.sourceType === "GRAPHIC") {
      const cardEnd = !images.length || span <= GRAPHIC_SECONDS + 1.5 ? scene.end : scene.start + GRAPHIC_SECONDS;
      push(scene, scene.start, cardEnd, null, null);
      at = cardEnd;
      if (at >= scene.end - 0.01) continue;
    }
    // 그림이 컷 수보다 적으면 같은 그림을 가까이 당겨(클로즈업) 한 컷 더 쓴다. 장면 안에서만, 그림당 최대 2컷.
    const wanted = Math.max(1, Math.round((scene.end - at) / SHOT_SECONDS));
    // 기사·홈페이지 캡처(screen·scroll)는 당기면 글자만 잘려 보이므로 클로즈업하지 않는다.
    const closable = images.filter((media) => media.kind === "image" || media.kind === "ai");
    const count = Math.min(wanted, images.length + closable.length);
    const order = images.slice(0, count).map((media) => ({ media, close: false }));
    for (const media of closable) {
      if (order.length >= count) break;
      order.splice(order.findIndex((item) => item.media === media) + 1, 0, { media, close: true });
    }
    const startedWithCard = at > scene.start;
    splitShots(at, scene.end, count).forEach((shot, index) => {
      const mode = scene.sourceType === "TYPE" ? "type" : !startedWithCard ? "caption" : "none";
      push(scene, shot.start, shot.end, order[index].media, mode);
      if (order[index].close) shots.at(-1).close = true;
    });
  }
  return shots;
}

// 정지 그림은 모두 같은 방식으로 아주 천천히 밀고 들어간다(1.00 → 1.05). 방향을 바꾸지 않아 산만하지 않다.
// close: 같은 그림의 두 번째 컷. 1.25배로 가까이(가운데보다 조금 위) 당겨 다른 컷처럼 보이게 한다.
// zoompan은 위치를 정수 픽셀로 반올림해 확대 중에 화면이 덜덜 떨린다(프레임당 최대 2px 튐).
// perspective는 소수점 좌표로 보간해서 매끄럽다(측정: 떨림 0.76px → 0.06px).
export function pushIn(frames, close = false) {
  const zoom = close ? `(1.25+0.05*in/${frames})` : `(1+0.05*in/${frames})`;
  const cy = close ? "H*0.42" : "H/2";
  const left = `W/2-W/2/${zoom}`;
  const right = `W/2+W/2/${zoom}`;
  const top = `${cy}-H/2/${zoom}`;
  const bottom = `${cy}+H/2/${zoom}`;
  return `perspective=x0='${left}':y0='${top}':x1='${right}':y1='${top}':x2='${left}':y2='${bottom}':x3='${right}':y3='${bottom}':interpolation=cubic:sense=source:eval=frame`;
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

// 영상 설명의 '자료 출처'. 같은 출처는 한 줄로 모으고, AI 이미지는 주소 없이 한 줄로 적는다.
export function uploadSources(shots) {
  const sources = [];
  for (const shot of shots) {
    const media = shot.media;
    if (!media?.credit) continue;
    const isAi = media.kind === "ai" || /AI 생성/.test(media.credit);
    const url = isAi ? null : media.url ?? null;
    if (sources.some((item) => item.source === media.credit && (isAi || item.url === url))) continue;
    if (url && sources.some((item) => item.url === url)) continue; // 같은 페이지는 한 번만
    sources.push({ source: media.credit, url, ai: isAi });
  }
  return [...sources.filter((item) => !item.ai), ...sources.filter((item) => item.ai)];
}

function alteredNote({ aiImages, syntheticVoice }) {
  if (syntheticVoice) return `'예' (내레이션이 본인 복제 목소리${aiImages ? ", AI 생성 이미지 포함" : ""})`;
  if (aiImages) return "AI 생성 이미지 있음 → 실제처럼 보이는 장면이 있으면 '예'";
  return "AI 생성 장면 없음 → '아니요'";
}

export function buildUploadKit(episode, brief, timeline, sources = [], { aiImages, syntheticVoice = false } = {}) {
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
    `- 변경된 콘텐츠 표시: ${alteredNote({ aiImages: aiImages ?? Object.keys(episode.status.generated ?? {}).length > 0, syntheticVoice })}`,
    "- 공개: 비공개로 올려 확인 후 공개 또는 예약",
    "",
  ].join("\n");
}

/**
 * 영상 만들기. audioFiles: 녹음 파일 경로(챕터 순서). outDir에 <EP>.mp4, subtitles.srt, thumbnail.png, upload.md를 만든다.
 */
export async function renderEpisode(episode, audioFiles, { root, outDir, preview = false, cleanup = true, syntheticVoice = false, log = () => {} }) {
  const storyboardText = await readEpisodeFile(episode, "03_storyboard.md");
  const script = await readEpisodeFile(episode, "02_script.md");
  const brief = (await readEpisodeFile(episode, "01_brief.md")) ?? "";
  const assetsText = (await readEpisodeFile(episode, "04_assets.md")) ?? "";
  if (!storyboardText || !script) throw new Error("02_script.md 또는 03_storyboard.md가 없습니다.");

  const storyboard = analyzeStoryboard(storyboardText);
  const chapters = parseScriptChapters(script);
  // 챕터 사이에 숨 쉴 틈(CHAPTER_GAP초)을 둔다. 챕터 전환 카드가 이 자리에 나온다.
  const bgm = path.join(root, "channel", "bgm", "bgm.mp3"); // root = bruce-youtube
  const hasBgm = await exists(bgm);
  const audio = [];
  for (const [index, file] of audioFiles.entries()) {
    const last = index === audioFiles.length - 1;
    const gap = !last ? (audioFiles.length > 1 ? CHAPTER_GAP : 0) : hasBgm ? OUTRO_TAIL : 0;
    audio.push({ file, seconds: (await probeSeconds(file)) + gap, gap, words: await readWords(file) });
  }
  const timeline = buildTimeline(storyboard.scenes, chapters, audio);
  // 받아쓰기(<녹음 파일 이름>.words.json)가 챕터마다 있으면 장면 전환과 자막을 실제 말소리에 맞춘다.
  const groupWords = timeline.mode === "chapter" && timeline.groups.length === audio.length ? audio.map((item) => item.words) : [];
  const aligned = groupWords.length && groupWords.every(Boolean) ? alignScenes(timeline, groupWords) : 0;
  const cardStarts = insertChapterCards(timeline, CHAPTER_GAP);
  log(`타임라인 ${formatClock(timeline.total)} · Scene ${timeline.scenes.length}개 · ${timeline.mode === "chapter" ? "챕터별 맞춤" : "전체 비율 맞춤"}${aligned ? ` · 받아쓰기로 ${aligned}개 장면 시작을 맞춤` : ""}`);

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
      // 챕터 전환 장면은 앞 챕터 끝에 있어도 다음 챕터 제목을 보여 준다
      const chapter = isTransition(scene) ? chapterLabelAt(timeline, scene.end) : shot.chapter;
      jobs.push({ file: shot.frame, html: sceneFrameHtml(scene, { chapter, asset: assets.get(assetId) }).html });
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
      // 카드는 움직이지 않는다(글자가 흔들리지 않게). 챕터 간지는 어둠에서 떠올랐다 사라진다.
      const fade = shot.scene.chapterCard ? `,fade=t=in:st=0:d=0.35,fade=t=out:st=${Math.max(0, length - 0.35).toFixed(3)}:d=0.35` : "";
      await ffmpeg([...still, "-i", frame, "-vf", `scale=${size}${fade}`, ...encode, clip]);
    } else if (shot.media.kind === "video") {
      await ffmpeg(["-stream_loop", "-1", "-i", shot.media.file, "-i", frame, "-t", seconds, "-filter_complex",
        `[0:v]scale=${FRAME.width}:${FRAME.height}:force_original_aspect_ratio=increase,crop=${FRAME.width}:${FRAME.height},setsar=1,fps=${FPS}[v];[v][1:v]overlay=0:0,scale=${size}`,
        ...encode, clip]);
    } else if (shot.media.kind === "scroll") {
      // 2배 크기에서 내려가며 자르고 줄여서 한 칸씩 끊기지 않게(0.5px 단위로) 움직인다
      const W2 = FRAME.width * 2;
      const H2 = FRAME.height * 2;
      await ffmpeg([...still, "-i", shot.media.file, "-loop", "1", "-i", frame, "-filter_complex",
        `[0:v]scale=${W2}:-2:flags=lanczos,crop=${W2}:${H2}:0:'(ih-${H2})*t/${seconds}',scale=${FRAME.width}:${FRAME.height}:flags=lanczos[v];[v][1:v]overlay=0:0,scale=${size}`,
        "-t", seconds, ...encode, clip]);
    } else {
      const { width, height } = await imageSize(shot.media.file);
      // 16:9에 가까운 그림만 화면을 꽉 채운다. 세로로 길거나 배너처럼 아주 가로로 긴 그림은 잘리지 않게 전체를 보이고 뒤는 흐리게.
      const wide = width / height >= 1.3 && width / height <= 2.1;
      const { width: W, height: H } = FRAME;
      const base = wide
        ? `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}[b]`
        : `[0:v]split[a][f];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=34:2,eq=brightness=-0.18[bg];` +
          `[f]scale=${Math.round(W * 0.955)}:${Math.round(H * 0.887)}:force_original_aspect_ratio=decrease:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[b]`;
      // 바탕 그림은 한 번만 만들고(loop) 프레임마다 소수점 좌표로 확대한다
      await ffmpeg(["-i", shot.media.file, "-loop", "1", "-framerate", String(FPS), "-i", frame, "-filter_complex",
        `${base};[b]format=yuv444p,loop=loop=${frames - 1}:size=1:start=0,setpts=N/${FPS}/TB,${pushIn(frames, shot.close)}[v];[v][1:v]overlay=0:0:shortest=1,scale=${size}`,
        "-frames:v", String(frames), ...encode, clip]);
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
  const pads = audio.map((item, index) => `[${index}:a]aformat=sample_rates=48000:channel_layouts=stereo,apad=pad_dur=${item.gap}[p${index}]`).join(";");
  const join = `${pads};${audio.map((_, index) => `[p${index}]`).join("")}`;
  // 음량은 두 번에 나눠 맞춘다(먼저 재고, 같은 비율로 키운다). 한 번에 하면 말이 없는 구간의 잡음까지 말소리만큼 커진다.
  const chain = `${join}concat=n=${audio.length}:v=0:a=1,${cleanup ? "highpass=f=80,afftdn=nf=-25:tn=1," : ""}`;
  const target = "I=-14:TP=-1.5:LRA=11";
  const measured = await measureLoudness([...inputs, "-filter_complex", `${chain}loudnorm=${target}:print_format=json`]);
  const linear = measured
    ? `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`
    : "";
  const voiceOut = cardStarts.length ? path.join(work, "voice.m4a") : audioOut;
  await ffmpeg([...inputs, "-filter_complex", `${chain}loudnorm=${target}${linear}[a]`, "-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", voiceOut]);
  // 챕터 간지마다 짧은 효과음(bruce-youtube/channel/sfx/chapter.mp3)을 작게 깐다.
  const sfx = path.join(root, "channel", "sfx", "chapter.mp3"); // root = bruce-youtube
  if (cardStarts.length) {
    if (await exists(sfx)) {
      const delays = cardStarts.map((start, index) => `[1:a]adelay=${Math.round(start * 1000)}:all=1,volume=${SFX_VOLUME}[s${index}]`);
      const split = `[1:a]asplit=${cardStarts.length}${cardStarts.map((_, index) => `[c${index}]`).join("")}`;
      const placed = delays.map((line, index) => line.replace("[1:a]", `[c${index}]`));
      const mix = `[0:a]${cardStarts.map((_, index) => `[s${index}]`).join("")}amix=inputs=${cardStarts.length + 1}:normalize=0:duration=first,alimiter=limit=0.84:level=false[a]`;
      await ffmpeg(["-i", voiceOut, "-i", sfx, "-filter_complex", [split, ...placed, mix].join(";"), "-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", audioOut]);
    } else {
      log(`! 효과음 파일이 없어 간지에 소리를 넣지 않았습니다: ${sfx}`);
      await ffmpeg(["-i", voiceOut, "-c", "copy", audioOut]);
    }
  }

  // 3-1) 채널 BGM: 반복해서 영상 길이에 맞추고, 내레이션을 사이드체인으로 받아 말할 때만 줄인다.
  //      처음 1.5초는 서서히 올라오고, 마지막 OUTRO_TAIL초 여운에서 올라왔다가 사라진다.
  let finalAudio = audioOut;
  if (hasBgm) {
    const total = timeline.total.toFixed(3);
    // 마지막 여운은 1.5초 동안 음악이 올라온 채로 머물다가 남은 시간에 사라진다
    const fadeLength = Math.max(1, OUTRO_TAIL - 1.5);
    const fadeOut = Math.max(0, timeline.total - fadeLength).toFixed(3);
    finalAudio = path.join(work, "mix.m4a");
    // 곡(약 2분)을 영상 길이만큼 이어 붙인다. 이음매는 4초씩 겹쳐(크로스페이드) 끊기는 소리가 나지 않게.
    const looped = path.join(work, "bgm_long.m4a");
    const bgmSeconds = await probeSeconds(bgm);
    const copies = Math.max(1, Math.ceil(timeline.total / Math.max(1, bgmSeconds - BGM_XFADE)) + 1);
    const loopInputs = Array.from({ length: copies }, () => ["-i", bgm]).flat();
    let loopChain = copies === 1 ? "[0:a]anull[l]" : "";
    for (let index = 1; index < copies; index += 1) {
      loopChain += `${index > 1 ? ";" : ""}[${index === 1 ? "0:a" : `x${index - 1}`}][${index}:a]acrossfade=d=${BGM_XFADE}:c1=tri:c2=tri[${index === copies - 1 ? "l" : `x${index}`}]`;
    }
    await ffmpeg([...loopInputs, "-filter_complex", loopChain, "-map", "[l]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", looped]);
    // 곡 음량은 한 번 재서 고정 배율로 맞춘다(loudnorm을 걸면 끝 3초가 잘려 여운이 사라진다)
    const bgmLoudness = await measureLoudness(["-i", bgm, "-af", "loudnorm=print_format=json"]);
    const bgmGain = (BGM_LUFS - Number(bgmLoudness?.input_i ?? -16)).toFixed(1);
    const graph = [
      `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${total},asetpts=N/SR/TB,volume=${bgmGain}dB,` +
        `afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOut}:d=${fadeLength}[m]`,
      // 덕킹 기준은 효과음을 뺀 내레이션만(간지 효과음 때문에 음악이 줄지 않게)
      "[2:a]aformat=sample_rates=48000:channel_layouts=stereo[sc]",
      `[m][sc]sidechaincompress=threshold=0.03:ratio=${BGM_DUCK_RATIO}:attack=60:release=700:makeup=1[md]`,
      "[0:a][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.84:level=false[a]",
    ].join(";");
    await ffmpeg(["-i", audioOut, "-i", looped, "-i", voiceOut, "-filter_complex", graph, "-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", finalAudio]);
  }

  // 4) 자막을 입혀 최종본
  const chapterTexts = chapterNarrationTexts(script).map((item) => item.text);
  const pairs = readingPairs(script);
  const cues = (aligned && chapterTexts.length === audio.length ? alignedCues(timeline, chapterTexts, groupWords) : subtitleCues(timeline))
    .map((cue) => ({ ...cue, text: displayText(cue.text, pairs) }));
  const assFile = path.join(work, "subtitles.ass");
  await writeFile(assFile, buildAss(cues));
  await writeFile(path.join(outDir, "subtitles.srt"), buildSrt(cues));
  const fontsDir = path.dirname(createRequire(import.meta.url).resolve("pretendard/dist/public/static/Pretendard-SemiBold.otf"));
  const finalFile = path.join(outDir, `${episode.status.episode}${preview ? "_preview" : ""}.mp4`);
  log("최종 인코딩 중");
  await ffmpeg([
    "-i", video, "-i", finalAudio, "-loop", "1", "-i", path.join(work, "logo.png"),
    "-filter_complex", `[2:v]scale=${size}[logo];[0:v][logo]overlay=0:0:shortest=1,ass=${assFile.replace(/:/g, "\\:")}:fontsdir=${fontsDir}[v]`,
    "-map", "[v]", "-map", "1:a",
    "-c:v", "libx264", "-preset", preview ? "ultrafast" : "veryfast", "-crf", preview ? "30" : "21", "-pix_fmt", "yuv420p",
    "-c:a", "copy", "-shortest", "-movflags", "+faststart", finalFile,
  ]);

  // 5) 썸네일과 업로드 정보
  const { renderThumbnails } = await import("./thumbnail.js");
  await renderThumbnails(episode, root, outDir);
  const sources = uploadSources(shots);
  const aiImages = shots.some((shot) => shot.media?.kind === "ai") || Object.keys(episode.status.generated ?? {}).length > 0;
  await writeFile(path.join(outDir, "upload.md"), buildUploadKit(episode, brief, timeline, sources, { aiImages, syntheticVoice }));
  return { file: finalFile, seconds: timeline.total, scenes: timeline.scenes.length, shots: shots.length, cues: cues.length };
}
