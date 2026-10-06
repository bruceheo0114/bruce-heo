import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../lib/files.js";
import { loadState, saveState } from "../lib/state.js";

// 병합된 브런치 카드뉴스를 @bruce.insight 인스타그램 게시 대기열(insight-reels/posts/<날짜>.json)에 넣는다.
// 요일: 월=업계 트렌드 10건, 화·목=브런치 릴스, 수·금=브런치 카드뉴스(여기서 배정).
// 같은 주(월~일)에 같은 브런치 글이 릴스로 잡혀 있으면 그 주는 건너뛴다. 다른 주라면 겹쳐도 된다.
// 실제 게시는 insight-reels-publish 워크플로(Publish clock 이 매일 07:00 에 시작)가 한다.
const POSTS_DIR = "insight-reels/posts";
const WEEKDAYS = new Set([3, 5]); // 수·금
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

function weekOf(date) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

// 주(월요일 날짜) → 그 주에 릴스로 잡힌 브런치 글 번호
async function reelsByWeek() {
  const weeks = new Map();
  for (const name of await readdir(POSTS_DIR)) {
    const match = name.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (!match) continue;
    const post = await readJson(path.join(POSTS_DIR, name));
    if ((post.type ?? "reel") === "carousel" || !post.brunch_no) continue;
    const key = weekOf(match[1]);
    if (!weeks.has(key)) weeks.set(key, new Set());
    weeks.get(key).add(String(post.brunch_no));
  }
  return weeks;
}

async function nextFreeDate(from, taken, articleId, reels) {
  const day = new Date(`${kstDate(from)}T00:00:00Z`);
  for (let i = 1; i <= 400; i += 1) {
    day.setUTCDate(day.getUTCDate() + 1);
    const date = day.toISOString().slice(0, 10);
    if (!WEEKDAYS.has(day.getUTCDay()) || taken.has(date)) continue;
    if (reels.get(weekOf(date))?.has(String(articleId))) continue;
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
const reels = await reelsByWeek();
const scheduled = [];
for (const article of ready) {
  const manifest = await readJson(article.package.manifestPath);
  const dir = path.dirname(article.package.manifestPath);
  const caption = (await readFile(path.join(dir, "instagram-caption.txt"), "utf8")).trim();
  const files = manifest.cards.map((card) => card.file);
  for (const file of files) {
    if (!(await exists(path.join(dir, file)))) throw new Error(`${dir}/${file} 카드가 없습니다.`);
  }
  const date = await nextFreeDate(now, taken, article.id, reels);
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
    preview_url: `${SITE}/${dir}/preview.html`,
    preview_sent: false,
  });
  article.instagram = { ...article.instagram, status: "scheduled", scheduledDate: date };
  scheduled.push({ id: article.id, date });
}

// 카드뉴스 큐(carousel_queue.json)에 있던 글이면 made 로 표시한다.
if (scheduled.length) {
  const queuePath = "insight-reels/carousel_queue.json";
  const queue = await readJson(queuePath);
  for (const { id, date } of scheduled) {
    const item = queue.items.find((entry) => String(entry.no) === id);
    if (item) Object.assign(item, { status: "made", slot: date });
  }
  await writeJson(queuePath, queue);
  await saveState(state);
}
console.log(JSON.stringify({ instagramScheduled: scheduled }));
