// 받아쓰기(단어별 시간)로 장면 전환과 자막을 실제 말소리에 맞춘다.
// words: ElevenLabs 받아쓰기 결과 [{ text, start, end, type: "word" | "spacing" }]
import { isTransitionText, splitChunks } from "./timeline.js";

export const normalize = (text) => String(text ?? "").replace(/[^가-힣A-Za-z0-9]/g, "");

/** 받아쓰기 단어를 글자 단위로 펼친다. chars[i]가 말해지는 시간 = times[i] */
export function spokenChars(words) {
  let chars = "";
  const times = [];
  for (const word of words ?? []) {
    if (word.type && word.type !== "word") continue;
    const text = normalize(word.text);
    for (let index = 0; index < text.length; index += 1) {
      chars += text[index];
      times.push(word.start + ((word.end - word.start) * index) / text.length);
    }
  }
  const lastEnd = [...(words ?? [])].reverse().find((word) => !word.type || word.type === "word")?.end ?? 0;
  return { chars, times, lastEnd };
}

/**
 * needle(정규화된 글)이 chars의 from 이후 어디서 시작하는지 찾는다. 못 찾으면 -1.
 * 숫자처럼 받아쓰기와 표기가 다른 앞부분을 건너뛰며 몇 번 더 찾아본다.
 */
export function locate(chars, needle, from = 0, window = 600) {
  if (!needle) return -1;
  const near = (index) => index !== -1 && index - from <= window;
  // 1) 내레이션 첫머리
  for (const length of [8, 6, 5]) {
    if (needle.length < length) continue;
    const index = chars.indexOf(needle.slice(0, length), from);
    if (near(index)) return index;
  }
  // 2) 첫머리가 다르게 읽혔으면(숫자 표기·어순) 내레이션 안의 7글자 조각으로 찾는다
  for (let skip = 1; skip + 7 <= Math.min(needle.length, 48); skip += 1) {
    const index = chars.indexOf(needle.slice(skip, skip + 7), from);
    if (near(index)) return Math.max(from, index - skip);
  }
  return -1;
}

/**
 * 장면 시작을 실제 말소리에 맞춘다. groupWords[g] = 그 챕터 녹음의 받아쓰기 단어(없으면 그 챕터는 그대로).
 * - 장면 내레이션을 받아쓰기에서 찾아 그 말이 나오는 순간에 장면을 시작한다.
 *   스토리보드 순서와 실제로 읽은 순서가 다르면 실제 순서를 따른다(장면 순서가 바뀐다).
 * - 찾지 못한 장면은 계획 시간 그대로 두고, 챕터 끝의 무음 장면(챕터 전환)은 마지막 말 뒤에 둔다.
 * - 장면은 최소 MIN_SCENE초 보이게 한다.
 */
const MIN_SCENE = 1.5;

export function alignScenes(timeline, groupWords) {
  let aligned = 0;
  const ordered = [];
  timeline.groups.forEach((group, groupIndex) => {
    const members = timeline.scenes.filter((scene) => scene.group === groupIndex);
    const words = groupWords[groupIndex];
    if (!members.length) return;
    if (!words?.length) {
      ordered.push(...members);
      return;
    }
    const spoken = spokenChars(words);
    const end = group.start + group.seconds;
    let cursor = 0;
    const placed = members.map((scene, index) => {
      const narration = String(scene.fields?.NARRATION ?? "");
      if (isTransitionText(narration)) {
        return { scene, start: index === 0 ? group.start : Math.min(group.start + spoken.lastEnd + 0.1, end - 0.5), order: Infinity, min: 0.5 };
      }
      const needle = normalize(narration);
      let at = locate(spoken.chars, needle, cursor);
      if (at !== -1) cursor = at + 1;
      else at = locate(spoken.chars, needle, 0, Infinity); // 순서가 다르게 읽힌 장면
      if (at === -1) return { scene, start: scene.start, order: null };
      aligned += 1;
      return { scene, start: group.start + Math.max(0, spoken.times[at] - 0.12), order: at };
    });
    // 받아쓰기에서 못 찾은 장면(대본에 없는 설명용 장면)은 스토리보드에서 바로 앞 장면의 끝부분에 짧게(최대 4초) 넣는다.
    const located = placed.filter((item) => item.order !== null);
    located.sort((a, b) => a.start - b.start);
    const spanEnd = (item) => located[located.indexOf(item) + 1]?.start ?? end;
    placed.forEach((item, index) => {
      if (item.order !== null || index === 0) return;
      const before = placed.slice(0, index).reverse().find((other) => other.order !== null);
      if (!before) return;
      item.start = Math.max(before.start + (spanEnd(before) - before.start) / 2, spanEnd(before) - 4);
    });
    placed[0].start = Math.min(placed[0].start, group.start);
    placed.sort((a, b) => a.start - b.start);
    placed[0].start = group.start;
    const minOf = (item) => item.min ?? MIN_SCENE;
    for (let index = 1; index < placed.length; index += 1) {
      placed[index].start = Math.max(placed[index].start, placed[index - 1].start + minOf(placed[index - 1]));
    }
    // 끝에서 넘치면 뒤에서부터 당긴다
    for (let index = placed.length - 1; index > 0; index -= 1) {
      const limit = (index === placed.length - 1 ? end : placed[index + 1].start) - minOf(placed[index]);
      placed[index].start = Math.min(placed[index].start, limit);
    }
    placed.forEach((item, index) => {
      item.scene.start = item.start;
      item.scene.end = index === placed.length - 1 ? end : placed[index + 1].start;
      ordered.push(item.scene);
    });
  });
  timeline.scenes.splice(0, timeline.scenes.length, ...ordered);
  return aligned;
}

/**
 * 자막을 실제로 읽은 대본(챕터별 텍스트)과 받아쓰기 시간으로 만든다.
 * chapterTexts[g] = 그 챕터에서 읽은 글, groupWords[g] = 받아쓰기 단어
 */
export function alignedCues(timeline, chapterTexts, groupWords, maxChars = 28) {
  const cues = [];
  timeline.groups.forEach((group, groupIndex) => {
    const words = groupWords[groupIndex];
    const text = String(chapterTexts[groupIndex] ?? "").replace(/\.\.\./g, " ").replace(/\s+/g, " ").trim();
    if (!words?.length || !text) return;
    const spoken = spokenChars(words);
    const chunks = splitChunks(text, maxChars);
    const starts = [];
    let cursor = 0;
    for (const chunk of chunks) {
      const at = locate(spoken.chars, normalize(chunk), cursor, 300);
      if (at === -1) {
        starts.push(null);
        continue;
      }
      cursor = at + 1;
      starts.push(spoken.times[at]);
    }
    // 못 찾은 줄은 앞뒤 사이에 고르게
    for (let index = 0; index < starts.length; index += 1) {
      if (starts[index] !== null) continue;
      const before = index ? starts[index - 1] : 0;
      let next = index + 1;
      while (next < starts.length && starts[next] === null) next += 1;
      const after = next < starts.length ? starts[next] : spoken.lastEnd;
      const step = (after - before) / (next - index + 1);
      for (let fill = index; fill < next; fill += 1) starts[fill] = (fill ? starts[fill - 1] : before) + step * (fill ? 1 : 0);
      index = next - 1;
    }
    chunks.forEach((chunk, index) => {
      const start = group.start + starts[index];
      const end = group.start + (index + 1 < chunks.length ? starts[index + 1] : spoken.lastEnd + 0.3);
      if (end - start > 0.2) cues.push({ start, end: Math.min(end, start + 7), text: chunk });
    });
  });
  return cues;
}

/**
 * 챕터마다(첫 챕터 제외) 간지 장면을 넣는다. 녹음 끝에 붙인 무음(gap초) 자리에 놓이고, 다음 챕터 제목을 보여 준다.
 * 스토리보드의 '챕터 전환' 장면은 이 간지로 대신한다. 반환: 간지 시작 시간 목록(효과음 자리)
 */
export function insertChapterCards(timeline, gap) {
  if (timeline.mode !== "chapter" || !(gap > 0)) return [];
  const starts = [];
  const result = [];
  timeline.groups.forEach((group, groupIndex) => {
    const end = group.start + group.seconds;
    const last = groupIndex === timeline.groups.length - 1;
    const cardStart = last ? end : end - gap;
    // 간지 자리에 밀려난 장면은 뺀다(첫 장면은 남긴다)
    const keep = timeline.scenes
      .filter((scene) => scene.group === groupIndex && !isTransitionText(scene.fields?.NARRATION))
      .filter((scene, index) => index === 0 || scene.start < cardStart - 0.3);
    keep.forEach((scene, index) => {
      if (index === 0) scene.start = group.start;
      scene.end = keep[index + 1]?.start ?? cardStart;
    });
    result.push(...keep);
    if (!last) {
      starts.push(cardStart);
      result.push({ id: `CARD${String(groupIndex + 2).padStart(2, "0")}`, sourceType: "GRAPHIC", asset: "-", fields: { NARRATION: "-" }, start: cardStart, end, group: groupIndex, chapterCard: true });
    }
  });
  timeline.scenes.splice(0, timeline.scenes.length, ...result);
  return starts;
}
