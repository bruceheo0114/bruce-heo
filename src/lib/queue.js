import { isDue } from "./time.js";

export function selectDueArticle(articles, now = new Date()) {
  return Object.values(articles)
    .filter(
      (article) =>
        article.package.status === "generated" &&
        article.scheduledAt &&
        isDue(article.scheduledAt, now) &&
        article.linkedin.status !== "published",
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).valueOf() - new Date(b.scheduledAt).valueOf() ||
        new Date(a.publishedAt).valueOf() - new Date(b.publishedAt).valueOf(),
    )[0] ?? null;
}
