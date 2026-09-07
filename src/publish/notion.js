import { jsonRequest, requireEnvironment } from "../lib/http.js";
import { formatTimestamp, timestampUrl } from "../lib/video/youtube.js";

const API = "https://api.notion.com/v1";
const MAX_BLOCKS_PER_REQUEST = 100;
const MAX_TEXT_LENGTH = 2000;

function headers() {
  requireEnvironment(["NOTION_TOKEN"]);
  return {
    authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "content-type": "application/json",
    "notion-version": process.env.NOTION_VERSION ?? "2022-06-28",
  };
}

export function notionTarget(env = process.env) {
  if (env.NOTION_DATABASE_ID) {
    return { type: "database_id", id: env.NOTION_DATABASE_ID };
  }
  if (env.NOTION_PARENT_PAGE_ID) {
    return { type: "page_id", id: env.NOTION_PARENT_PAGE_ID };
  }
  throw new Error(
    "NOTION_DATABASE_ID 또는 NOTION_PARENT_PAGE_ID 중 하나를 설정해야 합니다.",
  );
}

function clamp(text) {
  return String(text ?? "").slice(0, MAX_TEXT_LENGTH);
}

function text(content, annotations = {}) {
  return { type: "text", text: { content: clamp(content) }, annotations };
}

function linkText(content, url) {
  return { type: "text", text: { content: clamp(content), link: { url } } };
}

function stamp(videoId, seconds) {
  return linkText(formatTimestamp(seconds), timestampUrl(videoId, seconds));
}

function paragraph(richText) {
  return { object: "block", type: "paragraph", paragraph: { rich_text: richText } };
}

function heading(content) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: [text(content)] },
  };
}

function bullet(richText) {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: richText },
  };
}

function todo(content) {
  return {
    object: "block",
    type: "to_do",
    to_do: { rich_text: [text(content)], checked: false },
  };
}

function quote(richText) {
  return { object: "block", type: "quote", quote: { rich_text: richText } };
}

function group(title, blocks) {
  return blocks.length ? [heading(title), ...blocks] : [];
}

/** 요약 구조를 그대로 Notion 블록으로 옮긴다. 타임코드는 영상 링크가 된다. */
export function buildNotionBlocks(transcript, summary) {
  const videoId = transcript.videoId;
  const blocks = [
    quote([text(summary.oneLine)]),
    paragraph([
      text("원본 영상: "),
      linkText(transcript.metadata?.title ?? transcript.url, transcript.url),
      text(` · ${formatTimestamp(summary.durationSeconds)}`),
    ]),
  ];

  blocks.push(
    ...group(
      "핵심 요약",
      (summary.tldr ?? []).map((item) => bullet([text(item)])),
    ),
    ...group(
      "성경 본문",
      (summary.scriptures ?? []).map((item) =>
        bullet([
          stamp(videoId, item.timestampSeconds),
          text(" "),
          text(item.reference, { bold: true }),
          text(` — ${item.note}`),
        ]),
      ),
    ),
    ...group(
      "흐름",
      (summary.chapters ?? []).map((chapter) =>
        bullet([
          stamp(videoId, chapter.startSeconds),
          text(" "),
          text(chapter.title, { bold: true }),
          text(` — ${chapter.summary}`),
        ]),
      ),
    ),
    ...group(
      "핵심 포인트",
      (summary.keyPoints ?? []).map((point) =>
        bullet([
          stamp(videoId, point.timestampSeconds),
          text(" "),
          text(point.point, { bold: true }),
          text(` — ${point.detail}`),
        ]),
      ),
    ),
    ...group(
      "인용",
      (summary.quotes ?? []).map((item) =>
        quote([
          stamp(videoId, item.timestampSeconds),
          text(` “${item.text}”${item.speaker ? ` — ${item.speaker}` : ""}`),
        ]),
      ),
    ),
    ...group(
      "적용",
      (summary.actionItems ?? []).map((item) => todo(item)),
    ),
    ...group(
      "남은 질문",
      (summary.openQuestions ?? []).map((item) => bullet([text(item)])),
    ),
  );

  return blocks;
}

/**
 * 데이터베이스 스키마를 읽어 실제로 존재하는 속성에만 값을 넣는다.
 * 사용자가 만든 데이터베이스 모양을 강제하지 않기 위해서다.
 */
export function buildProperties(schema, entry, summary) {
  const properties = {};
  const definitions = Object.entries(schema?.properties ?? {});

  const titleEntry = definitions.find(([, value]) => value.type === "title");
  if (!titleEntry) {
    throw new Error("Notion 데이터베이스에 제목(title) 속성이 없습니다.");
  }
  properties[titleEntry[0]] = {
    title: [{ type: "text", text: { content: clamp(summary.title) } }],
  };

  /**
   * 이름이 맞는 속성을 먼저 찾고, 없으면 그 타입이 하나뿐일 때만 쓴다.
   * 이름도 안 맞는데 여러 개 있으면 어느 것을 덮어쓸지 알 수 없으므로 건드리지 않는다.
   */
  const byType = (type, hint) => {
    const sameType = definitions.filter(([, value]) => value.type === type);
    const named = hint && sameType.find(([name]) => hint.test(name));
    if (named) return named;
    return sameType.length === 1 ? sameType[0] : null;
  };

  const urlProperty = byType("url", /영상|주소|링크|url|link|video/iu);
  if (urlProperty) properties[urlProperty[0]] = { url: entry.url };

  const dateProperty = byType("date", /방송|날짜|일자|date|published/iu);
  if (dateProperty && entry.publishedAt) {
    properties[dateProperty[0]] = { date: { start: entry.publishedAt } };
  }

  const selectProperty = byType("select", /시리즈|series|구분|분류|category/iu);
  if (selectProperty && entry.seriesLabel) {
    properties[selectProperty[0]] = { select: { name: entry.seriesLabel } };
  }

  const multiSelectProperty = byType("multi_select", /시리즈|series|태그|tag/iu);
  if (!selectProperty && multiSelectProperty && entry.seriesLabel) {
    properties[multiSelectProperty[0]] = {
      multi_select: [{ name: entry.seriesLabel }],
    };
  }

  return properties;
}

async function fetchDatabaseSchema(databaseId) {
  const { body } = await jsonRequest("Notion", `${API}/databases/${databaseId}`, {
    headers: headers(),
  });
  return body;
}

async function appendBlocks(pageId, blocks) {
  for (let index = 0; index < blocks.length; index += MAX_BLOCKS_PER_REQUEST) {
    await jsonRequest("Notion", `${API}/blocks/${pageId}/children`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({
        children: blocks.slice(index, index + MAX_BLOCKS_PER_REQUEST),
      }),
    });
  }
}

/**
 * 요약 한 편을 Notion 페이지로 만든다.
 * 블록이 100개를 넘으면 첫 100개로 페이지를 만들고 나머지를 이어 붙인다.
 */
export async function publishToNotion(entry, transcript, summary, options = {}) {
  const target = options.target ?? notionTarget();
  const blocks = buildNotionBlocks(transcript, summary);

  const payload = { children: blocks.slice(0, MAX_BLOCKS_PER_REQUEST) };
  if (target.type === "database_id") {
    payload.parent = { database_id: target.id };
    const schema = options.schema ?? (await fetchDatabaseSchema(target.id));
    payload.properties = buildProperties(schema, entry, summary);
  } else {
    payload.parent = { page_id: target.id };
    payload.properties = {
      title: [{ type: "text", text: { content: clamp(summary.title) } }],
    };
  }

  const { body } = await jsonRequest("Notion", `${API}/pages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!body?.id) throw new Error("Notion 페이지 응답에 id가 없습니다.");

  await appendBlocks(body.id, blocks.slice(MAX_BLOCKS_PER_REQUEST));
  return { pageId: body.id, url: body.url ?? null };
}
