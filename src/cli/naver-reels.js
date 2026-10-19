import { readFile } from "node:fs/promises";
import { readJson, writeJson } from "../lib/files.js";
import { extractTerms, trendAverage } from "../naver/hooks.js";
import { kstDate, trendRise } from "../naver/issues.js";
import { naverClient } from "../naver/openapi.js";
import { heatOf, newsQuery, newsWorthy, nextKstDate, recentNews, reelSources } from "../naver/reels.js";
import { pickHooks, titleVariants } from "../naver/youtube.js";

// 매일 저녁 릴스 루틴(21:13 KST)이 다음 날 릴스를 고르기 전에, 쓸 수 있는 브런치 글마다 원문 속 이름의
// 데이터랩 검색량(30일)과 최근 7일 네이버 뉴스를 붙여 insight-reels/trends/<다음 날>.json 으로 남긴다.
// 여기서는 숫자와 기사 목록만 모은다. 어떤 글·어떤 이름으로 훅을 걸지는 루틴이 정한다. (GitHub Actions: naver-reels.yml)
const DAY_MS = 24 * 60 * 60 * 1000;
const NEWS_TERMS = 2; // 글마다 검색량 상위 이름 2개만 뉴스를 찾는다.

const now = new Date();
if (new Date(`${nextKstDate(now)}T00:00:00Z`).getUTCDay() === 1) {
  console.log(`${nextKstDate(now)} 은 월요일 — 릴스를 쉬는 날이라 수집하지 않음`);
  process.exit(0);
}
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
    for (const entry of scored.filter((term) => term.avg > 0 && newsWorthy(term.term)).slice(0, NEWS_TERMS)) {
      const raw = await naver.search("news", newsQuery(entry.term), { sort: "date", display: 50 });
      const news = recentNews(raw, entry.term, { until: now });
      entry.news7 = news.count;
      entry.news = news.top;
    }
    for (const entry of scored) entry.heat = heatOf(entry);
    // 유튜브와 같은 검색 훅: 검색량 1위 이름이 사람들에게 어떤 말과 함께 찾히는지(광고·마케팅·브랜딩·캠페인).
    let variants = [];
    const top = scored.find((term) => term.avg > 0 && newsWorthy(term.term));
    if (top) {
      const phrases = titleVariants(top.term);
      const found = await naver.trend({ startDate, endDate, keywordGroups: phrases.map((phrase) => ({ groupName: phrase, keywords: [phrase] })) });
      variants = phrases.map((phrase) => ({ phrase, avg: trendAverage(found.find((result) => result.title === phrase)?.data ?? []) }));
    }
    const hooks = pickHooks(scored, variants, { until: now, freshDays: 7 });
    scored.sort((a, b) => b.heat - a.heat || b.avg - a.avg);
    items.push({ ...source, heat: scored[0].heat, hook: scored[0].heat > 0 ? scored[0].term : null, hooks, variants, terms: scored });
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
  note: "avg 는 같은 글 안의 이름끼리만 비교한다(데이터랩 상대값). rise = 최근 7일 ÷ 그 전 23일(null = 새로 뜬 말). news7 = 최근 7일 「이름 + 마케팅」 기사 중 제목에 그 이름이 들어간 수(두 글자 한글 일반 명사는 뉴스를 찾지 않는다). heat 가 높은 글부터. 이름은 원문에서 뽑았다. hooks = 유튜브와 같은 검색 훅(title_keyword 검색량 1위 이름 · title_phrase 함께 찾는 말 · rising 최근 오른 이름 · fresh_hook 7일 안 가장 새 기사), variants = title_keyword 와 함께 찾는 말의 상대값.",
  warnings,
  items,
});
console.log(`${path}: 글 ${items.length}편 (${naver.provider} API ${naver.calls}회)${warnings.length ? ` · 경고 ${warnings.length}` : ""}`);
