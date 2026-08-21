import assert from "node:assert/strict";
import test from "node:test";
import {
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
