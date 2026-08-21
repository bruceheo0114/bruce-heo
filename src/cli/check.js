import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { CONFIG, PATHS } from "../config.js";
import { readJson } from "../lib/files.js";
import { modeForReviewCount } from "../lib/state.js";

function fail(message) {
  throw new Error(`자동화 검사 실패: ${message}`);
}

function jpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const size = buffer.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + size;
  }
  return null;
}

const posts = await readJson(PATHS.posts, []);
const state = await readJson(PATHS.state);
const homepage = await readFile(PATHS.homepage, "utf8");
if (state.mode !== modeForReviewCount(state.reviewSuccessCount)) {
  fail("검수 성공 횟수와 review/auto 모드가 일치하지 않습니다.");
}

if (state.initialized && posts.length !== CONFIG.homepageLimit) {
  fail(`홈페이지 글이 ${posts.length}개입니다. 정확히 ${CONFIG.homepageLimit}개여야 합니다.`);
}
if (new Set(posts.map((post) => post.canonicalUrl)).size !== posts.length) {
  fail("홈페이지 글 URL이 중복되었습니다.");
}
for (let index = 1; index < posts.length; index += 1) {
  if (new Date(posts[index - 1].publishedAt) < new Date(posts[index].publishedAt)) {
    fail("홈페이지 글이 최신순이 아닙니다.");
  }
}

const start = homepage.indexOf("<!-- BRUNCH_POSTS_START -->");
const end = homepage.indexOf("<!-- BRUNCH_POSTS_END -->");
if (start < 0 || end <= start) fail("홈페이지 자동 생성 마커가 없습니다.");
const writingBlock = homepage.slice(start, end);
for (const post of posts) {
  if (!writingBlock.includes(post.canonicalUrl)) {
    fail(`홈페이지 HTML에 글이 없습니다: ${post.canonicalUrl}`);
  }
}

for (const article of Object.values(state.articles)) {
  let packageExists = false;
  if (article.package.manifestPath) {
    try {
      await access(article.package.manifestPath);
      packageExists = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (article.package.status !== "generated" && !packageExists) continue;
  if (!packageExists) fail(`${article.id} generated manifest가 없습니다.`);
  const manifest = await readJson(article.package.manifestPath);
  if (manifest.article.canonicalUrl !== article.canonicalUrl) {
    fail(`${article.id} manifest canonical URL이 상태와 다릅니다.`);
  }
  if (
    manifest.cards.length < CONFIG.cardMin ||
    manifest.cards.length > CONFIG.cardMax
  ) {
    fail(`${article.id} 카드 수가 7~10 범위를 벗어났습니다.`);
  }
  if (/https?:\/\//i.test(manifest.linkedin.body)) {
    fail(`${article.id} LinkedIn 본문에 URL이 있습니다.`);
  }
  if (!manifest.linkedin.firstComment.includes(article.canonicalUrl)) {
    fail(`${article.id} LinkedIn 첫 댓글의 URL이 잘못되었습니다.`);
  }
  if (
    !manifest.instagram.caption.includes("#브루스매거진") ||
    !manifest.instagram.caption.includes("저장")
  ) {
    fail(`${article.id} Instagram 캡션 필수 요소가 없습니다.`);
  }
  await access(path.join(path.dirname(article.package.manifestPath), "preview.html"));
  for (const card of manifest.cards) {
    const cardPath = path.join(path.dirname(article.package.manifestPath), card.file);
    const dimensions = jpegDimensions(await readFile(cardPath));
    if (
      !dimensions ||
      dimensions.width !== CONFIG.cardWidth ||
      dimensions.height !== CONFIG.cardHeight
    ) {
      fail(`${cardPath}가 1080×1080 JPEG가 아닙니다.`);
    }
  }
}

console.log(
  JSON.stringify({
    homepagePosts: posts.length,
    trackedArticles: Object.keys(state.articles).length,
    mode: state.mode,
    reviewSuccessCount: state.reviewSuccessCount,
  }),
);
