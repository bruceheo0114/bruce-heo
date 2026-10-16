import { writeJson } from "../lib/files.js";
import {
  ISSUE_QUERIES,
  clusterArticles,
  kstDate,
  normalizeNews,
  parseNaverDate,
  scoreCandidate,
  toCandidate,
  trendRise,
  upcomingMonday,
} from "../naver/issues.js";
import { naverClient } from "../naver/openapi.js";

// 일요일 카드 루틴이 쓰기 전에 「이번 주 마케팅 이슈」 후보를 네이버 뉴스·블로그·데이터랩으로 모아
// insight-reels/candidates/<월요일>.json 에 남긴다. (GitHub Actions: naver-issues.yml)
const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP = 60; // 파일에 남길 후보 수(루틴은 40개 이상을 모은다)
const ENRICH = 30; // 블로그·검색량을 더 볼 상위 후보 수

const now = new Date();
const until = now;
const since = new Date(now.valueOf() - 14 * DAY_MS);
const monday = upcomingMonday(now);
const naver = naverClient();

// 1) 분야별 뉴스: 정확도순·최신순 둘 다 본다(최신순만 보면 몇 시간 치만 잡힌다).
const raw = [];
for (const { field, queries } of ISSUE_QUERIES) {
  for (const query of queries) {
    for (const sort of ["sim", "date"]) {
      for (const item of await naver.search("news", query, { sort })) raw.push({ ...item, field, query });
    }
  }
}
const articles = normalizeNews(raw, { since, until });
let candidates = clusterArticles(articles).map((cluster) => toCandidate(cluster, { until }));
candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
candidates = candidates.slice(0, KEEP);
const warnings = [];

// 2) 상위 후보: 최근 7일 블로그 글 수(사람들이 실제로 쓴 반응).
const weekAgo = new Date(now.valueOf() - 7 * DAY_MS);
const named = candidates.slice(0, ENRICH).filter((candidate) => candidate.keyword);
try {
  for (const candidate of named) {
    const posts = await naver.search("blog", candidate.keyword, { sort: "date" });
    candidate.blog7 = posts.filter((post) => (parseNaverDate(post.postdate) ?? 0) >= weekAgo).length;
  }
} catch (error) {
  warnings.push(`블로그 검색 실패: ${error.message}`);
}

// 3) 같은 후보: 데이터랩 검색량 변화(최근 7일 ÷ 그 전 7일). 한 번에 5개씩.
const startDate = kstDate(now.valueOf() - 13 * DAY_MS);
const endDate = kstDate(now);
// 데이터랩 앱 권한이 없거나 실패해도 뉴스 후보는 남긴다.
try {
  for (let index = 0; index < named.length; index += 5) {
    const group = named.slice(index, index + 5);
    const results = await naver.trend({
      startDate,
      endDate,
      keywordGroups: group.map((candidate) => ({ groupName: candidate.keyword, keywords: [candidate.keyword] })),
    });
    for (const candidate of group) {
      const result = results.find((entry) => entry.title === candidate.keyword);
      candidate.searchRise = result ? trendRise(result.data, { until: now }) : 0;
    }
  }
} catch (error) {
  warnings.push(`데이터랩 실패: ${error.message}`);
}

for (const candidate of candidates) candidate.score = scoreCandidate(candidate);
candidates.sort((a, b) => b.score - a.score);

const path = `insight-reels/candidates/${monday}.json`;
await writeJson(path, {
  monday,
  generated_at: now.toISOString(),
  window: { since: kstDate(since), until: kstDate(until) },
  source: "네이버 검색 API(뉴스·블로그) + 데이터랩 검색어 트렌드",
  note: "후보일 뿐이다. 채택 전에 원문을 열어 게시일·실행일·숫자를 확인한다(CAROUSEL.md).",
  stats: { api_calls: naver.calls, articles: articles.length, candidates: candidates.length },
  ...(warnings.length ? { warnings } : {}),
  candidates,
});
console.log(`${path}: 기사 ${articles.length}건 → 후보 ${candidates.length}개 (API ${naver.calls}회)`);
for (const warning of warnings) console.warn(warning);
