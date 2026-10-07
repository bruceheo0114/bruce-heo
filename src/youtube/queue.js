import { readJson, writeJson } from "../lib/files.js";
import { RULES, youtubePaths } from "./config.js";

// 제작 순서. 사용자가 고른 글이 위에서부터 한 주에 한 편씩 Episode가 된다.
export async function loadQueue(paths = youtubePaths()) {
  return readJson(paths.queue, { _rule: "", items: [] });
}

export async function saveQueue(queue, paths = youtubePaths()) {
  await writeJson(paths.queue, queue);
}

/** 새로 발행된 글은 큐 맨 뒤에 todo로 붙인다. 영상화 여부는 제작 때 00_score.md로 판단한다. */
export function enqueueNew(queue, entries) {
  const known = new Set(queue.items.map((item) => String(item.no)));
  const added = [];
  for (const entry of entries) {
    if (known.has(String(entry.id))) continue;
    if (entry.publishedAt.slice(0, 10) < RULES.sourceSince) continue;
    const item = { no: Number(entry.id), title: entry.title, status: "todo", note: "새 글 — 제작 때 영상화 평가" };
    queue.items.push(item);
    added.push(item);
  }
  return added;
}

export function nextTodo(queue) {
  return queue.items.find((item) => item.status === "todo") ?? null;
}

const FRESH_DAYS = 7;
const WAITING = ["todo", "reserve"];

/**
 * 이번 주 제작할 글 (사용자 결정 2026-10-07).
 * 1) 최근 7일 안에 발행된 새 글(월요일 글) → 2) 큐의 todo → 3) 예비 글(reserve). 모두 큐 순서대로.
 */
export function pickNext(queue, index, now) {
  const since = now.valueOf() - FRESH_DAYS * 24 * 60 * 60 * 1000;
  const fresh = queue.items.find((item) => {
    const entry = index.articles[String(item.no)];
    return WAITING.includes(item.status) && entry && new Date(entry.publishedAt).valueOf() > since;
  });
  return fresh ?? nextTodo(queue) ?? queue.items.find((item) => item.status === "reserve") ?? null;
}
