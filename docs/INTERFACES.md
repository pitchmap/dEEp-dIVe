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
| `guardShipRequested` | 게임플레이 판정 | x, z | 경비함 AI(리드 — 구축함 AI 재활용) | 중립 선박 공격 시 | MVP 불이익 단일 [6차 결의 3] |
| `saveRequested` | meta/MetaLoop | cause('settlement'/'rarePart'/'sortieLaunch') | SaveSystem(툴링, src/meta/save) | 정산 확정·희귀 획득 즉시·출항 확정 직전 | 저장 시점 5종 [13차 결의 4] 중 이벤트 3종 — 구매·장비 변경 직후 2종은 트랜잭션이 SavePort 직접 호출(중복 이벤트 금지). 그 외 자동 저장 없음 |
| `bossPhaseChanged` | 보스 AI (리드) | phase(1/2/3) | 렌더(단계 연출), 오디오(침묵 전환·음정 하강), UI | 단계 전환 시 | — |
| `bossWeakPointChanged` | 게임플레이 약점 판정 | active | 렌더(발광·개방 연출), UI | 약점 활성/해제 시 | 판정=게임플레이 / 연출=렌더 경계 [소회의 결의 5] |

## 2. 시스템 계약

| 시스템 | 소유자 | 입력 | 출력(읽기 전용 상태) | 이벤트(발행) | 호출 주기 | 오류 처리 |
|---|---|---|---|---|---|---|
| `PlayerController` | 게임플레이 | WASD 입력, movement.json | positionX/Z, headingRadians, speed | (소음 산출 경유 noiseChanged) | 매 프레임 update | 입력 없음 = 관성 감속 |
| `DepthSystem` | 게임플레이 | Shift/Ctrl, detection.json 보정 | currentLayer | depthChanged | 매 프레임 + 요청 시 | 범위 밖 층 요청 무시 |
| `DetectionSystem` ★허브 | 게임플레이 | reportNoise, reportTorpedoLaunch, 거리·심도·엄폐 | gauge, stage | detectionChanged | 매 프레임 | 임시→본 구현 교체 시 인터페이스 불변 [확정] |
| `AimSystem` | 게임플레이 | beginAim/endAim/fireTorpedo — **마우스·HUD 버튼 공용 진입점** (별도 전투 시스템 금지, 어댑터 연결은 composition root) | aiming | aimModeChanged | 매 프레임 + 입력 시 | **전 심도 조준 [7차 결의 1 — 구 잠망경 심도 전용 규칙 폐기·재도입 금지]**, 조준이 심도·위치를 바꾸지 않음. 해제 시 미세각 reset. 조준 중 아니면 fireTorpedo false (throw 금지) |
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
| `PurchaseDenialReason`(5종 고정)·`TransactionResult` | 크레딧 부족/부품 부족/최대 단계/슬롯 부족/이미 장착 — success/denied/saveFailedRolledBack | 미구현 기능 사유 문구 금지 [7차 결의 4]. 저장 실패 ≠ 구매 불가 사유. 내부 예외 문자열 UI 비노출 [13차 결의 7] |
| `UpgradePurchaseJudgePort`·`EquipmentChangeJudgePort` | 판정·적용·loadout 스냅샷/복원 | 내용(가격·상한·슬롯 규칙)은 게임플레이 소유, throw 금지 — 틀(순서·롤백)은 리드 트랜잭션 |
| `WalletTransactionPort`·`UpgradeLevelsPort`·`SavePort` | 지갑 스냅샷/차감/복원(MetaLoop) · 단계 스냅샷/+1/복원(UpgradeState) · save():boolean(툴링 SaveStore 어댑터 — throw 금지) | 트랜잭션 오케스트레이터(리드 src/meta)만 호출 — UI·렌더 직접 호출 금지 |
| `BaseScreenPort` | wallet·upgradeLevels·loadout·canLaunchSortie + launchSortie/purchaseUpgrade/changeEquipment | 기지 UI(그래픽스)의 유일한 진입점 — MetaLoop·상태 객체 직접 수정 금지. 조립은 composition root |

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
