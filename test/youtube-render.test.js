import assert from "node:assert/strict";
import test from "node:test";
import { buildAss, buildSrt, buildUploadKit } from "../src/youtube/render/compose.js";
import { buildTimeline, chapterIdFromFile, formatClock, parseScriptChapters, subtitleCues } from "../src/youtube/render/timeline.js";

const scene = (id, start, end, narration = "문장입니다.") => ({
  id,
  time: { start, end },
  sourceType: "TYPE",
  fields: { NARRATION: narration },
});

const script = "## CH01 오프닝 (00:00-01:00)\n본문\n\n## CH02 사례 (01:00-03:00)\n본문\n";

test("대본 챕터 제목과 계획 시간을 읽는다", () => {
  assert.deepEqual(parseScriptChapters(script), [
    { id: "CH01", title: "오프닝", start: 0, end: 60 },
    { id: "CH02", title: "사례", start: 60, end: 180 },
  ]);
  assert.equal(chapterIdFromFile("EP001_CH02.m4a"), "CH02");
});

test("챕터별 녹음 길이에 맞춰 Scene 시간을 늘이고 줄인다", () => {
  const scenes = [scene("S001", 0, 30), scene("S002", 30, 60), scene("S003", 60, 120), scene("S004", 120, 180)];
  const timeline = buildTimeline(scenes, parseScriptChapters(script), [
    { file: "EP001_CH01.m4a", seconds: 90 },
    { file: "EP001_CH02.m4a", seconds: 100 },
  ]);
  assert.equal(timeline.mode, "chapter");
  assert.equal(timeline.total, 190);
  assert.deepEqual(timeline.scenes.map((s) => [s.start, s.end]), [[0, 45], [45, 90], [90, 140], [140, 190]]);
  assert.deepEqual(timeline.chapters, [{ title: "오프닝", start: 0 }, { title: "사례", start: 90 }]);
});

test("한 파일 녹음이면 전체 비율로 맞추고 챕터 표시도 옮긴다", () => {
  const scenes = [scene("S001", 0, 60), scene("S002", 60, 180)];
  const timeline = buildTimeline(scenes, parseScriptChapters(script), [{ file: "EP001.m4a", seconds: 360 }]);
  assert.equal(timeline.mode, "global");
  assert.deepEqual(timeline.scenes.map((s) => [s.start, s.end]), [[0, 120], [120, 360]]);
  assert.deepEqual(timeline.chapters, [{ title: "오프닝", start: 0 }, { title: "사례", start: 120 }]);
});

test("자막은 Scene 안에서 글자 수 비율로 나뉘고 낭독 기호는 지운다", () => {
  const timeline = { scenes: [{ ...scene("S001", 0, 10), start: 0, end: 10, fields: { NARRATION: "첫 문장 / 입니다. [쉼] **둘째** 문장." } }] };
  const cues = subtitleCues(timeline);
  assert.deepEqual(cues.map((cue) => cue.text), ["첫 문장 입니다.", "둘째 문장."]);
  assert.equal(cues.at(-1).end, 10);
  assert.match(buildAss(cues), /Dialogue: 0,0:00:00\.00,0:00:06\.00,Default,,0,0,0,,첫 문장 입니다\./);
  assert.match(buildSrt(cues), /^1\n00:00:00,000 --> 00:00:06,000\n첫 문장 입니다\./);
});

test("업로드 정보에 실제 녹음 기준 챕터 시간이 들어간다", () => {
  const kit = buildUploadKit(
    { status: { episode: "EP001", article: { url: "https://brunch.co.kr/@heoboram/208", title: "하인즈" }, generated: {} } },
    "## One Sentence Thesis\n저관여일수록 먼저 떠올라야 한다.\n## Title Candidates\n- 제목 A\n- 제목 B\n",
    { chapters: [{ title: "오프닝", start: 0 }, { title: "사례", start: 95 }] },
  );
  assert.match(kit, /## 제목 \(1순위\)\n\n제목 A/);
  assert.match(kit, /00:00 오프닝\n01:35 사례/);
  assert.match(kit, /'아니요'/);
  assert.equal(formatClock(3725), "1:02:05");
});
