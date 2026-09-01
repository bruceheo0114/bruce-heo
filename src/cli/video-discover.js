import { PATHS } from "../config.js";
import { fetchChannelVideos, resolveChannelId } from "../lib/video/channel.js";
import { classifyVideo, loadSeriesConfig } from "../lib/video/series.js";
import {
  createEntry,
  loadVideoState,
  saveVideoState,
} from "../lib/video/video-state.js";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

const config = await loadSeriesConfig(PATHS.videoSeries);
const state = await loadVideoState();
const now = new Date();

state.channelId ??= await resolveChannelId(config.channelSeed);
const videos = await fetchChannelVideos(state.channelId);

const lookbackMs = (config.lookbackDays ?? 21) * 24 * 60 * 60 * 1000;
const added = [];
const ignored = [];

for (const video of videos) {
  if (state.videos[video.id]) continue;
  if (now.valueOf() - new Date(video.publishedAt).valueOf() > lookbackMs) continue;

  const match = classifyVideo(config, video);
  if (!match || match.series.manualOnly) {
    ignored.push({
      id: video.id,
      title: video.title,
      reason: match ? `${match.series.label}은 수동 등록 대상` : "일치하는 시리즈 없음",
    });
    continue;
  }
  const entry = createEntry(video, match, { now: now.toISOString() });
  if (!dryRun) state.videos[video.id] = entry;
  added.push({
    id: entry.id,
    title: entry.title,
    series: entry.seriesLabel,
    matchedBy: entry.matchedBy,
  });
}

if (!dryRun) {
  state.lastDiscoveredAt = now.toISOString();
  await saveVideoState(state);
}

console.log(
  JSON.stringify(
    { dryRun, channelId: state.channelId, scanned: videos.length, added, ignored },
    null,
    2,
  ),
);
