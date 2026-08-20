// 카드뉴스 원고를 사이트와 같은 톤의 PNG 카드로 렌더링합니다.
import fs from 'node:fs';
import path from 'node:path';
import { CARD_SIZE, PALETTE, PATHS, BRUNCH_ID } from './config.js';
import { escapeHtml } from './html.js';

/** 원고에 줄바꿈이 들어 있으면 그대로 살립니다. */
function nl2br(str) {
  return escapeHtml(str).replace(/\r?\n/g, '<br>');
}

const FONT_CSS =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css';

function coverCard(post, copy) {
  return `
  <section class="card card--cover">
    <div class="cover__top">
      <span class="eyebrow">BRUCE HEO · 맥락 설계자</span>
    </div>
    <div class="cover__mid">
      <h1 class="fit" data-max="92" data-min="52">${nl2br(copy.hook)}</h1>
      <p class="cover__sub">${escapeHtml(copy.subhead)}</p>
    </div>
    <div class="cover__bottom">
      <span>${escapeHtml(post.label || '')}</span>
      <span>brunch.co.kr/@${escapeHtml(BRUNCH_ID)}</span>
    </div>
  </section>`;
}

function bodyCard(card, index, total) {
  return `
  <section class="card card--body">
    <div class="body__top">
      <span class="chip">${escapeHtml(card.label)}</span>
      <span class="pager">${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>
    </div>
    <div class="body__mid">
      <h2 class="fit" data-max="66" data-min="40">${nl2br(card.headline)}</h2>
      <p class="body__text fit" data-max="36" data-min="26">${escapeHtml(card.body)}</p>
    </div>
    <div class="body__bottom"><span class="rule"></span><span>@${escapeHtml(BRUNCH_ID)}</span></div>
  </section>`;
}

function outroCard(post, copy) {
  return `
  <section class="card card--outro">
    <div class="outro__top"><span class="eyebrow eyebrow--ink">Bruce Heo · Writing</span></div>
    <div class="outro__mid">
      <h2 class="fit" data-max="62" data-min="40">${nl2br(copy.closing)}</h2>
      <p class="outro__title">「${escapeHtml(post.title)}」</p>
    </div>
    <div class="outro__bottom">
      <span class="cta">브런치에서 전문 읽기</span>
      <span class="outro__url">${escapeHtml(post.url.replace(/^https?:\/\//, ''))}</span>
    </div>
  </section>`;
}

export function buildCardHtml(post, copy) {
  const cards = copy.cards || [];
  const total = cards.length;
  const sections = [
    coverCard(post, copy),
    ...cards.map((c, i) => bodyCard(c, i + 1, total)),
    outroCard(post, copy),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="${FONT_CSS}">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: ${PALETTE.bgSoft};
    font-family: 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: ${CARD_SIZE.width}px;
    height: ${CARD_SIZE.height}px;
    padding: 104px 92px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    word-break: keep-all;
  }
  .eyebrow {
    font-size: 26px; font-weight: 700; letter-spacing: 0.16em;
    color: ${PALETTE.accent}; text-transform: uppercase;
  }
  .eyebrow--ink { color: ${PALETTE.accentStrong}; }

  /* 표지 */
  .card--cover { background: ${PALETTE.ink}; color: #fff; }
  .card--cover h1 { font-weight: 800; line-height: 1.26; letter-spacing: -0.03em; }
  .cover__sub { margin-top: 40px; font-size: 34px; font-weight: 500; color: ${PALETTE.ink3}; line-height: 1.5; }
  .cover__bottom {
    display: flex; justify-content: space-between;
    font-size: 26px; font-weight: 600; color: ${PALETTE.ink3};
    border-top: 2px solid rgba(255,255,255,0.14); padding-top: 32px;
  }

  /* 본문 */
  .card--body { background: ${PALETTE.bg}; color: ${PALETTE.ink}; }
  .body__top { display: flex; align-items: center; justify-content: space-between; }
  .chip {
    display: inline-block; padding: 14px 28px; border-radius: 999px;
    background: ${PALETTE.accentSoft}; color: ${PALETTE.accentStrong};
    font-size: 28px; font-weight: 700;
  }
  .pager { font-size: 28px; font-weight: 700; color: ${PALETTE.ink3}; letter-spacing: 0.06em; }
  .card--body h2 { font-weight: 800; line-height: 1.34; letter-spacing: -0.03em; }
  .body__text { margin-top: 44px; font-weight: 500; color: ${PALETTE.ink2}; line-height: 1.68; }
  .body__bottom {
    display: flex; align-items: center; gap: 28px;
    font-size: 26px; font-weight: 600; color: ${PALETTE.ink3};
  }
  .rule { flex: 1; height: 2px; background: ${PALETTE.border}; }

  /* 마무리 */
  .card--outro { background: ${PALETTE.accentSoft}; color: ${PALETTE.ink}; }
  .card--outro h2 { font-weight: 800; line-height: 1.34; letter-spacing: -0.03em; }
  .outro__title { margin-top: 40px; font-size: 32px; font-weight: 600; color: ${PALETTE.ink2}; line-height: 1.5; }
  .outro__bottom { display: flex; flex-direction: column; gap: 28px; align-items: flex-start; }
  .cta {
    padding: 26px 48px; border-radius: 999px;
    background: ${PALETTE.accent}; color: #fff; font-size: 32px; font-weight: 700;
  }
  .outro__url { font-size: 26px; font-weight: 600; color: ${PALETTE.ink2}; }

  .card--cover .cover__mid, .card--body .body__mid, .card--outro .outro__mid { flex: 1; display: flex; flex-direction: column; justify-content: center; }
</style>
</head>
<body>
${sections}
<script>
  // 글자 수가 많은 카드는 넘치지 않을 때까지 글자 크기를 줄입니다.
  for (const el of document.querySelectorAll('.fit')) {
    const max = Number(el.dataset.max);
    const min = Number(el.dataset.min);
    const box = el.closest('.card').querySelector('.cover__mid, .body__mid, .outro__mid');
    for (let size = max; size >= min; size -= 2) {
      el.style.fontSize = size + 'px';
      if (box.scrollHeight <= box.clientHeight) break;
    }
  }
</script>
</body>
</html>`;
}

/**
 * 카드 HTML 을 PNG 로 저장합니다.
 * @returns {Promise<string[]>} 저장소 기준 상대 경로 목록
 */
export async function renderCards(post, copy) {
  const { chromium } = await import('playwright');
  const outDir = path.join(PATHS.cardnews, post.id);
  fs.mkdirSync(outDir, { recursive: true });

  const html = buildCardHtml(post, copy);
  const htmlPath = path.join(outDir, 'cards.html');
  fs.writeFileSync(htmlPath, html, 'utf-8');

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: CARD_SIZE.width, height: CARD_SIZE.height },
      deviceScaleFactor: 1,
    });
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
    // 웹폰트가 적용된 뒤에 찍어야 자간이 흐트러지지 않습니다.
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(400);

    const cards = page.locator('.card');
    const count = await cards.count();
    const files = [];
    for (let i = 0; i < count; i += 1) {
      const name = `${String(i + 1).padStart(2, '0')}.png`;
      await cards.nth(i).screenshot({ path: path.join(outDir, name) });
      files.push(path.posix.join('cardnews', post.id, name));
    }
    return files;
  } finally {
    await browser.close();
  }
}
