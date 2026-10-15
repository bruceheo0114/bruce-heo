# 채널 BGM

- `bgm.mp3` — **기본(2026-10-15 EP005 5차부터, Bruce 확정).** 깔끔한 지식 콘텐츠용 연주곡 6분 10초 한 곡 — 영상 길이(5~6분)를 반복 이음새 없이 덮는다.
  드럼·박수 없이 나일론 기타·펠트 피아노·따뜻한 베이스·아주 작은 브러시 셰이커, 약 105 BPM 장조, 처음부터 끝까지 에너지가 고르다(LRA 2.2 LU).
  말소리 대역(1~4kHz) 에너지 1%(이전 곡 4%)라 내레이션이 또렷하다. ElevenLabs Music v2.5(`eleven_music_v2_5`, 370초, `instrumental`), 5,549 크레딧. 받아쓰기로 보컬 없음 확인.
  프롬프트: Clean, bright and positive instrumental underscore for a calm Korean knowledge/documentary video with voice-over. About 105 BPM, major key, steady and consistent energy from start to end with no build-ups, drops, breaks or sudden changes. Sparse, uncluttered arrangement: soft fingerpicked nylon acoustic guitar, light felt piano, gentle warm bass, very soft brushed shaker. No claps, no kick drum, no snare, no lead melody in the vocal midrange, no synth leads, no vocals or choir. Leaves plenty of space for narration. Polished, airy, modern, warm. Ends with a gentle natural resolution.
  인스타그램 릴스도 같은 곡을 쓴다(`insight-reels/scripts/compose.py`의 `bgm`, 편마다 시작 지점만 다르게).
- `bgm_bright.mp3` — 이전 기본(EP005 2~4차). 밝은 2분 곡(110 BPM, 어쿠스틱 기타·마림바·박수·킥).
- `bgm_calm.mp3` — 그 이전 기본(2026-10-08). 잔잔한 다큐멘터리 언더스코어(펠트 피아노 + 아날로그 패드, 약 90 BPM).
- render가 영상 길이만큼 4초 크로스페이드로 이어 붙이고(곡이 영상보다 길면 한 번만 깐다, -27 LUFS), 내레이션이 나올 때 자동으로 약 10dB 줄인다(사이드체인).
  챕터 간지·마지막 4초 여운에서는 다시 올라오고, 처음 1.5초 페이드인·마지막 4초 페이드아웃.
- 편마다 다른 곡을 쓰려면 `render ... --bgm <파일>`.
