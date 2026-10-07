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

test("장면을 3~4초 컷으로 나누고 카드는 짧게, 그림은 장면 안에서 되풀이하지 않는다", async () => {
  const { planShots } = await import("../src/youtube/render/compose.js");
  const scene = (id, type, start, end, asset = "-") => ({ id, sourceType: type, start, end, asset, fields: {} });
  const timeline = {
    chapters: [{ title: "오프닝", start: 0 }, { title: "사례", start: 35 }],
    scenes: [scene("S001", "TYPE", 0, 20), scene("S002", "GRAPHIC", 20, 35), scene("S003", "REAL", 35, 45, "A001"), scene("S004", "TYPE", 45, 50)],
  };
  const byKey = new Map([["A001", [{ file: "a.jpg", kind: "screen", credit: "공식 홈페이지" }]]]);
  const pool = [{ file: "b1.jpg", kind: "image", credit: "브런치" }, { file: "b2.jpg", kind: "image", credit: "브런치" }];
  const shots = planShots(timeline, { byKey, pool });
  const of = (id) => shots.filter((shot) => shot.scene.id === id);

  // TYPE 20초: 문구 카드 4초 → 그림 위 문구
  assert.equal(of("S001")[0].media, null);
  assert.equal(of("S001")[0].end, 4);
  assert.deepEqual(of("S001").slice(1).map((shot) => [shot.media.file, shot.mode]), [["b1.jpg", "type"], ["b2.jpg", "type"]]);
  // 도식 15초: 카드 6초 → 그림
  assert.equal(of("S002")[0].end, 26);
  assert.ok(of("S002").length > 1);
  // REAL 10초: 자기 자료 먼저(첫 컷 설명), 모자라면 공용 그림
  assert.deepEqual(of("S003").map((shot) => shot.media.file)[0], "a.jpg");
  assert.equal(of("S003")[0].mode, "caption");
  assert.equal(new Set(of("S003").map((shot) => shot.media.file)).size, of("S003").length);
  // 짧은 TYPE: 카드 하나
  assert.deepEqual(of("S004").map((shot) => shot.media), [null]);
  // 챕터 표시와 빈틈 없는 이어 붙이기
  assert.deepEqual(of("S003")[0].chapter, { no: "CH02", title: "사례" });
  for (let index = 1; index < shots.length; index += 1) assert.equal(shots[index].start, shots[index - 1].end);
});

test("scene_images가 있으면 장면마다 지정한 그림만 쓴다", async () => {
  const { planShots } = await import("../src/youtube/render/compose.js");
  const scene = (id, type, start, end) => ({ id, sourceType: type, start, end, asset: "-", fields: {} });
  const timeline = {
    chapters: [{ title: "오프닝", start: 0 }],
    scenes: [scene("S001", "REAL", 0, 10), scene("S002", "TYPE", 10, 14), scene("S003", "GRAPHIC", 14, 30), scene("S004", "AI", 30, 40)],
  };
  const img = (file) => ({ file, kind: "image", credit: "공식" });
  const sceneImages = new Map([["S001", [img("a.jpg"), img("b.jpg")]], ["S002", [img("c.jpg")]], ["S003", [img("d.jpg")]], ["S004", []]]);
  const pool = [img("pool.jpg")];
  const shots = planShots(timeline, { byKey: new Map(), pool, sceneImages });
  const of = (id) => shots.filter((shot) => shot.scene.id === id);
  assert.deepEqual(of("S001").map((shot) => [shot.media.file, shot.mode]), [["a.jpg", "caption"], ["a.jpg", "none"], ["b.jpg", "none"]]);
  // 그림 1장에 긴 장면: 같은 그림 클로즈업으로 한 컷 더
  const long = planShots({ chapters: [], scenes: [scene("S009", "REAL", 0, 8)] }, { sceneImages: new Map([["S009", [img("x.jpg")]]]) });
  assert.deepEqual(long.map((shot) => [shot.media.file, Boolean(shot.close)]), [["x.jpg", false], ["x.jpg", true]]);
  const screen = planShots({ chapters: [], scenes: [scene("S009", "REAL", 0, 8)] }, { sceneImages: new Map([["S009", [{ file: "s.jpg", kind: "screen" }]]]) });
  assert.deepEqual(screen.map((shot) => shot.media.file), ["s.jpg"]);
  assert.deepEqual(of("S002").map((shot) => [shot.media.file, shot.mode]), [["c.jpg", "type"]]);
  assert.deepEqual(of("S003").map((shot) => shot.media?.file ?? null), [null, "d.jpg", "d.jpg"]);
  assert.equal(of("S003")[0].end, 20);
  assert.deepEqual(of("S004").map((shot) => shot.media), [null]);
  assert.ok(!shots.some((shot) => shot.media?.file === "pool.jpg"));
  for (let index = 1; index < shots.length; index += 1) assert.equal(shots[index].start, shots[index - 1].end);
});

test("references.json 형식 검사", async () => {
  const { validateReferences } = await import("../src/youtube/references.js");
  assert.deepEqual(validateReferences({ items: [{ id: "A001", kind: "page", url: "https://www.heinz.com", source: "하인즈 공식 홈페이지", scenes: ["S003"] }] }), []);
  const errors = validateReferences({ items: [{ id: "A001", kind: "video", url: "youtube", scenes: [] }] });
  assert.ok(errors.some((error) => error.includes("kind")));
  assert.ok(errors.some((error) => error.includes("source")));
});

test("대본 메모([확인 필요]·챕터 전환)는 자막과 화면 문구에 나오지 않는다", async () => {
  const { subtitleCues } = await import("../src/youtube/render/timeline.js");
  const { screenLines, isTransition, sceneFrameHtml } = await import("../src/youtube/render/frames.js");
  const scene = (id, narration, text = "") => ({ id, sourceType: "GRAPHIC", start: 0, end: 5, asset: "-", fields: { NARRATION: narration, ON_SCREEN_TEXT: text } });
  const cues = subtitleCues({ scenes: [scene("S001", "노출 약 1,500만 회. [확인 필요]"), scene("S002", "챕터 전환")] });
  assert.deepEqual(cues.map((cue) => cue.text), ["노출 약 1,500만 회."]);
  assert.deepEqual(screenLines(scene("S001", "", "1,500만 노출 [확인 필요]")), ["1,500만 노출"]);
  assert.ok(isTransition(scene("S002", "챕터 전환")));
  const { html } = sceneFrameHtml(scene("S002", "챕터 전환", "04"), { chapter: { no: "CH04", title: "1등이기 때문에" } });
  assert.match(html, /CH04/);
  assert.match(html, /1등이기 때문에/);
});
