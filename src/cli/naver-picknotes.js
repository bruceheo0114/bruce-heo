import { readJson, writeJson } from "../lib/files.js";
import { trendAverage } from "../naver/hooks.js";
import { kstDate, trendRise } from "../naver/issues.js";
import { naverClient } from "../naver/openapi.js";

// 생활픽노트 주간 원고 루틴(일 19:48 KST)이 상품을 고르기 전에, 후보 키워드마다 최근 7일 네이버 검색량이
// 직전 3주보다 얼마나 튀었는지 affiliate-threads/trends/<날짜>.json 에 남긴다. (GitHub Actions: naver-picknotes.yml)
const DAY_MS = 24 * 60 * 60 * 1000;

const now = new Date();
const { categories } = await readJson("affiliate-threads/trend_keywords.json");
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

const path = `affiliate-threads/trends/${endDate}.json`;
await writeJson(path, { generated_at: now.toISOString(), window: { startDate, endDate, recent_days: 7 }, provider: naver.provider, calls: naver.calls, items });
console.log(`${path}: ${items.length}개 키워드, 상위 ${items.slice(0, 5).map((item) => `${item.keyword}(${item.rise ?? "new"})`).join(", ")}`);
