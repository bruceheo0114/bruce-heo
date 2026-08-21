import { access } from "node:fs/promises";
import { PATHS } from "../config.js";
import { approvePackages } from "../lib/approval.js";
import { readJson, writeJson } from "../lib/files.js";
import { loadState, saveState } from "../lib/state.js";

const approvedAt = new Date(process.env.APPROVED_AT || Date.now());
const state = await loadState();
const candidates = [];

for (const article of Object.values(state.articles)) {
  if (article.package.status !== "awaiting_review") continue;
  try {
    await access(article.package.manifestPath);
    const manifest = await readJson(article.package.manifestPath);
    candidates.push({ id: article.id, generatedAt: manifest.generatedAt });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const approved = approvePackages(state, candidates, approvedAt);
for (const item of approved) {
  const article = state.articles[item.id];
  const manifest = await readJson(article.package.manifestPath);
  manifest.schedule.approvedAt = item.approvedAt;
  manifest.schedule.scheduledAt = item.scheduledAt;
  await writeJson(article.package.manifestPath, manifest);
}

if (approved.length) await saveState(state);
await writeJson(PATHS.result, {
  approvedAt: approvedAt.toISOString(),
  approved,
});
console.log(JSON.stringify({ approved }));
