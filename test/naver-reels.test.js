import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import { heatOf, newsWorthy, nextKstDate, recentNews, reelSources } from "../src/naver/reels.js";

test("저녁에 돌면 다음 날(KST) 릴스를 대상으로 잡는다", () => {
  assert.equal(nextKstDate(new Date("2026-10-18T11:07:00Z")), "2026-10-19"); // 일 20:07 KST
  assert.equal(nextKstDate(new Date("2026-10-18T15:30:00Z")), "2026-10-20"); // 월 00:30 KST
});

test("릴스 소재는 큐에 없는 최근 새 글 + 각도가 남은 todo 글이다", () => {
  const queue = {
    items: [
      { no: 224, title: "르게다꼼", status: "todo", angles: [{ date: "2026-10-17" }] },
      { no: 218, title: "IMC", status: "todo", exhausted: true },
      { no: 207, title: "무신사", status: "hold" },
      { no: null, title: "미리 만든 글", status: "todo" },
    ],
  };
  const cache = [
    { no: 226, date: "2026-10-16", title: "영화 제작" },
    { no: 224, date: "2026-10-12", title: "르게다꼼" },
    { no: 222, date: "2026-10-06", title: "AI 시대" },
  ];
  const sources = reelSources(queue, cache, { now: new Date("2026-10-18T11:00:00Z") });
  assert.deepEqual(sources, [
    { no: 226, title: "영화 제작", fresh: true },
    { no: 224, title: "르게다꼼", used: 1 },
  ]);
});

test("최근 7일 뉴스 중 제목에 그 이름이 들어간 기사만 세고 논란 기사는 뺀다", () => {
  const raw = [
    { title: "<b>르게다꼼</b> 챌린지 7천 건", description: "LG전자 캠페인", pubDate: "Fri, 16 Oct 2026 09:00:00 +0900", link: "a" },
    { title: "르게다꼼 논란", description: "", pubDate: "Fri, 16 Oct 2026 10:00:00 +0900", link: "b" },
    { title: "다른 기사", description: "르게다꼼 언급만", pubDate: "Fri, 16 Oct 2026 11:00:00 +0900", link: "c" },
    { title: "르게다꼼 시작", description: "", pubDate: "Mon, 05 Oct 2026 09:00:00 +0900", link: "d" },
    { title: "<b>르게다꼼</b> 챌린지 7천 건", description: "중복", pubDate: "Fri, 16 Oct 2026 09:30:00 +0900", link: "a" },
  ];
  const news = recentNews(raw, "르게다꼼", { until: new Date("2026-10-18T11:00:00Z") });
  assert.equal(news.count, 1);
  assert.equal(news.top[0].title, "르게다꼼 챌린지 7천 건");
  assert.equal(news.top[0].date, "2026-10-16");
});

test("두 글자 한글 일반 명사는 뉴스를 찾지 않는다", () => {
  assert.equal(newsWorthy("기억"), false);
  assert.equal(newsWorthy("르게다꼼"), true);
  assert.equal(newsWorthy("MLB"), true);
});

test("heat 는 기사 수와 검색량 상승을 함께 본다", () => {
  assert.equal(heatOf({ news7: 0, rise: 1 }), 0);
  assert.equal(heatOf({ news7: 9, rise: 1 }), 3);
  assert.equal(heatOf({ news7: 0, rise: null }), 10); // 새로 뜬 말
  assert.equal(heatOf({ news7: 90, rise: 0.5 }), 10); // 기사 수는 30에서 자른다
});

test("릴스 시의성 수집은 매일 21:13 릴스 루틴 전에 Secrets 로 돌고 시계도 시작한다", async () => {
  const workflow = parse(await readFile(".github/workflows/naver-reels.yml", "utf8"));
  assert.deepEqual(workflow.on.schedule, [{ cron: "7 11 * * *" }]);
  assert.match(workflow.jobs.collect.env.NAVER_CLIENT_ID, /secrets\.NAVER_CLIENT_ID/);
  assert.match(JSON.stringify(workflow.jobs.collect.steps), /node src\/cli\/naver-reels\.js/);
  const clock = await readFile("scripts/publish_clock.py", "utf8");
  assert.match(clock, /\(20, 7, None, "naver-reels\.yml", False\)/);
});
