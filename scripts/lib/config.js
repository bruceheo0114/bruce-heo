// 브런치 연동 자동화 공통 설정
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, '..', '..');

/** 브런치 작가 아이디 (@ 제외). 워크플로에서 BRUNCH_ID 로 덮어쓸 수 있습니다. */
export const BRUNCH_ID = process.env.BRUNCH_ID || 'heoboram';

/** 브런치 도메인. 로컬에서 테스트할 때만 다른 값을 넣습니다. */
export const BRUNCH_ORIGIN = (process.env.BRUNCH_ORIGIN || 'https://brunch.co.kr').replace(/\/$/, '');

export const BRUNCH_PROFILE_URL = `${BRUNCH_ORIGIN}/@${BRUNCH_ID}`;

/** RSS 는 계정에 따라 주소 형태가 달라서 순서대로 시도합니다. */
export const RSS_CANDIDATES = [
  `${BRUNCH_ORIGIN}/rss/@@${BRUNCH_ID}`,
  `${BRUNCH_ORIGIN}/rss/@${BRUNCH_ID}`,
];

export const PATHS = {
  index: path.join(ROOT, 'index.html'),
  store: path.join(ROOT, 'data', 'posts.json'),
  cardnews: path.join(ROOT, 'cardnews'),
  cardnewsIndex: path.join(ROOT, 'cardnews', 'index.html'),
};

/** index.html 의 글 목록에 노출할 개수 */
export const INDEX_POST_LIMIT = 12;

/** 한 번에 카드뉴스를 만들 신규 글의 최대 개수 (첫 실행 폭주 방지) */
export const CARDNEWS_MAX_PER_RUN = Number(process.env.CARDNEWS_MAX_PER_RUN || 3);

/** 카드뉴스 이미지 규격 — 인스타그램 4:5 */
export const CARD_SIZE = { width: 1080, height: 1350 };

/** 사이트와 동일한 팔레트 */
export const PALETTE = {
  bg: '#FFFFFF',
  bgSoft: '#F9FAFB',
  ink: '#191F28',
  ink2: '#4E5968',
  ink3: '#8B95A1',
  border: '#E5E8EB',
  accent: '#3182F6',
  accentStrong: '#1B64DA',
  accentSoft: '#E8F3FF',
};

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';
