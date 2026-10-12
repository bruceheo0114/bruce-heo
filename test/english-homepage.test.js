import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";

test("영문 홈페이지가 독립 URL과 언어 전환 정보를 제공한다", async () => {
  const html = await readFile("en/index.html", "utf8");

  assert.match(html, /<html lang="en">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/bruceheo\.com\/en\/">/);
  assert.match(html, /href="\/"[^>]+>KR<\/a>/);
  assert.match(html, /<h1 class="hero__title">[\s\S]*People remember brands/);
  assert.match(html, /Brand Communication &amp; IMC Lead/);
  assert.match(html, /property="og:image" content="https:\/\/bruceheo\.com\/en\/og\.png"/);

  const visibleMarkup = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, "[image]");
  assert.doesNotMatch(visibleMarkup, /[가-힣]/);

  await access("en/og.png");
});

test("영문 하위 페이지(경력·대표 작업·세션)가 영어로만 보이고 한국어 페이지와 연결된다", async () => {
  const career = await readFile("en/career/index.html", "utf8");
  assert.match(career, /id="communications"/);
  assert.match(career, /Herbalife Korea · Integrated PR/);
  for (const slug of ["career", "work", "talks"]) {
    const html = await readFile(`en/${slug}/index.html`, "utf8");
    assert.match(html, new RegExp(`<link rel="canonical" href="https://bruceheo\\.com/en/${slug}/">`));
    assert.match(html, new RegExp(`href="/${slug}/"[^>]+>KR</a>`));
    const visible = html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, "[image]");
    assert.doesNotMatch(visible, /[가-힣]/, slug);
  }
});
