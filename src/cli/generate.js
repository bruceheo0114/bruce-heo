import path from "node:path";
import { PATHS } from "../config.js";
import { fetchArticle } from "../lib/brunch.js";
import { renderCards } from "../lib/card-renderer.js";
import { buildManifest, generateContent } from "../lib/content-generator.js";
import { readJson, writeJson } from "../lib/files.js";
import { loadState } from "../lib/state.js";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const state = await loadState();
const discovery = await readJson(PATHS.result, {});
const batchId = argument("--batch") ?? discovery.batchId;
if (!batchId) {
  console.log(JSON.stringify({ generatedArticleIds: [], reason: "no-new-articles" }));
  process.exit(0);
}

const queued = Object.values(state.articles)
  .filter(
    (article) =>
      article.batchId === batchId && article.package.status === "awaiting_review",
  )
  .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));

const generatedArticleIds = [];
for (const queuedArticle of queued) {
  const article = await fetchArticle(queuedArticle.id);
  if (article.bodyHash !== queuedArticle.bodyHash) {
    throw new Error(
      `브런치 원문이 발견 이후 변경되었습니다: ${article.canonicalUrl}. 새 검수가 필요합니다.`,
    );
  }
  const generated = await generateContent(article);
  const manifest = buildManifest(article, generated, queuedArticle.scheduledAt);
  const outputDir = path.join(PATHS.content, article.id);
  await renderCards(manifest, outputDir);
  const manifestPath = path.join(outputDir, "manifest.json");
  await writeJson(manifestPath, manifest);

  generatedArticleIds.push(article.id);
}

await writeJson(PATHS.result, {
  ...discovery,
  batchId,
  generatedArticleIds,
});
console.log(JSON.stringify({ batchId, generatedArticleIds, mode: state.mode }));
