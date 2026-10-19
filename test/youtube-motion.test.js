import assert from "node:assert/strict";
import test from "node:test";
import { karaokeText, sfxEvents, SFX_LEVELS } from "../src/youtube/render/compose.js";
import { revealSeconds, revealTimes, sceneFrameHtml, withDot } from "../src/youtube/render/frames.js";
import { compareRows, motionCard, parseCount, timelineSteps, TREND_CREDIT, trendSeries } from "../src/youtube/render/motion.js";
import { analyzeStoryboard } from "../src/youtube/validate.js";
import { weeklySeries } from "../src/naver/youtube.js";

const scene = (motion, text, sourceType = "GRAPHIC") => ({ id: "S001", sourceType, motion, fields: { NARRATION: "말", ON_SCREEN_TEXT: text } });
const weeks = (values) => values.map((ratio, i) => ({ period: `2026-08-${String(1 + i * 7).padStart(2, "0")}`, ratio }));

test("숫자 줄에서 앞뒤 말과 숫자를 나눈다", () => {
  assert.deepEqual(parseCount("약 3,000만 명"), { prefix: "약 ", value: 3000, decimals: 0, comma: true, suffix: "만 명" });
  assert.equal(parseCount("1.5배").decimals, 1);
  assert.equal(parseCount("숫자 없음"), null);
});

test("연표·비교 줄 읽기", () => {
  assert.deepEqual(timelineSteps(["2019 · 곰팡이 와퍼", "2023: 레트로 로고"]), [{ label: "2019", text: "곰팡이 와퍼" }, { label: "2023", text: "레트로 로고" }]);
  assert.deepEqual(compareRows(["A vs B", "가 | 나"]), { head: ["A", "B"], rows: [["가", "나"]] });
  assert.equal(compareRows(["비교 아님"]), null);
});

test("검색량 그래프는 같은 눈금으로 0~100", () => {
  const lines = trendSeries({ series: { 가: weeks([10, 20, 40]), 나: weeks([5, 5, 5]) } }, ["가", "나"]);
  assert.equal(lines[0].points.at(-1).value, 100);
  assert.equal(lines[1].points[0].value, 12.5);
  assert.equal(trendSeries({ series: {} }), null);
  assert.equal(trendSeries(null), null);
});

test("MOTION 카드: 움직임 길이와 효과음을 함께 돌려준다", () => {
  const count = motionCard(scene({ type: "count" }, "46,000명\n유료 관객"));
  assert.match(count.html, /data-count="46000"/);
  assert.deepEqual(count.sfx.map((item) => item.name), ["tick", "ding"]);
  assert.ok(count.seconds > 1.5);
  const timeline = motionCard(scene({ type: "timeline" }, "2017 · 하나\n2019 · 둘\n2023 · 셋"));
  assert.equal(timeline.sfx.length, 3);
  assert.ok(motionCard(scene({ type: "compare" }, "A vs B")));
  assert.ok(motionCard(scene({ type: "quote" }, "한 문장\n— 누군가")).html.includes("— 누군가"));
  const trend = motionCard(scene({ type: "trend", arg: "가" }, "검색량"), { trend: { series: { 가: weeks([1, 2, 3, 4]) } } });
  assert.equal(trend.credit, TREND_CREDIT);
  assert.match(trend.html, /데이터랩/);
  // 그릴 자료가 없으면 null → 보통 카드
  assert.equal(motionCard(scene({ type: "trend" }, "검색량"), { trend: null }), null);
  assert.equal(motionCard(scene({ type: "count" }, "숫자 없음")), null);
  const fallback = sceneFrameHtml(scene({ type: "count" }, "숫자 없음"), {});
  assert.ok(fallback.html && fallback.seconds > 0);
  for (const item of [...count.sfx, ...timeline.sfx, ...trend.sfx]) assert.ok(item.name in SFX_LEVELS);
});

test("보통 카드도 한 줄씩 나타나고 끝나는 시각을 안다", () => {
  const card = sceneFrameHtml(scene(null, "첫째 → 둘째 → 셋째"), {});
  assert.equal(card.sfx[0].name, "pop");
  assert.equal(card.seconds, revealSeconds(card.html));
  assert.ok(card.seconds > 0.6 && card.seconds < 2);
  assert.equal(revealSeconds("<div>정지</div>"), 0);
});

test("효과음 자리: 간지·카드·스크롤, 같은 소리 0.3초 안 중복은 하나만", () => {
  const a = { chapterCard: false };
  const events = sfxEvents([10], [
    { start: 0, end: 3, scene: a, sfx: [{ name: "pop", at: 0.05 }, { name: "pop", at: 0.2 }, { name: "ding", at: 5 }] },
    { start: 3, end: 6, scene: a, media: { kind: "scroll" } },
  ]);
  assert.deepEqual(events.map((event) => [event.name, Number(event.time.toFixed(2))]), [["pop", 0.05], ["scroll", 3.1], ["chapter", 10]]);
});

test("낱말 강조 자막: 받아쓰기 시각을 따르고 줄 길이를 넘지 않는다", () => {
  const sum = (text) => [...text.matchAll(/\\k(\d+)/g)].reduce((total, match) => total + Number(match[1]), 0);
  const plain = karaokeText("가나 다라 마바", 2);
  assert.equal(sum(plain), 184);
  const timed = karaokeText("가나 다라 마바", 2, [{ frac: 0, time: 0 }, { frac: 0.375, time: 1.2 }]);
  assert.match(timed, /^\{\\k120\}가나/);
  assert.ok(sum(timed) <= 184);
});

test("스토리보드 MOTION은 선택 항목", () => {
  const block = (id, time, extra = "") => `SCENE ID: ${id}\nTIME: ${time}\nNARRATION: 말\nVISUAL: 그림\nSOURCE_TYPE: GRAPHIC\nON_SCREEN_TEXT: 1,000명\nASSET: -\nHIGGSFIELD_REQUIRED: NO\n${extra}\n`;
  const result = analyzeStoryboard([block("S001", "00:00-00:05", "MOTION: trend 버거킹,맥도날드"), block("S002", "00:05-00:10"), block("S003", "00:10-00:15", "MOTION: spin")].join("\n"));
  assert.deepEqual(result.scenes[0].motion, { type: "trend", arg: "버거킹,맥도날드" });
  assert.equal(result.scenes[0].fields.HIGGSFIELD_REQUIRED, "NO");
  assert.equal(result.scenes[1].motion, null);
  assert.ok(!result.errors.some((error) => /MOTION/.test(error)));
  assert.ok(result.warnings.some((warning) => /S003: MOTION/.test(warning)));
});

test("데이터랩 일별 값 → 주 평균", () => {
  const days = Array.from({ length: 10 }, (_, i) => ({ period: `2026-08-${String(i + 1).padStart(2, "0")}`, ratio: i < 7 ? 7 : 1 }));
  assert.deepEqual(weeklySeries(days), [{ period: "2026-08-01", ratio: 7 }, { period: "2026-08-08", ratio: 1 }]);
});

test("릴스 합성기도 같은 도식 종류·효과음 파일을 쓴다", async () => {
  const { readFile, access } = await import("node:fs/promises");
  const compose = await readFile("insight-reels/scripts/compose.py", "utf8");
  for (const kind of ["count", "trend", "timeline", "compare", "quote", "scroll"]) assert.match(compose, new RegExp(`kind == "${kind}"`));
  const levels = JSON.parse(compose.match(/SFX_LEVELS = (\{[^}]*\})/)[1]);
  for (const [name, level] of Object.entries(levels)) {
    assert.equal(level, SFX_LEVELS[name], name);
    await access(`bruce-youtube/channel/sfx/${name}.mp3`);
  }
  await access("bruce-youtube/channel/sfx/chapter.mp3");
});

test("카드 항목은 그 말을 할 때 하나씩 나타나고, 받아쓰기가 없으면 예전처럼 한꺼번에", () => {
  // "구조를 만들고(0.0~) 논리로 설명하고(2.0~) 틀리면 고칩니다(4.0~)" 를 글자마다 0.25초로
  const said = [["구조를만들고", 0], ["논리로설명하고", 2], ["틀리면고칩니다", 4]];
  const speech = { chars: "", times: [], seconds: 6 };
  for (const [text, start] of said) [...text].forEach((char, i) => { speech.chars += char; speech.times.push(start + i * 0.25); });
  const times = revealTimes(["구조 만들기", "논리 설명", "틀리면 고치기"], speech);
  assert.deepEqual(times, [0.2, 1.8, 3.8]);
  // 못 찾은 가운데 항목은 앞뒤 사이, 첫 항목은 화면이 비지 않게 바로
  assert.deepEqual(revealTimes(["구조", "없는 말", "틀리면"], speech), [0.2, 2, 3.8]);
  assert.equal(revealTimes(["구조", "틀리면"], null), null);
  const card = sceneFrameHtml(scene(null, "구조 만들기 → 논리 설명 → 틀리면 고치기"), { speech });
  assert.match(card.html, /class="box rv" style="--i:0;--d:1\.40s">논리 설명/); // 가로 흐름은 칸 사이 최대 1.2초
  assert.ok(card.seconds > 2.6);
  assert.match(sceneFrameHtml(scene(null, "구조 만들기 → 논리 설명")).html, /style="--i:2">논리 설명/);
});

test("문구 끝 초록 점은 한 번만 — 마침표가 있으면 바꾸고, 물음표·느낌표 뒤엔 안 붙인다", () => {
  assert.equal(withDot("아이디어보다 판단을."), '아이디어보다 판단을<span class="dot">.</span>');
  assert.equal(withDot("하나로 이어진다"), '하나로 이어진다<span class="dot">.</span>');
  assert.equal(withDot("왜 회사 일 밖에서도?"), "왜 회사 일 밖에서도?");
  assert.doesNotMatch(sceneFrameHtml(scene(null, "정답보다 맥락을.\n아이디어보다 판단을.", "TYPE")).html, /\.<span class="dot">/);
});
