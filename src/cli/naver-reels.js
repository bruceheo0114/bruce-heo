import { readFile } from "node:fs/promises";
import { readJson, writeJson } from "../lib/files.js";
import { extractTerms, trendAverage } from "../naver/hooks.js";
import { kstDate, trendRise } from "../naver/issues.js";
import { naverClient } from "../naver/openapi.js";
import { heatOf, nextKstDate, recentNews, reelSources } from "../naver/reels.js";

// 매일 저녁 릴스 루틴(21:13 KST)이 다음 날 릴스를 고르기 전에, 쓸 수 있는 브런치 글마다 원문 속 이름의
// 데이터랩 검색량(30일)과 최근 7일 네이버 뉴스를 붙여 insight-reels/trends/<다음 날>.json 으로 남긴다.
// 여기서는 숫자와 기사 목록만 모은다. 어떤 글·어떤 이름으로 훅을 걸지는 루틴이 정한다. (GitHub Actions: naver-reels.yml)
const DAY_MS = 24 * 60 * 60 * 1000;
const NEWS_TERMS = 2; // 글마다 검색량 상위 이름 2개만 뉴스를 찾는다.

const now = new Date();
const queue = await readJson("insight-reels/queue.json");
const cacheIndex = await readJson("insight-reels/brunch_cache/index.json", []);
const naver = naverClient();
const startDate = kstDate(now.valueOf() - 29 * DAY_MS);
const endDate = kstDate(now);
const warnings = [];

const items = [];
for (const source of reelSources(queue, cacheIndex, { now })) {
  let text;
  try {
    text = await readFile(`insight-reels/brunch_cache/${source.no}.txt`, "utf8");
  } catch {
    continue; // 캐시에 없는 글은 루틴이 직접 읽는다.
  }
  const [heading, ...rest] = text.split("\n");
  const terms = extractTerms(heading.replace(/^#\s*/, "").replace(/^\d+화\s*/, ""), rest.join("\n"));
  if (!terms.length) continue;
  try {
    const results = await naver.trend({
      startDate,
      endDate,
      keywordGroups: terms.map((term) => ({ groupName: term, keywords: [term] })),
    });
    const scored = terms
      .map((term) => {
        const data = results.find((result) => result.title === term)?.data ?? [];
        return { term, avg: trendAverage(data), rise: trendRise(data, { until: now }) };
      })
      .sort((a, b) => b.avg - a.avg);
    for (const entry of scored.filter((term) => term.avg > 0).slice(0, NEWS_TERMS)) {
      const news = recentNews(await naver.search("news", entry.term, { sort: "date", display: 50 }), entry.term, { until: now });
      entry.news7 = news.count;
      entry.news = news.top;
    }
    for (const entry of scored) entry.heat = heatOf(entry);
    scored.sort((a, b) => b.heat - a.heat || b.avg - a.avg);
    items.push({ ...source, heat: scored[0].heat, hook: scored[0].heat > 0 ? scored[0].term : null, terms: scored });
  } catch (error) {
    warnings.push(`${source.no}: ${error.message.slice(0, 160)}`);
  }
}
items.sort((a, b) => b.heat - a.heat);

const path = `insight-reels/trends/${nextKstDate(now)}.json`;
await writeJson(path, {
  generated_at: now.toISOString(),
  for_date: nextKstDate(now),
  window: { trend: { since: startDate, until: endDate }, news_days: 7 },
  source: `네이버 데이터랩 검색어 트렌드 · 네이버 뉴스 검색 · ${naver.provider}`,
  note: "avg 는 같은 글 안의 이름끼리만 비교한다(데이터랩 상대값). rise = 최근 7일 ÷ 그 전 23일(null = 새로 뜬 말). news7 = 최근 7일 기사 중 그 이름이 제목·요약에 들어간 수. heat 가 높은 글부터. 이름은 원문에서 뽑았다.",
  warnings,
  items,
});
console.log(`${path}: 글 ${items.length}편 (${naver.provider} API ${naver.calls}회)${warnings.length ? ` · 경고 ${warnings.length}` : ""}`);
