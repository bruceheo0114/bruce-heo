import { existsSync } from "node:fs";
import { ApiError, jsonRequest, requireEnvironment } from "../lib/http.js";

// LINKEDIN_PERSON_URN 이 없으면 토큰의 OpenID userinfo(sub)로 채운다. 그래서 Secret 은 토큰 하나면 된다.
export async function ensurePersonUrn() {
  requireEnvironment(["LINKEDIN_ACCESS_TOKEN"]);
  if (process.env.LINKEDIN_PERSON_URN) return process.env.LINKEDIN_PERSON_URN;
  const { body } = await jsonRequest("LinkedIn", "https://api.linkedin.com/v2/userinfo", {
    headers: { authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` },
  });
  if (!body?.sub) throw new Error("LinkedIn userinfo 응답에 sub가 없습니다. openid profile 권한을 확인해 주세요.");
  process.env.LINKEDIN_PERSON_URN = `urn:li:person:${body.sub}`;
  return process.env.LINKEDIN_PERSON_URN;
}

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

// Posts API 의 commentary 는 "little text" 형식이라 ( ) [ ] < > @ | 등 예약 문자를 이스케이프하지 않으면
// 그 자리에서 본문이 잘린다(2026-10-13 224번이 "LGE닷컴(LGE.com)" 에서 잘림). 해시태그는 템플릿으로 바꾼다.
const LITTLE_TEXT_RESERVED = /[\\|{}@\[\]()<>#*_~]/g;

export function toLittleText(text) {
  return String(text)
    .split(/(#[\p{L}\p{N}_]+)/u)
    .map((part, index) =>
      index % 2 === 1
        ? `{hashtag|\\#|${part.slice(1).replace(LITTLE_TEXT_RESERVED, (c) => `\\${c}`)}}`
        : part.replace(LITTLE_TEXT_RESERVED, (c) => `\\${c}`),
    )
    .join("");
}

// 첫 댓글 권한(w_member_social_feed)이 없어 댓글로 링크를 달 수 없다. 본문 끝(해시태그 앞)에 전문 링크를 넣는다.
// 전문 링크는 홈페이지(bruceheo.com/writing/<id>/)가 우선이고, 아직 백업 전인 글만 브런치로 보낸다(사용자 결정 2026-10-13).
export function fullTextUrl(article) {
  if (!article) return null;
  return existsSync(`data/archive/${article.id}.json`)
    ? `https://bruceheo.com/writing/${article.id}/`
    : article.canonicalUrl;
}

export function linkedInBodyWithLink(body, url) {
  if (!url || body.includes(url)) return body;
  const lines = body.trimEnd().split("\n");
  const tags = /^(#\S+\s*)+$/.test(lines.at(-1) ?? "") ? lines.pop() : null;
  const linked = `${lines.join("\n").trimEnd()}\n\n전문은 아래 링크에서 읽으실 수 있습니다.\n${url}`;
  return tags ? `${linked}\n\n${tags}` : linked;
}

export function linkedInPostPayload(text) {
  return {
    author: process.env.LINKEDIN_PERSON_URN,
    commentary: toLittleText(text),
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
  await ensurePersonUrn();
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
        body: JSON.stringify(linkedInPostPayload(linkedInBodyWithLink(manifest.linkedin.body, fullTextUrl(manifest.article)))),
      },
    );
    postId = response.headers.get("x-restli-id");
    if (!postId) throw new Error("LinkedIn 게시물 응답에 x-restli-id가 없습니다.");
    await checkpoint?.({ status: "post_published", postId, commentId: null });
  }

  if (!commentId) {
    const endpoint = `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(postId)}/comments`;
    try {
      const { response, body } = await jsonRequest("LinkedIn", endpoint, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(
          linkedInCommentPayload(postId, manifest.linkedin.firstComment),
        ),
      });
      commentId = response.headers.get("x-restli-id") ?? body?.id ?? body?.commentUrn;
    } catch (error) {
      // 첫 댓글은 별도 권한(w_member_social_feed)이 있어야 한다. 권한이 없으면 본문 게시만으로 끝낸다.
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        return { status: "published", postId, commentId: null, commentSkipped: error.message.slice(0, 300) };
      }
      throw error;
    }
    if (!commentId) throw new Error("LinkedIn 첫 댓글 ID를 확인하지 못했습니다.");
    await checkpoint?.({ status: "published", postId, commentId });
  }

  return { status: "published", postId, commentId };
}
