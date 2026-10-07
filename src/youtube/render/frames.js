// Scene마다 1920×1080 화면을 그린다. 화면 배치는 모든 컷에서 같다:
//   왼쪽 위 = 지금 이야기하는 챕터, 오른쪽 위 = 채널 로고(최종 합성에서 고정), 오른쪽 아래 = 출처, 아래 가운데 = 자막
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

export const FRAME = { width: 1920, height: 1080 };
const COLORS = { ivory: "#F2F1ED", mint: "#65B98A", green: "#23744c", ink: "#111111" };

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// 화면 문구. "출처: …" 줄은 실제 그림의 출처 표시(오른쪽 아래)와 어긋날 수 있어 뺀다.
function cleanLines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").replace(/\*\*/g, "").replace(/\s*\[[^\]]*\]/g, "").trim())
    .filter((line) => line && !/^(없음|none|-)$/i.test(line) && !/^(출처|source)\s*[:：]/i.test(line) && !/^\[.*\]$/.test(line));
}

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
function chrome({ chapter, credit, onPhoto }) {
  const chapterHtml = chapter
    ? `<div class="chapter ${onPhoto ? "on-photo" : ""}"><span class="no">${escapeHtml(chapter.no)}</span><span class="title">${escapeHtml(chapter.title)}</span></div>`
    : "";
  const creditHtml = credit ? `<div class="credit ${onPhoto ? "on-photo" : ""}">출처 · ${escapeHtml(credit)}</div>` : "";
  return chapterHtml + creditHtml;
}

const BASE_CSS = `*{box-sizing:border-box;margin:0}
body{width:${FRAME.width}px;height:${FRAME.height}px;overflow:hidden;font-family:P,sans-serif;word-break:keep-all;position:relative}
.chapter{position:absolute;left:56px;top:48px;display:flex;align-items:center;gap:14px;padding:12px 22px 13px 18px;border-radius:12px;
  background:rgba(17,17,17,.06);color:${COLORS.ink};font-size:28px;line-height:1;letter-spacing:-.03em}
.chapter .no{font-weight:900;color:${COLORS.green}}
.chapter .title{font-weight:700}
.chapter.on-photo{background:rgba(17,17,17,.55);color:#fff}
.chapter.on-photo .no{color:${COLORS.mint}}
.credit{position:absolute;right:48px;bottom:26px;max-width:980px;padding:7px 14px;border-radius:8px;background:rgba(17,17,17,.08);
  color:#55554f;font-size:22px;font-weight:600;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.credit.on-photo{background:rgba(17,17,17,.6);color:#f2f1ed}
.dot{color:${COLORS.mint}}`;

function page(css, body, { dark = false, transparent = false } = {}) {
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

function typeCard(scene, chapter) {
  const lines = screenLines(scene);
  const text = lines.length ? lines : [String(scene.fields.NARRATION ?? "").split(/(?<=[.?!])\s/)[0]];
  const size = fitSize(text, [[12, 124], [18, 100], [26, 80], [999, 64]]);
  return page(
    `.copy{position:absolute;left:150px;right:150px;top:140px;bottom:200px;display:flex;align-items:center}
     h1{font-size:${size}px;line-height:1.18;font-weight:900;letter-spacing:-.05em}`,
    `${chrome({ chapter })}<div class="copy"><h1>${text.map(escapeHtml).join("<br>")}<span class="dot">.</span></h1></div>`,
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

function rowsCard(rows, chapter) {
  const body = rows
    .map((parts) => `<div class="r">${parts.map((part, index) => `<div class="c${index === parts.length - 1 ? " last" : ""}">${escapeHtml(part)}</div>`).join('<div class="sep">→</div>')}</div>`)
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

function graphicCard(scene, chapter) {
  const source = cleanLines(scene.fields.ON_SCREEN_TEXT).join("\n") || cleanLines(scene.fields.VISUAL).join("\n");
  const lines = source.split("\n").filter(Boolean);
  if (lines.length >= 2 && lines.length <= 4 && lines.every((line) => /→|->|↓/.test(line))) {
    return rowsCard(lines.map((line) => line.split(/→|->|↓/).map((part) => part.trim()).filter(Boolean)), chapter);
  }
  const flat = source.replace(/\n/g, " ");
  for (const separator of ["→", "↓", "×", "+", " vs ", "VS"]) {
    const steps = flat.split(separator).map((part) => part.trim()).filter(Boolean);
    if (!flat.includes(separator) || steps.length < 2 || steps.length > 6) continue;
    const width = Math.floor((1480 - (steps.length - 1) * 90) / steps.length);
    const sep = separator.trim() === "↓" ? "→" : separator.trim();
    const boxes = steps
      .map((step, index) => `<div class="box${index === steps.length - 1 ? " last" : ""}">${escapeHtml(step)}</div>`)
      .join(`<div class="sep">${escapeHtml(sep)}</div>`);
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
  if (lines.length === 1) return typeCard({ ...scene, fields: { ...scene.fields, ON_SCREEN_TEXT: lines[0].replace(/^\d+[.)]?\s*/, "") } }, chapter);
  const shown = lines.slice(0, 5);
  const big = shown.length <= 2;
  return page(
    `.list{position:absolute;left:180px;right:180px;top:140px;bottom:200px;display:flex;flex-direction:column;justify-content:center;gap:${big ? 44 : 30}px}
     .row{display:flex;gap:28px;align-items:baseline;font-size:${big ? 84 : 52}px;font-weight:${big ? 900 : 800};letter-spacing:-.045em;line-height:1.2}
     .no{color:${COLORS.mint};font-size:${big ? 56 : 40}px;font-weight:900;min-width:70px}`,
    `${chrome({ chapter })}<div class="list">${shown.map((line, index) => `<div class="row"><span class="no">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(line)}</span></div>`).join("")}</div>`,
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
     <div class="wrap"><div class="kicker">사례 · ${escapeHtml(brand)}</div><h1>${escapeHtml(title)}<span class="dot">.</span></h1>
       ${lines.length ? `<p>${lines.map(escapeHtml).join("<br>")}</p>` : ""}</div>`,
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

export function sceneFrameHtml(scene, { chapter, asset }) {
  if (isTransition(scene) && chapter) return { html: chapterCard(chapter) };
  if (scene.sourceType === "GRAPHIC") return { html: graphicCard(scene, chapter) };
  if (scene.sourceType === "REAL") return { html: caseCard(scene, asset, chapter) };
  return { html: typeCard(scene, chapter) }; // TYPE, 또는 그림이 없는 AI 장면
}

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
      await page.screenshot({ path: path.join(outDir, job.file), omitBackground: Boolean(job.transparent) });
    }
  } finally {
    await browser.close();
  }
}
