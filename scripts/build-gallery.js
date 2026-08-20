// cardnews/index.html — 만들어진 카드뉴스를 한눈에 보고 내려받는 페이지.
import fs from 'node:fs';
import path from 'node:path';
import { PATHS, BRUNCH_ID } from './lib/config.js';
import { escapeHtml } from './lib/html.js';

function readAllMeta() {
  if (!fs.existsSync(PATHS.cardnews)) return [];
  return fs
    .readdirSync(PATHS.cardnews, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(PATHS.cardnews, d.name, 'meta.json'))
    .filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf-8')))
    .sort((a, b) => Number(b.id) - Number(a.id));
}

function renderItem(meta) {
  const thumbs = meta.files
    .map(
      (file, i) =>
        `          <a class="shot" href="${escapeHtml(path.posix.relative('cardnews', file))}" target="_blank" rel="noopener">` +
        `<img src="${escapeHtml(path.posix.relative('cardnews', file))}" alt="${escapeHtml(meta.title)} ${i + 1}번 카드" loading="lazy"></a>`
    )
    .join('\n');
  return `      <article class="item">
        <header class="item__head">
          <div>
            <p class="item__date">${escapeHtml(meta.label || '')} · ${escapeHtml(meta.files.length + '장')}</p>
            <h2 class="item__title">${escapeHtml(meta.title)}</h2>
          </div>
          <a class="item__link" href="${escapeHtml(meta.url)}" target="_blank" rel="noopener">원문 →</a>
        </header>
        <div class="shots">
${thumbs}
        </div>
      </article>`;
}

export function buildGallery() {
  const items = readAllMeta();
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>카드뉴스 아카이브 · 브루스 허</title>
<meta name="description" content="브런치 글에서 자동으로 만들어진 카드뉴스 모음.">
<link rel="stylesheet" as="style" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif;
    background: #F9FAFB; color: #191F28; font-size: 17px; line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; text-decoration: none; }
  .wrap { max-width: 1160px; margin: 0 auto; padding: 0 24px; }
  .head { padding: 96px 0 56px; }
  .eyebrow { font-size: 13px; font-weight: 700; letter-spacing: 0.14em; color: #3182F6; text-transform: uppercase; }
  h1 { margin-top: 16px; font-size: 44px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.25; }
  .head p { margin-top: 20px; color: #4E5968; max-width: 560px; }
  .head a { color: #3182F6; font-weight: 600; }
  .list { display: flex; flex-direction: column; gap: 28px; padding-bottom: 96px; }
  .item { background: #fff; border: 1px solid #F2F4F6; border-radius: 20px; padding: 32px; box-shadow: 0 4px 24px rgba(20,30,45,0.04); }
  .item__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
  .item__date { font-size: 14px; font-weight: 600; color: #8B95A1; }
  .item__title { margin-top: 8px; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
  .item__link { flex: none; font-size: 15px; font-weight: 600; color: #3182F6; }
  .shots { display: flex; gap: 16px; margin-top: 24px; overflow-x: auto; padding-bottom: 8px; }
  .shot { flex: none; width: 200px; border-radius: 12px; overflow: hidden; border: 1px solid #E5E8EB; background: #fff; }
  .shot img { display: block; width: 100%; height: auto; }
  .empty { padding: 48px; text-align: center; color: #8B95A1; background: #fff; border-radius: 20px; border: 1px solid #F2F4F6; }
  @media (max-width: 640px) { .head { padding: 64px 0 40px; } h1 { font-size: 32px; } .item { padding: 24px; } .shot { width: 150px; } }
</style>
</head>
<body>
<div class="wrap">
  <header class="head">
    <span class="eyebrow">Cardnews Archive</span>
    <h1>브런치 글에서<br>자동으로 만든 카드뉴스</h1>
    <p>새 글이 올라오면 본문을 읽어 카드 원고를 쓰고 이미지까지 만들어 둡니다. 카드를 눌러 원본 크기(1080×1350)로 내려받으세요. <a href="../index.html">← 아카이브로 돌아가기</a></p>
  </header>
  <main class="list">
${items.length ? items.map(renderItem).join('\n') : '      <p class="empty">아직 만들어진 카드뉴스가 없습니다. 새 글이 올라오면 이 자리에 쌓입니다.</p>'}
  </main>
  <footer class="head" style="padding-top:0">
    <p><a href="https://brunch.co.kr/@${escapeHtml(BRUNCH_ID)}" target="_blank" rel="noopener">brunch.co.kr/@${escapeHtml(BRUNCH_ID)}</a></p>
  </footer>
</div>
</body>
</html>
`;
  fs.mkdirSync(PATHS.cardnews, { recursive: true });
  fs.writeFileSync(PATHS.cardnewsIndex, html, 'utf-8');
  console.log(`cardnews/index.html: ${items.length}개 글 반영`);
  return items.length;
}

if (import.meta.url === `file://${process.argv[1]}`) buildGallery();
