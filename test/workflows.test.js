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
