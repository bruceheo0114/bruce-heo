# EP005 인계 — 이노션은 왜 광고 대신 영화를 만들까? (V2)

## 만든 것
| 파일 | 위치 |
|---|---|
| 본편 1080p (5:49, 2차) | `bruce-youtube/output/EP005/EP005.mp4` → media 브랜치 `media/ep005` |
| 첫 30초 비교본 | `output/EP005/preview_hook_A.mp4`(숫자 반전) · `preview_hook_B.mp4`(원문 인용 첫 문장) |
| 자막 | `output/EP005/subtitles.srt` (= subtitles_ko.srt) |
| 썸네일 3안 | `output/EP005/thumbnail_1~3.png` (추천 1안) |
| 쇼츠 3편 | `output/EP005/shorts/` + `shorts.md` |
| 업로드 정보 | `output/EP005/upload.md`, `v2/publish_copy.md` |
| 기획·근거·평가 문서 | `episodes/EP005_brunch-pre-innocean/` (00~06, references.json) + `v2/` (brief, integration_report, source_ledger, script_v2, narration.txt, packaging, voice_cues, pronunciation, voice_ab, scene_manifest, asset_manifest, generation_log, qa_report, evaluation_plan, metrics_template) |

mp4·mp3·생성물은 git에 올리지 않는다(.gitignore). 문서·references·AI 이미지(jpg)는 main.

## 다시 만드는 법
```bash
pnpm install --frozen-lockfile
export CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium   # 클라우드 컨테이너의 Playwright 버전 차이 회피
node src/cli/youtube.js validate EP005
node src/cli/youtube.js render EP005 bruce-youtube/output/EP005/narration_v2/EP005_CH0{1,2,3,4}.mp3 --no-cleanup --voice-clone
node src/cli/youtube.js shorts EP005
```
음성은 ElevenLabs flow `MKMAOlavZtlaqYw6r4JA`에 남아 있다(`v2/generation_log.json`). 새 클라우드 세션에서는 mp3를 다시 받아야 한다.
Hook B 미리보기는 임시 사본(YOUTUBE_ROOT)에서 CH01만 Hook B 대본·음성으로 바꿔 렌더한 뒤 앞 30초를 잘랐다.

## 코드 변경
- `src/youtube/config.js`: `FORMAT_RULES.v2`(5~6.5분, AI ≤25%) + `rulesFor(status)` — `status.json`의 `"format": "v2"`인 편만 적용. 기존 10~15분 규칙은 그대로.
- `src/youtube/validate.js`: 위 규칙 사용. 테스트 1개 추가(16/16 통과).
- 기존 EP001~EP004, 예약 게시물, 분석 데이터는 건드리지 않았다.

## 남은 일
1. Bruce 청취 확인(첫 30초·중간·끝) → 문제 구간만 해당 챕터 재생성
2. 브런치 226 공개(10/16 06:00) 이후 YouTube 앱에서 업로드, '변경된 콘텐츠' 예
3. Hook A/B 미리보기 보고 선택(본편은 A)
4. 공개 후 48시간·7일에 `metrics_template.csv` 채우기 — V1 4편 영상 ID 연결 필요

## 2차 수정 (Bruce 피드백)
- 숫자 표기 통일, Hook B 기반 일반인 지식 콘텐츠 오프닝, 음성 eleven_v3, 밝은 BGM(`output/EP005/bgm/bgm_bright.mp3`, git 제외)
- 코드: `render --bgm <파일>`(편별 BGM, 없으면 채널 기본), 자막 줄바꿈이 '이천이십오 년' 같은 읽는 법을 쪼개지 않게 수정(`render/align.js`). 테스트 106/106 통과
- 1차 음성(multilingual_v2)은 `output/EP005/narration/`에 그대로 보존

## 3차 수정
- 표준 스타일 확정(5~6분 V2·eleven_v3·밝은 BGM·숫자 표기·영상 클립 1~2개) → `bruce-youtube/CLAUDE.md` '표준 스타일', `routine_prompt.md`, `prompts/youtube_producer.md`. 새 Episode는 자동으로 `format: v2`.
- 채널 BGM 교체: `channel/bgm/bgm.mp3`(밝은 곡), 이전 곡 `bgm_calm.mp3`.
- `references.json`의 `kind: "video"` → Actions가 Higgsfield 클립을 `assets/references/<EP>/V01.mp4`로 받는다.
- 자막 줄나눔 수정으로 말과 자막이 어긋나던 15군데 해결.
