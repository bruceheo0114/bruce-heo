import * as cheerio from "cheerio";
import { VideoSourceError, fetchText, parseVideoId } from "./youtube.js";

const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;

function channelIdFromHtml(html) {
  const direct = html.match(/"(?:channelId|externalChannelId)":"(UC[\w-]{22})"/);
  if (direct) return direct[1];
  const meta = html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/);
  return meta?.[1] ?? null;
}

function seedUrl(seed) {
  const videoId = parseVideoId(seed);
  if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
  if (seed.startsWith("@")) return `https://www.youtube.com/${seed}`;
  if (seed.startsWith("http")) return seed;
  return `https://www.youtube.com/@${seed}`;
}

/**
 * 채널 ID, 핸들(@name), 채널 주소, 그 채널의 영상 주소 중 무엇을 주더라도
 * UC로 시작하는 채널 ID로 바꾼다.
 */
export async function resolveChannelId(seed) {
  const value = String(seed ?? "").trim();
  if (!value) throw new VideoSourceError("채널 시드가 비어 있습니다.");
  if (CHANNEL_ID_PATTERN.test(value)) return value;

  const html = await fetchText(seedUrl(value));
  const channelId = channelIdFromHtml(html);
  if (!channelId) {
    throw new VideoSourceError(
      `채널 ID를 찾지 못했습니다: ${value}. data/video-series.json의 channelSeed를 확인하세요.`,
    );
  }
  return channelId;
}

export function parseChannelFeed(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("feed > entry")
    .toArray()
    .map((node) => {
      const entry = $(node);
      const id = entry.find("yt\\:videoId").first().text().trim();
      if (!id) return null;
      return {
        id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: entry.find("title").first().text().trim(),
        publishedAt: entry.find("published").first().text().trim(),
      };
    })
    .filter(Boolean);
}

/** 채널 RSS는 최근 15개만 돌려준다. 주 2회 일정에는 충분하다. */
export async function fetchChannelVideos(channelId) {
  const xml = await fetchText(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
  );
  return parseChannelFeed(xml);
}
