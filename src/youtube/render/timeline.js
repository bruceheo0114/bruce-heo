// 스토리보드(계획 시간)를 실제 녹음 길이에 맞춘 타임라인으로 바꾼다.
// 챕터별 녹음(EP001_CH01.m4a …)이면 챕터 단위로, 한 파일이면 전체 비율로 늘이거나 줄인다.
import { parseTimecode } from "../parse.js";

export function parseScriptChapters(script) {
  const chapters = [];
  for (const line of String(script ?? "").split(/\r?\n/)) {
    const match = line.match(/^#{2,3}\s*(CH\s?\d+)[\s.:·-]*(.*)$/i);
    if (!match) continue;
    const id = `CH${match[1].replace(/\D/g, "").padStart(2, "0")}`;
    let title = match[2].trim();
    let start = null;
    let end = null;
    const range = title.match(/\(?\s*(\d{1,2}:\d{2})\s*[-–~]\s*(\d{1,2}:\d{2})\s*\)?\s*$/);
    if (range) {
      start = parseTimecode(range[1]);
      end = parseTimecode(range[2]);
      title = title.slice(0, range.index).trim();
    }
    chapters.push({ id, title: title.replace(/[()]/g, "").trim(), start, end });
  }
  return chapters;
}

export function chapterIdFromFile(file) {
  const match = String(file).match(/CH\s?(\d+)/i);
  return match ? `CH${match[1].padStart(2, "0")}` : null;
}

/**
 * scenes: analyzeStoryboard().scenes (time.start/end 계획값)
 * chapters: parseScriptChapters()
 * audio: [{ file, seconds }]
 */
export function buildTimeline(scenes, chapters, audio) {
  const planned = scenes.filter((scene) => scene.time);
  if (!planned.length) throw new Error("스토리보드에 시간이 있는 Scene이 없습니다.");
  const audioTotal = audio.reduce((sum, item) => sum + item.seconds, 0);
  if (!(audioTotal > 0)) throw new Error("녹음 길이를 알 수 없습니다.");

  const byChapter = chapterGroups(planned, chapters, audio);
  const placed = [];
  const marks = [];
  let offset = 0;

  for (const group of byChapter) {
    const from = Math.min(...group.scenes.map((scene) => scene.time.start));
    const to = Math.max(...group.scenes.map((scene) => scene.time.end));
    const k = group.seconds / Math.max(to - from, 1);
    if (group.title !== null) marks.push({ title: group.title, start: offset });
    group.scenes.forEach((scene, index) => {
      const start = offset + (scene.time.start - from) * k;
      const end = index === group.scenes.length - 1 ? offset + group.seconds : offset + (scene.time.end - from) * k;
      placed.push({ ...scene, start, end });
    });
    offset += group.seconds;
  }

  // 앞 Scene 끝과 다음 Scene 시작을 붙여 빈 프레임이 없게 한다.
  for (let index = 1; index < placed.length; index += 1) placed[index].start = placed[index - 1].end;

  // 한 파일 녹음이면 챕터 표시는 계획 시간 비율로 옮긴다.
  if (byChapter.mode === "global") {
    const runtime = Math.max(...planned.map((scene) => scene.time.end));
    marks.push(
      ...chapters
        .filter((chapter) => chapter.start !== null)
        .map((chapter) => ({ title: chapter.title, start: (chapter.start / runtime) * offset })),
    );
  }
  return { scenes: placed, total: offset, chapters: marks, mode: byChapter.mode };
}

function chapterGroups(scenes, chapters, audio) {
  const ranged = chapters.filter((chapter) => chapter.start !== null && chapter.end !== null);
  const audioById = new Map(audio.map((item) => [chapterIdFromFile(item.file), item]));
  const perChapter =
    audio.length > 1 &&
    ranged.length === chapters.length &&
    chapters.length > 0 &&
    (chapters.every((chapter) => audioById.has(chapter.id)) || audio.length === chapters.length);

  if (!perChapter) {
    const groups = [{ title: null, seconds: audio.reduce((sum, item) => sum + item.seconds, 0), scenes }];
    groups.mode = "global";
    return groups;
  }

  const groups = chapters.map((chapter, index) => {
    const item = audioById.get(chapter.id) ?? audio[index];
    return { title: chapter.title, seconds: item.seconds, scenes: [] };
  });
  for (const scene of scenes) {
    const middle = (scene.time.start + scene.time.end) / 2;
    let index = ranged.findIndex((chapter) => middle >= chapter.start && middle < chapter.end);
    if (index === -1) index = middle < ranged[0].start ? 0 : ranged.length - 1;
    groups[index].scenes.push(scene);
  }
  const filled = groups.filter((group) => group.scenes.length);
  if (filled.length !== groups.length) {
    // 장면이 없는 챕터의 녹음은 앞 챕터 마지막 장면에 붙인다.
    for (let index = 0; index < groups.length; index += 1) {
      if (groups[index].scenes.length) continue;
      const target = groups.slice(0, index).reverse().find((group) => group.scenes.length) ?? filled[0];
      target.seconds += groups[index].seconds;
    }
  }
  filled.mode = "chapter";
  return filled;
}

/** Scene 내레이션을 자막 줄로 나누고, 글자 수 비율로 시간을 나눈다. */
export function subtitleCues(timeline, maxChars = 28) {
  const cues = [];
  for (const scene of timeline.scenes) {
    const raw = String(scene.fields?.NARRATION ?? "").trim();
    if (/^(챕터\s*전환|전환|무음|-)$/.test(raw)) continue; // 제작 메모뿐인 무음 장면
    const text = raw
      .replace(/\[[^\]]*\]|\//g, " ") // [쉼]·[확인 필요] 같은 대본 메모
      .replace(/\*\*/g, "")
      .replace(/\([^)]*\)/g, (match) => (/[가-힣]/.test(match) && /[A-Za-z0-9]/.test(match) ? "" : match))
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const chunks = splitChunks(text, maxChars);
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    let at = scene.start;
    const span = scene.end - scene.start;
    for (const chunk of chunks) {
      const length = (chunk.length / total) * span;
      cues.push({ start: at, end: at + length, text: chunk });
      at += length;
    }
  }
  return cues;
}

function splitChunks(text, maxChars) {
  const sentences = text.split(/(?<=[.?!。…])\s+/).filter(Boolean);
  const chunks = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxChars) {
      chunks.push(sentence);
      continue;
    }
    let line = "";
    for (const word of sentence.split(" ")) {
      if ((line + " " + word).trim().length > maxChars && line) {
        chunks.push(line.trim());
        line = word;
      } else line = `${line} ${word}`;
    }
    if (line.trim()) chunks.push(line.trim());
  }
  return chunks;
}

export function formatClock(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
