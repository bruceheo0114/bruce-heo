import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import {
  currentVideoId,
  extractChannelId,
  fetchLatestVideo,
  longFormPlaylistId,
  parseFeed,
  renderVideoBlock,
  replaceVideoBlock,
  resolveChannelId,
  summarizeDescription,
} from "../src/youtube/latest.js";

const CHANNEL = "UCabcdefghijklmnopqrstuv";
const feed = (...ids) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <title>브루스 인사이트</title>
${ids
  .map(
    (id, index) => `  <entry>
    <id>yt:video:${id}</id>
    <yt:videoId>${id}</yt:videoId>
    <title>영상 ${index} &amp; &lt;제목&gt;</title>
    <published>2026-10-0${index + 1}T09:00:00+00:00</published>
    <media:group>
      <media:description>첫 문단은 영상 소개입니다. 스크롤하지 않아도 보이는 요약이에요.

00:00 인트로
https://example.com/link</media:description>
    </media:group>
  </entry>`,
  )
  .join("\n")}
</feed>`;

const response = (status, body = "") => ({ ok: status >= 200 && status < 300, status, text: async () => body });

test("피드에서 영상 목록을 읽고 HTML 엔티티를 풀어 준다", () => {
  const [first, second] = parseFeed(feed("AAAAAAAAAAA", "BBBBBBBBBBB"));
  assert.equal(first.id, "AAAAAAAAAAA");
  assert.equal(first.title, "영상 0 & <제목>");
  assert.equal(first.url, "https://www.youtube.com/watch?v=AAAAAAAAAAA");
  assert.equal(second.publishedAt, "2026-10-02T09:00:00+00:00");
  assert.match(first.description, /^첫 문단은/);
  assert.deepEqual(parseFeed("<feed></feed>"), []);
});

test("영상 ID 형식이 아닌 항목은 버린다", () => {
  assert.equal(parseFeed(feed("short")).length, 0);
});

test("채널 ID 로 쇼츠를 뺀 재생목록 ID 를 만든다", () => {
  assert.equal(longFormPlaylistId(CHANNEL), "UULFabcdefghijklmnopqrstuv");
  assert.throws(() => longFormPlaylistId("not-a-channel"));
});

test("채널 페이지에서 채널 ID 를 찾는다", () => {
  assert.equal(extractChannelId(`..."channelId":"${CHANNEL}","x"...`), CHANNEL);
  assert.equal(extractChannelId(`<link rel="canonical" href="https://www.youtube.com/channel/${CHANNEL}">`), CHANNEL);
  assert.equal(extractChannelId("<html></html>"), null);
});

test("영상 설명은 첫 문단만, 링크 없이 짧게 줄인다", () => {
  assert.equal(
    summarizeDescription("첫 문단은 영상 소개입니다. 요약이에요.\n\n00:00 인트로\nhttps://example.com"),
    "첫 문단은 영상 소개입니다. 요약이에요.",
  );
  const long = `${"가나다라마바사 ".repeat(40)}`;
  const short = summarizeDescription(long, 60);
  assert.ok(short.length <= 62 && short.endsWith("…"));
  assert.equal(summarizeDescription("#해시태그 https://a.b"), "");
});

test("한국어 카드는 안전한 HTML 로, 영문 카드는 한글 없이 렌더링한다", () => {
  const video = { id: "AAAAAAAAAAA", title: '제목 <b>"x"</b>', description: "영상 소개 문단입니다. 길이가 충분한 문장." };
  const ko = renderVideoBlock(video, "ko");
  assert.match(ko, /embed\/AAAAAAAAAAA\?rel=0/);
  assert.match(ko, /제목 &lt;b&gt;&quot;x&quot;&lt;\/b&gt;/);
  assert.doesNotMatch(ko, /<b>/);
  const en = renderVideoBlock(video, "en");
  assert.doesNotMatch(en, /[가-힣]/);
  assert.match(en, /embed\/AAAAAAAAAAA/);
  const custom = renderVideoBlock({ ...video, en: { title: "Custom", description: "Desc" } }, "en");
  assert.match(custom, /<div class="media__title">Custom<\/div>/);
  assert.throws(() => renderVideoBlock({ ...video, id: '"><script>' }));
});

test("자동 구간만 바꾸고 같은 영상으로는 같은 결과를 낸다", () => {
  const video = { id: "AAAAAAAAAAA", title: "새 영상", description: "" };
  const page = `앞<!-- YOUTUBE_LATEST_START -->\n        <div>예전 <iframe src="https://www.youtube-nocookie.com/embed/ZZZZZZZZZZZ?rel=0"></iframe></div>\n        <!-- YOUTUBE_LATEST_END -->뒤`;
  assert.equal(currentVideoId(page), "ZZZZZZZZZZZ");
  const once = replaceVideoBlock(page, video, "ko");
  assert.ok(once.startsWith("앞") && once.endsWith("뒤"));
  assert.equal(currentVideoId(once), "AAAAAAAAAAA");
  assert.equal(replaceVideoBlock(once, video, "ko"), once);
  assert.equal(replaceVideoBlock("표시 없음", video, "ko"), "표시 없음");
});

test("홈페이지(한국어·영문)에 자동 교체 표시가 하나씩 있고 영문에는 한글이 없다", async () => {
  for (const [file, lang] of [
    ["index.html", "ko"],
    ["en/index.html", "en"],
  ]) {
    const html = await readFile(file, "utf8");
    assert.equal(html.split("<!-- YOUTUBE_LATEST_START -->").length, 2, file);
    assert.equal(html.split("<!-- YOUTUBE_LATEST_END -->").length, 2, file);
    const id = currentVideoId(html);
    assert.match(id, /^[\w-]{11}$/);
    // 지금 들어 있는 영상을 같은 방식으로 다시 렌더링해도 페이지 구조가 깨지지 않는다.
    const rerendered = replaceVideoBlock(html, { id: "AAAAAAAAAAA", title: "t", description: "" }, lang);
    assert.equal(currentVideoId(rerendered), "AAAAAAAAAAA");
    assert.equal((rerendered.match(/class="media media--video"/g) ?? []).length, 1, file);
    if (lang === "en") {
      const english = rerendered.slice(rerendered.indexOf("<!-- YOUTUBE_LATEST_START -->"), rerendered.indexOf("<!-- YOUTUBE_LATEST_END -->"));
      assert.doesNotMatch(english, /[가-힣]/);
    }
  }
});

test("롱폼 재생목록의 첫 영상을 최신 영상으로 쓴다", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return response(200, feed("AAAAAAAAAAA", "BBBBBBBBBBB"));
  };
  const latest = await fetchLatestVideo({ fetchImpl, channelId: CHANNEL });
  assert.equal(latest.id, "AAAAAAAAAAA");
  assert.match(urls[0], /playlist_id=UULFabcdefghijklmnopqrstuv/);
});

test("롱폼 재생목록이 없으면 채널 피드에서 쇼츠를 건너뛴다", async () => {
  const shorts = new Set(["AAAAAAAAAAA"]);
  const fetchImpl = async (url, options = {}) => {
    if (url.includes("playlist_id=")) return response(404);
    if (url.includes("channel_id=")) return response(200, feed("AAAAAAAAAAA", "BBBBBBBBBBB"));
    assert.equal(options.method, "HEAD");
    return response(shorts.has(url.split("/").pop()) ? 200 : 303);
  };
  const latest = await fetchLatestVideo({ fetchImpl, channelId: CHANNEL });
  assert.equal(latest.id, "BBBBBBBBBBB");
});

test("피드를 읽지 못하면 오류로 멈춘다(홈페이지를 건드리지 않는다)", async () => {
  await assert.rejects(fetchLatestVideo({ fetchImpl: async () => response(500), channelId: CHANNEL }), /피드/);
});

test("채널 ID 는 지정값 → 채널 페이지 순서로 찾는다", async () => {
  assert.equal(await resolveChannelId({ channelId: CHANNEL, fetchImpl: async () => assert.fail("호출 안 됨") }), CHANNEL);
  const found = await resolveChannelId({ fetchImpl: async () => response(200, `"channelId":"${CHANNEL}"`) });
  assert.equal(found, CHANNEL);
  await assert.rejects(resolveChannelId({ fetchImpl: async () => response(200, "<html/>") }), /YOUTUBE_CHANNEL_ID/);
});

test("유튜브 최신 영상 워크플로는 매시간 돌고 바뀐 파일만 커밋한다", async () => {
  const text = await readFile(".github/workflows/youtube-latest.yml", "utf8");
  const workflow = parse(text);
  assert.ok(workflow.on.workflow_dispatch !== undefined);
  assert.equal(workflow.on.schedule[0].cron, "37 * * * *");
  assert.equal(workflow.permissions.contents, "write");
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.match(text, /node src\/cli\/youtube-latest\.js/);
  assert.match(text, /git add index\.html en\/index\.html data\/youtube-latest\.json/);
});
