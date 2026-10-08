# EP002 Higgsfield 계획

```text
ESTIMATED GENERATIONS: 10
ESTIMATED CREDITS: 14
```

계산: 기준 이미지 8장(0.25×8=2) + 영상 2개(5×2=10) = 12, 재시도 여유 포함 약 14 크레딧. 영상은 사람 얼굴 없는 장면만(손, 빈 거실). 나머지 AI Scene은 정지 이미지 + 편집 push-in.

## Reference Images

REF01: Close-up of a hand holding a smartphone, thumb pausing mid-scroll over a softly blurred social feed, no readable text, no logos, no face, off-white and grey palette, modern editorial documentary photograph, 16:9.
REF02: Bright minimal living room where a sofa, rug, floor lamp and a slim air conditioner and TV sit in harmonious muted tones, no people, no logos, no readable text, natural daylight, modern editorial interior photograph, 16:9.
REF03: Empty meeting room with a laptop on the table and a wall monitor showing a plain blank announcement slide, no people, no readable text, soft window light, minimal editorial, 16:9.
REF04: A hand rearranging plain wooden blocks with no letters on a white table, no face, soft daylight, minimal editorial still life, 16:9.
REF05: A small brass balance scale perfectly level on an off-white surface, plain background, soft shadow, minimal editorial still life, 16:9.
REF06: Off-white desk with an open notebook and a pen, one hand starting to write, handwriting not readable, no face, soft natural light, minimal editorial, 16:9.
REF07: A neat stack of folded newspapers on a wooden table, headlines blurred and unreadable, no logos, muted daylight, documentary still life, 16:9.
REF08: Calm tidy living room at golden hour with light coming through a window onto a sofa and a side table, no people, no logos, minimal editorial interior, 16:9.

## Scenes

SCENE ID: S001
PURPOSE: 오프닝 Hook — 피드를 넘기다 멈춘 손가락
DURATION: 8s
REFERENCE ASSET: REF01 (image-to-video)
PROMPT: Subject: a hand holding a smartphone. Environment: blurred home interior, soft daylight. Action: the thumb scrolls once then stops and stays still. Composition: close-up on hand and phone, screen content blurred, 16:9. Mood: curious pause, quiet.
CAMERA: locked-off, very slight push-in
LIGHTING: soft natural daylight, low contrast
STYLE: modern editorial, documentary, minimal, brand magazine, subtle cinematic movement
ASPECT RATIO: 16:9
REUSE POSSIBILITY: S033에서 REF01 정지 이미지 재사용

SCENE ID: S010
PURPOSE: 오늘의 질문을 꺼내는 전환 — 노트와 펜
DURATION: 8s
REFERENCE ASSET: REF06 (still + slow push-in in edit)
PROMPT: Subject: open notebook and pen with a hand starting to write. Environment: off-white desk. Action: static, edit adds slow push-in. Composition: top-down three-quarter view, 16:9. Mood: thoughtful.
CAMERA: still + slow push-in in edit
LIGHTING: soft natural light
STYLE: modern editorial, documentary, minimal, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: S085에서 REF06 재사용

SCENE ID: S015
PURPOSE: 가전몰이 공간 제안 플랫폼으로 — 가전과 가구가 어우러진 거실
DURATION: 5s
REFERENCE ASSET: REF02 (image-to-video)
PROMPT: Subject: living room with sofa, rug, floor lamp, slim air conditioner and TV in matching muted tones. Environment: bright minimal apartment, no people. Action: slow lateral camera slide across the room. Composition: wide, 16:9. Mood: calm, curated.
CAMERA: slow lateral dolly
LIGHTING: natural daylight
STYLE: modern editorial, documentary, minimal, brand magazine, subtle cinematic movement
ASPECT RATIO: 16:9
REUSE POSSIBILITY: CH02 홈스타일 설명 구간에 정지 컷으로 재사용 가능

SCENE ID: S025
PURPOSE: "이미 다 공지했는데요" — 빈 공지 화면의 회의실
DURATION: 8s
REFERENCE ASSET: REF03 (still + slow push-in in edit)
PROMPT: Subject: wall monitor with a blank announcement slide and a laptop on the table. Environment: empty meeting room. Action: static, edit adds slow push-in. Composition: monitor centered, 16:9. Mood: quiet, slightly ironic.
CAMERA: still + slow push-in in edit
LIGHTING: soft window light
STYLE: modern editorial, documentary, minimal, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: 없음

SCENE ID: S033
PURPOSE: 낯선 발음이 손가락을 멈추게 한다 — REF01 재사용
DURATION: 6s
REFERENCE ASSET: REF01 (still + slow push-in in edit)
PROMPT: Subject: a hand holding a smartphone, thumb paused. Environment: blurred home interior. Action: static, edit adds slow push-in. Composition: close-up, 16:9. Mood: curious pause.
CAMERA: still + slow push-in in edit
LIGHTING: soft natural daylight
STYLE: modern editorial, documentary, minimal, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: S001과 같은 기준 이미지

SCENE ID: S063
PURPOSE: 새로움과 일관성 사이의 줄타기 — 균형 잡힌 저울
DURATION: 4s
REFERENCE ASSET: REF05 (still + slow push-in in edit)
PROMPT: Subject: small brass balance scale, perfectly level. Environment: off-white plain surface. Action: static, edit adds slow push-in. Composition: centered, generous negative space, 16:9. Mood: balanced, calm.
CAMERA: still + slow push-in in edit
LIGHTING: soft diffused light, gentle shadow
STYLE: modern editorial, documentary, minimal, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: 없음

SCENE ID: S068
PURPOSE: 자기 이름을 다시 배열한 브랜드 — 글자 없는 블록을 옮기는 손
DURATION: 5s
REFERENCE ASSET: REF04 (still + slow push-in in edit)
PROMPT: Subject: a hand moving plain wooden blocks with no letters. Environment: white table. Action: static, edit adds slow push-in. Composition: close-up on hand and blocks, 16:9. Mood: playful, thoughtful.
CAMERA: still + slow push-in in edit
LIGHTING: soft daylight
STYLE: modern editorial, documentary, minimal, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: 없음

SCENE ID: S070
PURPOSE: 신문 전면 사과 광고 — 신문 더미 (실제 광고는 S071 REAL)
DURATION: 7s
REFERENCE ASSET: REF07 (still + slow push-in in edit)
PROMPT: Subject: stack of folded newspapers with blurred unreadable headlines. Environment: wooden table, daylight. Action: static, edit adds slow push-in. Composition: three-quarter view, 16:9. Mood: documentary, morning.
CAMERA: still + slow push-in in edit
LIGHTING: muted daylight
STYLE: modern editorial, documentary, minimal, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: 없음

SCENE ID: S085
PURPOSE: 일할 때 던지는 질문 — 노트에 적는 손 (REF06 재사용)
DURATION: 4s
REFERENCE ASSET: REF06 (still + slow push-in in edit)
PROMPT: Subject: open notebook and pen with a hand writing. Environment: off-white desk. Action: static, edit adds slow push-in. Composition: close-up, 16:9. Mood: reflective.
CAMERA: still + slow push-in in edit
LIGHTING: soft natural light
STYLE: modern editorial, documentary, minimal, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: S010과 같은 기준 이미지

SCENE ID: S093
PURPOSE: 엔딩 직전 — 익숙해서 못 보는 가능성, 빛이 드는 거실
DURATION: 8s
REFERENCE ASSET: REF08 (still + slow push-in in edit)
PROMPT: Subject: calm tidy living room with golden-hour window light. Environment: minimal apartment, no people. Action: static, edit adds slow push-in. Composition: wide, 16:9. Mood: warm, reflective.
CAMERA: still + slow push-in in edit
LIGHTING: golden hour window light
STYLE: modern editorial, documentary, minimal, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: 없음

## Cost Saving

- 영상 생성은 2개(S001 손, S015 빈 거실)만. 사람 얼굴 없음.
- 나머지 AI Scene 8개는 기준 이미지 정지 컷 + 편집 push-in.
- REF01·REF06을 두 번씩 재사용.
- LG 로고·제품·광고 장면은 AI로 만들지 않고 LG전자 뉴스룸·LGE.COM 공식 이미지(REAL)와 도식(GRAPHIC)으로.
- KFC 광고는 AI로 재현하지 않고 기사 이미지(REAL)를 인용.
