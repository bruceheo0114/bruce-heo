# 브루스 허 아카이브

`index.html` 은 맥락 설계자 브루스 허의 아카이브 페이지, `portfolio-heoboram.html` 은 포트폴리오 문서입니다.

여기에 브런치 연동이 붙어 있습니다.

- **자동:** 브런치에 새 글이 올라오면 `index.html` 의 Writing(브런치 글) 목록이 자동으로 갱신됩니다.
- **수동:** 원할 때 글 하나를 골라 카드뉴스로 만들 수 있습니다. 자동으로는 만들지 않습니다.

---

## 글 목록 자동 갱신

`.github/workflows/brunch-sync.yml` 이 **매일 오전 9시 · 오후 9시(KST)** 에 `node scripts/sync.js` 를 실행합니다.
GitHub 의 Actions 탭에서 `Run workflow` 로 직접 돌릴 수도 있습니다.

```
브런치 RSS ─┐
            ├─→ data/posts.json 과 비교 → 새 글 판별 → index.html 글 목록 갱신 (최신 12편)
프로필 페이지 ┘
```

- `index.html` 의 `<!-- brunch:posts:start -->` ~ `<!-- brunch:posts:end -->` 사이만 바뀝니다.
  **이 주석 사이는 직접 고치지 마세요.** 다음 실행 때 덮어써집니다. 그 밖의 디자인·문구는 건드리지 않습니다.
- `data/posts.json` 이 "이미 본 글" 기록입니다. 내용이 그대로면 파일을 다시 쓰지 않아 빈 커밋이 쌓이지 않습니다.

## 카드뉴스 (수동)

새 글이 올라와도 카드뉴스는 자동으로 만들어지지 않습니다. 만들고 싶을 때만 시키면 됩니다.

**GitHub 에서:** Actions 탭 → `브런치 글 동기화` → `Run workflow` → `카드뉴스를 만들 글 번호` 에 `211` 처럼 입력

**로컬에서:**

```bash
npm install
npx playwright install --with-deps chromium

npm run cardnews 211            # 211번 글의 카드뉴스 생성
node scripts/sync.js --force 211  # 같은 동작 + 글 목록 갱신까지
node scripts/sync.js --cardnews   # 이번에 발견한 새 글 전부 카드뉴스로 (한 번에 최대 3편)
node scripts/build-gallery.js     # cardnews/index.html 갤러리만 다시 빌드
```

만들어진 카드는 `cardnews/<글번호>/01.png ~ 06.png` (1080×1350) 로 저장되고,
`cardnews/index.html` 갤러리에 모입니다. 표지 1장 + 본문 4~5장 + 마무리 1장 구성이고
사이트와 같은 팔레트(#191F28 / #3182F6)를 씁니다.

카드뉴스가 쌓이면 `index.html` 의 「브런치에서 전체 글 보기」 링크 옆에
`<a href="cardnews/" class="posts-more">카드뉴스 아카이브</a>` 를 넣어 갤러리를 노출할 수 있습니다.

### 원고

`ANTHROPIC_API_KEY` 시크릿이 등록돼 있으면 Claude 가 본문을 읽고 카드 원고를 씁니다.
키가 없으면 본문에서 문장을 뽑아 채우는 방식으로 대체합니다. 카드는 나오지만 카피 품질은 떨어집니다.

**키 등록:** 저장소 Settings → Secrets and variables → Actions → New repository secret → 이름 `ANTHROPIC_API_KEY`

## 그 밖의 명령

```bash
npm run sync       # 글 목록 갱신 (Actions 가 매일 돌리는 것과 같음)
npm run sync:dry   # 파일을 쓰지 않고 무엇이 바뀔지만 확인
```

## 설정값

| 이름 | 위치 | 기본값 | 설명 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Actions secret | 없음 | 카드뉴스 원고 작성용. 없으면 발췌 방식으로 대체 |
| `BRUNCH_ID` | Actions variable / 환경변수 | `heoboram` | 브런치 작가 아이디 (@ 제외) |
| `CARDNEWS_MAX_PER_RUN` | 환경변수 | `3` | 한 번 실행에 만들 카드뉴스 최대 편수 |
| `CARDNEWS_MODEL` | 환경변수 | `claude-opus-5` | 원고 작성에 쓸 모델 |
| `BRUNCH_ORIGIN` | 환경변수 | `https://brunch.co.kr` | 로컬 테스트용 주소 바꿔치기 |

## 파일 구조

```
index.html                  아카이브 페이지 (Writing 목록이 자동 갱신되는 곳)
cardnews/                   수동으로 만든 카드뉴스
  index.html                카드뉴스 갤러리
  <글번호>/01.png ~ 06.png  카드 이미지 (1080×1350)
  <글번호>/meta.json        원고와 생성 기록
data/posts.json             이미 본 글 기록
scripts/
  sync.js                   진입점 (글 목록 갱신, 시키면 카드뉴스까지)
  update-index.js           index.html 글 목록 갱신
  make-cardnews.js          글 한 편 → 카드뉴스
  build-gallery.js          cardnews/index.html 생성
  lib/brunch.js             브런치 글 목록·본문 수집
  lib/cardcopy.js           카드 원고 작성 (Claude / 발췌)
  lib/render-cards.js       카드 HTML → PNG 렌더링
  lib/store.js              posts.json 읽기·쓰기
  lib/config.js             공통 설정
```
