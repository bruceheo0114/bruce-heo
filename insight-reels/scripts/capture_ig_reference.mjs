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
  // 캐러셀을 한 장씩 넘기며 미디어 영역을 캡처한다(이미지가 배경으로 깔려 원본 주소를 못 얻는 경우가 많다)
  const images = [];
  const media = async () => page.evaluate(() => {
    const el = [...document.querySelectorAll("img, video, div")].map((node) => ({ node, r: node.getBoundingClientRect() }))
      .filter(({ r }) => r.width >= 500 && r.height >= 300 && r.top >= 0).sort((a, b) => a.r.top - b.r.top || b.r.height - a.r.height)[0];
    return el ? { x: el.r.left, y: el.r.top, width: el.r.width, height: el.r.height } : null;
  });
  const box = await media();
  for (let slide = 1; slide <= 20 && box; slide += 1) {
    const file = `${String(slide).padStart(2, "0")}.png`;
    await page.screenshot({ path: path.join(out, file), clip: box });
    images.push(file);
    // 미디어 오른쪽 가운데에 있는 '다음' 버튼을 찾는다
    const clicked = await page.evaluate((b) => {
      const next = [...document.querySelectorAll("button, [role=button]")].find((node) => {
        const r = node.getBoundingClientRect();
        const label = (node.getAttribute("aria-label") || "") + node.className;
        return r.width > 0 && (/next|다음|Right/i.test(label) || (r.left > b.x + b.width * 0.75 && r.top > b.y + b.height * 0.25 && r.bottom < b.y + b.height * 0.75));
      });
      if (!next) return false;
      next.click();
      return true;
    }, box);
    if (!clicked) break;
    await page.waitForTimeout(1200);
  }
  const caption = await page.$eval(".Caption", (el) => el.innerText).catch(async () => page.innerText("body").catch(() => ""));
  const account = await page.$eval(".UsernameText, .Username", (el) => el.innerText).catch(() => "");
  await writeFile(path.join(out, "meta.json"), `${JSON.stringify({ url, shortcode: code, account, caption: caption.trim(), images }, null, 2)}\n`);
  console.log(code, account, `이미지 ${images.length}장`, `캡션 ${caption.length}자`);
}
await browser.close();
