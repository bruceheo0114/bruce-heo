// 평일 아침 마케팅 트렌드 수집기 — GPT(Responses API + web_search)로 공개 기사만 모은다.
// 결과: data/trend/YYYY-MM-DD.json (A 업계 트렌드, B 화제 캠페인). 메일은 보내지 않는다.
// 고객사 정보는 이 파일·프롬프트·결과 어디에도 넣지 않는다. "옮길 점"은 발송 루틴이 따로 쓴다.
import fs from "node:fs/promises";
import OpenAI from "openai";
import { CONFIG } from "../config.js";

const DIR = "data/trend";
const SENT = `${DIR}/sent.json`;
const HOLIDAYS = new Set([
  "2026-10-05", "2026-10-09", "2026-12-25",
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-01", "2027-05-05", "2027-05-13",
  "2027-08-16", "2027-09-14", "2027-09-15", "2027-09-16", "2027-10-04", "2027-10-11", "2027-12-27",
]);
const MAX_TOOL_CALLS = Number(process.env.TREND_MAX_TOOL_CALLS ?? 14); // 섹션당 검색 상한

const SECTIONS = {
  A: {
    label: "업계 트렌드",
    hours: 48,
    count: 10,
    brief:
      "이너뷰티·건강기능식품·웰니스 / 뷰티·K뷰티 / 메디컬 에스테틱·뷰티 디바이스 / 말차·티·F&B·캐릭터 IP 콜라보 / 커머스·리테일 테크 업계의 시장 변화·신제품·주요 기업 움직임. 국내와 해외를 섞는다.",
    domains: [
      "glossy.co", "wwd.com", "businessoffashion.com", "cosmeticsbusiness.com", "nutraingredients.com",
      "nutritionaloutlook.com", "fooddive.com", "bevnet.com", "modernretail.co", "retaildive.com",
      "cmn.co.kr", "jangup.com", "beautynury.com", "thinkfood.co.kr", "health.chosun.com",
      "hankyung.com", "mk.co.kr", "kmjournal.net",
    ],
  },
  B: {
    label: "화제 캠페인",
    hours: 24 * 7,
    count: 10,
    brief:
      "업종과 상관없이 국내외에서 화제가 된 광고·캠페인·브랜드 활동. 실행 디테일(채널, 형식, 숫자)이 있는 것.",
    domains: [
      "adweek.com", "adage.com", "campaignlive.com", "campaignlive.co.uk", "thedrum.com", "marketingdive.com",
      "lbbonline.com", "creativereview.co.uk", "madtimes.co.kr", "the-pr.co.kr", "brandbrief.co.kr", "openads.co.kr",
    ],
  },
};

const ITEM = {
  type: "object",
  additionalProperties: false,
  required: ["region", "field", "title", "date", "url", "source", "what", "why"],
  properties: {
    region: { type: "string", enum: ["국내", "해외"] },
    field: { type: "string", description: "분야 2~6자, 예: 이너뷰티, K뷰티, 리테일, 광고" },
    title: { type: "string", description: "한국어 제목 40자 이내" },
    date: { type: "string", description: "기사 게시일 YYYY-MM-DD" },
    url: { type: "string", description: "검색 결과에 실제로 나온 기사 URL" },
    source: { type: "string", description: "매체명" },
    what: { type: "string", description: "무엇을: 브랜드·캠페인명, 채널, 숫자. 사실만, 한 문장" },
    why: { type: "string", description: "왜: 소비자 행동 관점 한 문장" },
  },
};
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: { items: { type: "array", items: ITEM } },
};

const kst = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

async function readJson(path, fallback) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function reachable(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const r = await fetch(url, { method, redirect: "follow", headers: CONFIG.fetchHeaders, signal: AbortSignal.timeout(15_000) });
      if (r.status < 400) return true;
    } catch {}
  }
  return false;
}

function sourcesOf(response) {
  const urls = new Set();
  for (const out of response.output ?? []) {
    for (const s of out.action?.sources ?? []) if (s.url) urls.add(s.url.split("#")[0]);
    for (const c of out.content ?? []) for (const a of c.annotations ?? []) if (a.url) urls.add(a.url.split("#")[0]);
  }
  return urls;
}

async function collect(client, key, today, windowHours, exclude) {
  const s = SECTIONS[key];
  const hours = key === "A" ? windowHours : s.hours;
  const since = kst(new Date(Date.now() - hours * 3600e3));
  const response = await client.responses.create({
    model: CONFIG.openaiModel,
    reasoning: { effort: "low" },
    tools: [{ type: "web_search", filters: { allowed_domains: s.domains } }],
    max_tool_calls: MAX_TOOL_CALLS,
    include: ["web_search_call.action.sources"],
    instructions: [
      "너는 한국 PR 에이전시의 마케팅 트렌드 리서처다. 웹 검색으로 공개 기사만 찾아 정리한다.",
      "규칙: 검색 결과에 실제로 나온 URL만 쓴다. 지어내지 않는다. 게시일을 확인 못 하면 뺀다.",
      "보도자료를 그대로 옮긴 기사, 숫자·실행 디테일이 없는 기사, 쇼핑몰 상품 페이지, 개인 SNS는 뺀다.",
      "같은 소식은 한 건으로. 모든 문장은 한국어.",
    ].join("\n"),
    input: [
      `오늘은 ${today}(KST)다. [${s.label}] ${s.count}건을 찾아라.`,
      `범위: ${s.brief}`,
      `기간: ${since} 이후 게시된 기사만.`,
      exclude.length ? `이미 보낸 URL(다시 쓰지 말 것):\n${exclude.join("\n")}` : "",
      `채우지 못하면 있는 만큼만. 억지로 채우지 않는다.`,
    ].filter(Boolean).join("\n\n"),
    text: { format: { type: "json_schema", name: "trend_items", strict: true, schema: SCHEMA } },
  });
  if (response.status !== "completed" || !response.output_text) {
    throw new Error(`${key} 응답 미완료: ${response.status} ${response.error?.message ?? ""}`);
  }
  const seen = sourcesOf(response);
  const items = [];
  for (const it of JSON.parse(response.output_text).items) {
    const url = it.url.split("#")[0];
    if (exclude.includes(url) || items.some((x) => x.url === url)) continue;
    if (it.date < since || it.date > today) continue;
    if (!seen.has(url) && !(await reachable(url))) {
      console.log(`  제외(확인 안 됨): ${url}`);
      continue;
    }
    items.push({ ...it, url });
  }
  const calls = (response.output ?? []).filter((o) => o.type === "web_search_call").length;
  return { items: items.slice(0, s.count), usage: { ...response.usage, web_search_calls: calls } };
}

async function main() {
  const today = process.env.TREND_DATE || kst();
  const dow = new Date(`${today}T00:00:00+09:00`).getUTCDay(); // KST 기준 요일
  if (!process.env.TREND_FORCE && (dow === 0 || dow === 6 || HOLIDAYS.has(today))) {
    console.log(`${today}: 쉬는 날 — 수집하지 않음`);
    return;
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY 가 없습니다");
  await fs.mkdir(DIR, { recursive: true });
  const sent = await readJson(SENT, []);
  const cutoff = kst(new Date(Date.now() - 21 * 864e5));
  const recent = sent.filter((s) => s.date >= cutoff);
  const exclude = recent.map((s) => s.url);

  // 월요일·연휴 다음 날은 마지막 발송 이후 전체(최대 96시간)
  let windowHours = 48;
  const last = recent.map((s) => s.date).sort().at(-1);
  if (last) {
    const gap = (new Date(`${today}T08:00:00+09:00`) - new Date(`${last}T08:00:00+09:00`)) / 3600e3;
    windowHours = Math.min(96, Math.max(48, gap + 24));
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const A = await collect(client, "A", today, windowHours, exclude);
  const B = await collect(client, "B", today, windowHours, exclude);
  const report = {
    date: today,
    generated_at: new Date().toISOString(),
    model: CONFIG.openaiModel,
    window_hours: { A: windowHours, B: SECTIONS.B.hours },
    usage: { A: A.usage, B: B.usage },
    A: A.items,
    B: B.items,
  };
  if (process.env.TREND_FORCE) {
    // 시험 실행: 발송 루틴이 집지 않도록 test- 접두어, 중복 기록(sent.json)도 남기지 않는다
    await fs.writeFile(`${DIR}/test-${today}.json`, JSON.stringify(report, null, 2) + "\n");
  } else {
    await fs.writeFile(`${DIR}/${today}.json`, JSON.stringify(report, null, 2) + "\n");
    const added = [...A.items, ...B.items].map((x) => ({ date: today, url: x.url }));
    await fs.writeFile(SENT, JSON.stringify([...recent, ...added], null, 2) + "\n");
  }
  console.log(`${today}: A ${A.items.length}건 · B ${B.items.length}건`);
  console.log(`사용량 A ${JSON.stringify(A.usage)} / B ${JSON.stringify(B.usage)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
