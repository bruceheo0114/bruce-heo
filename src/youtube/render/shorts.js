// 완성된 롱폼(<EP>.mp4 + subtitles.srt)에서 06_shorts.md 기획마다 가장 잘 맞는 구간을 찾아 세로 쇼츠(1080x1920)로 자른다.
// 새 내레이션·생성 이미지를 쓰지 않는다(크레딧 0). 첫 프레임부터 HOOK 문장이 크게 보이게 한다(HOOKS.md 1·5절).
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { readEpisodeFile } from "../episode.js";
import { parseBlocks, splitHeadingBlocks } from "../parse.js";

const run = promisify(execFile);
const W = 1080;
const H = 1920;
const MIN_SECONDS = 25;
const MAX_SECONDS = 58; // 60초 안쪽(쇼츠 피드에서 끝까지 보기 쉬운 길이)
// 롱폼 아래쪽에 입힌 자막(두 줄)이 들어가지 않게 위쪽만 잘라 쓴다. 자막은 쇼츠용으로 크게 다시 입힌다.
const CROP_HEIGHT = 840;
const VIDEO_Y = 620;
const SHORT_FIELDS = ["HOOK", "SCRIPT", "ON SCREEN TEXT", "SOURCE TIMECODE", "EXPECTED LENGTH"];

export function parseShorts(markdown) {
  return splitHeadingBlocks(markdown ?? "", /^SHORT\b/i).map((block) => {
    const fields = parseBlocks(block.body, "HOOK", SHORT_FIELDS)[0] ?? {};
    return { title: block.title, hook: fields.HOOK ?? "", script: fields.SCRIPT ?? "", onScreen: fields["ON SCREEN TEXT"] ?? "" };
  });
}

function srtSeconds(value) {
  const [h, m, rest] = value.trim().split(":");
  const [s, ms] = rest.split(",");
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

export function parseSrt(text) {
  return String(text)
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim().split(/\r?\n/))
    .filter((lines) => lines.length >= 3 && lines[1].includes("-->"))
    .map((lines) => {
      const [start, end] = lines[1].split("-->").map(srtSeconds);
      return { start, end, text: lines.slice(2).join(" ").trim() };
    });
}

function bigrams(text) {
  const chars = String(text).replace(/[^0-9A-Za-z가-힣]/g, "");
  const set = new Set();
  for (let index = 0; index < chars.length - 1; index += 1) set.add(chars.slice(index, index + 2));
  return set;
}

function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

const SENTENCE_END = /[.?!…다요죠까]["'”’)]?$/;

/**
 * 기획 문장과 가장 많이 겹치는 연속 자막 구간(25~58초)을 고른다. taken에 있는 구간과는 겹치지 않는다.
 * 같은 점수면 문장이 끝나는 곳에서 끝나는 구간을 고른다.
 */
export function pickWindow(cues, text, taken = [], { min = MIN_SECONDS, max = MAX_SECONDS } = {}) {
  const target = bigrams(text);
  let best = null;
  for (let first = 0; first < cues.length; first += 1) {
    let joined = "";
    for (let last = first; last < cues.length; last += 1) {
      const start = cues[first].start;
      const end = cues[last].end;
      if (end - start > max) break;
      joined += cues[last].text;
      if (end - start < min) continue;
      if (taken.some((range) => start < range.end && end > range.start)) continue;
      const score = dice(bigrams(joined), target) + (SENTENCE_END.test(cues[last].text) ? 0.02 : 0);
      if (!best || score > best.score) best = { start, end, first, last, score };
    }
  }
  return best;
}

function assTime(seconds) {
  const cs = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

const clean = (text) => String(text).replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();

export function buildShortAss({ hook, onScreen, cues, duration }) {
  const end = assTime(duration);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Brand,Pretendard SemiBold,34,&H00737373,&H00737373,&H00000000,&H00000000,0,0,0,0,100,100,2,0,1,0,0,8,80,80,150,1
Style: Hook,Pretendard ExtraBold,82,&H00111111,&H00111111,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,8,80,80,250,1
Style: Caption,Pretendard SemiBold,60,&H00111111,&H00111111,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,8,90,90,${VIDEO_Y + Math.round((W / 1920) * CROP_HEIGHT) + 70},1
Style: Label,Pretendard SemiBold,40,&H00737373,&H00737373,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,80,80,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = [
    `Dialogue: 0,${assTime(0)},${end},Brand,,0,0,0,,브루스 인사이트`,
    `Dialogue: 0,${assTime(0)},${end},Hook,,0,0,0,,${clean(hook)}`,
    ...cues.map((cue) => `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Caption,,0,0,0,,${clean(cue.text)}`),
    `Dialogue: 0,${assTime(0)},${end},Label,,0,0,0,,${clean(onScreen ? `${onScreen} · 전체 영상은 채널에서` : "전체 영상은 채널에서")}`,
  ];
  return `${header}${lines.join("\n")}\n`;
}

async function ffmpeg(args) {
  try {
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 1 << 26 });
  } catch (error) {
    throw new Error(`ffmpeg 실패: ${error.stderr || error.message}`);
  }
}

function shortTitle(hook) {
  const base = clean(hook).replace(/[<>]/g, "");
  return `${base.length > 85 ? `${base.slice(0, 84)}…` : base} #Shorts`;
}

/** output/<EP>/<EP>.mp4·subtitles.srt → output/<EP>/shorts/<EP>_SHORT01.mp4 …, shorts.md */
export async function renderShorts(episode, { outDir, log = () => {} }) {
  const ep = episode.status.episode;
  const video = path.join(outDir, `${ep}.mp4`);
  const cues = parseSrt(await readFile(path.join(outDir, "subtitles.srt"), "utf8"));
  if (!cues.length) throw new Error("subtitles.srt에 자막이 없습니다. render를 먼저 하세요.");
  const plans = parseShorts(await readEpisodeFile(episode, "06_shorts.md"));
  if (!plans.length) throw new Error("06_shorts.md에 '## SHORT 01' 기획이 없습니다.");
  const fontsDir = path.dirname(createRequire(import.meta.url).resolve("pretendard/dist/public/static/Pretendard-SemiBold.otf"));
  const shortsDir = path.join(outDir, "shorts");
  await mkdir(shortsDir, { recursive: true });

  const taken = [];
  const results = [];
  for (const [index, plan] of plans.entries()) {
    const window = pickWindow(cues, `${plan.hook} ${plan.script} ${plan.onScreen}`, taken);
    if (!window) {
      log(`${plan.title}: 맞는 구간을 찾지 못해 건너뜀`);
      continue;
    }
    taken.push(window);
    const duration = window.end - window.start + 0.4;
    const local = cues.slice(window.first, window.last + 1).map((cue) => ({ ...cue, start: cue.start - window.start, end: cue.end - window.start }));
    const id = `SHORT${String(index + 1).padStart(2, "0")}`;
    const assFile = path.join(shortsDir, `${id}.ass`);
    await writeFile(assFile, buildShortAss({ hook: plan.hook, onScreen: plan.onScreen, cues: local, duration }));
    const file = path.join(shortsDir, `${ep}_${id}.mp4`);
    const videoHeight = Math.round((W / 1920) * CROP_HEIGHT);
    log(`${id} ${window.start.toFixed(1)}~${window.end.toFixed(1)}초 (일치 ${window.score.toFixed(2)}) 만드는 중`);
    await ffmpeg([
      "-ss", window.start.toFixed(3), "-t", duration.toFixed(3), "-i", video,
      "-f", "lavfi", "-t", duration.toFixed(3), "-i", `color=c=0xF4F2EE:s=${W}x${H}:r=30`,
      "-filter_complex",
      `[0:v]crop=iw:ih*${CROP_HEIGHT}/1080:0:0,scale=${W}:${videoHeight},setsar=1[clip];` +
        `[1:v][clip]overlay=0:${VIDEO_Y}:shortest=1,ass=${assFile.replace(/:/g, "\\:")}:fontsdir=${fontsDir}[v];` +
        `[0:a]afade=t=in:st=0:d=0.15,afade=t=out:st=${Math.max(0, duration - 0.6).toFixed(3)}:d=0.6[a]`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "30",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", file,
    ]);
    results.push({ id, file, title: shortTitle(plan.hook), start: window.start, end: window.end, score: window.score, plan });
  }

  const kit = [
    `# ${ep} 쇼츠 업로드 정보`,
    "",
    "롱폼을 올린 다음 날부터 하루 한 편씩 올리면 롱폼으로 들어오는 통로가 여러 날 열린다.",
    "업로드할 때 '관련 동영상'에 이번 롱폼을 연결한다. 변경된 콘텐츠(합성 음성) '예'.",
    "",
    ...results.flatMap((short) => [
      `## ${short.id} (${path.basename(short.file)})`,
      `- 제목: ${short.title}`,
      `- 설명: ${clean(short.plan.onScreen || short.plan.hook)} — 전체 이야기는 채널의 롱폼 영상에서. #브루스인사이트 #마케팅 #브랜딩`,
      `- 롱폼 구간: ${short.start.toFixed(1)}~${short.end.toFixed(1)}초 (기획 일치 ${short.score.toFixed(2)})`,
      "",
    ]),
  ].join("\n");
  await writeFile(path.join(shortsDir, "shorts.md"), `${kit}\n`);
  return results;
}
