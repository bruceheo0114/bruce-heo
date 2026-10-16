// 스레드 훅용: 브런치 원문에 나오는 이름(브랜드·캠페인·제품) 중 지금 네이버에서 많이 찾는 것을 고른다.
// 이름은 원문에서만 뽑는다(THREADS.md 「사실은 원문에 있는 것만」). 여기서는 검색량만 붙이고, 훅은 금요일 원고 루틴이 쓴다.
const PARTICLE = /(에서|에게|으로|까지|부터|처럼|이라는|라는|이란|은|는|이|가|의|을|를|에|도|와|과|로|만)$/;
const STOP = new Set([
  "왜", "어떻게", "무엇", "무엇을", "이야기", "마케팅", "마케터", "브랜드", "콘텐츠", "광고", "캠페인", "사람", "사람들", "우리",
  "하는", "했던", "위한", "이유", "진짜", "요즘", "지금", "오해", "화제", "생각", "시대", "방법", "정말", "그리고", "하지만",
  "그래서", "이런", "그런", "저런", "이제", "다시", "모두", "모든", "가장", "하나", "때문", "그것", "이것", "통해", "대한",
  "아니라", "있는", "없는", "좋은", "되는", "내가", "만든", "그래", "Account",
]);
const VERB_END = /\p{Script=Hangul}(다|까|고|던|요)$/u; // "뜬다"·"할까"·"후회된다고" 같은 서술어는 이름이 아니다.

function stem(token) {
  const clean = token.replace(/[^\p{L}\p{N}&.+-]/gu, "");
  if (clean.length > 2 && /\p{Script=Hangul}$/u.test(clean)) return clean.replace(PARTICLE, "");
  return clean;
}

function count(body, term) {
  let total = 0;
  for (let index = body.indexOf(term); index !== -1; index = body.indexOf(term, index + term.length)) total += 1;
  return total;
}

// 제목 낱말 · 따옴표/「」/<> 안 이름 · 영문 고유명사 중 본문에 자주 나오는 것 최대 5개(데이터랩 한 번 요청 = 서로 비교 가능).
export function extractTerms(title, body, limit = 5) {
  const found = new Map();
  const add = (raw, bonus = 0) => {
    const term = raw.trim();
    if (term.length < 2 || term.length > 15 || STOP.has(term) || VERB_END.test(term) || /^\d+(년째|년|월|일|개|명|화|%)?$/.test(term)) return;
    found.set(term, Math.max(found.get(term) ?? 0, count(body, term) + bonus));
  };
  for (const token of title.split(/\s+/)) add(stem(token), 2);
  for (const [, inner] of `${title}\n${body}`.matchAll(/['‘"“「『<《]([^'’"”」』>》\n]{2,12})['’"”」』>》]/g)) add(inner, 1);
  for (const [word] of body.matchAll(/\b[A-Z][A-Za-z0-9&.+-]{2,14}\b/g)) add(word);
  return [...found.entries()]
    .filter(([, score]) => score >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

// 데이터랩 일별 수치 평균(같은 요청 안의 이름끼리만 비교할 수 있다).
export function trendAverage(data) {
  if (!data?.length) return 0;
  return Math.round((data.reduce((sum, point) => sum + point.ratio, 0) / data.length) * 10) / 10;
}
