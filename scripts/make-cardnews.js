// 새로 올라온 브런치 글 하나를 카드뉴스로 만듭니다.
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './lib/config.js';
import { fetchArticleText } from './lib/brunch.js';
import { generateCardCopy } from './lib/cardcopy.js';
import { renderCards } from './lib/render-cards.js';

/**
 * @returns {Promise<{files: string[], copy: object, createdAt: string}>}
 */
export async function makeCardnews(post, { bodyText } = {}) {
  console.log(`카드뉴스 생성: [${post.id}] ${post.title}`);
  const body = bodyText ?? (await fetchArticleText(post));
  if (!body || body.length < 80) {
    throw new Error('본문이 너무 짧아 카드뉴스를 만들 수 없습니다.');
  }

  const copy = await generateCardCopy(post, body);
  console.log(`  원고 ${copy.cards.length}장 (${copy.source})`);

  const files = await renderCards(post, copy);
  console.log(`  이미지 ${files.length}장 저장 → cardnews/${post.id}/`);

  const meta = {
    id: post.id,
    title: post.title,
    url: post.url,
    label: post.label,
    publishedAt: post.publishedAt,
    createdAt: new Date().toISOString(),
    copySource: copy.source,
    files,
    copy,
  };
  fs.writeFileSync(
    path.join(PATHS.cardnews, post.id, 'meta.json'),
    `${JSON.stringify(meta, null, 2)}\n`,
    'utf-8'
  );
  return { files, copy, createdAt: meta.createdAt };
}

// 단독 실행: node scripts/make-cardnews.js 211
if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2];
  if (!id) {
    console.error('사용법: node scripts/make-cardnews.js <글 번호>');
    process.exit(1);
  }
  const { fetchPosts } = await import('./lib/brunch.js');
  const posts = await fetchPosts(30);
  const post = posts.find((p) => p.id === id);
  if (!post) {
    console.error(`최근 글 목록에서 ${id} 번 글을 찾지 못했습니다.`);
    process.exit(1);
  }
  await makeCardnews(post);
  const { buildGallery } = await import('./build-gallery.js');
  buildGallery();
}
