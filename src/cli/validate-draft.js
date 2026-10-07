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
if (errors.length) {
  console.error(`검사 실패 (${errors.length}건):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`OK: content/${id}/draft.json 카드 ${draft.cards.length}장`);
