import { writeJson } from "../lib/files.js";
import {
  clusterArticles,
  normalizeNews,
  parseNaverDate,
  scoreCandidate,
  toCandidate,
  trendRise,
} from "../naver/issues.js";
import { naverClient } from "../naver/openapi.js";
import { TREND_NOTE_QUERIES, interestSummary, kstDateOf, parseKeywords, upcomingWednesday } from "../naver/trendnote.js";

// 트렌드 노트용 네이버 신호 (GitHub Actions: trend-note-naver.yml)
//  candidates            : 화 18:07 자동. 지난 10일 국내 마케팅 뉴스 → 사례 후보 + 블로그 반응 + 검색량 변화
//                          → newsletter/signals/<수요일>.json
//  keywords <날짜> <a,b> : 루틴이 고른 사례 이름의 지난 28일 검색 관심도 → newsletter/signals/<날짜>.keywords.json
const DAY_MS = 24 * 60 * 60 * 1000;
const [mode = "candidates", argDate, argKeywords = ""] = process.argv.slice(2);
const now = new Date();
const naver = naverClient();
const warnings = [];

if (mode === "keywords") {
  const date = argDate || upcomingWednesday(now);
  const keywords = parseKeywords(argKeywords);
  if (!keywords.length) throw new Error("keywords 가 비어 있습니다 (쉼표로 구분)");
  const startDate = kstDateOf(now.valueOf() - 27 * DAY_MS);
  const endDate = kstDateOf(now);
  const results = [];
  for (let index = 0; index < keywords.length; index += 5) {
    const group = keywords.slice(index, index + 5);
    try {
      const rows = await naver.trend({
        startDate,
        endDate,
        keywordGroups: group.map((keyword) => ({ groupName: keyword, keywords: [keyword] })),
      });
      for (const keyword of group) {
        const row = rows.find((entry) => entry.title === keyword);
        results.push({ keyword, batch: index / 5 + 1, ...interestSummary(row?.data ?? [], { until: now }) });
      }
    } catch (error) {
      warnings.push(`데이터랩 실패(${group.join(", ")}): ${error.message}`);
    }
  }
  const path = `newsletter/signals/${date}.keywords.json`;
  await writeJson(path, {
    date,
    generated_at: now.toISOString(),
    window: { startDate, endDate },
    source: `네이버 데이터랩 검색어 트렌드 · ${naver.provider}`,
    note: "recent7 은 같은 batch(최대 5개) 안에서만 비교한다. rise = 최근 7일 평균 ÷ 그 전 21일 평균(null = 그 전엔 검색 없음). 본문에는 '네이버 검색 관심도(데이터랩)'로 출처를 적는다.",
    ...(warnings.length ? { warnings } : {}),
    results,
  });
  console.log(`${path}: ${results.length}개 (${naver.provider} API ${naver.calls}회)`);
} else {
  const date = upcomingWednesday(now);
  const since = new Date(now.valueOf() - 10 * DAY_MS);
  const raw = [];
  for (const { field, queries } of TREND_NOTE_QUERIES) {
    for (const query of queries) {
      for (const sort of ["sim", "date"]) {
        try {
          for (const item of await naver.search("news", query, { sort })) raw.push({ ...item, field, query });
        } catch (error) {
          warnings.push(`뉴스 검색 실패(${query}): ${error.message}`);
        }
      }
    }
  }
  const articles = normalizeNews(raw, { since, until: now });
  let candidates = clusterArticles(articles).map((cluster) => toCandidate(cluster, { until: now }));
  candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
  candidates = candidates.slice(0, 40);

  const weekAgo = new Date(now.valueOf() - 7 * DAY_MS);
  const named = candidates.slice(0, 20).filter((candidate) => candidate.keyword);
  try {
    for (const candidate of named) {
      const posts = await naver.search("blog", candidate.keyword, { sort: "date" });
      candidate.blog7 = posts.filter((post) => (parseNaverDate(post.postdate) ?? 0) >= weekAgo).length;
    }
  } catch (error) {
    warnings.push(`블로그 검색 실패: ${error.message}`);
  }
  try {
    for (let index = 0; index < named.length; index += 5) {
      const group = named.slice(index, index + 5);
      const rows = await naver.trend({
        startDate: kstDateOf(now.valueOf() - 13 * DAY_MS),
        endDate: kstDateOf(now),
        keywordGroups: group.map((candidate) => ({ groupName: candidate.keyword, keywords: [candidate.keyword] })),
      });
      for (const candidate of group) {
        const row = rows.find((entry) => entry.title === candidate.keyword);
        candidate.searchRise = row ? trendRise(row.data, { until: now }) : 0;
      }
    }
  } catch (error) {
    warnings.push(`데이터랩 실패: ${error.message}`);
  }
  for (const candidate of candidates) candidate.score = scoreCandidate(candidate);
  candidates.sort((a, b) => b.score - a.score);

  const path = `newsletter/signals/${date}.json`;
  await writeJson(path, {
    date,
    generated_at: now.toISOString(),
    window: { since: kstDateOf(since), until: kstDateOf(now) },
    source: `네이버 검색 API(뉴스·블로그) + 데이터랩 검색어 트렌드 · ${naver.provider}`,
    note: "국내 사례 후보일 뿐이다. 채택 전에 원문을 열어 날짜·주체·숫자를 확인한다(content/routine_trend_newsletter_prompt.md).",
    stats: { api_calls: naver.calls, articles: articles.length, candidates: candidates.length },
    ...(warnings.length ? { warnings } : {}),
    candidates,
  });
  console.log(`${path}: 기사 ${articles.length}건 → 후보 ${candidates.length}개 (${naver.provider} API ${naver.calls}회)`);
}
for (const warning of warnings) console.warn(warning);
