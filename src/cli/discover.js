import { CONFIG, PATHS } from "../config.js";
import { access } from "node:fs/promises";
import { fetchLatestArticles } from "../lib/brunch.js";
import { applyDiscovery } from "../lib/discovery.js";
import { readJson, writeJson } from "../lib/files.js";
import { updateHomepage } from "../lib/homepage.js";
import { loadState, saveState } from "../lib/state.js";

const now = new Date(process.env.AUTOMATION_NOW ?? Date.now());
const state = await loadState();
const previousPosts = await readJson(PATHS.posts, []);
const latest = await fetchLatestArticles(20);

if (latest.length < CONFIG.homepageLimit) {
  throw new Error(
    `브런치 공개 글을 ${latest.length}개만 찾았습니다. 홈페이지 12개 갱신을 중단합니다.`,
  );
}

const homepagePosts = latest.slice(0, CONFIG.homepageLimit).map((article) => ({
  id: article.id,
  canonicalUrl: article.canonicalUrl,
  title: article.title,
  subtitle: article.subtitle,
  publishedAt: article.publishedAt,
  excerpt: article.excerpt,
  imageUrl: article.images[0] ?? null,
}));

const proposedBatchId =
  process.env.GITHUB_RUN_ID ??
  now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const { bootstrap, newArticles } = applyDiscovery(
  state,
  latest,
  now,
  proposedBatchId,
);

const missingPackageArticles = [];
for (const tracked of Object.values(state.articles)) {
  if (tracked.package.status !== "awaiting_review") continue;
  try {
    await access(tracked.package.manifestPath);
    tracked.package.status = "generated";
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    missingPackageArticles.push(tracked);
  }
}

await writeJson(PATHS.posts, homepagePosts);
await updateHomepage(homepagePosts);
await saveState(state);

const activeBatchId =
  newArticles[0]?.batchId ?? missingPackageArticles[0]?.batchId ?? null;
const packageArticleIds = activeBatchId
  ? missingPackageArticles
      .filter((article) => article.batchId === activeBatchId)
      .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt))
      .map((article) => article.id)
  : [];
await writeJson(PATHS.result, {
  checkedAt: now.toISOString(),
  bootstrap,
  previousHomepageCount: previousPosts.length,
  homepageCount: homepagePosts.length,
  newArticleIds: newArticles.map((article) => article.id),
  packageArticleIds,
  batchId: activeBatchId,
  mode: state.mode,
});

console.log(
  JSON.stringify({
    bootstrap,
    homepageCount: homepagePosts.length,
    newArticleIds: newArticles.map((article) => article.id),
    packageArticleIds,
    batchId: activeBatchId,
    mode: state.mode,
  }),
);
