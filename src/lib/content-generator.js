import { readFile } from "node:fs/promises";
import path from "node:path";
import { PATHS } from "../config.js";
import { validateGeneratedContent } from "./content-schema.js";

// 글쓰기는 Claude 루틴(content/routine_writer_prompt.md)이 맡는다.
// Actions는 원문을 source.json으로 남기고, 루틴이 쓴 draft.json을 검사해 카드로 만든다.
export function sourceForWriter(article) {
  return {
    id: article.id,
    canonicalUrl: article.canonicalUrl,
    title: article.title,
    subtitle: article.subtitle,
    publishedAt: article.publishedAt,
    excerpt: article.excerpt,
    bodyHash: article.bodyHash,
    body: article.body.slice(0, 45_000),
    images: article.images.map((url, index) => ({ index, url })),
  };
}

export function draftPath(articleId) {
  return path.join(PATHS.content, articleId, "draft.json");
}

export function sourcePath(articleId) {
  return path.join(PATHS.content, articleId, "source.json");
}

export async function loadDraft(article) {
  let generated;
  try {
    generated = JSON.parse(await readFile(draftPath(article.id), "utf8"));
  } catch (error) {
    throw new Error(`${draftPath(article.id)}를 읽지 못했습니다: ${error.message}`);
  }
  const errors = validateGeneratedContent(generated, article);
  if (errors.length) {
    throw new Error(`원고 품질 검사 실패:\n- ${errors.join("\n- ")}`);
  }
  return generated;
}

export function buildManifest(article, generated, scheduledAt) {
  const generatedAt = new Date().toISOString();
  return {
    version: 1,
    article: {
      id: article.id,
      canonicalUrl: article.canonicalUrl,
      title: article.title,
      subtitle: article.subtitle,
      publishedAt: article.publishedAt,
      excerpt: article.excerpt,
      bodyHash: article.bodyHash,
      sourceImages: article.images,
    },
    cards: generated.cards.map((card, index) => ({
      sequence: index + 1,
      kind: card.kind,
      title: card.title,
      body: card.body,
      imageUrl:
        card.imageIndex === null ? null : article.images[card.imageIndex] ?? null,
      sourceImageIndex: card.imageIndex,
      altText: card.altText,
      file: `cards/${String(index + 1).padStart(2, "0")}.jpg`,
    })),
    linkedin: {
      body: generated.linkedinBody,
      firstComment: generated.linkedinFirstComment,
    },
    instagram: {
      caption: generated.instagramCaption,
      account: "bruce.insight",
      collaboratorOrTag: "heo.boram",
    },
    schedule: {
      approvedAt: null,
      scheduledAt,
      publishedAt: null,
    },
    publishing: {
      linkedin: { status: "pending", postId: null, commentId: null, error: null },
      instagram: {
        status: "manual_source_ready",
        mediaId: null,
        error: null,
      },
    },
    generatedAt,
    generator: {
      model: "claude-routine",
      renderer: "bruce-insight-html-css-v1",
    },
  };
}

