import { readFile } from "node:fs/promises";
import { readJson, writeJson } from "../lib/files.js";
import { extractTerms, trendAverage } from "../naver/hooks.js";
import { kstDate, trendRise } from "../naver/issues.js";
import { naverClient } from "../naver/openapi.js";
import { newsQuery, newsWorthy, recentNews } from "../naver/reels.js";
import { parseBrunchMarkdown, pickHooks, titleVariants, youtubeTargets } from "../naver/youtube.js";

// 유튜브 제작 루틴(토·월·수 21:13 KST)이 대본·제목을 쓰기 전에, 앞으로 7일 안에 올릴 글(queue.json yt_slot)마다
// 원문 속 이름의 데이터랩 검색량(90일)·제목 변형 검색량·최근 30일 기사를 bruce-youtube/trends/<yt_slot>.json 으로 남긴다.
// (GitHub Actions: naver-youtube.yml, Claude 미사용)
const DAY_MS = 24 * 60 * 60 * 1000;
const NEWS_TERMS = 2;

const now = new Date();
const queue = await readJson("bruce-youtube/queue.json");
const targets = youtubeTargets(queue, { now });
if (!targets.length) {
  console.log("앞으로 7일 안에 올릴 유튜브 글 없음");
  process.exit(0);
}
const naver = naverClient();
const startDate = kstDate(now.valueOf() - 89 * DAY_MS);
const endDate = kstDate(now);

async function source(no) {
  try {
    return parseBrunchMarkdown(await readFile(`bruce-youtube/source/brunch/${no}.md`, "utf8"));
  } catch {
    return null;
  }
}

for (const target of targets) {
  const warnings = [];
  const main = await source(target.no);
  if (!main) {
    console.log(`${target.no}: 원문 캐시 없음 — 건너뜀`);
    continue;
  }
  let body = main.body;
  for (const no of target.extra_sources) body += `\n${(await source(no))?.body ?? ""}`;
  const terms = extractTerms(main.title, body);
  let scored = [];
  let variants = [];
  try {
    if (terms.length) {
      const results = await naver.trend({ startDate, endDate, keywordGroups: terms.map((term) => ({ groupName: term, keywords: [term] })) });
      scored = terms
        .map((term) => {
          const data = results.find((result) => result.title === term)?.data ?? [];
          return { term, avg: trendAverage(data), rise: trendRise(data, { until: now }) };
        })
        .sort((a, b) => b.avg - a.avg);
      for (const entry of scored.filter((term) => term.avg > 0 && newsWorthy(term.term)).slice(0, NEWS_TERMS)) {
        const raw = await naver.search("news", newsQuery(entry.term), { sort: "date", display: 100 });
        const news = recentNews(raw, entry.term, { until: now, days: 30, keep: 3 });
        entry.news30 = news.count;
        entry.news = news.top;
      }
      const top = scored.find((term) => term.avg > 0 && newsWorthy(term.term));
      if (top) {
        const phrases = titleVariants(top.term);
        const results2 = await naver.trend({ startDate, endDate, keywordGroups: phrases.map((phrase) => ({ groupName: phrase, keywords: [phrase] })) });
        variants = phrases.map((phrase) => ({ phrase, avg: trendAverage(results2.find((result) => result.title === phrase)?.data ?? []) }));
      }
    }
  } catch (error) {
    warnings.push(error.message.slice(0, 200));
  }
  const path = `bruce-youtube/trends/${target.yt_slot}.json`;
  await writeJson(path, {
    generated_at: now.toISOString(),
    ...target,
    window: { trend: { since: startDate, until: endDate }, news_days: 30 },
    source: `네이버 데이터랩 검색어 트렌드 · 네이버 뉴스 검색 · ${naver.provider}`,
    note:
      "terms.avg 는 이 글의 이름끼리만 비교한 상대값(90일). rise = 최근 7일 ÷ 그 전(null = 새로 뜬 말). variants 는 검색량 1위 이름과 함께 찾는 말의 상대값. " +
      "hooks 는 추천일 뿐 — 제목·도입부는 원문 사실 안에서 루틴이 쓴다. 이름은 원문에서만 뽑았다.",
    warnings,
    terms: scored,
    variants,
    hooks: pickHooks(scored, variants, { until: now }),
  });
  console.log(`${path}: ${target.no} 「${target.title}」 이름 ${scored.length}개${warnings.length ? ` · 경고 ${warnings.length}` : ""}`);
}
console.log(`${naver.provider} API ${naver.calls}회`);
