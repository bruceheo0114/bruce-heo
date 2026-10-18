# 브런치 일일 콘텐츠 자동화

이 저장소는 매일 오전 8시(KST)에 브런치 `@heoboram`의 새 글을 확인합니다. 홈페이지는 발견 즉시 최신 공개 글 12개로 갱신하고, 새 글마다 브루스 인사이트 카드뉴스 소스·Instagram 캡션·LinkedIn 문안을 만듭니다. GitHub Actions에서 실행되므로 개인 PC가 꺼져 있어도 동작합니다.

## 원고 작성 흐름 (OpenAI 미사용)

1. Actions(08:00 KST)가 새 글을 찾아 홈페이지를 갱신하고, 원고가 필요한 글마다 원문을 `content/{article-id}/source.json`으로 저장합니다.
2. Claude 루틴(매일 13:47 KST)이 `content/routine_writer_prompt.md` 규칙대로 가장 오래된 글 한 편의 원고를 `content/{article-id}/draft.json`으로 쓰고, `node src/cli/validate-draft.js {article-id}` 검사를 통과하면 main에 푸시합니다.
3. `draft.json` 푸시가 Actions를 다시 실행해 카드 이미지·manifest·PR을 만들고, PR은 확인 없이 바로 자동 병합됩니다. 원고가 아직 없는 글은 실패 없이 다음 실행으로 넘어갑니다.

## 채널별 동작

- 홈페이지: 새 글을 최신순으로 반영하고 항상 12개만 유지합니다.
- Instagram: 브런치 카드뉴스는 더 쓰지 않습니다(2026-10-18). 인스타는 아래 「Instagram 자동 게시」의 매일 릴스 + 월요일 트렌드뿐입니다.
- LinkedIn: 개인 계정 본문을 게시하고 브런치 원문 링크를 첫 댓글로 등록합니다.
- PR 병합을 승인으로 기록하고, LinkedIn 피드 글은 승인 뒤 첫 **화요일 07:30(KST)**에 게시합니다. 한 번에 여러 글이 승인되면 오래된 글부터 한 주에 한 편씩 예약합니다.
- LinkedIn 뉴스레터는 API로 발행할 수 없어서, **목요일 아침** Claude 루틴이 그 주 피드 글의 뉴스레터 원고(`content/{article-id}/newsletter.md`)를 만들어 메일로 보냅니다. 발행은 직접 붙여넣어 합니다(`content/routine_newsletter_prompt.md`).
- 주간 흐름: 월 21:00 브런치 → 화 07:30 LinkedIn 피드 글(자동) → 목 아침 뉴스레터 원고 메일(발행은 직접).

## 홈페이지 최신 유튜브 영상 (매일 한 번 자동)

- `.github/workflows/youtube-latest.yml` 이 매일 21:37(KST)에 `node src/cli/youtube-latest.js` 를 한 번 실행합니다. 유튜브 채널(`@bruce.insight`)의 RSS 피드에서 **쇼츠를 뺀 가장 새 공개 영상**을 찾아, 홈페이지 `index.html`·`en/index.html` 의 `YOUTUBE_LATEST_START/END` 사이 영상 카드(영상·제목·설명)를 바꿉니다. 바뀐 게 있을 때만 `chore: update homepage video` 로 main 에 커밋하고 GitHub Pages 가 배포합니다.
- 홈페이지에 이미 같은 영상이 들어 있으면 손으로 다듬은 제목·설명은 그대로 둡니다(첫 실행도 지금 영상이 가장 새 영상이면 아무것도 바꾸지 않습니다).
- 한국어 카드는 영상 제목과 영상 설명의 첫 문단(링크·해시태그 제외, 150자)을 씁니다. 영문 카드는 한글이 보이면 안 되어서 영어 고정 문구("New video essay")를 쓰고, `data/youtube-latest.json` 의 `video.en` 에 `{ "title": "…", "description": "…" }` 를 미리 넣어 두면 그 문구를 씁니다.
- 채널 ID 는 첫 실행에서 채널 주소로 찾아 `data/youtube-latest.json` 에 저장합니다. 찾지 못해 실패하면 저장소 **Settings → Secrets and variables → Actions → Variables** 에 `YOUTUBE_CHANNEL_ID`(`UC…`)를 넣으세요. API 키는 필요 없습니다.
- 피드를 읽지 못하면 홈페이지를 건드리지 않고 실행만 실패로 표시합니다. 수동 실행은 Actions 의 **YouTube latest video → Run workflow** 입니다.
- 비공개·일부공개·예약 영상은 피드에 나오지 않으므로 공개된 뒤 그날 21:37 확인 때 반영됩니다(바로 보고 싶으면 Actions 에서 수동 실행).

## 월요일 이슈 후보 수집 (네이버 오픈 API, 매주 일 18:07 KST)

- `.github/workflows/naver-issues.yml` 이 `node src/cli/naver-issues.js` 를 실행해 분야별 뉴스 검색(정확도순·최신순) → 같은 이야기 묶기 → 상위 후보의 최근 7일 블로그 글 수·데이터랩 검색량 변화를 붙여 `insight-reels/candidates/<월요일>.json` 으로 커밋합니다. 19:43 카드 루틴이 이 파일을 0라운드 후보로 먼저 읽습니다(`insight-reels/CAROUSEL.md`).
- 키는 Secrets 의 `NAVER_CLIENT_ID`·`NAVER_CLIENT_SECRET` 에 둡니다. 두 곳 키 모두 됩니다(키 모양으로 고르고, 인증이 안 되면 다른 쪽으로 한 번 더 시도).
  - **네이버 개발자센터**(developers.naver.com → 내 애플리케이션, 보통 ID 20자·Secret 10자): 계속 무료. 검색 하루 25,000회·데이터랩 하루 1,000회. 사용 API 에 **검색**과 **데이터랩(검색어 트렌드)** 이 있어야 합니다.
  - **네이버 클라우드 API HUB**(보통 ID 10자·Secret 40자): 종량제이며 2026-10 기준 한시적 무료(유료 전환은 사전 공지). 유료 공지가 오면 개발자센터 키로 Secrets 만 바꾸면 됩니다.
- 한 번에 100회 남짓 호출합니다. 어느 쪽 키로 돌았는지는 결과 파일의 `source` 와 실행 로그에 남습니다.
- 같은 실행에서 `node src/cli/naver-mentions.js` 가 지난 7일 블로그·카페·뉴스에서 브루스 이름·브랜드·최근 브런치 글 제목 언급(내 채널 글 제외)을 모아 `data/brand-mentions.json` 으로 남깁니다. 일요일 카드 루틴이 미리보기 메일 맨 아래 「이번 주 브루스 언급」으로 붙입니다.
- **스레드 훅 검색량(매주 금 20:07 KST)**: `naver-hooks.yml` 이 `threads/queue.json` 의 다음 글 10편마다 원문 속 이름의 데이터랩 검색량을 비교해 `threads/trends/<날짜>.json` 으로 커밋하고, 21:00 스레드 원고 루틴이 훅에 넣을 이름을 고를 때 씁니다(`threads/THREADS.md` 「검색량 힌트」).
- 데이터랩·블로그 호출이 실패해도 뉴스 후보는 남기고 파일의 `warnings` 에 적습니다. 수동 실행은 Actions 의 **Naver weekly issue candidates → Run workflow** 입니다.

## 처음 한 번 설정

1. GitHub 저장소의 **Settings → Pages**에서 `main` 브랜치 루트를 배포 대상으로 유지합니다.
2. **Settings → Actions → General → Workflow permissions**에서 읽기·쓰기 권한과 Actions의 Pull Request 생성을 허용합니다.
3. **Settings → Secrets and variables → Actions**의 Secrets에 다음 값을 추가합니다.
   - `LINKEDIN_ACCESS_TOKEN`
   - `LINKEDIN_PERSON_URN` (`urn:li:person:...`)
4. 같은 화면의 Variables에 `LINKEDIN_API_VERSION`을 추가합니다. 기본값은 `202605`입니다.
5. LinkedIn 앱에 인증된 개인 회원의 게시·댓글 권한을 연결합니다.
6. PR을 병합한 뒤 Actions의 **Brunch daily content**를 한 번 수동 실행해 연결 상태를 확인합니다.

토큰과 키는 파일에 기록하지 않습니다. `.env.example`은 로컬 변수 이름만 설명하며 실제 값은 GitHub Secrets에만 둡니다.

## 리멤버 커넥트

- 자동화하지 않습니다. 사용자가 요청하면 브런치 원글을 바탕으로 직접 진행합니다.
- LinkedIn은 위 주간 흐름대로 자동화합니다(2026-10-12 결정). 그 전에 쌓인 213·222는 `skipped_manual`로 자동 게시에서 뺐습니다.

## LinkedIn 개인 계정

- 게시 작성자는 회사 페이지가 아니라 인증된 개인 계정입니다.
- LinkedIn Developer 앱의 **Products**에서 **Share on LinkedIn**을 추가하면 개인 게시에 필요한 `w_member_social` 권한을 받을 수 있습니다.
- **Sign In with LinkedIn using OpenID Connect**도 추가하고 `openid profile` 범위로 인증합니다. `userinfo` 응답의 `sub` 앞에 `urn:li:person:`을 붙인 값을 `LINKEDIN_PERSON_URN`으로 사용합니다.
- 자동 첫 댓글은 별도 Comments API 권한인 `w_member_social_feed`가 필요합니다. 이 권한은 Community Management API 접근 승인이 있어야 토큰 생성 화면에 나타날 수 있습니다.
- `w_member_social_feed` 승인을 받지 못하면 개인 본문 자동 게시까지만 가능하며, 첫 댓글은 수동 복사 방식으로 바꾸어야 합니다.
- 토큰이 만료되거나 권한이 철회되면 LinkedIn 게시를 멈추고 GitHub Issue를 만듭니다. 새 토큰을 같은 Secret 이름으로 교체하면 다음 슬롯에 재시도합니다.

## Instagram 자동 게시 (@bruce.insight) — 2026-10-20부터 화~일 릴스

| 요일 | 내용 |
|---|---|
| 월 07:00 | 이번 주 마케팅 이슈 10건 카드뉴스(일요일 카드 루틴) — 월요일은 릴스를 쉰다 |
| 화~일 07:00 | 브런치 글 릴스(전날 21:13 릴스 루틴이 만듦, `insight-reels/routine_daily_prompt.md`) |
| 수·금 12:30 | 카드뉴스 — 수 「검색량 리포트」(네이버 데이터랩) · 금 「레퍼런스 모음」(주제별 사례). 전날 19:37 루틴이 원고·표지·캡션을 쓰고 `insight-reels-decks.yml` 이 LG 카드뉴스 렌더러로 그린다(`posts/<날짜>.noon.json`, `insight-reels/routine_noon_cards_prompt.md`) |

- **한 글 → 여러 릴스**: 앞서 만든 각도와 핵심 주장·첫 사례·첫 단어가 겹치지 않으면 같은 글로 다른 릴스를 만든다(`insight-reels/queue.json` 의 `angles`).
- **시의성 훅(네이버 API)**: 월~토 20:07 `naver-reels.yml` 이 쓸 수 있는 글마다 원문 속 이름의 데이터랩 검색량·최근 7일 뉴스를 `insight-reels/trends/<다음 날>.json` 에 남기고, 루틴이 지금 뜨는 이름으로 첫 문장을 연다(르게다꼼 공식).
- **브런치 카드뉴스는 쓰지 않는다(2026-10-18)**: `schedule-instagram.js`·`card-backlog.js` 를 일일 자동화에서 뺐고, 예약돼 있던 10/21~11/6 카드뉴스는 `status: cancelled` 로 내렸다. `content/<id>/cards` 는 기록으로만 남는다.

## Instagram 업로드 소스

각 글의 `content/{article-id}/` 폴더에 다음 결과가 생성됩니다.

- `cards/01.jpg`부터 `cards/07.jpg`~`10.jpg`: 업로드 순서가 고정된 정사각형 카드
- `preview.html`: 카드 전체 미리보기
- `instagram-caption.txt`: 그대로 복사할 캡션
- `manifest.json`: 원문, 카드 문구, 대체 텍스트와 생성 정보

카드는 `@bruce.insight`의 검은색 `BR.` 마크, 초록색 아웃라인 라벨, 민트 강조색, 아이보리 정보 영역, 이미지/본문 비율을 고정한 HTML/CSS 렌더러로 만듭니다. 이미지가 부족한 경우 생성 이미지로 억지로 채우지 않고 같은 디자인의 텍스트 중심 카드로 만듭니다.

로그인된 PC에서 Chrome을 열어 둔 상태라면 Codex에게 업로드를 요청할 수 있습니다. 이 방식은 이미지와 캡션을 채워 넣는 반자동 보조이며, PC가 켜져 있어야 하고 로그인·2단계 인증이 필요할 수 있습니다. 외부에 공개되는 마지막 **공유** 클릭은 매번 사용자 확인을 받은 뒤 진행합니다.

## 검수와 게시

- 카드 전체 이미지, LinkedIn 본문·첫 댓글, Instagram 캡션은 GitHub Draft PR에 모입니다.
- 첫 3편은 내용을 확인한 뒤 PR을 **Ready for review**로 바꾸고 병합해야 LinkedIn 대기열에 들어갑니다.
- LinkedIn 본문과 첫 댓글이 모두 성공한 글만 검수 성공 횟수에 포함됩니다.
- 3회 연속 성공하면 이후 생성 PR은 테스트 통과 후 자동 병합되지만 Instagram 게시 자체는 계속 수동입니다.
- PR 병합 시각이 승인 시각입니다. 승인 뒤 첫 화요일 07:30(KST)에 게시합니다.

## 운영과 복구

- 브런치 구조가 바뀌거나 원고 품질 검사·LinkedIn 토큰 오류가 나면 열린 장애 Issue에 실행 링크가 누적됩니다.
- LinkedIn 본문 게시 후 첫 댓글만 실패하면 게시물 ID를 저장하고 첫 댓글만 재시도합니다.
- 실제 LinkedIn 게시 없이 다음 항목을 검사하려면 **Publish due LinkedIn content**를 수동 실행하면서 `dry_run`을 켭니다.
- GitHub 예약(cron)은 몇 시간씩 밀리거나 빠질 수 있어서 **Publish clock** 워크플로가 계속 이어서 돌며 07:00(매일 인사이트)·07:17(브런치 캐시)·08:00(브런치 일일)·12:30(스레드, 수·금 카드뉴스)·20:07(릴스 시의성 수집, 월~토)에 각 워크플로를 직접 시작합니다. 멈췄으면 Actions에서 **Publish clock**을 한 번 수동 실행하면 됩니다. 2시간마다 예약 실행이 자동으로 되살리기도 합니다.
- GitHub 예약 실행은 UTC 기준입니다. `0 23 * * *`는 매일 08:00 KST, 게시 시각은 GitHub 예약 대신 Publish clock(`scripts/publish_clock.py`)이 맞춥니다.


## YouTube 영상 에세이 (bruce-youtube)

브런치 글(2026년 이후)을 10~15분 영상 에세이 「브루스 인사이트」 영상으로 만드는 자동 파이프라인입니다. 매주 화 21:13 클라우드 루틴이 그 주 월요일에 올라온 새 브런치 글로, 새 글이 없으면 `bruce-youtube/queue.json`의 예비 글로 대본(소리 내어 읽고 다듬기)·복제 목소리 내레이션·AI 장면(월 150 크레딧 안)·편집까지 한 번에 끝내고, 완성 영상을 Claude 앱으로 보냅니다. YouTube 업로드는 직접 합니다. 자세한 내용은 `bruce-youtube/README.md`를 봅니다.

## 브런치 원문 백업 (bruceheo.com/writing/)

브런치 108번 글부터 최신 글까지 원문(문단·굵게·이미지와 캡션·YouTube 영상)을 `bruceheo.com/writing/{글번호}/`에서 그대로 읽을 수 있게 백업합니다. 목록은 `bruceheo.com/writing/`입니다.

- **Brunch archive** 워크플로가 매일 08:41(KST)에 새 글과 최근 7일 안에 올라온 글을 받아 `data/archive/{글번호}.json`에 저장하고 `writing/` 페이지를 다시 만듭니다. 수동 실행도 됩니다.
- 본문 이미지와 커버 이미지는 `writing/{글번호}/images/`에 내려받아 저장소에 함께 보관합니다. 용량을 줄이려고 가로 1080px 이하·화질 70의 WebP로 변환해 저장합니다(112편 이미지 282장이 약 14MB). 브런치에서 이미지가 사라져도 남습니다. 내려받지 못한 이미지는 경고만 남기고 브런치 주소를 그대로 씁니다. 이미지만 다시 받으려면 `node src/cli/archive.js --images`를 실행합니다. 링크 미리보기(카카오톡·링크드인 등)는 WebP를 못 보여 주므로, 커버로 만든 1200×630 JPG(`writing/{글번호}/og.jpg`)를 공유 이미지로 씁니다.
- 검색 결과에 bruceheo.com 글이 나오도록 각 페이지의 canonical은 자기 주소(`bruceheo.com/writing/{글번호}/`)이고, 글 정보(BlogPosting)를 담습니다. 백업할 때마다 `sitemap.xml`도 다시 만들고, `robots.txt`가 이를 알려 줍니다.
- 특정 글을 다시 받으려면 `node src/cli/archive.js --refresh 108`, 페이지만 다시 만들려면 `node src/cli/archive.js --render`를 실행합니다(브런치 접속은 Actions에서만 됩니다).
- 시작 글 번호는 `src/config.js`의 `archiveFromId`입니다.
- 홈페이지(한·영) Writing 목록의 글은 백업이 끝난 글이면 브런치 대신 `/writing/{글번호}/`로 연결됩니다. 08:00 일일 자동화가 막 추가한 새 글은 08:41 백업 뒤에 사이트 링크로 바뀝니다. 「전체 글 보기」도 `/writing/`으로 연결됩니다.

## 홈페이지 구조 (2026-10-12 개편)

- 메인(`index.html`)은 소개·더 보기 카드·Writing(최신 6편 노출)·Content·Contact만 둡니다. 경력은 `/career/`, 대표 작업은 `/work/`, 세션·강연은 `/talks/`에 있습니다.
- 색과 스타일은 공용 `assets/site.css`에 있고, 브루스 인사이트(인스타·유튜브)와 같은 아이보리 `#F2F1ED`·검정 `#111`·민트 `#65B98A`·초록 `#23744C`와 BR. 마크를 씁니다.
- 영문 홈페이지도 같은 구조입니다: `/en/` 메인과 `/en/career/`·`/en/work/`·`/en/talks/`. 한·영 페이지의 KR/EN 버튼은 같은 내용의 페이지로 연결됩니다.
- 포트폴리오(`portfolio-heoboram.html`)도 같은 색·BR 마크·제목 굵기로 맞췄습니다.

## 방문 통계 (Google 애널리틱스 4)

- 측정 ID `G-17SXL7Q2XV`(`src/config.js`의 `gaMeasurementId`)를 모든 공개 페이지 `<head>`에 넣었습니다. 백업 글 페이지는 매일 생성될 때 자동으로 들어갑니다.
- 페이지 하단에 Google 애널리틱스 사용 안내를 표시합니다.
- 통계는 https://analytics.google.com 또는 Google Analytics 앱에서 봅니다(보고서 → 참여도 → 페이지 및 화면).

## 콘텐츠 허브 (2026-10-14 개편)

- 홈 순서: 첫 화면(허보람(브루스)·최신 칼럼 읽기·맥락으로 읽는 마케팅) → 지금 읽을 만한 글(최신 3편 + 먼저 읽을 글 3편) → 맥락으로 읽는 마케팅 → 소개 → 경력·작업·세션 카드 → 콘텐츠 → 문의.
- `data/writing-meta.json` 한 곳에서 관리합니다.
  - `posts.{글번호}.category`: `brand`(브랜드·캠페인) · `culture`(소비자·문화) · `judgment`(마케터의 판단) · `work`(AI·일하는 법). 분류가 없는 새 글은 페이지를 만들 때(08:41 백업·`--render`) 본문이 가장 비슷한 분류된 글 7편을 보고 자동으로 분류하고 `"auto": true`를 남깁니다(기존 글로 시험하면 약 80% 맞음). Actions 로그에 알림이 뜨니 확인 후 분류를 고치거나 `auto`를 지우면 됩니다.
  - `posts.{글번호}.insight`: 글 하단 '이 글을 맥락으로 읽으면' 문장(1~2문장). 없으면 그 칸을 만들지 않습니다.
  - `picks`: 홈과 `/writing/`의 '먼저 읽을 글'(3편). `contextCases`: `/context/`의 사례 카드.
- 이 파일을 고친 뒤 `node src/cli/archive.js --render`(또는 다음 날 08:41 백업)를 실행하면 홈·글 목록·글 페이지·`/context/`에 반영됩니다.
- 글 하단 '함께 읽으면 좋은 글'은 같은 분류에서 발행일이 가까운 3편을 자동으로 고릅니다.

## 월 크레딧 계획 (2026-10-15, 유튜브·릴스 같은 제작 방식 — eleven_v4 2테이크 · 채널 BGM · 클립)

| 항목 | 편당 | 월 편수 | ElevenLabs | Higgsfield |
|---|---|---|---|---|
| 유튜브 롱폼(5~6분) | 음성 약 2,500(2테이크 + 챕터 재생성 여유) · 이미지 약 2 + 클립 2개 10 | 4.3 | 약 10,800 | 약 52 / 150 |
| 유튜브 쇼츠 3편 | 롱폼에서 잘라냄 | 13 | 0 | 0 |
| 인스타 릴스(30초, 화~일) | 음성 약 480(2테이크) · 이미지 1 + 클립 1개 5 | 26 | 약 12,500 | 약 156 |
| 카드뉴스(월) | 이미지 약 0.25 | 4.3주 | 0 | 약 1 (릴스와 합쳐 약 157 / 170) |
| **합계** | | | **약 23,300 / 월** | **약 209 / 270** |

- 받아쓰기: 생성한 음성은 0. 음악·업로드 파일 받아쓰기는 유료(6분 곡 2,035) — BGM 보컬 확인 같은 일회성만.
- BGM은 채널 곡 하나를 유튜브·릴스가 같이 쓴다(새로 만들 때만 약 5,500).
- 실제 지출은 `bruce-youtube/ledger.json`(유튜브 Higgsfield)·`insight-reels/ledger.json`(릴스·카드뉴스)에 적는다.
- 영상 클립 모델 가격(2026-10-15 견적, 5초): Grok Lite 5 · Seedance 2.0 Mini 5 · Seedance 1.5 Pro(4초) 4.8 · Kling 3.0 Turbo 7.5 · Seedance 2.0 fast 12.5 · Seedance 2.5 35(480p·무음 15). 같은 값이면 Seedance 2.0 Mini를 시험해 볼 만하다.
