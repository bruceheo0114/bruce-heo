import { CONFIG, PATHS } from "../../config.js";
import { jsonRequest } from "../http.js";
import { resolveChannelId } from "./channel.js";
import { loadSeriesConfig } from "./series.js";
import { hasBinary } from "./ytdlp.js";
import { loadVideoState } from "./video-state.js";

const NOTION_API = "https://api.notion.com/v1";

export function formatReport(results) {
  const lines = results.map((result) => {
    const mark = { ok: "✅", warn: "⚠️ ", fail: "❌" }[result.level];
    const detail = result.detail ? `\n     ${result.detail}` : "";
    return `${mark} ${result.name}${detail}`;
  });
  const failed = results.filter((result) => result.level === "fail").length;
  const warned = results.filter((result) => result.level === "warn").length;
  lines.push(
    "",
    failed
      ? `${failed}개 항목을 고쳐야 자동화가 동작합니다.`
      : warned
        ? `필수 항목은 모두 통과했습니다. 경고 ${warned}개는 상황에 따라 확인하세요.`
        : "모든 항목을 통과했습니다.",
  );
  return lines.join("\n");
}

function notionHeaders() {
  return {
    authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "notion-version": process.env.NOTION_VERSION ?? "2022-06-28",
  };
}

async function checkNotion(results) {
  if (!process.env.NOTION_TOKEN) {
    results.push({
      level: "fail",
      name: "Notion 토큰",
      detail:
        "NOTION_TOKEN이 없습니다. https://www.notion.so/my-integrations 에서 만들어 Secret에 넣으세요.",
    });
    return;
  }
  try {
    const { body } = await jsonRequest("Notion", `${NOTION_API}/users/me`, {
      headers: notionHeaders(),
    });
    results.push({
      level: "ok",
      name: `Notion 토큰 (${body?.name ?? body?.bot?.owner?.type ?? "연결됨"})`,
    });
  } catch (error) {
    results.push({
      level: "fail",
      name: "Notion 토큰",
      detail: `토큰이 거부되었습니다: ${error.message.slice(0, 160)}`,
    });
    return;
  }

  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!databaseId) {
    results.push({
      level: process.env.NOTION_PARENT_PAGE_ID ? "ok" : "fail",
      name: "Notion 저장 위치",
      detail: process.env.NOTION_PARENT_PAGE_ID
        ? "NOTION_PARENT_PAGE_ID로 페이지 밑에 쌓습니다."
        : "NOTION_DATABASE_ID 또는 NOTION_PARENT_PAGE_ID 중 하나가 필요합니다.",
    });
    return;
  }

  try {
    const { body } = await jsonRequest(
      "Notion",
      `${NOTION_API}/databases/${databaseId}`,
      { headers: notionHeaders() },
    );
    const properties = Object.entries(body?.properties ?? {});
    const title = properties.find(([, value]) => value.type === "title");
    if (!title) {
      results.push({
        level: "fail",
        name: "Notion 데이터베이스",
        detail: "제목(title) 속성이 없습니다. 데이터베이스가 맞는지 확인하세요.",
      });
      return;
    }
    const optional = ["url", "date", "select"].filter((type) =>
      properties.some(([, value]) => value.type === type),
    );
    results.push({
      level: "ok",
      name: "Notion 데이터베이스 연결됨",
      detail: `제목 속성: ${title[0]}${optional.length ? ` · 함께 채울 속성 타입: ${optional.join(", ")}` : " · 나머지는 본문에만 씁니다"}`,
    });
  } catch (error) {
    const notFound = error.status === 404;
    results.push({
      level: "fail",
      name: "Notion 데이터베이스",
      detail: notFound
        ? "404입니다. 데이터베이스를 열고 ··· → 연결 → integration을 추가했는지 확인하세요. 토큰이 맞아도 이 연결이 없으면 404가 납니다."
        : error.message.slice(0, 160),
    });
  }
}

async function checkYouTube(results, config) {
  try {
    const state = await loadVideoState();
    const channelId = state.channelId ?? (await resolveChannelId(config.channelSeed));
    results.push({ level: "ok", name: `YouTube 채널 확인됨 (${channelId})` });
  } catch (error) {
    results.push({
      level: "fail",
      name: "YouTube 접근",
      detail: `${error.message.slice(0, 200)}\n     봇 차단이면 YOUTUBE_COOKIES를 넣으세요.`,
    });
  }
}


/** 설정이 실제로 동작하는 상태인지 하나씩 확인한다. */
export async function runChecks() {
  const results = [];
  const config = await loadSeriesConfig(PATHS.videoSeries);

  results.push({
    level: process.env.OPENAI_API_KEY ? "ok" : "fail",
    name: "OpenAI 키",
    detail: process.env.OPENAI_API_KEY
      ? `요약 모델: ${CONFIG.video.summaryModel}`
      : "OPENAI_API_KEY가 없습니다.",
  });

  await checkNotion(results);
  await checkYouTube(results, config);

  const ytDlpAvailable = await hasBinary("yt-dlp");
  results.push({
    level: ytDlpAvailable ? "ok" : "warn",
    name: "yt-dlp",
    detail: ytDlpAvailable
      ? null
      : "없어도 동작하지만, YouTube가 봇 차단을 걸면 자막을 못 받습니다.",
  });

  results.push({
    level: process.env.YOUTUBE_COOKIES_FILE ? "ok" : "warn",
    name: "YouTube 쿠키",
    detail: process.env.YOUTUBE_COOKIES_FILE
      ? null
      : "비공개 영상(수요 성경대학)과 봇 차단 회피에 필요합니다.",
  });

  results.push({
    level: "ok",
    name: `시리즈 ${config.series.length}개 · 방송 ${config.processAfterDays}일 뒤 처리 · ${config.retryDays}일까지 재시도`,
    detail: config.series.map((series) => `${series.label} → ${series.profile}`).join(" / "),
  });
  return results;
}
