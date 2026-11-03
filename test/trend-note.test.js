import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import { contentHash, kstNowStamp, planReservation, reserveTimeOf, stibeeClient, subjectOf } from "../src/lib/stibee.js";
import { interestSummary, parseKeywords, upcomingWednesday } from "../src/naver/trendnote.js";

test("스티비 제목과 예약 시각은 발행일 08:00 KST", () => {
  assert.equal(subjectOf({ issue: 2, title: "질문형 제목" }), "[트렌드 노트 #2] 질문형 제목");
  assert.equal(reserveTimeOf("2026-11-11"), "20261111080000");
  assert.throws(() => reserveTimeOf("11/11"));
  assert.equal(kstNowStamp(new Date("2026-11-10T10:52:00Z")), "20261110195200");
});

test("예약 계획: 새로 만들기 · 그대로 · 고치기 · 늦음", () => {
  const base = { reserveTime: "20261111080000", now: "20261110200000" };
  const hash = contentHash("s", "<table></table>");
  assert.equal(planReservation({ ...base, stibee: undefined, hash }), "create");
  assert.equal(planReservation({ ...base, stibee: { emailId: 1, status: "reserved", contentHash: hash, reserveTime: base.reserveTime }, hash }), "skip");
  assert.equal(planReservation({ ...base, stibee: { emailId: 1, status: "reserved", contentHash: "old", reserveTime: base.reserveTime }, hash }), "update");
  assert.equal(planReservation({ ...base, stibee: { emailId: 1, status: "cancelled", contentHash: hash, reserveTime: base.reserveTime }, hash }), "update");
  assert.equal(planReservation({ ...base, stibee: { emailId: 1, status: "failed" }, hash }), "update");
  assert.equal(planReservation({ ...base, stibee: { status: "failed" }, hash }), "create");
  assert.equal(planReservation({ ...base, now: "20261111090000", stibee: undefined, hash }), "late");
  assert.equal(planReservation({ ...base, now: "20261111090000", stibee: { emailId: 1, status: "reserved" }, hash }), "skip");
  assert.equal(planReservation({ ...base, stibee: { emailId: 1, status: "sent" }, hash }), "skip");
});

test("스티비 클라이언트는 AccessToken 헤더와 text/html 본문을 쓴다", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, ...options });
    return { ok: true, text: async () => (url.endsWith("/emails") ? '{"id":77}' : "ok") };
  };
  const client = stibeeClient({ token: " key ", request });
  assert.deepEqual(await client.createEmail({ subject: "s", listId: 1, senderEmail: "a@b.c", senderName: "n" }), { id: 77 });
  await client.setContent(77, "<table></table>");
  await client.reserve(77, "20261111080000");
  assert.equal(calls[0].headers.AccessToken, "key");
  assert.equal(calls[1].url, "https://api.stibee.com/v2/emails/77/content");
  assert.match(calls[1].headers["Content-Type"], /text\/html/);
  assert.equal(calls[2].url, "https://api.stibee.com/v2/emails/77/reserve?reserveTime=20261111080000");
});

test("네이버 신호: 수요일 날짜, 키워드 정리, 관심도 요약", () => {
  assert.equal(upcomingWednesday(new Date("2026-11-10T10:00:00Z")), "2026-11-11");
  assert.equal(upcomingWednesday(new Date("2026-11-11T01:00:00Z")), "2026-11-11");
  assert.deepEqual(parseKeywords(" 이케아, 풀무원,이케아,\n영점소비 "), ["이케아", "풀무원", "영점소비"]);
  const data = [];
  for (let day = 1; day <= 28; day += 1) data.push({ period: `2026-10-${String(day).padStart(2, "0")}`, ratio: day > 21 ? 40 : 10 });
  const summary = interestSummary(data, { until: new Date("2026-10-28T12:00:00Z") });
  assert.equal(summary.recent7, 40);
  assert.equal(summary.rise, 4);
});

test("트렌드 노트 워크플로는 유효하고 키가 없으면 건너뛴다", async () => {
  for (const file of [".github/workflows/trend-note-stibee.yml", ".github/workflows/trend-note-naver.yml"]) {
    const workflow = parse(await readFile(file, "utf8"));
    assert.ok(workflow.name && workflow.jobs && workflow.on.workflow_dispatch);
  }
  const cli = await readFile("src/cli/stibee-trend-note.js", "utf8");
  assert.match(cli, /STIBEE_API_KEY Secret 이 없어/);
});
