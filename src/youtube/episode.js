import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../lib/files.js";
import { STATUS, youtubePaths } from "./config.js";

export function episodeCode(number) {
  return `EP${String(number).padStart(3, "0")}`;
}

export function episodeFolderName(number, articleId) {
  return `${episodeCode(number)}_brunch-${articleId}`;
}

export async function listEpisodes(paths = youtubePaths()) {
  let entries = [];
  try {
    entries = await readdir(paths.episodes, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const episodes = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^EP\d{3,}_/.test(entry.name)) continue;
    const dir = path.join(paths.episodes, entry.name);
    const status = await readJson(path.join(dir, "status.json"), null);
    if (status) episodes.push({ dir, name: entry.name, status });
  }
  return episodes.sort((a, b) => a.name.localeCompare(b.name));
}

// "EP001", "1", "EP001_brunch-222" 모두 같은 Episode를 가리킨다.
export async function findEpisode(reference, paths = youtubePaths()) {
  const value = String(reference ?? "").trim();
  const number = value.match(/^(?:EP)?(\d+)$/i)?.[1];
  const code = number ? episodeCode(Number(number)) : null;
  const episodes = await listEpisodes(paths);
  const found = episodes.find(
    (episode) =>
      episode.name === value ||
      episode.status.episode === code ||
      episode.status.episode === value.toUpperCase(),
  );
  if (!found) throw new Error(`Episode를 찾지 못했습니다: ${reference}`);
  return found;
}

export function pushHistory(status, now, next, note) {
  status.history = [
    ...(status.history ?? []),
    { at: now.toISOString(), from: status.status, to: next, note },
  ];
  status.status = next;
  status.updated_at = now.toISOString();
}

export async function saveStatus(episode) {
  await writeJson(path.join(episode.dir, "status.json"), episode.status);
}

/** 이미 Episode가 있는 글이면 아무것도 만들지 않는다. */
export async function createEpisode(indexEntry, now, paths = youtubePaths()) {
  const episodes = await listEpisodes(paths);
  const existing = episodes.find((episode) => episode.status.article?.id === indexEntry.id);
  if (existing) return { episode: existing, created: false };

  const number =
    episodes.reduce(
      (max, episode) => Math.max(max, Number(episode.status.episode?.slice(2)) || 0),
      0,
    ) + 1;
  const name = episodeFolderName(number, indexEntry.id);
  const dir = path.join(paths.episodes, name);
  await mkdir(dir, { recursive: true });

  const status = {
    episode: episodeCode(number),
    folder: name,
    article: {
      id: indexEntry.id,
      url: indexEntry.url,
      title: indexEntry.title,
      published_at: indexEntry.publishedAt,
      source_file: path.posix.join("source", "brunch", indexEntry.file),
      body_hash: indexEntry.bodyHash,
    },
    status: STATUS.PACKAGE_PENDING,
    higgsfield_generation: false,
    recommendation: null,
    video_potential: null,
    approved_scenes: [],
    generated: {},
    plan: null,
    update: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    history: [{ at: now.toISOString(), from: null, to: STATUS.PACKAGE_PENDING, note: "새 브런치 글" }],
  };
  const episode = { dir, name, status };
  await saveStatus(episode);
  return { episode, created: true };
}

/** 원문이 바뀌면 제작물은 그대로 두고 상태만 UPDATE_AVAILABLE로 바꾼다. */
export async function markUpdateAvailable(indexEntry, now, paths = youtubePaths()) {
  const episodes = await listEpisodes(paths);
  const episode = episodes.find((item) => item.status.article?.id === indexEntry.id);
  if (!episode) return null;
  const { status } = episode;
  if (status.article.body_hash === indexEntry.bodyHash) return null;

  // 아직 패키지를 만들기 전이면 덮어쓸 제작물이 없으니 원문 해시만 갱신한다.
  if (status.status === STATUS.PACKAGE_PENDING) {
    status.article.body_hash = indexEntry.bodyHash;
    status.article.title = indexEntry.title;
    status.updated_at = now.toISOString();
    await saveStatus(episode);
    return null;
  }
  if (status.status !== STATUS.UPDATE_AVAILABLE) {
    status.update = {
      detected_at: now.toISOString(),
      status_before_update: status.status,
      higgsfield_generation_before_update: status.higgsfield_generation,
      latest_body_hash: indexEntry.bodyHash,
      latest_title: indexEntry.title,
    };
    // 원문이 바뀐 상태에서 생성 비용이 나가지 않도록 승인을 잠시 멈춘다.
    status.higgsfield_generation = false;
    pushHistory(status, now, STATUS.UPDATE_AVAILABLE, "브런치 원문 수정 감지");
  } else {
    status.update.latest_body_hash = indexEntry.bodyHash;
    status.update.latest_title = indexEntry.title;
    status.updated_at = now.toISOString();
  }
  await saveStatus(episode);
  return episode;
}

/**
 * UPDATE_AVAILABLE 해제.
 * keep: 수정된 원문을 확인했지만 기존 제작물을 유지하고 이전 상태로 돌아간다.
 * regenerate: 기존 제작물을 versions/에 보관하고 패키지를 다시 만들도록 PACKAGE_PENDING으로 돌린다.
 */
export async function resolveUpdate(episode, mode, now) {
  const { status } = episode;
  if (status.status !== STATUS.UPDATE_AVAILABLE) {
    throw new Error(`${status.episode}는 UPDATE_AVAILABLE 상태가 아닙니다 (${status.status}).`);
  }
  const update = status.update;
  status.article.body_hash = update.latest_body_hash;
  status.article.title = update.latest_title;

  if (mode === "keep") {
    status.higgsfield_generation = update.higgsfield_generation_before_update;
    pushHistory(status, now, update.status_before_update, "원문 수정 확인, 기존 제작물 유지");
  } else if (mode === "regenerate") {
    const archived = await archivePackage(episode, now);
    status.higgsfield_generation = false;
    status.approved_scenes = [];
    status.recommendation = null;
    status.video_potential = null;
    status.plan = null;
    pushHistory(status, now, STATUS.PACKAGE_PENDING, `원문 수정 반영 예정, 기존 제작물은 ${archived}에 보관`);
  } else {
    throw new Error(`알 수 없는 처리 방식입니다: ${mode} (keep 또는 regenerate)`);
  }
  status.update = null;
  await saveStatus(episode);
}

async function archivePackage(episode, now) {
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15);
  const target = path.join(episode.dir, "versions", stamp);
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(episode.dir, { withFileTypes: true })) {
    if (entry.isFile() && /^\d\d_.*\.md$/.test(entry.name)) {
      await rename(path.join(episode.dir, entry.name), path.join(target, entry.name));
    }
  }
  return path.posix.join("versions", stamp);
}

export async function readEpisodeFile(episode, name) {
  try {
    return await readFile(path.join(episode.dir, name), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
