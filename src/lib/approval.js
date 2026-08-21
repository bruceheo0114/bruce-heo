import { nextKstApprovalSlot } from "./time.js";

export function approvePackages(state, candidates, approvedAt) {
  const approvalDate = new Date(approvedAt);
  if (Number.isNaN(approvalDate.valueOf())) {
    throw new Error(`Invalid approval date: ${approvedAt}`);
  }
  const approvedAtIso = approvalDate.toISOString();
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const occupiedSlots = new Set(
    Object.values(state.articles)
      .filter(
        (article) =>
          !candidateIds.has(article.id) &&
          article.package.status === "generated" &&
          article.linkedin.status !== "published" &&
          article.scheduledAt,
      )
      .map((article) => article.scheduledAt),
  );

  const approvable = candidates
    .filter((candidate) => state.articles[candidate.id]?.package.status === "awaiting_review")
    .sort(
      (a, b) =>
        new Date(state.articles[a.id].publishedAt).valueOf() -
        new Date(state.articles[b.id].publishedAt).valueOf(),
    );
  const approved = [];
  let additionalDays = 0;
  for (const candidate of approvable) {
    const article = state.articles[candidate.id];

    let scheduledAt = nextKstApprovalSlot(approvalDate, additionalDays);
    while (occupiedSlots.has(scheduledAt)) {
      additionalDays += 1;
      scheduledAt = nextKstApprovalSlot(approvalDate, additionalDays);
    }

    article.package.status = "generated";
    article.package.generatedAt ??= candidate.generatedAt ?? approvedAtIso;
    article.package.approvedAt = approvedAtIso;
    article.approvedAt = approvedAtIso;
    article.scheduledAt = scheduledAt;
    if (article.instagram.status === "manual_pending") {
      article.instagram.status = "manual_source_ready";
    }

    occupiedSlots.add(scheduledAt);
    approved.push({ id: article.id, approvedAt: approvedAtIso, scheduledAt });
    additionalDays += 1;
  }

  return approved;
}
