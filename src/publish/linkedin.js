import { existsSync, readFileSync } from "node:fs";
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

// 브런치 커버 이미지: 홈페이지 백업(data/archive/<id>.json)의 coverImage, 없으면 원문 첫 이미지.
export function coverImageUrl(article) {
  if (!article) return null;
  const archive = `data/archive/${article.id}.json`;
  if (existsSync(archive)) {
    const cover = JSON.parse(readFileSync(archive, "utf8")).coverImage;
    if (cover) return cover;
  }
  return article.sourceImages?.[0] ?? null;
}

// Images API: 업로드 주소를 받아 이미지를 올리고 image URN 을 돌려준다(w_member_social 권한으로 된다).
async function uploadImage(requestHeaders, imageUrl) {
  const source = await fetch(imageUrl);
  if (!source.ok) throw new Error(`커버 이미지 다운로드 실패 (${source.status}): ${imageUrl}`);
  const bytes = Buffer.from(await source.arrayBuffer());
  const { body } = await jsonRequest("LinkedIn", "https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify({ initializeUploadRequest: { owner: process.env.LINKEDIN_PERSON_URN } }),
  });
  const { uploadUrl, image } = body?.value ?? {};
  if (!uploadUrl || !image) throw new Error("LinkedIn 이미지 업로드 주소를 받지 못했습니다.");
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { authorization: requestHeaders.authorization },
    body: bytes,
  });
  if (!upload.ok) throw new ApiError("LinkedIn", upload.status, await upload.text());
  return image;
}

// 첫 댓글은 앱에 댓글 권한(w_member_social_feed)이 없어 자동으로 달지 않는다.
// 게시 후 사용자가 직접 달 수 있게 댓글 문안을 돌려준다(publish-due 가 GitHub Issue 로 알린다).
export async function publishLinkedIn(manifest, existing = {}, checkpoint = null) {
  await ensurePersonUrn();
  const requestHeaders = headers();
  let postId = existing.postId ?? null;
  let imageError = null;

  if (!postId) {
    // withLink: false 는 본문에 링크를 넣지 않는다(사용자가 원문 링크를 댓글로 직접 다는 즉시 게시).
    const text = manifest.linkedin.withLink === false
      ? manifest.linkedin.body
      : linkedInBodyWithLink(manifest.linkedin.body, fullTextUrl(manifest.article));
    const payload = linkedInPostPayload(text);
    const cover = coverImageUrl(manifest.article);
    if (cover) {
      try {
        const image = await uploadImage(requestHeaders, cover);
        payload.content = { media: { id: image, altText: manifest.article?.title ?? "" } };
      } catch (error) {
        // 이미지 때문에 게시 자체를 놓치지 않는다. 사유는 상태에 남긴다.
        imageError = error.message.slice(0, 300);
      }
    }
    const { response } = await jsonRequest("LinkedIn", "https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(payload),
    });
    postId = response.headers.get("x-restli-id");
    if (!postId) throw new Error("LinkedIn 게시물 응답에 x-restli-id가 없습니다.");
  }

  const result = { status: "published", postId, commentId: null, manualComment: manifest.linkedin.firstComment };
  if (imageError) result.imageError = imageError;
  await checkpoint?.(result);
  return result;
}
