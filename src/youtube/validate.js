import path from "node:path";
import { readFile } from "node:fs/promises";
import { parseFrontMatter } from "./source.js";
import {
  EPISODE_FILES,
  RECOMMENDATIONS,
  RULES,
  SCORE_FILE,
  SOURCE_TYPES,
  youtubePaths,
} from "./config.js";
import { readEpisodeFile } from "./episode.js";
import {
  countListItems,
  findSection,
  formatDuration,
  parseBlocks,
  parseSeconds,
  parseTimeRange,
  splitHeadingBlocks,
} from "./parse.js";

// 점수 항목과 지침서에 나온 다른 표기
const SCORE_ITEMS = {
  NARRATIVE: ["NARRATIVE"],
  "CASE STUDY": ["CASE STUDY"],
  "VISUAL MATERIAL": ["VISUAL MATERIAL"],
  TIMELINESS: ["TIMELINESS"],
  "ORIGINAL POV": ["ORIGINAL POV", "BRUCE POV"],
  "30MIN POTENTIAL": ["30MIN POTENTIAL", "20~30MIN POTENTIAL", "RUNTIME POTENTIAL"],
};
const STORYBOARD_FIELDS = ["TIME", "NARRATION", "VISUAL", "SOURCE_TYPE", "ON_SCREEN_TEXT", "ASSET", "HIGGSFIELD_REQUIRED"];
const HIGGSFIELD_FIELDS = ["PURPOSE", "DURATION", "REFERENCE ASSET", "PROMPT", "CAMERA", "LIGHTING", "STYLE", "ASPECT RATIO", "REUSE POSSIBILITY"];
const ASSET_FIELDS = ["SCENE", "NEEDED MATERIAL", "BRAND", "SOURCE TYPE", "SEARCH KEYWORD", "EXPECTED SOURCE", "PRIORITY"];
const SHORTS_FIELDS = ["HOOK", "SCRIPT", "ON SCREEN TEXT", "SOURCE TIMECODE", "EXPECTED LENGTH"];
const BRIEF_SECTIONS = [
  "Original Article",
  "One Sentence Thesis",
  "Audience",
  "Why Now",
  "Expected Runtime",
  "Title Candidates",
  "Thumbnail Copy",
  "Opening Hook",
  "Main Question",
  "Core Argument",
  "Chapter Structure",
  "Key Examples",
  "Ending",
];

export function parseScore(markdown) {
  const text = String(markdown ?? "").replace(/\*\*|`/g, "");
  const scores = {};
  for (const [item, aliases] of Object.entries(SCORE_ITEMS)) {
    const names = aliases.map((alias) => alias.replace(/ /g, "\\s+")).join("|");
    const pattern = new RegExp(`^\\s*[-*|]?\\s*(?:${names})\\s*[:|]?\\s*(\\d+)\\s*/\\s*10`, "im");
    const match = text.match(pattern);
    if (match) scores[item] = Number(match[1]);
  }
  const recommendation = text.match(/RECOMMENDATION\s*:\s*\n?\s*([A-Z_ ]+)/)?.[1]?.trim().replace(/\s+/g, "_") ?? null;
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  return { scores, total, recommendation };
}

export function validateScore(markdown) {
  const errors = [];
  if (!markdown) return { errors: [`${SCORE_FILE}이 없습니다.`], score: null };
  const score = parseScore(markdown);
  for (const item of Object.keys(SCORE_ITEMS)) {
    if (!(item in score.scores)) errors.push(`${SCORE_FILE}: ${item} 점수(n/10)가 없습니다.`);
    else if (score.scores[item] > 10) errors.push(`${SCORE_FILE}: ${item} 점수가 10을 넘습니다.`);
  }
  if (!RECOMMENDATIONS.includes(score.recommendation)) {
    errors.push(`${SCORE_FILE}: RECOMMENDATION은 ${RECOMMENDATIONS.join(" / ")} 중 하나여야 합니다.`);
  }
  return { errors, score };
}

export function analyzeStoryboard(markdown) {
  const errors = [];
  const warnings = [];
  const scenes = parseBlocks(markdown, "SCENE ID", STORYBOARD_FIELDS).map((fields) => {
    const id = fields["SCENE ID"]?.split(/\s/)[0] ?? "";
    const time = parseTimeRange(fields.TIME);
    return {
      id,
      time,
      duration: time ? time.end - time.start : 0,
      sourceType: fields.SOURCE_TYPE?.split(/[\s/,]/)[0]?.toUpperCase() ?? "",
      higgsfield: /^YES/i.test(fields.HIGGSFIELD_REQUIRED ?? ""),
      asset: fields.ASSET ?? "",
      fields,
    };
  });

  if (!scenes.length) errors.push("03_storyboard.md: SCENE ID 블록을 찾지 못했습니다.");
  const seen = new Set();
  let previousEnd = 0;
  for (const scene of scenes) {
    const label = `03_storyboard.md ${scene.id || "(ID 없음)"}`;
    if (!/^S\d{3,}$/.test(scene.id)) errors.push(`${label}: SCENE ID는 S001 형식이어야 합니다.`);
    if (seen.has(scene.id)) errors.push(`${label}: SCENE ID가 중복됩니다.`);
    seen.add(scene.id);
    for (const field of STORYBOARD_FIELDS) {
      if (!(field in scene.fields)) errors.push(`${label}: ${field} 항목이 없습니다.`);
    }
    if (!scene.time) {
      errors.push(`${label}: TIME은 mm:ss-mm:ss 형식이어야 합니다.`);
      continue;
    }
    if (scene.duration <= 0) errors.push(`${label}: 끝 시간이 시작 시간보다 늦어야 합니다.`);
    if (scene.time.start < previousEnd) errors.push(`${label}: 앞 Scene과 시간이 겹칩니다.`);
    else if (scene.time.start > previousEnd + 1) {
      warnings.push(`${label}: 앞 Scene과 ${scene.time.start - previousEnd}초 비어 있습니다.`);
    }
    previousEnd = Math.max(previousEnd, scene.time.end);
    if (!SOURCE_TYPES.includes(scene.sourceType)) {
      errors.push(`${label}: SOURCE_TYPE은 ${SOURCE_TYPES.join(" / ")} 중 하나여야 합니다.`);
    }
    if ((scene.sourceType === "AI") !== scene.higgsfield) {
      errors.push(`${label}: SOURCE_TYPE이 AI인 Scene만 HIGGSFIELD_REQUIRED: YES여야 합니다.`);
    }
    if (scene.sourceType === "AI" &&
      (scene.duration < RULES.aiSceneMinSeconds || scene.duration > RULES.aiSceneMaxSeconds)) {
      warnings.push(`${label}: AI Scene 길이 ${scene.duration}초 (권장 ${RULES.aiSceneMinSeconds}~${RULES.aiSceneMaxSeconds}초).`);
    }
  }

  const runtime = previousEnd;
  const durationByType = Object.fromEntries(SOURCE_TYPES.map((type) => [type, 0]));
  const countByType = Object.fromEntries(SOURCE_TYPES.map((type) => [type, 0]));
  for (const scene of scenes) {
    if (!SOURCE_TYPES.includes(scene.sourceType)) continue;
    durationByType[scene.sourceType] += Math.max(scene.duration, 0);
    countByType[scene.sourceType] += 1;
  }
  const share = (type) => (runtime ? durationByType[type] / runtime : 0);

  if (scenes.length) {
    if (runtime < RULES.runtimeMinSeconds || runtime > RULES.runtimeMaxSeconds) {
      errors.push(`03_storyboard.md: 전체 길이 ${formatDuration(runtime)}는 ${RULES.runtimeMinSeconds / 60}~${RULES.runtimeMaxSeconds / 60}분 범위를 벗어납니다.`);
    }
    if (share("AI") > RULES.aiShareMax) {
      errors.push(`03_storyboard.md: AI 화면 비중 ${(share("AI") * 100).toFixed(1)}%가 25%를 넘습니다.`);
    }
    if (countByType.AI > RULES.aiSceneMax) {
      errors.push(`03_storyboard.md: AI Scene ${countByType.AI}개는 최대 ${RULES.aiSceneMax}개를 넘습니다.`);
    }
    if (share("REAL") < RULES.realShareMin) {
      warnings.push(`03_storyboard.md: REAL 화면 비중 ${(share("REAL") * 100).toFixed(1)}% (권장 30~40%).`);
    }
  }

  return { errors, warnings, scenes, runtime, durationByType, countByType };
}

export function analyzeHiggsfield(markdown) {
  const errors = [];
  const warnings = [];
  const scenes = parseBlocks(markdown, "SCENE ID", HIGGSFIELD_FIELDS).map((fields) => ({
    id: fields["SCENE ID"]?.split(/\s/)[0] ?? "",
    duration: parseSeconds(fields.DURATION),
    reference: fields["REFERENCE ASSET"] ?? "",
    reuse: fields["REUSE POSSIBILITY"] ?? "",
    fields,
  }));
  for (const scene of scenes) {
    const label = `05_higgsfield.md ${scene.id || "(ID 없음)"}`;
    for (const field of HIGGSFIELD_FIELDS) {
      if (!scene.fields[field]) errors.push(`${label}: ${field} 항목이 비어 있습니다.`);
    }
    if (scene.fields["ASPECT RATIO"] && !scene.fields["ASPECT RATIO"].includes("16:9")) {
      warnings.push(`${label}: 본편 기본 비율은 16:9입니다 (${scene.fields["ASPECT RATIO"]}).`);
    }
  }
  const estimated = String(markdown ?? "")
    .replace(/\*\*|`/g, "")
    .match(/ESTIMATED GENERATIONS\s*:\s*(\d+)/i);
  if (!estimated) errors.push("05_higgsfield.md: 'ESTIMATED GENERATIONS: 숫자' 줄로 예상 생성 횟수를 적어야 합니다.");
  const credits = String(markdown ?? "")
    .replace(/\*\*|`/g, "")
    .match(/ESTIMATED CREDITS\s*:\s*(\d+(?:\.\d+)?)/i);
  if (!credits) errors.push("05_higgsfield.md: 'ESTIMATED CREDITS: 숫자' 줄로 예상 크레딧을 적어야 합니다.");
  else if (Number(credits[1]) > RULES.creditBudgetPerEpisode) {
    errors.push(`05_higgsfield.md: 예상 ${credits[1]} 크레딧이 Episode 상한 ${RULES.creditBudgetPerEpisode}을 넘습니다. AI 영상 Scene을 줄이거나 정지 이미지로 바꾸세요.`);
  }
  return {
    errors,
    warnings,
    scenes,
    estimatedGenerations: estimated ? Number(estimated[1]) : null,
    estimatedCredits: credits ? Number(credits[1]) : null,
  };
}

function verbatimShare(scriptText, sourceBody) {
  const sentences = (text) =>
    String(text)
      .split(/(?<=[.!?。])\s+|\n+/)
      .map((sentence) => sentence.replace(/\s+/g, " ").trim())
      .filter((sentence) => sentence.length >= 25);
  const original = new Set(sentences(sourceBody));
  const script = sentences(scriptText);
  if (!script.length) return 0;
  return script.filter((sentence) => original.has(sentence)).length / script.length;
}

export async function validatePackage(episode, paths = youtubePaths()) {
  const errors = [];
  const warnings = [];
  const read = (name) => readEpisodeFile(episode, name);

  const scoreResult = validateScore(await read(SCORE_FILE));
  errors.push(...scoreResult.errors);
  const recommendation = scoreResult.score?.recommendation ?? null;
  const result = { errors, warnings, score: scoreResult.score, recommendation, storyboard: null, higgsfield: null };

  if (recommendation === "HOLD" || recommendation === "SKIP" || !recommendation) return result;

  const shorts = await read("06_shorts.md");
  if (!shorts) errors.push("06_shorts.md가 없습니다.");
  else {
    const blocks = splitHeadingBlocks(shorts, /^SHORT\b/i);
    if (blocks.length < RULES.shortsMin || blocks.length > RULES.shortsMax) {
      errors.push(`06_shorts.md: '## SHORT 01' 형식의 Shorts가 ${blocks.length}개입니다 (3~5개 필요).`);
    }
    for (const block of blocks) {
      const fields = parseBlocks(block.body, "HOOK", SHORTS_FIELDS)[0] ?? {};
      for (const field of SHORTS_FIELDS) {
        if (!fields[field]) errors.push(`06_shorts.md ${block.title}: ${field} 항목이 비어 있습니다.`);
      }
    }
  }
  if (recommendation === "SHORTS_ONLY") return result;

  for (const name of EPISODE_FILES) {
    if ((await read(name)) === null) errors.push(`${name}이 없습니다.`);
  }

  const brief = await read("01_brief.md");
  if (brief) {
    for (const heading of BRIEF_SECTIONS) {
      if (findSection(brief, heading) === null) errors.push(`01_brief.md: '## ${heading}' 섹션이 없습니다.`);
    }
    const titles = countListItems(findSection(brief, "Title Candidates"));
    if (titles < RULES.titleCandidates) errors.push(`01_brief.md: 제목 후보가 ${titles}개입니다 (5개 필요).`);
    const thumbnails = countListItems(findSection(brief, "Thumbnail Copy"));
    if (thumbnails < RULES.thumbnailCopies) errors.push(`01_brief.md: 썸네일 카피가 ${thumbnails}개입니다 (5개 필요).`);
  }

  const script = await read("02_script.md");
  if (script) {
    const chars = script.replace(/\s/g, "").length;
    if (chars < RULES.scriptMinChars) {
      warnings.push(`02_script.md: 공백 제외 ${chars}자로 ${RULES.runtimeMinSeconds / 60}분 내레이션에 짧을 수 있습니다.`);
    }
    try {
      const source = await readFile(path.join(paths.root, episode.status.article.source_file), "utf8");
      const copied = verbatimShare(script, parseFrontMatter(source).body);
      if (copied > RULES.verbatimShareMax) {
        errors.push(`02_script.md: 문장의 ${(copied * 100).toFixed(0)}%가 브런치 원문과 같습니다. 구어체로 다시 써야 합니다.`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      warnings.push("원문 Markdown을 찾지 못해 원문 복사 여부를 검사하지 못했습니다.");
    }
  }

  const storyboardText = await read("03_storyboard.md");
  if (storyboardText) {
    result.storyboard = analyzeStoryboard(storyboardText);
    errors.push(...result.storyboard.errors);
    warnings.push(...result.storyboard.warnings);
  }

  const assets = await read("04_assets.md");
  if (assets) {
    const blocks = parseBlocks(assets, "ASSET ID", ASSET_FIELDS);
    if (!blocks.length) errors.push("04_assets.md: ASSET ID 블록을 찾지 못했습니다.");
    for (const block of blocks) {
      for (const field of ASSET_FIELDS) {
        if (!block[field]) errors.push(`04_assets.md ${block["ASSET ID"]}: ${field} 항목이 비어 있습니다.`);
      }
    }
  }

  const higgsfieldText = await read("05_higgsfield.md");
  if (higgsfieldText) {
    result.higgsfield = analyzeHiggsfield(higgsfieldText);
    errors.push(...result.higgsfield.errors);
    warnings.push(...result.higgsfield.warnings);
    if (result.storyboard) {
      const aiIds = new Set(result.storyboard.scenes.filter((scene) => scene.sourceType === "AI").map((scene) => scene.id));
      const promptIds = new Set(result.higgsfield.scenes.map((scene) => scene.id));
      for (const id of aiIds) if (!promptIds.has(id)) errors.push(`05_higgsfield.md: AI Scene ${id}의 프롬프트가 없습니다.`);
      for (const id of promptIds) if (!aiIds.has(id)) errors.push(`05_higgsfield.md: ${id}는 storyboard의 AI Scene이 아닙니다.`);
    }
  }

  return result;
}
