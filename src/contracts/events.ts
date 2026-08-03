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

import type {
  BossPhase,
  LootSource,
  MetaStateId,
  SortieSettlement,
} from './meta';
import type {
  GuardShipRequestPayload,
  NeutralShipHitPayload,
  TransportAttackedPayload,
} from './guard';
import type {
  DamageSourceType,
  SortieFailureReason,
  SortieFailureReport,
} from './survival';

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

  /** 조준 뷰 진입·해제 시 (발행: AimSystem — 마우스·HUD 버튼 공용 진입점).
   *  구독: 렌더(조준 중 카메라 고정 §3.2), UI(조준 표시) */
  aimModeChanged: { aiming: boolean };

  /** 어뢰 발사 순간. 발사 지점(수평면 좌표)은 구축함의
   *  '마지막 목격 위치'로 무조건 기록된다 (§5.10 확정 규칙) */
  torpedoFired: { originX: number; originZ: number };

  /** 어뢰 명중 순간 (발행: 게임플레이 명중 판정 — 타이밍의 주인).
   *  targetId는 CargoShipStateSource.id와 동일 체계. x/z는 명중 위치(수평면).
   *  구독: 렌더(폭발·침몰 연출 트리거), 오디오(아케이드식 과장 폭발음 §4.4),
   *  UI(격침 기록), 격침 보상 어뢰 +1(§5.9)의 게임플레이 진입점 */
  torpedoHit: { targetId: number; x: number; z: number };

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

  /** 플레이어 잠수함 파괴 확정 — **1회만** (발행: 리드 PlayerHullSystem).
   *  구독: SortieFailureCoordinator(실패 정산 1회), 렌더(실패 연출), 오디오.
   *  파괴 판정의 주인은 선체 상태 하나뿐이며 MetaState는 확장하지 않는다
   *  (파괴 사실을 두 곳에 저장 금지 — INT-CORE-014) */
  playerDestroyed: {
    reason: SortieFailureReason;
    destroyedByEntityId: number | null;
    damageSource: DamageSourceType | null;
    worldPosition: { x: number; y: number; z: number };
  };

  /** 출항 실패 정산 확정 (발행: 리드 SortieFailureCoordinator).
   *  구독: 그래픽스 **실패 화면**(C6·C7 — 귀환 정산 화면과 데이터·화면 분리),
   *  UI·오디오. 손실 계산은 MetaLoop 정산 경로가 소유하며 이 이벤트는
   *  그 결과를 전달만 한다 */
  sortieFailed: { report: SortieFailureReport };

  /** 성능 샘플(약 1초 주기, 발행: core/Game).
   *  계측 오버레이·게이트 기록 툴이 구독한다 (G1·G2) */
  performanceSampled: { fps: number; averageFps: number; minFps: number };

  /* ── PvE 메타 루프 계약 (INT-CORE-006, 회의록 10·11 근거) ── */

  /** 상위 메타 루프 상태 전환 완료 시 (발행: meta/MetaLoop).
   *  구독: 기지 화면(렌더·UI), 오디오(국면 음악). 하위 세션 상태
   *  (gameStateChanged)와 별개 계층이다 */
  metaStateChanged: { previous: MetaStateId | null; next: MetaStateId };

  /** ① 메타 세션(출항) 시작 — 하위 해역 세션 재시작과 동시 발행
   *  (발행: meta/MetaLoop). 구독: 렌더(해역 진입 연출), UI, 오디오 */
  sortieStarted: { sortieNumber: number };

  /** ② 해역 세션 결과 확정 — 귀환 정산 데이터 포함 (발행: meta/MetaLoop).
   *  구독: 기지·정산 UI, 오디오. 파괴 시 크레딧 손실이 settlement에 반영된다 */
  sortieEnded: { sortieNumber: number; settlement: SortieSettlement };

  /** ③ 중도 귀환 요청 (발행: UI/입력 측 — Tab·기지 귀환 버튼).
   *  구독: meta/MetaLoop (세션 포트 경유로 하위 정리 후 정산) */
  returnToBaseRequested: Record<string, never>;

  /** 드롭 결과 — 재화 획득 발생 (발행: 게임플레이 economy 판정).
   *  구독: meta/MetaLoop(출항 집계 — 희귀 부품은 즉시 확정),
   *  UI(획득 표시), 렌더·오디오(픽업 연출) */
  lootDropped: { source: LootSource; credits: number; rareParts: number; x: number; z: number };

  /** 중립 선박 **유효 피격** — 실제 피해가 적용된 뒤 1회 (발행: 게임플레이
   *  판정 소유). 조준·발사·빗나감으로는 발행하지 않으며, 같은 공격
   *  (attackCorrelationId)·파괴 이후 중복 발행도 금지 [INT-CORE-012].
   *  연출용 `torpedoHit`과 역할이 다르다(세력·피해량·공격자·상관 id 포함).
   *  구독: composition 중복 방지 경계 → guardShipRequested */
  neutralShipHit: NeutralShipHitPayload;

  /** 경비함 출현 요청 — 중립 선박 공격 불이익 단일 [확정 6차 결의 3].
   *  **기존 계약 재사용**(신규 이벤트 없음): 구 `{ x, z }`는
   *  `incidentPosition`으로 흡수됐다 [INT-CORE-012]. 발행은 composition의
   *  중복 방지 경계 1곳(같은 correlationId 1회).
   *  구독: GuardSpawnPort 배선(리드 — 구축함 AI 재활용 스폰) */
  guardShipRequested: GuardShipRequestPayload;

  /** 고가치 수송선 유효 피격 (B6 — 발행: 게임플레이). 구독: 호위 교전 판정.
   *  B1~B5 핵심 게이트 경로는 이 이벤트에 의존하지 않는다 */
  transportAttacked: TransportAttackedPayload;

  /** 저장 요청 (발행: meta/MetaLoop). cause:
   *  'settlement' = 귀환 정산 확정 후 / 'rarePart' = 희귀 부품 획득 즉시.
   *  [저장 책임 단일화 — INT-CORE-010] 저장 시점 5종 중 이벤트 경로는 이
   *  2종뿐이다. 구매 성공·장비 변경 직후는 각 트랜잭션이, 출항 확정 직전은
   *  Departure command가 SavePort를 **직접** 호출해 결과를 동기 확인한다 —
   *  같은 사용자 명령에서 이벤트를 중복 발행하지 않는다(이중 저장 금지,
   *  구 'sortieLaunch' cause 폐기). 그 외 자동·주기 저장 없음.
   *  구독: SaveSystem(툴링) */
  saveRequested: { cause: 'settlement' | 'rarePart' };

  /** 보스 단계 전환 (발행: 보스 AI — 리드). 구독: 렌더(단계 연출),
   *  오디오(침묵 전환·음정 하강), UI */
  bossPhaseChanged: { phase: BossPhase };

  /** 보스 약점 활성 상태 변경 (발행: 게임플레이 약점 판정 — 판정 소유는
   *  게임플레이, 발광·개방 연출은 렌더 [소회의 결의 5 경계]).
   *  구독: 렌더, UI(조준 보조) */
  bossWeakPointChanged: { active: boolean };
}

export type GameEventName = keyof GameEvents;
