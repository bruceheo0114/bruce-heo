import { escapeHtml } from "../lib/homepage.js";

// 홈페이지의 최신 유튜브 영상 카드를 채널의 가장 새 영상으로 바꾸는 순수 함수와 가져오기 도우미.
// 외부 라이브러리 없이 동작한다(YouTube 가 만든 Atom 피드만 읽는다).

export const CHANNEL_HANDLE = "bruce.insight";
export const CHANNEL_URL = `https://www.youtube.com/@${CHANNEL_HANDLE}`;

const START = "<!-- YOUTUBE_LATEST_START -->";
const END = "<!-- YOUTUBE_LATEST_END -->";
const VIDEO_ID = /^[\w-]{11}$/;
const CHANNEL_ID = /^UC[\w-]{22}$/;
const FETCH_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; BruceInsightAutomation/1.0; +https://bruceheo.com/)",
  "accept-language": "ko,en;q=0.8",
};

const COPY = {
  ko: {
    channelTitle: "브루스 인사이트",
    type: "▶ 영상 · 브루스 인사이트 YouTube",
    source: "브루스 인사이트 채널 보기",
    fallbackDesc: "브루스 인사이트의 가장 새 영상입니다. 브런치 글을 영상 에세이로 옮겼습니다.",
  },
  // 영문 페이지에는 한글이 보이면 안 되어서 제목·설명은 영어 고정 문구를 쓴다(en 값이 있으면 그것을 쓴다).
  en: {
    channelTitle: "Bruce Insight",
    type: "▶ Video · Bruce Insight on YouTube",
    source: "Visit the Bruce Insight channel",
    fallbackTitle: "New video essay",
    fallbackDesc: "The newest video essay from Bruce Insight, retold from a Brunch essay (in Korean).",
  },
};

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function tagText(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return match ? decodeEntities(match[1]).trim() : "";
}

// YouTube Atom 피드(채널 또는 재생목록)에서 영상 목록을 최신순 그대로 꺼낸다.
export function parseFeed(xml) {
  const entries = [];
  for (const match of String(xml).matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const block = match[1];
    const id = tagText(block, "yt:videoId");
    if (!VIDEO_ID.test(id)) continue;
    entries.push({
      id,
      title: tagText(block, "title"),
      publishedAt: tagText(block, "published"),
      description: tagText(block, "media:description"),
      url: `https://www.youtube.com/watch?v=${id}`,
    });
  }
  return entries;
}

// 채널 ID(UC…)에서 '쇼츠를 뺀 업로드' 재생목록 ID(UULF…)를 만든다.
export function longFormPlaylistId(channelId) {
  if (!CHANNEL_ID.test(channelId)) throw new Error(`채널 ID 형식이 올바르지 않습니다: ${channelId}`);
  return `UULF${channelId.slice(2)}`;
}

// 채널 페이지에는 다른 채널의 UC… 값도 많이 들어 있다(추천·가이드 목록 등).
// 이 채널을 가리키는 표시를 우선순위대로 찾고, 범용 browseId 는 쓰지 않는다.
export function extractChannelId(html) {
  const text = String(html);
  const patterns = [
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
    /<meta itemprop="(?:identifier|channelId)" content="(UC[\w-]{22})"/,
    /"externalId":"(UC[\w-]{22})"/,
    /"channelUrl":"https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
    /"canonicalBaseUrl":"\/@[\w.-]+","[^}]{0,400}?"channelId":"(UC[\w-]{22})"/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// 영상 설명의 첫 문단만, 링크와 해시태그를 빼고 길이를 줄여 홈페이지 설명으로 쓴다.
export function summarizeDescription(description, limit = 150) {
  const paragraph =
    String(description)
      .split(/\r?\n\s*\r?\n/)
      .map((part) =>
        part
          .replace(/https?:\/\/\S+/g, "")
          .replace(/(^|\s)#\S+/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .find((part) => part.length >= 20) ?? "";
  if (paragraph.length <= limit) return paragraph;
  const cut = paragraph.slice(0, limit);
  const sentenceEnd = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("다. "), cut.lastIndexOf("요. "));
  const base = sentenceEnd > limit * 0.5 ? cut.slice(0, sentenceEnd + 2) : cut.replace(/\s+\S*$/, "");
  return `${base.trim().replace(/[,\s]+$/, "")}…`;
}

function fetchText(fetchImpl, url, options = {}) {
  return fetchImpl(url, { headers: FETCH_HEADERS, ...options });
}

async function isShort(fetchImpl, id) {
  // 쇼츠 주소는 200 으로 열리고, 일반 영상은 watch 주소로 넘겨진다(3xx).
  const response = await fetchText(fetchImpl, `https://www.youtube.com/shorts/${id}`, {
    method: "HEAD",
    redirect: "manual",
  });
  return response.status === 200;
}

export async function resolveChannelId({ fetchImpl = fetch, channelId, handle = CHANNEL_HANDLE } = {}) {
  if (channelId) {
    longFormPlaylistId(channelId); // 형식 검사
    return channelId;
  }
  const response = await fetchText(fetchImpl, `https://www.youtube.com/@${handle}`);
  if (!response.ok) throw new Error(`채널 페이지를 열지 못했습니다 (${response.status})`);
  const found = extractChannelId(await response.text());
  if (!found) {
    throw new Error("채널 ID 를 찾지 못했습니다. 저장소 Variables 에 YOUTUBE_CHANNEL_ID 를 넣어 주세요.");
  }
  return found;
}

// 가장 최근에 올라온 일반(쇼츠 아님) 공개 영상 하나.
export async function fetchLatestVideo({ fetchImpl = fetch, channelId }) {
  const playlist = await fetchText(
    fetchImpl,
    `https://www.youtube.com/feeds/videos.xml?playlist_id=${longFormPlaylistId(channelId)}`,
  );
  if (playlist.ok) {
    const [latest] = parseFeed(await playlist.text());
    if (latest) return latest;
  }
  console.error(`롱폼 재생목록 피드를 쓸 수 없습니다 (채널 ${channelId}, 응답 ${playlist.status}). 채널 피드로 넘어갑니다.`);

  // 롱폼 재생목록을 읽지 못하면 채널 피드에서 쇼츠를 걸러 낸다.
  const feed = await fetchText(
    fetchImpl,
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
  );
  if (!feed.ok) {
    throw new Error(
      `유튜브 피드를 읽지 못했습니다 (채널 ${channelId}, 재생목록 ${playlist.status}, 채널 피드 ${feed.status}). ` +
        "채널 ID 가 맞는지 확인하고 틀리면 Variables 의 YOUTUBE_CHANNEL_ID 에 직접 넣어 주세요.",
    );
  }
  for (const entry of parseFeed(await feed.text()).slice(0, 8)) {
    if (!(await isShort(fetchImpl, entry.id))) return entry;
  }
  throw new Error("채널 피드에 공개된 일반 영상이 없습니다.");
}

export function renderVideoBlock(video, lang = "ko") {
  if (!VIDEO_ID.test(video.id)) throw new Error(`영상 ID 형식이 올바르지 않습니다: ${video.id}`);
  const copy = COPY[lang];
  const english = lang === "en";
  const title = english ? (video.en?.title ?? copy.fallbackTitle) : video.title;
  const desc = english
    ? (video.en?.description ?? copy.fallbackDesc)
    : summarizeDescription(video.description) || copy.fallbackDesc;
  const frameTitle = `${title} — ${copy.channelTitle}`;
  return `<div class="media media--video">
          <div class="media__video">
            <iframe src="https://www.youtube-nocookie.com/embed/${video.id}?rel=0" title="${escapeHtml(frameTitle)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
          </div>
          <div class="media__body">
            <div class="media__type">${copy.type}</div>
            <div class="media__title">${escapeHtml(title)}</div>
            <div class="media__desc">${escapeHtml(desc)}</div>
            <a class="media__source" href="${CHANNEL_URL}" target="_blank" rel="noopener">${copy.source}</a>
          </div>
        </div>`;
}

export function currentVideoId(html) {
  const range = blockRange(html);
  if (!range) return null;
  const match = html.slice(range[0], range[1]).match(/youtube-nocookie\.com\/embed\/([\w-]{11})/);
  return match ? match[1] : null;
}

function blockRange(html) {
  const startIndex = html.indexOf(START);
  const endIndex = html.indexOf(END);
  if (startIndex < 0 || endIndex <= startIndex) return null;
  return [startIndex + START.length, endIndex];
}

// 표시(YOUTUBE_LATEST_START/END)가 없는 페이지는 그대로 둔다.
export function replaceVideoBlock(html, video, lang = "ko") {
  const range = blockRange(html);
  if (!range) return html;
  return `${html.slice(0, range[0])}\n        ${renderVideoBlock(video, lang)}\n        ${html.slice(range[1])}`;
}
