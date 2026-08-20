// index.html 의 Writing 섹션(브런치 글 목록)을 최신 글로 갈아끼웁니다.
import fs from 'node:fs';
import { PATHS, INDEX_POST_LIMIT } from './lib/config.js';
import { escapeHtml, replaceBetweenMarkers } from './lib/html.js';

function renderPost(post) {
  const date = post.label || '';
  return [
    `      <a class="post" href="${escapeHtml(post.url)}" target="_blank" rel="noopener">`,
    `        <div class="post__date">${escapeHtml(date)}</div>`,
    `        <div class="post__title">${escapeHtml(post.title)}</div>`,
    '        <div class="post__arrow">→</div>',
    '      </a>',
  ].join('\n');
}

function renderGrid(posts) {
  return [
    '',
    '    <div class="posts reveal">',
    posts.map(renderPost).join('\n'),
    '    </div>',
    '    ',
  ].join('\n');
}

/**
 * @returns {{changed: boolean, count: number}}
 */
export function updateIndex(posts, { dryRun = false } = {}) {
  const shown = posts.slice(0, INDEX_POST_LIMIT);
  if (!shown.length) return { changed: false, count: 0 };

  const before = fs.readFileSync(PATHS.index, 'utf-8');
  const after = replaceBetweenMarkers(before, 'brunch:posts', renderGrid(shown));

  if (after === before) {
    console.log('index.html: 이미 최신 상태입니다.');
    return { changed: false, count: shown.length };
  }
  if (!dryRun) fs.writeFileSync(PATHS.index, after, 'utf-8');
  console.log(
    `index.html: 글 목록 ${shown.length}편 갱신${dryRun ? ' (dry-run, 저장 안 함)' : ''}`
  );
  return { changed: true, count: shown.length };
}
