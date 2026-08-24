import OpenAI from "openai";
import { CONFIG } from "../config.js";
import { CONTENT_SCHEMA, validateGeneratedContent } from "./content-schema.js";

const INSTRUCTIONS = `당신은 에이전시 경력 마케터 '브루스'의 콘텐츠 편집자다.
브런치 원문만 근거로 카드뉴스, LinkedIn, Instagram 문안을 한국어로 작성한다.

절대 규칙:
- 원문에 없는 사실, 브랜드명, 인용문, 수치, 성과를 만들지 않는다.
- 첫 문장은 독자가 이미 겪었을 법한 장면이나 감정으로 시작한다. 개념 이름을 설명하지 말고, 장면 → “왜 그랬을까?”라는 질문 → 원문에 있는 이유 → 오늘 해볼 한 가지 순서로 쓴다.
- 첫 훅은 원문에 있는 장면만 사용하며 공포, 과장, 조급함, 죄책감 유도 같은 다크 패턴은 사용하지 않는다.
- 카드마다 하나의 주장만 전달한다. 제목은 1~2문장, 설명은 3~5개의 짧은 줄에 맞는 분량으로 쓴다.
- 카드 7~10장: 표지 → 익숙한 장면 → 독자가 품을 질문 → 원문에 있는 이유 → 쉬운 예 → 오늘 해볼 한 가지 → 마무리 순서를 기본으로 한다. 카드 한 장에는 한 가지 이야기만 쓴다.
- 이미지가 주장과 직접 연결될 때만 imageIndex를 사용한다. 이미지가 부족하면 null로 두어 텍스트 중심 카드로 만든다.
- LinkedIn은 인용문 또는 질문으로 시작하고 문단을 1~3문장으로 짧게 나눈다. 사례와 원문 속 객관적 수치, 에이전시 마케터로서의 경험/고민, 논리적 전환, 압축된 결론, 독자 질문, 5~10개 해시태그를 포함한다.
- LinkedIn 본문에는 URL을 절대 넣지 않는다. 첫 댓글에는 정확한 canonical URL과 한 줄 안내만 쓴다.
- Instagram은 이모지 핵심 주장 → 사례 설명 → 📌 전환 → 마케팅 해석 → 독자 질문 → 🔍 원문 안내 → 저장 CTA → 해시태그 4~7개 순서로 쓴다. #브루스매거진은 필수다.
- 말투는 분석적이되 단정적으로 과장하지 않고, 관찰 → 질문 → 해석으로 전개한다.`;

function sourceForModel(article) {
  return {
    id: article.id,
    canonicalUrl: article.canonicalUrl,
    title: article.title,
    subtitle: article.subtitle,
    publishedAt: article.publishedAt,
    excerpt: article.excerpt,
    body: article.body.slice(0, 45_000),
    images: article.images.map((url, index) => ({ index, url })),
  };
}

export async function generateContent(article, options = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 없어 콘텐츠 생성을 중단했습니다.");
  }
  const client = options.client ?? new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: options.model ?? CONFIG.openaiModel,
    reasoning: { effort: "medium" },
    instructions: INSTRUCTIONS,
    input: `다음 브런치 원문을 채널별 콘텐츠 패키지로 변환하라.\n\n${JSON.stringify(sourceForModel(article))}`,
    text: {
      format: {
        type: "json_schema",
        name: "bruce_social_content",
        description: "브루스 인사이트 카드뉴스와 LinkedIn/Instagram 문안",
        strict: true,
        schema: CONTENT_SCHEMA,
      },
    },
  });

  if (response.status !== "completed" || !response.output_text) {
    throw new Error(
      `OpenAI 응답이 완료되지 않았습니다: ${response.status} ${response.error?.message ?? ""}`,
    );
  }

  let generated;
  try {
    generated = JSON.parse(response.output_text);
  } catch (error) {
    throw new Error(`OpenAI 구조화 결과 JSON 파싱 실패: ${error.message}`);
  }
  const errors = validateGeneratedContent(generated, article);
  if (errors.length) {
    throw new Error(`생성 콘텐츠 품질 검사 실패:\n- ${errors.join("\n- ")}`);
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
      model: CONFIG.openaiModel,
      renderer: "bruce-insight-html-css-v1",
    },
  };
}

