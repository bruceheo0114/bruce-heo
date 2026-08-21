const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

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

export function nextKstSlot(from, dayOffset = 0) {
  const source = new Date(from);
  const seoul = new Date(source.valueOf() + SEOUL_OFFSET_MS);
  const slotUtc = Date.UTC(
    seoul.getUTCFullYear(),
    seoul.getUTCMonth(),
    seoul.getUTCDate() + dayOffset,
    9,
    30,
    0,
    0,
  );
  return new Date(slotUtc).toISOString();
}

export function isDue(scheduledAt, now = new Date()) {
  return new Date(scheduledAt).valueOf() <= new Date(now).valueOf();
}
