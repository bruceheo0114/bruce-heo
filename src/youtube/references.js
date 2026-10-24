// 실제 자료(공식 홈페이지·기사 화면, 공식 이미지, 브런치 원문 이미지)를 받아 온다.
// 클라우드 세션은 외부 사이트 접속이 막혀 있어 GitHub Actions(youtube-references.yml)에서 실행한다.
// 입력: episodes/<EP>/references.json  출력: assets/references/<EP>/*.jpg + credits.json
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { readJson, writeJson } from "../lib/files.js";

const run = promisify(execFile);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const MIN_WIDTH = 600;

// exclude(화면에서 뺄 그림)만 바뀐 경우에는 다시 받지 않는다.
export function referencesHash(text) {
  const { exclude, _note, scene_images, thumbnail, ...rest } = JSON.parse(text); // 배치·썸네일만 바꾼 경우는 다시 받지 않는다
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex").slice(0, 16);
}

export function validateReferences(data) {
  const errors = [];
  if (!data || !Array.isArray(data.items)) return ["references.json: items 배열이 없습니다."];
  const ids = new Set();
  for (const item of data.items) {
    const label = `references.json ${item.id ?? "(id 없음)"}`;
    if (!item.id || !/^[A-Za-z0-9_-]+$/.test(item.id)) errors.push(`${label}: id는 영문·숫자로 (예: A001).`);
    if (ids.has(item.id)) errors.push(`${label}: id 중복`);
    ids.add(item.id);
    if (!["page", "article", "image", "video", "stock"].includes(item.kind)) errors.push(`${label}: kind는 page / article / image / video / stock`);
    if (item.kind === "stock") {
      // 무료 자료 영상(Pexels) 검색어. 출처는 받을 때 'Pexels · 촬영자'로 자동으로 적는다.
      if (!String(item.query ?? "").trim()) errors.push(`${label}: stock은 query(영어 검색어)가 필요합니다.`);
    } else {
      if (!/^https?:\/\//.test(item.url ?? "")) errors.push(`${label}: url이 없습니다.`);
      if (!item.source) errors.push(`${label}: source(출처 표기)가 없습니다.`);
    }
    if (!Array.isArray(item.scenes)) errors.push(`${label}: scenes 배열이 필요합니다 (없으면 []).`);
  }
  return errors;
}

// 영상 클립(Higgsfield 결과, 자료 영상, 공식 페이지 영상)을 1920x1080 무음 H.264로 맞춘다.
// 저장소에 커밋되므로 앞 8초만 남긴다(한 컷은 3~7초).
const MAX_CLIP_SECONDS = 8;
async function normalizeVideo(input, output) {
  await run("ffmpeg", ["-v", "error", "-y", "-i", input, "-t", String(MAX_CLIP_SECONDS), "-an", "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", output]);
  return Number(stdout) > 0.5;
}

// 받은 그림을 가로 최대 1920 JPEG로 맞춘다. 너무 작은 아이콘·로고 조각은 버린다.
async function normalizeImage(input, output) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", input]);
  const [width, height] = stdout.trim().split(",").map(Number);
  if (!(width >= MIN_WIDTH) || !(height >= 300)) return null;
  await run("ffmpeg", ["-v", "error", "-y", "-i", input, "-frames:v", "1", "-vf", "scale='min(1920,iw)':-2", "-q:v", "3", output]);
  return { width: Math.min(1920, width), height: Math.round((Math.min(1920, width) / width) * height) };
}

async function download(context, url, file, { timeout = 30000 } = {}) {
  const response = await context.request.get(url, { headers: { "user-agent": UA }, timeout });
  if (!response.ok()) throw new Error(`${response.status()} ${url}`);
  await writeFile(file, await response.body());
}

// 같은 그림이 여러 페이지·og:image로 겹쳐도 한 번만 받는다
const seenImages = new Set();
const seenStock = new Set();

/**
 * Pexels 검색 결과에서 쓸 영상 파일 하나를 고른다. 5초 이상 가로 영상, 화질은 1920(없으면 1280 이상) mp4.
 * pick: 같은 검색어의 몇 번째 후보를 쓸지(0부터). 마음에 들지 않으면 pick을 올려 다시 받는다.
 */
export function pickStockFile(videos, { pick = 0, seen = new Set() } = {}) {
  const candidates = [];
  for (const video of videos ?? []) {
    if (seen.has(video.id) || !(video.duration >= 5) || !(video.width > video.height)) continue;
    const files = (video.video_files ?? [])
      .filter((file) => file.file_type === "video/mp4" && file.width >= 1280 && file.width <= 2560 && file.link)
      .sort((a, b) => Math.abs(a.width - 1920) - Math.abs(b.width - 1920));
    if (files.length) candidates.push({ video, file: files[0] });
  }
  return candidates[pick] ?? null;
}

async function fetchStock(context, item, dir) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("PEXELS_API_KEY가 없습니다 (저장소 Secrets에 넣는다)");
  const query = new URLSearchParams({ query: item.query, orientation: "landscape", size: "medium", per_page: "15" });
  const response = await context.request.get(`https://api.pexels.com/videos/search?${query}`, { headers: { authorization: key }, timeout: 30000 });
  if (!response.ok()) throw new Error(`Pexels ${response.status()}`);
  const chosen = pickStockFile((await response.json()).videos, { pick: item.pick ?? 0, seen: seenStock });
  if (!chosen) throw new Error(`'${item.query}' 검색 결과에 쓸 만한 영상이 없습니다`);
  seenStock.add(chosen.video.id);
  const raw = path.join(dir, `.raw-${item.id}`);
  try {
    await download(context, chosen.file.link, raw, { timeout: 120000 });
    if (!(await normalizeVideo(raw, path.join(dir, `${item.id}.mp4`)))) throw new Error("영상을 읽을 수 없습니다");
  } finally {
    await rm(raw, { force: true });
  }
  const author = chosen.video.user?.name;
  return { file: `${item.id}.mp4`, id: item.id, scenes: item.scenes, kind: "video", source: item.source ?? (author ? `Pexels · ${author}` : "Pexels"), url: chosen.video.url };
}

// 공식 페이지에 들어 있는 영상(첫 화면 배경 영상, 캠페인 영상 mp4). 유튜브 같은 임베드 플레이어는 받지 않는다.
async function capturePageVideos(context, page, item, dir, credits, maxVideos) {
  if (maxVideos <= 0) return;
  const sources = await page.evaluate(() => [...document.querySelectorAll("video")]
    .map((video) => video.currentSrc || video.src || video.querySelector("source[type='video/mp4'], source")?.src)
    .filter((src) => src && !src.startsWith("blob:"))
    .map((src) => new URL(src, location.href).href));
  let count = 0;
  for (const url of [...new Set(sources)]) {
    if (count >= maxVideos) break;
    const raw = path.join(dir, `.raw-${item.id}-video${count}`);
    const file = `${item.id}-video${count + 1}.mp4`;
    try {
      await download(context, url, raw, { timeout: 120000 });
      if (await normalizeVideo(raw, path.join(dir, file))) {
        credits.push({ file, id: item.id, scenes: item.scenes, kind: "video", source: item.source, url: item.url });
        count += 1;
      }
    } catch {
      // 받지 못한 영상은 건너뛴다
    } finally {
      await rm(raw, { force: true });
    }
  }
}

async function capturePage(context, item, dir, credits, maxImages) {
  const page = await context.newPage();
  try {
    await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // 쿠키 배너 같은 고정 요소는 화면을 가리니 숨긴다.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("*")) {
        const style = getComputedStyle(el);
        if ((style.position === "fixed" || style.position === "sticky") && el.offsetHeight > 0 && el.offsetHeight < 400) el.style.display = "none";
      }
    });
    const shot = `${item.id}-screen.jpg`;
    await page.screenshot({ path: path.join(dir, shot), type: "jpeg", quality: 85 });
    credits.push({ file: shot, id: item.id, scenes: item.scenes, kind: "screen", source: item.source, url: item.url });

    // 기사, 그리고 "scroll": true 를 붙인 페이지(브랜드 사이트·캠페인 페이지)는 위에서 아래로 훑는 긴 화면도 남긴다.
    if (item.kind === "article" || item.scroll === true) {
      const tall = `${item.id}-scroll.jpg`;
      await page.screenshot({ path: path.join(dir, tall), type: "jpeg", quality: 80, fullPage: true, clip: { x: 0, y: 0, width: 1920, height: 3240 } }).catch(() => {});
      credits.push({ file: tall, id: item.id, scenes: item.scenes, kind: "scroll", source: item.source, url: item.url });
    }

    // 공식 페이지는 영상도 1개 받는다(기사는 광고 영상이 섞여서 받지 않는다). max_videos로 바꾼다.
    await capturePageVideos(context, page, item, dir, credits, item.max_videos ?? (item.kind === "page" ? 1 : 0));

    const images = await page.evaluate(() => {
      const og = document.querySelector('meta[property="og:image"]')?.content;
      const list = [...document.images]
        .filter((img) => img.naturalWidth >= 800 && img.naturalHeight >= 400)
        .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)
        .map((img) => img.currentSrc || img.src);
      return [og, ...list].filter(Boolean).map((url) => new URL(url, location.href).href);
    });
    let count = 0;
    for (const url of [...new Set(images)]) {
      if (count >= maxImages) break;
      if (seenImages.has(url)) continue;
      seenImages.add(url);
      const raw = path.join(dir, `.raw-${item.id}-${count}`);
      const file = `${item.id}-img${count + 1}.jpg`;
      try {
        await download(context, url, raw);
        if (await normalizeImage(raw, path.join(dir, file))) {
          credits.push({ file, id: item.id, scenes: item.scenes, kind: "image", source: item.source, url: item.url });
          count += 1;
        }
      } catch {
        // 받지 못한 그림은 건너뛴다
      } finally {
        await rm(raw, { force: true });
      }
    }
  } finally {
    await page.close();
  }
}

export async function fetchReferences(episode, root, { log = () => {} } = {}) {
  const refFile = path.join(episode.dir, "references.json");
  const text = await readFile(refFile, "utf8");
  const data = JSON.parse(text);
  const errors = validateReferences(data);
  if (errors.length) throw new Error(errors.join("\n"));

  const dir = path.join(root, "assets", "references", episode.status.episode);
  await mkdir(dir, { recursive: true });
  const credits = [];
  const failures = [];
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: "ko-KR", userAgent: UA });
  try {
    for (const item of data.items) {
      try {
        if (item.kind === "image") {
          const raw = path.join(dir, `.raw-${item.id}`);
          await download(context, item.url, raw);
          const ok = await normalizeImage(raw, path.join(dir, `${item.id}.jpg`));
          await rm(raw, { force: true });
          if (!ok) throw new Error("그림이 너무 작습니다");
          credits.push({ file: `${item.id}.jpg`, id: item.id, scenes: item.scenes, kind: item.ai ? "ai" : "image", source: item.source, url: item.page ?? item.url });
        } else if (item.kind === "stock") {
          credits.push(await fetchStock(context, item, dir));
        } else if (item.kind === "video") {
          const raw = path.join(dir, `.raw-${item.id}`);
          await download(context, item.url, raw);
          const ok = await normalizeVideo(raw, path.join(dir, `${item.id}.mp4`));
          await rm(raw, { force: true });
          if (!ok) throw new Error("영상이 너무 짧거나 읽을 수 없습니다");
          credits.push({ file: `${item.id}.mp4`, id: item.id, scenes: item.scenes, kind: "video", source: item.source, url: item.page ?? item.url });
        } else {
          await capturePage(context, item, dir, credits, item.max_images ?? 3);
        }
        log(`✓ ${item.id} ${item.url ?? item.query}`);
      } catch (error) {
        failures.push({ id: item.id, url: item.url ?? item.query, error: String(error.message).slice(0, 200) });
        log(`✗ ${item.id} ${error.message}`);
      }
    }

    // 브런치 원문에 들어 있는 이미지
    if (data.brunch !== false && episode.status.article?.url) {
      try {
        const { fetchArticle } = await import("../lib/brunch.js");
        const article = await fetchArticle(episode.status.article.id);
        let index = 0;
        for (const url of article.images.slice(0, 12)) {
          const raw = path.join(dir, `.raw-brunch-${index}`);
          const file = `brunch-${String(index + 1).padStart(2, "0")}.jpg`;
          try {
            await download(context, url, raw);
            if (await normalizeImage(raw, path.join(dir, file))) {
              credits.push({ file, id: "brunch", scenes: [], kind: "image", source: "브런치 @heoboram 원문", url: episode.status.article.url });
              index += 1;
            }
          } catch {
            // 건너뜀
          } finally {
            await rm(raw, { force: true });
          }
        }
        log(`✓ 브런치 이미지 ${index}장`);
      } catch (error) {
        failures.push({ id: "brunch", url: episode.status.article.url, error: String(error.message).slice(0, 200) });
      }
    }
  } finally {
    await browser.close();
  }

  await writeJson(path.join(dir, "credits.json"), {
    references_hash: referencesHash(text),
    fetched_at: new Date().toISOString(),
    items: credits,
    failures,
  });
  return { credits, failures };
}

export async function referencesPending(episode, root) {
  let text;
  try {
    text = await readFile(path.join(episode.dir, "references.json"), "utf8");
  } catch {
    return false;
  }
  const credits = await readJson(path.join(root, "assets", "references", episode.status.episode, "credits.json"), null);
  return !credits || credits.references_hash !== referencesHash(text);
}
