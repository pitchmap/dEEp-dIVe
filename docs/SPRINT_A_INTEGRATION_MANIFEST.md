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
- `tools/upgradeMath.ts` — 카탈로그 정의 + 수식 위임 래퍼 (소비자 잔존)
- `systems/economy/purchaseTypes.ts` — 장비 경로가 아직 소비 중 (§7)

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

1. **A8 공식 경제 데이터 부재** — `params/upgrades.json`·장비 params의 미확정 필드 **114개**, provisional 파일 4개 잔존. 임의 숫자를 넣지 않았다(금지). 기획 경제 수치표가 유일한 해소 입력.
2. **툴링 교차 승인 미보고** — 리드 최신 4커밋 대상.
3. **구매·장비 composition 배선 미완** — `SavePort`·`BaseScreenPort`·`EquipmentChangeJudgePort` 프로덕션 구현·배선이 없다. 트랜잭션은 검증에서만 구동된다. 배선 시 `EquipmentSystem`의 자체 저장 경로와 **이중 저장** 위험을 먼저 정리해야 한다.
4. **장비 경로 계약 이원화** — `EquipmentSystem`이 아직 `purchaseTypes`의 자체 결과 타입과 `slotFull`(공식은 `noFreeSlot`)을 사용한다.
5. **`tools/upgradeMath` vs `tools/economyMath` 정규화** — 툴링은 전자를 삭제했으나 `PveIntegration`이 `UpgradeDefinition`을 소비해 유지했다. 소비자 이관 후 삭제 필요.
6. **조준 기하 이중 구현** — `core/conventions`(clamp·forward)와 `systems/aimGeometry`가 같은 수식을 각각 정의한다. 수치는 일치하나 정의 지점이 둘.
7. **`provisionalAiming` 잔존** — 툴링 공식 `params/aiming.json`·로더 배선 후 삭제해야 한다.
8. **`MetaLoop` 예외 전파** — `transition`·`restoreWallet`의 throw가 `Game.render()` 경로에서 무방비(`GameLoop`에 try/catch 없음).
9. **소켓 rig 이중 생성 (브라우저 실측으로 발견)** — `src/core/Game.ts:268`이
   `TorpedoTubeSocketRig`를 두 번째로 생성하면서 `attachFineAimSource()`를 붙이지
   않아 `forwardY`가 항상 0이고, `scene.attachTorpedoTubeSocket(...)`은 호출되지
   않는다. 조준 카메라가 `SubmarineVisual` 폴백으로 동작해 미세 조준각을 반영하지
   못한다(어뢰는 `GameplaySystems.torpedoTubeSocket`을 소비해 정상). 최소 수정안:
   `gameplay.torpedoTubeSocket` 단일 인스턴스를 참조하고 composition에서
   `scene.attachTorpedoTubeSocket()`를 1회 호출. 근거·실측:
   `docs/SPRINT_A_ACCEPTANCE.md` '발견된 결함'.
