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

test("업로드 정보에 그 편의 해시태그·태그·고정 댓글이 들어간다", () => {
  const kit = buildUploadKit(
    { status: { episode: "EP002", article: { url: "https://brunch.co.kr/@heoboram/223", title: "LG" }, generated: {} } },
    "## Title Candidates\n- 제목\n## Hashtags\n#르게다꼼 #브랜드마케팅 #마케팅\n## Tags\n르게다꼼, LG전자 광고\n## Pinned Comment\n여러분 브랜드는 어떻게 읽히나요?\n",
    { chapters: [{ title: "오프닝", start: 0 }] },
  );
  assert.match(kit, /#르게다꼼 #브랜드마케팅 #마케팅 #브루스인사이트 #브랜딩/);
  assert.match(kit, /르게다꼼, LG전자 광고, 마케팅, 브랜딩/);
  assert.match(kit, /## 고정 댓글\n\n```\n여러분 브랜드는 어떻게 읽히나요\?/);
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
  assert.deepEqual(of("S001").map((shot) => [shot.media.file, shot.mode]), [["a.jpg", "caption"], ["a.jpg", "caption"], ["b.jpg", "caption"]]);
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
  assert.match(html, /CHAPTER 04/);
  assert.match(html, /1등이기 때문에/);
});

test("대본을 챕터별 읽기용 텍스트로 바꾼다", async () => {
  const { chapterNarrationTexts } = await import("../src/youtube/render/timeline.js");
  const texts = chapterNarrationTexts("# 제목\n## CH01 시작 (00:00-01:00)\n그때 Thomas Heinz(토마스 하인즈)가 / **1등**이었죠. [확인 필요]\n## CH02 끝 (01:00-02:00)\n점유율 60% [쉼] 이상, 2.5배(두 배 반).\n");
  assert.deepEqual(texts, [
    { id: "CH01", text: "그때 토마스 하인즈가 1등이었죠." },
    { id: "CH02", text: "점유율 60퍼센트 ... 이상, 두 배 반." },
  ]);
});

test("업로드 출처는 같은 출처를 모으고 AI 이미지는 한 줄, 복제 목소리면 변경된 콘텐츠 '예'", async () => {
  const { uploadSources, buildUploadKit } = await import("../src/youtube/render/compose.js");
  const shot = (credit, url, kind = "image") => ({ media: { credit, url, kind } });
  const sources = uploadSources([
    shot("AI 생성 이미지 (Higgsfield)", "https://cdn/a.png", "ai"),
    shot("Heinz 공식 홈페이지", "https://www.heinz.com/"),
    shot("AI 생성 이미지 (Higgsfield)", "https://cdn/b.png", "ai"),
    shot("Heinz 공식 홈페이지", "https://www.heinz.com/"),
  ]);
  assert.deepEqual(sources.map((item) => [item.source, item.url]), [["Heinz 공식 홈페이지", "https://www.heinz.com/"], ["AI 생성 이미지 (Higgsfield)", null]]);
  const episode = { status: { episode: "EP001", article: { url: "https://brunch.co.kr/@heoboram/1", title: "t" }, generated: {} } };
  const kit = buildUploadKit(episode, "", { chapters: [] }, sources, { aiImages: true, syntheticVoice: true });
  assert.match(kit, /변경된 콘텐츠 표시: '예' \(내레이션이 본인 복제 목소리, AI 생성 이미지 포함\)/);
  assert.doesNotMatch(kit, /cdn\/a\.png/);
});

test("받아쓰기 시간으로 장면 시작과 자막을 실제 말소리에 맞춘다", async () => {
  const { alignScenes, alignedCues, locate, normalize } = await import("../src/youtube/render/align.js");
  const word = (text, start, end) => ({ text, start, end, type: "word" });
  const words = [word("로고는", 0, 0.5), word("검은", 0.6, 1), word("테이프로", 1.1, 1.6), word("가려집니다.", 1.7, 2.5),
    word("하인즈는", 4, 4.6), word("케첩병을", 4.7, 5.3), word("내놓았어요.", 5.4, 6.2), word("끝까지", 8, 8.5), word("보시죠.", 8.6, 9)];
  const scene = (id, narration, start, end) => ({ id, fields: { NARRATION: narration }, start, end, group: 0 });
  const timeline = {
    groups: [{ start: 0, seconds: 10 }],
    scenes: [scene("S001", "로고는 검은 테이프로", 0, 2), scene("S003", "끝까지 보시죠.", 2, 4), scene("S002", "하인즈는 케첩병을 내놓았어요", 4, 8), scene("S004", "챕터 전환", 8, 10)],
  };
  assert.equal(alignScenes(timeline, [words]), 3);
  // 실제로 읽은 순서(S002 → S003)대로 다시 놓이고, 챕터 전환은 마지막 말 뒤
  assert.deepEqual(timeline.scenes.map((item) => item.id), ["S001", "S002", "S003", "S004"]);
  assert.ok(Math.abs(timeline.scenes[1].start - 3.88) < 0.01);
  assert.ok(Math.abs(timeline.scenes[2].start - 7.88) < 0.01);
  assert.ok(timeline.scenes[3].start > 9 && timeline.scenes[3].end === 10);
  const cues = alignedCues(timeline, ["로고는 검은 테이프로 가려집니다. 하인즈는 케첩병을 내놓았어요. 끝까지 보시죠."], [words]);
  assert.deepEqual(cues.map((cue) => [cue.text, Number(cue.start.toFixed(1))]), [["로고는 검은 테이프로 가려집니다.", 0], ["하인즈는 케첩병을 내놓았어요.", 4], ["끝까지 보시죠.", 8]]);
  assert.ok(locate(normalize("1,400만 회 노출이었습니다"), normalize("천사백만 회 노출이었습니다"), 0) <= 1); // 표기가 달라도 근처를 찾는다
});

test("챕터마다(첫 챕터 제외) 녹음 끝 무음 자리에 간지를 넣고 '챕터 전환' 장면은 대신한다", async () => {
  const { insertChapterCards } = await import("../src/youtube/render/align.js");
  const scene = (id, narration, start, end, group) => ({ id, fields: { NARRATION: narration }, start, end, group });
  const timeline = {
    mode: "chapter",
    groups: [{ start: 0, seconds: 12.6 }, { start: 12.6, seconds: 10 }],
    scenes: [scene("S001", "가", 0, 6), scene("S002", "나", 6, 11), scene("S003", "챕터 전환", 11, 12.6, 0), scene("S004", "다", 12.6, 22.6, 1)].map((item, index) => ({ ...item, group: index < 3 ? 0 : 1 })),
  };
  assert.deepEqual(insertChapterCards(timeline, 2.6), [10]);
  assert.deepEqual(timeline.scenes.map((item) => [item.id, item.start, item.end]), [["S001", 0, 6], ["S002", 6, 10], ["CARD02", 10, 12.6], ["S004", 12.6, 22.6]]);
  assert.ok(timeline.scenes[2].chapterCard);
});

test("사진 확대는 소수점 좌표(perspective)로 해서 떨리지 않는다", async () => {
  const { pushIn } = await import("../src/youtube/render/compose.js");
  const normal = pushIn(105);
  assert.match(normal, /^perspective=/);
  assert.match(normal, /interpolation=cubic/);
  assert.match(normal, /eval=frame/);
  assert.doesNotMatch(normal, /zoompan/);
  assert.match(pushIn(105, true), /H\*0\.42/); // 클로즈업은 가운데보다 조금 위
});

test("자막은 읽는 법 대신 원래 표기로 보여 준다", async () => {
  const { readingPairs, displayText } = await import("../src/youtube/render/timeline.js");
  const pairs = readingPairs("LG(엘지)전자와 LGE(엘지이)닷컴, TV(티비), 1대1(일대일) 상담");
  assert.equal(displayText("엘지전자는 엘지이닷컴에서 티비와 일대일 상담을", pairs), "LG전자는 LGE닷컴에서 TV와 1대1 상담을");
  const duo = readingPairs("듀오링고의 캐릭터 Duo(듀오)의 생일카페. Duo(듀오)는 듀오링고를 떠올리게 한다.");
  assert.equal(displayText("듀오링고의 캐릭터 듀오의 생일. 듀오는 듀오링고를", duo), "듀오링고의 캐릭터 Duo의 생일. Duo는 듀오링고를");
});
