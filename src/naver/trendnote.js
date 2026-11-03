// 「브루스의 트렌드 노트」(매주 수요일)용 네이버 신호.
// 화요일 저녁 루틴이 쓰기 전에 국내 마케팅 사례 후보(뉴스·블로그·데이터랩)를 모으고,
// 루틴이 고른 사례 이름의 검색 관심도를 다시 잰다. 후보일 뿐이다. 채택 전에 원문을 연다.
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// 트렌드 노트 코너(소비자 / AI 검색 / 커머스 / 일하는 법 / 브랜드 캠페인)에 맞춘 검색어.
export const TREND_NOTE_QUERIES = [
  { field: "브랜드 캠페인", queries: ["브랜드 캠페인 공개 화제", "광고 캠페인 조회수 돌파", "브랜드 필름 공개", "브랜드 콜라보 완판"] },
  { field: "소비자", queries: ["소비 트렌드 키워드", "MZ 소비 열풍", "팝업스토어 방문객", "오픈런 화제"] },
  { field: "AI 검색", queries: ["AI 검색 브랜드", "생성형 AI 광고 캠페인", "GEO 생성형 엔진 최적화", "AI 에이전트 쇼핑"] },
  { field: "커머스", queries: ["크리에이터 커머스", "라이브커머스 매출", "리테일 미디어 광고", "숏폼 커머스"] },
  { field: "일하는 법", queries: ["마케터 AI 활용", "광고대행사 AI", "마케팅 조직 AI 에이전트"] },
  { field: "리포트", queries: ["마케팅 트렌드 리포트", "광고비 전망 보고서", "소비자 조사 결과 발표"] },
];

export function kstDateOf(value) {
  return new Date(new Date(value).valueOf() + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
}

// 화요일 저녁에 돌면 다음 날 수요일, 수요일에 돌면 그날.
export function upcomingWednesday(now = new Date()) {
  const kst = new Date(now.valueOf() + SEOUL_OFFSET_MS);
  const add = (3 - kst.getUTCDay() + 7) % 7;
  return new Date(kst.valueOf() + add * DAY_MS).toISOString().slice(0, 10);
}

// 루틴이 넘긴 "이케아, 풀무원, 영점소비" → 정리된 최대 15개.
export function parseKeywords(value = "") {
  const seen = new Set();
  return String(value)
    .split(/[,\n]/)
    .map((word) => word.trim().replace(/\s+/g, " "))
    .filter((word) => word && word.length <= 30 && !seen.has(word) && seen.add(word))
    .slice(0, 15);
}

// 데이터랩 일별 수치 → 최근 7일 평균 ÷ 그 전 21일 평균, 그리고 최근 7일 평균값(그 묶음 안 상대값).
export function interestSummary(data = [], { until }) {
  const recentStart = kstDateOf(new Date(until).valueOf() - 6 * DAY_MS);
  const recent = [];
  const before = [];
  for (const point of data) (point.period >= recentStart ? recent : before).push(point.ratio);
  const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
  const now = mean(recent);
  const prev = mean(before);
  return {
    recent7: Math.round(now * 10) / 10,
    rise: now === 0 ? 0 : prev === 0 ? null : Math.round((now / prev) * 100) / 100,
    peak: data.reduce((best, point) => (point.ratio > (best?.ratio ?? -1) ? point : best), null)?.period ?? null,
  };
}
