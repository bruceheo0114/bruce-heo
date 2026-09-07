import { readJson } from "../files.js";
import { toSeoulDateParts } from "../time.js";

const SERIES_CONFIG_PATH = "data/video-series.json";

export async function loadSeriesConfig(filePath = SERIES_CONFIG_PATH) {
  const config = await readJson(filePath);
  if (!Array.isArray(config?.series) || !config.series.length) {
    throw new Error(`${filePath}에 시리즈가 정의되어 있지 않습니다.`);
  }
  for (const series of config.series) {
    if (!series.id || !series.label) {
      throw new Error(`${filePath}의 시리즈에는 id와 label이 필요합니다.`);
    }
  }
  return config;
}

export function findSeries(config, seriesId) {
  return config.series.find((series) => series.id === seriesId) ?? null;
}

function seoulWeekday(publishedAt) {
  const { year, month, day } = toSeoulDateParts(publishedAt);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * 제목 패턴을 먼저 보고, 어느 시리즈에도 걸리지 않으면 KST 요일로 판단한다.
 * 요일로만 맞은 결과는 matchedBy로 표시해 검수에서 걸러낼 수 있게 한다.
 */
export function classifyVideo(config, video) {
  const title = String(video?.title ?? "");
  for (const series of config.series) {
    const patterns = series.titlePatterns ?? [];
    if (patterns.some((pattern) => new RegExp(pattern, "iu").test(title))) {
      return { series, matchedBy: "title" };
    }
  }

  if (!video?.publishedAt) return null;
  const weekday = seoulWeekday(video.publishedAt);
  const byWeekday = config.series.filter(
    (series) => Number.isInteger(series.weekdayKst) && series.weekdayKst === weekday,
  );
  if (byWeekday.length === 1) {
    return { series: byWeekday[0], matchedBy: "weekday" };
  }
  return null;
}
