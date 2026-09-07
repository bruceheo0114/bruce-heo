import path from "node:path";
import { CONFIG, PATHS } from "../config.js";
import { writeFileAtomic, writeJson } from "../lib/files.js";
import {
  buildSummaryMarkdown,
  buildTranscriptMarkdown,
  buildVideoManifest,
} from "../lib/video/render.js";
import { resolveTranscript } from "../lib/video/transcript.js";
import { summarizeTranscript } from "../lib/video/summarizer.js";
import { parseVideoId } from "../lib/video/youtube.js";

const argv = process.argv.slice(2);

function option(name, fallback = null) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

function flag(name) {
  return argv.includes(name);
}

const VALUED_OPTIONS = ["--lang", "--out", "--chunk-characters"];

/** 옵션이 소비한 값은 건너뛰고 남은 첫 인자를 영상 주소로 본다. */
function positional() {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (VALUED_OPTIONS.includes(value)) {
      index += 1;
      continue;
    }
    if (!value.startsWith("--")) return value;
  }
  return null;
}

const target = positional();
const videoId = parseVideoId(target);
if (!videoId) {
  console.error(
    "사용법: npm run video:summarize -- <YouTube URL 또는 영상 ID> [--lang ko] [--out content/video] [--captions-only] [--transcript-only]",
  );
  process.exit(1);
}

const language = option("--lang", CONFIG.video.captionLanguage);
const outputRoot = option("--out", PATHS.videoContent);
const chunkCharacters = Number(option("--chunk-characters", CONFIG.video.chunkCharacters));

const transcript = await resolveTranscript(videoId, {
  language,
  captionsOnly: flag("--captions-only"),
});

const outputDir = path.join(outputRoot, videoId);
await writeJson(path.join(outputDir, "transcript.json"), transcript);
await writeFileAtomic(
  path.join(outputDir, "transcript.md"),
  buildTranscriptMarkdown(transcript),
);

if (flag("--transcript-only")) {
  console.log(
    JSON.stringify({
      videoId,
      source: transcript.source,
      segments: transcript.segments.length,
      outputDir,
    }),
  );
  process.exit(0);
}

const summary = await summarizeTranscript(transcript, { chunkCharacters });
const manifest = buildVideoManifest(transcript, summary);
await writeJson(path.join(outputDir, "manifest.json"), manifest);
await writeFileAtomic(
  path.join(outputDir, "summary.md"),
  buildSummaryMarkdown(transcript, summary),
);

console.log(
  JSON.stringify({
    videoId,
    title: summary.title,
    source: transcript.source,
    segments: transcript.segments.length,
    chunks: summary.chunkCount,
    outputDir,
  }),
);
