import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import {
  currentVideoId,
  extractChannelId,
  fetchLatestVideo,
  assertChannelId,
  extractJsonAfter,
  parseChannelVideosPage,
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

test("채널 ID 형식을 검사한다", () => {
  assert.equal(assertChannelId(CHANNEL), CHANNEL);
  assert.throws(() => assertChannelId("not-a-channel"));
});

test("채널 페이지에서 이 채널의 ID 를 찾고 다른 채널 값에는 속지 않는다", () => {
  const OTHER = "UCzzzzzzzzzzzzzzzzzzzzzz";
  const canonical = `<link rel="canonical" href="https://www.youtube.com/channel/${CHANNEL}">`;
  // 추천·가이드 목록의 browseId/channelId 가 먼저 나와도 이 채널 표시를 우선한다.
  assert.equal(extractChannelId(`"browseId":"${OTHER}","channelId":"${OTHER}" ${canonical}`), CHANNEL);
  assert.equal(extractChannelId(`"browseId":"${OTHER}" "externalId":"${CHANNEL}"`), CHANNEL);
  assert.equal(extractChannelId(`<meta itemprop="identifier" content="${CHANNEL}">`), CHANNEL);
  assert.equal(extractChannelId(`"browseId":"${OTHER}","channelId":"${OTHER}"`), null);
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

const noSleep = async () => {};

const lockup = (id, text) => ({
  richItemRenderer: {
    content: {
      lockupViewModel: {
        contentId: id,
        contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
        metadata: { lockupMetadataViewModel: { title: { content: text } } },
      },
    },
  },
});

// 유튜브의 새 화면(lockupViewModel) 모양. 스크립트 앞에 marker 만 언급하는 코드가 있어도 읽어야 한다.
const channelPage = (...ids) =>
  `<html><script>if (window.ytInitialData) { run(); }</script><script>var ytInitialData = ${JSON.stringify({
    contents: { tabs: [{ items: ids.map((id, index) => lockup(id, `동영상 ${index}`)) }] },
  })};</script></html>`;

test("채널 피드의 첫 일반 영상을 최신 영상으로 쓴다", async () => {
  const urls = [];
  const fetchImpl = async (url, options = {}) => {
    urls.push(url);
    if (url.includes("channel_id=")) return response(200, feed("AAAAAAAAAAA", "BBBBBBBBBBB"));
    assert.equal(options.method, "HEAD");
    return response(303);
  };
  const latest = await fetchLatestVideo({ fetchImpl, channelId: CHANNEL, sleep: noSleep });
  assert.equal(latest.id, "AAAAAAAAAAA");
  assert.match(urls[0], /channel_id=UCabcdefghijklmnopqrstuv/);
});

test("쇼츠는 건너뛴다", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("channel_id=")) return response(200, feed("AAAAAAAAAAA", "BBBBBBBBBBB"));
    return response(url.endsWith("/AAAAAAAAAAA") ? 200 : 303);
  };
  const latest = await fetchLatestVideo({ fetchImpl, channelId: CHANNEL, sleep: noSleep });
  assert.equal(latest.id, "BBBBBBBBBBB");
});

test("피드가 가끔 500 이어도 다시 시도해서 받는다", async () => {
  let calls = 0;
  const waits = [];
  const fetchImpl = async (url) => {
    if (url.includes("channel_id=")) {
      calls += 1;
      return calls < 3 ? response(500) : response(200, feed("AAAAAAAAAAA"));
    }
    return response(303);
  };
  const latest = await fetchLatestVideo({ fetchImpl, channelId: CHANNEL, sleep: async (ms) => waits.push(ms) });
  assert.equal(latest.id, "AAAAAAAAAAA");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [2000, 5000]);
});

test("RSS 가 계속 막히면 채널 동영상 탭과 영상 페이지에서 읽는다", async () => {
  const watchPage = `<meta property="og:description" content="영상 설명 첫 문단입니다. 충분히 긴 설명 &amp; 요약."><meta itemprop="datePublished" content="2026-10-14T09:00:00-07:00">`;
  const fetchImpl = async (url) => {
    if (url.includes("/feeds/")) return response(500);
    if (url.endsWith("/@bruce.insight/videos")) return response(200, channelPage("AAAAAAAAAAA", "BBBBBBBBBBB"));
    if (url.includes("watch?v=AAAAAAAAAAA")) return response(200, watchPage);
    return response(404);
  };
  const latest = await fetchLatestVideo({ fetchImpl, channelId: CHANNEL, sleep: noSleep });
  assert.equal(latest.id, "AAAAAAAAAAA");
  assert.equal(latest.title, "동영상 0");
  assert.equal(latest.description, "영상 설명 첫 문단입니다. 충분히 긴 설명 & 요약.");
  assert.equal(latest.publishedAt, "2026-10-14T09:00:00-07:00");
});

test("예전 화면(videoRenderer)도 읽고, 재생목록·중복은 건너뛴다", () => {
  const html = `<script>var ytInitialData = ${JSON.stringify({
    a: [
      { lockupViewModel: { contentId: "PLxxxxxxxxxxxxxxxxxx", contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST" } },
      { videoRenderer: { videoId: "AAAAAAAAAAA", title: { runs: [{ text: "예전 " }, { text: "화면" }] } } },
      { videoRenderer: { videoId: "AAAAAAAAAAA", title: { simpleText: "중복" } } },
      { videoRenderer: { videoId: "CCCCCCCCCCC", upcomingEventData: {}, title: { simpleText: "예정" } } },
    ],
  })};</script>`;
  assert.deepEqual(parseChannelVideosPage(html).map((v) => [v.id, v.title]), [["AAAAAAAAAAA", "예전 화면"]]);
});

test("영상 페이지가 사이트 공통 소개 문구만 주면 설명으로 쓰지 않는다", async () => {
  const generic = "YouTube에서 마음에 드는 동영상과 음악을 감상하고, 직접 만든 콘텐츠를 업로드하여 친구, 가족뿐 아니라 전 세계 사람들과 콘텐츠를 공유할 수 있습니다.";
  const fetchImpl = async (url) => {
    if (url.includes("/feeds/")) return response(404);
    if (url.endsWith("/videos")) return response(200, channelPage("AAAAAAAAAAA"));
    return response(200, `<meta name="description" content="${generic}"><meta property="og:description" content="${generic}">`);
  };
  const latest = await fetchLatestVideo({ fetchImpl, channelId: CHANNEL, sleep: noSleep });
  assert.equal(latest.description, "");
});

test("영상 페이지를 못 읽어도 제목만으로 계속한다", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/feeds/")) return response(404);
    if (url.endsWith("/videos")) return response(200, channelPage("AAAAAAAAAAA"));
    return response(500);
  };
  const latest = await fetchLatestVideo({ fetchImpl, channelId: CHANNEL, sleep: noSleep });
  assert.equal(latest.id, "AAAAAAAAAAA");
  assert.equal(latest.description, "");
});

test("JSON 안의 중괄호·따옴표가 있어도 잘라 읽는다", () => {
  const data = { a: 'x}"{y', b: [1, { c: "\\" }] };
  assert.deepEqual(extractJsonAfter(`junk ytInitialData = ${JSON.stringify(data)}; tail {`, "ytInitialData"), data);
  assert.equal(extractJsonAfter("nothing", "ytInitialData"), null);
  assert.deepEqual(parseChannelVideosPage("<html></html>"), []);
});

test("피드도 채널 페이지도 막히면 원인을 담아 오류로 멈춘다(홈페이지를 건드리지 않는다)", async () => {
  await assert.rejects(
    fetchLatestVideo({ fetchImpl: async () => response(500), channelId: CHANNEL, sleep: noSleep }),
    new RegExp(`${CHANNEL}.*RSS.*500.*채널 페이지`),
  );
});

test("채널 ID 는 지정값 → 채널 페이지 순서로 찾는다", async () => {
  assert.equal(await resolveChannelId({ channelId: CHANNEL, fetchImpl: async () => assert.fail("호출 안 됨") }), CHANNEL);
  const found = await resolveChannelId({ fetchImpl: async () => response(200, `"externalId":"${CHANNEL}"`) });
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
