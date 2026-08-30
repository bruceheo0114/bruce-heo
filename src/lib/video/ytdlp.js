import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { VideoSourceError, watchUrl } from "./youtube.js";

const run = promisify(execFile);

const MAX_BUFFER = 32 * 1024 * 1024;

export async function hasBinary(command) {
  try {
    await run(command, ["--version"], { maxBuffer: MAX_BUFFER });
    return true;
  } catch {
    return false;
  }
}

async function ytDlp(args, options = {}) {
  try {
    return await run("yt-dlp", args, { maxBuffer: MAX_BUFFER, ...options });
  } catch (error) {
    const detail = String(error.stderr ?? error.message).slice(0, 800);
    throw new VideoSourceError(`yt-dlp 실행이 실패했습니다: ${detail}`);
  }
}

async function withTempDir(handler) {
  const directory = await mkdtemp(path.join(tmpdir(), "video-agent-"));
  try {
    return await handler(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function fetchMetadata(videoId) {
  const { stdout } = await ytDlp([
    "--dump-single-json",
    "--skip-download",
    "--no-warnings",
    watchUrl(videoId),
  ]);
  const info = JSON.parse(stdout);
  return {
    videoId: info.id ?? videoId,
    title: info.title ?? null,
    channel: info.uploader ?? info.channel ?? null,
    durationSeconds: Number.isFinite(info.duration) ? info.duration : null,
    isLive: Boolean(info.is_live),
    description: info.description ?? null,
  };
}

/**
 * 사람 자막을 먼저, 없으면 자동 자막을 json3로 받는다.
 * 반환값은 파일 내용과 실제로 받은 언어·종류다.
 */
export async function fetchSubtitles(videoId, language) {
  return withTempDir(async (directory) => {
    const attempts = [
      { flag: "--write-subs", generated: false },
      { flag: "--write-auto-subs", generated: true },
    ];
    for (const attempt of attempts) {
      await ytDlp([
        attempt.flag,
        "--sub-langs",
        `${language}.*,${language},en.*,en`,
        "--sub-format",
        "json3/vtt",
        "--skip-download",
        "--no-warnings",
        "-o",
        path.join(directory, "%(id)s.%(ext)s"),
        watchUrl(videoId),
      ]);
      const files = (await readdir(directory)).filter((name) =>
        /\.(json3|vtt|srt)$/.test(name),
      );
      if (!files.length) continue;
      const file = files.find((name) => name.endsWith(".json3")) ?? files[0];
      return {
        format: path.extname(file).slice(1),
        languageCode: file.split(".").at(-2) ?? language,
        generated: attempt.generated,
        content: await readFile(path.join(directory, file), "utf8"),
      };
    }
    return null;
  });
}

/** 오디오만 m4a로 내려받아 경로를 handler에 넘긴다. */
export async function withAudio(videoId, handler) {
  return withTempDir(async (directory) => {
    await ytDlp([
      "-f",
      "bestaudio[ext=m4a]/bestaudio",
      "--extract-audio",
      "--audio-format",
      "m4a",
      "--audio-quality",
      "5",
      "--no-warnings",
      "-o",
      path.join(directory, "%(id)s.%(ext)s"),
      watchUrl(videoId),
    ]);
    const files = await readdir(directory);
    const file = files.find((name) => name.endsWith(".m4a")) ?? files[0];
    if (!file) throw new VideoSourceError("오디오 파일을 만들지 못했습니다.");
    return handler(path.join(directory, file));
  });
}

/** 25MB 업로드 한도를 넘는 오디오를 ffmpeg으로 등분한다. */
export async function splitAudio(filePath, segmentSeconds) {
  const directory = path.dirname(filePath);
  const target = path.join(directory, "part-%03d.m4a");
  try {
    await run(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        filePath,
        "-map",
        "0:a",
        "-f",
        "segment",
        "-segment_time",
        String(segmentSeconds),
        "-reset_timestamps",
        "1",
        "-c",
        "copy",
        target,
      ],
      { maxBuffer: MAX_BUFFER },
    );
  } catch (error) {
    throw new VideoSourceError(
      `긴 오디오를 나누려면 ffmpeg이 필요합니다: ${String(error.stderr ?? error.message).slice(0, 400)}`,
    );
  }
  const parts = (await readdir(directory))
    .filter((name) => /^part-\d+\.m4a$/.test(name))
    .sort();
  return parts.map((name, index) => ({
    path: path.join(directory, name),
    offsetSeconds: index * segmentSeconds,
  }));
}
