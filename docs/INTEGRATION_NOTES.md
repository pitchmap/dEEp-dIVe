# INTEGRATION_NOTES — 공통 계약 변경 제안·결정 기록

> 공통 계약(`src/contracts/*`)과 공통 보호 파일의 모든 변경은 **여기에 먼저
> 제안을 기록**하고 개발 리드 결정 후에만 반영한다 (CLAUDE.md 규칙 8).
> 새 제안은 표 맨 위에 추가한다. 간단 요청은 `docs/templates/INTEGRATION_REQUEST.md`
> 양식으로 이슈를 먼저 열어도 된다.

## 기록 양식

| 필드 | 내용 |
|---|---|
| 요청자 | 역할/창 이름 |
| 대상 시스템 | 예: DetectionSystem, events.ts의 특정 이벤트 |
| 필요한 변경 | 추가·수정할 이벤트/필드/메서드 구체 명세 |
| 변경 이유 | 어떤 작업이 막혀 있는가, 데이터·근거 |
| 관련 게이트 | G1~G9 중 해당 항목 |
| 영향을 받는 파일 | 계약 파일 + 구현·구독 측 파일 목록 |
| 하위 호환 여부 | 기존 구현·구독자가 깨지는가 |
| 개발 리드 결정 | 승인 / 반려 / 조건부 (+사유) |
| 적용 커밋 | 반영 커밋 해시 (결정 후 기입) |

---

## 전체 상태 총괄표 (D+7 문서 정리 시점 — 미결·해결 정리)

> 항목 원문은 각 소재 브랜치의 INTEGRATION_NOTES에 있다 (dev 통합 시
> 본문 합류). ✅ = 해결(승인·반영), ⏳ = 미결(리드 결정 대기),
> 🔍 = 선반영·리드 확인 대기, 🔀 = 다른 항목으로 해소, ⛔ = 폐기.

| ID | 제목 | 상태 | 소재·근거 |
|---|---|---|---|
| #001 | 초기 계약 정의 | ✅ 반영 완료 | dev (부트스트랩) |
| INT-CORE-001 | GameSystem·SystemRegistry·composeSystems | ✅ 반영 완료 | dev `d994160` |
| INT-GAME-001 | 이동 수치(최고 속력·가속) params 이관 | ✅ 반영 완료 | dev `6f83268` |
| INT-GAME-002 | gameplay 조립 연결 | ✅ 반영 완료 | dev `6f83268` |
| INT-RENDER-001 | CanyonScene 조립·별칭 정리 | ✅ 반영 완료 | dev `6f83268` |
| INT-TOOL-001 | Node 고정·params HMR (engines `>=22 <23`) | ✅ 반영 완료 | dev `7e9e363` — 그래픽 브랜치 일치 검증 완료(`c091f30` vs dev diff 0건) |
| INT-CORE-002 | 축 규약(conventions)·AimSystem·aimModeChanged·propellerIdleSpinRatio | ✅ 승인·**D+10 통합 완료** | 리드 `b69890b` |
| INT-CORE-003 | SubmarinePoseSource·CargoShipStateSource·torpedoHit·layout.ts·파라미터 단일 소스 | ✅ 승인·**D+10 통합 완료** | 리드 `efd4712` |
| INT-CORE-004 | STARTING_CANYON_LAYOUT(`src/world/`)·벽 높이 확정(렌더 하향값)·리센터 규약 이의 해소(Offset/Look 분리) | ✅ 승인·**D+10 통합 완료** (Game.ts 명시 주입 — 렌더·충돌 단일 인스턴스) | 리드 `c4841cf` |
| INT-GAME-004 | positionY·부호 속도 계약 승격 + 후진·수직 비율·심도 구간 경계 이관 | ⏳ 미결 — 계약 실체는 INT-CORE-003으로 확정, **심도 구간 경계 임시값(provisionalWorld) 이관 잔여** | 게임플레이 `218ad86`~`c46c937` |
| INT-GAME-005 | 협곡 레이아웃 단일 소스화 + positionY 렌더 소비 | 🔀 **INT-CORE-004로 해소** — 미러 삭제(`c46c937`)·렌더 소비(`c091f30`) 완료. 형식 종결만 잔여 | `c4841cf`·`c46c937`·`c091f30` |
| INT-GAME-006 | 어뢰 수치(속력 20·사거리 90) params 이관 + 명중 이벤트 | ⏳ 미결 — 이벤트는 INT-CORE-003 `torpedoHit`로 해소, **수치 이관(provisionalCombat) 잔여** | 게임플레이 `10ef604` |
| INT-GAME-007 | 화물선 수치(속력 4·반경 9·침몰 6s) 이관 + 격침 보상 어뢰 +1 배선 | ⏳ 미결 | 게임플레이 `b7faf44` |
| INT-RENDER-002 | 프로펠러용 전후 부호 속도 (소회의 관리 창 제안) | 🔀 INT-GAME-004 합류 → **INT-CORE-003 `forwardSpeedMetersPerSecond`로 해소** | 회의록 08 |
| INT-RENDER-003 | 화물선 상태 계약 | 🔀 **INT-CORE-003으로 해소** — 렌더 계약 소비 전환 완료(`c091f30`) | `c091f30` |
| INT-RENDER-004 | [보고] 렌더-충돌 벽 높이 불일치 | 🔀 **INT-CORE-004로 해소** — 공유 레이아웃로 '보이지 않는 벽' 소멸 | `c4841cf`·`c46c937` |
| INT-RENDER-005 | Game 조립 배선 요청: cargoShip 상태·EventBus 주입 (2줄, 코드 예시 포함) | ✅ **적용 (D+10 통합)** — composeSystems에 attachCargoShipSource·attachEventBus 배선 | 그래픽 `c091f30` |
| INT-TOOL-002 | HUD 조립 보호 파일 최소 변경 (Game.ts +9줄·params/ui.json) | ✅ **채택 (D+10 통합)** | 툴링 `e0f7609` |
| INT-TOOL-003 | 조준·발사 요청 이벤트 3종 | ⛔ 폐기 — INT-CORE-002 AimSystem 단일 진입점으로 대체 | 툴링 기록 |
| INT-TOOL-004 | HUD 전투 버튼 ↔ AimSystem 배선 (Game.ts 선반영, 배선 코드 예시 포함) | ✅ **채택 (D+10 통합)** — combat {aim·torpedo}·bus 주입 | 툴링 `2f8b66f`·`a7c3cdf` |

**미결 요약 (D+10 통합 후):** INT-GAME-004·006·007 수치 이관·격침 보상
결정만 잔여 — 백로그 이월 (R7 임시값 상태 유지, D+10 게이트 데이터에
'임시 초기 테스트값' 표기). HUD·화물선·EventBus 배선은 D+10 통합에서 채택·적용 완료.

## 계약 이름 통합 결정 (PvE MVP 1차 통합 — 통합 담당)

> 우선순위: ① 개발 리드가 확정한 공식 계약 ② 기존 저장소 계약
> ③ 게임플레이·툴링이 요청한 추가 payload.
> **동일 의미의 이벤트·타입을 여럿 남기지 않는다.** 기능 삭제로 충돌을
> 해결하지 않으며, 계약에 정보가 부족하면 이름은 유지하고 payload만 보완한다.
> 상세 표: `docs/PVE_MVP_INTEGRATION_MANIFEST.md` §5.

| # | 충돌한 이름 | 채택(공식) | 폐기·전환 | 근거 |
|---|---|---|---|---|
| 1 | `guard` / `patrol` (세력 태그) | **`patrol`** (`contracts/meta.ts`) | 게임플레이 로컬 `FactionId` 정의 삭제 → 공식 계약 재수출 | 우선순위 ① — 판정 로직·기능 변경 없음 |
| 2 | `applyUpgradeBonus` / `effectiveValue` (동일 수식 이중 구현) | **`meta/upgradeMath.effectiveValue`** | 툴링 함수는 위임 래퍼로 잔존(호출부 이름 유지) | "계산식을 중복 구현하지 않는다" — 툴링의 카탈로그 검증·단계 합산은 보존 |
| 3 | `diveDepth` / `maxDepth` (업그레이드 항목 id) | **`maxDepth`** | `params/upgrades.json` id 교정 | 우선순위 ① — `UpgradeStatId` 유니언과 일치시켜 기계 강제 가능 |
| 4 | `guardSpawnRequested` / `guardShipRequested` | **`guardShipRequested`** | 게임플레이 큐 API(`consumeGuardSpawnRequests`)는 유지, 조립부 브리지가 공식 이름으로 발행 | 우선순위 ① — 기능 삭제 없이 이름만 단일화. `provokedByTargetId`는 공식 payload에 없어 미전달(필요 시 계약 보완 절차) |
| 5 | `creditsChanged` / `creditsGained` / `lootDropped` | **`lootDropped`** | 신규 이벤트 미신설 | 우선순위 ① — 메타 루프가 이미 구독 중 |
| 6 | `rarePartAcquired` / `saveRequested(cause='rarePart')` | **`saveRequested`** | 신규 이벤트 미신설 | 우선순위 ① — 저장 이벤트 단일화(cause 구분) 결정 유지 |
| 7 | `baseStateChanged` / `metaStateChanged` | **`metaStateChanged`** | 신규 이벤트 미신설 | 우선순위 ① — 기지 화면·HUD 버튼 표시 모두 이 이벤트 소비 |

### 계약 최소 보완 (기능 삭제 없이 추가만 — 보완 사유)

| 보완 | 사유 |
|---|---|
| `MetaLoop.restoreWallet(CurrencyBundle)` | 지갑에 증가 경로만 있어 저장 데이터를 되돌릴 수 없었다. 저장 코드가 상태 머신을 직접 조작하지 않도록 **명시적 복원 API 하나**로 제한하고, BASE 상태에서만 허용한다 |
| `WorldDrop.source: LootSource` + `CreditDropField.onCollected()` | 공식 `lootDropped` payload의 `source`를 회수 시점에 채울 수 없었다(회수 후 출처 소실). 경제 시스템은 이벤트를 직접 발행하지 않고 조립부 브리지가 발행한다 |
| `GameplaySystems.resetSortieSession(params)` + 하위 리셋 4종 | 재출항 시 전투 세션 초기화 API가 없어 이전 출항의 위치·잔탄·드롭이 이월됐다. 확정 크레딧·희귀 부품·업그레이드는 유지한다 |
| `ControlsHudOptions.launchSortie?` + 귀환/출항 버튼 | `returnToBaseRequested`는 **구독자만 있고 발행자가 없었다**. HUD가 요청만 발행하고 정산·전이는 상위 메타 루프가 소유한다 |
| `CanyonScene.setMetaBaseActive()` | 기지 화면이 `?base=1` QA 플래그로만 도달 가능했다. 렌더가 메타 상태를 판정하지 않도록 조립부가 `metaStateChanged`로 호출한다 |

### 미해소로 남긴 것 (후속)

- `guardShipRequested` **소비자 없음** — 구축함/경비함 AI 미구현. 이벤트는 발행되지만 스폰은 일어나지 않는다. 새 경비함 AI 클래스를 복제하지 않는다는 원칙에 따라 기존 구축함 AI 도입 시 연결한다
- 게임플레이 로컬 `UpgradeModifiers{torpedoSpeedBonus,torpedoDamageBonus}`는 공식 `UpgradeModifiers`(Partial\<Record\<UpgradeStatId,number\>\>)와 형태가 다르다. 조립부가 변환 주입하며, 어뢰 속도에 대응하는 공식 스탯이 7항목 상한 안에 없어 해당 보정은 0이다(장비 기능은 유지)
- R7 임시값 4종 잔존: `meta/provisionalEconomy`(손실률), `systems/economy/provisionalEconomy`(드롭·픽업), `provisionalEquipment`, `provisionalCombat`/`provisionalCargo` — 기획 경제 수치표 도착 시 `params/economy.json` 이관

## 제안 목록

### INT-CORE-011 — 공식 런타임 params 소비 계약: OfficialRuntimeParams·SalvagePlacementSource·production spawn 규칙

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (스프린트 A 공식 경제 연결 — 툴링 승인 params `2a89400`·loader `60ece41` 소비) |
| 대상 시스템 | `src/contracts/officialParams.ts`(신규), `src/core/Game.ts`(provisional 제거·loader 1회), `src/core/PveIntegration.ts`(spawnId 결합·출항당 spawn 가드) |
| 필요한 변경 | ① **OfficialRuntimeParams** — composition root가 `loadEconomyParams()`(upgrades·equipment·economy·cargo) + `loadAimingParams()`를 **각 1회** 호출해 번들을 만들고 MetaLoop·GameplaySystems·BaseScreenPort·PurchaseTransaction·EquipmentTransaction·DepartureCommand에 주입. 시스템·UI의 JSON 직접 import·로더 직접 호출 금지 ② **SalvagePlacementSource** — 소유 분리: 경제 params가 spawnId·kind·dropTableId(credits)·rarePartId 소유, 월드·그래픽스가 spawnId·worldPosition·orientation 소유. composition이 동일 spawnId로 결합(`composeSalvageSpawnPlan`). 누락·중복·미지 spawnId·미지 dropTableId·미지 kind는 **거부**(무시 금지) ③ **production spawn 규칙** — 출항 월드 초기화 시 salvageSpawns 전체(MVP 3개) 생성, 같은 출항 중복 생성 금지(파괴분 재생성 금지 — 출항당 1회 가드), 새 출항 시 재생성(resetSortieSession 규칙과 일치), 보상=economy params만·좌표=placement만. 그래픽스 배치 미도착 시 임시 좌표 생성 금지 — 명시적 unwired 상태 유지 |
| 변경 이유 | 승인된 공식 경제값을 production 런타임이 실제로 소비하게 하는 마지막 배선. provisional(Game.ts→meta/provisionalEconomy)의 production import 제거. 경제 수치와 월드 좌표의 소유 경계를 계약으로 고정 |
| 관련 게이트 | A8(공식 수치 소비)·MVP 재화 루프 |
| 영향을 받는 파일 | 계약 1파일 신규 + 리드 조립 2파일 + 문서(INTERFACES §2e) |
| 하위 호환 여부 | 깨짐 없음 — 신규 계약 추가. 게임플레이 provisional 파일(`systems/economy/provisionalEconomy` 등)은 소유 역할이 주입 경로로 교체 후 삭제(아래 지침). `upgradeCalculator` 로더는 툴링 시뮬레이터 전용으로 존치(production composition은 economyParams 번들만) |
| 개발 리드 결정 | 승인 — spawnId 결합 함수와 출항당 spawn 가드는 리드 소유(PveIntegration), 좌표 데이터는 월드·그래픽스 소유, 드롭 생성·회수 런타임은 게임플레이 소유 유지 |
| 적용 커밋 | (본 브랜치 선행 계약 커밋) |

**각 창 소비 지침:**
- **게임플레이**: `EconomySystem`의 `PROVISIONAL_DROP_TABLES`·`PROVISIONAL_PICKUP_RADIUS_METERS`·`PROVISIONAL_DEFEAT_CREDIT_LOSS_RATIO` 직접 import를 **주입 경로로 교체**(생성자 또는 attach API — 조립부가 `official.economy`의 dropTables·pickupRadiusMeters·creditLossOnDestroyedRatio를 전달). 교체 후 `systems/economy/provisionalEconomy.ts` 삭제. `spawnSalvage(kind,x,y,z,rarePartId)` 시그니처는 그대로 — composition이 결합 plan으로 호출한다. 조준은 `loadAimingParams` 값(aimingMath 동일 함수)을 주입받는 구조 유지 — `provisionalAiming` 삭제 시점은 게임플레이 결정
- **그래픽스**: `SalvagePlacementSource` 구현체 1개를 제공(레이아웃·씬 소유 — spawnId 3종 `salvage-1/2/3` 각 1개 좌표, 협곡 내 도달 가능 위치). credits·rareParts 값 정의 금지 — 시각 표현(chest/container/mineral 메시)은 `kind`로 분기. 조립부 연결점: `SortieSalvageSpawner.attachPlacementSource`
- **툴링**: economyParams 번들이 production 유일 공급원임을 시뮬레이터 문서에 반영. `upgradeCalculator` 로더는 시뮬레이터 전용 — production 소비 금지 유지
- **기획**: salvageSpawns 추가·변경은 economy.json에서만 — 좌표 필드를 economy.json에 넣지 않는다(소유 분리)

### INT-CORE-010 — 스프린트 A 마감 계약: BaseScreenPort v2·결과 계약·저장 책임 단일화·경제 미확정 처리

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (스프린트 A 잔여 A4·A5/A6 UI·A8 마감 — 매니페스트 §7-3·§7-4·재판정 10 해소) |
| 대상 시스템 | `src/contracts/meta.ts`(PurchaseDenialReason 개정·DepartureResult·카탈로그 뷰·BaseScreenPort v2·EquipmentChangeJudgePort 개정), `src/contracts/events.ts`(saveRequested cause 2종으로 정리), `src/meta/MetaLoop.ts`(sortieLaunch 발행 제거), `src/meta/EquipmentTransaction.ts`(개정 포트 적용) |
| 필요한 변경 | ① 사유 통일: `slotFull`(구 noFreeSlot 폐기 — 게임플레이 purchaseTypes와 이원화 해소) + `economyDataUnavailable` 추가(공식 params null — **상태·저장 변경 전 반환**, null→0 변환·provisional 대입 금지) ② `DepartureResult`(departed/saveFailed/invalidState/economyDataUnavailable) ③ BaseScreenPort v2 — 읽기 모델(실지갑·미정산 출항 재화·공식 카탈로그 2종·단계·loadout·출항 가능·lastResult) + 명령 5종(purchaseUpgrade/equipItem/replaceItem/unequipItem/confirmDeparture) ④ **저장 책임 단일화** — INTERFACES §2d 표: 구매=PurchaseTransaction / 장비=EquipmentTransaction / 출항=Departure command / 정산·희귀=saveRequested 유지. UI command의 saveRequested 발행 금지, 동일 명령 SavePort 2회 호출 금지, `sortieLaunch` cause 폐기(MetaLoop 발행 제거) ⑤ 장비 판정 포트를 판정+적용 결합형으로 개정(실존 EquipmentSystem 형태와 1:1 — 판정 복제 제거), 스냅샷은 빈 슬롯 위치 보존 배열 |
| 변경 이유 | A4 실패·A5/A6 UI 미배선·A8 실패·이중 저장 위험(매니페스트 §7-3: EquipmentSystem attachSavePort 경로와 리드 트랜잭션 병존)의 계약 원인 제거. production UI가 소비할 유일 진입점 확정 |
| 관련 게이트 | A4·A5(T1~T6)·A6·A7·A8 |
| 영향을 받는 파일 | 계약 2파일 + 리드 구현 3파일(정합) + INTERFACES §1·§2c·§2d |
| 하위 호환 여부 | `noFreeSlot` 리터럴 소비자는 계약 파일뿐(게임플레이는 이미 slotFull) — 깨짐 없음. `sortieLaunch` 소비자는 MetaLoop 발행뿐 — 제거로 정합. 구 BaseScreenPort(v1, 미배선)는 v2로 대체 — production 소비자 아직 없음 |
| 개발 리드 결정 | 승인 — 저장 책임 표를 INTERFACES §2d에 상설 표로 두고, 명령당 SavePort 호출 횟수는 CountingSavePort로 계측 가능하게 한다 |
| 적용 커밋 | (본 브랜치 선행 계약 커밋) |

**각 창 소비 지침 (스프린트 A 마감):**
- **게임플레이**: purchaseTypes의 `slotFull`·`maxLevelReached`는 이제 공식 계약과 일치(변경 불요). `UpgradePurchaseSystem` 판정 포트는 그대로 소비된다 — 비용 resolver는 조립부가 공식 params로 주입(provisional 기본값은 production 미사용). EquipmentSystem 변경 불요 — attachSavePort는 production에서 null 유지(저장은 리드 트랜잭션 소유)
- **그래픽스**: production UI는 BaseScreenPort v2(또는 metaEconomyPorts 구조 단면)만 소비. 가격 null(nextCostPending) = 버튼 비활성 + '가격 데이터 대기'. `MetaCommandFailure`에 economyDataUnavailable 표기 추가분(조립부가 최소 반영)을 확인·수용할 것. DOM·스타일은 리드가 건드리지 않았음
- **툴링**: SaveStore·SaveBridge 변경 불요. SAVE_SYSTEM.md 저장 시점 표가 §2d와 일치하는지 확인(sortieLaunch 이벤트 폐기 — Departure command 직접 저장으로 대체). A5-T 시나리오는 CountingSavePort 계측으로 호출 횟수 단언 가능
- **기획**: A8 해소의 유일 입력 = 경제 수치표(114 null 필드 확정). null인 항목은 구매 자체가 economyDataUnavailable로 차단된다 — 임시값 선진행 없음(7차 결의 4 데이터→UI 순서)

### INT-TOOL-008 — [LOOP][ECON] 스프린트 A 툴링 산출물 + 이관·문서 회귀 차단 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴 (스프린트 A 창 4 — 회의 14 범위표) |
| 대상 시스템 | `params/aiming.json`·`params/upgrades.json`·`params/equipment.json`(기획 커밋 영역), `package.json`(스크립트), `.github/workflows/ci.yml`, 게임플레이·통합 관리자 문서 |
| 필요한 변경 | ① **aiming.json 신설** — 4항목(yaw 15 / up 10 / down 15 / 감도 0.5), 양수 크기 저장·부호는 `src/tools/aimingMath.ts` 단일 지점에서만 적용, `aimReturnBehavior` 미포함(보완분 결의 9). **카메라(그래픽스)·조준(게임플레이)은 반드시 `src/tools/aimingParams.ts`의 동일 로더·`pitchLimitsDegrees()`/`clampAimOffsetDegrees()`를 사용할 것** — 각자 JSON을 읽거나 음수를 붙이면 이중 부호 오류 ② **경제·장비 공식 params 구조 확정** — upgrades.json을 단계 배열 구조(costCredits·costRareParts·effectBonus, 길이 = maxLevel)로 전환, equipment.json 신설(가격·희귀 부품·슬롯). **수치는 전부 `null` = 기획 경제 수치표 미도착** — 임의 값을 발명하지 않았다(7차 결의 4의 병목). 기획이 값을 채우면 `[ECON]` 태그로 커밋 ③ **계산 복제 제거** — 툴링 `src/tools/upgradeMath.ts` 삭제, 시뮬레이터가 리드 정본 `src/meta/upgradeMath.ts`를 직접 사용(INT-CORE-007 적용 요청 이행) ④ scripts 2종 추가(`verify:meta`·`verify:sprint-a`) |
| 변경 이유 | 스프린트 A 창 4 범위(aiming params·경제 validator·저장 실패 주입·A1~A8 러너·문서 회귀 확인)의 산출 |
| 관련 게이트 | A1·A2·A3(파라미터 측면), A5·A6·A7(저장 원자성), A8(이관 상태), §8 문서 회귀 |
| 영향을 받는 파일 | params 3종, src/tools/{aimingMath,aimingParams,economyMath,upgradeCalculator,UpgradeSimulator}.ts, src/meta/save/{FaultInjectingStorage,atomicSave}.ts, scripts/verify-sprint-a.mjs, docs/SPRINT_A_ACCEPTANCE.md |
| 하위 호환 여부 | upgrades.json 스키마가 `bonusPerLevel` 단일값 → 단계 배열로 **변경**됨(구 구조 소비자는 툴링 시뮬레이터뿐이며 동시 갱신 완료). 세이브 스키마는 무변경(마이그레이션 불필요) |
| 개발 리드 결정 | **확인 대기** — 특히 ②의 'null = 미확정' 표기 방식과 ③의 정본 일원화 승인 요청 |
| 적용 커밋 | (이 브랜치의 스프린트 A 툴링 커밋) |

**[A8/§8 차단 보고 — 다른 창 소유 파일의 제거 필요 항목]**

`npm run verify:sprint-a`의 자동 판정이 현재 **2건 실패**다. 둘 다 툴링 창이
고칠 수 없는(소유 밖) 대상이므로 해당 창에 제거를 요청한다:

1. **§8 문서 회귀 7건** — 7차 결의 1-⑦('전 심도 조준(구 심도 전용 규칙 폐기)'을 전 문서에서 삭제,
   코드-문서 동시 갱신)의 미이행분. 회의록 원문 2건은 역사 기록으로 자동 분류·제외됨.

   | 위치 | 소유 |
   |---|---|
   | `src/systems/PeriscopeAimSystem.ts:9` "전 심도에서(구 규칙 폐기)" | 게임플레이 |
   | `src/systems/__verification__/verifyGameplay.ts:670` "전 심도 조준(구 심도 전용 규칙 폐기)" | 게임플레이 |
   | `docs/CURRENT_STATUS.md:94` (게임플레이 구역) | 게임플레이 |
   | `docs/PROJECT_STATE.md:138·167` | 통합 관리자 |
   | `docs/NEXT_SPRINT.md:25` | 통합 관리자 |
   | `docs/D10_INTEGRATION_CHECKLIST.md:56` | 통합 관리자 |

   ※ `docs/deep_dive_master_plan.md:245`도 같은 문구를 담고 있으나 게이트 전
   수정 금지 문서라 역사 기록으로 분류했다 — 마스터 플랜 각주 처리 여부는 리드 판단.

2. **A8 이관 미완** — 미확정 필드 114개(= 기획 수치표 미도착), 잔여 provisional
   경제 파일 2건: `src/meta/provisionalEconomy.ts`(리드), `src/systems/provisionalCargo.ts`(게임플레이).
   게임플레이 브랜치의 `src/systems/economy/provisionalEconomy.ts`·`provisionalEquipment.ts`도
   병합 시 같은 목록에 잡힌다. **A8은 기획 경제 수치표(PvE D+3 절대 마감)가
   도착해야 통과 가능**하다 — 툴링은 그릇(구조·검증기)만 완성했다.



### INT-RENDER-008 — [LOOP][ECON] Sprint A 조준 시각·성장 UI 배선·상태 요청 (검증 완료 코드 예시 포함)

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (Sprint A 창3 — 회의록 13·14) |
| 대상 시스템 | core/Game(조립 배선), 게임플레이(미세 조준각·전 심도 조준·출항 집계), 리드(구매·장착·출항 저장 트랜잭션), contracts(소켓·포트 이관 여부) |
| 필요한 변경 | 아래 ①~④ |
| 변경 이유 | 렌더·UI 구현은 완료 — 실상태·command 배선 지점이 보호 파일(core/Game)과 타 파트 소유라 배선 없이는 실사용 경로가 열리지 않음 |
| 관련 게이트 | [LOOP] 조준 시각 · [ECON] 구매 트랜잭션 UX |
| 영향을 받는 파일 | src/core/Game.ts(배선), src/meta/MetaLoop.ts(집계 getter), 게임플레이 조준 시스템, src/ui/* (수신 측 — 구현 완료) |
| 하위 호환 여부 | 전부 추가 — 기존 구독·시스템 영향 없음 |
| 개발 리드 결정 | **대기** |
| 적용 커밋 | — |

**① 리드 배선 요청 (core/Game — 아래 코드는 TEMP-WIRING으로 실측 검증 후 원복한 예시다).**
`composeSystems()` 말미(메타 루프·업그레이드 생성 이후)에:

```ts
import { EconomyHud } from '../ui/EconomyHud';
import { SortiePrepScreen } from '../ui/SortiePrepScreen';
import { createEquipmentUiPort } from '../ui/metaEconomyPorts';

const metaLoop = this.metaLoop; const upgrades = this.upgrades;
const walletSource = {
  get metaState() { return metaLoop.metaState; },
  get wallet() { return metaLoop.wallet; },
};
const hud = new EconomyHud(this.container);
hud.attachWalletSource(walletSource);
const screen = new SortiePrepScreen(this.container);
screen.attachWalletSource(walletSource);
screen.attachUpgradePort({
  listOffers: () => catalog.map((def) => ({
    statId: def.id, displayName: def.label,
    currentLevel: upgrades.currentLevels[def.id] ?? 0,
    maxLevel: def.maxLevel,
    nextEffectText: `${def.label} +${Math.round(def.bonusPerLevel * 100)}%`,
    cost: null, // 공식 경제 params 부재 — 가격 미표시 (UI 가격 발명 금지)
  })),
  purchase: null, // ③ 구매 트랜잭션 배선 시 교체
});
screen.attachEquipmentPort(createEquipmentUiPort(gameplay.equipment));
screen.attachDeparturePort({ confirmDeparture: () => { /* ④ 참조 */ } });
// 매 프레임: hud.update(); screen.update(); — Game.update() 또는 registry 시스템로
```

기지 화면 UI가 배선되면 `render()`의 자동 출항 2줄과 ControlsHud의
`launchSortie` 옵션은 이 화면의 출항 버튼으로 대체된다(중복 진입점 금지 —
Game.ts 주석의 예정 사항 그대로). 검증 결과: 실지갑(세이브 로드 0/0) 표시,
실카탈로그(params/upgrades.json label·maxLevel) 표시, 실 EquipmentSystem
장착/해제/교체 command 왕복, 출항 버튼 → SORTIE 전환·화면 자동 숨김 확인.

**② 게임플레이 상태 요청.**
- **미세 조준각 소스**: `CanyonScene.attachAimAngleSource({ yawRadians, pitchRadians })`
  (구조적 인터페이스 `AimAngleSource`, CanyonScene 수출). aiming.json 한계각·
  감도·복귀(13차 결의 4)는 게임플레이가 판정하고 렌더는 결과 각만 소켓
  로컬축(yaw=로컬 Y·양수 좌, pitch=로컬 X·양수 위)에 더한다. 미주입 시 0(정면).
- **전 심도 조준**: 현 PeriscopeAimSystem은 잠망경 심도 게이트가 남아 있다.
  렌더 측은 심도 분기가 없어(소켓 추종) 게이트 제거 즉시 전 심도 동작한다.
- **출항 중 획득 집계 getter**: MetaLoop 내부 집계(tally)의 읽기 전용 공개
  (예: `creditsEarnedThisSortie`/`rarePartsSecuredThisSortie`). UI는 임시
  지갑 금지 원칙으로 lootDropped 합산을 하지 않는다 — getter 배선 전까지
  '집계 배선 대기'로 표기 중. `EconomyHud.attachSortieEarningsSource()` 수신.

**③ 리드 구매 트랜잭션 요청.** `UpgradePurchasePort.purchase(statId)`가
결과 코드(`'ok' | 'insufficientCredits' | 'insufficientRareParts' | 'maxLevel'
| 'slotFull' | 'alreadyEquipped' | 'saveFailed'`)를 돌려주는 구현. 판정·차감·
단계 반영·**구매 직후 저장, 실패 시 rollback**(13차 저장 시점 개정)은 전부
트랜잭션 소유 — UI는 결과 코드를 문구로 표시만 한다(저장 실패 문구는
`SAVE_FAILED_MESSAGE` 지정 문구, 내부 예외 문자열 비노출). 장착 변경 직후
저장도 동일 — 배선 시 `createEquipmentUiPort` 어댑터를 트랜잭션 포트로 교체.

**④ 툴링·리드 출항 확정 직전 저장.** `DeparturePort.confirmDeparture()` 구현
예시: `beginSortiePrep()` → `SaveBridge.writeSnapshot()`(툴링 저장 구조) →
실패 시 `cancelSortiePrep()` + `'saveFailed'` 반환(**해역 전환 없음**, §10)
→ 성공 시 `launchSortie()` + `'ok'`. `saveRequested` cause에 구매·장착·출항
3종 추가는 리드 계약 개정 사안(13차 결의 5).

### INT-GAME-009 — 스프린트 A 계약 요청: 앵커·2소켓 / 구매 트랜잭션 / 지갑·저장 포트 / 조준 params

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (스프린트 A 창 2) |
| 대상 시스템 | 리드 창(창 1) 산출물: `torpedoTubeAnchor`·`aimCameraSocket`·`torpedoSpawnSocket`, 구매 트랜잭션 구조, 조준·구매·장비·저장 계약 / 툴링 창(창 4) 산출물: `params/aiming.json`(+validator), 경제 가격 params |
| 필요한 변경 | ① **앵커·2소켓 계약** [13차 결의 2] — 현재 게임플레이가 `src/systems/collision/torpedoTubeSocket.ts`에 소비 지점 겸 **안전 오프셋 단일 정의**를 두고 선진행 중(수치는 새로 만들지 않고 기존 `submarineHull` 기하에서 파생). 리드 계약 도착 시 이 파일은 계약을 읽는 어댑터로 축소되거나 삭제된다 ② **구매 트랜잭션 틀** [보완분 결의 7] — 순서·롤백 규격은 회의록대로 구현했고(스냅샷→재검증→차감→적용→저장→확정/롤백), 판정 내용(사유 5종)은 게임플레이 소유. 리드의 공식 구조가 오면 `economy/purchaseTypes.ts`의 결과 타입을 그 계약으로 승격 요청 ③ **지갑·저장 포트** — `PurchaseWalletPort`(credits·rareParts·applyDelta)·`PurchaseSavePort`(save(): boolean)를 조립부가 리드 `MetaLoop` 지갑과 툴링 `SaveStore`에 바인딩해야 한다. 게임플레이는 `GameplaySystems.attachBaseEconomy(purchase, savePort)` 진입점을 제공한다 ④ **조준 params** — `aiming.json` 4종(yaw 15 / pitchUp 10 / pitchDown 15 / sensitivity 0.5, 전부 양수 크기)이 오면 `provisionalAiming.ts` 삭제. 추가로 **조준 감도 기준값**(일반 카메라 라디안/픽셀 = 렌더 `ORBIT_RADIANS_PER_PIXEL` 0.005)이 현재 렌더와 게임플레이에 **중복 정의**되어 있다 — 공통 기준을 `aiming.json` 또는 리드 계약에 두기를 요청 ⑤ **가격 params** — `upgrades.json`에 가격 필드가 없어 `economy/provisionalUpgradeCost.ts`로 선진행(단계 선형). 공식 경제 수치표 도착 시 주입 교체 |
| 변경 이유 | 스프린트 A 창 2 범위(전 심도 조준·미세 조준·탄도 일치·구매 판정·장비 변경·롤백) 구현 완료. 회의 14 병합 순서는 리드→게임플레이인데 리드 창 계약이 원격에 아직 없어, **계약 복제 없이** 소비 지점 단일화로 선진행함 |
| 관련 게이트 | A1~A8 (특히 A5 저장 실패 롤백 T1~T6, A7 재접속 유지) |
| 영향을 받는 파일 | `src/systems/SubmarineAimSystem.ts`·`aimGeometry.ts`·`provisionalAiming.ts`·`collision/torpedoTubeSocket.ts`·`StraightRunTorpedoSystem.ts`·`EquipmentSystem.ts`·`economy/{UpgradePurchaseSystem,purchaseTypes,provisionalUpgradeCost}.ts`, 조립부 `src/core/Game.ts`(지갑·저장 포트 바인딩) |
| 하위 호환 여부 | 깨짐 없음 — 계약 파일 무수정, 게임플레이 내부 구현·주입 지점만. `AimSystem` 계약 시그니처 불변(toggleAim 등은 구현체 확장) |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### INT-CORE-009 — 스프린트 A 리드 구현: 소켓 rig·트랜잭션 오케스트레이터·조립 기준

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (창 1 — INT-CORE-008 계약의 리드 파트 구현) |
| 대상 시스템 | `src/world/torpedoTubeAnchor.ts`(신규 — 앵커·안전 오프셋 단일 정의), `src/core/TorpedoTubeSocketRig.ts`(신규 — TorpedoTubeSocketSource 단일 구현), `src/meta/PurchaseTransaction.ts`·`EquipmentTransaction.ts`(신규 — 원자성 틀), `src/meta/MetaLoop.ts`(WalletTransactionPort 구현·sortieLaunch 저장), `src/core/PveIntegration.ts`(UpgradeState = UpgradeLevelsPort), `src/core/Game.ts`(rig 조립·디버그 핸들) |
| 필요한 변경 | 위 신규 4파일 + 기존 2파일 확장. 앵커 수치는 기존 동작 보존(중심에서 3.35m 생성 유지 — 구 SPAWN_OFFSET과 동일) |
| 관련 게이트 | A3(십자선=탄도)·A5(A5-T1~T6)·A6·A7·A8 지원 구조 |
| 하위 호환 여부 | 기존 시스템 무변경 — 게임플레이·렌더 파일 미수정. 메타 검증 35/35(신규 16 포함)·게임플레이 100/100 유지 |
| 개발 리드 결정 | 승인 (창 1 소유 범위). 트랜잭션 실배선은 게임플레이 판정 포트 병합 후(아래 지침) — 더미 판정·any 캐스팅으로 선배선하지 않는다 |
| 적용 커밋 | (본 브랜치 [LOOP] 구현·배선 커밋) |

**각 창 적용 지침 (스프린트 A — 병합 순서: 리드 → 게임플레이 → 그래픽스 → 툴링):**

- **게임플레이 창**: ① 조준 재작성 — 전 심도 허용·자동 부상 제거·조준 중 기동, `FineAimSource` 구현(로컬 yaw/pitch, 클램프는 `conventions.clampAimYaw/PitchRadians`만, 해제 시 0 reset). `PeriscopeAimSystem`의 잠망경 조건·이름 정리(파일 소유권 게임플레이 — 리드는 수정하지 않았음) ② 어뢰 생성 — `tubeSockets.torpedoSpawnSocket` 소비(위치+전방 3D), 자체 `SPAWN_OFFSET_METERS`·`bowDirectionXZ` 방향 계산 삭제 ③ `UpgradePurchaseJudgePort`·`EquipmentChangeJudgePort` 구현(불가 사유 5종 산출 — 가격·상한은 params/경제 수치표) ④ 세션 리셋에 조준 미세각 0 포함
- **그래픽스 창**: ① 조준 카메라 — `tubeSockets.aimCameraSocket` 소비(자체 오프셋 계산 금지), 자기 선체 제외는 조준 카메라 레이어 마스크 한정 ② 기지·구매·장비 UI는 `BaseScreenPort`만 소비(MetaLoop·지갑 직접 접근 금지), 불가 사유 5종 + 저장 실패 문구 구분 표시(내부 예외 비노출)
- **툴링 창**: ① `params/aiming.json` + validator + `GameParams.aiming` 편입(계약: contracts/params.ts `AimingParams` — 양수 크기 검증, `aimReturnBehavior` 키 거부) ② SavePort 어댑터: `{ save: () => { saveBridge.writeSnapshot(); return saveBridge.lastSaveSucceeded; } }` ③ 저장 실패 강제 테스트 저장소로 A5-T1~T6 검증(트랜잭션 계약 테스트 16항목은 `npm run verify:meta`에 이미 포함) ④ '전 심도 조준(구 심도 전용 규칙 폐기)' 문서 제거 확인 — 잔존 위치: `src/systems/PeriscopeAimSystem.ts`·`verifyGameplay.ts`(게임플레이 창 수정분), PROJECT_STATE.md(통합 담당)
- **통합 창 (리드 병합 시 배선 스니펫 — 게임플레이 판정 포트 병합 후 composeSystems에 추가):**

```ts
const savePort = { save: () => { saveBridge.writeSnapshot(); return saveBridge.lastSaveSucceeded; } };
const purchaseTx = new PurchaseTransaction(gameplay.purchaseJudge, this.metaLoop, this.upgrades, savePort);
const equipmentTx = new EquipmentTransaction(gameplay.equipmentJudge, savePort);
this.tubeSockets.attachFineAimSource(gameplay.aim); // FineAimSource 구현 후
const baseScreen: BaseScreenPort = {
  get wallet() { return metaLoop.wallet; },
  get upgradeLevels() { return upgrades.currentLevels; },
  get loadout() { return gameplay.equipment.loadout; },
  get canLaunchSortie() { return metaLoop.metaState === 'BASE'; },
  launchSortie: () => { /* 기존 HUD launchSortie 경로 이관 */ return true; },
  purchaseUpgrade: (id) => purchaseTx.run(id),
  changeEquipment: (request) => equipmentTx.run(request),
};
```

### INT-CORE-008 — 스프린트 A 선행 계약: 발사관 소켓·미세 조준·구매/장비 트랜잭션·저장 시점

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (14차 소회의 창 1 — 계약 생산자. 근거: 7차 대회의 결의 1~9 + 13차 소회의 결의 2·3·4·7·8·9) |
| 대상 시스템 | `src/contracts/systems.ts`(AimSystem 개정 + FineAimSource·SocketPose·TorpedoTubeSocketSource), `src/contracts/params.ts`(AimingParams), `src/contracts/meta.ts`(PurchaseDenialReason 5종·TransactionResult·판정/지갑/단계/저장 포트·EquipmentChangeRequest·BaseScreenPort), `src/contracts/events.ts`(saveRequested cause + sortieLaunch), `src/core/conventions.ts`(clampAimYaw/PitchRadians·aimForwardDirection) |
| 필요한 변경 | ① **폐기 규칙 제거**: AimSystem 계약에서 '전 심도 조준(구 심도 전용 규칙 폐기)' 문구 삭제 — 전 심도 조준·심도 불변·해제 시 미세각 reset으로 개정 (재도입 금지 명문화) ② 소켓 2구조: torpedoTubeAnchor → aimCameraSocket(정위치)·torpedoSpawnSocket(+고정 안전 오프셋, 정의 단일 지점) — 동일 좌표계·동일 전방축, 십자선=탄도, 시스템별 오프셋 계산 금지, Three.js 비노출 ③ 미세 조준: AimingParams 4종(양수 크기 규칙, aimReturnBehavior 없음) + 공용 클램프·전방 벡터 함수(카메라·조준·테스트 동일 함수) ④ 구매 불가 5종·트랜잭션 결과 3종(저장 실패는 별도 status — 내부 예외 UI 비노출) ⑤ 원자적 구매·장비 트랜잭션 포트(스냅샷→재검증→차감→적용→저장→commit/rollback — 틀=리드/내용=게임플레이) ⑥ 저장 시점 5종: 이벤트 3(settlement·rarePart·**sortieLaunch 신설**) + 트랜잭션 직접 저장 2(구매·장비 — 중복 이벤트 금지) ⑦ 기지 화면 BaseScreenPort(UI의 유일 진입점) |
| 변경 이유 | 스프린트 A 4개 창(게임플레이 조준·판정 / 그래픽스 조준 카메라·UI / 툴링 aiming.json·저장 테스트)이 전부 이 계약의 소비자 — 선행 확정 없이는 각 창이 임시 인터페이스·개별 오프셋을 만들게 됨 (7차 결의 1-① 금지 조항) |
| 관련 게이트 | A1~A8 전부 (특히 A3 십자선=탄도, A5 트랜잭션, A7 저장 유지) |
| 영향을 받는 파일 | 계약 4파일 + conventions + INTERFACES.md. 소비: 게임플레이(조준 재작성·판정 포트 구현), 그래픽스(소켓 소비 카메라·UI), 툴링(aiming.json+validator+GameParams.aiming 편입·SavePort 어댑터·A5-T 테스트) |
| 하위 호환 여부 | 기존 코드 무변경(추가+doc 개정만) — AimSystem 시그니처 불변이라 PeriscopeAimSystem 컴파일 유지(동작 개정은 게임플레이 창 몫). AimingParams는 GameParams 미편입 상태로 선행(편입은 툴링 창이 json·validator와 동시에) |
| 개발 리드 결정 | 승인 — 창 1 소유 범위. 소켓 rig 구현·트랜잭션 오케스트레이터는 후속 커밋(INT-CORE-009) |
| 적용 커밋 | (본 브랜치 선행 계약 커밋) |
### INT-TOOL-007 — [LOOP][ECON] PvE 툴링 배선 요청: 저장 시점·경제/기지 이벤트 계약·병행 키 E·보스 오디오

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴 (PvE 성장 루프 기반 작업 — 회의록 10·11 위임분) |
| 대상 시스템 | 메타 루프(리드, 신규), `src/contracts/events.ts`(이벤트 제안 — 미수정), 게임플레이 입력, 보스 상태 머신(리드) |
| 필요한 변경 | ① **저장 시점 배선(리드)**: 기지 귀환 정산 확정 시 + 희귀 부품 획득 즉시 `defaultSaveStore.save()` 호출 (`src/meta/save/` — docs/SAVE_SYSTEM.md). 그 외 자동 저장 금지 [확정] ② **이벤트 계약 제안(승인 대기 — 계약 파일 미수정)**: `creditsGained { amount }` / `rarePartAcquired { partId }` / `baseStateChanged { docked: boolean }` — 발행: 경제·메타 루프, 구독: AudioCueRouter(획득음·기지 전환음)·UI. 승인 시 AudioCueRouter 구독 1줄씩 추가 ③ **병행 키 E(게임플레이)**: 5차 결의 4의 E=상승 병행 키가 코드 미반영 — 입력 안내(1회 토스트)가 이미 E를 안내하므로 **D+9 빌드 전 바인딩 필수** (Ctrl/Shift 스왑 반영과 함께) ④ **보스 오디오(리드→툴링)**: 침묵 전환은 `WebAudioSystem.setMusicSilenced()` 배관 준비 완료 — 호출 시점(단계 전환 판정)은 보스 상태 머신 소유. 단계 이벤트 계약(예: `bossPhaseChanged`)은 보스 구현 착수 시 제안 |
| 변경 이유 | 저장·오디오 배관은 완성됐으나 호출 지점(메타 루프·경제 판정)이 다른 파트 소유 — 배선 없이는 저장이 실행되지 않음 |
| 관련 게이트 | [LOOP] 2단계 Exit Criteria (출항→파밍→귀환→강화 저장 포함 완주) |
| 영향을 받는 파일 | 메타 루프 신규 코드(리드), events.ts(승인 시), src/audio/AudioCueRouter.ts(구독 추가), 게임플레이 KeyboardInput |
| 하위 호환 여부 | 이벤트 추가만 — 기존 구독자 영향 없음 |
| 개발 리드 결정 | **대기** |
| 적용 커밋 | — |

### INT-TOOL-006 — [LOOP] 보호 파일 선반영: package.json 스크립트·playwright-core devDep·CI 스코프 가드 단계

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴 (PvE 툴링 작업 — CI·검증 러너·빌드 설정은 세션 위임 소유) |
| 대상 시스템 | `package.json`(공통 보호), `.github/workflows/ci.yml`(툴링 소유) |
| 필요한 변경 | ① scripts 4종 추가: `check:scope`(스코프 가드) / `verify:tooling`(세이브·업그레이드·폴백 26항목) / `verify:gameplay`(기존 러너 별칭) / `verify:hud`(브라우저 33항목 — Chromium 필요, CI 제외) ② devDependency `playwright-core@^1.62.1` (브라우저 다운로드 없음 — verify:hud 전용) ③ CI에 `check:scope --strict`·`verify:tooling`·`verify:gameplay` 단계 추가 |
| 변경 이유 | 소회의(11) 결의 4 "가드를 도구가 지키게" + 검증 러너 재현성(스크래치패드 스크립트의 저장소 반입) |
| 관련 게이트 | [LOOP][ECON] 스코프 가드 기계 강제 |
| 영향을 받는 파일 | package.json, package-lock.json, .github/workflows/ci.yml, scripts/check-scope-guard.mjs·verify-hud.mjs(신규) |
| 하위 호환 여부 | 기존 스크립트·의존성 무변경 (추가만) |
| 개발 리드 결정 | **확인 대기 + 정책 선택지 보고** — 스코프 가드 위반 처리: 회의 문언은 '빌드 **경고**'(소회의 결의 4), 이번 작업 지시는 'CI **실패** 가능하면'. 현재 구성 = 로컬 기본 경고 / CI `--strict` 실패. 회의 문언 우선 시 CI에서 `--strict`만 제거하면 됨 |
| 적용 커밋 | (이 브랜치의 PvE 툴링 커밋) |


### INT-RENDER-007 — 기지 화면·외형 단계(visualTier) 메타 배선 요청 (PvE 단계 2)

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (feat/render — PvE 성장 루프 시각 준비분) |
| 대상 시스템 | 리드 메타 루프 상태 머신(신규, 11차 결의 2)·`src/core/Game.ts`(장면 전환 배선) |
| 필요한 변경 | ① 기지 상태 진입 시 `BaseSceneView`(src/render — ManagedScene 구현)를 SceneManager 활성 장면으로 전환, 해역 진입 시 CanyonScene 복귀 ② 메타 상태의 외형 단계를 렌더에 주입: 기지 = `baseView.applyMetaVisualState({ hullVisualTier, weaponVisualTier })`, 해역 = `scene.setSubmarineVisualTiers(hull, weapon)` — **렌더는 명시적 visualTier만 소비**하며 업그레이드 수치·저장 데이터를 읽지 않는다 ③ 기지 상태에서 전투 HUD 숨김(툴링 협의) |
| 변경 이유 | D+9 성장 루프 빌드(출항→파밍→귀환→강화)의 기지 화면·성장 외형이 렌더에 준비 완료 — 메타 루프(리드 신규 작성)와의 연결점만 필요. 그 전까지 QA 경로(`?base=1`·`?tiers=<h>,<w>`)로 검수 가능 |
| 관련 게이트 | PvE 단계 2 Exit Criteria (D+9 빌드) |
| 영향을 받는 파일 | 리드 메타 루프(위치 미정), `src/core/Game.ts`, (렌더 측 준비 완료: `BaseSceneView.ts`·`SubmarineVisual.ts`) |
| 하위 호환 여부 | 깨짐 없음 — 미배선 시 기존 해역 장면만 동작 |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### INT-RENDER-006 — 어뢰 상태 주입 배선 요청 (어뢰 가시화·기포 항적, 5차 결의 2)

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (feat/render) |
| 대상 시스템 | `src/core/Game.ts` (공통 보호 — composeSystems 1줄) |
| 필요한 변경 | `scene.attachEventBus(this.bus);` 다음 줄에:<br>`scene.attachTorpedoSource(gameplay.torpedo);`<br>— 렌더의 `TorpedoStateSource`(읽기 전용 `torpedoes` 스냅샷 + `torpedoSpeedMetersPerSecond`)는 `StraightRunTorpedoSystem`이 이미 구조적으로 충족 |
| 변경 이유 | 어뢰 로우폴리 모델·기포 항적(TorpedoVisuals — 풀링+인스턴싱 1드로우)과 조준경 내 리드샷 보조선이 어뢰 상태·속력을 소비해야 함. 임시 배선으로 실측 검증 완료(발사→어뢰·항적 표시, 스크린샷 확보) 후 원복 — 보호 파일 미수정 |
| 관련 게이트 | G3(발사 피드백)·G7, 5차 결의 2(리드샷 학습 피드백 P1) |
| 영향을 받는 파일 | `src/core/Game.ts` 1줄 (렌더 측 준비 완료: `TorpedoVisuals.ts`·`attachTorpedoSource` 포트) |
| 하위 호환 여부 | 깨짐 없음 — 미배선 시 어뢰·항적 미표시(기존 판정·투명 어뢰 상태와 동일) |
| 개발 리드 결정 | (대기) |
### INT-CORE-007 — 상위 메타 루프·업그레이드 배율 레이어 구현과 조립

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (PvE 1단계 — INT-CORE-006 계약의 리드 파트 구현) |
| 대상 시스템 | `src/meta/`(신규 — MetaState·MetaLoop·upgradeMath·settlement·provisionalEconomy·__verification__), `src/core/Game.ts`(메타 루프 등록·세션 포트 어댑터·부트 전환 이동) |
| 필요한 변경 | ① 2계층 상태 머신 상위(BASE→SORTIE_PREP→SORTIE→DEBRIEF, 허용표 밖 throw) — 하위 무수정 포장, 통신 3종 제한 ② 정산: 파괴 시 크레딧 손실(임시 50%)·희귀 즉시 확정·저장 요청 발행 ③ 업그레이드 합연산 순수 함수(effectiveValue·effectiveDurationSeconds·mergeModifiers — params 불변) ④ Game 조립: metaLoop 최선두 등록, BOOT→DEPARTURE 전환을 SortieSessionPort 어댑터로 이동(세션 시작이 상위 루프 경유), 기지 화면 도입 전 임시 자동 출항 ⑤ 결정적 검증 19항목(`node src/meta/__verification__/run.mjs`) |
| 변경 이유 | PvE 소회의 결의 2·4의 리드 담당 구현. 각 파트(경제·저장·기지 UI)가 붙을 골격 선행 제공 |
| 관련 게이트 | PvE D+4(메타 루프에서 세션 시작·정산 전달)·D+9(성장 루프 완주) Exit Criteria |
| 영향을 받는 파일 | src/meta/* (신규), src/core/Game.ts |
| 하위 호환 여부 | 하위 세션 코드 무수정 — 기존 결정적 검증 75/75 유지. 부트 전환 경로만 first render → 포트 어댑터로 이동 (동작 동일) |
| 개발 리드 결정 | 승인 (자기 소유 영역). **R7 임시값 1건**: 파괴 손실률 0.5 [30~70%] — `src/meta/provisionalEconomy.ts` 한 곳, 기획 경제 수치표(D+3 병목) 도착 시 `params/economy.json` 이관·파일 삭제 |
| 적용 커밋 | (본 브랜치 [LOOP] 구현 커밋) |

**각 파트 적용 요청 (INT-CORE-006·007 소비):**
- **게임플레이**: ① `src/systems/economy/` — Faction 태그 부여(화물선 hostile부터), 드롭 테이블, `lootDropped` 발행, 중립 공격 판정 → `guardShipRequested` 발행 ② 세션 리셋 API(재출항 시 전투 세션 초기화 — SortieSessionPort 어댑터가 호출할 진입점) 제공 ③ 세션 종료 판정(파괴·귀환 지점 도달) 시 `MetaLoop.settleSortie` 호출 경로는 리드와 조립 협의 ④ 보스 약점 판정 →`bossWeakPointChanged` 발행 (판정 소유)
- **빌드·툴**: ① `src/meta/save/` — SaveSystem(스키마 버전+마이그레이션 틀+이중 슬롯), `saveRequested` 구독, 저장 데이터는 MetaLoop.wallet 등 스냅숏 주입으로 수신 ② 업그레이드 시뮬레이터 — **`src/meta/upgradeMath.ts` 동일 함수 사용**(계산 복제 금지) ③ 스코프 가드 빌드 경고(upgrades.json 8항목↑) ④ HUD에 중도 귀환 버튼 → `returnToBaseRequested` 발행
- **그래픽스**: 기지 화면(`metaStateChanged` 구독 — BASE에서 표시), 보스 연출은 `bossPhaseChanged`·`bossWeakPointChanged` 구독만(판정 계산 금지), 보스 분절 애니 1주차 스파이크(P13)
- **기획**: `params/economy.json`(손실률 50% [30~70]·드롭량)·`params/upgrades.json`(7항목 단계·비용) 작성 — PvE D+3 절대 마감(병목), [ECON] 태그

**PROJECT_STATE.md 갱신용 사실 목록 (통합 담당 최종 갱신 — 리드 기록):**
① 코드 트랙이 PvE 1단계 착수 상태로 진입 — 상위 메타 루프(src/meta)·PvE 계약(contracts/meta.ts) 반영 ② '아직 없는 것' 목록에 PvE 항목 추가 필요: 기지 화면·저장·업그레이드 화면·economy·보스 ③ 조작표는 유효하나 상단 배너의 "PvE 전환 코드 미반영" 문구는 본 브랜치 병합 시 갱신 대상 ④ 구 세션형 범위 설명(§1 '한눈에 보기'의 세션형 정의)은 회의록 10 결의 1·P1로 대체

### INT-CORE-006 — PvE 전환 선행 계약 (메타 루프·경제·업그레이드·보스)

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (6차 대회의 `meetings/10`·개발팀 소회의 `meetings/11` 결의의 계약 번역 — PvE 1단계 착수 선행분) |
| 대상 시스템 | `src/contracts/meta.ts`(신규), `src/contracts/events.ts`(이벤트 9종 추가), `src/contracts/systems.ts`(CargoShipStateSource.faction 선택 필드) |
| 필요한 변경 | ① 메타 타입: `MetaStateId`(BASE/SORTIE_PREP/SORTIE/DEBRIEF)·`SortieOutcome`(returned/aborted/destroyed)·`SortieReport`·`SortieSettlement`(earned/lost/net/희귀 확정)·`SortieSessionPort`(start/requestReturnToBase — 계층 통신 3종 중 상위→하위) ② 경제: `FactionId`(hostile/neutral/patrol 태그)·`LootSource`·`CurrencyBundle`(크레딧·희귀 부품 이원화) ③ 업그레이드: `UpgradeStatId` 7항목 상한·`UpgradeModifiers`(합연산 — 최종값 = 기준값 × (1+보정 합)) ④ 장비: `EquipmentId` 4종 상한·`EquipmentLoadout` ⑤ 보스: `BossPhase`(1/2/3) ⑥ 이벤트: `metaStateChanged`·`sortieStarted`·`sortieEnded`·`returnToBaseRequested`·`lootDropped`·`guardShipRequested`·`saveRequested`(settlement/rarePart)·`bossPhaseChanged`·`bossWeakPointChanged` |
| 변경 이유 | PvE 전환 작업(게임플레이 Faction·드롭, 툴링 저장·시뮬레이터, 렌더 기지·보스 연출)이 전부 이 계약에 의존 — 각 창이 서로 다른 형태로 임시 정의하기 전에 선행 확정 필요 |
| 관련 게이트 | PvE 트랙 전체 (D+9 성장 루프·D+16 완주 Exit Criteria) |
| 영향을 받는 파일 | 계약 3파일 + INTERFACES.md §1·§2c. 소비 측: src/meta(리드), src/systems/economy(게임플레이), src/meta/save(툴링), 렌더 기지·보스 연출 |
| 하위 호환 여부 | 깨짐 없음 — 전부 추가. `faction`은 선택 필드(미지정 = hostile 과도기 호환, 게임플레이 태그 작업 후 필수 승격 예정) |
| 개발 리드 결정 | 승인 — 신 스코프 가드(업그레이드 7항목·장비 4종)를 유니언 타입 상한으로 기계 강제. 계층 통신 3종 제한을 포트+이벤트로 고정. 저장 이벤트는 `saveRequested` 단일(cause 구분)로 통합 |
| 적용 커밋 | (본 브랜치 선행 계약 커밋) |

### INT-GAME-008 — PvE 경제·전투 계약 패키지 (이벤트·params·EffectiveParams·보스 포트)

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (PvE 전환 1·2단계 작업 창 — 회의 09·11 반영) |
| 대상 시스템 | `src/contracts/events.ts`, `src/contracts/params.ts`+`/params/economy.json`·`/params/upgrades.json`(신설 — 회의 11 결의 7), `src/contracts/systems.ts`(EffectiveParams·보스 단계 포트·Faction 승격) |
| 필요한 변경 | ① **이벤트 신설**: `aimRequired`(비조준 발사 시도 안내 — 결의 2), `creditsChanged { total, sortie }`, `guardSpawnRequested { x, z, provokedByTargetId }`, `rarePartAcquired { partId }`(즉시 저장 트리거 — 툴링 저장 소비), `bossWeakPointHit { kind, appliedDamage }` — 현재는 게임플레이 읽기 전용 상태·consume API·콜백(aimRequiredCount / consumeGuardSpawnRequests / RunEconomy.onRarePartAcquired / BossWeakPointTarget.onHit)으로 선진행 ② **경제·장비 params 이관** (기획 수치표 D+3 병목): 드롭 테이블·픽업 반경(6m)·손실률(0.4) → `src/systems/economy/provisionalEconomy.ts`, 장비 4종 수치·슬롯 수(2)·디코이 → `src/systems/provisionalEquipment.ts`, 보스 약점 배율(2.0/0.25) → `BossWeakPointTarget.provisionalBossWeakPointConfig` — 전부 R7 선진행 중 ③ **EffectiveParams 계약**: 업그레이드 합연산 배율 레이어(회의 11 결의 4)의 공급 측 계약 — 게임플레이는 `EquipmentSystem.setUpgradeModifiers(UpgradeModifiers)` 동등 주입점으로 선진행, 계약 확정 시 소비 경로 교체 ④ **보스 단계 포트**: `BossPhasePort { phase, weakPointOpen }` — 리드 보스 AI가 공급(게임플레이는 AI 내부 접근 없음) ⑤ CombatTarget의 `faction`·`dropTableId`·`hullBox`(어뢰·잠수함 충돌 공유 박스 — 5차 결의 1) 계약 승격 검토 |
| 변경 이유 | D+4(재화 획득)·D+9(성장 루프) 게임플레이 로직 구현 완료 — 표현·저장·AI 계층과의 정식 연결점과 수치 단일 소스만 남음 |
| 관련 게이트 | [ECON][LOOP][BOSS] 전반, G3(비조준 발사 차단) |
| 영향을 받는 파일 | 계약 3파일, params 2종(신설), `src/systems/economy/*`, `EquipmentSystem.ts`, `BossWeakPointTarget.ts`, `PeriscopeAimSystem.ts`, 툴링 저장·오디오 배관, 렌더 연출 |
| 하위 호환 여부 | 깨짐 없음 — 전부 추가. 선진행 상태·콜백은 이벤트 확정 후에도 폴링 경로로 유지 가능 |
| 개발 리드 결정 | (대기 — PvE 1차 통합에서 항목별 처리, 아래 '계약 이름 통합 결정' 참조) |
| 적용 커밋 | — |

### INT-CORE-005 — D+10 통합 배선·검증 핸들 (통합 담당 기록)

| 필드 | 내용 |
|---|---|
| 요청자 | D+10 통합 담당 (통합 지시서) |
| 대상 시스템 | `src/core/Game.ts` (공통 보호 — 통합 배선) |
| 필요한 변경 | ① `CanyonScene`·`GameplaySystems`에 `STARTING_CANYON_LAYOUT` **명시 주입** (기본 인자 의존 제거 — 렌더·충돌 단일 인스턴스 감사 가능화) ② `scene.attachCargoShipSource(gameplay.cargoShipState)`·`scene.attachEventBus(bus)` (INT-RENDER-005 이행) ③ 개발 모드 한정 `__deepDiveDebug` 읽기 전용 검증 핸들 (pose·cargo·aim·torpedo·layout·camera — 실제 인스턴스 노출, 더미 없음, 프로덕션 번들 제외, `__deepDiveInput` 관례 준수) |
| 변경 이유 | D+10 통합 지시서 §5 최종 조립 + 실제 Chromium 플레이테스트(§7)의 상태 관측 요구 |
| 관련 게이트 | G1·G3·G5·G6·G7 (통합 검증 전반) |
| 영향을 받는 파일 | `src/core/Game.ts` |
| 하위 호환 여부 | 깨짐 없음 (주입 명시화·배선 추가·dev 전용 핸들) |
| 개발 리드 결정 | 통합 담당 기록 — dev PR 리뷰에서 리드 최종 확인 |
| 적용 커밋 | (D+10 통합 커밋) |

### INT-TOOL-005 — 입력 모드 2원화 확정: '조준 버튼 = Pointer Lock 진입 겸용' 해석 폐기

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴·UI (화면 버튼·Pointer Lock 실브라우저 최종 검증) |
| 대상 시스템 | `src/ui/ControlsHud.ts`(일시정지 오버레이 — 모드 선택), 회의 결정 해석 |
| 필요한 변경 | **회의 문구 해석 기록** — "조준 버튼은 Pointer Lock 진입 요소도 겸할 수 있음"은 실브라우저 제약과 충돌: Pointer Lock 상태에서는 커서가 없어 DOM 버튼을 클릭할 수 없으므로, 조준 버튼이 잠금을 걸면 그 즉시 발사 버튼을 누를 수 없게 된다. **"플레이어가 마우스 방식과 화면 버튼 방식 중 선택 가능"이라는 핵심 목표를 우선**하여 다음 규칙으로 확정: ① 캔버스 클릭 = Pointer Lock **마우스 모드** 진입(우클릭 조준·좌클릭 발사) ② 화면 조준·발사 버튼 = **잠금 없는 UI 모드**에서 같은 AimSystem의 beginAim()/fireTorpedo() 직접 호출(강제 재잠금 없음, 게임 루프 실행 유지) ③ Esc = 마우스 모드 종료 → 일시정지 오버레이에서 '마우스 모드로 계속(잠금 재진입)' / **'화면 버튼으로 계속(잠금 없음)'** 중 선택 ④ 두 모드는 동일 `gameplay.aim`·잔탄·재장전 상태 공유 |
| 변경 이유 | 실브라우저 검증에서 확인: Esc 해제 시 무조건 일시정지+전체 오버레이라 화면 버튼 모드로 계속할 경로가 없었음(버튼 모드 차단). 오버레이에 잠금 없는 재개 경로 1개를 추가하는 것이 최소 변경(가상 커서·버튼 전용 시스템·잠금 중 DOM 클릭 흉내 전부 배제) |
| 관련 게이트 | G3(60초 첫 발사 — 두 입력 경로 모두), G5 |
| 영향을 받는 파일 | src/ui/ControlsHud.ts(+오버레이 선택 버튼 2개·resumeWithoutLock), src/styles.css(스타일 — 자율 영역). 계약·Game.ts 무변경 |
| 하위 호환 여부 | 유지 — 기존 배경 클릭(마우스 모드 재개)·Esc 일시정지 동작 그대로, 경로 추가만 |
| 개발 리드 결정 | **확인 대기** — 회의 문구와 해석이 다른 지점이므로 리드·기획 확인 요청. 실측 근거: 시나리오 A/B/C 브라우저 검증 20/20 (모드 전환·상태 공유·중복 발사 없음) |
| 적용 커밋 | (이 브랜치의 입력 모드 2원화 커밋) |

### INT-TOOL-004 — HUD 전투 버튼 ↔ AimSystem 배선 (Game.ts 선반영 — 리드 확인 대기)

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴·UI (HUD ↔ AimSystem 연결 작업) |
| 대상 시스템 | `src/core/Game.ts`(공통 보호 — composition root 배선), `src/ui/ControlsHud.ts` |
| 필요한 변경 | ① `composeSystems()`가 `GameplaySystems`를 반환 ② `start()`에서 HUD에 `{ aim: gameplay.aim, torpedo: gameplay.torpedo }`·`bus` 주입 — INT-CORE-002의 "HUD 버튼은 composition root에서 같은 aim 인스턴스 호출" 규칙의 실배선. 정확한 코드는 아래 예시 |
| 변경 이유 | 임시 `CombatIntentSink`(개발 로그) 제거, 화면 버튼이 실제 조준·발사를 수행해야 함. HUD는 게임플레이 구현체를 import하지 않고 계약 단면(`Pick<AimSystem,...>`)만 본다 |
| 관련 게이트 | G3, G7 |
| 영향을 받는 파일 | src/core/Game.ts(+약 12줄), src/ui/ControlsHud.ts(sink 삭제·이벤트 구독) |
| 하위 호환 여부 | 유지 — 계약 무변경, composeSystems 반환 타입만 void→GameplaySystems |
| 개발 리드 결정 | **확인 대기** — 작업 지시에 따라 선반영. feat→dev 병합 시 리드가 이 배선을 채택·재작성 |
| 적용 커밋 | (이 브랜치의 HUD 연결 커밋) |

리드가 dev 병합 시 사용할 배선 코드 (Game.start, composeSystems 뒤):

```ts
const gameplay = this.composeSystems(params, scene); // 반환 타입: GameplaySystems
this.registry.initializeAll({ bus: this.bus, params, stateMachine: this.stateMachine });

this.controlsHud = new ControlsHud(this.container, canvas, {
  setPaused: (paused) => (paused ? this.loop.stop() : this.loop.start()),
  combat: { aim: gameplay.aim, torpedo: gameplay.torpedo },
  bus: this.bus,
});
// stop()에서: this.controlsHud?.dispose(); this.controlsHud = null; (registry.disposeAll 앞)
```

**후속(리드 배선 대기 — 렌더 브랜치 병합 시):** 화물선 상태 주입은 현재
CanyonScene에 `attachCargoShipSource`가 없어(렌더 `cbcbf65` 미병합) 배선
불가 — 더미·캐스팅 없이 보류. 렌더 병합 후 composeSystems의
`scene.attachPoseSource(gameplay.poseSource);` 바로 아래에 한 줄 추가:

```ts
scene.attachCargoShipSource(gameplay.cargoShipState); // CargoShipStateSource 계약 — ARCHITECTURE 'Game 조립 계약'
```

### INT-TOOL-003 — [폐기] 조준·발사 요청 이벤트 3종 제안 (구 #004)

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴·UI (조작 HUD 작업 — 당시 조준 계약 부재) |
| 필요한 변경 | ~~`aimStartRequested`/`aimEndRequested`/`torpedoFireRequested` 이벤트 신설~~ |
| 개발 리드 결정 | **폐기** — INT-CORE-002가 상위 해법으로 대체: 요청 이벤트 대신 `AimSystem` 공용 진입점 직접 호출(배선은 composition root) + 상태 통지는 `aimModeChanged`. 계약 파일은 처음부터 미수정이라 되돌릴 코드 없음. 함께 기록했던 이동 파라미터 4종 중 프로펠러 공회전(0.08)은 INT-CORE-002로, 후진·수직 비율은 INT-GAME-004로 각각 흡수됨 — '정지 시 선회 속도 배율 1.0'만 미이관(소비 코드 없음, 필요 시 기획·게임플레이가 INT-GAME-004 절차에 합류) |
| 적용 커밋 | (해당 없음 — 문서상 폐기) |

### INT-TOOL-002 — HUD 조립을 위한 보호 파일 최소 변경 (구 #003, 선반영 — 확인 대기)

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴·UI (조작 HUD 작업) |
| 대상 시스템 | `src/core/Game.ts`(공통 보호), `params/`(기획 소유 영역에 ui.json 신규) |
| 필요한 변경 | ① Game.start()에서 `ControlsHud` 생성·일시정지를 `GameLoop.stop()/start()`로 연결, stop()에서 dispose — 조립 코드만, 게임 규칙 없음 ② `params/ui.json` 신규(HUD 투명도·표시 기본값·존재감 축소 기준 5종) — GameParams 계약·validateParams는 무변경, 검증·핫리로드는 툴링 소유 `src/ui/uiParams.ts`에서 독립 수행 |
| 변경 이유 | HUD를 화면에 띄우는 유일한 조립 지점이 Game.start()임. 일시정지는 기존 GameLoop 재사용(새 상태 머신 상태 추가 없음) |
| 관련 게이트 | G3~G5 |
| 영향을 받는 파일 | src/core/Game.ts(+9줄), params/ui.json, src/ui/*, src/styles.css(스타일 추가 — 자율 영역) |
| 하위 호환 여부 | 유지 — 기존 계약·이벤트·검증 무변경 |
| 개발 리드 결정 | **확인 대기** — 작업 지시에 따라 선반영. params/ui.json은 기획 파트 통보 필요(밸런스 값 아닌 HUD 표시값) |
| 적용 커밋 | (이 브랜치의 HUD 커밋) |

### INT-RENDER-005 — Game 조립 배선 요청: 화물선 상태·torpedoHit 이벤트 주입 (코드 예시 포함)

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (feat/render — INT-CORE-003·004 적용 완료 분) |
| 대상 시스템 | `src/core/Game.ts` (공통 보호 — composeSystems) |
| 필요한 변경 | 렌더가 준비한 주입 포트 2개를 composition root에서 연결. `composeSystems()`의 기존 `scene.attachPoseSource(gameplay.poseSource);` 다음 줄에:<br>`scene.attachCargoShipSource(gameplay.cargoShip);`<br>`scene.attachEventBus(this.bus);`<br>(레이아웃은 CanyonScene 생성자 기본 인자 `STARTING_CANYON_LAYOUT` — 명시 주입으로 바꾸려면 `new CanyonScene(renderer, STARTING_CANYON_LAYOUT)`) |
| 변경 이유 | 화물선 시각(CargoShipVisual)이 계약 상태를 소비하고 torpedoHit로 폭발을 시작하려면 composition root 연결이 필요. 렌더는 보호 파일을 수정하지 않고 포트만 제공(임시 배선으로 동작 검증 완료 — 항행·명중 폭발·sinkProgress 침몰·removed 정리 실측 스크린샷 확보 후 원복) |
| 관련 게이트 | G3 (명중 피드백), G6·G7 |
| 영향을 받는 파일 | `src/core/Game.ts` 2줄 추가 (렌더 측 변경 불요 — 포트 준비 완료) |
| 하위 호환 여부 | 깨짐 없음 — 미배선 상태에서도 빌드·기본 장면 정상(화물선 미표시, 폭발은 상태 hit 보조 경로) |
| 개발 리드 결정 | 승인 — D+10 통합에서 배선 (attachCargoShipSource는 공식 공개 프로퍼티 `gameplay.cargoShipState` 사용, 캐스팅 없음) |
| 적용 커밋 | (D+10 통합 커밋 — feat(integration) assemble D+10) |

### INT-RENDER-004 — [보고] 렌더 협곡 벽 높이와 충돌 미러 불일치 (INT-GAME-005 후속) — ✅ INT-CORE-004로 해소

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (feat/render) — **통합 담당 보고용** (계약 변경 요청 아님) |
| 대상 시스템 | `src/render/CanyonScene.ts`(렌더 배치) vs `src/systems/collision/startingArea.ts`(충돌 미러) |
| 필요한 변경 | 없음 — 차이 보고. 그래픽스는 D+5 후속에서 수중 해수면·화물선 실루엣 시인성을 위해 벽 높이를 낮췄으나(`11 + 2·sin(i·2.7)` / `12 − 2·sin(i·2.7)`, 이전 `15 + 3·sin` / `16 − 3·sin`), 충돌 미러는 이전 높이 기준이다. **수평 footprint(X 중심·폭·Z·기둥 3개)는 1:1 동일** — 차이는 벽 높이뿐. 효과: 가시 능선 상단(좌 +3~+7 / 우 +4~+8)과 충돌 상단(좌 +6~+12 / 우 +7~+13) 사이 약 4m 구간에서 '보이지 않는 벽' — 연속 상승(수면 상한 +12.5)으로 능선 위를 넘으려 할 때 시각적으로는 통과 가능해 보이나 충돌에 막힘. 임의로 한쪽을 복제 수정하지 않고(렌더 낮춤은 시인성 근거, 충돌 높임은 게임플레이 소유) 리드의 INT-GAME-005 단일 레이아웃 결정에 합류한다. 결정 전 잠정 대응이 필요하면 리드 판단: ⓐ 렌더 벽 높이를 미러 값으로 복원(수면 시인성 후퇴) ⓑ 미러 높이를 렌더 값으로 갱신(게임플레이 창 작업) |
| 변경 이유 | 렌더-충돌 불일치는 G4·G6 관찰을 오염시킬 수 있음 — 통합 전 명시 보고 |
| 관련 게이트 | G4 (심도 조절 이해), G5 (방향 상실), G6 (지형 은신) |
| 영향을 받는 파일 | `src/render/CanyonScene.ts`, `src/systems/collision/startingArea.ts` |
| 하위 호환 여부 | 해당 없음 (보고) |
| 개발 리드 결정 | (대기 — INT-GAME-005와 함께) |
| 적용 커밋 | — |

### INT-RENDER-003 — 화물선 상태 계약 정의 요청 (렌더 소비용, 구 #003 재정리) — ✅ INT-CORE-003으로 해소

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (feat/render) |
| 대상 시스템 | `src/contracts/systems.ts`(화물선 시스템 인터페이스) 또는 `src/contracts/events.ts`(명중·격침 이벤트 — INT-GAME-006 ②와 동일 사안이므로 **합류 결정 요청**) |
| 필요한 변경 | 렌더가 소비할 화물선 읽기 전용 상태: 위치 X/Z(+흘수 기준 Y는 렌더 상수), `headingRadians`, 격침 여부. 현재 렌더는 자체 소비 인터페이스 `CargoShipStateSource`(CanyonScene.ts — positionX/Z·headingRadians·isSunk)를 정의해 두고 `attachCargoShipSource()` 주입 포트로 대기 중. 게임플레이 `TargetRegistry.CombatTarget`(positionX/Y/Z·velocityX/Z·hitRadius·onTorpedoHit)과 형태가 이웃하므로, 화물선 시스템(D6~D9) 설계 시 ⓐ CombatTarget 확장(+heading·격침 상태) ⓑ 별도 상태 인터페이스 ⓒ `torpedoHit`/`shipSunk` 이벤트 중 리드가 결정하면 렌더 측 인터페이스를 그 계약으로 교체한다. 침몰 연출 시작은 결정된 이벤트 또는 상태 전이 1회 통지면 충분 |
| 변경 이유 | 화물선 시각 표현(임시 표적·실루엣·명중 폭발·침몰)은 렌더에 준비 완료됐으나 정식 화물선 시스템·계약이 아직 없음(게임플레이 D6~D9 예정). 렌더에서 이동·판정 로직을 만들지 않는 원칙 유지 |
| 관련 게이트 | G3 (명중 피드백 가독성), G1 |
| 영향을 받는 파일 | `src/contracts/systems.ts` 또는 `events.ts`, `src/render/CanyonScene.ts`, `src/render/CargoShipVisual.ts`, (게임플레이 화물선 시스템 — D6~D9) |
| 하위 호환 여부 | 깨지지 않음 — 미주입 시 정지 표적 렌더. `?shipdemo`는 침몰 연출 미리보기(이동·판정 시연 없음)로 축소됨 |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### INT-CORE-004 — 협곡 레이아웃 단일 데이터 모듈·카메라 리센터 규약 이의(二義) 해소

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (그래픽 INT-RENDER-004·게임플레이 INT-GAME-005 보고 합류 — 통합 차단 2건) |
| 대상 시스템 | `src/world/startingCanyonLayout.ts`(신규 — CanyonLayout 데이터 인스턴스), `src/core/conventions.ts`(카메라 함수 교체) |
| 필요한 변경 | ① `STARTING_CANYON_LAYOUT`: floorY −6·seaSurfaceY 12·spawn (0,0,0)·S자 수로 벽 22개+기둥 3개 — 렌더 `buildCanyonBlockout` 수식과 충돌 `startingArea.ts` 미러의 유일 대체 소스. **벽 높이는 그래픽 하향값(좌 11+2·sin/우 12−2·sin) 확정** — 상단 최대 Y=7 < 해수면 12(시인성), 충돌 동일 데이터 소비로 '보이지 않는 약 4m 벽'(구 15/16±3·sin 미러) 소멸 ② `cameraRecenterYawRadians` **폐기** — '시선 요'와 '위치 오프셋 요' 이중 해석으로 구 CameraRig가 카메라를 선수 쪽에 배치(W 전진 시 화면 바깥쪽 이동). 대체: `cameraRecenterOffsetDirectionXZ`(=선미 방향, 카메라 위치 오프셋)·`cameraRecenterLookDirectionXZ`(=선수 방향, 시선) — 하나의 yaw를 두 의미로 재사용 금지 |
| 변경 이유 | 렌더 벽 하향 후 충돌 미러가 구 높이를 유지해 투명 충돌 벽 발생 보고. 카메라 규약은 그래픽 보고의 이의성 확인 — cbcbf65는 `+π` 보정으로 우회 중이며 규약 자체를 무이의화해야 재발 방지 |
| 관련 게이트 | G1(렌더·충돌 정합), G4·G5(카메라 방향·조작 이해) |
| 영향을 받는 파일 | 신규 데이터 모듈, conventions.ts + docs 4종. 적용 측: 그래픽스(blocks→메시 생성, CameraRig를 오프셋 방향 함수 기준으로 정리 — `+π` 우회 제거), 게임플레이(startingArea 미러 삭제, blocks→충돌체 AABB 변환 — 근사 규칙은 소비측 유지) |
| 하위 호환 여부 | `cameraRecenterYawRadians` 소비자는 cbcbf65 CameraRig 1곳 — 병합 시 새 함수로 교체 필요(동작은 동일 결과: 선미 뒤 배치). 레이아웃 blocks 수치는 그래픽 현행과 1:1이라 시각 변화 없음. 충돌은 벽 높이 4~5m 하향 = 투명 벽 제거(의도) |
| 개발 리드 결정 | 승인 — 데이터 모듈 위치는 `src/world/`(공용 데이터 영역 신설, 공통 보호에 준함 — FILE_OWNERSHIP 회색 지대 갱신). 소비는 composition root 주입 우선. 벽 상단~해수면 개방 수역은 회색 박스 단계 허용, 상층 제약은 레벨 데이터로 후속 |
| 적용 커밋 | `c4841cf` |

### INT-GAME-007 — 화물선 수치 이관 + 격침 보상(어뢰 +1) 배선 결정 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (CargoShipSystem 작업 창) |
| 대상 시스템 | `params/combat.json`+`src/contracts/params.ts`(CombatParams 또는 신규 cargo 구획), CanyonLayout 데이터 모듈(INT-CORE-003 후속), `TorpedoSystem`(보상 지급 경로) |
| 필요한 변경 | ① 화물선 수치 이관 — 항행 속력(임시 4 m/s)·명중 반경(9 m)·침몰 시간(6 s)은 params로, 왕복 경로 끝점·해수면 높이(12 — 렌더 SEA_SURFACE_Y와 정합)는 CanyonLayout 데이터 모듈로. 현재 `src/systems/provisionalCargo.ts`·`provisionalWorld.ts`(PROVISIONAL_SEA_SURFACE_Y) R7 선진행 ② 해수면 정합에 따라 잠수함 수직 상한을 12.5→11(해수면 12 − 선체 반경 1)로 조정함 — 수면 돌출 방지, 레벨 값 확정 시 재검토 ③ 격침 보상 어뢰 +1 [확정 §5.9]: `torpedoHit` 구독으로 지급하는 주체·TorpedoSystem 잔량 증가 경로(메서드 추가 필요 — 계약 변경) 결정 요청 |
| 변경 이유 | CargoShipSystem(직선 왕복·1발 격침·침몰 시간축) 구현 완료 — 수치·레이아웃 값의 정식 소스와 보상 지급 경로만 남음 |
| 관련 게이트 | G3(첫 발사 표적), G6·G7 |
| 영향을 받는 파일 | `params/combat.json`, `src/contracts/params.ts`, `src/config/validateParams.ts`, CanyonLayout 데이터 모듈(위치 미정), `src/systems/CargoShipSystem.ts`, `src/systems/provisionalCargo.ts`(삭제), `src/systems/provisionalWorld.ts`(부분 삭제), `src/contracts/systems.ts`(TorpedoSystem 보상 메서드 — 리드 결정) |
| 하위 호환 여부 | 깨짐 없음 (이관·추가만) |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### INT-CORE-003 — 통합 상태 계약 확정 (포즈·화물선·torpedoHit·레이아웃·파라미터 단일 소스)

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (D6 통합 전 각 파트 구현 보고 종합 — 임시 인터페이스·중복 파라미터 해소) |
| 대상 시스템 | `src/contracts/systems.ts`(SubmarinePoseSource·CargoShipStateSource 추가), `src/contracts/events.ts`(torpedoHit 추가), `src/contracts/layout.ts`(신규 — CanyonLayout·CanyonBlockDescriptor) |
| 필요한 변경 | ① 잠수함 포즈 정식 계약: positionX/Y/Z·headingRadians·forwardSpeedMetersPerSecond(부호: + 선수/− 선미). positionY는 심도 보간 포함 월드 Y ② 프로펠러는 공식 forwardSpeed + `conventions.propellerSpinRatio()`만 사용 — 렌더의 위치 차분 속도 재계산 금지 ③ propellerIdleSpinRatio·최고 속력의 공식 소스는 `params/movement.json` 단일 — renderVisualParams.json의 `idleSpinRatio`·`fullSpinAtSpeedMps` 중복 정의 제거(조립 시 주입으로 대체) ④ 화물선 상태 계약: id·positionX/Y/Z·heading·velocityX/Z·hit·sinkProgress(0~1, 시간축 게임플레이 소유)·removed ⑤ `torpedoHit { targetId, x, z }` 이벤트 ⑥ 렌더·충돌 공용 레이아웃 인터페이스(CanyonLayout — 인터페이스만, 데이터 모듈은 후속) ⑦ composition root 연결 지도 문서화 (ControlsHud→동일 AimSystem, CargoShipSystem→TargetRegistry/CargoShipVisual, pose→장면/프로펠러, torpedoHit→상태·렌더·오디오) |
| 변경 이유 | 게임플레이가 구현한 positionY·부호 있는 속도가 정식 계약에 없어 렌더가 위치 차분으로 재계산 중(판정 복제), 렌더가 공회전 비율을 중복 정의, 화물선 상태·명중 통지가 렌더 로컬 임시 인터페이스(CanyonScene 內 CargoShipStateSource)로만 존재, CanyonScene과 충돌 startingArea가 배치 복제 |
| 관련 게이트 | G1(연출 역추적), G3(조준·발사 경로 단일화), G6·G7(표적·명중 인과) |
| 영향을 받는 파일 | 계약 3파일 + `docs/ARCHITECTURE.md`·`INTERFACES.md`. 적용 측: 게임플레이(poseSource·CargoShipSystem·torpedoHit 발행), 그래픽스(CanyonScene 로컬 타입→계약 import, Propeller 속도 입력 교체, renderVisualParams 중복 키 제거), UI(CombatIntentSink→AimSystem 위임) |
| 하위 호환 여부 | 기존 코드 깨짐 없음 — 전부 추가(기존 PlayerController·이벤트 불변). dev 빌드·검증 21/21 유지. feat/render의 로컬 CargoShipStateSource는 계약과 필드 확장 차이(velocity·hit/sinkProgress/removed 세분화)가 있어 병합 시 계약 쪽으로 교체 필요 |
| 개발 리드 결정 | 승인 — PlayerController 확장 대신 별도 SubmarinePoseSource로 공식화(기존 구현·검증 불파괴). 침몰 시간축은 게임플레이 소유('판정이 타이밍의 주인' 원칙 일관 적용), 렌더 sinkDurationSeconds는 진행률 매핑 상수로만 유지. 레이아웃 데이터 모듈 위치는 후속 결정(제안: 리드 승인 공용 모듈 — 레벨 산출물 반영 시 데이터만 교체) |
| 적용 커밋 | `efd4712` |

### INT-GAME-006 — 어뢰 수치 params 이관 + 명중 통지 이벤트 신설 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (어뢰 전투 작업 창 — 통합 순서 [5]) |
| 대상 시스템 | `params/combat.json`+`src/contracts/params.ts`(CombatParams), `src/contracts/events.ts`(신규 이벤트) |
| 필요한 변경 | ① `CombatParams`에 어뢰 속력(현 임시값 20 m/s)·최대 사거리(현 임시값 90 m) 이관 — `src/systems/provisionalCombat.ts` R7 선진행 중(INT-GAME-001 절차), 조정 범위·판단 기준은 기획 튜닝표 행 추가 후 확정 ② `torpedoHit { x, z, targetId }`(함선 명중)·어뢰 소멸(환경 충돌·사거리 초과) 이벤트 신설 검토 — 현재 명중은 표적 객체의 `onTorpedoHit` 콜백(1회 보장)으로만 통지되어 게임플레이 내부는 충분하나, 렌더 명중 폭발 연출(CargoShipVisual)·오디오 폭발음 동기화가 이벤트 구독을 원할 때 필요. 격침 상태 노출은 화물선 시스템(D6~D9)에서 별도 결정 |
| 변경 이유 | 어뢰 직선 주행·사거리 제거·명중 1회 판정 구현 완료 — 수치 이관과 표현 계층 통지 경로 결정이 남음 |
| 관련 게이트 | G3 (60초 첫 발사), G7 |
| 영향을 받는 파일 | `params/combat.json`, `src/contracts/params.ts`, `src/config/validateParams.ts`, `src/contracts/events.ts`, `src/systems/StraightRunTorpedoSystem.ts`, `src/systems/provisionalCombat.ts`(삭제) |
| 하위 호환 여부 | 깨짐 없음 (필드·이벤트 추가만) |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### INT-CORE-002 — 공통 공간·방향 규약(conventions)·AimSystem 계약·프로펠러 공회전 파라미터

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (D+5 플레이테스트 리뷰·화면 버튼/A/D 프로펠러 입력 소회의 후속) |
| 대상 시스템 | `src/core/conventions.ts`(신규), `src/contracts/systems.ts`(AimSystem 추가), `src/contracts/events.ts`(aimModeChanged 추가), `src/contracts/params.ts`+`src/config/validateParams.ts`+`params/movement.json`(propellerIdleSpinRatio 추가) |
| 필요한 변경 | ① 축 규약 코드화: 로컬 -Z=선수·+Z=선미·월드 +Y=위, `bowDirectionXZ`/`sternDirectionXZ`/`meshYawRadians`/`cameraRecenterYawRadians`(선미 뒤 상단→선수 방향 후방 뷰)/`propellerSpinRatio` ② AimSystem 공용 입력 계약: 마우스·HUD 버튼이 동일 인스턴스의 `beginAim`(잠망경 심도 아니면 false)·`endAim`·`fireTorpedo` 호출, 상태 `aiming` ③ `aimModeChanged { aiming }` 이벤트 (조준 카메라 고정·UI용) ④ 프로펠러 공회전 비율 0.08 기본, FixedNumber(0~1 검증)로 외부 조정 |
| 변경 이유 | 이동·카메라·프로펠러·UI·어뢰가 축 방향·전투 입력 경로를 서로 다르게 구현하는 것을 방지 (D+5 리뷰 결정의 코드화). 프로펠러 회전은 실제 전후 속도만 입력받는 시그니처로 'A/D 단독 입력 무영향'을 강제 |
| 관련 게이트 | G3·G5 (조작·카메라 일관성), 직접 수치 게이트 없음 |
| 영향을 받는 파일 | 위 대상 + `docs/ARCHITECTURE.md`(규약 章)·`docs/INTERFACES.md`(§1·§2·§3 행) |
| 하위 호환 여부 | 기존 구현과 정합(추가만) — 기존 SubmarinePlayerController 전진 벡터·CanyonScene `mesh.rotation.y`·CameraRig `heading+π` 배치와 동일 정의. MovementParams 필드 추가는 JSON·검증 동시 반영으로 로드 깨짐 없음. AimSystem·aimModeChanged는 신규(구현 D6) |
| 개발 리드 결정 | 승인 — 규약 함수는 core 소유로 두고, 조준은 '별도 전투 시스템 금지·AimSystem 단일 진입점'을 계약으로 강제. 프로펠러 최대 각속도(rad/s)는 렌더 연출 상수로 파라미터화하지 않음(밸런스 아님) |
| 적용 커밋 | `b69890b` |

### INT-GAME-005 — 협곡 레이아웃 단일 소스화 + 렌더의 수직 위치 소비

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (D+5 리뷰 스프린트 '이동·충돌' 작업 창) |
| 대상 시스템 | 레벨 레이아웃 데이터 소유 구조(신설 필요 — 리드 결정), `src/render/CanyonScene.ts`(렌더 소유 — 제안만) |
| 필요한 변경 | ① 협곡 배치(벽·기둥)를 렌더·충돌·시야 차폐가 **공유하는 단일 레이아웃 데이터**로 분리 — 현재 게임플레이는 렌더 직접 참조 금지 규칙 때문에 `src/systems/collision/startingArea.ts`에 CanyonScene.buildCanyonBlockout의 결정식을 **미러(임시 중복)**로 유지 중. 정식 레벨 블록아웃(레벨 디자인 D+5 산출물) 수신 시점에 통합 권장 ② CanyonScene이 잠수함 수직 위치를 소비하도록 `SubmarinePoseSource`에 `positionY` 추가 (현재 SUBMARINE_Y=0 고정 렌더 — 연속 상승·하강이 화면에 보이지 않음) |
| 변경 이유 | 연속 심도 이동·충돌이 게임플레이에 들어왔으나 렌더가 y를 소비하지 않으면 D+7 빌드에서 상승·하강이 보이지 않음. 레이아웃 중복은 배치 변경 시 렌더-충돌 불일치 위험 (R12 유사) |
| 관련 게이트 | G4 (심도 조절 이해), G6 (지형 은신 — 시야 차폐가 같은 충돌체 집합 재사용) |
| 영향을 받는 파일 | `src/render/CanyonScene.ts`, `src/systems/collision/startingArea.ts`(교체·삭제), 시야 차폐(D10~12) 설계 |
| 하위 호환 여부 | 렌더 poseSource 필드 추가는 하위 호환. 레이아웃 분리는 렌더 내부 재배선 필요 |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### INT-GAME-004 — PlayerController 수직 상태·부호 속도 계약 반영 + 이동 신규 수치 이관

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (D+5 리뷰 스프린트 '이동·충돌' 작업 창) |
| 대상 시스템 | `src/contracts/systems.ts`의 `PlayerController`·`DepthSystem` 주석 의미, `src/contracts/params.ts`의 `MovementParams`, `params/movement.json`, `docs/DECISIONS.md` #2·`docs/INTERFACES.md` |
| 필요한 변경 | ① `PlayerController`에 `positionY`(수직 위치) 추가, `speed` 주석을 **부호 있는 전후 속도**(양수=전진)로 갱신 — 관리 창 제안 **INT-RENDER-002**(프로펠러 S7용 전후 부호 속도)와 동일 사안이므로 합류 결정 요청 ② `MovementParams`에 후진 비율(0.5)·수직 비율(0.5) 이관 — 현재 `src/systems/provisionalMovement.ts` R7 선진행 (INT-GAME-001과 동일 절차) ③ 수직 상한(12.5)·하한(-5)·심도 구간 경계(잠망경 ≥8 / 순항 ≥-2)는 레벨 값 성격 — params 또는 레벨 데이터로 이관 결정 필요, 현재 `src/systems/provisionalWorld.ts` 선진행 ④ `DepthSystem` 의미 변경 기록: 4차 대회의(D+5 리뷰) 결의에 따라 층 단위 이동 → **연속 이동 + 높이 기반 3구간 판정**. 인터페이스(`currentLayer`·`requestAscend`/`requestDescend`·`depthChanged`)는 유지 — 요청 메서드는 프로그래매틱 층 이동 경로로 존치. 마스터 플랜 §3.4·DECISIONS #2와 상충하므로 **리드의 각주 처리 필요** (마스터 플랜은 게이트 전 수정 금지 — NEXT_SPRINT 방식의 회의록 각주 관리, R16 원본 재대조 대상) |
| 변경 이유 | 스프린트 지시(W 전진/S 후진/Shift·Ctrl 연속 상승 하강/수면·해저 한계/높이 기반 구간 판정) 구현 완료 — 계약·문서 정합과 수치 이관이 남음. 구현은 계약 파일을 건드리지 않고 확장 상태(구현체 프로퍼티)로 선진행 |
| 관련 게이트 | G3, G4, G5, G7 (속도·심도는 소음·탐지·회피의 입력값) |
| 영향을 받는 파일 | `src/contracts/systems.ts`, `src/contracts/params.ts`, `src/config/validateParams.ts`, `params/movement.json`, `src/systems/SubmarinePlayerController.ts`, `src/systems/LayeredDepthSystem.ts`, `src/systems/provisionalMovement.ts`(삭제)·`provisionalWorld.ts`(삭제), `docs/INTERFACES.md`, `docs/DECISIONS.md`(리드만) |
| 하위 호환 여부 | 깨짐 없음 — 인터페이스 추가·주석 갱신. `speed`가 음수를 가질 수 있게 된 점은 소비 측(소음 산출 등)이 \|speed\| 사용 필요 (현재 소비자 없음) |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### INT-GAME-003 — AimSystem 진입점 계약 신설 [종결 — INT-CORE-002로 대체]

| 필드 | 내용 |
|---|---|
| 요청자 | 작업 관리자 (8차 소회의 결의 1 이행 — 실구현 협의는 오세진·임찬영) |
| 대상 시스템 | `src/contracts/systems.ts` — 조준·발사 진입점. 기존 `TorpedoSystem.fire()`와의 관계 정리 필요 |
| 필요한 변경 | 8차 결의 1: 마우스(우클릭 홀드 조준/좌클릭 발사)와 화면 버튼이 **동일한** 조준·발사 시스템을 호출해야 하며, 진입점은 `AimSystem.enter()` / `AimSystem.fire()` 2개만 존재하도록 강제. 선택지: ① TorpedoSystem에 `enterAim()/exitAim()` 추가 ② 별도 AimSystem 인터페이스 신설 후 TorpedoSystem.fire() 위임 — 리드 결정 필요 |
| 변경 이유 | 입력 경로 이원화(마우스/버튼)로 조준 시스템이 갈라지면 밸런스 테스트 2배 (8차 회의 박태현 우려의 원천 차단) |
| 관련 게이트 | G3 (버튼 = 튜토리얼 겸용), G7 |
| 영향을 받는 파일 | `src/contracts/systems.ts`, `docs/INTERFACES.md`, (구현) `src/systems/*`, (버튼) `src/ui/*` |
| 하위 호환 여부 | TorpedoSystem 구현체 아직 없음 — 지금 결정하면 깨짐 없음. **D+7 마감 내 흡수 전제이므로 조기 결정 필요 (스프린트 병목)** |
| 개발 리드 결정 | 종결 — INT-CORE-002가 AimSystem 계약(beginAim/endAim/fireTorpedo 단일 진입점)으로 확정 |
| 적용 커밋 | (INT-CORE-002 참조) |

### INT-RENDER-002 — 전후 부호 있는 속도 노출 [종결 — INT-CORE-003으로 대체]

| 필드 | 내용 |
|---|---|
| 요청자 | 작업 관리자 (8차 소회의 결의 2 이행 — 실소비자는 그래픽스 프로펠러 렌더) |
| 대상 시스템 | `src/contracts/systems.ts`의 `PlayerController` — 현재 `speed`는 부호 규약 미명세 |
| 필요한 변경 | 프로펠러 회전 = "실제 전후 속도값의 함수 (W 정회전 / S 역회전, 하한 공회전)"이므로 렌더가 **부호 있는 전후 속도**를 읽을 수 있어야 함. 선택지: ① `speed`를 부호 있는 값으로 명세 확정 ② `signedSpeed` 별도 노출 — 리드 결정 필요. `A/D`는 이 값에 어떤 항도 추가하지 않음 (8차 결의 2) |
| 변경 이유 | 규약 없는 곳에서 구현자 임의 판단 방지 (8차 회의 개최 사유 그 자체) |
| 관련 게이트 | G5 |
| 영향을 받는 파일 | `src/contracts/systems.ts`, `docs/INTERFACES.md`, `src/systems/SubmarinePlayerController.ts`, (소비) `src/render/*` 프로펠러 |
| 하위 호환 여부 | 현 구현(`SubmarinePlayerController`)의 내부 속도 부호 규약 확인 후 명세화 — 명세만 추가하면 깨짐 없음 |
| 개발 리드 결정 | 종결 — INT-CORE-003이 SubmarinePoseSource.forwardSpeedMetersPerSecond(부호: + 선수/− 선미)로 확정. PlayerController.speed는 비부호 속력 유지 |
| 적용 커밋 | (INT-CORE-003 참조) |

### INT-TOOL-001 — Node 버전 고정(engines)·ParamLoader 핫리로드 내부 교체

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴 (단계 0 잔여 작업 지시) |
| 대상 시스템 | `package.json`(공통 보호 — engines만), `src/config/ParamLoader.ts`(공통 보호에 준함 — 내부만) |
| 필요한 변경 | ① engines `>=20` → `>=22 <23` (.nvmrc `22.22.2`·.npmrc engine-strict와 한 세트) ② ParamLoader에 Vite HMR 기반 params 핫리로드 — `loadParams()` 인터페이스 유지, `onParamsReloaded()` 구독 함수 추가. 검증 규칙(validateParams.ts)은 무변경 |
| 변경 이유 | 단계 0 완료 조건 — 로컬·CI·배포 Node 일원화(재현성), 빌드 없이 params 반영(§10.2 핫리로드) |
| 관련 게이트 | G1·G2 (계측·배포 재현성), 튜닝 루프 전반 |
| 영향을 받는 파일 | package.json, .nvmrc(신규), .npmrc(신규), src/config/ParamLoader.ts, .github/workflows/ci.yml |
| 하위 호환 여부 | 유지 — `loadParams()` 시그니처·검증 동작 불변. Node 20 로컬 환경은 engine-strict로 차단됨(의도) |
| 개발 리드 결정 | 승인 — D+5 통합 리뷰에서 확인. engines·핫리로드 모두 인터페이스 불변, 검증 규칙 무변경 |
| 적용 커밋 | `5b33dec` |

### INT-CORE-001 — 시스템 수명주기(GameSystem)·등록 구조(SystemRegistry) 도입 (기록용)

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (D3, D+5 회색 박스 통합 준비) |
| 대상 시스템 | `src/core/GameSystem.ts`(신규), `src/core/SystemRegistry.ts`(신규), `src/core/Game.ts`(등록 지점·프레임 순서 배선) |
| 필요한 변경 | 시스템 수명주기 계약(id·initialize·update·render?·dispose)과 등록 구조. 실행 순서 = 등록 순서, 유일한 등록 지점은 `Game.composeSystems()` |
| 변경 이유 | D+5부터 각 파트 구현체를 dev에 병합·조립할 공통 구조 필요. 파트 간 직접 참조 없이(EventBus만) 등록·해제 가능해야 함 |
| 관련 게이트 | 직접 해당 없음 (아키텍처) |
| 영향을 받는 파일 | `src/core/*` (리드 소유·공통 보호). **`src/contracts/*` 변경 없음** — `Updatable`을 상속만 함 |
| 하위 호환 여부 | 기존 계약·구현 영향 없음 (추가만) |
| 개발 리드 결정 | 승인 — 수명주기는 계약이 아닌 core 아키텍처로 두고, 계약 3종은 그대로 유지 |
| 적용 커밋 | `22f2d15` |

### INT-GAME-002 — core/Game에 게임플레이 시스템 조립 연결 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (D3~D5 회색 박스 작업 창) |
| 대상 시스템 | `src/core/Game.ts` (공통 보호 파일 — 게임플레이가 직접 수정 불가) |
| 필요한 변경 | ① `GameplaySystems`(src/systems/GameplaySystems.ts) 인스턴스 생성: `new GameplaySystems(this.bus, params)` ② `update(dt)`에서 `gameplaySystems.update(dt)` 호출 ③ 초기화 시 `gameplaySystems.attachInput(window, document)` 호출 (정리 시 `detachInput()`) |
| 변경 이유 | PlayerController·DepthSystem 구현이 완료되었으나 core 조립점에 연결되지 않으면 빌드에서 동작하지 않음. D+5 회색 박스 빌드의 전제 |
| 관련 게이트 | G3, G4, G5 |
| 영향을 받는 파일 | `src/core/Game.ts` (구현: `src/systems/GameplaySystems.ts` — 변경 불요) |
| 하위 호환 여부 | 깨짐 없음 (추가만) |
| 개발 리드 결정 | 승인 (D+5 통합) — 단 직접 호출 대신 INT-CORE-001 구조를 따른다: `GameplaySystems`가 `GameSystem`(id `gameplay`)을 구현하고 `composeSystems()`에서 registry 등록. 입력 연결·해제는 initialize/dispose 수명주기로 이동 |
| 적용 커밋 | `6f83268` |

### INT-GAME-001 — MovementParams에 최고 속력·가속 수치 추가 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (D3~D5 회색 박스 작업 창) |
| 대상 시스템 | `src/contracts/params.ts`의 `MovementParams`, `params/movement.json`, `src/config/validateParams.ts` |
| 필요한 변경 | `MovementParams`에 ① `maxSpeedMetersPerSecond`(최고 속력, m/s) ② `accelerationSeconds`(정지→최고 속력 도달 시간, 초) 추가. 형식은 기획 판단에 따라 Tunable(범위 포함) 권장 — 조정 범위·판단 기준은 기획(박태현)이 튜닝표(§11.2)에 행 추가 후 확정 |
| 변경 이유 | 이동 구현에 필수인 속도 스케일이 movement.json·튜닝표에 없음. R7 규칙("수치표 지연 → 임시 기본값 선진행")에 따라 현재 `src/systems/provisionalMovement.ts`에 임시값(최고 속력 10 m/s, 가속 3.0초)으로 선진행 중 — 승인·반영 즉시 해당 파일 삭제 및 주입 경로로 교체 예정. 하드코딩 금지 원칙의 예외 상태를 조기 해소해야 함 |
| 관련 게이트 | G3, G5, G7 (속도는 이후 소음·탐지의 입력값) |
| 영향을 받는 파일 | `src/contracts/params.ts`, `params/movement.json`, `src/config/validateParams.ts`, `docs/INTERFACES.md` §3, `src/systems/SubmarinePlayerController.ts`, `src/systems/provisionalMovement.ts`(삭제) |
| 하위 호환 여부 | 깨짐 없음 (필드 추가 — 기존 두 항목 유지) |
| 개발 리드 결정 | 승인 (D+5 통합) — 형식은 `FixedNumber`(양수·유한 검증). 조정 범위(Tunable 전환)는 근거 없는 범위를 만들지 않기 위해 기획(박태현)이 튜닝표 행·판단 기준을 확정한 뒤에 한다. 값 자체는 임시값 그대로 이관(밸런스 변경 아님) — TUNING_LOG 기록 |
| 적용 커밋 | `6f83268` |

### INT-RENDER-001 — 회색 박스 장면 조립·연결 (core/Game.ts 정리 요청)

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (feat/render) |
| 대상 시스템 | `src/core/Game.ts` (공통 보호 파일) — 장면 조립부 |
| 필요한 변경 | ① `BootstrapScene` 임포트를 `CanyonScene`으로 교체하고 `src/render/BootstrapScene.ts`(별칭 재수출) 삭제 ② 게임플레이 `PlayerController` 구현체 완성 시 Game 조립부에서 `scene.attachPoseSource(playerController)` 호출 (렌더는 읽기 전용 포즈 소비만) ③ 카메라 입력(마우스 회전·Space 리센터)은 게임플레이 측이 `scene.cameraRig.rotate()/recenter()`를 호출하는 방식으로 연결 ④ (D6 이후) 장면에 EventBus 접근 경로 제공 — `depthChanged`(심도 포그)·`noiseChanged`(파문)·`floodingChanged`(X-ray 자동 발동) 구독용 |
| 변경 이유 | 렌더는 core를 수정할 수 없어 D3 장면 교체를 임시로 별칭 재수출로 처리 중. 또한 '렌더에서 판정·이동 계산 금지' 원칙상 잠수함 위치·방향은 게임플레이 상태 주입이 필요하나 현재 Game이 장면에 renderer만 전달함 |
| 관련 게이트 | G1 (렌더 성능 역추적), G5 (카메라·리센터) |
| 영향을 받는 파일 | `src/core/Game.ts`, `src/render/BootstrapScene.ts`(삭제 예정), `src/render/CanyonScene.ts`, (②는 게임플레이 구현 파일) |
| 하위 호환 여부 | 깨지지 않음 — 별칭 재수출로 현 시그니처가 유지되고 있어 승인 전에도 빌드·실행 정상. 포즈 미주입 시 잠수함은 원점 정지 렌더 |
| 개발 리드 결정 | 승인 (D+5 통합) — ① CanyonScene 직접 임포트·별칭 파일 삭제 반영 ② `composeSystems()`에서 `attachPoseSource(gameplay.poseSource)` 반영 ③ 카메라 입력 책임은 게임플레이가 아니라 **그래픽스**로 확정 조정: `src/render/CameraInputAdapter.ts`(마우스 회전·Space 리센터)가 rig를 호출한다 — 게임플레이는 Three.js 카메라를 참조하지 않음 ④ EventBus 접근은 D6 이후 필요 시점에 재논의 (지금 배선하지 않음 — 스텁 금지) |
| 적용 커밋 | `6f83268` |

### #001 — 초기 계약 정의 (기록용)

| 필드 | 내용 |
|---|---|
| 요청자 | 부트스트랩 작업 (D1~D2) |
| 대상 시스템 | `src/contracts/events.ts`(이벤트 10종), `systems.ts`(인터페이스 9종), `params.ts`(파라미터 타입) |
| 필요한 변경 | 신규 정의 |
| 변경 이유 | 마스터 플랜 §7.2 아키텍처의 코드화 — 병렬 개발 시작 전 공통 계약 확보 |
| 관련 게이트 | 전체 (G1·G2는 performanceSampled 직접 관련) |
| 영향을 받는 파일 | src/core/*, src/config/*, src/ui/*, src/tools/* |
| 하위 호환 여부 | 해당 없음 (최초 정의) |
| 개발 리드 결정 | 승인 (부트스트랩 범위) |
| 적용 커밋 | 부트스트랩 커밋 |
