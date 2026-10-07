import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { readJson, writeFileAtomic, writeJson } from "../lib/files.js";
import { youtubePaths } from "./config.js";

export function sourceFileName(articleId) {
  return `${articleId}.md`;
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

// 브런치 원문을 그대로 보관한다. Episode 제작물은 이 파일만 원본으로 삼는다.
export function articleToMarkdown(article) {
  const lines = [
    "---",
    `article_id: ${yamlString(article.id)}`,
    `url: ${yamlString(article.canonicalUrl)}`,
    `title: ${yamlString(article.title)}`,
    `subtitle: ${yamlString(article.subtitle)}`,
    `published_at: ${yamlString(article.publishedAt)}`,
    `body_hash: ${yamlString(article.bodyHash)}`,
    "---",
    "",
    `# ${article.title}`,
    "",
  ];
  if (article.subtitle) lines.push(`> ${article.subtitle}`, "");
  lines.push(`원문: ${article.canonicalUrl}`, "", article.body.trim(), "");
  if (article.images?.length) {
    lines.push("## 원문 이미지", "", ...article.images.map((url) => `- ${url}`), "");
  }
  return lines.join("\n");
}

export function parseFrontMatter(markdown) {
  const match = String(markdown).match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { data: {}, body: String(markdown) };
  const data = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!field) continue;
    try {
      data[field[1]] = JSON.parse(field[2]);
    } catch {
      data[field[1]] = field[2];
    }
  }
  return { data, body: String(markdown).slice(match[0].length) };
}

export async function loadSourceIndex(paths = youtubePaths()) {
  return readJson(paths.sourceIndex, { version: 1, initializedAt: null, articles: {} });
}

export async function saveSourceIndex(index, paths = youtubePaths()) {
  const sorted = Object.fromEntries(
    Object.entries(index.articles).sort(([a], [b]) => Number(a) - Number(b)),
  );
  await writeJson(paths.sourceIndex, { ...index, articles: sorted });
}

/**
 * 새 글은 Markdown으로 저장하고, 본문이 바뀐 글은 원본을 갱신한 뒤 changed로 돌려준다.
 * Episode 쪽은 changed 목록을 보고 UPDATE_AVAILABLE만 표시하며 제작물은 건드리지 않는다.
 */
export async function archiveArticles(index, articles, now, paths = youtubePaths()) {
  const added = [];
  const changed = [];
  for (const article of articles) {
    const known = index.articles[article.id];
    if (known && known.bodyHash === article.bodyHash) continue;

    const file = sourceFileName(article.id);
    await writeFileAtomic(path.join(paths.sources, file), articleToMarkdown(article));
    const entry = {
      id: article.id,
      url: article.canonicalUrl,
      title: article.title,
      publishedAt: article.publishedAt,
      bodyHash: article.bodyHash,
      file,
      firstSeenAt: known?.firstSeenAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
      episode: known?.episode ?? null,
    };
    index.articles[article.id] = entry;
    (known ? changed : added).push(entry);
  }
  return { added, changed };
}

// brunch.co.kr에 접속할 수 없는 환경(클라우드 세션 등)에서는 기존 자동화가 저장한 source.json을 쓴다.
export async function loadLocalArticles(contentDir = "content") {
  const articles = [];
  for (const entry of await readdir(contentDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    try {
      const source = JSON.parse(
        await readFile(path.join(contentDir, entry.name, "source.json"), "utf8"),
      );
      if (source.id && source.body && source.bodyHash) articles.push(source);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return articles.sort((a, b) => Number(a.id) - Number(b.id));
}
