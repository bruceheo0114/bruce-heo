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
  assert.equal(newsWorthy("AI"), false);
  assert.equal(newsWorthy("MLB"), true);
});

test("heat 는 기사 수와 검색량 상승을 함께 본다", () => {
  assert.equal(heatOf({ news7: 0, rise: 1 }), 0);
  assert.equal(heatOf({ news7: 9, rise: 1 }), 3);
  assert.equal(heatOf({ news7: 0, rise: null }), 10); // 새로 뜬 말
  assert.equal(heatOf({ news7: 90, rise: 0.5 }), 10); // 기사 수는 30에서 자른다
});

test("릴스 시의성 수집은 월~토 21:13 릴스 루틴 전에 Secrets 로 돌고 시계도 시작한다", async () => {
  const workflow = parse(await readFile(".github/workflows/naver-reels.yml", "utf8"));
  assert.deepEqual(workflow.on.schedule, [{ cron: "7 11 * * 1-6" }]);
  assert.match(workflow.jobs.collect.env.NAVER_CLIENT_ID, /secrets\.NAVER_CLIENT_ID/);
  assert.match(JSON.stringify(workflow.jobs.collect.steps), /node src\/cli\/naver-reels\.js/);
  const clock = await readFile("scripts/publish_clock.py", "utf8");
  assert.match(clock, /\(20, 7, \{0, 1, 2, 3, 4, 5\}, "naver-reels\.yml", False\)/);
});

test("youtube targets: only todo items with yt_slot within the next 7 days, in slot order", async () => {
  const { youtubeTargets } = await import("../src/naver/youtube.js");
  const queue = {
    items: [
      { no: 212, title: "B", status: "todo", yt_slot: "2026-11-02" },
      { no: 211, title: "A", status: "todo", yt_slot: "2026-10-26", series: "브랜드 케이스" },
      { no: 219, title: "C", status: "todo", yt_slot: "2026-10-28", extra_sources: [193] },
      { no: 208, title: "D", status: "episode", yt_slot: "2026-10-27" },
      { no: 215, title: "E", status: "reserve" },
    ],
  };
  const targets = youtubeTargets(queue, { now: new Date("2026-10-24T11:00:00Z") });
  assert.deepEqual(targets.map((t) => t.no), [211, 219]);
  assert.deepEqual(targets[1].extra_sources, [193]);
  assert.equal(targets[0].series, "브랜드 케이스");
});

test("youtube hooks: title keyword, searched-with phrase, rising names and a fresh article", async () => {
  const { pickHooks, titleVariants, parseBrunchMarkdown } = await import("../src/naver/youtube.js");
  assert.deepEqual(titleVariants("버거킹"), ["버거킹", "버거킹 광고", "버거킹 마케팅", "버거킹 브랜딩", "버거킹 캠페인"]);
  const terms = [
    { term: "기사식당", avg: 12, rise: 1.0 },
    { term: "버거킹", avg: 80, rise: 1.5, news: [{ title: "버거킹 새 광고", date: "2026-10-20", link: "x" }] },
    { term: "와퍼", avg: 30, rise: null },
  ];
  const variants = [
    { phrase: "버거킹", avg: 90 },
    { phrase: "버거킹 광고", avg: 7 },
    { phrase: "버거킹 마케팅", avg: 3 },
  ];
  const hooks = pickHooks(terms, variants, { until: new Date("2026-10-24T11:00:00Z") });
  assert.equal(hooks.title_keyword, "버거킹");
  assert.equal(hooks.title_phrase, "버거킹");
  assert.deepEqual(hooks.rising, ["버거킹", "와퍼"]);
  assert.equal(hooks.fresh_hook.term, "버거킹");
  const old = pickHooks(terms, variants, { until: new Date("2026-11-20T11:00:00Z") });
  assert.equal(old.fresh_hook, null);
  const parsed = parseBrunchMarkdown('---\ntitle: "버거킹은 왜"\n---\n# 버거킹은 왜\n본문');
  assert.equal(parsed.title, "버거킹은 왜");
  assert.match(parsed.body, /본문/);
  const workflow = parse(await readFile(".github/workflows/naver-youtube.yml", "utf8"));
  assert.deepEqual(workflow.on.schedule, [{ cron: "9 11 * * 1,3,6" }]);
  assert.match(JSON.stringify(workflow.jobs.collect.steps), /node src\/cli\/naver-youtube\.js/);
  const clock = await readFile("scripts/publish_clock.py", "utf8");
  assert.match(clock, /\(20, 9, \{0, 2, 5\}, "naver-youtube\.yml", False\)/);
});
