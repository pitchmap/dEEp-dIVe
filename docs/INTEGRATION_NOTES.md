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

### INT-CORE-023 — DetectionHud 정보 비동등 확정 · 제거 M3 공식 이관 (리드 결정 — production UI 무변경)

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (base = dev `045b02f` — PR #18 통합 배선 병합 후) |
| 배경 | 인계표 §7 원안은 "provider 연결 후 DetectionHud 제거"였다. PR #18로 **production SonarScope provider 연결이 완료**(Exit 14 wired 확인)돼 제거 조건 1~4단계가 충족됐고, 4단계 **정보 동등성 검토**를 수행했다 |
| **정보 비동등 2건** | ① **`DetectionHudView.gauge`**(0~1 연속 피탐지 누적) — `SonarScopeReadModel.ringState`는 safe/searching/detected **3단계 이산값**이라 진행률 표현 불가. `noiseFactor`는 **플레이어 자신의 소음 출력**이며 피탐지 누적이 아니라 대체 불가 ② **`TrackingStateSource.trackedShips`**(entity별 patrol/alert/attack/lost) — `SonarBlip`에 추적 상태 필드가 없고 kind는 `ship`까지만 구분해 "어느 함선이 추격 중인가"를 표현 불가 |
| 결정 | **M1·M2에서 제거하지 않는다 — DetectionHud 유지, M3(은신·탐지·적 AI 통합)로 공식 이관**(DECISIONS M-14). 제거되지 않은 상태를 제거 완료로 위장하지 않으며 이중 표시는 M3 결정까지 유지 |
| Exit Criteria 개정 | 16번을 '단순 제거'에서 **'provider 연결 확인 → 정보 동등성 검토 → 동등 시 제거 / 비동등 시 유실 정보·후속 마일스톤 명시 + 리드 승인 이관'**으로 개정(인계표 §7). 이번 판정은 비동등이므로 **'이관 기록 완료'로 충족** |
| M3 후속 조건 | ⓐ `SonarScopeReadModel` 계약 확장으로 연속 게이지·추적 상태 수용 / ⓑ 별도 탐지 UI 유지 + 전체 HUD 구조 재설계 / ⓒ SonarScope·DetectionHud 역할 분리 후 둘 다 유지 — **셋 중 하나를 M3에서 결정**하며 이 단계에서는 방식 결정·선행 구현을 하지 않는다. ⓐ·ⓑ(제거·통합) 선택 시 **`BossHealthHud`의 `[data-ui-detection-hud]` 앵커 교체 + 레이아웃 회귀 검증이 동반 필수**다 — 상세는 인계표 §7-2-1 |
| 변경 범위 | **문서 전용.** `src/contracts/**`·`src/core/**`·`src/systems/**`·`src/render/**`·`src/ui/**`·`params/**` 변경 **0건** — DetectionHud 삭제·축소 0, SonarScope 확장 0, 신규 HUD 0, M3 기능 선행 구현 0 |
| 상태 플래그 | `DETECTION_HUD_INFORMATION_PARITY=false` · `DETECTION_HUD_REMOVED=false` · `DETECTION_HUD_REMOVAL_DEFERRED_TO_M3=true`. **최종 게이트는 전부 false 유지**: `M1_EXIT_GATE_PASSED`·`M2_PROGRESS_GATE_PASSED`·`M1_M2_INTEGRATED_COMPLETE`·`M3_START_ALLOWED`. 파밍 blocker도 유지: `FARMING_REWARD_DATA_WIRED=false`·`FARMING_CAP_PRODUCTION_VERIFIED=false` |
| 개발 리드 결정 | 승인 — 그래픽스는 이번 스프린트에 DetectionHud를 제거하지 않는다(§8 배정에서 제외). M3 착수는 별도 승인 사항이며 이 이관이 `M3_START_ALLOWED`를 올리지 않는다 |

### INT-GAME-018 — M1·M2 Runtime Closure 게임플레이 마감 (INT-CORE-022 이행)

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 창 (base = `dev@e01ffc5` 일반 merge 수신, 충돌 0) |
| 근거 문서 | `docs/M1_M2_RUNTIME_CLOSURE_HANDOFF.md` (INT-CORE-022) §3·§4·§8·§9 |
| 변경 범위 | `src/systems/**` **only** — core·contracts·render·tools·audio·meta/save·params·world·Game.ts 무수정 |
| 개발 리드 결정 | (대기) |

**이행 결과 (§8 게임플레이 배정 항목별)**

| §8 배정 | 이행 |
|---|---|
| F hold 적용 (`interactHold` getter 1줄) | ✅ `KeyE`→`KeyF`. `ascend` 무변경. **추가 1줄**: `TRACKED_CODES`에 `KeyF` — 추적 목록에 없으면 keydown이 유실돼 getter가 영원히 false다(인계표가 명시하지 않은 필수 동반 변경) |
| 승인 params 소비 (타입 정합 확인) | ✅ interaction 3축·boss 4축·sonar 4축·farming 2축 주입 경로 확인. `NullableTunable.value` 슬라이스를 그대로 받는 형태 |
| 탐색 blip 공급 (4종, 액티브 중에만) | ✅ 패시브 자격을 kind에서 끊었다 — 소음을 내더라도 탐색 kind는 패시브에 나가지 않는다. `boss→'ship'` 유지, 지형 접점 없음 |
| `bossHit` 발행 | ✅ `createBoss` 내부 `weakPoint.onHit` 구독, 배율 적용 후 1회, payload = kind 하나 |
| 구역 경계 판정 (`isPlayerInBossZone()`) | ✅ + 진입 edge(밖→안 1회)·`onBossZoneEntered`·reset 초기화 |
| 승리·패배·reset 재검증 | ✅ 기존 사슬에 보스·약점·구역 edge·소나·파밍 포함 확인 |
| 결정적 검증 (기존 291 유지) | ✅ **311/311** (291 유지 + 신규 20) |

**⛔ blocker — 게임플레이가 만들 수 없는 것**

| # | 항목 | 소유 | 없을 때 현재 동작 |
|---|---|---|---|
| ~~B-1~~ | ~~액티브 핑 입력 키 미배정~~ → **해소** (교차 감사에서 `Q` 확정) | — | `KeyboardInput.consumeActivePingPressed()` press edge 구현 완료. 조립부는 `if (keyboard.consumeActivePingPressed()) gameplay.requestActivePing();` 한 줄만 추가하면 된다 |
| B-2 | `params/boss.json` 승인 대기 4필드 (`movement.moveSpeedMetersPerSecond`·`movement.turnRateRadiansPerSecond`·`patterns.ram.contactDamage`·`patterns.weakPointOpen.hitRadiusMeters`) | 기획 승인 → 툴링 입력 | 축별 unwired — 보스 정지 / 돌진 무피해 / **약점 명중 불가(격파 경로 미성립)** |
| B-3 | `params/interaction.json`·`params/sonar.json` 신설 + economy farming 확장 로더 | 툴링 (§2) | 회수·스코프·파밍 전부 unwired. **로더 미존재 동안 조립부가 그 줄을 쓰지 않는다**(인계표 §5 순서 2) |
| B-4 | `src/world/bossPlacement.ts`·`bossCluePlacements.ts` 신설 | 그래픽스 (INT-CORE-022 승인) | 보스 미생성(`boss === null`)·구역 경계 미주입(항상 밖)·단서 발행 0 |
| B-5 | `Game.ts` §5 배선표 실행 | 통합 관리자 | 포트·이벤트·소스 전부 구현 완료 상태로 대기 |

**통합 관리자가 호출할 게임플레이 표면 (§5 배선표 대응)**

```ts
// 순서 3~4 — 단서
gameplay.attachInteractables(() => CLUE_INTERACTABLES);
gameplay.attachClueIds(CLUE_ID_BY_INTERACTABLE);      // ClueIdByInteractableId

// 순서 5~9 — 보스 (BOSS_PLACEMENT 도착 후에만)
gameplay.attachBossZone(BOSS_ZONE);
gameplay.createBoss(BOSS_PLACEMENT, BOSS_WEAK_POINT_PLACEMENT, phasePortProxy,
                    encounterParams, weakPointParams);
const controller = new BossController({ motion: gameplay.bossMotionPort!, attackPort: gameplay.bossAttackPort!, ... });
gameplay.attachBossDamageSink(controller);

// 순서 11 — 수명주기
gameplay.onBossZoneEntered(() => {
  if (bossProgress.requestEntry() === 'granted') gameplay.spawnBoss();
});

// 순서 12~14 — 소나
gameplay.attachSonarContacts(() => contacts);
gameplay.attachSonarScopeParams(sonarParams);
gameplay.sonarScope.attachDetectionStageSource(gameplay.detectionStageSource);
// 핑 — Q press edge (확정). 입력 펌프 지점에서:
if (keyboard.consumeActivePingPressed()) gameplay.requestActivePing();

// M2 보상
gameplay.attachInteractionParams(interactionParams);
gameplay.attachFarmingRewards(rewards);
gameplay.attachFarmingRewardParams(farmingParams);
```

**게이트:** `M1_EXIT_GATE_PASSED=false` · `M2_PROGRESS_GATE_PASSED=false` 유지.
인계표 §6대로 **자동검증은 전제일 뿐 게이트가 아니다** — production 브라우저
완주 19항목이 게이트다. 게임플레이 창은 production 실측을 수행하지 않았다.

### INT-CORE-022 — M1·M2 Runtime Closure 계약 확정 (리드 창 — foundation 종료 후)

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (base = dev `37afc1c` — PR #9·#10·#11·#12·#8 병합 완료 후. **실행 기준 문서: `docs/M1_M2_RUNTIME_CLOSURE_HANDOFF.md`**) |
| 계약 확정 | ① `NullableTunable` + 보스 승인 대기 4필드(이동·선회·돌진 피해·약점 반경 — 전부 null, 범위·관계 제약 로더 강제, 수치는 기획 승인 대기) ② `ClueIdByInteractableId` 매핑 계약(정본 world 배치 모듈·3중 방어) ③ `SonarBlipKind` 확장(전투 3 + 탐색 4 = InteractionTargetKind 재사용, 액티브 핑 한정 공급) ④ `bossHit {kind}` 신설(게임플레이 발행·배율 적용 후·1건 1회) ⑤ `bossWeakPointChanged` 발행 정본을 리드 코어로 개정(전이 시 1회·격파 순서 고정 — BossController 구현 동반) ⑥ `BossCoreView` 정식 공유 read model 확정. 이로써 INT-GAME-016·017과 아래 구 INT-RENDER-015(구 014 중복 번호)의 잔여 계약 요청 전부에 회신 완료 |
| 월드 파일 승인 | `src/world/bossPlacement.ts`·`bossCluePlacements.ts` **신설만** 그래픽스 창에 승인(기획 승인 좌표·매핑). `startingCanyonLayout.ts` 수정·밸런스 수치·판정 로직 탑재 금지 |
| 입력 정책 | **E 상승 유지 / F hold 회수** (M-11 — 9차 키맵 무변경 + 17차 F 미배정 반환 활용) |
| composition | Game.ts 배선 16단계 표 + unwired 동작 + 호출 순서 제약 — HANDOFF §5 (통합 관리자 실행, 리드는 명세만) |
| Exit Criteria | production 브라우저 완주 19항목(HANDOFF §6) — fixture·unwired 화면 불인정. M0 실기기 검증은 병렬 위험 항목으로 분리(기능 구현 비차단·최종 데모 판정은 차단) |
| 검증 | verify:meta **164/164**(신규 8건 — null 보존·키 누락 거부·범위/관계 거부·약점 이벤트 전이/순서·마이그레이션 정책 2건·소나 kind 타입) · gameplay 291/291 · tooling 36/36 · hud 34/34 · typecheck·build·size(7.0%)·scope·sprint-a/b/c 전부 통과 |
| 개발 리드 결정 | 승인 — 세 역할 동시 착수 가능. 남은 기획 결정: 보스 수치 4종·interaction 2종·소나 번짐·farming 평균 산식 + 소나 핑 튜닝표 3종 확인 (HANDOFF §2) |

### INT-RENDER-016 — [M1·M2 Runtime Closure] 보스 시각물 장착·해제 공급 규칙 (최종 결정 — 계약 무수정)

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 창 (INT-CORE-022 이행 — world 2파일 신설 + 소비 마감) |
| 대상 시스템 | `src/core/Game.ts` §5 배선표 순서 15 (`attachBossViewSource`) — 통합 관리자 / `src/render/CanyonScene.ts` — 그래픽스 |
| 배경 | `BossCoreView`에는 '스폰 여부' 필드가 없다. §5 순서대로면 BossController는 조립(보스 블록) 시점에 생성되어 `view()`가 스폰 전에도 비-null이다. 렌더는 **공급자가 처음으로 비-null 뷰를 준 프레임에** production 보스 시각물을 장착하므로, 스폰 전 뷰가 공급되면 '3/3 이전 스폰 0'(Exit 4) 검수 화면에 보스 몸체가 미리 보인다 |
| **최종 결정 (리드 — Runtime Closure 교차 감사)** | ① composition은 **spawn 전 null source를 제공**한다 ② `spawnBoss()` 성공 후에만 `controller.view()`를 노출한다 ③ **reset·dispose 시 null로 복귀**한다 ④ 공유 계약(`BossCoreView`)에 spawned 필드를 **추가하지 않는다** |
| 그래픽스 이행 (F-3 — PR #16 보완 커밋) | 렌더는 받은 값만 따른다: null→비-null = production 시각물 지연 장착 / 비-null 유지 = `applyCoreView` / **비-null→null = production 장착물 dispose + scene 제거 + 참조 null**(플래시·예고·약점·격파 연출 상태는 인스턴스와 함께 소멸) / 재-비-null = 새 인스턴스 장착. `?bossSpike=1` fixture 장착물은 해제 규칙 대상이 아니다. 해제 중복 호출 안전. 검수 fixture `?bossviewdemo=1`(배지 — null 4s→뷰 5s→null 3s 순환) |
| 하위 호환 | 깨지지 않음 — 렌더는 null 동안 유휴, 비-null 이후 상태 매핑. 스폰·reset 판정은 렌더가 계산하지 않는다 |
| 상태 | **결정 확정·그래픽스 측 이행 완료** — 잔여는 통합 관리자 배선(§5 순서 15에 위 공급식 적용) |

### INT-RENDER-015 (구 014 — 리드 정본 014와 번호 중복이라 재부여) — [M1·M2] 보스 시각 read model·소나 액티브 핑 소스 계약 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 창 |
| 대상 시스템 | (신규 계약 요청 — 게임플레이 M1 보스·M2 핑 도착 시) `src/contracts/*` |
| 필요한 변경 | ① **보스 시각 read model**: 그래픽스 `BossSegmentSpike`는 표현 API를 이미 노출한다 — `setWeakpointActive(bool)`·`setPhase(1|2|3)`·`notifyWeakpointHit()`·`notifyNormalHit()`. 게임플레이 보스 회색 상자(M1)의 판정 결과(약점 활성 창·명중 부위 구분·단계)를 이 형태로 통지하는 계약(이벤트 또는 read model) 정본을 요청. 렌더는 약점 판정·체력 임계값을 계산하지 않는다 ② **`SonarPingSource`**: 렌더 로컬 인터페이스(`src/render/SonarScope.ts` — `{pings: readonly {x,z,ageSeconds}[]}`)로 선정의. 게임플레이 액티브 핑 메커니즘(M2) 도착 시 정식 계약 이관 + `scene.attachSonarPingSource()` 1줄 배선. **미주입 = 미표시**(기능 위장 없음) |
| 변경 이유 | M1 약점·단계 전환 표현(5상태)·M2 소나 스코프의 게임플레이 정본 연결. 스코프의 탐지·추적·소음·소음원은 기존 정본(DetectionHudView·TrackingStateSource·noiseChanged·ShipWorldSource) 재사용으로 이미 배선됨 — 신규 요청은 위 2건뿐 |
| 영향을 받는 파일 | render: `SonarScope.ts`(신규)·`boss/BossSegmentSpike.ts`·`CanyonScene.ts`. 조립: `Game.ts` +2줄(소나 탐지·추적 소스 — DetectionHud와 동일 정본·동일 형태, 기존 배선 관례) |
| 하위 호환 여부 | 깨지지 않음 — 전부 추가·미주입 안전(계약 무수정, 렌더 로컬 인터페이스는 AimAngleSource 관례) |
| 개발 리드 결정 | **부분 해소 (PR #10)** — `src/contracts/sonar.ts`(SonarScopeReadModel)·`src/contracts/boss.ts`(BossCoreView·telegraph)·보스 이벤트 3종(bossPhaseChanged·bossWeakPointChanged·bossDefeated)으로 도착. 렌더는 정본 소비로 전환 완료 |
| 적용 커밋 | feat/render — M0 실측 준비·M1/M2 최소 시각 소비자 + 정본 계약 소비 전환 커밋 |
| **잔여 누락 (그래픽스 재보고)** | ① **보스 피격 통지(약점/일반 구분)** — `BossDamageRequest.kind`는 코어 입력 전용이라 렌더 노출 경로가 없다. 렌더 API(`notifyWeakpointHit`/`notifyNormalHit`)는 준비돼 있으니 이벤트(예: `bossDamaged {kind}`) 또는 BossCoreView 확장 결정 요청 ② **소나 공급자 미배선** — 게임플레이 `SonarScopeReadModel` 공급자 병합 시 `scene.attachSonarScopeSource()` 1줄(Game.ts 주석에 배선 지점 기재). 그 전까지 production 스코프는 '계기 미연결' 표시 |
### INT-GAME-017 — M1·M2 production 연결 (PR #9·#10 수신) + 잔여 blocker

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 창 (base = `dev@61d2ce9` 일반 merge 수신, 코드 충돌 0 · 문서 충돌 2건은 양측 보존으로 해소) |
| 대상 시스템 | `src/core/Game.ts` 조립(리드) · `params/boss.json`(기획) · 월드 배치 데이터 · `src/contracts/sonar.ts` blip 어휘(리드) · 키맵 결정 |
| 하위 호환 | 유지 — 신규 주입점뿐이고 미주입 시 각 시스템이 `unwired`로 남는다. 계약 파일 무수정 |
| 개발 리드 결정 | (대기) |

**이행한 것 (게임플레이 소유 영역만)**

| 지시 | 구현 | 파일 |
|---|---|---|
| 작업 1 이벤트 어댑터 | `InteractionSystem` 완료 → `interactionCollected` 발행. kind 변환표 **한 곳**(`CANONICAL_KIND`), `targetId`/`clueId` 분리, clue만 `clueId` 필수, 매핑은 주입 | `interaction/InteractionEventAdapter.ts` (신규) |
| 작업 2 단서 정본 단일화 | `progress/CluePickupProgress.ts` **삭제**. 원장·저장·복원·해금 계산 전부 제거하고 무상태 변환기로 축소 — 정본은 `BossProgressStore` 하나 | (삭제) |
| 작업 3 회수·보상 | 완료 통지 한 줄기를 이벤트 발행·재화 두 소비자가 각자 자기 몫만 집는다. 단서는 재화 대상 아님 | `GameplaySystems` |
| 작업 4 보스 포트 | `BossMotionPort`·`BossAttackPort` 구현, 스폰 1회, 약점 브리지(`BossDamageSink`), 기존 피해·표적·생사 경로 재사용 | `boss/BossEncounter.ts` (신규) |
| 작업 5 소나 공급자 | 공용 계약 `SonarScopeReadModel` 그대로 공급. 월드 좌표 비탑재, `noiseFactor` 단일 입력, 폭뢰 필터 공급 시점 적용, `ringState` = 기존 `DetectionStage` | `sonar/SonarScopeSystem.ts` |

**INT-CORE-021 준수 확인** — 게임플레이 표면에 `clueProgress`·`collectedClue`·
`restoreCollectedClues`·`unlocked`·`requiredClues` 계열 API가 **0건**임을
검증기가 기계 확인한다. 단서 중복 방지는 두 정본이 각자 자기 층에서 한다:
대상 단위 = `InteractionSystem.collected`, 단서 단위 = `BossProgressStore`.

---

**⛔ blocker — production 배선을 완료할 수 없는 항목 (가짜 구현·fixture로 통과시키지 않았다)**

**B-1. `params/boss.json`에 판정 수치 3종이 없다.** 파일 전체에 `radius` 키가
**0건**이다.

| 필요 값 | 주입 지점 | 없을 때 현재 동작 |
|---|---|---|
| 약점 명중 판정 반경 | `BossWeakPointTarget.attachParams({ hitRadiusMeters })` | 반경 0 → **어뢰가 약점을 맞히지 못한다 → 누적 피해 0 → 격파 불가** |
| 돌진 접촉 피해 | `BossEncounter.attachParams({ ramContactDamage })` | `requestAttack('ram')` → `unwired`, 피해 0 (이동·예고만) |
| 보스 평상시 이동 속력·선회 속도 | `BossEncounter.attachParams({ moveSpeedMetersPerSecond, turnRateRadiansPerSecond })` | 이동 0 (`patterns.ram.speedMetersPerSecond`는 돌진 전용이라 평상시 속력으로 전용할 수 없다) |

⚠ **약점 반경이 M1 완주 판정의 직접 차단 사유다.** 격파 경로가 성립하지
않는다. 배율 2종(2.0/0.25)은 이미 `params/boss.json`에 있으므로 반경 한 줄만
추가되면 약점 판정이 wired가 된다.

**B-2. 보스·약점 배치 데이터가 없다.** `BossControllerOptions.spawnPosition`과
`BossWeakPointPlacement`가 필요한데 `src/world/`에 보스 관련 데이터가 **0건**
이다. 좌표를 발명하지 않았으므로 `createBoss()` 호출 전에는 **보스가
존재하지 않는다**(`boss === null`). 진입 게이트(`BossProgressStore.requestEntry`)는
리드 쪽에 이미 있다.

**B-3. interactable → canonical `clueId` 매핑 데이터가 없다.**
`params/boss.json unlock.clueIds`는 3종(`clue-wreck-salvage`·`clue-deep-survey`·
`clue-guard-log`)을 확정했지만, **어떤 월드 회수 대상이 어떤 단서를 주는지**는
어디에도 없다. `targetId`를 `clueId`로 재사용하지 않았으므로 매핑 주입 전에는
단서 회수가 **발행되지 않는다**(`unmappedClueCount`로 드러난다).

**B-4. `new BossController(...)`가 조립부에 없다.** `src/core/Game.ts`에
`BossProgressStore`·`BossVictoryBridge`·`interactionCollected` 구독은 이미
있으나 보스 코어 인스턴스가 없다. 게임플레이 포트는 준비됐고 조립 호출만 남았다:

```ts
// 게이트 통과 시 (BossProgressStore.requestEntry() === 'granted')
const boss = gameplay.createBoss(placement, weakPointPlacement, controller, encounterParams, weakPointParams);
gameplay.spawnBoss();
gameplay.attachBossDamageSink(controller);   // 약점 배율 적용분 → 보스 체력
new BossController({ motion: gameplay.bossMotionPort!, attackPort: gameplay.bossAttackPort!, ... });
```
(`controller`가 `BossPhasePort`·`BossDamageSink` 양쪽을 만족하므로 생성 순서상
포트 주입 → 컨트롤러 생성 → `attachBossDamageSink` 순서가 필요하다.)

**B-5. 소나 blip 어휘에 보상·단서·지형이 없다.** 계약 `SonarBlipKind`는
`ship | torpedo | depthCharge` 셋뿐인데 16차 결의 2-5는 액티브 핑이
**보상·단서·지형·보스**를 표시하라고 한다. 어휘를 임의로 늘리지 않았고
(계약 규칙: 확장은 이 문서 제안 → 리드 결정), 보스는 **선박 접촉(`ship`)**으로
옮겼다. 보상·단서·지형 blip은 **표현할 수 없다** — kind 3종 추가 여부를 요청한다.

**B-6. `E` 키 충돌 — 두 결의가 같은 키를 배정했고 해소 결의가 없다.**

| 근거 | 배정 |
|---|---|
| 9차 결의 4 (12차 부록 2 키맵 확정본) | `E` = **상승 병행 키** (창 모드 Ctrl+W 대응) |
| 16차 결의 2-4 / 17차 창 2 | `E` = **회수 홀드** |

회의록을 전부 확인했으나 **충돌을 해소한 결의가 없다.** 임의로 정하지 않았고
현재 상태만 보고한다.

- **재현:** `E`를 누르면 `KeyboardInput.ascend`와 `interactHold`가 **각각 독립적으로** `heldCodes`를 읽어 상승과 회수 홀드가 동시에 진행된다.
- **영향:** 회수 거리 판정이 3D(`hypot(dx,dy,dz)`)라 수직 상승만으로 `interactRadiusMeters`를 벗어나 `outOfRange` 취소가 날 수 있다. 실제 발생 여부는 미확정인 `interactRadiusMeters`와 상승 속도에 달려 있다.
- **입력 소비 여부:** **읽기만 한다.** 어느 쪽도 키 상태를 소거하지 않으므로 서로 가로채지 않는다.
- **최소 선택지:** ① 회수 키를 다른 키로 (17차 결의 2로 `F`가 미배정 반환됨 — 후보) ② 상승 병행 키를 다른 키로 (9차의 Ctrl+W 대응 목적을 대체할 키 필요) ③ 회수 홀드 중 수직 입력 억제 (규칙 신설이므로 대회의 사항)
- **변경 대상:** `src/systems/KeyboardInput.ts`의 `interactHold` 또는 `ascend` getter **한 줄**. 다른 파일은 바뀌지 않는다.

**B-7. 잔여 M2 params (INT-GAME-016에서 이월, 미해소).**
회수 `interactRadiusMeters`·`noiseContribution`, 파밍 `combatRewardAverageCredits`,
스코프 `passiveBearingSpreadRadiansAtMaxNoise` — 공식 수치가 여전히 없다.

**조립 배선 요청 (리드, 각 1줄):** `attachClueIds` · `attachSonarContacts` ·
`attachSonarScopeParams` · `attachInteractionParams` · `attachFarmingRewards` ·
`attachFarmingRewardParams` · `createBoss`/`spawnBoss`/`attachBossDamageSink` ·
`sonarScope.attachDetectionStageSource`.

**M1·M2 게이트:** `M1_EXIT_GATE_PASSED=false` · `M2_PROGRESS_GATE_PASSED=false`
유지. 17차 완주 판정은 **dev 통합 빌드 실브라우저 완주**가 조건이며 위
blocker가 남아 있는 한 성립하지 않는다. 자동 검증 통과를 완주로 보고하지 않는다.

---

### INT-GAME-016 — M2 2~5단계 구현 + 공식 params 행 요청 (16·17차 결의 수치)

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 창 (17차 결의 3 **창 2**) |
| 대상 시스템 | `params/economy.json`(파밍 상한 2행) · `params/detection.json` 또는 신설 `params/sonar.json`(스코프 5행) · 신설 `params/boss.json`(약점 3행) · 신설 `params/interaction.json`(회수 3행) · `src/contracts/params.ts` · `src/config/validateParams.ts` · `src/core/Game.ts` 조립 |
| 변경 이유 | 16차 회의록(대회의)과 17차 회의록(소회의)이 저장소에 도착하면서 M1·M2 창 범위와 **튜닝표 초기값이 확정**됐다. 게임플레이는 2~5단계 판정 로직을 전부 구현했고, 남은 것은 그 수치를 담을 공식 params 행과 조립 1줄씩이다. `params/`는 기획 소유, `contracts`·`config`·`core`는 공통 보호이므로 게임플레이가 직접 쓰지 않았다 |
| 관련 게이트 | G4(성장 루프) · G5(은신·탐지) · G7(보스) |
| 하위 호환 | 유지 — 전부 신규 주입점이고, 미주입 시 각 시스템이 `unwired`로 남아 기존 동작이 변하지 않는다 |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | (대기) |

**이번에 구현한 것 (게임플레이 소유 영역 `src/systems/**`만)**

| 단계 | 파일 | 내용 |
|---|---|---|
| 2 — 단서 획득 | `progress/CluePickupProgress.ts` (신규) | 회수 완료 소비 → 단서 진행. 고유 id·중복 획득 불가·출항 간 누적·복원. **보스 구역 개방 게이트는 넣지 않았다**(17차 창 1 = 리드 소유) — `clueProgressSource`로 읽어 가면 된다 |
| 3 — 약점 판정 | `BossWeakPointTarget.ts` (수정) | 임시 배율(`provisionalBossWeakPointConfig`: 반경 6·배율 2.0/0.25)을 **삭제**하고 `BossWeakPointParams` 주입으로 전환. 개방/닫힘 **구분은 params 없이도 성립**하고 배율만 미확정이므로, unwired면 반경 0·피해 0으로 남는다 |
| 4 — 파밍 보상 | `economy/SectorFarmingRewards.ts` (신규) | 기존 단일 재화(`RunEconomy`)에만 적립, 해역당 상한 강제. 상한 미주입이면 **지급하지 않는다** — 무제한 지급은 16차 결의 2-3이 명시적으로 거부한 방향이라 '미확정 = 무제한'으로 해석하지 않았다 |
| 5 — 소나 스코프 | `sonar/SonarScopeSystem.ts` (신규) | 패시브(소음원만·방위만·거리 null) + 액티브 핑(전체 정확 표시). 핑의 대가는 기존 탐지 게이지 정본에 적용(`SubmarineDetectionSystem.raiseGauge`) |
| 접합 | `detection/SubmarineDetectionSystem.ts` (수정) | `effectiveNoiseFactor` getter + `raiseGauge()` 추가. 게이지 정본은 그대로 하나다 |

**17차 결의 4 준수 확인** — `SonarScopeSystem`은 `silentRunning` 불리언을
**입력으로 받지 않는다.** 유일한 입력은 탐지 시스템이 이미 계산한
`effectiveNoiseFactor`(침묵 배율이 이미 곱해진 값)다. 6단계에서 침묵 항행을
연결하면 스코프는 **코드 변경 0**으로 선명해진다. 검증기가 스코프 표면에
`silent` 계열 API가 없음을 기계적으로 확인한다.

**요청 1 — 공식 params 행.** 값은 전부 16·17차 결의문·튜닝표에 있는 것이며
게임플레이가 만든 수치가 아니다. 게임플레이가 `params/`를 직접 쓰지 않은 것은
소유권(FILE_OWNERSHIP: `params/` = 기획) 때문이다.

| 항목 | 결의 근거 | 초기값 | 조정 범위 | 주입 경로 |
|---|---|---|---|---|
| 회수 홀드 시간 | 16차 튜닝표 | 2.0초 | 1.0~4.0 | `attachInteractionParams.holdSeconds` |
| 회수 근접 반경 | **없음 — 기획 결정 필요** | ⏳ | — | `attachInteractionParams.interactRadiusMeters` |
| 회수 중 소음 기여 | **없음 — 기획 결정 필요** | ⏳ | — | `attachInteractionParams.noiseContribution` |
| 해역당 파밍 상한 비율 | 16차 결의 2-3·튜닝표 | 0.40 | 0.20~0.60 | `attachFarmingRewardParams.sectorCapRatioOfCombatAverage` |
| 전투 보상 평균 크레딧 | 상한의 기준선 — 파생 규칙 기획 결정 필요 | ⏳ | — | `attachFarmingRewardParams.combatRewardAverageCredits` |
| 액티브 핑 표시 시간 | 16차 결의 2-5 | 3.0초 | — | `attachSonarScopeParams.activePingDisplaySeconds` |
| 액티브 핑 게이지 상승 | 16차 튜닝표 | 0.30 | 0.15~0.50 | `attachSonarScopeParams.activePingDetectionGaugeRise` |
| 액티브 핑 쿨다운 | 16차 튜닝표 | 25초 | 15~45 | `attachSonarScopeParams.activePingCooldownSeconds` |
| 패시브 번짐 최대 반폭 | **없음 — 기획 결정 필요** | ⏳ | — | `attachSonarScopeParams.passiveBearingSpreadRadiansAtMaxNoise` |
| `depthChargeOnPassiveScope` | 17차 결의 4 | **false** | — | `attachSonarScopeParams.depthChargeOnPassiveScope` |
| 약점 판정 반경·배율 3종 | **없음 — `params/boss.json` 미존재** | ⏳ | — | `BossWeakPointTarget.attachParams` |

⏳ 표시 항목은 저장소·회의록 어디에도 공식 수치가 없다. **추정값을 넣지
않았고**, 미주입 상태에서 해당 시스템은 `unwired`로 남는다.

**요청 2 — 조립 배선** (`src/core/Game.ts`, 리드 소유). 각 1줄:
`attachClueDefinitions` · `restoreCollectedClues` · `attachFarmingRewards` ·
`attachFarmingRewardParams` · `attachSonarContacts` · `attachSonarScopeParams`.
접점·단서 정의·보상 금액은 월드·기획 데이터이므로 게임플레이가 만들지 않았다.

**요청 3 — 입력 바인딩 결정 (INT-GAME-015에서 이월, 미해결).**
회수 홀드가 `KeyE`를 읽는데 `KeyE`는 이미 상승(ascend) 병행 키다. 액티브 핑
키는 아직 배정되지 않았다(17차 결의 2로 `F`가 미배정 반환됐다 —
후보). 키맵 결정은 게임플레이 단독 결정 사항이 아니라 보고만 한다.

**보고 — 창 4(빌드·툴) 소관이라 손대지 않은 것.** 17차 결의 4의 폭뢰
lifecycle 이벤트 발행자(`depthChargeEnteredWater`·`depthChargeExploded`)는
`DepthChargeRunSystem`에 넣을 수 있었지만 **17차 범위표가 창 4에 배정**했으므로
구현하지 않았다. 스코프 쪽은 발행자가 생기면 접점 공급만 연결하면 된다.

**보고 — 6단계(침묵 항행)는 착수하지 않았다.** 17차 결의 3·5가 "회색 상자
보스전 **완주 판정(D10) 직후**"로 순서를 못 박았고, 완주 판정은 dev 통합
빌드에서 수행된다. 현재 `dev`에 보스 AI가 **0건**이므로(상태 보고서 §4)
완주 판정 자체가 성립하지 않는다. 순서를 앞당기지 않았다.

---

### INT-CORE-021 — interactionCollected 의미 확정(targetId/clueId 분리) · 단서 진행 정본 소유권 · PR #9 수신 (리드 창 — 두 번째 통합 PR)

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (PR #9 병합 후 — base = dev `bd59d0a`, 브랜치 `claude/deep-dive-core-lead-uyg77p`에 일반 merge 수신, 충돌 0) |
| **이벤트 의미 확정** | `interactionCollected` payload를 `InteractionCollectedEvent`(contracts/meta.ts) **discriminated union**으로 확정: **`targetId` = 월드 interactable 고유 ID**(모든 kind 공통 — 단서 ID로 해석 금지) / **`clueId` = canonical 단서 ID**(`params/boss.json unlock.clueIds`)로 `kind === 'clue'` arm에서만 **필수**, 비clue arm은 `clueId?: never`로 **타입 수준 금지**. `completedAt`은 소비자가 없어 추가하지 않음(필요 시 제안 후 추가) |
| **kind 정본** | 계약 정본 = `InteractionTargetKind` 4종 **`goldCache | salvage | clue | deepSite`**. 게임플레이 `InteractionSystem` 내부 태그(`gold | salvage | clue | deepSurvey`)와 다르다 — **변환은 게임플레이 조립 어댑터 소유**(후속 창). 리드 PR에서는 게임플레이 파일을 수정하지 않았다 |
| **단서 진행 정본 소유권 (단일)** | **원장(수집 id 목록)·중복 방지·저장 복원·해금 판정·보스 구역 게이트 = `BossProgressStore` 하나.** 게임플레이 어댑터(후속) = interactableId→clueId 매핑·kind 변환·`interactionCollected` 발행만 소유하는 **무상태** 계층. 게임플레이 쪽 `CluePickupProgress`류의 영속·복원·중복 방지 로직은 **병합 대상이 아니다**(중복 정본 금지) |
| Game 구독 정정 | 조립부 구독을 `payload.kind === 'clue'` → **`collectClue(payload.clueId)`**로 정정(기존 `payload.targetId` 전달은 월드 ID를 단서 ID로 오해하는 경로였음). 비clue kind는 진행 스토어에 전달하지 않는다 |
| ⚠ 발행자 0 | dev의 `InteractionSystem`은 로컬 `completionListeners` 콜백만 제공 — **`interactionCollected` EventBus 발행자는 현재 0이다.** 구독 배선은 계약대로 상시이나 런타임 배선 완료가 아니다(`INTERACTION_EVENTBUS_WIRED=false` 유지) |
| 검증 | verify:meta **156/156** — 구독 경로 테스트 6종(targetId≠clueId에도 clueId 기록·targetId 오해 경로 0·미지 clueId 거부·동일 clueId 중복 0(다른 targetId 포함)·비clue 영향 0) + `@ts-expect-error` 타입 정적 검사 2종(비clue clueId 금지·clue clueId 필수). typecheck·build·scope·gameplay 253/253·tooling 26/26·sprint-a/b/c 전부 통과 |
| 개발 리드 결정 | 승인 — 두 ID 의미·정본 소유권 확정. 게임플레이 후속 PR은 어댑터(매핑·변환·발행)만 추가하고 진행 상태를 들지 않는다 |

### INT-RENDER-014 — [RENDER][DETECT] 소나 스코프 읽기 모델 공용 계약 `SonarScopeReadModel` (리드 정의 — 배선 아님)

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (INT-GAME-015 5단계 차단 사유 "리드 계약 부재" 해소 + 그래픽스 기존 `SonarScope` 표시물과 게임플레이 판정의 비호환 수렴) |
| 신설 계약 | `src/contracts/sonar.ts` — `SonarScopeReadModel`: `unwired`(미확정 정지 자세 — blips 빈 배열·pingReady false·타이머 0·ringState 'safe' 고정), `noiseFactor`(0~1 — 표시가 의존하는 **유일한** 자기 상태), `blips[]`(canonical `targetId`·`kind`(ship/torpedo/depthCharge)·`bearingRadians`·`bearingSpreadRadians`·`distanceMeters | null`(패시브 거리 미상)·`fromActivePing`), `activePingRemainingSeconds`·`cooldownRemainingSeconds`·`pingReady`, `ringState`(**기존 `DetectionStage` 재사용** — 새 어휘 금지) |
| 금지 규칙 | ① blip에 **월드 좌표 탑재 금지** — 렌더는 방위·거리 표현만으로 그리고 재계산·역산하지 않는다 ② **침묵 항행 boolean 금지**(17차 결의 4) — noiseFactor 단일 의존, 원인 구분 표시 금지 ③ `depthChargeOnPassiveScope` 필터는 **게임플레이가 blips 공급 시점에 적용** — 렌더는 받은 blips를 걸러내거나 추가하지 않는다 (①②는 `@ts-expect-error` 정적 검사로 고정) |
| ⚠ 배선 아님 | dev에는 이 모델의 공급자(게임플레이 소나 시스템)도 소비자(그래픽스 스코프)도 아직 없다 — **계약 정의만이며 그래픽스 구현 완료로 표기하지 않는다** |
| 개발 리드 결정 | 승인 — 양쪽 창은 이 계약으로 수렴. blip kind 확장은 이 문서 제안 → 리드 결정 후에만 |

### INT-GAME-015 — M2 1단계 InteractionSystem (첫 통합 PR 범위) + 당시 기준 문서 부재 이력

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (M0~M2 지시 착수 — 1단계 선행 구현) |
| 대상 시스템 | `params/`(회수 수치 3종 신설 요청 — 기획), `src/core/Game.ts`(배선 1줄), 입력 규칙 결정 1건 |
| 필요한 변경 | ① **회수 수치 params** — `holdSeconds`(지시 명시값 2.0)·`interactRadiusMeters`·`noiseContribution`. 게임플레이는 주입 포트만 만들었고 값을 코드에 넣지 않았다(미주입 = unwired) ② **조립 배선 1줄** — `gameplay.attachInteractionParams(...)` + 회수 대상 공급 `gameplay.attachInteractables(...)`(콘텐츠 도착 시) ③ **입력 바인딩 결정** — 지시의 회수 입력 `E`는 **현재 상승 병행 키**다(플레이테스트 확정, `KeyboardInput.ascend`). 기존 바인딩을 지우지 않고 `interactHold` 읽기만 추가했으므로 지금은 두 동작이 같은 키를 공유한다. 회수 중 상승하면 '거리 이탈 취소'가 걸릴 수 있어 **키 결정이 필요**하다 |
| 변경 이유 | 1단계가 통합돼야 2·4단계(단서·보상 소비)를 병합할 수 있다는 지시 순서를 지키기 위해 1단계만 선행 구현했다 |
| 하위 호환 여부 | 계약 파일 무수정. 기존 소음 경로는 **대체하지 않고 가산 기여자만 추가**했다(`addNoiseContributor`) — 조립부가 연결한 속도 기반 소음 정책 그대로 유지. 검증 253/253·meta 128/128·tooling 26/26·sprint-a 30/30 통과 |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

**구현 완료 (1단계):** `systems/interaction/InteractionSystem` — 금괴·salvage·단서·심층 탐사 지점이 **공유하는 단일 시스템**(타입별 시스템 0). 근접 판정·E 홀드·진행률·거리 이탈/대상 제거/입력 해제 취소·완료 통지 1회·같은 대상 중복 회수 불가·UI read model(접근 가능·진행률·이미 회수함·unwired) 구현. 회수 중 소음은 **기존 `attachNoiseSource` 경로에 가산**되며 별도 소음 정본을 만들지 않았다. 회수 이력은 `restoreCollected()`로 복원만 받고 **저장하지 않는다**(저장 정본 신설 0).

**✅ [해소됨] 기준 문서·계약 부재 — 아래는 구현 시점(`b983dec`)의 이력이다**

> **현재 사실이 아니다.** 최신 `dev`(`5cb0210`)에 `AGENTS.md`·`CLAUDE.md`·
> `DEEP_DIVE_STATUS_REPORT.md`·16차 대회의록·17차 개발팀 소회의록이 **전부
> 존재한다.** 아래 표와 목록은 "왜 당시 1단계만 선행했는가"를 남기기 위한
> **과거 기록**이며 현재 상태 보고가 아니다. 도착 후 정합 확인 결과는 이 절
> 끝의 「기준 문서 도착 후 정합 확인」에 적었다.

지시가 지정한 문서 우선순위 중 다음이 **당시** 저장소에 존재하지 않았다:

| 우선순위 | 문서 | 당시 상태 (`b983dec`) | 현재 (`dev@5cb0210`) |
|---|---|---|---|
| 1 | `AGENTS.md` | 전 브랜치 부재 | ✅ 존재 (`0d761a8`) |
| 3 | 17차 개발팀 소회의록 | 부재 (`docs/meetings/`는 15차까지) | ✅ 존재 (`971be90`) |
| 4 | 16차 대회의록 | 부재 | ✅ 존재 (`971be90`) |
| 5 | `DEEP_DIVE_STATUS_REPORT.md` | 부재 | ✅ 존재 (`0d761a8`·`5cb0210`) |

또한 **M0·M1·M2 마일스톤 정의 자체가 당시 저장소에 없었다.** `dev` tip(`d968514`)의
최신 상태는 스프린트 C 완료(`C_FINAL_COMPLETE=true`)였고 M0 그래픽 통합·M1 보스
회색 상자·M2 단서/해금/보상에 해당하는 범위표·인수 조건이 없었다. **현재는 16차
결의 1·17차 결의 3(5창 범위표)이 그 정의를 제공한다.**

다음 **리드 계약도 당시 부재**라 해당 단계를 시작할 수 없었다:
- 회수 완료 이벤트 계약(현재는 시스템 콜백으로 제공 — 이벤트화는 리드 결정 사항)
- 단서 **진행 상태 계약**(2단계: "획득 이벤트는 개발 리드의 진행 상태 계약으로 전달")
- `SonarScopeReadModel`(5단계: "개발 리드 계약에 맞게 연결")

콘텐츠도 당시 부재: 금괴·난파선 salvage 구분·심층 탐사 지점·보스 회색 상자 배치.

**단계별 착수 가능 여부 — 당시(`b983dec`) 판정**

| 단계 | 당시 상태 | 사유 |
|---|---|---|
| 1 InteractionSystem | **완료** | 규격이 지시에 자족적으로 명시됨 |
| 2 단서 획득 연결 | **대기** | 지시 자체가 "1단계 통합 전 병합 금지" + 진행 상태 계약·단서 콘텐츠 부재 |
| 3 약점 판정 | **부분 기존** | `BossWeakPointTarget`이 활성/비활성 구분·피격 결과 구분·노출 상태(`weakPointOpen`)를 이미 소유. 남은 것은 ① 피해 배율 params 이관(현재 임시값) ② 액티브 핑 연동(5단계 종속) |
| 4 파밍 보상 경제 | **대기** | 1단계 통합 전 병합 금지 + 상한(전투 보상 평균 40%)·보상값이 `params/economy.json`(기획 소유)에 없음 |
| 5 소나 스코프 | **대기** | `SonarScopeReadModel` 리드 계약 부재 + 수치(3초·30%·25초) params 부재 |
| 6 침묵 항행 | **대기** | 지시 자체가 "보스전 완주 판정 전 연결 금지". 보스 회색 상자 미존재. 저장소도 `C_SILENT_RUNNING_INTERACTIVE=false`를 후속으로 기록 중. 소비 경로(`attachSilentRunningSource`)는 이미 존재 |

---

**기준 문서 도착 후 정합 확인 (현재 사실)**

기준 문서 4종이 `dev`(`971be90`·`0d761a8`·`5cb0210`)에 도착해 위 차단 사유는
해소됐다. 도착한 문서와 이 PR의 구현을 대조한 결과 **수정이 필요한 불일치는
없다.**

| 17차 결의 3 창 2(게임플레이) 규격 | 이 PR의 구현 | 판정 |
|---|---|---|
| `InteractionSystem`을 보스 착수 **전 선행** | 이 PR이 M1·M2 통합 순서의 첫 PR | ✅ 순서 일치 |
| E 키 근접 프롬프트 | `KeyboardInput.interactHold`(`KeyE`) + 근접 후보 read model | ✅ |
| 2초 홀드 회수 | `holdSeconds` **주입값**. 16차 튜닝표 초기값 2.0초는 `params` 소유이므로 코드에 넣지 않았다 | ✅ (params 대기) |
| 회수 중 소음 발생, **기존 `attachNoiseSource` 경로에 소음원 추가** | `DetectionEnvironmentAdapter.addNoiseContributor` 가산. 기존 속도 기반 소음 정책을 대체하지 않음 | ✅ 문구까지 일치 |
| 대상 타입: 금괴·salvage·단서·심층 지점 **공용** | 단일 시스템 + `kind` 태그. 타입별 시스템 0 | ✅ |
| M2 배관 겸용 | 완료 통지만 내보내고 소비는 시스템 밖 | ✅ |

**이번 PR(첫 통합 대상)의 범위 — InteractionSystem 선행 배관만**

포함: 공용 `InteractionSystem`, `interactHold` 입력 상태, 근접·거리 이탈·대상
제거·입력 해제 취소, 회수 중 가산 소음, 완료 1회, 재회수 방지, UI read model,
게임플레이 결정적 검증.

**제외(후속 PR):** 단서 진행 정본 · `BossProgressStore` 연결 · 보스 해금 ·
파밍 보상 · 소나 스코프 · 침묵 항행 · M3(어뢰 캠·프리룩). 회수 완료의
**EventBus 이벤트화**와 리드 `InteractionTargetKind` 계약 소비도 이 PR에
넣지 않았다 — 리드 계약 병합 후 후속 게임플레이 PR에서 연결한다.

**남은 요청 (이 PR 병합과 무관하게 계속 유효)**

① 회수 수치 params 3종 — `holdSeconds`(16차 튜닝표 초기값 **2.0초**, 범위
1.0~4.0) / `interactRadiusMeters`(**공식 수치 없음** — 기획 결정 필요) /
`noiseContribution`(**공식 수치 없음** — 기획 결정 필요).
② 조립 배선 — `attachInteractionParams` · `attachInteractables`.
③ **입력 바인딩 결정** (아래 별도 절).

**③ 입력 바인딩 현황 — 재확인 결과 (코드 기준)**

| 확인 항목 | 결과 |
|---|---|
| `E` 상승 입력이 유지되는가 | ✅ 유지. `KeyboardInput.ascend`는 `ControlLeft`·`ControlRight`·**`KeyE`**를 그대로 읽는다(제거·변경 없음) |
| 회수 홀드 중 상승이 동시에 발생하는가 | ⚠ **발생한다.** `ascend`와 `interactHold`가 같은 `KeyE`를 각각 독립적으로 읽으므로 E를 누르면 상승과 회수 홀드가 **동시에** 진행된다 |
| 상승 때문에 거리 이탈 취소가 날 수 있는가 | ⚠ **가능하다.** `InteractionSystem`의 거리 판정은 **3D**(`Math.hypot(dx, dy, dz)`)라 수직 상승만으로도 `interactRadiusMeters`를 벗어나 `outOfRange` 취소가 걸릴 수 있다. 실제 발생 여부는 아직 확정되지 않은 `interactRadiusMeters`와 상승 속도에 달려 있다 |
| 입력을 소비하는가, 읽기만 하는가 | **읽기만 한다.** 두 getter 모두 `heldCodes` 조회일 뿐 키 상태를 소거하지 않는다. 따라서 어느 한쪽이 다른 쪽을 가로채지 않으며, 바인딩을 바꿀 때 이 파일의 getter 한 줄만 고치면 된다 |

**후속 결정 항목:** 회수 키를 `E`에서 분리할지, 상승 병행 키를 옮길지, 또는
회수 중 수직 입력을 억제할지. 셋 다 입력 규칙 결정이므로 **이 PR에서는 추측으로
바꾸지 않았다.** 17차 결의 2로 `F` 키가 키맵에서 미배정 반환된 상태다(후보).

### INT-RENDER-013 — [ART][RENDER] 수심 확장: 시작 협곡 레이아웃 수직 데이터 변경 (리드 확인 요청)

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 창 |
| 대상 시스템 | `src/world/startingCanyonLayout.ts` (공용 데이터 — 공통 보호에 준함) |
| 필요한 변경 | **적용 완료(작업 지시 근거) — 사후 확인 요청.** `FLOOR_Y` -6 → **-20**(수직 수역 18m → 32m, 약 1.78배). 벽 sizeY 11/12±2 → 25/26±2, 엄폐 기둥 sizeY 10/12/9 → 24/26/23 — **벽·기둥 상단 절대 높이·수평 통로 폭·S자 수로·해수면(12)은 전부 불변** (INT-CORE-004 능선<해수면 결정 유지) |
| 변경 이유 | 아트 디렉션 작업 지시: 실수직 잠항 공간 확장(스케일 눈속임 금지). 잠항 상·하한(provisionalWorld 파생), 충돌(collision 파생), salvage 착저 높이(파생), 환경 배치(파생)가 전부 레이아웃 파생이라 코드 변경 없이 자동 추종함을 조사로 확인 |
| 관련 게이트 | — (밸런스 수치 아님 — 월드 데이터. 탐지 심도 층 3층 계약·게임플레이 판정 무변경) |
| 영향을 받는 파일 | `src/world/startingCanyonLayout.ts`만 수정. 파생 확인: `systems/provisionalWorld.ts`(min/max Y 자동), `systems/collision/*`(자동), `world/salvagePlacements.ts`(자동), 렌더 심도 그레이딩(`renderVisualParams.json artDirection.depthGrading`) |
| 하위 호환 여부 | 깨지지 않음 — verify:gameplay 213/213(레이아웃 파생 검증 포함)·verify:hud 34/34·verify:sprint-a/b 통과. 실측: 잠항 하한 -19.0(해저 이탈 없음)·상한 11.0(수면 돌출 없음) |
| 개발 리드 결정 | (대기 — 조건부 승인, 아래 통합 후 재검증으로 조건 이행) |
| 적용 커밋 | feat/render — 수심 확장·암벽 셸·탐조등·wake 커밋 |
| **dev(7eb8d5c) 병합 후 재검증 (그래픽스 창, C 런타임 포함)** | 자동: gameplay **242/242**·meta **128/128**·tooling **26/26**·hud **34/34**·sprint-a·sprint-b·sprint-c **23/23**(C9 **17필드 확정, 미확정 0**) 전부 통과. 브라우저(스크립트 실측, 콘솔·페이지 오류 0): ① 수심 -19.0~11.0 왕복·월드 이탈 없음 ② 4개 심도(잠망경 5.0/중간 -7.8/심해 -15.6/최심부 -19.0)에서 탐지 HUD wired·게이지 심도 보정 작동(수면 0.24 vs 최심부 0.03 — 심층 은신 유지) ③ **폭뢰 목표 심도 기폭**: 투하점 y=11.98 → 기폭 목표 = 플레이어 관측 심도 y=11.0 (y=0 고정 아님), outcome 분류(outOfRange) 작동 ④ 침수 첫 이벤트 severity **0.10 = near 기여 승인값 일치** → 반복 피격 flood 1.0 → **침수 잠식 파괴**(hull 120→0) ⑤ 실패 화면 `DebriefConfirmCommand.confirm()` → BASE 전환 ⑥ 재출항 reset: hull 120·침수 0·salvage 3 재생성·탐지 safe·경비 마커 0 ⑦ 화물선 수면(12) 유지·경비 스폰·태그/마크/탐조등/wake 정상 ⑧ 품질 low/medium/high 로드·텍스처 404 fallback 전부 오류 0 |

### INT-CORE-016 — C 통합 blocker 마감: AI 공격 요청 생성 · DEBRIEF confirm 정책 개정 · 통합 patch 확정

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (역할 보고 4건 수신 후 — 게임플레이 `844d0c7`·그래픽스 `97e7dd3`·툴링 `2814dd0`. 역할 브랜치 병합 없음, 보고·계약 기준으로만 리드 소유 영역 수정) |
| 대상 시스템 | `src/core/DestroyerAIController.ts`·`destroyerAiFactory.ts`(공격 요청 생성), `src/contracts/survival.ts`(canConfirm·DebriefConfirmOutcome), `src/core/SortieFailureCoordinator.ts`(자동 전환 제거), `src/core/PveIntegration.ts`(DebriefConfirmCommand·EnemyAttackPortBinding), `src/core/GuardShipAdapter.ts`(TrackingStateSource), `src/core/Game.ts`(조립) |
| Blocker 1 해소 | `DestroyerAIController`가 **attack 상태에서만** `EnemyAttackRequest` 생성 → 주입된 `EnemyAttackPort`(게임플레이 `EnemyAttackCoordinator`)로 전달. AI는 요청만 — 피해량·반경·사거리·쿨다운·신관 비소유, DamageReceiverPort·DepthChargeRunSystem 직접 접근 0. destroyed·위치 미확인·lost·포트 미연결에서 요청 0건. 탐지 게이트는 게임플레이 motion 포트(getTargetPosition = detected일 때만) 소유 — stage 재판정 없음(이중 판정 금지), 기존 patrol/alert/attack/lost 전이 무변경. `EnemyAttackPortBinding`: 미연결 = unwired(투하·피해 0), 병합 시 `enemyAttackBinding.attach(gameplay.enemyAttackPort)` 1줄 |
| Blocker 2 해소 | **DEBRIEF 종료 정책 공식 개정** (그래픽스 INT-RENDER-012 '자동 completeDebrief 제거' 요청 승인·확장): 저장 성공 → `saveStatus='saved'`·DEBRIEF 유지·`canConfirm=true` → 사용자 확인(`DebriefConfirmCommand.confirm()`) → BASE. 저장 실패 → DEBRIEF 유지·canRetrySave일 때만 retrySave(재정산 0) → 성공 시 confirm 활성. 정상 귀환·실패 **양쪽 동일 정책**. 보장: 정산 출항당 1회·최초 saveRequested 1회·retry 재정산 0·저장 성공만으로 completeDebrief 자동 호출 0·중복 confirm 시 BASE 전환 1회·저장 미완료 confirm 거부(saveIncomplete)·화면 분기는 kind만 |
| Blocker 3 | 통합 composition patch 확정 — `docs/SPRINT_C_HANDOFF.md` §'통합 composition patch' (게임플레이 4+1줄·그래픽스 2줄+confirm 교체·조립 순서·Game.ts 충돌 표) |
| Blocker 4 | B5 테스트 변경 검토 acceptance 5항목 — SPRINT_C_HANDOFF §⑤ (통합 관리자 검사) |
| Blocker 5 | `consumeDamageFlash` 계약 판정 **허용** — SPRINT_C_HANDOFF §⑥ (플래시 플래그만 해제, 코어 상태·lastDamage 불변, snapshot 계약 유지) |
| 하위 호환 여부 | `DebriefReadModel.canConfirm` 필드 추가(소비자는 그래픽스 신규 화면뿐 — 병합 시 3-인자 tracker 채택 필요), `SortieFailureReport.nextState`는 이제 항상 'DEBRIEF'(자동 BASE 폐기), factory 2번째 인자 추가(기본 null — 기존 호출 무영향) |
| 개발 리드 결정 | 승인 — **C_INTEGRATION_HANDOFF_READY=true.** 그래픽스 Game.ts의 `completeDebrief` 직접 호출은 병합 시 `debriefConfirm.confirm()`으로 교체할 것(저장 미완료 가드 우회 방지) |
| 적용 커밋 | 2dacea4(AI 공격 요청)·fd5574b(confirm 정책·바인딩)·223bfd8(검증 119) + 문서 커밋 |

### INT-CORE-017 — C 런타임 마감 준비: combat params 정규화 단일 소유 · 실패 화면 confirm 경유 (구조 blocker 2건 해소)

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (통합 실행 결과 보고의 blocker §5·§11-3 해소 — 브랜치 `claude/sprint-c-runtime-closeout`, 기준 `bd87828`) |
| 대상 시스템 | `src/systems/combat/officialCombatParams.ts`(평면 리더 제거·`NormalizedCombatParams` 단면), `src/systems/GameplaySystems.ts`(`attachCombatParams` 타입화), `src/ui/SortieFailureScreen.ts`(attach 3-인자·confirm 경유), `src/core/Game.ts`(배선 2곳), 검증(`verifyGameplay`·`verifyMeta`·`run.mjs`) |
| 해소 1 — 전송 형태 충돌 | **정규화 소유자는 공인 로더 한 곳**(`tools/combatParams.validateCombatParams` → `combatParamsLoader.loadCombatParams`)이다. 게임플레이 구 평면 리더 2종(root 평면 키 해석 — 중첩 스키마와 불일치해 값이 도착해도 읽히지 않던 이중 정규화) 제거. `attachCombatParams(params: NormalizedCombatParams)` — 조립부가 로더 결과의 게임플레이 단면(`detectionTuning`·`depthCharge`)을 슬라이스 전달. raw combat.json import 0건(공인 로더 2곳 외 금지 — 정적 검사), null 블록·null 필드는 그대로 전달(unwired 유지, null→0·fallback·부분 wired 금지). 선체·침수 블록은 기존대로 리드 코어 생성자 직접 주입(무변경) |
| 해소 2 — 실패 화면 confirm | `SortieFailureScreen.attach(model, retryCommand, confirmCommand)` 3-인자화. '확인 (기지로)' = `debriefConfirm.confirm()` guarded command 호출, 성공(`'confirmed'`)일 때만 화면 닫힘 — DOM 숨김 전용 경로 제거. 버튼 노출 근거는 `DebriefReadModel.canConfirm` 하나. 정상 귀환 화면과 동일 정책(INT-CORE-016 §⑦의 실패 화면 측 완결). fixture(`?cdemo=1`)도 동일 정책 표본으로 갱신 |
| 검증 | `verify:meta` +5(정규화 필드 교환 0·null 보존·NaN/음수 거부 3건 + 정적 검사 ③-2 정규화 단일 소유·③-3 confirm 경유 2건) → 124/124. `verify:gameplay` 주입 경로를 실경로(validateCombatParams 경유)로 교체 → 238/238 |
| 하위 호환 여부 | `attachCombatParams` 시그니처 변경(unknown → `NormalizedCombatParams`) — production 호출자는 조립부 1곳뿐. `SortieFailureScreen.attach` 3-인자화 — 호출자는 조립부·fixture 2곳뿐. 15필드 전량 null 유지라 **런타임 동작 변화 0**(탐지 safe 고정·공격 unwired·폭뢰 피해 0) |
| 개발 리드 결정 | 승인 — 구조 blocker 2건 해소. **C9 수치는 별도 트랙**: 결정표는 PROPOSED(기획 승인 대기)로만 보고하며 production·params에 숫자 미입력. `C_COMBAT_PARAMS_DEFINED=false`·`C_RUNTIME_WIRED=false`·`C_BROWSER_EMPIRICAL_COMPLETE=false`·`C_FINAL_COMPLETE=false` 유지 |
| 적용 커밋 | 400373a(정규화)·c7c36f4(confirm)·da683c4(검증) + 문서 커밋 |

### INT-CORE-018 — C9 v0.1 승인값 입력 · 탐지 기준 배선 2줄 · production 브라우저 실측 완주

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (C9 v0.1 승인 접수 — 브랜치 `claude/sprint-c-runtime-closeout`) |
| 승인값 입력 | `params/combat.json` 15필드 전량 확정(C-13). 공인 스키마 유지·지정 필드 외 무변경·pressure 미추가. 공인 로더 결과: **pendingFields 0건·전 블록 non-null·fullyDefined=true**. `C_COMBAT_PARAMS_DEFINED=true` |
| 배선 2줄 (C-14) | ① `torpedoFired`→`reportTorpedoLaunch`(§5.10 확정 규칙 — production 호출자 0건이던 계약 구현의 조립부 이벤트 브리지) ② 출항 시작 `reportNoise(1)`(공식 만충 시간 정의의 기준 조건 — 미공급 시 소음 0으로 충전식 퇴화, 탐지·attack·폭뢰 사슬 전체 도달 불가였음을 실측으로 확인) |
| 실측 (production, fixture 아님) | 탐지 상승 0→만충 9.65s(잠망경 진입 ~2s 포함, 공칭 8.0s)·재상승 17.0s(원거리 접근 램프 포함) / 감쇠 1→0 **8.000s**(=1/0.125) / 신관 게임 시계 **정확 3.000s ×10발**(하한 3.0 준수) / 공격 간격 단일 공격자 **6.05s**(5.99~6.17), 공격자 2척 교차 시 3.03s / direct **45**(cruise y −3.62, 기폭 y=0 일치) · near **12**(잠망경 y≈9 — 수직 offset로 3D 11m) · miss **0 피해**(이탈 39.5m) / 파괴: near 연타 30.5s(10타)·direct 9.1s(3타, 마지막 30 클램프) / 파괴 후 10s 신규 투하 0(PlayerAliveSource 게이트) / `sortieFailed`·정산 1회·`saveRequested(settlement)` 1회·saved·실패 화면 canConfirm → confirm → BASE / 재출항 reset(선체 120/120·침수 0·어뢰 3·게이지 0·경비함 0·debrief none). 콘솔 오류 **0** (전 세션) |
| 실측 발견 blocker | ① **침수 미발생** — production의 어떤 DamageRequest도 `causesFlooding=true`를 보내지 않는다(폭뢰 시스템 주석: '침수 기여량은 공식 params 소유'). 피격→침수 기여량 공식 param이 C9 15필드에 없어 침수 루프(단계·침수 파괴)는 브라우저에서 도달 불가 — 수치 발명 없이는 해소 불가, 기획 결정 필요 ② **잠망경 심도에서 direct 불가** — 폭뢰가 관측 y=0에 기폭돼 잠망경(y≈9)에서는 수직 offset만으로 near가 상한(심도별 피해 기하는 관측 y 규약의 결과 — 밸런스 위험 항목) ③ 근접 폭발 밀려남(8m)이 폭발 반대 방향(상향 성분)이라 폭격 중 잠항이 상쇄될 수 있음(y 7.94 평형 관측) |
| 개발 리드 결정 | `C_COMBAT_PARAMS_DEFINED=true` · `C_RUNTIME_WIRED=true` · `C_BROWSER_EMPIRICAL_COMPLETE=true`(**침수 스테이지 제외 명시** — 기능 부재이지 실측 누락이 아님) · **`C_FINAL_COMPLETE=false` 유지**(침수 유발 경로 부재가 생존 루프의 공식 구성요소 미완이므로 최종 완료 선언 불가) |
| 적용 커밋 | c943d35(승인값)·885839f(배선) + 문서 커밋 |

### INT-CORE-020 — M1 보스 코어 · M2 단서/해금 계약 (리드 창 — 17차 결의 3 창 1)

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (base = M0 병합 후 dev tip `d968514`, 브랜치 `claude/deep-dive-core-lead-uyg77p` 재시작) |
| 신설 계약 | `contracts/boss.ts` — 패턴 등록부 4종 봉인·예고·`BossAttackRequest/Port`(요청만, 관측 3D 고정, 수치 비탑재)·`BossMotionPort`(기존 이동 포트 + 속도 노브 1)·`BossPhasePort`(게임플레이 약점 판정 소비 단면 정본 승격 — INT-GAME-008 해소)·`BossDamageSink`(보스 체력 원장 — 플레이어 단일 창구와 별개)·`BossCoreView`·`BossZoneGatePort` |
| **보호 파일 변경 4건 (사유 명시)** | ① `contracts/events.ts` — `interactionCollected`(16차 결의 2-4 단일 InteractionSystem 배관)·`bossCluesChanged`·`bossDefeated` 신설: 기존 이벤트로 표현 불가(동일 의미 이벤트 없음 확인) ② `contracts/meta.ts` — `InteractionTargetKind` 4종: 상호작용 대상 공용 계약 ③ `contracts/params.ts` — `BossParams`·`BossPatternFlags`: 작업 2 규격의 params 계약 정본 위치 ④ `src/meta/save/` (툴링 소유) — **스키마 v2**: 개수만으로는 '동일 단서 중복 반영 금지'를 재접속 후 보장할 수 없어 id 목록이 필수. 소회의 11 결의 7(마이그레이션 동반) 이행 — v1→v2 함수·검증기·verifyTooling 사슬 테스트 동반. 기존 저장·기본값 안전(테스트 확인) |
| 구현 (리드 소유) | `core/BossController`(DestroyerAIController **합성** — B5 단일 구현 보존, 예고 선행·1→2→3 순차·격파/플레이어 파괴 후 요청 0·피해 원장), `meta/BossProgressStore`(단서 id 원장·단조 해금·진입 게이트), `PveIntegration`(SaveSnapshotSource.progress·`BossVictoryBridge`), `config/bossParams(+Loader)`, `params/boss.json`(스코프 가드 1/1) |
| Game 조립(적용 완료) | boss params 로드 1회 · 진행 복원(부팅 1회) · `interactionCollected` clue 구독 · 승리 브리지 등록 · SaveBridge 스냅샷에 progress · 디버그 핸들 `bossProgress` |
| **창 2(게임플레이) 소비 지침** | ① `InteractionSystem`이 회수 확정 시 `interactionCollected {kind, targetId, x, z}` 발행(단서 id는 `params/boss.json unlock.clueIds` 3종) ② `BossAttackPort` 구현 — ram 접촉·projectile 비행(기존 어뢰 경로 역방향) 판정, 피해는 반드시 기존 `DamageReceiverPort.applyDamage` 경유, 수치는 boss params(`patterns.projectile.damage` 등) 직접 주입 ③ `BossMotionPort` 팩토리(기존 이동 코드 + `setMoveSpeed` 노브) ④ `BossWeakPointTarget`의 임시 배율 2.0/0.25를 params(`patterns.weakPointOpen.*`)로 교체, 명중 결과를 `BossDamageSink.applyBossDamage`(배율 적용 후 최종값)로 전달 ⑤ phase·weakPointOpen은 리드 코어 `phasePort` 소비 |
| **창 3(그래픽스) 소비 지침** | `BossCoreView`(값 복사본)·`bossPhaseChanged`·`bossDefeated`·`bossCluesChanged` 구독 — 예고(telegraph) 연출이 회피 신호의 정본. 보스 전용 HUD 정본 신설 금지(기존 HUD 계층) |
| 통합 잔여 patch (창 5) | 보스 개체 스폰(배치·진입 연출 도착 후): `new BossController({motion: gameplay.bossMotionPort, params: loadBossParams(), attackPort: gameplay.bossAttackPort, playerAlive: playerHull, bus, ...})` + 약점 판정 브리지(`BossWeakPointTarget.onHit → boss.applyBossDamage`) + 어뢰 발사 노출 연결(`torpedoFired → boss.notifyLastKnownPosition`) + 진입 게이트 소비(`bossProgress.requestEntry()`) |
| 검증 | verify:meta **150/150**(M1·M2 26건 신설 — 작업 4 단언 전부) · verify:tooling **26/26**(마이그레이션 사슬 v0→v1→v2 승격) · gameplay 242/242 · scope 가드 보스 1/1 · 전 스위트 통과 |
| 개발 리드 결정 | 승인 — 계약·코어·해금·보상 경로 확정. 보스 스폰·판정 배선은 창 2 산출물 도착 후 통합 창 순서(17차 결의 3: InteractionSystem → 보스 코어 → 병렬 2건) |

### INT-CORE-019 — C 최종 런타임 blocker 3건 마감: 침수 기여(v0.1.1)·소음 정책·목표 심도 기폭 — **C_FINAL_COMPLETE=true**

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (C9 v0.1.1 승인 접수 — 브랜치 `claude/sprint-c-runtime-closeout`, 기준 `12dabde`) |
| Blocker 1 해소 | 침수 기여 2필드(C-15): direct 0.35·near 0.10 — 공인 스키마·로더 단일 해석(17필드)·관계 검증(0<near<direct≤1)·`NormalizedCombatParams` 경유·outcome별 결정·단일 창구·중복 1회·clamp 1.0·tick 경로 유지·pressure 미추가 |
| Blocker 2 해소 | 소음 정책(C-16): 속도 비례(`\|speed\|/유효 maxSpeed`) — 고정 reportNoise(1) 폐기, 하드코딩 0, 정지 0·전속 1, 침묵 미구현 = 소스 미연결 false 중립(**C_SILENT_RUNNING_INTERACTIVE=false**) |
| Blocker 3 해소 | 목표 심도 기폭(C-17): 관측 3D 고정 → 낙하(파생 보간) → 목표 심도 기폭 — y=0 고정 폐기, 재추적·유도 없음, 3D 거리 판정 |
| 실측 (production 재실측 — fixture 아님) | 정지: 소음 0·게이지 0(관측자 20~40m) / 전속: 소음 1·만충 10.2s(가속 램프 ~3s 포함 — 공칭 8s 정합)·상승률 speed4→0.048/s·speed8→0.085/s(비례) / 정지 회피: 감쇠 9.49s→safe / 발사 노출: 정지(소음 0) 발사 → 게이지 즉시 ≈1 / 기폭 심도 3층: periscope 목표 11·cruise −1.2·deep −3.28 — 전부 관측 y에서 기폭(낙하 시작 = 공격자 수면 y≈12) / direct 45+침수 +0.35(×4) / near 12+침수 +0.10 / miss 0+0 / 단계: minor 0.151(자연 확산 도달)→major→catastrophic 0.803 — 실제 피격+확산 경유 / 지속 피해 2.4×level 정확(dt 무관) / 침수 잠식 파괴(침수 1.0 상태 60+ hull 잠식) / 파괴 후 10s 신규 투하 0 / 정산·저장 1회·실패 화면 canConfirm→confirm→BASE / 재출항 reset(120/120·침수 0·어뢰 3·게이지 0 safe·경비함 0) / 콘솔 오류 0 |
| 잔여 관찰 | 기폭 심도 수정 후 밀려남의 지속적 잠항 상쇄 **재관측 없음**(전투 중 y −1.2 유지 — 구 y=0 기폭 시절의 상향 밀림 평형은 해소). 밀려남 수치는 무변경(8m 확정값) |
| 개발 리드 결정 | 전체 자동 검증 + production 실측 통과 — **C_BROWSER_EMPIRICAL_COMPLETE=true · C_FINAL_COMPLETE=true** 선언. C_SILENT_RUNNING_INTERACTIVE=false는 후속(대화형 침묵 조작 + 속도 소음과의 상호작용 실측) |
| 적용 커밋 | c2ee51d(침수 기여·기폭 심도)·45257d8(소음 정책)·74e13c3(검증) + 문서 커밋 |

### INT-GAME-014 — C1~C4 게임플레이 구현 완료 + production 배선 4줄 요청 (조립부)

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (창 2 — C1~C4 source·adapter·composition. B는 여전히 미발효 선행개발) |
| 대상 시스템 | `src/core/Game.ts`(조립 배선 **4줄**) — 계약·리드 구현 변경 요청 **없음** |
| 필요한 변경 | `Game.composeSystems`에서 네 줄: ① `gameplay.attachPlayerAliveSource(playerHull);` — 리드가 남긴 대기 주석(Game.ts) 자리. 파괴 후 추적·공격 요청이 멈춘다 ② `gameplay.attachDamageReceiver(playerHull);` — 폭뢰 피해의 **단일 창구** 연결. 미연결이면 폭발해도 피해 경로가 없다(게임플레이는 자체 체력을 만들지 않는다) ③ `gameplay.attachCombatParams(combatJson);` — `params/combat.json` 원본 주입. 현재 C9 필드가 없어 탐지·폭뢰 판정이 **unwired**로 남고, 툴링이 필드를 추가하면 같은 줄로 자동 구동된다 ④ (렌더) `gameplay.detectionHudView()`·`gameplay.detectionStageSource` 소비 — HUD 눈 아이콘·게이지. 추가로 리드 `GuardShipAdapter`가 만든 AI가 공격하려면 `gameplay.enemyAttackPort`를 AI 공격 요청 소비자로 연결해야 한다(현재 `DestroyerAIController`는 이동만 하고 공격 요청을 만들지 않는다 — 아래 blocker) |
| 변경 이유 | C1~C4의 게임플레이 측 구현·adapter는 끝났고, 값이 실제로 흐르려면 조립 배선이 필요하다. 임의 수치·자체 체력·병행 정산을 만들지 않았으므로 배선이 유일한 해소 경로다 |
| 관련 게이트 | C1·C2·C3·C4 (+ C 공통 이중 정산 방지) |
| 하위 호환 여부 | 계약 파일 **무수정**. 검증 238/238·meta 110/110·tooling 26/26·sprint-a 30/30·sprint-b 23/23 통과 |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

**게임플레이 적용 완료 (C1~C4):**
- **C1 탐지 게이지 정본** `systems/detection/SubmarineDetectionSystem` — 계약 `DetectionSystem`+`DetectionStageSource`+`SortieResettable` 구현. HUD는 `DetectionHudView` 값 복사본, AI는 **stage와 마지막 노출 위치만** 받는다(게이지 비노출·내부 mutable state 접근 불가). 거리 감쇠·감소율이 null이면 **게이지 0·safe 고정·전이 0**. 출항 시작·종료 reset. 관측자는 세력 무관 동일 계약(적대·patrol·향후 호위 공용)
- **C2 환경 입력** `systems/detection/DetectionEnvironmentAdapter` — 기존 3층 심도 정본 소비. 보정식·계수를 만들지 않는다(공식 `depthModifiers`·`silentRunningNoiseMultiplier`를 탐지 시스템이 적용). 소음·침묵 항행 소스는 공식 규칙이 없어 **미연결 = 중립 입력**(0 / false)이며 `wired`로 드러난다. 심도 이동 물리 무변경
- **C3 추적 연결** — `PatrolShipFleet.getTargetPosition(PLAYER)`가 stage `detected`일 때만 위치를 준다. 전이는 전적으로 리드 `DestroyerAIController`가 수행하며 상태 어휘·전이 로직을 복제하지 않았다. 새 이벤트 없음(`detectionChanged` 단일)
- **C4 공격 경계** `systems/combat/EnemyAttackCoordinator`(계약 `EnemyAttackPort`) — 사거리·쿨다운 판정 소유. params null이면 `unwired`, 표적 파괴 시 거부, 같은 `attackId` `duplicate`. **요청 즉시 피해 없음**(투하만)
- **C4 폭뢰** `systems/combat/DepthChargeRunSystem`(계약 `DepthChargeSystem`) — 투하→낙하→신관(**3.0초 하한 준수**)→폭발→direct/near **택일**→`DamageRequest`→`DamageReceiverPort.applyDamage` 단일 창구. 반경·피해 null이면 폭발 상태는 진행하되 피해 `damageUnwired`. `damageEventId`·`correlationId` 부여, 같은 상관 id 중복 피해 차단
- **PlayerAliveSource 실제 배선** — `gameplay.attachPlayerAliveSource()`가 `PatrolShipFleet`·`EnemyAttackCoordinator` 양쪽에 연결된다. `isTargetAlive(PLAYER_ENTITY_ID)`의 **항상 true 경로 제거**(미연결일 때만 생존 가정). 파괴 후 관측·공격 요청 0, 다음 출항 reset 후 정상 복구
- **병행 정산 제거** — `EconomySystem.settleDefeat`·`settleReturn`·`RunEconomy.settleSortie` **삭제**(production 호출자 0건이었음). 검증 코드도 정리했고 게임플레이는 지갑을 확정하지 않는다. `verify:meta`의 이중 정산 정적 검사 통과 유지

**수치 출처 (임의 전투 수치 0):** 탐지 확정 3종 = `params/detection.json` / 신관 = `combat.json depthChargeFuseSeconds`(하한 3.0 고정) / 동시 폭뢰 = `simultaneousDepthCharges` / 공격 사거리 = 폭뢰 `nearRadiusMeters`(피해 가능 거리 밖 투하 금지라는 구조 규칙, 새 수치 아님). **미확정 전량 null 유지**: 거리 감쇠·게이지 감소율·direct/near 반경·피해·투하 쿨다운·선체 기준값. 검증 픽스처(`DETECTION_TUNING_FIXTURE`·`DEPTH_CHARGE_FIXTURE`)는 검증 파일 안에만 있고 production import 0건

**남은 blocker:** ① 위 4줄 배선 ② `params/combat.json` C9 필드(툴링) — 도착 전까지 탐지·폭뢰 피해는 unwired ③ **AI가 공격 요청을 만들지 않는다** — 리드 `DestroyerAIController`는 이동만 하고 `EnemyAttackRequest`를 생성하지 않는다. `attack` 상태에서 요청을 만들어 `EnemyAttackPort`로 넘기는 지점이 리드 소유 파일에 필요하다(게임플레이는 포트를 제공했다)
### INT-RENDER-012 — [DETECT][SURVIVAL][LOOP] 스프린트 C 그래픽스: 탐지·생존 HUD·피격 피드백·실패/귀환 화면 분리

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (SPRINT_C_HANDOFF 그래픽스 창 — 리드 `d689628` 병합) |
| 대상 시스템 | `src/ui/DetectionHud.ts`·`SurvivalHud.ts`·`SortieFailureScreen.ts`·`SortieReturnScreen.ts`·`sprintCUiFixture.ts`(신규), `src/render/CanyonScene.ts`(X-ray 침수 구동), `src/core/Game.ts`(마운트·command 배선 — 조립부) |
| 관련 게이트 | C1(HUD)·C3(추적 표시)·C5(생존·X-ray)·C6·C7(화면 분리)·저장 실패 재시도 |
| 하위 호환 여부 | 계약 무수정. 동작 변경 1건: **DEBRIEF 자동 completeDebrief 제거** — 귀환 화면 '확인' command와 실패 코디네이터의 저장 성공 전환이 기지 복귀를 소유(리드 주석의 예정된 대체) |
| 개발 리드 결정 | **확인 대기** |
| 적용 커밋 | (이 브랜치 스프린트 C 그래픽스 커밋) |

**소비 read model (4종 — 그 외 게임플레이 내부 접근 0건).**
`DetectionHudView`(게이지·stage·unwired 그대로 — 보정·재계산 없음),
`TrackingStateSource`(patrol/alert/attack/lost 그대로 — 새 상태명·집계값
없음, attack 문구는 '공격 태세'·폭뢰 단정 없음), `SurvivalReadModel`
(hullRatio null=미연결 표기·warningIds 키 매핑·damageFlash는
consumeDamageFlash로만 소비·lastHitDirection 표시 삼각법만),
`DebriefReadModel`(kind가 화면 선택의 유일 근거 — isDestroyed 추측 금지).

**C6·C7 화면 분리.** `SortieFailureScreen`(kind destroyed·failure 스냅샷·
저장 실패 시 '기지 이동 불가' + 재시도 버튼, canRetrySave=false면 미노출)과
`SortieReturnScreen`(kind returned/aborted·settlement — 실패 문구·버튼 0)이
**파일·데이터 경로 모두 분리**. 재시도 = 조립부 command(리드
`SortieFailureCoordinator.retrySave` 래퍼 — 재정산 없음), 확인 =
`completeDebrief` command. UI가 정산·저장을 직접 수행하지 않는다.

**X-ray 침수 구동 (C5).** CanyonScene이 `floodingChanged` severity만 매핑해
XrayFloodingSpike를 잠수함에 지연 장착(자체 타이머 없음, severity 0이면
투명 복귀). 자기 선체 레이어를 따라 조준 카메라에서는 함께 제외된다.

**시각 언어 분리 (작업 6).** faction 태그 ◇▲■◆ / 탐지 ─◔◉(눈 3단계) /
추적 ○◍●◌ / 생존 ⛨≋⚠ — 기호 체계가 겹치지 않아 색각 이상에서도 구분된다.
탐지·선체 unwired는 빗금 + '계기 미연결' 명시(정상 위장 없음).

**조립부 변경 (Game.ts).** C HUD·화면 마운트(registry `sprintCHud`),
SurvivalHud에 playerHull + consumeDamageFlash + 카메라 전방 컨텍스트 주입,
DEBRIEF 자동 완료 제거. **게임플레이 DetectionSystem·TrackingStateSource
도착 시 attach 2줄**(Game.ts 주석에 위치 표기): `detectionHud.
attachDetectionSource(...)` / `attachTrackingSource(...)` — 그 전까지
production HUD는 '탐지 계기 미연결'을 표시한다.

**검증 구분.**
- production 실측: 탐지·선체 unwired 표시(위장 없음), **정상 귀환 전체 루프**
  (출항→귀환→DEBRIEF 유지→귀환 화면 실정산(+0)→확인→BASE→재출항·salvage
  재생성), 실패/귀환 화면 동시 표시 없음, snapshot 변조 시도 후 코어값 유지,
  A·B 회귀 없음(기지 UI·salvage 3·재화 HUD·verify:hud 34/34), 콘솔 오류 0.
- fixture(`?cdemo=1` — production 아님): 탐지 3단계·게이지 60% 그대로·추적
  4종 칩·피격 플래시 1회성·방향 지시자·경고 키 렌더·hullRatio null·실패
  화면(저장 실패→재시도→확인 노출)·귀환 화면(실패 문구 0)·820×560 겹침 없음.
- **production 미실측(사유)**: 피해·침수·파괴·실패 화면의 실데이터 구동 —
  combat params null(C9 대기) + 게임플레이 DetectionSystem·폭뢰 미구현.

### INT-CORE-015 — 스프린트 C 선행 계약 마감: 탐지·추적(C1~C3)·폭뢰 경로(C4)·침수 단일 창구·DEBRIEF 모델

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (C 병렬 착수 게이트 마감 — 상세 인계는 `docs/SPRINT_C_HANDOFF.md`) |
| 대상 시스템 | `src/contracts/detection.ts`(신규), `src/contracts/survival.ts`(폭뢰 params·DebriefReadModel), `src/core/FloodingCore.ts`·`PlayerHullSystem.ts`(침수 단일 창구), `src/core/PveIntegration.ts`(DebriefStateTracker), `src/core/Game.ts`(배선) |
| 확정 정책 | ① 선체 손상·침수 = **출항 단위 상태** — 새 출항 시 maxHull 재계산 + currentHull=maxHull ② 영구 손상·수리비·수리 시간 = 후속 스프린트 이관 ③ 구매 순간 currentHull 회복 없음(최대치만 갱신, 다음 출항 반영) ④ **압력 피해 = C1~C9 핵심 범위 제외** — DepthPressure 계약은 확장 경계로 유지·production unwired, 압력 수치를 C9 필수 params·verify:sprint-c 게이트·C 완료 조건에 불포함 |
| 필요한 변경 | ① C1~C3: 게이지 정본=게임플레이 DetectionSystem(기존 계약 유지), DetectionEnvironmentSource(은신·심도 입력)·DetectionTuningParams(거리 감쇠·감소율 — 공식 문서에 없어 null/unwired)·DetectionHudView·DetectionStageSource(AI는 stage만 — 수치 재계산 금지)·TrackingStateSource. 추적 전이 소유=리드, 상태 어휘는 기존 patrol/alert/attack/lost, 경비함·호위함·적대함 공유. alert 발화 지점 = 기존 detectionChanged(새 이벤트 없음) ② C4: 정본 경로(탐지 → AI 요청 → EnemyAttackPort → DepthChargeSystem → direct/near → applyDamage) + DepthChargeDamageParams(전부 null 허용 — 미확정 시 피해 unwired) ③ 침수 지속 피해도 applyDamage 단일 창구 경유 — tick별 damageEventId=flood:<단조 카운터>, FloodingCore는 닫힌 적분식(dt 분할 무관 총 피해 동일) ④ DebriefReadModel + DebriefStateTracker — 그래픽스가 isDestroyed 추측 없이 귀환/실패 화면 분기 ⑤ 이중 정산 방지 정적 검사(병행 호출 0·정산 호출자 화이트리스트) |
| 관련 게이트 | C1·C2·C3·C4·C5·C6·C7 (+공통 저장·정산 규칙) |
| 하위 호환 여부 | 추가·내부 경로 변경만 — 계약 소비자 깨짐 없음. hullDamaged 발행 형태 유지(침수는 near 보고) |
| 개발 리드 결정 | 승인 — **C_ROLE_HANDOFF_READY=true.** 역할별 인계·수정 가능/금지 파일·acceptance는 SPRINT_C_HANDOFF.md가 정본 |
| 적용 커밋 | d28f503·8024f1a·ffa8252·0b3a879 (+문서 커밋) |

**병행 정산 경로 현황 (게임플레이 처리 요청):** `EconomySystem.settleDefeat`(:251)·`settleReturn`(:256)·`RunEconomy.settleSortie`(:94) — production 호출자 **0건**(정의만 잔존, 재확인 완료). 정산 정본은 `MetaLoop.settleSortie`(호출자: Game 세션 포트 'aborted'·SortieFailureCoordinator 'destroyed'뿐 — 정적 검사로 고정). 게임플레이가 세 정의를 삭제하고 검증 전용 사용처를 정리한다. acceptance: verify:meta '이중 정산 방지' 검사 통과 유지.


### INT-CORE-014 — 스프린트 C 선행 계약: 선체·피해·침수·심도 압력·실패 정산

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (C 공식 착수 — A 인수 통과·B_CORE_COMPLETE·dev가 3958ce4 포함 확인) |
| 대상 시스템 | `src/contracts/survival.ts`(신규), `src/contracts/events.ts`(playerDestroyed·sortieFailed), `src/core/PlayerHullSystem.ts`·`FloodingCore.ts`·`SortieFailureCoordinator.ts`(신규), `src/core/Game.ts`(배선) |
| 조사 결과 (근거) | ① **플레이어 피해 시스템이 존재하지 않는다** — `HullSystem` 계약만 있고 구현 0개, `hullDamaged`·`floodingChanged` 발행·구독 0건, `DepthChargeSystem` 구현 0개 ② **적이 플레이어를 공격할 수단이 전혀 없다** — `DestroyerAIController`·`PatrolShipEntity`에 무장 없음, 선박 충돌은 밀어내기 전용(피해 없음) ③ **선체 기준값·피해·침수·압력 params가 전무하다** — `upgrades.json`의 hullIntegrity·maxDepth는 배율만 승인·`paramRef` 없음("기준값 파라미터·소비자 미존재") ④ `settleSortie({outcome:'destroyed'})` 경로는 계산식만 있고 **production 호출자가 없다**(Game.ts는 `'aborted'` 고정) ⑤ `EconomySystem.settleDefeat`/`settleReturn`/`RunEconomy.settleSortie`는 **production 호출자 0건의 병행 정산 경로**다 |
| 필요한 변경 | ① `PlayerHullState` 단일 읽기 모델(+`unwired` — 기준값 미주입 시 정상 선체로 위장 금지) ② `DamageEvent`/`DamageRequest`·`DamageSourceType`(기존 `DamageCause`는 폭뢰 근접도로 의미가 달라 **중복 아님**, 병존) ③ `DamageReceiverPort` — 결과 7종(applied·ignoredDuplicate·ignoredDestroyed·invalidDamage·targetNotFound·destroyed·unwired), 적용·선체 변경·파괴 판정이 **한 트랜잭션 경계** ④ `FloodingParams`·`FloodingSnapshot`(단계는 level에서 **파생** — 이중 저장 금지) ⑤ `DepthPressureParams`·`DepthPressurePort`(월드 Y 좌표 규약 명시, tick 기반 결정적 피해) ⑥ `EnemyAttackRequest`/`EnemyAttackPort` ⑦ `SurvivalReadModel`(경고는 key만, 문구·색 없음) ⑧ `SortieFailureReport`/`SortieFailurePort` ⑨ `playerDestroyed`·`sortieFailed` 이벤트 ⑩ **MetaState 미확장** — 파괴 사실은 `PlayerHullState.isDestroyed` 하나가 소유하고 메타는 기존 `DEBRIEF` 사용 |
| 변경 이유 | C1~C9(전 항목 핵심 게이트)의 생존 루프를 4개 창이 병렬 구현할 수 있도록 경계를 먼저 고정. 특히 피해 중복 적용·이중 정산·이중 저장을 계약 수준에서 차단 |
| 관련 게이트 | C4(피격)·C5(내구도·침수)·C6(실패 화면)·C7(정산 분리)·C8(영구 요소 보존). C1~C3(탐지·추적)·C9(params 이관)은 별도 계약·소유 |
| 하위 호환 여부 | 추가만 — 기존 `HullSystem`·`hullDamaged`·`floodingChanged`·`DamageCause`·MetaState·저장 책임 표(A-12) 무변경. A·B 회귀 없음(검증 전 항목 통과) |
| 개발 리드 결정 | 승인. **수치는 하나도 만들지 않는다** — 선체 기준값·피해량·침수 속도·압력은 C9 [COMBAT] params 이관 대상이며 도착 전까지 `unwired`로 남는다 |
| 적용 커밋 | (본 브랜치 C 선행 계약 커밋) |

**각 창 적용 지침 (스프린트 C):**
- **게임플레이**(창 2 — C1·C2 탐지·은신, C4 폭뢰 판정, C5 내구도·침수·파괴 판정, C7 손실 계산): 리드 공용 코어(`PlayerHullSystem`)를 **피해 수신 단일 창구**로 소비하고 자체 체력 상태를 만들지 않는다. 실제 피해 source(폭뢰·충돌·압력)·판정 타이밍은 게임플레이 소유. `PatrolShipFleet.isTargetAlive(PLAYER_ENTITY_ID)`가 현재 항상 true인데, 리드가 제공하는 `PlayerAliveSource`를 구독해 파괴 후 추적을 멈추게 할 것. **`EconomySystem.settleDefeat`/`settleReturn`·`RunEconomy.settleSortie`는 production 호출자가 없는 병행 정산 경로다 — 정본은 MetaLoop이므로 삭제 요청**(C에서 별도 지갑 금지)
- **그래픽스**(창 3 — C5 X-ray 침수, C1·C3 탐지 UI, C6 실패 화면, C7 귀환 화면): `SurvivalReadModel`만 소비. 침수량·피해량을 결정하지 않는다. **실패 화면은 `sortieFailed`, 귀환 화면은 `sortieEnded`** — 데이터·화면을 완전히 분리한다(C7). 경고는 `warningIds` 키로 오고 문구·색·이펙트는 그래픽스 소유
- **빌드·툴**(창 4 — C9 [COMBAT] params 이관, C1~C9 검증): `params/combat.json` 확장 스키마 제안 — 선체 기준값(`baseMaxHull`)·survivalState 경계 2종·피해량(폭뢰 direct/near)·침수(단계 3종·확산율·선체 피해율)·압력(안전 심도 Y·피해 시작 Y·tick·tick당 피해). **전부 미확정이며 임의 수치 금지.** `verify:sprint-c` 신설은 툴링 몫이고 리드는 없는 script를 실행하지 않는다. C8은 '파괴 후 재접속 → 영구 요소 보존' 단언
- **통합**: composition 순서 = 공식 params → PlayerHullSystem → FloodingCore → (게임플레이 피해 source) → SortieFailureCoordinator → MetaLoop 정산 → SaveBridge → BASE 복귀 → SurvivalReadModel → 렌더 HUD. B6·B7은 C core와 섞지 않는다(병렬 슬롯)

### INT-GAME-013 — B5 런타임 연결 완료 + production 배선 2줄 요청 (조립부)

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (창 2 — B5 런타임 연결. B 공식 미발효 선행개발) |
| 대상 시스템 | `src/core/Game.ts`(조립 배선 **2줄**) — 계약·리드 구현 변경 요청 **없음** |
| 필요한 변경 | INT-CORE-013의 게임플레이 지침을 전부 이행했다(아래 '적용 완료'). production에서 경비함이 실제로 생성되려면 `Game.composeSystems`에서 두 줄이 필요하다: ① `const surfaceMotionPorts = gameplay.surfaceShipMotionPortFactory;` — 현재 자리에 있는 `{ create: () => null }` 상수를 **그대로 대체**한다(변수명·이후 코드 무변경). ② `guardSpawn.attachLocationStrategy(gameplay.guardSpawnLocation);` — 위치 전략 연결. 선택 ③ `scene.attachShipWorldSource(gameplay.shipWorldSource)`(다중 선박 렌더) · `scene.attachShipIdentificationSource(gameplay.shipIdentification)`(식별 태그) — 그래픽스 소비 API가 준비되면. `gameplay`는 이미 같은 함수 안 상위에서 만들어져 있으므로 순서 문제는 없다 |
| 브라우저 실측 (배선 전) | dev 서버 production 경로에서 부팅→출항까지 **콘솔 오류 0**. production 경계로 중립 유효 피격을 흘리면 `guardLedger.requestedCount === 1`까지 도달하고 결과는 **`noSpawnLocation`**(위치 전략 미연결). 즉 남은 차단은 위 2줄뿐이며, 게임플레이 쪽 준비는 끝났다 |
| 변경 이유 | 위 2줄이 없으면 스폰이 `noSpawnLocation`/`spawnFailed`에서 멈춘다. 게임플레이는 임의 좌표·가짜 이동을 만들지 않으므로 조립 배선이 유일한 해소 경로다 |
| 관련 게이트 | B4(실제 스폰)·B5(범용 AI 재사용)·B2/B1(렌더 소비) |
| 영향을 받는 파일 | `src/core/Game.ts` 2줄. 게임플레이 측은 완료 |
| 하위 호환 여부 | 계약 파일 **무수정**. 게임플레이 소유 `CombatTarget`·`GameplaySystems` 기존 소비자 무변경. 검증 213/213·meta 88/88·tooling 26/26·sprint-a 30/30 통과 확인 |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

**게임플레이 적용 완료 (INT-CORE-013 지침 이행):**
- `SurfaceShipMotionPort` production 구현 + `SurfaceShipMotionPortFactory` 제공 — `gameplay.surfaceShipMotionPortFactory`(`PatrolShipFleet`). **스폰 1건 = 월드 엔티티 1개 = 포트 1개**이며 pose 정본은 `PatrolShipEntity` 하나다(AI는 transform을 저장하지 않는다). 플레이어 pose 재사용·렌더 객체 조작 없음
- **수치는 전부 임시 상속값**(경비함 전용 공식 튜닝값 아님): 속력·명중 반경·선체 박스 = 공식 `params/cargo.json` / 해수면 = 공유 `CanyonLayout.seaSurfaceY` / 선회 속도 = `params/movement.json` `turn90Seconds` 파생(수상함 선회 공식값이 없어 잠수함 검증값 상속) / 월드 경계 = `CanyonLayout.blocks` 외곽 AABB **+ 공식 항로 끝점**(협곡 벽만으로 잡으면 공식 화물선 항로가 경계 밖이 된다). 공식 params 미주입이면 함대가 스폰을 만들지 않는다(수치 발명 0)
- 경비함 엔티티: entityId(리드 채번)·faction=patrol·pose·alive·targetable·spawnReason·initialTargetEntityId·incidentPosition·visualArchetype 보유. **spawnPosition을 그대로 초기 위치로** 쓰고 보존한다(그래픽스 등장 연출이 추정 좌표를 만들지 않게). 기존 `TargetRegistry`에 등록(별도 registry 신설 없음), 파괴 시 등록 해제, dispose·새 출항에서 전량 정리, 같은 entityId 재요청 시 추가 생성 0
- **다중 선박 read source** — `gameplay.shipWorldSource`: hostile cargo·neutral cargo·patrol guard를 한 목록의 **읽기 전용 스냅샷**으로. entityId·faction·pose·alive·targetable·visualArchetype(+B6 highValue/escort 메타). 게임플레이 객체 참조를 넘기지 않으므로 렌더가 상태를 바꿀 수 없다
- **식별 소스에 patrol 포함** — 세 세력이 한 소스에서 나온다. 미식별 라벨 null·죽은 경비함 `tagDisplayable=false`·entityId는 월드 엔티티와 동일 키
- B6: 교전 요청을 **경비함과 같은 범용** factory 입력으로 바꾸는 `escortEngagementToAdapterConfig` 제공(호위 전용 AI 0). 이탈 상한 거리는 공식 값이 없어 `bindEscortFromOfficial`이 결속을 만들지 않는다 — **B6 실기동 미완료**(호위함 배치표·거리 공식값 부재)
- 신규 Guard 전용 AI 파일 **0** (러너 정적 검사로 강제). C 기능(탐지·소나·폭뢰·체력·침수·무기 발사) 참조 0

**추가 요청 (선택):** 개발 모드 `__deepDiveDebug`에 `gameplay` 핸들이 없어 브라우저에서 B1·B2·B5의 게임플레이 상태(선박 목록·식별 뷰·경비함 엔티티)를 직접 관측할 수 없다. `gameplay: gameplay` 한 줄이 추가되면 통합 단계 실측이 쉬워진다.

### INT-CORE-013 — B5 규칙 개정 (diff-only): 범용 production DestroyerAI 신설 · 경비함은 그것을 재사용

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (B5 차단 해소 — 게임플레이 INT-GAME-012·툴링 SPRINT_B_ACCEPTANCE의 `B5_BLOCKED_NO_DESTROYER_IMPLEMENTATION` 보고 확인) |
| 대상 시스템 | `src/contracts/guard.ts`(이동 포트·entityId·factory 반환형), `src/core/DestroyerAIController.ts`(신규), `src/core/destroyerAiFactory.ts`(신규), `src/core/GuardShipAdapter.ts`(handle 보완), `src/core/PveIntegration.ts`(entityId 부여), `src/core/Game.ts`(팩토리 연결), 검증 러너(B5 판정 개정) |
| 조사 결과 | **production `DestroyerAI` 구현체 0개.** `implements DestroyerAI` 0건이며, 다른 이름의 구축함·순찰 행동 코드도 없다. 존재한 것은 계약(`contracts/systems.ts`)·어댑터·경계·검증 더블뿐. `CargoShipSystem`은 2점 왕복 보간이라 표적·상태 전이 개념이 없어 재사용 대상이 아니다(위장 금지). 게임플레이·툴링 두 창이 독립적으로 같은 결론을 보고했다 |
| 필요한 변경 | ① 기존 규칙('이미 존재하는 구현체 재사용 / 신규 AI 0')을 **폐기** — 성립 불가한 전제였다 ② **범용 production `DestroyerAI` 구현체 1개 신설**(`core/DestroyerAIController`) — 경비함·일반 적대 구축함 공용 ③ `GuardShipAdapter`는 그 범용 구현체를 재사용(주입·수명주기만) ④ 경비 전용 `GuardAI`·`GuardBehavior`·`GuardStateMachine` **계속 금지** ⑤ AI 판단과 실제 이동 분리 — `SurfaceShipMotionPort`(게임플레이 구현, 리드는 선박 transform 직접 조작 금지) ⑥ production `DestroyerAIFactory` 제공(검증 더블 사용 금지) ⑦ `GuardShipHandle`에 `entityId`·`spawnPosition` 노출(기존 계약 타입 재사용 — 중복 필드 없음) ⑧ B5 판정 기준 개정: 범용 구현 정확히 1개 / Guard 전용 0개 / 어댑터의 범용 factory 사용 / CargoShipSystem 위장 없음 / 검증 더블 production 미사용 |
| 변경 이유 | B5 차단 해소. C 탐지·폭뢰·내구도는 포함하지 않는다 — 이번 구현은 '표적 방향으로 이동하는 수상함' 최소 책임뿐이다 |
| 관련 게이트 | B4(실제 스폰)·B5(AI 재사용). 15차 결의 1의 **diff 한정 개정**으로 문서화 |
| 하위 호환 여부 | 계약 확장만 — `DestroyerAIFactory.create` 반환형이 `DestroyerAI | null`로 넓어졌고(호출측은 리드 1곳), `GuardShipAdapterConfig`에 `entityId`가 추가됐다. 그래픽스가 요청한 `GuardShipHandle.spawnPosition`은 동일 형태로 반영해 병합 충돌이 없다 |
| 개발 리드 결정 | 승인 — 범용 구현은 리드 소유(`src/core`, FILE_OWNERSHIP '구축함·보스 AI'), 이동 어댑터는 게임플레이 소유. B는 여전히 **미발효 선행개발**이며 A+B 최종 통합 검증 전까지 완료로 보고하지 않는다 |
| 적용 커밋 | (본 브랜치 B5 개정 5커밋) |

**각 창 적용 지침 (B5 개정):**
- **게임플레이**: `SurfaceShipMotionPort` 구현 1개 + `SurfaceShipMotionPortFactory` 제공(스폰 1건당 포트 1개). 선회 속도·속력·해수면 높이·월드 경계는 **구현측 소유**이며 공식 params가 없으면 기존 판정 범위에서 파생하되 임의 수치를 발명하지 않는다. 도착하면 조립부가 `Game.composeSystems`의 `surfaceMotionPorts` 1줄을 교체한다 — 그 즉시 스폰이 `spawnFailed`에서 벗어난다. 이미 제출한 `guardSpawnLocation`(위치 전략)도 같은 지점에서 `attachLocationStrategy`로 연결된다
- **그래픽스**: 요청한 `GuardShipHandle.spawnPosition`을 **승인·반영**했다(+`entityId`). 스폰 방향 마커는 실제 스폰 좌표만 사용하고 추정 좌표를 만들지 않는다. B 오버레이 파일은 AI가 아니므로 B5 검사에서 허용되지만, DestroyerAI 구현·AI 판단 어휘가 들어가면 위반이다(파일명 변경으로 회피 불가)
- **툴링**: `SPRINT_B_ACCEPTANCE`의 B5 항목을 `B5_BLOCKED_NO_DESTROYER_IMPLEMENTATION`에서 **개정 기준**으로 교체 — '기존 구현 재사용/신규 0'이 아니라 '범용 production 구현 정확히 1개 + Guard 전용 0개 + 위장·더블 금지'. `verify:meta` 88항목에 해당 정적·동작 검사가 있으므로 중복 구현은 불필요하다
- **통합**: 병합 순서 리드 → 게임플레이 → 그래픽스 → 툴링. 리드 병합 후 게임플레이 motion adapter가 오면 B4·B5가 런타임에서 관측 가능해진다

### INT-GAME-012 — 스프린트 B 게임플레이 선행개발 결과 + B5 차단 보고 + 배선 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (창 2 — 스프린트 B **선행개발**. B 공식 발효 전이며 dev/main·통합 브랜치 병합 없음) |
| 대상 시스템 | `src/core/Game.ts`(조립 배선 3줄), `params/`(공식 수치 3종 신설 요청 — 기획·툴링), `src/core/PveIntegration.ts`(레거시 큐 제거 — 후속) |
| 필요한 변경 | ① **스폰 위치 전략 연결** — `guardSpawn.attachLocationStrategy(gameplay.guardSpawnLocation)`. 이걸 붙이면 경비 스폰이 `noSpawnLocation`에서 벗어난다(현재 production은 전략 미연결이라 항상 위치 실패) ② **식별 소스 연결** — `scene.attachShipIdentificationSource(gameplay.shipIdentification)` 형태로 렌더에 주입(계약 `ShipIdentificationSource`). 그래픽스가 모델명으로 세력을 추측하지 않게 하는 유일한 경로 ③ **다중 선박 렌더 소스** — 현재 `scene.attachCargoShipSource(gameplay.cargoShipState)`는 **적대 1척만** 받는다. B1으로 중립 1척이 같은 월드에 존재하지만 렌더 배선이 1척뿐이라 화면에는 보이지 않는다. `gameplay.ships`(세력 태그 포함)를 소비하는 다중 선박 소스가 필요하다 ④ **공식 수치 3종 요청**(기획·툴링) — (a) 선박 배치표(`ships[]` — 세력·항로·원형. 현재 게임플레이가 공식 cargo 값에서만 파생 중) (b) 식별 params(식별 거리·태그 표시 거리. 현재 어뢰 유효 사거리 재사용) (c) 경비 스폰 params(최소 안전거리·최대 스폰 거리. 현재 어뢰 유효 사거리와 그 절반 파생) (d) B6 고가치 보상 배율(`economy.highValueTransportRewardMultiplier`. 현재 배율 null = 보상 변경 없음) ⑤ **레거시 큐 제거(후속)** — `SortieEconomyPort.consumeGuardSpawnRequests`는 이제 항상 빈 배열이다(게임플레이가 요청을 넣지 않는다). `SortieEconomyBridge`의 `legacy:<targetId>` 발행 경로와 포트 필드를 리드가 제거하면 계약 표면이 정리된다 |
| 변경 이유 | B1~B4·B6의 게임플레이 판정은 완료됐으나, 값이 실제로 흐르려면 조립 배선이 필요하다. 공식 수치가 없는 4항목은 **임의 숫자를 발명하지 않고** 기존 판정 범위에서만 파생했으며, params가 도착하면 attach 한 줄로 교체된다 |
| 관련 게이트 | B1·B2·B3·B4 (+B6). B5는 아래 차단 |
| 하위 호환 여부 | 계약 파일 **무수정**. 게임플레이 소유 `CombatTarget.onTorpedoHit`에 **선택적** 4번째 인자(`TorpedoAttackContext`)를 추가했으나 기존 구현·호출은 그대로 동작한다(검증 192/192·meta 77/77 통과 확인). `cargoShipState`·`ships` 기존 소비자 무변경 |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

**B5 차단 보고 (B5_BLOCKED=true) — 경우 B: 재사용할 기존 구축함 구현이 없다**

저장소 전체(전 브랜치 히스토리 포함)를 `Destroyer`·`PatrolShip`·`GuardShip`·`pursue`·`chase`·`waypoint`·
`notifyLastKnownPosition`·`depthCharge`·수상함 이동 어휘로 조사한 결과:

- **AI 판단 구현체 0개.** `implements DestroyerAI`는 물론, 다른 API 이름으로 된 구축함·순찰함 행동 코드도 없다
- 존재하는 것: 계약(`contracts/systems.ts` `DestroyerAI`, `contracts/guard.ts` `DestroyerAIFactory`), 리드 어댑터(`core/GuardShipAdapter.ts` — 주입·수명주기만), 경계·포트(`core/PveIntegration.ts`), 검증 더블(`meta/__verification__/verifyMeta.ts` — `update()`가 빈 함수)
- **재사용 불가 사유**: `CargoShipSystem`은 2점 왕복 보간뿐이다. 플레이어 위치를 읽지 않고, 표적 개념·상태 전이·공격 진입점이 없다. 이걸 Destroyer AI라고 부르는 것은 위장이다
- **필요한 최소 선행 구현** (리드 소유 — `docs/FILE_OWNERSHIP.md` 구축함 AI = `src/core/`): `DestroyerAI` 상태 4종(patrol/alert/attack/lost) 전이 + last-known-position 직선 외삽 추격. 마스터 플랜 §5.11에 사양이 있고 폭뢰는 스프린트 C다
- **게임플레이가 하지 않은 것**: 신규 Guard AI 코어를 만들지 않았다(정적 검사로 0건 강제 — 러너 `run.mjs`). B5를 가짜로 통과시키지 않았다

체인의 현재 도달점: 중립 유효 피격 → `neutralShipHit` → 원장 중복 방지 → `guardShipRequested` → 위치 전략 **해결** →
`GuardShipAdapter.spawn()` → **`spawnFailed`(AI 팩토리 미연결)**. 팩토리만 연결되면 같은 체인이 실제 개체를
만든다는 것을 검증에서 확인했다(초기 표적=공격자·세력 patrol·중복 요청 0 — 최소 AI 더블 사용, production 코드 아님).
### INT-RENDER-011 — [FACTION][RENDER] 스프린트 B 선행개발 렌더: 식별 태그·세력 외형·경비 방향·호위 표현

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (스프린트 B 선행개발 — 기준 `85ec32b`/A tip `8f40117`, 리드 계약 `afd5c71`·최종 tip `1378834` 병합) |
| 대상 시스템 | `src/render/*`(신규 4 + CargoShipVisual 변형), `src/core/GuardShipAdapter.ts`(핸들 1필드), `src/core/Game.ts`(스폰 결과 배선), `src/meta/__verification__/run.mjs`(B5 가드레일 허용목록) |
| 관련 게이트 | B1·B2·B5·B6 표현 (판정·스폰은 게임플레이·리드 소유) |
| 하위 호환 여부 | 계약 파일(`src/contracts/*`) 무수정. 소스 미주입 시 전부 미표시 — A 경로 영향 없음 |
| 개발 리드 결정 | **확인 대기** — ⚠ 항목 2건 |
| 적용 커밋 | (이 브랜치 스프린트 B 렌더 커밋) |

**소비 계약 (판정·추측 없음).** 식별 태그는 `ShipIdentificationSource`/
`ShipIdentificationView`만, 세력 외형은 게임플레이가 준 `FactionId`만,
호위 표현은 `HighValueTransportView`·`EscortBinding`만 소비한다. 모델·메시·
클래스 이름으로 세력을 추측하는 경로는 없고, 보상 판정·중립 공격 이벤트
생성·경비함 스폰 실행도 하지 않는다. 미식별 상태에서는 `view.faction`을
읽지 않으며 라벨·색·기호 모두 '미식별' 하나로 고정한다.

**B1 세력 외형** (`render/factionVisuals.ts` + `CargoShipVisual` 변형):
적대=각진 무장 상부구조·포탑 2·삼각 마크·경고등 점멸 / 중립=매끈한 화물
적재 실루엣·무장 0·사각 마크·상시 백색등 / 경비=저현 전투 갑판·포탑 1·
마름모 마크·청색 점멸. **색 이전에 실루엣·마크 형태·등화 거동으로 구분**
되며 원거리·저해상도에서도 실루엣 차이가 남는다. 변형 선택은
`state.faction` 변화에만 반응한다.

**B2 식별 태그** (`render/IdentificationTags.ts`): 상태 4종을 기호(◇▲■◆)+
문구+거리+조준 가부로 표시한다. `tagDisplayable=false`면 숨김,
`isAlive=false`면 제거, `isTargetable=false`면 '조준 불가' 표기.
십자선 중심 보호 반경 안으로 들어오면 아래로 뒤집고, 겹치면 세로 간격을
확보한다. 기존 조준 마스크·십자선·거리 눈금은 무변경(z-index 31 별도 층).

**B7 노출 신호**: `IdentificationExposureSink.onTagExposure({entityId,
identificationTagVisible, factionRevealed, firstShownAtMs})` — 태그가 처음
표시된 시점과 세력 정보 실노출 여부만 알린다. **결과 분류·오인 사격 판정은
하지 않는다**(툴링 소유). 툴링은 이 싱크를 `attachIdentificationSource`의
두 번째 인자로 주입하면 되고, `opportunityId` 연결은 툴링이 entityId·시각을
키로 수행한다.

**B5 경비 방향 표시** (`render/GuardDirectionIndicator.ts`): **실제 스폰
결과만** 가리킨다 — 요청 이벤트(`guardShipRequested`)의 사건 지점은 경비함
위치가 아니므로 마커 근거로 쓰지 않는다. 화면 밖이면 가장자리 방향(화살표
회전 + 거리 문구), 화면 안이면 해제(0.25s 체류 조건 — 장면 전환 프레임
오판 방지), 6초 후 자동 소멸. 기지 상태에서는 억제한다. 시간 정지·컷신·
탐지 게이지·경보 없음.

**B6 호위 표현** (`render/ConvoyVisuals.ts`): 고가치 수송선 ◈ 배지 + 호위
⚔ 배지 + **EscortBinding 기반 점선 결속선**(거리 추측 아님). 화면 좌표는
식별 read model의 entityId 조인으로만 얻고, `rewardMultiplierRef`는 참조
키이므로 **보상 숫자를 노출하지 않는다**.

**⚠ 조립부 최소 변경 2건 (리드 확인 요청).**
1. `GuardShipHandle.spawnPosition` 추가 (`src/core/GuardShipAdapter.ts`) —
   기존 핸들에 위치가 없어 방향 마커가 실재하는 경비함을 가리킬 수 없었다.
   코디네이터가 이미 `location`을 갖고 있어 전달만 한다(판정 변화 없음).
   `Game.ts`는 `attachSpawnListener`로 실제 스폰 좌표만 렌더에 넘긴다 —
   **스폰이 차단된 동안 목록은 비어 있고 마커도 뜨지 않는다.**
2. `src/meta/__verification__/run.mjs` B5 가드레일 허용목록에
   `src/render/GuardDirectionIndicator.ts` 추가 — 파일명이 `/guard/i`에
   걸리는 **렌더 오버레이**이며 AI 판단 로직이 없다. 가드레일을 피하려고
   파일명을 바꾸지 않고, AI 어휘 검사 대상에 이 파일을 **포함**시켜 검사가
   계속 감시하도록 했다 (77/77 통과).

**검증 구분 (작업 지시 §12).**
- **production 실동작**: B1 세력 변형이 실제 화물선 상태(`faction:'hostile'`)
  로 선택됨, B 오버레이는 소스 미구현·스폰 차단으로 **표시 0건**(가짜 데이터
  없음), A 회귀 없음(기지 UI 7종·salvage 3개·재화 HUD·조준경).
- **UI 단위 검증(fixture `?bdemo=1`)**: 태그 4종·죽은 표적 제거·조준 불가
  표기·경비 방향 마커(화면 밖→가장자리, 화면 안→해제)·호위 결속선·보상
  숫자 미노출. **production 통과가 아니다** — 게임플레이 B 판정 구현 후
  재검증이 필요하다.

**게임플레이 연결 지침**: `ShipIdentificationSource` 구현 후
`scene.attachIdentificationSource(source, sink?)` 1줄, B6는
`scene.attachConvoySource(source)` 1줄. 경비 스폰은 위치 전략·AI 팩토리가
연결되면 마커가 **코드 변경 없이** 동작한다.

### INT-CORE-012 — 스프린트 B 선행 계약: Faction 정본·식별 read model·중립 유효 피격·경비함 스폰

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (스프린트 B **선행개발** — 15차 결의 2 창1 범위. B 공식 발효 = A 통합 PR 병합이며 아직 미발효) |
| 대상 시스템 | `src/contracts/faction.ts`·`identification.ts`·`guard.ts`(신규), `src/contracts/events.ts`(neutralShipHit 신설·guardShipRequested payload v2·transportAttacked), `src/core/PveIntegration.ts`(중복 방지 경계·GuardShipAdapter·스폰 포트 배선) |
| 필요한 변경 | ① **Faction 정본** — `FactionId` 정의 정본은 `contracts/meta.ts` 유지(재정의 없음), 규칙표 `FACTION_RULES`(공격 허용·중립 사건 발생·드롭 테이블 참조·식별 분류·표시 라벨 id·AI 초기 태도) 신설. 경비 세력 공식 이름은 **`patrol`** — 같은 의미의 `guard` 추가 금지(코드의 'guard' 표기는 스폰 절차 이름일 뿐). `'object'`는 세력이 아니므로 `CombatTargetClass`(= FactionId \| 'object')로 승격만 하고 FactionId에 넣지 않는다 ② **식별 read model** — `ShipIdentificationView`(entityId·faction·identificationState·displayLabelId·distanceMeters·isTargetable·isAlive·worldPosition·tagDisplayable) + `ShipIdentificationSource`. 미식별 동안 라벨은 null이며 그래픽스는 모델·이름으로 세력을 추측하지 않는다. 색·문구는 계약에 없음 ③ **`neutralShipHit`** — 실제 유효 피해 적용 후 1회. 조준·발사·빗나감·같은 correlationId 재발행·파괴 후 재발행 금지. `torpedoHit`(연출용, 세력·피해량·공격자·상관 id 없음)과 중복 아님 ④ **`guardShipRequested` payload v2** — 기존 이벤트 **재사용**(신규 이벤트 없음), 구 `{x,z}` → `incidentPosition` 흡수 + requestId·sourceNeutralEntityId·attackerEntityId·spawnReason·requestedFaction·correlationId ⑤ **GuardSpawnPort** — 결과 5종(spawned/duplicateRequest/invalidRequest/noSpawnLocation/spawnFailed), 예외·내부 문자열 비노출 ⑥ **GuardShipAdapter** — 기존 `DestroyerAI` 계약에 주입만(세력 patrol·초기 표적=공격자·스폰 이유·표시 identity), 신규 AI 코어 0 ⑦ **보상 계약** — hostile=공식 적대 드롭 테이블 / neutral=`null`(크레딧 0·지갑 불변) / patrol=`null`(공식 params 없이 발명 금지). 평판·도덕성 도입 금지 ⑧ B6 호위 계약(고가치 수송선 archetype·배율 **참조 키**·EscortBinding·transportAttacked·EscortEngagementRequest) — 핵심 게이트 경로가 의존하지 않음 ⑨ B7 로깅 계약 8항목 + 결과 분류 5종(판정·집계는 툴링) |
| 변경 이유 | B1~B5 흐름(적대·중립 배치 → 조준경 식별 → 중립 유효 피격 → 경비 요청 → 기존 구축함 AI 재사용 스폰 → 공격자 초기 표적)을 창 4개가 병렬로 구현할 수 있게 경계를 먼저 고정. 기존 `guardShipRequested`가 `{x,z}`뿐이라 스폰 판정에 필요한 출처·공격자·중복 방지 키가 없었다 |
| 관련 게이트 | B1·B2·B3·B4·B5 (+ B6·B7 계약 선반영) |
| 하위 호환 여부 | `guardShipRequested` 소비자는 **현재 0** — payload 확장으로 깨지는 코드 없음(발행측 1곳은 리드가 동시 갱신). `FactionId`·`torpedoHit`·A 스택 계약은 무변경 |
| 개발 리드 결정 | 승인 — 단, **B 공식 발효 전 선행개발**이며 dev/main·통합 브랜치 병합은 A+B 최종 통합 브랜치 검증 이후. `DestroyerAI` 구현체가 A 스택에 없으므로 어댑터는 `DestroyerAIFactory` 포트로 위임하고 미연결 시 `spawnFailed`로 끝낸다 — 대체 AI를 만들지 않는다 |
| 적용 커밋 | (본 브랜치 선행 계약 커밋) |

**각 창 소비 지침 (스프린트 B):**
- **게임플레이**: ① 선박에 `faction` 태그 부여 — 현재 화물선은 `'hostile'` 고정이며 중립 선박이 없어 B1이 성립하지 않는다(적대·중립 동시 배치 필요). ② 유효 피해 적용 지점에서 `neutralShipHit` 발행 — 어뢰 1발 = `attackCorrelationId` 1개, 첫 유효 피격에 `firstValidNeutralHit: true`. 기존 `consumeGuardSpawnRequests` 큐는 이행 완료 시 제거(그때까지 레거시 경로 병존, 중복은 composition 경계가 흡수) ③ `ShipIdentificationSource` 구현 — 거리·식별 성립 조건은 판정측 소유 ④ 중립 격침 시 드롭 0 유지(`rewardDropTableIdFor` 규칙과 동일) ⑤ `GuardSpawnLocationStrategy` 구현(월드 지식 필요) — 없으면 스폰은 `noSpawnLocation`
- **그래픽스**: 조준경 태그는 `ShipIdentificationView`만 소비 — 엔티티 이름·모델 종류로 세력 추측 금지. `identificationState === 'unidentified'`면 라벨 없음(세력 노출 금지). 색·실루엣·항해등은 그래픽스 소유이며 계약에 문구·색을 요청하지 않는다. 경비함 등장 방향 연출은 `guardShipRequested.incidentPosition` 구독
- **툴링**: `economy.json`에 세력별 드롭 테이블·고가치 배율 확장(validator 포함) — **patrol 보상은 수치표가 오기 전까지 null 유지**. B7 로깅은 `IdentificationLogSink` 구현·집계·판정 담당(오인율 계산식·최소 표본 5명·50회는 툴링 소유). B1~B5 자동 검증 스크립트 신설은 툴링 몫 — 리드는 존재하지 않는 script를 실행하지 않는다
- **통합**: B 범위표는 **A 통합 PR 병합 시 발효**(15차 결의 1). 본 계약은 그 전 선행개발분이며, A+B 최종 통합 브랜치에서 전체 검증 전까지 B 완료·발효로 보고하지 않는다

### INT-GAME-011 — INT-CORE-011 적용 완료 + production 주입 3줄 배선 요청 (조립부)

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (창 2 — 공식 경제 params production 소비 전환) |
| 대상 시스템 | `src/core/Game.ts`(조립 배선 3줄) — 계약·리드 구현 변경 요청 **없음** |
| 필요한 변경 | INT-CORE-011의 게임플레이 소비 지침을 전부 이행했다(아래 '적용 완료'). production에서 실제로 값이 흐르려면 조립부에서 **3줄**이 필요하다: ① `gameplay.attachOfficialParams(official)` — 경제(드롭·픽업·손실)·화물선(항행·명중·침몰)·장비(성능·가격·슬롯)를 한 번에 배선한다. `OfficialRuntimeParams`가 그대로 대입되는 구조 단면(`GameplayOfficialParams`)을 받으므로 캐스팅이 필요 없다. `new GameplaySystems(bus, params, subscribe, layout, official)` 5번째 인자로 주는 것도 동일 ② `gameplay.restoreSavedLoadout(loaded.source === 'fresh' ? null : (loaded.data.equippedGear as EquipmentId[]))` — **저장 없음(null)과 저장이 명시한 빈 로드아웃([])의 구분**이 핵심이다. 현재 조립부는 `equippedGear`를 저장만 하고 복원하지 않아, 전부 해제한 세이브도 재부팅 시 기본 어뢰로 되돌아간다 ③ `SortieSalvageSpawner` 어댑터를 `spawnSalvage` 대신 **plan 전달** 경로로: `{ spawnSalvage: ... }` → 결합 plan 항목을 그대로 넘기는 `gameplay.spawnSalvageFromPlan(entry)`. spawnId가 넘어와야 게임플레이 측 중복·재생성 거부가 작동한다(현 시그니처는 spawnId를 잃는다). 리드 스포너의 출항당 1회 가드는 그대로 두고 **이중 방어**가 된다 |
| 변경 이유 | 주입 없이는 경제·화물선·장비가 **명시적 unwired**로 남는다(설계된 상태 — 임시 수치를 만들지 않는다). 조립 1지점에서만 값이 흐르는 INT-CORE-011 원칙을 지키면서 배선을 완성하는 최소 변경 |
| 관련 게이트 | A8(공식 수치 소비)·A7(저장 유지)·MVP 재화 루프 |
| 영향을 받는 파일 | `src/core/Game.ts` 3줄. 게임플레이 측은 이미 완료 |
| 하위 호환 여부 | 깨짐 없음 — `attachBaseEconomy(purchase, null)`·`UpgradePurchaseSystem(축약 카탈로그, wallet, costResolver)` 등 조립부의 **기존 호출 형태를 전부 유지**하도록 게임플레이 API를 넓혔다(타입체크 통과 확인). `EquipmentSystem`은 개정 `EquipmentChangeJudgePort`(판정+적용 결합·`snapshotSlots`/`restoreSlots`)를 직접 구현하며, 리드 `EquipmentJudgeAdapter`가 쓰는 `replaceItem`/`unequipItem` 단면도 그대로 제공한다 |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

**게임플레이 적용 완료 (INT-CORE-011 지침 이행):**
- `systems/economy/provisionalEconomy.ts`·`systems/provisionalCargo.ts`·`systems/provisionalEquipment.ts` **삭제**. production 소비 0건(검증 러너 정적 검사 — `__verification__` 픽스처는 제외 대상으로 구분)
- 경제: `EconomySystem(targets, player, ships, economyParams)` + `attachEconomyParams()`. 손실률 0.5·픽업 6m·드롭 120/60/40/25 전부 주입값. 미주입이면 드롭 0·회수 0·손실 0(**손실을 발명하지 않는다**)이며 `economyParamsWired === false`로 드러난다
- 화물선: `cargoShipConfigFromOfficial(cargo, surfaceY)` — 해수면만 레이아웃(월드 소유), 나머지는 `params/cargo.json`. **이관 전 런타임 값과 동일함을 회귀 테스트로 고정**(속력 4·반경 9·침몰 6s·경로 ±30/−40·선체 10/2.5/4/3). 미주입이면 표적 미등록(유령선 금지)
- 장비: 성능·가격·슬롯이 전부 `params/equipment.json`. 게임플레이 내부 성능 상수 0. 슬롯 수는 카탈로그 값을 그대로 따른다(3 주입 시 3 — 하드코딩 아님을 테스트로 증명). 미주입이면 어뢰 프로파일 없음 = 발사 불성립
- salvage: `spawnSalvageFromPlan(entry)` — spawnId 키, 같은 출항 중복·회수 후 재생성 **거부**, `resetForNewSortie()`에서만 기록 해제. 보상은 plan(경제 params 파생), 좌표는 placement에서만 온다
- 업그레이드: 공식 가격 배열·희귀 부품·effectBonus 누적·`paramRef` 소비. 가격 미확정은 **`economyDataUnavailable`**(INT-CORE-010 신설 사유 — INT-GAME-010의 결정 요청은 이것으로 해소, `maxLevelReached` 대용 표기 폐기). provisional 비용 경로 0
- **효과 소비자 조사**(`economy/upgradeEffectConsumers.ts`): wired 4 — maxSpeed·turnRate(→`SubmarinePlayerController`), reloadSpeed(→`StraightRunTorpedoSystem`), torpedoDamage(→`EquipmentSystem.setUpgradeModifiers`). **`deferred consumer` 3 — hullIntegrity·maxDepth·sonarRange**(기준값 파라미터·소비 시스템 부재. 기준값 발명·체력 시스템 개발·C 내구도 선구현 전부 하지 않음, 스텁도 만들지 않음)
- 게임플레이 SavePort 직접 호출 **0건** (러너 정적 검사 + 판정 포트 표면 검사 2중)

### INT-RENDER-010 — [LOOP][ECON] BaseScreenPort v2 동기화·공식 가격 활성화·해저 salvage 월드 배치

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스·월드 (기준 `492d1bf` + 리드 소비 계약 `ffa945a`·툴링 params `2a89400` 병합) |
| 대상 시스템 | `src/ui/*`(v2 소비로 재작성), `src/world/salvagePlacements.ts`(신규 — 좌표 소유), `src/render/SalvageVisuals.ts`(신규), `src/render/CanyonScene.ts`, `src/core/Game.ts`·`PveIntegration.ts`(구계약 어댑터 제거·배치 연결), `src/systems/economy/EconomySystem.ts`(읽기 전용 getter 1개) |
| 관련 게이트 | A4·A5-ui·A6-ui·A8(공식 가격 활성) + salvage 배치 |
| 하위 호환 여부 | 계약 파일 무변경. 동작 변경: 자동 출항 제거(기지 시작)·HUD 출항 버튼 미노출 |
| 개발 리드 결정 | **확인 대기** (아래 ⚠ 2건 + v2 보완 요청 2건) |
| 적용 커밋 | (이 브랜치 v2 동기화·salvage 배치 커밋) |

**① BaseScreenPort v2 동기화 (§2).** UI가 v2를 직접 소비한다 — 읽기 모델
9종(wallet·sortieCreditsEarned·sortieRarePartsSecured·upgradeCatalog·
upgradeLevels·equipmentCatalog·loadout·canLaunchSortie·lastResult)과 명령
5종(purchaseUpgrade·equipItem·replaceItem·unequipItem·confirmDeparture),
결과 8종(success·불가 5종·economyDataUnavailable·saveFailedRolledBack)을
그대로 쓴다. **게임플레이 로컬 결과 타입(purchaseTypes) 참조는 0건**이다.

**제거한 구계약 어댑터:** `createMetaUiPorts`·`toUiCommandResult`·
`isOfficialUpgradeStatId`(src/core/PveIntegration.ts) + 구 UI 포트 타입
일습(`UpgradePurchasePort`·`EquipmentUiPort`·`DeparturePort`·
`SortieEarningsSource`·`UpgradeOfferView`·`MetaCommandResult`·
`MetaCommandFailure`·`UiActionResult`, src/ui/metaEconomyPorts.ts). v2
직결로 전부 무참조가 됐다 — 다른 소비자·테스트 참조 없음을 확인 후 삭제.
`MetaUiAdapter`(수명주기 래퍼)는 유지.

**② v2 보완 요청 (그래픽스 → 리드).**

- **slotPositions (필수)**: `loadout.equipped`는 빈 슬롯이 압축된 목록이라
  **실제 슬롯 인덱스를 복원할 수 없다.** 그런데 명령 3종은 실제 인덱스를
  받는다(`equipItem(id, slotIndex)`·`unequipItem(slotIndex)` →
  `EquipmentSystem.replaceItem/unequipItem`). 슬롯 2개에서 슬롯 1을 해제하면
  실제 배열은 `[null, X]`인데 압축 뷰는 `[X]`라 UI가 X를 슬롯 1로 표시하고,
  이후 '빈 슬롯 장착'이 X를 덮어쓴다. **재현되는 오조작**이라 임시로
  읽기 전용 위치 뷰(`readonly (EquipmentId|null)[]`)를 조립부가 UI에 주입해
  해소했다(`SortiePrepScreen.attachSlotPositions`, 리드가 이미 갖고 있던
  `slotsOf`와 같은 값). **BaseScreenPort v2에 `slotPositions` 추가**를
  요청한다 — 채택 시 이 주입은 삭제된다.
- **startingItem (권장)**: `EquipmentCatalogItem`이 `{id,label,cost}`뿐이라
  params의 `startingItem` 플래그가 UI에 도달하지 않는다. 현재는 공식 비용이
  0/0인 항목을 '시작 보유 (구매 비용 없음)'로 **해석만** 한다(수치 발명
  없음). 플래그가 뷰에 포함되면 해석 대신 플래그를 쓴다.

**③ 공식 가격 활성화 (§3).** production 기본 URL 실측: 업그레이드 7종 전부
가격 표시(1단계 크레딧 100 — 공식 upgrades.json), 지갑 부족 시 '✕ 크레딧
부족' 비활성. 장비 4종 — 기본 어뢰 '시작 보유', 고속 260, 중어뢰 420+희귀 1,
디코이 340+희귀 1. QA 데모(`?econdemo`) 가격은 production 경로에 없음(플래그
없으면 DOM 미생성 확인).

**④ salvage 월드 배치 (§4·§5).** `src/world/salvagePlacements.ts`가
`SalvagePlacementSource`를 구현한다 — **spawnId·worldPosition·orientation만**
정의하고 credits·rareParts·dropTableId·kind는 두지 않는다(코드부 보상 키워드
0건). 좌표는 현 `STARTING_CANYON_LAYOUT` 실측 기준:

| spawnId | worldPosition | 지형 여유 | 스폰 거리 |
|---|---|---|---|
| salvage-1 (chest) | (-3.83, -4.5, -30) | 8.21m | 30.6m |
| salvage-2 (container) | (5.62, -4.5, 16) | 8.61m | 17.5m |
| salvage-3 (mineral) | (2.65, -4.5, 42) | 8.31m | 42.3m |

바닥면이 해저(floorY -6)에 닿고 상단 -3m — 해수면(+12) 부양 없음, 잠수함
하한(y=-5)에서 회수 반경(6m) 안. 상호 최소 26.2m, 화물선 항로(z=-40 해수면)
최단 3D 19.7m. 개발 서버 실측: 출항 시 3개 생성(kind·좌표 일치, salvage-3만
`rare-alloy-core` — 보상은 economy params에서만 파생됨을 확인).

시각은 `SalvageVisuals`(회색 박스 3종 + 회수 범위 링) — **rarePartId를 읽지
않는다**(희귀 부품 사전 노출 금지). 탐지 UI(C 범위) 미추가.

**⑤ ⚠ 조립부 최소 변경 (리드 확인 요청).**
- `Game.ts`: HUD `launchSortie` 미주입 + `render()` 자동 출항 2줄 제거 →
  출항 진입점 1개(기지 화면). 리드 주석의 '기지 화면 UI 도입 시 대체' 조건이
  충족된 시점의 반영이다. 부팅 시 `metaStateChanged {previous:null}` 1회
  방송으로 초기 표시를 동기화한다.
- `EconomySystem.pickupRadiusMeters` 읽기 전용 getter 1개 추가 — 렌더 회수
  범위 링이 **게임플레이 실제 판정값**을 소비하도록. 판정 경로 무변경이며,
  Game.ts가 provisionalEconomy를 import하지 않게 하는 목적도 겸한다(리드
  정적 검사 통과 유지).

**검증:** typecheck·build·check:size(4.5%)·게임플레이 128/128·메타 58/58
(리드 정적 검사 2종 포함)·툴링 26/26·verify:hud 34/34. production 브라우저
실측에서 콘솔 오류 0건.

### INT-RENDER-009 — [LOOP][ECON] 경제·성장 UI production 배선 적용 (스프린트 A 마감 — A4·A5-ui·A6-ui 해소)

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (스프린트 A 마감 작업 지시 — 기준 통합 커밋 `ebea23b`) |
| 대상 시스템 | src/ui/*(재작성 — BaseScreenPort 소비), src/core/Game.ts(INT-CORE-009 배선 스니펫 적용·확장), src/meta/MetaLoop.ts(읽기 전용 getter 1개 선반영), scripts/verify-hud.mjs(기지 시작 대응 최소 수정) |
| 필요한 변경 | 아래 적용 내역 — 전부 반영 완료, 리드 확인 대기 항목 2건(⚠) |
| 변경 이유 | Acceptance A4 실패(경제 UI 미배선) 해소 — production 기본 URL에서 재화·업그레이드·장비·출항 UI가 실상태로 동작해야 함 |
| 관련 게이트 | A4·A5(ui)·A6(ui)·A7(출항 확정 직전 저장) |
| 하위 호환 여부 | 계약 파일 무변경. 동작 변경 1건: **자동 출항 제거 — 게임이 기지(BASE)에서 시작** (Game.ts 주석의 예정된 대체) |
| 개발 리드 결정 | **확인 대기** (선반영 ⚠ 2건 포함) |
| 적용 커밋 | (이 브랜치 production 배선 커밋) |

**적용 내역:**

1. **UI 재작성 (그래픽스 소유)** — `SortiePrepScreen`·`EconomyHud`의 명령·상태
   진입점을 공통 계약 `BaseScreenPort`로 교체 (구 구조적 포트 삭제). 결과
   표시는 계약 `TransactionResult` + UI 전용 `economyDataUnavailable`(가격
   null — 트랜잭션 미진입) 구분. 카탈로그는 economyMath 검증 결과의 읽기
   전용 뷰 — null은 '경제 데이터 미확정' 비활성으로 표기하고 **임의 가격을
   만들지 않는다**. params에 숫자가 오면 코드 변경 없이 활성화된다.
2. **Game 조립 (INT-CORE-009 스니펫 적용)** — savePort(SaveBridge 어댑터),
   구매 판정 `UpgradePurchaseSystem`(가격 resolver = **공식 catalog만**,
   null→어떤 지갑도 충족 불가한 거부 값·provisional 가격 미사용) +
   `PurchaseTransaction`, 장비는 게임플레이 원자 경로(equipItem/replaceItem/
   unequipItem)를 계약 결과로 매핑(slotFull→noFreeSlot), `BaseScreenPort`
   조립 + `EconomyHud`/`SortiePrepScreen` 마운트(registry 시스템
   `baseScreenUi`). 구매 확정 시 유효 파라미터·장비 배율·외형 단계 재파생.
3. **출항 단일 진입점 (§6)** — ControlsHud `launchSortie` 미주입(구 HUD 출항
   버튼 상시 숨김) + render()의 자동 출항 2줄 제거 → **기지 시작**.
   `BaseScreenPort.launchSortie` = beginSortiePrep → 확정 직전 저장 →
   실패 시 cancelSortiePrep(**해역 전환 금지·기지 유지**) / 성공 시
   launchSortie. 부팅 시 `metaStateChanged {previous:null}` 1회 방송으로
   기지 화면·HUD 표시 동기화.
4. **⚠ 선반영(리드 확인 대기) — MetaLoop.sortieEarnings** 읽기 전용 getter
   (이번 출항 집계 스냅숏, wallet getter와 동일 복사본 관례) — 해역 재화
   HUD의 '이번 출항 획득(미확정)' 표시 소스.
5. **⚠ 선반영(툴링 확인 대기) — scripts/verify-hud.mjs** 도입부에 기지 화면
   출항 버튼 클릭 추가 (기지 시작 대응, 34/34 통과 확인).
6. **저장된 장비 loadout 부팅 복원** — 저장 스냅샷(equippedGear)의 역방향이
   조립부에 없어 추가 (비어 있지 않은 저장만 복원 — 신규 세이브는
   EquipmentSystem 기본 표준 어뢰 유지).

**검증:** typecheck/build/check:size(4.4%)/게임플레이 128/메타 35/툴링 26/
verify:hud 34 전부 통과. Production URL(플래그 없음) Playwright 실측:
기지 화면·재화 HUD(초기 0/0 실지갑 일치)·업그레이드 7종 전항 '경제 데이터
미확정' 비활성·장비 장착/해제/롤백(저장 결함 주입 시 지정 문구 + loadout
무변경)·저장 실패 중 출항 거부(기지 유지)·정상 출항 후 해역 HUD 미확정 줄.
스크린샷: docs/screenshots/sprintA_*_production.png 외.
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

### INT-GAME-010 — 스프린트 A 마감: 기지 어댑터 배선 요청 + null 가격 거부 사유 결정

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (창 2 — 스프린트 A production 배선 마감) |
| 대상 시스템 | `src/core/Game.ts`(조립 배선), `src/contracts/meta.ts`(`PurchaseDenialReason` — 결정 요청만) |
| 필요한 변경 | ① **조립 배선** — INT-CORE-009 스니펫의 게임플레이 측 진입점이 준비됐다: `gameplay.attachBaseEconomy({ upgradesParams, equipmentParams, wallet, restoredLevels })` → 공식 카탈로그를 읽어 `UpgradePurchaseSystem`(= `UpgradePurchaseJudgePort` + `UpgradeLevelsPort`)을 만들고 장비 카탈로그(가격·슬롯)를 적용한다. 이후 `new PurchaseTransaction(gameplay.purchaseJudge, metaLoop, gameplay.purchaseJudge, savePort)`·`new EquipmentTransaction(gameplay.equipmentJudge, savePort)`로 배선하면 된다 (단계 포트도 같은 인스턴스가 구현) ② **BaseScreenPort 재료** — `wallet`(리드), `upgradeLevels`=`gameplay.purchaseJudge.levelSnapshot`, `loadout`=`gameplay.equipment.loadout`, `canLaunchSortie`=`metaLoop.metaState === 'BASE' && gameplay.sortieReadiness(true).ready` ③ **EconomyHud 재료** — `gameplay.sortiePendingCredits`·`sortiePendingRareParts`(실제 회수·정산 파생, 임시 숫자 없음) ④ **null 가격 거부 사유 결정 요청** — 공식 params의 가격이 `null`(기획 수치표 미도착)인 항목은 구매 불가로 판정해야 하는데, 계약이 고정한 5종에 '가격 미확정'이 없다. 현재는 `maxLevelReached`('다음 단계가 정의되지 않음')로 거부하고 `nextCost=null`을 함께 노출해 UI가 '가격 미정'으로 표시하게 했다. 전용 사유(예: `priceUnavailable`) 신설 여부는 리드 결정 사항 — **게임플레이는 5종 밖 사유를 임의로 만들지 않았다** |
| 변경 이유 | 스프린트 A A4·A5·A6·A7 미판정의 원인이 기지 UI ↔ 게임플레이 판정 사이의 배선 부재였음. 게임플레이 측 어댑터를 공식 params 기준으로 완성 |
| 관련 게이트 | A4(재화 표시)·A5(구매 사유)·A6(장비)·A7(저장 유지)·A8(임시 수치) |
| 영향을 받는 파일 | `src/systems/economy/{officialEconomyCatalog,UpgradePurchaseSystem,pendingOfficialData}.ts`, `src/systems/EquipmentSystem.ts`, `src/systems/GameplaySystems.ts`, 조립부 `src/core/Game.ts` |
| 하위 호환 여부 | 계약 파일 무수정. `EquipmentSystem`의 자체 저장 포트(`attachSavePort`)·`economy/purchaseTypes.ts`·`economy/provisionalUpgradeCost.ts`는 **삭제**됐다 — 저장·롤백은 리드 트랜잭션 단일 소유(게임플레이 저장 직접 호출 0회). 기존 `equip/unequip` 단순 경로는 유지 |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

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

---

### INT-TOOL-009 — [ECON] A8 승인 경제 수치 확정 + 소비 측 배선 교체 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴 (A8 마감 — 사용자 승인 반영) |
| 대상 시스템 | `params/`(기획 커밋 영역), 게임플레이 `src/systems/`, 리드 `src/core/Game.ts`·`src/meta/` |
| 변경 이유 | 위 INT-TOOL-008 항목 2의 **해소** — 경제 수치표가 사용자 승인으로 도착했고, 툴링이 그릇에 값을 채웠다 |
| 관련 게이트 | A8 |
| 하위 호환 여부 | params 스키마 **추가만**(장비에 `slotCost`·`startingItem`·`performance` 신설). 세이브 스키마 무변경 — 마이그레이션 불필요 |
| 개발 리드 결정 | **확인 대기** — 아래 '요청' 2건 |
| 적용 커밋 | `2a89400` (params 확정 — 다른 창이 소비 가능한 기준 커밋), 이후 검증기·로더·검증 커밋 |

**확정된 것 (툴링·기획 영역 — 완료)**

- `params/upgrades.json` 미확정 105 → **0**, `params/equipment.json` 9 → **0**
- `params/economy.json`·`params/cargo.json` **신설** — 기존 provisional 런타임 값을
  그대로 이관했고, 새 밸런스 변경이 아니다. 예외는 D5 승인 1건뿐:
  파괴 손실률이 게임플레이 0.4 / 메타 루프 0.5로 갈려 있던 것을 **0.5로 통일**
  (6차 결의 7 명시값).
- **희귀 부품 획득 경로**(D2) 확정: `economy.json`의 `salvageSpawns[2]`
  (`spawnId: "salvage-3"`)가 `rarePartId: "rare-alloy-core"`를 **확정 드롭**한다.
  확률이 아니다. MVP의 유일한 희귀 부품 경로다.
- 검증기 `src/tools/economyMath.ts` + 공식 로더 `src/tools/economyParams.ts`.
  `verify:sprint-a` 자동 29/29 통과(승인값 회귀 차단 포함).

**요청 ① — 소비 측 배선 교체 (게임플레이·리드)**

production이 아직 provisional 모듈을 import한다. 해당 파일은 툴링 소유가 아니라
직접 고치지 않았다. 교체 방법은 전부 동일하다 —
`loadEconomyParams()`(`src/tools/economyParams.ts`)가 돌려주는
`{ upgrades, equipment, economy, cargo }`를 소비하면 된다.

| 파일 | 현재 import | 소유 |
|---|---|---|
| `src/core/Game.ts:26` | `../meta/provisionalEconomy` | 리드 (공통 보호 파일) |
| `src/systems/CargoShipSystem.ts:37` | `./provisionalCargo` | 게임플레이 |
| `src/systems/EquipmentSystem.ts:34` | `./provisionalEquipment` | 게임플레이 |
| `src/systems/economy/EconomySystem.ts:27` | `./provisionalEconomy` | 게임플레이 |
| `src/systems/economy/UpgradePurchaseSystem.ts:30` | `./provisionalUpgradeCost` | 게임플레이 |

값이 동일하므로 **배선만 바꾸면 동작 변화가 없다.** 단 `EconomySystem`의
손실률만 0.4 → 0.5로 바뀐다(D5 승인). 교체가 끝나면 provisional 파일 5개를
삭제할 수 있고, `verify:sprint-a`의 `A8-migration-consumers`가 수동 →
자동 통과로 전환된다.

**요청 ② — 해저 재화 좌표 연결 (월드·그래픽스·통합)**

`salvageSpawns`는 `spawnId`·`kind`·보상만 정의한다. **배치 좌표는 월드·그래픽스
소유라 툴링이 정하지 않았다.** `spawnId`로 좌표를 연결해야 출항 최대 수입
245크레딧·희귀 1개 전제가 실제로 성립한다. 현재 `spawnSalvage`는 production에서
호출되지 않으므로, 연결 전까지 실측 수입은 수송선 120뿐이고 보스 준비는
목표 4~6회를 크게 벗어난다.

**기준값이 없어 배율만 정의한 4항목 (임의 생성 금지 준수)**

`hullIntegrity`·`maxDepth`·`sonarRange`는 base stat params도 소비 코드도 저장소에
없다. `torpedoDamage`는 소비 후보(`EquipmentSystem.setUpgradeModifiers`)가 있으나
production 조립에 배선되어 있지 않다. 승인된 `effectBonus`만 정의하고
`paramRef`는 비워 두었다 — **기준값을 추정해 입력하지 않았다.** 기준값이 도착하면
`paramRef` 한 줄 추가로 시뮬레이터 최종값 계산이 열린다(검증기가 미해석
`paramRef`를 거부하므로 오타는 즉시 잡힌다).



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

### INT-INTEG-002 — [LOOP][ECON] A_STACK 통합 회차 처리 결과 (통합 관리자)

| 필드 | 내용 |
|---|---|
| 처리자 | 통합 관리자 (세션 브랜치 `claude/deep-dive-d5-gray-box-integration-tree5i`) |
| 대상 | 리드 `ffa945a` · 게임플레이 `4ea3542` · 그래픽스 `86f5ee5` · 툴링 `96af8bc` 병합 + 조립 배선 |
| 관련 게이트 | A8(공식 수치·소비 배선) · A4/A5-ui/A6-ui(배선) · MVP 재화 루프 |

**INT-GAME-011 요청 3건 — 전부 반영.**

| 요청 | 처리 |
|---|---|
| ① `attachOfficialParams(official)` | **생성자 주입**으로 반영 (`new GameplaySystems(bus, params, subscribe, layout, official)`). 요청서가 동일 효과로 명시한 대안이며, 주입 시점 이전의 unwired 구간이 생기지 않는다. 이중 주입 없음 |
| ② `restoreSavedLoadout` | 반영. `loaded.source === 'fresh' ? null : loaded.data.equippedGear` — 캐스팅 대신 공식 4종 필터를 써서 5번째 장비 유입을 조립부에서 차단 |
| ③ salvage plan 전달 | 반영. 리드 `SalvageSpawnAdapter`를 `spawnSalvageFromPlan(entry)`로 개정 — 구 시그니처가 `spawnId`·확정 `credits`를 잃는다는 지적이 맞았다. 리드 스포너의 출항당 1회 가드는 유지(이중 방어), 검증 픽스처도 새 단면으로 갱신하고 **spawnId 유실 없음** 검사를 추가 |

**INT-RENDER-010 — 병합 시 처리.**

- `slotPositions` 읽기 전용 보완 뷰: **보존**. `BaseScreenPort` 정식 계약 승격은
  이번 기술 통합의 조건이 아니며 후속 기술 부채로 기록(매니페스트 §A9).
- `EconomySystem.pickupRadiusMeters`: 그래픽스가 추가한 `PROVISIONAL_PICKUP_RADIUS_METERS`
  참조 getter가 게임플레이의 공식 params 기반 getter와 **중복 선언**되어
  typecheck를 깨뜨렸다. 정본 우선순위표(EconomySystem params 소비 = 게임플레이)에
  따라 공식 getter를 남기고, '렌더가 같은 값을 소비한다'는 그래픽스 의도는
  정본 주석에 병합했다. 렌더 소비 경로는 변경 없음.
- 자동 출항 제거·출항 진입점 1개(기지 화면)·QA 데모 production 분리: 그대로 채택.

**계약 정규화 (소비자 0 확인 후):**

- `src/tools/upgradeMath.ts` **삭제** — 정본은 `tools/economyMath.ts`.
  툴링이 자기 브랜치에서 삭제하려다 `PveIntegration` 소비로 보류했던 항목이며,
  이번 회차에 소비자 이관이 끝나 제거했다.
- `MetaLoop`·`settlement`·`SalvageObject`의 '임시: provisionalEconomy' 주석을
  공식 `params/economy.json` 출처 표기로 정정 (파일은 이미 삭제 상태였다).

**남긴 결정 요청 (통합 창이 임의로 처리하지 않음):**

1. **deferred upgrade consumer 3종** — `hullIntegrity`·`maxDepth`·`sonarRange`는
   공식 가격이 붙어 **구매·결제·저장이 되지만 런타임 효과가 0**이다. UI에 이
   상태를 표시하는 경로가 없다(`DEFERRED_UPGRADE_CONSUMERS` 소비 코드 0건).
   **경고 표시 / 구매 차단** 중 무엇을 택할지는 기획·리드 결정 사항이며,
   통합 창은 체력·소나 시스템을 만들지 않는다(스텁 포함 금지).
2. `slotPositions`의 `BaseScreenPort` 계약 승격 여부.

---

### INT-TOOL-010 — [ECON][FACTION][B7] 스프린트 B 툴링 선행개발 산출 + 요청 4건

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴 (스프린트 B 선행개발 — 15차 결의 2 창 4 범위) |
| 대상 시스템 | `params/economy.json`(기획 커밋 영역), `package.json`(스크립트), 게임플레이 `src/systems/`, 그래픽스 `src/render/`, 리드 `src/core/` |
| 변경 이유 | B3·B6 경제 params 확장 + B1~B5 자동 검증 + B7 측정 로깅 인프라 (15차 결의 2·3) |
| 관련 게이트 | B1~B7 |
| 하위 호환 여부 | **추가만.** A 스프린트 경제 수치 무변경(`verify:sprint-a` 30/30 유지). 장비·업그레이드 스키마 무변경, 세이브 스키마 무변경 |
| 개발 리드 결정 | **확인 대기** — 아래 요청 4건 |
| 적용 커밋 | `6c77ecf`(params) · `3bc7b40`(검증기) · `e9d9cb3`(B7) · `0931dd9`(러너) |
| 발효 상태 | **B 미발효.** 15차 결의 1에 따라 B 범위표 발효 조건 = A 통합 PR 병합. 이 산출물은 선행개발이며 dev·main 병합 근거가 아니다 |

**확정된 것 (툴링·기획 영역)**

- `factionRewards` — 세력 3종 보상 **정책**. 세력→드롭 테이블 매핑은 계약
  `FACTION_RULES`가 정본이라 복제하지 않고, 검증기가 계약과 정책의 일치를
  **기계적으로 대조**한다(어긋나면 로드 거부). `none`(확정 0)과
  `pending`(미결정)을 구조로 구분해, pending에 0을 적는 경로를 막았다.
- `highValueTransport`·`guardSpawn` — 스키마만. 수치는 전부 `null`.
- 검증기 거부 규칙 11종, B7 로깅 거부 규칙 11종.
- `npm run verify:sprint-b` — 자동 17/17 통과, 보류 5 · 차단 2 · 대기 4.

**요청 ① — 게임플레이 (B1·B2·B4)**

1. **중립 선박 정의·배치** — 현재 production에 `faction: 'hostile'`만 2지점
   (`CargoShipSystem`). 적대·중립이 같은 출항에 있어야 B1이 성립한다.
2. **`ShipIdentificationSource` 구현** — 판정측 데이터(세력·거리·
   `tagDisplayable`). 미식별 동안 `displayLabelId`는 `null`이어야 한다.
3. **`neutralShipHit` 발행** — production 발행 지점 0건. 유효 피해가 적용된
   뒤 1회만 발행하고, 조준·발사·빗나감·중복·파괴 후에는 발행하지 않는다.
   리드의 수신 경계(`NeutralIncidentBoundary`)와 스폰 배선(`GuardSpawnBridge`)은
   이미 병합돼 있어 **발행만 시작하면 경로가 이어진다.**
4. **`GuardSpawnLocationStrategy` 구현** — 월드 지식이 필요하므로 게임플레이·
   월드 소유. 미연결이면 `noSpawnLocation`으로 끝난다(임의 좌표 금지).
   ⚠ 이 전략에 넣을 **공식 수치가 없다** — `guardSpawn` params 5항목 전부
   미확정이다. 기존 값을 승계할 수상함 스폰 규칙도 저장소에 없다.
   수치가 필요하면 기획 결정을 먼저 받아야 하며, 툴링은 발명하지 않았다.

**요청 ② — 그래픽스 (B2)**

식별 태그 UI는 `ShipIdentificationSource`의 read model **만** 소비한다.
모델명·클래스명·메시 이름으로 세력을 추측하는 코드는 계약 위반이며,
`verify:sprint-b`의 `B2-noGuess`가 `src/render/`·`src/ui/`의
`faction === '...'` 직접 분기를 정적 스캔한다(현재 위반 0). 표시는
`identificationState`만 근거로 삼는다 — 미식별에서 세력이 새면 B2·B7이
통째로 무의미해진다. 색·문구는 계약에 없으므로 그래픽스가 정한다.

**요청 ③ — 리드 (B5 차단 해소)**

`B5_BLOCKED_NO_DESTROYER_IMPLEMENTATION` — 저장소에 `DestroyerAI` 계약은
있으나 **production 구현체가 없다**(`implements DestroyerAI` 정적 스캔 0건;
`verifyMeta.ts`의 것은 어댑터 검증용 테스트 대역이다). B5 조건은 '기존
구축함 AI 재사용'이므로 재사용할 원본이 없으면 성립할 수 없다.

**빈 어댑터를 통과로 만들지 않았다.** 그렇게 하면 B5의 존재 이유(신규 AI
코드 0을 구조로 보장)가 사라진다. 계약 `guard.ts` 주석대로 구축함 AI가
스프린트 C 항목이라면, **B5는 C 이전에 통과할 수 없다** — 이 순서 문제
(B1~B5 통과가 C 착수 방아쇠인데 B5가 C 산출물을 기다린다)는 리드 판단이
필요하다.

**요청 ④ — 기획 (B6)**

고가치 배율·호위 이탈 거리는 12차 결의 3의 '배율은 튜닝표' 항목이고 공식
수치가 없다. 제안: `docs/SPRINT_B_B6_PROPOSAL.md` (권고 P2 배율 1.8,
범위 1.5~2.5). ⚠ 제안서의 핵심 발견 — **배율보다 등장 빈도가 보스 준비
곡선의 지배 변수**이며, 고가치 수송선이 매 출항 등장하면 어떤 배율이든
4~6회 목표를 깬다. 호위 이탈 거리는 근거로 삼을 실측이 없어 **제안 수치를
내지 않았다**(호위 AI 구현 후 실측 항목).

**경비함 격침 보상 미결정**

`factionRewards.patrol`은 `pending`이다. 계약 `FACTION_RULES.patrol.dropTableId`도
`null`이라 현재는 경비함을 격침해도 보상이 없다. 결정 시 **계약과 params를
함께** 개정해야 한다(둘 중 하나만 바꾸면 검증기가 로드를 거부한다).

### INT-INTEG-003 — [FACTION][AI] A+B 최종 기술 통합 처리 결과 (통합 관리자)

| 필드 | 내용 |
|---|---|
| 처리자 | 통합 관리자 (세션 브랜치 `claude/deep-dive-d5-gray-box-integration-tree5i`) |
| 대상 | 리드 `5b443d5` · 게임플레이 `a48dce5` · 그래픽스 `cc09fb9` · 툴링 `2757a48` |
| 관련 게이트 | B1~B5 (핵심) · B6·B7 (병렬) · A 전체 회귀 |

**INT-GAME-013 요청 — 전부 반영.**

| 요청 | 처리 |
|---|---|
| ① `const surfaceMotionPorts = gameplay.surfaceShipMotionPortFactory` | 반영. `{ create: () => null }` 상수를 그대로 대체(변수명·이후 코드 무변경). production `PatrolShipFleet`이며 테스트 더블 없음 |
| ② `guardSpawn.attachLocationStrategy(gameplay.guardSpawnLocation)` | 반영. 정확히 1회 |
| ③ `scene.attachShipWorldSource` / `attachIdentificationSource` | 반영. 다만 렌더에 `attachShipWorldSource`가 **없어서** 통합 창이 얇은 바인딩을 추가했다 (아래) |

**INT-RENDER-011 — ⚠ 조립부 최소 변경 2건 처리.**

1. `GuardShipHandle.spawnPosition` — 리드 정본에 이미 포함돼 있었다(병합 시
   주석만 충돌). **리드 판본 채택**, 그래픽스 의도(추정 좌표 금지)는 동일하다.
2. `run.mjs` B5 가드레일 allowlist에 `GuardDirectionIndicator.ts` 추가 —
   **채택하지 않았다.** 리드가 같은 커밋 구간에서 검사 방식을 **내용 기반**
   (`implements DestroyerAI` + AI 어휘 스캔)으로 개정했고, 그 개정판은
   `src/render`·`src/ui` 오버레이를 allowlist로 빼지 않고 **같은 기준으로 검사**한다.
   파일명 변경으로 회피할 수 없는 쪽이 더 강한 가드레일이므로 리드 정본을 남겼다.
   `GuardDirectionIndicator`는 개정 검사에서도 통과한다(AI 어휘 0건).

**통합 창이 추가한 코드 (렌더 소비 API 부재 보완):**

`CanyonScene.attachShipWorldSource(source)` — 중립 화물선과 스폰된 경비함에
3D 표현이 없었다(기존 `attachCargoShipSource`는 적대 1척 전용). 기존
`CargoShipVisual` + `factionVisuals` 3종 변형을 **entityId별로 관리하는 얇은
바인딩**만 추가했고 새 비주얼·새 계약은 만들지 않았다. 주입되면 단일 화물선
경로를 **대체**하므로 적대 화물선이 두 경로로 중복 렌더되지 않는다.
`torpedoHit` 폭발은 맞은 개체 인스턴스에서만 시작한다(멱등 유지).

> 그래픽스 창 확인 요청: 이 바인딩의 소유를 렌더 창으로 이관할지, 아니면
> `ShipWorldSource` 소비를 그래픽스가 자체 구현으로 대체할지 결정 바랍니다.
> 통합 창은 표현을 설계하지 않았습니다 — 변형 선택·마크·항해등은 전부 기존
> `factionVisuals` 정의를 그대로 씁니다.

**검증 정규화:** `verify:sprint-b`의 `B4-port`가 관측 없이 `blocked`로
하드코딩돼 있었다. 배선이 실제로 생겼으므로 **정적 관측 항목**으로 바꿨다 —
위치 전략 호출 + production AI 팩토리 호출 + `create: () => null` 더미 0건을
전부 만족할 때만 `pass`이고, 관측값이 없으면 여전히 `blocked`다.

**남긴 결정 요청:**

1. **`IdentificationExposureSink` 활성화 정책** — production 미주입 상태로 두었다.
   기록 1건에 사람 판단 3필드(`anonymousTesterId`·`playerDecision`·
   `resultClassification`)가 필수라 노출 신호만으로는 측정이 성립하지 않고,
   일반 플레이에서 소비자 없는 로그를 켜지 않기 위한 결정이다.
   측정 세션 운영 방식 확정 후 명시적 측정 모드에서만 배선한다.
2. **B6 공식 수치** — `rewardMultiplier`·`escortMaximumDistanceMeters` 모두 null.
   `docs/SPRINT_B_B6_PROPOSAL.md`의 제안값은 승인 수치가 아니므로
   `params/economy.json`에 입력하지 않았다.

---

## INT-CORE-022 후속 — 리드 결정 요청 1건 (빌드·툴 / PR #15 보완)

**요청**: `src/meta/__verification__/verifyMeta.ts:2823`의 `RC params: 승인 대기
4필드 … null 보존` 검사를 승인값 대조로 갱신해 주십시오. **리드 소유 파일이라
빌드·툴이 직접 고치지 않았습니다** (CLAUDE.md 규칙 7).

**배경**: 사용자 승인에 따라 `params/boss.json`의 4필드에
`[M1M2-INITIAL]` 초기값을 입력했습니다 (교차 소유 예외, 승인 근거는 PR #15).

| 필드 | 이전 | 현재 |
|---|---|---|
| `movement.moveSpeedMetersPerSecond` | null | 7.0 |
| `movement.turnRateRadiansPerSecond` | null | 0.6 |
| `patterns.ram.contactDamage` | null | 30 |
| `patterns.weakPointOpen.hitRadiusMeters` | null | 6.0 |

해당 검사는 **승인 전 상태를 전제로** "네 필드가 null이어야 한다"를 단언하므로
승인값이 들어온 지금 구조적으로 실패합니다 (`값=[7,30,6]`). 승인과 이 단언은
동시에 참일 수 없습니다.

**바로 옆 블록은 이미 통과합니다** — `RC params: 승인값 입력 시 허용 범위·관계
제약(평상시 ≤ 돌진 속도) 강제` ✔. 리드가 승인값 도착을 예상하고 동반 검사를
먼저 마련해 둔 상태이고, 낡은 것은 `null 보존` 전제 하나뿐입니다.

**제안**: 삭제·skip이 아니라 **승인값 정확 일치 + `null→0` 회귀 가드**로
교체(빌드·툴이 `verifyRuntimeClosure.ts`의 P1·P2·P3·B2에 적용한 방식과 동일 —
단언 수 순증, 약화 0). 빌드·툴 쪽 `B2-approvedValues`는 이미 네 값을 주입된
기대값과 정확 대조해 통과 중이라, 갱신 후 두 검증기가 같은 사실을 교차 확인하게
됩니다.

**영향**: 이 한 건 때문에 PR #15 CI가 red입니다. 나머지 검증 8종은 전부 exit 0
(`verify:meta`만 163/164). 빌드·툴은 `params/boss.json` 되돌림도, 리드 파일 수정도
하지 않고 리드 결정을 기다립니다.
