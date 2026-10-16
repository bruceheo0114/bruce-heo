import { readFile } from "node:fs/promises";
import { readJson, writeJson } from "../lib/files.js";
import { extractTerms, trendAverage } from "../naver/hooks.js";
import { kstDate, trendRise } from "../naver/issues.js";
import { naverClient } from "../naver/openapi.js";

// 금요일 스레드 원고 루틴(21:00 KST)이 쓰기 전에, 다음에 쓸 브런치 글마다 원문 속 이름(브랜드·캠페인)의
// 네이버 검색량을 비교해 threads/trends/<날짜>.json 에 남긴다. (GitHub Actions: naver-hooks.yml)
const DAY_MS = 24 * 60 * 60 * 1000;
const NEXT = 10; // 큐에서 볼 글 수(7일치 + 건너뛸 글 여유)

const now = new Date();
const queue = await readJson("threads/queue.json");
const naver = naverClient();
const startDate = kstDate(now.valueOf() - 29 * DAY_MS);
const endDate = kstDate(now);

const items = [];
for (const entry of queue.items.filter((item) => item.status === "todo").slice(0, NEXT)) {
  let text;
  try {
    text = await readFile(`insight-reels/brunch_cache/${entry.no}.txt`, "utf8");
  } catch {
    continue; // 캐시에 없는 글은 루틴이 직접 읽는다.
  }
  const [heading, ...rest] = text.split("\n");
  const terms = extractTerms(heading.replace(/^#\s*/, "").replace(/^\d+화\s*/, ""), rest.join("\n"));
  if (!terms.length) continue;
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
  items.push({ no: entry.no, title: entry.title, top: scored[0].avg > 0 ? scored[0].term : null, terms: scored });
}

const path = `threads/trends/${kstDate(now)}.json`;
await writeJson(path, {
  generated_at: now.toISOString(),
  window: { since: startDate, until: endDate },
  source: `네이버 데이터랩 검색어 트렌드 · ${naver.provider}`,
  note: "avg 는 같은 글 안의 이름끼리만 비교한다(데이터랩 상대값). 이름은 원문에서 뽑았다.",
  items,
});
console.log(`${path}: 글 ${items.length}편 (${naver.provider} API ${naver.calls}회)`);
