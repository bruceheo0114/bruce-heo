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

async function get(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
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

async function fromRss() {
  for (const url of RSS_CANDIDATES) {
    let xml;
    try {
      xml = await get(url);
    } catch (err) {
      console.warn(`  RSS 실패 (${url}): ${err.message}`);
      continue;
    }
    const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    const posts = items
      .map((item) => {
        const link = tagValue(item, 'link') || tagValue(item, 'guid');
        const id = postIdFromUrl(link);
        if (!id) return null;
        const body =
          tagValue(item, 'content:encoded') || tagValue(item, 'description');
        return toPost({
          id,
          title: tagValue(item, 'title'),
          url: link,
          publishedAt: tagValue(item, 'pubDate'),
          summary: stripTags(body).slice(0, 400),
        });
      })
      .filter((p) => p && p.title);
    if (posts.length) {
      console.log(`  RSS ${posts.length}편 확인 (${url})`);
      return posts;
    }
    console.warn(`  RSS 응답에 글이 없습니다 (${url})`);
  }
  return [];
}

async function fromProfileScrape(limit) {
  const html = await get(BRUNCH_PROFILE_URL);
  const ids = [];
  const re = new RegExp(`/@+${BRUNCH_ID}/(\\d+)`, 'gi');
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  // 프로필 페이지는 최신 글이 위에 오지만 확실하지 않아 번호 내림차순으로 다시 정렬합니다.
  ids.sort((a, b) => Number(b) - Number(a));
  const picked = ids.slice(0, limit);
  console.log(`  프로필 페이지에서 글 번호 ${picked.length}개 수집`);

  const posts = [];
  for (const id of picked) {
    try {
      const page = await get(normalizeUrl(id));
      const title = metaValue(page, 'og:title') || metaValue(page, 'title');
      if (!title) continue;
      posts.push(
        toPost({
          id,
          title,
          url: metaValue(page, 'og:url') || normalizeUrl(id),
          publishedAt:
            metaValue(page, 'article:published_time') ||
            metaValue(page, 'og:regDate'),
          summary: metaValue(page, 'og:description'),
        })
      );
    } catch (err) {
      console.warn(`  글 ${id} 메타 읽기 실패: ${err.message}`);
    }
  }
  return posts;
}

/**
 * 최신 글 목록을 최신순으로 돌려줍니다.
 * @param {number} limit 가져올 최대 글 수
 */
export async function fetchPosts(limit = 20) {
  console.log(`브런치(@${BRUNCH_ID}) 글 목록을 가져옵니다.`);
  let posts = await fromRss();
  if (!posts.length) {
    console.log('  RSS 로 못 가져와 프로필 페이지를 훑습니다.');
    posts = await fromProfileScrape(limit);
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
