# PVE_MVP_INTEGRATION_MANIFEST — PvE MVP 1차 통합 매니페스트

> 통합 담당 기록. 실제 원격 커밋을 확인한 결과만 적는다 — 보고와 원격이
> 다르면 원격이 기준이며, 미도착 항목은 추측 병합하지 않는다.

## 1. 기준

| 항목 | 값 |
|---|---|
| 통합 브랜치 | `claude/deep-dive-d5-gray-box-integration-tree5i` (세션 전용) |
| 기준 커밋 | `6e62356` — 네 역할 브랜치의 공통 조상(D+10 전투 프로토타입 `89de73f` + PROJECT_STATE + 회의록 09~11) |
| 통합 전 HEAD | `7186135` (D+5 결산 문서). `6e62356`의 조상이라 fast-forward로 기준에 합류 |
| Node / npm | v22.22.2 / 10.9.7 (`.nvmrc` 일치) |
| dev / main | 직접 푸시·병합 없음 |

## 2. 역할 브랜치 확인 결과 — 필수 커밋 전부 원격 존재

| 역할 | 브랜치 | 보고된 필수 커밋 | 원격 확인 | tip 일치 |
|---|---|---|---|---|
| 개발 리드 | `claude/deep-dive-core-lead-uyg77p` | `dcc6f7d`, `187536e` | ✅ 둘 다 존재 | ✅ tip = `187536e` |
| 게임플레이 | `claude/submarine-controls-depth-3wi424` | `fa0dee6` | ✅ 존재 | ✅ tip = `fa0dee6` |
| 그래픽스 | `feat/render` | `f89245f`, `66d6cbd` | ✅ 둘 다 존재 | ✅ tip = `66d6cbd` |
| 빌드·툴 | `claude/deep-dive-tooling-phase-0-cj6c49` | `5a3e5f9` | ✅ 존재 | ✅ tip = `5a3e5f9` |

**미도착 브랜치: 없음.** 네 역할 모두 tip 병합(cherry-pick 아님)을 사용했다.
각 브랜치는 공통 기반 위에 자기 역할 커밋만 얹은 상태여서 지시 범위 밖
커밋은 섞여 있지 않았다(리드 2, 게임플레이 1, 그래픽 2 + 병합 1,
툴링 1 + 병합 1).

## 3. 역할별 보고 검증 결과와 실제 측정치

| 역할 | 보고 | 통합 후 실측 |
|---|---|---|
| 게임플레이 | 결정적 100/100, typecheck·build·size 통과 | ✅ 100/100 유지 |
| 그래픽스 | 결정적 75/75(게임플레이 신규 100 합류 전 기준), typecheck·build·size | ✅ 통합 후 기준인 100/100으로 회귀 확인 |
| 빌드·툴 | tooling 26/26, hud 33/33, gameplay 75/75, typecheck·build·size·scope | ✅ tooling 26/26 · hud 33/33 · gameplay 100/100 · scope 통과 |
| 개발 리드 | 보스 AI 의도적 미구현 | ✅ 미구현 유지 — 이번 통합에서 구현하지 않음 |

## 4. 역할별 변경 파일 (기준 대비 신규 주요 파일)

- **리드**: `src/contracts/meta.ts`, `src/meta/{MetaLoop,MetaState,settlement,upgradeMath,provisionalEconomy}.ts`, `src/meta/__verification__/*`, `src/contracts/events.ts`(PvE 이벤트 9종)
- **게임플레이**: `src/systems/economy/{EconomySystem,RunEconomy,CreditDropField,SalvageObject,provisionalEconomy}.ts`, `src/systems/{EquipmentSystem,BossWeakPointTarget,provisionalEquipment}.ts`, `src/systems/collision/shipHullBox.ts`
- **그래픽스**: `src/render/{TorpedoVisuals,PeriscopeView,BaseSceneView,SubmarineVisual,LeadShotIndicator,EnvironmentDressing}.ts`, `src/render/boss/*`
- **빌드·툴**: `src/meta/save/{SaveStore,saveSchema,migrations}.ts`, `src/tools/{UpgradeSimulator,upgradeMath,upgradeCalculator,KeyboardLockManager}.ts`, `src/audio/AudioCueRouter.ts`, `scripts/{check-scope-guard,verify-hud}.mjs`, `params/upgrades.json`

## 5. 계약 변경·이름 통합 (상세: INTEGRATION_NOTES '계약 이름 통합 결정')

| # | 충돌 | 채택 | 처리 |
|---|---|---|---|
| 1 | `guard`(게임플레이) vs `patrol`(리드 계약) 세력 태그 | **`patrol`** (공식 계약) | 게임플레이 로컬 `FactionId` 정의 삭제 → `contracts/meta` 재수출. 판정 로직 무변경 |
| 2 | `applyUpgradeBonus`(툴링) vs `effectiveValue`(리드) 동일 수식 | **리드 `meta/upgradeMath`** | 툴링 함수를 위임 래퍼로 전환. 툴링의 카탈로그 검증·단계 합산은 유지 |
| 3 | `diveDepth`(카탈로그) vs `maxDepth`(계약 `UpgradeStatId`) | **`maxDepth`** | `params/upgrades.json` id 교정 |
| 4 | `guardSpawnRequested`(게임플레이 제안) vs `guardShipRequested`(리드 계약) | **`guardShipRequested`** | 조립부 브리지가 공식 이름으로 발행. 게임플레이 큐 API는 유지(기능 삭제 없음) |
| 5 | `creditsChanged`/`creditsGained`(제안) vs `lootDropped`(계약) | **`lootDropped`** | 드롭 회수 시 조립부가 발행. 중복 이벤트 신설하지 않음 |
| 6 | `rarePartAcquired`(제안) vs `saveRequested{cause:'rarePart'}`(계약) | **`saveRequested`** | 리드 MetaLoop이 이미 발행 — 중복 이벤트 미신설 |
| 7 | `baseStateChanged`(제안) vs `metaStateChanged`(계약) | **`metaStateChanged`** | 기지 화면·HUD 버튼 표시 모두 이 이벤트 구독 |

**계약 최소 보완 (기능 삭제 없이 추가):** `MetaLoop.restoreWallet()`(저장 복원
경로 부재), `WorldDrop.source: LootSource`(lootDropped payload 충족),
`CreditDropField.onCollected()`, `GameplaySystems.resetSortieSession()` 및
하위 리셋 4종, `ControlsHudOptions.launchSortie?`.

## 6. 예상 충돌 파일과 실제 결과

| 파일 | 예상 | 실제 |
|---|---|---|
| `docs/INTEGRATION_NOTES.md` | 4파트 동시 추가 | 충돌 3회 — 전 항목 보존으로 해결(삭제 0) |
| `docs/CURRENT_STATUS.md` | 4파트 동시 갱신 | 자동 병합 성공 |
| `src/core/Game.ts` | 조립부 경합 | **충돌 없음** — 리드만 수정 |
| `src/contracts/*` | 계약 경합 | 충돌 없음 (리드 단독) — 단 타입 이름 충돌은 §5로 별도 해소 |

## 7. 병합 순서 (실행 순서와 동일)

1. 개발 리드 `187536e` → typecheck·build 통과, meta 19/19
2. 게임플레이 `fa0dee6` → **typecheck 실패**(FactionId 충돌) → §5-1 해소 후 통과, gameplay 100/100
3. 그래픽스 `66d6cbd` → typecheck·build 통과
4. 빌드·툴 `5a3e5f9` → typecheck·build 통과 (`npm ci` 재실행 필요 — playwright-core devDep 추가)

각 단계 직후 `npm run typecheck` + `npm run build`를 실행했고, 실패 상태로
다음 브랜치를 병합하지 않았다.

## 8. 통합 커밋

| 커밋 | 내용 |
|---|---|
| `49dccbf` | merge(1/4) 개발 리드 |
| `7bd6b70` | merge(2/4) 게임플레이 (docs 충돌 해결) |
| `774b372` | fix — 세력 태그 `guard`→`patrol` 통일 |
| `b52d224` | merge(3/4) 그래픽스 (docs 충돌 해결) |
| `6f4c66a` | merge(4/4) 빌드·툴 (docs 충돌 해결) |
| `5bd7fda` | fix — 업그레이드 계산식 중복 해소 |
| `de38e82` | feat [LOOP][ECON] — PvE MVP 조립 배선 |
| `ee2022a` | chore — 개발 모드 검증 핸들 확장 |
