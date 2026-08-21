import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseArticleHtml, parseProfileFeed } from "../src/lib/brunch.js";

test("RSS에서 canonical URL을 만들고 중복을 제거한다", async () => {
  const xml = await readFile("test/fixtures/profile.xml", "utf8");
  const items = parseProfileFeed(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "212");
  assert.equal(items[0].canonicalUrl, "https://brunch.co.kr/@heoboram/212");
  assert.equal(items[0].feedImageUrl, "https://example.com/212.jpg");
});

test("브런치 글 메타데이터와 본문·이미지를 추출한다", async () => {
  const html = await readFile("test/fixtures/article.html", "utf8");
  const article = parseArticleHtml(html);
  assert.equal(article.id, "212");
  assert.equal(article.title, "스위첸은 왜 8년째 집 이야기를 할까");
  assert.match(article.body, /장기 브랜드 자산/);
  assert.deepEqual(article.images, [
    "https://example.com/cover.jpg",
    "https://example.com/body.jpg",
  ]);
  assert.equal(article.bodyHash.length, 64);
});

test("브런치 구조가 비면 안전하게 중단한다", () => {
  assert.throws(() => parseProfileFeed("<rss><channel /></rss>"), {
    code: "BRUNCH_STRUCTURE_CHANGED",
  });
});
