# INTERFACES — 이벤트·시스템 계약표

> 원본 계약: `src/contracts/events.ts`, `src/contracts/systems.ts`.
> 이 표와 코드가 어긋나면 코드를 고치기 전에 이 표와 INTEGRATION_NOTES 절차부터.
> **변경 절차(공통):** ① `docs/INTEGRATION_NOTES.md`에 제안 기록 → ② 개발 리드
> 결정 → ③ 계약 코드 + 이 표 동시 갱신 → ④ 영향 파트 통보 (CURRENT_STATUS 갱신).

## 1. 이벤트 계약 (EventBus)

| 이벤트 | 소유자(발행) | 입력(페이로드) | 출력(주 구독자) | 호출 주기 | 오류 처리 |
|---|---|---|---|---|---|
| `gameStateChanged` | core/GameStateMachine | previous, next | 렌더(BGM 전환용 오디오), UI | 국면 전환 시 | 허용표 밖 전환은 emit 전에 throw |
| `depthChanged` | DepthSystem | layer | 렌더(포그), 탐지, UI | 층 이동 완료 시 | 최상/최하층 초과 요청은 무시(이벤트 없음) |
| `noiseChanged` | 소음 산출(게임플레이) | level 0~1 | 탐지·파문(렌더)·엔진음(오디오) | 값 변경 시 | 0~1 범위 밖 값 발행 금지(발행측 책임) |
| `detectionChanged` | DetectionSystem | gauge 0~1, stage | AI, 눈 아이콘 UI | 값·단계 변경 시 | — |
| `aimModeChanged` | AimSystem | aiming | 렌더(조준 중 카메라 고정 §3.2), UI(조준 표시) | 조준 뷰 진입·해제 시 | — |
| `torpedoFired` | TorpedoSystem | originX, originZ | DetectionSystem(발사 지점 무조건 노출), 오디오, 렌더 | 발사 순간 | 잔량 0·재장전 중이면 fire()가 false, 이벤트 없음 |
| `torpedoHit` | 게임플레이 명중 판정 (타이밍의 주인) | targetId, x, z (명중 위치) | 렌더(폭발·침몰 연출), 오디오(과장 폭발음), UI(격침 기록), 격침 보상 어뢰 +1 | 명중 순간 1회 | targetId는 CargoShipStateSource.id와 동일 체계 |
| `depthChargeEnteredWater` | DepthChargeSystem | id, x, z, fuseSeconds | 오디오(입수음 패닝), UI(붉은 호) | 입수 순간 | — |
| `depthChargeExploded` | DepthChargeSystem | id, x, z | 오디오, 렌더(폭발), HullSystem 연계 | 신관 만료 시 | 타이밍 주인은 판정 로직 — 오디오는 동기화만 |
| `hullDamaged` | HullSystem | amount, hullRemaining, cause | UI, 렌더(흔들림), 오디오 | 피해 발생 시 | hullRemaining 0 → 실패 국면 전환은 상태 머신 경유 |
| `floodingChanged` | HullSystem | compartment, severity | X-ray 렌더(자동 발동), 오디오(물소리) | 침수 상태 변화 시 | severity 0 = 해소 |
| `performanceSampled` | core/Game | fps, averageFps, minFps | PerformanceOverlay, GateMetricRecorder | 약 1초 주기 | 워밍업 2초간 최소 FPS 집계 제외 |
| `metaStateChanged` | meta/MetaLoop (리드) | previous, next (BASE/SORTIE_PREP/SORTIE/DEBRIEF) | 기지 화면(렌더·UI), 오디오 | 상위 루프 전환 시 | 허용표 밖 전환은 emit 전에 throw. 하위 gameStateChanged와 별개 계층 |
| `sortieStarted` | meta/MetaLoop | sortieNumber | 렌더(해역 진입), UI, 오디오 | 출항 시 (① 세션 시작) | 하위 세션 재시작과 동시 |
| `sortieEnded` | meta/MetaLoop | sortieNumber, settlement(정산 데이터) | 기지·정산 UI, 오디오 | 귀환 정산 확정 시 (② 세션 결과) | 파괴 시 크레딧 손실 반영·희귀 부품 보존 |
| `returnToBaseRequested` | UI/입력 | (없음) | meta/MetaLoop | 중도 귀환 입력 시 (③) | SORTIE 상태 밖 요청은 무시 |
| `lootDropped` | 게임플레이 economy | source, credits, rareParts, x, z | meta(집계·희귀 즉시 확정), UI, 렌더·오디오 | 드롭 발생 시 | 음수 금지(발행측 책임) |
| `neutralShipHit` | 게임플레이 유효 피해 판정 | targetEntityId, attackerEntityId, targetFaction, attackWorldPosition, damageAmount, attackCorrelationId, timestamp, firstValidNeutralHit | composition 중복 방지 경계 → guardShipRequested | 중립 선박에 **실제 피해 적용 후 1회** | 조준·발사·빗나감으로 발행 금지. 같은 attackCorrelationId·파괴 이후 재발행 금지 [INT-CORE-012] |
| `guardShipRequested` | composition 중복 방지 경계 (리드) | requestId, sourceNeutralEntityId, attackerEntityId, incidentPosition, spawnReason, requestedFaction, correlationId | GuardSpawnPort → GuardShipAdapter → 기존 구축함 AI | 중립 유효 피격 1건당 1회 | payload v2 [INT-CORE-012] — 기존 이벤트 재사용(신규 이벤트 없음), 구 `{x,z}`는 incidentPosition으로 흡수. 같은 correlationId 중복 금지 |
| `transportAttacked` | 게임플레이 (B6) | transportEntityId, attackerEntityId, attackWorldPosition, attackCorrelationId | 호위 교전 판정 | 고가치 수송선 유효 피격 시 | B1~B5 핵심 게이트 경로는 이 이벤트에 의존하지 않는다 |
| `saveRequested` | meta/MetaLoop | cause('settlement'/'rarePart') | SaveSystem(툴링, src/meta/save) | 정산 확정·희귀 획득 즉시 | **이벤트 경로는 2종뿐** [INT-CORE-010 저장 책임 단일화] — 구매·장비·출항 저장은 트랜잭션·Departure command의 SavePort 직접 호출(동일 명령 이중 저장 금지). 구 'sortieLaunch' cause 폐기 |
| `bossPhaseChanged` | 보스 AI (리드) | phase(1/2/3) | 렌더(단계 연출), 오디오(침묵 전환·음정 하강), UI | 단계 전환 시 | — |
| `bossWeakPointChanged` | 게임플레이 약점 판정 | active | 렌더(발광·개방 연출), UI | 약점 활성/해제 시 | 판정=게임플레이 / 연출=렌더 경계 [소회의 결의 5] |

## 2. 시스템 계약

| 시스템 | 소유자 | 입력 | 출력(읽기 전용 상태) | 이벤트(발행) | 호출 주기 | 오류 처리 |
|---|---|---|---|---|---|---|
| `PlayerController` | 게임플레이 | WASD 입력, movement.json | positionX/Z, headingRadians, speed | (소음 산출 경유 noiseChanged) | 매 프레임 update | 입력 없음 = 관성 감속 |
| `DepthSystem` | 게임플레이 | Shift/Ctrl, detection.json 보정 | currentLayer | depthChanged | 매 프레임 + 요청 시 | 범위 밖 층 요청 무시 |
| `DetectionSystem` ★허브 | 게임플레이 | reportNoise, reportTorpedoLaunch, 거리·심도·엄폐 | gauge, stage | detectionChanged | 매 프레임 | 임시→본 구현 교체 시 인터페이스 불변 [확정] |
| `AimSystem` | 게임플레이 | beginAim/endAim/fireTorpedo — **마우스·HUD 버튼 공용 진입점** (별도 전투 시스템 금지, 어댑터 연결은 composition root) | aiming | aimModeChanged | 매 프레임 + 입력 시 | **전 심도 조준 [7차 결의 1 — 구 전 심도 조준(구 심도 전용 규칙 폐기) 규칙 폐기·재도입 금지]**, 조준이 심도·위치를 바꾸지 않음. 해제 시 미세각 reset. 조준 중 아니면 fireTorpedo false (throw 금지) |
| `TorpedoSystem` | 게임플레이 | fire(), combat.json | remaining, reloadRemainingSeconds | torpedoFired | 매 프레임 + 발사 시 | 불가 시 false 반환 (throw 금지) |
| `DepthChargeSystem` | 게임플레이 | AI 투하 명령, combat.json | activeCount | depthChargeEnteredWater/Exploded | 매 프레임 | 동시 수 상한 초과 투하는 거부 |
| `DestroyerAI` | 리드 | detectionChanged, notifyLastKnownPosition | state (patrol/alert/attack/lost) | (폭뢰 시스템 호출) | 매 프레임 | VS는 alert·attack 2상태 우선 [확정] |
| `HullSystem` | 게임플레이 | applyDamage(amount, cause) | integrity, isFlooding | hullDamaged, floodingChanged | 매 프레임(침수 지속 피해) | integrity는 0 미만으로 내려가지 않음 |
| `AudioSystem` | 툴링(배관) | 각종 이벤트 구독, assets/audio | unlocked | — | 매 프레임 + 이벤트 | unlock 실패(자동재생 정책) 시 무음 진행, 재시도 |
| `UISystem` | 게임플레이(최소 UI) | 각종 이벤트 구독 | — | — | 매 프레임 | setMinimalMode로 침묵 항행 연출 대응 |

## 2b. 상태·데이터 계약 (읽기 전용 — 시스템 아님)

| 계약 | 소유자(공급) | 필드 | 소비자 | 규칙 |
|---|---|---|---|---|
| `SubmarinePoseSource` (systems.ts) | 게임플레이 (PlayerController 구현체) | positionX/Y/Z, headingRadians, forwardSpeedMetersPerSecond(부호: + 선수/− 선미) | 렌더 장면·카메라·프로펠러·블롭 섀도 | 렌더는 소비만 — 위치 차분으로 속도 재계산 금지. 프로펠러는 forwardSpeed + conventions.propellerSpinRatio()만 사용 |
| `CargoShipStateSource` (systems.ts) | 게임플레이 (CargoShipSystem) | id, positionX/Y/Z, headingRadians, velocityX/Z, hit, sinkProgress(0~1), removed | 렌더(CargoShipVisual), TargetRegistry, UI | 침몰 시간축 소유는 게임플레이 — 렌더는 sinkProgress 매핑만(자체 타이머 금지), removed로 시각 자원 정리. VS 화물선 1척 = 단일 상태 |
| `CanyonLayout` (layout.ts) | 리드 승인 데이터 모듈 `src/world/startingCanyonLayout.ts` `STARTING_CANYON_LAYOUT` (정식 블록아웃은 레벨 디자인 산출물 반영 시 데이터만 교체) | floorY −6, seaSurfaceY 12, submarineSpawn (0,0,0), blocks[](중심 XZ·크기·Y요, 블록 바닥=floorY — 벽 높이는 그래픽 하향값 11/12±2·sin 확정, 상단≤7<해수면) | 렌더(메시), 게임플레이(충돌·시작 구역) | 단일 소스 — composition root가 같은 인스턴스를 양쪽에 주입. 자체 수식 복제 금지 (구 startingArea 미러·buildCanyonBlockout 수식은 이 데이터 소비로 교체) |
| `FineAimSource` (systems.ts) | 게임플레이 (AimSystem 구현체) | aimYawRadians·aimPitchRadians (잠수함 로컬, 비조준 시 0) | TorpedoTubeSocketRig(리드) | 클램프는 conventions.clampAimYaw/PitchRadians 동일 함수만 — 개별 제한 계산·이중 부호 금지. 해제 시 0 reset [13차 결의 3·8·9] |
| `TorpedoTubeSocketSource` (systems.ts) | 리드 (core/TorpedoTubeSocketRig — 앵커 데이터: world/torpedoTubeAnchor) | aimCameraSocket·torpedoSpawnSocket (SocketPose: 월드 위치+전방 단위 벡터) | 그래픽스(조준 카메라), 게임플레이(어뢰 생성) | **단일 앵커·동일 전방축, 십자선=탄도** [7차 결의 1·13차 결의 2]. 안전 오프셋은 spawn 소켓 정의 한 곳뿐 — 시스템별 숫자 오프셋 계산 금지. Three.js 객체 비노출 |

## 2c. PvE 메타 계약 (contracts/meta.ts — INT-CORE-006)

| 계약 | 내용 | 소유·규칙 |
|---|---|---|
| `FactionId` | hostile / neutral / patrol — 개체 태그 방식(클래스 분화 금지) | 태그 부여·판정은 게임플레이. `CargoShipStateSource.faction`(선택 — 태그 작업 후 필수 승격) |
| `MetaStateId`·`SortieOutcome`·`SortieReport`·`SortieSettlement` | 상위 루프 상태 / 세션 결과(returned·aborted·destroyed) / 정산(earned·lost·net·희귀 확정) | 메타 루프(리드) 소유. 계층 간 통신은 시작·결과·중도 귀환 3종만 |
| `SortieSessionPort` | 하위 해역 세션 포장 포트 — start() / requestReturnToBase() | 어댑터는 composition root 제공. 상위의 하위 내부 접근 금지 |
| `UpgradeStatId`(7항목 상한)·`UpgradeModifiers` | 합연산 보정 집합 — 최종값 = 기준값 × (1 + 보정 합), params 원본 불변 | 계산은 src/meta/upgradeMath.ts 순수 함수만 (툴 시뮬레이터 동일 함수). 8항목째 추가는 계약 개정 사안 |
| `EquipmentId`(4종 상한)·`EquipmentLoadout` | 장비 교체 슬롯 — 상위호환 금지 | 장착 상태는 메타 소유, 장비 로직은 게임플레이 |
| `BossPhase` | 보스 3단계 | 단계 소유는 보스 AI(리드), 약점 판정은 게임플레이, 연출은 렌더 |
| `PurchaseDenialReason`(확정 5종 + economyDataUnavailable)·`TransactionResult`·`BaseCommandOutcome`·`DepartureResult` | slotFull로 통일(구 noFreeSlot 폐기) + economyDataUnavailable(공식 params null — 상태·저장 변경 전 반환, 0 변환·provisional 대입 금지) — success/denied/saveFailedRolledBack, 출항은 departed/saveFailed/invalidState/economyDataUnavailable | 미구현 기능 사유 문구 금지 [7차 결의 4]. 저장 실패 ≠ 불가 사유. 내부 예외 문자열 UI 비노출 [13차 결의 7] |
| `UpgradePurchaseJudgePort`·`EquipmentChangeJudgePort` [개정] | 구매: 무변경 판정(evaluate) / 장비: **판정+적용 결합**(applyEquipmentChange — 불가 시 사유·무변경) + snapshotSlots/restoreSlots(빈 슬롯 위치 보존) | 내용(가격·상한·슬롯 규칙)은 게임플레이 소유, throw 금지·저장 금지 — 틀(순서·저장·롤백)은 리드 트랜잭션 |
| `WalletTransactionPort`·`UpgradeLevelsPort`·`SavePort` | 지갑 스냅샷/차감/복원(MetaLoop) · 단계 스냅샷/+1/복원(UpgradeState) · save():boolean(툴링 SaveStore 어댑터 — throw 금지) | 트랜잭션 오케스트레이터(리드 src/meta)만 호출 — UI·렌더 직접 호출 금지 |
| `BaseScreenPort` **v2** [INT-CORE-010] | 읽기: wallet(실지갑)·sortieCreditsEarned(미정산)·sortieRarePartsSecured·upgradeCatalog(nextCost null=미확정)·upgradeLevels·equipmentCatalog·loadout·canLaunchSortie·lastResult / 명령: purchaseUpgrade·equipItem·replaceItem·unequipItem·confirmDeparture | production UI(그래픽스)의 유일한 진입점 — wallet·업그레이드·loadout·SaveStore 직접 수정 금지, 별도 saveRequested 발행 금지. 조립은 composition root |

## 2d. 저장 책임 표 (스프린트 A — INT-CORE-010 확정)

> 원칙: **한 사용자 명령 = SavePort 최대 1회.** UI·판정 포트는 저장하지
> 않고 saveRequested를 발행하지도 않는다. `CountingSavePort`(조립부)로
> 명령당 호출 횟수를 계측할 수 있다.

| 저장 시점 [13차 결의 4] | 저장 책임 (유일) | 경로 |
|---|---|---|
| 업그레이드 구매 성공 직후 | `meta/PurchaseTransaction` | SavePort 직접 호출 (실패 시 지갑·단계 롤백) |
| 장비 장착·교체·해제 직후 | `meta/EquipmentTransaction` | SavePort 직접 호출 (실패 시 슬롯 원복). EquipmentSystem의 attachSavePort 내부 경로는 production 미연결 |
| 출항 확정 직전 | Departure command (조립부) | SavePort 직접 호출 — 실패 시 **해역 전환 없음**. MetaLoop.launchSortie는 저장하지 않음 |
| 귀환 정산 확정 | MetaLoop → `saveRequested('settlement')` | SaveBridge 구독 기록 |
| 희귀 부품 획득 즉시 | MetaLoop → `saveRequested('rarePart')` | SaveBridge 구독 기록 |

## 2f. 스프린트 B 세력·식별·경비 계약 (INT-CORE-012 — 선행개발, B 미발효)

> 흐름 정본: 게임플레이 유효 피해 → `neutralShipHit` → **composition 중복
> 방지 경계(정본 1곳)** → `guardShipRequested` → `GuardSpawnPort` →
> `GuardShipAdapter` → 기존 `DestroyerAI`. 신규 경비함 AI 코어는 만들지 않는다.

| 계약 | 내용 | 소유 |
|---|---|---|
| `FactionId` | 정의 정본은 `contracts/meta.ts` — hostile·neutral·**patrol**. 경비 세력 별칭 `guard` 추가 금지(스폰 절차 이름에만 잔존). `'object'`는 세력이 아니라 표적 분류(`CombatTargetClass`) | 리드 (계약) |
| `FACTION_RULES` | 세력별 규칙표: 공격 허용·중립 사건 발생·드롭 테이블 참조·식별 분류·표시 라벨 id·AI 초기 태도. **색·문구 없음** | 리드 |
| `ShipIdentificationView` / `Source` | B2 조준경 식별 read model — 미식별 시 라벨 null(세력 비노출). 엔티티 이름·모델로 세력 추측 금지 | 판정=게임플레이 / 표시=그래픽스 |
| `NeutralShipHitPayload` | 유효 피해 적용 후 1회. 조준·발사·빗나감·중복·파괴 후 금지 | 게임플레이 (발행) |
| `GuardShipRequestPayload` | requestId·sourceNeutralEntityId·attackerEntityId·incidentPosition·spawnReason·requestedFaction(`patrol`)·correlationId | composition 경계 (발행) |
| `GuardSpawnPort` | 결과 5종 spawned/duplicateRequest/invalidRequest/noSpawnLocation/spawnFailed. 예외·내부 문자열 비노출 | 게임플레이 또는 composition |
| `GuardShipAdapter` / `DestroyerAIFactory` | 기존 AI에 세력·초기 표적·스폰 이유·identity 주입만. AI 판단 로직 0 | 리드 |
| 보상 규칙 `rewardDropTableIdFor` | hostile=공식 적대 테이블 / neutral=null(크레딧 0·지갑 불변) / patrol=null(수치표 전 발명 금지). 평판·도덕성 금지 | 리드(규칙) / 기획·툴링(수치) |
| B6 호위 계약 | HighValueTransport archetype·배율 **참조 키**·EscortBinding·transportAttacked·EscortEngagementRequest — 핵심 게이트 비의존 | 리드(계약) |
| B7 로깅 계약 | `IdentificationOpportunityLog` 8항목 + 결과 분류 5종, `IdentificationLogSink`. 집계·판정은 툴링 | 리드(계약) / 툴링(판정) |

## 2e. 공식 런타임 params 소비 계약 (INT-CORE-011 — contracts/officialParams.ts)

> 원칙: **공식 로더 호출은 composition root 1회.** 시스템·UI는 params
> JSON을 직접 import하거나 툴링 로더를 직접 호출하지 않고, 주입된 값만
> 소비한다 (JSON → 시스템 단방향).

| 계약 | 내용 | 소유 |
|---|---|---|
| `OfficialRuntimeParams` | `loadEconomyParams()`(upgrades·equipment·economy·cargo) + `loadAimingParams()` 각 1회 호출 번들. 소비자: MetaLoop(손실률)·GameplaySystems(경제·조준)·BaseScreenPort(카탈로그)·Purchase/EquipmentTransaction·DepartureCommand | 로더·타입 = 툴링, 조립 = 리드 |
| `SalvagePlacementSource` | salvage 배치의 **월드 좌표 소유** — spawnId·worldPosition·(선택)orientation. 경제 params(`economy.salvageSpawns`)는 spawnId·kind·dropTableId(credits)·rarePartId 소유. composition이 동일 spawnId로 결합 | 좌표 = 월드·그래픽스, 보상 = 기획(economy.json), 결합 = 리드 |
| `SalvageSpawnPlanEntry` | 결합 결과 — 보상은 economy에서, 좌표는 placement에서만 파생. 누락·중복·미지 spawnId·미지 dropTableId·미지 kind = **거부**(무시 금지) | 리드 (`composeSalvageSpawnPlan`) |
| production spawn 규칙 | 출항 월드 초기화 시 salvageSpawns 전체(MVP 3개) 1회 생성. 같은 출항 중복·파괴분 재생성 금지(출항당 1회 가드). 새 출항 시 재생성(resetSortieSession 규칙). 배치 미도착 시 임시 좌표 금지 — 명시적 unwired | 스포너 = 리드, 드롭 런타임 = 게임플레이 |
| `SalvageSpawnAdapter` | 스포너 → 게임플레이 진입점. **결합 entry를 통째로** 넘긴다: `spawnSalvageFromPlan(entry)`. 좌표만 넘기던 구 시그니처는 `spawnId`·확정 `credits`를 잃어 게임플레이 측 중복·회수 후 재생성 거부가 성립하지 않으므로 **폐기**. 스포너의 출항당 1회 가드와 게임플레이의 spawnId 가드가 이중 방어 | 어댑터 정의 = 리드, 구현 = 게임플레이 `GameplaySystems.spawnSalvageFromPlan` |

### 주입 지점 (composition root 1회씩)

| 대상 | 호출 | 규칙 |
|---|---|---|
| 공식 params | `new GameplaySystems(bus, params, subscribe, layout, official)` | 생성자 1회 주입. `attachOfficialParams(official)`는 생성자에서 못 받은 경우의 대체 경로 — **둘을 함께 쓰지 않는다** |
| 저장 loadout | `gameplay.restoreSavedLoadout(saved)` | `saved === null`(SaveStore `source: 'fresh'`) → 공식 시작 장비 부여 / `saved === []`(명시적 전부 해제) → **그대로 유지**. 두 경우를 섞으면 '전부 해제'가 새로고침마다 무효가 된다 |
| salvage 배치 | `salvageSpawner.attachPlacementSource(STARTING_AREA_SALVAGE_PLACEMENTS)` | 좌표 소유는 `src/world/salvagePlacements.ts`. 미연결이면 unwired(임시 좌표 금지) |

## 3. 파라미터 계약

| 파일 | 소유자 | 내용 | 검증 |
|---|---|---|---|
| `params/movement.json` | 기획 | 정지 관성 1.5s [0.5~2.0], 90도 선회 2.0s [1.0~3.0], 최고 속력 10m/s·가속 3.0s (임시 초기 테스트값 — 조정 범위는 기획 튜닝표 확정 대기, INT-GAME-001), 프로펠러 공회전 비율 0.08 (연출 파라미터, INT-CORE-002) | 범위 밖 → 로드 거부. 속력·가속은 양수·유한, 공회전 비율은 0~1 검증 |
| `params/detection.json` | 기획 | 게이지 만충 8s [5~15], 심도 3층 보정, 침묵 항행 배율 | 4층 이상 추가 → 거부 |
| `params/combat.json` | 기획 | 어뢰 3발·재장전 20s [10~30], 신관 3.0s [3.0~4.0 하한 고정], 동시 폭뢰 4 [2~6], 밀려남 8m [4~15] | 신관 하한 <3.0 → 거부 |
| `params/crew.json` | 기획 | 4인 쿨다운 [30~120], 어뢰수 재장전 20→8s [5~12] | 5인째 추가 → 거부 |
| `params/aiming.json` (신설 예정 — 툴링 창 4) | 기획 | yaw 한계 15° [10~25], 상향 10° [5~15], 하향 15° [10~25] — **전부 양수 크기(음수 하향각 저장 금지)**, 감도 0.5 [0.3~1.0]. `aimReturnBehavior` 없음(reset 단일 — 스키마 포함 금지) | 계약 원본: contracts/params.ts AimingParams (INT-CORE-008). 음수·범위 밖 → 로드 거부 |

수치 변경 = 관찰 근거 + `[Gx]` 태그 커밋 + `docs/templates/TUNING_LOG.md` 기록 (마스터 플랜 §11).

**렌더 시각 파라미터와의 경계 (INT-CORE-003):** `src/render/renderVisualParams.json`
(그래픽스 소유)은 순수 연출 수치(최대 각속도·감쇠·폭발 스케일 등)만 담는다 —
`params/*.json` 값의 중복 정의 금지. `propellerIdleSpinRatio`·최고 속력의 공식
소스는 `params/movement.json` 하나이며, 렌더가 필요하면 composition root가
검증 완료 값을 주입한다 (렌더 측 `idleSpinRatio`·`fullSpinAtSpeedMps`는 제거 대상).
