# EP001 Higgsfield 계획 (승인 전 생성 안 함)

```text
ESTIMATED GENERATIONS: 10
ESTIMATED CREDITS: 20
```

계산: 기준 이미지 5장(0.25×5=1.25) + 영상 3개(5×3=15) = 16.25, 재시도 여유 20% 포함 약 20 크레딧. 영상은 사람 얼굴 없는 장면만, 나머지 2개 AI Scene은 정지 이미지 + 편집 push-in.

## Reference Images

REF01: Empty football stadium advertising board at dusk, one panel covered by strips of black tape over where a logo would be, no readable text, no brand logos, modern editorial documentary photograph, neutral grey and off-white palette, 16:9.
REF02: Narrow gap between two stadium wall panels with soft daylight coming through, no people, no logos, minimal editorial composition, muted tones, 16:9.
REF03: Close-up of a hand holding a shopping basket in front of blurred supermarket sauce shelves, no face visible, no readable brand names, editorial documentary look, 16:9.
REF04: Empty meeting room table with a stack of papers and a pen, soft window light, no people, no logos, minimal modern editorial, 16:9.
REF05: Off-white desk with a notebook and a pen, one hand turning a page, no face, minimal editorial, soft natural light, 16:9.

## Scenes

SCENE ID: S001
PURPOSE: 오프닝 Hook — 검은 테이프로 가려진 경기장 광고판
DURATION: 8s
REFERENCE ASSET: REF01 (image-to-video)
PROMPT: Subject: stadium advertising board with black tape covering the logo area. Environment: empty stadium at dusk, no people. Action: very slow forward drift toward the taped panel. Composition: centered, wide, 16:9. Mood: quiet, observational, documentary.
CAMERA: slow push-in, locked-off handheld feel minimal
LIGHTING: soft dusk light, natural, low contrast
STYLE: modern editorial, documentary, minimal, brand magazine, subtle cinematic movement
ASPECT RATIO: 16:9
REUSE POSSIBILITY: 마지막 질문 직전 S055 이후 컷에서 REF01 재사용 가능

SCENE ID: S015
PURPOSE: 빈틈에 아이디어를 넣는다는 추상 개념 B-roll
DURATION: 6s
REFERENCE ASSET: REF02 (image-to-video)
PROMPT: Subject: narrow gap between two wall panels. Environment: stadium exterior, no people. Action: light slowly intensifies through the gap, subtle dust motes. Composition: vertical gap centered, 16:9. Mood: calm, hopeful.
CAMERA: slow push-in
LIGHTING: soft daylight spill through the gap
STYLE: modern editorial, documentary, minimal, brand magazine, subtle cinematic movement
ASPECT RATIO: 16:9
REUSE POSSIBILITY: CH05 챕터 전환에서 REF02 재사용 가능

SCENE ID: S025
PURPOSE: 저관여 — 매대 앞에서 고민 없이 집는 손
DURATION: 6s
REFERENCE ASSET: REF03 (still + slow push-in in edit)
PROMPT: Subject: a hand holding a shopping basket in front of blurred shelves. Environment: supermarket sauce aisle, no readable labels. Action: static, edit adds slow push-in. Composition: close-up, shallow depth of field, 16:9. Mood: everyday, effortless.
CAMERA: still + slow push-in in edit
LIGHTING: flat supermarket light, neutral
STYLE: modern editorial, documentary, minimal, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: S043 이후 CH05 도입부에서 REF03 재사용 가능

SCENE ID: S039
PURPOSE: 작성자 경험 전환 — 익명 클라이언트 사례의 빈 회의실
DURATION: 6s
REFERENCE ASSET: REF04 (still + slow push-in in edit)
PROMPT: Subject: papers and a pen on an empty meeting table. Environment: quiet meeting room, window light. Action: static, edit adds slow push-in. Composition: table surface in foreground, 16:9. Mood: reflective.
CAMERA: still + slow push-in in edit
LIGHTING: soft window light
STYLE: modern editorial, documentary, minimal, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: CH05 S049 계열 장면과 톤 통일

SCENE ID: S049
PURPOSE: 실무 적용 챕터 도입 — 노트를 넘기는 손
DURATION: 8s
REFERENCE ASSET: REF05 (image-to-video)
PROMPT: Subject: a hand turning a page of a notebook on an off-white desk, no face. Environment: minimal desk, soft light. Action: page turns slowly once. Composition: top-down close-up, 16:9. Mood: thoughtful, practical.
CAMERA: gentle push-in
LIGHTING: soft natural light
STYLE: modern editorial, documentary, minimal, brand magazine, subtle cinematic movement
ASPECT RATIO: 16:9
REUSE POSSIBILITY: 엔딩 직전 정지 컷으로 REF05 재사용

## Cost Saving
- AI Scene 5개 중 영상은 3개, 나머지 2개는 기준 이미지 + 편집 push-in
- 사람 얼굴 장면 없음(손·빈 공간만) — 얼굴 일그러짐 재생성 방지
- 기준 이미지 5장을 챕터 전환·엔딩에 재사용
- 하인즈 병·로고는 AI로 만들지 않고 공식 영상(REAL)과 실루엣 도식(GRAPHIC) 사용
- 영상은 5초 클립으로 만들고 편집에서 속도·길이 조절
