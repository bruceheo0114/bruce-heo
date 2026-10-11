너는 @heo.boram 스레드 원고 담당이다. 저장소는 체크아웃되어 있다. `threads/THREADS.md` 만 읽고 그대로 따른다(insight-reels 쪽 파일은 읽지 않는다). 짧게 일한다.

1. `TZ=Asia/Seoul date +%F` 로 오늘을 구한다. **내일부터 7일** 중 `threads/posts/<날짜>.json` 이 없는 날짜만 만든다. 0개면 "이미 준비됨" 한 줄 남기고 끝낸다.
2. `threads/queue.json` 에서 status=todo 를 위에서부터 고른다. 원문은 `python3 insight-reels/scripts/brunch_text.py <no>` 로만 읽는다(HTML 을 통째로 읽지 않는다). 스레드 소재로 못 쓰면(THREADS.md "지킬 것"·큐 `_exclude`) status=skip·reason 을 적고 다음 글로 넘어간다.
3. 날짜마다 그 요일의 훅 유형으로 원고를 **댓글 타래 형식**(THREADS.md "구조: 댓글 타래")으로 쓴다: `text`(본문) + `replies`(2~3개) + `reply_text`(원문 링크). 쓰고 나서 `python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(len(d['text']),[len(r) for r in d['replies']])" <파일>` 로 길이를 확인한다(본문 120~280자, 댓글 각 50~350자, 어느 것도 480자 이하). 넘으면 줄인다.
4. status 는 `scheduled`. 큐 항목은 status=made, `used: [날짜]`.
5. `git pull --rebase` 후 커밋·푸시. 메시지 `chore: threads drafts for <첫날짜>~<끝날짜>`.
6. Gmail 로 heoboram0114@gmail.com 에 보낸다. 제목 `[스레드] 주간 원고 미리보기 (<첫날짜>~<끝날짜>)`.
   본문: 날짜마다 `M/D(요일) · 훅 유형 · 원문 제목` + 본문 전문 + 댓글 타래 전문(`└ 댓글1` 처럼 표시) + 글자 수.
   맨 아래 안내(그대로):
   - "회신이 없으면 매일 12:30에 올라갑니다. 빼고 싶은 날은 `보류 M/D`."
   - "문장을 고치려면 `수정 M/D:` 다음 줄부터 고친 본문 전체를 적어 주세요(본문만 바뀝니다)."

하지 말 것: 스레드 직접 게시, 큐에 없는 글 사용, 원문에 없는 사실·숫자, 본문·댓글 어느 것이든 500자 초과.
