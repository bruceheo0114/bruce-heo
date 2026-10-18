import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { CONFIG } from "../config.js";
import { writeFileAtomic } from "./files.js";
import { escapeHtml } from "./homepage.js";

// 카드 글꼴은 프리텐다드로 고정한다. 미리보기 HTML은 CDN 주소를 쓰고,
// 렌더링할 때는 같은 주소 요청을 npm pretendard 패키지의 파일로 응답해 네트워크와 무관하게 만든다.
export const CARD_FONT_FAMILY = "Pretendard Variable";
export const CARD_FONT_URL =
  "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/woff2/PretendardVariable.woff2";
const CARD_FONT_FILE = createRequire(import.meta.url).resolve(
  "pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
);

export const CARD_STYLE = Object.freeze({
  width: 1080,
  height: 1080,
  format: "jpeg",
  background: "#F2F1ED",
  accent: "#65B98A",
  coverImageStartPercent: 45,
  coverPanelPercent: 58,
  bodyImagePercent: 52,
  bodyPanelPercent: 48,
  logoDiameter: 82,
});

function textClass(value, base) {
  const length = String(value).length;
  if (base === "cover-title" && length <= 18) return `${base} ${base}--lg`;
  if (length > 58) return `${base} ${base}--xs`;
  if (length > 40) return `${base} ${base}--sm`;
  return base;
}

function brandMarks() {
  return `<div class="brand-pill">브루스 인사이트</div><div class="br-mark">BR<i>.</i></div>`;
}

function imageMarkup(card) {
  if (!card.imageUrl) return "";
  return `<div class="card-image"><img src="${escapeHtml(card.imageUrl)}" alt="" referrerpolicy="no-referrer"><div class="image-wash"></div></div>`;
}

function barsMarkup(bars) {
  const max = Math.max(...bars.map((bar) => bar.value));
  const rows = bars
    .map(
      (bar, index) => `<div class="bar-row${index === 0 ? " bar-row--top" : ""}"><span class="bar-label">${escapeHtml(bar.label)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(6, Math.round((bar.value / max) * 100))}%"></span></span><span class="bar-value">${escapeHtml(bar.display ?? String(bar.value))}</span></div>`,
    )
    .join("");
  return `<div class="card-bars">${rows}</div>`;
}

function cardMarkup(card, index) {
  const title = `${escapeHtml(card.title)}<span class="accent-dot">.</span>`;
  const body = escapeHtml(card.body).replaceAll("\n", "<br>");
  const pageAttrs = `data-document-role="page" data-label="${escapeHtml(`${index + 1}. ${card.title}`)}"`;

  if (card.kind === "cover") {
    return `<section class="card card--cover ${card.imageUrl ? "has-image" : "text-only"}" data-card-index="${index}" ${pageAttrs}>
      ${imageMarkup(card)}
      <div class="cover-panel">
        <div class="cover-copy">
          <h1 class="${textClass(card.title, "cover-title")}">${title}</h1>
          <p class="cover-subtitle">${body}</p>
        </div>
        ${brandMarks()}
      </div>
    </section>`;
  }

  // 선택 항목(카드뉴스 수·금 형식): stat = 제목 위 큰 숫자, bars = 막대 비교, source = 맨 아래 출처 한 줄.
  const stat = card.stat ? `<div class="card-stat">${escapeHtml(card.stat)}</div>` : "";
  const bars = card.bars?.length ? barsMarkup(card.bars) : "";
  const source = card.source ? `<p class="card-source">${escapeHtml(card.source)}</p>` : "";
  return `<section class="card card--body ${card.imageUrl ? "has-image" : "text-only"}" data-card-index="${index}" ${pageAttrs}>
    ${imageMarkup(card)}
    <div class="body-panel">
      <div class="body-copy">
        <div class="card-number">${String(index + 1).padStart(2, "0")}</div>
        ${stat}
        <h2 class="${textClass(card.title, "body-title")}">${title}</h2>
        ${body ? `<p class="body-text">${body}</p>` : ""}
        ${bars}
        ${source}
      </div>
      ${brandMarks()}
    </div>
  </section>`;
}

export function buildPreviewHtml(manifest) {
  const cards = manifest.cards.map(cardMarkup).join("\n");
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(manifest.article.title)} — 브루스 인사이트</title>
<style>
@font-face{font-family:"${CARD_FONT_FAMILY}";src:url("${CARD_FONT_URL}") format("woff2-variations");font-weight:45 920;font-style:normal;font-display:block}
*{box-sizing:border-box}html,body{margin:0;background:#d8d8d5;color:#111;font-family:"${CARD_FONT_FAMILY}",sans-serif}.pages{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,540px));gap:28px;padding:28px;justify-content:center}.card{--accent:${CARD_STYLE.accent};position:relative;width:${CARD_STYLE.width}px;height:${CARD_STYLE.height}px;overflow:hidden;background:${CARD_STYLE.background};transform-origin:top left}.card-image{position:absolute;inset:0;overflow:hidden;background:#d9d9d4}.card-image img{width:100%;height:100%;object-fit:cover;display:block}.image-wash{position:absolute;inset:0;background:linear-gradient(110deg,rgba(244,243,238,.1),rgba(0,0,0,.05))}.brand-pill{position:absolute;border:3px solid var(--accent);border-radius:999px;padding:9px 20px 11px;color:#23744c;font-size:21px;font-weight:800;letter-spacing:-.03em;line-height:1}.br-mark{position:absolute;width:${CARD_STYLE.logoDiameter}px;height:${CARD_STYLE.logoDiameter}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#111;color:#fff;font-size:28px;font-weight:900;letter-spacing:-.08em}.accent-dot{color:var(--accent)}.br-mark i{font-style:normal;color:var(--accent)}.cover-panel{position:absolute;inset:0;display:flex;flex-direction:column;padding:72px}.card--cover{background:#111}.card--cover .card-image{inset:0}.card--cover .image-wash{background:linear-gradient(90deg,rgba(0,0,0,.8) 0%,rgba(0,0,0,.5) 55%,rgba(0,0,0,.08) 100%),linear-gradient(0deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 55%)}.cover-copy{margin:auto 0 64px;max-width:900px}.cover-title{margin:0;font-size:104px;line-height:1.06;letter-spacing:-.055em;font-weight:900;color:#fff;word-break:keep-all;text-shadow:0 6px 30px rgba(0,0,0,.4)}.cover-title--lg{font-size:124px}.cover-title--sm{font-size:88px}.cover-title--xs{font-size:74px}.cover-subtitle{margin:30px 0 0;max-width:820px;font-size:31px;line-height:1.5;letter-spacing:-.02em;font-weight:600;color:rgba(255,255,255,.82);word-break:keep-all}.cover-panel .brand-pill{left:72px;top:72px;color:#fff;background:rgba(17,17,17,.4)}.cover-panel .br-mark{right:72px;top:62px;box-shadow:0 0 0 3px rgba(255,255,255,.9)}.card--body .card-image{height:${CARD_STYLE.bodyImagePercent}%}.body-panel{position:absolute;left:0;right:0;bottom:0;height:${CARD_STYLE.bodyPanelPercent}%;padding:52px 68px 58px;background:${CARD_STYLE.background}}.body-copy{max-width:900px}.card-number{margin-bottom:13px;color:#73736e;font-size:20px;font-weight:800;letter-spacing:.12em}.body-title{margin:0;font-size:53px;line-height:1.15;letter-spacing:-.04em;font-weight:900;word-break:keep-all}.body-title--sm{font-size:47px}.body-title--xs{font-size:42px}.body-text{margin:22px 0 0;max-width:900px;font-size:28px;line-height:1.52;letter-spacing:-.02em;font-weight:550;color:#3a3a37;word-break:keep-all}.body-panel .brand-pill{right:68px;bottom:58px}.body-panel .br-mark{left:68px;bottom:58px}.card--body.text-only .body-panel{inset:0;height:100%;padding:88px;display:flex;align-items:center}.card--body.text-only .body-copy{max-width:890px;margin-bottom:90px}.card--body.text-only .body-title{font-size:67px;line-height:1.18}.card--body.text-only .body-title--sm{font-size:60px}.card--body.text-only .body-title--xs{font-size:53px}.card--body.text-only .body-text{font-size:32px;line-height:1.58;margin-top:34px}.card--body.text-only .body-panel .brand-pill{right:88px;bottom:72px}.card--body.text-only .body-panel .br-mark{left:88px;bottom:72px}.card-stat{margin:0 0 18px;font-size:118px;line-height:1;letter-spacing:-.05em;font-weight:900;color:#23744c}.card-source{margin:26px 0 0;font-size:22px;font-weight:600;color:#8a8a84;letter-spacing:-.01em}.card-bars{margin-top:34px;display:grid;gap:18px}.bar-row{display:grid;grid-template-columns:210px 1fr 110px;align-items:center;gap:18px;font-size:28px;font-weight:800;letter-spacing:-.03em}.bar-track{height:34px;border-radius:999px;background:#e2e0d9;overflow:hidden}.bar-fill{display:block;height:100%;border-radius:999px;background:#9fd3b4}.bar-row--top .bar-fill{background:var(--accent)}.bar-value{text-align:right;color:#23744c}@media(max-width:700px){.pages{display:block;padding:12px}.card{transform:scale(calc((100vw - 24px)/1080));margin-bottom:calc((100vw - 24px) - 1080px)}}
</style></head><body><main class="pages">${cards}</main></body></html>`;
}

export async function renderCards(manifest, outputDir, options = {}) {
  const cardsDir = path.join(outputDir, "cards");
  await mkdir(cardsDir, { recursive: true });
  const previewPath = path.join(outputDir, "preview.html");
  await writeFileAtomic(previewPath, buildPreviewHtml(manifest));

  const fontBody = await readFile(CARD_FONT_FILE);
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: CONFIG.cardWidth, height: CONFIG.cardHeight },
      deviceScaleFactor: 1,
    });
    await page.route(CARD_FONT_URL, (route) =>
      route.fulfill({ status: 200, contentType: "font/woff2", body: fontBody }),
    );
    await page.goto(pathToFileURL(previewPath).href, {
      waitUntil: "networkidle",
      timeout: options.timeout ?? 30_000,
    });
    const fontLoaded = await page.evaluate(async (family) => {
      await document.fonts.load(`900 40px "${family}"`, "브루스");
      await document.fonts.ready;
      return [...document.fonts].some(
        (face) => face.family.replace(/"/g, "") === family && face.status === "loaded",
      );
    }, CARD_FONT_FAMILY);
    if (!fontLoaded) {
      throw new Error("프리텐다드 글꼴을 불러오지 못해 카드 렌더링을 중단했습니다.");
    }
    await page.evaluate(() => {
      document.querySelectorAll(".card.has-image").forEach((card) => {
        const image = card.querySelector("img");
        if (!image || !image.complete || image.naturalWidth === 0) {
          card.classList.remove("has-image");
          card.classList.add("text-only");
          card.querySelector(".card-image")?.remove();
        }
      });
    });
    const elements = page.locator(".card");
    if ((await elements.count()) !== manifest.cards.length) {
      throw new Error("렌더러 카드 수가 manifest와 다릅니다.");
    }
    const layoutProblems = await page.evaluate(() =>
      [...document.querySelectorAll(".card")].flatMap((card, index) => {
        const cardBox = card.getBoundingClientRect();
        const copy = card.querySelector(".cover-copy, .body-copy");
        const copyBox = copy?.getBoundingClientRect();
        if (
          card.scrollWidth > 1080 ||
          card.scrollHeight > 1080 ||
          !copyBox ||
          copyBox.left < cardBox.left ||
          copyBox.right > cardBox.right ||
          copyBox.top < cardBox.top ||
          copyBox.bottom > cardBox.bottom - 120
        ) {
          return [`${index + 1}번 카드 텍스트가 안전 영역을 벗어났습니다.`];
        }
        return [];
      }),
    );
    if (layoutProblems.length) throw new Error(layoutProblems.join("\n"));
    for (let index = 0; index < manifest.cards.length; index += 1) {
      await elements.nth(index).screenshot({
        path: path.join(cardsDir, `${String(index + 1).padStart(2, "0")}.jpg`),
        type: "jpeg",
        quality: 92,
      });
    }
  } finally {
    await browser.close();
  }
  return previewPath;
}
