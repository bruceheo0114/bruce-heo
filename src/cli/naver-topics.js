import { readdir, readFile } from "node:fs/promises";
import { readJson, writeJson } from "../lib/files.js";
import { kstDate, parseNaverDate } from "../naver/issues.js";
import { naverClient } from "../naver/openapi.js";

// 브런치 글감 찾기: 브루스가 쓰는 영역(브랜드 사례·소비 현상·마케터의 일·시즌)의 키워드를
// 데이터랩 관심도·상승률, 최근 7일 뉴스 수, 블로그 경쟁 글 수로 비교해 data/topic-ideas.json 에 남긴다.
// (GitHub Actions: naver-topics.yml, 필요할 때 수동 실행)
const DAY_MS = 24 * 60 * 60 * 1000;
const ANCHOR = "마케팅"; // 데이터랩은 요청마다 상대값이라, 모든 요청에 같은 기준어를 넣어 서로 비교할 수 있게 한다.
const THEMES = {
  "브랜드 현상": ["팝업스토어", "브랜드 콜라보", "굿즈 마케팅", "한정판", "밈 마케팅", "숏폼 광고", "브랜드 필름", "숏드라마 광고", "브랜드 세계관", "캐릭터 마케팅", "팬덤 마케팅", "리브랜딩", "오픈런"],
  "소비 현상": ["러닝크루", "저속노화", "디저트 유행", "필사", "혼행", "무지출 챌린지", "편의점 신상", "가성비", "취향 소비", "경험 소비"],
  "마케터의 일": ["AI 광고", "AI 마케팅", "생성형 AI 광고", "광고대행사", "마케터 이직", "퍼스널 브랜딩", "콘텐츠 마케팅", "인플루언서 마케팅", "브랜드 마케팅", "IMC"],
  "시즌": ["빼빼로데이", "수능 마케팅", "블랙프라이데이", "크리스마스 마케팅", "연말 캠페인", "트렌드코리아 2027", "2027 트렌드"],
};

const now = new Date();
const naver = naverClient();
const keywords = Object.entries(THEMES).flatMap(([theme, words]) => words.map((word) => ({ theme, word })));

// 1) 관심도·상승률: 최근 13주 주 단위, 기준어 대비 비율.
const startDate = kstDate(now.valueOf() - 91 * DAY_MS);
const endDate = kstDate(now);
const recentCut = kstDate(now.valueOf() - 28 * DAY_MS);
const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
for (let index = 0; index < keywords.length; index += 4) {
  const group = keywords.slice(index, index + 4);
  const body = await naver.trend({
    startDate,
    endDate,
    timeUnit: "week",
    keywordGroups: [ANCHOR, ...group.map((entry) => entry.word)].map((word) => ({ groupName: word, keywords: [word] })),
  });
  const anchor = mean((body.find((result) => result.title === ANCHOR)?.data ?? []).map((point) => point.ratio)) || 1;
  for (const entry of group) {
    const data = body.find((result) => result.title === entry.word)?.data ?? [];
    const recent = mean(data.filter((point) => point.period >= recentCut).map((point) => point.ratio));
    const before = mean(data.filter((point) => point.period < recentCut).map((point) => point.ratio));
    entry.interest = Math.round((recent / anchor) * 1000) / 10; // 기준어(마케팅) 13주 평균 = 100
    entry.rise = before ? Math.round((recent / before) * 100) / 100 : recent ? null : 0;
  }
}

// 2) 화제성(최근 7일 뉴스 수, 최대 100)과 경쟁(블로그 전체 글 수).
const weekAgo = new Date(now.valueOf() - 7 * DAY_MS);
for (const entry of keywords) {
  const news = await naver.search("news", entry.word, { sort: "date" });
  entry.news7 = news.filter((item) => (parseNaverDate(item.pubDate) ?? 0) >= weekAgo).length;
  entry.blogTotal = await naver.total("blog", entry.word);
}

// 3) 이미 쓴 글과 겹치는지(브런치 캐시 제목).
const titles = [];
for (const file of (await readdir("insight-reels/brunch_cache")).filter((name) => name.endsWith(".txt"))) {
  titles.push((await readFile(`insight-reels/brunch_cache/${file}`, "utf8")).split("\n")[0]);
}
for (const entry of keywords) entry.written = titles.filter((title) => title.includes(entry.word.split(" ")[0])).slice(0, 3);

// 4) 이번 주 이슈 후보 중 브랜드 사례(「X는 왜 ~했을까」 소재).
const candidateFiles = (await readdir("insight-reels/candidates")).filter((name) => name.endsWith(".json")).sort();
const latest = candidateFiles.length ? await readJson(`insight-reels/candidates/${candidateFiles.at(-1)}`) : { candidates: [] };
const cases = latest.candidates.slice(0, 20).map((candidate) => ({
  title: candidate.title,
  keyword: candidate.keyword,
  outlets: candidate.outlets.length,
  signals: candidate.signals.slice(0, 3),
  searchRise: candidate.searchRise,
  url: candidate.links[0]?.url,
  written: candidate.keyword ? titles.filter((title) => title.includes(candidate.keyword)).slice(0, 2) : [],
}));

await writeJson("data/topic-ideas.json", {
  generated_at: now.toISOString(),
  window: { trend: `${startDate}~${endDate} (주 단위, 최근 4주 vs 그 전 9주)`, news: "최근 7일" },
  source: `네이버 데이터랩·검색 API · ${naver.provider}`,
  note: `interest 는 기준어 "${ANCHOR}" 13주 평균을 100으로 둔 최근 4주 관심도, rise 는 최근 4주 ÷ 그 전 9주(null = 새로 생김).`,
  keywords: keywords.sort((a, b) => (b.rise ?? 9) - (a.rise ?? 9)),
  cases,
});
console.log(`data/topic-ideas.json: 키워드 ${keywords.length}개 · 사례 ${cases.length}개 (${naver.provider} API ${naver.calls}회)`);
