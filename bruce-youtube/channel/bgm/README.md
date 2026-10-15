# 채널 BGM

- `bgm.mp3` — **기본(2026-10-15부터).** 밝고 긍정적인 지식 콘텐츠용 연주곡(2분). ElevenLabs Music(eleven_music_v2_5).
  프롬프트: Bright, optimistic, warm instrumental underscore, about 110 BPM, light acoustic guitar plucks, soft marimba, gentle claps, subtle upbeat kick, major key, no vocals.
  받아쓰기(eleven_scribe_v1) 결과가 비어 보컬 없음 확인. EP005에서 Bruce 승인.
- `bgm_clean.mp3` — **후보(2026-10-15, EP005 5차).** 더 깔끔한 버전: 6분 10초 한 곡이라 반복 이음새가 없고, 드럼·박수 없이 나일론 기타·펠트 피아노·베이스·브러시 셰이커만.
  말소리 대역(1~4kHz) 에너지 1%(기존 bgm.mp3 4%), 음량 변화폭 LRA 2.2 LU. ElevenLabs Music v2.5, 370초, 5,549 크레딧. 받아쓰기로 보컬 없음 확인.
  프롬프트: Clean, bright and positive instrumental underscore … about 105 BPM, major key, steady energy, no build-ups or drops, soft fingerpicked nylon guitar, light felt piano, warm bass, very soft brushed shaker, no claps/kick/snare, no lead melody in the vocal midrange, no vocals.
  Bruce가 고르면 `bgm.mp3`로 바꾼다. 지금은 `render ... --bgm bruce-youtube/channel/bgm/bgm_clean.mp3`.
- `bgm_calm.mp3` — 이전 기본(2026-10-08). 잔잔한 다큐멘터리 언더스코어(펠트 피아노 + 아날로그 패드, 약 90 BPM). 필요하면 `render --bgm bruce-youtube/channel/bgm/bgm_calm.mp3`.
- render가 영상 길이만큼 4초 크로스페이드로 이어 붙이고(-27 LUFS), 내레이션이 나올 때 자동으로 약 10dB 줄인다(사이드체인).
  챕터 간지·마지막 4초 여운에서는 다시 올라오고, 처음 1.5초 페이드인·마지막 4초 페이드아웃.
- 편마다 다른 곡을 쓰려면 `render ... --bgm <파일>`.
