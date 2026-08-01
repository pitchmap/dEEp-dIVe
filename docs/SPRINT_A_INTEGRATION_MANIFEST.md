# SPRINT_A_INTEGRATION_MANIFEST — 스프린트 A 통합 매니페스트

> 통합 관리자 창 기록 (14차 결의 2: 통합 창은 코드를 새로 설계하지 않고
> 병합·정규화·검증만 한다). 원격에서 실제 확인한 사실만 적는다.

## 1. 기준

| 항목 | 값 |
|---|---|
| 통합 브랜치 | `claude/deep-dive-d5-gray-box-integration-tree5i` (세션 전용) |
| 통합 시작 HEAD | `7d21aa4` |
| `origin/dev` tip | `c5987a2` — 통합 브랜치에 미포함이라 **먼저 병합**(`ae9534d`, hard reset 미사용) |
| 4개 역할 브랜치 공통 조상 | `5a3e5f9` |
| Node / npm | v22.22.2 / 10.9.7 |
| 금지 준수 | dev·main·역할 브랜치 직접 푸시 없음, force push·rebase·squash·cherry-pick 없음 |

## 2. 역할 브랜치 — 보고 tip vs 실제 원격 tip

| 역할 | 브랜치 | 보고 tip | 실제 원격 tip | 일치 |
|---|---|---|---|---|
| 개발 리드 | `claude/deep-dive-core-lead-uyg77p` | `c3c9cb9` | `c3c9cb9` | ✅ |
| 게임플레이 | `claude/submarine-controls-depth-3wi424` | `f61b1e8` | `f61b1e8` | ✅ |
| 그래픽스 | `feat/render` | `51ad7c7` | `51ad7c7` | ✅ |
| 빌드·툴 | `claude/deep-dive-tooling-phase-0-cj6c49` | `946692b` | `946692b` | ✅ |

**필수 커밋 존재·ancestry (7건 전부 확인):**

| 커밋 | 존재 | ancestry |
|---|---|---|
| `2542c7b` 선행 계약 | ✅ | 리드 브랜치 조상 |
| `4fd123d` 원자적 트랜잭션 | ✅ | 리드 브랜치 조상 |
| `16df789` composition 배선 | ✅ | 리드 브랜치 조상 |
| `c3c9cb9` 결정적 테스트+문서 | ✅ | 리드 tip |
| `f61b1e8` 게임플레이 검증 128 | ✅ | 게임플레이 tip |
| `51ad7c7` 출항 준비·QA 데모 | ✅ | 그래픽스 tip |
| `946692b` 툴링 스프린트 A | ✅ | 툴링 tip |

**미도착 브랜치: 없음.** 추측 대체 병합 없음.

## 3. 리드 브랜치 교차 승인 상태

14차 결의 2에 따라 리드 창 병합은 빌드·툴 담당의 교차 승인이 필요하다.

| 항목 | 상태 |
|---|---|
| **리드 기술 검토** | **조건부 통과** — 통합 창에서 체크리스트 10항목 검토. 소켓 단일 정의 항목이 최초 **실패**였으나 본 통합에서 정규화로 해소(§5). 잔여 결함 2건은 최소 수정으로 처리, 2건은 미해소(§7) |
| **툴링 공식 교차 승인** | **대기** — 최신 리드 4커밋(`2542c7b`·`4fd123d`·`16df789`·`c3c9cb9`)에 대한 빌드·툴 담당의 명시적 최종 승인이 보고되지 않았다. 통합 창이 임의로 '승인 완료'로 바꾸지 않는다 |
| **dev PR 게이트** | **차단** — 교차 승인 대기 + A8 실패(§6) |

기술 검토 결과 요약 (근거: 통합 창 검토 기록):

| # | 항목 | 판정 |
|---|---|---|
| 1 | 소켓 단일 정의 | 최초 **실패** → 본 통합 정규화로 해소 |
| 2 | PurchaseTransaction 원자성 | 주의 → 롤백 순서 결함 **수정 완료** |
| 3 | EquipmentTransaction 원자성 | 통과 |
| 4 | SavePort 사용 | 통과 (프로덕션 어댑터 미배선 — §7) |
| 5 | rollback 완전성 | 주의 → 지갑·단계 독립 복원으로 수정. loadout 포트 구현은 미배선 |
| 6 | 예외 비노출 | 주의 — 트랜잭션은 통과, `MetaLoop` throw가 렌더 루프까지 전파 가능 (§7) |
| 7 | 중복 저장 요청 없음 | 통과 |
| 8 | any 캐스팅 우회 | 통과 (`as any` 0건) |
| 9 | 전역 singleton 추가 없음 | 통과 |
| 10 | B·C 스텁 없음 | 통과 |

## 4. 병합 순서와 커밋 (생산자 → 소비자 → 검증자)

| 순서 | 역할 | 병합 커밋 | 직후 검사 |
|---|---|---|---|
| 0 | `origin/dev` 최신화 | `ae9534d` | — |
| 1 | 개발 리드 | `5a121b3` | typecheck·build·size·scope·meta 35/35 통과 |
| 2 | 게임플레이 | `2ff5a01` | 정규화 후 typecheck·gameplay 128/128 |
| 3 | 그래픽스 | (머지 커밋) | typecheck·gameplay 128/128·HUD 34/34 |
| 4 | 빌드·툴 | (머지 커밋) | 전체 스위트 (§6) |

전부 `--no-ff` tip merge. cherry-pick·squash 없음, 역할별 이력 보존.

## 5. 충돌 파일과 정규화 결과

**충돌 파일**

| 파일 | 발생 | 해결 |
|---|---|---|
| `docs/INTEGRATION_NOTES.md` | 3회 (게임플레이·그래픽스·툴링) | 전 항목 보존 (삭제 0) |
| `package.json` | 툴링 | 툴링 스크립트 전체 채택 + `verify:meta` 유지 |
| `params/upgrades.json` | 툴링 | 툴링 공식 스키마(단계별 배열·null) 채택, `maxDepth` id 통일 이력 주석 보존 |
| `src/tools/upgradeMath.ts` | modify/delete | HEAD 유지 (소비자 존재 — §7) |

**제거한 중복 계약**

| 중복 | 정본 | 처리 |
|---|---|---|
| `systems/collision/torpedoTubeSocket.ts`의 앵커·안전 오프셋·전방 계산 | `world/torpedoTubeAnchor.ts` + `core/TorpedoTubeSocketRig.ts` | 삭제. 생성 거리 불일치(게임플레이 4.35 m vs 정본 3.35 m) 해소. 파일에는 어뢰 충돌 반경만 남김 |
| `SubmarineVisual`의 `TORPEDO_TUBE_ANCHOR_LOCAL {0,-0.5,-2.6}` | 정본 `{0,0,-2.8}` | 정본 파생으로 교체 (시각적 부모 역할만) |
| `systems/economy/purchaseTypes.ts`의 `TransactionResult`·사유 타입 | `contracts/meta.ts` | 구매 경로에서 제거, 공식 계약 소비 |
| 게임플레이 `UpgradePurchaseSystem.purchase()` 자체 트랜잭션 | `meta/PurchaseTransaction.ts` | 삭제 → 판정 포트(`evaluateUpgradePurchase`)·단계 포트로 축소, 저장 포트 미수령 |
| `tools/upgradeMath.applyUpgradeBonus` 수식 | `meta/upgradeMath.effectiveValue` | 위임 래퍼 (이전 통합에서 처리) |

**공식 정본**

| 영역 | 정본 |
|---|---|
| 소켓 | `src/world/torpedoTubeAnchor.ts`(앵커·안전 오프셋) + `src/core/TorpedoTubeSocketRig.ts`(2소켓 rig) |
| 구매 트랜잭션 | `src/meta/PurchaseTransaction.ts` |
| 장비 트랜잭션 | `src/meta/EquipmentTransaction.ts` |
| aiming params | `params/aiming.json` + `src/tools/aimingParams.ts`·`aimingMath.ts` (툴링) |
| 경제 params·검증 | `params/upgrades.json` + `src/tools/economyMath.ts` |

**남긴 adapter**

- `systems/collision/torpedoTubeSocket.ts` — 어뢰 충돌 반경 상수만 (소켓 정의 없음)
- ~~`tools/upgradeMath.ts`~~ — **삭제됨** (A_STACK 회차: 소비자 0 확인 후 제거, 정본은 `tools/economyMath.ts`)
- ~~`systems/economy/purchaseTypes.ts`~~ — **삭제됨** (A_STACK 회차: 게임플레이가 공식 계약으로 이관)

## 6. 검증 결과 (통합 빌드 기준)

| 검사 | 결과 |
|---|---|
| `npm ci` | ✅ |
| `npm run typecheck` | ✅ |
| `npm run build` | ✅ |
| `npm run check:size` | ✅ 상한 대비 4.3% |
| `npm run check:scope` | ✅ 전 항목 상한 이내 |
| `npm run verify:gameplay` | ✅ **128/128** |
| `npm run verify:meta` | ✅ **35/35** |
| `npm run verify:tooling` | ✅ **26/26** |
| `npm run verify:hud` | ✅ **34/34** |
| `npm run verify:sprint-a` | ⚠ **자동 23/24** — A8 실패 1건, 수동 항목 5건 미판정 |

## 7. 미해소 — 다음 입력이 필요한 항목

1. ~~**A8 공식 경제 데이터 부재**~~ — ✅ **해소** (A_STACK 회차): 승인 수치표 도착으로 미확정 필드 **0**, 경제 계열 provisional 파일 전부 삭제 (§A6·§A7).
2. **툴링 교차 승인 미보고** — 리드 최신 4커밋 대상.
3. ~~**구매·장비 composition 배선 미완**~~ — ✅ **해소** (A_STACK 회차): `CountingSavePort`·`createBaseScreenPort`·`EquipmentJudgeAdapter`가 production에 배선됐고, `EquipmentSystem.attachSavePort`를 연결하지 않아 이중 저장이 구조적으로 차단된다 (저장 횟수 계측 검증).
4. ~~**장비 경로 계약 이원화**~~ — ✅ **해소** (A_STACK 회차): `purchaseTypes`가 삭제되고 공식 계약이 `slotFull`로 통일됐다 (`contracts/meta.ts`).
5. ~~**`tools/upgradeMath` vs `tools/economyMath` 정규화**~~ — ✅ **해소** (A_STACK 회차): 소비자 이관 완료 후 `tools/upgradeMath.ts` 삭제.
6. **조준 기하 이중 구현** — `core/conventions`(clamp·forward)와 `systems/aimGeometry`가 같은 수식을 각각 정의한다. 수치는 일치하나 정의 지점이 둘.
7. **`provisionalAiming` 잔존** — 툴링 공식 `params/aiming.json`·로더 배선 후 삭제해야 한다.
8. **`MetaLoop` 예외 전파** — `transition`·`restoreWallet`의 throw가 `Game.render()` 경로에서 무방비(`GameLoop`에 try/catch 없음).
9. ~~**소켓 rig 이중 생성**~~ — ✅ **해소** (통합 관리자 최소 수정): `Game`이
   rig를 재생성하지 않고 `gameplay.torpedoTubeSocket` 정본을 참조하며,
   composition에서 `scene.attachTorpedoTubeSocket()`를 1회 호출한다. 런타임
   rig 1개·미세각 연결 1개·2소켓 동일 전방축을 브라우저에서 실측 확인
   (`docs/SPRINT_A_ACCEPTANCE.md` '최종 재판정').
10. ~~**경제·구매 UI 미배선**~~ — ✅ **해소** (A_STACK 회차): `EconomyHud`·
   `SortiePrepScreen`이 composition root에 마운트되고 `BaseScreenPort` v2만
   소비한다 (§A8). **런타임 판정(A4·A5-ui·A6-ui)은 브라우저 인수 회차 대상**으로
   남는다 — 배선 완료가 인수 통과를 뜻하지 않는다.

---

# 스프린트 A 스택 통합 (A_STACK_BASE) — 2차 통합 회차

> 목적: 공식 경제 params · production 성장 UI · 해저 salvage 배치를 한 브랜치로
> 모아 **스프린트 B 선행개발의 기준 커밋**을 만든다.
> 이 회차는 **브라우저 최종 인수 검증을 하지 않는다.** dev PR·dev/main 병합도
> 하지 않는다. 아래 §A5의 A_STACK_READY는 기술 통합 상태이지 A 공식 인수가 아니다.

## A1. 기준과 실제 원격 tip (git fetch 후 확인)

| 항목 | 값 |
|---|---|
| 통합 브랜치 | `claude/deep-dive-d5-gray-box-integration-tree5i` (세션 전용) |
| 작업 전 HEAD | `ebea23b` |
| Node / npm | v22.22.2 / 10.9.7 |

| 역할 | 브랜치 | 보고 tip | 실제 원격 tip | 일치 |
|---|---|---|---|---|
| 개발 리드 | `claude/deep-dive-core-lead-uyg77p` | `ffa945a` | `ffa945a` | ✅ |
| 게임플레이 | `claude/submarine-controls-depth-3wi424` | `4ea3542` | `4ea3542` | ✅ |
| 그래픽스 | `feat/render` | `86f5ee5` | `86f5ee5` | ✅ |
| 빌드·툴 | `claude/deep-dive-tooling-phase-0-cj6c49` | `96af8bc` | `96af8bc` | ✅ |

**필수 커밋 ancestry (4건 전부 확인):**

| 커밋 | 내용 | ancestry |
|---|---|---|
| `a3dd257` | official runtime params / salvage placement 계약 | 리드 브랜치 조상 |
| `384dd00` | BaseScreenPort v2·성장 조립 기준 + 저장 계측 검증 | 리드 브랜치 조상 |
| `2a89400` | 스프린트 A 경제 params 승인 | 툴링 브랜치 조상 |
| `60ece41` | provisional → 공식 params 이관 loader | 툴링 브랜치 조상 |

추측 해시 대체 병합 없음. 전부 `--no-ff` tip merge (cherry-pick·squash·rebase·force push 없음).

## A2. 병합 순서와 커밋

| 순서 | 역할 | 병합 커밋 | 직후 검사 |
|---|---|---|---|
| 1 | 개발 리드 | `668c011` | typecheck ✅ / build ✅ (충돌 0) |
| — | 조립 배선 | `140e5c7` | 공식 params 주입 · 저장 loadout 복원 |
| 2 | 게임플레이 | `4ae9575` | typecheck ✅ / build ✅ (충돌 0) |
| 3 | 그래픽스 | `c321f25` | 충돌 1건 해소 후 typecheck ✅ / build ✅ |
| — | 조립 배선 | `62acea9` | salvage 결합 entry 전달 · 경제 getter 중복 정규화 |
| 4 | 빌드·툴 | `ec3b76e` | 충돌 0 · 전체 스위트 |
| — | 계약 정규화 | `b6f0e1f` | 사장 모듈 삭제 · 구 provisional 주석 정정 |

## A3. 충돌과 해소

| 파일 | 발생 | 해소 |
|---|---|---|
| `docs/INTEGRATION_NOTES.md` | 그래픽스 병합 | INT-GAME-011(HEAD)·INT-RENDER-010(theirs) **양쪽 전문 보존**, 삭제 0 |
| `src/systems/economy/EconomySystem.ts` | 그래픽스 병합 (typecheck 단계에서 노출) | `pickupRadiusMeters` getter 중복 — 그래픽스가 추가한 `PROVISIONAL_PICKUP_RADIUS_METERS` 참조본을 제거하고 **게임플레이 정본(공식 params 기반)** 유지. 렌더가 같은 값을 소비한다는 그래픽스 의도는 정본 주석에 병합 |

정본 우선순위 표(§4 지시)를 그대로 적용했다 — `EconomySystem`의 params 소비는 게임플레이 소유다.

## A4. Game.ts composition 보완 3건

| # | 항목 | 배선 |
|---|---|---|
| 5-1 | 공식 params 주입 | `loadEconomyParams()`+`loadAimingParams()` **각 1회** → `OfficialRuntimeParams` 번들 → `new GameplaySystems(..., official)` **1회 주입**. `attachOfficialParams()`는 생성자 미수신 시의 대체 경로이며 이중 호출하지 않는다. 시스템·UI의 JSON·로더 직접 접근 0 (정적 검사) |
| 5-2 | 저장 loadout 복원 | `gameplay.restoreSavedLoadout(loaded.source === 'fresh' ? null : loaded.data.equippedGear)`. `null` = 저장 없음 → 공식 시작 어뢰 부여 / `[]` = **명시적 전부 해제** → 그대로 복원. 공식 4종 외 id는 조립부에서 제거 |
| 5-3 | salvage spawnId 보존 | `SalvageSpawnAdapter`를 `spawnSalvage(kind,x,y,z,rarePartId)` → **`spawnSalvageFromPlan(entry)`**로 교체. 구 시그니처는 `spawnId`·확정 `credits`를 잃어 게임플레이 측 중복·회수 후 재생성 거부가 성립하지 않았다. 조립부는 결합 entry를 그대로 전달하고, 좌표는 `STARTING_AREA_SALVAGE_PLACEMENTS`(월드·그래픽스 소유)에서만 온다 |

`Game.ts`에 60·40·25·rarePart 수치 하드코딩 없음 — 보상은 `params/economy.json`, 좌표는 placement에서만 파생한다.

## A5. 자동 검증 (통합 빌드 기준)

| 검사 | 결과 |
|---|---|
| `npm ci` | ✅ |
| `npm run typecheck` | ✅ |
| `npm run build` | ✅ |
| `npm run check:size` | ✅ 상한 대비 **4.6%** |
| `npm run check:scope` | ✅ 업그레이드 7/7 · 장비 4/4 |
| `npm run verify:gameplay` | ✅ **167/167** |
| `npm run verify:meta` | ✅ **59/59** |
| `npm run verify:tooling` | ✅ **26/26** |
| `npm run verify:sprint-a` | ✅ **자동 전 항목 통과** (수동 5건은 브라우저 인수 회차 대상) |
| `npm run verify:hud` | ✅ **34/34** (Chromium 실행됨) |
| 브라우저 최종 인수 | **미실시 (이번 회차 범위 밖)** |

## A6. 공식 경제 데이터 확인 (params 실측)

| 항목 | 요구 | 실측 | 판정 |
|---|---|---|---|
| 업그레이드 항목 수 | 7 | 7 | ✅ |
| 각 `maxLevel` | 5 | 전 항목 5 | ✅ |
| `costCredits` | 100/160/240/340/460 | 전 항목 일치 | ✅ |
| `costRareParts` | 0/0/0/1/2 | 전 항목 일치 | ✅ |
| A군 누적 | 5/10/16/22/30% | `maxSpeed`·`turnRate`·`reloadSpeed`·`sonarRange` 일치 | ✅ |
| B군 누적 | 10/20/32/44/60% | `hullIntegrity`·`maxDepth`·`torpedoDamage` 일치 | ✅ |
| `standardTorpedo` | 0/0 · 시작 보유 | 0/0 · `startingItem: true` | ✅ |
| `fastTorpedo` | 260/0 | 260/0 | ✅ |
| `heavyTorpedo` | 420/1 | 420/1 | ✅ |
| `decoy` | 340/1 | 340/1 | ✅ |
| `slotCapacity` | 2 | 2 | ✅ |
| 파괴 손실률 | 0.5 | 0.5 | ✅ |
| 픽업 반경 | 6 m | 6 | ✅ |
| 수송선 보상 | 120 | 120 | ✅ |
| salvage 총 크레딧 | 125 | 60+40+25 | ✅ |
| 희귀 부품 | 1개 | `salvage-3` → `rare-alloy-core` 확정 배치 | ✅ |
| 최대 출항 수입 | 245 | 120+125 | ✅ |
| 미확정(null) | 0 | upgrades 0 · equipment 0 | ✅ |

`salvageSpawns`의 `rarePartId: null` 2건은 **'희귀 부품 없음'이라는 확정 값**이며
미확정 필드가 아니다 (`A8-null0` 검증 대상 밖).

## A7. production provisional 제거 (§6 검사)

| 모듈 | production import |
|---|---|
| `meta/provisionalEconomy` | **0** (파일 삭제됨) |
| `systems/economy/provisionalEconomy` | **0** (파일 삭제됨) |
| `systems/provisionalCargo` | **0** (파일 삭제됨) |
| `systems/provisionalEquipment` | **0** (파일 삭제됨) |
| `provisionalUpgradeCost` | **0** (파일 삭제됨) |
| `purchaseTypes` | **0** (파일 삭제됨) |

잔존 문자열은 전부 **역사 서술·검증 픽스처·감사 문자열**이며 소비 경로가 아니다.
소비 경로를 잘못 서술하던 주석 3건(`MetaLoop`·`settlement`·`SalvageObject`)은
공식 `params/economy.json` 출처 표기로 정정했다.

**이번 회차 범위 밖으로 남는 provisional (경제 계열 아님):**
`provisionalAiming` · `provisionalCombat` · `provisionalMovement` · `provisionalWorld`.
조준은 공식 `params/aiming.json`·로더가 이미 있으므로 `provisionalAiming`은
배선 교체 후 삭제 가능하다 (후속 기술 부채).

## A8. production UI composition (정적·자동 검증 수준)

| 항목 | 결과 |
|---|---|
| `EconomyHud` production mount | ✅ `Game.composeSystems` — `attachBaseScreen(baseScreen)`·`attachMetaState(metaLoop)` |
| `SortiePrepScreen` production mount | ✅ 동일 지점 — `attachBaseScreen(baseScreen)` |
| Upgrade UI / Equipment UI mount | ✅ `SortiePrepScreen` 내부 (별도 마운트 지점 없음) |
| **BaseScreenPort v2만 소비** | ✅ 구계약 변환 어댑터(`createMetaUiPorts`)는 제거됨 |
| QA 데모 production import | ✅ **0건** (`econUiQaDemo`는 `?econdemo` 플래그 전용, 정적 검사 항목으로 고정) |
| 자동 출항 | ✅ **없음** — `render()`의 `beginSortiePrep`·`launchSortie` 자동 호출 제거, 게임은 BASE에서 시작 |
| 출항 버튼 | ✅ **1개** — 기지 화면 → `BaseScreenPort.confirmDeparture`. HUD의 구 출항 버튼은 `launchSortie` 미주입으로 항상 숨김 |
| UI의 wallet 직접 수정 | ✅ 0 |
| UI의 loadout 직접 수정 | ✅ 0 |
| UI의 localStorage/SaveStore 접근 | ✅ 0 |
| UI가 `saveRequested` 직접 발행 | ✅ 0 |
| 저장 이중 호출 | ✅ 계측 확인 — 구매 성공 1회 / 거부 0회 / 장비 3동작 3회 / 출항 1회 |

## A9. slotPositions 처리 (§9)

그래픽스의 읽기 전용 슬롯 위치 보완 뷰(`prepScreen.attachSlotPositions(gameplay.equipment)`)가
병합 후에도 **그대로 보존**되어 있다. `BaseScreenPort` v2의 `loadout.equipped`는
빈 슬롯이 압축돼 실제 인덱스를 복원할 수 없는데, 슬롯 지정 명령(`equipItem`·
`unequipItem`)은 실제 인덱스를 받으므로 이 뷰가 없으면 슬롯 0/1 오조작(장비
덮어쓰기)이 재발한다. 이번 통합에서 삭제·대체하지 않았다.

**후속 기술 부채:** `slotPositions`의 `BaseScreenPort` 정식 계약 승격 여부.
이번 기술 통합의 필수 조건이 아니며, 계약 변경은 INTEGRATION_NOTES 제안 절차를 따른다.

## A10. 업그레이드 효과 상태 (§10)

근거: `src/systems/economy/upgradeEffectConsumers.ts` (게임플레이 조사 결과).

| 항목 | 상태 | 소비 지점 |
|---|---|---|
| `maxSpeed` | **wired** | `SubmarinePlayerController.applyMovementParams` |
| `turnRate` | **wired** | 동상 (시간형 — 90도 선회 시간 단축) |
| `reloadSpeed` | **wired** | `StraightRunTorpedoSystem.applyCombatParams` |
| `torpedoDamage` | **wired** | `EquipmentSystem.setUpgradeModifiers` → 발사 프로파일 |
| `hullIntegrity` | **deferred consumer** | 내구도 시스템 미도입 (기준값 파라미터 없음) |
| `maxDepth` | **deferred consumer** | 심도 한계 확장 규칙 미확정 |
| `sonarRange` | **deferred consumer** | 탐지 시스템 미도입 |

**기록 (지시대로 구현하지 않고 판단만 남긴다):** deferred 3종은 공식 가격이
붙어 있어 **UI에서 구매 가능하고 결제·저장까지 되지만 런타임 효과가 0**이다.
UI에 이 상태를 표시하는 경로는 현재 없다(`DEFERRED_UPGRADE_CONSUMERS`를 소비하는
UI 코드 0건). 필요한 조치는 둘 중 하나이며 **결정은 기획·리드 소유**다:

1. **경고 표시** — 구매는 허용하되 '효과 적용 예정' 표기 (금액 회수 불가 안내 포함)
2. **차단** — 소비자가 붙을 때까지 `deferred consumer` 3종을 구매 불가 처리

통합 창은 어느 쪽도 임의로 구현하지 않았다. 스프린트 A에서 체력 시스템·
소나 시스템·C 내구도 선구현은 하지 않는다(스텁 포함 금지).

## A11. A_STACK 판정

| 조건 | 결과 |
|---|---|
| 네 역할 브랜치 tip 병합 완료 | ✅ |
| typecheck / build / scope | ✅ / ✅ / ✅ |
| gameplay / meta / tooling | ✅ 167 / ✅ 59 / ✅ 26 |
| `verify:sprint-a` | ✅ 자동 전 항목 |
| 공식 경제 params null | ✅ **0** |
| production provisional import | ✅ **0** (§6 목록 6종) |
| official params 실제 gameplay 주입 | ✅ 생성자 1회 |
| saved loadout 복원 | ✅ fresh/명시적 빈 배열 구분 |
| salvage 3종 production spawn composition | ✅ `salvage-1/2/3` |
| spawnId 보존 | ✅ 검증 항목으로 고정 |
| production 성장 UI composition | ✅ |
| 저장 이중 호출 없음 | ✅ 계측 |
| 심각한 계약 충돌 | ✅ 없음 (해소 2건은 §A3) |

```
A_STACK_READY      = true
A_STACK_BASE_COMMIT = 85ec32b044b7b501f71740eb29a5cc708ffd05b7
B 선행개발          = 가능 (선행개발 상태로만)
```

> `85ec32b`는 **코드·문서가 모두 확정된 커밋**이다 (자기 해시를 자기 안에 적을 수
> 없으므로, 이 해시 한 줄을 박아 넣는 커밋은 그 다음 문서 전용 커밋이다).
> B는 `85ec32b` 또는 그 이후 이 브랜치의 커밋에서 분기하면 된다 — 이후 커밋은
> 문서뿐이라 코드 기준은 동일하다.

**A_STACK_READY가 의미하지 않는 것 (명시):**
스프린트 A 공식 인수 완료 ❌ / A PR 병합 완료 ❌ / B 공식 발효 ❌ /
브라우저 최종 검증 완료 ❌. B는 A+B 최종 통합 검증을 위한 **선행개발**로만
시작한다.

## A12. 이번 회차 이후 남은 항목

1. **브라우저 최종 인수 검증** — A1~A8 런타임 판정 (다음 회차).
2. **deferred upgrade consumer 3종의 UI 처리 결정** — §A10.
3. **`slotPositions` 계약 승격 여부** — §A9.
4. **비경제 provisional 4종** — `provisionalAiming`(공식 로더 배선 후 삭제 가능)·
   `provisionalCombat`·`provisionalMovement`·`provisionalWorld`.
5. **조준 기하 이중 구현** — `core/conventions` vs `systems/aimGeometry`.
6. **`MetaLoop` 예외 전파** — `GameLoop`에 try/catch 없음.
7. **툴링 공식 교차 승인** — 리드 최신 커밋 대상. dev PR 게이트는 여전히 차단.

---

# A+B 최종 기술 통합 (AB 회차)

> 목적: 스프린트 B 역할 브랜치를 A 스택 통합 브랜치에 병합하고 B1~B5
> production composition을 완성한 뒤, A+B 통합 빌드에서 자동 검증과 실제
> 브라우저 검증을 수행한다. **dev/main 병합·직접 푸시 없음.**

## AB1. 기준과 실제 원격 tip

| 항목 | 값 |
|---|---|
| 통합 브랜치 | `claude/deep-dive-d5-gray-box-integration-tree5i` |
| 작업 전 HEAD (A 스택 tip) | `8f40117` |
| `A_STACK_BASE_COMMIT` | `85ec32b` |
| Node / npm | v22.22.2 / 10.9.7 |

| 역할 | 브랜치 | 보고 tip | 실제 원격 tip | 일치 |
|---|---|---|---|---|
| 개발 리드 | `claude/deep-dive-core-lead-uyg77p` | `5b443d5` | `5b443d5` | ✅ |
| 게임플레이 | `claude/submarine-controls-depth-3wi424` | `a48dce5` | `a48dce5` | ✅ |
| 그래픽스 | `feat/render` | `cc09fb9` | `cc09fb9` | ✅ |
| 빌드·툴 | `claude/deep-dive-tooling-phase-0-cj6c49` | `2757a48` | `2757a48` | ✅ |

**필수 커밋 ancestry 6건 전부 확인:** `5b443d5` · `b8ade9e`(B5 계약 개정) ·
`c4026f1`(production DestroyerAI) · `a48dce5` · `cc09fb9` · `2757a48`.
추측 해시 대체 병합 없음.

## AB2. 병합 순서와 커밋

| 순서 | 역할 | 병합 커밋 | 직후 검사 |
|---|---|---|---|
| 1 | 개발 리드 | `c738316` | typecheck ✅ / build ✅ (충돌 0) |
| 2 | 게임플레이 | `480a99f` | typecheck ✅ / build ✅ (충돌 0) |
| — | 조립 배선 | `529f5ee` | guard 위치 전략 · 이동 포트 팩토리 |
| 3 | 그래픽스 | `4ca4f03` | 충돌 4건 해소 후 typecheck ✅ / build ✅ |
| — | 조립 배선 | `76ec095` | 다중 선박 렌더 · 식별 · 호위 |
| 4 | 빌드·툴 | `63a2549` | `npm ci` · 전체 스위트 |
| — | 검증 정규화 | `93abe3e` | `verify:sprint-b` B4-port 실관측화 |

전부 `--no-ff` tip merge. cherry-pick·squash·rebase·force push 없음.

## AB3. 충돌과 해소

| 파일 | 발생 | 해소 |
|---|---|---|
| `docs/INTEGRATION_NOTES.md` | 그래픽스 | INT-GAME-013(HEAD)·INT-RENDER-011(theirs) **양쪽 전문 보존** |
| `src/core/Game.ts` | 그래픽스 | 상보적 배선 — 내 위치 전략·모션 팩토리 연결과 그래픽스의 `attachSpawnListener`(실제 spawnPosition만 마커로) **둘 다 채택** |
| `src/core/GuardShipAdapter.ts` | 그래픽스 | 주석 차이만. **리드 정본(HEAD)** 채택 (§6 정본 우선순위) |
| `src/meta/__verification__/run.mjs` | 그래픽스 | 리드의 B5 개정 검사(`implements DestroyerAI` **내용 기반** 판정 + 렌더 오버레이도 같은 AI 어휘 검사 대상에 포함)가 그래픽스의 구 allowlist 방식을 대체·포괄하므로 **리드 정본 채택**. 파일명 회피가 불가능한 쪽이 더 강한 가드레일이다 |

## AB4. production composition 배선 (§7)

| # | 항목 | 배선 |
|---|---|---|
| 7-1 | `SurfaceShipMotionPortFactory` | `{ create: () => null }` 더미 → **`gameplay.surfaceShipMotionPortFactory`**(`PatrolShipFleet`). 스폰마다 독립 `PatrolShipEntity`+포트 생성, AI는 transform 미소유(pose 정본 = 게임플레이 entity 1개), 테스트 더블 0, `create()`가 null 반환하지 않음 |
| 7-2 | `GuardSpawnLocationStrategy` | `guardSpawn.attachLocationStrategy(gameplay.guardSpawnLocation)` **정확히 1회**. 원점·플레이어 위치 fallback 없음 — 자리를 못 찾으면 `noSpawnLocation` |
| 7-3 | production `DestroyerAIFactory` | `createProductionDestroyerAIFactory(surfaceMotionPorts)`. production `DestroyerAIController` **1개**, Guard 전용 AI **0개**, 검증 더블 production import **0건** |
| 7-4 | 다중 선박 렌더 source | 렌더에 소비 API가 없어 `CanyonScene.attachShipWorldSource` 추가 — 기존 `CargoShipVisual`+`factionVisuals` 3종을 entityId별로 관리하는 **얇은 바인딩**이며 새 비주얼을 설계하지 않았다. 주입 시 단일 화물선 경로를 **대체**해 적대 화물선 중복 렌더를 막는다. `Game`에서 `gameplay.shipWorldSource` 1회 연결 |
| 7-5 | `ShipIdentificationSource` | `scene.attachIdentificationSource(gameplay.shipIdentification)` 1회. **`IdentificationExposureSink`는 미주입** — 사유는 `SPRINT_B_ACCEPTANCE.md` B7 구역 |
| 7-6 | Guard spawn listener | 그래픽스 배선 유지 — `GuardShipHandle`의 `requestId`·실제 `spawnPosition`만 마커에 넘긴다. 요청의 `incidentPosition`을 스폰 위치로 위장하지 않으며, `spawnFailed`·`noSpawnLocation`이면 목록이 비어 마커가 뜨지 않는다 |
| 7-7 | 출항 경계 reset | `GuardIncidentLedger`·`PatrolShipFleet`·`ShipIdentificationSystem`·salvage 전부 새 출항에서 초기화됨을 브라우저 실측으로 확인 |

## AB5. 자동 검증 (A+B 통합 빌드)

`npm ci` ✅ · typecheck ✅ · build ✅ · size ✅ **4.8%** · scope ✅ ·
gameplay **213/213** · meta **88/88** · tooling **26/26** · hud **34/34** ·
sprint-a 자동 전 항목 ✅ · sprint-b **자동 23/23 · 차단 0 · 보류 1 · 대기 4**.

## AB6. 브라우저 실측

B1~B5 전 항목 production 경로 실측 통과 + A 회귀 통과.
상세 수치·증거는 `docs/SPRINT_B_ACCEPTANCE.md` 'A+B 최종 기술 통합 판정'.

## AB7. 판정

```
B_CORE_COMPLETE  = true
B_FINAL_COMPLETE = false   (B6 실기동 · B7 실측)
C 기술 선행개발   = 가능
C 공식 발효       = 불가 (A 통합 PR 미병합)
B 공식 발효       = 불가 (발효 조건 = A 통합 PR 병합)
```

## AB8. 이번 회차 이후 남은 항목

1. **B6 실제 호위 기동** — 공식 `rewardMultiplier`·`escortMaximumDistanceMeters`
   승인 대기. 툴링 제안값을 params에 확정 입력하지 않았다.
2. **B7 실측 세션** — 테스터 0명 / 유효 기회 0회. 도구는 완비.
3. **`IdentificationExposureSink` 활성화 정책** — 측정 세션 운영 방식 확정 후.
4. **`slotPositions` 계약 승격** (A 회차 이월).
5. **비경제 provisional 4종** — `provisionalAiming`·`Combat`·`Movement`·`World`.
6. **`MetaLoop` 예외 전파** — `GameLoop`에 try/catch 없음.
7. **툴링 공식 교차 승인** — 리드 최신 커밋 대상 (상설 규칙 3).
