import { CONFIG } from "../../config.js";

export class VideoSourceError extends Error {
  constructor(message) {
    super(message);
    this.name = "VideoSourceError";
    this.code = "VIDEO_SOURCE_UNAVAILABLE";
  }
}

const ID_PATTERN = /^[\w-]{11}$/;

const PATH_PREFIXES = ["live", "shorts", "embed", "v"];

export function parseVideoId(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (ID_PATTERN.test(raw)) return raw;

  let url;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const candidate = url.pathname.split("/").filter(Boolean)[0];
    return ID_PATTERN.test(candidate ?? "") ? candidate : null;
  }
  if (!host.endsWith("youtube.com")) return null;

  const fromQuery = url.searchParams.get("v");
  if (ID_PATTERN.test(fromQuery ?? "")) return fromQuery;

  const [prefix, candidate] = url.pathname.split("/").filter(Boolean);
  if (PATH_PREFIXES.includes(prefix) && ID_PATTERN.test(candidate ?? "")) {
    return candidate;
  }
  return null;
}

export function watchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function timestampUrl(videoId, seconds) {
  return `${watchUrl(videoId)}&t=${Math.max(0, Math.floor(seconds))}s`;
}

export function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(rest)}`
    : `${pad(minutes)}:${pad(rest)}`;
}

/** ytInitialPlayerResponse 뒤에 오는 균형 잡힌 JSON 객체만 잘라낸다. */
export function extractJsonObject(text, startIndex) {
  if (text[startIndex] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }
  return null;
}

export function extractPlayerResponse(html) {
  const marker = html.indexOf("ytInitialPlayerResponse");
  if (marker < 0) return null;
  const braceIndex = html.indexOf("{", marker);
  if (braceIndex < 0) return null;
  const json = extractJsonObject(html, braceIndex);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function videoMetadata(playerResponse) {
  const details = playerResponse?.videoDetails ?? {};
  const durationSeconds = Number(details.lengthSeconds);
  return {
    videoId: details.videoId ?? null,
    title: details.title ?? null,
    channel: details.author ?? null,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    isLive: Boolean(details.isLiveContent),
    description: details.shortDescription ?? null,
  };
}

export function listCaptionTracks(playerResponse) {
  const tracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ??
    [];
  return tracks
    .filter((track) => track?.baseUrl)
    .map((track) => ({
      baseUrl: track.baseUrl,
      languageCode: track.languageCode ?? "",
      name: track.name?.simpleText ?? track.name?.runs?.[0]?.text ?? "",
      generated: track.kind === "asr",
    }));
}

/** 요청 언어의 사람 자막 → 요청 언어 자동 자막 → 그 외 순으로 고른다. */
export function pickCaptionTrack(tracks, language) {
  if (!tracks.length) return null;
  const prefix = String(language ?? "").split("-")[0].toLowerCase();
  const matches = (track) =>
    track.languageCode.split("-")[0].toLowerCase() === prefix;
  return (
    tracks.find((track) => matches(track) && !track.generated) ??
    tracks.find((track) => matches(track)) ??
    tracks.find((track) => !track.generated) ??
    tracks[0]
  );
}

/** YouTube json3 자막을 {start,end,text} 세그먼트로 정규화한다. */
export function parseJson3(payload) {
  const data = typeof payload === "string" ? JSON.parse(payload) : payload;
  const events = Array.isArray(data?.events) ? data.events : [];
  const segments = [];
  for (const event of events) {
    // 자동 자막은 직전 줄을 aAppend로 다시 흘려보내므로 건너뛴다.
    if (event?.aAppend === 1 || !Array.isArray(event?.segs)) continue;
    const text = event.segs
      .map((segment) => segment?.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const start = Number(event.tStartMs ?? 0) / 1000;
    const duration = Number(event.dDurationMs ?? 0) / 1000;
    segments.push({ start, end: start + duration, text });
  }
  return dedupeSegments(segments);
}

const VTT_TIME =
  /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/;

function vttSeconds(hours, minutes, seconds, millis) {
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
}

/** WebVTT/SRT 자막을 같은 세그먼트 형식으로 정규화한다. */
export function parseVtt(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const segments = [];
  let current = null;
  for (const line of lines) {
    const match = line.match(VTT_TIME);
    if (match) {
      if (current) segments.push(current);
      current = {
        start: vttSeconds(match[1], match[2], match[3], match[4]),
        end: vttSeconds(match[5], match[6], match[7], match[8]),
        text: "",
      };
      continue;
    }
    if (!current) continue;
    const cleaned = line
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    current.text = current.text ? `${current.text} ${cleaned}` : cleaned;
  }
  if (current) segments.push(current);
  return dedupeSegments(segments.filter((segment) => segment.text));
}

/** 롤링 자막이 만드는 완전 중복·포함 관계 줄을 정리한다. */
export function dedupeSegments(segments) {
  const result = [];
  for (const segment of segments) {
    const previous = result.at(-1);
    if (!previous) {
      result.push({ ...segment });
      continue;
    }
    if (previous.text === segment.text) {
      previous.end = Math.max(previous.end, segment.end);
      continue;
    }
    if (segment.text.startsWith(previous.text)) {
      previous.text = segment.text;
      previous.end = Math.max(previous.end, segment.end);
      continue;
    }
    result.push({ ...segment });
  }
  return result;
}

export async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    headers: CONFIG.fetchHeaders,
    ...options,
  });
  if (!response.ok) {
    throw new VideoSourceError(
      `YouTube 요청이 실패했습니다 (${response.status}): ${url}`,
    );
  }
  return response.text();
}
