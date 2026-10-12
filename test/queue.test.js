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

test("승인 뒤 첫 화요일 07:30 KST 슬롯을 받고, 다음 글은 한 주씩 밀린다", () => {
  const friday = new Date("2026-08-21T09:00:00.000Z");
  assert.equal(nextKstApprovalSlot(friday, 0), "2026-08-24T22:30:00.000Z");
  assert.equal(nextKstApprovalSlot(friday, 1), "2026-08-31T22:30:00.000Z");
  // 월요일 브런치 → 화요일 아침 피드
  assert.equal(nextKstApprovalSlot(new Date("2026-10-12T05:00:00.000Z")), "2026-10-12T22:30:00.000Z");
  // 화요일 07:30 이전 승인은 당일, 이후 승인은 다음 주 화요일
  assert.equal(nextKstApprovalSlot(new Date("2026-10-12T21:00:00.000Z")), "2026-10-12T22:30:00.000Z");
  assert.equal(nextKstApprovalSlot(new Date("2026-10-12T22:30:00.000Z")), "2026-10-19T22:30:00.000Z");
});

test("승인된 여러 글은 오래된 순으로 예약되고 기존 슬롯을 피한다", () => {
  const state = {
    articles: {
      occupied: queued("old", "2026-08-24T22:30:00.000Z"),
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
  assert.equal(state.articles.first.scheduledAt, "2026-08-31T22:30:00.000Z");
  assert.equal(state.articles.second.scheduledAt, "2026-09-07T22:30:00.000Z");
  assert.equal(state.articles.first.package.status, "generated");
  assert.equal(state.articles.first.instagram.status, "manual_source_ready");
});

test("LinkedIn 게시를 건너뛰는 글(카드 전용 등)은 화요일 슬롯을 차지하지 않는다", () => {
  const state = {
    articles: {
      cardOnly: queued("old", "2026-08-24T22:30:00.000Z", "skipped_card_only"),
      fresh: {
        ...queued("newer", null),
        id: "fresh",
        package: { status: "awaiting_review" },
        instagram: { status: "manual_pending" },
      },
    },
  };
  approvePackages(state, [{ id: "fresh" }], new Date("2026-08-21T10:00:00.000Z"));
  assert.equal(state.articles.fresh.scheduledAt, "2026-08-24T22:30:00.000Z");
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

test("카드뉴스만 만드는 글(skipped_*)은 LinkedIn 게시 대상이 아니다", () => {
  const article = {
    id: "214",
    publishedAt: "2026-09-01T00:00:00Z",
    scheduledAt: "2026-10-01T00:00:00Z",
    package: { status: "generated" },
    linkedin: { status: "skipped_card_only" },
  };
  assert.equal(selectDueArticle({ 214: article }, new Date("2026-10-06T00:00:00Z")), null);
});
