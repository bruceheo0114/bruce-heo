import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../lib/files.js";
import { loadState, saveState } from "../lib/state.js";

// 병합된 브런치 카드뉴스를 @bruce.insight 인스타그램 게시 대기열(insight-reels/posts/<날짜>.json)에 넣는다.
// 월~목은 인사이트 릴스·카드뉴스 자리라서 금·토·일 07:00(KST)에 하루 한 편씩 배정한다.
// 실제 게시는 insight-reels-publish 워크플로(Publish clock 이 매일 07:00 에 시작)가 한다.
const POSTS_DIR = "insight-reels/posts";
const WEEKDAYS = new Set([5, 6, 0]); // 금·토·일
const SITE = "https://bruceheo.com";
const RAW = "https://raw.githubusercontent.com/bruceheo0114/bruce-heo/main";

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function kstDate(date) {
  return new Date(date.valueOf() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function nextFreeDate(from, taken) {
  const day = new Date(`${kstDate(from)}T00:00:00Z`);
  for (let i = 1; i <= 400; i += 1) {
    day.setUTCDate(day.getUTCDate() + 1);
    const date = day.toISOString().slice(0, 10);
    if (!WEEKDAYS.has(day.getUTCDay()) || taken.has(date)) continue;
    if (await exists(path.join(POSTS_DIR, `${date}.json`))) continue;
    return date;
  }
  throw new Error("인스타그램 게시 날짜를 찾지 못했습니다.");
}

const now = new Date(process.env.AUTOMATION_NOW ?? Date.now());
const state = await loadState();
const ready = Object.values(state.articles)
  .filter(
    (article) =>
      article.package.status === "generated" &&
      article.instagram.status === "manual_source_ready",
  )
  .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));

const taken = new Set();
const scheduled = [];
for (const article of ready) {
  const manifest = await readJson(article.package.manifestPath);
  const dir = path.dirname(article.package.manifestPath);
  const caption = (await readFile(path.join(dir, "instagram-caption.txt"), "utf8")).trim();
  const files = manifest.cards.map((card) => card.file);
  for (const file of files) {
    if (!(await exists(path.join(dir, file)))) throw new Error(`${dir}/${file} 카드가 없습니다.`);
  }
  const date = await nextFreeDate(now, taken);
  taken.add(date);
  await writeJson(path.join(POSTS_DIR, `${date}.json`), {
    date,
    type: "carousel",
    source: "brunch-card-news",
    brunch_no: Number(article.id),
    title: manifest.article.title,
    brunch_url: article.canonicalUrl,
    status: "scheduled",
    caption,
    images: files.map((file) => `${SITE}/${dir}/${file}`),
    images_backup: files.map((file) => `${RAW}/${dir}/${file}`),
  });
  article.instagram = { ...article.instagram, status: "scheduled", scheduledDate: date };
  scheduled.push({ id: article.id, date });
}

if (scheduled.length) await saveState(state);
console.log(JSON.stringify({ instagramScheduled: scheduled }));
