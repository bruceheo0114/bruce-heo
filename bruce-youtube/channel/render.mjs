// 채널 이미지(프로필·배너·썸네일 샘플)를 인스타그램 카드와 같은 디자인으로 그린다.
// 실행: node bruce-youtube/channel/render.mjs  (저장소 루트, playwright·pretendard 설치 필요)
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const font = await readFile(require.resolve("pretendard/dist/web/variable/woff2/PretendardVariable.woff2"));
const fontUrl = `data:font/woff2;base64,${font.toString("base64")}`;

const IVORY = "#F2F1ED";
const MINT = "#65B98A";
const GREEN = "#23744c";
const INK = "#111111";

const base = `@font-face{font-family:P;src:url(${fontUrl}) format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0}body{font-family:P,sans-serif;color:${INK};word-break:keep-all}
.pill{display:inline-block;border:solid ${MINT};border-radius:999px;color:${GREEN};font-weight:800;letter-spacing:-.03em;line-height:1}
.mark{border-radius:50%;background:${INK};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;letter-spacing:-.08em}
.dot{color:${MINT}}`;

const pages = {
  "profile.png": {
    width: 800,
    height: 800,
    html: `<style>${base}body{width:800px;height:800px;background:${INK};display:flex;align-items:center;justify-content:center}
      .t{color:#fff;font-size:330px;font-weight:900;letter-spacing:-.09em;margin-left:-20px}</style>
      <div class="t">BR<span class="dot">.</span></div>`,
  },
  // YouTube 배너 2560×1440, 모든 기기에서 보이는 안전 영역은 가운데 1546×423
  "banner.png": {
    width: 2560,
    height: 1440,
    html: `<style>${base}body{width:2560px;height:1440px;background:${IVORY};position:relative;overflow:hidden}
      .safe{position:absolute;left:507px;top:508px;width:1546px;height:423px;display:flex;align-items:center;gap:64px}
      .mark{width:230px;height:230px;font-size:86px;flex:none}
      .pill{border-width:5px;padding:14px 30px 17px;font-size:34px}
      h1{font-size:96px;font-weight:900;letter-spacing:-.05em;line-height:1.08;margin-top:26px}
      p{margin-top:22px;font-size:38px;font-weight:600;color:#3a3a37;letter-spacing:-.02em}
      .line{position:absolute;left:0;right:0;top:1060px;height:6px;background:${MINT};opacity:.55}</style>
      <div class="line"></div>
      <div class="safe"><div class="mark">BR.</div>
        <div><span class="pill">브루스 인사이트</span>
          <h1>광고 뒤의 판단을 읽습니다<span class="dot">.</span></h1>
          <p>브랜드 사례 · 마케터의 판단 | 매주 10~15분 영상 에세이</p></div></div>`,
  },
  // 썸네일 1280×720 샘플 (EP001 하인즈). 실제 썸네일은 01_brief.md의 Thumbnail Copy로 바꿔 쓴다.
  "thumbnail-sample.png": {
    width: 1280,
    height: 720,
    html: `<style>${base}body{width:1280px;height:720px;background:${IVORY};position:relative;overflow:hidden}
      .img{position:absolute;right:0;top:0;width:46%;height:100%;background:linear-gradient(135deg,#c9372c,#7d1a14)}
      .img:after{content:"실제 캠페인 화면";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#fff;opacity:.7;font-size:30px;font-weight:700}
      .copy{position:absolute;left:64px;top:64px;width:700px;height:592px;display:flex;flex-direction:column}
      .pill{border-width:4px;padding:10px 22px 13px;font-size:26px;align-self:flex-start}
      h1{margin-top:auto;font-size:92px;font-weight:900;letter-spacing:-.055em;line-height:1.08}
      .mark{width:84px;height:84px;font-size:31px;margin-top:40px}</style>
      <div class="img"></div>
      <div class="copy"><span class="pill">브랜드 사례</span>
        <h1>케첩이 아니라<br>기억을 판다<span class="dot">.</span></h1><div class="mark">BR.</div></div>`,
  },
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
try {
  for (const [file, page] of Object.entries(pages)) {
    const tab = await browser.newPage({ viewport: { width: page.width, height: page.height } });
    await tab.setContent(`<!doctype html><meta charset="utf-8">${page.html}`, { waitUntil: "load" });
    await tab.evaluate(() => document.fonts.ready);
    await tab.screenshot({ path: path.join(here, file) });
    await tab.close();
    console.log(file);
  }
} finally {
  await browser.close();
}
