# 브루스 인사이트 릴스 자동화

브런치 @heoboram 글 → 30초 릴스(본인 클론 목소리) → 인스타그램 @bruce.insight 화·목·토 07:00 게시, 캡션에 @heo.boram 멘션.
카드뉴스(캐러셀)는 월 07:00 「이번 주 마케팅 이슈」, 수 07:00 브런치 카드뉴스 — 규칙은 `CAROUSEL.md`, 수요일 큐는 `carousel_queue.json`.

## 흐름

| 언제 (KST) | 누가 | 하는 일 |
|---|---|---|
| 매주 일 18:07 | GitHub Actions `naver-issues.yml` | 네이버 검색 API(뉴스·블로그)·데이터랩으로 월요일 이슈 후보 60개를 모아 `candidates/<월요일>.json` 커밋(무료 한도 안, Claude 미사용) |
| 매주 일 19:43 | 클라우드 루틴 「브루스 인사이트 월요일 이슈 카드뉴스」(2026-10-18부터, 토 21:00 루틴 대체) | 월=GPT 트렌드 메일·참고 콘텐츠·직접 수집으로 이슈 10건 → 카드 원고·이미지·캡션 → `status=render` 커밋 → 미리보기 메일 |
| 커밋 직후 | GitHub Actions `insight-reels-cards.yml` | `cards.py` 로 카드 렌더링 → `media/날짜/` 커밋 → `status=scheduled` |
| 매주 월 21:00 | 클라우드 루틴 「브루스 인사이트 릴스 제작」 | 새 글 확인(화요일=그 주 새 글) → 큐에서 나머지 → 대본·내레이션·영상 제작 → `posts/날짜.json` 커밋 → 미리보기 메일 |
| 매일 06:30 | 클라우드 루틴 「브루스 인사이트 보류 확인」(Haiku) | 미리보기 메일에 `보류` 회신이 있으면 그 편 `status`를 `hold`로 바꿔 커밋 |
| 매일 07:00 | GitHub Actions `insight-reels-publish.yml` | 오늘 날짜 `status=scheduled` 파일을 Graph API로 게시(type=carousel 이면 캐러셀), 결과를 `posted`로 기록 |

PC가 꺼져 있어도 전부 돈다.

## 크레딧 배분 (매월 2일 리셋 기준)

**힉스필드 — 스타터 월 270크레딧**

| 항목 | 단가 | 편당 |
|---|---|---|
| 장면 이미지 `gpt_image_2_5` 9:16 × 4장 | 0.25 | 1.0 |
| 영상 클립 `grok_video_v15_lite` 5초 × 1 (사람 얼굴 없는 이미지 → image-to-video) | 5 | 5.0 |
| 연출(펀치인·스포트라이트·라벨·폰 목업·좌우 비교·전환)·BGM — `compose.py` | 0 | 0 |
| **편당 표준** | | **6.0** |

- 2026-10-15부터 유튜브 EP005 5차 방식을 릴스에도 쓴다(Bruce 결정): 클립 1개 + 채널 BGM + eleven_v4 2테이크.
- 주 3편 ≈ 월 13편 × 6 = **약 78**, 카드뉴스(주 2회) 약 7 → 릴스·카드뉴스 몫 **약 85 / 120**.
- 클립은 사람 얼굴이 없는 장면만(2026-10-02 파일럿에서 얼굴이 일그러졌다 — 사물·공간·손·뒷모습은 EP005에서 문제 없음). 일그러지면 정지 이미지로 되돌린다.
- 이미지 재생성은 편당 최대 2장(0.5)까지. 사이클 누적 90 넘으면 클립 생략, 110 넘으면 재생성 없음.

**일레븐랩스 — 내레이션만**

- 음성 `ZuzhDyVIYUQSaEkxo38e`(Bruce Heo | 브루스), 모델 **`eleven_v4`**, **`generations_count: 2`**(기본값 4는 쓰지 않는다) → `scripts/voice_pick.py`로 한 테이크를 고른다.
- 짧은 대본은 v4도 글자당 약 1크레딧(긴 챕터만 0.41) — 편당 약 240 × 2테이크 = **약 480크레딧**, 월 13편 ≈ **6,200크레딧** (2026-10-15 실측).
- BGM은 유튜브 채널 곡(`bruce-youtube/channel/bgm/bgm.mp3`)을 편마다 다른 구간으로 재사용 — 추가 크레딧 0.
- 재녹음은 오독이 있을 때만, 주 1회까지.

## 대본 규칙

- 230~250자, 첫 문장은 장면이나 역설로 시작(3초 훅). 마지막은 시청자에게 던지는 질문.
- 시의성 표현 금지: "최근", "올해", "이번 달", 날짜, 순위 등.
- 광고주(클라이언트) 실명·내부 수치 금지. 원문에 있으면 "한 브랜드"로 익명화.
- 숫자는 한글로 읽히게 쓴다(200만 → 이백만). 자막은 아라비아 숫자.

## 업로드 설정 (1회, 사용자 직접 — 토큰은 Claude가 다룰 수 없음)

Instagram 로그인 방식(`graph.instagram.com`)을 쓴다. **페이스북 페이지 연결이 필요 없다.**

1. 인스타 앱 → @bruce.insight → 설정 → 계정 유형 → **프로페셔널(크리에이터 또는 비즈니스)** 전환
2. developers.facebook.com → 앱 만들기 → 유형 「비즈니스」 → 제품 **Instagram** 추가 → 「Instagram 로그인을 통한 API 설정」
3. 「액세스 토큰 생성」에서 @bruce.insight 로그인 → 권한 `instagram_business_basic`, `instagram_business_content_publish` 승인 → 장기 토큰(60일) 발급
4. 같은 화면에 나오는 **Instagram 비즈니스 계정 ID**(숫자)를 확인
5. 이 저장소 Settings → Secrets and variables → Actions → Secrets
   - `IG_ACCESS_TOKEN` = 3번 토큰
   - `IG_USER_ID` — 워크플로 기본값 `17841459178252032`(@bruce.insight)라 등록 불필요
6. Actions 탭 → Insight reels publish → Run workflow → 날짜 입력으로 시험 게시

선택 Variables: `IG_MENTION`(기본 `heo.boram`), `IG_AI_LABEL`(기본 true — AI 사용 표시, 끄려면 false), `IG_GRAPH_HOST`(페이스북 로그인 방식 토큰이면 `graph.facebook.com`).

**토큰 만료**: 장기 토큰은 60일. 만료 전에 `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<토큰>` 으로 갱신하고 Secret 을 바꿔 넣는다(발급일 + 50일쯤 캘린더 알림 권장).

**게시 흐름**(Meta 문서 기준): `POST /{IG_ID}/media`(media_type=REELS, video_url, caption, cover_url, share_to_feed, is_ai_generated) → `GET /{container}?fields=status_code` 를 1분 간격으로 FINISHED 까지 → `POST /{IG_ID}/media_publish`. 영상은 힉스필드 CDN 공개 URL이라 Meta가 직접 가져간다. 24시간 100건 제한은 주 2건이라 무관.

## 파일

- `queue.json` 제작 순서와 상태(todo/made/skip)
- `posts/YYYY-MM-DD.json` 게시 예약(scheduled/hold/posted)
- `media/YYYY-MM-DD.mp4`·`.jpg` 완성 영상·표지 보관본(편당 약 4.5MB, 연 약 450MB). 힉스필드 링크가 죽으면 게시기가 `bruceheo.com/insight-reels/media/` 사본으로 올린다
- `ledger.json` 월별 크레딧 지출 기록
- `scripts/compose.py` 합성기(힉스필드 샌드박스에서 실행)
- `scripts/publish_ig.py` 게시기(GitHub Actions)
