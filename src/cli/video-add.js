import { PATHS } from "../config.js";
import { findSeries, loadSeriesConfig } from "../lib/video/series.js";
import {
  createEntry,
  loadVideoState,
  saveVideoState,
} from "../lib/video/video-state.js";
import { parseVideoId, watchUrl } from "../lib/video/youtube.js";

const argv = process.argv.slice(2);

function option(name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

const VALUED_OPTIONS = ["--series", "--title", "--published-at"];

function positional() {
  for (let index = 0; index < argv.length; index += 1) {
    if (VALUED_OPTIONS.includes(argv[index])) {
      index += 1;
      continue;
    }
    if (!argv[index].startsWith("--")) return argv[index];
  }
  return null;
}

const videoId = parseVideoId(positional());
const seriesId = option("--series");
if (!videoId || !seriesId) {
  console.error(
    "사용법: npm run video:add -- <YouTube URL> --series <시리즈 id> [--title \"제목\"] [--published-at 2026-09-02T11:00:00Z]",
  );
  process.exit(1);
}

const config = await loadSeriesConfig(PATHS.videoSeries);
const series = findSeries(config, seriesId);
if (!series) {
  console.error(
    `알 수 없는 시리즈입니다: ${seriesId}. 사용 가능: ${config.series.map((item) => item.id).join(", ")}`,
  );
  process.exit(1);
}

const state = await loadVideoState();
if (state.videos[videoId]) {
  console.log(
    JSON.stringify({ videoId, status: state.videos[videoId].status, added: false }),
  );
  process.exit(0);
}

const now = new Date().toISOString();
state.videos[videoId] = createEntry(
  {
    id: videoId,
    url: watchUrl(videoId),
    title: option("--title"),
    publishedAt: option("--published-at") ?? now,
  },
  { series, matchedBy: "manual" },
  { origin: "manual", now },
);
await saveVideoState(state);

console.log(
  JSON.stringify({
    videoId,
    series: series.label,
    added: true,
    readyAfterDays: series.processAfterDays ?? config.processAfterDays ?? 2,
  }),
);
