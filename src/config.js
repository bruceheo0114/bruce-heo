export const CONFIG = Object.freeze({
  profileId: "heoboram",
  profileUrl: "https://brunch.co.kr/@heoboram",
  feedUrl: "https://brunch.co.kr/rss/@@2fCF",
  homepageLimit: 12,
  cardMin: 7,
  cardMax: 10,
  cardWidth: 1080,
  cardHeight: 1080,
  reviewThreshold: 3,
  firstPublishHourKst: 6,
  firstPublishMinuteKst: 30,
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
  video: {
    summaryLanguage: "ko",
    captionLanguage: "ko",
    summaryModel: process.env.OPENAI_VIDEO_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
    transcriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL ?? "gpt-4o-transcribe",
    chunkCharacters: 12_000,
    chunkOverlapCharacters: 600,
    maxChunks: 40,
    audioSegmentSeconds: 900,
    maxUploadBytes: 24 * 1024 * 1024,
  },
  fetchHeaders: {
    "user-agent":
      "Mozilla/5.0 (compatible; BruceInsightAutomation/1.0; +https://bruceheo0114.github.io/bruce-heo/)",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  },
});

export const PATHS = Object.freeze({
  state: "data/automation-state.json",
  posts: "data/brunch-posts.json",
  homepage: "index.html",
  content: "content",
  result: ".automation-result.json",
  prBody: ".automation-pr-body.md",
  videoContent: "content/video",
});
