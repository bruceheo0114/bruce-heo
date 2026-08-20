// 브런치에서 최신 글 목록과 본문을 가져옵니다.
// 1순위: RSS. RSS 가 막히거나 비어 있으면 프로필 페이지를 훑어 글 번호를 모으고
// 각 글의 og 메타에서 제목/발행일을 읽는 방식으로 대체합니다.
import {
  BRUNCH_ID,
  BRUNCH_ORIGIN,
  BRUNCH_PROFILE_URL,
  RSS_CANDIDATES,
  USER_AGENT,
} from './config.js';

const FETCH_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 10;

function browserHeaders(cookies) {
  const headers = {
    'user-agent': USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
  };
  if (cookies.size) {
    headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  return headers;
}

/**
 * 브런치는 쿠키를 심어 놓고 리다이렉트로 돌려보냅니다.
 * fetch 의 자동 리다이렉트는 쿠키를 들고 가지 않아 같은 자리를 맴돌다
 * 'redirect count exceeded' 로 끝납니다. 그래서 직접 따라가면서
 * 받은 쿠키를 다음 요청에 실어 보냅니다.
 */
export async function get(url) {
  const cookies = new Map();
  const visited = [];
  let current = url;

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    visited.push(current);
    const res = await fetch(current, {
      headers: browserHeaders(cookies),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual',
    });

    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const pair = raw.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error(`${res.status} 인데 location 이 없습니다 — ${current}`);
      const next = new URL(location, current).toString();
      // 쿠키를 실었는데도 같은 자리를 세 번 이상 맴돌면 포기합니다.
      if (visited.filter((v) => v === next).length >= 2) {
        throw new Error(`리다이렉트가 반복됩니다 — ${next}`);
      }
      current = next;
      continue;
    }

    if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${current}`);
    return res.text();
  }
  throw new Error(`리다이렉트가 ${MAX_REDIRECTS}번을 넘었습니다 — ${url}`);
}

function decodeEntities(str) {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

export function stripTags(html) {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|br|li|h[1-6]|blockquote)\s*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tagValue(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1]).trim() : '';
}

function metaValue(html, property) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]).trim();
  }
  return '';
}

/** 글 주소에서 번호를 뽑아냅니다. https://brunch.co.kr/@heoboram/211 -> "211" */
export function postIdFromUrl(url) {
  const m = String(url).match(/@+[^/]+\/(\d+)/);
  return m ? m[1] : '';
}

function normalizeUrl(id) {
  return `${BRUNCH_ORIGIN}/@${BRUNCH_ID}/${id}`;
}

/**
 * 브런치북에 묶인 글은 제목 앞에 화수가 붙습니다 ("12화 하인즈는 …").
 * 사이트 글 목록은 화수 없이 제목만 쓰므로 떼어냅니다.
 */
export function cleanTitle(title) {
  return String(title || '')
    .replace(/\s*\|\s*브런치.*$/, '')
    .replace(/^\s*\d+\s*화\s+/, '')
    .trim();
}

function toPost({ id, title, url, publishedAt, summary }) {
  const date = publishedAt ? new Date(publishedAt) : null;
  const valid = date && !Number.isNaN(date.getTime());
  return {
    id,
    title: cleanTitle(title),
    url: url || normalizeUrl(id),
    publishedAt: valid ? date.toISOString() : '',
    // index.html 의 post__date 표기 (2026.08)
    label: valid
      ? `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}`
      : '',
    summary: (summary || '').trim(),
  };
}

/**
 * 프로필 페이지 head 에 실린 RSS 주소를 찾아냅니다.
 * 브런치 RSS 는 아이디가 아니라 블로그 코드를 씁니다 (@heoboram -> /rss/@@2fCF).
 */
async function discoverRssUrl() {
  try {
    const html = await get(BRUNCH_PROFILE_URL);
    const m =
      html.match(/<link[^>]+type=["']application\/rss\+xml["'][^>]*href=["']([^"']+)["']/i) ||
      html.match(/<link[^>]+href=["']([^"']+)["'][^>]*type=["']application\/rss\+xml["']/i);
    if (m) {
      const url = new URL(decodeEntities(m[1]), BRUNCH_ORIGIN).toString();
      console.log(`  프로필에서 RSS 주소를 찾았습니다: ${url}`);
      return url;
    }
    console.warn('  프로필 페이지에 RSS 링크가 없습니다.');
  } catch (err) {
    console.warn(`  프로필 페이지를 읽지 못했습니다: ${err.message}`);
  }
  return '';
}

function parseRss(xml) {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return items
    .map((item) => {
      const link = tagValue(item, 'link') || tagValue(item, 'guid');
      const id = postIdFromUrl(link);
      if (!id) return null;
      const body = tagValue(item, 'content:encoded') || tagValue(item, 'description');
      return toPost({
        id,
        title: tagValue(item, 'title'),
        url: link,
        publishedAt: tagValue(item, 'pubDate'),
        summary: stripTags(body).slice(0, 400),
      });
    })
    .filter((p) => p && p.title);
}

async function fromRss() {
  const discovered = await discoverRssUrl();
  for (const url of [discovered, ...RSS_CANDIDATES].filter(Boolean)) {
    let xml;
    try {
      xml = await get(url);
    } catch (err) {
      console.warn(`  RSS 실패 (${url}): ${err.message}`);
      continue;
    }
    const posts = parseRss(xml);
    if (posts.length) {
      console.log(`  RSS ${posts.length}편 확인 (${url})`);
      return posts;
    }
    console.warn(`  RSS 응답에 글이 없습니다 (${url})`);
  }
  return [];
}

/**
 * RSS 가 안 될 때 쓰는 대비책.
 * 프로필 페이지는 글 목록을 자바스크립트로 그려서 HTML 만으로는 목록을 알 수 없습니다.
 * 그래서 최근 글 번호부터 하나씩 내려가며 글 페이지의 og 메타를 읽습니다.
 */
const PROBE_MAX_SCAN = 80; // 훑어볼 글 번호의 최대 개수
const PROBE_MAX_MISSES = 15; // 글을 찾은 뒤 연속으로 비어 있어도 되는 횟수

async function fromArticleProbe(limit, startId) {
  console.log(`  글 번호 ${startId}번부터 내려가며 확인합니다.`);
  const posts = [];
  let misses = 0;
  let scanned = 0;
  for (let id = startId; id > 0 && posts.length < limit && scanned < PROBE_MAX_SCAN; id -= 1) {
    scanned += 1;
    try {
      const page = await get(normalizeUrl(id));
      const title = metaValue(page, 'og:title');
      if (!title) {
        // 아직 첫 글을 못 찾았다면 시작점이 높았던 것뿐이라 미스로 치지 않습니다.
        if (posts.length && (misses += 1) >= PROBE_MAX_MISSES) break;
        continue;
      }
      misses = 0;
      posts.push(
        toPost({
          id: String(id),
          title,
          url: metaValue(page, 'og:url') || normalizeUrl(id),
          publishedAt:
            metaValue(page, 'article:published_time') || metaValue(page, 'og:regDate'),
          summary: metaValue(page, 'og:description'),
        })
      );
    } catch {
      if (posts.length && (misses += 1) >= PROBE_MAX_MISSES) break;
    }
  }
  console.log(`  글 페이지에서 ${posts.length}편 확인`);
  return posts;
}

/**
 * 최신 글 목록을 최신순으로 돌려줍니다.
 * @param {number} limit 가져올 최대 글 수
 * @param {object} [options]
 * @param {number} [options.probeFrom] RSS 가 실패했을 때 확인을 시작할 글 번호
 */
export async function fetchPosts(limit = 20, { probeFrom = 0 } = {}) {
  console.log(`브런치(@${BRUNCH_ID}) 글 목록을 가져옵니다.`);
  let posts = await fromRss();
  if (!posts.length && probeFrom > 0) {
    console.log('  RSS 로 못 가져와 글 페이지를 직접 확인합니다.');
    posts = await fromArticleProbe(limit, probeFrom);
  }
  if (!posts.length) throw new Error('브런치에서 글을 하나도 가져오지 못했습니다.');

  const seen = new Set();
  return posts
    .filter((p) => (seen.has(p.id) ? false : seen.add(p.id)))
    .sort((a, b) => {
      if (a.publishedAt && b.publishedAt) {
        const diff = new Date(b.publishedAt) - new Date(a.publishedAt);
        if (diff !== 0) return diff;
      }
      return Number(b.id) - Number(a.id);
    })
    .slice(0, limit);
}

/** 카드뉴스 원고를 만들기 위해 글 본문 텍스트를 가져옵니다. */
export async function fetchArticleText(post) {
  try {
    const html = await get(post.url);
    const body =
      html.match(/<div[^>]+class=["'][^"']*wrap_body[^"']*["'][\s\S]*?<\/div>\s*<\/div>/i) ||
      html.match(/<article\b[\s\S]*?<\/article>/i);
    const text = stripTags(body ? body[0] : html);
    if (text.length > 200) return text;
    return post.summary || text;
  } catch (err) {
    console.warn(`  본문 읽기 실패 (${post.url}): ${err.message}`);
    return post.summary || '';
  }
}
