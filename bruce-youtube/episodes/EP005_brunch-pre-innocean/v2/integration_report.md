# EP005 연동 보고 (2026-10-15)

| 도구 | 상태 | 확인 근거 | 연결 방식 | 제한·대안 |
|---|---|---|---|---|
| ElevenLabs | **ready (실제 호출 성공)** | `creative_list_voices`에 승인 음성 `ZuzhDyVIYUQSaEkxo38e`(Bruce Heo, cloned, '허보람 본인 음성') 확인 → 샘플 2·챕터 4·Hook B 1 생성, 받아쓰기 6건 성공 | MCP `creative_generate_speech` / `creative_transcribe_audio`, flow `MKMAOlavZtlaqYw6r4JA` | 결과 URL 2시간 만료 → 즉시 내려받음. 이 MCP에는 stability/style 같은 세부 설정 필드가 없어 모델 1개 변수로 A/B |
| Higgsfield | **ready (실제 호출 성공)** | `balance` 247.25 크레딧(Starter) · `generate_image_batch`(gpt_image_2_5) 4건 완료 | MCP | 클라우드에서 결과 주소(cloudfront) 직접 다운로드 403 → references.json + Actions로 회수(기존 EP001~EP004 방식) |
| GitHub Actions `youtube-references.yml` | ready | 실행 3회(성공 2, 커밋 단계 rebase 충돌 1 → workflow_dispatch 재실행 성공) | main push 트리거 | `-m.jpg` 모바일 이미지 4개는 '그림이 너무 작음'으로 실패 → 페이지 캡처로 대체 |
| 렌더(ffmpeg + Playwright) | ready | `node src/cli/youtube.js render` 2회 성공 | 프로젝트 코드 | 설치된 playwright 1.62.1이 찾는 headless shell이 컨테이너에 없음 → `CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`(코드가 이미 지원하는 환경변수)로 해결 |
| Firecrawl / WebSearch | ready | 사실 확인 검색·기사 인용 추출 | MCP | — |
| YouTube 업로드 | 사용 안 함 | 지침상 Bruce가 앱에서 직접 업로드 | — | `upload` 명령 미사용 |

비밀값은 출력·기록하지 않았다. 새 구독·계정·키·의존성 추가 없음(`pnpm install --frozen-lockfile`로 기존 잠금 파일 그대로 설치).

## 사용량
- ElevenLabs: 음성 3,161자 크레딧 + Hook B 받아쓰기 165 = **약 3,326 크레딧** (주간 루틴 상시 승인 범위 약 4,500 이내)
- Higgsfield: **1.0 크레딧** (이미지 4장 × 0.25) · YouTube 월 사용 9.75/150
