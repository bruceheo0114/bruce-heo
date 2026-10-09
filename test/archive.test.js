import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseArchiveArticle, renderArchiveIndex, renderArticlePage, renderSitemap } from "../src/lib/archive.js";

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
  assert.match(index, /글 2편/);
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
