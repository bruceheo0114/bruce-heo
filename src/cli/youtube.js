import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { RULES, STATUS, youtubePaths } from "../youtube/config.js";
import { addSpend, loadLedger, monthSpent } from "../youtube/ledger.js";
import { enqueueNew, loadQueue, pickNext, saveQueue } from "../youtube/queue.js";
import { createEpisode, createPrebuiltEpisode, findEpisode, linkPrebuilt, listEpisodes, markUpdateAvailable, resolveUpdate } from "../youtube/episode.js";
import {
  archiveArticles,
  articleToMarkdown,
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
  next [--weekly]                 제작할 Episode 1편 (PACKAGE_PENDING이 없으면 이번 주 새 글 → 큐 todo → 예비 글 순으로 새로 만든다)
                                 --weekly: 최근 6일 안에 기획안을 만들었으면 비워 둔다
  episode <글번호>                큐와 상관없이 글 하나로 Episode를 만든다
  prebuild <원고.md> --slug 이름   발행 전 원고(# 제목 + 본문)로 미리 Episode를 만든다. 같은 제목 글이 발행되면 sync가 연결하고,
                                 그 주 next --weekly는 새로 만들지 않는다
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
  narration-text <EP> [--out 폴더] 대본을 챕터별 읽기용 텍스트(CH01.txt …)로 저장 (ElevenLabs 복제 목소리 입력)
  readback <EP> [--dir 폴더]       소리 내어 읽기 검사: 긴 문장·읽는 법 없는 숫자/영어, CHxx.words.json이 있으면 대본과 다르게 들린 곳
  upload <EP> [--privacy public|unlisted|private] [--publish-at ISO]
                                 output/<EP>/의 mp4·썸네일·upload.md로 YouTube 업로드 (YOUTUBE_* 환경 변수 필요)
  references [EP] [--changed]     references.json의 실제 자료를 받아 assets/references/<EP>/에 저장 (GitHub Actions에서 실행)
  render <EP> <녹음 파일...> [--preview] [--no-cleanup] [--voice-clone] [--out 폴더]
                                 녹음 + 화면 + 자막 → 완성 영상 mp4, 썸네일, 업로드 정보 (ffmpeg·playwright 필요)
  thumbnails <EP> [--out 폴더]   썸네일 3안 (references.json의 thumbnail 계획 또는 자동 선택)
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
  // 미리 만든 Episode와 제목이 같은 새 글은 그 Episode에 붙이고 큐에서는 이미 만든 것으로 둔다
  const linked = await linkPrebuilt(added, now, paths);
  for (const { entry, episode } of linked) {
    entry.episode = episode.status.episode;
    let item = queue.items.find((candidate) => String(candidate.no) === String(entry.id));
    if (!item) {
      item = { no: Number(entry.id), title: entry.title };
      queue.items.push(item);
    }
    Object.assign(item, { status: "episode", episode: episode.status.episode, prebuilt: true });
    console.log(`미리 만든 ${episode.name} ← ${entry.id} ${entry.title}`);
  }
  if (queued.length || linked.length) await saveQueue(queue, paths);
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
      // 미리 만든 Episode(발행 전 원고)는 그 글이 올라온 주의 몫이라 여기서 세지 않는다
      const made = episodes.some((episode) =>
        !episode.status.article?.prebuilt && !episode.status.article?.draft_id &&
        (episode.status.history ?? []).some(
          (entry) =>
            entry.from === STATUS.PACKAGE_PENDING &&
            [STATUS.WAITING_APPROVAL, STATUS.SHORTS_ONLY].includes(entry.to) &&
            new Date(entry.at).valueOf() > weekAgo,
        ),
      );
      if (made) return;
      // 이번 주 새 글을 이미 미리 만들어 두었으면 이번 주는 만들지 않는다
      const queue = await loadQueue(paths);
      const index = await loadSourceIndex(paths);
      const fresh = now.valueOf() - 7 * 24 * 60 * 60 * 1000;
      const ready = queue.items.find((item) => item.prebuilt && new Date(index.articles[String(item.no)]?.publishedAt ?? 0).valueOf() > fresh);
      if (ready) {
        console.error(`이번 주 글은 미리 만들어 둠: ${ready.episode} ${ready.title}`);
        return;
      }
    }
    const pending = episodes.find((episode) => episode.status.status === STATUS.PACKAGE_PENDING);
    if (pending) {
      console.log(pending.name);
      return;
    }
    const queue = await loadQueue(paths);
    const index = await loadSourceIndex(paths);
    let item = pickNext(queue, index, now);
    while (item && !index.articles[String(item.no)]) {
      item.status = "missing";
      item.note = "source/brunch에 원문 없음";
      item = pickNext(queue, index, now);
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
  async "narration-text"() {
    const { chapterNarrationTexts } = await import("../youtube/render/timeline.js");
    const { readEpisodeFile } = await import("../youtube/episode.js");
    const { writeFile } = await import("node:fs/promises");
    const [reference] = positional();
    const episode = await findEpisode(reference, paths);
    const outDir = option("--out")?.[0] ?? path.join(paths.root, "output", episode.status.episode, "narration");
    await mkdir(outDir, { recursive: true });
    const texts = chapterNarrationTexts(await readEpisodeFile(episode, "02_script.md"));
    if (!texts.length) throw new Error("02_script.md에 '## CH01 제목' 형식의 챕터가 없습니다.");
    for (const { id, text } of texts) {
      await writeFile(path.join(outDir, `${id}.txt`), `${text}\n`);
      console.log(`${id} ${text.length}자`);
    }
    console.log(`합계 ${texts.reduce((sum, item) => sum + item.text.length, 0)}자 → ${outDir}`);
  },
  async prebuild() {
    const { createHash } = await import("node:crypto");
    const { writeFile } = await import("node:fs/promises");
    const [file] = positional();
    const slug = option("--slug")?.[0];
    if (!file || !slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error("prebuild <원고.md> --slug 영문-소문자 를 적어 주세요.");
    const text = (await readFile(file, "utf8")).trim();
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (!title) throw new Error("원고 첫 줄에 '# 제목'이 필요합니다.");
    const body = text.replace(/^#\s+.+$/m, "").trim();
    const bodyHash = createHash("sha256").update(body).digest("hex");
    const sourceFile = `pre-${slug}.md`;
    await mkdir(paths.sources, { recursive: true });
    await writeFile(
      path.join(paths.sources, sourceFile),
      articleToMarkdown({ id: `pre-${slug}`, canonicalUrl: "https://brunch.co.kr/@heoboram", title, subtitle: "", publishedAt: "", bodyHash, body }),
    );
    const { episode, created } = await createPrebuiltEpisode({ slug, title, file: sourceFile, bodyHash }, now, paths);
    console.log(created ? episode.name : `이미 있는 Episode ${episode.name}`);
  },
  async readback() {
    const { chapterNarrationTexts } = await import("../youtube/render/timeline.js");
    const { readEpisodeFile } = await import("../youtube/episode.js");
    const { lintNarration, diffReadback } = await import("../youtube/readback.js");
    const episode = await findEpisode(positional()[0], paths);
    const dir = option("--dir")?.[0] ?? path.join(paths.root, "output", episode.status.episode, "narration");
    let count = 0;
    for (const { id, text } of chapterNarrationTexts(await readEpisodeFile(episode, "02_script.md"))) {
      for (const issue of lintNarration(text)) {
        console.log(`${id} [${issue.kind}] ${issue.text}`);
        count += 1;
      }
      let words = null;
      for (const name of [`${episode.status.episode}_${id}.words.json`, `${id}.words.json`]) {
        try {
          const raw = JSON.parse(await readFile(path.join(dir, name), "utf8"));
          words = Array.isArray(raw) ? raw : raw.words;
          break;
        } catch {
          // 아직 음성을 만들기 전이면 읽기 전 검사만 한다
        }
      }
      if (!words) continue;
      for (const diff of diffReadback(text, words)) {
        console.log(`${id} [다르게 들림] 대본 "${diff.script}" → 들린 말 "${diff.heard}"`);
        count += 1;
      }
    }
    console.log(count ? `확인할 곳 ${count}개` : "걸리는 곳 없음");
  },
  async upload() {
    const { parseUploadKit, uploadVideo } = await import("../youtube/upload.js");
    const { saveStatus } = await import("../youtube/episode.js");
    const episode = await findEpisode(positional()[0], paths);
    if (episode.status.youtube?.videoId) {
      console.log(`이미 올림: https://youtu.be/${episode.status.youtube.videoId}`);
      return;
    }
    const outDir = option("--out")?.[0] ?? path.join(paths.root, "output", episode.status.episode);
    const kit = parseUploadKit(await readFile(path.join(outDir, "upload.md"), "utf8"));
    const result = await uploadVideo({
      file: path.join(outDir, `${episode.status.episode}.mp4`),
      thumbnail: path.join(outDir, "thumbnail.png"),
      kit,
      privacy: option("--privacy")?.[0] ?? "public",
      publishAt: option("--publish-at")?.[0] ?? null,
      log: (line) => console.log(line),
    });
    episode.status.youtube = { ...result, title: kit.title, uploaded_at: now.toISOString() };
    await saveStatus(episode);
    console.log(`${episode.name} → ${result.url} (${result.privacy})`);
    await log("INFO", `${episode.name} uploaded ${result.videoId}`);
  },
  async references() {
    const { fetchReferences, referencesPending } = await import("../youtube/references.js");
    const [reference] = positional();
    const targets = reference ? [await findEpisode(reference, paths)] : await listEpisodes(paths);
    for (const episode of targets) {
      if (args.includes("--changed") && !(await referencesPending(episode, paths.root))) continue;
      if (!reference && !(await referencesPending(episode, paths.root))) continue;
      console.log(`${episode.name} 자료 받는 중`);
      const { credits, failures } = await fetchReferences(episode, paths.root, { log: (line) => console.log(`  ${line}`) });
      console.log(`${episode.name} 자료 ${credits.length}개 · 실패 ${failures.length}개`);
      await log("INFO", `${episode.name} references ${credits.length} failed=${failures.length}`);
    }
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
      cleanup: !args.includes("--no-cleanup"),
      syntheticVoice: args.includes("--voice-clone"),
      log: (line) => console.log(line),
    });
    console.log(`완성: ${result.file} · ${formatDuration(result.seconds)} · Scene ${result.scenes} · 자막 ${result.cues}줄`);
    await log("INFO", `${episode.name} render ${result.file}`);
  },
  async thumbnails() {
    const episode = await findEpisode(positional()[0], paths);
    const { renderThumbnails } = await import("../youtube/render/thumbnail.js");
    const outDir = option("--out")?.[0] ?? path.join(paths.root, "output", episode.status.episode);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(outDir, { recursive: true });
    for (const file of await renderThumbnails(episode, paths.root, outDir)) console.log(file);
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
