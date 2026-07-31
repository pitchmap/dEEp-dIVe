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
| `torpedoFired` | TorpedoSystem | originX, originZ | DetectionSystem(발사 지점 무조건 노출), 오디오, 렌더 | 발사 순간 | 잔량 0·재장전 중이면 fire()가 false, 이벤트 없음 |
| `depthChargeEnteredWater` | DepthChargeSystem | id, x, z, fuseSeconds | 오디오(입수음 패닝), UI(붉은 호) | 입수 순간 | — |
| `depthChargeExploded` | DepthChargeSystem | id, x, z | 오디오, 렌더(폭발), HullSystem 연계 | 신관 만료 시 | 타이밍 주인은 판정 로직 — 오디오는 동기화만 |
| `hullDamaged` | HullSystem | amount, hullRemaining, cause | UI, 렌더(흔들림), 오디오 | 피해 발생 시 | hullRemaining 0 → 실패 국면 전환은 상태 머신 경유 |
| `floodingChanged` | HullSystem | compartment, severity | X-ray 렌더(자동 발동), 오디오(물소리) | 침수 상태 변화 시 | severity 0 = 해소 |
| `performanceSampled` | core/Game | fps, averageFps, minFps | PerformanceOverlay, GateMetricRecorder | 약 1초 주기 | 워밍업 2초간 최소 FPS 집계 제외 |

## 2. 시스템 계약

| 시스템 | 소유자 | 입력 | 출력(읽기 전용 상태) | 이벤트(발행) | 호출 주기 | 오류 처리 |
|---|---|---|---|---|---|---|
| `PlayerController` | 게임플레이 | WASD 입력, movement.json | positionX/Z, headingRadians, speed | (소음 산출 경유 noiseChanged) | 매 프레임 update | 입력 없음 = 관성 감속 |
| `DepthSystem` | 게임플레이 | Shift/Ctrl, detection.json 보정 | currentLayer | depthChanged | 매 프레임 + 요청 시 | 범위 밖 층 요청 무시 |
| `DetectionSystem` ★허브 | 게임플레이 | reportNoise, reportTorpedoLaunch, 거리·심도·엄폐 | gauge, stage | detectionChanged | 매 프레임 | 임시→본 구현 교체 시 인터페이스 불변 [확정] |
| `TorpedoSystem` | 게임플레이 | fire(), combat.json | remaining, reloadRemainingSeconds | torpedoFired | 매 프레임 + 발사 시 | 불가 시 false 반환 (throw 금지) |
| `DepthChargeSystem` | 게임플레이 | AI 투하 명령, combat.json | activeCount | depthChargeEnteredWater/Exploded | 매 프레임 | 동시 수 상한 초과 투하는 거부 |
| `DestroyerAI` | 리드 | detectionChanged, notifyLastKnownPosition | state (patrol/alert/attack/lost) | (폭뢰 시스템 호출) | 매 프레임 | VS는 alert·attack 2상태 우선 [확정] |
| `HullSystem` | 게임플레이 | applyDamage(amount, cause) | integrity, isFlooding | hullDamaged, floodingChanged | 매 프레임(침수 지속 피해) | integrity는 0 미만으로 내려가지 않음 |
| `AudioSystem` | 툴링(배관) | 각종 이벤트 구독, assets/audio | unlocked | — | 매 프레임 + 이벤트 | unlock 실패(자동재생 정책) 시 무음 진행, 재시도 |
| `UISystem` | 게임플레이(최소 UI) | 각종 이벤트 구독 | — | — | 매 프레임 | setMinimalMode로 침묵 항행 연출 대응 |

## 3. 파라미터 계약

| 파일 | 소유자 | 내용 | 검증 |
|---|---|---|---|
| `params/movement.json` | 기획 | 정지 관성 1.5s [0.5~2.0], 90도 선회 2.0s [1.0~3.0], 최고 속력 10m/s·가속 3.0s (임시 초기 테스트값 — 조정 범위는 기획 튜닝표 확정 대기, INT-GAME-001) | 범위 밖 → 로드 거부. 속력·가속은 양수·유한 검증 |
| `params/detection.json` | 기획 | 게이지 만충 8s [5~15], 심도 3층 보정, 침묵 항행 배율 | 4층 이상 추가 → 거부 |
| `params/combat.json` | 기획 | 어뢰 3발·재장전 20s [10~30], 신관 3.0s [3.0~4.0 하한 고정], 동시 폭뢰 4 [2~6], 밀려남 8m [4~15] | 신관 하한 <3.0 → 거부 |
| `params/crew.json` | 기획 | 4인 쿨다운 [30~120], 어뢰수 재장전 20→8s [5~12] | 5인째 추가 → 거부 |

수치 변경 = 관찰 근거 + `[Gx]` 태그 커밋 + `docs/templates/TUNING_LOG.md` 기록 (마스터 플랜 §11).
