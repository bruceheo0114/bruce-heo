# bruce-youtube

브런치 글 → 20~30분 YouTube 영상 에세이 제작 패키지를 반자동으로 만든다.
얼굴 없는 영상, 내레이션은 Bruce가 아이폰으로 직접 녹음, Higgsfield는 승인한 장면만 생성한다.

```text
브런치 새 글 ─ sync ─▶ source/brunch/<글번호>.md ─▶ episodes/EP###_brunch-<글번호>/ (PACKAGE_PENDING)
            (매일 3회, Claude 미사용)
주 1회(수 10:00) Claude Code ─▶ 00_score ~ 06_shorts ─ finalize ─▶ WAITING_APPROVAL / SHORTS_ONLY / HOLD / SKIP
직접 녹음 ─ narration ─▶ 길이 비교 → 타임코드 조정
report → 사용자 승인 → approve ─▶ APPROVED ─ Higgsfield 생성 ─ record-generation ─▶ ASSETS_READY → 편집
```

## 폴더

| 경로 | 내용 |
|---|---|
| `source/brunch/` | 브런치 원문 Markdown(원본, 수정 금지) + `index.json`(처리 기록) |
| `episodes/EP###_brunch-<글번호>/` | `00_score.md` `01_brief.md` ~ `06_shorts.md`, `status.json` |
| `narration/<EP>/` | 직접 녹음한 m4a (git 제외) |
| `assets/brand` `assets/references` `assets/generated` | 브랜드 자료, 실제 자료, Higgsfield 결과 |
| `prompts/youtube_producer.md` | Claude 제작 지시서 (출력 형식 포함) |
| `scripts/run_pipeline.ps1` `scripts/register_task.ps1` | Windows 자동 실행 |
| `logs/` | 실행·오류 로그, Claude 사용량 JSON (git 제외) |

`watch_brunch.py` 대신 저장소의 기존 Node 브런치 수집기(`src/lib/brunch.js`)를 그대로 쓴다.

## Windows 설치 (한 번)

1. Node.js 20+, Git, Claude Code CLI(`npm i -g @anthropic-ai/claude-code` 후 `claude` 로그인)를 설치한다.
2. (선택) 녹음 길이 자동 확인용 ffmpeg: `winget install Gyan.FFmpeg`
3. 저장소를 클론하고 `pnpm install` (또는 `npm install`).
4. PowerShell에서 `powershell -ExecutionPolicy Bypass -File bruce-youtube\scripts\register_task.ps1`
   - `bruce-youtube-sync`: 매일 10:00·14:00·20:00 새 글 확인 (Claude 미사용)
   - `bruce-youtube-weekly`: 매주 수 10:00 Episode 1편 제작 (Claude Sonnet, Higgsfield 차단)
5. 수동 실행: `powershell -ExecutionPolicy Bypass -File bruce-youtube\scripts\run_pipeline.ps1 -NoPush`

## 명령

```text
node src/cli/youtube.js sync [--local]           새 글 확인 (--local: content/*/source.json 사용)
node src/cli/youtube.js episode 222              지난 글로 Episode 만들기
node src/cli/youtube.js status [EP001]
node src/cli/youtube.js validate EP001           형식·원칙 검사
node src/cli/youtube.js finalize EP001
node src/cli/youtube.js narration EP001 narration\EP001\EP001_CH01.m4a narration\EP001\EP001_CH02.m4a
node src/cli/youtube.js report EP001             Higgsfield 생성 계획
node src/cli/youtube.js approve EP001 S003 S005  일부 Scene만 승인 (생략하면 전체)
node src/cli/youtube.js can-generate EP001 S003
node src/cli/youtube.js record-generation EP001 S003 --job <id> --file assets\generated\EP001\S003.mp4
node src/cli/youtube.js resolve-update EP001 keep|regenerate
```

## 검사 기준 (`src/youtube/config.js`의 RULES)

- 전체 길이 20~30분, AI 화면 25% 이하, AI Scene 10개 이하(4~8초 권장), REAL 30% 미만이면 경고
- Higgsfield 예상 50 크레딧/Episode 이하
- 제목·썸네일 카피 각 5개, Shorts 3~5개, 원문과 같은 문장 20% 이하
- AI Scene과 `05_higgsfield.md` 프롬프트가 1:1로 맞아야 함

## 안전장치

- 처음 sync는 지난 글을 원문으로만 보관한다. 이후 새로 발행된 글만 Episode가 된다. 지난 글은 `episode <글번호>`로 직접 만든다.
- 주 1편 상한: 최근 7일 안에 패키지를 만들었으면 Claude를 실행하지 않는다.
- 원문이 수정되면 Episode를 덮어쓰지 않고 `UPDATE_AVAILABLE` + Higgsfield 생성 중지.
- 자동 실행은 대상 Episode 밖의 `episodes/` 변경이 있으면 커밋하지 않는다(`guard`).
- 자동 실행의 Claude에는 Higgsfield·ElevenLabs 도구가 막혀 있다. 생성은 `approve`된 Scene만, `can-generate` 확인 후.
