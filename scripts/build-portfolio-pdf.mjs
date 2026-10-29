// 포트폴리오 PDF: portfolio-heoboram.html 디자인 그대로, 책 출간·기고·최근 칼럼·강연을 더해 PDF로 뽑는다.
// node scripts/build-portfolio-pdf.mjs  →  portfolio-heoboram.pdf
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (p, enc = 'utf8') => readFile(new URL(p, root), enc);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let html = await read('portfolio-heoboram.html');
const home = await read('index.html');
const meta = JSON.parse(await read('data/writing-meta.json'));
const cover = `data:image/jpeg;base64,${(await read('assets/book/cover.jpg', null)).toString('base64')}`;

// 홈페이지 책 배너와 같은 링크를 쓴다.
const store = (name) => home.match(new RegExp(`data-book-store="${name}" href="([^"]+)"`))[1];
const yes24 = store('yes24');
const kyobo = store('kyobo');

// 홈페이지 '최신 글' 목록(브런치 자동 동기화 구간)에서 최근 5편.
const postsBlock = home.split('<!-- BRUNCH_POSTS_START -->')[1].split('<!--')[0];
const posts = [...postsBlock.matchAll(/href="([^"]+)">\s*<div class="post__date">([^<]+)<\/div>\s*<div class="post__title">([^<]+)<\/div>/g)]
  .slice(0, 5)
  .map(([, href, date, title]) => ({ url: new URL(href, 'https://bruceheo.com').href, date, title }));

const collabs = meta.collabs.map((c) => `
      <a class="now-collab" href="${esc(c.url)}">
        <span class="now-label">${esc(c.series)} · ${esc(c.episode)} · ${esc(c.date)}</span>
        <strong>${esc(c.title)}</strong>
        <p>${esc(c.desc)}</p>
        <span class="now-url">${esc(c.url.replace(/^https?:\/\//, ''))}</span>
      </a>`).join('');

const postItems = posts.map((p) => `
        <li><a href="${esc(p.url)}"><span class="now-date">${esc(p.date)}</span><span>${esc(p.title)}</span></a></li>`).join('');

const section = `
<!-- ============================================================
     NOW · 출간·기고 (PDF 전용)
     ============================================================ -->
<section class="section section--soft now" id="now">
<div class="wrap">
<div class="section-head">
<span class="section-eyebrow">Now · 최근 소식</span>
<h2 class="section-title">현장의 판단을<br/>책과 글로 정리하고 있습니다.</h2>
<p class="section-desc">11년 동안 캠페인에서 내린 선택의 기준을 <strong>첫 책으로 묶었고,</strong> 오픈애즈 오리지널 기고와 브런치 칼럼으로 마케터들과 계속 나누고 있습니다.</p>
</div>
<div class="now-book">
  <img class="now-book__cover" src="${cover}" alt="책 표지: AI는 답을 만들고 마케터는 맥락을 설계한다"/>
  <div class="now-book__copy">
    <span class="now-book__kicker"><i></i>첫 책 출간 · 2026.11 · 지금 판매 중</span>
    <h3 class="now-book__title">AI는 답을 만들고<br/><em>마케터는 맥락을 설계한다</em></h3>
    <p class="now-book__sub">정답이 넘치는 AI 시대, 차이를 만드는 판단의 기준</p>
    <ol class="now-book__frame">
      <li><b>READ</b>사람을 읽고</li>
      <li><b>ROOT</b>브랜드를 지키고</li>
      <li><b>REACH</b>행동으로 잇고</li>
      <li><b>RALLY</b>사람을 모으고</li>
      <li><b>REMAIN</b>판단을 남긴다</li>
    </ol>
    <p class="now-book__meta">허보람 지음 · 슬로디미디어 · 30개 장 + 장마다 판단 체크리스트</p>
    <div class="now-book__links">
      <a href="${esc(yes24)}">YES24에서 보기 →</a>
      <a href="${esc(kyobo)}">교보문고에서 보기 →</a>
    </div>
  </div>
</div>
<div class="now-grid">
  <div class="now-card">
    <h3 class="now-card__title">기고 · Collaboration</h3>${collabs}
    <dl class="now-channels">
      <div><dt>정기 기고</dt><dd>모비인사이드 · 오픈애즈 · 아이보스 · 뉴닉</dd></div>
      <div><dt>브런치</dt><dd>공식 크리에이터 · 200편+ · 브런치북 「맥락을 설계하는 일」</dd></div>
    </dl>
  </div>
  <div class="now-card">
    <h3 class="now-card__title">최근 칼럼 · bruceheo.com/writing</h3>
    <ul class="now-posts">${postItems}
    </ul>
    <h3 class="now-card__title now-card__title--sub">강연</h3>
    <ul class="now-talks">
      <li><span class="now-date">2026</span><span>쉐이커스 사명캠프 진로특강 · 인문·사회계열 선택강의 2회차</span></li>
      <li><span class="now-date">2025</span><span>서울시립청소년문화센터 · 청소년문화예술기획단 전문교육 강연</span></li>
    </ul>
  </div>
</div>
</div>
</section>
`;

const css = `
<style>
/* ---------- NOW · 출간·기고 ---------- */
.now-book { display: grid; grid-template-columns: 240px 1fr; gap: 44px; align-items: center; background: #111111; color: #F2F1ED; border-radius: var(--radius-lg); padding: 40px 44px; }
.now-book__cover { width: 240px; border-radius: 6px; box-shadow: 0 18px 40px rgba(0,0,0,.45); }
.now-book__kicker { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: .04em; color: var(--mint); }
.now-book__kicker i { width: 7px; height: 7px; border-radius: 50%; background: var(--mint); }
.now-book__title { margin-top: 14px; font-size: 34px; line-height: 1.25; font-weight: 800; letter-spacing: -.02em; }
.now-book__title em { font-style: normal; color: var(--mint); }
.now-book__sub { margin-top: 10px; font-size: 16px; color: #C9C7C0; }
.now-book__frame { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; margin-top: 22px; }
.now-book__frame li { font-size: 13px; color: #DAD8D1; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); border-radius: 999px; padding: 6px 14px; }
.now-book__frame b { color: #fff; margin-right: 6px; letter-spacing: .03em; }
.now-book__meta { margin-top: 18px; font-size: 13px; color: #A5A39C; }
.now-book__links { display: flex; gap: 10px; margin-top: 18px; }
.now-book__links a { font-size: 13px; font-weight: 700; padding: 9px 16px; border-radius: 999px; background: var(--accent); color: #fff; }
.now-book__links a + a { background: transparent; border: 1px solid rgba(255,255,255,.3); }
.now-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
.now-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px; }
.now-card__title { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); margin-bottom: 14px; }
.now-card__title--sub { margin-top: 24px; }
.now-collab { display: block; background: var(--accent-soft); border-radius: 12px; padding: 20px; }
.now-label { font-size: 12px; font-weight: 700; color: var(--accent-strong); }
.now-collab strong { display: block; margin-top: 6px; font-size: 18px; line-height: 1.4; }
.now-collab p { margin-top: 8px; font-size: 14px; color: var(--text-2); }
.now-url { display: block; margin-top: 10px; font-size: 12px; color: var(--text-3); }
.now-channels { margin-top: 18px; display: grid; gap: 10px; }
.now-channels div { display: grid; grid-template-columns: 72px 1fr; gap: 12px; font-size: 14px; }
.now-channels dt { font-weight: 700; }
.now-channels dd { color: var(--text-2); }
.now-posts, .now-talks { list-style: none; }
.now-posts li + li, .now-talks li + li { border-top: 1px solid var(--border); }
.now-posts a, .now-talks li { display: grid; grid-template-columns: 64px 1fr; gap: 12px; padding: 10px 0; font-size: 14px; }
.now-posts a span:last-child { font-weight: 600; }
.now-date { color: var(--text-3); font-variant-numeric: tabular-nums; }

/* ---------- PRINT ---------- */
@page { margin: 0; }
.nav { display: none !important; }
.section, .closing { padding-top: 64px; padding-bottom: 64px; }
.proof-card, .pillar, .cblock, .cblocks, .kpi-row, .case-full__visual, .case-full__header, .now-book, .now-card, .career-strip,
.section-head, .closing__body, .reasoning, .cap, .caps > * { break-inside: avoid; }
.hero { min-height: 1697px; display: flex; align-items: center; border-bottom: none; }
.hero > .wrap { width: 100%; }
.hero__author { display: inline-block; margin-top: 10px; font-size: 15px; font-weight: 700; color: var(--accent-strong); background: var(--accent-soft); padding: 5px 12px; border-radius: 6px; }
.case-full { break-before: page; padding: 56px 0 40px; border-top: none; }
.case-full__visual { aspect-ratio: auto; height: 280px; break-after: avoid; }
#now, #proof, #capability, #workflow, .closing { break-before: page; }
.closing { min-height: 1600px; display: flex; align-items: center; }
.closing > .wrap { width: 100%; }
#proof, #summary, #capability, #communications, #workflow, .closing { break-inside: avoid; }
.reveal, [class*="reveal"] { opacity: 1 !important; transform: none !important; }
</style>
`;

// 히어로 이름줄에 저자 표기를 덧붙이고, 히어로 바로 뒤에 최근 소식을 넣는다.
html = html
  .replace('</head>', `${css}</head>`)
  .replace(/(<p class="hero__name">[\s\S]*?)(<\/p>)/, '$1<br/><span class="hero__author">《AI는 답을 만들고 마케터는 맥락을 설계한다》 저자</span>$2')
  .replace('</header>', `</header>${section}`)
  .replace(/<script[\s\S]*?<\/script>/g, '');

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1697 } });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const pdf = await page.pdf({ printBackground: true, width: '1200px', height: '1697px' });
await browser.close();

const out = fileURLToPath(new URL('portfolio-heoboram.pdf', root));
await writeFile(out, pdf);
console.log(`wrote ${out} (${(pdf.length / 1024 / 1024).toFixed(1)} MB)`);
