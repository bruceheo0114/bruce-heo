// data/posts.json — 이미 처리한 글을 기억해 "새 글"을 가려냅니다.
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.js';

const EMPTY = { updatedAt: '', posts: [] };

export function readStore() {
  if (!fs.existsSync(PATHS.store)) return { ...EMPTY, posts: [] };
  try {
    const data = JSON.parse(fs.readFileSync(PATHS.store, 'utf-8'));
    return { updatedAt: data.updatedAt || '', posts: data.posts || [] };
  } catch (err) {
    console.warn(`posts.json 을 읽지 못해 새로 만듭니다: ${err.message}`);
    return { ...EMPTY, posts: [] };
  }
}

/**
 * 내용이 실제로 바뀐 경우에만 파일을 씁니다.
 * 매번 updatedAt 만 바꿔 쓰면 아무 일도 없는 날에도 커밋이 쌓입니다.
 * @returns {{changed: boolean, count: number}}
 */
export function writeStore(posts) {
  const normalized = posts.map((p) => ({
    id: p.id,
    title: p.title,
    url: p.url,
    publishedAt: p.publishedAt,
    label: p.label,
    cardnews: p.cardnews || null,
  }));

  const previous = readStore();
  const unchanged =
    JSON.stringify(previous.posts) === JSON.stringify(normalized);
  if (unchanged) return { changed: false, count: normalized.length };

  fs.mkdirSync(path.dirname(PATHS.store), { recursive: true });
  const payload = { updatedAt: new Date().toISOString(), posts: normalized };
  fs.writeFileSync(PATHS.store, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  return { changed: true, count: normalized.length };
}

/** 저장소에 없던 글만 최신순으로 돌려줍니다. */
export function findNewPosts(fetched, store) {
  const known = new Set(store.posts.map((p) => p.id));
  return fetched.filter((p) => !known.has(p.id));
}

/** 새로 가져온 목록과 기존 기록을 합칩니다 (카드뉴스 기록 유지). */
export function mergePosts(fetched, store) {
  const byId = new Map(store.posts.map((p) => [p.id, p]));
  for (const post of fetched) {
    const prev = byId.get(post.id);
    byId.set(post.id, { ...prev, ...post, cardnews: post.cardnews ?? prev?.cardnews ?? null });
  }
  return [...byId.values()].sort((a, b) => {
    if (a.publishedAt && b.publishedAt) {
      const diff = new Date(b.publishedAt) - new Date(a.publishedAt);
      if (diff !== 0) return diff;
    }
    return Number(b.id) - Number(a.id);
  });
}
