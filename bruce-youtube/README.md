# bruce-youtube — 브루스 인사이트 유튜브

브런치 글(2026년 이후) → 10~15분 YouTube 영상 에세이 제작 패키지. 인스타그램 @bruce.insight와 같은 브랜드로 운영한다.
얼굴 없는 영상, 내레이션은 Bruce 본인 복제 목소리(ElevenLabs). 월요일 브런치 글을 화요일 밤 루틴이 완성 영상까지 만들고, Bruce는 수요일에 받아 직접 올린다(2026-10-08부터).

```text
Actions(매일 07:17) brunch_cache 갱신
화 21:13 클라우드 루틴 ─ sync --cache ─ next --weekly(이번 주 월요일 새 글, 없으면 queue.json 예비 글) ─ 00_score~06_shorts ─ finalize
   ─ readback(소리 내어 읽고 다듬기) ─ 패키지 main 커밋(→ Actions가 실제 자료 수집)
   ─ 복제 목소리 내레이션 + 받아쓰기 ─ readback(다르게 읽은 곳 다시 생성) ─ Higgsfield(예산 안)
   ─ render(자동 편집: 화면·싱크 자막·간지·효과음·음량·썸네일·업로드 정보) ─ 1편 편집 방향 확인
   ─ mp4·썸네일·upload.md 전달 + 푸시 알림 → Bruce가 YouTube 앱에서 업로드
```

## 파일

| 경로 | 내용 |
|---|---|
| `queue.json` | 제작 순서(선별한 글·관점·릴스 게시일). 새 글은 맨 뒤에 자동 추가 |
| `source/brunch/` | 브런치 원문 Markdown(2026년 이후) + `index.json` |
| `episodes/EP###_brunch-<글번호>/` | `00_score.md` `01_brief.md` ~ `06_shorts.md`, `status.json` |
| `ledger.json` | YouTube Higgsfield 크레딧 장부 (월 150, 2일 리셋) |
| `prompts/youtube_producer.md` | 제작 지시서(출력 형식) |
| `routine_prompt.md` | 화요일 밤 클라우드 루틴 지시서 |
| `channel/` | 채널 개설 키트(프로필·배너·설명) |

음성·완성 영상(`output/`)은 git에 올리지 않는다.

## 명령

```text
node src/cli/youtube.js sync --cache             브런치 캐시 → 원문 보관, 새 글은 큐 뒤에
node src/cli/youtube.js next --weekly            이번 주 제작할 Episode (월요일 새 글 → 큐 todo → reserve)
node src/cli/youtube.js prebuild draft.md --slug lge   발행 전 원고로 미리 만들기 (발행되면 sync가 연결)
node src/cli/youtube.js readback EP002           소리 내어 읽기 검사
node src/cli/youtube.js upload EP002             YouTube 업로드(예비, 요청 시만) (YOUTUBE_CLIENT_ID·YOUTUBE_CLIENT_SECRET·YOUTUBE_REFRESH_TOKEN)
node src/cli/youtube.js episode 222              큐와 상관없이 Episode 만들기
node src/cli/youtube.js status [EP001]
node src/cli/youtube.js validate EP001 / finalize EP001
node src/cli/youtube.js narration-text EP001 --out <폴더>   챕터별 낭독 텍스트 (복제 목소리 입력용)
node src/cli/youtube.js narration EP001 EP001_CH01.mp3 EP001_CH02.mp3   길이 기록
node src/cli/youtube.js report EP001             Higgsfield 생성 계획 + 이번 달 크레딧
node src/cli/youtube.js approve EP001 S003 S005  일부 Scene만 승인 (생략하면 전체)
node src/cli/youtube.js can-generate EP001 S003
node src/cli/youtube.js record-generation EP001 S003 --credits 5 --job <id>
node src/cli/youtube.js render EP001 EP001_CH01.mp3 EP001_CH02.mp3 --no-cleanup --voice-clone [--preview]
node src/cli/youtube.js credits
node src/cli/youtube.js resolve-update EP001 keep|regenerate
```

## 검사 기준 (`src/youtube/config.js`의 RULES)

- 전체 10~15분, AI 화면 40% 이하, AI Scene 24개 이하(4~8초, 영상 클립 4개 이하), REAL 30% 미만이면 경고
- Higgsfield 예상 30 크레딧/Episode 이하, 월 150 크레딧 상한(장부 기준으로 생성 차단)
- 제목·썸네일 카피 각 5개, Shorts 3~5개, 원문과 같은 문장 20% 이하

## 안전장치

- 주 1편: 최근 6일 안에 기획안(WAITING_APPROVAL/SHORTS_ONLY)을 만들었으면 루틴이 제작하지 않는다. HOLD/SKIP은 세지 않는다.
- 원문이 수정되면 Episode를 덮어쓰지 않고 `UPDATE_AVAILABLE` + Higgsfield 생성 중지.
- 루틴은 대상 Episode 밖의 `episodes/` 변경이 있으면 되돌린 뒤 커밋한다(`guard`).
- 루틴은 Higgsfield(AI 장면)와 ElevenLabs(Bruce 복제 목소리 내레이션·받아쓰기) 커넥터가 필요하다. ElevenLabs가 없으면 대본까지만 만들고 멈춘다.
- 내레이션은 Bruce 본인 복제 목소리(voice_id `ZuzhDyVIYUQSaEkxo38e`)만 쓴다. 직접 녹음하지 않는다.

## 편집 방향 (1편 EP001 기준 — 모든 편이 같은 방향)

`routine_prompt.md` 9단계 체크리스트가 정본이다. 요약:

- 복제 목소리 내레이션 + 단어 단위 받아쓰기(`words.json`)로 자막·장면 전환을 실제 말소리에 맞춘다 (#27).
- 챕터마다 2.6초 간지(CHAPTER 0N + 제목, 페이드)와 효과음 `channel/sfx/chapter.mp3`(음량 0.7, 리미터 자동 보정 끔) (#28~#31).
- 오프화이트·블랙·그레이 + 포인트 컬러 1개, 빠른 호흡의 5초 컷, 장면별로 내레이션과 맞는 그림을 `references.json`의 `scene_images`로 고정 (#16~#21).
- 정지 화면은 perspective 이동으로 떨림 없이, 기사·홈페이지 캡처는 확대하지 않고 전체를 보여 준다 (#33).
- 대본 메모(`[확인 필요]`·`챕터 전환`)는 화면에 나오지 않는다 (#22). 모든 자료 화면에 출처 표기, 설명에 자료 출처·복제 목소리 고지 (#26).
- 썸네일 3안, 사람 얼굴 AI 영상 금지, 업로드 전 프레임 점검 후 한 번만 재렌더.
