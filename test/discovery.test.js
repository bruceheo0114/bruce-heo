import assert from "node:assert/strict";
import test from "node:test";
import { applyDiscovery } from "../src/lib/discovery.js";
import { createInitialState } from "../src/lib/state.js";

function article(id, publishedAt) {
  return {
    id: String(id),
    canonicalUrl: `https://brunch.co.kr/@heoboram/${id}`,
    title: `글 ${id}`,
    publishedAt,
    bodyHash: `hash-${id}`,
  };
}

test("최초 실행은 기존 글을 SNS 소급 게시하지 않는다", () => {
  const state = createInitialState();
  const result = applyDiscovery(
    state,
    [article(2, "2026-08-20T00:00:00Z"), article(1, "2026-08-10T00:00:00Z")],
    new Date("2026-08-21T09:00:00Z"),
    "batch",
  );
  assert.equal(result.bootstrap, true);
  assert.deepEqual(result.newArticles, []);
  assert.equal(state.articles["2"].package.status, "skipped_backfill");
});

test("새 글 여러 편은 승인 전 게시 시간이 비어 있다", () => {
  const state = createInitialState();
  state.initialized = true;
  state.articles["1"] = { ...article(1, "2026-08-10T00:00:00Z") };
  const result = applyDiscovery(
    state,
    [
      article(3, "2026-08-21T01:00:00Z"),
      article(2, "2026-08-20T01:00:00Z"),
      article(1, "2026-08-10T00:00:00Z"),
    ],
    new Date("2026-08-21T09:00:00Z"),
    "batch-2",
  );
  assert.deepEqual(result.newArticles.map((item) => item.id), ["2", "3"]);
  assert.equal(state.articles["2"].approvedAt, null);
  assert.equal(state.articles["2"].scheduledAt, null);
  assert.equal(state.articles["3"].scheduledAt, null);
  assert.equal(state.articles["2"].batchId, "batch-2");
  assert.equal(state.articles["2"].package.status, "awaiting_review");
  assert.equal(state.articles["2"].linkedin.status, "manual_pending");
  assert.equal(state.articles["2"].instagram.status, "manual_pending");
});

test("새 글이 없으면 새 게시 패키지를 만들지 않는다", () => {
  const state = createInitialState();
  state.initialized = true;
  state.articles["1"] = { ...article(1, "2026-08-10T00:00:00Z") };
  const result = applyDiscovery(
    state,
    [article(1, "2026-08-10T00:00:00Z")],
    new Date("2026-08-21T09:00:00Z"),
    "batch-3",
  );
  assert.equal(result.newArticles.length, 0);
  assert.equal(Object.keys(state.articles).length, 1);
});

