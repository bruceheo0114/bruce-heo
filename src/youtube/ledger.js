import { readJson, writeJson } from "../lib/files.js";
import { RULES, youtubePaths } from "./config.js";

// Higgsfield 크레딧 장부. 인스타그램(insight-reels/ledger.json)과 따로, 같은 2일 리셋 주기로 센다.
export function cycleKey(now, resetDay = RULES.creditCycleResetDay) {
  const kst = new Date(now.valueOf() + 9 * 60 * 60 * 1000);
  let year = kst.getUTCFullYear();
  let month = kst.getUTCMonth() + 1;
  if (kst.getUTCDate() < resetDay) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

export async function loadLedger(paths = youtubePaths()) {
  return readJson(paths.ledger, {
    monthly_cap: RULES.monthlyCreditCap,
    cycle_resets_on_day: RULES.creditCycleResetDay,
    note: "Higgsfield Starter 270 = 인스타그램 120 + YouTube 150",
    cycles: {},
  });
}

export function monthSpent(ledger, now) {
  return ledger.cycles[cycleKey(now)]?.spent ?? 0;
}

export async function addSpend(ledger, now, entry, paths = youtubePaths()) {
  const key = cycleKey(now);
  const cycle = ledger.cycles[key] ?? { spent: 0, entries: [] };
  cycle.spent = Number((cycle.spent + entry.credits).toFixed(2));
  cycle.entries.push({ date: now.toISOString().slice(0, 10), ...entry });
  ledger.cycles[key] = cycle;
  await writeJson(paths.ledger, ledger);
  return cycle.spent;
}
