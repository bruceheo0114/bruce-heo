import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

for (const file of [".github/workflows/brunch-weekly.yml"]) {
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

test("LinkedIn 자동 게시 워크플로는 존재하지 않는다", async () => {
  await assert.rejects(readFile(".github/workflows/social-publish.yml", "utf8"));
  await assert.rejects(readFile(".github/workflows/content-approved.yml", "utf8"));
});

