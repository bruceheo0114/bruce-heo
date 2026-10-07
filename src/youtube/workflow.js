import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { STATUS, youtubePaths } from "./config.js";
import { pushHistory, readEpisodeFile, saveStatus } from "./episode.js";
import { findSection, formatDuration } from "./parse.js";
import { validatePackage } from "./validate.js";

const run = promisify(execFile);

const DEFAULT_SAVINGS = [
  "기준 이미지를 먼저 만들고 image-to-video로 움직임만 추가한다.",
  "같은 장소·분위기 Scene은 같은 reference asset을 재사용한다.",
  "REAL 자료가 확보되면 해당 AI Scene은 생성하지 않는다.",
  "승인된 Scene만 생성하고, 결과가 나쁘면 프롬프트를 고친 뒤 한 번만 다시 생성한다.",
];

/** Higgsfield 실행 전 사용자에게 보여줄 생성 계획. */
export function buildPlan(validation, higgsfieldText) {
  const { storyboard, higgsfield } = validation;
  const references = new Map();
  for (const scene of higgsfield?.scenes ?? []) {
    for (const ref of scene.reference.match(/\bREF\d+\b/g) ?? []) {
      references.set(ref, [...(references.get(ref) ?? []), scene.id]);
    }
  }
  const reusable = [...references.entries()]
    .filter(([, scenes]) => scenes.length > 1)
    .map(([ref, scenes]) => ({ reference: ref, scenes }));
  const savingsSection = findSection(higgsfieldText ?? "", "Cost Saving");
  const savings = savingsSection
    ? savingsSection.split(/\r?\n/).map((line) => line.replace(/^\s*[-*\d.)]+\s*/, "").trim()).filter(Boolean)
    : DEFAULT_SAVINGS;

  return {
    runtime_seconds: storyboard?.runtime ?? 0,
    runtime: formatDuration(storyboard?.runtime ?? 0),
    total_scenes: storyboard?.scenes.length ?? 0,
    scenes_by_type: storyboard?.countByType ?? {},
    seconds_by_type: storyboard?.durationByType ?? {},
    ai_share: storyboard?.runtime ? Number((storyboard.durationByType.AI / storyboard.runtime).toFixed(3)) : 0,
    ai_scenes: (higgsfield?.scenes ?? []).map((scene) => scene.id),
    estimated_generations: higgsfield?.estimatedGenerations ?? null,
    estimated_credits: higgsfield?.estimatedCredits ?? null,
    reusable_assets: reusable,
    cost_saving: savings,
  };
}

export function formatPlan(status) {
  const plan = status.plan;
  if (!plan) return `${status.episode}: 생성 계획이 아직 없습니다 (${status.status}).`;
  const types = plan.scenes_by_type;
  const lines = [
    `${status.episode} · ${status.article.title}`,
    `상태: ${status.status} / Higgsfield 생성 허용: ${status.higgsfield_generation ? "예" : "아니오"}`,
    "",
    `전체 예상 영상 길이   ${plan.runtime}`,
    `총 Scene              ${plan.total_scenes}`,
    `REAL Scene            ${types.REAL ?? 0}`,
    `TYPE Scene            ${types.TYPE ?? 0}`,
    `GRAPHIC Scene         ${types.GRAPHIC ?? 0}`,
    `AI Scene              ${types.AI ?? 0}  (화면 비중 ${(plan.ai_share * 100).toFixed(1)}%)`,
    `Higgsfield 예상 생성  ${plan.estimated_generations ?? "?"}회 · 약 ${plan.estimated_credits ?? "?"} 크레딧`,
    `AI Scene 목록         ${plan.ai_scenes.join(", ") || "없음"}`,
    `재사용 Asset          ${plan.reusable_assets.map((item) => `${item.reference}→${item.scenes.join("/")}`).join(", ") || "없음"}`,
    "비용 절약 방법",
    ...plan.cost_saving.map((line) => `  - ${line}`),
  ];
  if (status.approved_scenes?.length) lines.push("", `승인된 Scene: ${status.approved_scenes.join(", ")}`);
  return lines.join("\n");
}

/** Claude가 패키지를 쓴 뒤 호출한다. 검사를 통과해야만 다음 상태로 넘어간다. */
export async function finalizeEpisode(episode, now, paths = youtubePaths()) {
  const { status } = episode;
  if (status.status !== STATUS.PACKAGE_PENDING) {
    throw new Error(`${status.episode}는 PACKAGE_PENDING 상태가 아니라 확정할 수 없습니다 (${status.status}).`);
  }
  const validation = await validatePackage(episode, paths);
  if (validation.errors.length) return { ok: false, validation };

  const next = {
    MAKE_VIDEO: STATUS.WAITING_APPROVAL,
    SHORTS_ONLY: STATUS.SHORTS_ONLY,
    HOLD: STATUS.HOLD,
    SKIP: STATUS.SKIP,
  }[validation.recommendation];
  status.recommendation = validation.recommendation;
  status.video_potential = { ...validation.score.scores, TOTAL: validation.score.total, MAX: 60 };
  status.higgsfield_generation = false;
  status.approved_scenes = [];
  if (next === STATUS.WAITING_APPROVAL) {
    status.plan = buildPlan(validation, await readEpisodeFile(episode, "05_higgsfield.md"));
  }
  pushHistory(status, now, next, `영상화 평가 ${validation.score.total}/60 · ${validation.recommendation}`);
  await saveStatus(episode);
  return { ok: true, validation };
}

/** scenes가 비어 있으면 05_higgsfield.md의 모든 AI Scene을 승인한다. */
export async function approveEpisode(episode, scenes, now, paths = youtubePaths()) {
  const { status } = episode;
  if (![STATUS.WAITING_APPROVAL, STATUS.APPROVED, STATUS.ASSETS_READY].includes(status.status)) {
    throw new Error(`${status.episode}는 승인할 수 있는 상태가 아닙니다 (${status.status}).`);
  }
  const validation = await validatePackage(episode, paths);
  if (validation.errors.length) {
    throw new Error(`패키지 검사를 통과하지 못해 승인할 수 없습니다:\n- ${validation.errors.join("\n- ")}`);
  }
  const available = validation.higgsfield.scenes.map((scene) => scene.id);
  const requested = scenes.length ? scenes.map((scene) => normalizeSceneId(scene)) : available;
  const unknown = requested.filter((scene) => !available.includes(scene));
  if (unknown.length) throw new Error(`05_higgsfield.md에 없는 Scene입니다: ${unknown.join(", ")}`);
  if (!requested.length) throw new Error("승인할 AI Scene이 없습니다.");

  status.approved_scenes = [...new Set([...(status.approved_scenes ?? []), ...requested])].sort();
  status.higgsfield_generation = true;
  status.approved_at = now.toISOString();
  status.plan = buildPlan(validation, await readEpisodeFile(episode, "05_higgsfield.md"));
  pushHistory(status, now, STATUS.APPROVED, `Higgsfield 승인: ${requested.join(", ")}`);
  await saveStatus(episode);
  return requested;
}

export async function revokeApproval(episode, now) {
  const { status } = episode;
  if (status.status !== STATUS.APPROVED) {
    throw new Error(`${status.episode}는 APPROVED 상태가 아닙니다 (${status.status}).`);
  }
  status.higgsfield_generation = false;
  status.approved_scenes = [];
  pushHistory(status, now, STATUS.WAITING_APPROVAL, "Higgsfield 승인 취소");
  await saveStatus(episode);
}

export function normalizeSceneId(value) {
  const number = String(value).trim().match(/^S?(\d+)$/i)?.[1];
  if (!number) throw new Error(`Scene ID 형식이 아닙니다: ${value}`);
  return `S${number.padStart(3, "0")}`;
}

/** Higgsfield를 호출하기 직전에 반드시 확인한다. 이유가 있으면 생성하면 안 된다. */
export function generationBlocker(status, sceneId) {
  if (status.status !== STATUS.APPROVED) return `상태가 APPROVED가 아닙니다 (${status.status}).`;
  if (!status.higgsfield_generation) return "higgsfield_generation이 false입니다.";
  if (!status.approved_scenes?.includes(sceneId)) return `${sceneId}는 승인된 Scene이 아닙니다.`;
  if (status.generated?.[sceneId]) return `${sceneId}는 이미 생성되었습니다.`;
  return null;
}

export async function recordGeneration(episode, sceneId, details, now) {
  const { status } = episode;
  const blocker = generationBlocker(status, sceneId);
  if (blocker) throw new Error(blocker);
  status.generated = { ...(status.generated ?? {}), [sceneId]: { ...details, at: now.toISOString() } };
  status.updated_at = now.toISOString();
  if (status.approved_scenes.every((scene) => status.generated[scene])) {
    status.higgsfield_generation = false;
    pushHistory(status, now, STATUS.ASSETS_READY, "승인된 AI Scene 생성 완료");
  }
  await saveStatus(episode);
}

/** 자동 실행이 대상 Episode 밖의 제작물을 바꾸지 않았는지 git으로 확인한다. */
export async function guardChanges(episode, paths = youtubePaths()) {
  const { stdout } = await run("git", ["status", "--porcelain", "--untracked-files=all", "--", paths.episodes]);
  const allowed = path.posix.join(paths.episodes.split(path.sep).join("/"), episode.name) + "/";
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^"|"$/g, "").split(" -> ").at(-1))
    .filter((file) => !file.startsWith(allowed));
}

export async function probeDuration(file) {
  try {
    const { stdout } = await run("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
    ]);
    const seconds = Number(stdout.trim());
    return Number.isFinite(seconds) ? seconds : null;
  } catch {
    return null;
  }
}

/**
 * 사용자가 직접 녹음한 내레이션(아이폰 m4a 등)을 등록한다. 오디오는 git에 올리지 않고 경로·길이만 기록한다.
 * 챕터별로 나눠 녹음했다면 여러 번 호출하면 된다.
 */
export async function recordNarration(episode, files, durations, now) {
  const { status } = episode;
  const takes = files.map((file, index) => ({
    file: file.split(path.sep).join("/"),
    seconds: durations[index],
    added_at: now.toISOString(),
  }));
  const existing = (status.narration?.takes ?? []).filter(
    (take) => !takes.some((next) => next.file === take.file),
  );
  const all = [...existing, ...takes];
  const total = all.every((take) => Number.isFinite(take.seconds))
    ? all.reduce((sum, take) => sum + take.seconds, 0)
    : null;
  status.narration = { takes: all, total_seconds: total, updated_at: now.toISOString() };
  status.updated_at = now.toISOString();
  await saveStatus(episode);

  const planned = status.plan?.runtime_seconds ?? null;
  const drift = total && planned ? (total - planned) / planned : null;
  return { total, planned, drift };
}
