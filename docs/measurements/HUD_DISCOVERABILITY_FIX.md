# HUD·발견 가능성 blocker 3건 — production 실측

> 기준 dev: `9df73dd6f01c3ef8908a68909749a50229f1dd0d`
> 코드 커밋: `bd5a87b`(L-1 성능 패널 배치) · `ead292e`(L-2·L-3 HUD)
> 관측 경로: **플래그·쿼리 없는 production 진입**(`http://localhost:5173/`).
> `?bossSpike=1` · `?bossviewdemo=1` · `?sonardemo=1` · `?econdemo` 등
> fixture·demo 쿼리 **0건**. 입력은 실제 production 키 경로
> (W/A/D/E/Shift/F/Q/좌클릭)만 사용했고 텔레포트·좌표 직접 변경 **0건**이다.

## 0. 이번 작업의 경계

판정은 하나도 바꾸지 않았다. 아래는 **전부 무변경**이다:
`InteractionSystem` · `KeyboardInput`의 `KeyF` 처리 · `holdSeconds` 2.0 ·
`interactRadiusMeters` 6.0 · 3D 거리 판정 · 단서 좌표 · `CLUE_ID_BY_INTERACTABLE`
매핑 · 중복 방지 · salvage 자동 회수 방식 · `BossProgressStore` 진행 판정 ·
`params/*.json` · `src/contracts/*`.

DetectionHud는 제거하지 않았다. farming reward 표는 만들지 않았다(§6).

## 1. L-1 — 성능 디버그 패널이 소나 HUD를 가림

원인: 개발용 성능 오버레이가 `top/left 8px`이고 소나 스코프가
`left/top 0.75rem · 18vh`라 같은 자리였다. 조치는 **배치 이동 하나** —
새 성능 패널을 만들지 않았고 표시 항목·계측 로직은 그대로다.

`--perf-overlay-top`은 자산 HUD 실제 하단 + 12px다. 자산 HUD는 출항 중
'이번 출항 획득' 줄이 늘고 문구 길이에 따라 줄바꿈돼 높이가 변하므로 고정
top을 쓰지 않는다(ResizeObserver·창 리사이즈·성능 샘플 시점만 측정).

### 레이아웃 bounding box 실측 (출항 중, production)

| 요소 | 1920×1080 | 2552×1388 |
|---|---|---|
| 소나 스코프 | x12 y12 194.4×194.4 | x12 y12 249.8×249.8 |
| **성능 패널** | **x1556 y98 352×204** | **x2188 y98 352×204** |
| 자산 HUD | x1627.6 y12 280.4×73.6 (하단 85.6) | x2259.6 y12 280.4×73.6 (하단 85.6) |
| 탐지 HUD | x867.6 y12 184.8×52 | x1183.6 y12 184.8×52 |
| 생존 HUD | x851.6 y1000.1 216.8×67.9 | x1167.6 y1308.1 216.8×67.9 |
| 조작 안내 | x8 y399.2 322.6×281.7 | x8 y553.2 322.6×281.7 |
| 액션 버튼 | x1641.9 y1029 262.1×35 | x2273.9 y1337 262.1×35 |
| 탐사 HUD(신규) | x12 y218.4 325.2×131.7 | x12 y273.8 325.2×131.7 |

- **겹침 0건** (두 해상도 모두, 표시 중인 요소 전 쌍 교차 검사)
- **화면 밖 잘림 0건**
- 성능 패널 버튼 3개(`접기` · `게이트 기록 다운로드 (JSON)` · `업그레이드
  시뮬레이터`) 전부 `elementFromPoint` 적중 = 클릭 가능
- 성능 패널 상단 98 = 자산 HUD 하단 85.6 + 12 (측정값 반영 확인)
- 소나 스코프 중심의 최상위 요소 = 스코프 `CANVAS` (성능 패널 아님)
- page error 0건

증적: `docs/screenshots/hudfix_layout_1920x1080.png` ·
`hudfix_layout_2552x1388.png`

## 2. L-2 — F hold 단서 회수를 알 수 없음

이전 회차에서 이미 확인된 사실: **판정은 정상이었고 발견 가능성 문제였다**
(단서는 해저 y≈−18.8, 판정은 3D 거리, 화면의 흰 원은 salvage 자동 회수
반경이라 F 대상이 아니다). 그래서 이번에는 판정을 건드리지 않고 HUD만 보강했다.

### production 실측 — 단서 1종 실제 회수 완주

| # | 항목 | 실측값 |
|---|---|---|
| H01 | 기지 | `meta=BASE` · 탐사 HUD 숨김 · F 프롬프트 숨김 |
| H02 | 출항 | `meta=SORTIE` pose (0,0,0) · 탐사 HUD 표시 · F 프롬프트 숨김 |
| H04 | 대상 없는 위치 | `available=false` `candidate=null` → **프롬프트 숨김** |
| H05 | **Shift 잠항** | 61.0s → pose (0,**−19**,0) · `available=true` · `candidate=survey-probe` · `kind=clue` |
| H06 | **근접 프롬프트** | 표시 **true** · 문구 `F` + `[F] 길게 눌러 단서 수집` · 링 **0** |
| H07 | **홀드 중 링** | read model `progress` ↔ 그려진 링 표본 전건 일치: `0.05→0.05 · 0.15→0.15 · 0.25→0.25 · 0.35→0.35 · 0.75→0.75 · 0.85→0.85 · 0.95→0.95 · 완료 후 0` |
| H08 | **회수 완료** | 발행 `[{kind:'clue', targetId:'survey-probe', clueId:'clue-deep-survey'}]` · 진행 **1/3** · `bossCluesChanged=['1/3']` |
| H09 | **완료 피드백** | 표시 true · `단서 수집 완료` + `보스 단서 1/3` |
| H10 | 탐사 HUD 카운터 | `보스 단서 1/3` (정본과 동일) |
| H11 | 회수 후 프롬프트 | **숨김** · `available=false` `candidateCollected=true` |
| H12 | 피드백 만료 | 충분한 시간 뒤 **숨김** |
| H13 | **중복 방지** | 동일 대상 재홀드(첫 회수 이상 시간) → 발행 **1건 유지** · 진행 **1/3 유지** · 프롬프트 숨김 · 피드백 없음 |
| H14 | **farming 혼합 0** | `lootDropped=[]` — 단서 회수가 보상 경로로 새지 않는다 |
| H17 | **저장 → 재접속** | 정본 **1/3 유지** · `unlocked=false` · 기지 탐사 HUD 숨김 |
| H18 | 콘솔·페이지 오류 | 콘솔 **0건** · 페이지 **0건** |

`targetId`(`survey-probe`) ≠ `clueId`(`clue-deep-survey`) 분리가 실제 발행에서
확인된다.

**관측 메모**: swiftshader 소프트 렌더에서 루프가 실시간보다 느리게 흐른다
(FPS 10 관측). 홀드 누적은 프레임 delta 기준이므로 벽시계 2.5초 홀드로는
`holdSeconds` 2.0에 도달하지 않는다 — 벽시계가 아니라 `progress`를 폴링해
9.4초 홀드로 완주했다. 이는 관측 환경 특성이며 판정 로직 문제가 아니다.

증적: `docs/screenshots/hudfix_f_prompt.png`(근접 프롬프트) ·
`hudfix_f_hold_ring.png`(홀드 중 링) · `hudfix_f_complete.png`(완료 피드백 +
카운터 1/3) · `hudfix_after_reload.png`(재접속 직후) ·
`hudfix_sortie_start.png`(출항 직후) · `hudfix_active_ping.png`(Q 핑 노출).

## 3. L-3 — 보스 구역을 찾거나 진입 상태를 알 수 없음

탐사 HUD 실측 내용(출항 직후 production 문자열 그대로):

```
보스 단서 0/3
Q로 단서 탐색 (액티브 핑) · 단서는 해저에 있습니다 — Shift로 잠항해 가까이 접근하세요
▲ 삼각 표식: 보스 단서 — 가까이 접근 후 F 홀드
○ 흰색 원: salvage 자동 회수 구역
보스 구역 X -8~17 · Z 44~60 — 잠김
```

- 구역 좌표는 `BOSS_ZONE`(world 정본) 값 그대로다 — HUD가 좌표를 만들지 않는다.
- 잠금 표기는 `requestEntry()` 결과 그대로다(`unlocked=false` · `inZone=false` ·
  `bossSpawned=false` 상태에서 `잠김`). 해금 조건을 HUD가 다시 계산하지 않는다.

## 4. 결정적 HUD 검증 — 58/58 통과

production 컴포넌트를 dev 서버에서 그대로 import 하고 read model 스텁만 갈아
끼운 결정적 검증이다(게임 fixture·텔레포트 0). `pageerror 0`.

**InteractionPromptHud (P01~P30)** — 후보 없음/있음 표시 · 문구 · 키캡 46px
(38~52 범위) · 링 0/0.25/0.5/1.0 정확 매핑 · `rotate(-90 24 24)`(12시 시작
시계 방향) · 키 뗌 → 0 · 반경 이탈 → 숨김+0 · **후보 교체 시 다른 대상 진행이
새지 않음** · 완료 → 숨김+0 · 포커스 상실 → 즉시 숨김+0 · 포커스 복귀 →
정본대로 재표시 · 출항 종료 → 숨김+0 · **`unwired` → 프롬프트 없음** ·
salvage 후보 → 프롬프트 없음 · 단서 목록 밖 id → 프롬프트 없음 · 단서 3종
전부 대상 · 완료 피드백 문구·1.5~2.0초 만료 · reset 즉시 접힘 ·
`pointer-events:none`(입력 가로채기 0).

**ExplorationHud (E01~E27)** — 기지 숨김/출항 표시 · 진행 0/3→2/3→3/3 갱신 ·
안내 4문구 · 범례 2문구 · 구역 좌표 = 주입값 · 2/3까지 `잠김` · 3/3 →
`진입 가능` · 진입 배너 1회 + 시간 만료 + **매 프레임 재노출 0** · 스폰 배너 +
`교전 중` · **중복 통지 재노출 0** · 교전 종료 상태 복귀 · 잠긴 진입 배너 ·
reset·숨김·dispose.

## 5. 검증 러너 전체 (exit code)

```
npm run typecheck                 exit 0
npm run build                     exit 0   (dist 929.89 kB / gzip 250.86 kB)
npm run check:size                exit 0   상한 대비 7.3%
npm run check:scope               exit 0
npm run verify:gameplay           exit 0   324/324
npm run verify:meta               exit 0   165/165
npm run verify:tooling            exit 0    36/36
npm run verify:hud                exit 0    34/34  (페이지 오류 없음)
npm run verify:sprint-a           exit 0
npm run verify:sprint-b           exit 0
npm run verify:sprint-c           exit 0
npm run verify:runtime-closure    exit 0   fail 0 · unwired 0 · blocked 0
결정적 HUD 검증 (scratchpad)      exit 0    58/58
```

`verify:runtime-closure -- --enforce-exit`는 이전과 동일하게 미통과다 —
남은 실패는 전부 **manual evidence 미확보·fixture 판정 불가·항법 미도달**이며
이번 변경이 만든 실패는 없다(배선 상태 무변경, 줄 번호만 갱신).

## 6. 유지된 blocker — farming reward 데이터

이번에도 **구현하지 않았다**. production farming 대상은 여전히 0개이고
(`attachInteractables`가 공급하는 것은 단서 3종, clue는 `PAYABLE_KINDS
['gold','salvage']` 밖), 임의 보상표·임의 credits·fallback을 만들지 않았다.
상한 params(0.40 / 120 → 파생 cap 48)만 주입돼 있고 지급 결과는 `noReward`다.
H14에서 `lootDropped=[]`로 재확인했다.

소유자·결정 필요 사항은 `M1_M2_PRODUCTION_CLOSURE.md` §4와 동일하다.

## 7. 남은 미실측 (blocked — 이번 변경과 무관)

보스 구역(z 44~60) 도달과 단서 2·3종(z −38 / −52) 회수는 여전히 스크립트
자동 항법으로 도달하지 못했다. 이번에 회수한 `survey-probe`(x 4.25, z 4)는
스폰 바로 아래라 **잠항만으로** 닿았고, 나머지는 S자 협곡 주행이 전제다.

| 항목 | 상태 |
|---|---|
| 단서 2·3종 회수 · 3/3 달성 | **미실측** |
| 3/3 이후 구역 진입 배너 `진입 가능` 전환 | **미실측** (결정적 검증 E14~E16으로는 통과) |
| 보스 스폰 → `교전 중` 표기 | **미실측** (E20~E22로는 통과) |

사용자 로컬 실기기 수동 플레이가 가장 확실한 경로다.
