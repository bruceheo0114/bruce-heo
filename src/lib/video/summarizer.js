import { CONFIG } from "../../config.js";
import { resolveClient } from "./openai.js";
import { chunkSegments, transcriptDuration } from "./transcript.js";
import { formatTimestamp } from "./youtube.js";
import {
  CHUNK_NOTES_SCHEMA,
  SUMMARY_SCHEMA,
  validateSummary,
} from "./summary-schema.js";

const NOTE_INSTRUCTIONS = `당신은 영상 대본을 읽고 사실만 추리는 노트 작성자다.

절대 규칙:
- 대본에 없는 사실, 이름, 수치, 결론을 만들지 않는다.
- 자동 자막은 오탈자가 있을 수 있다. 문맥상 명백한 오인식만 바로잡고, 확신이 없으면 들린 대로 둔다.
- 각 노트의 timestampSeconds는 그 내용이 실제로 나온 지점의 초 단위 값이다.
- 인사말, 광고, 잡담은 노트로 남기지 않는다.
- 인용은 화자가 실제로 말한 문장을 그대로 옮긴다. 화자를 모르면 speaker를 null로 둔다.`;

const SUMMARY_INSTRUCTIONS = `당신은 마케터 '브루스'가 영상을 다시 보지 않고도 내용을 파악하도록 돕는 요약자다.

절대 규칙:
- 노트와 대본에 있는 내용만 사용한다. 배경지식으로 보충하지 않는다.
- 결과는 한국어로 쓴다. 원문에 등장한 고유명사와 영문 용어는 그대로 둔다.
- 챕터는 영상 흐름을 따라 시간 순서로 정렬하고, startSeconds는 그 주제가 시작된 지점이다.
- 핵심 포인트는 "무엇을 말했는가"가 아니라 "그래서 무엇이 달라지는가"까지 쓴다.
- actionItems는 시청자가 바로 실행할 수 있는 행동만 쓴다. 없으면 빈 배열로 둔다.
- openQuestions는 영상에서 답하지 않고 남겨둔 질문만 쓴다. 없으면 빈 배열로 둔다.
- 과장, 단정, 감탄사를 쓰지 않고 관찰과 근거로 서술한다.`;

async function structuredCall(client, options) {
  const response = await client.responses.create({
    model: options.model,
    reasoning: { effort: options.effort ?? "medium" },
    instructions: options.instructions,
    input: options.input,
    text: {
      format: {
        type: "json_schema",
        name: options.schemaName,
        description: options.schemaDescription,
        strict: true,
        schema: options.schema,
      },
    },
  });

  if (response.status !== "completed" || !response.output_text) {
    throw new Error(
      `OpenAI 응답이 완료되지 않았습니다: ${response.status} ${response.error?.message ?? ""}`,
    );
  }
  try {
    return JSON.parse(response.output_text);
  } catch (error) {
    throw new Error(`OpenAI 구조화 결과 JSON 파싱 실패: ${error.message}`);
  }
}

function chunkInput(transcript, chunk, chunkCount) {
  return JSON.stringify({
    videoTitle: transcript.metadata?.title ?? null,
    channel: transcript.metadata?.channel ?? null,
    chunk: `${chunk.index + 1}/${chunkCount}`,
    startsAt: formatTimestamp(chunk.start),
    endsAt: formatTimestamp(chunk.end),
    startSeconds: Math.floor(chunk.start),
    transcript: chunk.text,
  });
}

/** 청크마다 사실 노트를 뽑는다. 하나뿐이면 그대로 요약 단계로 넘긴다. */
async function collectNotes(client, model, transcript, chunks) {
  const notes = [];
  const quotes = [];
  for (const chunk of chunks) {
    const result = await structuredCall(client, {
      model,
      effort: "low",
      instructions: NOTE_INSTRUCTIONS,
      input: `다음 대본 구간에서 사실 노트와 인용을 뽑아라.\n\n${chunkInput(transcript, chunk, chunks.length)}`,
      schemaName: "video_chunk_notes",
      schemaDescription: "영상 대본 구간의 사실 노트와 인용",
      schema: CHUNK_NOTES_SCHEMA,
    });
    notes.push(...(result.notes ?? []));
    quotes.push(...(result.quotes ?? []));
  }
  return { notes, quotes };
}

/**
 * 대본을 청크로 나눠 노트를 모은 뒤 하나의 요약으로 합친다.
 * 대본이 짧으면 노트 단계를 건너뛰고 곧바로 요약한다.
 */
export async function summarizeTranscript(transcript, options = {}) {
  const client = resolveClient(options, "영상 요약");
  const model = options.model ?? CONFIG.video.summaryModel;
  const chunks = chunkSegments(transcript.segments, options);
  const durationSeconds =
    transcript.metadata?.durationSeconds ?? transcriptDuration(transcript.segments);

  const notes =
    chunks.length > 1 ? await collectNotes(client, model, transcript, chunks) : null;

  const summaryInput = JSON.stringify({
    videoTitle: transcript.metadata?.title ?? null,
    channel: transcript.metadata?.channel ?? null,
    url: transcript.url,
    durationSeconds: Math.floor(durationSeconds),
    transcriptSource: transcript.source,
    notes: notes?.notes ?? null,
    candidateQuotes: notes?.quotes ?? null,
    transcript: notes ? null : chunks[0]?.text ?? "",
  });

  const summary = await structuredCall(client, {
    model,
    effort: "medium",
    instructions: SUMMARY_INSTRUCTIONS,
    input: `다음 영상을 요약하라.\n\n${summaryInput}`,
    schemaName: "video_summary",
    schemaDescription: "영상 챕터, 핵심 포인트, 인용, 실행 항목 요약",
    schema: SUMMARY_SCHEMA,
  });

  const errors = validateSummary(summary, { durationSeconds });
  if (errors.length) {
    throw new Error(`영상 요약 품질 검사 실패:\n- ${errors.join("\n- ")}`);
  }
  return {
    ...summary,
    chunkCount: chunks.length,
    durationSeconds: Math.floor(durationSeconds),
  };
}
