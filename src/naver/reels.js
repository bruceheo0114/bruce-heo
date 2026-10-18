// 릴스 시의성 훅용: 다음에 만들 수 있는 브런치 글마다 원문 속 이름(브랜드·캠페인·현상)이
// 지금 네이버 뉴스·검색에서 얼마나 움직이는지 붙인다. 훅은 릴스 루틴이 쓴다(insight-reels/routine_daily_prompt.md).
import { cleanText, excludedBy, kstDate, parseNaverDate } from "./issues.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// 다음 날(KST) — 저녁에 돌아 다음 날 07:00 릴스에 쓴다.
export function nextKstDate(now = new Date()) {
  return new Date(new Date(now).valueOf() + 9 * 60 * 60 * 1000 + DAY_MS).toISOString().slice(0, 10);
}

// 릴스로 아직 쓸 수 있는 글: 큐의 todo(소재가 남은 글) + 큐에 아직 없는 최근 새 글.
export function reelSources(queue, cacheIndex, { now = new Date(), newWithinDays = 3 } = {}) {
  const sources = [];
  const seen = new Set();
  const since = new Date(now).valueOf() - newWithinDays * DAY_MS;
  for (const post of cacheIndex ?? []) {
    const inQueue = queue.items.some((item) => item.no === post.no);
    if (!inQueue && new Date(`${post.date}T00:00:00+09:00`).valueOf() >= since) {
      sources.push({ no: post.no, title: post.title, fresh: true });
      seen.add(post.no);
    }
  }
  for (const item of queue.items) {
    if (item.status !== "todo" || item.exhausted || !item.no || seen.has(item.no)) continue;
    sources.push({ no: item.no, title: item.title, used: (item.angles ?? []).length });
    seen.add(item.no);
  }
  return sources;
}

// 뉴스를 찾을 만한 이름인지: 두 글자 한글 일반 명사(기억·제작·시간)는 엉뚱한 기사만 모아서 뺀다.
export function newsWorthy(term) {
  return !/^\p{Script=Hangul}{1,2}$/u.test(term);
}

// 마케팅 맥락으로 좁혀 찾는다(같은 이름의 스포츠·증권 기사 줄이기).
export function newsQuery(term) {
  return `${term} 마케팅`;
}

// 최근 7일 뉴스 중 그 이름이 기사 제목에 들어간 것만(동음이의·스치듯 언급 거르기). 논란·사고 기사는 뺀다.
export function recentNews(rawItems, term, { until, days = 7, keep = 3 }) {
  const since = new Date(until).valueOf() - days * DAY_MS;
  const items = [];
  const links = new Set();
  for (const raw of rawItems ?? []) {
    const date = parseNaverDate(raw.pubDate);
    if (!date || date.valueOf() < since || date.valueOf() > new Date(until).valueOf()) continue;
    const title = cleanText(raw.title);
    const description = cleanText(raw.description);
    if (!title.includes(term) || excludedBy(`${title} ${description}`).length) continue;
    const link = raw.originallink || raw.link;
    if (links.has(link)) continue;
    links.add(link);
    items.push({ title, date: kstDate(date), link, summary: description.slice(0, 140) });
  }
  return { count: items.length, top: items.slice(0, keep) };
}

// 지금 움직이는 정도: 최근 7일 기사 수(최대 30) + 검색량 상승. 새로 뜬 말(rise=null)은 상승 3배로 본다.
export function heatOf(term) {
  const rise = term.rise === null ? 3 : term.rise ?? 0;
  return Math.round((Math.min(term.news7 ?? 0, 30) / 3 + Math.max(rise - 1, 0) * 5) * 10) / 10;
}
