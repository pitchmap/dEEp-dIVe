# CURRENT_STATUS — 역할별 현재 상태

> 모든 역할은 **작업 시작 전에 이 문서를 읽고, 작업 종료 시 자기 구역을 갱신**한다.
> 형식을 유지할 것: 완료 / 진행 중 / 다음 작업 / 차단 문제 / 변경된 계약 /
> 통합 주의사항 / 마지막 업데이트 / 담당 브랜치.

---

## 스프린트 C 기술 통합 — 통합 관리자, 최신

> 상세: `docs/SPRINT_C_HANDOFF.md` 'C 통합 실행 결과' §1~11.
> 브랜치: `claude/deep-dive-d5-gray-box-integration-tree5i` (dev 미병합, PR 없음).

### 병합 (시작 `origin/dev` = `d832579`)

| 역할 | SHA | 병합 커밋 | 충돌 |
|---|---|---|---|
| 개발 리드 | `839eace` | `edc4b91` | 없음 |
| 게임플레이 | `844d0c7` | `e331505` | 문서 1건 |
| 그래픽스 | `97e7dd3` | `6a04be7` | 문서 1건 + fixture 계약 갱신 |
| 빌드·툴 | `2814dd0` | `834f28f` | 없음 |

### composition 배선

`attachPlayerAliveSource` ✅ · `attachDamageReceiver` ✅ ·
`enemyAttackBinding.attach(gameplay.enemyAttackPort)` ✅ ·
선체·침수 params 주입 ✅ · Detection/Tracking/Survival/Debrief HUD ✅ ·
DEBRIEF confirm을 `debriefConfirm.confirm()` guarded command로 교체 ✅ ·
**`attachCombatParams` 미배선 (계약 충돌 — blocker)**

### 자동 검증

typecheck ✅ · build ✅ · size 5.2% · scope ✅ ·
**gameplay 238/238 · meta 119/119 · tooling 26/26 · hud 34/34 ·
sprint-a 전항목 · sprint-b 자동 22/22 · sprint-c 자동 23/23**

### 브라우저 실측

- **production(공식 null params) 20/20** — 출항·HUD 미연결 표시·경비함 생성/이동·
  공격 0·정산·저장 후 DEBRIEF 유지·확인 버튼으로 BASE·재출항·salvage 재생성·
  영구 데이터 보존·화면 배타 표시. **콘솔 오류 0건**
- **fixture(`?cdemo=1`) 14/14** — 탐지 3단계·추적 4상태·선체/침수/방향 표시·
  실패↔귀환 분리·저장 실패·retrySave·중복 confirm 방지·640×480 겹침 없음

### 판정

```
C_INTEGRATION_COMPLETE       = true
C_RUNTIME_WIRED              = false   (C9 params 15/15 미확정)
C_BROWSER_EMPIRICAL_COMPLETE = false   (실제 생존 전투 루프 실측 불가)
C_FINAL_COMPLETE             = false
```

### blocker 3건

1. C9 공식 수치 미도착 (15/15 null — 발명 금지)
2. `attachCombatParams` 전송 형태 충돌 (게임플레이 평면 root ↔ 툴링 블록 중첩,
   + 툴링이 원본 직접 import 금지) — **수치 도착 전에** 해소 필요
3. 실패 화면 '확인' 버튼에 confirm command 부재 (귀환 화면과 정책 불일치)

---

## A+B 최종 기술 통합 — 이전 회차

> 상세: `docs/SPRINT_A_INTEGRATION_MANIFEST.md` §AB1~AB8 ·
> `docs/SPRINT_B_ACCEPTANCE.md` 'A+B 최종 기술 통합 판정'.
> 브랜치: `claude/deep-dive-d5-gray-box-integration-tree5i` (dev 미병합).

### 병합된 역할 tip (원격 실측 = 보고값 일치)

| 역할 | tip | 병합 커밋 | 충돌 |
|---|---|---|---|
| 개발 리드 | `5b443d5` | `c738316` | 없음 |
| 게임플레이 | `a48dce5` | `480a99f` | 없음 |
| 그래픽스 | `cc09fb9` | `4ca4f03` | 4건 |
| 빌드·툴 | `2757a48` | `63a2549` | 없음 |

필수 커밋 ancestry 6건(`5b443d5`·`b8ade9e`·`c4026f1`·`a48dce5`·`cc09fb9`·`2757a48`) 확인.

### production composition 배선

| 항목 | 상태 |
|---|---|
| `SurfaceShipMotionPortFactory` | ✅ `gameplay.surfaceShipMotionPortFactory` (null 더미 제거) |
| `GuardSpawnLocationStrategy` | ✅ `gameplay.guardSpawnLocation` 1회 |
| production `DestroyerAIFactory` | ✅ `DestroyerAIController` 1개 · Guard 전용 AI 0 |
| 다중 선박 렌더 source | ✅ `gameplay.shipWorldSource` (단일 화물선 경로 대체 — 중복 렌더 없음) |
| `ShipIdentificationSource` | ✅ 연결 / `IdentificationExposureSink` **미주입**(사유 기록) |
| Guard spawn listener | ✅ 실제 `spawnPosition`만 마커에 전달 |
| 출항 경계 reset | ✅ 원장·함대·식별·salvage 전부 초기화 실측 |

### 자동 검증

typecheck ✅ · build ✅ · size ✅ 4.8% · scope ✅ ·
**gameplay 213/213 · meta 88/88 · tooling 26/26 · hud 34/34 ·
sprint-a 자동 전 항목 · sprint-b 자동 23/23(차단 0)**

### B1~B5 production 브라우저 실측 — 전 항목 통과

| ID | 핵심 실측 |
|---|---|
| B1 | hostile 1 + neutral 1 동시 배치 · 렌더 변형이 실제 faction과 일치 · 사건 전 patrol 0 |
| B2 | 조준 전 `unidentified`(세력 미노출) → 조준 후 `hostile`/`neutral`/`patrol` · 화면 태그 기호+문구+거리 |
| B3 | hostile 격침 **+120** / neutral 격침 **0**(지갑·출항 재화·드롭 전부 불변) / patrol pending |
| B4 | `neutralShipHit` 1건 · `attackCorrelationId="torpedo:1"` · `guardShipRequested` 1건(동일 id) · 중복 요청 `duplicateRequest` |
| B5 | 경비함 1척 `patrol` 생성 · 초기 표적 `PLAYER_ENTITY_ID` · 수면 y=12 유지 · **거리 30.0 → 5.8 m 접근** · 방향 마커 실제 위치 |

### A 회귀 — 전부 통과

- **조준 10/10**: `periscope`(y 8.12) / `cruise`(3.95) / `deep`(−3.02) 3구간
  진입 · 카메라 = `aimCameraSocket` 오차 0 · 자기 선체 layer 제외 ·
  조준 유지 중 ΔY 0 · 소켓 `forwardY` = `sin(aimPitch)` 일치 · 콘솔 오류 0
- **기지·경제**: BASE 시작 · EconomyHud · 업그레이드 7/장비 4 · 공식 가격 ·
  출항 버튼 1개 · 구매(저장 1회) · 장비 4동작 · 저장 실패 rollback ·
  출항 저장 실패 시 기지 유지 · 새로고침 복원 · 명시적 빈 loadout 유지
- **출항 경제**: salvage 3종 배치·중복 없음 · hostile cargo 120

**A 공식 인수 = 통과 (A1~A8).**

### 판정

```
B_CORE_COMPLETE  = true
B_FINAL_COMPLETE = false   (B6 실기동 미완 · B7 실측 pending)
C 기술 선행개발   = 가능
C 공식 발효       = 불가 (A 통합 PR 미병합)
B 공식 발효       = 불가 (발효 조건 = A 통합 PR 병합)
```

B6·B7 pending은 B1~B5 실패가 아니다 (15차 결의 1·3 병렬 최종 조건).

---

## 스프린트 A 스택 통합 (A_STACK_BASE) — 이전 회차

> 상세: `docs/SPRINT_A_INTEGRATION_MANIFEST.md` §A1~A12 ·
> `docs/SPRINT_A_ACCEPTANCE.md` 'A_STACK 회차'.
> 브랜치: `claude/deep-dive-d5-gray-box-integration-tree5i` (dev 미병합, PR 없음).
> **이 회차는 브라우저 최종 인수 검증을 하지 않았다.**

### 병합된 역할 tip (원격 실측 = 보고값 일치)

| 역할 | 브랜치 | tip | 병합 커밋 | 충돌 |
|---|---|---|---|---|
| 개발 리드 | `claude/deep-dive-core-lead-uyg77p` | `ffa945a` | `668c011` | 없음 |
| 게임플레이 | `claude/submarine-controls-depth-3wi424` | `4ea3542` | `4ae9575` | 없음 |
| 그래픽스 | `feat/render` | `86f5ee5` | `c321f25` | 2건 (문서·`EconomySystem` getter) |
| 빌드·툴 | `claude/deep-dive-tooling-phase-0-cj6c49` | `96af8bc` | `ec3b76e` | 없음 |

필수 커밋 ancestry 4건(`a3dd257`·`384dd00`·`2a89400`·`60ece41`) 전부 확인.
전부 `--no-ff` tip merge — cherry-pick·squash·rebase·force push 없음.

### 조립부 배선 3건 (게임플레이 미배선 보고분)

| # | 항목 | 상태 |
|---|---|---|
| 1 | 공식 params 주입 | ✅ 로더 각 1회 → `GameplaySystems` 생성자 1회 주입 |
| 2 | 저장 loadout 복원 | ✅ `fresh`=null(시작 어뢰) / `[]`=명시적 해제 보존 |
| 3 | salvage spawnId 보존 | ✅ 어댑터를 `spawnSalvageFromPlan(entry)`로 교체 |

### 자동 검증

typecheck ✅ · build ✅ · size ✅ 4.6% · scope ✅ ·
**gameplay 167/167 · meta 59/59 · tooling 26/26 · sprint-a 자동 전 항목 ·
HUD 34/34** · 브라우저 최종 인수 **미실시(범위 밖)**.

### 데이터·배선 확인

| 항목 | 결과 |
|---|---|
| 공식 경제 params 미확정(null) | **0** (업그레이드 7×5 가격·희귀·A/B군 누적, 장비 4종, slotCapacity 2, 손실률 0.5, 픽업 6m, 수입 245) |
| production provisional import (경제 6종) | **0** |
| salvage production spawn | `salvage-1/2/3` — 보상=`params/economy.json`, 좌표=`world/salvagePlacements` |
| production 성장 UI | `EconomyHud`·`SortiePrepScreen` 마운트, `BaseScreenPort` v2만 소비 |
| 자동 출항 / 출항 버튼 | 없음 / **1개** |
| 저장 이중 호출 | 없음 (계측) |
| `slotPositions` 보완 뷰 | 보존됨 (§A9) |
| deferred upgrade consumer | `hullIntegrity`·`maxDepth`·`sonarRange` — 구매 가능·효과 0 (§A10, 조치 결정 대기) |

### 판정

```
A_STACK_READY      = true
A_STACK_BASE_COMMIT = 85ec32b044b7b501f71740eb29a5cc708ffd05b7
B 선행개발          = 가능 (선행개발 상태로만)
```

**A_STACK_READY ≠** 스프린트 A 공식 인수 / A PR 병합 / B 공식 발효 /
브라우저 최종 검증 완료. 네 가지 전부 **미완료**다.

---

## 스프린트 A 이전 판정 (조준 rig 단일화 수정 후) — 히스토리

> 상세·근거: `docs/SPRINT_A_ACCEPTANCE.md` '최종 재판정' /
> 절차·미해소: `docs/SPRINT_A_INTEGRATION_MANIFEST.md`.
> 브랜치: `claude/deep-dive-d5-gray-box-integration-tree5i` (dev 미병합).

| 구분 | 결과 |
|---|---|
| 조준 카메라 결함 | ✅ **해소** — 런타임 rig 1개, `scene.attachTorpedoTubeSocket()` 1회, 조준 카메라 forwardY = 어뢰 directionY 실측 일치 |
| 자동 검증 | typecheck·build·size(4.3%)·scope ✅ / gameplay 128/128 · meta 35/35 · tooling 26/26 · HUD 34/34 ✅ / **verify:sprint-a 자동 23/24 (A8 실패)** |
| 브라우저 실측 | ✅ **21/21** (dev 수치 단언 + production 표시, 콘솔 0건) — 3심도 조준·Y 불변·pitch 일치·선체 레이어·그림자·수면 유지 |
| A1 / A2 / A3 / A7 | ✅ |
| A4 | ❌ 경제 UI가 composition root에 미배선 (QA 데모 전용) |
| A5 / A6 | ⚠ 부분 — T1~T6·저장 롤백 ✅ / UI 경로 미판정 (A4와 동일 원인) |
| A8 | ❌ 공식 경제 params 미확정 필드 114개 · provisional 4파일 |
| **B_READY** | ❌ **false** |

**B 차단 항목:** ① A8 공식 경제 수치표(기획) ② 경제·구매 UI 배선(이중 저장
정리 선행) ③ A 통합 PR 생성·dev 병합(발효 유일 방아쇠).

---

## PvE MVP 1차 통합 결과 (통합 담당, 통합 커밋 `ee2022a` 이후)

> 판정 근거: `docs/PVE_MVP_ACCEPTANCE.md` · 절차·충돌 기록:
> `docs/PVE_MVP_INTEGRATION_MANIFEST.md` · 계약 이름 확정: `docs/DECISIONS.md` I1~I8.

### 병합된 역할 브랜치

| 역할 | 브랜치 | tip | 병합 순서 | 자동 검증(통합 후) |
|---|---|---|---|---|
| 개발 리드 | `claude/deep-dive-core-lead-uyg77p` | `187536e` | 1 | meta 19/19 |
| 게임플레이 | `claude/submarine-controls-depth-3wi424` | `fa0dee6` | 2 | gameplay 100/100 |
| 그래픽스 | `feat/render` | `66d6cbd` | 3 | (게임플레이 기준 100/100로 회귀 확인) |
| 빌드·툴 | `claude/deep-dive-tooling-phase-0-cj6c49` | `5a3e5f9` | 4 | tooling 26/26 · HUD 33/33 |

### 조립 배선 완료 (composition root + `src/core/PveIntegration.ts`)

- **메타·경제**: 드롭 회수 → `lootDropped` → 메타 출항 재화 집계 →
  귀환·파괴 정산. 중도 귀환은 `returnToBaseRequested` 경로. 크레딧 손실은
  `destroyed`에만, 희귀 부품은 즉시 확정·보존
- **저장**: `saveRequested`(리드) → `defaultSaveStore`(툴링) 어댑터.
  부팅 시 지갑·업그레이드 복원(`MetaLoop.restoreWallet`). 주기 저장 없음.
  저장 코드는 메타 상태 머신을 조작하지 않는다
- **업그레이드**: 저장 단계 → 공식 `UpgradeModifiers` → 유효 파라미터 파생
  복사본 주입(`params` 원본 불변) + 장비 배율 주입. 계산식은 리드 단일 구현
- **렌더**: `attachTorpedoSource`(실제 어뢰), `setSubmarineVisualTiers`(계산된
  단계만), `metaStateChanged` → 기지 화면. 조준경은 `aimModeChanged` 구독
- **세션**: 재출항 시 `resetSortieSession` — 위치·잔탄·조준·화물선·드롭 초기화,
  확정 재화·업그레이드는 유지
- **오디오**: `WebAudioSystem`+`AudioCueRouter`를 GameSystem 어댑터로 등록

### 미완료 (완료로 표시하지 않는다)

| 항목 | 상태 |
|---|---|
| 보스 AI·포즈 연결 | **의도적 미구현** (지시). 분절 렌더는 `?bossSpike=1` QA 스파이크로 유지, 약점 판정(게임플레이)은 구현·검증됨 |
| 경비함 스폰 | `guardShipRequested` 발행 경로만 완성 — **소비자(구축함 AI) 없음**. 새 경비함 AI 클래스는 복제하지 않는다 |
| 중립 함선 배치 | 해역에 중립 세력 함선이 배치돼 있지 않아 경비 요청을 실제로 유발하지 못함 |
| 업그레이드 구매 UI·장비 장착 UI | 미구현 — 단계는 저장 데이터 주입으로만 반영 |
| 탐지·폭뢰·내구도 | 미착수 (버티컬 슬라이스 단계 2 잔여) |
| R7 임시값 4종 | `provisionalEconomy`(메타·경제)·`provisionalEquipment`·`provisionalCombat`·`provisionalCargo` — `params/economy.json` 이관 대기 |

---

## 역할별 작업표 — 다음 스프린트 (작업 관리자 갱신, 근거: docs/NEXT_SPRINT.md)

> S번호는 `docs/NEXT_SPRINT.md` §1의 작업 ID. 각 역할은 작업 착수·완료 시
> 아래 '브랜치·커밋·테스트 기록표'에 자기 행을 갱신한다.

| 역할 | 이번 스프린트 작업 | 선행 조건 | 상태 |
|---|---|---|---|
| 개발 리드 | ① INT-GAME-003(AimSystem 진입점)·INT-RENDER-002(속도 부호) 결정 — **전체 병목** ② 공통 규약 정리 ③ 통합 순서대로 feat→dev 병합·통합 플레이테스트 | 없음 | 대기 |
| 게임플레이 | 이동·충돌 보완(전후 부호 속도 확정 포함) → 어뢰(우클릭 홀드 조준·좌클릭 발사, `AimSystem.enter/fire` — S1, D+7 내 흡수) | 리드 계약 결정 | 대기 |
| 그래픽스 | 카메라 수정 / 프로펠러(회전=전후 속도 함수·공회전 하한 8% — S7·S8) / 해수면·화물선 렌더 | 게임플레이 이동·속도 노출 | 대기 |
| 빌드·툴 | HUD·화면 조준/발사 버튼(반투명·소형·H 숨김·존재감 자동 축소 — S2~S4, 0.5일) / Pointer Lock 진입(S3) / 버튼 사용률 계측(S5) | AimSystem 진입점(게임플레이 어뢰) | 대기 |
| 기획 | 튜닝표 신규 3행 확인(관리자 대행 반영분 — 프로펠러 공회전·정지 선회 배율·버튼 사용률), '정지 시 선회 배율' params 반영 여부 결정(S10) | 없음 | 대기 (확인 요) |
| 아트 | 공회전 속도 아트 판정(S8), 버튼 반투명·축소 사양(S4) | 그래픽스 프로펠러 구현 | 대기 |

## 역할별 브랜치·커밋·테스트 기록표

> 각 역할이 스프린트 작업을 커밋·푸시할 때마다 자기 행을 갱신한다.
> '최근 커밋'은 D+5 통합 시점 기준 초기값.

| 역할 | 담당 브랜치 | 최근 커밋 | dev 반영 | 테스트 결과 (마지막 실행 기준) |
|---|---|---|---|---|
| 개발 리드 | `claude/deep-dive-core-lead-uyg77p` (통합: `claude/deep-dive-d5-gray-box-integration-tree5i`) | `22f2d15` (통합 `291c613`) | ✅ PR #1로 dev 병합 | typecheck·build·check:size(0.53MB)·결정적 21/21·브라우저 19/19 |
| 게임플레이 | `claude/submarine-controls-depth-3wi424` (`feat/gameplay` 역할) | `f5b5c1c` | ✅ | 결정적 검증 21/21 (`node src/systems/__verification__/run.mjs`) |
| 그래픽스 | `feat/render` | `9fc32f6` | ✅ | X-ray 스파이크 성공 판정, `?xray=1` 브라우저 검증 |
| 빌드·툴 | `claude/deep-dive-tooling-phase-0-cj6c49` (`feat/tooling` 사본) | `5b33dec` | ✅ | HMR 적용·범위 밖 거부 브라우저 검증, Pages 배포는 관리자 설정 대기 |
| 기획 | (미생성 — params 커밋 브랜치 규칙 리드와 협의) | — | — | — |
| 작업 관리자 (문서) | `claude/deep-dive-bootstrap-6wrpuw` | (본 커밋) | dev 병합 대기 (문서만) | typecheck·build·check:size (문서 변경 후 재확인) |

## 작업 의존성과 권장 통합 순서 (dev 병합 순서)

```
[1] 리드: 공통 규약 (INT-GAME-003·INT-RENDER-002 결정) ← 병목, 최우선
 └→ [2] 게임플레이: 이동·충돌
      ├→ [3] 그래픽스: 카메라 수정        ┐ 상호 독립,
      ├→ [4] 그래픽스: 프로펠러·해수면·화물선 ┘ 병렬 가능
      └→ [5] 게임플레이: 어뢰 (AimSystem)
           └→ [6] 빌드·툴: HUD·화면 버튼·Pointer Lock·계측
                └→ [7] 리드: 통합 플레이테스트 (dev)
```

- 병합은 계약 커밋 → 계약 소비 커밋 순서 (BRANCHING.md). [6]은 [5]의
  진입점을 호출하는 껍데기이므로 반드시 [5] 이후.
- 상세 근거·결의 대조: `docs/NEXT_SPRINT.md`

---

## 개발 리드

- **완료:**
  - D1~D2 환경 구축 검수 — 저장소 구조, core 골격(루프·상태 머신·EventBus·SceneManager), 계약 3종(events/systems/params) 정의
  - D3 — 시스템 등록 구조 구현: `GameSystem` 수명주기(id·initialize·update·render?·dispose) + `SystemRegistry`(실행 순서 = 등록 순서, dispose 역순) + `Game.composeSystems()` 등록 지점·프레임 순서 배선 (INTEGRATION_NOTES INT-CORE-001, ARCHITECTURE.md '시스템 실행 순서' 참조)
  - **D+5 회색 박스 통합** — 툴링(`5b33dec`)·코어(`22f2d15`)·게임플레이(`f5b5c1c`)·그래픽스(`9fc32f6`) 4개 브랜치 병합, `composeSystems()`에 `gameplay` → `cameraInput` 순서 등록, `CanyonScene`을 ManagedScene으로 활성화 + `attachPoseSource` 주입, INT-GAME-001·INT-GAME-002·INT-RENDER-001·INT-TOOL-001 리드 결정 완료. 임시 이동 수치 params 이관(`provisionalMovement.ts` 삭제). typecheck·build·check:size(0.53MB/15MB)·결정적 검증 21/21·브라우저 자동화 검증 19/19 통과 (하단 'D+5 통합 검증 결과' 참조)
  - **D+5 리뷰 후속 — 공통 규약 확정 (INT-CORE-002)**: `src/core/conventions.ts` 신규 (로컬 -Z=선수·+Z=선미·+Y=위, `bowDirectionXZ`/`sternDirectionXZ`/`meshYawRadians`/`cameraRecenterYawRadians`/`propellerSpinRatio`), `AimSystem` 계약(마우스·HUD 버튼 공용 진입점 — 별도 전투 시스템 금지) + `aimModeChanged` 이벤트, 프로펠러 공회전 비율 파라미터(`propellerIdleSpinRatio` 0.08, 0~1 검증). ARCHITECTURE.md '공통 공간·방향 규약'·'조준 입력 단일화' 章, INTERFACES.md §1·§2·§3 갱신
  - **D6 통합 전 상태 계약 확정 (INT-CORE-003)**: `SubmarinePoseSource`(positionX/Y/Z·heading·부호 있는 forwardSpeed — 렌더의 위치 차분 재계산 금지), `CargoShipStateSource`(id·pose·velocity·hit·sinkProgress·removed — 침몰 시간축 게임플레이 소유), `torpedoHit { targetId, x, z }` 이벤트, `contracts/layout.ts`(CanyonLayout — 렌더·충돌 공용 단일 소스, 인터페이스만), 파라미터 단일 소스 확정(renderVisualParams의 idleSpinRatio·fullSpinAtSpeedMps 중복 제거 지시), Game 조립 연결 지도(ARCHITECTURE 'Game 조립 계약') 문서화
  - **통합 차단 2건 해소 (INT-CORE-004)**: ① `src/world/startingCanyonLayout.ts` — CanyonLayout 단일 데이터 인스턴스(`STARTING_CANYON_LAYOUT`), 벽 높이는 그래픽 하향값(11/12±2·sin, 상단≤7<해수면 12) 최종 확정 — 구 충돌 미러(15/16±3·sin)의 '보이지 않는 약 4m 벽' 소멸 ② 카메라 리센터 이의 해소 — `cameraRecenterYawRadians` 폐기, `cameraRecenterOffsetDirectionXZ`(위치=선미 방향)·`cameraRecenterLookDirectionXZ`(시선=선수 방향) 분리 (하나의 yaw 재사용 금지, 검증 기준: 프로펠러가 카메라 쪽·W 전진 시 화면 안쪽)
  - **PvE 전환 착수 (트랙 전환 — 회의록 10·11 반영):**
    - **선행 계약 (INT-CORE-006, 커밋 `dcc6f7d`)** — `contracts/meta.ts`(Faction·재화 이원화·MetaState·SortieOutcome/Report/Settlement·SortieSessionPort·UpgradeStatId 7항목 상한·EquipmentId 4종 상한·BossPhase) + 이벤트 9종(metaStateChanged·sortieStarted/Ended·returnToBaseRequested·lootDropped·guardShipRequested·saveRequested·bossPhaseChanged·bossWeakPointChanged) + CargoShipStateSource.faction(선택→추후 필수)
    - **[LOOP] 상위 메타 루프·업그레이드 배율 레이어 (INT-CORE-007)** — `src/meta/` 신규: MetaLoop(BASE→SORTIE_PREP→SORTIE→DEBRIEF, 하위 무수정 포장·통신 3종 제한), settlement(파괴 시 크레딧 손실·희귀 즉시 확정), upgradeMath(합연산 순수 함수 — params 불변, 툴 공용), provisionalEconomy(⚠ R7 손실률 50% 임시 — economy.json 이관 대기), 결정적 검증 19항목. Game 조립: metaLoop 최선두 등록, 세션 시작(BOOT→DEPARTURE)을 SortieSessionPort 어댑터로 이동 — 기지 화면 도입 전 임시 자동 출항
    - **DECISIONS.md 개정** — PvE 결정 P1~P16 표 신설(1차 결의 1·4 개정·신 스코프 가드), 폐기 표 정리(영구 성장 금지 → P2 대체). FILE_OWNERSHIP: src/meta(리드, save/는 툴링)·systems/economy(게임플레이)·params 확장(기획)
  - **스프린트 A 리드 창 (창 1 — 계약 생산자, 회의 12~14 반영):**
    - **선행 계약 (INT-CORE-008, 커밋 `2542c7b`)** — TorpedoTubeSocketSource(앵커·2소켓, 십자선=탄도, 오프셋 단일 지점)·FineAimSource·AimingParams 4종(양수 크기, aimReturnBehavior 없음)·구매 불가 5종·TransactionResult·판정/지갑/단계/저장 포트·EquipmentChangeRequest·BaseScreenPort·saveRequested sortieLaunch. **AimSystem 계약에서 '전 심도 조준(구 심도 전용 규칙 폐기)' 폐기 규칙 삭제**(전 심도·심도 불변·해제 reset). conventions에 공용 클램프·aimForwardDirection
    - **구현 (INT-CORE-009)** — world/torpedoTubeAnchor(안전 오프셋 0.55 단일 정의)·core/TorpedoTubeSocketRig·meta/PurchaseTransaction·EquipmentTransaction(스냅샷→재검증→차감→적용→저장→commit/rollback, 예외 무전파)·MetaLoop WalletTransactionPort+출항 직전 저장·UpgradeState UpgradeLevelsPort. Game 조립: tubeSockets rig 배선. 결정적 검증 **35/35**(트랜잭션·소켓·클램프 16항목 신규)
  - **스프린트 A 마감 — production 기지 경제 조립 (INT-CORE-010):**
    - **선행 계약 (커밋 `9472d66`)** — `BaseScreenPort` v2(읽기 모델 9종: wallet·sortieCreditsEarned·sortieRarePartsSecured·upgradeCatalog·upgradeLevels·equipmentCatalog·loadout·canLaunchSortie·lastResult / 명령 5종: purchaseUpgrade·equipItem·replaceItem·unequipItem·confirmDeparture), `BaseCommandOutcome`(success + 불가 6종 + saveFailedRolledBack), `DepartureResult`(departed·saveFailed·invalidState·economyDataUnavailable), `noFreeSlot`→**`slotFull`** 통일(게임플레이 purchaseTypes 정합), **`economyDataUnavailable`** 신설(null 가격 = 트랜잭션 진입 전 차단·상태/저장 변경 0·null→0 변환 금지·임시 가격 사용 금지), `EquipmentChangeJudgePort` 개정(판정+적용 통합 — 판정 로직 복제 금지), `saveRequested` cause를 settlement·rarePart 2종으로 축소(**sortieLaunch 폐기**), INTERFACES §2d **저장 책임 표**(사용자 명령 1회 = SavePort 1회)
    - **구현 (커밋 `2ae4d24`)** — PveIntegration: `CountingSavePort`(명령당 저장 호출 계측)·`EquipmentJudgeAdapter`(EquipmentSystem 위임 — 판정 복제 없음)·`DepartureCommand`(출항 = 전환 **전** 저장, 실패 시 BASE 유지·재시도 가능)·`createBaseScreenPort`(공식 카탈로그 null 사전 차단)·`createMetaUiPorts`(그래픽스 metaEconomyPorts 구조 어댑터 — DOM 무수정). Game 조립: 단계 단일 저장소 = `UpgradePurchaseSystem.levelSnapshot`(UpgradeState는 파생 뷰), EquipmentSystem 내부 저장 경로 차단(`attachBaseEconomy(purchase, null)`)·MetaLoop sortieLaunch 저장 제거 — **이중 저장 3경로 소멸**, EconomyHud·SortiePrepScreen production 마운트(실지갑·실카탈로그), HUD 출항 버튼 → DepartureCommand. QA 데모(`?econdemo`)는 CanyonScene 전용 유지 + 러너 정적 검사로 production composition 미포함 보증. 결정적 검증 **46/46**(production 조립 저장 횟수 1/0·롤백·출항 실패 무전환·실지갑 동일성·null 차단 10항목 신규)
  - **공식 경제 연결 (INT-CORE-011 — 툴링 승인 params `2a89400`·loader `60ece41` 소비):**
    - **선행 계약** — `contracts/officialParams.ts` 신규: `OfficialRuntimeParams`(공식 로더 composition root 각 1회 호출 번들 — upgrades·equipment·economy·cargo·aiming, 시스템·UI의 JSON/로더 직접 호출 금지), `SalvagePlacementSource`(보상=economy params 소유 / 좌표=월드·그래픽스 소유, spawnId 결합), production spawn 규칙(출항당 1회·파괴분 재생성 금지·미도착 = unwired·임시 좌표 금지)
    - **구현** — Game.ts: `meta/provisionalEconomy` production import **제거·파일 삭제**(손실률 0.5는 economy.json 정본), `loadEconomyParams`+`loadAimingParams` 각 1회 → MetaLoop(손실률)·UpgradePurchaseSystem/UpgradeState/BaseScreenPort/UI 포트(공식 카탈로그 2종) 주입, 구 `upgradeCalculator` 로더 production 미사용(시뮬레이터 전용 존치). PveIntegration: `composeSalvageSpawnPlan`(누락·중복·미지 spawnId/dropTableId/kind 거부 — 거부 시 부분 생성 없음)·`SortieSalvageSpawner`(출항당 1회 가드, `sessionPort.start()`에서 `beginSortie`). 결정적 검증 **58/58**(결합 5·스포너 4·실파일 60/40/25+희귀 1·Game/UI 정적 검사 3 신규)
  - **스프린트 C 착수 — 생존 루프 공용 코어 (INT-CORE-014):**
    - **착수 게이트 통과** — A 공식 인수 통과 · `B_CORE_COMPLETE=true` · `origin/dev`(`d832579`)가 A+B 통합 `3958ce4` 포함 · dev 병합 후 자동 검증 전 항목 통과 → **C_OFFICIAL_START=true**. 공식 범위는 **C1~C9 전 항목 핵심 게이트**(12차 결의 3·15차 결의 2)이며 작업용 분류를 쓰지 않는다
    - **선행 계약 (커밋 `d048c40`)** — `contracts/survival.ts`: PlayerHullState(+unwired)·DamageEvent/Request·DamageSourceType(기존 DamageCause는 폭뢰 근접도로 병존)·DamageReceiverPort(결과 7종)·FloodingParams/Snapshot·DepthPressureParams/Port·HullUpgradeConsumer·EnemyAttackPort·SurvivalReadModel·SortieFailureReport/Port·PlayerAliveSource·SortieResettable. events: `playerDestroyed`·`sortieFailed`(실패 화면 — 귀환 `sortieEnded`와 분리, C7)
    - **구현 (`c3367a4`·`b52d437`·`2e7c788`·`59b4bfe`)** — `core/PlayerHullSystem`(피해 수신 단일 창구·중복 원장·전이·파괴 1회·읽기 모델·출항 초기화), `core/FloodingCore`(dt 비례 결정적 누적·단계 파생), `core/SortieFailureCoordinator`(파괴 1회 → MetaLoop 정산 1회 → 기존 저장 경로 → BASE, 저장 실패 시 DEBRIEF 유지·재정산 없는 재시도). Game 조립: FloodingCore → PlayerHullSystem(② 판정) → SaveBridge → SortieFailureCoordinator, 출항 시작 시 생존 상태 초기화. 결정적 검증 **103/103**(C 16항목 신규 + 정적 2 개정)
    - **수치 0**: 선체 기준값·피해량·침수 속도·압력은 **공식 params에 없음**(upgrades.json hullIntegrity·maxDepth는 배율만 승인·paramRef 없음) → 전 시스템 `unwired`, 임시 수치 생성 없음. 연결은 `attachHullParams`·`attachParams` 두 줄
    - **C 통합 blocker 마감 (INT-CORE-016 — C_INTEGRATION_HANDOFF_READY=true):**
    - **AI 공격 요청**: `DestroyerAIController`가 attack 상태에서만 `EnemyAttackRequest` 생성(요청만 — 피해·반경·쿨다운·신관 비소유, id 단조·결정적). destroyed·위치 미확인·lost·포트 미연결 = 요청 0건. `EnemyAttackPortBinding` 미연결 = unwired(투하·피해 0) — 병합 시 `attach(gameplay.enemyAttackPort)` 1줄
    - **DEBRIEF confirm 정책 개정**: 저장 성공이 BASE 전환을 자동으로 일으키지 않음 — `canConfirm` → `DebriefConfirmCommand.confirm()`만이 BASE 진입점(정상 귀환·실패 동일, 저장 미완료·중복 confirm 거부). DECISIONS C-9
    - **통합 patch 확정**: SPRINT_C_HANDOFF §통합 composition patch — 게임플레이 4+1줄·그래픽스 2줄+confirm 교체·Game.ts 충돌 표·B5 검토 5항목·consumeDamageFlash 허용 판정. `GuardShipAdapter`가 `TrackingStateSource` 구현(추적 표시 소스 정본). 결정적 검증 **119/119**
  - **C 런타임 마감 준비 (INT-CORE-017 — 브랜치 `claude/sprint-c-runtime-closeout`, 기준 `bd87828`. C_RUNTIME_CLOSEOUT_STRUCTURE_READY=true):**
    - **combat params 전달 계약 정상화** (통합 blocker §5 해소): 정규화 소유자 = 공인 로더(`tools/combatParams.validateCombatParams`) **한 곳**. 게임플레이 구 평면 리더 2종 제거(중첩 스키마와 불일치하던 이중 정규화), `attachCombatParams(params: NormalizedCombatParams)` 타입화, 조립부가 `loadCombatParams()` 결과의 게임플레이 단면(`detectionTuning`·`depthCharge`)을 슬라이스 전달. raw combat.json import 0건(정적 검사 — 허용 2곳: combatParamsLoader·A 시절 ParamLoader), null 블록은 null 그대로(unwired 유지·부분 wired 금지). DECISIONS C-10
    - **실패 화면 confirm 경유** (통합 blocker §11-3 해소): `SortieFailureScreen.attach` 3-인자화 — '확인 (기지로)' = `debriefConfirm.confirm()` guarded command, 성공 시에만 화면 닫힘(DOM 숨김 전용 경로 제거), 버튼 노출 근거는 `canConfirm` 하나. 정상 귀환·실패 동일 정책 완결. DECISIONS C-11
    - **검증**: `verify:meta` +5(정규화 필드 교환 0·null 보존·NaN/음수 거부 + 정적 검사 2) → **124/124**, `verify:gameplay` 실경로 주입으로 교체 → **238/238**
    - **상태 구분 (DECISIONS C-12)**: 구조 배선 완료(wired 경로 존재) ✅ / C9 수치 확정 ❌(15필드 전량 null — 결정표는 **PROPOSED**로 보고서 제출, 기획 승인 대기, production·params 숫자 미입력) / 브라우저 실측 ❌ / C 최종 완료 ❌ → **아래 INT-CORE-018로 갱신됨**
  - **C9 v0.1 승인값 입력·production 실측 (INT-CORE-018 — 커밋 `c943d35`·`885839f`):**
    - **승인값 입력 (DECISIONS C-13)**: 15필드 전량 확정 — hull 120/0.7/0.3 · depthCharge 4m/18m/45/12/6s · flooding 0.15/0.45/0.8/2.4/0.02 · detection {60,240}/0.125. 공인 로더 pending 0건·관계 검사 통과. 지정 필드 외 무변경·pressure 미추가·fallback 0
    - **탐지 기준 배선 2줄 (DECISIONS C-14)**: `torpedoFired`→`reportTorpedoLaunch`(§5.10 확정 규칙 배선) + 출항 시 `reportNoise(1)`(공식 만충 시간 정의의 기준 조건 — 수치 발명 아님)
    - **브라우저 실측 완주** (production, fixture 아님 — 상세: INTEGRATION_NOTES INT-CORE-018): 탐지 상승 9.65s(공칭 8s)·감쇠 8.000s·신관 정확 3.000s×10·공격 간격 6.05s(단일)·direct 45/near 12/miss 0 재현·파괴(near 30.5s/direct 9.1s)·파괴 후 공격 중단·실패 정산 1회·saved·실패 화면 confirm→BASE·재출항 reset. **콘솔 오류 0**
    - **실측 발견 blocker**: ① 침수 미발생 — 피격→침수 기여 공식 param 부재(production `causesFlooding=true` 발신자 0) → 침수 루프 도달 불가, 기획 결정 필요 ② 잠망경 심도 direct 불가(기폭 y=0 규약) ③ 밀려남 상향 성분이 폭격 중 잠항 상쇄
    - **플래그**: C_COMBAT_PARAMS_DEFINED=**true** · C_RUNTIME_WIRED=**true** · C_BROWSER_EMPIRICAL_COMPLETE=**true**(침수 스테이지 제외 명시) · C_FINAL_COMPLETE=**false**(침수 유발 경로 부재 blocker) → **아래 INT-CORE-019로 갱신됨**
  - **C 최종 런타임 blocker 3건 마감 (INT-CORE-019 — 커밋 `c2ee51d`·`45257d8`·`74e13c3`. C_FINAL_COMPLETE=true):**
    - **침수 기여 (C9 v0.1.1, DECISIONS C-15)**: direct 0.35·near 0.10 승인 입력(17필드) — outcome별 피해·침수 동시 결정, 단일 창구·중복 1회·clamp 1.0·tick 경로 유지
    - **소음 정책 (C-16)**: 속도 비례(정지 0·전속 1·침묵 0.1 배율) — 고정 reportNoise(1) 폐기, 조립부 수치 하드코딩 0. 대화형 침묵 조작 미구현 = 소스 미연결 false 중립(**C_SILENT_RUNNING_INTERACTIVE=false**)
    - **목표 심도 기폭 (C-17)**: 관측 3D 고정·낙하 보간·목표 심도 기폭 — y=0 고정 폐기, 세 심도 모두 direct/near/miss 성립(실측: periscope 11·cruise −1.2·deep −3.28)
    - **production 재실측 완주**: 소음·탐지 속도 비례, direct 45+0.35 / near 12+0.10 / miss 0, 침수 단계 실전이(minor 0.151→major→catastrophic)·지속 피해(2.4×level)·침수 잠식 파괴, 파괴 후 공격 0, 정산·confirm·BASE·재출항 reset, 콘솔 오류 0 — 상세: INTEGRATION_NOTES INT-CORE-019
    - **최종 플래그**: C_COMBAT_PARAMS_DEFINED=**true** · C_RUNTIME_WIRED=**true** · C_BROWSER_EMPIRICAL_COMPLETE=**true** · **C_FINAL_COMPLETE=true** · C_SILENT_RUNNING_INTERACTIVE=false(후속)
  - **C 선행 계약 마감 (INT-CORE-015 — C_ROLE_HANDOFF_READY=true):**
    - C1~C3: `contracts/detection.ts` — 게이지 정본=게임플레이 DetectionSystem(기존 계약), 은신·심도 입력 포트, 거리 감쇠·감소율 null 계약(unwired), HUD·AI 읽기 모델 2종(AI는 stage만), 추적 전이 정본=리드(기존 상태 어휘·경비함/호위함/적대함 공유), alert 발화=기존 detectionChanged, 출항 reset 경계
    - C4: 폭뢰 정본 경로(탐지→AI 요청→EnemyAttackPort→DepthChargeSystem→direct/near→applyDamage) + `DepthChargeDamageParams`(전부 null 허용)
    - 침수 지속 피해도 **단일 창구 경유**(tick별 flood:<n> id·닫힌 적분 — dt 분할 무관 총 피해 동일), 파괴 경로 통합
    - `DebriefReadModel`+`DebriefStateTracker` — 그래픽스가 isDestroyed 추측 없이 귀환/실패 화면 분기(C6·C7), 저장 재시도 상태 노출
    - 정책 확정(DECISIONS C-6~C-8): 선체·침수=출항 단위·구매 순간 회복 없음·영구 손상 후속 이관·**압력 피해 C 핵심 범위 제외**(계약만 유지·production unwired·게이트 불포함)
    - 이중 정산 방지 정적 검사 + 결정적 검증 **110/110**. 역할별 인계 정본: `docs/SPRINT_C_HANDOFF.md`
  - **업그레이드 소비 현황**: hullIntegrity = **경계 연결 완료**(기준값 대기) / maxDepth = 계약·경계만(압력 피해가 C1~C9 밖·기준값 없음 → pending) / sonarRange = **deferred 유지**(탐지 시스템 미도입) / torpedoDamage·maxSpeed·turnRate·reloadSpeed = 기존 연결 유지
  - **스프린트 B 선행개발 (INT-CORE-012 — B 공식 발효 전, dev/main·통합 병합 금지):**
    - **선행 계약 (커밋 `afd5c71`)** — `contracts/faction.ts`(FACTION_RULES 규칙표·`patrol` 정본 유지·guard 별칭 미추가·`CombatTargetClass` 승격·`rewardDropTableIdFor`), `contracts/identification.ts`(B2 식별 read model — 미식별 시 라벨 null / B7 로깅 8항목·결과 분류 5종), `contracts/guard.ts`(중립 유효 피격·경비 요청 payload·GuardSpawnPort 결과 5종·GuardShipAdapterConfig·DestroyerAIFactory·B6 호위 계약·PLAYER_ENTITY_ID), `events.ts`(neutralShipHit 신설·guardShipRequested **payload v2**·transportAttacked)
    - **구현 (커밋 `d1577d5`·`b43c906`)** — `core/GuardShipAdapter`(기존 DestroyerAI 계약에 주입+수명주기 전달만, **신규 경비 AI 코어 0**), PveIntegration `GuardIncidentLedger`(중복 방지 **단일 저장소** — 상관 id·요청 id 공용, 출항 경계 리셋)·`NeutralIncidentBoundary`·`GuardSpawnCoordinator`(GuardSpawnPort)·`GuardSpawnBridge`. Game 조립: 경제 브리지 → 사건 경계 → 스폰 브리지 → 어댑터(③ AI 그룹) 등록. 결정적 검증 **77/77**(B 18항목 신규 — 중복 방지·세력 판정·스폰 결과 5종·어댑터 위임·B6 분리·B2 모델·B7 로깅 + 정적 검사 2: 신규 경비 AI 파일 0개·C 범위 구현 파일 미생성)
    - **B5 규칙 개정 (INT-CORE-013 — 15차 diff-only 변경)**: 조사 결과 production `DestroyerAI` 구현체가 **0개**여서 '기존 구현체 재사용/신규 AI 0'은 성립 불가한 전제였다(게임플레이·툴링 두 창이 독립 보고). 개정 후: **범용 production 구현 정확히 1개** `core/DestroyerAIController`(경비함·일반 적대 구축함 공용) + `core/destroyerAiFactory`(production factory) + 어댑터가 그것을 재사용. 경비 전용 GuardAI·GuardBehavior·GuardStateMachine은 계속 금지, C 기능(탐지·폭뢰·내구도·침수·발사) 미포함. 이동은 게임플레이 `SurfaceShipMotionPort`(리드는 선박 transform 미조작). `GuardShipHandle`에 `entityId`·`spawnPosition` 추가(그래픽스 INT-RENDER-011 요청 승인). 결정적 검증 **88/88**(B5 개정 11항목 — 구현체 1개·전용 AI 0개·위장/더블 금지·C 참조 0건 정적 + 이동·경계·표적 무효·체인 동작)
    - **남은 미연결 1개**: 게임플레이 motion adapter(`SurfaceShipMotionPortFactory`) — `Game.composeSystems`의 1줄 교체로 연결되며, 그 전까지 스폰은 `spawnFailed`(가짜 이동 생성 금지). B1(적대·중립 동시 배치)은 게임플레이 브랜치에 이미 구현됐고 병합 대기다
  - **업그레이드 7항목 production 소비 현황 조사 (INT-CORE-011):** maxSpeed·turnRate·reloadSpeed = `deriveEffectiveParams` 연결됨 / **torpedoDamage** = `equipment.setUpgradeModifiers` 경유 어뢰 피해 연결됨 / **hullIntegrity·maxDepth** = 소비 시스템 자체가 아직 없음(내구도·침수는 B/C 범위, 심도 한계 파라미터화 미도입) — 현재는 외형 단계(visualTiers 선체 합산)에만 기여 / **sonarRange** = 소비 시스템 없음(탐지는 범위 밖) — 기준값 발명 없이 구매·저장·외형만 유효
- **진행 중:** 없음
- **다음 작업:** ① 툴링 C9 [COMBAT] params(선체 기준값·피해·침수·압력) 도착 시 `attachHullParams`·`attachParams` 배선 ② 게임플레이 피해 source(폭뢰·충돌)·탐지 게이지 병합 후 C1~C9 통합 판정 ③ 결정 요청 3건(구매 직후 현재 선체 처리·선체 영구 손상 여부·압력 피해 도입) 회의 상정
- **차단 문제:** 없음 (대기: C9 [COMBAT] 전투 params — 선체 기준값이 없어 피해 루프가 unwired. 적의 공격 수단도 아직 없음 — 폭뢰 판정은 게임플레이 C4)
- **변경된 계약:** INT-CORE-011(OfficialRuntimeParams·SalvagePlacementSource·production spawn 규칙). 이전: INT-CORE-010, INT-CORE-008·009, INT-CORE-006·007, INT-CORE-004·003·002, INT-GAME-001
- **통합 주의사항:**
  - 각 파트는 자기 소유 영역에서 `GameSystem`(`src/core/GameSystem.ts`) 구현체를 export하고, 이 문서 자기 구역에 등록 요청을 남긴다. `src/core` 배선은 feat→dev 병합 시 리드가 수행
  - 파트 간 통신은 EventBus만 — 구현체 간 직접 참조(포즈 주입 등)는 composeSystems(composition root)에서만 잇는다
  - 3D 장면(회색 박스 블록아웃)은 시스템이 아니라 `ManagedScene`으로 SceneManager에 등록
  - 상태 전환(GameStateMachine)과 장면 전환(SceneManager)은 분리 — 자동 매핑 없음
  - **축·방향은 `src/core/conventions.ts`만 참조** — 숫자·벡터 복제 금지. 프로펠러 회전은 `propellerSpinRatio`(속도만 입력) 경유, 렌더가 speed를 쓰려면 `SubmarinePoseSource` Pick에 `speed` 추가해 소비 (판정 계산 금지)
  - 조준·발사 입력(마우스·HUD 버튼)은 반드시 동일 `AimSystem` 인스턴스를 호출 — 어댑터 주입은 composeSystems에서만, 카메라 고정·UI는 `aimModeChanged` 구독. HUD의 CombatIntentSink는 AimSystem 위임 어댑터로만 구현
  - **[INT-CORE-003 적용 요청 — 게임플레이]** poseSource 타입을 `SubmarinePoseSource` 계약으로 노출(positionY·forwardSpeed 포함), CargoShipSystem 상태를 `CargoShipStateSource`로 노출 + TargetRegistry 등록, 명중 판정 1곳에서 `torpedoHit` 발행·hit/sinkProgress/removed 갱신
  - **[INT-CORE-004 적용 요청 — 게임플레이]** `collision/startingArea.ts`의 자체 수식 미러 삭제 → 주입받은 `CanyonLayout.blocks` 순회로 충돌체 생성(회전 블록의 AABB 외접 근사 규칙은 소비측 유지). 스폰은 layout.submarineSpawn 사용
  - **[INT-CORE-003 적용 요청 — 그래픽스]** CanyonScene 로컬 `SubmarinePoseSource` Pick·`CargoShipStateSource`를 계약 import로 교체, Propeller 속도 입력을 poseSource.forwardSpeed로 교체(위치 차분 재계산 삭제), renderVisualParams.json의 `idleSpinRatio`·`fullSpinAtSpeedMps` 삭제(조립 주입으로 대체), 잠수함 Y는 poseSource.positionY 사용
  - **[INT-CORE-004 적용 요청 — 그래픽스]** `buildCanyonBlockout` 자체 수식 삭제 → 주입받은 `CanyonLayout.blocks`로 메시 생성 (수치는 현행 그래픽과 1:1 — 시각 변화 없음). CameraRig의 `cameraRecenterYawRadians(h) + π` 우회를 `cameraRecenterOffsetDirectionXZ` 기준 배치로 교체 (결과 동일: 선미 뒤 상단 → 선수 방향)
  - **[INT-CORE-003 적용 요청 — 빌드·툴]** 오디오 배관은 `torpedoHit`(과장 폭발음)·`aimModeChanged` 구독 항목을 사운드 세트(D+10) 배선 목록에 추가
  - **[PvE 적용 요청 — 전 파트]** INT-CORE-007 하단 '각 파트 적용 요청' 참조: 게임플레이(economy·Faction·세션 리셋 API·약점 판정), 툴링(src/meta/save·시뮬레이터는 upgradeMath 동일 함수·가드 빌드 경고·중도 귀환 버튼), 그래픽스(기지 화면 metaStateChanged 구독·보스 연출 이벤트 소비·분절 애니 스파이크), 기획(economy.json·upgrades.json — PvE D+3 병목)
  - **[INT-CORE-010 적용 요청 — 게임플레이]** purchaseTypes는 이미 slotFull·maxLevelReached 사용 — 변경 불필요. EquipmentSystem 내부 저장 경로는 production 조립에서 비활성(`attachBaseEconomy(purchase, null)`) — 장비 저장은 리드 EquipmentTransaction 단일 책임
  - **[INT-CORE-010 적용 요청 — 그래픽스]** 기지 UI는 `BaseScreenPort` v2만 소비(직접 시스템 참조 금지). `metaEconomyPorts`에 결과 코드 2종 추가됨(economyDataUnavailable='가격 데이터 대기'·invalidState) — 타입 합집합·문구만 추가, DOM·스타일 무변경이므로 그대로 수용
  - **[INT-CORE-010 적용 요청 — 빌드·툴]** SAVE_SYSTEM.md 저장 시점 5종·책임 표 정합 확인, A5-T1~T6 계측은 `CountingSavePort` 재사용 가능. saveRequested cause에서 sortieLaunch 소비 코드가 있으면 삭제
  - **[INT-CORE-011 적용 요청 — 게임플레이]** `EconomySystem`의 `PROVISIONAL_DROP_TABLES`·`PROVISIONAL_PICKUP_RADIUS_METERS`·`PROVISIONAL_DEFEAT_CREDIT_LOSS_RATIO` 직접 import를 주입 경로로 교체(조립부가 `official.economy` 전달) 후 `systems/economy/provisionalEconomy.ts` 삭제. `spawnSalvage` 시그니처는 그대로(조립부가 결합 plan으로 호출 중). 조준·화물선의 `provisionalAiming`·`provisionalCargo`도 공식 aiming·cargo 주입으로 교체
  - **[INT-CORE-011 적용 요청 — 그래픽스]** `SalvagePlacementSource` 구현체 1개 제공(spawnId `salvage-1/2/3` 각 1좌표 — 협곡 내 도달 가능 위치, 시각은 `kind`로 분기). credits·rareParts 값 정의 금지. 연결점: 조립부 `SortieSalvageSpawner.attachPlacementSource`(리드가 1줄 배선)
  - **[INT-CORE-011 적용 요청 — 빌드·툴]** economyParams 번들이 production 유일 공급원 — `upgradeCalculator` 로더는 시뮬레이터 전용 유지. verify:meta 정적 검사(로더 1회·UI 직접 호출 금지)가 회귀를 차단한다
  - **[INT-CORE-012 적용 요청 — 게임플레이]** ① **중립 선박 배치**(현재 화물선 1척 hostile 고정 — B1 미성립) ② 유효 피해 적용 지점에서 `neutralShipHit` 발행(어뢰 1발 = attackCorrelationId 1개, 첫 유효 피격만 true). 기존 `consumeGuardSpawnRequests` 큐는 이행 후 제거(그때까지 병존 — 중복은 조립부 원장이 흡수) ③ `ShipIdentificationSource` 구현(거리·식별 성립 조건은 판정측) ④ `GuardSpawnLocationStrategy` 구현 — 없으면 스폰은 noSpawnLocation ⑤ 중립 격침 드롭 0 유지
  - **[INT-CORE-012 적용 요청 — 그래픽스]** 조준경 태그는 `ShipIdentificationView`만 소비 — 엔티티 이름·모델 종류로 세력 추측 금지, 미식별이면 라벨 없음(세력 비노출). 색·실루엣·항해등은 그래픽스 소유(계약에 문구·색 없음). 경비함 등장 방향 연출은 `guardShipRequested.incidentPosition` 구독
  - **[INT-CORE-012 적용 요청 — 빌드·툴]** economy.json 세력별 드롭 테이블·고가치 배율 확장(**patrol 보상은 수치표 도착 전까지 null 유지**), B7 `IdentificationLogSink` 구현·집계·판정(오인율 계산식·최소 표본), B1~B5 자동 검증 스크립트 신설 — 리드는 없는 script를 실행하지 않는다
  - **[INT-CORE-014 적용 요청 — 게임플레이]** 피해 source(폭뢰·충돌·압력)는 전부 `DamageReceiverPort.applyDamage`로만 보낸다 — 자체 체력 상태 금지. `PatrolShipFleet.isTargetAlive(PLAYER_ENTITY_ID)`가 현재 항상 true인데 리드 `PlayerAliveSource`를 구독해 파괴 후 추적을 멈출 것. **`EconomySystem.settleDefeat`/`settleReturn`·`RunEconomy.settleSortie`는 production 호출자 0건의 병행 정산 경로 — 삭제 요청**(정본은 MetaLoop, C에서 별도 지갑 금지)
  - **[INT-CORE-014 적용 요청 — 그래픽스]** `SurvivalReadModel`만 소비(내부 객체 비노출·값 변경 불가). **실패 화면=`sortieFailed` / 귀환 화면=`sortieEnded`** 로 데이터·화면 완전 분리(C7). 침수량·피해량을 결정하지 않으며 경고는 `warningIds` 키로만 온다
  - **[INT-CORE-014 적용 요청 — 빌드·툴]** `params/combat.json` C9 [COMBAT] 확장: 선체 기준값·survivalState 경계 2종·폭뢰 direct/near 피해·침수 3단계 경계/확산율/피해율·(도입 시)압력 4종. **전부 미확정이며 임의 수치 금지.** `verify:sprint-c` 신설은 툴링 몫 — 리드는 없는 script를 실행하지 않았다
  - **계층 경계 [확정]:** 상위(src/meta)가 하위 세션 내부 상태를 읽는 코드, 하위가 메타 상태를 참조하는 코드는 리뷰 반려 대상 — 통신은 SortieSessionPort + 이벤트 3종뿐
- **마지막 업데이트:** C 최종 런타임 blocker 3건 마감 (INT-CORE-019 — 침수 기여 v0.1.1·속도 소음 정책·목표 심도 기폭 + production 재실측 완주. **C_FINAL_COMPLETE=true** · C_SILENT_RUNNING_INTERACTIVE=false 후속)
- **담당 브랜치:** `claude/sprint-c-runtime-closeout` (통합 tip `bd87828` 정확 기준 — 이전 리드 세션: `claude/deep-dive-core-lead-uyg77p`)

## 게임플레이

- **완료:**
  - D3~D5 조작·심도 (D+5 통합 반영) — WASD·관성·심도·`KeyboardInput`·`GameplaySystems`(GameSystem 수명주기)
  - **D+5 리뷰 스프린트 '이동·충돌' (통합 순서 [2])** — ① W 전진 / **S 후진**(상한 = 전진의 50%, `speed`는 부호 있는 전후 속도 — 프로펠러 S7 소비용) ② **Shift/Ctrl 연속 상승·하강**(수직 최고 속력 = 전진의 50%, 키 해제 시 관성 감속) ③ 수면 상한(+12.5)·해저 하한(-5) 이탈 방지 ④ 높이 기반 **심도 3구간 판정**(`LayeredDepthSystem` — 잠망경 ≥8 / 순항 ≥-2 / 심해, `depthChanged` 유지, `requestAscend/Descend` 계약은 프로그래매틱 층 이동으로 존치) ⑤ **정적 충돌**(`src/systems/collision/` — 구·AABB 조합, 선체 = 구 3개 캡슐 근사, 통과 방지·밀어내기만, 피해 없음, 반복 해석으로 끼임·떨림 방지) + 시작 지역 임시 레이아웃(CanyonScene 미러)
  - **어뢰 전투 (통합 순서 [5], INT-CORE-002 계약 소비)** — ① 조준 시스템(계약 `AimSystem` 구현): beginAim/endAim/fireTorpedo **공용 진입점**, `aimModeChanged` 발행(중복 없음), 자동 락온 없음 ② `StraightRunTorpedoSystem`(계약 `TorpedoSystem` 구현): 선수 발사 지점 생성, 직선 주행, 최대 사거리 초과 제거, 함선(박스)·환경(3D, collision 공유 집합) 명중 시 1회만 처리, `torpedoFired` 발행, 재장전·보유량 = combat.json ③ `MouseCombatInput`: 우클릭 조준·좌클릭 발사(에지 1회=1발), blur·탭 전환 시 해제, 컨텍스트 메뉴 방지 ④ `TargetRegistry`: 표적 위치·속도·hitRadius + `onTorpedoHit`(1회 보장) — 리드샷 보조선 데이터 연결점 ※ 당시의 '전 심도 조준(구 심도 전용 규칙 폐기) 조준'은 7차 개정판으로 **폐기**됨 (아래 스프린트 A 항목 참조)
  - **화물선 + 상태 계약 적용 (INT-CORE-003 계약 소비)** — ① `SubmarinePlayerController`가 `SubmarinePoseSource` 계약 구현: `positionY`·부호 있는 `forwardSpeedMetersPerSecond`(+선수/−선미) 제공, 계약 `speed`는 비부호 크기로 정정 — `poseSource`는 계약 타입으로 노출 ② `CargoShipSystem`(계약 `CargoShipStateSource`·`CombatTarget` 구현): 1척, 해수면 흘수선 유지, 직선 왕복(끝점 반전 잔여 이월 — dt 불변), TargetRegistry 등록, 첫 명중에서 `torpedoHit {targetId,x,z}` 1회 발행 + 표적 즉시 해제(중복 침몰 불가) + hit 고정, sinkProgress 0→1(시간축 게임플레이 소유) 후 removed=true, dispose 시 등록·참조 정리 ③ `TargetRegistry` id를 계약 체계(number)로 정렬
  - **공유 CanyonLayout 소비 (INT-CORE-004 적용)** — ① `collision/startingArea.ts` 자체 좌표·높이 수식 미러 **삭제** → 주입받은 `CanyonLayout.blocks` 순회로 충돌체 생성(블록 1개 = AABB 1개, 회전은 외접 근사 — 소비측 규칙 유지), `blockToColliderBounds` 검증 헬퍼 제공 ② `provisionalWorld.ts`의 중복 해수면 값 삭제, 잠수함 수직 상한/하한을 `layout.seaSurfaceY ± 선체 반경`에서 **파생** ③ `CargoShipSystem` 흘수선 = `layout.seaSurfaceY` ④ `GameplaySystems`가 레이아웃 주입 지원(기본 `STARTING_CANYON_LAYOUT`, 스폰 = `layout.submarineSpawn`) + `layout` 읽기 전용 노출 ⑤ 결정적 검증 75항목(75/75 — 기존 71 유지 + 블록↔충돌체 수·경계 정합, 상한 파생, 화물선 흘수선 정합 4)
  - **스프린트 A — 창 2(게임플레이) 범위 (`[LOOP]`·`[ECON]`)**
    - **전 심도 조준**: 조준 심도 제한 **폐기**. `SubmarineAimSystem`(구 PeriscopeAimSystem)은 심도·이동 시스템을 **참조하지 않는다** — 조준 진입·해제가 Y·속도·심도를 쓸 경로가 구조적으로 없다(자동 부상·심도 보정 제거). 조준 중 W/S 전후진·A/D 선회·Ctrl/E 상승·Shift 하강 모두 기존 물리 규칙 그대로 허용. 우클릭 토글 유지, 발사 후 조준 유지, 비조준 발사 금지(+`aimRequiredCount`) 유지
    - **마우스 미세 조준**: yaw ±15°·pitch 상 10°/하 15°·감도 0.5 — 제한·부호는 `aimGeometry.clampAimAngles` **단일 계산 함수**(양수 크기 저장 → 계산에서만 하향 부호). 잠수함 **로컬 기준**(선체 선회 시 함께 회전), 해제 시 yaw·pitch **reset**(persist 미구현·스키마 없음), 범위 밖 clamp
    - **소켓 기반 탄도**: `collision/torpedoTubeSocket.ts` — `torpedoTubeAnchor`/`aimCameraSocket`/`torpedoSpawnSocket`. **안전 오프셋 단일 정의**, TorpedoSystem의 자체 spawn offset 상수 삭제. 어뢰 초기 방향 = 조준 카메라 forward(단일 출처, 3D — pitch 반영), 생성 직후 자기 충돌 없음, 리드샷 보조선 속력 = 실제 어뢰 속력
    - **업그레이드 구매 판정**(`economy/UpgradePurchaseSystem`): 스냅샷→재검증→차감→단계 변경→저장→확정/롤백 원자 트랜잭션. 조건 실패 5종(insufficientCredits·insufficientRareParts·maxLevelReached·slotFull·alreadyEquipped)과 **저장 실패(saveFailed)를 카테고리로 구분**, 롤백 후 지갑·단계가 구매 전과 동일하며 재구매 가능. 테크 트리 없음, 8번째 항목 런타임 거부, params 원본 불변
    - **장비 장착·교체·해제**(`EquipmentSystem`): equipItem/replaceItem/unequipItem + 슬롯 제한·중복 규칙, 저장 포트 연결 시 **저장 실패 = 이전 loadout 롤백**, 변경이 전투 유효 파라미터(속력·피해)에 즉시 반영. 장비 4종 유지(5번째 금지)
    - 결정적 검증 **128항목**(128/128) — 기존 100항목 유지·조준 규칙 변경분 갱신 + 신규 28
  - **PvE 전환 1·2단계 게임플레이 (회의 09·11 반영 — [ECON][LOOP][BOSS])** — ① 플레이테스트 수정 5건 중 게임플레이 소유분: 함선 충돌체(잠수함-함선 통과 방지·밀어냄만, 어뢰 명중과 `hullBox` 박스 근사 공유 — `collision/shipHullBox.ts`), 비조준 발사 절대 차단 + `aimRequiredCount` 안내 신호, **우클릭 토글 조준경**(`toggleAim` — 재입력 해제, blur에도 토글 유지), 조준 상태에서만 좌클릭 발사(비조준 좌클릭 = 카메라 전용), **Ctrl=상승/Shift=하강 + E 상승 병행 키** ② **Faction 태그 + 드롭 테이블**(hostile/neutral/guard + object — 클래스 복제 없음), `src/systems/economy/`: 드롭 생성(EconomySystem)·월드 픽업(CreditDropField)·획득 반영(RunEconomy) 3단 분리, 적대 파괴→크레딧 드롭→접근 자동 회수, 중립 공격→크레딧 없음+경비함 출현 요청 큐(`consumeGuardSpawnRequests` — 구축함 AI 재사용은 리드), 해저 재화 '부순다'(SalvageObject — 기존 어뢰 표적 경로 재사용) / '줍는다'(자동 회수), 일반 크레딧·희귀 부품 분리 + 희귀 부품 즉시 저장 신호(onRarePartAcquired), 손실 페널티(settleDefeat — 손실률 파라미터, 희귀 부품·확정분 보존, 정산 데이터 반환) ③ **장비 4종**(기본/고속/중어뢰/디코이 — 상위호환 없음, 슬롯 2 제한, 단일 fire 경로 유지, 디코이 = 가짜 음향 표적 상태 노출), 업그레이드 **합연산** 배율 주입점 `setUpgradeModifiers`(EffectiveParams 동등 인터페이스) → 발사 어뢰 속력·피해에 실반영 ④ **보스 약점 판정**(BossWeakPointTarget — BossPhasePort 계약만 소비, 활성=약점/비활성=일반 피격 구분·배율 누적·그래픽스 구독용 상태·onHit) ⑤ 결정적 검증 100항목(100/100 — 기존 75 유지·결의 반영 갱신 + 신규 25)
  - **스프린트 A 마감 — production 배선 (`[ECON]`·`[LOOP]`)**
    - **공식 경제 카탈로그 어댑터**(`economy/officialEconomyCatalog.ts`): `params/upgrades.json`·`equipment.json`만 읽는다. 공식 ID(업그레이드 7·장비 4) 밖은 **런타임 거부**, `null`·음수 가격은 비용을 산출하지 않는다(임의 대입 금지)
    - **구매 판정**(`UpgradePurchaseSystem` = 계약 `UpgradePurchaseJudgePort`+`UpgradeLevelsPort`): 사유 산출(insufficientCredits/RareParts·maxLevelReached), 가격·희귀 부품 요구량, 후보 단계 적용(`applyPurchasedLevel`), rollback용 `snapshotLevels`/`restoreLevels`. **가격이 null이면 구매 불가**(UI에는 `nextCost=null` 동시 노출 — 전용 사유 신설은 INT-GAME-010 결정 대기)
    - **장비 판정**(`EquipmentSystem` = 계약 `EquipmentChangeJudgePort`): catalog·loadout 읽기, equip/replace(= 점유 슬롯 대상 equip)/unequip, 슬롯 제한·중복·동일 장비 판정, `snapshotLoadout`/`restoreLoadout`으로 이전 loadout 복원. 공식 `slotCapacity` 확정 시 반영, null이면 구조 기본값 유지
    - **출항 중 획득량**: `sortiePendingCredits`·`sortiePendingRareParts` — 실제 loot 회수·정산 상태에서만 파생(임시 숫자 없음), EconomyHud read-only source
    - **출항 준비 판정**: `sortieReadiness(isBaseState)` → `{ inBase, loadoutValid, upgradesValid, ready, blockers }`. **저장·화면 전환·메타 상태 전이는 하지 않는다**(리드 Departure command가 소비)
    - **저장 직접 호출 0회**: `EquipmentSystem.attachSavePort`·`economy/purchaseTypes.ts`·`economy/provisionalUpgradeCost.ts` **삭제** — 저장·롤백 순서는 리드 트랜잭션 단일 소유
    - **provisional 정리**: 가격 임시 경로 제거(삭제). 남은 3종(`economy/provisionalEconomy`·`provisionalCargo`·`provisionalEquipment`)은 공식 소스 부재·공식 파일의 위임 때문에 유지하되 `economy/pendingOfficialData.ts`에 **감사 목록**으로 명시
    - 결정적 검증 **133항목**(133/133)
  - **공식 경제 params production 소비 전환 + 해저 재화 spawn 어댑터 (INT-CORE-011 이행 — `[ECON]`·`[LOOP]`)**
    - **provisional 3종 삭제**: `economy/provisionalEconomy`·`provisionalCargo`·`provisionalEquipment`. production 소비 **0건**(러너 정적 검사 — `__verification__` 픽스처·역사 문서는 검사 대상에서 구분). 시스템은 params JSON을 직접 import하지 않고 툴링 로더도 호출하지 않는다
    - **주입 단일 진입점**: `GameplaySystems.attachOfficialParams(official)`(= 생성자 5번째 인자와 동일) → 경제·화물선·장비 동시 배선. 받는 형태 `GameplayOfficialParams`는 리드 `OfficialRuntimeParams`가 그대로 대입되는 구조 단면
    - **경제**: 손실률 **0.5**(6차 결의 7 — 게임플레이 0.4 잔재 제거)·픽업 6m·드롭 테이블 120/60/40/25 전부 주입값. 미주입 = 드롭·회수·손실 전부 0(수치를 발명하지 않는다) + `economyParamsWired === false`
    - **화물선**: `cargoShipConfigFromOfficial(cargo, layout.seaSurfaceY)` — 해수면만 월드 소유. **이관 전 런타임 값과 동일함을 회귀 테스트로 고정**(속력 4·반경 9·침몰 6s·경로 ±30/−40·선체 10/2.5/4/3). 미주입 = 표적 미등록
    - **장비**: 성능·가격·슬롯이 전부 `params/equipment.json`(내부 성능 상수 0). slotCapacity 2 소비 + **3을 주입하면 3이 되는 것**으로 하드코딩 아님을 증명. 미주입 = 어뢰 프로파일 없음(발사 불성립)
    - **시작 로드아웃 규칙**: `restoreSavedLoadout(null)` = 저장 없음 → 공식 `startingItem`(기본 어뢰) 부여 / `restoreSavedLoadout([])` = 저장이 명시한 전부 해제 → **그대로 유지**(새로고침 때 기본 어뢰가 되살아나던 문제의 원인 = 조립부가 `equippedGear`를 저장만 하고 복원하지 않는 것 — INT-GAME-011 ②)
    - **해저 재화 spawn 어댑터**: `spawnSalvageFromPlan(entry)` — **spawnId 키**, 같은 출항 중복·회수 후 재생성 거부, `resetForNewSortie()`에서만 기록 해제(새 출항 재생성). 보상 = 경제 params 파생 plan, 좌표 = `SalvagePlacementSource`. 3종 배치·총 125크레딧·희귀 부품 1개 검증
    - **업그레이드**: 공식 가격 배열(100/160/240/340/460)·희귀 부품(0/0/0/1/2)·effectBonus 누적(A군 3단계 0.16 / B군 5단계 0.6)·`paramRef` 소비. 가격 미확정은 **`economyDataUnavailable`**(INT-CORE-010 신설 사유 — INT-GAME-010 결정 요청 해소). provisional 비용 경로 0. 조립부의 축약 카탈로그 + 비용 resolver 호출 형태도 그대로 지원
    - **효과 소비자 조사**(`economy/upgradeEffectConsumers.ts`): **wired 4** — maxSpeed·turnRate(`SubmarinePlayerController`), reloadSpeed(`StraightRunTorpedoSystem`), torpedoDamage(`EquipmentSystem.setUpgradeModifiers`) / **`deferred consumer` 3 — hullIntegrity·maxDepth·sonarRange**(기준값 파라미터·소비 시스템 부재. 기준값 발명·체력 시스템 개발·C 내구도 선구현·스텁 전부 없음)
    - **저장 직접 호출 0건**: 러너 정적 검사(save 계열 import·`.save(`·localStorage) + 판정 포트 표면 검사 2중
    - 결정적 검증 **167항목**(167/167 — 기존 133 유지·공식화 반영 갱신 + 신규 34, 정적 검사 2 포함)
  - **스프린트 B 선행개발 (INT-CORE-012 이행 — `[FACTION]`·`[AI]`·`[ECON]`·`[LOOP]`). B 공식 미발효 — dev/main·통합 병합 없음**
    - **B1 적대·중립 동시 배치**: `faction/shipPlacements.ts` — 공식 `params/cargo.json` 값에서만 파생한 배치 2척(적대 1·중립 1). **수치 리터럴 0개**, 중립 항로는 공식 선체 길이(2×halfLength)만큼 평행 이동한 같은 항로다. 같은 `CargoShipSystem` 원형을 세력 태그만 바꿔 재사용 — 선박 클래스 분화·신규 AI 없음. 중립은 선제 공격하지 않는다(공격 진입점 자체가 없고 플레이어 위치를 읽지 않는다)
    - **B2 식별 read model**: `faction/ShipIdentificationSystem.ts` = 계약 `ShipIdentificationSource`. 미식별 시 `displayLabelId === null`(세력 비노출), 식별 후 세력·라벨 키 일치, 죽은 표적은 `tagDisplayable=false`. 색·문구 미제공(그래픽스 소유). **식별 거리 공식 params가 없어** 기존 판정 범위(어뢰 유효 사거리 + 조준경 진입)를 재사용한다 — 새 거리 상수 발명 0, `attachIdentificationParams`로 교체 가능
    - **B3 세력별 보상**: 판단 근거는 계약 규칙표 `rewardDropTableIdFor` 하나(시스템 내부 세력 분기 제거). hostile = 공식 `cargo-standard` 유지(120), neutral = 드롭 엔티티 0·크레딧 0·희귀 0·**지갑 전후 동일**, patrol = 공식 params 없음 → 보상 0(발명 금지). 평판·도덕성 미도입
    - **B4 `neutralShipHit` 이행**: 발행 지점은 **유효 피해가 적용되는 곳 단 하나**(`CargoShipSystem.onTorpedoHit`, damage>0·미파괴·중립 규칙 충족). 조준·발사·빗나감·파괴 후·같은 correlationId 재발행 전부 0회. 상관 id = `torpedo:<어뢰 id>`(어뢰 1발 = 1건, `TorpedoAttackContext`로 전달). **레거시 `legacy:<targetId>` 경로 production 사용 제거** — 게임플레이가 경비 큐에 요청을 넣지 않으므로 같은 사건이 두 경로로 처리되지 않는다. 중복 방지 표는 리드 `GuardIncidentLedger` 하나뿐이며 게임플레이에 별도 표를 만들지 않았다
    - **B4 스폰 위치 전략**: `faction/CanyonPatrolSpawnLocation.ts` = 계약 `GuardSpawnLocationStrategy`. 플레이어 선체·사건 지점·지형 내부 회피(기존 `CollisionWorld.intersectsSphere` 재사용), 가시 범위 내 진입, 후보 없으면 **null → `noSpawnLocation`**(원점·플레이어 위치 무조건 반환 금지). 경비 거리 params가 없어 어뢰 유효 사거리와 그 절반에서 파생 — `attachGuardSpawnParams`로 교체 가능
    - **B5 = 차단(B5_BLOCKED=true, 경우 B)**: 전 브랜치 히스토리 조사 결과 **재사용할 구축함 AI 구현이 없다**(계약·어댑터·검증 더블뿐). 신규 Guard AI 코어를 만들지 않았고 러너 정적 검사로 0건을 강제한다. 체인 도달점 = 위치 해결 후 `spawnFailed`(AI 팩토리 미연결). 상세: INT-GAME-012
    - **B6 고가치 수송선·호위 (B1~B5와 독립)**: `faction/HighValueTransportSystem.ts` — archetype·보상 배율 **참조 키**(숫자 아님, 공식 배율 미도착이라 `null` = 보상 변경 없음)·`EscortBinding`·`transportAttacked` 1회 발행·교전 요청 생성·`maximumEscortDistance` 소비. **실제 AI 기반 호위 기동은 미완료** — 구축함 AI 부재로 교전 요청 소비자가 없다(호위 전용 신규 AI 미작성)
    - 결정적 검증 **192항목**(192/192 — 기존 167 유지 + 신규 25, B5 AI 코어 0건 정적 검사 포함). meta 77/77·tooling 26/26·sprint-a 30/30 동시 통과
  - **B5 런타임 연결 (INT-CORE-013 이행 — `[AI]`·`[FACTION]`·`[LOOP]`). B 공식 미발효**
    - **`SurfaceShipMotionPort` production 구현**(`faction/PatrolShipFleet` + `faction/PatrolShipEntity`): 리드 범용 `DestroyerAIController`가 실제 경비함을 움직인다. **스폰 1건 = 월드 엔티티 1개 = 포트 1개**, pose 정본은 엔티티 하나(AI는 transform 미보유). 플레이어 pose 재사용·렌더 객체 조작·중복 transform 저장소 전부 없음
    - **이동 수치는 전부 임시 상속값**(경비함 전용 공식 튜닝값 아님): 속력·명중 반경·선체 박스 = 공식 `params/cargo.json` / 해수면 = 공유 `CanyonLayout.seaSurfaceY` / 선회 속도 = `params/movement.json` `turn90Seconds` 파생(수상함 선회 공식값 부재 → 잠수함 검증값 상속) / 월드 경계 = `CanyonLayout.blocks` 외곽 AABB + 공식 항로 끝점 파생(`collision/canyonBounds`). 공식 params 미주입 시 스폰 자체가 성립하지 않는다(수치 발명 0)
    - **경비함 월드 엔티티**: faction=patrol·spawnPosition 그대로 초기 위치·보존, 기존 `TargetRegistry` 등록(별도 registry 신설 없음), 파괴·dispose·새 출항에서 정리, 같은 entityId 재요청 시 추가 생성 0
    - **다중 선박 read source**(`faction/ShipWorldSource`): hostile cargo·neutral cargo·patrol guard를 **읽기 전용 스냅샷** 한 목록으로 노출(`gameplay.shipWorldSource`). 렌더가 게임플레이 객체를 바꿀 수 없다
    - **식별 소스에 patrol 포함**: 세 세력이 한 소스에서 나오고 entityId가 월드 엔티티와 동일. 미식별 라벨 null·죽은 경비함 태그 제거
    - **B4→B5 체인 검증**: 중립 유효 피격 → `neutralShipHit` → 원장 → `guardShipRequested` → 위치 전략 → production factory → 경비함 1척 생성(`spawned`) → 초기 표적=플레이어 → **실제 이동으로 접근**(거리 감소·수면 유지·AI attack 전이). 같은 correlationId 요청 0 추가, 같은 requestId `duplicateRequest`. **검증 더블 미사용**(production `createProductionDestroyerAIFactory` 그대로)
    - **B6**: 교전 요청 → 경비함과 같은 범용 factory 입력 변환 어댑터 제공(호위 전용 AI 0). 이탈 거리 공식값이 없어 결속 비활성 — **실기동 미완료**
    - 결정적 검증 **213항목**(213/213 — 기존 192 유지 + 신규 21). meta 88/88·tooling 26/26·sprint-a 30/30 동시 통과
    - **브라우저 스모크(역할 브랜치)**: 부팅→출항 콘솔 오류 0, `guardAdapter.aiWired=true`. production 경비 스폰은 아직 **`noSpawnLocation`** — 조립 2줄(INT-GAME-013) 미연결 때문이며 게임플레이 준비는 끝났다
  - **스프린트 C1~C4 (INT-CORE-015 / SPRINT_C_HANDOFF 이행 — `[COMBAT]`). C 공식 미완료**
    - **C1 탐지 게이지 정본**(`detection/SubmarineDetectionSystem`): 계약 `DetectionSystem`+`DetectionStageSource`+`SortieResettable`. HUD는 `DetectionHudView` 값 복사본, **AI는 stage와 마지막 노출 위치만**(게이지·내부 state 비노출). 거리 감쇠·감소율 null이면 **게이지 0·safe 고정·전이 0**(임의 기본값 0건). 출항 시작·종료 reset. 관측자는 세력 무관 동일 계약
    - **C2 은신·심도 입력**(`detection/DetectionEnvironmentAdapter`): 기존 3층 심도 정본 소비, 보정식·계수 자체 계산 0(공식 배율은 탐지 시스템이 적용). 소음·침묵 항행 소스는 공식 규칙 부재 → **미연결 = 중립 입력**. 심도 이동 물리 무변경
    - **C3 추적 연결**: `PatrolShipFleet.getTargetPosition(PLAYER)`가 stage `detected`일 때만 위치를 준다 → 리드 `DestroyerAIController`가 기존 `patrol/alert/attack/lost`로 전이한다. **새 상태명·상태 머신·이벤트 0**, 전이 로직 복제 0
    - **C4 공격 경계**(`combat/EnemyAttackCoordinator` = `EnemyAttackPort`): 사거리·쿨다운 소유. params null → `unwired`, 표적 파괴 시 거부, 같은 `attackId` `duplicate`, **요청 즉시 피해 0**(투하만)
    - **C4 폭뢰**(`combat/DepthChargeRunSystem` = `DepthChargeSystem`): 투하→낙하→**신관 3.0초 하한**→폭발→direct/near **택일**→`DamageRequest`→`applyDamage` **단일 창구**. 반경·피해 null이면 폭발은 진행하되 피해 `damageUnwired`. `damageEventId`·`correlationId` 부여, 같은 상관 id 중복 피해 차단. 게임플레이 자체 체력 상태 0
    - **PlayerAliveSource 실제 배선**: `attachPlayerAliveSource()`가 함대·공격 포트 양쪽에 연결. `isTargetAlive(PLAYER_ENTITY_ID)`의 **항상 true 경로 제거**. 파괴 후 관측·공격 0, 다음 출항 reset 후 복구
    - **병행 정산 제거**: `EconomySystem.settleDefeat`·`settleReturn`·`RunEconomy.settleSortie` **삭제**(production 호출자 0건이었음). 정산 정본은 `MetaLoop.settleSortie` 하나. 게임플레이 지갑 직접 확정 0
    - **수치 출처**: 탐지 확정 3종·신관·동시 폭뢰는 공식 params. 공격 사거리는 폭뢰 `nearRadiusMeters` 재사용(구조 규칙). **미확정 전량 null 유지** — 거리 감쇠·감소율·direct/near 반경·피해·투하 쿨다운. 검증 픽스처는 검증 파일 안에만 있고 production import 0
    - 결정적 검증 **238항목**(238/238 — 기존 213 유지 + 신규 25). meta 110/110·tooling 26/26·sprint-a 30/30·sprint-b 23/23 동시 통과
    - **C_RUNTIME_WIRED = false** — `params/combat.json`에 C9 필드가 아직 없어 탐지·폭뢰 피해가 unwired다. 조립 4줄(INT-GAME-014)과 공식 params가 도착해야 런타임이 구동된다
- **진행 중:** 없음
- **다음 작업:** INT-GAME-012 조립 배선(스폰 위치 전략·식별 소스·다중 선박 렌더 소스) + 공식 수치 4종 요청, INT-GAME-011 조립 3줄 배선(리드 결정 후 production 값 흐름 완성), INT-GAME-004·006 리드 결정 후 잔여 provisional 이관(심도 구간 경계·비율·어뢰 사거리), 격침 보상 어뢰 +1 배선(§5.9 — torpedoHit 구독), 임시 탐지·폭뢰·내구도(D6~D9 잔여)
- **차단 문제:** **B5 차단 해소 (B5_BLOCKED=false)** — 리드가 범용 `DestroyerAIController`를 신설(INT-CORE-013)했고, 게임플레이가 `SurfaceShipMotionPort`를 구현해 경비함이 실제로 생성·이동한다(검증 확인). 남은 것은 **조립 2줄(INT-GAME-013)** — 그 전까지 production 스폰은 `noSpawnLocation`이다. **B 배선 대기 (INT-GAME-012)** — 스폰 위치 전략·식별 소스·다중 선박 렌더 소스가 조립부에 연결돼야 B1·B2·B4가 화면·런타임에서 성립한다. **production 배선 대기 1건 (INT-GAME-011)** — 경제·화물선·장비 공식 params 주입과 저장 로드아웃 복원, salvage plan 전달은 조립부(`src/core/Game.ts`, 리드 소유) 3줄이 있어야 값이 흐른다. 그 전까지 세 시스템은 **설계된 unwired 상태**(임시 수치 생성 없음, `*ParamsWired === false`로 노출)로 남는다. 이전 **의존성 대기 2건** — ① 리드 창의 스프린트 A 계약(앵커·2소켓·구매 트랜잭션·지갑/저장 포트)이 원격에 아직 없어, 계약 복제 없이 게임플레이 쪽 **단일 소비 지점**으로 선진행함(도착 시 어댑터로 축소·삭제) ② 툴링 창의 `params/aiming.json`·경제 가격 params 미도착 → `provisionalAiming`·`provisionalUpgradeCost` R7 선진행. 그 외 ① 화물선 속력·반경·침몰 시간·경로와 심도 구간 경계·비율·어뢰 수치는 R7 선진행(`provisionalCargo/`, `provisionalMovement/`, `provisionalCombat/`, `provisionalWorld` 구간 경계 — INT-GAME-004·006·007) ② 격침 보상(어뢰 +1)은 TorpedoSystem 잔량 증가 경로(계약 메서드) 리드 결정 대기(INT-GAME-007)
- **변경된 계약:** 없음 (직접 변경 없음 — INT-GAME-008 제안 등록. aimRequired·경비 요청·희귀 부품 저장·보스 피격은 계약 확정 전까지 읽기 전용 상태·consume API·콜백으로 제공)
- **통합 주의사항:** 좌표 규약 — **잠수함 로컬 -Z가 선수, +Z가 선미** (`src/core/conventions.ts`만 참조). heading은 Y축 요(yaw), heading 0 선수 = 월드 -Z, 렌더는 `mesh.rotation.y = headingRadians` 그대로. 속도 소비 규칙(INT-CORE-003): 프로펠러 등 부호가 필요하면 `poseSource.forwardSpeedMetersPerSecond`(+전진/−후진), 소음 산출 등 크기만 필요하면 계약 `player.speed`(비부호). 렌더 잠수함 Y는 `poseSource.positionY`. **화물선 상태는 `gameplay.cargoShipState`(계약 CargoShipStateSource)** — composition root가 CargoShipVisual에 주입, `hit`/`sinkProgress`(시간축 게임플레이 소유)/`removed`를 매핑만 할 것, 명중 연출·오디오는 `torpedoHit` 구독. 심도 초기 구간은 y=0 → `cruise`(초기 이벤트 없음). **충돌체 집합은 `gameplay.collision.colliders`(읽기 전용) 공유** — 은신 시야 차폐(D10~12)는 이 집합을 재사용할 것(별도 집합 금지). **협곡 배치의 유일 소스는 `src/world/startingCanyonLayout.ts`** — 렌더·충돌 모두 `CanyonLayout.blocks` 소비(미러 소멸), 레벨 교체 = 새 레이아웃을 `GameplaySystems` 생성자에 주입(또는 데이터 모듈 교체), 소비 중 레이아웃은 `gameplay.layout`으로 확인. **전투 입력은 반드시 `gameplay.aim`(계약 AimSystem) 하나로** — HUD 조준·발사 버튼은 composition root에서 `aim.beginAim()/endAim()/fireTorpedo()`를 호출(별도 전투 시스템 금지), UI는 `torpedo.remaining`·`torpedo.reloadRemainingSeconds`·`aim.aiming` 폴링 + `aimModeChanged` 구독. 리드샷 보조선 = `targets.list`(위치·속도) + `torpedo.torpedoSpeedMetersPerSecond` + `player` 포즈로 계산. 렌더 어뢰 항적은 `torpedo.torpedoes`(읽기 전용) 폴링. 화물선 시스템은 `targets.register()`로 표적 등록(콜백 `onTorpedoHit`는 어뢰 1발당 1회 보장)
- **마지막 업데이트:** 스프린트 **C1~C4** (탐지 게이지 정본·은신/심도 입력·추적 연결·EnemyAttackPort·폭뢰 lifecycle·PlayerAliveSource 실제 배선·병행 정산 제거. **C_RUNTIME_WIRED=false** — 공식 combat params·조립 4줄 대기)
- **담당 브랜치:** `claude/submarine-controls-depth-3wi424` (원격 세션 지정 브랜치 — `feat/gameplay` 역할, origin/dev + 리드 계약 브랜치 병합 기반)

## 그래픽스

- **완료:**
  - (D+10까지) 회색 박스 장면·프로펠러·해수면·화물선·X-ray 스파이크 성공·정식 계약(INT-CORE-003·004) 소비 — 이력: PROJECT_STATE §2
  - **[LOOP] 5차 결의 시각 이행** — ① 어뢰 로우폴리+기포 항적(`TorpedoVisuals` — 풀링·인스턴싱 1드로우, 리드샷 학습 피드백 P1) ② 조준경(`PeriscopeView` — 동일 카메라+원형 마스크(DOM)+FOV 보간+십자선·눈금, `aimModeChanged` 소비만) ③ 조준경 내 리드샷 보조선(`LeadShotIndicator`) ④ 해수면 정점 파도 확인(기존 구현 유효 — 변경 없음) ⑤ 환경 부활 1호(`EnvironmentDressing` — 산호 3종 18개소·어군 2종 인스턴싱·침몰선 잔해 1·원경 실루엣 1겹, 연안 한정·밀도 캡 기록·드로우 +10)
  - **[LOOP] PvE 성장 루프 시각** — 기지 화면(`BaseSceneView` — 경량 3D 독, 메타 상태 소비 전용) + 외형 단계 어댑터(`SubmarineVisual` — 선체·주무장 각 3단계, visualTier 주입만, 최종 에셋 교체 지점 격리)
  - **[BOSS] 분절 애니 스파이크 판정: 성공(조건부)** — 강체 5분절 계층 트랜스폼+사인파 위상차, 스켈레탈·스키닝·관절 물리 0, 충돌 단일 캡슐 전제 유지. 위협감 실측 충족, 최종 모션 리뷰(리드·아트) 1건 잔여. B안(`BossMotionFallback` — 대시·관성·카메라 흔들림 훅) 경계 준비, 기본 비활성. `docs/RENDER_SPIKE_BOSS.md`
  - 약점·단계 연출 연결점 — `setWeakpointActive`(발광·점멸·턱 개방)·`setPhase`(체색 전환)·`onPhaseTransition` 시임. 활성·단계 판정은 게임플레이 소유
  - **[LOOP][ECON] Sprint A 조준 시각·성장 UI (13·14차 창3)** — ① **선수 발사관 조준 카메라**: `SubmarineVisual.aimCameraSocket`(어뢰관 앵커 정위치·전방축 동일 — 13차 결의 2, 모델 소유 단일 지점) + `CanyonScene.updateAimCamera`(소켓 월드 위치·방향 그대로, 독자 오프셋 0, 전 심도 동일·심도 카메라 전환 없음, 발사 후 유지), 미세 조준각은 `attachAimAngleSource` 게임플레이 소스 소비(부재 시 0), 해제 시 `CameraRig.beginReturnFrom`으로 3인칭 자연 복귀 ② **자기 선체 레이어 제외**: 선체 서브트리를 layer 1에 두고 조준 중 조준 카메라 마스크에서만 disable — visible·material 전역 변경 없음(블롭 섀도·수면·타 카메라 보존), 해제·dispose 시 복원 ③ **2D 발사관 프레임**: `PeriscopeView` 하단 관 내부 어둠+관구 림 호+좌우 관벽(DOM, 마스크 overflow 일체화, 십자선·눈금·보조선 뒤 레이어) ④ **재화 HUD**(`EconomyHud` — 기지·해역, MetaLoop 실지갑 소비·내부 지갑 없음, 확정 vs 이번 출항(미확정) 구분, 집계 getter 부재 시 '배선 대기' 표기) ⑤ **출항 준비 화면**(`SortiePrepScreen` — 업그레이드 이름/단계/효과/가격/구매, 장비 4종 역할·장착/해제/교체, 출항 버튼, sticky 결과 피드백) — 전부 포트(`metaEconomyPorts`) 소비·command 호출·결과 코드 표시만, 불가 5종+저장 실패 지정 문구, 공식 가격 부재 시 '가격 데이터 대기' 비활성(가격 발명 금지) ⑥ Playwright 실측: 실경로 조준(잠망경 심도 화면 버튼)·발사 후 유지·해제 복귀·심도별 조준 시점·실지갑/실카탈로그/실장비 TEMP-WIRING 왕복(원복 완료) — 스크린샷 docs/screenshots/sprintA_*
  - **[LOOP][ECON] Sprint A 마감 — 경제·성장 UI production 배선 (INT-RENDER-009, 기준 통합 `ebea23b` 병합)** — ① UI 재작성: `SortiePrepScreen`·`EconomyHud`의 유일한 명령·상태 진입점을 공통 계약 **`BaseScreenPort`**로 교체(지갑·단계·loadout·저장소·게임플레이 내부 직접 접근 0), 결과 표시는 계약 `TransactionResult`(불가 5종·saveFailedRolledBack) + UI 전용 `economyDataUnavailable`(가격 null — 트랜잭션 미진입, 0원 구매 없음) ② Game 조립(INT-CORE-009 스니펫 적용): savePort(SaveBridge)·구매 판정(공식 catalog 가격 resolver — provisional 가격 미사용, null=도달 불가 거부 값)·`PurchaseTransaction`·장비 원자 경로 매핑(slotFull→noFreeSlot)·`baseScreenUi` registry 시스템 마운트, 구매 확정 시 유효 파라미터·장비 배율·외형 단계 재파생, 저장 loadout 부팅 복원 ③ 출항 단일 진입점(§6): 자동 출항 제거(**기지 시작**)·ControlsHud launchSortie 미주입, `BaseScreenPort.launchSortie` = 확정 직전 저장 실패 시 cancelSortiePrep(해역 전환 금지·기지 유지) ④ production 기본 URL Playwright 실측: 기지 화면·실지갑 일치·업그레이드 7종 null 비활성·장비 3동작·저장 결함 주입 롤백(지정 문구·loadout 무변경)·저장 실패 출항 거부·정상 출항 후 해역 미확정 집계 줄 — 스크린샷 `sprintA_*_production.png` ⑤ QA 데모(`?econdemo`)는 production 마운트와 분리 유지(가짜 BaseScreenPort — 배지 표기)
  - **[LOOP][ECON] Sprint A 마감 2 — BaseScreenPort v2 동기화·공식 가격 활성·해저 salvage 배치 (INT-RENDER-010, 리드 `ffa945a`·툴링 params `2a89400` 병합)** — ① **v2 직결**: UI가 읽기 모델 9종·명령 5종·결과 8종을 계약 그대로 소비. 게임플레이 로컬 결과 타입 참조 0건. **구계약 변환 어댑터 제거**(`createMetaUiPorts`·`toUiCommandResult`·`isOfficialUpgradeStatId` + 구 UI 포트 타입 일습) ② **공식 가격 활성**: 업그레이드 7종 가격·구매 조건 활성화(1단계 100), 장비 4종(기본 어뢰 시작 보유 / 고속 260 / 중어뢰 420+희귀 1 / 디코이 340+희귀 1). QA 데모 가격은 production 미사용 ③ **해저 salvage 배치**: `world/salvagePlacements.ts` = `SalvagePlacementSource` — spawnId·worldPosition·orientation만 정의(보상 수치 0건). salvage-1(-3.83,-4.5,-30)·salvage-2(5.62,-4.5,16)·salvage-3(2.65,-4.5,42), 지형 여유 ≥8.2m·상호 ≥26m·스폰 17.5m+·화물선 항로 19.7m·해저 접지(상단 -3m) ④ **salvage 시각**: `SalvageVisuals` 회색 박스 3종 + 회수 범위 링(게임플레이 실제 반경 주입) — `rarePartId` 미참조(희귀 부품 사전 노출 금지), 탐지 UI 미추가 ⑤ 출항 진입점 1개 유지(자동 출항 없음, HUD 출항 버튼 미노출)
  - **[FACTION][RENDER] 스프린트 B 선행개발 — 식별 태그·세력 외형·경비 방향·호위 표현 (INT-RENDER-011, 리드 `1378834` 병합)** — ⚠ **B 공식 발효 전 선행개발**이며 dev/main 병합·B 완료 보고 대상이 아니다. ① **B2 식별 태그**(`IdentificationTags` — `ShipIdentificationSource`만 소비, 상태 4종 기호 ◇▲■◆+문구+거리+조준 가부, 미식별 시 세력 비노출, tagDisplayable/isAlive/isTargetable 계약 준수, 십자선 중심 회피·겹침 완화, z-31 별도 층으로 마스크·십자선·눈금 무변경) ② **B7 노출 신호**(`IdentificationExposureSink` — 최초 표시 시각·세력 실노출 여부만, 결과 분류·오인 판정 없음) ③ **B1 세력 외형**(`factionVisuals` + `CargoShipVisual` 변형 — 적대 각진 무장/중립 매끈 화물/경비 저현 전투, 마크 형태 삼각·사각·마름모, 등화 거동 구분 → **색 이외 구분 3중**) ④ **B5 경비 방향**(`GuardDirectionIndicator` — 실제 스폰 좌표만, 화면 밖 가장자리 화살표+거리, 화면 안 해제(0.25s 체류), 6초 소멸, 기지 억제, 시간 정지·컷신·탐지 게이지 없음) ⑤ **B6 호위**(`ConvoyVisuals` — ◈고가치/⚔호위 배지 + EscortBinding 점선 결속선, 거리 추측 없음, 보상 숫자 미노출) ⑥ fixture `?bdemo=1`(UI 단위 검증 전용 배지 표기 — production 아님, 가짜 경비함 3D 개체 없음)
  - **[DETECT][SURVIVAL][LOOP] 스프린트 C — 탐지·생존 HUD·피격 피드백·실패/귀환 화면 분리 (INT-RENDER-012, 리드 `d689628` 병합)** — ① `DetectionHud`(DetectionHudView 그대로 — 눈 3단계 ─◔◉·게이지 무보정·unwired 빗금+'계기 미연결', TrackingStateSource 4종 칩 — 집계값·새 상태명 0) ② `SurvivalHud`(SurvivalReadModel — 선체 바·침수·survivalState·warningIds 키 매핑·hullRatio null 안전·피격 플래시(consumeDamageFlash 계약 소비)·lastHitDirection 방향 지시자) ③ X-ray 침수 구동(floodingChanged severity 매핑만 — 자체 타이머 0, 선체 레이어 준수) ④ `SortieFailureScreen`/`SortieReturnScreen` **파일·데이터 완전 분리**(DebriefReadModel.kind가 유일 분기 — isDestroyed 추측 0), 저장 실패 시 DEBRIEF 유지 + 재시도 command·기지 이동 불가 명시, 귀환 화면 확인 = completeDebrief command(구 자동 완료 대체) ⑤ fixture `?cdemo=1`(UI 단위 검증 전용 배지) ⑥ production 실측: 정상 귀환 전체 루프·unwired 표시·A/B 회귀 없음. 피해·파괴 실데이터는 combat params null·게임플레이 미구현으로 fixture 검증만
  - **[ART][RENDER] 아트 디렉션 패스 — 심해 후방 플레이 아트 타깃 대응 (연출 전용 — 카메라·게임플레이·협곡 지오메트리 무변경)** — ① **연속 심도 안개**: 수면(#1c4a5c, 18–150)→해저(#0a2430, 10–95)를 카메라 심도(레이아웃 seaSurfaceY↔floorY)로 연속 보간 — 전경·중경·후경 명도 분리, 구 이진 수중 전환 대체(수면 위 하늘 값은 기존 유지) ② **조명 교체(예산 불변 2등)**: AmbientLight→HemisphereLight(sky #3a6a7c / ground #101c22) — 상하 수직 명도 구배, 방향광은 파라미터화(#cfe8f2·2.3), 남은 1등 서치라이트/폭발 예약 유지 ③ **재질 팔레트**: 벽/바닥/선체 색+미세 emissive를 `renderVisualParams.json artDirection.materials`로 이관(완전 검정은 틈·최원경만), 선체 한랭 청회 #46586a + **주황 식별 액센트 #b06a32** ④ **프레넬 림라이트**: MeshLambert onBeforeCompile 주입(#7fc4de·0.42·pow3.1) — 추가 광원·드로우 0 ⑤ **항법등 글로우**: 가산 Points 2점(#ffc37a) 1드로우 — 실제 bloom 대체 ⑥ **부유물**(`DriftParticles`): Points 140개 1드로우, 결정적 분포·카메라 상자 되감기·코드 생성 도트 텍스처 ⑦ **ACES 톤 매핑**(노출 1.12 — 후처리 패스 0) ⑧ **저사양 사다리 `?quality=low`**(`renderQuality.ts`): 부유물 140→40·림 off·항법등 off ⑨ 실측: 동일 구도(스폰 순항 + 3초 하강 심해) 전후 스크린샷 `docs/screenshots/art_{before,after}_*.png`, 드로우 56→58(+2), 평균 FPS 16.6→17.1(회귀 없음), verify:hud 34/34·verify:gameplay 213/213. verify-hud 재장전 검사는 고정 21s 대기→완료 폴링(60s 마감)으로 강화(저속 환경 델타 상한 0.1s 시간 지연 대응 — 판정 의도 불변)
  - **[ART][RENDER] base color 텍스처 패스 — 암벽·퇴적물·산업 금속 3종 적용 (연출 전용 — 지오메트리 배치·충돌·게임플레이 무변경)** — ① **에셋**: 아트 후보 이미지를 오프라인 보정(저주파 조명 제거·평균 224 가산 중립화·edge 크로스페이드 → 이음새 0.0)해 `public/textures/` WebP 6종(1024/512 각 3종, 디스크 총 ~188KB). 최종 색 = 텍스처 × material.color(아트 팔레트 불변) ② **공유 로더**(`sceneTextures.ts`): 종류당 Texture 1개(GPU 업로드 3회)를 잠수함·선박·기지·협곡이 공유 — clone 금지, map 지연 장착이라 **드로우 콜 증가 0**. sRGB·RepeatWrapping·mipmap·anisotropy 4(caps 하한) ③ **UV 규약**: 협곡 벽 블록별 실치수 BoxGeometry + **월드 미터 UV**(`scaleBoxUvsToWorldMeters` — 구 공유 단위박스+scale의 텍셀 밀도 불균일 해소, 배치·충돌 데이터는 계약 blocks 그대로), 바닥 240m 동일 규약, repeat = 1/tileMeters(벽 14m·바닥 18m — params 독립 조절), 금속은 0..1 UV × repeat 1 ④ **금속 공통 재질**: 잠수함 hull/액센트·선박 hull/상부·기지 독/격벽이 같은 텍스처 공유, 기능별 material 슬롯·세력 색·림·emissive 계약 불변 ⑤ **fallback 실측**: 404 주입 시 경고 로그 후 기존 단색 팔레트로 렌더 지속(화면 무결), `?quality=low`는 512 버전 로딩 확인 ⑥ normal/roughness 미도입(Lambert+flatShading 로우폴리 문법 유지 — 별도 AI 생성 맵 정렬 오류 위험 회피), KTX2/Basis 미도입(트랜스코더 의존 회피 — WebP+비압축 RGBA) ⑦ GPU 텍스처 메모리: 표준 ~12.6MB(1024×2+512×1)·저사양 ~4.2MB ⑧ 실측: 이음새 정량 0.0 + 3×3 미리보기(`docs/screenshots/tex_seam3x3_*.png`) + 동일 구도 `art_tex_{cruise,deep}.png`, verify:hud 34/34·verify:gameplay 213/213·verify:meta 110/110
  - **[ART][RENDER] 플레이어 잠수함 재모델 — 다중 뷰 레퍼런스 시트 대응 (시각 전용 — 계약 지점·실루엣 스케일·충돌 전제 불변)** — ① **형상**: 이중 도장 압력 선체(상부 청회/하부 네이비 — 로컬 Y 셰이더 분할, 재질·드로우 추가 없음) + 갑판 스트립 + 함교(철 스커트·주황 식별 패널) + 선수 조타면 쌍 + 선미 십자 안정판 + **덕트형 단일 프로펠러**(링 내부 수납 크기로 블레이드 재조정 — 후방 카메라 가독) + 모듈 부착 하드포인트 패드 3개(기능 없음 — 상위 tier 파츠가 그 위치에 겹쳐 장착) ② **재질군 3개**: 도장 선체 / 어두운 철(ironColor 신설) / 주황 액센트 — 전부 params 소유, 금속 텍스처·림·nav glow 기존 계약 유지 ③ **드로우 최소화**: 변환을 지오메트리에 bake 후 재질별 병합(mergeGeometries) — 기본형 메시 3개, 인게임 드로우 +1(55→56) ④ **불변 확인**: sternMountZ·aimCameraSocket(공식 앵커 파생)·setVisualTiers API·tier 파츠 좌표·SELF_HULL_LAYER traverse·X-ray 부착 전부 무변경, 반長 2.8·반경 0.9 실루엣 유지 ⑤ 실측: 후방 카메라 `art_model_{cruise,deep}.png`·기지 독 3/4 `model_base_t1.png`, verify:hud 34/34·verify:gameplay 213/213·verify:meta 110/110 (기지 QA `?tiers` 플래그는 production 메타 주입이 우선해 tier1로 표시 — 기존 의도 동작)
  - **[ART][FACTION] 세력 마크 시안 적용 — SVG 원본·알파 PNG·WebGL 아틀라스 (faction 판정·게임플레이 무변경)** — ① **에셋 단일 정본**: `factionMarks.ts`의 좌표(viewBox 0..100)에서 `public/marks/mark_{neutral,hostile,patrol}[_solid].{svg,png}`(정리된 대칭·선 굵기)과 `public/textures/faction_marks_512.webp`(512×256 아틀라스, 셀 128px: 열 0=사각·1=삼각·2=마름모, V 상단=디테일·하단=솔리드, 무손실 ~2.9KB)를 생성 — DOM 마스크는 같은 좌표의 인라인 data URI라 네트워크 실패 경로 없음 ② **DOM 태그**(`IdentificationTags`): 식별 상태에서 텍스트 기호 대신 CSS mask 마크(`background: currentColor` — 색은 보조), 90m 초과(작은 표시 크기)는 솔리드 실루엣(`artDirection.factionMarks.solidBeyondMeters`), **미식별은 기존 ◇ 규칙 그대로**(마크 조기 노출 없음), CSS mask 미지원 → 기존 기호 fallback ③ **방향 마커**(`GuardDirectionIndicator`): 경비 마름모 솔리드 소형 버전 + 기존 화살표·거리 유지 ④ **선박 데칼**(`CargoShipVisual`): 마크를 아틀라스 UV plane + `alphaTest 0.5`(불투명 패스 — 투명 정렬 문제 없음, 선체 +0.02m로 z-fighting 회피, 원거리 디테일은 mipmap 자연 감쇠)로 교체, 아틀라스 미로딩·실패 시 기존 기하 마크 fallback, 드로우·재질 수 불변 ⑤ 실측: bdemo 4상태(미식별◇/중립 사각/적대 삼각/경비 마름모) + 회색조 형태 구분 + production 선박 데칼 + 방향 마커 — `docs/screenshots/marks_*.png`, verify:hud 34/34·gameplay 213/213·meta 110/110·sprint-b 통과
  - **[ART][RENDER] 수심 확장·암벽 셸·선수 탐조등·프로펠러 wake (아트 타깃 대응 — 게임플레이 판정·수평 통로·오브젝트 관계 불변)** — ① **수심 확장(INT-RENDER-013 사후 확인 요청)**: floorY -6→-20(수직 수역 18→32m ×1.78, 수면 12 유지), 벽·기둥 sizeY +14로 **상단 절대 높이 보존** — 잠항 상·하한/충돌/salvage/환경 배치 전부 레이아웃 파생이라 자동 추종(실측: 하한 -19.0·상한 11.0, 해저 이탈·수면 돌출 없음) ② **심도 그레이딩**(`artDirection.depthGrading` stops): 수면 0~20%/중간 20~55%/심해 55~85%/최심부 85~100%(렌더 전용 — 탐지 3층 계약 무관), 안개 색·거리 + 방향광·반구광 감광 + 부유물 불투명을 stops 선형 보간(경계 급변 없음) ③ **암벽 시각 셸**(`RockShell.ts`): 충돌 박스는 그대로, 렌더 메시만 서브디비전 박스+위치 기반 결정적 변위(기울어진 상단·잘린 모서리·층리 선반·비정형 면, 패밀리 4종) — 시각 오차 ≤0.7m·상단 아래 방향만, 블록당 메시 1(드로우 불변)·재질 공유 1. 해저는 완만 굴곡 평면(±0.35m 시각 전용) ④ **선수 탐조등**: 실광원 SpotLight **1개**(§12.2 예약 슬롯, 그림자 없음, #ffd9a8·26m·반각 21°·penumbra 0.55) + 렌즈 2점(Points 1드로우) + 가산 빔 콘 2개(꼭짓점 색 페이드·depthWrite false — 네온 아님), 조준 카메라에서 광원 유지(layers.enableAll)·QA `?headlight=0` ⑤ **프로펠러 wake**(`PropellerWake.ts`): InstancedMesh 풀 1드로우, 발생률 6~80/s·수명 0.6~1.4s·크기 0.03~0.12m 전부 |속도|/최고속 비례, 후진 시 사출 반전, 원판 중심 사출 + 회전 블러 디스크(35%+에서 점진) ⑥ **품질 3단계**(`?quality=low|high`, 기본 medium): low = 빔 콘 off·기포 60·wake 단축·블러 off(+기존 저사양 항목) / high = 부유물 190·기포 170 — 실제 광원 수는 전 단계 동일 ⑦ 실측: 드로우 56→65(순항)·tri 12980→17296, 평균 FPS 11.5→11.3(전) vs 11.3~11.6(후) — 회귀 없음(swiftshader), verify:gameplay 213/213·hud 34/34·meta 110/110·sprint-a/b 통과, 스크린샷 `deepwater_*.png`
- **진행 중:** 없음
- **다음 작업:** INT-RENDER-012 리드 확인(DEBRIEF 자동 완료 제거 승인) / **INT-RENDER-013 리드 확인(수심 확장 레이아웃 변경 — 사후 승인)** / 게임플레이 DetectionSystem·TrackingStateSource 도착 시 attach 2줄 배선 + production 재실측 / combat params 확정 시 피해·침수·실패 화면 실데이터 실측
- **차단 문제:** 게임플레이 B 판정 미구현 — `ShipIdentificationSource`·B6 소스 부재로 production 태그·호위 표시는 0건(가짜 데이터 없음), 경비 스폰은 위치 전략·AI 팩토리 미연결로 차단. 표시 규칙은 fixture(`?bdemo=1`) UI 단위 검증으로만 확인됨
- **변경된 계약:** 없음 (`src/contracts/*` 미수정 — BaseScreenPort v2·officialParams 소비만). 조립부·게임플레이 최소 변경 2건은 INT-RENDER-010 ⑤ 확인 요청
- **통합 주의사항:** 조준경은 `aimModeChanged`만 소비(홀드→토글 개편에도 렌더 무변경). 어뢰 소비 인터페이스(`TorpedoStateSource`)는 StraightRunTorpedoSystem이 구조적 충족. 환경 밀도는 renderVisualParams.environment가 상한 — 보스 전장 데코는 '추가'가 아니라 '이동'(11차 결의 1). 반투명 renderOrder 서열: 블롭1<X-ray2<수면3=기포3<폭발4<보조선5. 신규 모듈 전부 dispose 일괄 관리(geometry·material·InstancedMesh). **자기 선체 layer 1은 조준 카메라 전용 규약 — 다른 시스템이 layer 1을 쓰면 조준 중 함께 사라진다.** 출항 진입점은 기지 화면 출항 버튼(BaseScreenPort.launchSortie) 하나 — HUD `launchSortie` 재주입·자동 출항 재도입 금지(INT-RENDER-009 ③). **게임은 기지(BASE)에서 시작한다** — 해역 전제 검증·테스트는 출항 버튼 클릭을 선행해야 한다(verify-hud 도입부 참조). z-index 서열: 준비 화면 25 < 조준경 30 < 재화 HUD 32 < HUD 버튼 90. QA 플래그: `?xray` `?shipdemo` `?lookup` `?bossSpike=1(&bossMotion=b)` `?base=1` `?tiers=h,w` `?aimdemo=1` `?econdemo=1|savefail` `?quality=low`(저사양 연출 축소). 반투명 renderOrder 3층에 부유물·항법등 글로우 추가(수면·기포와 동층 — 폭발4·보조선5 아래). 보조 환경광은 HemisphereLight — AmbientLight 재도입 시 예산 초과 주의
- **완료(추가): [M0~M2 그래픽스]** ① **M0 GPU 실측 준비**: `docs/measurements/M0_gpu_baseline.md` — 측정 절차(3품질×3시나리오)·실기기 표(**미실측 공란 — 수치 미작성 원칙**)·정적 예산·swiftshader 참고치(GPU 아님 명시)·보스 전장 밀도 기준선(§E — M1 레이아웃 대기). **실기기 실측은 이 환경(원격 컨테이너, swiftshader 전용)에서 불가 — 빌드·툴 담당과 목표 노트북 2대 확보 시 수행** ② **소나 스코프**(`SonarScope.ts` — M2 최소 시각 소비자): 좌하단 원형 다이제틱 계기(화면 높이 18.0% 실측), 기존 정본만 소비 — DetectionHudView(테두리 황·unwired 빗금+'계기 미연결')·TrackingStateSource(attack→적)·noiseChanged(자기 소음 그레인·링)·ShipWorldSource(패시브 소음원 방위·번짐 — 세력 미표시, B2 조기 노출 방지). 액티브 핑은 `SonarPingSource` 미주입=미표시(INT-RENDER-014). 캔버스 15Hz 상한·WebGL 드로우 0. BASE에서 숨김 ③ **보스 5상태 표현**(M1 최소 시각 소비자): notifyWeakpointHit(백-주황 플래시+스케일 펄스)/notifyNormalHit(짧은 회청 플래시)/단계 전환(색+**전신 진폭 서지+백색 플래시** — low 품질 색 단독 의존 없음)/약점 활성·비활성 — 전부 통지 기반(판정 계산 0), `?bossSpike=1` 검수 키 6/7 ④ 분절 스파이크는 M0 tip에서 정상 유영 재확인(4인 위협감 판정 대기·B안 전환 준비 유지)
- **마지막 업데이트:** **origin/dev(7eb8d5c — C 런타임 마감) 병합 + 통합 재검증 완료** (feat/render `a542730`). 자동: gameplay 242/242·meta 128/128·tooling 26/26·hud 34/34·sprint-a/b·sprint-c 23/23(C9 17필드 확정). 브라우저 생존 루프 실측 완주: 뇌격→경비 스폰→발각→목표 심도 폭뢰 기폭(투하 11.98→기폭 목표 = 플레이어 심도 11.0)→near 침수(첫 severity 0.10 = 승인값)→침수 잠식 파괴(120→0)→실패 화면 confirm→BASE→재출항 reset(선체/침수/salvage/탐지 전부 초기화). 4개 심도 탐지 보정·품질 3단계·텍스처 404 fallback·콘솔 오류 0. INT-RENDER-013 조건부 승인 검증 조건 이행 — 상세는 INTEGRATION_NOTES INT-RENDER-013 표
- **담당 브랜치:** `feat/render` (C 리드 계약 `d689628` 병합 기반)

## 빌드·툴

- **완료:** D1~D2 — Vite+TS 프로젝트, 성능 오버레이(FPS·평균·최소·로딩·모드·렌더러), LoadingTimer, GateMetricRecorder(JSON 다운로드), check-build-size(15MB 게이트), print-project-status, CI 워크플로, PR·이슈 템플릿 / **단계 0 잔여분** — Node 버전 고정(.nvmrc `22.22.2` + engines `>=22 <23` + .npmrc engine-strict, CI는 node-version-file로 일원화), 잠금 파일 기준 버전 재현 확인(three 0.185.1 · vite 8.2.0 · typescript 7.0.2), GitHub Pages 배포 워크플로(`.github/workflows/deploy.yml` — main 푸시·수동 실행, 배포 전 typecheck·build·check:size 강제, `docs/DEPLOY.md`), JSON 파라미터 핫리로드(Vite HMR — 리로드·재빌드 없이 반영, 범위 밖 값은 기존 validateParams가 거부·이전 값 유지, `loadParams()` 인터페이스 불변 + `onParamsReloaded()` 구독 추가), 게이트 기록에 초당 FPS 시계열(`fpsSamples`)·빌드 모드 추가(G1 구간별 로그 — 개인정보·고유 식별자 없음), Web Audio 최소 배관(`src/audio/WebAudioSystem.ts` — AudioContext unlock·마스터 버스·패너 연결·카메라 기준 리스너까지만, 판정 타이머 없음)
- **완료(추가):** 조작 HUD — 조작 안내 패널(좌측, `controlsConfig.ts` 단일 소스), H 토글(안내+버튼 동시 숨김·복원), Pointer Lock(캔버스 클릭 진입 → Esc 해제 시 GameLoop 정지로 일시정지 + 재진입 안내 오버레이, 진입 직후 250ms 입력 무시), 우클릭 컨텍스트 메뉴 방지, PC 화면 조준·발사 버튼(우하단 반투명 소형, 마우스 조준 3회 이상 시 존재감 축소), 입력 계측(`InputTelemetry` — 마우스/버튼별 조준·발사 횟수, Pointer Lock 진입·해제, 첫 발사 요청 시각 → 게이트 기록 JSON `input` 구역 합류, 개발 콘솔 `__deepDiveInput()`), HUD 파라미터 `params/ui.json`(툴링 소유 `uiParams.ts`에서 검증·핫리로드)
- **완료(추가 2):** HUD ↔ 실제 AimSystem 연결 — 게임플레이 브랜치(어뢰 전투 `10ef604`)·리드 계약(INT-CORE-002 `b69890b`)을 이 브랜치에 병합. 임시 `CombatIntentSink` 삭제, 화면 조준·발사 버튼이 composition root에서 주입받은 `gameplay.aim`(계약 `AimSystem`)의 `beginAim()/endAim()/fireTorpedo()`를 직접 호출(마우스 경로 `MouseCombatInput`과 같은 인스턴스·같은 판정). 조준 버튼 활성 표시 = `aimModeChanged` 구독(로컬 상태 아님 — 잠망경 심도 거부·자동 해제 반영). 발사 버튼 = `torpedo.remaining`·`reloadRemainingSeconds` 200ms 폴링 + `torpedoFired` 구독으로 잔량·재장전 표시·비활성화. 캔버스 마우스는 **게이트키퍼**로 재편: 전투 클릭은 window의 MouseCombatInput으로 통과(HUD가 aim 이중 호출 금지), 잠금 진입 클릭·진입 직후 250ms·비잠금·일시정지 클릭은 stopPropagation으로 소비(이중 발사·유령 발사 방지). 잠금 해제 시 `endAim()` 보장 후 일시정지
- **진행 중:** 없음
- **다음 작업:** Pages 활성화 후 첫 배포 URL 확인, D13~14 사운드 배관 단계에서 WebAudioSystem 조립(리드 승인 경유) + `depthChargeEnteredWater`/`aimModeChanged` 오디오 연동
- **차단 문제:** 배포 URL 미확보 — 저장소 관리자가 Settings→Pages에서 Source를 "GitHub Actions"로 1회 설정 후 워크플로 실행 필요 (`docs/DEPLOY.md`). 이 작업 환경에는 해당 권한·인증 정보 없음
- **변경된 계약:** 없음 — 계약 파일 직접 수정 없음 (INT-CORE-002의 `AimSystem`·`aimModeChanged`를 소비만). INT-TOOL-001 승인 완료(리드 D+5). INT-TOOL-002(HUD 조립 선반영)·INT-TOOL-004(HUD 전투 배선 선반영) 확인 대기, INT-TOOL-003(구 #004 요청 이벤트 3종)은 **폐기**
- **통합 주의사항:** ① **전투 마우스 입력의 소유자는 게임플레이(MouseCombatInput)** — HUD는 캔버스 mousedown을 계측+게이트키핑만 하고 aim을 호출하지 않는다. 전투로 가면 안 되는 클릭(잠금 진입·진입 직후 250ms·비잠금·일시정지)은 HUD가 stopPropagation으로 소비하므로, MouseCombatInput을 window보다 안쪽(캔버스 자체)에 부착하도록 바꾸면 이 차단이 깨진다 — 부착 지점 변경 시 툴링과 협의 필요 ② 일시정지(잠금 해제)는 GameLoop 정지 방식 — 게임플레이 update가 멈추므로 HUD가 잠금 해제 시 `aim.endAim()`을 보장 호출한다. 일시정지 중 쌓일 수 있는 클릭은 오버레이가 소비 ③ Esc·H는 HUD가 선점(Esc=잠금 해제·일시정지, 조준 취소 키 아님) — 새 키 추가 시 `controlsConfig.ts` 단일 소스에 등록 ④ 개발 모드 params/*.json(ui.json 포함) 저장 시 리로드 없이 반영 ⑤ WebAudioSystem은 미조립 유지(D13~14 조립 — 리드 D+5 결정) ⑥ PC 화면 버튼은 INT-CORE-002로 리드 승인 확인됨(별도 전투 시스템 금지 계약)
- **완료(추가 3):** 최신 리드(`c4841cf` — CanyonLayout 단일 데이터·카메라 리센터 규약)·게임플레이(`b7faf44` — CargoShipSystem·INT-CORE-003 포즈/화물선 계약) 병합 후 HUD 재검증 — Game.ts 충돌 없음(병합 양측 모두 미수정, 기존 배선 그대로 유효), `torpedoHit` 이벤트 추가에도 EventBus 타입 무영향, `poseSource`의 `SubmarinePoseSource` 계약 전환과 구조 호환 확인. HUD 헤드리스 33/33 + 게임플레이 결정적 검증 71/71 통과(버튼·마우스 실발사, 재장전·잔탄 동등, 중복 발사 없음)
- **완료(추가 4):** 입력 모드 2원화 + 실브라우저 최종 검증 — 게임플레이 `c46c937`(공유 CanyonLayout 소비, `gameplay.layout` 노출) 병합. **발견 문제**: Esc로 Pointer Lock 해제 시 무조건 일시정지+전체 오버레이여서 '화면 버튼 방식으로 계속' 경로가 없었음(잠금 상태에선 커서가 없어 DOM 버튼 클릭 자체가 불가 — 버튼 모드가 사실상 차단). **수정(최소 변경)**: 일시정지 오버레이에 '마우스 모드로 계속(잠금 재진입)' / '화면 버튼으로 계속(잠금 없음 — resumeWithoutLock)' 선택 버튼 추가. '조준 버튼 = 잠금 진입 겸용' 해석은 모드 선택 목표 우선으로 폐기(INT-TOOL-005, 리드 확인 대기). 검증: HUD 33/33 + 시나리오 A(마우스)/B(화면 버튼)/C(모드 전환·상태 공유·잔탄 0 비활성) 20/20 + 결정적 검증 75/75, 스크린샷 4장
- **완료(PvE 전환 — 회의록 10·11 위임분):** ① **세이브 시스템** `src/meta/save/` — schemaVersion(v1)·이중 슬롯(current+직전 정상 backup)·버전별 마이그레이션 틀·복구 경로(current 손상→백업→안전 초기 상태, 전 경로 부팅 불차단)·체크섬/암호화 없음 [확정], 저장 범위 = 크레딧·희귀 부품·업그레이드 단계·장착 장비·진행·안내 플래그, 문서 `docs/SAVE_SYSTEM.md` ② **업그레이드 시뮬레이터** — `params/upgrades.json`(7항목, R-P2 임시값 선진행) + 공용 순수 계산기 `src/tools/upgradeMath.ts`(합연산: 최종값 = 기준값 × (1+보정 합) — 시뮬레이터·게임플레이 공용, 복제 금지) + 개발 오버레이 패널(단계 선택·기준값(paramRef 해석/수동 입력)·보정 합·최종값 표시·JSON 복사, params 원본 불변, 핫리로드) ③ **신 스코프 가드** `scripts/check-scope-guard.mjs` — 업그레이드 ≤7·장비 ≤4·보스 ≤1·해역 ≤1, 기본 경고/CI --strict 실패 + 로더 차원 8개 거부 ④ **Keyboard Lock** `src/tools/KeyboardLockManager.ts` — 크로미움 전체화면에서 lock 요청(Ctrl/W/Shift), 미지원(파이어폭스)·거부 전부 무예외 폴백, 창 모드·미지원 시 병행 키 E 1회 안내(세이브 영속 플래그), Ctrl+W 차단 비보장 전제 ⑤ **오디오 배관** — `AudioCueRouter`(조준경 진입·해제음 aimModeChanged 구독 완료, 크레딧·희귀 부품·기지 전환 큐는 이벤트 계약 제안 대기), WebAudioSystem 음악 버스·침묵 전환 배관(호출 판정은 보스 상태 머신 소유) ⑥ **검증** — `verify:tooling` 26항목(세이브 10·업그레이드 5·가드 3·KeyboardLock 5·오디오 2+미지원 1), HUD 33항목 러너 저장소 반입(`scripts/verify-hud.mjs` — 스크래치패드 의존 해소), CI에 스코프 가드·결정적 검증 단계 추가
- **완료(스프린트 A — 창 4 범위, 회의 14 결의 2):** ① **`params/aiming.json` + 검증기** — yaw 15 / 상향 10 / 하향 15 / 감도 0.5, 상·하향 모두 양수 크기 저장(부호는 `aimingMath.pitchLimitsDegrees()` 단일 지점에서만 적용 — 이중 부호 오류 차단), 음수·0·범위 밖·`aimReturnBehavior` 전부 로드 거부(보완분 결의 8·9). 카메라·게임플레이 공용 로더 `src/tools/aimingParams.ts` ② **공식 경제·장비 params 구조** — upgrades.json을 단계 배열 구조(단계 상한·단계별 가격·희귀 부품·효과 배율)로 전환, equipment.json 신설(4종 가격·희귀 부품·슬롯). 검증기 `economyMath`가 7항목·4종 초과·음수 가격·미존재 paramRef·단계 배열 누락·계약 밖 id를 거부. **수치는 전부 null = 기획 경제 수치표 미도착 — 임의 값 발명 없음** ③ **계산 정본 일원화** — 툴링 중복 `upgradeMath` 삭제, 시뮬레이터가 리드 `src/meta/upgradeMath.ts` 직접 사용(INT-CORE-007 이행). 시뮬레이터에 총비용·'보스까지 출항 4~6회' 판정 추가(미확정 시 판정 보류) ④ **저장 실패 주입 어댑터** `FaultInjectingStorage`(쓰기·백업 쓰기·quota 유사·직렬화 4종, 프로덕션 경로 미경유) + **원자적 변경·저장** `atomicSave`(스냅샷→변경→저장→실패 시 전부 롤백, `saveFailed`/`rejected` 타입 분리, 고정 안내 문구·내부 예외 비노출) ⑤ **스프린트 A 러너** `npm run verify:sprint-a` — A1~A8 + A5-T1~T6 + 문서 회귀(§8) 자동 판정 24항목, 타 창 병합 대기 항목 5건은 '수동 확인' 구역으로 분리 출력(가짜 초록불 금지) ⑥ 저장 시점 5종 개정 문서화(`docs/SAVE_SYSTEM.md`), 인수 기준 문서 `docs/SPRINT_A_ACCEPTANCE.md` 신설
- **완료(A8 경제 수치 승인 반영):** 사용자 승인으로 미확정 필드를 전부 닫았다. ① **`params/upgrades.json` null 105→0** — 7항목 공통 크레딧 `[100,160,240,340,460]`·희귀 부품 `[0,0,0,1,2]`, `effectBonus`는 **단계별 증분** 저장(A군 `maxSpeed`·`turnRate`·`reloadSpeed`·`sonarRange` = 누적 5/10/16/22/30%, B군 `hullIntegrity`·`maxDepth`·`torpedoDamage` = 누적 10/20/32/44/60%) ② **`params/equipment.json` null 9→0** — 슬롯 용량 2, `standardTorpedo` 시작 보유·가격 0, `fastTorpedo` 260, `heavyTorpedo` 420+희귀 1, `decoy` 340+희귀 1. `performance`는 `provisionalEquipment` 런타임 값 그대로 이관(밸런스 변경 아님) ③ **`params/economy.json` 신설** — 손실률 0.5(D5: 게임플레이 0.4/메타 0.5 불일치를 6차 결의 7 명시값으로 통일), 회수 반경 6m, 드롭 테이블 4종, `salvageSpawns` 3건(`salvage-3`의 `rarePartId: rare-alloy-core` = MVP 유일 희귀 부품 경로, 확률 아닌 **확정 배치**. 좌표는 월드·그래픽스 소유라 `spawnId`만 정의) ④ **`params/cargo.json` 신설** — `provisionalCargo` 값 그대로 이관 ⑤ **공식 로더** `src/tools/economyParams.ts` — 4종을 검증 통과 형태로만 내보내는 단일 진입점(+HMR, 검증 실패 시 기존 값 유지). provisional 모듈의 대체 공급원 ⑥ **검증기 확장** — 장비 `slotCost`·`startingItem`·`performance` 스키마, 종류별 필수 성능 키, 희귀 부품·슬롯 정수 강제, 슬롯 용량 2 고정, 시작 보유 정확히 1종·가격 0 ⑦ **회귀 차단 검증** — `verify:sprint-a` 자동 **29/29**(A8-null0·A8-approved·A8-equipmentRules·A8-income 신설). 출항 최대 수입 245(수송선 120+해저 125)·희귀 1, 보스 준비 1200크레딧 → **4.9회**로 목표 4~6회 안. 소비 가능 기준 커밋 `2a89400`
- **차단 문제(A 통과 불가 — 툴링 소유 밖):** ① **§8 문서 회귀 7건** — '전 심도 조준(구 심도 전용 규칙 폐기)/에서만'이 게임플레이 코드 2곳(`PeriscopeAimSystem.ts:9`, `verifyGameplay.ts:670`)과 상태 문서 5곳(CURRENT_STATUS 게임플레이 구역, PROJECT_STATE ×2, NEXT_SPRINT, D10_INTEGRATION_CHECKLIST)에 잔존. 7차 결의 1-⑦ 미이행 → 해당 창이 제거해야 A 통과 ② **A8 소비 측 배선 5건** — params 측 이관은 끝났고(미확정 0) 남은 것은 production의 provisional import다: `src/core/Game.ts:26`·`src/meta/provisionalEconomy.ts`(리드), `src/systems/CargoShipSystem.ts:37`·`EquipmentSystem.ts:34`·`economy/EconomySystem.ts:27`·`economy/UpgradePurchaseSystem.ts:30`(게임플레이). **툴링 창에서 수정 불가** — `loadEconomyParams()` 소비로 교체하면 되고 값이 동일해 동작 변화가 없다(손실률 0.4→0.5만 D5 승인 반영). `verify:sprint-a`의 `A8-migration-consumers`가 잔여 목록을 계속 출력한다 ③ **기준값 없는 업그레이드 4항목** — `hullIntegrity`·`maxDepth`·`sonarRange`는 base params도 소비 코드도 없고, `torpedoDamage`는 소비 후보(`EquipmentSystem.setUpgradeModifiers`)가 production 조립에 미배선. **기준값을 추정해 입력하지 않았다** — 승인된 배율만 정의하고 `paramRef`는 비워 둠. 상세: INTEGRATION_NOTES INT-TOOL-008
- **완료(스프린트 B 선행개발 — 15차 결의 2 창 4 범위):** ⚠ **B 미발효 상태의 선행개발**이다(15차 결의 1: B 발효 조건 = A 통합 PR 병합). 리드 B 계약 `1378834`(A_STACK `8f40117` 포함) 병합, 충돌 0건. ① **`economy.json` B 확장** — `factionRewards`(세력 3종 보상 **정책**만. 세력→드롭 테이블 매핑 정본은 계약 `FACTION_RULES`라 복제하지 않고 검증기가 **기계적으로 대조**한다), `highValueTransport`·`guardSpawn`(스키마만, 수치 전부 null). **A 경제 수치 무변경** ② **null과 0의 구조적 구분** — `none`=확정 무보상(0을 명시적으로 실음) / `pending`=공식 결정 없음(수치 필드를 가질 수 없음). pending에 0을 적으면 로드 거부 — 미정이 무보상 확정으로 위장되는 것을 막는다 ③ **검증기 거부 규칙 11종** — 미존재 테이블·음수 보상·계약 불일치(양방향)·계약 밖 세력 키·배율 1 이하(12차 B6 종료 조건에서 파생된 구조 조건)·범위 밖·스폰 영역 공집합 등 ④ **B7 측정 인프라** `src/tools/b7/` — 스키마 검증(분류 정합성 + 개인정보 거부), 수집기(`IdentificationLogSink` 구현 — 세션 저장·복원·거부 보존·재심사 대체), 집계(제외 3종이 분모에서 빠짐), 판정(20%·5% 임계 + 표본 5명·50회 미달 시 `INSUFFICIENT_SAMPLE`), CSV·JSON export, 결정적 픽스처 4종 ⑤ **`npm run verify:sprint-b` 신설** — 상태 5종 분리(pass/fail/manual/**blocked**/pending). 자동 **17/17 통과** · 보류 5 · 차단 2 · 대기 4 ⑥ 문서 5종: `SPRINT_B_ACCEPTANCE`·`SPRINT_B_TEST_PLAN`·`B7_IDENTIFICATION_STUDY`·`SPRINT_B_B6_PROPOSAL`(DRAFT)·`ECONOMY_PARAMS_SCHEMA`
- **차단 문제(B — 툴링 소유 밖):** ① **`B5_BLOCKED_NO_DESTROYER_IMPLEMENTATION`** — 저장소에 `DestroyerAI` 계약은 있으나 production 구현체가 없다(`implements DestroyerAI` 정적 스캔 0건; `verifyMeta.ts`의 것은 테스트 대역). B5 조건이 '기존 구축함 AI 재사용'이므로 원본 없이는 성립 불가. **빈 어댑터를 통과로 만들지 않았다.** 계약 `guard.ts`대로 구축함 AI가 C 항목이면 B1~B5 통과가 C 착수 방아쇠인데 B5가 C 산출물을 기다리는 **순서 문제**가 생긴다 — 리드 판단 필요 ② **B1·B2·B4 게임플레이·그래픽스 미병합** — 중립 선박 정의 0건(production은 `hostile`만 2지점), `ShipIdentificationSource` 구현 0건, `neutralShipHit` 발행 0건. 리드의 수신 경계·스폰 배선은 이미 병합돼 발행만 시작하면 경로가 이어진다 ③ **경비함 스폰 수치 부재** — `guardSpawn` 5항목 전부 미확정. 회의록·저장소에 공식 수치가 없고 승계할 기존 수상함 스폰 규칙도 없어 **발명하지 않았다** ④ **B6 배율 미확정** — 12차 '배율은 튜닝표' 항목. 제안서에서 발견한 핵심: **배율보다 등장 빈도가 보스 준비 곡선의 지배 변수**이며, 매 출항 등장 시 어떤 배율이든 4~6회 목표를 깬다. 호위 이탈 거리는 근거 실측이 없어 제안 수치조차 내지 않았다. 상세: INTEGRATION_NOTES INT-TOOL-010
- **완료(스프린트 C — C9 params·검증, 인계표 '빌드·툴 창'):** 리드 인계 계약 `d689628` 병합(충돌 0건). ① **`params/combat.json` C9 4블록** — 선체 3(`baseMaxHull`·`damagedRatioThreshold`·`criticalRatioThreshold`) / 폭뢰 5(`directRadiusMeters`·`nearRadiusMeters`·`directDamage`·`nearDamage`·`dropCooldownSeconds`) / 침수 5(`minorThreshold`·`majorThreshold`·`catastrophicThreshold`·`hullDamagePerSecondAtFull`·`spreadPerSecond`) / 탐지 2(`distanceFalloff`·`gaugeDecayPerSecond`). 필드명은 계약(`survival.ts`·`detection.ts`) property와 1:1이며 새 이름을 만들지 않았다. **전 15항목 `value: null`** — 0·임시 숫자·provisional fallback 없음 ② **검증기·로더** `src/tools/combatParams.ts`·`combatParamsLoader.ts` — null 통과·키 누락 거부(생략과 null 구분), NaN·Infinity·문자열 숫자·boolean·음수 거부, 계약 밖 필드 거부, 경계 관계는 **양쪽 값이 다 있을 때만** 검사(`damaged>critical`·`minor<major<catastrophic`·`direct<near`·`full<zero`), 공식 문서에 없는 범위 미강제. hull·flooding은 전량 확정 시에만 주입하고 폭뢰는 계약이 필드별 null을 허용하므로 부분 확정을 전달 ③ **압력 차단** — `safeDepthY` 등 5종이 C9 블록에 들어오면 로드 거부(DECISIONS C-8) ④ **`npm run verify:sprint-c` 신설** — 자동 **20/20**, 보류 4 · 대기 1. 계약 존재·단일 피해 경로·정산 화이트리스트·composition·params·A/B 회귀를 관측하고 마지막에 상태 플래그와 blockers를 출력한다 ⑤ 테스트 픽스처(`__verification__/combatParamsFixture.ts`)를 production JSON과 분리하고, production import 0건을 러너가 검사
- **C 상태(툴링 창 기준):** `C_CONTRACT_COMPLETE=true` · `C_TOOLING_READY=true` · `C_GAMEPLAY_COMPOSITION_PRESENT=false` · `C_GRAPHICS_COMPOSITION_PRESENT=false` · `C_COMBAT_PARAMS_DEFINED=false` · `C_RUNTIME_WIRED=false` · `C_BROWSER_EMPIRICAL_COMPLETE=false` · **`C_FINAL_COMPLETE=false`**. runtime 미배선 상태를 C 완료로 판정하지 않는다 — `C_FINAL_COMPLETE`는 배선과 브라우저 실측이 둘 다 참일 때만 true가 된다
- **차단 문제(C — 툴링 소유 밖):** ① **C9 공식 수치 15/15 미확정** — 기획 수치표 대기. 임의 값을 채우지 않았고 검증기가 미확정 목록을 매 실행 출력한다 ② **게임플레이 미병합** — `attachPlayerAliveSource` 실제 호출 0건(조립부 경계는 준비됨) ③ **그래픽스 미병합** — `SurvivalReadModel`·`DebriefReadModel` 렌더 소비 0건 ④ **브라우저 생존 루프 실측 0회** — params 미확정 + HUD·DEBRIEF 미병합으로 시나리오 자체가 성립하지 않음. ①~④는 전부 `manual`/`pending`으로 분류돼 종료 코드에 반영되지 않는다(툴링 실패와 구분)
- **마지막 업데이트:** 스프린트 C C9 combat params 스키마·로더·`verify:sprint-c` 신설 (자동 20/20, 전 필드 미확정 유지). 리드 인계 계약 `d689628` 병합 기준. A·B 회귀 유지 (`verify:sprint-a` 30/30 · `verify:sprint-b` 23/23)
- **담당 브랜치:** `claude/deep-dive-tooling-phase-0-cj6c49` (`feat/tooling`의 세션 사본)

## 기획

- **완료:** params 4종 초기 테스트값 등록 (movement/detection/combat/crew — 마스터 플랜 §11.2 튜닝표 값 그대로)
- **진행 중:** 수치표 v1 검토 (D+3 절대 마감 — 전체 병목 R7)
- **다음 작업:** D+5 회색 박스 리뷰에서 관성 1차 튜닝, TUNING_LOG 기록 개시
- **차단 문제:** 없음
- **변경된 계약:** 없음
- **통합 주의사항:** 수치 변경 커밋에는 `[Gx]` 태그 + `docs/templates/TUNING_LOG.md` 갱신 필수. range 밖 값은 로드 시 거부됨
- **마지막 업데이트:** D2 (초기화)
- **담당 브랜치:** (미생성 — `feat/params-*` 또는 dev 직접 커밋 규칙은 리드와 협의)

---

## 전체 마일스톤 현황

| 단계 | 기간 | 상태 |
|---|---|---|
| 0. 환경 구축 | D1~D2 | ✅ 저장소·골격·계측·핫리로드·배포 워크플로 완료 / ⚠ 배포 URL 미확보 (관리자 Pages 1회 설정 대기 — docs/DEPLOY.md) |
| 1. 회색 박스 | D3~D5 | ✅ **D+5 통합 완료** — 조작·심도·카메라·협곡 블록아웃·X-ray 스파이크(성공) 통합, 전 검사 통과. 잔여: 레벨 디자인 정식 블록아웃(엄폐 3곳+) 수신 시 임시 협곡 교체, 팀 전원 조작 테스트·관성 1차 튜닝(§11 판단 기준 1차 적용)은 전사 리뷰에서 |
| 2. 코어 전투 루프 | D6~D9 | 🔄 선행분 브랜치 구현 완료 (어뢰·화물선·조작 개편·공유 레이아웃 — 구 차단 8건 중 6건 해소, NEXT_SPRINT §4) — **dev 병합·배선만 잔여**. 탐지·구축함·폭뢰·내구도는 백로그 |
| 3. 은신·탐지 | D10~D12 | 대기 |
| 4. 연출 적용 | D13~D14 | 대기 |
| 5. 통합·게이트 준비 | D15 | 대기 |

---

## D+5 통합 검증 결과 (통합 리드 기록)

- **정적 검사:** `npm ci`·`npm run typecheck`·`npm run build` 통과, `npm run check:size` 통과 (dist 0.53MB / 상한 15MB, 3.5%)
- **게임플레이 결정적 검증:** `node src/systems/__verification__/run.mjs` — 21/21 통과 (params 이관 후 재실행 확인)
- **브라우저 자동화 검증 (Vite dev 서버 + Chromium):** 19/19 통과
  - 기본 실행: WebGL 캔버스·회색 협곡·잠수함 대체 오브젝트·성능 오버레이(FPS/평균/최소/로딩/모드/렌더러) 표시, 콘솔 오류 0건
  - 조작: W 전진 / S 감속 정지 / A·D 선회 / 무입력 관성 감속 정지 / Shift·Ctrl 심도 3층(경계 초과 무시) / 이동 중 카메라 추적 / 좌클릭 드래그 카메라 회전 / Space 리센터(회전 전 시점 복귀 확인) / 창 blur 후 키 고착 없음
  - X-ray: `?xray=1`로 스파이크 장착 로그·반투명 선체 내 수위 판독(스크린샷)·수위 순환 데모 작동, 기본·X-ray 장면 모두 콘솔 오류 0건
  - 계측·HMR: FPS·로딩 계측 작동(헤드리스 SW 렌더링 환경으로 FPS 절대값은 참고치), movement.json 유효 변경 → "핫리로드 적용 완료", 범위 밖 값(9.9) → "핫리로드 거부 — 기존 값 유지" 확인 후 원복
- **미검증(환경 제약):** GitHub Pages 실제 배포 URL(관리자 Pages 설정 대기), 실기기 60fps(내장그래픽 노트북 — 게이트 리뷰 항목)

---

## D+5 리뷰 스프린트 결산 — 역할별 최신 브랜치·커밋 상태 표 (문서 정리 시점 기준)

> 기준 회의: `docs/meetings/07_d5_playtest_review.md`·`08_minor_input_rules.md`.
> 스프린트 결산·백로그: `docs/NEXT_SPRINT.md`. 계약별 미결·해결:
> `docs/INTEGRATION_NOTES.md` 총괄표. D+10 통합 절차·검증:
> `docs/D10_INTEGRATION_CHECKLIST.md`. 각 역할 구역 본문은 해당 브랜치
> 쪽이 최신이다 — dev 병합 시 이 표와 함께 갱신할 것.

### 역할별 최신 커밋 상태 표

| 역할 | 브랜치 | 최신 커밋 | 구현 완료 | 자동 검증 | 수동 검증 | 통합 대기 사항 |
|---|---|---|---|---|---|---|
| 개발 리드 | `claude/deep-dive-core-lead-uyg77p` | `c4841cf` | INT-CORE-002(축 규약 `conventions.ts`·AimSystem·aimModeChanged·공회전 파라미터) / INT-CORE-003(SubmarinePoseSource·CargoShipStateSource·torpedoHit·layout 계약·파라미터 단일 소스) / INT-CORE-004(`src/world/STARTING_CANYON_LAYOUT`·벽 높이 확정·리센터 규약 위치/시선 분리) | typecheck·build·check:size, 게임플레이 검증 21/21 유지 | — (계약·데이터 변경) | dev 병합 실행 + Game.ts 배선 채택(INT-TOOL-002·004, INT-RENDER-005) + INT-GAME-004·006·007 결정 |
| 게임플레이 | `claude/submarine-controls-depth-3wi424` | `c46c937` | W/S 전진·후진, Shift/Ctrl 연속 상승·하강, 3단계 심도 구간 판정, 정적 충돌·밀어내기, AimSystem 구현(잠망경 전용 조준·좌클릭 발사), 직선 어뢰, CargoShipSystem(직선 왕복·torpedoHit 1회·sinkProgress·removed), 공유 CanyonLayout 전환(미러 삭제) | 결정적 검증 **75/75** (블록↔충돌체 1:1 정합·수직 상한 파생·흘수선 포함) | — (헤드리스 로직 검증 위주) | provisional 잔존분 이관 결정(심도 구간 경계·어뢰·화물선 수치 — INT-GAME-004·006·007), 격침 보상 +1 배선 |
| 그래픽스 | `feat/render` | `c091f30` | 프로펠러 signed speed 연동(정/역회전·8% 공회전·A/D 무영향), 해수면, 화물선 계약 소비(`applyState` 매핑만)·torpedoHit 폭발(멱등)·sinkProgress 침몰·removed 제거, 공유 STARTING_CANYON_LAYOUT 렌더, positionY 반영, 리센터 신규약 적용 | typecheck·build·check:size(3.7%), 게임플레이 검증 71/71 | **Playwright 실입력 실측** — 리센터·전/후진·A 단독 공회전·Shift/Ctrl 수직·화물선 왕복·폭발·침몰·제거·벽 충돌 정지 (스크린샷 확보) | composition root 배선 2줄(INT-RENDER-005 — cargoShip 상태·EventBus 주입) |
| 빌드·툴 | `claude/deep-dive-tooling-phase-0-cj6c49` | `a7c3cdf` (입력 모드 2원화 — 최종 검증 커밋) | 조작 안내 패널·H 토글, Pointer Lock(Esc 일시정지·250ms 가드), PC 화면 조준·발사 버튼 ↔ 실제 AimSystem(마우스와 동일 인스턴스·동등 판정), 입력 계측(게이트 JSON 합류), `params/ui.json`, 리드 `c4841cf`·게임플레이 `b7faf44` 병합 재검증 | typecheck·build·check:size(3.7%), HUD 헤드리스 **33/33**, 게임플레이 검증 75/75, **실제 Chromium 입력 모드 테스트 20/20** | 실발사·재장전·잔탄 동등·중복 발사 없음, 입력 모드 2원화(마우스/화면 버튼) 확인 | ✅ D+10 통합에서 채택 완료 (INT-TOOL-002·004) — ui.json 기획 통보만 잔여 |

### 구분: 완료 / 통합 대기 / 백로그

- **완료 (브랜치 구현·검증 통과):** 확정 상태 전체 — 로컬 -Z 선수/+Z 선미, W/S 전진·후진, Shift/Ctrl 연속 상승·하강, 3단계 심도 구간, 공유 `STARTING_CANYON_LAYOUT`(렌더·충돌 동일 데이터), Space 선미 후방 상단 리센터, 환경 충돌·밀어내기, 프로펠러 signed speed·8% 공회전·A/D 무영향, 해수면, 직선 왕복 화물선, AimSystem(우클릭 조준·좌클릭 발사·PC 화면 버튼), 직선 어뢰, torpedoHit, sinkProgress 침몰, removed 렌더 제거, 조작 안내·H 토글, Pointer Lock, 입력 계측
- **통합 대기 (구현 없음 — dev 병합·배선 작업만):** 4개 브랜치 dev 병합(NEXT_SPRINT §2 순서), composition root 배선(HUD aim·torpedo / cargoShip 상태·EventBus), INT-GAME-004·006·007 리드 결정, DECISIONS·각주 반영, D10 체크리스트 실행
- **백로그 (차기 스프린트):** aimModeChanged 조준 카메라 고정 / 리드샷 보조선 실제 렌더 / 어뢰 항적·기포 / 방향타·수평타 애니메이션 / 프로펠러 기포 / 어뢰 격침 보상 +1 / 임시 화물선·전투 수치 params 이관 / WebAudioSystem 조립 / 탐지·발사 지점 노출 / 구축함·폭뢰 (상세·담당: NEXT_SPRINT §3)

---

## D+10 통합 검증 결과 (통합 담당 기록)

- **통합 브랜치:** `claude/deep-dive-bootstrap-6wrpuw` (통합 세션 전용 — dev PR 대기)
- **병합:** 리드 `c4841cf` → 게임플레이 `c46c937` → 그래픽 `c091f30` → 툴링 `a7c3cdf` → 문서 `7186135` (원격 tip merge, cherry-pick 없음)
- **충돌:** `docs/INTEGRATION_NOTES.md` 3회(항목 ID 기준 전 항목 보존·중복 제거), `docs/NEXT_SPRINT.md`·`docs/meetings/07`·`meetings/README` (문서 브랜치 결산본 채택, 회의록 08은 원문 유지·재구성 중복본 제거). **코드 파일 충돌 0건**
- **Game.ts 최종 조립:** GameplaySystems(레이아웃 명시 주입)·CameraInputAdapter·ControlsHud(aim·torpedo·bus)·CanyonScene(동일 레이아웃)·attachPoseSource·attachCargoShipSource·attachEventBus — 시스템별 단일 인스턴스
- **정적 검사:** `npm ci`·typecheck·build·`check:size`(0.55MB/15MB, 3.7%) 전부 통과
- **게임플레이 결정적 검증:** 75/75 통과
- **HUD 자동 검증:** 툴링 `a7c3cdf` 기록 33/33 (러너는 툴링 세션 산출물 — 저장소 미포함. 본 통합에서는 아래 Chromium 실입력 27~44번 항목으로 동등 검증)
- **실제 Chromium 실입력 플레이테스트:** 지시서 50항목 전 항목 PASS (실키·실클릭 — H 토글/이동·선회·수직/A/D 프로펠러 무영향/Space 리센터·선미 카메라/충돌·관통 없음·능선 위 통과/해수면·화물선 왕복/Pointer Lock 마우스 모드 조준·발사/화면 버튼 모드·재장전 비활성·잔탄 공유/모드 전환·잔탄 유지/명중·torpedoHit·sinkProgress 침몰·removed 제거/콘솔 오류 0건). 보조 검사: `?xray=1` 콘솔 0건, 일시정지 시 조준 자동 해제, 우클릭 컨텍스트 메뉴 억제, 입력 계측 카운터 작동
- **수동 확인 필요 (자동화 환경 한계):** ① 실물 키보드 Esc의 Pointer Lock 해제 (자동화는 `exitPointerLock()` 동일 경로로 검증 — 브라우저 예약 동작이라 실기기에서 사실상 보장) ② 실기기 60fps(G1 — 헤드리스 SW 렌더 FPS는 참고치) ③ GitHub Pages 배포 URL(관리자 설정 대기)
- **남은 버그:** 발견 0건 (콘솔 오류 0)
- **백로그:** NEXT_SPRINT §3 유지 + INT-GAME-004·006·007 수치 이관(R7 임시값 표기), 격침 보상 +1 배선, ui.json 기획 통보

---

## 스프린트 A 통합 결과 (통합 관리자 창)

> 상세: `docs/SPRINT_A_INTEGRATION_MANIFEST.md` · 판정: `docs/SPRINT_A_ACCEPTANCE.md`

- **병합(전부 `--no-ff` tip merge, 이력 보존):** dev(`c5987a2`) → 리드(`c3c9cb9`)
  → 게임플레이(`f61b1e8`) → 그래픽스(`51ad7c7`) → 빌드·툴(`946692b`)
- **정규화:** 발사관 소켓 단일화(정본 `world/torpedoTubeAnchor` +
  `core/TorpedoTubeSocketRig` — 게임플레이·렌더 자체 정의 삭제, 생성 거리
  4.35 m/3.35 m 불일치 해소) · 구매 트랜잭션 단일화(리드 정본, 게임플레이는
  판정 포트로 축소·저장소 미접근) · 렌더 조준 카메라의 소켓 소비 전환
- **최소 수정:** `PurchaseTransaction` 롤백을 지갑·단계 독립 복원으로 분리,
  `UpgradeState`를 공식 경제 카탈로그 소비로 전환(null은 보정 미생성)
- **문서 회귀:** 구 '심도 전용 조준'·'자동 부상' 표현 **위반 0** (회의록 제외)
- **회귀:** typecheck·build·size(4.3%)·scope 통과, gameplay 128/128 ·
  meta 35/35 · tooling 26/26 · HUD 34/34
- **차단:** A8 미확정 114필드(기획 경제 수치표 대기) · 툴링 교차 승인 대기 ·
  구매/장비 UI(BaseScreenPort) 배선 미완 → **dev PR 금지, B 발효 불가**
