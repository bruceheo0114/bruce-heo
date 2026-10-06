import assert from "node:assert/strict";
import test from "node:test";
import {
  publishLinkedIn,
  linkedInCommentPayload,
  linkedInPostPayload,
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
