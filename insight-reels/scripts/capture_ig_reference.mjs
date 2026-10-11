// 참고용 인스타그램 공개 게시물(링크)을 embed 페이지로 열어 장마다 이미지·캡션을 insight-reels/references/<shortcode>/ 에 저장한다.
// GitHub Actions 에서 실행(로그인 없이 보이는 embed 만). 사용: node capture_ig_reference.mjs <url> [<url> ...]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "references");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 540, height: 1000 }, deviceScaleFactor: 2, locale: "ko-KR" });

for (const url of process.argv.slice(2)) {
  const code = url.match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/)?.[1];
  if (!code) continue;
  const out = path.join(ROOT, code);
  await mkdir(out, { recursive: true });
  await page.goto(`https://www.instagram.com/p/${code}/embed/captioned/`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, "page.png"), fullPage: true });
  const seen = new Set();
  const images = [];
  for (let slide = 1; slide <= 20; slide += 1) {
    // 지금 보이는 큰 이미지들의 원본 주소를 모은다(캐러셀은 앞뒤 장을 미리 불러 둔다)
    const srcs = await page.$$eval("img", (imgs) =>
      imgs.filter((img) => img.naturalWidth >= 600).map((img) => img.currentSrc || img.src));
    for (const src of srcs) {
      if (seen.has(src)) continue;
      seen.add(src);
      const res = await page.request.get(src).catch(() => null);
      if (!res?.ok()) continue;
      const file = `${String(images.length + 1).padStart(2, "0")}.jpg`;
      await writeFile(path.join(out, file), await res.body());
      images.push(file);
    }
    const next = page.locator('button[aria-label="Next"], button[aria-label="다음"], .coreSpriteRightChevron').first();
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click().catch(() => {});
    await page.waitForTimeout(900);
  }
  const caption = await page.$eval(".Caption", (el) => el.innerText).catch(async () => page.innerText("body").catch(() => ""));
  const account = await page.$eval(".UsernameText, .Username", (el) => el.innerText).catch(() => "");
  await writeFile(path.join(out, "meta.json"), `${JSON.stringify({ url, shortcode: code, account, caption: caption.trim(), images }, null, 2)}\n`);
  console.log(code, account, `이미지 ${images.length}장`, `캡션 ${caption.length}자`);
}
await browser.close();
