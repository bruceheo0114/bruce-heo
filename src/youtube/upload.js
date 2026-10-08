// YouTube Data API로 완성 영상을 올린다.
// 인증은 환경 변수 YOUTUBE_CLIENT_ID · YOUTUBE_CLIENT_SECRET · YOUTUBE_REFRESH_TOKEN (클라우드 환경 설정에만 둔다).
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";

export const UPLOAD_ENV = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"];

export function uploadConfigured(env = process.env) {
  return UPLOAD_ENV.every((name) => env[name]);
}

/** render가 만든 upload.md에서 제목·설명·태그·합성 콘텐츠 여부를 읽는다. */
export function parseUploadKit(markdown) {
  const section = (title) => {
    const match = markdown.match(new RegExp(`^## ${title.replace(/[()]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, "m"));
    return match ? match[1].trim() : "";
  };
  const title = section("제목 (1순위)").split("\n")[0].trim();
  const description = (section("설명 (그대로 붙여넣기)").match(/```\n?([\s\S]*?)```/)?.[1] ?? "").trim();
  const tags = section("태그")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  // 복제 목소리·AI 이미지가 있으면 '예'로 신고한다
  const altered = /변경된 콘텐츠 표시:.*'예'/.test(markdown);
  if (!title) throw new Error("upload.md에서 제목을 찾지 못했습니다.");
  return { title: title.slice(0, 100), description: description.slice(0, 5000), tags, altered };
}

async function accessToken(env) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      refresh_token: env.YOUTUBE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`YouTube 인증 실패: ${body.error_description ?? body.error ?? response.status}`);
  return body.access_token;
}

/**
 * 영상 업로드(재개 가능 업로드) → 썸네일 지정. 결과 { videoId, url }.
 * privacy: public | unlisted | private. publishAt(ISO)을 주면 private로 올리고 그 시각에 공개된다.
 */
export async function uploadVideo({ file, thumbnail, kit, privacy = "public", publishAt = null, env = process.env, log = () => {} }) {
  if (!uploadConfigured(env)) throw new Error(`환경 변수 ${UPLOAD_ENV.join(", ")}가 없습니다.`);
  const token = await accessToken(env);
  const size = (await stat(file)).size;
  const metadata = {
    snippet: {
      title: kit.title,
      description: kit.description,
      tags: kit.tags,
      categoryId: "27", // Education
      defaultLanguage: "ko",
      defaultAudioLanguage: "ko",
    },
    status: {
      privacyStatus: publishAt ? "private" : privacy,
      ...(publishAt ? { publishAt } : {}),
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: kit.altered,
    },
  };
  const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify(metadata),
  });
  if (!start.ok) throw new Error(`업로드 시작 실패 ${start.status}: ${await start.text()}`);
  const location = start.headers.get("location");
  log(`업로드 중 ${(size / 1024 / 1024).toFixed(1)}MB`);
  const put = await fetch(location, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(size) },
    body: createReadStream(file),
    duplex: "half",
  });
  const video = await put.json();
  if (!put.ok) throw new Error(`업로드 실패 ${put.status}: ${JSON.stringify(video.error ?? video)}`);
  log(`업로드 완료 ${video.id} (${video.status?.privacyStatus})`);
  if (thumbnail) {
    const thumb = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${video.id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": thumbnail.endsWith(".png") ? "image/png" : "image/jpeg" },
      body: await readFile(thumbnail),
    });
    // 맞춤 썸네일은 채널 인증(전화번호)이 있어야 된다. 실패해도 영상은 그대로 둔다.
    log(thumb.ok ? "썸네일 지정" : `! 썸네일 지정 실패 ${thumb.status}: ${(await thumb.text()).slice(0, 200)}`);
  }
  return { videoId: video.id, url: `https://youtu.be/${video.id}`, privacy: video.status?.privacyStatus };
}
