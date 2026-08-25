import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";

test("영문 홈페이지가 독립 URL과 언어 전환 정보를 제공한다", async () => {
  const html = await readFile("en/index.html", "utf8");

  assert.match(html, /<html lang="en">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/bruceheo\.com\/en\/">/);
  assert.match(html, /href="\.\.\/"[^>]+>KR<\/a>/);
  assert.match(html, /<h1 class="hero__title">[\s\S]*People remember brands/);
  assert.match(html, /property="og:image" content="https:\/\/bruceheo\.com\/en\/og\.png"/);

  const visibleMarkup = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, "[image]");
  assert.doesNotMatch(visibleMarkup, /[가-힣]/);

  await access("en/og.png");
});
