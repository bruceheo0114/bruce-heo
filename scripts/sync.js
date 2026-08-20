#!/usr/bin/env node
// 브런치 → 사이트 자동 반영.
//   1) 최신 글을 가져와 index.html 의 Writing 섹션을 갱신하고
//   2) 새로 올라온 글은 카드뉴스로 만들어 cardnews/ 에 쌓습니다.
//
// 사용법:
//   node scripts/sync.js                 평소 실행
//   node scripts/sync.js --dry-run       파일을 쓰지 않고 무엇이 바뀔지만 확인
//   node scripts/sync.js --skip-cardnews 글 목록만 갱신
//   node scripts/sync.js --force 211     특정 글의 카드뉴스를 다시 생성
import { CARDNEWS_MAX_PER_RUN, INDEX_POST_LIMIT } from './lib/config.js';
import { fetchPosts } from './lib/brunch.js';
import { readStore, writeStore, mergePosts, findNewPosts } from './lib/store.js';
import { updateIndex } from './update-index.js';
import { makeCardnews } from './make-cardnews.js';
import { buildGallery } from './build-gallery.js';

function parseArgs(argv) {
  const args = { dryRun: false, skipCardnews: false, force: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--skip-cardnews') args.skipCardnews = true;
    else if (arg === '--force') args.force.push(argv[++i]);
    else if (/^\d+$/.test(arg)) args.force.push(arg);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const store = readStore();
  const fetched = await fetchPosts(Math.max(INDEX_POST_LIMIT, 20));
  console.log(`가져온 글 ${fetched.length}편 (최신: ${fetched[0].title})`);

  const isFirstRun = store.posts.length === 0;
  const newPosts = findNewPosts(fetched, store);
  if (newPosts.length) {
    console.log(`새 글 ${newPosts.length}편: ${newPosts.map((p) => p.id).join(', ')}`);
  } else {
    console.log('새 글 없음.');
  }

  // 1) 글 목록 갱신
  const indexResult = updateIndex(mergePosts(fetched, store), { dryRun: args.dryRun });

  // 2) 카드뉴스
  const forced = args.force.length
    ? fetched.filter((p) => args.force.includes(p.id))
    : [];
  let targets = [...forced];
  if (!args.skipCardnews && !isFirstRun) {
    for (const post of newPosts) {
      if (!targets.some((t) => t.id === post.id)) targets.push(post);
    }
  } else if (isFirstRun) {
    console.log('첫 실행이라 기존 글은 카드뉴스를 만들지 않고 기록만 남깁니다.');
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

  // --skip-cardnews 로 목록만 갱신한 경우에는 기록을 남기지 않습니다.
  // 남겨 버리면 그 글이 '이미 처리한 글'이 되어 카드뉴스를 영영 못 만듭니다.
  const skipStoreWrite = args.skipCardnews && newPosts.length > 0;
  if (skipStoreWrite) {
    console.log('목록만 갱신했으므로 새 글은 기록하지 않습니다 (다음 실행에서 카드뉴스 생성).');
  }

  if (!args.dryRun && !skipStoreWrite) {
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

  console.log(
    `\n완료 — 목록 ${indexResult.changed ? '변경됨' : '변경 없음'}, 카드뉴스 ${cardnewsById.size}건 생성`
  );
}

main().catch((err) => {
  console.error(`\n실패: ${err.message}`);
  process.exit(1);
});
