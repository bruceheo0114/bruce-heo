import { access } from "node:fs/promises";
import { PATHS } from "../config.js";
import { readJson, writeJson } from "../lib/files.js";
import { selectDueArticle } from "../lib/queue.js";
import { loadState, saveState } from "../lib/state.js";
import { publishLinkedIn } from "../publish/linkedin.js";

const now = new Date(process.env.AUTOMATION_NOW ?? Date.now());
const state = await loadState();
let promotedPackage = false;
for (const tracked of Object.values(state.articles)) {
  if (tracked.package.status !== "awaiting_review") continue;
  try {
    await access(tracked.package.manifestPath);
    tracked.package.status = "generated";
    tracked.package.generatedAt ??= now.toISOString();
    if (tracked.instagram.status === "manual_pending") {
      tracked.instagram.status = "manual_source_ready";
    }
    promotedPackage = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
if (promotedPackage) await saveState(state);
const article = selectDueArticle(state.articles, now);
if (!article) {
  await writeJson(PATHS.result, {
    checkedAt: now.toISOString(),
    publishedArticleId: null,
    reason: "no-due-content",
  });
  console.log(JSON.stringify({ publishedArticleId: null, reason: "no-due-content" }));
  process.exit(0);
}

const manifest = await readJson(article.package.manifestPath);
if (process.env.SOCIAL_DRY_RUN === "true") {
  console.log(
    JSON.stringify({
      dryRun: true,
      articleId: article.id,
      linkedinPending: article.linkedin.status !== "published",
      instagramSourceStatus: article.instagram.status,
      cardCount: manifest.cards.length,
    }),
  );
  process.exit(0);
}

async function persist() {
  await writeJson(article.package.manifestPath, manifest);
  await saveState(state);
}

const errors = [];
if (article.linkedin.status !== "published") {
  try {
    const result = await publishLinkedIn(
      manifest,
      {
        postId:
          manifest.publishing.linkedin.postId ?? article.linkedin.postId ?? null,
        commentId:
          manifest.publishing.linkedin.commentId ??
          article.linkedin.commentId ??
          null,
      },
      async (progress) => {
        manifest.publishing.linkedin = {
          ...manifest.publishing.linkedin,
          ...progress,
          error: null,
        };
        article.linkedin = {
          ...article.linkedin,
          ...progress,
          id: progress.postId,
          lastAttemptAt: now.toISOString(),
          error: null,
        };
        await persist();
      },
    );
    manifest.publishing.linkedin = {
      ...manifest.publishing.linkedin,
      ...result,
      error: null,
    };
    article.linkedin = {
      ...article.linkedin,
      ...result,
      id: result.postId,
      lastAttemptAt: now.toISOString(),
      error: null,
    };
  } catch (error) {
    const postExists = Boolean(
      manifest.publishing.linkedin.postId ?? article.linkedin.postId,
    );
    article.linkedin.status = postExists ? "comment_failed" : "failed";
    article.linkedin.lastAttemptAt = now.toISOString();
    article.linkedin.error = error.message;
    manifest.publishing.linkedin.status = article.linkedin.status;
    manifest.publishing.linkedin.error = error.message;
    errors.push(`LinkedIn: ${error.message}`);
    await persist();
  }
}

if (article.linkedin.status === "published") {
  article.completedAt = now.toISOString();
  manifest.schedule.publishedAt = now.toISOString();
  if (!article.approvalCounted) {
    article.approvalCounted = true;
    state.reviewSuccessCount += 1;
  }
}

await persist();
await writeJson(PATHS.result, {
  checkedAt: now.toISOString(),
  publishedArticleId: article.id,
  linkedinStatus: article.linkedin.status,
  instagramSourceStatus: article.instagram.status,
  reviewSuccessCount: state.reviewSuccessCount,
  mode: state.mode,
  errors,
});

console.log(
  JSON.stringify({
    articleId: article.id,
    linkedinStatus: article.linkedin.status,
    instagramSourceStatus: article.instagram.status,
    reviewSuccessCount: state.reviewSuccessCount,
    mode: state.mode,
  }),
);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
