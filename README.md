# 브루스 허 아카이브

`index.html` 은 맥락 설계자 브루스 허의 아카이브 페이지, `portfolio-heoboram.html` 은 포트폴리오 문서입니다.

여기에 브런치 연동 자동화가 붙어 있습니다.

1. **브런치에 새 글이 올라오면** → `index.html` 의 Writing(브런치 글) 목록이 자동으로 갱신됩니다.
2. **새 글이 감지되면** → 본문을 읽어 카드뉴스 원고를 쓰고, 1080×1350 PNG 카드로 만들어 `cardnews/` 에 쌓습니다.

---

## 어떻게 돌아가나

`.github/workflows/brunch-sync.yml` 이 **매일 오전 9시 · 오후 9시(KST)** 에 `node scripts/sync.js` 를 실행합니다.
필요하면 GitHub 의 Actions 탭에서 `Run workflow` 로 직접 돌릴 수도 있습니다.

```
브런치 RSS ─┐
            ├─→ data/posts.json 과 비교 → 새 글 판별
프로필 페이지 ┘                              │
                                            ├─→ index.html 글 목록 갱신 (최신 12편)
                                            └─→ 새 글만 카드뉴스 생성 → cardnews/<글번호>/*.png
                                                                      └→ cardnews/index.html 갤러리 갱신
```

- 글 목록은 `index.html` 의 `<!-- brunch:posts:start -->` ~ `<!-- brunch:posts:end -->` 사이만 바뀝니다.
  **이 주석 사이는 직접 고치지 마세요.** 다음 실행 때 덮어써집니다. 그 밖의 디자인·문구는 건드리지 않습니다.
- `data/posts.json` 이 "이미 처리한 글" 기록입니다. 이 파일을 지우면 다음 실행 때 모든 글이 새 글로 보입니다.
- 한 번 실행에 카드뉴스는 최대 3편까지만 만듭니다 (`CARDNEWS_MAX_PER_RUN`).

## 카드뉴스 원고

`ANTHROPIC_API_KEY` 시크릿이 등록돼 있으면 Claude 가 본문을 읽고 카드 원고를 씁니다.
표지 1장 + 본문 4~5장 + 마무리 1장 구성이고, 사이트와 같은 팔레트(#191F28 / #3182F6)를 씁니다.

키가 없으면 본문에서 문장을 뽑아 채우는 방식으로 대체합니다. 카드는 나오지만 카피 품질은 떨어집니다.

**키 등록:** 저장소 Settings → Secrets and variables → Actions → New repository secret → 이름 `ANTHROPIC_API_KEY`

## 손으로 실행하기

```bash
npm install
npx playwright install --with-deps chromium

npm run sync              # 평소 실행 (목록 갱신 + 새 글 카드뉴스)
npm run sync:dry          # 파일을 쓰지 않고 무엇이 바뀔지만 확인
npm run sync:index-only   # 글 목록만 갱신

node scripts/sync.js --force 211   # 특정 글의 카드뉴스를 다시 생성
node scripts/build-gallery.js      # 갤러리 페이지만 다시 빌드
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
cardnews/                   생성된 카드뉴스
  index.html                카드뉴스 갤러리
  <글번호>/01.png ~ 06.png  카드 이미지 (1080×1350)
  <글번호>/meta.json        원고와 생성 기록
data/posts.json             처리한 글 기록
scripts/
  sync.js                   전체 흐름 (Actions 가 부르는 진입점)
  update-index.js           index.html 글 목록 갱신
  make-cardnews.js          글 한 편 → 카드뉴스
  build-gallery.js          cardnews/index.html 생성
  lib/brunch.js             브런치 글 목록·본문 수집
  lib/cardcopy.js           카드 원고 작성 (Claude / 발췌)
  lib/render-cards.js       카드 HTML → PNG 렌더링
  lib/store.js              posts.json 읽기·쓰기
  lib/config.js             공통 설정
```
