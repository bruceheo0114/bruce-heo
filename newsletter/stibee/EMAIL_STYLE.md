# 트렌드 노트 메일 스타일 (클라우드 루틴용)

`content/routine_trend_newsletter_prompt.md` 6단계에서 `email.html` 을 만들 때 이 파일을 그대로 따른다.
기준 견본은 `newsletter/trend/2026-11-04/email.html`(#1)과 `newsletter/stibee/welcome.html` 이다.
**견본을 복사해서 내용만 바꾼다.** 새 색·폰트·레이아웃·컴포넌트를 만들지 않는다.

## 1. 스티비에 맞춰 지킬 것

- 스티비 **HTML 에디터**에 그대로 붙여넣는 조각이다. `<!doctype>`·`<html>`·`<head>`·`<body>`·`<style>`·`<script>` 를 쓰지 않는다.
  모든 스타일은 인라인. 클래스·외부 CSS·웹폰트 `@import`·`<link>` 금지(메일 앱이 지운다).
- 맨 첫 줄은 **미리보기 텍스트** 숨김 표다. id 와 style 을 한 글자도 바꾸지 않는다.
  ```html
  <table id="$stb-htmlv3$" style="height: 0px; max-height: 0px; border-width: 0px; border-color: initial; border-image: initial; visibility: hidden; line-height: 0px; font-size: 0px; overflow: hidden;display:none;">
  <tr><td>미리보기 문장 (60~90자, 이번 호 사례 두 개를 구체적으로)</td></tr></table>
  ```
- 치환자는 정확히 이 두 개만 쓴다: `$%permalink%$`(웹에서 보기), `$%unsubscribe%$`(수신거부). 둘 다 반드시 넣는다.
  이름 치환자(`$%name%$`)는 쓰지 않는다(이름 없는 구독자가 많다).
- 레이아웃은 표(`<table role="presentation" …>`)로만 짠다. `div`·flex·grid·`position` 금지.
  바깥 표 100% 배경 `#F2F1ED` → 가운데 600px 표(`width="600"` + `style="width:100%;max-width:600px;…"`) 한 단.
- 링크의 `&` 는 `&amp;` 로 쓴다.
- 이미지는 `https://bruceheo.com/...` 절대 주소만. `width` 속성과 `style="display:block;width:100%;max-width:…;height:auto;border:0;"` 를 같이 쓴다. `alt` 필수.

## 2. 글꼴 — 프리텐다드

- 본문 글꼴 스택(600px 표에 한 번만): `font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif;`
  메일 앱은 웹폰트를 못 받으니 프리텐다드가 깔린 기기에서만 프리텐다드로 보이고, 나머지는 시스템 고딕으로 보인다. 이게 정상이다.
- **반드시 프리텐다드로 보여야 하는 것(로고·제목 장식)은 글자가 아니라 이미지로 넣는다.**
  이미 있는 이미지만 쓴다(`newsletter/brand/`):

  | 파일 | 쓰는 곳 |
  |---|---|
  | `email-header-1200.png` | 메일 상단 헤더(1200×160, 아이보리 배경). 매호 같은 것 |
  | `wordmark-1200.png` | 스티비 구독 폼 헤더(투명). 메일에는 쓰지 않는다 |
  | `mark-512.png` · `mark-ivory-512.png` | 프로필·원형 아이콘 |
  | `cover-1200x630.png` | 공유 이미지(OG) |

- 브랜드 이미지를 새로 만들거나 고쳐야 하면 `newsletter/brand/render.cjs`(Playwright + 프리텐다드 CDN)로만 렌더한다.
  렌더 뒤 `document.fonts.check("900 64px 'Pretendard Variable'")` 가 true 인지 확인한다(폰트가 늦게 뜨면 시스템 고딕으로 찍힌다).
  매호 새 이미지는 만들지 않는다.

## 3. 색과 크기 (이 값만 쓴다)

| 이름 | 값 | 쓰는 곳 |
|---|---|---|
| 바탕 | `#F2F1ED` | 바깥 배경, 600px 표 배경 |
| 카드 | `#FBFAF7` | 인용 박스·단어 박스 안쪽 |
| 회색 카드 | `#E9E7E1` | 「이 노트를 읽는 법」, 전달하기 블록 |
| 초록 선 | `#65B98A` | 칩 테두리, 박스 테두리 `1.5px solid` |
| 초록 글자 | `#23744C` | 라벨, 숫자 강조 `<b>`, 링크 |
| 제목 | `#111111` | h1·h2·인용문·버튼 배경 |
| 본문 | `#2A2A27` | 기본 글자 |
| 보조 | `#3A3A37` | 부연 문단 |
| 흐린 글자 | `#73736E` | 출처·장 표기·푸터 |
| 흰색 | `#ffffff` | 검은 버튼 글자 |
| 구분선 | `#E3E1DA` | 푸터 위 선 |

| 요소 | 스타일 |
|---|---|
| h1 | `font-size:27px;line-height:1.35;font-weight:900;letter-spacing:-0.03em;color:#111111;` |
| h2 (사례 제목) | `font-size:21px;line-height:1.4;font-weight:900;letter-spacing:-0.02em;color:#111111;` |
| 도입 문단 | `font-size:16.5px;line-height:1.85;` |
| 사례 본문 | `font-size:16px;line-height:1.85;` |
| 라벨 | `font-size:13px;font-weight:800;color:#23744C;` |
| 인용문 | `font-size:15px;line-height:1.75;font-weight:600;color:#111111;` |
| 출처·장 표기 | `font-size:12.5px;color:#73736E;` |
| 박스 모서리 | 큰 박스 `border-radius:16px`, 인용 박스 `14px`, 칩 `999px`, 버튼 `12px` |
| 좌우 여백 | 모든 행 `padding:… 8px …`, 섹션 사이 위 여백 `30px` |

## 4. 순서 (#1 과 같은 순서, 블록을 빼거나 늘리지 않는다)

1. 미리보기 숨김 표
2. 오른쪽 위 `웹에서 보기` → `$%permalink%$`
3. 헤더 이미지 `email-header-1200.png`(`width="584"`), 링크 `https://bruceheo.com/newsletter/?utm_source=stibee&amp;utm_medium=email&amp;utm_campaign=trend_<날짜>`
4. 칩 `트렌드 노트 #<호수>` → h1 질문형 제목 → 도입 2문단(`~다` 체)
5. 회색 카드 「이 노트를 읽는 법 · 형식 말고 이유를 저장한다」 — **매호 같은 문구**(1장 인용 + 5R 한 줄). #1 에서 그대로 복사
6. 사례 4~5개. 사례마다 아래 블록 하나(`<!-- 사례 반복 블록 -->` 부분 복사):
   - 라벨 `사례 N · <코너> · <5R 1~2개>` (코너: 소비자 / AI 검색 / 커머스 / 일하는 법 / 해외 브랜드 등)
   - h2 제목
   - 본문 한 문단(3~5문장, 장면으로 열고 숫자는 `<b style="color:#23744C;">` 로 강조, 끝은 해석 한 문장). 웹판의 긴 해석은 메일에 넣지 않는다
   - 초록 테두리 인용 박스 「브루스의 한 줄」: 책 문장 그대로 + `<N>장 「<장 제목>」 중`
7. 「이번 달의 단어」 박스(있는 호만. 단어 `36px 900`)
8. 검은 버튼 `사례 전문과 체크리스트 웹에서 읽기` → `https://bruceheo.com/newsletter/trend/<날짜>/?utm_source=stibee&amp;utm_medium=email&amp;utm_campaign=trend_<날짜>`
9. 이번 호의 질문(왼쪽 검은 선 `border-left:3px solid #111111`, `18px 700`) + "답장으로 알려 주세요…" 한 줄
10. 회색 카드 전달하기: 구독 링크 `utm_source=forward` + AI 검색 브랜드 진단 시트 링크(`utm_source=stibee&amp;utm_medium=email`)
11. 푸터(`12.5px #73736E`): 저자 줄 → `출처: <매체명 나열> (전체 목록은 웹 버전에 있습니다)` → 수신 사유·발신자 → `수신거부` = `$%unsubscribe%$`

## 5. 문장

- 본문은 `~다` 체(브런치와 같은 목소리). 마지막 질문·전달하기·푸터만 `~요` 체.
- 숫자·주체·날짜는 원문에서 확인한 것만. 출처 매체 이름을 본문 괄호나 문장 안에 적는다.
- 「브루스의 한 줄」은 책 원고 문장 그대로만. 지어내거나 다듬지 않는다. 경험담을 만들지 않는다.
- 이모지 쓰지 않는다. 느낌표 쓰지 않는다.

## 6. 만들고 나서 확인 (커밋 전)

```bash
f=newsletter/trend/<날짜>/email.html
grep -c 'id="\$stb-htmlv3\$"' $f      # 1
grep -c '\$%permalink%\$' $f          # 1
grep -c '\$%unsubscribe%\$' $f        # 1
grep -cE '<(html|head|body|style|script|link|div)\b' $f   # 0
grep -oE 'class=' $f | wc -l          # 0
grep -oE '#[0-9A-Fa-f]{6}' $f | sort -u   # 3절 표에 있는 색만
grep -oE 'https?://[^"]+' $f | grep -v -E '^https://(bruceheo\.com|www\.)' # 외부 링크 점검
```

하나라도 어긋나면 고친 뒤 커밋한다. 메일 미리보기(루틴 7단계)에는 이 `email.html` 을 그대로 넣는다.

## 7. 스티비 쪽 고정값 (루틴이 바꾸지 않는다)

- 주소록 `브루스의 트렌드 노트` (ID 527738), 발신자 이름 `브루스의 트렌드 노트`, 발신 주소 `heoboram0114-gm@send.stibee.com`
- 구독 폼 `https://page.stibee.com/subscriptions/527738` (헤더 = `wordmark-1200.png`, 텍스트 제목은 끔)
- 메일 제목 형식 `[트렌드 노트 #<호수>] <제목>`
- 발송·예약은 GitHub Actions `trend-note-stibee.yml` 이 스티비 API(키: Secrets `STIBEE_API_KEY`)로 한다. 발행일 08:00 KST 예약, 결과는 `meta.json` 의 `stibee` 칸. 루틴은 스티비에 로그인하거나 API 를 직접 부르지 않는다.
- 보류: Actions 「Trend note Stibee」를 action=cancel, date=<발행일> 로 실행하거나 스티비에서 예약 취소.
