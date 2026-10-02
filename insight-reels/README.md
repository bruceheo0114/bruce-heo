# 브루스 인사이트 릴스 자동화

브런치 @heoboram 글 → 30초 릴스(본인 클론 목소리) → 인스타그램 @bruce.insight 화·목 07:00 게시, 캡션에 @heo.boram 멘션.

## 흐름

| 언제 (KST) | 누가 | 하는 일 |
|---|---|---|
| 매주 일 21:00 | 클라우드 루틴 「브루스 인사이트 릴스 제작」 | 새 글 확인 → 큐에서 다음 2편 → 대본·내레이션·영상 제작 → `posts/날짜.json` 커밋 → 미리보기 메일 |
| 화·목 06:30 | 클라우드 루틴 「브루스 인사이트 보류 확인」 | 미리보기 메일에 `보류` 회신이 있으면 그 편 `status`를 `hold`로 바꿔 커밋 |
| 화·목 07:00 | GitHub Actions `insight-reels-publish.yml` | 오늘 날짜 `status=scheduled` 파일을 Graph API로 게시, 결과를 `posted`로 기록 |

PC가 꺼져 있어도 셋 다 돈다.

## 크레딧 배분 (매월 2일 리셋 기준)

**힉스필드 — 스타터 월 270크레딧**

| 항목 | 단가 | 편당 |
|---|---|---|
| 장면 이미지 `gpt_image_2_5` 9:16 × 4장 | 0.25 | 1.0 |
| 연출(펀치인·스포트라이트·라벨·폰 목업·좌우 비교·전환) — `compose.py` | 0 | 0 |
| **편당 표준** | | **1.0** |

- 월 최대 9편 × 1 = **9 / 270**. 생성 영상(클립)은 쓰지 않는다 — 연출은 합성 단계에서 무료로 만든다.
- 이미지가 마음에 안 들어도 재생성은 편당 최대 2장(0.5)까지. 월 상한 30.
- `grok_video_v15_lite` 금지(2026-10-02 파일럿에서 캐릭터 얼굴이 일그러짐).

**일레븐랩스 — 내레이션만**

- 음성 `ZuzhDyVIYUQSaEkxo38e`(Bruce Heo | 브루스), 모델 `eleven_multilingual_v2`, **`generations_count: 1` 고정**(기본값 4는 비용 4배).
- 대본 230~250자 = 약 27~30초 = 편당 약 230~250크레딧, 월 9편 ≈ 2,200크레딧.
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
- `ledger.json` 월별 크레딧 지출 기록
- `scripts/compose.py` 합성기(힉스필드 샌드박스에서 실행)
- `scripts/publish_ig.py` 게시기(GitHub Actions)
