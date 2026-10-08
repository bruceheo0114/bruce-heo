import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { youtubePaths } from "../src/youtube/config.js";
import { pickNext } from "../src/youtube/queue.js";
import { diffReadback, lintNarration } from "../src/youtube/readback.js";
import { parseUploadKit } from "../src/youtube/upload.js";
import { createEpisode, findEpisode, markUpdateAvailable, resolveUpdate } from "../src/youtube/episode.js";
import { parseBlocks, parseTimeRange } from "../src/youtube/parse.js";
import { addSpend, cycleKey, loadLedger, monthSpent } from "../src/youtube/ledger.js";
import { archiveArticles, articleToMarkdown, loadCacheArticles, loadSourceIndex, parseFrontMatter, saveSourceIndex } from "../src/youtube/source.js";
import { analyzeStoryboard, parseScore, validatePackage } from "../src/youtube/validate.js";
import {
  approveEpisode,
  finalizeEpisode,
  generationBlocker,
  recordGeneration,
  recordNarration,
  revokeApproval,
} from "../src/youtube/workflow.js";

const run = promisify(execFile);
const NOW = new Date("2026-10-07T01:00:00Z");

const article = {
  id: "222",
  canonicalUrl: "https://brunch.co.kr/@heoboram/222",
  title: "AI 시대, 당신의 진짜 일은 무엇입니까?",
  subtitle: "",
  publishedAt: "2026-10-05T12:00:05.000Z",
  body: "“그걸 왜 본인이 하고 있어요? AI한테 시키면 되잖아요.” 최근 함께 일하는 동료에게 한 말이다.\n\n불과 6개월 전만 해도 나 역시 반대편에 있었다. AI에게 설명하고 결과를 기다리느니 내가 직접 하는 게 빠르다고 생각했다.",
  images: ["https://example.com/a.jpg"],
  bodyHash: "hash-1",
};

const mmss = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

// 12분, AI 6 Scene(6초씩) 짜리 정상 스토리보드
function storyboard({ aiScenes = 6, aiSeconds = 6, totalSeconds = 12 * 60 } = {}) {
  const scenes = [];
  let time = 0;
  let index = 1;
  const push = (type, seconds) => {
    const id = `S${String(index++).padStart(3, "0")}`;
    scenes.push({ id, type, start: time, end: time + seconds });
    time += seconds;
  };
  for (let ai = 0; ai < aiScenes; ai += 1) {
    push("AI", aiSeconds);
    push("REAL", 60);
    push("TYPE", 40);
  }
  const cycle = ["REAL", "GRAPHIC", "TYPE"];
  let turn = 0;
  while (time < totalSeconds) {
    push(cycle[turn++ % cycle.length], Math.min(30, totalSeconds - time));
  }
  const text = scenes
    .map((scene) => [
      `SCENE ID: ${scene.id}`,
      `TIME: ${mmss(scene.start)}-${mmss(scene.end)}`,
      "NARRATION:",
      "그런데 우리는 이 장면을 꽤 자주 오해합니다.",
      "VISUAL:",
      "화면 설명",
      `SOURCE_TYPE: ${scene.type}`,
      "ON_SCREEN_TEXT:",
      "Same personality.",
      `ASSET: ${scene.type === "AI" ? "REF01" : "A001"}`,
      `HIGGSFIELD_REQUIRED: ${scene.type === "AI" ? "YES" : "NO"}`,
      "",
    ].join("\n"))
    .join("\n");
  return { text: `# Storyboard\n\n\`\`\`text\n${text}\n\`\`\`\n`, aiIds: scenes.filter((s) => s.type === "AI").map((s) => s.id) };
}

function higgsfield(ids, credits = 20) {
  const blocks = ids.map((id) => [
    `SCENE ID: ${id}`,
    "PURPOSE: 챕터 전환",
    "DURATION: 6s",
    "REFERENCE ASSET: REF01 (image-to-video)",
    "PROMPT: a quiet editorial office desk, morning light",
    "CAMERA: slow push-in",
    "LIGHTING: soft daylight",
    "STYLE: modern editorial, documentary, minimal",
    "ASPECT RATIO: 16:9",
    "REUSE POSSIBILITY: REF01 재사용",
    "",
  ].join("\n"));
  return `# Higgsfield\n\nESTIMATED GENERATIONS: ${ids.length + 2}\nESTIMATED CREDITS: ${credits}\n\n## Reference Images\n\n- REF01\n\n## Scenes\n\n${blocks.join("\n")}\n## Cost Saving\n\n- REF01 하나로 모든 전환 장면을 만든다.\n`;
}

const brief = `# Brief
## Original Article
제목
## One Sentence Thesis
일의 본질은 판단이다.
## Audience
마케터
## Why Now
AI 도입
## Expected Runtime
12분
## Title Candidates
- 1
- 2
- 3
- 4
- 5
## Thumbnail Copy
- 1
- 2
- 3
- 4
- 5
## Opening Hook
훅
## Main Question
질문
## Core Argument
주장
## Chapter Structure
- CH01
## Key Examples
- 사례
## Ending Question / Statement
질문
`;

const shorts = [1, 2, 3]
  .map((n) => `## SHORT 0${n}\n\nHOOK: 훅\nSCRIPT: 대본\nON SCREEN TEXT: 문구\nSOURCE TIMECODE: 03:20-04:05\nEXPECTED LENGTH: 45s\n`)
  .join("\n");

const assets = `ASSET ID: A001
SCENE: S002
NEEDED MATERIAL: 캠페인 영상
BRAND: Duolingo
SOURCE TYPE: REAL
SEARCH KEYWORD: duolingo tiktok
EXPECTED SOURCE: 공식 TikTok
PRIORITY: HIGH
`;

const score = (recommendation) => `VIDEO POTENTIAL SCORE

Narrative        8/10
Case Study       9/10
Visual Material  9/10
Timeliness       8/10
Bruce POV        9/10
30min Potential  8/10

TOTAL            51/60

RECOMMENDATION:
${recommendation.replace("_", " ")}
`;

const script = `# Script\n\n${"브랜드의 일관성은 같은 말을 반복하는 게 아니라 같은 판단을 반복하는 겁니다. 저는 이 현상을 조금 다르게 봅니다. ".repeat(160)}`;

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "bruce-youtube-"));
  const paths = youtubePaths(root);
  const index = await loadSourceIndex(paths);
  await archiveArticles(index, [article], NOW, paths);
  index.initializedAt = NOW.toISOString();
  await saveSourceIndex(index, paths);
  const { episode } = await createEpisode(index.articles["222"], NOW, paths);
  return { root, paths, episode, index };
}

async function writePackage(episode, overrides = {}) {
  const board = storyboard(overrides.storyboard);
  const files = {
    "00_score.md": score(overrides.recommendation ?? "MAKE_VIDEO"),
    "01_brief.md": brief,
    "02_script.md": overrides.script ?? script,
    "03_storyboard.md": board.text,
    "04_assets.md": assets,
    "05_higgsfield.md": overrides.higgsfield ?? higgsfield(board.aiIds, overrides.credits),
    "06_shorts.md": shorts,
  };
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(episode.dir, name), content);
  }
  return board;
}

test("원문을 front matter가 있는 Markdown으로 보관한다", () => {
  const markdown = articleToMarkdown(article);
  const { data, body } = parseFrontMatter(markdown);
  assert.equal(data.article_id, "222");
  assert.equal(data.body_hash, "hash-1");
  assert.ok(body.includes("반대편에 있었다"));
});

test("블록·타임코드·점수 파서", () => {
  const [block] = parseBlocks("**SCENE ID:** S001\nTIME: 00:00-00:06\nNARRATION:\n첫 줄\n둘째 줄\nSOURCE_TYPE: AI", "SCENE ID", ["TIME", "NARRATION", "SOURCE_TYPE"]);
  assert.equal(block["SCENE ID"], "S001");
  assert.equal(block.NARRATION, "첫 줄\n둘째 줄");
  assert.deepEqual(parseTimeRange("01:02:03 – 01:02:10"), { start: 3723, end: 3730 });
  const parsed = parseScore(score("MAKE_VIDEO"));
  assert.equal(parsed.total, 51);
  assert.equal(parsed.recommendation, "MAKE_VIDEO");
});

test("정상 패키지는 통과하고 finalize 후 WAITING_APPROVAL이 된다", async () => {
  const { paths, episode } = await setup();
  assert.equal(episode.name, "EP001_brunch-222");
  await writePackage(episode);
  const validation = await validatePackage(episode, paths);
  assert.deepEqual(validation.errors, []);
  const { ok } = await finalizeEpisode(episode, NOW, paths);
  assert.ok(ok);
  assert.equal(episode.status.status, "WAITING_APPROVAL");
  assert.equal(episode.status.higgsfield_generation, false);
  assert.equal(episode.status.plan.scenes_by_type.AI, 6);
  assert.equal(episode.status.plan.estimated_credits, 20);
  assert.equal(episode.status.video_potential.TOTAL, 51);
});

test("AI 비중·크레딧 상한·원문 복사를 막는다", async () => {
  const { paths, episode } = await setup();
  await writePackage(episode, { storyboard: { aiScenes: 30, aiSeconds: 8 }, credits: 75 });
  const errors = (await validatePackage(episode, paths)).errors.join("\n");
  assert.match(errors, /AI Scene 30개/);
  assert.match(errors, /크레딧이 Episode 상한 30/);

  const share = analyzeStoryboard(storyboard({ aiScenes: 10, aiSeconds: 80 }).text);
  assert.ok(share.errors.some((error) => error.includes("AI 화면 비중")));

  await writePackage(episode, { script: `${article.body}\n\n${article.body}` });
  assert.ok((await validatePackage(episode, paths)).errors.some((error) => error.includes("브런치 원문과 같습니다")));
});

test("HOLD 평가는 패키지 없이 HOLD로 끝난다", async () => {
  const { paths, episode } = await setup();
  await writeFile(path.join(episode.dir, "00_score.md"), score("HOLD"));
  const { ok } = await finalizeEpisode(episode, NOW, paths);
  assert.ok(ok);
  assert.equal(episode.status.status, "HOLD");
});

test("승인 전에는 생성할 수 없고, 승인한 Scene만 한 번씩 생성한다", async () => {
  const { paths, episode } = await setup();
  const board = await writePackage(episode);
  await finalizeEpisode(episode, NOW, paths);
  const [first, second] = board.aiIds;
  assert.match(generationBlocker(episode.status, first), /APPROVED가 아닙니다/);

  await assert.rejects(approveEpisode(episode, ["S999"], NOW, paths), /없는 Scene/);
  await approveEpisode(episode, [first.slice(1)], NOW, paths);
  assert.equal(episode.status.status, "APPROVED");
  assert.deepEqual(episode.status.approved_scenes, [first]);
  assert.match(generationBlocker(episode.status, second), /승인된 Scene이 아닙니다/);
  assert.equal(generationBlocker(episode.status, first), null);

  assert.match(generationBlocker(episode.status, first, { spent: 150, cap: 150 }), /상한/);
  assert.equal(generationBlocker(episode.status, first, { spent: 20, cap: 150 }), null);
  await recordGeneration(episode, first, { job: "job-1", files: [], credits: 5 }, NOW);
  assert.equal(episode.status.status, "ASSETS_READY");
  assert.equal(episode.status.higgsfield_generation, false);

  await approveEpisode(episode, [second], NOW, paths);
  assert.match(generationBlocker(episode.status, first), /이미 생성/);
  await revokeApproval(episode, NOW);
  assert.equal(episode.status.higgsfield_generation, false);
  assert.match(generationBlocker(episode.status, second), /APPROVED가 아닙니다/);
});

test("원문이 수정되면 제작물을 지키고 UPDATE_AVAILABLE로 표시한다", async () => {
  const { paths, episode, index } = await setup();
  await writePackage(episode);
  await finalizeEpisode(episode, NOW, paths);
  await approveEpisode(episode, [], NOW, paths);
  const before = await readFile(path.join(episode.dir, "02_script.md"), "utf8");

  const { changed } = await archiveArticles(index, [{ ...article, body: `${article.body} 수정`, bodyHash: "hash-2" }], NOW, paths);
  assert.equal(changed.length, 1);
  await markUpdateAvailable(changed[0], NOW, paths);
  const updated = await findEpisode("EP001", paths);
  assert.equal(updated.status.status, "UPDATE_AVAILABLE");
  assert.equal(updated.status.higgsfield_generation, false);
  assert.equal(await readFile(path.join(episode.dir, "02_script.md"), "utf8"), before);

  await resolveUpdate(updated, "keep", NOW);
  assert.equal(updated.status.status, "APPROVED");
  assert.equal(updated.status.higgsfield_generation, true);
  assert.equal(updated.status.article.body_hash, "hash-2");
});

test("직접 녹음한 내레이션 길이를 스토리보드와 비교한다", async () => {
  const { paths, episode } = await setup();
  await writePackage(episode);
  await finalizeEpisode(episode, NOW, paths);
  const result = await recordNarration(episode, ["narration/EP001/EP001_CH01.m4a", "narration/EP001/EP001_CH02.m4a"], [300, 600], NOW);
  assert.equal(result.total, 900);
  assert.equal(result.planned, 12 * 60);
  assert.ok(result.drift > 0.1);
  assert.equal(episode.status.narration.takes.length, 2);
});

test("크레딧 장부는 매월 2일에 새로 센다", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bruce-youtube-ledger-"));
  const paths = youtubePaths(root);
  assert.equal(cycleKey(new Date("2026-10-01T10:00:00Z")), "2026-09");
  assert.equal(cycleKey(new Date("2026-10-01T16:00:00Z")), "2026-10"); // KST 10/2 01:00
  const ledger = await loadLedger(paths);
  assert.equal(ledger.monthly_cap, 150);
  await addSpend(ledger, NOW, { episode: "EP001", scene: "S001", credits: 5 }, paths);
  await addSpend(ledger, NOW, { episode: "EP001", scene: "S004", credits: 0.25 }, paths);
  assert.equal(monthSpent(await loadLedger(paths), NOW), 5.25);
});

test("브런치 캐시에서 2026년 이후 글만 읽는다", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "brunch-cache-"));
  await writeFile(path.join(dir, "index.json"), JSON.stringify([
    { no: 212, date: "2026-08-18", title: "스위첸은 왜 8년째 집 이야기를 할까" },
    { no: 179, date: "2025-06-25", title: "지난 글" },
  ]));
  const body = "광고의 반응은 뜨거웠다. ".repeat(10);
  await writeFile(path.join(dir, "212.txt"), `# 스위첸은 왜 8년째 집 이야기를 할까\n모두를 울린 광고는 매출에 도움이 될까? | ${body}`);
  await writeFile(path.join(dir, "179.txt"), `# 지난 글\n${body}`);
  const articles = await loadCacheArticles(dir, "2026-01-01");
  assert.deepEqual(articles.map((item) => item.id), ["212"]);
  assert.equal(articles[0].subtitle, "모두를 울린 광고는 매출에 도움이 될까?");
  assert.ok(articles[0].body.startsWith("광고의 반응은"));
  assert.equal(articles[0].publishedAt, "2026-08-18T03:00:00.000Z");
});

test("CLI: 첫 sync는 원문만 보관하고, 새 글은 큐에 쌓이며 주 1편만 Episode가 된다", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bruce-youtube-cli-"));
  const content = path.join(root, "content");
  const env = { ...process.env, YOUTUBE_ROOT: path.join(root, "yt"), AUTOMATION_NOW: NOW.toISOString() };
  const cli = path.resolve("src/cli/youtube.js");
  const { mkdir } = await import("node:fs/promises");
  const save = async (item) => {
    await mkdir(path.join(content, item.id), { recursive: true });
    await writeFile(path.join(content, item.id, "source.json"), JSON.stringify(item));
  };
  const post = (id, day) => ({ ...article, id, canonicalUrl: `https://brunch.co.kr/@heoboram/${id}`, publishedAt: `2026-10-${day}T12:00:00.000Z`, bodyHash: `h${id}` });
  await save(article);
  let out = await run("node", [cli, "sync", "--local"], { env, cwd: root });
  assert.match(out.stdout, /첫 실행/);

  for (const [id, day] of [["223", "08"], ["224", "09"], ["225", "09"]]) await save(post(id, day));
  const later = { ...env, AUTOMATION_NOW: "2026-10-10T01:00:00Z" };
  out = await run("node", [cli, "sync", "--local"], { env: later, cwd: root });
  assert.match(out.stdout, /큐에 추가: 223/);

  out = await run("node", [cli, "next", "--weekly"], { env: later, cwd: root });
  assert.equal(out.stdout.trim(), "EP001_brunch-223");
  // 아직 패키지 전이면 같은 Episode를 다시 돌려준다
  out = await run("node", [cli, "next", "--weekly"], { env: later, cwd: root });
  assert.equal(out.stdout.trim(), "EP001_brunch-223");

  const paths = youtubePaths(path.join(root, "yt"));
  // SKIP은 주 1편 상한에 넣지 않는다
  await writeFile(path.join((await findEpisode("EP001", paths)).dir, "00_score.md"), score("SKIP"));
  await finalizeEpisode(await findEpisode("EP001", paths), new Date("2026-10-10T02:00:00Z"), paths);
  out = await run("node", [cli, "next", "--weekly"], { env: later, cwd: root });
  assert.equal(out.stdout.trim(), "EP002_brunch-224");

  const second = await findEpisode("EP002", paths);
  await writeFile(path.join(second.dir, "00_score.md"), score("SHORTS_ONLY"));
  await writeFile(path.join(second.dir, "06_shorts.md"), shorts);
  assert.ok((await finalizeEpisode(second, new Date("2026-10-10T03:00:00Z"), paths)).ok);
  out = await run("node", [cli, "next", "--weekly"], { env: later, cwd: root });
  assert.equal(out.stdout.trim(), "");
  out = await run("node", [cli, "next", "--weekly"], { env: { ...env, AUTOMATION_NOW: "2026-10-18T01:00:00Z" }, cwd: root });
  assert.equal(out.stdout.trim(), "EP003_brunch-225");
  const queue = JSON.parse(await readFile(path.join(root, "yt", "queue.json"), "utf8"));
  assert.deepEqual(queue.items.map((item) => item.status), ["episode", "episode", "episode"]);
});

test("이번 주 새 글이 있으면 먼저, 없으면 큐 todo → 예비 글 순으로 고른다", () => {
  const index = {
    articles: {
      211: { publishedAt: "2026-07-28T03:00:00.000Z" },
      202: { publishedAt: "2026-06-23T03:00:00.000Z" },
      223: { publishedAt: "2026-10-12T03:00:00.000Z" },
    },
  };
  const queue = {
    items: [
      { no: 211, status: "todo" },
      { no: 202, status: "reserve" },
      { no: 223, status: "todo" },
    ],
  };
  // 수요일 루틴: 월요일(10/12)에 올라온 글이 큐 뒤에 있어도 먼저 만든다
  assert.equal(pickNext(queue, index, new Date("2026-10-13T20:13:00Z")).no, 223);
  // 그 주에 새 글이 없으면 큐의 todo
  assert.equal(pickNext(queue, index, new Date("2026-10-20T20:13:00Z")).no, 211);
  // todo가 다 떨어지면 예비 글
  queue.items[0].status = "episode";
  queue.items[2].status = "episode";
  assert.equal(pickNext(queue, index, new Date("2026-10-20T20:13:00Z")).no, 202);
  queue.items[1].status = "episode";
  assert.equal(pickNext(queue, index, new Date("2026-10-20T20:13:00Z")), null);
});

test("소리 내어 읽기: 긴 문장·읽는 법 없는 말, 받아쓰기와 다르게 들린 곳", () => {
  const issues = lintNarration("광고비는 1,000만 달러였어요. 2026년에 SNS에 올렸죠. 짧아요.");
  assert.deepEqual(issues.map((issue) => issue.text.split(" — ")[0]), ["1,000", "SNS"]);
  assert.equal(lintNarration("가".repeat(80)).length, 1);
  const words = ["하인즈는", "케첩이", "아니라", "기억을", "팝니다"].flatMap((text, index) => [
    { text, start: index, end: index + 0.5, type: "word" },
    { text: " ", start: index + 0.5, end: index + 1, type: "spacing" },
  ]);
  assert.deepEqual(diffReadback("하인즈는 케첩이 아니라 기억을 판다.", words), [{ script: "판다", heard: "팝니다" }]);
  assert.deepEqual(diffReadback("하인즈는 케첩이 아니라 기억을 팝니다.", words), []);
});

test("upload.md에서 제목·설명·태그·합성 콘텐츠 여부를 읽는다", () => {
  const kit = parseUploadKit([
    "# EP002 업로드 정보", "", "## 제목 (1순위)", "", "르게다꼼은 왜 낯설까", "", "## 다른 제목 후보", "", "- 후보",
    "", "## 설명 (그대로 붙여넣기)", "", "```", "한 줄 요약", "", "00:00 오프닝", "```", "",
    "## 태그", "", "마케팅, 브랜딩", "", "## 설정", "", "- 변경된 콘텐츠 표시: '예' (내레이션이 본인 복제 목소리)", "",
  ].join("\n"));
  assert.equal(kit.title, "르게다꼼은 왜 낯설까");
  assert.equal(kit.description, "한 줄 요약\n\n00:00 오프닝");
  assert.deepEqual(kit.tags, ["마케팅", "브랜딩"]);
  assert.equal(kit.altered, true);
});
