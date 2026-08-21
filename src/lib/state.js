import { CONFIG, PATHS } from "../config.js";
import { readJson, writeJson } from "./files.js";

export function createInitialState() {
  return {
    version: 1,
    initialized: false,
    lastCheckedAt: null,
    lastCheckedCanonicalUrl: null,
    reviewSuccessCount: 0,
    mode: "review",
    articles: {},
  };
}

export function modeForReviewCount(count) {
  return count >= CONFIG.reviewThreshold ? "auto" : "review";
}

export async function loadState() {
  const state = await readJson(PATHS.state, createInitialState());
  if (!state.articles || typeof state.articles !== "object") {
    throw new Error("Invalid automation state: articles must be an object");
  }
  state.reviewSuccessCount ??= 0;
  state.mode = modeForReviewCount(state.reviewSuccessCount);
  return state;
}

export async function saveState(state) {
  state.mode = modeForReviewCount(state.reviewSuccessCount);
  await writeJson(PATHS.state, state);
}

export function channelState(status = "pending") {
  return {
    status,
    id: null,
    lastAttemptAt: null,
    error: null,
  };
}
