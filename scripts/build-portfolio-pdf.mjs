// 포트폴리오 PDF(16:9 슬라이드): portfolio-heoboram.html 디자인 그대로, 책 출간·기고·최근 칼럼·강연을 더해 PDF로 뽑는다.
// node scripts/build-portfolio-pdf.mjs  →  portfolio-heoboram.pdf
//
// 서체: Pretendard Variable 을 그대로 쓰면 Chromium 이 Type 3 글리프로 바꿔 넣어 뷰어에 따라 깨진다.
// 그래서 pretendard 패키지(package.json 의존성)의 정적 TTF 를 base64 로 넣어 TrueType 으로 임베드한다.
// 패키지 위치는 node_modules 에서 찾고, 없으면 PRETENDARD_DIR(압축 푼 패키지 폴더)을 쓴다.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const read = (p, enc = 'utf8') => readFile(new URL(p, root), enc);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const W = 1600;
const H = 900;

// ---------- 서체 ----------
function pretendardDir() {
  if (process.env.PRETENDARD_DIR) return process.env.PRETENDARD_DIR;
  try { return dirname(require.resolve('pretendard/package.json')); } catch { /* 아래에서 안내 */ }
  throw new Error('pretendard 패키지를 찾지 못했습니다. pnpm install 을 하거나 PRETENDARD_DIR 을 지정하세요.');
}
const fontDir = join(pretendardDir(), 'dist/public/static/alternative');
const weights = { Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800, Black: 900 };
let fontFaces = '';
for (const [name, weight] of Object.entries(weights)) {
  const file = join(fontDir, `Pretendard-${name}.ttf`);
  if (!existsSync(file)) throw new Error(`서체 파일이 없습니다: ${file}`);
  const b64 = (await readFile(file)).toString('base64');
  fontFaces += `@font-face { font-family: 'Pretendard'; font-weight: ${weight}; font-style: normal; src: url(data:font/ttf;base64,${b64}) format('truetype'); }\n`;
}

// ---------- 원본과 추가 콘텐츠 ----------
let html = await read('portfolio-heoboram.html');
const home = await read('index.html');
const meta = JSON.parse(await read('data/writing-meta.json'));
const cover = `data:image/jpeg;base64,${(await read('assets/book/cover.jpg', null)).toString('base64')}`;

// 홈페이지 책 배너와 같은 링크를 쓴다.
const store = (name) => home.match(new RegExp(`data-book-store="${name}" href="([^"]+)"`))[1];
const yes24 = store('yes24');
const kyobo = store('kyobo');

// 홈페이지 '최신 글' 목록(브런치 자동 동기화 구간)에서 최근 6편.
const postsBlock = home.split('<!-- BRUNCH_POSTS_START -->')[1].split('<!--')[0];
const posts = [...postsBlock.matchAll(/href="([^"]+)">\s*<div class="post__date">([^<]+)<\/div>\s*<div class="post__title">([^<]+)<\/div>/g)]
  .slice(0, 6)
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

const bookSlide = `
<div class="now-book">
  <img class="now-book__cover" src="${cover}" alt="책 표지: AI는 답을 만들고 마케터는 맥락을 설계한다"/>
  <div class="now-book__copy">
    <span class="now-book__kicker"><i></i>첫 책 출간 · 2026.11 · 지금 판매 중</span>
    <h2 class="now-book__title">AI는 답을 만들고<br/><em>마케터는 맥락을 설계한다</em></h2>
    <p class="now-book__sub">정답이 넘치는 AI 시대, 차이를 만드는 판단의 기준</p>
    <p class="now-book__desc">11년 동안 캠페인 현장에서 내린 선택의 기준을 다섯 단계 판단 프레임으로 묶었습니다. AI가 답을 쏟아내는 시대에 마케터가 무엇을 읽고, 지키고, 연결해야 하는지 30개 장과 장마다의 판단 체크리스트로 정리했습니다.</p>
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
</div>`;

const writingSlide = `
<div class="section-head">
<span class="section-eyebrow">Now · Writing &amp; Talks</span>
<h2 class="section-title">현장의 판단을 글로 나누고 있습니다.</h2>
<p class="section-desc">오픈애즈 오리지널 기고와 브런치 칼럼으로 <strong>마케터들과 판단의 기준을 계속 나누고 있습니다.</strong></p>
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
</div>`;

const css = `
<style>
${fontFaces}
body, button, input { font-family: 'Pretendard', sans-serif !important; }
@page { margin: 0; }
html, body { background: #F2F1ED; }

/* ---------- SLIDE FRAME ---------- */
.slide { width: ${W}px; height: ${H}px; overflow: hidden; position: relative; display: flex; flex-direction: column; background: var(--bg); break-after: page; }
.slide--soft { background: var(--bg-soft); }
.slide--dark { background: linear-gradient(135deg, #111111 0%, #2A2A27 100%); color: #fff; }
.slide__bar { flex: none; height: 64px; margin: 0 72px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text-3); }
.slide--dark .slide__bar { border-color: rgba(255,255,255,.12); color: rgba(255,255,255,.5); }
.slide__brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 800; color: var(--text); }
.slide--dark .slide__brand { color: #fff; }
.slide__brand .brand-mark { width: 26px; height: 26px; font-size: 10px; }
.slide--dark .slide__brand .brand-mark { background: #fff; color: #111 !important; }
.slide__meta { display: inline-flex; gap: 18px; font-weight: 600; letter-spacing: .02em; }
.slide__page { font-variant-numeric: tabular-nums; color: var(--text); }
.slide--dark .slide__page { color: #fff; }
.slide__body { flex: 1; min-height: 0; padding: 36px 72px 44px; display: flex; flex-direction: column; justify-content: center; }
.slide__fit { width: 100%; }
.slide__fit .wrap { max-width: none; padding: 0; margin: 0; }
.slide .section-head { margin-bottom: 28px; }
.slide .section-desc { max-width: 900px; }

/* cover */
.slide--cover { padding: 0; border: none; }
.slide--cover .slide__body { padding-top: 24px; }
.slide--cover .hero__grid { grid-template-columns: 1fr auto; gap: 80px; }
.slide--cover .hero__photo { width: 240px; height: 240px; order: 0; justify-self: end; }
.slide--cover .hero__title { font-size: 64px; }
.slide--cover .career-strip { margin-top: 36px; }
.hero__author { display: inline-block; margin-top: 10px; font-size: 15px; font-weight: 700; color: var(--accent-strong); background: var(--accent-soft); padding: 5px 12px; border-radius: 6px; }

/* divider (대표 프로젝트) */
.slide--divider .section-title { font-size: 48px; }
.slide--divider .section-desc { font-size: 18px; max-width: 1000px; }

/* case A: 비주얼 + 헤더 + Overview */
.case-a { display: grid; grid-template-columns: 1.05fr 1fr; gap: 48px; align-items: stretch; height: 100%; }
.case-a .case-full__visual { aspect-ratio: auto; height: 100%; margin: 0; }
.case-a__copy { display: flex; flex-direction: column; justify-content: center; }
.case-a .case-full__title { font-size: 34px; }
.case-a .case-full__lead { font-size: 16px; margin: 18px 0 24px; }
.case-a .cblock__grid { grid-template-columns: 1fr 1fr; gap: 16px 20px; }
.case-a .cblock__item dd { font-size: 14px; }
.slide--case-a .slide__body { justify-content: stretch; }
.slide--case-a .slide__fit { height: 100%; }

/* case B: Strategy·Execution + Results */
.case-b__head { display: flex; align-items: baseline; gap: 16px; margin-bottom: 22px; }
.case-b__head .case-full__title { font-size: 26px; margin: 0; }
.case-b { display: grid; grid-template-columns: 1.15fr 1fr; gap: 20px; align-items: stretch; }
.case-b__left { display: flex; flex-direction: column; gap: 20px; }
.case-b .cblock { padding: 24px 26px; }
.case-b .cblock__grid { grid-template-columns: 1fr; gap: 12px; }
.case-b .cblock--results .kpi-row { grid-template-columns: repeat(2, 1fr); }
.case-b .cblock--results .kpi__num { font-size: 34px; }
.case-b .reasoning { grid-template-columns: 1fr; margin-top: 18px; }
.case-b .reasoning__block dd { font-size: 13px; }

/* closing */
.slide--dark .closing__lead { font-size: 40px; max-width: none; }
.slide--dark .closing__body { max-width: 900px; }
.slide__footer { margin-top: 40px; font-size: 12px; color: rgba(255,255,255,.4); }

/* ---------- NOW · 출간·기고 ---------- */
.now-book { display: grid; grid-template-columns: 380px 1fr; gap: 72px; align-items: center; }
.now-book__cover { width: 380px; border-radius: 8px; box-shadow: 0 24px 60px rgba(0,0,0,.5); }
.now-book__kicker { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; letter-spacing: .04em; color: var(--mint); }
.now-book__kicker i { width: 8px; height: 8px; border-radius: 50%; background: var(--mint); }
.now-book__title { margin-top: 18px; font-size: 52px; line-height: 1.2; font-weight: 900; letter-spacing: -.03em; }
.now-book__title em { font-style: normal; color: var(--mint); }
.now-book__sub { margin-top: 14px; font-size: 20px; color: #D6D3CB; }
.now-book__desc { margin-top: 18px; font-size: 15px; line-height: 1.75; color: #B5B3AC; max-width: 720px; }
.now-book__frame { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; margin-top: 26px; }
.now-book__frame li { font-size: 14px; color: #DAD8D1; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.14); border-radius: 999px; padding: 7px 16px; }
.now-book__frame b { color: #fff; margin-right: 6px; letter-spacing: .03em; }
.now-book__meta { margin-top: 20px; font-size: 14px; color: #A5A39C; }
.now-book__links { display: flex; gap: 10px; margin-top: 22px; }
.now-book__links a { font-size: 14px; font-weight: 700; padding: 10px 18px; border-radius: 999px; background: var(--accent); color: #fff; }
.now-book__links a + a { background: transparent; border: 1px solid rgba(255,255,255,.3); }
.now-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.now-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 30px; }
.now-card__title { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--accent); margin-bottom: 14px; }
.now-card__title--sub { margin-top: 22px; }
.now-collab { display: block; background: var(--accent-soft); border-radius: 12px; padding: 22px; }
.now-label { font-size: 12px; font-weight: 700; color: var(--accent-strong); }
.now-collab strong { display: block; margin-top: 6px; font-size: 20px; line-height: 1.4; }
.now-collab p { margin-top: 8px; font-size: 14px; color: var(--text-2); }
.now-url { display: block; margin-top: 10px; font-size: 12px; color: var(--text-3); }
.now-channels { margin-top: 20px; display: grid; gap: 10px; }
.now-channels div { display: grid; grid-template-columns: 72px 1fr; gap: 12px; font-size: 14px; }
.now-channels dt { font-weight: 700; }
.now-channels dd { color: var(--text-2); }
.now-posts, .now-talks { list-style: none; }
.now-posts li + li, .now-talks li + li { border-top: 1px solid var(--border); }
.now-posts a, .now-talks li { display: grid; grid-template-columns: 64px 1fr; gap: 12px; padding: 9px 0; font-size: 14px; }
.now-posts a span:last-child { font-weight: 600; }
.now-date { color: var(--text-3); font-variant-numeric: tabular-nums; }
</style>
`;

// 웹폰트 CDN(가변 서체)과 스크립트는 빼고, 정적 서체와 슬라이드 CSS 를 넣는다.
html = html
  .replace(/<link[^>]*pretendard[^>]*>/gi, '')
  .replace(/<link[^>]*preconnect[^>]*>/gi, '')
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/✉\s*/g, '') // Pretendard 에 없는 기호라 대체 서체(Type 3)로 들어간다
  .replace('</head>', `${css}</head>`)
  .replace(/(<p class="hero__name">[\s\S]*?)(<\/p>)/, '$1<br/><span class="hero__author">《AI는 답을 만들고 마케터는 맥락을 설계한다》 저자</span>$2');

const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html, { waitUntil: 'load' });

// 원본 DOM 노드를 슬라이드로 옮겨 담는다(이미지·마크업을 다시 쓰지 않는다).
const total = await page.evaluate(({ bookSlide, writingSlide }) => {
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const frag = (htmlStr) => { const d = document.createElement('div'); d.innerHTML = htmlStr; return [...d.childNodes]; };
  const el = (cls, children = []) => { const d = document.createElement('div'); d.className = cls; children.forEach((c) => c && d.append(c)); return d; };

  const slides = [];
  const add = (label, nodes, variant = '') => slides.push({ label, nodes, variant });

  add('Cover', [q('header.hero .wrap')], 'cover');
  add('Now · 첫 책 출간', frag(bookSlide), 'dark');
  add('Now · 기고 · 칼럼', frag(writingSlide));
  add('01 · Proof', [q('#proof .wrap')]);
  add('02 · Summary', [q('#summary .wrap')], 'soft');
  add('03 · Capability', [q('#capability .wrap')]);
  add('04 · Integrated Communications', [q('#communications .wrap')], 'soft');
  add('05 · Workflow', [q('#workflow .wrap')]);
  const intro = qa('section.section').find((s) => /Hero Projects/.test(s.textContent));
  add('06 · Hero Projects', [q('.wrap', intro)], 'divider');

  for (const art of qa('article.case-full')) {
    const num = q('.case-full__num', art).textContent.trim();
    const title = q('.case-full__title', art).textContent.trim();
    const [overview, ...rest] = qa('.cblock', art);
    const results = rest.find((b) => b.classList.contains('cblock--results'));
    const left = rest.filter((b) => b !== results);

    const copy = el('case-a__copy', [q('.case-full__header', art), q('.case-full__lead', art), overview]);
    add(`${num} · ${title}`, [el('case-a', [q('.case-full__visual', art), copy])], 'case-a');

    const head = el('case-b__head');
    head.innerHTML = `<span class="case-full__num">${num}</span><h3 class="case-full__title">${title}</h3>`;
    add(`${num} · Strategy & Results`, [head, el('case-b', [el('case-b__left', left), results])]);
  }

  const closing = q('.closing .wrap');
  const foot = el('slide__footer');
  foot.textContent = 'bruceheo.com · heoboram0114@gmail.com · © 2026 Bruce Heo · 허보람';
  closing.append(foot);
  add('Closing', [closing], 'dark');

  document.body.innerHTML = '';
  slides.forEach((s, i) => {
    const slide = el(['slide', ...s.variant.split(' ').filter(Boolean).map((v) => `slide--${v}`)].join(' '));
    if (s.variant === 'cover') slide.classList.add('hero');
    const bar = el('slide__bar');
    bar.innerHTML = `<span class="slide__brand"><span class="brand-mark">BR<i>.</i></span>Bruce Heo · Portfolio 2026</span>
      <span class="slide__meta"><span></span><span class="slide__page">${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}</span></span>`;
    bar.querySelector('.slide__meta span').textContent = s.label;
    slide.append(bar, el('slide__body', [el('slide__fit', s.nodes)]));
    document.body.append(slide);
  });
  return slides.length;
}, { bookSlide, writingSlide });

await page.evaluate(() => document.fonts.ready);

// 슬라이드마다 내용을 같은 비율로 키우거나 줄여 한 장을 채운다(최대 1.3배).
const scaled = await page.evaluate(() => [...document.querySelectorAll('.slide')].map((slide, i) => {
  if (slide.classList.contains('slide--case-a')) return null;
  const body = slide.querySelector('.slide__body');
  const fit = slide.querySelector('.slide__fit');
  const cs = getComputedStyle(body);
  const availW = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  let z = 1;
  for (let n = 0; n < 6; n += 1) {
    fit.style.width = `${availW / z}px`;
    fit.style.zoom = String(z);
    const need = fit.scrollHeight * z;
    const next = Math.min(1.3, z * (availH / need));
    if (Math.abs(next - z) < 0.005) break;
    z = next;
  }
  // 반올림 오차로 넘치지 않게 조금 줄여 둔다.
  z = Math.floor(z * 100) / 100;
  fit.style.width = `${availW / z}px`;
  fit.style.zoom = String(z);
  return `${i + 1}:${z.toFixed(2)}`;
}).filter(Boolean));

const pdf = await page.pdf({ printBackground: true, width: `${W}px`, height: `${H}px` });
await browser.close();

const out = fileURLToPath(new URL('portfolio-heoboram.pdf', root));
await writeFile(out, pdf);
console.log(`wrote ${out} · ${total} slides · ${(pdf.length / 1024 / 1024).toFixed(1)} MB`);
console.log(`scale: ${scaled.join(' ')}`);
