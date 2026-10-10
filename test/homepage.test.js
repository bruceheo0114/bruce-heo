import assert from "node:assert/strict";
import test from "node:test";
import { renderPostLinks, replaceWritingList } from "../src/lib/homepage.js";

const posts = Array.from({ length: 12 }, (_, index) => ({
  id: String(212 - index),
  canonicalUrl: `https://brunch.co.kr/@heoboram/${212 - index}`,
  title: index === 0 ? "브랜드 <전략> & 질문" : `글 ${index + 1}`,
  publishedAt: new Date(Date.UTC(2026, 7, 18 - index)).toISOString(),
}));

test("홈페이지 링크를 안전한 HTML로 렌더링한다", () => {
  const html = renderPostLinks(posts);
  assert.equal((html.match(/class="post"/g) ?? []).length, 12);
  assert.match(html, /브랜드 &lt;전략&gt; &amp; 질문/);
  assert.match(html, /2026\.08/);
});

test("Writing 자동 구간만 교체한다", () => {
  const original = "앞<!-- BRUNCH_POSTS_START -->오래된 글<!-- BRUNCH_POSTS_END -->뒤";
  const replaced = replaceWritingList(original, posts);
  assert.ok(replaced.startsWith("앞"));
  assert.ok(replaced.endsWith("뒤"));
  assert.doesNotMatch(replaced, /오래된 글/);
  assert.equal((replaced.match(/class="post"/g) ?? []).length, 12);
});

test("백업된 글은 브런치 대신 이 사이트 링크로 연결한다", async () => {
  const { linkArchivedPosts } = await import("../src/lib/homepage.js");
  const archived = new Set(["212", "211"]);
  const html = renderPostLinks(posts.slice(0, 3), archived);
  assert.match(html, /<a class="post" href="\/writing\/212\/">/);
  assert.match(html, /<a class="post" href="\/writing\/211\/">/);
  assert.match(html, /<a class="post" href="https:\/\/brunch\.co\.kr\/@heoboram\/210" target="_blank" rel="noopener">/);

  const page = `앞<a class="post" href="https://brunch.co.kr/@heoboram/9" target="_blank" rel="noopener"><!-- BRUNCH_POSTS_START -->${renderPostLinks(posts.slice(0, 3))}<!-- BRUNCH_POSTS_END -->뒤`;
  const linked = linkArchivedPosts(page, archived);
  assert.equal((linked.match(/href="\/writing\//g) ?? []).length, 2);
  assert.match(linked, /@heoboram\/210" target="_blank"/);
  assert.ok(linked.startsWith('앞<a class="post" href="https://brunch.co.kr/@heoboram/9"'), "자동 구간 밖은 그대로 둔다");
});
