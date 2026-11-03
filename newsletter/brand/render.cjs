// 뉴스레터 브랜드 이미지 렌더: node newsletter/brand/render.cjs
const { chromium } = require('playwright');
const path = require('path');
const FONT = "@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');";
const base = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Pretendard Variable',Pretendard,sans-serif;word-break:keep-all}
.mark{border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;letter-spacing:-.09em}.mark i{font-style:normal;color:#65B98A}`;
const items = [
  ['mark-512', 512, 512, true, `<div class="mark" style="width:512px;height:512px;font-size:196px">BR<i>.</i></div>`],
  ['mark-ivory-512', 512, 512, false, `<div style="width:512px;height:512px;background:#F2F1ED;display:flex;align-items:center;justify-content:center"><div class="mark" style="width:400px;height:400px;font-size:152px">BR<i>.</i></div></div>`],
  ['wordmark-1200', 1200, 200, true, `<div style="height:200px;display:flex;align-items:center;gap:32px;padding:0 8px"><div class="mark" style="width:136px;height:136px;font-size:52px;flex:none">BR<i>.</i></div><div style="display:flex;flex-direction:column;gap:6px"><b style="font-size:64px;font-weight:900;letter-spacing:-.04em;color:#111;line-height:1.1">브루스의 트렌드 노트</b><span style="font-size:32px;font-weight:600;color:#73736E">매주 수요일 · 허보람(브루스)</span></div></div>`],
  ['email-header-1200', 1200, 160, false, `<div style="width:1200px;height:160px;background:#F2F1ED;display:flex;align-items:center;justify-content:space-between;padding:0 16px;border-bottom:2px solid #E3E1DA"><div style="display:flex;align-items:center;gap:22px"><div class="mark" style="width:72px;height:72px;font-size:27px">BR<i>.</i></div><b style="font-size:40px;font-weight:800;letter-spacing:-.02em;color:#111">브루스의 트렌드 노트</b></div><span style="font-size:30px;font-weight:600;color:#73736E">매주 수요일</span></div>`],
  ['cover-1200x630', 1200, 630, false, `<div style="width:1200px;height:630px;background:#F2F1ED;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between"><div style="display:flex;align-items:center;gap:20px"><div class="mark" style="width:72px;height:72px;font-size:27px">BR<i>.</i></div><b style="font-size:34px;font-weight:800">허보람(브루스)</b></div><div><span style="display:inline-block;font-size:28px;font-weight:800;color:#23744C;border:4px solid #65B98A;border-radius:999px;padding:6px 22px 8px;margin-bottom:26px">매주 수요일 · 무료</span><div style="font-size:84px;font-weight:900;letter-spacing:-.045em;line-height:1.15;color:#111">브루스의 트렌드 노트</div><div style="margin-top:18px;font-size:36px;font-weight:500;color:#3A3A37">트렌드를 형식이 아니라 이유로 읽습니다</div></div></div>`],
];
(async () => {
  const b = await chromium.launch();
  for (const [name, w, h, transparent, html] of items) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(`<!doctype html><meta charset=utf-8><style>${FONT}${base}html,body{width:${w}px;height:${h}px;background:${transparent ? 'transparent' : '#F2F1ED'}}</style>${html}`, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(__dirname, name + '.png'), omitBackground: transparent });
    console.log(name);
  }
  await b.close();
})();
