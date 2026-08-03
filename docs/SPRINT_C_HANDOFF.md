# SPRINT_C_HANDOFF — 역할별 병렬 착수 인계표 (개발 리드)

> 근거: INT-CORE-014·015 (`docs/INTEGRATION_NOTES.md`), 12차 결의 3(C1~C9),
> 15차 결의 2(창 범위표). 리드 선행 계약·공용 코어는
> `origin/claude/deep-dive-core-lead-uyg77p`에 있다.
>
> **C_ROLE_HANDOFF_READY = true** — C1~C4 계약·침수 피해 경로·
> PlayerAliveSource 경계·저장 결과·DEBRIEF read model이 닫혔다.
> 아래 표의 인계 항목이 각 창의 착수 기준이다.

## 확정 정책 (이번 마감에서 고정 — DECISIONS C-6~C-8)

1. **선체 손상·침수 = 출항 단위 상태.** 기지 복귀 후 다음 출항 시작 시
   업그레이드 반영 `maxHull`을 재계산하고 `currentHull = maxHull`로 초기화.
2. 기지까지 이어지는 영구 선체 손상·수리비·수리 시간 = **후속 스프린트 이관**.
3. 업그레이드 구매 순간에는 진행 중 출항의 `currentHull`을 회복시키지
   않는다 — 최대치만 갱신, 효과는 다음 출항 초기화에서 적용.
4. **압력 피해 = 공식 C1~C9 핵심 범위 제외.** `DepthPressurePort` 계약은
   확장 경계로 남기되 production runtime은 unwired 유지. 압력 수치를 C9
   필수 combat params·`verify:sprint-c` 필수 게이트·C 완료 조건에 넣지 않는다.

## 리드 소유 계약·코어 (병합 대상)

| 파일 | 내용 |
|---|---|
| `src/contracts/detection.ts` | C1~C3 — 탐지 입력 포트·읽기 모델 2종·추적 상태 경계·unwired·reset |
| `src/contracts/survival.ts` | C4~C8 — 피해·선체·침수·폭뢰 params·실패 정산·DEBRIEF read model |
| `src/contracts/events.ts` | `playerDestroyed`·`sortieFailed` (기존 + INT-CORE-014) |
| `src/core/PlayerHullSystem.ts` | 피해 수신 단일 창구 (침수 tick 포함 전 피해가 여기 통과) |
| `src/core/FloodingCore.ts` | 결정적 침수 누적 (닫힌 적분 — dt 분할 무관) |
| `src/core/SortieFailureCoordinator.ts` | 파괴 1회 = 정산 1회 = 저장 요청 1회 |
| `src/core/PveIntegration.ts` `DebriefStateTracker` | DEBRIEF 읽기 모델 구현 |

---

## 게임플레이 창

- **병합할 리드 커밋**: `d048c40`(C 계약) → `c3367a4`~`59b4bfe`(공용 코어)
  → `d28f503`~`0b3a879`(C1~C4 계약 마감·침수 경로·DEBRIEF)
- **구현할 source·adapter (C1~C4)**:
  1. `DetectionSystem` 구현 — `DetectionEnvironmentSource`(자체 제공) 소비,
     `params/detection.json` 확정 3종 사용. 거리 감쇠·감소율은
     `DetectionTuningParams` null이면 **unwired**(게이지 0 고정)
  2. `DetectionStageSource` 노출 — AI·조립부 소비용 (stage + 마지막 노출 위치)
  3. `EnemyAttackPort` 구현 — 쿨다운·사거리 판정. `DepthChargeDamageParams`
     null이면 `unwired` 반환 (즉시 피해·거리 무관 피해 금지)
  4. `DepthChargeSystem` 구현 — 투하·신관(3.0s 하한)·폭발·근접 판정
     (direct/near) → `DamageRequest` 생성 → **`applyDamage` 단일 창구만**
  5. 충돌 피해를 도입한다면 같은 창구 사용 (`sourceType: 'collision'`)
- **PlayerAliveSource 배선**: `attachPlayerAliveSource(source)` API를
  `GameplaySystems`(또는 PatrolShipFleet)에 추가 — `isTargetAlive(PLAYER_ENTITY_ID)`가
  source를 읽게 하고, 파괴 후 추적·공격 요청을 중단. 조립부 연결은 리드가
  `gameplay.attachPlayerAliveSource(playerHull)` 1줄로 수행(Game.ts에 대기 주석)
- **병행 정산 경로 제거**: `EconomySystem.settleDefeat`(:251)·
  `settleReturn`(:256)·`RunEconomy.settleSortie`(:94) — **production 호출자
  0건 확인됨**(정의만 잔존). 삭제하고, 검증 전용으로 쓰이면 검증 코드도 함께
  정리. acceptance: `verify:meta`의 '이중 정산 방지' 정적 검사 통과 유지
- **수정 가능**: `src/systems/**` (faction·economy·collision 포함)
- **수정 금지**: `src/core/**`·`src/contracts/**`(제안 절차 경유)·
  `src/meta/**`(save 포함)·`src/render/**`·`src/ui/**`·`params/*.json` 확정값
- **필수 테스트**: 탐지 unwired 시 게이지 0 고정 / 침묵 항행·심도 보정 적용 /
  폭뢰 신관 3.0s 하한 / direct·near 판정 경계 / 피해가 전부 applyDamage 경유
  (자체 체력 상태 0) / 파괴 후 공격 요청 0 / 어뢰 발사 지점 무조건 노출

## 그래픽스 창

- **SurvivalReadModel 소비**: `playerHull.survivalReadModel()` — hull·flooding·
  survivalState·lastHitDirection·damageFlash(소비 후 `consumeDamageFlash`)·
  `warningIds` **키만**(문구·색·이펙트는 그래픽스 소유). `unwired`면 정상
  선체로 위장하지 않는 표시(예: 미연결 표기)를 선택할 것
- **Detection read model 소비**: `DetectionHudView`(게이지·stage·unwired) +
  기존 `detectionChanged` 구독 — 눈 아이콘 3단계. 게이지 재계산 금지
- **DEBRIEF read model 소비**: `DebriefReadModel`만으로 화면 분기 —
  `kind: 'returned'|'aborted'` → **귀환 정산 화면**(sortieEnded 데이터),
  `kind: 'destroyed'` → **실패 화면**(failure.reason·appliedLoss·보존 내역),
  `canRetrySave` → 저장 재시도 UI 노출. `isDestroyed` 추측 분기 금지
- **분리 기준(C7)**: 실패 화면과 귀환 화면은 **데이터 소스(sortieFailed vs
  sortieEnded)와 화면이 모두 분리** — 같은 컴포넌트의 조건 분기로 합치지 않는다
- **금지**: 상태·수치 변경(모델은 전부 읽기 전용), 침수량·피해량 결정,
  X-ray 침수 자체 타이머(`floodingChanged` severity 매핑만)
- **필수 검증**: 실패/귀환 화면 데이터 분리 브라우저 실측, X-ray 침수
  구동(`floodingChanged`), 피격 플래시 1회성, unwired 표시

## 빌드·툴 창

- **`params/combat.json` 추가 필드 (C9 [COMBAT])**:
  선체 `baseMaxHull`·`damagedRatioThreshold`·`criticalRatioThreshold` /
  폭뢰 `directRadiusMeters`·`nearRadiusMeters`·`directDamage`·`nearDamage`·
  `dropCooldownSeconds` / 침수 `minorThreshold`·`majorThreshold`·
  `catastrophicThreshold`·`hullDamagePerSecondAtFull`·`spreadPerSecond` /
  탐지 `distanceFalloff`·`gaugeDecayPerSecond`
- **null/unwired 규칙**: 미확정 필드는 **null 명시**(생략 아님) — validator는
  null 통과·목록 보고, 숫자면 범위 검증. null을 0이나 기본값으로 변환 금지
- **압력 관련 값(`safeDepthY` 등)은 현재 필수 C9 범위에서 제외** — 스키마에
  넣더라도 optional·비필수로 두고 게이트 판정에 포함하지 않는다
- **`verify:sprint-c` 검사 항목 (리드 요구 인수 조건 — 아래 manifest)**
- **정적 검증**: production composition의 provisional import 0건·임의
  fallback 수치 0건·검증 더블 미사용 — `verify:meta` 기존 검사와 중복되지
  않는 범위만 추가

### C 인수 manifest (verify:sprint-c가 생기기 전 리드 요구 조건)

| # | 항목 | 판정 근거 |
|---|---|---|
| C1 | 탐지 게이지 작동 (params 주입 시) / 미주입 시 unwired 게이지 0 | 결정적 + 브라우저 |
| C2 | 침묵 항행·심도 보정이 게이지 증가율에 반영 | 결정적 (detection.json 확정 3종) |
| C3 | patrol→alert→attack→lost 전이 + detectionChanged 발화 | 결정적 (`TrackingStateSource`) |
| C4 | 폭뢰 투하→신관 3.0s→폭발→direct/near→applyDamage 경유 피해 | 결정적 + 브라우저 |
| C5 | 내구도 감소·침수 tick 단일 창구·X-ray 표시 | `verify:meta` 110항목 + 브라우저 |
| C6 | 파괴 시 실패 화면 = `sortieFailed`/`DebriefReadModel(kind:destroyed)` | 브라우저 |
| C7 | 귀환·실패 정산의 데이터·화면 분리 (`sortieEnded` vs `sortieFailed`) | 브라우저 |
| C8 | 파괴 후 재접속 → 영구 요소(지갑·업그레이드·loadout) 보존 | 결정적 + 브라우저 |
| C9 | 전투 임시값 전량 params 이관 — 코드 상수 0 (`C 수치 발명 금지` 검사) | 정적 |
| 공통 | 실패 1회 = 정산 1회 = 최초 저장 요청 1회, retry 재정산 0회, 저장 성공 전 BASE 전환 0회 | `verify:meta` |

## 통합 관리자 창

- **병합 순서**: 리드 → 게임플레이 → 그래픽스 → 툴링 (기존 규칙)
- **composition 조립 순서**: 공식 params → PlayerHullSystem(+FloodingCore) →
  DetectionSystem → EnemyDamageBridge(폭뢰) → patrol 공격 source →
  SortieFailureCoordinator → MetaLoop 정산 → SaveBridge → BASE 전환 →
  DebriefStateTracker → SurvivalReadModel·DetectionHudView → 렌더 HUD.
  게임플레이 attach API 도착 시 `gameplay.attachPlayerAliveSource(playerHull)` 1줄
- **브라우저 실측 시나리오**: 피격→HUD 감소→침수 표시→파괴→실패 화면→
  저장→기지→재출항 정상 상태 / 저장 실패 주입→DEBRIEF 유지→재시도→기지 /
  정상 귀환 화면과 실패 화면 분리 확인
- **B6·B7 분리**: 병렬 슬롯 커밋([ECON]/B7 태그)은 C core 파일과 섞지 않는다.
  C 테스트는 B7 실측 데이터를 요구하지 않는다
- **dev PR gate**: C1~C9 전 항목 + A·B 회귀(verify:sprint-a/b) + 이중 정산
  방지 정적 검사 통과. `verify:sprint-c` 도착 전에는 이 문서의 manifest가 기준

---

## 통합 composition patch (INT-CORE-016 — 확정본. 통합 관리자 적용용)

> 기준: 리드 최종 커밋 + 게임플레이 `844d0c7`·그래픽스 `97e7dd3`·툴링
> `2814dd0` 보고. 병합 순서 **리드 → 게임플레이 → 그래픽스 → 툴링** 후
> `Game.composeSystems` 안에서 아래를 적용한다.

### ① 게임플레이 배선 (INT-GAME-014 — 4줄 + 공격 포트 1줄)

| # | 코드 | 위치 (리드 브랜치 기준) |
|---|---|---|
| 1 | `gameplay.attachPlayerAliveSource(playerHull);` | `playerHull` 등록 직후 — '배선 대기' 주석 자리 |
| 2 | `gameplay.attachDamageReceiver(playerHull);` | 위와 같은 블록 (피해 단일 창구 연결) |
| 3 | ~~`gameplay.attachCombatParams(combatJson);`~~ → **`gameplay.attachCombatParams({ detectionTuning: combat.detectionTuning, depthCharge: combat.depthCharge });`** (INT-CORE-017 개정) | `loadCombatParams()` 결과(`combat`) 사용 자리 — 원안의 'raw 원본 그대로'는 툴링 C9-loaderSingleSource 검사(공인 로더 밖 combat.json import 금지)·게임플레이 구 평면 리더(중첩 스키마와 불일치)와 3중 충돌해 폐기. 정규화 소유자는 공인 로더 하나이며 게임플레이는 계약 타입 단면(`NormalizedCombatParams`)만 받는다. raw import 0줄, null 블록은 null 그대로(unwired 유지) |
| 4 | `enemyAttackBinding.attach(gameplay.enemyAttackPort);` | `enemyAttackBinding` 생성 직후 — **이 줄이 C4 공격 사슬의 마지막 연결**이다 |
| 5 | (선택) `scene.attachShipWorldSource(gameplay.shipWorldSource); scene.attachShipIdentificationSource(gameplay.shipIdentification);` | 기존 scene attach 클러스터 |

### ② 그래픽스 배선 (INT-RENDER-012 — 2줄 + 확인 command 교체)

| # | 코드 | 위치 |
|---|---|---|
| 1 | `detectionHud.attachDetectionSource(gameplay.detectionHudView 기반 소스);` | 그래픽스 Game.ts의 '도착 시' 주석 자리 — 게임플레이 정확 API는 `gameplay.detectionHudView()`(값 복사본 함수)이므로 폴링 어댑터 `{ get view() { return gameplay.detectionHudView(); } }` 형태로 연결 |
| 2 | `detectionHud.attachTrackingSource(guardAdapter);` | 같은 자리 — 추적 소스 정본은 **리드 `GuardShipAdapter`**(`TrackingStateSource` 구현, `trackedShips`) |
| 3 | **확인 command 교체**: 그래픽스 `returnScreen.attach(..., () => metaLoop.completeDebrief())`·실패 화면 저장 성공 경로의 `completeDebrief` 직접 호출을 전부 `this.debriefConfirm.confirm()`으로 교체 | 개정 정책(아래 §DEBRIEF)의 강제 — 직접 호출은 저장 미완료 가드를 우회한다 |

### ③ composition 조립 순서 (확정)

`loadParams`+`loadEconomyParams`+`loadAimingParams`+`combat.json` →
`FloodingCore`→`PlayerHullSystem`(② 판정) → 게임플레이 `DetectionSystem`·
`DetectionEnvironmentSource`(gameplay 내부) → `DetectionStageSource`(게임플레이
motion 포트 게이트) → `DestroyerAIController`(리드 factory + `EnemyAttackPortBinding`)
→ `attachPlayerAliveSource`·`attachDamageReceiver`·`attachCombatParams` →
`EnemyAttackCoordinator`←binding attach → `DepthChargeRunSystem`(gameplay 내부)
→ `SortieFailureCoordinator` → MetaLoop 정산 → `SaveBridge` →
`DebriefStateTracker`(+`DebriefConfirmCommand`) → read model 4종 → HUD·화면.

### ④ Game.ts 예상 충돌 위치 (그래픽스 97e7dd3 vs 리드 최종)

| 위치 | 충돌 내용 | 해소 방향 |
|---|---|---|
| import 블록 | 그래픽스 HUD 4종 import vs 리드 `DebriefConfirmCommand`·`EnemyAttackPortBinding` import | 양쪽 유지 (합집합) |
| `debriefState` 등록 직후 | 그래픽스 HUD·화면 마운트 블록 vs 리드 confirm command 생성 | 리드 `debriefConfirm` 생성이 먼저, 그 아래 그래픽스 마운트 — 화면 attach의 `completeDebrief` 직접 호출을 `debriefConfirm.confirm()`으로 교체 |
| `DebriefStateTracker` 생성자 | 그래픽스는 2-인자, 리드는 3-인자(`metaLoop` 추가) | **리드 3-인자 채택** (canConfirm 계산에 필요) |
| `surfaceMotionPorts`~`guardAdapter.attachFactory` | 리드가 factory 호출을 2-인자(`enemyAttackBinding`)로 변경 | 리드 채택 |
| 디버그 핸들 | 양쪽 추가 항목(`debriefConfirm`·`enemyAttackBinding`·`gameplay` vs 그래픽스 항목) | 합집합 |
| `sessionPort.start()` 주석·reset 블록 | 그래픽스가 DEBRIEF 자동 완료 관련 주석 수정 | 리드 확정본(개정 정책 주석) 채택 |

### ⑤ B5 테스트 변경 검토 (acceptance — 게임플레이 C3 적용으로 2건 갱신됨)

통합 관리자는 병합 후 다음을 검사한다:

1. 기존 B5 patrol 생성·이동 계약(스폰 → 범용 AI → motion 포트 이동)이 삭제되지 않았는가
2. B5 테스트가 제거되거나 skip 처리되지 않았는가 (`verify:gameplay`·`verify:sprint-b` 항목 수 감소 여부 확인)
3. **탐지 params unwired에서 경비함이 attack이 아니라 alert(마지막 확인 위치 접근)로 동작하는 것이 계약과 일치**하는가 — `getTargetPosition`이 stage detected에서만 위치를 주므로 unwired(항상 safe)면 attack 전이가 없다. 이것은 회귀가 아니라 C3 계약의 결과다
4. combat·detection params가 wired되면 attack 전이·공격 요청이 가능한 경로가 남아 있는가 (`DetectionStageSource` → 포트 게이트 → attack → `EnemyAttackRequest`)
5. B5 핵심 완료(범용 AI 재사용·신규 경비 AI 0)가 C3 도입으로 **거짓 통과**되지 않았는가 — `verify:meta`의 B5 정적 검사(구현체 1개·전용 AI 0)가 기준

### ⑥ consumeDamageFlash 계약 판정 (그래픽스 사용 — **허용**)

검토 결과 문제 없음 — 통합 acceptance에 **허용된 command**로 기록한다:

- `consumeDamageFlash()`는 렌더링용 일회성 플래시 플래그만 해제한다 —
  currentHull·flooding·survivalState·lastDamage 기록을 변경하지 않는다(코어 확인)
- `SurvivalReadModel`은 호출마다 새 값 스냅샷이므로 불변 계약이 깨지지 않는다
- 그래픽스 사용 형태(`attachSource(playerHull, () => playerHull.consumeDamageFlash())`)는
  읽기 + 플래시 acknowledge뿐 — 상태·수치 변경 없음
- 침수 tick의 지속 피해는 플래시를 만들지 않으므로(코어 규칙) HUD 연속 점멸 없음

### ⑦ DEBRIEF 종료 정책 (INT-CORE-016 개정 — 본 문서 §확정 정책에 우선)

```
save success → DebriefReadModel.saveStatus='saved' → DEBRIEF 유지
  → canConfirm=true (확인 command 활성) → 사용자 확인
  → DebriefConfirmCommand.confirm() → completeDebrief() → BASE
save failed → DEBRIEF 유지 → canRetrySave=true일 때만 retrySave
  → 재정산 없이 저장만 재시도 → 성공 시 canConfirm=true → (위와 동일)
```

정상 귀환(`sortieEnded`)·실패(`sortieFailed`) **양쪽 동일 정책.** 저장
성공만으로 `completeDebrief` 자동 호출 0회, 저장 미완료 confirm 거부
(`saveIncomplete`), 중복 confirm 거부(BASE 전환 1회). `verify:meta`
119항목이 전부 결정적으로 검증한다.

---

# C 통합 실행 결과 (통합 관리자 — 실제 병합·배선·실측 후)

> 이 구역은 통합 관리자 창의 실행 기록이다. 위 인계표는 리드가 정한 **지시**이고,
> 아래는 그 지시를 실제 병합 코드에 적용한 **결과**다. 어긋난 곳은 그대로 적는다.

## 1. 기준

| 항목 | 값 |
|---|---|
| 통합 브랜치 | `claude/deep-dive-d5-gray-box-integration-tree5i` |
| 작업 전 HEAD | `3958ce4` |
| 시작 `origin/dev` | `d832579` (A+B 통합 PR #4 병합분) |
| A+B 기준 `3958ce4` | ✅ `origin/dev` ancestry 포함 |
| dev 최신화 | `3bd8b3d` (rebase 아님 — merge) |

| 역할 | 최종 SHA | 원격 tip 일치 | 병합 커밋 |
|---|---|---|---|
| 개발 리드 | `839eace` | ✅ | `edc4b91` |
| 게임플레이 | `844d0c7` | ✅ | `e331505` |
| 그래픽스 | `97e7dd3` | ✅ | `6a04be7` |
| 빌드·툴 | `2814dd0` | ✅ | `834f28f` |

4개 SHA 전부 최종 통합 ancestry에 포함. `--no-ff` tip merge만 사용
(cherry-pick·rebase·squash·force push 없음, 병합 순서 변경 없음).

## 2. 충돌과 해소

| 파일 | 발생 | 해소 |
|---|---|---|
| `docs/INTEGRATION_NOTES.md` | 게임플레이·그래픽스 2회 | 양쪽 전문 보존 (삭제 0) |
| `src/ui/sprintCUiFixture.ts` | 그래픽스 QA 픽스처가 구 `DebriefReadModel`(canConfirm 이전) 사용 → typecheck 4곳 실패 | **리드 계약대로** 값 채움: `saveStatus==='saved'`인 경우만 `canConfirm: true`, 나머지 false |
| `src/core/Game.ts` | 자동 병합됨 — 인계표가 예고한 3지점 확인 | ① `DebriefStateTracker` **3인자**(리드) 채택 ② `destroyerAiFactory` **2인자**(공격 바인딩 포함) 채택 ③ import·디버그 핸들 **합집합** |
| `src/core/Game.ts` (수동) | 귀환 화면이 `metaLoop.completeDebrief()` **직접 호출** | `debriefConfirm.confirm()` guarded command로 **교체** — 직접 호출은 저장 미완료 가드를 우회한다 |
| `scripts/verify-sprint-c.mjs` | 렌더 소비 스캔이 `src/render/`만 관측 → 그래픽스 병합 후에도 소비 0건으로 오판 | 스캔 범위를 `src/render` + **`src/ui`**로 정정 (게임 UI는 FILE_OWNERSHIP상 `src/ui`). 관측 범위 확대이며 단언 약화가 아니다 |

## 3. Game.ts 최종 composition 순서

```
loadParams (movement/detection/combat/crew)
loadEconomyParams + loadAimingParams → OfficialRuntimeParams
loadCombatParams()                   → CombatParamsResult (15필드 전부 null)
MetaLoop → SaveStore 복원 → UpgradeState → deriveEffectiveParams
GameplaySystems(공식 params 생성자 주입) → restoreSavedLoadout
TorpedoTubeSocketRig(정본 참조)
SortieEconomyBridge → SortieSalvageSpawner(+placement)
GuardIncidentLedger → GuardShipAdapter → GuardSpawnCoordinator(+위치 전략)
EnemyAttackPortBinding ← gameplay.enemyAttackPort   ← C4 사슬 마지막 연결
  → createProductionDestroyerAIFactory(motionPorts, binding)
NeutralIncidentBoundary → GuardSpawnBridge → guardAdapter 등록
FloodingCore(combat.flooding) → PlayerHullSystem(combat.hull) 등록
  → gameplay.attachPlayerAliveSource(playerHull)
  → gameplay.attachDamageReceiver(playerHull)
UpgradePurchaseSystem → SaveBridge → CountingSavePort
  → PurchaseTransaction / EquipmentTransaction / DepartureCommand → BaseScreenPort
SortieFailureCoordinator(metaLoop, saveBridge) 등록
DebriefStateTracker(sortieFailure, saveBridge, metaLoop) 등록
DebriefConfirmCommand(metaLoop, debriefState)
EconomyHud / SortiePrepScreen (MetaUiAdapter)
DetectionHud ← detectionHudView 폴링 어댑터 · guardAdapter(TrackingStateSource)
SurvivalHud  ← playerHull + consumeDamageFlash
SortieFailureScreen / SortieReturnScreen ← debriefState (+confirm command)
sprintCHud 갱신 시스템 → CameraInputAdapter → Audio
scene attach 클러스터 (pose·cargo·shipWorld·identification·convoy·salvage·socket)
```

## 4. 배선 결과

| 항목 | 결과 |
|---|---|
| `attachPlayerAliveSource` | ✅ `Game.ts` 1회 → `PatrolShipFleet`·`EnemyAttackCoordinator` 양쪽 도달 (`verify:sprint-c` C-playerAliveAttach가 6지점 관측) |
| `attachDamageReceiver` | ✅ `PlayerHullSystem` **단일 창구** |
| `EnemyAttackRequest` 경로 | ✅ `DestroyerAIController` → `EnemyAttackPortBinding` → `gameplay.enemyAttackPort`. AI는 피해량·반경·쿨다운 미소유, 요청만 생성 |
| Detection HUD | ✅ 폴링 어댑터 `{ hudView: () => gameplay.detectionHudView() }` |
| Tracking HUD | ✅ `guardAdapter`(리드 `TrackingStateSource`) — 게임플레이에 없는 API를 만들지 않았다 |
| Survival HUD | ✅ `SurvivalReadModel`만 소비 |
| 실패/귀환 화면 | ✅ `DebriefReadModel.kind`만 소비 · `isDestroyed` 분기 **0건** |
| DEBRIEF confirm | ✅ `debriefConfirm.confirm()` guarded command |
| **`attachCombatParams`** | ~~❌ 미배선 — blocker (§5)~~ → ✅ **해소 (INT-CORE-017)** — 공인 로더 결과의 게임플레이 단면(`NormalizedCombatParams`) 전달로 배선. 15필드 null이라 런타임 동작 무변화(구조 배선만) |

## 5. Blocker — `gameplay.attachCombatParams` 전송 형태 충돌 → **해소 (INT-CORE-017, `claude/sprint-c-runtime-closeout`)**

> **해소 기록**: 리드가 전송 규약을 결정했다 — 정규화 소유자는 공인 로더
> (`tools/combatParams.validateCombatParams`) **한 곳**이고, 게임플레이의 구
> 평면 리더 2종은 제거됐다(이중 정규화 원인 제거). `attachCombatParams`는
> 계약 타입 단면 `NormalizedCombatParams{detectionTuning, depthCharge}`를
> 받으며 조립부가 `loadCombatParams()` 결과를 슬라이스해 넘긴다. raw
> combat.json import 0건(정적 검사 강제), null 블록은 null 그대로 전달
> (unwired 유지 — 부분 wired 금지). 아래는 당시 충돌 기록 원문이다.

인계표 §① 3번은 `params/combat.json` **원본**을 그대로 넘기라고 지정했으나,
병합 후 실제 코드가 두 가지로 어긋난다.

| # | 충돌 | 근거 |
|---|---|---|
| ⓐ | 툴링 검증기가 **공인 로더 밖 `combat.json` 직접 import를 금지** | `verify:sprint-c` `C9-loaderSingleSource` — 원본을 받을 통로가 없다 |
| ⓑ | 게임플레이 리더는 **평면 root**(`root['directRadiusMeters']`), 툴링 스키마는 **블록 중첩**(`depthCharge.*`·`detection.*`) | `src/systems/combat/officialCombatParams.ts` vs `params/combat.json` — 원본을 넘겨도 값 도착 후 읽히지 않는다 |

**통합 관리자는 전송 형태를 임의로 정하지 않았다** (계약 충돌 = blocker).
어댑터를 만들면 두 역할의 규약 중 하나를 통합 창이 대신 결정하는 것이 된다.

- **현재 영향 없음**: 15필드가 전부 null이라 어느 경로로도 결과가 같다 —
  탐지 safe 고정 · 공격 unwired · 폭뢰 피해 0. 브라우저 실측으로 확인했다.
- **해소 필요 시점**: 공식 수치 도착 **전까지**. 값이 들어오는 순간 C1·C4가
  조용히 unwired로 남는다.
- **소유**: 게임플레이(리더 형태) ↔ 빌드·툴(스키마 형태) ↔ 리드(전송 규약 결정).

선체·침수는 이 충돌의 영향을 받지 않는다 — 툴링 로더의 검증 결과를 리드
코어 생성자에 **직접** 주입하므로 공인 경로다.

## 6. B5 회귀 검토 (인계표 §⑤)

| # | 항목 | 결과 |
|---|---|---|
| 1 | patrol 생성 계약 유지 | ✅ 스폰 → 범용 AI → motion 포트 이동 경로 무변경 |
| 2 | 이동 계약 유지 | ✅ `verify:meta` B5 이동·경계·안전 정지 항목 전부 유지 |
| 3 | 테스트 삭제·skip 없음 | ✅ `verify:gameplay` 213 → **238**, `verify:sprint-b` 자동 22 → **22**, B5 항목 10건 전부 존재 |
| 4 | unwired에서 alert·마지막 확인 위치 접근이 C3와 일치 | ✅ 변경된 테스트 1건은 거리 측정 대상을 플레이어 → **사건 지점**으로 바꿨다. `getTargetPosition`이 stage detected에서만 위치를 주므로 unwired면 attack 전이가 없다 — **C3 계약의 결과이지 회귀가 아니다** |
| 5 | wired 시 attack·`EnemyAttackRequest` 경로 존치 | ✅ `verify:meta`의 '표적 방향 선회·전진' 테스트가 유효 표적 경로를 덮는다 |
| 6 | 단순 assertion 약화로 통과시키지 않음 | ✅ 변경 테스트는 **이동·수면 유지 단언을 그대로 유지**하고 대상만 계약에 맞췄다 |

**삭제된 check 2건은 B5가 아니다** — `[ECON] 파괴 정산 손실률`·`희귀 부품 보존`
두 건이며, 인계표가 지시한 **병행 정산 경로 제거**(`settleDefeat`/`settleReturn`)에
동반된 검증 정리다. 동일 보장은 정본 경로(`verify:meta` '정산: 파괴 = 크레딧 50%
손실, 희귀 부품 보존')가 덮고 있고, 부재 자체가
`[ECON] 병행 정산 API 제거` 검사로 고정됐다.

## 7. `consumeDamageFlash` 검토 (인계표 §⑥)

| 조건 | 결과 |
|---|---|
| `currentHull` 변경 없음 | ✅ |
| `flooding` 변경 없음 | ✅ |
| `survivalState` 변경 없음 | ✅ |
| `lastDamage` 기록 변경 없음 | ✅ |
| 렌더용 flash acknowledge만 | ✅ |
| `SurvivalReadModel` 스냅샷 불변성 | ✅ 호출마다 새 값 |

**허용된 command로 유지.** 사용 형태
`survivalHud.attachSource(playerHull, () => playerHull.consumeDamageFlash())`.

## 8. C9 combat params

**15종 전부 null 유지** (선체 3 · 폭뢰 5 · 침수 5 · 탐지 2).
임의 수치 입력 0 · null→0 변환 0 · provisional fallback 0 · fixture 복사 0 ·
압력 params 추가 0 (`verify:sprint-c` C9-nullAllowed·C9-fixtureIsolation·
C9-noProvisionalFallback·C9-pressureExcluded가 전부 관측으로 고정).

## 9. 자동 검증 (A+B+C 통합 빌드)

| 검사 | dev baseline | 통합 후 |
|---|---|---|
| `npm ci` / `typecheck` / `build` | ✅ | ✅ / ✅ / ✅ |
| `check:size` | 4.8% | ✅ **5.2%** |
| `check:scope` | ✅ | ✅ |
| `verify:gameplay` | 213/213 | ✅ **238/238** |
| `verify:meta` | 88/88 | ✅ **119/119** |
| `verify:tooling` | 26/26 | ✅ **26/26** |
| `verify:hud` | 34/34 | ✅ **34/34** |
| `verify:sprint-a` | 자동 전 항목 | ✅ 자동 전 항목 |
| `verify:sprint-b` | 자동 22/22 | ✅ **자동 22/22** |
| `verify:sprint-c` | (없음) | ✅ **자동 23/23** |

테스트 삭제·skip·assertion 약화·임의 params로 통과시킨 항목 **0건**.

### `verify:sprint-c` 상태 출력

```
C_CONTRACT_COMPLETE                = true
C_GAMEPLAY_COMPOSITION_PRESENT     = true
C_GRAPHICS_COMPOSITION_PRESENT     = true
C_TOOLING_READY                    = true
C_COMBAT_PARAMS_DEFINED            = false   ← 정상 (공식 수치 미도착)
C_RUNTIME_WIRED                    = false   ← 정상
C_BROWSER_EMPIRICAL_COMPLETE       = false   ← 정상
C_FINAL_COMPLETE                   = false   ← 정상
blockers = [ C9_PARAMS_PENDING:15/15, BROWSER_EMPIRICAL_PENDING ]
```

**경고로 설계된 항목 vs 실제 필수 실패 구분**

| 구분 | 항목 |
|---|---|
| 실제 필수 실패 (종료 코드 반영) | **0건** — 툴링 소유 영역 전 항목 통과 |
| 설계상 대기(종료 코드 미반영) | `C-browserSurvival`(생존 루프 실측 — params null로 성립 불가), `C-aimingProvisionalNotC`(A 스프린트 조준 provisional 2건 — C9 범위 아님, C 완료 판정에 넣지 않음) |

통합 중 실제로 **실패**했다가 해소한 항목 2건:
`C9-loaderSingleSource`(내 raw import 제거로 해소) ·
`C-survivalRender`/`C-debriefRender`(스캔 범위 정정으로 해소).

## 10. 브라우저 실측

### A. production (공식 null params 그대로) — **20/20 통과**

URL `http://localhost:5173/`, 쿼리 플래그 없음.

| # | 항목 | 실측 |
|---|---|---|
| 1 | 게임 시작·출항 가능 | `meta=BASE`, `canLaunchSortie=true` → `departed` |
| 2 | 콘솔 오류 | **0건** |
| 3 | Detection HUD 미연결 표시 | `"▦ 탐지 계기 미연결 — unwired — 게이지 정지 (판정 데이터 대기)"` |
| 4 | Survival HUD 미연결 표시 | `"▦ 선체 계기 미연결 (판정 데이터 대기) · ≋ 침수 0%"` — 정상 선체로 위장하지 않음 |
| 5 | 경비함 생성·이동 | 1척 `patrol` · `y=12` 수면 유지 · 6초 후 이동 확인 · AI `alert` |
| 6 | 공격·폭뢰 0 | 선체 `hullRatio=null`·침수 0·`survivalState=stable` · `detectionHudView={gauge:0,stage:'safe',unwired:true}` |
| 7 | 정상 귀환 | `settleSortie('returned')` |
| 8 | 정상 정산 | `kind=returned` · `saveStatus=saved` · `canConfirm=true` |
| 9 | 저장 성공 후 자동 BASE 전환 없음 | `meta=DEBRIEF` 유지 |
| 10 | 확인 버튼 → BASE | 버튼 DOM 클릭 → `meta=BASE` |
| 11 | 다음 출항 가능 | `departed` |
| 12 | salvage 재생성 | `salvage-1/2/3` |
| 13 | wallet·upgrade·loadout 보존 | 크레딧 500→500 · 업그레이드 동일 · loadout 동일 |
| 14 | 실패·귀환 화면 동시 표시 없음 | 귀환 표시=true · 실패 표시=false |
| — | C9 params 상태 | 미확정 **15/15** · hull wired=false · flooding wired=false |
| — | 중복 confirm | `invalidState` — BASE 전환 반복 없음 |
| — | 새 출항 reset | 경비함 0척 · 침수 0 |

스크린샷: `sprintC_prod_base.png` · `sprintC_prod_hud_unwired.png` ·
`sprintC_prod_guard.png` · `sprintC_prod_return_screen.png`.

> 자동화 참고: 귀환 화면 '확인' 버튼은 Playwright `click()` actionability에서
> 간헐적으로 차단된다(오버레이가 매 프레임 `display`를 써서 unstable 판정).
> `elementFromPoint` 히트테스트는 버튼 자신을 반환하고 실제 DOM click 이벤트로는
> 정상 동작한다 — **제품 결함이 아니라 자동화 아티팩트**로 판정했다.

### B. fixture / QA 모드 (`?cdemo=1`) — **14/14 통과**

fixture 결과는 production 실측으로 계산하지 않는다. 배지
`"C fixture — HUD 표시 규칙 검수용 (게임플레이 실제 상태 아님)"` 표시 확인.

| # | 항목 | 실측 |
|---|---|---|
| 1 | 탐지 3단계 | `─ 은신` / `◔ 수색` / `◉ 발각` |
| 2 | 추적 4상태 | `○ 순찰` · `◍ 경계` · `● 공격 태세` · `◌ 추적 상실` |
| 3 | 선체 피해 HUD | `"⛨ 선체 75 / 100 · 손상"` |
| 4 | 침수 HUD | `"≋ 침수 55% · ≋≋ 침수 — 심각"` |
| 5 | 방향성 피격 표시 | `[data-survival-hit-direction]` `⟪` opacity=1, 방위 회전 배치 확인 |
| 6 | failure/return 화면 분리 | 각각 단독 표시, 동시 표시 0 |
| 7 | 저장 실패 | `"✕ 저장 실패 — 기지로 이동할 수 없습니다…"` + 재시도 버튼 |
| 8 | retrySave | 재시도 → 저장 성공 전환 (정산 문구 재계산 없음) |
| 9 | 저장 성공 후 confirm | 확인 → 화면 종료 |
| 10 | 중복 confirm 방지 | 재클릭 후 화면 재표시 없음 |
| 11 | 작은 화면(640×480) HUD 겹침 | production HUD 2종 **화면 안·상호 겹침 없음** (fixture 배지만 탐지 HUD와 겹침 — 배지는 QA 전용, production 미존재) |

스크린샷: `sprintC_fixture_detection.png` · `sprintC_fixture_tracking.png` ·
`sprintC_fixture_survival.png` · `sprintC_fixture_hit_direction.png` ·
`sprintC_fixture_failure.png` · `sprintC_fixture_return.png` ·
`sprintC_fixture_small_screen.png`.

### C. production에서 실측하지 못한 항목 (공식 params null)

아래는 **완료로 보고하지 않는다.**

- 실제 탐지 게이지 상승 · 실제 attack 전이 · 실제 폭뢰 투하 · 신관 실측 ·
  direct/near 피해 · 실제 침수 증가 · 실제 선체 파괴 · 실제 파괴 기반 실패 정산

fixture에서 확인한 것은 **표시 규칙**뿐이며 판정·수치가 아니다.

```
C_BROWSER_EMPIRICAL_COMPLETE = false
```

## 11. 남은 blocker

1. ~~**C9 공식 수치 미도착** — 15/15 미확정~~ → **해소 (INT-CORE-018)** —
   C9 초기 공식 밸런스 v0.1 승인·입력 완료(DECISIONS C-13, 커밋 `c943d35`).
   공인 로더 pending 0건. production 브라우저 실측 완주 기록은
   INTEGRATION_NOTES INT-CORE-018 참조 — 탐지 상승·attack 전이·폭뢰
   신관 3.000s·direct 45/near 12/miss 0·파괴·실패 정산·confirm·재출항
   reset 전부 실작동, 콘솔 오류 0. ~~신규 blocker: 피격→침수 기여 공식
   param 부재로 침수 루프만 도달 불가~~ → **해소 (INT-CORE-019, C9 v0.1.1)**
   — 침수 기여 2필드 승인 입력(direct 0.35·near 0.10), 속도 기반 소음
   정책(고정 1 폐기), 목표 심도 기폭(y=0 고정 폐기)까지 마감하고
   production 재실측 완주(침수 단계 실전이·침수 잠식 파괴 포함).
   **C_FINAL_COMPLETE=true** (C_SILENT_RUNNING_INTERACTIVE=false 후속).
2. ~~**`attachCombatParams` 전송 형태 충돌** (§5)~~ → **해소 (INT-CORE-017)** —
   정규화 소유 단일화(공인 로더) + `NormalizedCombatParams` 단면 전달로 배선
   완료. 값이 도착하면 같은 경로로 자동 구동된다(코드 변경 불필요).
3. ~~**실패 화면 confirm 경로 부재**~~ → **해소 (INT-CORE-017)** —
   `SortieFailureScreen.attach` 3-인자화(confirmCommand 추가). '확인 (기지로)'
   클릭 = `debriefConfirm.confirm()` guarded command 호출이며 성공(BASE 전환)
   시에만 화면이 닫힌다. DOM 숨김 전용 경로 제거, 버튼 노출 근거는
   `canConfirm` 하나. 정상 귀환·실패 양쪽 동일 정책(§⑦) 충족 — 정적 검사
   (`verify:meta` ③-3)로 회귀를 막는다.
4. **B7 실측** (B 병렬 슬롯) — C와 무관, 혼합하지 않았다.
