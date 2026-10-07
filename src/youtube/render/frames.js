// Scene마다 1920×1080 화면을 인스타그램 카드와 같은 디자인으로 그린다.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

export const FRAME = { width: 1920, height: 1080 };
const COLORS = { ivory: "#F2F1ED", mint: "#65B98A", green: "#23744c", ink: "#111111" };

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// 화면 문구. "출처: …" 줄은 실제 그림의 출처 표시(오른쪽 위)와 어긋날 수 있어 문구에서 뺀다.
function cleanLines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").replace(/\*\*/g, "").trim())
    .filter((line) => line && !/^(없음|none|-)$/i.test(line) && !/^(출처|source)\s*[:：]/i.test(line) && !/^\[.*\]$/.test(line));
}

export function shortBrand(value) {
  const brand = String(value ?? "").replace(/\(.*?\)/g, "").split(/[·,/]/)[0].trim();
  return brand.length > 14 ? `${brand.slice(0, 13)}…` : brand;
}

async function fontFace() {
  const require = createRequire(import.meta.url);
  const font = await readFile(require.resolve("pretendard/dist/web/variable/woff2/PretendardVariable.woff2"));
  return `@font-face{font-family:P;src:url(data:font/woff2;base64,${font.toString("base64")}) format("woff2");font-weight:100 900}`;
}

function shell(css, body, dark = false) {
  return `<!doctype html><meta charset="utf-8"><style>__FONT__
*{box-sizing:border-box;margin:0}
body{width:${FRAME.width}px;height:${FRAME.height}px;overflow:hidden;font-family:P,sans-serif;word-break:keep-all;
  background:${dark ? COLORS.ink : COLORS.ivory};color:${dark ? COLORS.ivory : COLORS.ink};position:relative}
.pill{position:absolute;left:96px;top:84px;border:4px solid ${COLORS.mint};border-radius:999px;padding:12px 26px 15px;
  color:${dark ? COLORS.mint : COLORS.green};font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1}
.mark{position:absolute;right:96px;top:72px;width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:${dark ? COLORS.ivory : COLORS.ink};color:${dark ? COLORS.ink : "#fff"};font-size:28px;font-weight:900;letter-spacing:-.08em}
.dot{color:${COLORS.mint}}
${css}</style><body>${body}</body>`;
}

function typeFrame(scene, label) {
  const lines = cleanLines(scene.fields.ON_SCREEN_TEXT);
  const text = lines.length ? lines : [String(scene.fields.NARRATION ?? "").split(/(?<=[.?!])\s/)[0]];
  const longest = Math.max(...text.map((line) => line.length));
  const size = longest > 26 ? 64 : longest > 18 ? 80 : longest > 12 ? 100 : 124;
  const html = text.map(escapeHtml).join("<br>");
  return shell(
    `.copy{position:absolute;left:150px;right:150px;top:0;bottom:200px;display:flex;align-items:center}
     h1{font-size:${size}px;line-height:1.18;font-weight:900;letter-spacing:-.05em}`,
    `<div class="pill">${escapeHtml(label)}</div><div class="mark">BR.</div>
     <div class="copy"><h1>${html}<span class="dot">.</span></h1></div>`,
  );
}

const SEPARATORS = ["→", "↓", "×", "+", " vs ", "VS"];

// 여러 줄이 모두 "A → B" 꼴이면 줄마다 비교하는 표로 그린다.
function rowsFrame(rows, label) {
  const body = rows
    .map(
      (parts) =>
        `<div class="r">${parts
          .map((part, index) => `<div class="c${index === parts.length - 1 ? " last" : ""}">${escapeHtml(part)}</div>`)
          .join('<div class="sep">→</div>')}</div>`,
    )
    .join("");
  return shell(
    `.rows{position:absolute;left:220px;right:220px;top:0;bottom:180px;display:flex;flex-direction:column;justify-content:center;gap:36px}
     .r{display:flex;align-items:center}
     .c{flex:1;min-height:140px;padding:24px;border:4px solid ${COLORS.ink};border-radius:24px;background:#fff;display:flex;align-items:center;justify-content:center;
       text-align:center;font-size:48px;font-weight:800;letter-spacing:-.04em}
     .c.last{background:${COLORS.ink};color:#fff}
     .sep{width:110px;text-align:center;font-size:56px;font-weight:900;color:${COLORS.mint}}`,
    `<div class="pill">${escapeHtml(label)}</div><div class="mark">BR.</div><div class="rows">${body}</div>`,
  );
}

function graphicFrame(scene, label) {
  const source = cleanLines(scene.fields.ON_SCREEN_TEXT).join("\n") || cleanLines(scene.fields.VISUAL).join("\n");
  const lines = source.split("\n").filter(Boolean);
  const arrow = /→|->|↓/;
  if (lines.length >= 2 && lines.length <= 4 && lines.every((line) => arrow.test(line))) {
    return rowsFrame(lines.map((line) => line.split(/→|->|↓/).map((part) => part.trim()).filter(Boolean)), label);
  }
  const flat = source.replace(/\n/g, " ");
  let steps = null;
  for (const separator of SEPARATORS) {
    if (flat.includes(separator)) {
      steps = flat.split(separator).map((part) => part.trim()).filter(Boolean);
      if (steps.length >= 2 && steps.length <= 6) {
        steps.separator = separator.trim() === "↓" ? "→" : separator.trim();
        break;
      }
      steps = null;
    }
  }
  if (steps) {
    const width = Math.floor((1560 - (steps.length - 1) * 90) / steps.length);
    const boxes = steps
      .map((step, index) => `<div class="box${index === steps.length - 1 ? " last" : ""}">${escapeHtml(step)}</div>`)
      .join(`<div class="sep">${escapeHtml(steps.separator)}</div>`);
    return shell(
      `.flow{position:absolute;left:180px;right:180px;top:0;bottom:180px;display:flex;align-items:center;justify-content:center;gap:0}
       .box{width:${width}px;min-height:220px;padding:36px 28px;border:4px solid ${COLORS.ink};border-radius:28px;display:flex;align-items:center;justify-content:center;
         text-align:center;font-size:${width < 260 ? 34 : 44}px;font-weight:800;letter-spacing:-.04em;line-height:1.25;background:#fff}
       .box.last{background:${COLORS.ink};color:#fff;border-color:${COLORS.ink}}
       .sep{width:90px;text-align:center;font-size:56px;font-weight:900;color:${COLORS.mint}}`,
      `<div class="pill">${escapeHtml(label)}</div><div class="mark">BR.</div><div class="flow">${boxes}</div>`,
    );
  }
  const big = lines.length <= 2;
  return shell(
    `.list{position:absolute;left:180px;right:180px;top:0;bottom:200px;display:flex;flex-direction:column;justify-content:center;gap:${big ? 44 : 30}px}
     .row{display:flex;gap:28px;align-items:baseline;font-size:${big ? 84 : 52}px;font-weight:${big ? 900 : 800};letter-spacing:-.045em;line-height:1.2}
     .no{color:${COLORS.mint};font-size:40px;font-weight:900;min-width:70px}`,
    `<div class="pill">${escapeHtml(label)}</div><div class="mark">BR.</div>
     <div class="list">${lines.slice(0, 5).map((line, index) => `<div class="row"><span class="no">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(line)}</span></div>`).join("")}</div>`,
  );
}

// 실제 광고 영상을 쓰지 않을 때의 사례 카드. 캠페인 이름·사실·출처를 보여준다.
function caseFrame(scene, asset) {
  const brand = shortBrand(asset?.BRAND) || "사례";
  const title = cleanLines(asset?.["NEEDED MATERIAL"])[0] || cleanLines(scene.fields.VISUAL)[0] || "";
  const lines = cleanLines(scene.fields.ON_SCREEN_TEXT);
  const source = cleanLines(asset?.["EXPECTED SOURCE"])[0];
  return shell(
    `.wrap{position:absolute;left:150px;right:150px;top:200px;bottom:220px;display:flex;flex-direction:column;justify-content:center}
     .kicker{font-size:34px;font-weight:700;color:${COLORS.mint};letter-spacing:-.02em}
     h1{margin-top:22px;font-size:${title.length > 24 ? 70 : 88}px;font-weight:900;letter-spacing:-.05em;line-height:1.14}
     p{margin-top:36px;font-size:46px;font-weight:600;line-height:1.4;color:#d9d8d2;letter-spacing:-.03em}
     .src{position:absolute;left:150px;bottom:150px;font-size:26px;color:#9a9993;font-weight:600}`,
    `<div class="pill">사례 · ${escapeHtml(brand)}</div><div class="mark">BR.</div>
     <div class="wrap"><div class="kicker">CASE</div><h1>${escapeHtml(title)}<span class="dot">.</span></h1>
       ${lines.length ? `<p>${lines.map(escapeHtml).join("<br>")}</p>` : ""}</div>
     ${source ? `<div class="src">출처: ${escapeHtml(source)}</div>` : ""}`,
    true,
  );
}

// 사진·영상 위에 얹는 라벨·문구·출처. 배경은 투명.
export function overlayHtml({ label, lines = [], credit = null }) {
  return `<!doctype html><meta charset="utf-8"><style>__FONT__
*{box-sizing:border-box;margin:0}body{width:${FRAME.width}px;height:${FRAME.height}px;background:transparent;font-family:P,sans-serif;position:relative;word-break:keep-all}
.shade{position:absolute;left:0;top:0;right:0;height:520px;background:linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,0))}
.pill{position:absolute;left:96px;top:84px;border:4px solid ${COLORS.mint};border-radius:999px;padding:12px 26px 15px;background:rgba(17,17,17,.55);color:#fff;font-size:30px;font-weight:800;line-height:1}
.text{position:absolute;left:96px;top:170px;max-width:1300px;color:#fff;font-size:72px;font-weight:900;letter-spacing:-.05em;line-height:1.15;text-shadow:0 4px 24px rgba(0,0,0,.45)}
.credit{position:absolute;right:40px;top:40px;max-width:900px;padding:8px 16px;border-radius:8px;background:rgba(17,17,17,.62);color:#f2f1ed;font-size:24px;font-weight:600}
.dot{color:${COLORS.mint}}</style><body>
${lines.length ? '<div class="shade"></div>' : ""}<div class="pill">${escapeHtml(label)}</div>
${lines.length ? `<div class="text">${lines.map(escapeHtml).join("<br>")}<span class="dot">.</span></div>` : ""}
${credit ? `<div class="credit">출처: ${escapeHtml(credit)}</div>` : ""}</body>`;
}

export function screenLines(scene) {
  return cleanLines(scene.fields.ON_SCREEN_TEXT).slice(0, 3);
}

export function sceneFrameHtml(scene, { label, asset }) {
  if (scene.sourceType === "TYPE") return { html: typeFrame(scene, label) };
  if (scene.sourceType === "GRAPHIC") return { html: graphicFrame(scene, label) };
  if (scene.sourceType === "REAL") return { html: caseFrame(scene, asset) };
  return { html: typeFrame(scene, label) }; // 생성물이 없는 AI Scene
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
