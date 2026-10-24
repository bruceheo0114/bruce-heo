# ffmpeg-skill (복사본)

- 출처: https://github.com/kajisho5/ffmpeg-skill (MIT, `LICENSE`)
- 커밋: `7c27fbb75e66e4bbbe73be1191992eba4a346276` (2026-10-24)
- 가져온 것: `scripts/` `mcp/` `references/` `templates/` `SKILL.md` `LICENSE`. 문서·데모·테스트·이미지(약 20MB)는 뺐다.
- Python 3 표준 라이브러리 + ffmpeg만 쓴다. 인터넷 접속 없음.

## 우리가 쓰는 곳

YouTube 루틴 9단계(편집 확인)에서 완성 영상을 검사한다 (`bruce-youtube/routine_prompt.md`).

```text
python3 tools/ffmpeg-skill/scripts/check.py output/<EP>/<EP>.mp4 --platform youtube   규격·음량(-14 LUFS)·피크 검사
python3 tools/ffmpeg-skill/scripts/look.py output/<EP>/<EP>.mp4 --tiles 4x3 -o <파일>.png   12장 모아 보기 한 장
python3 tools/ffmpeg-skill/scripts/look.py output/<EP>/<EP>.mp4 --at 12.5 -o <파일>.png    한 순간만
```

`check.py`의 `subtitles none` WARN은 무시한다(자막은 화면에 넣고, srt는 업로드할 때 따로 올린다).
새 버전으로 바꿀 때는 위 커밋을 고치고 같은 폴더만 덮어쓴다.
