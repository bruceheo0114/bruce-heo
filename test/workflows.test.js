import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

for (const file of [
  ".github/workflows/brunch-weekly.yml",
  ".github/workflows/social-publish.yml",
]) {
  test(`${file}은 유효한 GitHub Actions YAML이다`, async () => {
    const workflow = parse(await readFile(file, "utf8"));
    assert.ok(workflow.name);
    assert.ok(workflow.on.schedule);
    assert.ok(workflow.jobs);
  });
}

test("브런치 확인은 매일 08:00 KST에 실행된다", async () => {
  const workflow = parse(
    await readFile(".github/workflows/brunch-weekly.yml", "utf8"),
  );
  assert.equal(workflow.on.schedule[0].cron, "0 23 * * *");
});

test("LinkedIn 게시 워크플로에는 Instagram 인증정보가 없다", async () => {
  const source = await readFile(".github/workflows/social-publish.yml", "utf8");
  assert.equal(source.includes("IG_ACCESS_TOKEN"), false);
  assert.equal(source.includes("IG_USER_ID"), false);
});
