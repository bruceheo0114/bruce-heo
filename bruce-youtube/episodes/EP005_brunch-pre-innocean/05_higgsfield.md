# EP005 Higgsfield 계획 (V2)

```text
ESTIMATED GENERATIONS: 5
ESTIMATED CREDITS: 1.25
```

계산: 기준 이미지 4장(GPT Image 2.5, 0.25×4=1) + 재시도 여유 1장 = 1.25 크레딧. 영상 클립 없음 — AI Scene 5개 모두 정지 이미지 + 편집 push-in.
V2 기준: 생성형 화면 15% 이하 우선(계획 약 10%), 실사처럼 보이는 생성 장면에는 화면에 'AI 생성 이미지' 표시. 실제 행사·관객 반응을 AI로 만들지 않는다.
밤낚시 영화·차량·배우, 이노션·한화 자료는 AI로 재현하지 않고 공식 이미지와 기사(REAL)로만 쓴다.
제외 지시(별도 필드가 없어 결과 검수로 반영): plastic or waxy skin, CGI-like materials, oversaturation, teal-and-orange grading, warped hands, extra fingers, fake logos, gibberish text, stock-advertising poses.

## Reference Images

REF01: An empty dark Korean movie theater auditorium seen from the back rows, rows of unbranded seats softly lit by the glow of a blank screen, no people, no readable text, no logos, locked-off camera, observational documentary realism, A24 indie film still, natural cinematic color grading, soft muted palette, low saturation, atmospheric lighting, subtle film grain, shot on 35mm film, realistic shadows, 16:9.
REF02: A close-up of an adult hand holding a plain paper cinema ticket stub in a dim theater lobby, printed text blurred and unreadable, no face, no logos, authentic skin texture, physically plausible hand pose, practical ambient light, observational documentary realism, A24 indie film still, natural cinematic color grading, soft muted palette, low saturation, atmospheric lighting, subtle film grain, shot on 35mm film, realistic shadows, 16:9.
REF03: A minimal unbranded pop-up store interior in Seoul with white display plinths and soft spotlights, one visitor seen from behind walking slowly through the space, no face, no logos, no readable signage, authentic material texture, observational documentary realism, A24 indie film still, natural cinematic color grading, soft muted palette, low saturation, atmospheric lighting, subtle film grain, shot on 35mm film, realistic shadows, 16:9.
REF04: Silhouettes of a few audience members seen from behind in a dark movie theater, faces not visible, their outlines lit by the soft glow of the screen, no readable text, no logos, locked-off camera, observational documentary realism, A24 indie film still, natural cinematic color grading, soft muted palette, low saturation, atmospheric lighting, subtle film grain, shot on 35mm film, realistic shadows, 16:9.

## Scenes

SCENE ID: S007
PURPOSE: Promise — '앉아서 보는 팝업스토어' 관점을 처음 꺼내는 분위기 컷 (일반 영화관, 특정 상영 아님)
DURATION: 6s
REFERENCE ASSET: REF01 (still + slow push-in in edit)
PROMPT: An empty dark Korean movie theater auditorium seen from the back rows, rows of unbranded seats softly lit by the glow of a blank screen, no people, no readable text, no logos, locked-off camera, observational documentary realism, A24 indie film still, natural cinematic color grading, soft muted palette, low saturation, atmospheric lighting, subtle film grain, shot on 35mm film, realistic shadows, 16:9.
CAMERA: locked-off, slow push-in in edit
LIGHTING: screen glow, practical ambient light
STYLE: observational documentary realism, A24-like muted palette, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: S025에서 같은 REF01 재사용

SCENE ID: S016
PURPOSE: '광고를 보려고 낸 돈과 시간' — 일반 관람 상황을 설명하는 AI 보강 장면(실제 밤낚시 관객 아님)
DURATION: 6s
REFERENCE ASSET: REF02 (still + slow push-in in edit)
PROMPT: A close-up of an adult hand holding a plain paper cinema ticket stub in a dim theater lobby, printed text blurred and unreadable, no face, no logos, authentic skin texture, physically plausible hand pose, practical ambient light, observational documentary realism, A24 indie film still, natural cinematic color grading, soft muted palette, low saturation, atmospheric lighting, subtle film grain, shot on 35mm film, realistic shadows, 16:9.
CAMERA: locked-off close-up
LIGHTING: dim lobby practical light
STYLE: observational documentary realism, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: 없음

SCENE ID: S025
PURPOSE: '무대를 극장으로 옮겼다' — REF01 재사용
DURATION: 3s
REFERENCE ASSET: REF01 (still + slow push-in in edit, 다른 크롭)
PROMPT: An empty dark Korean movie theater auditorium seen from the back rows, rows of unbranded seats softly lit by the glow of a blank screen, no people, no readable text, no logos, locked-off camera, observational documentary realism, A24 indie film still, natural cinematic color grading, soft muted palette, low saturation, atmospheric lighting, subtle film grain, shot on 35mm film, realistic shadows, 16:9.
CAMERA: slow push toward the screen in edit
LIGHTING: screen glow
STYLE: observational documentary realism, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: S007과 같은 이미지

SCENE ID: S029
PURPOSE: 팝업스토어 경험 — 일반 팝업 공간(특정 브랜드 아님)
DURATION: 8s
REFERENCE ASSET: REF03 (still + slow push-in in edit)
PROMPT: A minimal unbranded pop-up store interior in Seoul with white display plinths and soft spotlights, one visitor seen from behind walking slowly through the space, no face, no logos, no readable signage, authentic material texture, observational documentary realism, A24 indie film still, natural cinematic color grading, soft muted palette, low saturation, atmospheric lighting, subtle film grain, shot on 35mm film, realistic shadows, 16:9.
CAMERA: locked-off wide
LIGHTING: soft spotlights, practical ambient light
STYLE: observational documentary realism, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: 없음

SCENE ID: S030
PURPOSE: 영화관 경험 — 일반 관객 실루엣(얼굴 없음)
DURATION: 7s
REFERENCE ASSET: REF04 (still + slow push-in in edit)
PROMPT: Silhouettes of a few audience members seen from behind in a dark movie theater, faces not visible, their outlines lit by the soft glow of the screen, no readable text, no logos, locked-off camera, observational documentary realism, A24 indie film still, natural cinematic color grading, soft muted palette, low saturation, atmospheric lighting, subtle film grain, shot on 35mm film, realistic shadows, 16:9.
CAMERA: locked-off from behind
LIGHTING: screen glow
STYLE: observational documentary realism, still + slow push-in in edit
ASPECT RATIO: 16:9
REUSE POSSIBILITY: 없음

## Cost Saving
- 영상 생성 없음. AI Scene 5개를 기준 이미지 4장의 정지 컷 + 편집 push-in으로.
- REF01을 S007·S025에 재사용.
- 밤낚시·이노션·한화 관련 화면은 공식 이미지·기사(REAL)와 코드 그래픽으로.
