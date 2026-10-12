import assert from "node:assert/strict";
import test from "node:test";
import {
  publishLinkedIn,
  linkedInCommentPayload,
  linkedInBodyWithLink,
  linkedInPostPayload,
  toLittleText,
  fullTextUrl,
} from "../src/publish/linkedin.js";

test("LinkedIn은 텍스트 본문과 별도 첫 댓글 payload를 만든다", () => {
  const previous = process.env.LINKEDIN_PERSON_URN;
  process.env.LINKEDIN_PERSON_URN = "urn:li:person:test";
  try {
    const post = linkedInPostPayload("본문");
    assert.equal(post.commentary, "본문");
    assert.equal(post.content, undefined);
    const comment = linkedInCommentPayload("urn:li:share:123", "원문 링크");
    assert.equal(comment.object, "urn:li:share:123");
    assert.equal(comment.message.text, "원문 링크");
  } finally {
    if (previous === undefined) delete process.env.LINKEDIN_PERSON_URN;
    else process.env.LINKEDIN_PERSON_URN = previous;
  }
});

test("첫 댓글 권한이 없으면 본문 게시만으로 완료 처리한다", async () => {
  const saved = { ...process.env };
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    LINKEDIN_ACCESS_TOKEN: "t",
    LINKEDIN_API_VERSION: "202605",
  });
  delete process.env.LINKEDIN_PERSON_URN;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/v2/userinfo")) {
      return new Response(JSON.stringify({ sub: "abc" }), { status: 200 });
    }
    if (String(url).endsWith("/rest/posts")) {
      return new Response("", { status: 201, headers: { "x-restli-id": "urn:li:share:1" } });
    }
    return new Response("forbidden", { status: 403 });
  };
  try {
    const result = await publishLinkedIn({ linkedin: { body: "본문", firstComment: "링크" } });
    assert.equal(result.status, "published");
    assert.equal(result.postId, "urn:li:share:1");
    assert.equal(result.commentId, null);
    assert.equal(process.env.LINKEDIN_PERSON_URN, "urn:li:person:abc");
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("LinkedIn commentary 예약 문자를 이스케이프하고 해시태그는 템플릿으로 바꾼다", () => {
  assert.equal(toLittleText("LGE닷컴(LGE.com) [x] @me"), "LGE닷컴\\(LGE.com\\) \\[x\\] \\@me");
  assert.equal(toLittleText("끝 #브랜딩 #LG전자"), "끝 {hashtag|\\#|브랜딩} {hashtag|\\#|LG전자}");
});

test("원문 링크를 해시태그 앞에 넣고, 이미 있으면 그대로 둔다", () => {
  const url = "https://brunch.co.kr/@heoboram/224";
  assert.equal(
    linkedInBodyWithLink("본문\n\n#a #b", url),
    `본문\n\n전문은 아래 링크에서 읽으실 수 있습니다.\n${url}\n\n#a #b`,
  );
  assert.equal(linkedInBodyWithLink(`본문 ${url}`, url), `본문 ${url}`);
});

test("전문 링크는 홈페이지에 백업된 글이면 bruceheo.com, 아니면 브런치", () => {
  assert.equal(fullTextUrl({ id: "224", canonicalUrl: "https://brunch.co.kr/@heoboram/224" }), "https://bruceheo.com/writing/224/");
  assert.equal(fullTextUrl({ id: "999999", canonicalUrl: "https://brunch.co.kr/@heoboram/999999" }), "https://brunch.co.kr/@heoboram/999999");
});
