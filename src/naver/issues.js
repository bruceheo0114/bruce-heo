// 월요일 「이번 주 마케팅 이슈 10건」 후보를 네이버 뉴스·블로그·데이터랩으로 미리 모은다.
// 여기서는 후보만 고른다. 채택·날짜·숫자 확인은 일요일 카드 루틴이 원문을 열어 한다(insight-reels/CAROUSEL.md).
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// CAROUSEL.md 「넓게 찾기」 2라운드의 분야·검색어를 따른다. 분야마다 2~4개.
export const ISSUE_QUERIES = [
  { field: "식음료", queries: ["식품 콜라보 출시", "편의점 한정판 완판", "신제품 품절 대란", "디저트 열풍 매출"] },
  { field: "패션·뷰티", queries: ["패션 콜라보 완판", "뷰티 팝업 방문객", "화장품 품절 대란"] },
  { field: "유통·공간", queries: ["팝업스토어 방문객", "백화점 팝업 오픈", "오픈런 매장"] },
  { field: "콘텐츠·엔터", queries: ["광고 조회수 돌파", "브랜드 숏폼 화제", "밈 마케팅 화제", "게임 콜라보 매출"] },
  { field: "테크·플랫폼", queries: ["앱 이용자 급증 이벤트", "AI 광고 캠페인 공개"] },
  { field: "금융·생활", queries: ["금융 캠페인 화제", "카드 한정판 품절"] },
  { field: "소비 트렌드", queries: ["MZ 인기 소비", "검색량 급증 상품", "리셀 열풍", "유행 품절"] },
  { field: "캠페인", queries: ["캠페인 공개 광고", "브랜드 필름 공개", "한정판 출시 화제"] },
  { field: "해외", queries: ["해외 브랜드 캠페인 화제", "일본 한정판 품절", "미국 광고 화제"] },
];

const SIGNAL_WORDS = ["완판", "품절", "매진", "대란", "오픈런", "조회수", "돌파", "역대", "최다", "흥행", "급증", "열풍", "화제"];
const SIGNAL_NUMBER = /\d[\d,.]*\s*(?:만|억|천)?\s*(?:명|개|건|회|뷰|%|배|원|장|병|잔)/g;
// CAROUSEL.md 「빼는 것」: 소송·사고·정치 논란·인사 발령.
// "사고 싶은"·"인사이트"에 걸리지 않게 낱말을 좁혀 둔다.
const EXCLUDE_WORDS = ["소송", "사고 발생", "안전사고", "논란", "인사 발령", "인사발령", "부고", "사망", "압수수색", "검찰", "국회", "선거", "횡령"];
const STOP_TOKENS = new Set(["출시", "공개", "오픈", "진행", "선보여", "선봬", "선보인다", "나선다", "이벤트", "기념", "브랜드", "마케팅"]);

export function kstDate(value) {
  return new Date(new Date(value).valueOf() + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
}

// 일요일 저녁에 돌면 다음 날 월요일, 월요일에 돌면 그날을 대상 날짜로 잡는다.
export function upcomingMonday(now = new Date()) {
  const seoul = new Date(new Date(now).valueOf() + SEOUL_OFFSET_MS);
  const add = (8 - seoul.getUTCDay()) % 7;
  return new Date(seoul.valueOf() + add * DAY_MS).toISOString().slice(0, 10);
}

export function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// 뉴스 pubDate("Mon, 12 Oct 2026 10:00:00 +0900") 또는 블로그 postdate("20261012").
export function parseNaverDate(value) {
  if (/^\d{8}$/.test(value ?? "")) {
    return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00+09:00`);
  }
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function outletOf(item) {
  try {
    return new URL(item.originallink || item.link).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// 제목에서 검색어로 쓸 이름을 뽑는다: 따옴표 안 이름(제품·캠페인) → "브랜드, ~" 의 브랜드.
export function keywordOf(title) {
  const quoted = title.match(/['‘"“「『]([^'’"”」』]{2,20})['’"”」』]/);
  if (quoted) return quoted[1].trim();
  const head = title.split(/[,，]/)[0].replace(/\[[^\]]*\]/g, "").trim();
  if (head !== title.trim() && head.length >= 2 && head.length <= 12 && head.split(" ").length <= 2) return head;
  return "";
}

export function signalsOf(text) {
  const words = SIGNAL_WORDS.filter((word) => text.includes(word));
  const numbers = [...new Set(text.match(SIGNAL_NUMBER) ?? [])].slice(0, 4);
  return [...words, ...numbers];
}

export function excludedBy(text) {
  return EXCLUDE_WORDS.filter((word) => text.includes(word));
}

function tokens(title) {
  return new Set(
    title
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 2 && !STOP_TOKENS.has(token)),
  );
}

function similarity(a, b) {
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared || 1);
}

// 뉴스 원본 결과 → 기간 안 기사만 정리한 목록(같은 링크는 한 번만).
export function normalizeNews(rawItems, { since, until }) {
  const seen = new Set();
  const items = [];
  for (const raw of rawItems) {
    const link = raw.originallink || raw.link;
    if (!link || seen.has(link)) continue;
    seen.add(link);
    const published = parseNaverDate(raw.pubDate);
    if (!published || published < since || published > until) continue;
    const title = cleanText(raw.title);
    items.push({
      title,
      description: cleanText(raw.description).slice(0, 160),
      link,
      naverLink: raw.link && raw.link !== link ? raw.link : undefined,
      outlet: outletOf(raw),
      published: published.toISOString(),
      field: raw.field,
      query: raw.query,
    });
  }
  return items;
}

// 같은 이야기를 다룬 기사끼리 묶는다(같은 이름이거나 제목 낱말이 많이 겹치면 한 묶음).
export function clusterArticles(articles) {
  const clusters = [];
  for (const article of articles) {
    const keyword = keywordOf(article.title);
    const words = tokens(article.title);
    const match = clusters.find(
      (cluster) => (keyword && cluster.keyword === keyword) || similarity(cluster.words, words) >= 0.4,
    );
    if (match) {
      match.articles.push(article);
      for (const word of words) match.words.add(word);
      if (!match.keyword && keyword) match.keyword = keyword;
    } else {
      clusters.push({ keyword, words, articles: [article] });
    }
  }
  return clusters;
}

// 데이터랩 일별 수치 → 최근 7일 평균 ÷ 그 전 기간 평균(기간 길이가 달라도 하루 평균끼리 비교한다).
export function trendRise(data, { until }) {
  const recentStart = kstDate(new Date(until).valueOf() - 6 * DAY_MS);
  const recent = [];
  const before = [];
  for (const point of data ?? []) (point.period >= recentStart ? recent : before).push(point.ratio);
  const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
  if (mean(recent) === 0) return 0;
  if (mean(before) === 0) return null; // 그 전엔 검색이 없었다 = 새로 뜬 말.
  return Math.round((mean(recent) / mean(before)) * 100) / 100;
}

// 매체 수가 많아도 보도자료 재탕일 수 있어 상한을 두고, 「숫자로 확인」(CAROUSEL.md 고르는 기준 2)에 더 무게를 준다.
export function scoreCandidate(candidate) {
  const numbers = candidate.signals.filter((signal) => /\d/.test(signal)).length;
  const words = candidate.signals.length - numbers;
  let score = Math.min(candidate.outlets.length, 10) * 1.2 + Math.min(numbers, 3) * 1.5 + Math.min(words, 3);
  if (!candidate.signals.length) score -= 3;
  if (candidate.within7) score += 2;
  if (candidate.blog7) score += Math.min(candidate.blog7 / 20, 3);
  if (candidate.searchRise === null) score += 2;
  else if (candidate.searchRise >= 1.5) score += Math.min(candidate.searchRise, 4);
  if (candidate.exclude.length) score -= 5;
  return Math.round(score * 10) / 10;
}

export function toCandidate(cluster, { until }) {
  const articles = [...cluster.articles].sort((a, b) => b.published.localeCompare(a.published));
  const text = articles.map((article) => `${article.title} ${article.description}`).join(" ");
  const latest = articles[0];
  const recentCut = new Date(new Date(until).valueOf() - 7 * DAY_MS).toISOString();
  return {
    keyword: cluster.keyword,
    title: latest.title,
    description: latest.description,
    field: latest.field,
    published: kstDate(latest.published),
    within7: articles.some((article) => article.published >= recentCut),
    outlets: [...new Set(articles.map((article) => article.outlet).filter(Boolean))],
    signals: signalsOf(text),
    exclude: excludedBy(text),
    links: articles.slice(0, 5).map((article) => ({ outlet: article.outlet, date: kstDate(article.published), url: article.link })),
  };
}
