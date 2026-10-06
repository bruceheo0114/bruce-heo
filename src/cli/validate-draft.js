import { readFile } from "node:fs/promises";
import path from "node:path";
import { readJson } from "../lib/files.js";
import { draftPath, sourcePath } from "../lib/content-generator.js";
import { validateGeneratedContent } from "../lib/content-schema.js";

// 사용법: node src/cli/validate-draft.js <글번호>
// Claude 루틴이 draft.json을 쓴 뒤 커밋 전에 실행한다.
const id = process.argv[2];
if (!id) {
  console.error("사용법: node src/cli/validate-draft.js <글번호>");
  process.exit(2);
}
const source = await readJson(sourcePath(id));
const draft = await readJson(draftPath(id));
const errors = validateGeneratedContent(draft, {
  ...source,
  images: source.images.map((image) => image.url),
});
// 뉴스레터·리멤버 원고 (파일 길이와 필수 줄만 검사)
async function longform(file, min, max, checks) {
  let text;
  try {
    text = await readFile(path.join("content", id, file), "utf8");
  } catch {
    errors.push(`${file} 이 없습니다.`);
    return;
  }
  const body = text.replace(/^#.*$/m, "").trim();
  if (!text.startsWith("# ")) errors.push(`${file} 첫 줄은 "# 제목" 이어야 합니다.`);
  if (body.length < min || body.length > max) {
    errors.push(`${file} 본문은 ${min}~${max}자여야 합니다(현재 ${body.length}자).`);
  }
  for (const [ok, message] of checks(text)) if (!ok) errors.push(`${file}: ${message}`);
}
await longform("linkedin-newsletter.md", 1500, 3300, (text) => [
  [text.includes(source.canonicalUrl), "맨 끝에 브런치 원문 링크가 있어야 합니다."],
  [text.includes("bruceheo.com"), "맨 끝에 bruceheo.com 안내가 있어야 합니다."],
]);
await longform("remember.md", 800, 1600, (text) => [
  [text.trim().endsWith("?"), "독자 질문(?)으로 끝나야 합니다."],
  [!/https?:\/\//.test(text), "외부 링크를 넣지 않습니다."],
  [!/#[\p{L}\p{N}_]+/u.test(text.replace(/^#+ .*$/gm, "")), "해시태그를 넣지 않습니다."],
]);

if (errors.length) {
  console.error(`검사 실패 (${errors.length}건):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`OK: content/${id}/draft.json 카드 ${draft.cards.length}장`);
