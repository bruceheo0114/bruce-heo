import { readFile, readdir } from "node:fs/promises";
import { readJson, writeJson } from "../lib/files.js";
import {
  TREND_NOTE,
  contentHash,
  kstNowStamp,
  planReservation,
  reserveTimeOf,
  stibeeClient,
  subjectOf,
} from "../lib/stibee.js";

// 트렌드 노트를 스티비에 올리고 발행일 08:00(KST)에 예약한다. (GitHub Actions: trend-note-stibee.yml)
// 사용: node src/cli/stibee-trend-note.js [reserve|cancel] [YYYY-MM-DD]
//  - 날짜를 빼면 오늘 이후 발행분 전부를 확인한다(원고가 바뀐 호만 다시 올린다).
//  - 결과는 newsletter/trend/<날짜>/meta.json 의 stibee 칸에 남긴다(Actions 가 커밋).
const [action = "reserve", onlyDate] = process.argv.slice(2);
const ROOT = "newsletter/trend";

if (!process.env.STIBEE_API_KEY) {
  console.log("::notice::STIBEE_API_KEY Secret 이 없어 스티비 예약을 건너뜁니다.");
  process.exit(0);
}

const now = kstNowStamp();
const today = `${now.slice(0, 4)}-${now.slice(4, 6)}-${now.slice(6, 8)}`;
const dates = onlyDate
  ? [onlyDate]
  : (await readdir(ROOT, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name) && entry.name >= today)
      .map((entry) => entry.name)
      .sort();

const stibee = stibeeClient();
let failed = 0;

for (const date of dates) {
  const dir = `${ROOT}/${date}`;
  const metaPath = `${dir}/meta.json`;
  const meta = await readJson(metaPath);
  const state = meta.stibee ?? {};
  try {
    if (action === "cancel") {
      if (state.emailId && state.status === "reserved") {
        await stibee.cancelReserve(state.emailId);
        meta.stibee = { ...state, status: "cancelled", updatedAt: new Date().toISOString() };
        await writeJson(metaPath, meta);
        console.log(`${date}: 예약 취소 (email ${state.emailId})`);
      } else {
        console.log(`${date}: 취소할 예약 없음 (${state.status ?? "없음"})`);
      }
      continue;
    }

    const html = await readFile(`${dir}/email.html`, "utf8");
    const subject = subjectOf(meta);
    const hash = contentHash(subject, html);
    const reserveTime = reserveTimeOf(date);
    const plan = planReservation({ stibee: state, hash, reserveTime, now });

    if (plan === "skip") {
      console.log(`${date}: 그대로 (${state.status}, email ${state.emailId})`);
      continue;
    }
    if (plan === "late") {
      console.log(`::warning::${date}: 발송 시각(${reserveTime})이 지나 예약하지 않았습니다.`);
      continue;
    }

    let emailId = state.emailId;
    if (plan === "create") {
      const created = await stibee.createEmail({ subject, ...TREND_NOTE });
      emailId = created?.id;
      if (!emailId) throw new Error(`이메일 생성 응답에 id 가 없습니다: ${JSON.stringify(created)}`);
    } else {
      if (state.status === "reserved") await stibee.cancelReserve(emailId);
      await stibee.updateEmail(emailId, { subject });
    }
    await stibee.setContent(emailId, html);
    await stibee.reserve(emailId, reserveTime);

    meta.stibee = {
      emailId,
      listId: TREND_NOTE.listId,
      subject,
      reserveTime,
      contentHash: hash,
      status: "reserved",
      updatedAt: new Date().toISOString(),
      editUrl: `https://stibee.com/email/${emailId}`,
    };
    await writeJson(metaPath, meta);
    console.log(`${date}: ${plan === "create" ? "새로 만들어" : "고쳐서"} ${reserveTime} 예약 (email ${emailId})`);
  } catch (error) {
    failed += 1;
    meta.stibee = { ...state, status: state.status === "reserved" ? "reserved" : "failed", error: String(error.message).slice(0, 300), updatedAt: new Date().toISOString() };
    await writeJson(metaPath, meta);
    console.log(`::error::${date}: ${error.message}`);
  }
}

if (!dates.length) console.log("예약할 발행분 없음");
process.exit(failed ? 1 : 0);
