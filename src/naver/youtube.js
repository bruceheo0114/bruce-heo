// 유튜브 제목·도입부 훅용: 다음 업로드(yt_slot) 글마다 원문 속 이름의 네이버 검색량을 비교하고,
// 사람들이 그 이름을 어떤 말과 함께 찾는지(광고·마케팅·브랜딩…)와 최근 기사를 붙인다.
// 숫자와 기사만 모은다. 제목·오프닝 문장은 유튜브 루틴이 쓴다(bruce-youtube/prompts/youtube_producer.md 「검색 훅」).
import { kstDate } from "./issues.js";
import { newsWorthy } from "./reels.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// 제목에 붙여 볼 말. 데이터랩 한 번(그룹 5개)에 같이 넣어 서로 비교한다.
export const TITLE_SUFFIXES = ["", "광고", "마케팅", "브랜딩", "캠페인"];

// 앞으로 days 일 안에 올릴 글(queue.json 의 todo + yt_slot). yt_slot 순서대로.
export function youtubeTargets(queue, { now = new Date(), days = 7 } = {}) {
  const today = kstDate(now);
  const until = kstDate(new Date(now).valueOf() + days * DAY_MS);
  return (queue.items ?? [])
    .filter((item) => item.status === "todo" && item.yt_slot && item.yt_slot >= today && item.yt_slot <= until)
    .sort((a, b) => a.yt_slot.localeCompare(b.yt_slot))
    .map((item) => ({ no: item.no, title: item.title, series: item.series ?? null, yt_slot: item.yt_slot, extra_sources: item.extra_sources ?? [] }));
}

// bruce-youtube/source/brunch/<no>.md(앞머리 YAML + 본문)에서 제목·본문.
export function parseBrunchMarkdown(text) {
  const title = /^title:\s*"(.*)"\s*$/m.exec(text)?.[1] ?? "";
  const body = text.replace(/^---[\s\S]*?\n---\n/, "").replace(/^#.*$/m, "");
  return { title, body };
}

// 데이터랩 일별 값 → 주 단위 평균(영상 속 검색량 그래프용, 90일 ≈ 13점). 마지막 주가 7일이 안 되면 있는 날만 평균.
export function weeklySeries(data = []) {
  const weeks = [];
  for (let index = 0; index < data.length; index += 7) {
    const chunk = data.slice(index, index + 7);
    weeks.push({ period: chunk[0].period, ratio: Math.round((chunk.reduce((sum, point) => sum + Number(point.ratio || 0), 0) / chunk.length) * 100) / 100 });
  }
  return weeks;
}

export function titleVariants(term) {
  return TITLE_SUFFIXES.map((suffix) => (suffix ? `${term} ${suffix}` : term));
}

// 이름(검색량 순) · 제목 변형 검색량 · 최근 기사 → 루틴이 바로 쓸 추천.
// - title_keyword: 검색량이 가장 큰 이름(제목 맨 앞에 둘 말)
// - title_phrase: 그 이름과 함께 가장 많이 찾는 말(설명 첫 줄·태그에 그대로)
// - rising: 최근 7일 검색이 1.3배 넘게 오른 이름(도입부에서 "요즘 많이 찾는" 근거)
// - fresh_hook: 14일 안 기사 중 가장 새것(도입부 첫 문장 소재 후보, 날짜와 함께 사실만)
export function pickHooks(terms, variants = [], { until, freshDays = 14 } = {}) {
  const ranked = [...terms].sort((a, b) => b.avg - a.avg);
  const keyword = ranked.find((term) => term.avg > 0 && newsWorthy(term.term)) ?? ranked.find((term) => term.avg > 0) ?? null;
  // 이름만 찾는 수가 늘 가장 크므로, 말이 붙은 변형 중 검색이 있는 것을 먼저 고른다(「버거킹 광고」).
  const searched = [...variants].filter((variant) => variant.avg > 0).sort((a, b) => b.avg - a.avg);
  const phrase = searched.find((variant) => variant.phrase.includes(" ")) ?? searched[0] ?? null;
  const rising = ranked.filter((term) => term.rise === null || (term.rise ?? 0) >= 1.3).map((term) => term.term);
  const since = kstDate(new Date(until).valueOf() - freshDays * DAY_MS);
  const fresh = ranked
    .flatMap((term) => (term.news ?? []).map((item) => ({ term: term.term, ...item })))
    .filter((item) => item.date >= since)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  return {
    title_keyword: keyword?.term ?? null,
    title_phrase: phrase?.phrase ?? keyword?.term ?? null,
    rising,
    fresh_hook: fresh,
  };
}
