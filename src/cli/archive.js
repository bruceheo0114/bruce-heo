// 브런치 글 원문 백업: bruceheo.com/writing/
//   node src/cli/archive.js                 목록을 받아 아직 없는 글·최근 글을 백업하고 페이지를 다시 만든다 (Actions 용)
//   node src/cli/archive.js --render        저장된 data/archive/*.json 으로 페이지만 다시 만든다
//   node src/cli/archive.js --refresh 108   지정한 글을 다시 받아 덮어쓴다
//   node src/cli/archive.js --import 108 path/to/108.html   저장해 둔 브런치 HTML 로 백업한다 (브런치 접속이 막힌 환경용)
import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { CONFIG, PATHS } from "../config.js";
import { canonicalUrl, fetchText } from "../lib/brunch.js";
import { parseArchiveArticle, renderArchiveIndex, renderArticlePage, sortArticles } from "../lib/archive.js";
import { readJson, writeFileAtomic, writeJson } from "../lib/files.js";

const RECENT_REFETCH_DAYS = 7;
const LIST_URL = `https://api.brunch.co.kr/v1/article/@${CONFIG.profileId}?listSize=20&status=home`;
const CACHE_INDEX = "insight-reels/brunch_cache/index.json";

const dataPath = (id) => path.join(PATHS.archiveData, `${id}.json`);

async function fetchPublishedList() {
  try {
    const items = [];
    let url = LIST_URL;
    while (url) {
      const { data } = JSON.parse(await fetchText(url));
      for (const article of data.list) items.push({ id: String(article.no), publishedAt: new Date(article.publishTime).toISOString() });
      url = data.moreList ? data.nextUrl : null;
    }
    return items;
  } catch (error) {
    console.warn(`브런치 목록 API 실패, 캐시 목록을 씁니다: ${error.message}`);
    const cached = await readJson(CACHE_INDEX, []);
    return cached.map((item) => ({ id: String(item.no), publishedAt: new Date(`${item.date}T00:00:00+09:00`).toISOString() }));
  }
}

async function loadArchived() {
  const files = await readdir(PATHS.archiveData).catch(() => []);
  return Promise.all(files.filter((file) => file.endsWith(".json")).map((file) => readJson(path.join(PATHS.archiveData, file))));
}

async function backup(id, html) {
  const article = parseArchiveArticle(html ?? (await fetchText(canonicalUrl(id))), id);
  await writeJson(dataPath(id), article);
  console.log(`백업 ${id} · ${article.title} (블록 ${article.blocks.length})`);
}

async function render() {
  const articles = sortArticles((await loadArchived()).filter((article) => Number(article.id) >= CONFIG.archiveFromId));
  const keep = new Set(articles.map((article) => article.id));
  for (const entry of await readdir(PATHS.archivePages, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory() && /^\d+$/.test(entry.name) && !keep.has(entry.name)) {
      await rm(path.join(PATHS.archivePages, entry.name), { recursive: true });
    }
  }
  for (const [index, article] of articles.entries()) {
    const page = renderArticlePage(article, { newer: articles[index - 1] ?? null, older: articles[index + 1] ?? null });
    await writeFileAtomic(path.join(PATHS.archivePages, article.id, "index.html"), page);
  }
  await writeFileAtomic(path.join(PATHS.archivePages, "index.html"), renderArchiveIndex(articles));
  console.log(`페이지 ${articles.length}편 생성: ${PATHS.archivePages}/`);
}

async function sync() {
  const published = (await fetchPublishedList()).filter((item) => Number(item.id) >= CONFIG.archiveFromId);
  const archived = new Set((await loadArchived()).map((article) => article.id));
  const recentSince = Date.now() - RECENT_REFETCH_DAYS * 24 * 60 * 60 * 1000;
  const targets = published.filter((item) => !archived.has(item.id) || new Date(item.publishedAt).valueOf() >= recentSince);
  console.log(`공개 글 ${published.length}편 중 백업 대상 ${targets.length}편`);
  const failures = [];
  for (const item of targets) {
    try {
      await backup(item.id);
    } catch (error) {
      failures.push(item.id);
      console.error(`백업 실패 ${item.id}: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500)); // 브런치에 부담 주지 않게
  }
  await render();
  if (failures.length) {
    console.error(`백업하지 못한 글: ${failures.join(", ")}`);
    process.exitCode = 1;
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "--render") {
  await render();
} else if (command === "--refresh") {
  for (const id of args) await backup(id);
  await render();
} else if (command === "--import") {
  const [id, file] = args;
  await backup(id, await readFile(file, "utf8"));
  await render();
} else {
  await sync();
}
