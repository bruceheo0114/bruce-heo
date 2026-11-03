#!/usr/bin/env bash
# 트렌드 노트 한 호 자동 검사 (EMAIL_STYLE.md 6절 + 웹판 기본 요소).
# 사용: bash newsletter/stibee/check.sh 2026-11-11   → 통과하면 "OK", 아니면 항목별 FAIL 후 exit 1
set -u
d="${1:?날짜(YYYY-MM-DD)}"; dir="newsletter/trend/$d"; fail=0
bad(){ echo "FAIL: $*"; fail=1; }
for f in index.html email.html linkedin.md meta.json; do [ -s "$dir/$f" ] || bad "$dir/$f 없음"; done
e="$dir/email.html"; w="$dir/index.html"
if [ -s "$e" ]; then
  [ "$(grep -c 'id="\$stb-htmlv3\$"' "$e")" = 1 ] || bad "미리보기 숨김 표가 1개가 아님"
  [ "$(grep -c '\$%permalink%\$' "$e")" = 1 ] || bad "\$%permalink%\$ 가 1개가 아님"
  [ "$(grep -c '\$%unsubscribe%\$' "$e")" = 1 ] || bad "\$%unsubscribe%\$ 가 1개가 아님"
  grep -qE '<(html|head|body|style|script|link|div|meta|iframe|form|input|button)\b' "$e" && bad "스티비 금지 태그 있음"
  grep -q 'class=' "$e" && bad "class 속성 있음(인라인 스타일만)"
  grep -q '\$%name%\$' "$e" && bad "이름 치환자 사용 금지"
  allowed='#F2F1ED #FBFAF7 #E9E7E1 #65B98A #23744C #111111 #2A2A27 #3A3A37 #73736E #ffffff #E3E1DA'
  for c in $(grep -oE '#[0-9A-Fa-f]{6}' "$e" | sort -u); do
    echo " $allowed " | grep -qi " $c " || bad "허용되지 않은 색 $c"; done
  grep -q 'newsletter/brand/email-header-1200.png' "$e" || bad "헤더 이미지 없음"
  grep -q "trend/$d/?utm_source=stibee" "$e" || bad "웹에서 읽기 버튼 링크(utm) 없음"
  grep -oE 'href="[^"]*&[^a][^"]*"' "$e" | grep -v '&amp;' | head -1 | grep -q . && bad "링크의 & 를 &amp; 로"
  grep -qP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' "$e" 2>/dev/null && bad "이모지 사용 금지"
fi
if [ -s "$w" ]; then
  grep -qi '<!doctype html>' "$w" || bad "웹판 doctype 없음"
  grep -q '/newsletter/newsletter.css' "$w" || bad "웹판이 newsletter.css 를 안 씀"
  grep -q 'G-17SXL7Q2XV' "$w" || bad "웹판 GA4 태그 없음"
  grep -q 'noindex' "$w" && bad "웹판에 noindex 남음"
fi
[ -s "$dir/meta.json" ] && { python3 -c "import json,sys;m=json.load(open(sys.argv[1]));assert m['quotes'] and m['sources'] and m['issue']" "$dir/meta.json" 2>/dev/null || bad "meta.json 형식(quotes·sources·issue)"; }
grep -q "newsletter/trend/$d/" newsletter/index.html || bad "구독 페이지 지난 호 목록에 이번 호 없음"
grep -q "newsletter/trend/$d/" sitemap.xml || bad "sitemap.xml 에 이번 호 없음"
[ $fail = 0 ] && echo OK; exit $fail
