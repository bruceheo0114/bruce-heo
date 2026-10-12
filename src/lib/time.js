const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function toSeoulDateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid date: ${value}`);
  const seoul = new Date(date.valueOf() + SEOUL_OFFSET_MS);
  return {
    year: seoul.getUTCFullYear(),
    month: seoul.getUTCMonth() + 1,
    day: seoul.getUTCDate(),
  };
}

export function formatHomepageMonth(value) {
  const { year, month } = toSeoulDateParts(value);
  return `${year}.${String(month).padStart(2, "0")}`;
}

// LinkedIn 피드 글은 매주 화요일 07:30 KST 에 한 편 올린다(월요일 밤 브런치 발행 → 화요일 아침 피드 → 목요일 뉴스레터).
// 승인 시각 이후 첫 화요일 07:30 슬롯을 주고, additionalWeeks 만큼 한 주씩 뒤로 민다.
export function nextKstApprovalSlot(from, additionalWeeks = 0) {
  const source = new Date(from);
  if (Number.isNaN(source.valueOf())) throw new Error(`Invalid date: ${from}`);
  const seoul = new Date(source.valueOf() + SEOUL_OFFSET_MS);
  let slot = Date.UTC(seoul.getUTCFullYear(), seoul.getUTCMonth(), seoul.getUTCDate(), 7, 30, 0, 0) - SEOUL_OFFSET_MS;
  while (new Date(slot + SEOUL_OFFSET_MS).getUTCDay() !== 2 || slot <= source.valueOf()) {
    slot += DAY_MS;
  }
  return new Date(slot + additionalWeeks * 7 * DAY_MS).toISOString();
}

export function isDue(scheduledAt, now = new Date()) {
  return new Date(scheduledAt).valueOf() <= new Date(now).valueOf();
}
