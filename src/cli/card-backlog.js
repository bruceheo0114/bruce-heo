import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { PATHS } from "../config.js";
import { fetchArticle } from "../lib/brunch.js";
import { sourceForWriter, sourcePath } from "../lib/content-generator.js";
import { readJson, writeJson } from "../lib/files.js";
import { channelState, loadState, saveState } from "../lib/state.js";

// 릴스처럼 카드뉴스도 아직 계정에서 다루지 않은 브런치 글을 차례로 만든다.
// 새 글 원고가 밀려 있지 않고, 수·금에 예약된 브런치 카드뉴스가 MAX_AHEAD 편 미만일 때만
// insight-reels/carousel_queue.json 의 todo 를 위에서부터 하나 꺼내 원문(source.json)을 준비한다.
// 이 글은 카드뉴스만 만든다(cardOnly — 뉴스레터·리멤버 원고와 메일 없음).
const QUEUE = "insight-reels/carousel_queue.json";
const POSTS_DIR = "insight-reels/posts";
const MAX_AHEAD = 4;

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

const state = await loadState();
const pending = [];
for (const article of Object.values(state.articles)) {
  if (article.package.status !== "awaiting_review") continue;
  if (!(await exists(article.package.manifestPath))) pending.push(article.id);
}
if (pending.length) {
  console.log(JSON.stringify({ backlog: null, reason: "writer-busy", pending }));
  process.exit(0);
}

let ahead = 0;
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
for (const name of await readdir(POSTS_DIR)) {
  const match = name.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
  if (!match || match[1] < today) continue;
  const post = await readJson(path.join(POSTS_DIR, name));
  if (post.source === "brunch-card-news" && post.status === "scheduled") ahead += 1;
}
if (ahead >= MAX_AHEAD) {
  console.log(JSON.stringify({ backlog: null, reason: "enough-scheduled", ahead }));
  process.exit(0);
}

const queue = await readJson(QUEUE);
const item = queue.items.find(
  (entry) => entry.status === "todo" && !state.articles[String(entry.no)],
);
if (!item) {
  console.log(JSON.stringify({ backlog: null, reason: "queue-empty" }));
  process.exit(0);
}

const id = String(item.no);
const article = await fetchArticle(id);
await writeJson(sourcePath(id), { ...sourceForWriter(article), cardOnly: true });
state.articles[id] = {
  id,
  canonicalUrl: article.canonicalUrl,
  title: article.title,
  publishedAt: article.publishedAt,
  bodyHash: article.bodyHash,
  batchId: `backlog-${id}`,
  cardOnly: true,
  homepage: { status: "not_listed", updatedAt: null },
  package: {
    status: "awaiting_review",
    manifestPath: path.join(PATHS.content, id, "manifest.json"),
    generatedAt: null,
  },
  linkedin: channelState("skipped_backlog"),
  instagram: channelState("manual_pending"),
  approvedAt: null,
  scheduledAt: null,
  completedAt: null,
};
item.status = "drafting";
await writeJson(QUEUE, queue);
await saveState(state);
console.log(JSON.stringify({ backlog: id, title: article.title, ahead }));
