import { PATHS } from "../config.js";
import { readJson, writeFileAtomic } from "../lib/files.js";

const result = await readJson(PATHS.result, {});
const state = await readJson(PATHS.state);
const repository = process.env.GITHUB_REPOSITORY ?? "bruceheo0114/bruce-heo";
const reference =
  process.env.AUTOMATION_REF ??
  process.env.AUTOMATION_BRANCH ??
  "feat/brunch-weekly-automation";
const ids = result.generatedArticleIds ?? [];

const sections = [];
for (const id of ids) {
  const articleState = state.articles[id];
  const manifest = await readJson(articleState.package.manifestPath);
  const imageBase = `https://raw.githubusercontent.com/${repository}/${reference}/content/${id}/cards`;
  const images = manifest.cards
    .map(
      (card) =>
        `<img src="${imageBase}/${String(card.sequence).padStart(2, "0")}.jpg" width="260" alt="${card.sequence}번 카드">`,
    )
    .join(" ");

  sections.push(`## ${manifest.article.title}

- 원문: ${manifest.article.canonicalUrl}
- 예정 슬롯: ${manifest.schedule.scheduledAt} (승인이 늦으면 다음 18:30 슬롯)
- 카드: ${manifest.cards.length}장

### 카드 전체 미리보기

${images}

<details><summary>LinkedIn 본문과 첫 댓글</summary>

${manifest.linkedin.body}

**첫 댓글**

${manifest.linkedin.firstComment}

</details>

<details><summary>Instagram 캡션</summary>

${manifest.instagram.caption}

</details>`);
}

const reviewMessage =
  state.mode === "review"
    ? "현재 검수 모드입니다. 카드와 문안을 확인한 뒤 PR을 병합하면 게시 대기열에 들어갑니다."
    : "3회 연속 승인·게시를 통과한 자동 모드입니다. 테스트 통과 후 이 PR은 자동 병합됩니다.";

await writeFileAtomic(
  PATHS.prBody,
  `# 브런치 콘텐츠 자동 생성\n\n${reviewMessage}\n\n${sections.join("\n\n---\n\n")}\n`,
);
console.log(JSON.stringify({ articleIds: ids, mode: state.mode }));
