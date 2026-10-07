import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { RULES, STATUS, youtubePaths } from "../youtube/config.js";
import { addSpend, loadLedger, monthSpent } from "../youtube/ledger.js";
import { enqueueNew, loadQueue, nextTodo, saveQueue } from "../youtube/queue.js";
import { createEpisode, findEpisode, listEpisodes, markUpdateAvailable, resolveUpdate } from "../youtube/episode.js";
import {
  archiveArticles,
  loadCacheArticles,
  loadLocalArticles,
  loadSourceIndex,
  saveSourceIndex,
} from "../youtube/source.js";
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

  sync [--cache|--local]         브런치 글 → source/brunch Markdown, 새 글은 queue.json 뒤에 추가
                                 --cache: insight-reels/brunch_cache (클라우드 루틴 기본)
                                 --local: content/*/source.json, 생략하면 브런치 RSS 직접 접속
  next [--weekly]                 제작할 Episode 1편 (PACKAGE_PENDING이 없으면 큐 맨 위 글로 새로 만든다)
                                 --weekly: 최근 6일 안에 기획안을 만들었으면 비워 둔다
  episode <글번호>                큐와 상관없이 글 하나로 Episode를 만든다
  pending                         PACKAGE_PENDING Episode 목록
  status [EP]                     Episode 상태 목록 또는 한 편의 상세
  validate <EP>                   제작 패키지 형식·원칙 검사
  finalize <EP>                   검사 통과 시 평가 결과대로 WAITING_APPROVAL/SHORTS_ONLY/HOLD/SKIP
  report <EP>                     Higgsfield 실행 전 생성 계획 보고
  approve <EP> [S003 S005 ...]    Higgsfield 생성 승인 (Scene 생략 시 전체 AI Scene)
  revoke <EP>                     승인 취소
  can-generate <EP> <Scene>       생성해도 되는지 확인 (안 되면 exit 1)
  record-generation <EP> <Scene> --credits N [--job ID] [--file 경로...]
  credits                         이번 달 YouTube Higgsfield 사용량
  narration <EP> <파일...> [--duration mm:ss ...]
                                 직접 녹음한 내레이션 등록 (ffprobe가 없으면 --duration으로 길이 입력)
  render <EP> <녹음 파일...> [--preview] [--out 폴더]
                                 녹음 + 화면 + 자막 → 완성 영상 mp4, 썸네일, 업로드 정보 (ffmpeg·playwright 필요)
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
  let articles;
  if (args.includes("--cache")) articles = await loadCacheArticles(undefined, RULES.sourceSince);
  else if (args.includes("--local")) articles = await loadLocalArticles();
  else {
    const { fetchLatestArticles } = await import("../lib/brunch.js");
    articles = await fetchLatestArticles(limit);
  }
  const index = await loadSourceIndex(paths);
  const bootstrap = !index.initializedAt;
  const { added, changed } = await archiveArticles(index, articles, now, paths);

  // 처음 실행 이전에 발행된 글은 원문으로만 보관한다(지난 글은 queue.json에 직접 고른다).
  // 이후 새로 발행된 글만 큐 맨 뒤에 붙인다.
  const queue = await loadQueue(paths);
  const episodesFrom = new Date(index.initializedAt ?? now);
  const queued = bootstrap
    ? []
    : enqueueNew(queue, added.filter((entry) => new Date(entry.publishedAt) >= episodesFrom));
  if (queued.length) await saveQueue(queue, paths);
  const updated = [];
  for (const entry of changed) {
    const episode = await markUpdateAvailable(entry, now, paths);
    if (episode) updated.push(episode);
  }
  index.initializedAt ??= now.toISOString();
  index.lastSyncedAt = now.toISOString();
  await saveSourceIndex(index, paths);

  console.log(`원문 ${articles.length}편 확인 · 새 원문 ${added.length} · 수정 ${changed.length}${bootstrap ? " (첫 실행: Episode 생성 생략)" : ""}`);
  for (const item of queued) console.log(`큐에 추가: ${item.no} ${item.title}`);
  for (const episode of updated) console.log(`원문 수정 → ${episode.name} UPDATE_AVAILABLE`);
  await log("INFO", `articles=${articles.length} added=${added.length} changed=${changed.length} queued=${queued.length}`);
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
  async pending() {
    for (const episode of await listEpisodes(paths)) {
      if (episode.status.status === STATUS.PACKAGE_PENDING) console.log(episode.name);
    }
  },
  // 주 1편 상한: 최근 6일 안에 WAITING_APPROVAL/SHORTS_ONLY로 넘어간 Episode가 있으면 아무것도 돌려주지 않는다.
  // (7일이 아니라 6일: 수동 실행 뒤 다음 주 같은 요일 예약 실행이 막히지 않게)
  // HOLD/SKIP 판정은 상한에 넣지 않아 같은 주에 다음 글로 넘어갈 수 있다.
  async next() {
    const episodes = await listEpisodes(paths);
    if (args.includes("--weekly")) {
      const weekAgo = now.valueOf() - 6 * 24 * 60 * 60 * 1000;
      const made = episodes.some((episode) =>
        (episode.status.history ?? []).some(
          (entry) =>
            entry.from === STATUS.PACKAGE_PENDING &&
            [STATUS.WAITING_APPROVAL, STATUS.SHORTS_ONLY].includes(entry.to) &&
            new Date(entry.at).valueOf() > weekAgo,
        ),
      );
      if (made) return;
    }
    const pending = episodes.find((episode) => episode.status.status === STATUS.PACKAGE_PENDING);
    if (pending) {
      console.log(pending.name);
      return;
    }
    const queue = await loadQueue(paths);
    const index = await loadSourceIndex(paths);
    let item = nextTodo(queue);
    while (item && !index.articles[String(item.no)]) {
      item.status = "missing";
      item.note = "source/brunch에 원문 없음";
      item = nextTodo(queue);
    }
    if (!item) {
      await saveQueue(queue, paths);
      return;
    }
    const entry = index.articles[String(item.no)];
    const { episode } = await createEpisode(entry, now, paths);
    entry.episode = episode.status.episode;
    item.status = "episode";
    item.episode = episode.status.episode;
    await saveQueue(queue, paths);
    await saveSourceIndex(index, paths);
    console.log(episode.name);
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
    const ledger = await loadLedger(paths);
    console.log(`\n이번 달 YouTube Higgsfield 사용: ${monthSpent(ledger, now)}/${ledger.monthly_cap} 크레딧`);
  },
  async credits() {
    const ledger = await loadLedger(paths);
    console.log(`이번 달 YouTube Higgsfield 사용: ${monthSpent(ledger, now)}/${ledger.monthly_cap} 크레딧`);
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
    const ledger = await loadLedger(paths);
    const blocker = generationBlocker(episode.status, normalizeSceneId(scene), {
      spent: monthSpent(ledger, now),
      cap: ledger.monthly_cap,
    });
    console.log(blocker ? `생성 불가: ${blocker}` : "생성 가능");
    if (blocker) process.exitCode = 1;
  },
  async "record-generation"() {
    const [reference, scene] = positional();
    const episode = await findEpisode(reference, paths);
    const sceneId = normalizeSceneId(scene);
    const credits = Number(option("--credits")?.[0]);
    if (!Number.isFinite(credits)) throw new Error("--credits 로 이번 생성에 쓴 크레딧을 적어 주세요.");
    await recordGeneration(episode, sceneId, { job: option("--job")?.[0] ?? null, files: option("--file") ?? [], credits }, now);
    const ledger = await loadLedger(paths);
    const spent = await addSpend(ledger, now, { episode: episode.status.episode, scene: sceneId, credits }, paths);
    console.log(`${episode.name} ${sceneId} 생성 기록 → ${episode.status.status} · 이번 달 ${spent}/${ledger.monthly_cap} 크레딧`);
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
  async render() {
    const [reference, ...audioFiles] = positional();
    if (!audioFiles.length) throw new Error("녹음 파일 경로를 하나 이상 적어 주세요 (챕터 순서).");
    const episode = await findEpisode(reference, paths);
    const { renderEpisode } = await import("../youtube/render/compose.js");
    const outDir = option("--out")?.[0] ?? path.join(paths.root, "output", episode.status.episode);
    const result = await renderEpisode(episode, audioFiles, {
      root: paths.root,
      outDir,
      preview: args.includes("--preview"),
      log: (line) => console.log(line),
    });
    console.log(`완성: ${result.file} · ${formatDuration(result.seconds)} · Scene ${result.scenes} · 자막 ${result.cues}줄`);
    await log("INFO", `${episode.name} render ${result.file}`);
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
