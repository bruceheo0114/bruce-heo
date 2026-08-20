// [임시] 브런치 프로필/글 페이지의 실제 구조를 확인합니다.
import { get } from './lib/brunch.js';

function show(label, values) {
  console.log(`\n--- ${label} (${values.length}건)`);
  for (const v of values.slice(0, 25)) console.log(`    ${v}`);
}

const profile = await get('https://brunch.co.kr/@heoboram');
console.log(`프로필 길이=${profile.length}`);

show('rss / alternate 링크', [...profile.matchAll(/<link[^>]+(?:alternate|rss)[^>]*>/gi)].map((m) => m[0]));
show('href="/@..." 형태', [...new Set([...profile.matchAll(/href="(\/@[^"]*)"/g)].map((m) => m[1]))]);
show('heoboram 이 들어간 문자열', [...new Set([...profile.matchAll(/[^"'<>\s]{0,40}heoboram[^"'<>\s]{0,20}/g)].map((m) => m[0]))]);
show('articleNo / no: 숫자', [...new Set([...profile.matchAll(/(articleNo|"no")\s*[:=]\s*"?(\d+)/g)].map((m) => `${m[1]}=${m[2]}`))]);
console.log(`\n__NEXT_DATA__ 있음: ${profile.includes('__NEXT_DATA__')}`);
console.log(`self.__next_f 있음: ${profile.includes('__next_f')}`);
show('script id', [...new Set([...profile.matchAll(/<script[^>]*id="([^"]+)"/g)].map((m) => m[1]))]);

const article = await get('https://brunch.co.kr/@heoboram/211');
console.log(`\n글 페이지 길이=${article.length}`);
show('og / article 메타', [...article.matchAll(/<meta[^>]+(?:og:|article:)[^>]*>/gi)].map((m) => m[0].slice(0, 200)));
