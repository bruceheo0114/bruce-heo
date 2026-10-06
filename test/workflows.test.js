import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

for (const file of [
  ".github/workflows/brunch-weekly.yml",
  ".github/workflows/publish-clock.yml",
  ".github/workflows/linkedin-publish.yml",
]) {
  test(`${file}은 유효한 GitHub Actions YAML이다`, async () => {
    const workflow = parse(await readFile(file, "utf8"));
    assert.ok(workflow.name);
    assert.ok(workflow.jobs);
  });
}

test("브런치 확인은 매일 08:00 KST에 실행된다", async () => {
  const workflow = parse(
    await readFile(".github/workflows/brunch-weekly.yml", "utf8"),
  );
  assert.equal(workflow.on.schedule[0].cron, "0 23 * * *");
});

test("콘텐츠 생성은 OpenAI 없이 Claude 원고 push로도 실행된다", async () => {
  const text = await readFile(".github/workflows/brunch-weekly.yml", "utf8");
  const workflow = parse(text);
  assert.deepEqual(workflow.on.push.paths, ["content/*/draft.json"]);
  assert.doesNotMatch(text, /OPENAI/);
});

test("LinkedIn 별도 게시는 시계가 시작하지 않고 토큰이 없으면 건너뛴다", async () => {
  const text = await readFile(".github/workflows/linkedin-publish.yml", "utf8");
  const workflow = parse(text);
  assert.ok(workflow.on.workflow_dispatch !== undefined);
  assert.match(text, /LINKEDIN_ACCESS_TOKEN Secret 이 없어/);
  const clock = await readFile("scripts/publish_clock.py", "utf8");
  assert.doesNotMatch(clock, /\(6, 30, None, "linkedin-publish\.yml"/);
});


test("게시 시계는 게시 워크플로를 직접 시작할 권한이 있다", async () => {
  const workflow = parse(
    await readFile(".github/workflows/publish-clock.yml", "utf8"),
  );
  assert.equal(workflow.permissions.actions, "write");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.ok(workflow.on.workflow_dispatch !== undefined);
});

test("브런치 카드뉴스는 수·금 인스타그램 대기열에 들어가고 시계가 매일 07:00 게시를 시작한다", async () => {
  const workflow = await readFile(".github/workflows/brunch-weekly.yml", "utf8");
  assert.match(workflow, /node src\/cli\/schedule-instagram\.js/);
  const clock = await readFile("scripts/publish_clock.py", "utf8");
  assert.match(clock, /\(7, 0, None, "insight-reels-publish\.yml", True\)/);
  const script = await readFile("src/cli/schedule-instagram.js", "utf8");
  assert.match(script, /new Set\(\[3, 5\]\)/);
});
