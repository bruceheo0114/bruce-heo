import { formatTimestamp, timestampUrl } from "./youtube.js";

const SOURCE_LABELS = {
  "youtube-captions": "YouTube 자막",
  "youtube-auto-captions": "YouTube 자동 자막",
  "yt-dlp-captions": "yt-dlp 자막",
  "yt-dlp-auto-captions": "yt-dlp 자동 자막",
  "openai-transcription": "음성 받아쓰기",
};

export function sourceLabel(source) {
  return SOURCE_LABELS[source] ?? source;
}

function link(videoId, seconds) {
  return `[${formatTimestamp(seconds)}](${timestampUrl(videoId, seconds)})`;
}

function section(title, lines) {
  return lines.length ? [`## ${title}`, "", ...lines, ""] : [];
}

export function buildSummaryMarkdown(transcript, summary) {
  const videoId = transcript.videoId;
  const lines = [
    `# ${summary.title}`,
    "",
    `> ${summary.oneLine}`,
    "",
    `- 원본: [${transcript.metadata?.title ?? transcript.url}](${transcript.url})`,
    `- 채널: ${transcript.metadata?.channel ?? "확인 불가"}`,
    `- 길이: ${formatTimestamp(summary.durationSeconds)}`,
    `- 대본 출처: ${sourceLabel(transcript.source)} (${transcript.languageCode || "언어 미상"})`,
    "",
  ];

  lines.push(
    ...section(
      "핵심 요약",
      summary.tldr.map((item) => `- ${item}`),
    ),
    ...section(
      "챕터",
      summary.chapters.map(
        (chapter) => `- ${link(videoId, chapter.startSeconds)} **${chapter.title}** — ${chapter.summary}`,
      ),
    ),
    ...section(
      "핵심 포인트",
      summary.keyPoints.flatMap((point) => [
        `- ${link(videoId, point.timestampSeconds)} **${point.point}**`,
        `  - ${point.detail}`,
      ]),
    ),
    ...section(
      "성경 본문",
      (summary.scriptures ?? []).map(
        (item) => `- ${link(videoId, item.timestampSeconds)} **${item.reference}** — ${item.note}`,
      ),
    ),
    ...section(
      "인용",
      summary.quotes.map(
        (quote) =>
          `- ${link(videoId, quote.timestampSeconds)} “${quote.text}”${quote.speaker ? ` — ${quote.speaker}` : ""}`,
      ),
    ),
    ...section(
      "실행 항목",
      summary.actionItems.map((item) => `- [ ] ${item}`),
    ),
    ...section(
      "남은 질문",
      summary.openQuestions.map((item) => `- ${item}`),
    ),
  );

  return `${lines.join("\n").trimEnd()}\n`;
}

export function buildVideoManifest(transcript, summary) {
  return {
    version: 1,
    video: {
      id: transcript.videoId,
      url: transcript.url,
      title: transcript.metadata?.title ?? null,
      channel: transcript.metadata?.channel ?? null,
      durationSeconds: summary.durationSeconds,
      isLive: transcript.metadata?.isLive ?? null,
    },
    transcript: {
      source: transcript.source,
      languageCode: transcript.languageCode,
      segmentCount: transcript.segments.length,
      chunkCount: summary.chunkCount,
      notes: transcript.notes,
    },
    summary: {
      profile: summary.profile ?? "general",
      title: summary.title,
      oneLine: summary.oneLine,
      tldr: summary.tldr,
      chapters: summary.chapters,
      keyPoints: summary.keyPoints,
      quotes: summary.quotes,
      scriptures: summary.scriptures ?? [],
      actionItems: summary.actionItems,
      openQuestions: summary.openQuestions,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function buildTranscriptMarkdown(transcript) {
  const lines = transcript.segments.map(
    (segment) => `[${formatTimestamp(segment.start)}] ${segment.text}`,
  );
  return `${lines.join("\n")}\n`;
}
