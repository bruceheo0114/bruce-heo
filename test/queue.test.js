import assert from "node:assert/strict";
import test from "node:test";
import { approvePackages } from "../src/lib/approval.js";
import { selectDueArticle } from "../src/lib/queue.js";
import { modeForReviewCount } from "../src/lib/state.js";
import { nextKstApprovalSlot } from "../src/lib/time.js";

function queued(id, scheduledAt, linkedin = "pending") {
  return {
    id,
    publishedAt: `2026-08-${id === "old" ? "20" : "21"}T00:00:00.000Z`,
    scheduledAt,
    package: { status: "generated" },
    linkedin: { status: linkedin },
    instagram: { status: "manual_source_ready" },
  };
}

test("승인 다음 날부터 하루 간격 06:30 KST 슬롯을 받는다", () => {
  const friday = new Date("2026-08-21T09:00:00.000Z");
  assert.equal(nextKstApprovalSlot(friday, 0), "2026-08-21T21:30:00.000Z");
  assert.equal(nextKstApprovalSlot(friday, 1), "2026-08-22T21:30:00.000Z");
});

test("승인된 여러 글은 오래된 순으로 예약되고 기존 슬롯을 피한다", () => {
  const state = {
    articles: {
      occupied: queued("old", "2026-08-21T21:30:00.000Z"),
      first: {
        ...queued("old", null),
        id: "first",
        publishedAt: "2026-08-19T00:00:00.000Z",
        package: { status: "awaiting_review" },
        instagram: { status: "manual_pending" },
      },
      second: {
        ...queued("newer", null),
        id: "second",
        publishedAt: "2026-08-20T00:00:00.000Z",
        package: { status: "awaiting_review" },
        instagram: { status: "manual_pending" },
      },
    },
  };
  const approved = approvePackages(
    state,
    [
      { id: "second", generatedAt: "2026-08-21T08:00:00.000Z" },
      { id: "first", generatedAt: "2026-08-21T08:00:00.000Z" },
    ],
    new Date("2026-08-21T10:00:00.000Z"),
  );

  assert.deepEqual(
    approved.map((item) => item.id),
    ["first", "second"],
  );
  assert.equal(state.articles.first.scheduledAt, "2026-08-22T21:30:00.000Z");
  assert.equal(state.articles.second.scheduledAt, "2026-08-23T21:30:00.000Z");
  assert.equal(state.articles.first.package.status, "generated");
  assert.equal(state.articles.first.instagram.status, "manual_source_ready");
});

test("게시 실행은 오래된 미완료 글 한 편만 고른다", () => {
  const articles = {
    newer: queued("newer", "2026-08-22T09:30:00.000Z"),
    old: queued("old", "2026-08-21T09:30:00.000Z"),
  };
  const selected = selectDueArticle(articles, new Date("2026-08-23T09:30:00Z"));
  assert.equal(selected.id, "old");
  assert.equal(selectDueArticle({}, new Date()), null);
});

test("Instagram 수동 업로드 상태는 LinkedIn 대기열 선택에 영향을 주지 않는다", () => {
  const done = queued("old", "2026-08-21T09:30:00.000Z", "published");
  done.instagram.status = "manual_pending";
  assert.equal(
    selectDueArticle({ old: done }, new Date("2026-08-23T09:30:00Z")),
    null,
  );
});

test("PR 병합 전 콘텐츠는 게시 대상이 아니며 네 번째부터 자동 모드다", () => {
  const waiting = queued("old", "2026-08-21T09:30:00.000Z");
  waiting.package.status = "awaiting_review";
  assert.equal(
    selectDueArticle({ old: waiting }, new Date("2026-08-23T09:30:00Z")),
    null,
  );
  assert.equal(modeForReviewCount(2), "review");
  assert.equal(modeForReviewCount(3), "auto");
});
