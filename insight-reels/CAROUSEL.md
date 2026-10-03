# 카드뉴스(캐러셀) 매뉴얼

@bruce.insight 카드뉴스는 두 종류다.

| 요일 | 시리즈 | 샘플 |
|---|---|---|
| 월 07:00 | **이번 주 마케팅 이슈** — 지난 일~토 국내외 이슈 3건 정리 | `posts/2026-10-05.json` + `.cards.json` |
| 수 07:00 | **브런치 카드뉴스** — 논리를 펼치는 글(판단·원칙·프레임), `carousel_queue.json` | `posts/2026-10-07.json` + `.cards.json` |

샘플 형식을 그대로 따른다.

## 역할 나눔 — 루틴은 글과 이미지 생성까지만

| 누가 | 하는 일 |
|---|---|
| 루틴(Claude) | 원문 읽기 → 카드 원고 `cards.json` → 이미지 생성 → 캡션 → `status: "render"` 로 커밋 → 미리보기 메일 |
| Actions `insight-reels-cards.yml` | `cards.py` 로 카드를 그려 `media/DATE/` 에 커밋, `images`·`qa_url` 기록, `status: "scheduled"` |
| Actions `insight-reels-publish.yml` | 당일 07:00 캐러셀 게시 |

**루틴은 샌드박스·media_upload 를 쓰지 않는다.** 카드는 Actions 가 그린다(Claude 사용량 0). 루틴이 카드를 직접 보거나 다시 그리지 않는다.

## 월요일: 이번 주 마케팅 이슈

- **6장 고정**: `cover`(pill `이번 주 마케팅 이슈`) → `issue` 3장 → `text`(세 이슈를 꿰는 한 줄) → `close`(댓글 질문). 이미지는 cover 1장만 만들고 close 에 같은 URL(focus_y 0.3)을 쓴다 = **0.25크레딧**.
- 고르는 기준: 일~토 7일 안에 **발표·공개된** 것(원문 날짜로 확인). 글로벌 2 + 국내 1 이 기본. 광고·캠페인, 광고 플랫폼·AI 마케팅 도구 변화, 브랜드 전략 전환 중에서 마케터가 "그래서 뭐가 달라지나"를 말할 수 있는 것.
- 빼는 것: 7일 밖 발표, 보도자료 재탕·숫자 없는 기사, 소송·사고·정치 논란, 인사 발령, 루틴 프롬프트에 적힌 제외 브랜드.
- 검색은 **최대 8회**(WebSearch 먼저, 국내는 Firecrawl `tbs: "qdr:w"`, 한 번에 하나씩). 확정한 3건은 원문을 **1건씩 열어**(WebFetch) 날짜·숫자·주체를 확인한다. 확인 못 한 숫자는 쓰지 않는다. SNS 요약 게시물은 출처로 쓰지 않는다.
- `issue` 카드: `no`, `tag`(`글로벌 · 분야` / `국내 · 분야`), `title`(2줄, "브랜드, ~한다." 형식), `body`(사실 4~6줄, 날짜 포함), `point`(브루스의 한 줄, 2줄), `source`(`출처: 매체 · 매체 (M/D)`).
- 시의성 표현·날짜는 이 시리즈에서만 허용한다. 기사 문장·사진은 옮기지 않고 요약한다. 실제 캠페인을 이미지로 재현하지 않는다.
- 캡션: 첫 줄 `📰 이번 주 주목할 마케팅 이슈 3가지, 넘겨서 보세요 👉` → `1️⃣2️⃣3️⃣` 각 2~3문장 + `→` 한 줄 → `📌 세 이슈를 꿰는 한 줄` → `💬` 질문 → `출처:` 한 줄 → 해시태그 5개(`#브루스매거진 #마케팅이슈` 로 시작). posts JSON 에 `series: "weekly_issues"`, `sources: [원문 URL…]` 를 넣는다(brunch_no 없음).

## 수요일: 브런치 카드뉴스 — 카드 원고(cards.json) 규칙

- 8장 기본(7~9장). 순서: `cover` → 문제 제기 `photo` → 오해/통념 `photo` → 핵심 한 문장 `text` → 구조 `compare` 또는 `checks` → 근거 `photo` → `close`.
- `compare`(A가 아니라 B, 예전→이제)·`checks`(실무 3가지) 중 원문 구조에 맞는 것 하나 이상 반드시 넣는다. 둘 다 써도 된다. 같은 kind 를 연달아 두 장 쓰지 않는다(`photo` 제외).
- 제목: 2~3줄, 줄당 13자 이내, 끝은 마침표(초록 점으로 그려진다). 표지 제목은 줄당 9자 이내.
- 본문: 줄당 24자 이내, 장당 6줄 이내. 원문 문장을 압축하되 사실(숫자·주체·순서)을 바꾸지 않는다.
- `**단어**` 는 장마다 최대 1개.
- 이미지가 필요한 장은 `cover`·`photo`·`close` 뿐이다(보통 5장).

## 이미지 (힉스필드, 편당 5장 = 1.25크레딧)

- `generate_image_batch`, model `gpt_image_2_5`, aspect_ratio `4:5`. 결과 `result_url` 을 `src` 에 그대로 넣는다.
- 프롬프트 끝: cover·close 는 "No text, no logos, no brand names, negative space on the left", photo 는 "Main subject in the upper half of the frame. No text, no logos, no brand names, negative space at the bottom".
- cover·close 는 어두운 실내/야간 톤, 피사체는 오른쪽 1/3. photo 는 밝은 자연광 에디토리얼. 사람 얼굴은 정면 클로즈업 피하기.
- 재생성은 편당 최대 1장. 429(rate limit)로 접수 실패한 건 작업이 안 생긴 것이니 그 항목만 다시 보낸다.

## 수요일 캡션 (기존 계정 형식, 900~1,400자)

1. 첫 줄 훅: 이모지 1개 + 한 문장(핵심 상황·반전).
2. 맥락 2~3문단 → `📌` 핵심 한 줄 → 설명.
3. 구조 문단(예전/이제 또는 ✔️ 세 줄).
4. 마무리 원칙 1~2문장 → 시청자 질문 1줄.
5. `🔍 원문은 브런치에서 더 길게 읽어보실 수 있습니다.` → 저장 유도 1줄(언제 다시 볼지 구체적으로) → 해시태그 5개(첫 번째 `#브루스매거진`).
- 서명·멘션은 넣지 않는다. 게시기가 `🔍 원문은` 줄 위에 `✍️ 글 마케터 브루스 @heo.boram` 을 끼운다.
- 금지: 시의성 표현("최근", "올해", 날짜·순위), 광고주(클라이언트) 실명·내부 수치, 원문에 없는 사례·숫자, 과장.

## posts/DATE.json

```json
{"date": "YYYY-MM-DD", "type": "carousel", "brunch_no": 0, "title": "원문 제목",
 "brunch_url": "https://brunch.co.kr/@heoboram/0", "status": "render", "caption": "…"}
```
`images`·`qa_url` 은 Actions 가 채운다. 직접 쓰지 않는다.
