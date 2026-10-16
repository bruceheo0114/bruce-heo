import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseArchiveArticle, renderArchiveIndex, renderArticlePage, renderSitemap, suggestCategory } from "../src/lib/archive.js";

const html = await readFile(new URL("./fixtures/archive-article.html", import.meta.url), "utf8");

test("브런치 본문을 문단·이미지·영상 블록으로 백업한다", () => {
  const article = parseArchiveArticle(html, "108");
  assert.equal(article.title, "브랜드는 왜 <반복>할까");
  assert.equal(article.subtitle, "콘텐츠의 기본은 서사");
  assert.equal(article.publishedAt, "2024-04-04T15:10:29.000Z");
  assert.deepEqual(article.blocks.map((block) => block.type), ["text", "text", "image", "video", "text"]);
  assert.equal(article.blocks[0].html, "첫 문단 &amp; 시작");
  assert.equal(article.blocks[1].html, "<strong>1. 굵은 소제목 </strong>");
  assert.equal(article.blocks[2].caption, "사진= 중앙일보");
  assert.deepEqual(article.blocks[2].images[0], {
    src: "https://img1.kakaocdn.net/thumb/R1280x0.fjpg/?fname=http://t1.daumcdn.net/brunch/service/user/2fCF/image/a.jpg",
    width: 1280,
    height: 741,
  });
  assert.equal(article.blocks[3].youtubeId, "IytRLTKXwds");
  assert.doesNotMatch(article.blocks[4].html, /javascript:|<script/);
  assert.match(article.blocks[4].html, /<a href="https:\/\/example\.com\/a" target="_blank" rel="noopener">좋은 링크<\/a>/);
});

test("백업 페이지와 목록을 안전한 HTML로 만든다", () => {
  const article = parseArchiveArticle(html, "108");
  const page = renderArticlePage(article, { newer: { id: "109", title: "다음 <글>" } });
  assert.match(page, /<h1>브랜드는 왜 &lt;반복&gt;할까<\/h1>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/bruceheo\.com\/writing\/108\/">/);
  assert.match(page, /"@type":"BlogPosting"/);
  assert.match(page, /"headline":"브랜드는 왜 \\u003c반복>할까"/);
  assert.match(page, /<figcaption>사진= 중앙일보<\/figcaption>/);
  assert.match(page, /youtube-nocookie\.com\/embed\/IytRLTKXwds/);
  assert.match(page, /href="\/writing\/109\/"><small>다음 글 →<\/small><span>다음 &lt;글&gt;<\/span>/);
  assert.match(page, /2024\. 4\. 5\./);

  const index = renderArchiveIndex([article, { ...article, id: "222", publishedAt: "2026-10-05T12:00:05.000Z", subtitle: "" }]);
  assert.ok(index.indexOf("/writing/222/") < index.indexOf("/writing/108/"));
  assert.match(index, /<h2 class="year">2026<\/h2>[\s\S]*<h2 class="year">2024<\/h2>/);
  assert.match(index, /지금 2편을 원문 그대로/);
});

test("본문을 찾지 못하면 구조 변경 오류를 낸다", () => {
  assert.throws(() => parseArchiveArticle("<html><head></head><body></body></html>", "1"), { code: "BRUNCH_STRUCTURE_CHANGED" });
});

test("sitemap 에 백업한 글 주소를 모두 넣는다", () => {
  const article = parseArchiveArticle(html, "108");
  const sitemap = renderSitemap([article]);
  assert.match(sitemap, /<loc>https:\/\/bruceheo\.com\/writing\/108\/<\/loc><lastmod>2024-04-05<\/lastmod>/);
  assert.match(sitemap, /<loc>https:\/\/bruceheo\.com\/<\/loc>/);
});

test("내려받은 이미지가 있으면 저장소 주소로 보여 준다", async () => {
  const { localImageName, imageSlots } = await import("../src/lib/archive.js");
  assert.equal(localImageName("https://img1.kakaocdn.net/thumb/R1280x0.fjpg/?fname=http://t1.daumcdn.net/brunch/service/user/2fCF/image/a.jpg"), "a.webp");
  assert.equal(localImageName("https://img1.kakaocdn.net/thumb/R1280x0.fpng/?fname=http%3A%2F%2Ft1.kakaocdn.net%2Fimage%2Fb"), "b.webp");

  const article = parseArchiveArticle(html, "108");
  for (const slot of imageSlots(article)) slot.set(`images/${localImageName(slot.url)}`);
  assert.equal(article.blocks[2].images[0].local, "images/a.webp");
  assert.equal(article.coverLocal, "images/cover.webp");
  const page = renderArticlePage(article);
  assert.match(page, /<img src="\/writing\/108\/images\/a\.webp"/);
  assert.match(page, /<img src="\/writing\/108\/images\/cover\.webp"/);
  assert.match(page, /og:image" content="https:\/\/bruceheo\.com\/writing\/108\/images\/cover\.webp"/);
  assert.doesNotMatch(page, /kakaocdn/);
});

test("공유 이미지는 JPG 로 쓰고 글 목록에 썸네일을 보여 준다", async () => {
  const article = parseArchiveArticle(html, "108");
  article.coverLocal = "images/cover.webp";
  article.shareImage = "og.jpg";
  const page = renderArticlePage(article);
  assert.match(page, /<meta property="og:image" content="https:\/\/bruceheo\.com\/writing\/108\/og\.jpg">/);
  assert.match(page, /<meta property="og:image:width" content="1200">/);
  assert.match(page, /<meta name="twitter:image" content="https:\/\/bruceheo\.com\/writing\/108\/og\.jpg">/);
  const index = renderArchiveIndex([article]);
  assert.match(index, /<div class="post__thumb"><img src="\/writing\/108\/images\/cover\.webp"/);
});

test("글 상세에 저자·맥락 읽기·함께 읽을 글을, 목록에 주제 필터를 붙인다", async () => {
  const { relatedArticles } = await import("../src/lib/archive.js");
  const base = parseArchiveArticle(html, "108");
  const make = (id, day) => ({ ...base, id, title: `글 ${id}`, publishedAt: `2026-01-${String(day).padStart(2, "0")}T00:00:00.000Z` });
  const all = [make("1", 1), make("2", 2), make("3", 3), make("4", 20), make("5", 5)];
  const meta = {
    categories: [{ key: "brand", label: "브랜드·캠페인" }, { key: "work", label: "AI·일하는 법" }],
    picks: ["4", "999"],
    posts: { 1: { category: "brand", insight: "맥락 <요약>" }, 2: { category: "work" }, 3: { category: "brand" }, 4: { category: "brand" } },
  };

  const related = relatedArticles(all[0], all, meta).map((a) => a.id);
  assert.deepEqual(related, ["3", "4", "2"], "같은 주제 먼저, 모자라면 가까운 글로 채운다");
  assert.ok(!related.includes("1"));

  const page = renderArticlePage(all[0], { all, meta });
  assert.match(page, /<a href="\/#about">허보람\(브루스\)<\/a>/);
  assert.match(page, /이 글을 맥락으로 읽으면<\/h2><p>맥락 &lt;요약&gt;<\/p>/);
  assert.match(page, /함께 읽으면 좋은 글/);
  assert.match(page, /href="\/writing\/3\/"/);
  assert.match(page, /<a href="\/context\/">맥락과 마케팅<\/a>/);
  assert.match(page, /"alternateName":\["브루스","브루스 허","마케터 브루스","Bruce Heo"\]/);
  assert.match(page, /<title>글 1 \| 마케터 허보람\(브루스\)<\/title>/);
  assert.doesNotMatch(renderArticlePage(all[1], { all, meta }), /이 글을 맥락으로 읽으면/, "요약이 없는 글은 칸을 만들지 않는다");

  const index = renderArchiveIndex(all, meta);
  assert.match(index, /<button type="button" data-filter="" aria-pressed="true">전체<\/button>/);
  assert.match(index, /data-filter="work" aria-pressed="false">AI·일하는 법</);
  assert.match(index, /href="\/writing\/5\/" data-category=""/, "분류 없는 글도 목록에 남는다");
  assert.equal((index.match(/class="post" href=/g) ?? []).length, 5);
  assert.match(index, /먼저 읽을 글[\s\S]*href="\/writing\/4\/"/);
  assert.doesNotMatch(index, /writing\/999/, "없는 글은 추천하지 않는다");
});

test("글 분류 데이터가 실제 백업 글과 일치한다", async () => {
  const { readdir } = await import("node:fs/promises");
  const meta = JSON.parse(await readFile(new URL("../data/writing-meta.json", import.meta.url), "utf8"));
  const ids = (await readdir(new URL("../data/archive/", import.meta.url))).map((f) => f.replace(".json", ""));
  const keys = new Set(meta.categories.map((c) => c.key));
  for (const [id, post] of Object.entries(meta.posts)) {
    assert.ok(ids.includes(id), `없는 글 ${id}`);
    assert.ok(keys.has(post.category), `알 수 없는 분류 ${id}`);
  }
  for (const id of [...meta.picks, ...meta.contextCases]) assert.ok(ids.includes(id), `없는 추천 글 ${id}`);
});

test("분류가 없는 글은 비슷한 글의 분류를 제안한다", () => {
  const post = (id, title, body) => ({ id, title, subtitle: "", blocks: [{ type: "text", tag: "p", html: body }] });
  const all = [
    post("1", "브랜드 캠페인 광고", "브랜드 캠페인 광고 모델"),
    post("2", "광고 캠페인 이야기", "캠페인 광고 브랜드 메시지"),
    post("3", "AI 업무 자동화", "AI 업무 자동화 도구"),
    post("4", "AI로 일하는 법", "AI 자동화 업무 방식"),
    post("5", "새 브랜드 광고 캠페인", "브랜드 광고 캠페인 영화"),
  ];
  const meta = { posts: { 1: { category: "brand" }, 2: { category: "brand" }, 3: { category: "work" }, 4: { category: "work" } } };
  assert.equal(suggestCategory(all[4], all, meta), "brand");
  assert.equal(suggestCategory(all[4], all, { posts: {} }), null, "분류된 글이 없으면 제안하지 않는다");
});
