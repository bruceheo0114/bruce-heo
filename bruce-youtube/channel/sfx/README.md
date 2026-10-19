# 효과음

- `chapter.mp3` — 챕터 간지 효과음(약 1초, 맑은 "휙" — 휴대폰 스피커에서도 들리도록 고음 위주). ElevenLabs Sound Effects(`eleven_text_to_sound_v2`)로 만든 채널 전용 소리.
  render가 챕터마다(첫 챕터 제외) 간지가 시작될 때 내레이션보다 작게(`SFX_VOLUME`) 깐다. 파일이 없으면 효과음 없이 간지만 나온다.
- 장면 효과음(2026-10-19, `eleven_text_to_sound_v2`, 개당 약 17 크레딧). 모두 앞 무음을 잘라 소리가 바로 나고, 최대 -3dBFS로 맞췄다.
  크기는 `compose.js` `SFX_LEVELS`(내레이션 대비 0.22~0.35 — 말소리를 덮지 않게).

  | 파일 | 소리 | render가 까는 곳 |
  |---|---|---|
  | `pop.mp3` | 작은 '톡' | 도식(흐름·목록) 카드 시작, 연표 점마다 |
  | `tick.mp3` · `ding.mp3` | 숫자 굴러가는 소리 · 도착 '띵' | `MOTION: count` |
  | `chart.mp3` | 올라가는 신스 | `MOTION: trend` |
  | `whoosh.mp3` | 휙 | `MOTION: compare` 두 칸 |
  | `page.mp3` | 종이 넘기기 | `MOTION: quote` |
  | `scroll.mp3` | 클릭 + 휠 | 웹페이지 스크롤 컷(`-scroll`) |
  | `riser.mp3` · `impact.mp3` | 긴장 상승 · 낮은 '쿵' | 예비(아직 자동으로 쓰지 않음) |

  같은 소리가 0.3초 안에 겹치면 하나만 낸다. 파일이 없으면 그 소리만 건너뛴다.
- 릴스(`insight-reels/scripts/compose.py`)도 같은 파일·같은 크기를 쓴다: 장면 전환 whoosh, 라벨 pop, 펀치 impact, 하트 숫자 tick·ding, split ding, 움직이는 도식은 유튜브와 같은 소리.

