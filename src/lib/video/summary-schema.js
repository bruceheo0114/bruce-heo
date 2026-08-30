export const CHUNK_NOTES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    notes: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timestampSeconds: { type: "number", minimum: 0 },
          claim: { type: "string", minLength: 1, maxLength: 200 },
          detail: { type: "string", minLength: 1, maxLength: 500 },
        },
        required: ["timestampSeconds", "claim", "detail"],
      },
    },
    quotes: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timestampSeconds: { type: "number", minimum: 0 },
          speaker: { type: ["string", "null"] },
          text: { type: "string", minLength: 1, maxLength: 400 },
        },
        required: ["timestampSeconds", "speaker", "text"],
      },
    },
  },
  required: ["notes", "quotes"],
};

export const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 120 },
    oneLine: { type: "string", minLength: 10, maxLength: 200 },
    tldr: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: { type: "string", minLength: 5, maxLength: 220 },
    },
    chapters: {
      type: "array",
      minItems: 3,
      maxItems: 15,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          startSeconds: { type: "number", minimum: 0 },
          title: { type: "string", minLength: 1, maxLength: 80 },
          summary: { type: "string", minLength: 10, maxLength: 600 },
        },
        required: ["startSeconds", "title", "summary"],
      },
    },
    keyPoints: {
      type: "array",
      minItems: 3,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timestampSeconds: { type: "number", minimum: 0 },
          point: { type: "string", minLength: 1, maxLength: 160 },
          detail: { type: "string", minLength: 1, maxLength: 500 },
        },
        required: ["timestampSeconds", "point", "detail"],
      },
    },
    quotes: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timestampSeconds: { type: "number", minimum: 0 },
          speaker: { type: ["string", "null"] },
          text: { type: "string", minLength: 1, maxLength: 400 },
        },
        required: ["timestampSeconds", "speaker", "text"],
      },
    },
    actionItems: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 5, maxLength: 220 },
    },
    openQuestions: {
      type: "array",
      maxItems: 5,
      items: { type: "string", minLength: 5, maxLength: 220 },
    },
  },
  required: [
    "title",
    "oneLine",
    "tldr",
    "chapters",
    "keyPoints",
    "quotes",
    "actionItems",
    "openQuestions",
  ],
};

function timestampErrors(items, durationSeconds, label, key) {
  const errors = [];
  const limit = durationSeconds > 0 ? durationSeconds + 5 : Infinity;
  items.forEach((item, index) => {
    const value = Number(item?.[key]);
    if (!Number.isFinite(value) || value < 0 || value > limit) {
      errors.push(`${label} ${index + 1}번 타임코드가 영상 길이를 벗어났습니다.`);
    }
  });
  return errors;
}

/** 스키마를 통과한 결과가 실제 영상 대본과 어긋나지 않는지 확인한다. */
export function validateSummary(summary, context) {
  if (!summary || typeof summary !== "object") {
    return ["요약 결과가 객체가 아닙니다."];
  }
  const errors = [];
  const duration = context?.durationSeconds ?? 0;

  if (!Array.isArray(summary.tldr) || summary.tldr.length < 3) {
    errors.push("핵심 요약은 3개 이상이어야 합니다.");
  }
  if (!Array.isArray(summary.chapters) || summary.chapters.length < 3) {
    errors.push("챕터는 3개 이상이어야 합니다.");
  } else {
    const starts = summary.chapters.map((chapter) => Number(chapter.startSeconds));
    const sorted = [...starts].every(
      (value, index) => index === 0 || value >= starts[index - 1],
    );
    if (!sorted) errors.push("챕터 타임코드가 시간 순서가 아닙니다.");
    errors.push(...timestampErrors(summary.chapters, duration, "챕터", "startSeconds"));
  }
  if (!Array.isArray(summary.keyPoints) || summary.keyPoints.length < 3) {
    errors.push("핵심 포인트는 3개 이상이어야 합니다.");
  } else {
    errors.push(
      ...timestampErrors(summary.keyPoints, duration, "핵심 포인트", "timestampSeconds"),
    );
  }
  if (Array.isArray(summary.quotes)) {
    errors.push(...timestampErrors(summary.quotes, duration, "인용", "timestampSeconds"));
  }
  return errors;
}
