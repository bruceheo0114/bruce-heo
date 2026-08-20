#!/usr/bin/env node
// 브런치 → 사이트 자동 반영.
// 최신 글을 가져와 index.html 의 Writing 섹션을 갱신합니다.
//
// 카드뉴스는 자동으로 만들지 않습니다. 직접 시킬 때만 만들어집니다.
//
// 사용법:
//   node scripts/sync.js              평소 실행 (글 목록만 갱신)
//   node scripts/sync.js --dry-run    파일을 쓰지 않고 무엇이 바뀔지만 확인
//   node scripts/sync.js --force 211  211번 글의 카드뉴스를 만들거나 다시 만듦
//   node scripts/sync.js --cardnews   이번 실행에서 발견한 새 글의 카드뉴스까지 생성
import { CARDNEWS_MAX_PER_RUN, INDEX_POST_LIMIT } from './lib/config.js';
import { fetchPosts } from './lib/brunch.js';
import { readStore, writeStore, mergePosts, findNewPosts } from './lib/store.js';
import { updateIndex } from './update-index.js';
import { makeCardnews } from './make-cardnews.js';
import { buildGallery } from './build-gallery.js';

function parseArgs(argv) {
  const args = { dryRun: false, cardnews: false, force: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--cardnews') args.cardnews = true;
    else if (arg === '--force') args.force.push(argv[++i]);
    else if (/^\d+$/.test(arg)) args.force.push(arg);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const store = readStore();
  // RSS 가 막혔을 때는 이미 아는 가장 큰 글 번호 언저리부터 훑습니다.
  const highestKnown = store.posts.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0);
  const fetched = await fetchPosts(Math.max(INDEX_POST_LIMIT, 20), {
    probeFrom: highestKnown ? highestKnown + 15 : 0,
  });
  console.log(`가져온 글 ${fetched.length}편 (최신: ${fetched[0].title})`);

  const newPosts = findNewPosts(fetched, store);
  if (newPosts.length) {
    console.log(`새 글 ${newPosts.length}편: ${newPosts.map((p) => p.id).join(', ')}`);
  } else {
    console.log('새 글 없음.');
  }

  // 1) 글 목록 갱신
  const indexResult = updateIndex(mergePosts(fetched, store), { dryRun: args.dryRun });

  // 2) 카드뉴스 — 자동으로는 만들지 않고, 시켰을 때만 만듭니다.
  let targets = args.force.length
    ? fetched.filter((p) => args.force.includes(p.id))
    : [];
  if (args.force.length) {
    const missing = args.force.filter((id) => !targets.some((p) => p.id === id));
    if (missing.length) {
      console.warn(`최근 글 목록에 없어 건너뜁니다: ${missing.join(', ')}`);
    }
  }
  if (args.cardnews) {
    for (const post of newPosts) {
      if (!targets.some((t) => t.id === post.id)) targets.push(post);
    }
  }
  targets = targets.slice(0, CARDNEWS_MAX_PER_RUN);

  const cardnewsById = new Map();
  for (const post of targets) {
    if (args.dryRun) {
      console.log(`(dry-run) 카드뉴스 생성 대상: [${post.id}] ${post.title}`);
      continue;
    }
    try {
      const result = await makeCardnews(post);
      cardnewsById.set(post.id, {
        createdAt: result.createdAt,
        files: result.files,
        copySource: result.copy.source,
      });
    } catch (err) {
      // 카드뉴스가 실패해도 글 목록 갱신까지 되돌리지는 않습니다.
      console.error(`카드뉴스 실패 [${post.id}]: ${err.message}`);
    }
  }

  if (!args.dryRun) {
    if (cardnewsById.size) buildGallery();
    const merged = mergePosts(
      fetched.map((p) => ({ ...p, cardnews: cardnewsById.get(p.id) ?? undefined })),
      store
    );
    const stored = writeStore(merged);
    console.log(
      stored.changed
        ? `data/posts.json: ${stored.count}편 기록`
        : 'data/posts.json: 변경 없음'
    );
  }

  const cardnewsNote = targets.length
    ? `카드뉴스 ${cardnewsById.size}건 생성`
    : '카드뉴스 생성 안 함';
  console.log(`\n완료 — 목록 ${indexResult.changed ? '변경됨' : '변경 없음'}, ${cardnewsNote}`);
}

main().catch((err) => {
  console.error(`\n실패: ${err.message}`);
  process.exit(1);
});
