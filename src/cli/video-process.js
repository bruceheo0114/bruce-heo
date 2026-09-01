import path from "node:path";
import { CONFIG, PATHS } from "../config.js";
import { readJson, writeFileAtomic, writeJson } from "../lib/files.js";
import {
  buildSummaryMarkdown,
  buildTranscriptMarkdown,
  buildVideoManifest,
} from "../lib/video/render.js";
import { loadSeriesConfig } from "../lib/video/series.js";
import { summarizeTranscript } from "../lib/video/summarizer.js";
import { resolveTranscript } from "../lib/video/transcript.js";
import {
  isExpired,
  loadVideoState,
  saveVideoState,
  selectDueVideos,
} from "../lib/video/video-state.js";
import { publishToNotion } from "../publish/notion.js";

const argv = process.argv.slice(2);

function option(name, fallback = null) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

const skipNotion = argv.includes("--skip-notion");
const limit = Number(option("--limit", "3"));

const config = await loadSeriesConfig(PATHS.videoSeries);
const state = await loadVideoState();
const now = new Date();
const due = selectDueVideos(config, state, now).slice(0, limit);

const processed = [];

async function buildSummary(entry) {
  const outputDir = path.join(PATHS.videoContent, entry.id);
  const transcript = await resolveTranscript(entry.id, {
    language: config.captionLanguage ?? CONFIG.video.captionLanguage,
    captionsOnly: true,
  });

  await writeJson(path.join(outputDir, "transcript.json"), transcript);
  await writeFileAtomic(
    path.join(outputDir, "transcript.md"),
    buildTranscriptMarkdown(transcript),
  );

  const summary = await summarizeTranscript(transcript, { profile: entry.profile });
  const manifest = buildVideoManifest(transcript, summary);
  manifest.series = { id: entry.seriesId, label: entry.seriesLabel };

  await writeJson(path.join(outputDir, "manifest.json"), manifest);
  await writeFileAtomic(
    path.join(outputDir, "summary.md"),
    buildSummaryMarkdown(transcript, summary),
  );

  entry.title ??= transcript.metadata?.title ?? null;
  entry.summaryPath = path.join(outputDir, "summary.md");
  entry.status = "summarized";
  entry.lastError = null;
  return { transcript, summary };
}

/**
 * Notion 업로드만 남은 항목은 이미 만든 파일에서 다시 읽어 올린다.
 * 파일이 사라졌으면 null을 돌려주어 처음부터 다시 만들게 한다.
 */
async function loadExistingSummary(entry) {
  const directory = path.join(PATHS.videoContent, entry.id);
  const manifest = await readJson(path.join(directory, "manifest.json"), null);
  const transcript = await readJson(path.join(directory, "transcript.json"), null);
  if (!manifest?.summary || !transcript) return null;
  return {
    transcript,
    summary: { ...manifest.summary, durationSeconds: manifest.video.durationSeconds },
  };
}

for (const entry of due) {
  entry.attempts += 1;
  entry.lastAttemptAt = now.toISOString();
  try {
    const built =
      (entry.status === "summarized" ? await loadExistingSummary(entry) : null) ??
      (await buildSummary(entry));

    if (skipNotion) {
      processed.push({ id: entry.id, status: entry.status, notion: "skipped" });
      continue;
    }

    const page = await publishToNotion(entry, built.transcript, built.summary);
    entry.notionPageId = page.pageId;
    entry.notionUrl = page.url;
    entry.status = "published";
    entry.lastError = null;
    processed.push({
      id: entry.id,
      title: built.summary.title,
      series: entry.seriesLabel,
      status: "published",
      notionUrl: page.url,
    });
  } catch (error) {
    entry.lastError = String(error.message).slice(0, 500);
    if (entry.status !== "summarized") entry.status = "pending_captions";
    if (isExpired(config, entry, now)) {
      entry.status = "failed";
    }
    processed.push({
      id: entry.id,
      series: entry.seriesLabel,
      status: entry.status,
      attempts: entry.attempts,
      error: entry.lastError,
    });
  }
}

await saveVideoState(state);

const failed = processed.filter((item) => item.status === "failed");
console.log(JSON.stringify({ due: due.length, processed }, null, 2));
if (failed.length) process.exit(1);
