import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSummaryMarkdown,
  buildVideoManifest,
} from "../src/lib/video/render.js";
import { chunkSegments, parseSubtitleFile } from "../src/lib/video/transcript.js";
import { summarizeTranscript } from "../src/lib/video/summarizer.js";
import { validateSummary } from "../src/lib/video/summary-schema.js";
import {
  extractPlayerResponse,
  formatTimestamp,
  listCaptionTracks,
  parseJson3,
  parseVideoId,
  parseVtt,
  pickCaptionTrack,
  videoMetadata,
} from "../src/lib/video/youtube.js";

const playerResponse = {
  videoDetails: {
    videoId: "AKdwQeu7Ed4",
    title: "브랜드 마케팅 라이브",
    author: "브루스",
    lengthSeconds: "3600",
    isLiveContent: true,
    shortDescription: "라이브 방송",
  },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        {
          baseUrl: "https://www.youtube.com/api/timedtext?v=AKdwQeu7Ed4&lang=en",
          languageCode: "en",
          name: { simpleText: "English" },
        },
        {
          baseUrl: "https://www.youtube.com/api/timedtext?v=AKdwQeu7Ed4&lang=ko",
          languageCode: "ko",
          kind: "asr",
          name: { simpleText: "한국어 (자동 생성됨)" },
        },
      ],
    },
  },
};

const watchPage = `<!doctype html><html><body><script>
var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};
var other = {"brace":"} not the end"};
</script></body></html>`;

test("모든 YouTube URL 형태에서 영상 ID를 뽑는다", () => {
  const expected = "AKdwQeu7Ed4";
  const inputs = [
    "https://www.youtube.com/live/AKdwQeu7Ed4?si=y_NbIrTngdRKFdnz",
    "https://www.youtube.com/watch?v=AKdwQeu7Ed4&t=30s",
    "https://youtu.be/AKdwQeu7Ed4?si=abc",
    "https://www.youtube.com/shorts/AKdwQeu7Ed4",
    "https://www.youtube.com/embed/AKdwQeu7Ed4",
    "AKdwQeu7Ed4",
  ];
  for (const input of inputs) assert.equal(parseVideoId(input), expected);
  assert.equal(parseVideoId("https://vimeo.com/12345"), null);
  assert.equal(parseVideoId(""), null);
});

test("watch 페이지에서 플레이어 응답과 자막 트랙을 읽는다", () => {
  const parsed = extractPlayerResponse(watchPage);
  assert.equal(parsed.videoDetails.videoId, "AKdwQeu7Ed4");
  assert.deepEqual(videoMetadata(parsed), {
    videoId: "AKdwQeu7Ed4",
    title: "브랜드 마케팅 라이브",
    channel: "브루스",
    durationSeconds: 3600,
    isLive: true,
    description: "라이브 방송",
  });

  const tracks = listCaptionTracks(parsed);
  assert.equal(tracks.length, 2);
  assert.equal(pickCaptionTrack(tracks, "ko").languageCode, "ko");
  assert.equal(pickCaptionTrack(tracks, "ko").generated, true);
  // 요청 언어가 없으면 자동 생성이 아닌 트랙을 먼저 고른다.
  assert.equal(pickCaptionTrack(tracks, "ja").languageCode, "en");
  assert.equal(pickCaptionTrack([], "ko"), null);
});

test("json3 자막에서 롤링 중복과 aAppend 줄을 걷어낸다", () => {
  const segments = parseJson3({
    events: [
      { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "브랜드는" }, { utf8: " 질문입니다" }] },
      { tStartMs: 2000, dDurationMs: 10, aAppend: 1, segs: [{ utf8: "브랜드는 질문입니다" }] },
      { tStartMs: 2000, dDurationMs: 3000, segs: [{ utf8: "브랜드는 질문입니다 그리고 반복입니다" }] },
      { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: "\n" }] },
      { tStartMs: 6000, dDurationMs: 2000, segs: [{ utf8: "오늘 이야기입니다" }] },
    ],
  });
  assert.deepEqual(segments, [
    { start: 0, end: 5, text: "브랜드는 질문입니다 그리고 반복입니다" },
    { start: 6, end: 8, text: "오늘 이야기입니다" },
  ]);
});

test("WebVTT 자막도 같은 세그먼트 형식으로 정규화한다", () => {
  const vtt = [
    "WEBVTT",
    "",
    "00:00:01.000 --> 00:00:04.000",
    "<c>첫 번째 줄</c>",
    "이어지는 줄",
    "",
    "00:01:05.500 --> 00:01:07.000",
    "두 번째 줄",
    "",
  ].join("\n");
  assert.deepEqual(parseSubtitleFile(vtt, "vtt"), [
    { start: 1, end: 4, text: "첫 번째 줄 이어지는 줄" },
    { start: 65.5, end: 67, text: "두 번째 줄" },
  ]);
});

test("타임코드를 시:분:초로 표시한다", () => {
  assert.equal(formatTimestamp(0), "00:00");
  assert.equal(formatTimestamp(65), "01:05");
  assert.equal(formatTimestamp(3725), "1:02:05");
});

test("대본을 겹침 있는 청크로 나누고 꼬리 청크를 중복 생성하지 않는다", () => {
  const segments = Array.from({ length: 40 }, (_, index) => ({
    start: index * 5,
    end: index * 5 + 5,
    text: `${index}번 문장 ${"가".repeat(20)}`,
  }));
  const chunks = chunkSegments(segments, {
    chunkCharacters: 200,
    overlapCharacters: 60,
  });

  assert.ok(chunks.length > 2);
  assert.equal(chunks[0].start, 0);
  assert.equal(chunks.at(-1).end, 200);
  // 겹침 때문에 다음 청크는 이전 청크가 끝나기 전에 시작한다.
  assert.ok(chunks[1].start < chunks[0].end);
  // 청크 텍스트가 서로 완전히 같은 경우는 없어야 한다.
  assert.equal(new Set(chunks.map((chunk) => chunk.text)).size, chunks.length);
  assert.equal(
    chunks.at(-1).text.includes("39번 문장"),
    true,
  );
});

test("청크가 상한을 넘으면 요약을 시작하기 전에 멈춘다", () => {
  const segments = Array.from({ length: 60 }, (_, index) => ({
    start: index,
    end: index + 1,
    text: "가".repeat(50),
  }));
  assert.throws(
    () => chunkSegments(segments, { chunkCharacters: 100, maxChunks: 3 }),
    /청크/,
  );
});

const summary = {
  title: "브랜드는 무엇을 반복하는가",
  oneLine: "8년 동안 같은 질문을 반복한 브랜드의 캠페인 구조를 정리한 라이브입니다.",
  tldr: ["질문을 반복한다", "감정은 자산이 된다", "측정 지표를 바꾼다"],
  chapters: [
    { startSeconds: 0, title: "여는 이야기", summary: "라이브의 목적을 설명합니다." },
    { startSeconds: 600, title: "사례 분석", summary: "캠페인 사례를 뜯어봅니다." },
    { startSeconds: 2400, title: "정리", summary: "적용 지점을 정리합니다." },
  ],
  keyPoints: [
    { timestampSeconds: 120, point: "질문이 자산이다", detail: "반복된 질문이 브랜드를 만듭니다." },
    { timestampSeconds: 900, point: "지표를 바꾼다", detail: "조회수 대신 회상률을 봅니다." },
    { timestampSeconds: 2500, point: "실행이 남는다", detail: "다음 캠페인에 적용합니다." },
  ],
  quotes: [{ timestampSeconds: 300, speaker: "브루스", text: "브랜드는 질문입니다." }],
  actionItems: ["이번 주 캠페인 질문을 한 문장으로 적어보기"],
  openQuestions: ["질문 반복은 몇 년이면 충분한가?"],
};

const transcript = {
  videoId: "AKdwQeu7Ed4",
  url: "https://www.youtube.com/watch?v=AKdwQeu7Ed4",
  source: "youtube-auto-captions",
  languageCode: "ko",
  metadata: { title: "브랜드 마케팅 라이브", channel: "브루스", durationSeconds: 3600, isLive: true },
  segments: [{ start: 0, end: 5, text: "브랜드는 질문입니다." }],
  notes: [],
};

test("요약 품질 검사가 대본과 어긋난 타임코드를 잡는다", () => {
  assert.deepEqual(validateSummary(summary, { durationSeconds: 3600 }), []);

  const outOfRange = structuredClone(summary);
  outOfRange.keyPoints[2].timestampSeconds = 99_999;
  assert.ok(
    validateSummary(outOfRange, { durationSeconds: 3600 }).some((error) =>
      error.includes("핵심 포인트"),
    ),
  );

  const unsorted = structuredClone(summary);
  unsorted.chapters[1].startSeconds = 3000;
  assert.ok(
    validateSummary(unsorted, { durationSeconds: 3600 }).some((error) =>
      error.includes("시간 순서"),
    ),
  );
});

test("요약 마크다운에 타임코드 딥링크가 들어간다", () => {
  const markdown = buildSummaryMarkdown(transcript, { ...summary, durationSeconds: 3600 });
  assert.match(markdown, /# 브랜드는 무엇을 반복하는가/);
  assert.match(
    markdown,
    /\[10:00\]\(https:\/\/www\.youtube\.com\/watch\?v=AKdwQeu7Ed4&t=600s\)/,
  );
  assert.match(markdown, /- 대본 출처: YouTube 자동 자막 \(ko\)/);
  assert.match(markdown, /- \[ \] 이번 주 캠페인 질문을 한 문장으로 적어보기/);
  assert.match(markdown, /- 길이: 1:00:00/);
});

test("긴 대본은 노트 단계를 거쳐 한 번의 요약으로 합쳐진다", async () => {
  const calls = [];
  const client = {
    responses: {
      create: async (request) => {
        calls.push(request.text.format.name);
        const payload =
          request.text.format.name === "video_chunk_notes"
            ? {
                notes: [{ timestampSeconds: 10, claim: "질문", detail: "반복" }],
                quotes: [],
              }
            : summary;
        return { status: "completed", output_text: JSON.stringify(payload) };
      },
    },
  };

  const long = {
    ...transcript,
    segments: Array.from({ length: 30 }, (_, index) => ({
      start: index * 100,
      end: index * 100 + 100,
      text: "가".repeat(200),
    })),
  };
  const result = await summarizeTranscript(long, {
    client,
    model: "test-model",
    chunkCharacters: 1000,
  });

  assert.ok(result.chunkCount > 1);
  assert.equal(calls.filter((name) => name === "video_chunk_notes").length, result.chunkCount);
  assert.equal(calls.at(-1), "video_summary");
  assert.equal(result.durationSeconds, 3600);

  const manifest = buildVideoManifest(long, result);
  assert.equal(manifest.video.id, "AKdwQeu7Ed4");
  assert.equal(manifest.transcript.chunkCount, result.chunkCount);
  assert.equal(manifest.summary.tldr.length, 3);
});

test("요약이 품질 검사를 통과하지 못하면 파일을 만들지 않고 실패한다", async () => {
  const broken = structuredClone(summary);
  broken.chapters = broken.chapters.slice(0, 1);
  const client = {
    responses: {
      create: async () => ({ status: "completed", output_text: JSON.stringify(broken) }),
    },
  };
  await assert.rejects(
    () => summarizeTranscript(transcript, { client, model: "test-model" }),
    /영상 요약 품질 검사 실패/,
  );
});

test("CLI는 옵션 값을 영상 주소로 착각하지 않는다", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);

  // --lang이 소비한 값이 영상 ID처럼 생겼어도 주소로 쓰지 않는다.
  await assert.rejects(
    () => run(process.execPath, ["src/cli/summarize-video.js", "--lang", "AKdwQeu7Ed4"]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /사용법/);
      return true;
    },
  );
});
