import { ApiError, jsonRequest, requireEnvironment } from "../lib/http.js";

function graphUrl(pathname) {
  const version = process.env.META_GRAPH_VERSION ?? "v25.0";
  return `https://graph.instagram.com/${version}/${pathname}`;
}

function formBody(values) {
  const form = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      form.set(key, String(value));
    }
  });
  return form;
}

async function post(pathname, values) {
  const { body } = await jsonRequest("Instagram", graphUrl(pathname), {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.IG_ACCESS_TOKEN}` },
    body: formBody(values),
  });
  if (!body?.id) throw new Error(`Instagram 응답에 id가 없습니다: ${pathname}`);
  return body.id;
}

async function containerStatus(containerId) {
  const url = new URL(graphUrl(containerId));
  url.searchParams.set("fields", "status_code,status");
  const { body } = await jsonRequest("Instagram", url, {
    headers: { authorization: `Bearer ${process.env.IG_ACCESS_TOKEN}` },
  });
  return body;
}

async function waitUntilReady(containerId, attempts = 12) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await containerStatus(containerId);
    if (status.status_code === "FINISHED") return;
    if (["ERROR", "EXPIRED"].includes(status.status_code)) {
      throw new Error(`Instagram 컨테이너 처리 실패: ${status.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Instagram 컨테이너 준비 시간이 초과되었습니다.");
}

export function instagramCardUrls(manifest, publicSiteUrl) {
  return manifest.cards.map(
    (card) =>
      `${publicSiteUrl.replace(/\/$/, "")}/content/${manifest.article.id}/${card.file}`,
  );
}

async function assertPublicImages(urls) {
  for (const url of urls) {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok || !/^image\/jpeg/i.test(response.headers.get("content-type") ?? "")) {
      throw new Error(`Instagram이 읽을 공개 JPEG가 아직 준비되지 않았습니다: ${url}`);
    }
    await response.body?.cancel();
  }
}

export async function publishInstagram(manifest, options = {}) {
  requireEnvironment(["IG_ACCESS_TOKEN", "IG_USER_ID", "PUBLIC_SITE_URL"]);
  const urls = instagramCardUrls(manifest, process.env.PUBLIC_SITE_URL);
  await assertPublicImages(urls);

  const taggedUsername = process.env.IG_TAG_USERNAME ?? "heo.boram";
  const childIds = [];
  for (let index = 0; index < urls.length; index += 1) {
    childIds.push(
      await post(`${process.env.IG_USER_ID}/media`, {
        image_url: urls[index],
        is_carousel_item: true,
        alt_text: manifest.cards[index].altText,
        user_tags: JSON.stringify([
          { username: taggedUsername, x: 0.5, y: 0.5 },
        ]),
      }),
    );
  }

  const collaborator = process.env.IG_COLLABORATOR_USERNAME ?? "heo.boram";
  const carouselValues = {
    media_type: "CAROUSEL",
    children: JSON.stringify(childIds),
    caption: manifest.instagram.caption,
    collaborators: JSON.stringify([collaborator]),
  };

  let carouselId;
  try {
    carouselId = await post(`${process.env.IG_USER_ID}/media`, carouselValues);
  } catch (error) {
    if (!(error instanceof ApiError) || !collaborator) throw error;
    delete carouselValues.collaborators;
    carouselId = await post(`${process.env.IG_USER_ID}/media`, carouselValues);
  }
  await waitUntilReady(carouselId, options.statusAttempts);
  const mediaId = await post(`${process.env.IG_USER_ID}/media_publish`, {
    creation_id: carouselId,
  });
  return { status: "published", mediaId, carouselId, childIds };
}
