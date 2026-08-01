/**
 * 중립 피격 → 경비함 스폰 계약 + 호위(B6) 계약 (INT-CORE-012, 스프린트 B).
 *
 * ## 흐름 정본 (B4·B5)
 *
 * ```
 * 게임플레이 유효 피해 적용
 *   → neutralShipHit 이벤트 (판정 소유 = 게임플레이)
 *   → composition 중복 방지 경계 (attackCorrelationId 1회)
 *   → guardShipRequested 이벤트 (기존 계약 재사용 — 신규 이벤트 아님)
 *   → GuardSpawnPort.spawnGuardShip()
 *   → GuardShipAdapter (기존 DestroyerAI 계약 위임 — 신규 AI 코어 0)
 *   → 월드 등록 + 초기 표적 = 공격자
 * ```
 *
 * ## 신규 AI 금지
 *
 * 경비함 전용 추적 상태 머신·전용 공격 AI·구축함 AI 복사본을 만들지 않는다.
 * `GuardShipAdapter`가 하는 일은 **주입뿐**이다: 세력(patrol) · 초기 표적 ·
 * 스폰 이유 · 표시용 identity · 기존 AI가 요구하는 초기 설정. 판단 로직은
 * 전부 기존 `DestroyerAI`(contracts/systems.ts) 구현에 있다.
 *
 * ## B5 규칙 개정 (15차 diff-only 변경 — INT-CORE-013)
 *
 * 조사 결과 **production `DestroyerAI` 구현체가 0개**였다(계약·어댑터·검증
 * 더블만 존재). 따라서 '기존 구현체 재사용 / 신규 AI 코드 0'은 성립할 수
 * 없는 전제였고, 다음으로 개정한다:
 *
 *  - **범용** production `DestroyerAI` 구현체를 **정확히 1개** 신설한다
 *    (`core/DestroyerAIController`). 일반 적대 구축함도 같은 구현체를 쓴다.
 *  - `GuardShipAdapter`는 그 범용 구현체를 재사용한다.
 *  - 경비함 전용 `GuardAI`·`GuardBehavior`·`GuardStateMachine`은 **계속 금지**.
 *  - 탐지·폭뢰·내구도·침수는 이 구현에 포함하지 않는다 (스프린트 C 범위).
 *  - 검증 더블을 production factory로 쓰지 않는다.
 *
 * ## 범위 밖 (여기에 만들지 않는다)
 *
 * 탐지 게이지·소나 상태 머신·추적 단계 확장·폭뢰·선체 체력·침수 —
 * 전부 스프린트 C 범위다.
 */

import type { FactionId } from './faction';
import type { DestroyerAI } from './systems';

/** 월드 좌표 (판정·스폰 공용) */
export interface IncidentPosition {
  readonly x: number;
  readonly z: number;
}

/**
 * 플레이어(잠수함)의 엔티티 id.
 *
 * TargetRegistry의 표적 id는 0 이상을 쓰므로 충돌하지 않는 음수 상수를
 * 공격자 id로 고정한다. 별도 엔티티 시스템을 도입하지 않기 위한 최소 규약이며,
 * 실제 엔티티 id 체계가 생기면 이 상수만 교체한다.
 */
export const PLAYER_ENTITY_ID = -1;

/* ── 중립 선박 유효 피격 (B4 트리거) ───────────────────────── */

/**
 * `neutralShipHit` 이벤트 페이로드.
 *
 * **발행 조건 — 실제 유효 피해가 적용된 뒤 1회.** 다음은 발행 사유가
 * 아니다: 조준만 한 경우 / 발사만 한 경우 / 빗나간 공격 / 같은 공격
 * (`attackCorrelationId`)의 두 번째 처리 / 이미 파괴된 표적에 대한 추가 처리.
 *
 * 기존 `torpedoHit`과 중복이 아니다 — torpedoHit은 세력·피해량·공격자·
 * 상관 id가 없는 연출용 명중 통지이며, 유효성 판정 결과를 담지 않는다.
 */
export interface NeutralShipHitPayload {
  readonly targetEntityId: number;
  /** 공격자 — 플레이어는 `PLAYER_ENTITY_ID` */
  readonly attackerEntityId: number;
  /** 피격 대상의 세력 — 중립 사건 판정의 근거 (계약상 'neutral') */
  readonly targetFaction: FactionId;
  readonly attackWorldPosition: IncidentPosition;
  readonly damageAmount: number;
  /**
   * 한 번의 공격(어뢰 1발)을 식별하는 상관 id. 같은 공격에서 두 번
   * 발행되지 않으며, 중복 방지 경계의 키다.
   */
  readonly attackCorrelationId: string;
  /** 기록 시각(epoch ms) 또는 프레임 번호 — 발행측이 정한다 */
  readonly timestamp: number;
  /** 이 표적에 대한 **첫** 유효 중립 피격인가 (경비 요청은 첫 건에서만) */
  readonly firstValidNeutralHit: boolean;
}

/* ── 경비함 출현 요청 (기존 이벤트 재사용) ─────────────────── */

/** 스폰 사유 — 확장 시 계약 개정 (임의 문자열 금지) */
export type GuardSpawnReason = 'neutralAttack';

/**
 * `guardShipRequested` 이벤트 페이로드 v2.
 *
 * 기존 `guardShipRequested`가 정본이며 **신규 이벤트를 만들지 않는다** —
 * 기존 `{ x, z }`는 `incidentPosition`으로 흡수됐다(구 필드 제거).
 * 같은 `correlationId`로 요청이 중복 발행·중복 처리되지 않아야 한다.
 */
export interface GuardShipRequestPayload {
  /** 요청 1건의 id — 스폰 중복 방지 키 */
  readonly requestId: string;
  readonly sourceNeutralEntityId: number;
  readonly attackerEntityId: number;
  readonly incidentPosition: IncidentPosition;
  readonly spawnReason: GuardSpawnReason;
  /** 스폰될 개체의 세력 — 계약상 'patrol' (guard 별칭 추가 금지) */
  readonly requestedFaction: FactionId;
  /** 유발 공격의 상관 id — neutralShipHit.attackCorrelationId와 동일 값 */
  readonly correlationId: string;
}

/* ── 경비함 생성 포트 ──────────────────────────────────────── */

/** 스폰 위치 결정 결과 — 전략 구현은 게임플레이·월드 소유 */
export interface GuardSpawnLocation {
  readonly x: number;
  readonly z: number;
  /** 초기 선수 방위(라디안) — 미지정이면 구현이 사건 지점을 향하게 정한다 */
  readonly headingRadians?: number;
}

/** 스폰 위치 전략 — 미연결이면 `noSpawnLocation`으로 끝난다 (임의 좌표 금지) */
export interface GuardSpawnLocationStrategy {
  resolve(request: GuardShipRequestPayload): GuardSpawnLocation | null;
}

/**
 * 수상함 이동 포트 — **게임플레이가 구현한다** (선박 transform의 주인).
 *
 * AI는 판단만 하고 실제 이동은 이 포트에 명령한다. 리드 코드가 게임플레이
 * 선박의 transform을 직접 조작하지 않기 위한 경계다. 조타·가속 수치와
 * 월드 경계 판정은 전부 구현측(게임플레이·월드) 소유이며, 계약에는 어떤
 * 수치도 두지 않는다.
 */
export interface SurfaceShipMotionPort {
  getPosition(): { readonly x: number; readonly y: number; readonly z: number };
  /** 정규화된 진행 방향 (XZ) */
  getForward(): { readonly x: number; readonly z: number };
  /** 지정 지점을 향해 이번 프레임만큼 선회 (선회 속도는 구현 소유) */
  turnToward(x: number, z: number, deltaSeconds: number): void;
  /** 현재 방향으로 이번 프레임만큼 전진 (속력은 구현 소유) */
  moveForward(deltaSeconds: number): void;
  /** 수상함 고도 유지 — 해수면 기준값은 월드·레이아웃 소유 */
  maintainSurfaceHeight(): void;
  /** 월드 경계 안인가 (경계 좌표는 구현 소유 — AI가 수치를 갖지 않는다) */
  isWithinWorldBounds(x: number, z: number): boolean;
  isTargetAlive(targetEntityId: number): boolean;
  /** 표적의 현재 위치 — 관측 불가·소멸 시 null (탐지 판정 아님) */
  getTargetPosition(targetEntityId: number): { readonly x: number; readonly z: number } | null;
}

/** 스폰 1건에 대한 이동 포트를 만들어 주는 게임플레이 측 팩토리 */
export interface SurfaceShipMotionPortFactory {
  create(config: GuardShipAdapterConfig): SurfaceShipMotionPort | null;
}

/** 어댑터가 기존 AI에 넣어 줄 초기 설정 — 판단 로직 없음 */
export interface GuardShipAdapterConfig {
  /** 스폰되는 개체의 엔티티 id (조립부가 부여) */
  readonly entityId: number;
  readonly faction: FactionId;
  readonly spawnReason: GuardSpawnReason;
  /** 초기 표적 = 공격자 (플레이어) */
  readonly initialTargetEntityId: number;
  /** 초기 표적의 마지막 목격 위치 — 기존 AI의 notifyLastKnownPosition 입력 */
  readonly initialTargetPosition: IncidentPosition;
  readonly spawnPosition: GuardSpawnLocation;
  /** 표시용 identity 키 (문구·색 아님) */
  readonly displayLabelId: string;
}

/** 스폰 결과 — 내부 예외 문자열을 UI·이벤트로 전달하지 않는다 */
export type GuardSpawnOutcome =
  | 'spawned'
  | 'duplicateRequest'
  | 'invalidRequest'
  | 'noSpawnLocation'
  | 'spawnFailed';

/**
 * 경비함 생성 포트 — 게임플레이 또는 composition이 구현한다.
 * 예외를 밖으로 던지지 않고 위 결과 코드로만 보고한다.
 */
export interface GuardSpawnPort {
  spawnGuardShip(request: GuardShipRequestPayload): GuardSpawnOutcome;
}

/**
 * 범용 구축함 AI 인스턴스를 만들어 주는 포트.
 *
 * production 구현은 `core/destroyerAiFactory.createProductionDestroyerAIFactory`
 * 하나이며, 경비함·일반 적대 구축함이 **같은 구현체**를 받는다. 어댑터는
 * 이 포트가 준 인스턴스를 감싸기만 한다 — AI를 만들지 않는다.
 * 검증 더블은 테스트 전용이며 production factory로 쓰지 않는다.
 */
export interface DestroyerAIFactory {
  /** 이동 포트를 만들 수 없으면 `null` — 호출측이 spawnFailed로 보고한다 */
  create(config: GuardShipAdapterConfig): DestroyerAI | null;
}

/* ── B6 고가치 수송선·호위 (핵심 게이트와 분리) ─────────────── */

/**
 * B6 계약은 B1~B5 코드 경로에 **필수 의존을 만들지 않는다** — 핵심 게이트는
 * 이 타입들을 모른 채로 성립한다. 추적·탐지 상태 머신(C 범위)은 만들지 않는다.
 */

/** 고가치 수송선 원형 id — 보상 배율 참조 키 (배율 수치는 params 소유) */
export type HighValueTransportArchetypeId = 'highValueTransport';

export interface HighValueTransportView {
  readonly entityId: number;
  readonly archetypeId: HighValueTransportArchetypeId;
  /**
   * 보상 배율 **참조 키**. 실제 배율 값은 `params/economy.json`(기획·툴링)이
   * 소유하며 계약에 숫자를 넣지 않는다.
   */
  readonly rewardMultiplierRef: string;
}

/** 호위함 ↔ 수송선 결속 */
export interface EscortBinding {
  readonly escortEntityId: number;
  readonly escortedTransportId: number;
  /** 이탈 상한 거리(m) — 값의 소유는 params, 여기서는 전달만 한다 */
  readonly maximumEscortDistanceMeters: number;
}

/** `transportAttacked` 이벤트 페이로드 — 수송선이 유효 피격됐다 */
export interface TransportAttackedPayload {
  readonly transportEntityId: number;
  readonly attackerEntityId: number;
  readonly attackWorldPosition: IncidentPosition;
  readonly attackCorrelationId: string;
}

/** 호위 교전 진입 요청 — 판정은 게임플레이, 개체 제어는 기존 AI */
export interface EscortEngagementRequest {
  readonly requestId: string;
  readonly escortEntityId: number;
  readonly escortedTransportId: number;
  readonly targetEntityId: number;
  readonly incidentPosition: IncidentPosition;
  readonly correlationId: string;
}
