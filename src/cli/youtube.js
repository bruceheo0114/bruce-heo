import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchLatestArticles } from "../lib/brunch.js";
import { STATUS, youtubePaths } from "../youtube/config.js";
import { createEpisode, findEpisode, listEpisodes, markUpdateAvailable, resolveUpdate } from "../youtube/episode.js";
import { archiveArticles, loadLocalArticles, loadSourceIndex, saveSourceIndex } from "../youtube/source.js";
import { validatePackage } from "../youtube/validate.js";
import { formatDuration, parseTimecode } from "../youtube/parse.js";
import {
  approveEpisode,
  finalizeEpisode,
  formatPlan,
  generationBlocker,
  guardChanges,
  normalizeSceneId,
  probeDuration,
  recordGeneration,
  recordNarration,
  revokeApproval,
} from "../youtube/workflow.js";

const USAGE = `사용법: node src/cli/youtube.js <명령> [인자]

  sync [--local] [--limit N]     브런치 새 글 → source/brunch Markdown → 새 Episode
                                 --local: brunch.co.kr 대신 content/*/source.json 사용
  episode <글번호>                과거 글로 Episode를 직접 만든다
  pending [--weekly]              패키지가 필요한 Episode 폴더 (--weekly: 주 1편 상한)
  status [EP]                     Episode 상태 목록 또는 한 편의 상세
  validate <EP>                   제작 패키지 형식·원칙 검사
  finalize <EP>                   검사 통과 시 평가 결과대로 WAITING_APPROVAL/SHORTS_ONLY/HOLD/SKIP
  report <EP>                     Higgsfield 실행 전 생성 계획 보고
  approve <EP> [S003 S005 ...]    Higgsfield 생성 승인 (Scene 생략 시 전체 AI Scene)
  revoke <EP>                     승인 취소
  can-generate <EP> <Scene>       생성해도 되는지 확인 (안 되면 exit 1)
  record-generation <EP> <Scene> [--job ID] [--file 경로...]
  narration <EP> <파일...> [--duration mm:ss ...]
                                 직접 녹음한 내레이션 등록 (ffprobe가 없으면 --duration으로 길이 입력)
  resolve-update <EP> keep|regenerate
  guard <EP>                      대상 Episode 밖의 episodes/ 변경이 있으면 exit 1`;

const now = new Date(process.env.AUTOMATION_NOW ?? Date.now());
const paths = youtubePaths();
const [command, ...args] = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const values = [];
  for (let next = index + 1; next < args.length && !args[next].startsWith("--"); next += 1) {
    values.push(args[next]);
  }
  return values;
}

function positional() {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) {
      while (index + 1 < args.length && !args[index + 1].startsWith("--")) index += 1;
      continue;
    }
    values.push(args[index]);
  }
  return values;
}

async function log(level, message) {
  await mkdir(paths.logs, { recursive: true });
  const line = `${now.toISOString()} [${level}] ${command ?? "-"} ${message}\n`;
  await appendFile(path.join(paths.logs, `${now.toISOString().slice(0, 10)}.log`), line);
}

function printValidation(validation) {
  for (const error of validation.errors) console.log(`  ✗ ${error}`);
  for (const warning of validation.warnings) console.log(`  ! ${warning}`);
  if (!validation.errors.length) console.log(`  ✓ 검사 통과 (${validation.recommendation ?? "평가 없음"})`);
}

async function sync() {
  const limit = Number(option("--limit")?.[0] ?? 20);
  const articles = args.includes("--local") ? await loadLocalArticles() : await fetchLatestArticles(limit);
  const index = await loadSourceIndex(paths);
  const bootstrap = !index.initializedAt;
  const { added, changed } = await archiveArticles(index, articles, now, paths);

  const created = [];
  // 처음 실행 이전에 발행된 글은 원문으로만 보관한다. 지난 글은 `episode <글번호>`로 직접 만든다.
  const episodesFrom = new Date(index.initializedAt ?? now);
  if (!bootstrap) {
    for (const entry of added) {
      if (new Date(entry.publishedAt) < episodesFrom) continue;
      const { episode, created: isNew } = await createEpisode(entry, now, paths);
      entry.episode = episode.status.episode;
      if (isNew) created.push(episode);
    }
  }
  const updated = [];
  for (const entry of changed) {
    const episode = await markUpdateAvailable(entry, now, paths);
    if (episode) updated.push(episode);
  }
  index.initializedAt ??= now.toISOString();
  index.lastSyncedAt = now.toISOString();
  await saveSourceIndex(index, paths);

  console.log(`원문 ${articles.length}편 확인 · 새 원문 ${added.length} · 수정 ${changed.length}${bootstrap ? " (첫 실행: Episode 생성 생략)" : ""}`);
  for (const episode of created) console.log(`새 Episode ${episode.name} (PACKAGE_PENDING)`);
  for (const episode of updated) console.log(`원문 수정 → ${episode.name} UPDATE_AVAILABLE`);
  await log("INFO", `articles=${articles.length} added=${added.length} changed=${changed.length} episodes=${created.length}`);
}

async function episodeFromArticle() {
  const [articleId] = positional();
  const index = await loadSourceIndex(paths);
  const entry = index.articles[articleId];
  if (!entry) throw new Error(`source/brunch에 ${articleId}번 글이 없습니다. 먼저 sync를 실행하세요.`);
  const { episode, created } = await createEpisode(entry, now, paths);
  entry.episode = episode.status.episode;
  await saveSourceIndex(index, paths);
  console.log(created ? `새 Episode ${episode.name}` : `이미 있는 Episode ${episode.name} (${episode.status.status})`);
}

async function showStatus() {
  const [reference] = positional();
  if (reference) {
    const episode = await findEpisode(reference, paths);
    console.log(formatPlan(episode.status));
    if (episode.status.update) console.log(`\n원문 수정 감지: ${episode.status.update.detected_at}`);
    return;
  }
  const episodes = await listEpisodes(paths);
  if (!episodes.length) console.log("Episode가 없습니다.");
  for (const { name, status } of episodes) {
    const score = status.video_potential ? ` ${status.video_potential.TOTAL}/60` : "";
    console.log(`${name.padEnd(24)} ${status.status.padEnd(17)}${score}  ${status.article.title}`);
  }
}

const commands = {
  sync,
  episode: episodeFromArticle,
  status: showStatus,
  // --weekly: 최근 7일 안에 패키지를 만든 Episode가 있으면 아무것도 돌려주지 않는다 (주 1편 상한).
  async pending() {
    const episodes = await listEpisodes(paths);
    const pending = episodes.filter((episode) => episode.status.status === STATUS.PACKAGE_PENDING);
    if (args.includes("--weekly")) {
      const weekAgo = now.valueOf() - 7 * 24 * 60 * 60 * 1000;
      const recent = episodes.some((episode) =>
        (episode.status.history ?? []).some(
          (entry) => entry.from === STATUS.PACKAGE_PENDING && new Date(entry.at).valueOf() > weekAgo,
        ),
      );
      if (recent) return;
      pending.splice(1);
    }
    for (const episode of pending) console.log(episode.name);
  },
  async validate() {
    const episode = await findEpisode(positional()[0], paths);
    const validation = await validatePackage(episode, paths);
    console.log(episode.name);
    printValidation(validation);
    if (validation.errors.length) process.exitCode = 1;
  },
  async finalize() {
    const episode = await findEpisode(positional()[0], paths);
    const { ok, validation } = await finalizeEpisode(episode, now, paths);
    console.log(episode.name);
    printValidation(validation);
    if (!ok) {
      process.exitCode = 1;
      await log("ERROR", `${episode.name} 검사 실패: ${validation.errors.join(" | ")}`);
      return;
    }
    console.log(`→ ${episode.status.status}`);
    if (episode.status.plan) console.log(`\n${formatPlan(episode.status)}`);
    await log("INFO", `${episode.name} → ${episode.status.status}`);
  },
  async report() {
    console.log(formatPlan((await findEpisode(positional()[0], paths)).status));
  },
  async approve() {
    const [reference, ...scenes] = positional();
    const episode = await findEpisode(reference, paths);
    const approved = await approveEpisode(episode, scenes, now, paths);
    console.log(`${episode.name} APPROVED · 생성 허용 Scene: ${approved.join(", ")}`);
    console.log(`\n${formatPlan(episode.status)}`);
    await log("INFO", `${episode.name} approve ${approved.join(",")}`);
  },
  async revoke() {
    const episode = await findEpisode(positional()[0], paths);
    await revokeApproval(episode, now);
    console.log(`${episode.name} 승인 취소 → WAITING_APPROVAL`);
    await log("INFO", `${episode.name} revoke`);
  },
  async "can-generate"() {
    const [reference, scene] = positional();
    const episode = await findEpisode(reference, paths);
    const blocker = generationBlocker(episode.status, normalizeSceneId(scene));
    console.log(blocker ? `생성 불가: ${blocker}` : "생성 가능");
    if (blocker) process.exitCode = 1;
  },
  async "record-generation"() {
    const [reference, scene] = positional();
    const episode = await findEpisode(reference, paths);
    const sceneId = normalizeSceneId(scene);
    await recordGeneration(episode, sceneId, { job: option("--job")?.[0] ?? null, files: option("--file") ?? [] }, now);
    console.log(`${episode.name} ${sceneId} 생성 기록 → ${episode.status.status}`);
    await log("INFO", `${episode.name} generated ${sceneId}`);
  },
  async narration() {
    const [reference, ...files] = positional();
    if (!files.length) throw new Error("녹음 파일 경로를 하나 이상 적어 주세요.");
    const episode = await findEpisode(reference, paths);
    const manual = (option("--duration") ?? []).map(parseTimecode);
    const durations = [];
    for (const [index, file] of files.entries()) {
      durations.push(manual[index] ?? (await probeDuration(file)));
    }
    const { total, planned, drift } = await recordNarration(episode, files, durations, now);
    console.log(`${episode.name} 내레이션 ${files.length}개 등록 · 합계 ${total ? formatDuration(total) : "길이 미확인 (ffmpeg 설치 또는 --duration)"}`);
    if (drift !== null) {
      console.log(`스토리보드 ${formatDuration(planned)} 대비 ${(drift * 100).toFixed(1)}%`);
      if (Math.abs(drift) > 0.1) {
        console.log("! 10% 넘게 차이 납니다. Higgsfield 승인 전에 03_storyboard.md 타임코드를 녹음에 맞춰 다시 조정하세요.");
      }
    }
    await log("INFO", `${episode.name} narration ${files.length} total=${total}`);
  },
  async "resolve-update"() {
    const [reference, mode] = positional();
    const episode = await findEpisode(reference, paths);
    await resolveUpdate(episode, mode, now);
    console.log(`${episode.name} → ${episode.status.status}`);
    await log("INFO", `${episode.name} resolve-update ${mode}`);
  },
  async guard() {
    const episode = await findEpisode(positional()[0], paths);
    const outside = await guardChanges(episode, paths);
    if (outside.length) {
      console.log(`대상 Episode 밖의 변경이 있습니다:\n- ${outside.join("\n- ")}`);
      process.exitCode = 1;
      await log("ERROR", `${episode.name} guard: ${outside.join(", ")}`);
    } else console.log("변경 범위 확인 완료");
  },
};

if (!commands[command]) {
  console.log(USAGE);
  process.exitCode = command ? 1 : 0;
} else {
  try {
    await commands[command]();
  } catch (error) {
    console.error(error.message);
    await log("ERROR", error.stack ?? error.message).catch(() => {});
    process.exitCode = 1;
  }
}
