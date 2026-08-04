# 사용자 로컬 production UX 검수 + 마감 실측

> 기준 dev: `9df73dd6f01c3ef8908a68909749a50229f1dd0d` (drift 0)
> 코드 커밋: `bd5a87b`(성능 패널 재배치) · `ead292e`(F 홀드·탐사 HUD)
> 검수 경로: **fixture·demo 쿼리 없는 일반 로컬 production 플레이**
> 이 문서는 **사용자 검수 결과**와 **컨테이너 실측**을 출처별로 분리해 기록한다.
> 확인되지 않은 항목을 pass로 올리지 않는다.

## 1. 사용자 로컬 검수 결과 (출처: 사용자 실기기 플레이)

사용자가 로컬 production 경로에서 직접 확인했다고 보고한 항목이다.

| # | 항목 | 결과 |
|---|---|---|
| U1 | 성능 패널이 SonarScope를 가리지 않음 | ✅ 확인 |
| U2 | 단서 접근 시 `[F] 길게 눌러 단서 수집` 표시 | ✅ 확인 |
| U3 | F 키 주변 원형 진행 테두리가 시계 방향으로 채워짐 | ✅ 확인 |
| U4 | F를 중간에 놓으면 진행이 초기화됨 | ✅ 확인 |
| U5 | 다시 F를 누르면 0부터 진행 | ✅ 확인 |
| U6 | 한 바퀴 완료 후 단서가 수집됨 | ✅ 확인 |
| U7 | 단서 marker가 사라짐 | ✅ 확인 |
| U8 | 단서 진행도가 증가함 | ✅ 확인 |
| U9 | 단서와 salvage가 시각적으로 구분됨 | ✅ 확인 |
| U10 | 흰색 salvage 원에서는 F 수집 HUD가 뜨지 않음 | ✅ 확인 |
| U11 | 단서 진행도 HUD가 표시됨 | ✅ 확인 |
| U12 | 보스 구역 위치·잠김·진입 가능 상태를 확인할 수 있음 | ✅ 확인 |
| U13 | 보스 구역 진입 피드백이 표시됨 | ✅ 확인 |

### 사용자가 확인하지 않은 항목 — pass로 올리지 않는다

보스 최종 격파 · 두 번째 sortie 보스 재생성 · 패배 후 재출항 회귀 ·
farming 지급 상한 48 도달 · DetectionHud 제거 · 최종 M1·M2 Exit gate.
**보스 구역 잠김 상태에서의 spawn 0**과 **3/3 이후 spawn 정확히 1회**도
사용자 보고에 포함되지 않았다 — 미확인으로 남긴다(§4).

## 2. 컨테이너 production 실측 41/41 (출처: 이번 회차 자동 관측)

`http://localhost:5173/` 일반 진입. `?bossSpike=1` · `?bossviewdemo=1` ·
`?sonardemo=1` · `?econdemo` 등 fixture·demo 쿼리 **0건**. 입력은 실제
production 키 경로(W/A/D/E/Shift/F/Q/좌클릭)만. 텔레포트·좌표 직접 변경 **0건**.

### 2-1. 단서 회수 완주 (`survey-probe`)

| 항목 | 실측값 |
|---|---|
| 기지 상태 | 탐사 HUD·F 프롬프트 둘 다 숨김 · 단서 표식 노드 **3개** |
| 출항 직후 | 탐사 HUD 표시 · `available=false` → **프롬프트 0** |
| 구역 줄 | `보스 구역 X -8~17 · Z 44~60 — 잠김` · `unlocked=false` · `bossSpawned=false` |
| Shift 잠항 | pose (0, **−19**, 0) → `available=true` · `candidate=survey-probe` · `kind=clue` |
| 프롬프트 | 표시 · `[F] 길게 눌러 단서 수집` · 홀드 전 링 **0** |
| **링 ↔ 정본** | 표본 9건 전건 일치, **최대 오차 0.0000** (표본 progress `0.00 0.05 0.10 0.15 0.20 0.25 0.60 0.95 → 0`) |
| 중간 단계 | 대표 중간 단계 스크린샷 1장 (촬영 직전 `progress=0.250` `ring=0.25`, 직후 `0.600`/`0.6` — 이미지는 그 사이 구간) |
| 회수 발행 | `{kind:'clue', targetId:'survey-probe', clueId:'clue-deep-survey'}` — targetId ≠ clueId |
| 진행도 | **1/3** · `bossCluesChanged=['1/3']` |
| 완료 피드백 | `단서 수집 완료` + `보스 단서 1/3` |
| **marker 제거** | 단서 표식 노드 **3 → 2** |
| 회수 후 프롬프트 | **숨김** (`available=false` · `candidateCollected=true`) |
| 진행도 HUD | `보스 단서 1/3` |
| **clue credits 0** | 지갑 `credits=0` · `lootDropped=[]` |
| **중복 방지** | 동일 대상 재홀드 → 발행 **1건 유지** · 진행 **1/3 유지** · 프롬프트 0 |
| 해제 후 링 | **0** |
| **반경 이탈** | E 상승으로 실제 이탈 → `candidate=null` · 프롬프트 **0** · 링 **0** |
| salvage | production interactable은 clue 3종뿐 — salvage는 F 대상이 아니다(`candidateKind` clue 외 0) |
| **save → 재접속** | 진행 **1/3 유지** · `ids=['clue-deep-survey']` |
| **회수 marker 재표시 0** | 재접속 후 단서 표식 노드 **2개** |
| 콘솔 / 페이지 오류 | **0 / 0** |

### 2-2. 레이아웃 — **F 프롬프트가 실제로 뜬 상태**에서 측정

| 검사 | 1920×1080 | 2552×1388 |
|---|---|---|
| 표시 요소 9종 전 쌍 겹침 | **0건** | **0건** |
| 성능 패널 ↔ SonarScope | 비중첩 (성능 x1556~1908 · 소나 x12~206.4) | 비중첩 (성능 x2188 · 소나 right 261.8) |
| 성능 패널 ↔ 자산 HUD | 비중첩 (자산 하단 85.6 → 성능 상단 98) | 비중첩 (동일) |
| F 프롬프트 ↔ 하단 생존 HUD | 비중첩 (프롬프트 하단 713.5 · 생존 상단 1000.1) | 비중첩 (867.5 · 1308.1) |
| 탐사(단서) HUD ↔ 탐지 HUD | 비중첩 (탐사 x12~337.2 · 탐지 x867.6~1052.4) | 비중첩 (탐사 right 337.2 · 탐지 x1183.6) |
| 화면 밖 잘림 | **0건** | **0건** |
| 페이지 오류 | **0건** | **0건** |

성능 패널 상단 = 자산 HUD 실제 하단 + 12px (두 해상도 동일하게 측정 반영).

### 2-3. 결정적 컴포넌트 검증 58/58

production 컴포넌트를 dev 서버에서 그대로 import 하고 read model 스텁만
갈아끼운 검증(게임 fixture·텔레포트 0, `pageerror` 0).

- **F HUD (P01~P30)**: `available=false` → HUD 0 · `available=true` → HUD 1 ·
  progress 0/0.25/0.50/0.75/1.0 → 링 0/¼/½/¾/한 바퀴(오차 <0.01) ·
  `rotate(-90 24 24)`(12시 시작·시계 방향) · F 해제 → 0 · 거리 이탈 → 숨김+0 ·
  **candidate 변경 → 이전 잔상 0** · 완료 후 prompt 제거 · 동일 단서 재수집 HUD 0 ·
  salvage 후보 → HUD 0 · 단서 목록 밖 id → HUD 0 · `unwired` → HUD 0 ·
  포커스 상실/복귀 · 완료 피드백 1.5~2.0초 만료 · `pointer-events:none`.
- **탐사·구역 HUD (E01~E27)**: 진행 0/3→2/3→3/3 · 안내·범례 문구 ·
  구역 좌표 = 주입 `BOSS_ZONE` 값 · 단서 부족 → **잠김 안내** ·
  3/3 → **진입 가능 안내** · 밖→안 edge → **진입 메시지 1회** ·
  체류(반복 update) 중 **메시지 재노출 0** · 중복 통지 재노출 0 ·
  교전 상태 전환·복귀 · reset · dispose.

## 3. 증거 목록 (이번 회차 · 전부 일반 production 진입)

| 파일 | 내용 |
|---|---|
| `rc_f_prompt.png` | 단서 근접 F 프롬프트 (링 0) |
| `rc_ring_mid.png` | 원형 진행 **대표 중간 단계** (홀드 중, 진행도 0/3 · 완료 피드백 없음) |
| `rc_clue_collected.png` | 단서 수집 완료 피드백 + 진행도 1/3 |
| `rc_after_reload.png` | 재접속 직후 (진행 1/3 유지) |
| `rc_layout_2552x1388.png` | 2552×1388 프롬프트 노출 레이아웃 |

이전 회차 증거 `hudfix_*.png`(레이아웃 2해상도·출항 직후·프롬프트·홀드 링·
완료·핑·재접속)도 같은 코드·같은 진입 경로에서 얻은 유효 증거로 유지한다.

fixture·demo 쿼리 화면 · 실패 항법 화면 · 출처 불명 스크린샷 · 이전 실행
잔여물은 **0건**이다. `.git/info/exclude`에는 임시 측정 규칙이 없다(기본 템플릿만).

### 25 / 50 / 75 % 개별 스크린샷을 만들지 않은 이유

소프트 렌더(swiftshader, FPS 10)에서 **전체 화면 스크린샷 1장이 게임 시간을 크게
진행시킨다** — 촬영 직전 `progress=0.250`이던 값이 직후 `0.600`이 된다. 한 번의
홀드에서 25 / 50 / 75 를 각각 정확히 담을 수 없으므로, 실제로 담기지 않은 값을
파일 이름으로 붙이지 않았다(초기 촬영본 3장은 폐기했다).

링 정확도의 정본 증거는 **수치 표본**이다 — 별도 재촬영 회차에서 표본 14건
(`0.00 0.05 0.10 0.15 0.20 0.25 0.65 0.70 0.75 0.80 0.85 0.90 0.95 → 0`)의
`progress` ↔ 그려진 링 **불일치 0건**, 본 회차 표본 9건 **최대 오차 0.0000**.
0.25 / 0.50 / 0.75 정확 지점의 링 값은 결정적 검증 P06~P08이 담당한다.

### 스크린샷이 없는 항목

**보스 구역 진입 가능 · 보스 구역 진입** 화면은 컨테이너에서 재현하지 못했다
(§5 항법 미도달). 이 두 항목은 **사용자 로컬 검수(U12·U13)로만** 확인됐고
컨테이너 스크린샷은 없다 — 없는 증거를 만들지 않았다.

## 4. 변경 범위 — 게임플레이 정본 무변경 확인

`origin/dev...HEAD` 기준 변경 파일 0건인 정본:

```
src/systems/interaction/InteractionSystem.ts   변경 0
src/systems/KeyboardInput.ts                   변경 0   (KeyF 처리 포함)
src/meta/BossProgressStore.ts                  변경 0   (중복 방지 포함)
src/world/bossCluePlacements.ts                변경 0   (clue 좌표·canonical mapping)
src/world/bossPlacement.ts                     변경 0
src/systems/economy/**                         변경 0   (salvage 자동 회수·farming 정책)
src/contracts/**                               변경 0
params/**                                      변경 0   (holdSeconds 2.0 · interactRadiusMeters 6.0 포함)
```

변경 범위는 `src/core/Game.ts`(조립 배선) · `src/styles.css` ·
`src/ui/PerformanceOverlay.ts` · 신규 `src/ui/InteractionPromptHud.ts` ·
`src/ui/ExplorationHud.ts` · 문서·증적뿐이다 — HUD·발견 가능성·layout 한정.

3D 거리 판정은 `InteractionSystem` 내부 그대로이며 HUD는 거리를 계산하지 않는다.

## 5. 전체 자동검증 (실제 exit code)

```
npm run typecheck                            exit 0
npm run build                                exit 0
npm run check:size                           exit 0   상한 대비 7.3%
npm run check:scope                          exit 0
npm run verify:gameplay                      exit 0   324/324
npm run verify:meta                          exit 0   165/165
npm run verify:tooling                       exit 0    36/36
npm run verify:hud                           exit 0    34/34 (페이지 오류 없음)
npm run verify:sprint-a                      exit 0
npm run verify:sprint-b                      exit 0
npm run verify:sprint-c                      exit 0
npm run verify:runtime-closure               exit 0   pass 32 · fail 0 · unwired 0 ·
                                                      blockedByNullParam 0 · blockers 0
npm run verify:closure-browser               exit 0   pass 2 · manual 3 · blocked 14 · 오류 0
npm run verify:runtime-closure --enforce-exit exit 1  (§6)
production 실측 (이번 회차)                    41/41
결정적 HUD 검증                                58/58
```

`C1-clueMapping` pass · `Q1-activePingKey` pass · `WIRING_2~16` 전부 pass ·
unwired 0 · blockedByNullParam 0 · fail 0.

테스트 삭제·skip·todo·disabled·단언 약화 **0건**
(`origin/dev...HEAD` diff에 `.skip`/`.todo`/`xit(`/`xdescribe`/`@disabled` 추가 0).

## 6. enforce-exit 실패 사유 분류 (exit 1)

```
EXIT_INCOMPLETE   EC1~EC9 · EC12~EC15 · EC17   (14)
MANUAL_EVIDENCE_MISSING   EC10 · EC11 · EC16    (3)
FIXTURE_STATE_UNKNOWN     EC14 · EC15           (2)
```

| 그룹 | 항목 | 사유 |
|---|---|---|
| 단서 3/3 | EC1 회수 3개 · EC2 중복 0 · EC3 재접속 3/3 | 원거리 단서(z −38 / −52) **항법 미도달** — 1/3까지만 실측 |
| 구역 게이트 | EC4 3/3 이전 spawn 0 · EC5 3/3 이후 1회 spawn | 보스 구역(z 44~60) 항법 미도달 |
| 보스 전투 | EC6 포트 실연결 · EC7 본체·약점 타격 · EC8 배율 1회 · EC9 단계 전환 · EC12 패배 경로 · EC13 승리 보상 1회 · EC17 reset·재출항 | 보스 spawn 미도달 |
| 사람 눈 | EC10 예고 표시 · EC11 피격 시각 구분 · EC16 DetectionHud 정리 | manual 판정 대기 |
| fixture 판정 | EC14 소나 provider · EC15 exploration blip | production-preview에 DEV 핸들이 없어 harness가 판정 불가. **dev-mode production 관측으로는 완료**(`M1_M2_PRODUCTION_CLOSURE.md` §2 S2·S7) |

**남으면 안 되는 사유는 0건이다**: WIRING 실패 0 · UNWIRED 실패 0 ·
C1 실패 0 · Q1 실패 0 · F interaction HUD 미작동 0 · clue progress HUD 미작동 0 ·
boss zone 안내 미작동 0.

> `verify:closure-browser`의 blocked 문구는 `auto:'wiring'` 항목에 붙는 **고정
> 메시지**('production 배선 미완')이며 실제 배선 상태를 읽지 않는다. 실제 배선은
> `verify:runtime-closure` pass 32 · fail 0 · unwired 0이다. harness가 S자 협곡
> 항법을 수행하지 못해 관측 자체를 못 하는 것이며, 이 PR에서 tooling verifier
> 규칙을 고치지 않았다.

## 7. 남은 blocker (사실 그대로)

### 7-1. farming reward 데이터 — 미해결, 이번에도 구현하지 않음

```
FARMING_PARAMS_WIRED=true
FARMING_CAP_DERIVED=48
FARMING_REWARD_DATA_WIRED=false
FARMING_CAP_PRODUCTION_VERIFIED=false
```

- production gold/salvage **interactable 0개** — `attachInteractables` 공급분은
  clue 3종이고 `PAYABLE_KINDS = ['gold','salvage']`에 clue는 없다
- `FarmingRewardEntry` 데이터 **0건** · 대상별 credits 표 **0건**
- 임의 보상표·임의 credits·fallback **생성 0** → 지급은 `noReward` 유지
- 이번 실측에서도 `credits=0` · `lootDropped=[]`로 재확인
- 소유자: **기획(금액·산식) + 월드(대상 배치)** — 값·배치 결정 필요

### 7-2. DetectionHud 제거 — 별도 그래픽스 후속

```
DETECTION_HUD_REMOVED=false
```

SonarScope production 연결(`unwired=false`)과 사용자 확인은 끝났지만,
정보 중복 판정과 제거는 그래픽스 소유 최소 후속 작업이다.

### 7-3. 최종 gate — 사용자 UX 확인만으로 올리지 않는다

```
M1_EXIT_GATE_PASSED=false
M2_PROGRESS_GATE_PASSED=false
M1_M2_INTEGRATED_COMPLETE=false
M3_START_ALLOWED=false
```

## 8. 상태 플래그

```
PERFORMANCE_PANEL_REPOSITIONED=true
PERFORMANCE_PANEL_SONAR_OVERLAP_FIXED=true

F_HOLD_PRODUCTION_WORKING=true
CLUE_INTERACTABLES_PRODUCTION_WORKING=true
CLUE_INTERACTION_PROMPT_WORKING=true
CLUE_CIRCULAR_HOLD_PROGRESS_WORKING=true
CLUE_HOLD_CANCEL_RESET_WORKING=true
CLUE_PROGRESS_HUD_WORKING=true
CLUE_MARKERS_REMOVE_ON_COLLECT=true
CLUE_DUPLICATE_PREVENTED=true
CLUE_CREDITS_REWARD_ZERO_VERIFIED=true
CLUE_SALVAGE_VISUAL_DISTINCTION_WORKING=true
CLUE_DEPTH_GUIDANCE_WORKING=true

BOSS_ZONE_MARKER_VISIBLE=true
BOSS_ZONE_LOCKED_FEEDBACK_WORKING=true
BOSS_ZONE_AVAILABLE_FEEDBACK_WORKING=true
BOSS_ZONE_ENTRY_FEEDBACK_WORKING=true

CLUE_SAVE_RESTORE_WORKING=true          (실측 범위 1/3 — 3/3 왕복은 미실측)
BOSS_LOCKED_BEFORE_THREE_CLUES=false    (미확인 — 잠김 상태 진입 시도 관측 없음)
BOSS_SPAWNED_ONCE_AFTER_THREE_CLUES=false (미확인 — spawn 횟수 관측 없음)

FARMING_REWARD_DATA_WIRED=false
FARMING_CAP_PRODUCTION_VERIFIED=false
DETECTION_HUD_REMOVED=false
M1_EXIT_GATE_PASSED=false
M2_PROGRESS_GATE_PASSED=false
M1_M2_INTEGRATED_COMPLETE=false
M3_START_ALLOWED=false
```

`BOSS_ZONE_*` 4종은 **사용자 로컬 검수(U12·U13)** + 결정적 검증(E10~E22)
근거다. `BOSS_LOCKED_BEFORE_THREE_CLUES`·`BOSS_SPAWNED_ONCE_AFTER_THREE_CLUES`는
HUD 표시가 아니라 **spawn 판정** 관측이 필요한 항목이라 별도로 남긴다.
