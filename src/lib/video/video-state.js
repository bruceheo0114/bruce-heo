import { PATHS } from "../../config.js";
import { readJson, writeJson } from "../files.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function createInitialVideoState() {
  return {
    version: 1,
    channelId: null,
    lastDiscoveredAt: null,
    videos: {},
  };
}

export async function loadVideoState() {
  const state = await readJson(PATHS.videoState, createInitialVideoState());
  if (!state.videos || typeof state.videos !== "object") {
    throw new Error("video-state.json이 손상되었습니다: videos는 객체여야 합니다.");
  }
  return state;
}

export async function saveVideoState(state) {
  await writeJson(PATHS.videoState, state);
}

export function createEntry(video, match, options = {}) {
  return {
    id: video.id,
    url: video.url,
    title: video.title ?? null,
    publishedAt: video.publishedAt ?? null,
    seriesId: match.series.id,
    seriesLabel: match.series.label,
    profile: match.series.profile ?? "general",
    matchedBy: match.matchedBy,
    origin: options.origin ?? "channel",
    status: "waiting",
    attempts: 0,
    firstSeenAt: options.now ?? new Date().toISOString(),
    lastAttemptAt: null,
    lastError: null,
    summaryPath: null,
    notionPageId: null,
    notionUrl: null,
  };
}

function processAfterDays(config, entry) {
  const series = config.series.find((item) => item.id === entry.seriesId);
  return series?.processAfterDays ?? config.processAfterDays ?? 2;
}

/** 라이브가 끝나고 대기 일수가 지나야 처리 대상이 된다. */
export function readyAt(config, entry) {
  const published = new Date(entry.publishedAt ?? entry.firstSeenAt);
  if (Number.isNaN(published.valueOf())) return null;
  return new Date(published.valueOf() + processAfterDays(config, entry) * DAY_MS);
}

export function isExpired(config, entry, now = new Date()) {
  const published = new Date(entry.publishedAt ?? entry.firstSeenAt);
  if (Number.isNaN(published.valueOf())) return false;
  const limit = published.valueOf() + (config.retryDays ?? 7) * DAY_MS;
  return new Date(now).valueOf() > limit;
}

/**
 * 처리해야 할 항목을 오래된 영상부터 돌려준다.
 * 자막을 기다리는 중인 항목과 Notion 업로드만 남은 항목이 모두 포함된다.
 */
export function selectDueVideos(config, state, now = new Date()) {
  const current = new Date(now).valueOf();
  return Object.values(state.videos)
    .filter((entry) => {
      if (entry.status === "published" || entry.status === "skipped") return false;
      if (entry.status === "failed") return false;
      const ready = readyAt(config, entry);
      return ready ? ready.valueOf() <= current : true;
    })
    .sort(
      (a, b) =>
        new Date(a.publishedAt ?? a.firstSeenAt).valueOf() -
        new Date(b.publishedAt ?? b.firstSeenAt).valueOf(),
    );
}
