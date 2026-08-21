import { channelState } from "./state.js";
import { nextKstSlot } from "./time.js";

export function applyDiscovery(state, latest, now, batchId) {
  for (const current of latest) {
    const tracked = state.articles[current.id];
    if (tracked) {
      tracked.title = current.title;
      tracked.publishedAt = current.publishedAt;
    }
  }

  let bootstrap = false;
  let newArticles = [];
  if (!state.initialized) {
    bootstrap = true;
    for (const article of latest) {
      state.articles[article.id] = {
        id: article.id,
        canonicalUrl: article.canonicalUrl,
        title: article.title,
        publishedAt: article.publishedAt,
        bodyHash: article.bodyHash,
        batchId: "bootstrap",
        homepage: { status: "published", updatedAt: now.toISOString() },
        package: { status: "skipped_backfill", manifestPath: null },
        linkedin: channelState("skipped_backfill"),
        instagram: channelState("skipped_backfill"),
        scheduledAt: null,
        completedAt: null,
      };
    }
    state.initialized = true;
  } else {
    newArticles = latest
      .filter((article) => !state.articles[article.id])
      .sort(
        (a, b) =>
          new Date(a.publishedAt).valueOf() - new Date(b.publishedAt).valueOf(),
      );
    newArticles.forEach((article, index) => {
      state.articles[article.id] = {
        id: article.id,
        canonicalUrl: article.canonicalUrl,
        title: article.title,
        publishedAt: article.publishedAt,
        bodyHash: article.bodyHash,
        batchId,
        homepage: { status: "published", updatedAt: now.toISOString() },
        package: {
          status: "awaiting_review",
          manifestPath: `content/${article.id}/manifest.json`,
          generatedAt: null,
        },
        linkedin: channelState(),
        instagram: channelState(),
        scheduledAt: nextKstSlot(now, index),
        completedAt: null,
      };
    });
  }

  state.lastCheckedAt = now.toISOString();
  state.lastCheckedCanonicalUrl = latest[0].canonicalUrl;
  return { bootstrap, newArticles };
}
