# 생활픽노트 — 쿠팡 파트너스 전용 Threads

새 Instagram/Threads `daily.picknotes`용 설정 초안입니다. Instagram·공개 Threads 프로필 생성, 소개 설정, 쿠팡 파트너스 개인 가입과 새 Threads 채널 등록은 완료했습니다. 기존 Meta 앱 연결·Threads 사용자 ID·새 토큰 연결·최종 활동 심사는 아직 완료되지 않았으며 자동 게시도 꺼져 있습니다. 인스타그램 게시 기능은 없습니다.

## 기존 계정과 분리

기존 `threads/`, `THREADS_ACCESS_TOKEN`, 인스타그램 자동화는 수정하지 않습니다. 새 원고·체크포인트·GitHub Actions·시크릿을 이 폴더와 전용 워크플로에서 관리합니다. 게시 직전 `/me`의 username과 id가 config와 모두 일치해야 합니다. 기존 `heo.boram`, `bruce.insight`, `work_bruce` 계정으로는 게시할 수 없습니다. 같은 Meta 앱을 사용해도 사용자별 토큰은 별개입니다.

## 현재 진행 상태 / 연결 순서

1. 완료: 새 Instagram `daily.picknotes` 가입 및 로그인 확인.
2. 완료: 새 공개 Threads `https://www.threads.com/@daily.picknotes` 생성, 생활픽노트 이름·소개 설정. 인스타그램 게시·크로스포스팅은 사용하지 않습니다. 기존 계정 센터에 새 계정을 추가하는 연결은 아직 확인되지 않았습니다.
3. 기존 Meta 개발자 앱에서 새 Threads 프로필을 테스터로 초대하고 새 프로필에서 수락합니다. `threads_basic`, `threads_content_publish`만 우선 요청합니다. 계정 연결·권한 부여 마지막 단계는 사용자가 확인합니다.
4. 새 프로필 전용 장기 토큰을 GitHub Actions Secret `COUPANG_THREADS_ACCESS_TOKEN`에 저장합니다. 기존 `THREADS_ACCESS_TOKEN`을 복사하거나 덮어쓰지 않습니다. 토큰은 원고·코드·커밋·채팅에 기록하지 않습니다.
5. `identify` 모드로 새 토큰의 username과 `/me`의 실제 id를 확인해 `config.json.user_id`에 등록합니다. identify는 설정을 수정하거나 게시하지 않고, 지정된 전용 username과 일치할 때만 ID를 출력합니다. 변경된 최종 아이디도 다시 확인합니다.
6. 완료: 쿠팡 파트너스 개인 가입·PASS 본인 인증·약관 확인·새 Threads 프로필 URL 등록. 최종 활동 심사는 별개로 미완료입니다. 제휴 링크와 대가성 표시가 함께 보이는 실제 게시물 증빙을 준비해야 합니다.
7. 쿠팡 파트너스 포털에서 본인 제휴 링크를 발급한 뒤 원고에 넣습니다. 이 버전은 쿠팡 상품 API를 호출하지 않으므로 쿠팡 API 키가 없어도 포털에서 발급한 링크를 사용할 수 있습니다.
8. `check`, `dry-run` 확인 후 `config.json.enabled=true` 및 Actions Variable `COUPANG_THREADS_ENABLED=true`를 설정합니다. 하루 최대 3슬롯(1=08:40, 2=12:40, 3=19:30 KST)에 각 슬롯의 scheduled 원고 한 개씩 게시합니다. 초기 운영 시각이며 성과가 검증된 최적 시각이라는 뜻은 아닙니다. GitHub 예약 실행은 지연될 수 있습니다.

## 원고 작성

`posts/YYYY-MM-DD-<슬롯>.json` 형식입니다(슬롯 1=08:40, 2=12:40, 3=19:30). 예전 `posts/YYYY-MM-DD.json` 은 슬롯 3으로 읽습니다. 검토 중인 원고는 `draft`, 확인한 원고만 `scheduled`로 바꿉니다.

```json
{
  "status": "draft",
  "body": "책상에서 자주 잃어버리는 작은 물건을 정리할 때는 칸 수보다 자주 쓰는 물건이 한눈에 보이는지 먼저 살펴보면 좋아요. 구매 전에는 책상 깊이와 수납함의 실측 크기를 비교해 보세요.",
  "affiliate_url": "쿠팡 파트너스에서 발급한 본인 링크 입력",
  "source_url": "확인한 실제 상품 페이지 URL",
  "verified_at": "상품 정보를 확인한 실제 ISO 8601 시각"
}
```

광고 문구·본문·링크가 하나의 글에 들어갑니다. `[광고] 이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.`를 자동으로 가장 앞에 붙입니다. 링크는 `https://link.coupang.com/a/...` 형식만 허용합니다. 쿠팡 포털이 다른 공식 링크 형식을 발급하면 출처를 확인하고 검사를 조정합니다. 500자 초과 글은 게시하지 않습니다.

직접 사용하지 않은 상품에 ‘써봤다’, ‘내돈내산’ 같은 경험을 만들지 않습니다. 가격·할인·재고·평점·효능은 실제 출처와 확인 시각이 있을 때만 씁니다. 먼저 책상 정리·생활용품 선택 기준을 설명하고, 상품은 그 기준의 예로 연결합니다. 수익·노출·최종 승인을 보장하지 않습니다.

## 실행 / 복구

Python 표준 라이브러리만 사용합니다.

```text
python -m unittest discover -s affiliate-threads/tests -v
python affiliate-threads/scripts/publish.py --mode validate
python affiliate-threads/scripts/publish.py --mode identify
python affiliate-threads/scripts/publish.py --mode check
python affiliate-threads/scripts/publish.py --mode dry-run --date 2026-10-27 --slot 1
```

`check`에는 새 전용 토큰이 필요합니다. `dry-run`은 API를 호출하지 않습니다. 게시 상태는 `state/YYYY-MM-DD.json`에 보관합니다. Actions는 외부 생성·게시 요청 전에 의도를 먼저 main에 커밋·푸시합니다. 브랜치 보호 등으로 저장이 실패하면 요청을 보내지 않습니다. 네트워크 실패나 실행 중단으로 결과가 불확실하면 `needs_review`/`creating`/`publishing`에서 중단하며 자동 재게시하지 않습니다. 실제 Threads를 확인한 뒤 게시됐으면 media_id와 stage=posted를 기록합니다. 미게시가 확실하면 수동으로 상태를 복구합니다. 확인 없이 체크포인트를 삭제하지 마세요.

장기 토큰은 60일 유효하며 만료 전에 갱신해야 합니다. 이 초안에는 자동 토큰 갱신·GitHub Secret 교체 기능이 없습니다. 만료 시 게시가 실패하므로 운영 시작 시 갱신 절차를 함께 정해야 합니다.

## 자동 루틴 (Claude)

- **주간 원고** (일 19:48 KST): `routine_writer_prompt.md`. 다음 7일 × 3슬롯 draft 를 쓰고(상품 페이지는 Firecrawl 로 확인) `[생활픽노트] 주간 원고 미리보기` 메일을 보냅니다. 제휴 링크는 만들지 않습니다.
- **링크·승인 반영** (매일 08:07·12:07·19:07 KST): `routine_approval_prompt.md`. 브루스가 메일에 `10/27-1 https://link.coupang.com/a/...` 로 회신한 슬롯만 상품을 재확인해 `scheduled` 로 바꿉니다. 링크 회신이 없는 슬롯은 게시되지 않습니다.
- **트렌드** (일 19:07 KST, Actions `naver-picknotes.yml`): `trend_keywords.json` 키워드의 최근 7일 네이버 검색량 상승폭을 `trends/<날짜>.json` 에 남기고, 주간 원고 루틴이 튄 키워드부터 상품을 고릅니다.
- 원고에 `image_url`(상품 페이지의 coupangcdn.com 대표 이미지)이 있으면 사진 1장 + 글로 게시합니다.
- 실제 게시는 위 Actions 만 합니다.

## 공식 근거

- Meta: https://developers.facebook.com/documentation/threads/get-started
- 게시·한도: https://developers.facebook.com/documentation/threads/posts
- 토큰: https://developers.facebook.com/documentation/threads/get-started/long-lived-tokens
- 쿠팡 SNS 채널 등록: https://blog.naver.com/partners_official/223582879892
- 쿠팡 Threads 광고 표시: https://blog.naver.com/partners_official/224087824780

확인일: 2026-10-25. 계정의 개인 블로그 카테고리가 노출을 높인다는 공식 근거는 확인되지 않았습니다. 별도 블로그 개설을 선행하지 않고 Threads 중심으로 준비합니다.
