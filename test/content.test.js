import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildPreviewHtml, CARD_STYLE } from "../src/lib/card-renderer.js";
import { validateGeneratedContent } from "../src/lib/content-schema.js";
import { buildManifest, generateContent } from "../src/lib/content-generator.js";

const article = {
  id: "212",
  canonicalUrl: "https://brunch.co.kr/@heoboram/212",
  body: "브랜드는 8년 동안 같은 질문을 이어왔다.",
  images: ["https://example.com/cover.jpg"],
};

const generated = {
  cards: [
    { kind: "cover", title: "집을 말하는 브랜드", body: "8년의 질문", imageIndex: 0, altText: "표지" },
    { kind: "hook", title: "광고가 더 기억난 이유", body: "한 가지 질문에서 시작합니다.", imageIndex: null, altText: "질문 카드" },
    { kind: "context", title: "반복되는 집 이야기", body: "캠페인의 맥락을 설명합니다.", imageIndex: null, altText: "맥락 카드" },
    { kind: "evidence", title: "8년의 일관성", body: "원문 속 수치를 근거로 봅니다.", imageIndex: null, altText: "근거 카드" },
    { kind: "interpretation", title: "감정은 자산이 된다", body: "마케팅 관점에서 해석합니다.", imageIndex: null, altText: "해석 카드" },
    { kind: "application", title: "질문을 바꿔야 합니다", body: "브랜드 적용점을 정리합니다.", imageIndex: null, altText: "적용 카드" },
    { kind: "cta", title: "당신의 브랜드는 무엇을 반복하나요", body: "브런치 원문을 읽고 저장해 보세요.", imageIndex: null, altText: "원문 안내 카드" },
  ],
  linkedinBody: "\"모두를 울린 광고는 매출에 도움이 될까?\"\n\n8년 동안 이어진 질문입니다.\n\n그렇다면 질문을 바꿔야 합니다. 당신의 브랜드는 무엇을 반복하고 있나요?\n\n#마케팅 #브랜딩 #광고 #콘텐츠 #브랜드전략",
  linkedinFirstComment: "원문은 브런치에서 읽을 수 있습니다. https://brunch.co.kr/@heoboram/212",
  instagramCaption: "🏠 집을 말하는 브랜드\n\n사례를 살펴봅니다.\n\n📌 질문을 바꿔야 합니다.\n\n마케팅 관점의 해석입니다. 무엇을 반복하고 있나요?\n\n🔍 원문은 브런치에서 더 길게\n저장해 두고 다시 읽어보세요.\n\n#브루스매거진 #마케팅 #브랜딩 #광고 #콘텐츠",
};

test("채널 문안 품질 규칙을 통과한다", () => {
  assert.deepEqual(validateGeneratedContent(generated, article), []);
});

test("LinkedIn 본문 URL과 잘못된 Instagram CTA를 거부한다", () => {
  const invalid = structuredClone(generated);
  invalid.linkedinBody += " https://example.com";
  invalid.instagramCaption = "#브루스매거진 #a #b #c";
  const errors = validateGeneratedContent(invalid, article);
  assert.ok(errors.some((error) => error.includes("LinkedIn 본문")));
  assert.ok(errors.some((error) => error.includes("원문 안내")));
});

test("7장과 10장 미리보기를 모두 만든다", () => {
  for (const count of [7, 10]) {
    const cards = Array.from({ length: count }, (_, index) => ({
      ...generated.cards[Math.min(index, generated.cards.length - 1)],
      sequence: index + 1,
      file: `cards/${String(index + 1).padStart(2, "0")}.jpg`,
      imageUrl: index === 0 ? article.images[0] : null,
    }));
    cards.at(-1).kind = "cta";
    const html = buildPreviewHtml({ article: { title: "테스트" }, cards });
    assert.equal((html.match(/data-document-role="page"/g) ?? []).length, count);
    assert.match(html, /1080px;height:1080px/);
  }
});

test("브루스 인사이트 색상·비율·로고 크기 기준을 회귀 검사한다", async () => {
  const baseline = JSON.parse(
    await readFile("test/fixtures/card-style-baseline.json", "utf8"),
  );
  assert.deepEqual(CARD_STYLE, baseline);
});

test("긴 제목과 이미지 부족 조건은 축소 타이포·텍스트 카드로 전환한다", () => {
  const longCards = structuredClone(generated.cards);
  longCards[0].title = "브랜드가 오래 기억되기 위해 반드시 반복해야 하는 단 하나의 질문은 무엇일까";
  longCards[0].imageIndex = null;
  longCards[1].title = "아주 긴 제목에서도 텍스트가 카드 밖으로 잘리지 않도록 자동으로 크기를 조절합니다";
  const manifest = {
    article: { title: "긴 제목 테스트" },
    cards: longCards.map((card, index) => ({
      ...card,
      sequence: index + 1,
      imageUrl: null,
      file: `cards/${String(index + 1).padStart(2, "0")}.jpg`,
    })),
  };
  const html = buildPreviewHtml(manifest);
  assert.match(html, /card--cover text-only/);
  assert.match(html, /cover-title--xs/);
  assert.match(html, /body-title--xs/);
});

test("Responses API에 gpt-5.6-terra 구조화 출력 형식을 전달한다", async () => {
  let request;
  const client = {
    responses: {
      create: async (value) => {
        request = value;
        return { status: "completed", output_text: JSON.stringify(generated) };
      },
    },
  };
  const output = await generateContent(article, { apiKey: "test", client });
  assert.equal(output.cards.length, 7);
  assert.equal(request.model, "gpt-5.6-terra");
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  const manifest = buildManifest(
    { ...article, title: "테스트", subtitle: "", publishedAt: "2026-08-17T12:00:02Z", excerpt: "", bodyHash: "abc" },
    output,
    "2026-08-21T09:30:00Z",
  );
  assert.equal(manifest.linkedin.firstComment, generated.linkedinFirstComment);
  assert.equal(manifest.publishing.instagram.status, "manual_source_ready");
});
