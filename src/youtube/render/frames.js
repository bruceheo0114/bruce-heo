// Scene마다 1920×1080 화면을 그린다. 화면 배치는 모든 컷에서 같다:
//   왼쪽 위 = 지금 이야기하는 챕터, 오른쪽 위 = 채널 로고(최종 합성에서 고정), 오른쪽 아래 = 출처, 아래 가운데 = 자막
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { normalize } from "./align.js";
import { motionCard, SEEK_SCRIPT } from "./motion.js";

export const FRAME = { width: 1920, height: 1080 };
export const COLORS = { ivory: "#F2F1ED", mint: "#65B98A", green: "#23744c", ink: "#111111" };

export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// 화면 문구. "출처: …" 줄은 실제 그림의 출처 표시(오른쪽 아래)와 어긋날 수 있어 뺀다.
export function cleanLines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").replace(/\*\*/g, "").replace(/\s*\[[^\]]*\]/g, "").trim())
    .filter((line) => line && !/^(없음|none|-)$/i.test(line) && !/^(출처|source)\s*[:：]/i.test(line) && !/^\[.*\]$/.test(line));
}

/**
 * 카드 항목(흐름 칸·목록 줄·연표 점)이 나타날 시각(초, 컷 시작 기준).
 * speech = { chars, times, seconds }: 이 컷 동안 말한 글자와 그 시각(받아쓰기). 없으면 null → 예전처럼 0.12초 간격으로 한꺼번에.
 * 항목 글의 낱말 앞 2~3글자가 처음 말해지는 순간에 맞추고, 못 찾은 항목은 앞뒤 항목 사이(끝이면 말이 끝나기 전까지)에 고르게 둔다.
 * Bruce 2026-10-19: 항목이 한꺼번에 튀어나와 내레이션보다 빠르거나 밀리는 느낌.
 */
export function revealTimes(texts, speech) {
  if (!speech?.chars || texts.length < 2) return null;
  const last = Math.max(0.6, Math.min(speech.seconds - 0.8, (speech.times.at(-1) ?? speech.seconds) - 0.2));
  let cursor = 0;
  const found = texts.map((text) => {
    for (const word of String(text).split(/\s+/)) {
      const clean = normalize(word);
      if (clean.length < 2) continue;
      for (const length of [3, 2]) {
        if (clean.length < length) continue;
        const index = speech.chars.indexOf(clean.slice(0, length), cursor);
        if (index !== -1) {
          cursor = index + 1;
          return Math.max(0.2, speech.times[index] - 0.2);
        }
      }
    }
    return null;
  });
  // 순서가 거꾸로 잡힌 시각은 버리고(못 찾은 것으로). 첫 항목은 화면이 비지 않게 늘 바로(0.3초 안에)
  let previous = -Infinity;
  const times = found.map((time) => (time !== null && time > previous ? (previous = time) : null));
  times[0] = Math.min(times[0] ?? 0.3, 0.3);
  for (let index = 1; index < times.length; index += 1) {
    if (times[index] !== null) continue;
    let next = index;
    while (next < times.length && times[next] === null) next += 1;
    const left = times[index - 1];
    const right = next < times.length ? times[next] : Math.max(last, left);
    const parts = next < times.length ? next - index + 1 : next - index;
    for (let k = index; k < next; k += 1) times[k] = left + ((right - left) * (k - index + 1)) / parts;
    index = next - 1;
  }
  // 너무 붙지 않게(0.35초), 그리고 컷 안에서 다 보이게
  for (let index = 1; index < times.length; index += 1) times[index] = Math.max(times[index], times[index - 1] + 0.35);
  return times.map((time) => Number(Math.min(time, Math.max(0.3, speech.seconds - 0.7)).toFixed(2)));
}

// 항목 index의 등장 스타일. times가 있으면 그 시각(--d), 없으면 순서(--i)
const revealStyle = (times, index, order = index) => (times ? `--i:0;--d:${times[index].toFixed(2)}s` : `--i:${order}`);

export function shortBrand(value) {
  const brand = String(value ?? "").replace(/\(.*?\)/g, "").split(/[·,/]/)[0].trim();
  return brand.length > 14 ? `${brand.slice(0, 13)}…` : brand;
}

// 내레이션이 '챕터 전환' 같은 제작 메모뿐인 무음 장면
export function isTransition(scene) {
  return /^(챕터\s*전환|전환|무음|-)?$/.test(String(scene.fields?.NARRATION ?? "").trim());
}

export function screenLines(scene) {
  return cleanLines(scene.fields.ON_SCREEN_TEXT).slice(0, 3);
}

async function fontFace() {
  const require = createRequire(import.meta.url);
  const font = await readFile(require.resolve("pretendard/dist/web/variable/woff2/PretendardVariable.woff2"));
  return `@font-face{font-family:P;src:url(data:font/woff2;base64,${font.toString("base64")}) format("woff2");font-weight:100 900}`;
}

// 모든 화면이 함께 쓰는 고정 요소(챕터·출처)
export function chrome({ chapter, credit, onPhoto }) {
  const chapterHtml = chapter
    ? `<div class="chapter ${onPhoto ? "on-photo" : ""}"><span class="ch-no">${escapeHtml(chapter.no)}</span><span class="title">${escapeHtml(chapter.title)}</span></div>`
    : "";
  const creditHtml = credit ? `<div class="credit ${onPhoto ? "on-photo" : ""}">출처 · ${escapeHtml(credit)}</div>` : "";
  return chapterHtml + creditHtml;
}

const BASE_CSS = `*{box-sizing:border-box;margin:0}
body{width:${FRAME.width}px;height:${FRAME.height}px;overflow:hidden;font-family:P,sans-serif;word-break:keep-all;position:relative}
.chapter{position:absolute;left:56px;top:48px;display:flex;align-items:center;gap:14px;padding:12px 22px 13px 18px;border-radius:12px;
  background:rgba(17,17,17,.06);color:${COLORS.ink};font-size:28px;line-height:1;letter-spacing:-.03em}
.chapter .ch-no{font-weight:900;color:${COLORS.green}}
.chapter .title{font-weight:700}
.chapter span{font-size:28px;line-height:1}
.chapter.on-photo{background:rgba(17,17,17,.55);color:#fff}
.chapter.on-photo .ch-no{color:${COLORS.mint}}
/* 출처는 상자 없이 오른쪽 끝에 맞춘 글자만. 상자가 있으면 출처 길이마다 상자 왼쪽 끝이 왔다 갔다 해 보인다 */
.credit{position:absolute;right:52px;bottom:30px;max-width:980px;text-align:right;
  color:#77776f;font-size:21px;font-weight:600;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* 사진 위 출처는 폭이 고정된 반투명 띠: 흰 화면(웹페이지 캡처)에서도 읽히고, 출처 길이가 달라도 띠 크기는 그대로 */
.credit.on-photo{width:640px;padding:7px 16px;border-radius:8px;background:rgba(17,17,17,.5);color:#f2f1ed}
.dot{color:${COLORS.mint}}
/* 등장 움직임. --i = 순서(0.12초 간격), --d = 추가 지연. 정지 화면은 __seek(999)로 끝 상태를 찍는다 */
@keyframes rise{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
@keyframes popin{0%{opacity:0;transform:scale(.4)}70%{opacity:1;transform:scale(1.08)}100%{opacity:1;transform:scale(1)}}
.rv{animation:rise .55s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0)*.12s + var(--d,0s))}
span.rv{display:inline-block}
.pop{animation:popin .45s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0s)}`;

export function page(css, body, { dark = false, transparent = false } = {}) {
  const background = transparent ? "transparent" : dark ? COLORS.ink : COLORS.ivory;
  const color = dark || transparent ? COLORS.ivory : COLORS.ink;
  return `<!doctype html><meta charset="utf-8"><style>__FONT__
${BASE_CSS}
body{background:${background};color:${color}}
${css}</style><body>${body}</body>`;
}

function fitSize(lines, steps) {
  const longest = Math.max(...lines.map((line) => line.length));
  return steps.find(([limit]) => longest <= limit)?.[1] ?? steps.at(-1)[1];
}

// 한 줄이 길면 글씨를 줄이지 않고 두 줄로 나눈다(같은 묶음의 카드끼리 글씨 크기가 들쭉날쭉하지 않게).
// '·'로 이은 목록은 '·' 자리에서, 아니면 가운데에 가까운 띄어쓰기에서 나눈다.
export function balanceLines(lines, max = 18) {
  if (lines.length >= 3) return lines;
  return lines.flatMap((line) => {
    if (line.length <= max) return [line];
    const items = line.split(" · ");
    if (items.length > 1) {
      let best = 1;
      for (let i = 1; i < items.length; i += 1) {
        const left = items.slice(0, i).join(" · ").length;
        const bestLeft = items.slice(0, best).join(" · ").length;
        if (Math.abs(left - line.length / 2) < Math.abs(bestLeft - line.length / 2)) best = i;
      }
      return [items.slice(0, best).join(" · "), items.slice(best).join(" · ")];
    }
    const spaces = [...line.matchAll(/ /g)].map((match) => match.index);
    if (!spaces.length) return [line];
    const cut = spaces.reduce((a, b) => (Math.abs(b - line.length / 2) < Math.abs(a - line.length / 2) ? b : a));
    return [line.slice(0, cut), line.slice(cut + 1)];
  });
}

function typeCard(scene, chapter, speech) {
  const lines = balanceLines(screenLines(scene));
  const text = lines.length ? lines : [String(scene.fields.NARRATION ?? "").split(/(?<=[.?!])\s/)[0]];
  // ①②③처럼 번호를 붙인 질문 카드는 한 묶음이라 같은 크기로 맞춘다.
  const numbered = /^[\u2460-\u2473]/.test(text[0] ?? "");
  const size = Math.min(fitSize(text, [[12, 124], [18, 100], [26, 80], [999, 64]]), numbered ? 100 : 124);
  const times = revealTimes(text, speech);
  return page(
    `.copy{position:absolute;left:150px;right:150px;top:140px;bottom:200px;display:flex;align-items:center}
     h1{font-size:${size}px;line-height:1.18;font-weight:900;letter-spacing:-.05em}`,
    `${chrome({ chapter })}<div class="copy"><h1>${text.map((line, index) => `<span class="rv" style="${revealStyle(times, index)}">${escapeHtml(line)}${index === text.length - 1 ? '<span class="dot">.</span>' : ""}</span>`).join("<br>")}</h1></div>`,
  );
}

// 챕터 간지: 어두운 바탕에 큰 챕터 번호와 제목
function chapterCard(chapter) {
  const number = chapter.no.replace(/\D/g, "").padStart(2, "0");
  return page(
    `.big{position:absolute;right:120px;top:50%;transform:translateY(-54%);font-size:460px;font-weight:900;letter-spacing:-.06em;line-height:1;
       color:transparent;-webkit-text-stroke:3px rgba(242,241,237,.16)}
     .copy{position:absolute;left:150px;right:520px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center}
     .label{font-size:30px;font-weight:800;color:${COLORS.mint};letter-spacing:.18em;margin-bottom:30px}
     .rule{width:96px;height:6px;background:${COLORS.mint};border-radius:3px;margin-bottom:36px}
     h1{font-size:${chapter.title.length > 14 ? 80 : 100}px;line-height:1.16;font-weight:900;letter-spacing:-.05em}`,
    `<div class="big">${number}</div><div class="copy"><div class="label">CHAPTER ${number}</div><div class="rule"></div><h1>${escapeHtml(chapter.title)}<span class="dot">.</span></h1></div>`,
    { dark: true },
  );
}

function rowsCard(rows, chapter, speech) {
  const times = revealTimes(rows.map((parts) => parts.join(" ")), speech);
  const body = rows
    .map((parts, row) => `<div class="r rv" style="${revealStyle(times, row)}">${parts.map((part, index) => `<div class="c${index === parts.length - 1 ? " last" : ""}">${escapeHtml(part)}</div>`).join('<div class="sep">→</div>')}</div>`)
    .join("");
  return page(
    `.rows{position:absolute;left:220px;right:220px;top:140px;bottom:200px;display:flex;flex-direction:column;justify-content:center;gap:36px}
     .r{display:flex;align-items:center}
     .c{flex:1;min-height:140px;padding:24px;border:4px solid ${COLORS.ink};border-radius:24px;background:#fff;display:flex;align-items:center;justify-content:center;
       text-align:center;font-size:48px;font-weight:800;letter-spacing:-.04em}
     .c.last{background:${COLORS.ink};color:#fff}
     .sep{width:110px;text-align:center;font-size:56px;font-weight:900;color:${COLORS.mint}}`,
    `${chrome({ chapter })}<div class="rows">${body}</div>`,
  );
}

function graphicCard(scene, chapter, speech) {
  const source = cleanLines(scene.fields.ON_SCREEN_TEXT).join("\n") || cleanLines(scene.fields.VISUAL).join("\n");
  const lines = source.split("\n").filter(Boolean);
  if (lines.length >= 2 && lines.length <= 4 && lines.every((line) => /→|->|↓/.test(line))) {
    return rowsCard(lines.map((line) => line.split(/→|->|↓/).map((part) => part.trim()).filter(Boolean)), chapter, speech);
  }
  const flat = source.replace(/\n/g, " ");
  for (const separator of ["→", "↓", "×", "+", " vs ", "VS"]) {
    const steps = flat.split(separator).map((part) => part.trim()).filter(Boolean);
    if (!flat.includes(separator) || steps.length < 2 || steps.length > 6) continue;
    const width = Math.floor((1480 - (steps.length - 1) * 90) / steps.length);
    const sep = separator.trim() === "↓" ? "→" : separator.trim();
    const times = revealTimes(steps, speech);
    // 화살표는 다음 칸과 함께(조금 먼저) 나타난다
    const sepStyle = (index) => (times ? `--i:0;--d:${Math.max(0, times[index] - 0.15).toFixed(2)}s` : `--i:${index * 2 - 1}`);
    const boxes = steps
      .map((step, index) => `${index ? `<div class="sep rv" style="${sepStyle(index)}">${escapeHtml(sep)}</div>` : ""}<div class="box rv${index === steps.length - 1 ? " last" : ""}" style="${revealStyle(times, index, index * 2)}">${escapeHtml(step)}</div>`)
      .join("");
    return page(
      `.flow{position:absolute;left:200px;right:200px;top:140px;bottom:200px;display:flex;align-items:center;justify-content:center}
       .box{width:${width}px;min-height:220px;padding:36px 28px;border:4px solid ${COLORS.ink};border-radius:28px;display:flex;align-items:center;justify-content:center;
         text-align:center;font-size:${width < 260 ? 34 : 44}px;font-weight:800;letter-spacing:-.04em;line-height:1.25;background:#fff}
       .box.last{background:${COLORS.ink};color:#fff}
       .sep{width:90px;text-align:center;font-size:56px;font-weight:900;color:${COLORS.mint}}`,
      `${chrome({ chapter })}<div class="flow">${boxes}</div>`,
    );
  }
  // 한 줄짜리는 목록이 아니라 큰 문구로
  if (lines.length === 1) return typeCard({ ...scene, fields: { ...scene.fields, ON_SCREEN_TEXT: lines[0].replace(/^\d{1,2}[.)]?\s+/, "") } }, chapter, speech);
  const shown = lines.slice(0, 5);
  const times = revealTimes(shown, speech);
  const big = shown.length <= 2;
  return page(
    `.list{position:absolute;left:180px;right:180px;top:140px;bottom:200px;display:flex;flex-direction:column;justify-content:center;gap:${big ? 44 : 30}px}
     .row{display:flex;gap:28px;align-items:baseline;font-size:${big ? 84 : 52}px;font-weight:${big ? 900 : 800};letter-spacing:-.045em;line-height:1.2}
     .list .no{color:${COLORS.mint};font-size:${big ? 56 : 40}px;font-weight:900;min-width:70px}`,
    `${chrome({ chapter })}<div class="list">${shown.map((line, index) => `<div class="row rv" style="${revealStyle(times, index)}"><span class="no">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(line)}</span></div>`).join("")}</div>`,
  );
}

// 실제 자료가 없는 REAL 장면: 캠페인 이름·사실을 보여주는 사례 카드
function caseCard(scene, asset, chapter) {
  const brand = shortBrand(asset?.BRAND) || "사례";
  const title = cleanLines(asset?.["NEEDED MATERIAL"])[0] || cleanLines(scene.fields.VISUAL)[0] || "";
  const lines = screenLines(scene);
  const source = cleanLines(asset?.["EXPECTED SOURCE"])[0];
  return page(
    `.wrap{position:absolute;left:150px;right:150px;top:150px;bottom:210px;display:flex;flex-direction:column;justify-content:center}
     .kicker{font-size:34px;font-weight:800;color:${COLORS.mint};letter-spacing:-.02em}
     h1{margin-top:22px;font-size:${title.length > 24 ? 70 : 88}px;font-weight:900;letter-spacing:-.05em;line-height:1.14}
     p{margin-top:36px;font-size:46px;font-weight:600;line-height:1.4;color:#d9d8d2;letter-spacing:-.03em}`,
    `${chrome({ chapter, credit: source, onPhoto: true })}
     <div class="wrap"><div class="kicker rv">사례 · ${escapeHtml(brand)}</div><h1 class="rv" style="--i:1">${escapeHtml(title)}<span class="dot">.</span></h1>
       ${lines.length ? `<p class="rv" style="--i:2">${lines.map(escapeHtml).join("<br>")}</p>` : ""}</div>`,
    { dark: true },
  );
}

/**
 * 사진·영상 위에 얹는 투명 레이어.
 * mode "type": 사진을 어둡게 깔고 가운데 큰 문구 (TYPE 장면 배경)
 * mode "caption": 왼쪽 아래 작은 설명 한 줄 (REAL·AI 장면 첫 컷)
 * mode "none": 챕터·출처만
 */
export function overlayHtml({ chapter, credit, mode = "none", lines = [] }) {
  let body = "";
  let css = "";
  if (mode === "type" && lines.length) {
    const size = fitSize(lines, [[12, 120], [18, 96], [26, 76], [999, 62]]);
    css = `.scrim{position:absolute;inset:0;background:rgba(10,10,10,.52)}
      .copy{position:absolute;left:150px;right:150px;top:140px;bottom:200px;display:flex;align-items:center}
      h1{font-size:${size}px;line-height:1.18;font-weight:900;letter-spacing:-.05em;color:#fff;text-shadow:0 4px 30px rgba(0,0,0,.35)}`;
    body = `<div class="scrim"></div><div class="copy"><h1>${lines.map(escapeHtml).join("<br>")}<span class="dot">.</span></h1></div>`;
  } else if (mode === "caption" && lines.length) {
    css = `.cap{position:absolute;left:56px;bottom:210px;max-width:1100px;padding:16px 24px 18px;border-left:6px solid ${COLORS.mint};
      background:rgba(17,17,17,.62);color:#fff;font-size:40px;font-weight:800;letter-spacing:-.04em;line-height:1.25}`;
    body = `<div class="cap">${lines.slice(0, 2).map(escapeHtml).join("<br>")}</div>`;
  }
  return page(css, `${body}${chrome({ chapter, credit, onPhoto: true })}`, { transparent: true });
}

// 오른쪽 위 고정 채널 로고 (최종 합성 때 전체 영상 위에 한 번 얹는다)
export function logoHtml() {
  return `<!doctype html><meta charset="utf-8"><style>__FONT__
*{margin:0}body{width:${FRAME.width}px;height:${FRAME.height}px;background:transparent;font-family:P,sans-serif;position:relative}
.mark{position:absolute;right:48px;top:40px;width:72px;height:72px;border-radius:50%;background:${COLORS.ink};box-shadow:0 0 0 3px rgba(255,255,255,.85);
  display:flex;align-items:center;justify-content:center;color:#fff;font-size:27px;font-weight:900;letter-spacing:-.08em}
.mark span{color:${COLORS.mint}}</style><body><div class="mark">BR<span>.</span></div></body>`;
}

// 카드 HTML 속 등장 움직임(.rv/.pop의 --i·--d)이 모두 끝나는 시각(초)
export function revealSeconds(html) {
  let end = 0;
  for (const match of html.matchAll(/class="[^"]*\b(rv|pop)\b[^"]*"(?:\s+style="([^"]*)")?/g)) {
    const i = Number(/--i:\s*([\d.]+)/.exec(match[2] ?? "")?.[1] ?? 0);
    const d = Number(/--d:\s*([\d.]+)s/.exec(match[2] ?? "")?.[1] ?? 0);
    end = Math.max(end, (match[1] === "rv" ? i * 0.12 + 0.55 : 0.45) + d);
  }
  return end ? end + 0.1 : 0;
}

/**
 * 카드 한 장. { html, seconds(움직임 길이, 0이면 정지), sfx: [{ name, at }], credit }
 * MOTION 장면은 motion.js 카드(그릴 수 없으면 보통 카드로).
 */
export function sceneFrameHtml(scene, { chapter, asset, trend, speech } = {}) {
  if (isTransition(scene) && chapter) return { html: chapterCard(chapter), seconds: 0, sfx: [] };
  const moving = scene.motion ? motionCard(scene, { chapter, trend, speech }) : null;
  if (moving) return { sfx: [], ...moving };
  let html;
  if (scene.sourceType === "GRAPHIC") html = graphicCard(scene, chapter, speech);
  else if (scene.sourceType === "REAL") html = caseCard(scene, asset, chapter);
  else html = typeCard(scene, chapter, speech); // TYPE, 또는 그림이 없는 AI 장면
  // 도식(흐름·목록)은 하나씩 나타날 때 작은 '톡' 소리
  const first = Number(/class="(?:box|r|row)[^"]*rv[^"]*" style="--i:0;--d:([\d.]+)s/.exec(html)?.[1] ?? 0);
  const sfx = scene.sourceType === "GRAPHIC" && /class="(box|r|row) rv/.test(html) ? [{ name: "pop", at: first + 0.05 }] : [];
  return { html, seconds: revealSeconds(html), sfx };
}

// 움직이는 카드의 프레임 파일 이름: frame_0003.png → frame_0003_m0001.jpg …
export function motionFramePattern(file) {
  return file.replace(/\.png$/, "_m%04d.jpg");
}

/**
 * jobs: [{ file, html, transparent?, viewport?, motion?: 초, fps? }]
 * motion이 있으면 0초부터 그 시각까지 fps(기본 30)로 찍어 motionFramePattern(file)로 남기고, file에는 마지막 모습을 찍는다.
 */
export async function renderFrames(jobs, outDir) {
  const { chromium } = await import("playwright");
  const face = await fontFace();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
  try {
    const page = await browser.newPage({ viewport: FRAME });
    for (const job of jobs) {
      await page.setViewportSize(job.viewport ?? FRAME);
      await page.setContent(job.html.replace("__FONT__", face), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ content: SEEK_SCRIPT });
      if (job.motion > 0) {
        const fps = job.fps ?? 30;
        const count = Math.ceil(job.motion * fps);
        const pattern = motionFramePattern(job.file);
        for (let index = 0; index < count; index += 1) {
          await page.evaluate((t) => window.__seek(t), index / fps);
          await page.screenshot({ path: path.join(outDir, pattern.replace("%04d", String(index + 1).padStart(4, "0"))), type: "jpeg", quality: 92 });
        }
      }
      await page.evaluate(() => window.__seek(999));
      await page.screenshot({ path: path.join(outDir, job.file), omitBackground: Boolean(job.transparent) });
    }
  } finally {
    await browser.close();
  }
}
