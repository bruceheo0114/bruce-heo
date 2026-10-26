// 첫 책 홍보 배너(오픈애즈 「마케띵킹」 뉴스레터용) 렌더러.
// node book-launch/render-banner.mjs → book-launch/banner/*.png
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const font = await readFile(require.resolve("pretendard/dist/web/variable/woff2/PretendardVariable.woff2"));
const cover = await readFile(new URL("../assets/book/cover.jpg", import.meta.url));
const fontUrl = `data:font/woff2;base64,${font.toString("base64")}`;
const coverUrl = `data:image/jpeg;base64,${cover.toString("base64")}`;

const PINK = "#D30874", INK = "#111";
const base = `@font-face{font-family:P;src:url(${fontUrl}) format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:P,sans-serif;color:${INK};word-break:keep-all;letter-spacing:-.035em}
.stage{position:relative;overflow:hidden;background:#E3E4E2}
.box{display:inline-block;background:#fff;border:6px solid ${PINK};color:${PINK};font-weight:900;padding:2px 16px 6px;line-height:1.12}
.fill{display:inline-block;background:${PINK};color:#fff;font-weight:900;padding:2px 16px 6px;line-height:1.12}
.kick{display:inline-flex;align-items:center;gap:10px;font-weight:800;color:${INK}}
.kick i{font-style:normal;color:${PINK};font-weight:900}
.cta{display:inline-flex;align-items:center;gap:12px;background:${INK};color:#fff;font-weight:800;border-radius:999px}
.cover{position:absolute;box-shadow:0 30px 60px rgba(0,0,0,.28),0 4px 10px rgba(0,0,0,.12);border-radius:3px 6px 6px 3px}
.dots{color:#2C9BE0;font-weight:900;letter-spacing:.1em}`;

const banners = {
  // 본문 중간 배너 600×300 @2x
  "openads-banner-1200x600": {
    w: 1200, h: 600, html: `<div class="stage" style="width:1200px;height:600px">
      <div style="position:absolute;left:72px;top:64px;width:700px">
        <div class="kick" style="font-size:26px"><i>✱</i> 오픈애즈 인사이터 브루스의 첫 책</div>
        <div style="margin-top:30px;font-size:62px;line-height:1.28">
          <span class="box">AI는 답을 만들고</span><br>
          <span class="fill" style="margin-top:12px">마케터는 맥락을 설계한다</span>
        </div>
        <div style="margin-top:30px;font-size:29px;font-weight:700;line-height:1.5">
          트렌드를 따라 할지 말지, 감이 아닌 기준으로.<br>11년 차 마케터의 <b style="color:${PINK}">5단계 판단 프레임</b>을 한 권에 담았어요.
        </div>
        <div class="cta" style="margin-top:36px;font-size:27px;padding:18px 32px 20px">지금 판매 중 · YES24 · 교보문고 <span style="color:${PINK}">→</span></div>
      </div>
      <img class="cover" src="${coverUrl}" style="right:84px;top:58px;width:340px;transform:rotate(4deg)">
    </div>` },
  // 상단·하단 띠 배너 600×150 @2x
  "openads-strip-1200x300": {
    w: 1200, h: 300, html: `<div class="stage" style="width:1200px;height:300px">
      <img class="cover" src="${coverUrl}" style="left:76px;top:34px;width:160px;transform:rotate(-4deg)">
      <div style="position:absolute;left:320px;top:44px;width:820px">
        <div class="kick" style="font-size:22px"><i>✱</i> 오픈애즈 인사이터 브루스의 첫 책</div>
        <div style="margin-top:16px;font-size:44px;line-height:1.3">
          <span class="box" style="border-width:5px">AI는 답을 만들고</span> <span class="fill">마케터는 맥락을 설계한다</span>
        </div>
        <div style="margin-top:22px;display:flex;align-items:center;gap:18px">
          <div class="cta" style="font-size:22px;padding:13px 24px 15px">지금 판매 중 <span style="color:${PINK}">→</span></div>
          <div style="font-size:21px;font-weight:700">YES24 · 교보문고</div>
        </div>
      </div>
    </div>` },
  // 정사각 썸네일(뉴스레터 카드·SNS 공유) 1080×1080
  "openads-square-1080": {
    w: 1080, h: 1080, html: `<div class="stage" style="width:1080px;height:1080px">
      <div style="position:absolute;left:80px;top:84px;right:80px">
        <div class="kick" style="font-size:30px"><i>✱</i> 오픈애즈 인사이터 브루스의 첫 책</div>
        <div style="margin-top:34px;font-size:52px;font-weight:800;line-height:1.38">트렌드를 따라 할지 말지,<br>감이 아닌 <span class="fill" style="padding:0 12px 4px">기준</span>으로 정하는 법</div>
      </div>
      <img class="cover" src="${coverUrl}" style="left:96px;top:380px;width:420px;transform:rotate(-3deg)">
      <div style="position:absolute;left:590px;top:470px;right:60px;font-size:30px;font-weight:700;line-height:1.55">
        <div class="dots" style="font-size:26px">READ · ROOT · REACH<br>RALLY · REMAIN</div>
        <div style="margin-top:22px">11년 차 마케터의<br>현장 판단법</div>
        <div class="cta" style="margin-top:34px;font-size:28px;padding:18px 30px 20px">지금 판매 중 <span style="color:${PINK}">→</span></div>
      </div>
    </div>` },
};

const out = new URL("./banner/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const [name, b] of Object.entries(banners)) {
  const page = await browser.newPage({ viewport: { width: b.w, height: b.h } });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${base}</style></head><body>${b.html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL(`${name}.png`, out).pathname });
  console.log("wrote", name);
}
await browser.close();
