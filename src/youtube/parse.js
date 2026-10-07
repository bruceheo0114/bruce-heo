// 제작 패키지 Markdown에서 "LABEL: 값" 형식의 블록을 읽는다.
// 값은 같은 줄이나 다음 줄부터 다음 LABEL 직전까지 이어질 수 있다.

function normalizeLine(line) {
  return line
    .replace(/^\s*[-*>]\s+/, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^#+\s*/, "")
    .trimEnd();
}

export function parseBlocks(markdown, startLabel, labels) {
  const known = new Set([startLabel, ...labels]);
  const blocks = [];
  let current = null;
  let field = null;

  for (const raw of String(markdown).split(/\r?\n/)) {
    if (/^\s*```/.test(raw)) continue;
    const line = normalizeLine(raw);
    const match = line.match(/^([A-Z][A-Z_ ]*[A-Z])\s*:\s*(.*)$/);
    if (match && known.has(match[1].trim())) {
      const label = match[1].trim();
      if (label === startLabel) {
        current = { fields: {} };
        blocks.push(current);
      }
      if (!current) continue;
      field = label;
      current.fields[field] = match[2].trim();
      continue;
    }
    if (/^\s*(-{3,}|#{1,3}\s)/.test(raw)) {
      field = null;
      continue;
    }
    if (current && field) {
      const value = current.fields[field];
      current.fields[field] = value ? `${value}\n${line.trim()}` : line.trim();
    }
  }

  return blocks.map((block) =>
    Object.fromEntries(
      Object.entries(block.fields).map(([key, value]) => [key, value.trim()]),
    ),
  );
}

export function parseTimecode(value) {
  const parts = String(value).trim().split(":").map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function parseTimeRange(value) {
  const match = String(value ?? "").match(
    /(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–~]\s*(\d{1,2}:\d{2}(?::\d{2})?)/,
  );
  if (!match) return null;
  const start = parseTimecode(match[1]);
  const end = parseTimecode(match[2]);
  if (start === null || end === null) return null;
  return { start, end };
}

export function formatDuration(seconds) {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

export function parseSeconds(value) {
  const match = String(value ?? "").match(/(\d+(?:\.\d+)?)\s*(?:s|sec|초)?/i);
  return match ? Number(match[1]) : null;
}

// "## Title Candidates" 같은 제목 아래 내용을 다음 같은 수준 이상의 제목 전까지 돌려준다.
export function findSection(markdown, heading) {
  const lines = String(markdown).split(/\r?\n/);
  const target = heading.toLowerCase();
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.*)$/);
    if (!match || !match[2].toLowerCase().includes(target)) continue;
    const level = match[1].length;
    const body = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const nested = lines[next].match(/^(#{1,6})\s/);
      if (nested && nested[1].length <= level) break;
      body.push(lines[next]);
    }
    return body.join("\n").trim();
  }
  return null;
}

export function countListItems(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line)).length;
}

export function splitHeadingBlocks(markdown, pattern) {
  const blocks = [];
  let current = null;
  for (const line of String(markdown).split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading && pattern.test(heading[1])) {
      current = { title: heading[1].trim(), body: [] };
      blocks.push(current);
      continue;
    }
    if (heading && current && !pattern.test(heading[1]) && /^#{1,2}\s/.test(line)) {
      current = null;
      continue;
    }
    current?.body.push(line);
  }
  return blocks.map((block) => ({ title: block.title, body: block.body.join("\n").trim() }));
}
