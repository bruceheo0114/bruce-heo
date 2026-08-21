import { readFile } from "node:fs/promises";
import { PATHS } from "../config.js";
import { writeFileAtomic } from "./files.js";
import { formatHomepageMonth } from "./time.js";

const START = "<!-- BRUNCH_POSTS_START -->";
const END = "<!-- BRUNCH_POSTS_END -->";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderPostLinks(posts) {
  return posts
    .map(
      (post) => `      <a class="post" href="${escapeHtml(post.canonicalUrl)}" target="_blank" rel="noopener">
        <div class="post__date">${formatHomepageMonth(post.publishedAt)}</div>
        <div class="post__title">${escapeHtml(post.title)}</div>
        <div class="post__arrow">→</div>
      </a>`,
    )
    .join("\n");
}

export function replaceWritingList(html, posts) {
  const startIndex = html.indexOf(START);
  const endIndex = html.indexOf(END);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error("index.html에서 BRUNCH_POSTS 자동 생성 구간을 찾지 못했습니다.");
  }
  const before = html.slice(0, startIndex + START.length);
  const after = html.slice(endIndex);
  return `${before}\n${renderPostLinks(posts)}\n      ${after}`;
}

export async function updateHomepage(posts) {
  const current = await readFile(PATHS.homepage, "utf8");
  await writeFileAtomic(PATHS.homepage, replaceWritingList(current, posts));
}
