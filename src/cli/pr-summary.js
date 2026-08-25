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
- LinkedIn: 직접 게시할 수동 초안
- 카드: ${manifest.cards.length}장

### 카드 전체 미리보기

${images}

<details><summary>LinkedIn 본문과 첫 댓글</summary>

${manifest.linkedin.body}

**첫 댓글**

${manifest.linkedin.firstComment}

</details>

<details><summary>Instagram 수동 업로드 소스</summary>

${manifest.instagram.caption}

**사용 방법**: 위 카드 이미지와 **instagram-caption.txt**를 검토한 뒤 직접 게시하거나, 로그인된 PC의 Chrome에서 Codex에게 업로드를 요청합니다. 최종 공유 전에는 반드시 사용자 확인을 받으며 Instagram API 호출은 하지 않습니다.

</details>`);
}

const reviewMessage =
  "카드와 문안을 확인하세요. PR을 병합해도 LinkedIn과 Instagram에는 자동 게시되지 않습니다.";

await writeFileAtomic(
  PATHS.prBody,
  `# 브런치 콘텐츠 자동 생성\n\n${reviewMessage}\n\n${sections.join("\n\n---\n\n")}\n`,
);
console.log(JSON.stringify({ articleIds: ids, mode: state.mode }));

