import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { CONFIG } from "../config.js";
import { writeFileAtomic } from "./files.js";
import { escapeHtml } from "./homepage.js";

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
  if (length > 58) return `${base} ${base}--xs`;
  if (length > 40) return `${base} ${base}--sm`;
  return base;
}

function brandMarks() {
  return `<div class="brand-pill">브루스 인사이트</div><div class="br-mark">BR.</div>`;
}

function imageMarkup(card) {
  if (!card.imageUrl) return "";
  return `<div class="card-image"><img src="${escapeHtml(card.imageUrl)}" alt="" referrerpolicy="no-referrer"><div class="image-wash"></div></div>`;
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

  return `<section class="card card--body ${card.imageUrl ? "has-image" : "text-only"}" data-card-index="${index}" ${pageAttrs}>
    ${imageMarkup(card)}
    <div class="body-panel">
      <div class="body-copy">
        <div class="card-number">${String(index + 1).padStart(2, "0")}</div>
        <h2 class="${textClass(card.title, "body-title")}">${title}</h2>
        <p class="body-text">${body}</p>
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
*{box-sizing:border-box}html,body{margin:0;background:#d8d8d5;color:#111;font-family:"Noto Sans KR","Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif}.pages{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,540px));gap:28px;padding:28px;justify-content:center}.card{--accent:${CARD_STYLE.accent};position:relative;width:${CARD_STYLE.width}px;height:${CARD_STYLE.height}px;overflow:hidden;background:${CARD_STYLE.background};transform-origin:top left}.card-image{position:absolute;inset:0;overflow:hidden;background:#d9d9d4}.card-image img{width:100%;height:100%;object-fit:cover;display:block}.image-wash{position:absolute;inset:0;background:linear-gradient(110deg,rgba(244,243,238,.1),rgba(0,0,0,.05))}.brand-pill{position:absolute;border:3px solid var(--accent);border-radius:999px;padding:9px 20px 11px;color:#23744c;font-size:21px;font-weight:800;letter-spacing:-.03em;line-height:1}.br-mark{position:absolute;width:${CARD_STYLE.logoDiameter}px;height:${CARD_STYLE.logoDiameter}px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#111;color:#fff;font-size:28px;font-weight:900;letter-spacing:-.08em}.accent-dot{color:var(--accent)}.cover-panel{position:absolute;inset:0;display:flex;flex-direction:column;padding:72px}.card--cover.has-image .cover-panel{width:${CARD_STYLE.coverPanelPercent}%;background:linear-gradient(90deg,rgba(246,245,240,.99) 0%,rgba(246,245,240,.97) 72%,rgba(246,245,240,0) 100%);padding-right:108px}.card--cover.has-image .card-image{left:${CARD_STYLE.coverImageStartPercent}%}.cover-copy{margin:auto 0 170px;max-width:770px}.cover-title{margin:0;font-size:76px;line-height:1.13;letter-spacing:-.065em;font-weight:900;word-break:keep-all}.cover-title--sm{font-size:66px}.cover-title--xs{font-size:58px}.cover-subtitle{margin:30px 0 0;max-width:760px;font-size:30px;line-height:1.5;letter-spacing:-.035em;font-weight:600;color:#353535;word-break:keep-all}.cover-panel .brand-pill{left:72px;top:72px}.cover-panel .br-mark{left:72px;bottom:72px}.card--body .card-image{height:${CARD_STYLE.bodyImagePercent}%}.body-panel{position:absolute;left:0;right:0;bottom:0;height:${CARD_STYLE.bodyPanelPercent}%;padding:52px 68px 58px;background:${CARD_STYLE.background}}.body-copy{max-width:900px}.card-number{margin-bottom:13px;color:#73736e;font-size:20px;font-weight:800;letter-spacing:.12em}.body-title{margin:0;font-size:53px;line-height:1.15;letter-spacing:-.06em;font-weight:900;word-break:keep-all}.body-title--sm{font-size:47px}.body-title--xs{font-size:42px}.body-text{margin:22px 0 0;max-width:900px;font-size:28px;line-height:1.52;letter-spacing:-.035em;font-weight:550;color:#30302e;word-break:keep-all}.body-panel .brand-pill{right:68px;bottom:58px}.body-panel .br-mark{left:68px;bottom:58px}.card--body.text-only .body-panel{inset:0;height:100%;padding:88px;display:flex;align-items:center}.card--body.text-only .body-copy{max-width:890px;margin-bottom:90px}.card--body.text-only .body-title{font-size:67px;line-height:1.18}.card--body.text-only .body-title--sm{font-size:60px}.card--body.text-only .body-title--xs{font-size:53px}.card--body.text-only .body-text{font-size:32px;line-height:1.58;margin-top:34px}.card--body.text-only .body-panel .brand-pill{right:88px;bottom:72px}.card--body.text-only .body-panel .br-mark{left:88px;bottom:72px}@media(max-width:700px){.pages{display:block;padding:12px}.card{transform:scale(calc((100vw - 24px)/1080));margin-bottom:calc((100vw - 24px) - 1080px)}}
</style></head><body><main class="pages">${cards}</main></body></html>`;
}

export async function renderCards(manifest, outputDir, options = {}) {
  const cardsDir = path.join(outputDir, "cards");
  await mkdir(cardsDir, { recursive: true });
  const previewPath = path.join(outputDir, "preview.html");
  await writeFileAtomic(previewPath, buildPreviewHtml(manifest));

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: CONFIG.cardWidth, height: CONFIG.cardHeight },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(previewPath).href, {
      waitUntil: "networkidle",
      timeout: options.timeout ?? 30_000,
    });
    await page.evaluate(() => document.fonts.ready);
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
