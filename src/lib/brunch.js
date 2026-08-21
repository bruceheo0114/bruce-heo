import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { CONFIG } from "../config.js";
import { mapLimit } from "./files.js";

export class BrunchStructureError extends Error {
  constructor(message) {
    super(message);
    this.name = "BrunchStructureError";
    this.code = "BRUNCH_STRUCTURE_CHANGED";
  }
}

export function canonicalUrl(articleId) {
  return `${CONFIG.profileUrl}/${articleId}`;
}

export function articleIdFromUrl(url) {
  return String(url ?? "").match(/\/(\d+)(?:[/?#]|$)/)?.[1] ?? null;
}

function absoluteUrl(value) {
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  try {
    return new URL(value, "https://brunch.co.kr").href;
  } catch {
    return null;
  }
}

function compactText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanArticleTitle(value) {
  return compactText(value).replace(/^\d+화\s+/, "");
}

export function parseProfileFeed(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items = $("channel > item")
    .toArray()
    .map((node) => {
      const item = $(node);
      const sourceUrl = item.find("link").first().text().trim();
      const id = articleIdFromUrl(sourceUrl);
      if (!id) return null;

      const descriptionHtml = item.find("description").first().text();
      const description = cheerio.load(descriptionHtml);
      const imageUrl = absoluteUrl(description("img").first().attr("src"));
      description("img").remove();

      return {
        id,
        canonicalUrl: canonicalUrl(id),
        feedTitle: compactText(item.find("title").first().text()),
        feedDescription: compactText(description.root().text()),
        feedPublishedAt: item.find("pubDate").first().text().trim(),
        feedImageUrl: imageUrl,
      };
    })
    .filter(Boolean);

  const seen = new Set();
  const unique = items.filter((item) => {
    if (seen.has(item.canonicalUrl)) return false;
    seen.add(item.canonicalUrl);
    return true;
  });
  if (!unique.length) {
    throw new BrunchStructureError(
      "브런치 RSS에서 /@heoboram/{번호} 형식의 공개 글을 찾지 못했습니다.",
    );
  }
  return unique;
}

function meta($, property) {
  return compactText(
    $(`meta[property="${property}"]`).attr("content") ??
      $(`meta[name="${property}"]`).attr("content"),
  );
}

export function parseArticleHtml(html, expectedId = null) {
  const $ = cheerio.load(html);
  const canonicalFromPage = $("link[rel=canonical]").attr("href");
  const id = expectedId ?? articleIdFromUrl(canonicalFromPage);
  const title = cleanArticleTitle(
    meta($, "og:title") || compactText($("h1").first().text()),
  );
  const publishedAt = meta($, "article:published_time");
  const subtitle = compactText($(".cover_sub_title").first().text());

  const paragraphs = $(".wrap_item.item_type_text, .wrap_body h2, .wrap_body h3")
    .toArray()
    .map((node) => compactText($(node).text()))
    .filter((text) => text.length > 1);
  let body = compactText(paragraphs.join("\n\n"));
  if (body.length < 100) body = meta($, "og:description");

  const imageCandidates = [meta($, "og:image")];
  $(".wrap_body img, .wrap_item img, article img").each((_, node) => {
    const element = $(node);
    imageCandidates.push(
      element.attr("data-src") ??
        element.attr("src") ??
        element.attr("data-original"),
    );
  });
  const images = [
    ...new Set(
      imageCandidates
        .map(absoluteUrl)
        .filter((url) => url && !/profile|ico_|emoji|logo/i.test(url)),
    ),
  ];

  if (!id || !title || !publishedAt || body.length < 80) {
    throw new BrunchStructureError(
      `브런치 글 구조를 해석하지 못했습니다 (id=${id ?? "unknown"}, title=${Boolean(title)}, date=${Boolean(publishedAt)}, body=${body.length}).`,
    );
  }

  return {
    id: String(id),
    canonicalUrl: canonicalUrl(id),
    title,
    subtitle,
    publishedAt: new Date(publishedAt).toISOString(),
    excerpt: meta($, "og:description"),
    body,
    images,
    bodyHash: createHash("sha256").update(body).digest("hex"),
  };
}

export async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: CONFIG.fetchHeaders });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      }
    }
  }
  throw new Error(`브런치 요청 실패: ${url}: ${lastError.message}`);
}

export async function fetchArticle(articleId) {
  return parseArticleHtml(await fetchText(canonicalUrl(articleId)), articleId);
}

export async function fetchLatestArticles(limit = 20) {
  const feedItems = parseProfileFeed(await fetchText(CONFIG.feedUrl)).slice(0, limit);
  const articles = await mapLimit(feedItems, 4, async (item) => ({
    ...item,
    ...(await fetchArticle(item.id)),
  }));
  return articles.sort(
    (a, b) =>
      new Date(b.publishedAt).valueOf() - new Date(a.publishedAt).valueOf() ||
      Number(b.id) - Number(a.id),
  );
}
