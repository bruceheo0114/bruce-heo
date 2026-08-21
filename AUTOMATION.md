# 브런치 주간 콘텐츠 자동화

이 저장소는 매주 금요일 18:00(KST)에 브런치 `@heoboram`의 새 글을 확인합니다. 홈페이지는 즉시 최신 공개 글 12개로 갱신하고, 새 글마다 브루스 인사이트 카드뉴스·LinkedIn 문안·Instagram 캡션을 만듭니다. 게시 작업은 매일 18:30(KST)에 오래된 글부터 한 편만 처리합니다.

## 처음 한 번 설정

1. GitHub 저장소의 **Settings → Pages**에서 `main` 브랜치 루트를 배포 대상으로 유지합니다.
2. **Settings → Actions → General → Workflow permissions**에서 읽기·쓰기 권한과 Actions의 Pull Request 생성을 허용합니다.
3. **Settings → Secrets and variables → Actions**에 아래 Secrets를 추가합니다.
   - `OPENAI_API_KEY`
   - `LINKEDIN_ACCESS_TOKEN`
   - `LINKEDIN_PERSON_URN` (`urn:li:person:...`)
   - `IG_ACCESS_TOKEN`
   - `IG_USER_ID`
4. 같은 화면의 Variables에 아래 값을 추가합니다.
   - `PUBLIC_SITE_URL`: `https://bruceheo0114.github.io/bruce-heo`
   - `LINKEDIN_API_VERSION`: `202605` (지원 버전 변경 시 갱신)
   - `META_GRAPH_VERSION`: `v25.0` (지원 버전 변경 시 갱신)
   - `IG_COLLABORATOR_USERNAME`: `heo.boram`
   - `IG_TAG_USERNAME`: `heo.boram`
5. LinkedIn 앱에 회원 게시 권한을 연결하고, Meta 앱에는 Instagram Professional 계정 `@bruce.insight`와 콘텐츠 게시 권한을 연결합니다.
6. Actions의 **Brunch weekly content**를 수동 실행해 연결 상태를 확인합니다. 저장소에는 2026-08-21 기준 초기 동기화가 포함되어 있으며 기존 글은 SNS 소급 게시 대상에서 제외되어 있습니다.

토큰과 키는 파일에 기록하지 않습니다. `.env.example`은 로컬 변수 이름만 설명하며 실제 값은 GitHub Secrets에만 둡니다.

## 검수와 자동 전환

- 신규 글의 카드 전체 이미지, LinkedIn 본문·첫 댓글, Instagram 캡션은 GitHub Draft PR에 모입니다.
- 첫 3편은 내용을 확인한 뒤 PR을 **Ready for review**로 바꾸고 병합해야 게시 대기열에 들어갑니다.
- LinkedIn과 Instagram이 모두 성공한 글만 승인 성공 횟수에 포함됩니다.
- 3회 연속 성공하면 상태가 `auto`로 바뀌고, 이후 생성 PR은 테스트 통과 후 자동 병합됩니다.
- 자동 모드에서도 브런치 파싱, 문안 규칙, 이미지 크기 검사 중 하나라도 실패하면 병합·게시하지 않고 Issue를 만듭니다.

## 게시 동작

- LinkedIn은 텍스트 게시물만 만들고, 반환된 게시물 URN에 브런치 링크를 첫 댓글로 답니다.
- Instagram은 GitHub Pages에 공개된 1080×1080 JPEG 7~10장을 자식 컨테이너로 만든 후 캐러셀을 게시합니다.
- `@heo.boram` 공동 작성자 요청이 API에서 거절되면 공동 작성자 없이 다시 만들되 이미지 사용자 태그는 유지합니다. 브라우저 자동 클릭은 사용하지 않습니다.
- 한 채널이 실패하면 이미 성공한 채널의 ID를 먼저 저장합니다. 다음 날에는 실패한 채널만 재시도합니다.
- 승인이 예정 시각보다 늦으면, 병합 후 처음 도래하는 18:30 실행에서 게시합니다.

## 데이터 구조

- `data/brunch-posts.json`: 홈페이지 Writing 목록의 원본, 최신순 12개
- `data/automation-state.json`: 글별 채널 상태, 게시 ID, 검수 성공 횟수, `review`/`auto` 모드
- `content/{article-id}/manifest.json`: 원문 해시, 카드 문구와 이미지, 채널 문안, 일정 및 게시 결과
- `content/{article-id}/cards/*.jpg`: Instagram용 카드 이미지
- `content/{article-id}/preview.html`: 카드 전체 로컬 미리보기

## 운영과 복구

- 브런치 구조가 바뀌거나 토큰·권한 오류가 나면 열린 장애 Issue에 실행 링크가 누적됩니다.
- GitHub Actions가 실패한 경우 원인을 해결한 뒤 해당 실행을 다시 실행합니다.
- 실제 게시 없이 다음 항목을 검사하려면 **Publish due social content**를 수동 실행하면서 `dry_run`을 켭니다.
- 로컬 검사는 Node.js 20 이상에서 `pnpm install`, `pnpm test`, `pnpm check` 순서로 실행합니다.

GitHub 예약 실행은 UTC 기준으로 작성되어 있습니다. `0 9 * * 5`는 금요일 18:00 KST, `30 9 * * *`는 매일 18:30 KST입니다.
