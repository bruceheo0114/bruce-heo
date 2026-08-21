import assert from "node:assert/strict";
import test from "node:test";
import { instagramCardUrls } from "../src/publish/instagram.js";
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

test("Instagram 캐러셀은 공개 JPEG 경로를 순서대로 만든다", () => {
  const manifest = {
    article: { id: "212" },
    cards: Array.from({ length: 7 }, (_, index) => ({
      file: `cards/${String(index + 1).padStart(2, "0")}.jpg`,
    })),
  };
  const urls = instagramCardUrls(manifest, "https://example.com/site/");
  assert.equal(urls.length, 7);
  assert.equal(urls[0], "https://example.com/site/content/212/cards/01.jpg");
  assert.equal(urls[6], "https://example.com/site/content/212/cards/07.jpg");
});
