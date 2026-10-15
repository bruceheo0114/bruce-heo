import { readFile } from "node:fs/promises";
import { readJson, writeFileAtomic, writeJson } from "../lib/files.js";
import {
  currentVideoId,
  fetchLatestVideo,
  replaceVideoBlock,
  resolveChannelId,
} from "../youtube/latest.js";

// 채널의 가장 새 일반 영상을 찾아 홈페이지(한국어·영문)의 영상 카드를 바꾼다.
// 바뀐 게 없으면 아무것도 쓰지 않는다. (GitHub Actions: youtube-latest.yml)
const STATE_PATH = "data/youtube-latest.json";
const PAGES = [
  { path: "index.html", lang: "ko" },
  { path: "en/index.html", lang: "en" },
];

const state = await readJson(STATE_PATH, {});
const channelId = await resolveChannelId({
  channelId: process.env.YOUTUBE_CHANNEL_ID || state.channelId,
});
const latest = await fetchLatestVideo({ channelId });

// 사람이 data/youtube-latest.json 의 video.en({title, description})에 영문 문구를 미리 넣어 두었다면 그 문구를 쓴다.
const video = {
  ...latest,
  ...(state.video?.id === latest.id && state.video.en ? { en: state.video.en } : {}),
};

// 홈페이지에 이미 이 영상이 있으면 손으로 다듬은 문구를 건드리지 않는다.
const changedPages = [];
for (const page of PAGES) {
  const html = await readFile(page.path, "utf8");
  if (currentVideoId(html) === video.id) continue;
  const next = replaceVideoBlock(html, video, page.lang);
  if (next === html) continue;
  await writeFileAtomic(page.path, next);
  changedPages.push(page.path);
}

const nextState = {
  channelId,
  video: {
    id: video.id,
    title: video.title,
    publishedAt: video.publishedAt,
    description: video.description,
    ...(video.en ? { en: video.en } : {}),
  },
};
if (JSON.stringify(nextState) !== JSON.stringify(state)) await writeJson(STATE_PATH, nextState);

console.log(
  changedPages.length
    ? `홈페이지 영상을 바꿨습니다: ${video.id} "${video.title}" → ${changedPages.join(", ")}`
    : `홈페이지 영상은 이미 최신입니다: ${video.id}`,
);
