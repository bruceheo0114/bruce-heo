import path from "node:path";

// 모든 YouTube 제작물은 bruce-youtube/ 아래에 모인다. 테스트는 YOUTUBE_ROOT로 임시 폴더를 쓴다.
export function youtubeRoot() {
  return process.env.YOUTUBE_ROOT ?? "bruce-youtube";
}

export function youtubePaths(root = youtubeRoot()) {
  return {
    root,
    sources: path.join(root, "source", "brunch"),
    sourceIndex: path.join(root, "source", "brunch", "index.json"),
    episodes: path.join(root, "episodes"),
    generated: path.join(root, "assets", "generated"),
    logs: path.join(root, "logs"),
  };
}

export const EPISODE_FILES = Object.freeze([
  "01_brief.md",
  "02_script.md",
  "03_storyboard.md",
  "04_assets.md",
  "05_higgsfield.md",
  "06_shorts.md",
]);

export const SCORE_FILE = "00_score.md";

export const STATUS = Object.freeze({
  PACKAGE_PENDING: "PACKAGE_PENDING",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  APPROVED: "APPROVED",
  ASSETS_READY: "ASSETS_READY",
  SHORTS_ONLY: "SHORTS_ONLY",
  HOLD: "HOLD",
  SKIP: "SKIP",
  UPDATE_AVAILABLE: "UPDATE_AVAILABLE",
});

export const RECOMMENDATIONS = Object.freeze(["MAKE_VIDEO", "SHORTS_ONLY", "HOLD", "SKIP"]);
export const SOURCE_TYPES = Object.freeze(["REAL", "TYPE", "GRAPHIC", "AI"]);

// 지침서의 제작 원칙을 숫자로 옮긴 값. 바꾸려면 여기만 고친다.
export const RULES = Object.freeze({
  runtimeMinSeconds: 20 * 60,
  runtimeMaxSeconds: 30 * 60,
  aiShareMax: 0.25,
  aiSceneMax: 10,
  aiSceneMinSeconds: 4,
  aiSceneMaxSeconds: 8,
  shortsMin: 3,
  shortsMax: 5,
  titleCandidates: 5,
  thumbnailCopies: 5,
  scriptMinChars: 6600,
  verbatimShareMax: 0.2,
  realShareMin: 0.3,
  // Starter 플랜 월 270 크레딧 중 릴스·카드뉴스 루틴 몫(월 약 15)을 빼고 주 1편 기준으로 나눈 상한
  creditBudgetPerEpisode: 50,
});
