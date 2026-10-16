import { jsonRequest, requireEnvironment } from "../lib/http.js";

// 네이버 검색(뉴스·블로그)과 데이터랩 검색어 트렌드. 같은 API 를 두 곳에서 키로 받을 수 있다.
// - 개발자센터(developers.naver.com): 무료. 검색 하루 25,000회, 데이터랩 하루 1,000회. 키는 보통 ID 20자 · Secret 10자.
// - 네이버 클라우드 API HUB: 종량제(2026-10 기준 한시적 무료, 유료 전환은 사전 공지). 키는 보통 ID 10자 · Secret 40자.
// Secrets 에 어느 쪽 키를 넣어도 돌도록, 키 모양으로 먼저 고르고 401 이면 다른 쪽으로 한 번 더 해 본다.
const PROVIDERS = {
  developers: {
    label: "개발자센터",
    base: "https://openapi.naver.com/v1",
    search: (type) => `/search/${type}.json`,
    trend: "/datalab/search",
    headers: (id, secret) => ({ "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret }),
  },
  apihub: {
    label: "API HUB",
    base: "https://naverapihub.apigw.ntruss.com",
    search: (type) => `/search/v1/${type}`,
    trend: "/search-trend/v1/search",
    headers: (id, secret) => ({ "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret }),
  },
};
const PAUSE_MS = 120; // 초당 호출 제한에 걸리지 않게 호출 사이를 조금 띄운다.

export function guessProvider(clientId, clientSecret) {
  return clientSecret.length >= 30 && clientId.length <= 12 ? "apihub" : "developers";
}

export function naverClient({
  clientId = process.env.NAVER_CLIENT_ID,
  clientSecret = process.env.NAVER_CLIENT_SECRET,
  request = jsonRequest,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (!clientId || !clientSecret) requireEnvironment(["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"]);
  // Secret 에 붙여 넣다 따라 들어간 공백·줄바꿈 때문에 인증이 실패하지 않게 다듬는다.
  const id = clientId.trim();
  const secret = clientSecret.trim();
  let provider = guessProvider(id, secret);
  let confirmed = false;
  let calls = 0;

  async function send(name, route, options) {
    if (calls > 0) await pause(PAUSE_MS);
    calls += 1;
    const target = PROVIDERS[name];
    const { body } = await request(`Naver ${target.label}`, `${target.base}${route(target)}`, {
      ...options,
      headers: { ...target.headers(id, secret), ...options.headers },
    });
    return body;
  }

  async function call(route, options = {}) {
    try {
      const body = await send(provider, route, options);
      confirmed = true;
      return body;
    } catch (error) {
      if (error.status !== 401 || confirmed) throw error;
      const other = provider === "developers" ? "apihub" : "developers";
      try {
        const body = await send(other, route, options);
        provider = other;
        confirmed = true;
        return body;
      } catch (retry) {
        if (retry.status !== 401) throw retry;
        // 키 값은 로그에 남기지 않고 길이·글자 모양만 알려 준다.
        const shape = (value) => `${value.length}자${/^[A-Za-z0-9_-]+$/.test(value) ? "" : ", 영문·숫자 아닌 글자 있음"}`;
        throw new Error(
          `네이버 인증 실패(401, 개발자센터·API HUB 둘 다): NAVER_CLIENT_ID ${shape(id)} · NAVER_CLIENT_SECRET ${shape(secret)}. ` +
            `같은 애플리케이션의 Client ID·Client Secret 인지, 둘이 바뀌지 않았는지 확인하세요. 응답: ${String(error.body).slice(0, 200)}`,
        );
      }
    }
  }

  return {
    get calls() {
      return calls;
    },
    get provider() {
      return PROVIDERS[provider].label;
    },
    // type: news | blog. sort: sim(정확도) | date(최신). display 최대 100.
    async search(type, query, { sort = "sim", display = 100 } = {}) {
      const params = new URLSearchParams({ query, display: String(display), sort });
      const body = await call((target) => `${target.search(type)}?${params}`);
      return Array.isArray(body?.items) ? body.items : [];
    },
    // 검색 결과 전체 건수(경쟁 글이 얼마나 많은지 보는 용도).
    async total(type, query) {
      const params = new URLSearchParams({ query, display: "1" });
      const body = await call((target) => `${target.search(type)}?${params}`);
      return Number(body?.total ?? 0);
    },
    // keywordGroups 최대 5개. 각 그룹 안 수치는 요청 안에서 상대값(최대 100)이다.
    async trend({ startDate, endDate, keywordGroups, timeUnit = "date" }) {
      const body = await call((target) => target.trend, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, timeUnit, keywordGroups }),
      });
      return Array.isArray(body?.results) ? body.results : [];
    },
  };
}
