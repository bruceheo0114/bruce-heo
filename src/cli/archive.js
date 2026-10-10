// 브런치 글 원문 백업: bruceheo.com/writing/
//   node src/cli/archive.js                 목록을 받아 아직 없는 글·최근 글을 백업하고 페이지를 다시 만든다 (Actions 용)
//   node src/cli/archive.js --render        저장된 data/archive/*.json 으로 페이지만 다시 만든다
//   node src/cli/archive.js --refresh 108   지정한 글을 다시 받아 덮어쓴다
//   node src/cli/archive.js --images        백업한 글의 이미지 중 아직 저장소에 없는 것만 내려받는다
//   node src/cli/archive.js --import 108 path/to/108.html   저장해 둔 브런치 HTML 로 백업한다 (브런치 접속이 막힌 환경용)
import { access, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CONFIG, PATHS } from "../config.js";
import { canonicalUrl, fetchText } from "../lib/brunch.js";
import { imageSlots, localImageName, parseArchiveArticle, renderArchiveIndex, renderArticlePage, renderSitemap, sortArticles } from "../lib/archive.js";
import { mapLimit, readJson, writeFileAtomic, writeJson } from "../lib/files.js";
import { linkArchivedPosts } from "../lib/homepage.js";

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

const exists = (file) => access(file).then(() => true, () => false);

// 본문 폭(720px)의 레티나 화면에 충분한 크기와 화질로 줄여 저장소 용량을 최소화한다.
const IMAGE_MAX_WIDTH = 1080;
const IMAGE_QUALITY = 70;

function compressImage(bytes) {
  return sharp(bytes, { animated: true })
    .rotate()
    .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: IMAGE_QUALITY, effort: 6 })
    .toBuffer();
}

async function downloadImage(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": CONFIG.fetchHeaders["user-agent"], accept: "image/*" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      if (!/^image\//.test(response.headers.get("content-type") ?? "")) throw new Error(`이미지가 아님 (${response.headers.get("content-type")})`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new Error("빈 파일");
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

// 브런치에서 이미지가 사라져도 남도록 writing/{id}/images/ 에 WebP 로 저장하고 JSON 에 local 경로를 적는다.
// 예전에 원본 형식(jpg·png)으로 받아 둔 파일이 있으면 다시 받지 않고 그 파일을 변환한 뒤 지운다.
async function saveImages(articles) {
  let saved = 0;
  const failures = [];
  for (const article of articles) {
    let changed = false;
    const conversions = new Map(); // 같은 이미지가 한 글에 두 번 나와도 한 번만 만든다
    const oldFiles = new Set();
    await mapLimit(imageSlots(article), 4, async (slot) => {
      const local = `images/${localImageName(slot.url)}`;
      const file = path.join(PATHS.archivePages, article.id, local);
      if (slot.get() === local && (await exists(file))) return;
      const oldFile = slot.get() && slot.get() !== local ? path.join(PATHS.archivePages, article.id, slot.get()) : null;
      try {
        if (!conversions.has(file)) {
          conversions.set(file, (async () => {
            if (await exists(file)) return;
            const source = oldFile && (await exists(oldFile)) ? await readFile(oldFile) : await downloadImage(slot.url);
            await writeFileAtomic(file, await compressImage(source), null);
            saved += 1;
          })());
        }
        await conversions.get(file);
        if (oldFile) oldFiles.add(oldFile);
        slot.set(local);
        changed = true;
      } catch (error) {
        failures.push(`${article.id}: ${slot.url} (${error.message})`);
      }
    });
    if (changed) await writeJson(dataPath(article.id), article);
    for (const oldFile of oldFiles) await rm(oldFile, { force: true });
  }
  console.log(`이미지 ${saved}장 새로 저장`);
  // 브런치에서 지운 이미지는 매일 실패하므로 경고만 남기고 브런치 주소를 그대로 쓴다.
  for (const failure of failures) console.warn(`::warning::이미지 저장 실패 ${failure}`);
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
  await writeFileAtomic("sitemap.xml", renderSitemap(articles));
  // 홈페이지(한·영) Writing 목록의 글 링크를 브런치 대신 이 사이트의 백업 페이지로 연결한다.
  for (const homepage of [PATHS.homepage, "en/index.html"]) {
    const html = await readFile(homepage, "utf8");
    const linked = linkArchivedPosts(html, keep);
    if (linked !== html) await writeFileAtomic(homepage, linked);
  }
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
  await saveImages(await loadArchived());
  await render();
  if (failures.length) {
    console.error(`백업하지 못한 글: ${failures.join(", ")}`);
    process.exitCode = 1;
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "--render") {
  await render();
} else if (command === "--images") {
  await saveImages(await loadArchived());
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
