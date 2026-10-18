import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderCards } from "../lib/card-renderer.js";

// 수·금 12:30 카드뉴스(posts/DATE.noon.json, status=render)를 LG 카드뉴스와 같은 렌더러로 그린다.
// 원고는 posts/DATE.noon.deck.json(cards 배열), 결과는 media/DATE-noon/cards/NN.jpg. (GitHub Actions: insight-reels-decks.yml)
const POSTS = "insight-reels/posts";
const SITE = "https://bruceheo.com/insight-reels/media";
const RAW = "https://raw.githubusercontent.com/bruceheo0114/bruce-heo/main/insight-reels/media";

let done = 0;
for (const name of (await readdir(POSTS)).filter((file) => /^\d{4}-\d{2}-\d{2}\.noon\.json$/.test(file)).sort()) {
  const file = path.join(POSTS, name);
  const post = JSON.parse(await readFile(file, "utf8"));
  if (post.type !== "carousel" || post.status !== "render") continue;
  const deck = JSON.parse(await readFile(file.replace(/\.json$/, ".deck.json"), "utf8"));
  const folder = `${post.date}-noon`;
  await renderCards({ article: { title: post.title }, cards: deck.cards }, `insight-reels/media/${folder}`);
  const names = deck.cards.map((_, index) => `${String(index + 1).padStart(2, "0")}.jpg`);
  Object.assign(post, {
    images: names.map((card) => `${SITE}/${folder}/cards/${card}`),
    images_backup: names.map((card) => `${RAW}/${folder}/cards/${card}`),
    qa_url: `${SITE}/${folder}/preview.html`,
    status: "scheduled",
  });
  await writeFile(file, `${JSON.stringify(post, null, 2)}\n`);
  console.log(`${post.date} 12:30: ${names.length}장 렌더링 → scheduled`);
  done += 1;
}
console.log(`처리 ${done}건`);
