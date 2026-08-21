import { jsonRequest, requireEnvironment } from "../lib/http.js";

function headers() {
  requireEnvironment([
    "LINKEDIN_ACCESS_TOKEN",
    "LINKEDIN_PERSON_URN",
    "LINKEDIN_API_VERSION",
  ]);
  return {
    authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
    "content-type": "application/json",
    "linkedin-version": process.env.LINKEDIN_API_VERSION,
    "x-restli-protocol-version": "2.0.0",
  };
}

export function linkedInPostPayload(text) {
  return {
    author: process.env.LINKEDIN_PERSON_URN,
    commentary: text,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
}

export function linkedInCommentPayload(postUrn, text) {
  return {
    actor: process.env.LINKEDIN_PERSON_URN,
    object: postUrn,
    message: { text },
  };
}

export async function publishLinkedIn(manifest, existing = {}, checkpoint = null) {
  const requestHeaders = headers();
  let postId = existing.postId ?? null;
  let commentId = existing.commentId ?? null;

  if (!postId) {
    const { response } = await jsonRequest(
      "LinkedIn",
      "https://api.linkedin.com/rest/posts",
      {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(linkedInPostPayload(manifest.linkedin.body)),
      },
    );
    postId = response.headers.get("x-restli-id");
    if (!postId) throw new Error("LinkedIn 게시물 응답에 x-restli-id가 없습니다.");
    await checkpoint?.({ status: "post_published", postId, commentId: null });
  }

  if (!commentId) {
    const endpoint = `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(postId)}/comments`;
    const { response, body } = await jsonRequest("LinkedIn", endpoint, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(
        linkedInCommentPayload(postId, manifest.linkedin.firstComment),
      ),
    });
    commentId = response.headers.get("x-restli-id") ?? body?.id ?? body?.commentUrn;
    if (!commentId) throw new Error("LinkedIn 첫 댓글 ID를 확인하지 못했습니다.");
    await checkpoint?.({ status: "published", postId, commentId });
  }

  return { status: "published", postId, commentId };
}
