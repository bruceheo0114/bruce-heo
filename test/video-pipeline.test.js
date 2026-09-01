import assert from "node:assert/strict";
import test from "node:test";
import { parseChannelFeed } from "../src/lib/video/channel.js";
import { classifyVideo, findSeries } from "../src/lib/video/series.js";
import {
  buildNotionBlocks,
  buildProperties,
  notionTarget,
} from "../src/publish/notion.js";
import {
  createEntry,
  isExpired,
  readyAt,
  selectDueVideos,
} from "../src/lib/video/video-state.js";

const config = {
  processAfterDays: 2,
  retryDays: 7,
  series: [
    {
      id: "sunday-service",
      label: "주일 예배",
      profile: "sermon",
      titlePatterns: ["주일", "\\d+부\\s*예배"],
      weekdayKst: 0,
      processAfterDays: 2,
    },
    {
      id: "wednesday-bible",
      label: "수요 성경대학",
      profile: "lecture",
      titlePatterns: ["수요", "성경\\s*대학"],
      weekdayKst: 3,
      manualOnly: true,
      processAfterDays: 2,
    },
  ],
};

test("제목으로 시리즈를 가르고, 제목이 애매하면 KST 요일로 판단한다", () => {
  const sunday = classifyVideo(config, {
    title: "2026-09-06 주일 2부 예배",
    publishedAt: "2026-09-06T02:00:00Z",
  });
  assert.equal(sunday.series.id, "sunday-service");
  assert.equal(sunday.matchedBy, "title");

  const wednesday = classifyVideo(config, {
    title: "수요 성경대학 12강",
    publishedAt: "2026-09-02T11:00:00Z",
  });
  assert.equal(wednesday.series.id, "wednesday-bible");

  // 제목에 단서가 없어도 KST 일요일이면 주일 예배로 본다.
  const byWeekday = classifyVideo(config, {
    title: "9월 첫째 주 실황",
    publishedAt: "2026-09-06T02:00:00Z",
  });
  assert.equal(byWeekday.series.id, "sunday-service");
  assert.equal(byWeekday.matchedBy, "weekday");

  // KST 변환이 UTC 날짜와 갈리는 경계를 확인한다. UTC 토요일 저녁 = KST 일요일 새벽.
  const boundary = classifyVideo(config, {
    title: "특별 집회",
    publishedAt: "2026-09-05T16:00:00Z",
  });
  assert.equal(boundary.series.id, "sunday-service");

  assert.equal(classifyVideo(config, { title: "찬양 연습", publishedAt: "2026-09-04T02:00:00Z" }), null);
  assert.equal(findSeries(config, "wednesday-bible").manualOnly, true);
});

test("채널 RSS에서 영상 목록을 읽는다", () => {
  const xml = `<?xml version="1.0"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <yt:videoId>AKdwQeu7Ed4</yt:videoId>
    <title>주일 2부 예배</title>
    <published>2026-08-30T02:00:00+00:00</published>
  </entry>
  <entry>
    <yt:videoId>BKdwQeu7Ed5</yt:videoId>
    <title>수요 성경대학 11강</title>
    <published>2026-08-26T11:00:00+00:00</published>
  </entry>
</feed>`;
  const videos = parseChannelFeed(xml);
  assert.equal(videos.length, 2);
  assert.deepEqual(videos[0], {
    id: "AKdwQeu7Ed4",
    url: "https://www.youtube.com/watch?v=AKdwQeu7Ed4",
    title: "주일 2부 예배",
    publishedAt: "2026-08-30T02:00:00+00:00",
  });
});

function entryFor(overrides = {}) {
  const match = { series: config.series[0], matchedBy: "title" };
  return {
    ...createEntry(
      {
        id: "AKdwQeu7Ed4",
        url: "https://www.youtube.com/watch?v=AKdwQeu7Ed4",
        title: "주일 2부 예배",
        publishedAt: "2026-09-06T02:00:00Z",
      },
      match,
      { now: "2026-09-06T03:00:00Z" },
    ),
    ...overrides,
  };
}

test("라이브 이틀 뒤부터 처리 대상이 된다", () => {
  const entry = entryFor();
  assert.equal(readyAt(config, entry).toISOString(), "2026-09-08T02:00:00.000Z");

  const state = { videos: { [entry.id]: entry } };
  assert.equal(selectDueVideos(config, state, new Date("2026-09-07T23:00:00Z")).length, 0);
  assert.equal(selectDueVideos(config, state, new Date("2026-09-08T03:00:00Z")).length, 1);
});

test("자막을 기다리는 항목은 재시도하고, 마감이 지나면 실패로 접는다", () => {
  const waiting = entryFor({ status: "pending_captions", attempts: 3 });
  const state = { videos: { [waiting.id]: waiting } };
  assert.equal(selectDueVideos(config, state, new Date("2026-09-09T03:00:00Z")).length, 1);
  assert.equal(isExpired(config, waiting, new Date("2026-09-09T03:00:00Z")), false);
  assert.equal(isExpired(config, waiting, new Date("2026-09-14T03:00:00Z")), true);

  // 이미 끝났거나 접은 항목은 다시 집지 않는다.
  for (const status of ["published", "skipped", "failed"]) {
    const done = entryFor({ status });
    assert.equal(
      selectDueVideos(config, { videos: { [done.id]: done } }, new Date("2026-09-10T03:00:00Z"))
        .length,
      0,
      `${status}는 재처리 대상이 아니어야 합니다.`,
    );
  }
});

test("요약이 끝나고 Notion만 남은 항목은 다시 처리 대상에 오른다", () => {
  const summarized = entryFor({ status: "summarized", lastError: "Notion API 오류 (502)" });
  const due = selectDueVideos(config, { videos: { [summarized.id]: summarized } }, new Date("2026-09-09T03:00:00Z"));
  assert.equal(due.length, 1);
  assert.equal(due[0].status, "summarized");
});

const transcript = {
  videoId: "AKdwQeu7Ed4",
  url: "https://www.youtube.com/watch?v=AKdwQeu7Ed4",
  metadata: { title: "주일 2부 예배", channel: "교회" },
};

const summary = {
  title: "흔들리지 않는 기초",
  oneLine: "마태복음 7장을 본문으로 삶의 기초를 다룬 설교입니다.",
  durationSeconds: 3600,
  tldr: ["반석 위에 짓는다", "말씀을 듣고 행한다", "비는 누구에게나 온다"],
  chapters: [{ startSeconds: 0, title: "여는 말", summary: "본문을 읽습니다." }],
  keyPoints: [{ timestampSeconds: 600, point: "행함이 기초다", detail: "듣는 데서 그치지 않습니다." }],
  quotes: [{ timestampSeconds: 900, speaker: "목사님", text: "비는 누구에게나 내립니다." }],
  scriptures: [{ timestampSeconds: 120, reference: "마태복음 7:24-27", note: "본문으로 읽었습니다." }],
  actionItems: ["이번 주 들은 말씀 하나를 실제로 행하기"],
  openQuestions: [],
};

test("Notion 블록에 타임코드 링크와 체크박스가 들어간다", () => {
  const blocks = buildNotionBlocks(transcript, summary);
  const types = blocks.map((block) => block.type);
  assert.ok(types.includes("to_do"));
  assert.ok(types.includes("heading_2"));

  const headings = blocks
    .filter((block) => block.type === "heading_2")
    .map((block) => block.heading_2.rich_text[0].text.content);
  assert.deepEqual(headings, ["핵심 요약", "성경 본문", "흐름", "핵심 포인트", "인용", "적용"]);

  const scripture = blocks.find(
    (block) =>
      block.type === "bulleted_list_item" &&
      block.bulleted_list_item.rich_text.some((part) => part.text.content === "마태복음 7:24-27"),
  );
  assert.equal(
    scripture.bulleted_list_item.rich_text[0].text.link.url,
    "https://www.youtube.com/watch?v=AKdwQeu7Ed4&t=120s",
  );

  // 빈 배열인 항목은 제목만 남기지 않고 통째로 뺀다.
  assert.equal(headings.includes("남은 질문"), false);
});

test("Notion 속성은 데이터베이스에 실제로 있는 것만 채운다", () => {
  const entry = entryFor();
  const schema = {
    properties: {
      이름: { type: "title" },
      영상: { type: "url" },
      방송일: { type: "date" },
      시리즈: { type: "select" },
      담당자: { type: "people" },
    },
  };
  const properties = buildProperties(schema, entry, summary);
  assert.equal(properties["이름"].title[0].text.content, "흔들리지 않는 기초");
  assert.equal(properties["영상"].url, entry.url);
  assert.equal(properties["방송일"].date.start, "2026-09-06T02:00:00Z");
  assert.equal(properties["시리즈"].select.name, "주일 예배");
  assert.equal("담당자" in properties, false);

  // 제목 속성만 있는 최소 데이터베이스도 받아준다.
  const minimal = buildProperties({ properties: { Name: { type: "title" } } }, entry, summary);
  assert.deepEqual(Object.keys(minimal), ["Name"]);

  assert.throws(() => buildProperties({ properties: {} }, entry, summary), /title/);
});

test("Notion 목적지는 데이터베이스를 페이지보다 먼저 쓴다", () => {
  assert.deepEqual(notionTarget({ NOTION_DATABASE_ID: "db", NOTION_PARENT_PAGE_ID: "pg" }), {
    type: "database_id",
    id: "db",
  });
  assert.deepEqual(notionTarget({ NOTION_PARENT_PAGE_ID: "pg" }), {
    type: "page_id",
    id: "pg",
  });
  assert.throws(() => notionTarget({}), /NOTION_DATABASE_ID/);
});

test("저장소에 들어 있는 실제 시리즈 설정이 두 방송을 갈라낸다", async () => {
  const { loadSeriesConfig } = await import("../src/lib/video/series.js");
  const { resolveProfile } = await import("../src/lib/video/profiles.js");
  const shipped = await loadSeriesConfig("data/video-series.json");

  const cases = [
    ["2026년 9월 6일 주일 2부 예배", "sunday-service"],
    ["주일예배 | 흔들리지 않는 기초", "sunday-service"],
    ["수요 성경대학 12강", "wednesday-bible"],
    ["수요예배 및 성경대학", "wednesday-bible"],
    ["성경 대학 특강", "wednesday-bible"],
  ];
  for (const [title, expected] of cases) {
    const match = classifyVideo(shipped, { title, publishedAt: "2026-09-06T02:00:00Z" });
    assert.equal(match?.series.id, expected, `"${title}"은 ${expected}여야 합니다.`);
  }

  // 두 시리즈가 서로 다른 요약 프로필을 쓴다.
  const profiles = shipped.series.map((series) => series.profile);
  assert.deepEqual(profiles, ["lecture", "sermon"]);
  for (const profile of profiles) {
    assert.notEqual(resolveProfile(profile), resolveProfile("__missing__"));
  }
});

test("이름이 안 맞고 같은 타입이 여러 개면 어느 속성도 덮어쓰지 않는다", () => {
  const entry = entryFor();
  const ambiguous = {
    properties: {
      Name: { type: "title" },
      생성일: { type: "date" },
      수정일: { type: "date" },
      상태: { type: "select" },
      단계: { type: "select" },
    },
  };
  assert.deepEqual(Object.keys(buildProperties(ambiguous, entry, summary)), ["Name"]);

  // 이름이 맞으면 여러 개 중에서도 정확히 그 속성을 고른다.
  const named = {
    properties: {
      Name: { type: "title" },
      생성일: { type: "date" },
      방송일: { type: "date" },
    },
  };
  const properties = buildProperties(named, entry, summary);
  assert.equal(properties["방송일"].date.start, "2026-09-06T02:00:00Z");
  assert.equal("생성일" in properties, false);
});

test("설정 점검 결과는 고쳐야 할 항목 수를 알려준다", async () => {
  const { formatReport } = await import("../src/lib/video/setup-check.js");
  const report = formatReport([
    { level: "ok", name: "OpenAI 키" },
    { level: "fail", name: "Notion 토큰", detail: "NOTION_TOKEN이 없습니다." },
    { level: "warn", name: "yt-dlp" },
  ]);
  assert.match(report, /✅ OpenAI 키/);
  assert.match(report, /❌ Notion 토큰\n {5}NOTION_TOKEN이 없습니다\./);
  assert.match(report, /1개 항목을 고쳐야/);

  assert.match(
    formatReport([{ level: "ok", name: "전부" }]),
    /모든 항목을 통과했습니다/,
  );
  assert.match(
    formatReport([{ level: "warn", name: "쿠키" }]),
    /필수 항목은 모두 통과했습니다/,
  );
});
