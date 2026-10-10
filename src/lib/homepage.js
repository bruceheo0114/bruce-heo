import { readdir, readFile } from "node:fs/promises";
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

// 이 사이트(/writing/)에 백업된 글은 사이트 안에서 읽게 하고, 아직 백업 전인 새 글만 브런치로 보낸다.
function postLinkAttributes(id, brunchUrl, archivedIds) {
  return archivedIds.has(String(id))
    ? `href="/writing/${escapeHtml(id)}/"`
    : `href="${escapeHtml(brunchUrl)}" target="_blank" rel="noopener"`;
}

export async function loadArchivedIds() {
  const files = await readdir(PATHS.archiveData).catch(() => []);
  return new Set(files.filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5)));
}

export function renderPostLinks(posts, archivedIds = new Set()) {
  return posts
    .map(
      (post) => `      <a class="post" ${postLinkAttributes(post.id, post.canonicalUrl, archivedIds)}>
        <div class="post__date">${formatHomepageMonth(post.publishedAt)}</div>
        <div class="post__title">${escapeHtml(post.title)}</div>
        <div class="post__arrow">→</div>
      </a>`,
    )
    .join("\n");
}

function writingListRange(html) {
  const startIndex = html.indexOf(START);
  const endIndex = html.indexOf(END);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error("홈페이지에서 BRUNCH_POSTS 자동 생성 구간을 찾지 못했습니다.");
  }
  return [startIndex + START.length, endIndex];
}

// 이미 만들어진 목록(영문 홈페이지 포함)에서 백업된 글의 브런치 링크만 사이트 링크로 바꾼다.
export function linkArchivedPosts(html, archivedIds) {
  const [from, to] = writingListRange(html);
  const list = html
    .slice(from, to)
    .replace(
      /<a class="post" href="https:\/\/brunch\.co\.kr\/@[\w-]+\/(\d+)" target="_blank" rel="noopener">/g,
      (tag, id) => (archivedIds.has(id) ? `<a class="post" href="/writing/${id}/">` : tag),
    );
  return html.slice(0, from) + list + html.slice(to);
}

export function replaceWritingList(html, posts, archivedIds = new Set()) {
  const [from, to] = writingListRange(html);
  const before = html.slice(0, from);
  const after = html.slice(to);
  return `${before}\n${renderPostLinks(posts, archivedIds)}\n      ${after}`;
}

export async function updateHomepage(posts) {
  const current = await readFile(PATHS.homepage, "utf8");
  await writeFileAtomic(PATHS.homepage, replaceWritingList(current, posts, await loadArchivedIds()));
}
