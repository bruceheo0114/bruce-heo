import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { CONFIG } from "../../config.js";
import { resolveClient } from "./openai.js";
import { splitAudio } from "./ytdlp.js";

function segmentsFromResponse(result, offsetSeconds) {
  if (Array.isArray(result?.segments) && result.segments.length) {
    return result.segments
      .map((segment) => ({
        start: Number(segment.start ?? 0) + offsetSeconds,
        end: Number(segment.end ?? segment.start ?? 0) + offsetSeconds,
        text: String(segment.text ?? "").trim(),
      }))
      .filter((segment) => segment.text);
  }
  const text = String(result?.text ?? "").trim();
  return text ? [{ start: offsetSeconds, end: offsetSeconds, text }] : [];
}

async function transcribePart(client, model, filePath, offsetSeconds, language) {
  const result = await client.audio.transcriptions.create({
    file: createReadStream(filePath),
    model,
    language,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });
  return segmentsFromResponse(result, offsetSeconds);
}

/**
 * 자막이 없는 영상의 오디오를 받아쓴다.
 * 업로드 한도를 넘으면 ffmpeg으로 나눈 뒤 오프셋을 더해 타임코드를 이어 붙인다.
 */
export async function transcribeAudioFile(filePath, options = {}) {
  const client = resolveClient(options, "음성 받아쓰기");
  const model = options.model ?? CONFIG.video.transcriptionModel;
  const language = options.language ?? CONFIG.video.captionLanguage;

  const { size } = await stat(filePath);
  const parts =
    size <= CONFIG.video.maxUploadBytes
      ? [{ path: filePath, offsetSeconds: 0 }]
      : await splitAudio(filePath, CONFIG.video.audioSegmentSeconds);

  const segments = [];
  for (const part of parts) {
    segments.push(
      ...(await transcribePart(
        client,
        model,
        part.path,
        part.offsetSeconds,
        language,
      )),
    );
  }
  return segments;
}
