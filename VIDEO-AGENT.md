# 영상 요약 에이전트

YouTube 영상(라이브 다시보기 포함)의 대본을 확보해 타임코드가 붙은 한국어 요약을 만들고, Notion에 페이지로 올립니다. 브런치 자동화와 같은 저장소·같은 OpenAI 키를 씁니다.

두 가지 방식으로 씁니다.

- **자동 (권장)**: GitHub Actions가 매일 채널을 확인하고, 라이브가 끝난 지 2일이 지난 영상을 요약해 Notion에 올립니다. PC가 꺼져 있어도 동작합니다. → [자동 운영](#자동-운영)
- **수동**: 영상 하나를 지금 바로 요약해 파일로 받습니다. → 아래 CLI

```bash
npm run video:summarize -- "https://www.youtube.com/live/AKdwQeu7Ed4"
```

결과는 `content/video/{videoId}/`에 쌓입니다.

- `summary.md`: 핵심 요약, 챕터, 핵심 포인트, 인용, 실행 항목. 모든 타임코드는 해당 지점으로 바로 가는 링크입니다.
- `manifest.json`: 같은 내용을 구조화한 JSON. 다른 자동화에서 그대로 읽어 쓸 수 있습니다.
- `transcript.md` / `transcript.json`: 타임코드가 붙은 전체 대본.

## 동작 순서

1. **영상 ID 인식** — `watch?v=`, `youtu.be`, `/live/`, `/shorts/`, `/embed/`, 그리고 11자리 ID를 모두 받습니다. `si=` 같은 추적 파라미터는 무시합니다.
2. **대본 확보** — 아래 순서로 시도하고 처음 성공한 경로를 씁니다.
   1. watch 페이지의 자막 트랙 (추가 설치 없음, 비용 없음)
   2. `yt-dlp` 자막 (플레이어 인증이 필요할 때)
   3. `yt-dlp` 오디오 + OpenAI 받아쓰기 (자막이 아예 없을 때만, 유일하게 비용이 드는 경로)

   사람이 만든 자막을 자동 자막보다 먼저, 요청 언어를 다른 언어보다 먼저 고릅니다. 세 경로가 모두 실패하면 각 단계의 실패 이유를 함께 출력하고 멈춥니다.
3. **요약** — 대본을 겹침이 있는 청크로 나눠 청크마다 사실 노트를 뽑고, 그 노트를 한 번에 합쳐 최종 요약을 만듭니다. 대본이 짧으면 노트 단계를 건너뜁니다.
4. **품질 검사** — 챕터가 시간 순서인지, 모든 타임코드가 영상 길이 안에 있는지 확인합니다. 하나라도 어긋나면 파일을 쓰지 않고 실패합니다.

## 옵션

| 옵션 | 기본값 | 설명 |
| --- | --- | --- |
| `--lang` | `ko` | 우선해서 고를 자막 언어 |
| `--out` | `content/video` | 결과를 저장할 디렉터리 |
| `--captions-only` | 꺼짐 | 자막이 없어도 오디오 받아쓰기로 넘어가지 않습니다. 비용을 0으로 묶고 싶을 때 씁니다 |
| `--transcript-only` | 꺼짐 | 대본만 만들고 요약은 건너뜁니다 |
| `--chunk-characters` | `12000` | 청크 하나의 글자 수 |

대본만 빠르게 확인하려면 `npm run video:transcript -- <URL>`을 씁니다.

## 자동 운영

### 왜 2일 뒤인가

라이브가 끝나면 YouTube 자동 자막이 바로 생기지 않습니다. 길이와 혼잡도에 따라 몇 시간에서 하루 넘게 걸립니다. 그래서 방송 직후가 아니라 **2일 뒤부터** 처리합니다. 그때도 자막이 없으면 매일 다시 시도하고, 방송 후 7일이 지나면 실패로 접고 GitHub Issue를 남깁니다.

두 값 모두 `data/video-series.json`의 `processAfterDays`, `retryDays`로 바꿀 수 있습니다.

자동 운영은 **자막 경로만 씁니다**(`--captions-only`와 같습니다). 자막이 끝내 생기지 않아도 오디오 받아쓰기로 넘어가지 않으므로, 예배 영상이 쌓여도 요약 비용이 예상 밖으로 늘지 않습니다. 자막 없는 영상을 꼭 요약해야 하면 그 영상만 로컬에서 `npm run video:summarize`로 돌리세요.

### 시리즈 설정

`data/video-series.json`이 어떤 영상을 어떤 방식으로 요약할지 정합니다.

| 시리즈 | 요약 프로필 | 수집 방식 |
| --- | --- | --- |
| 주일 예배 (`sunday-service`) | `sermon` — 본문 성경구절, 설교 대지, 적용·결단 중심 | 채널에서 자동 발견 |
| 수요 성경대학 (`wednesday-bible`) | `lecture` — 다룬 구절, 개념·용어, 과제 중심 | 비공개라 링크로 수동 등록 |

영상 분류는 **제목 패턴을 먼저** 보고, 제목에 단서가 없으면 **KST 요일**로 판단합니다. 요일로만 맞은 항목은 `matchedBy: "weekday"`로 표시되니 결과를 한 번 확인하세요.

교회 채널의 실제 제목 형식을 아직 확인하지 못했습니다. 처음 한 번은 반드시 아래로 확인하고 `titlePatterns`를 고치세요. `--dry-run`은 상태 파일을 건드리지 않습니다.

```bash
npm run video:discover -- --dry-run
```

`added`에 주일 예배가, `ignored`에 찬양·공지 영상이 들어가면 제대로 맞은 것입니다.

### 비공개 수요 성경대학 등록

비공개 영상은 채널 목록에 뜨지 않으므로 링크를 직접 넣습니다. GitHub의 **Actions → Video summary to Notion → Run workflow**에서 주소를 넣고 시리즈로 `wednesday-bible`을 고르면 됩니다. 로컬에서는:

```bash
npm run video:add -- "<수요 성경대학 주소>" --series wednesday-bible
```

등록해도 바로 처리하지 않고 방송 2일 뒤 순서를 기다립니다.

**주의**: YouTube의 **일부공개(unlisted)** 는 링크만 있으면 열리지만, **비공개(private)** 는 링크가 있어도 계정 권한이 필요합니다. 비공개라면 `YOUTUBE_COOKIES` 설정이 반드시 있어야 하고, 없으면 자막을 못 읽고 7일 뒤 실패로 접힙니다.

### 처음 한 번 설정

1. Notion에서 <https://www.notion.so/my-integrations> → **New integration**을 만들고 **Internal Integration Secret**을 복사합니다.
2. 요약을 쌓을 Notion 데이터베이스(또는 페이지)를 열고 우측 상단 **···  → 연결 → 방금 만든 integration**을 추가합니다. 이 단계를 빠뜨리면 토큰이 맞아도 404가 납니다.
3. 데이터베이스 주소에서 ID를 꺼냅니다. `notion.so/<워크스페이스>/<32자리 ID>?v=...`의 32자리 부분입니다.
4. GitHub 저장소 **Settings → Secrets and variables → Actions**에 추가합니다.
   - `NOTION_TOKEN`
   - `NOTION_DATABASE_ID`
   - `OPENAI_API_KEY` (브런치 자동화용으로 이미 있다면 그대로 씁니다)
   - `YOUTUBE_COOKIES` (선택이지만 사실상 필요 — 아래 참고)
5. `npm run video:check`로 설정이 실제로 동작하는지 확인합니다. Notion 토큰, 데이터베이스 연결, YouTube 접근, 쿠키 유무를 한 번에 짚어 주고 무엇을 고쳐야 하는지 알려줍니다.
6. `npm run video:discover -- --dry-run`으로 제목 패턴을 확인하고 필요하면 고칩니다.
7. **Actions → Video summary to Notion**을 한 번 수동 실행해 연결을 확인합니다. 실행 로그 맨 앞의 **Check setup** 단계에 같은 점검 결과가 나옵니다.

데이터베이스 속성은 강제하지 않습니다. 제목 속성에 요약 제목을 넣고, URL·날짜·선택 속성이 **있으면** 영상 주소·방송일·시리즈를 채웁니다. 없으면 그냥 건너뜁니다. 데이터베이스 대신 페이지 밑에 쌓으려면 `NOTION_DATABASE_ID` 대신 `NOTION_PARENT_PAGE_ID`를 씁니다.

### YouTube 쿠키가 필요한 이유

GitHub Actions 실행기는 데이터센터 IP를 씁니다. YouTube는 이 대역을 자주 막고 "Sign in to confirm you're not a bot"을 띄웁니다. 개인 PC에서는 잘 되던 것이 Actions에서만 실패하는 가장 흔한 원인입니다.

브라우저 확장으로 `cookies.txt`를 내보내 통째로 `YOUTUBE_COOKIES` Secret에 넣으면 이 문제와 비공개 영상 접근이 함께 풀립니다. 쿠키는 만료되므로 실패 Issue가 반복되면 가장 먼저 교체하세요.

## 준비물

- `OPENAI_API_KEY` — 요약에 필요합니다. `--transcript-only`에는 필요 없습니다.
- `NOTION_TOKEN` + `NOTION_DATABASE_ID` — Notion 업로드에 필요합니다. 파일만 만들 때는 필요 없습니다.
- `yt-dlp` — 선택. 없으면 watch 페이지 자막 경로만 동작합니다. YouTube가 봇 요청을 막는 영상에서는 사실상 필수입니다.
- `ffmpeg` — 선택. 자막이 없는 긴 영상을 받아쓸 때 오디오를 나누는 데만 씁니다.

`OPENAI_VIDEO_MODEL`을 비워 두면 브런치 자동화와 같은 `OPENAI_MODEL`을 씁니다. 받아쓰기 모델은 `OPENAI_TRANSCRIPTION_MODEL`로 따로 지정합니다.

## 자동 운영 중 상태 보기

`data/video-state.json`이 대기열입니다. 각 영상의 상태는 다음 중 하나입니다.

| 상태 | 뜻 |
| --- | --- |
| `waiting` | 발견했지만 아직 2일이 지나지 않음 |
| `pending_captions` | 처리 시점이 됐는데 자막이 아직 없음. 매일 재시도 |
| `summarized` | 요약은 끝났고 Notion 업로드만 남음. 다음 실행에서 업로드만 재시도 |
| `published` | Notion 업로드까지 완료 |
| `failed` | 7일이 지나도 자막을 못 얻음. 자동 재시도 중단 |

`failed`가 뜨면 `lastError`를 먼저 보세요. 봇 차단이면 쿠키를, 비공개 영상이면 권한을 확인하면 됩니다. 다시 시도하려면 해당 항목의 `status`를 `waiting`으로 고치고 다시 실행합니다.

## 알아둘 점

- **진행 중인 라이브는 대상이 아닙니다.** 방송이 끝나 다시보기로 바뀐 뒤에 실행하세요. 자동 운영은 2일을 기다리므로 이 문제가 없습니다.
- **채널 RSS는 최근 15개만 돌려줍니다.** 주 2회 일정에는 넉넉하지만, 한 주에 영상이 몰리거나 자동화가 2주 넘게 멈추면 놓칠 수 있습니다.
- **자동 자막은 오탈자가 있습니다.** 고유명사와 수치는 요약을 그대로 믿지 말고 타임코드 링크로 원본을 확인하세요. 요약 단계에서도 확신이 없는 오인식은 고치지 않고 그대로 둡니다.
- **자막이 없는 영상은 비용이 듭니다.** 받아쓰기는 영상 길이에 비례합니다. 한 시간짜리 라이브를 자막 없이 돌리기 전에 `--captions-only`로 먼저 자막 유무를 확인하는 편이 안전합니다.
- 비공개·연령 제한·지역 제한 영상은 자막 경로가 막힙니다. 이때는 `yt-dlp`에 쿠키 설정이 따로 필요합니다.
