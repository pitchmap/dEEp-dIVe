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
