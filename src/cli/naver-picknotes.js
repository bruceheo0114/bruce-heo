import { readJson, writeJson } from "../lib/files.js";
import { trendAverage } from "../naver/hooks.js";
import { kstDate, trendRise } from "../naver/issues.js";
import { naverClient } from "../naver/openapi.js";

// 생활픽노트 주간 원고 루틴(일 19:48 KST)이 상품을 고르기 전에, 후보 키워드마다 최근 7일 네이버 검색량이
// 직전 3주보다 얼마나 튀었는지 affiliate-threads/trends/<날짜>.json 에 남긴다. (GitHub Actions: naver-picknotes.yml)
const DAY_MS = 24 * 60 * 60 * 1000;

const now = new Date();
const { categories, topic_tags: tagCandidates = {} } = await readJson("affiliate-threads/trend_keywords.json");
const naver = naverClient();
const startDate = kstDate(now.valueOf() - 27 * DAY_MS);
const endDate = kstDate(now);

const pairs = Object.entries(categories).flatMap(([category, keywords]) => keywords.map((keyword) => ({ category, keyword })));
const items = [];
for (let index = 0; index < pairs.length; index += 5) {
  const group = pairs.slice(index, index + 5);
  const results = await naver.trend({
    startDate,
    endDate,
    keywordGroups: group.map(({ keyword }) => ({ groupName: keyword, keywords: [keyword] })),
  });
  for (const { category, keyword } of group) {
    const data = results.find((result) => result.title === keyword)?.data ?? [];
    // rise 는 키워드 자신의 과거와 비교한 값이라 요청(그룹)이 달라도 서로 비교할 수 있다. null = 새로 뜬 말.
    items.push({ keyword, category, rise: trendRise(data, { until: now }), avg: trendAverage(data) });
  }
}
items.sort((a, b) => (b.rise ?? 99) - (a.rise ?? 99));

// 주제 태그: 범주마다 후보를 한 요청에 넣어(수치는 요청 안에서만 비교 가능) 최근 4주 검색량이 가장 큰 말을 고른다.
const topicTags = {};
for (const [category, tags] of Object.entries(tagCandidates)) {
  const results = await naver.trend({
    startDate,
    endDate,
    keywordGroups: tags.slice(0, 5).map((tag) => ({ groupName: tag, keywords: [tag] })),
  });
  const scored = tags.map((tag) => ({ tag, avg: trendAverage(results.find((result) => result.title === tag)?.data ?? []) }));
  scored.sort((a, b) => b.avg - a.avg);
  topicTags[category] = { best: scored[0].avg > 0 ? scored[0].tag : tags[0], candidates: scored };
}

const path = `affiliate-threads/trends/${endDate}.json`;
await writeJson(path, { generated_at: now.toISOString(), window: { startDate, endDate, recent_days: 7 }, provider: naver.provider, calls: naver.calls, items, topic_tags: topicTags });
console.log(`${path}: ${items.length}개 키워드, 상위 ${items.slice(0, 5).map((item) => `${item.keyword}(${item.rise ?? "new"})`).join(", ")}`);
console.log(`주제 태그: ${Object.entries(topicTags).map(([category, { best }]) => `${category}=${best}`).join(", ")}`);
