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

test("긴 장면은 카드 → 자료 → 공용 그림으로 컷을 나누고 같은 그림을 되풀이하지 않는다", async () => {
  const { planShots } = await import("../src/youtube/render/compose.js");
  const scene = (id, type, start, end, asset = "-") => ({ id, sourceType: type, start, end, asset, fields: {} });
  const timeline = { scenes: [scene("S001", "TYPE", 0, 20), scene("S002", "GRAPHIC", 20, 35), scene("S003", "REAL", 35, 45, "A001"), scene("S004", "TYPE", 45, 50)] };
  const byKey = new Map([["A001", [{ file: "a.jpg", kind: "screen", credit: "공식 홈페이지" }]]]);
  const pool = [{ file: "b1.jpg", kind: "image", credit: "브런치" }, { file: "b2.jpg", kind: "image", credit: "브런치" }];
  const shots = planShots(timeline, { byKey, pool });
  const s1 = shots.filter((shot) => shot.scene.id === "S001");
  assert.equal(s1[0].media, null);
  assert.equal(s1[0].end, 6);
  assert.deepEqual(s1.slice(1).map((shot) => shot.media.file), ["b1.jpg", "b2.jpg"]);
  assert.equal(shots.filter((shot) => shot.scene.id === "S002").length, 1);
  assert.deepEqual(shots.filter((shot) => shot.scene.id === "S003").map((shot) => shot.media?.file), ["a.jpg", "b1.jpg"]);
  assert.deepEqual(shots.filter((shot) => shot.scene.id === "S004").map((shot) => shot.media), [null]);
  for (let index = 1; index < shots.length; index += 1) assert.equal(shots[index].start, shots[index - 1].end);
});

test("references.json 형식 검사", async () => {
  const { validateReferences } = await import("../src/youtube/references.js");
  assert.deepEqual(validateReferences({ items: [{ id: "A001", kind: "page", url: "https://www.heinz.com", source: "하인즈 공식 홈페이지", scenes: ["S003"] }] }), []);
  const errors = validateReferences({ items: [{ id: "A001", kind: "video", url: "youtube", scenes: [] }] });
  assert.ok(errors.some((error) => error.includes("kind")));
  assert.ok(errors.some((error) => error.includes("source")));
});
