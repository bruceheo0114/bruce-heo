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

test("홈페이지에 Google·네이버 소유 확인 태그가 있다", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile("index.html", "utf8");
  assert.match(html, /<meta name="google-site-verification" content="MR6HGJ-M7TaBzlQvoG9KKeew9je-0En2ztX5fFw82b4" \/>/);
  assert.match(html, /<meta name="naver-site-verification" content="e7e76f3942f4c25eb95171df6964bfc3e7905dc2" \/>/);
});

test("모든 공개 페이지에 Google 애널리틱스 태그가 한 번씩 들어 있다", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const archived = (await readdir("writing", { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => `writing/${e.name}/index.html`);
  const pages = ["index.html", "career/index.html", "work/index.html", "talks/index.html", "en/index.html", "en/career/index.html", "en/work/index.html", "en/talks/index.html", "sessions.html", "campaign-workbook.html", "portfolio-heoboram.html", "writing/index.html", "context/index.html", ...archived];
  for (const page of pages) {
    const html = await readFile(page, "utf8");
    assert.equal((html.match(/googletagmanager\.com\/gtag\/js\?id=G-17SXL7Q2XV/g) ?? []).length, 1, page);
  }
});

test("홈은 저자명과 칼럼 진입을 먼저 보여 주고, 글 → 맥락 → 소개 순서로 이어진다", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile("index.html", "utf8");
  assert.match(html, /<title>마케터 허보람\(브루스 허\) \| 브랜드 맥락·IMC 전략<\/title>/);
  assert.match(html, /마케터 허보람\(브루스\) · Brand Communication &amp; IMC/);
  assert.match(html, /<em>맥락<\/em>으로 기억합니다/);
  assert.match(html, /<a href="\/writing\/" class="btn btn--primary">최신 칼럼 읽기 →<\/a>/);
  assert.match(html, /<a href="\/context\/" class="btn btn--ghost">/);
  const order = ["id=\"hero\"", "id=\"writing\"", "id=\"context\"", "id=\"about\"", "id=\"explore\"", "id=\"content\"", "id=\"contact\""].map((id) => html.indexOf(id));
  assert.ok(order.every((pos, i) => pos > 0 && (i === 0 || pos > order[i - 1])), `섹션 순서 ${order}`);
  assert.match(html, /"alternateName": \["브루스", "브루스 허", "마케터 브루스", "Bruce Heo"\]/);
  assert.match(html, /<!-- WRITING_PICKS_START -->\s*<a class="post" href="\/writing\/\d+\/">/);
  assert.match(html, /href="\/campaign-workbook\.html"/, "히어로에서 뺀 워크북 링크는 홈 안에 남는다");
  assert.doesNotMatch(html, /href="#"/);
  const context = await readFile("context/index.html", "utf8");
  assert.match(context, /<h1>마케팅에서 맥락은<br>왜 중요한가<\/h1>/);
  assert.match(context, /<link rel="canonical" href="https:\/\/bruceheo\.com\/context\/">/);
  assert.match(context, /맥락만으로 모든 것을 설명할 수는 없다/);
  assert.match(await readFile("sitemap.xml", "utf8"), /<loc>https:\/\/bruceheo\.com\/context\/<\/loc>/);
});
