# 브런치 일일 콘텐츠 자동화

이 저장소는 매일 오전 8시(KST)에 브런치 `@heoboram`의 새 글을 확인합니다. 홈페이지는 발견 즉시 최신 공개 글 12개로 갱신하고, 새 글마다 브루스 인사이트 카드뉴스 소스·Instagram 캡션·LinkedIn 문안을 만듭니다. GitHub Actions에서 실행되므로 개인 PC가 꺼져 있어도 동작합니다.

## 채널별 동작

- 홈페이지: 새 글을 최신순으로 반영하고 항상 12개만 유지합니다.
- Instagram: API 게시를 하지 않습니다. 1080×1080 JPEG 7~10장, 전체 미리보기, 복사 가능한 캡션 파일만 생성합니다.
- LinkedIn: 개인 계정 본문을 게시하고 브런치 원문 링크를 첫 댓글로 등록합니다.
- PR 병합을 승인으로 기록하고, LinkedIn은 승인 다음 날부터 매일 06:30(KST)에 한 편씩 처리합니다. 한 번에 여러 글이 승인되면 오래된 글부터 하루 한 편씩 예약합니다.

## 처음 한 번 설정

1. GitHub 저장소의 **Settings → Pages**에서 `main` 브랜치 루트를 배포 대상으로 유지합니다.
2. **Settings → Actions → General → Workflow permissions**에서 읽기·쓰기 권한과 Actions의 Pull Request 생성을 허용합니다.
3. **Settings → Secrets and variables → Actions**의 Secrets에 다음 값을 추가합니다.
   - `OPENAI_API_KEY`
   - `LINKEDIN_ACCESS_TOKEN`
   - `LINKEDIN_PERSON_URN` (`urn:li:person:...`)
4. 같은 화면의 Variables에 `LINKEDIN_API_VERSION`을 추가합니다. 기본값은 `202605`입니다.
5. LinkedIn 앱에 인증된 개인 회원의 게시·댓글 권한을 연결합니다.
6. PR을 병합한 뒤 Actions의 **Brunch daily content**를 한 번 수동 실행해 연결 상태를 확인합니다.

토큰과 키는 파일에 기록하지 않습니다. `.env.example`은 로컬 변수 이름만 설명하며 실제 값은 GitHub Secrets에만 둡니다.

## LinkedIn 개인 계정

- 게시 작성자는 회사 페이지가 아니라 인증된 개인 계정입니다.
- LinkedIn Developer 앱의 **Products**에서 **Share on LinkedIn**을 추가하면 개인 게시에 필요한 `w_member_social` 권한을 받을 수 있습니다.
- **Sign In with LinkedIn using OpenID Connect**도 추가하고 `openid profile` 범위로 인증합니다. `userinfo` 응답의 `sub` 앞에 `urn:li:person:`을 붙인 값을 `LINKEDIN_PERSON_URN`으로 사용합니다.
- 자동 첫 댓글은 별도 Comments API 권한인 `w_member_social_feed`가 필요합니다. 이 권한은 Community Management API 접근 승인이 있어야 토큰 생성 화면에 나타날 수 있습니다.
- `w_member_social_feed` 승인을 받지 못하면 개인 본문 자동 게시까지만 가능하며, 첫 댓글은 수동 복사 방식으로 바꾸어야 합니다.
- 토큰이 만료되거나 권한이 철회되면 LinkedIn 게시를 멈추고 GitHub Issue를 만듭니다. 새 토큰을 같은 Secret 이름으로 교체하면 다음 슬롯에 재시도합니다.

## Instagram 수동 업로드 소스

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
- PR 병합 시각이 승인 시각입니다. 승인 당일에는 게시하지 않고, 다음 날 오전 06:30(KST)에 게시합니다.

## 운영과 복구

- 브런치 구조가 바뀌거나 OpenAI·LinkedIn 토큰 오류가 나면 열린 장애 Issue에 실행 링크가 누적됩니다.
- LinkedIn 본문 게시 후 첫 댓글만 실패하면 게시물 ID를 저장하고 첫 댓글만 재시도합니다.
- 실제 LinkedIn 게시 없이 다음 항목을 검사하려면 **Publish due LinkedIn content**를 수동 실행하면서 `dry_run`을 켭니다.
- GitHub 예약 실행은 UTC 기준입니다. `0 23 * * *`는 매일 08:00 KST, `30 21 * * *`는 다음 날 06:30 KST입니다.

