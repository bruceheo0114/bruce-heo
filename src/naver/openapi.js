import { jsonRequest, requireEnvironment } from "../lib/http.js";

// 네이버 개발자센터 오픈 API(무료). 검색 API 는 하루 25,000회, 데이터랩 검색어 트렌드는 하루 1,000회까지 무료다.
// 네이버 클라우드(API HUB) 쪽 같은 API 는 종량제라 쓰지 않는다.
const BASE = "https://openapi.naver.com/v1";
const PAUSE_MS = 120; // 초당 호출 제한에 걸리지 않게 호출 사이를 조금 띄운다.

export function naverClient({
  clientId = process.env.NAVER_CLIENT_ID,
  clientSecret = process.env.NAVER_CLIENT_SECRET,
  request = jsonRequest,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (!clientId || !clientSecret) requireEnvironment(["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"]);
  // Secret 에 붙여 넣다 따라 들어간 공백·줄바꿈 때문에 인증이 실패하지 않게 다듬는다.
  const headers = {
    "X-Naver-Client-Id": clientId.trim(),
    "X-Naver-Client-Secret": clientSecret.trim(),
  };
  let calls = 0;

  async function call(path, options = {}) {
    if (calls > 0) await pause(PAUSE_MS);
    calls += 1;
    try {
      const { body } = await request("Naver", `${BASE}${path}`, {
        ...options,
        headers: { ...headers, ...options.headers },
      });
      return body;
    } catch (error) {
      // 키 값은 로그에 남기지 않고 길이·글자 모양만 알려 준다(개발자센터 키는 보통 ID 20자, Secret 10자의 영문·숫자).
      if (error.status === 401) {
        const shape = (value) => `${value.length}자${/^[A-Za-z0-9_-]+$/.test(value) ? "" : ", 영문·숫자 아닌 글자 있음"}`;
        throw new Error(
          `네이버 인증 실패(401): NAVER_CLIENT_ID ${shape(headers["X-Naver-Client-Id"])} · NAVER_CLIENT_SECRET ${shape(headers["X-Naver-Client-Secret"])}. ` +
            `developers.naver.com → 내 애플리케이션의 Client ID·Client Secret 인지, 둘이 바뀌지 않았는지 확인하세요. 응답: ${String(error.body).slice(0, 200)}`,
        );
      }
      throw error;
    }
  }

  return {
    get calls() {
      return calls;
    },
    // type: news | blog. sort: sim(정확도) | date(최신). display 최대 100.
    async search(type, query, { sort = "sim", display = 100 } = {}) {
      const params = new URLSearchParams({ query, display: String(display), sort });
      const body = await call(`/search/${type}.json?${params}`);
      return Array.isArray(body?.items) ? body.items : [];
    },
    // keywordGroups 최대 5개. 각 그룹 안 수치는 요청 안에서 상대값(최대 100)이다.
    async trend({ startDate, endDate, keywordGroups }) {
      const body = await call("/datalab/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, timeUnit: "date", keywordGroups }),
      });
      return Array.isArray(body?.results) ? body.results : [];
    },
  };
}
