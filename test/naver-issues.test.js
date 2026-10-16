import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import {
  clusterArticles,
  cleanText,
  excludedBy,
  keywordOf,
  normalizeNews,
  parseNaverDate,
  scoreCandidate,
  signalsOf,
  toCandidate,
  trendRise,
  upcomingMonday,
} from "../src/naver/issues.js";
import { naverClient } from "../src/naver/openapi.js";

const until = new Date("2026-10-18T09:00:00Z"); // 일 18:00 KST
const since = new Date("2026-10-04T09:00:00Z");

test("일요일 저녁에는 다음 날 월요일, 월요일에는 그날을 대상으로 잡는다", () => {
  assert.equal(upcomingMonday(until), "2026-10-19");
  assert.equal(upcomingMonday(new Date("2026-10-18T22:00:00Z")), "2026-10-19"); // 월 07:00 KST
  assert.equal(upcomingMonday(new Date("2026-10-14T03:00:00Z")), "2026-10-19"); // 수
});

test("검색 결과의 태그·엔티티를 걷어 내고 날짜를 읽는다", () => {
  assert.equal(cleanText("<b>빼빼로</b> &quot;팝업&quot; &amp; 굿즈"), '빼빼로 "팝업" & 굿즈');
  assert.equal(parseNaverDate("Mon, 12 Oct 2026 10:00:00 +0900").toISOString(), "2026-10-12T01:00:00.000Z");
  assert.equal(parseNaverDate("20261012").toISOString(), "2026-10-11T15:00:00.000Z");
  assert.equal(parseNaverDate("nope"), null);
});

test("제목에서 검색어로 쓸 이름을 뽑는다", () => {
  assert.equal(keywordOf("롯데웰푸드, '빼빼로 크런치' 팝업 방문객 3만 명"), "빼빼로 크런치");
  assert.equal(keywordOf("무신사, 성수 팝업에 오픈런"), "무신사");
  assert.equal(keywordOf("[단독] 요즘 편의점에서 가장 많이 팔린 디저트는"), "");
});

test("숫자·반응 신호와 제외할 주제를 찾는다", () => {
  assert.deepEqual(signalsOf("출시 3일 만에 완판, 누적 12만 개 판매"), ["완판", "12만 개"]);
  assert.deepEqual(excludedBy("사고 싶은 굿즈, 인사이트 리포트"), []);
  assert.deepEqual(excludedBy("가맹점과 소송 이어져"), ["소송"]);
});

test("기간 밖·중복 기사를 빼고 같은 이야기를 한 묶음으로 만든다", () => {
  const raw = [
    { title: "농심, '먹태깡' 재출시 첫날 완판", description: "10만 봉 완판", originallink: "https://a.example.com/1", link: "https://n.news.naver.com/1", pubDate: "Thu, 15 Oct 2026 09:00:00 +0900", field: "식음료", query: "q" },
    { title: "'먹태깡' 돌아오자 편의점 품절", description: "", originallink: "https://b.example.com/2", link: "https://n.news.naver.com/2", pubDate: "Fri, 16 Oct 2026 09:00:00 +0900", field: "식음료", query: "q" },
    { title: "농심, '먹태깡' 재출시 첫날 완판", description: "", originallink: "https://a.example.com/1", link: "https://n.news.naver.com/1", pubDate: "Thu, 15 Oct 2026 09:00:00 +0900", field: "식음료", query: "q2" },
    { title: "오래된 기사", description: "", originallink: "https://c.example.com/3", link: "", pubDate: "Thu, 01 Oct 2026 09:00:00 +0900", field: "식음료", query: "q" },
  ];
  const articles = normalizeNews(raw, { since, until });
  assert.equal(articles.length, 2);
  const clusters = clusterArticles(articles);
  assert.equal(clusters.length, 1);
  const candidate = toCandidate(clusters[0], { until });
  assert.equal(candidate.keyword, "먹태깡");
  assert.equal(candidate.published, "2026-10-16");
  assert.equal(candidate.within7, true);
  assert.deepEqual(candidate.outlets, ["b.example.com", "a.example.com"]);
  assert.ok(candidate.signals.includes("완판"));
  assert.ok(scoreCandidate(candidate) > scoreCandidate({ ...candidate, outlets: ["a.example.com"] }));
});

test("데이터랩 수치로 최근 7일 검색량 변화를 구한다", () => {
  const data = [
    { period: "2026-10-05", ratio: 10 },
    { period: "2026-10-11", ratio: 10 },
    { period: "2026-10-12", ratio: 30 },
    { period: "2026-10-18", ratio: 30 },
  ];
  assert.equal(trendRise(data, { until }), 3);
  assert.equal(trendRise([{ period: "2026-10-15", ratio: 5 }], { until }), null);
  assert.equal(trendRise([], { until }), 0);
});

test("키가 없으면 Secret 이름을 알려 주고, 호출 수를 센다", async () => {
  assert.throws(() => naverClient({ clientId: "", clientSecret: "" }), /NAVER_CLIENT_ID/);
  const requests = [];
  const client = naverClient({
    clientId: "id",
    clientSecret: "secret",
    pause: async () => {},
    request: async (service, url, options) => {
      requests.push({ url, options });
      return { body: url.includes("datalab") ? { results: [{ title: "a", data: [] }] } : { items: [{ title: "x" }] } };
    },
  });
  assert.deepEqual(await client.search("news", "팝업 오픈"), [{ title: "x" }]);
  assert.equal((await client.trend({ startDate: "2026-10-05", endDate: "2026-10-18", keywordGroups: [] })).length, 1);
  assert.equal(client.calls, 2);
  assert.match(requests[0].url, /\/v1\/search\/news\.json\?query=%ED%8C%9D%EC%97%85/);
  assert.equal(requests[0].options.headers["X-Naver-Client-Id"], "id");
  assert.equal(requests[1].options.method, "POST");
});

test("후보 수집은 일요일 카드 루틴(19:43 KST) 전에 Secrets 로 돈다", async () => {
  const text = await readFile(".github/workflows/naver-issues.yml", "utf8");
  const workflow = parse(text);
  assert.equal(workflow.on.schedule[0].cron, "7 9 * * 0");
  assert.equal(workflow.jobs.collect.env.NAVER_CLIENT_ID, "${{ secrets.NAVER_CLIENT_ID }}");
  assert.doesNotMatch(text, /ncloud|apigw/);
});
