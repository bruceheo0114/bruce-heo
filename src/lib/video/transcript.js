import { CONFIG } from "../../config.js";
import { transcribeAudioFile } from "./transcribe.js";
import { fetchMetadata, fetchSubtitles, hasBinary, withAudio } from "./ytdlp.js";
import {
  VideoSourceError,
  extractPlayerResponse,
  fetchText,
  listCaptionTracks,
  parseJson3,
  parseVtt,
  pickCaptionTrack,
  videoMetadata,
  watchUrl,
} from "./youtube.js";

export function parseSubtitleFile(content, format) {
  return format === "json3" ? parseJson3(content) : parseVtt(content);
}

/** 1순위: 로그인 없이 watch 페이지의 자막 트랙을 그대로 읽는다. */
async function fromWatchPage(videoId, language) {
  const html = await fetchText(watchUrl(videoId));
  const playerResponse = extractPlayerResponse(html);
  if (!playerResponse) return null;
  const track = pickCaptionTrack(listCaptionTracks(playerResponse), language);
  if (!track) return null;
  const url = `${track.baseUrl}&fmt=json3`;
  const segments = parseJson3(await fetchText(url));
  if (!segments.length) return null;
  return {
    segments,
    source: track.generated ? "youtube-auto-captions" : "youtube-captions",
    languageCode: track.languageCode,
    metadata: videoMetadata(playerResponse),
  };
}

/** 2순위: yt-dlp가 플레이어 인증을 대신 처리하게 한다. */
async function fromYtDlpSubtitles(videoId, language) {
  const subtitles = await fetchSubtitles(videoId, language);
  if (!subtitles) return null;
  const segments = parseSubtitleFile(subtitles.content, subtitles.format);
  if (!segments.length) return null;
  return {
    segments,
    source: subtitles.generated ? "yt-dlp-auto-captions" : "yt-dlp-captions",
    languageCode: subtitles.languageCode,
    metadata: null,
  };
}

/** 3순위: 자막이 아예 없으면 오디오를 받아 직접 받아쓴다. */
async function fromAudio(videoId, language, options) {
  const segments = await withAudio(videoId, (filePath) =>
    transcribeAudioFile(filePath, { ...options, language }),
  );
  if (!segments.length) return null;
  return {
    segments,
    source: "openai-transcription",
    languageCode: language,
    metadata: null,
  };
}

/**
 * 자막 → yt-dlp 자막 → 음성 받아쓰기 순으로 시도하고
 * 처음 성공한 결과를 공통 형식으로 돌려준다.
 */
export async function resolveTranscript(videoId, options = {}) {
  const language = options.language ?? CONFIG.video.captionLanguage;
  const notes = [];
  const ytDlpAvailable = options.ytDlpAvailable ?? (await hasBinary("yt-dlp"));

  const providers = [
    { name: "watch-page", enabled: true, run: () => fromWatchPage(videoId, language) },
    {
      name: "yt-dlp-subtitles",
      enabled: ytDlpAvailable,
      run: () => fromYtDlpSubtitles(videoId, language),
    },
    {
      name: "audio-transcription",
      enabled: ytDlpAvailable && !options.captionsOnly,
      run: () => fromAudio(videoId, language, options),
    },
  ];

  let metadata = null;
  for (const provider of providers) {
    if (!provider.enabled) {
      notes.push(`${provider.name}: 사용할 수 없어 건너뜀`);
      continue;
    }
    try {
      const result = await provider.run();
      if (!result) {
        notes.push(`${provider.name}: 결과 없음`);
        continue;
      }
      metadata = result.metadata ?? metadata;
      if (!metadata && ytDlpAvailable) {
        metadata = await fetchMetadata(videoId).catch(() => null);
      }
      return {
        videoId,
        url: watchUrl(videoId),
        source: result.source,
        languageCode: result.languageCode,
        metadata: metadata ?? { videoId, title: null, channel: null, durationSeconds: null },
        segments: result.segments,
        notes,
      };
    } catch (error) {
      notes.push(`${provider.name}: ${error.message}`);
    }
  }

  throw new VideoSourceError(
    `대본을 만들 수 없습니다. 시도한 경로:\n- ${notes.join("\n- ")}`,
  );
}

export function transcriptText(segments) {
  return segments.map((segment) => segment.text).join(" ");
}

export function transcriptDuration(segments) {
  return segments.length ? Math.max(...segments.map((segment) => segment.end)) : 0;
}

/**
 * 요약 모델에 넣을 크기로 세그먼트를 나눈다.
 * 앞 청크 끝부분을 조금 겹쳐 문맥이 끊기지 않게 한다.
 */
export function chunkSegments(segments, options = {}) {
  const limit = options.chunkCharacters ?? CONFIG.video.chunkCharacters;
  const overlap = options.overlapCharacters ?? CONFIG.video.chunkOverlapCharacters;
  const chunks = [];
  let current = [];
  let length = 0;
  let carried = 0;

  const flush = () => {
    if (current.length <= carried) return;
    chunks.push({
      index: chunks.length,
      start: current[0].start,
      end: current.at(-1).end,
      text: transcriptText(current),
    });
  };

  for (const segment of segments) {
    current.push(segment);
    length += segment.text.length + 1;
    if (length < limit) continue;

    flush();
    const tail = [];
    let tailLength = 0;
    for (let index = current.length - 1; index >= 0 && tailLength < overlap; index -= 1) {
      tail.unshift(current[index]);
      tailLength += current[index].text.length + 1;
    }
    current = tail;
    length = tailLength;
    carried = tail.length;
  }
  flush();

  const maxChunks = options.maxChunks ?? CONFIG.video.maxChunks;
  if (chunks.length > maxChunks) {
    throw new VideoSourceError(
      `대본이 너무 길어 ${maxChunks}개 청크를 넘었습니다. --chunk-characters 값을 키우세요.`,
    );
  }
  return chunks;
}
