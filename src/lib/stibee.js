import { createHash } from "node:crypto";
import { ApiError } from "./http.js";

// 스티비 API v2 (이메일 API 는 프로 요금제 이상). 인증 헤더는 AccessToken.
// 트렌드 노트 email.html 을 주소록에 「일반 이메일」로 만들고, 발행일 08:00(KST)에 예약한다.
export const STIBEE_BASE = "https://api.stibee.com/v2";
export const TREND_NOTE = Object.freeze({
  listId: 527738,
  senderEmail: "heoboram0114-gm@send.stibee.com",
  senderName: "브루스의 트렌드 노트",
  sendTime: "080000",
});

export function subjectOf(meta) {
  if (!meta?.issue || !meta?.title) throw new Error("meta.json 에 issue·title 이 없습니다");
  return `[트렌드 노트 #${meta.issue}] ${meta.title}`;
}

// 2026-11-11 → 20261111080000 (스티비는 대한민국 표준시 기준 YYYYMMDDhhmmss)
export function reserveTimeOf(date, time = TREND_NOTE.sendTime) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`날짜 형식이 아닙니다: ${date}`);
  return `${date.replaceAll("-", "")}${time}`;
}

export function kstNowStamp(now = new Date()) {
  const kst = new Date(now.valueOf() + 9 * 60 * 60 * 1000).toISOString();
  return kst.slice(0, 19).replace(/[-T:]/g, "");
}

export function contentHash(subject, html) {
  return createHash("sha256").update(`${subject}\n${html}`).digest("hex").slice(0, 16);
}

// 지금 상태(meta.stibee)와 새 원고를 보고 할 일을 정한다. 순수 함수라 테스트한다.
//  create  : 아직 스티비에 없음 → 만들기·본문·예약
//  update  : 예약돼 있는데 원고가 바뀜 → 예약 취소·제목·본문·다시 예약
//  skip    : 이미 같은 원고로 예약됨 / 이미 발송됨
//  late    : 발송 시각이 지났음 → 아무것도 하지 않음
export function planReservation({ stibee, hash, reserveTime, now }) {
  if (stibee?.status === "sent") return "skip";
  if (reserveTime <= now) return stibee?.status === "reserved" ? "skip" : "late";
  if (!stibee?.emailId || stibee.status === "failed") return "create";
  if (stibee.status === "cancelled") return "update";
  return stibee.contentHash === hash && stibee.reserveTime === reserveTime ? "skip" : "update";
}

export function stibeeClient({ token = process.env.STIBEE_API_KEY, request = fetch } = {}) {
  if (!token) throw new Error("STIBEE_API_KEY Secret 이 없습니다");
  const key = token.trim();
  async function call(method, route, { json, html } = {}) {
    const headers = { AccessToken: key };
    let body;
    if (json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(json);
    } else if (html !== undefined) {
      headers["Content-Type"] = "text/html; charset=utf-8";
      body = html;
    }
    const response = await request(`${STIBEE_BASE}${route}`, { method, headers, body });
    const text = await response.text();
    if (!response.ok) throw new ApiError("Stibee", response.status, text);
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return text;
    }
  }
  return {
    authCheck: () => call("GET", "/auth-check"),
    createEmail: ({ subject, listId, senderEmail, senderName }) =>
      call("POST", "/emails", { json: { subject, listId, senderEmail, senderName } }),
    updateEmail: (id, fields) => call("PUT", `/emails/${id}`, { json: fields }),
    setContent: (id, html) => call("POST", `/emails/${id}/content`, { html }),
    reserve: (id, reserveTime) => call("POST", `/emails/${id}/reserve?reserveTime=${reserveTime}`),
    cancelReserve: (id) => call("POST", `/emails/${id}/cancel-reserve`),
    getEmail: (id) => call("GET", `/emails/${id}`),
  };
}
