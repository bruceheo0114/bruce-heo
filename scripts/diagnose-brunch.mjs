// [임시] 러너에서 브런치가 어떤 주소로 어떻게 응답하는지 확인하는 진단 스크립트.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const URLS = [
  'https://brunch.co.kr/rss/@@heoboram',
  'https://brunch.co.kr/rss/@heoboram',
  'https://brunch.co.kr/@heoboram',
  'https://brunch.co.kr/@heoboram/211',
  'https://api.brunch.co.kr/v1/profile/heoboram',
];

const HEADER_SETS = {
  '기본': { 'user-agent': UA, accept: '*/*' },
  '브라우저형': {
    'user-agent': UA,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
    'accept-encoding': 'gzip, deflate',
    referer: 'https://brunch.co.kr/',
  },
};

for (const url of URLS) {
  for (const [name, headers] of Object.entries(HEADER_SETS)) {
    const label = `${url}  [${name}]`;
    try {
      const res = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.text();
      console.log(`OK   ${label}`);
      console.log(`     status=${res.status} type=${res.headers.get('content-type')} len=${body.length} final=${res.url}`);
      console.log(`     head: ${body.slice(0, 220).replace(/\s+/g, ' ')}`);
    } catch (err) {
      console.log(`FAIL ${label}`);
      console.log(`     ${err.name}: ${err.message} / cause: ${err.cause?.code || err.cause?.message || err.cause}`);
    }
  }
}
