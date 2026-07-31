/**
 * 공통 이벤트 계약.
 *
 * 게임플레이·렌더링·사운드·UI는 서로 직접 참조하지 않고
 * EventBus(src/core/EventBus.ts)를 통해서만 통신한다.
 *
 * 이 파일은 공통 보호 파일이다 — 변경은 docs/INTEGRATION_NOTES.md에 먼저
 * 제안하고 개발 리드 승인 후에만 반영한다 (docs/FILE_OWNERSHIP.md).
 */

/** 게임 상태 식별자 (마스터 플랜 §4 코어 루프의 국면 구분) */
export type GameStateId =
  | 'BOOT'
  | 'DEPARTURE'
  | 'APPROACH'
  | 'ATTACK'
  | 'ESCAPE'
  | 'RESULT';

/** 심도 3층 식별자 (마스터 플랜 §3.4 — 4층 이상 확장 금지) */
export type DepthLayerId = 'periscope' | 'cruise' | 'deep';

/** 탐지 게이지 3단계 — 눈 아이콘 UI와 1:1 대응 (마스터 플랜 §5.6) */
export type DetectionStage = 'safe' | 'searching' | 'detected';

/** 폭뢰 피해 구분 (마스터 플랜 §5.13) */
export type DamageCause = 'direct' | 'near';

/**
 * 이벤트 이름 → 페이로드 타입 맵.
 *
 * 여기 정의된 이벤트는 "현재 포함 범위 시스템을 연결하기 위한 계약"이다.
 * 발행·구독 시스템은 docs/INTERFACES.md 표를 기준으로 한다.
 * 제외 범위 기능(§6.3)을 위한 이벤트는 추가하지 않는다 (스텁 금지 §6.4).
 */
export interface GameEvents {
  /** 게임 상태 머신 전환 완료 시 (발행: core/GameStateMachine) */
  gameStateChanged: { previous: GameStateId | null; next: GameStateId };

  /** 심도 층 변경 완료 시 (발행: DepthSystem) */
  depthChanged: { layer: DepthLayerId };

  /** 자기 소음 수준 변경 시. level은 0(무음)~1(최대) 정규화 값.
   *  소음 하나가 탐지 입력·파문 크기·엔진음 크기로 삼중 분배된다 (§7.2) */
  noiseChanged: { level: number };

  /** 탐지 게이지 값·단계 변경 시 (발행: DetectionSystem) */
  detectionChanged: { gauge: number; stage: DetectionStage };

  /** 어뢰 발사 순간. 발사 지점(수평면 좌표)은 구축함의
   *  '마지막 목격 위치'로 무조건 기록된다 (§5.10 확정 규칙) */
  torpedoFired: { originX: number; originZ: number };

  /** 폭뢰 입수 순간 — '풍덩→3초→폭발' 시그니처 리듬의 시작점.
   *  사운드(입수음 패닝)와 판정 타이머가 이 이벤트에 동기화된다 */
  depthChargeEnteredWater: { id: number; x: number; z: number; fuseSeconds: number };

  /** 폭뢰 폭발 순간 (발행: DepthChargeSystem — 판정 로직이 타이밍의 주인) */
  depthChargeExploded: { id: number; x: number; z: number };

  /** 선체 피해 발생 시. hullRemaining은 0~1 정규화 값 */
  hullDamaged: { amount: number; hullRemaining: number; cause: DamageCause };

  /** 침수 상태 변경 시. severity 0 = 침수 없음(해소).
   *  X-ray 침수 표시(보호 목록)가 이 이벤트로 구동된다 */
  floodingChanged: { compartment: string; severity: number };

  /** 성능 샘플(약 1초 주기, 발행: core/Game).
   *  계측 오버레이·게이트 기록 툴이 구독한다 (G1·G2) */
  performanceSampled: { fps: number; averageFps: number; minFps: number };
}

export type GameEventName = keyof GameEvents;
