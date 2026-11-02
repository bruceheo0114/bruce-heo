// PNG 렌더: node newsletter/promo/2026-11-03/render.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const dir = __dirname, b = await chromium.launch();
  for (const f of fs.readdirSync(path.join(dir, 'html')).filter(f => f.endsWith('.html'))) {
    const story = f.startsWith('story');
    const p = await b.newPage({ viewport: { width: 1080, height: story ? 1920 : 1350 } });
    await p.goto('file://' + path.join(dir, 'html', f), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(dir, f.replace('.html', '.png')) });
    const over = await p.evaluate(() => [...document.querySelectorAll('.f > *')].some(e => e.getBoundingClientRect().bottom > innerHeight + 1));
    console.log(f, over ? 'OVERFLOW' : 'ok', await p.evaluate(() => document.fonts.check('40px "Pretendard Variable"')));
  }
  await b.close();
})();
