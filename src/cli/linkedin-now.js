// 브런치 글 하나를 예약(화 07:30)을 기다리지 않고 바로 LinkedIn 에 올린다.
// 본문은 content/<id>/linkedin.txt, 이미지는 브런치 커버, 원문 링크는 넣지 않는다(사용자가 댓글로 단다).
// 게시하면 상태를 published 로 남겨 화요일 자동 게시가 같은 글을 다시 올리지 않게 한다.
import { readFile } from "node:fs/promises";
import { loadState, saveState } from "../lib/state.js";
import { publishLinkedIn } from "../publish/linkedin.js";

const id = process.argv[2];
if (!id) throw new Error("사용법: node src/cli/linkedin-now.js <글번호>");

const state = await loadState();
const article = state.articles[id];
if (!article) throw new Error(`상태에 ${id}번 글이 없습니다.`);
if (article.linkedin.status === "published") {
  console.log(JSON.stringify({ articleId: id, skipped: "already-published", postId: article.linkedin.postId }));
  process.exit(0);
}

const body = (await readFile(`content/${id}/linkedin.txt`, "utf8")).trim();
const now = new Date().toISOString();
const result = await publishLinkedIn({ article, linkedin: { body, withLink: false, firstComment: null } });

article.linkedin = {
  ...article.linkedin,
  ...result,
  id: result.postId,
  lastAttemptAt: now,
  error: null,
  manualNow: true,
};
await saveState(state);

const postUrl = `https://www.linkedin.com/feed/update/${result.postId}/`;
console.log(JSON.stringify({ articleId: id, postId: result.postId, postUrl, imageError: result.imageError ?? null }));
