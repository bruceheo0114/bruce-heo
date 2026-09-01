import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

for (const file of [
  ".github/workflows/brunch-weekly.yml",
  ".github/workflows/video-summary.yml",
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

test("영상 요약은 매일 10:00 KST에 실행되고 비밀값을 셸에 직접 끼워 넣지 않는다", async () => {
  const raw = await readFile(".github/workflows/video-summary.yml", "utf8");
  const workflow = parse(raw);
  assert.equal(workflow.on.schedule[0].cron, "0 1 * * *");

  // secrets 컨텍스트는 step 수준 if에서 평가되지 않는다.
  assert.doesNotMatch(raw, /if:.*secrets\./);
  // 비밀값과 수동 입력값은 env를 거쳐야 셸 주입이 생기지 않는다.
  assert.doesNotMatch(raw, /run:[\s\S]*?\$\{\{\s*secrets\./);
  assert.doesNotMatch(raw, /run:.*\$\{\{\s*inputs\./);
});

test("LinkedIn 자동 게시 워크플로는 존재하지 않는다", async () => {
  await assert.rejects(readFile(".github/workflows/social-publish.yml", "utf8"));
  await assert.rejects(readFile(".github/workflows/content-approved.yml", "utf8"));
});


test("영상 요약 워크플로는 새로 생긴 요약 파일까지 커밋한다", async () => {
  const raw = await readFile(".github/workflows/video-summary.yml", "utf8");
  // git diff는 추적되지 않는 파일을 못 보므로 첫 실행 결과가 통째로 사라진다.
  assert.doesNotMatch(raw, /git diff --quiet -- data\/video-state\.json/);
  assert.match(raw, /git status --porcelain -- data\/video-state\.json content\/video/);
});
