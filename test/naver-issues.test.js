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
  kstDate,
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
    clientId: " id\n",
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
  });

test("API HUB 키 모양이면 API HUB 주소·헤더로 부른다", async () => {
  const requests = [];
  const client = naverClient({
    clientId: "abcde12345",
    clientSecret: "a".repeat(40),
    pause: async () => {},
    request: async (service, url, options) => {
      requests.push({ url, options });
      return { body: { items: [], results: [] } };
    },
  });
  await client.search("blog", "q");
  await client.trend({ startDate: "2026-10-05", endDate: "2026-10-18", keywordGroups: [] });
  assert.equal(client.provider, "API HUB");
  assert.match(requests[0].url, /^https:\/\/naverapihub\.apigw\.ntruss\.com\/search\/v1\/blog\?query=q/);
  assert.equal(requests[0].options.headers["X-NCP-APIGW-API-KEY-ID"], "abcde12345");
  assert.equal(requests[1].url, "https://naverapihub.apigw.ntruss.com/search-trend/v1/search");
});

test("첫 호출이 401 이면 다른 쪽으로 한 번 더 해 보고, 둘 다 안 되면 키 값 없이 길이로 알려 준다", async () => {
  const urls = [];
  const unauthorized = () => Object.assign(new Error("401"), { status: 401, body: '{"errorCode":"024"}' });
  const fallback = naverClient({
    clientId: "abcdefghij0123456789",
    clientSecret: "short12345",
    pause: async () => {},
    request: async (service, url) => {
      urls.push(url);
      if (url.startsWith("https://openapi.naver.com")) throw unauthorized();
      return { body: { items: [{ title: "ok" }] } };
    },
  });
  assert.deepEqual(await fallback.search("news", "q"), [{ title: "ok" }]);
  assert.equal(fallback.provider, "API HUB");
  await fallback.search("news", "q2");
  assert.equal(urls.length, 3); // 두 번째부터는 바로 API HUB

  const broken = naverClient({
    clientId: "abcdefghij0123456789",
    clientSecret: "secret-값",
    pause: async () => {},
    request: async () => {
      throw unauthorized();
    },
  });
  await assert.rejects(broken.search("news", "q"), (error) => {
    assert.match(error.message, /NAVER_CLIENT_ID 20자 · NAVER_CLIENT_SECRET 8자, 영문·숫자 아닌 글자 있음/);
    assert.doesNotMatch(error.message, /abcdefghij|secret-값/);
    return true;
  });
});

test("스레드 훅용 이름은 원문 제목·「」·영문 고유명사에서 뽑고 서술어는 뺀다", async () => {
  const { extractTerms, trendAverage } = await import("../src/naver/hooks.js");
  const body = "스위첸은 「위대한 집안일」로 화제였다. 스위첸 광고는 「위대한 집안일」 전에도 있었다. KCC건설 스위첸. Apple 과 Apple 비교.";
  const terms = extractTerms("스위첸은 왜 8년째 집 이야기를 할까", body);
  assert.equal(terms[0], "스위첸");
  assert.ok(terms.includes("위대한 집안일"));
  assert.ok(terms.includes("Apple"));
  assert.ok(!terms.some((term) => ["왜", "8년째", "할까", "이야기"].includes(term)));
  assert.equal(trendAverage([{ ratio: 10 }, { ratio: 20 }]), 15);
  assert.equal(trendAverage([]), 0);
});

test("검색량 변화는 기간 길이가 달라도 하루 평균끼리 비교한다", () => {
  const before = Array.from({ length: 23 }, (_, index) => ({ period: kstDate(Date.UTC(2026, 8, 19 + index)), ratio: 10 }));
  const recent = Array.from({ length: 7 }, (_, index) => ({ period: kstDate(Date.UTC(2026, 9, 12 + index)), ratio: 20 }));
  assert.equal(trendRise([...before, ...recent], { until }), 2);
});

test("언급 모음은 내 채널 글·기간 밖·맥락 없는 동명이인을 뺀다", async () => {
  const { BRAND_QUERIES, pickMentions, titleQueries } = await import("../src/naver/mentions.js");
  const since = new Date("2026-10-11T00:00:00Z");
  const person = BRAND_QUERIES.find((rule) => rule.query === "허보람 마케터");
  const items = [
    { title: "<b>허보람</b> 마케터의 브런치 글 정리", description: "IMC 이야기", link: "https://blog.naver.com/a/1", postdate: "20261014", bloggername: "읽는사람" },
    { title: "허보람 님 결혼식", description: "축하", link: "https://blog.naver.com/b/2", postdate: "20261014" },
    { title: "허보람 마케터 글", description: "", link: "https://brunch.co.kr/@heoboram/220", postdate: "20261014" },
    { title: "허보람 마케터 글", description: "", link: "https://blog.naver.com/c/3", postdate: "20261001" },
  ];
  const picked = pickMentions(items, { type: "blog", rule: person, since });
  assert.deepEqual(picked.map((mention) => mention.url), ["https://blog.naver.com/a/1"]);
  assert.equal(picked[0].by, "읽는사람");
  assert.equal(picked[0].date, "2026-10-14");

  const [rule] = titleQueries([{ id: "226", title: "국내 최고의 광고회사는 왜 영화 제작을 시작할까?" }]);
  assert.equal(rule.post, "226");
  assert.ok(rule.must.test("국내 최고의 광고회사는 영화를"));
  assert.ok(!rule.must.test("광고회사 영화 제작"));
});

test("훅 검색량은 금요일 스레드 원고 루틴(21:00 KST) 전에 돈다", async () => {
  const workflow = parse(await readFile(".github/workflows/naver-hooks.yml", "utf8"));
  assert.equal(workflow.on.schedule[0].cron, "7 11 * * 5");
  const issues = parse(await readFile(".github/workflows/naver-issues.yml", "utf8"));
  const mentions = issues.jobs.collect.steps.find((step) => step.run === "node src/cli/naver-mentions.js");
  assert.equal(mentions["continue-on-error"], true);
});
