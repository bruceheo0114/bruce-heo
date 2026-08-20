// 브런치 본문에서 카드뉴스 원고를 만듭니다.
// ANTHROPIC_API_KEY 가 있으면 Claude 로 카피를 쓰고, 없으면 본문에서 발췌해 채웁니다.

const MODEL = process.env.CARDNEWS_MODEL || 'claude-opus-5';
const BODY_LIMIT = 12000;

/** 카드 원고 스키마 — 구조화 출력으로 형태를 고정합니다. */
const COPY_SCHEMA = {
  type: 'object',
  properties: {
    hook: { type: 'string', description: '표지 카드의 후킹 문구. 공백 포함 22자 이내.' },
    subhead: { type: 'string', description: '표지 보조 문구 한 줄. 40자 이내.' },
    cards: {
      type: 'array',
      minItems: 4,
      maxItems: 5,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: '카드 주제를 압축한 짧은 라벨. 10자 이내.' },
          headline: { type: 'string', description: '카드 핵심 문장. 24자 이내.' },
          body: { type: 'string', description: '헤드라인을 풀어주는 설명. 90자 이내, 2문장 이하.' },
        },
        required: ['label', 'headline', 'body'],
        additionalProperties: false,
      },
    },
    closing: { type: 'string', description: '마지막 카드에 넣을 마무리 한 문장. 45자 이내.' },
  },
  required: ['hook', 'subhead', 'cards', 'closing'],
  additionalProperties: false,
};

const SYSTEM = `당신은 11년차 IMC 마케터이자 브런치 작가 '브루스 허'의 카드뉴스 편집자입니다.
브루스 허는 브랜드가 왜 그렇게 움직였는지, 소비자의 맥락은 무엇이었는지를 관찰하고 해석해서 씁니다.

카드뉴스 원고 원칙:
- 글쓴이의 관점과 결론을 그대로 살립니다. 없는 사실이나 숫자를 지어내지 않습니다.
- 광고 카피처럼 과장하지 않습니다. 담백한 서술체로, 문장 끝은 '~다' 로 맺습니다.
- 표지 문구는 질문이나 역설로 궁금하게 만들되 낚시성 표현은 쓰지 않습니다.
- 각 카드는 하나의 생각만 담습니다. 카드끼리 같은 말을 반복하지 않습니다.
- 마지막 카드 문장은 글 전체가 남기는 메시지로 맺습니다.
- 이모지, 해시태그, 느낌표 남발을 쓰지 않습니다.`;

function sentences(text) {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?…])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

function clamp(str, max) {
  const s = String(str || '').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trim()}…`;
}

/** 발췌 원고의 카드 라벨 — 글의 흐름을 따라갑니다. */
const FALLBACK_LABELS = ['관찰', '맥락', '해석', '정리'];

/** 문장을 헤드라인으로 쓸 수 있게 다듬습니다. */
function toHeadline(sentence) {
  const trimmed = sentence.replace(/[.!?…]+$/, '').trim();
  if (trimmed.length <= 34) return trimmed;
  // 쉼표나 접속 지점에서 끊어 자연스러운 한 덩어리만 남깁니다.
  const cut = trimmed.slice(0, 34);
  const at = Math.max(cut.lastIndexOf(','), cut.lastIndexOf(' '));
  return (at > 12 ? cut.slice(0, at) : cut).trim();
}

/**
 * API 키가 없을 때 쓰는 발췌 방식 원고.
 * 본문을 네 구간으로 나눠 구간마다 헤드라인 한 문장과 설명 문장을 뽑습니다.
 * 카피 품질보다 '어떤 상황에서도 카드가 나온다'가 목적입니다.
 */
export function extractiveCopy(post, bodyText) {
  const pool = sentences(bodyText).filter((s) => s.length >= 12 && s.length <= 160);
  const cards = [];
  const size = Math.max(1, Math.ceil(pool.length / FALLBACK_LABELS.length));
  const used = new Set(); // 같은 문장이 여러 카드에 반복되지 않게 합니다.

  for (let i = 0; i < FALLBACK_LABELS.length; i += 1) {
    const chunk = pool.slice(i * size, (i + 1) * size).filter((s) => !used.has(s));
    if (!chunk.length) break;
    // 짧은 문장은 헤드라인으로, 그 다음 문장은 설명으로 씁니다.
    const headSentence = [...chunk].sort((a, b) => a.length - b.length)[0];
    used.add(headSentence);
    const bodySentence = chunk.find((s) => !used.has(s)) || headSentence;
    used.add(bodySentence);
    cards.push({
      label: FALLBACK_LABELS[i],
      headline: toHeadline(headSentence),
      body: clamp(bodySentence, 90),
    });
  }

  if (!cards.length) {
    cards.push({ label: FALLBACK_LABELS[0], headline: toHeadline(post.title), body: clamp(post.summary || post.title, 90) });
  }

  return {
    hook: clamp(post.title, 40),
    subhead: '브루스 허의 브런치 기록',
    cards,
    closing: '전문은 브런치에서 이어집니다.',
    source: 'extractive',
  };
}

function normalize(copy) {
  return {
    hook: clamp(copy.hook, 40),
    subhead: clamp(copy.subhead, 60),
    cards: (copy.cards || []).slice(0, 5).map((c, i) => ({
      label: clamp(c.label || `${i + 1}`, 14),
      headline: clamp(c.headline, 34),
      body: clamp(c.body, 120),
    })),
    closing: clamp(copy.closing, 60),
  };
}

async function claudeCopy(post, bodyText) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: COPY_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: `다음 브런치 글을 인스타그램 카드뉴스 원고로 옮겨 주세요.

제목: ${post.title}
주소: ${post.url}

본문:
"""
${bodyText.slice(0, BODY_LIMIT)}
"""

표지 1장, 본문 4~5장, 마무리 1장 구성입니다. 본문 카드는 글의 흐름(관찰 → 해석 → 결론)을 따라가게 배치해 주세요.`,
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  const parsed = response.parsed_output ?? JSON.parse(text);
  return { ...normalize(parsed), source: MODEL };
}

/**
 * 카드뉴스 원고를 만듭니다. Claude 호출이 실패해도 발췌본으로 돌려줍니다.
 */
export async function generateCardCopy(post, bodyText) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('  ANTHROPIC_API_KEY 가 없어 본문 발췌로 원고를 만듭니다.');
    return extractiveCopy(post, bodyText);
  }
  try {
    return await claudeCopy(post, bodyText);
  } catch (err) {
    console.warn(`  Claude 원고 생성 실패, 발췌본으로 대체합니다: ${err.message}`);
    return extractiveCopy(post, bodyText);
  }
}
