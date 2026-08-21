import { CONFIG } from "../config.js";

export const CONTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    cards: {
      type: "array",
      minItems: CONFIG.cardMin,
      maxItems: CONFIG.cardMax,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: {
            type: "string",
            enum: [
              "cover",
              "hook",
              "context",
              "evidence",
              "interpretation",
              "application",
              "conclusion",
              "example",
              "question",
              "cta",
            ],
          },
          title: { type: "string", minLength: 1, maxLength: 70 },
          body: { type: "string", minLength: 1, maxLength: 280 },
          imageIndex: { type: ["integer", "null"], minimum: 0 },
          altText: { type: "string", minLength: 1, maxLength: 250 },
        },
        required: ["kind", "title", "body", "imageIndex", "altText"],
      },
    },
    linkedinBody: { type: "string", minLength: 100, maxLength: 3000 },
    linkedinFirstComment: { type: "string", minLength: 10, maxLength: 500 },
    instagramCaption: { type: "string", minLength: 100, maxLength: 2200 },
  },
  required: [
    "cards",
    "linkedinBody",
    "linkedinFirstComment",
    "instagramCaption",
  ],
};

const URL_PATTERN = /https?:\/\/\S+/i;

function hashtagCount(text) {
  return (text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
}

export function validateGeneratedContent(generated, article) {
  const errors = [];
  if (!generated || typeof generated !== "object") {
    return ["생성 결과가 객체가 아닙니다."];
  }

  if (
    !Array.isArray(generated.cards) ||
    generated.cards.length < CONFIG.cardMin ||
    generated.cards.length > CONFIG.cardMax
  ) {
    errors.push(`카드는 ${CONFIG.cardMin}~${CONFIG.cardMax}장이어야 합니다.`);
  } else {
    if (generated.cards[0]?.kind !== "cover") errors.push("첫 카드는 cover여야 합니다.");
    if (generated.cards.at(-1)?.kind !== "cta") errors.push("마지막 카드는 cta여야 합니다.");
    generated.cards.forEach((card, index) => {
      if (!card.title?.trim() || card.title.length > 70) {
        errors.push(`${index + 1}번 카드 제목 길이가 잘못되었습니다.`);
      }
      if (!card.body?.trim() || card.body.length > 280) {
        errors.push(`${index + 1}번 카드 설명 길이가 잘못되었습니다.`);
      }
      if (card.kind !== "cover" && card.title.length > 55) {
        errors.push(`${index + 1}번 본문 카드 제목은 55자 이하여야 합니다.`);
      }
      if (card.kind !== "cover" && card.body.length > 210) {
        errors.push(`${index + 1}번 본문 카드 설명은 210자 이하여야 합니다.`);
      }
      if (
        card.imageIndex !== null &&
        (!Number.isInteger(card.imageIndex) || !article.images[card.imageIndex])
      ) {
        errors.push(`${index + 1}번 카드 이미지 인덱스가 원문 범위를 벗어났습니다.`);
      }
    });
  }

  if (URL_PATTERN.test(generated.linkedinBody ?? "")) {
    errors.push("LinkedIn 본문에는 URL이 없어야 합니다.");
  }
  if (!generated.linkedinFirstComment?.includes(article.canonicalUrl)) {
    errors.push("LinkedIn 첫 댓글에 정확한 브런치 canonical URL이 없습니다.");
  }
  if (!(generated.linkedinBody ?? "").includes("?")) {
    errors.push("LinkedIn 본문은 독자 질문으로 끝나야 합니다.");
  }
  const linkedInHashtags = hashtagCount(generated.linkedinBody ?? "");
  if (linkedInHashtags < 5 || linkedInHashtags > 10) {
    errors.push("LinkedIn 해시태그는 5~10개여야 합니다.");
  }
  if (/\d/.test(article.body) && !/\d/.test(generated.linkedinBody ?? "")) {
    errors.push("원문에 있는 객관적 수치가 LinkedIn 문안에서 빠졌습니다.");
  }

  const instagram = generated.instagramCaption ?? "";
  if (!instagram.includes("🔍") || !instagram.includes("브런치")) {
    errors.push("Instagram 캡션에 브런치 원문 안내가 없습니다.");
  }
  if (!instagram.includes("저장")) {
    errors.push("Instagram 캡션에 저장 CTA가 없습니다.");
  }
  if (!instagram.includes("#브루스매거진")) {
    errors.push("Instagram 캡션에 #브루스매거진이 없습니다.");
  }
  const instagramHashtags = hashtagCount(instagram);
  if (instagramHashtags < 4 || instagramHashtags > 7) {
    errors.push("Instagram 해시태그는 4~7개여야 합니다.");
  }
  return errors;
}
