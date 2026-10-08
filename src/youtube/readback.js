// 대본을 "소리 내어 읽어 보는" 단계.
// 1) 읽기 전 검사: 숨이 차는 긴 문장, 읽는 법이 없는 숫자·영어
// 2) 읽은 뒤 검사: 복제 목소리 음성을 받아쓴 결과(words.json)와 대본을 맞대어, 다르게 들린 곳을 찾는다.
import { normalize } from "./render/align.js";

export const LONG_SENTENCE = 70;

/** 말하기 전에 걸리는 문장들. [{ kind, text }] */
export function lintNarration(text) {
  const issues = [];
  const sentences = String(text ?? "")
    .split(/(?<=[.?!…])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    if (sentence.replace(/\s/g, "").length > LONG_SENTENCE) issues.push({ kind: "긴 문장(숨이 참)", text: sentence });
    // narration-text가 (읽는 법)으로 바꾼 뒤에도 남은 영어·소수·큰 수는 TTS가 엉뚱하게 읽기 쉽다
    const bare = sentence.match(/(?:[A-Za-z][A-Za-z.&'-]*[A-Za-z]|\d[\d,.%]*)(?!\s*\()/g) ?? [];
    for (const token of bare.map((item) => item.replace(/[.,]+$/, ""))) {
      if (/^\d+$/.test(token)) continue; // 정수(연도·개수)는 대개 자연스럽게 읽는다. 소수·큰 수(1,000·2.5)만 본다
      issues.push({ kind: "읽는 법 없음", text: `${token} — ${sentence}` });
    }
  }
  return issues;
}

const words = (text) =>
  String(text ?? "")
    .split(/\s+/)
    .map((word) => ({ raw: word, key: normalize(word) }))
    .filter((word) => word.key);

/** 대본과 받아쓰기를 단어 단위로 맞대어 다른 구간을 돌려준다. [{ script, heard }] */
export function diffReadback(scriptText, transcriptWords) {
  const a = words(scriptText);
  const b = words((transcriptWords ?? []).filter((word) => !word.type || word.type === "word").map((word) => word.text).join(" "));
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i].key === b[j].key ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const diffs = [];
  let pending = null;
  const flush = () => {
    // 띄어쓰기만 다른 경우(예: "할 수" / "할수")는 차이로 치지 않는다
    if (pending && pending.script.join("") !== pending.heard.join("")) {
      diffs.push({ script: pending.script.join(" "), heard: pending.heard.join(" ") });
    }
    pending = null;
  };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i].key === b[j].key) {
      flush();
      i += 1;
      j += 1;
      continue;
    }
    pending ??= { script: [], heard: [] };
    if (j >= m || (i < n && lcs[i + 1][j] >= lcs[i][j + 1])) {
      pending.script.push(a[i].key);
      i += 1;
    } else {
      pending.heard.push(b[j].key);
      j += 1;
    }
  }
  flush();
  return diffs;
}
