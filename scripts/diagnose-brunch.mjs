// [임시] 러너에서 브런치가 어떤 주소로 응답하는지 확인하는 진단 스크립트.
import { get } from './lib/brunch.js';

const URLS = [
  'https://brunch.co.kr/rss/@@heoboram',
  'https://brunch.co.kr/@heoboram',
  'https://brunch.co.kr/@heoboram/211',
];

for (const url of URLS) {
  try {
    const body = await get(url);
    console.log(`OK   ${url}  len=${body.length}`);
    console.log(`     head: ${body.slice(0, 300).replace(/\s+/g, ' ')}`);
  } catch (err) {
    console.log(`FAIL ${url}`);
    console.log(`     ${err.message}`);
  }
}
