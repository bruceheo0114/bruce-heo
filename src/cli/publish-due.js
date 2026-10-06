import { PATHS } from "../config.js";
import { readJson, writeJson } from "../lib/files.js";
import { selectDueArticle } from "../lib/queue.js";
import { loadState, saveState } from "../lib/state.js";
import { publishLinkedIn } from "../publish/linkedin.js";

const now = new Date(process.env.AUTOMATION_NOW ?? Date.now());
if (process.env.SOCIAL_DRY_RUN === "true" && process.env.LINKEDIN_ACCESS_TOKEN) {
  // 시험 실행에서도 토큰이 살아 있는지 LinkedIn 에 직접 묻는다(게시는 하지 않는다).
  // 401 = 만료·잘못된 토큰, 403 = 토큰은 유효하지만 openid 권한 없음(게시에는 문제 없음).
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` },
  });
  console.log(JSON.stringify({ tokenCheckStatus: response.status, tokenValid: response.status !== 401 }));
  if (response.status === 401) {
    console.error("LinkedIn 토큰이 만료됐거나 잘못됐습니다. 새 토큰을 LINKEDIN_ACCESS_TOKEN 에 저장해 주세요.");
    process.exit(1);
  }
}
const state = await loadState();
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
