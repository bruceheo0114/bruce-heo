import { readJson, writeJson } from "../lib/files.js";
import { kstDate } from "../naver/issues.js";
import { BRAND_QUERIES, MENTION_TYPES, pickMentions, titleQueries } from "../naver/mentions.js";
import { naverClient } from "../naver/openapi.js";

// 지난 7일 동안 남의 블로그·카페·뉴스에 브루스(이름·브랜드·최근 브런치 글)가 언급된 것을 모아
// data/brand-mentions.json 에 남긴다. 일요일 카드 루틴이 미리보기 메일 맨 아래에 붙인다. (GitHub Actions: naver-issues.yml)
const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date();
const since = new Date(now.valueOf() - 7 * DAY_MS);
const posts = await readJson("data/brunch-posts.json", []);
const rules = [...BRAND_QUERIES, ...titleQueries(posts)];
const naver = naverClient();

const seen = new Set();
const mentions = [];
const warnings = [];
for (const rule of rules) {
  for (const type of MENTION_TYPES) {
    try {
      const items = await naver.search(type, rule.query, { sort: "date", display: 50 });
      for (const mention of pickMentions(items, { type, rule, since })) {
        if (seen.has(mention.url)) continue;
        seen.add(mention.url);
        mentions.push(mention);
      }
    } catch (error) {
      warnings.push(`${type} "${rule.query}": ${error.message.slice(0, 120)}`);
    }
  }
}
mentions.sort((a, b) => b.date.localeCompare(a.date));

const counts = Object.fromEntries(MENTION_TYPES.map((type) => [type, mentions.filter((mention) => mention.type === type).length]));
await writeJson("data/brand-mentions.json", {
  generated_at: now.toISOString(),
  window: { since: kstDate(since), until: kstDate(now) },
  source: `네이버 검색 API(블로그·카페·뉴스) · ${naver.provider}`,
  counts,
  ...(warnings.length ? { warnings } : {}),
  mentions,
});
console.log(`data/brand-mentions.json: 언급 ${mentions.length}건 ${JSON.stringify(counts)} (${naver.provider} API ${naver.calls}회)`);
for (const warning of warnings) console.warn(warning);
