/**
 * 고가치 수송선·호위 gameplay — B6 (핵심 게이트 B1~B5와 **독립**).
 *
 * ## 독립성
 *
 * B1~B5 경로(배치·식별·보상·중립 사건·경비 스폰)는 이 파일을 import하지
 * 않는다. 이 시스템을 조립에서 빼도 핵심 게이트는 그대로 동작한다.
 *
 * ## 보상 배율 — 숫자를 만들지 않는다
 *
 * 계약이 주는 것은 배율 **참조 키**(`rewardMultiplierRef`)뿐이고, 실제
 * 배율 값은 `params/economy.json`이 소유한다. 공식 배율 항목이 **아직
 * 없으므로** 이 시스템은 배율을 `null`로 노출하고 보상을 바꾸지 않는다 —
 * 임의 배율(2배 등)을 대입하지 않는다. 공식 항목이 도착하면
 * `attachRewardMultipliers`로 주입되며 소비 코드는 바뀌지 않는다
 * (요청: INT-GAME-012).
 *
 * ## 호위 — 결속·요청·범용 AI 변환까지
 *
 * 이 시스템이 하는 일은 계약 범위까지다:
 *  - 수송선 ↔ 호위함 결속(`EscortBinding`) 보관·조회
 *  - 수송선 유효 피격 시 `transportAttacked` 발행
 *  - 이탈 상한 거리(`maximumEscortDistanceMeters`)를 넘지 않는 호위에 대해
 *    교전 요청(`EscortEngagementRequest`) 생성
 *  - 그 요청을 **경비함과 같은 범용** 구축함 AI 팩토리 입력으로 변환
 *    (`escortEngagementToAdapterConfig`) — 호위 전용 AI를 만들지 않는다
 *
 * **실기동은 미완료다.** 변환 어댑터는 준비됐지만 월드에 호위함 개체가
 * 배치돼 있지 않고(공식 배치표 없음), 이탈 상한 거리도 공식 값이 없어
 * `bindEscortFromOfficial`이 결속을 만들지 않는다 — 임의 배치·거리를
 * 발명하지 않는다. 탐지·추적 상태 머신도 만들지 않는다(스프린트 C 범위).
 */

import type { FactionId } from '../../contracts/faction';
import type {
  EscortBinding,
  EscortEngagementRequest,
  GuardShipAdapterConfig,
  GuardSpawnLocation,
  HighValueTransportArchetypeId,
  HighValueTransportView,
  IncidentPosition,
} from '../../contracts/guard';
import type { EventBus } from '../../core/EventBus';

/** 공식 고가치 원형 id — 계약 정본을 그대로 쓴다 (별칭 금지) */
export const HIGH_VALUE_TRANSPORT_ARCHETYPE: HighValueTransportArchetypeId =
  'highValueTransport';

/**
 * 보상 배율 참조 키 — 값이 아니라 **키**다. 실제 배율은 params 소유이며
 * 이 상수는 조회 경로를 고정하기 위한 식별자다.
 */
export const HIGH_VALUE_REWARD_MULTIPLIER_REF = 'economy.highValueTransportRewardMultiplier';

/** 공식 배율 표 (params 파생) — 키 → 배율. 미주입이면 배율 없음 */
export type RewardMultiplierTable = Readonly<Record<string, number>>;

/** 호위 위치 단면 — 이탈 거리 판정 입력 */
export interface EscortPositionView {
  readonly id: number;
  readonly positionX: number;
  readonly positionZ: number;
}

export class HighValueTransportSystem {
  private readonly bus: EventBus;
  private readonly transports = new Map<number, HighValueTransportView>();
  private readonly bindings: EscortBinding[] = [];
  private multipliers: RewardMultiplierTable | null = null;
  private readonly requestedAttacks = new Set<string>();
  private nextRequestSequence = 1;
  /** 공식 이탈 상한 거리 — 공식 항목 미도착이라 production에서는 null */
  private escortDistance: number | null = null;

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  /** 공식 보상 배율 표 주입 (조립부 — 공식 항목 도착 시) */
  attachRewardMultipliers(multipliers: RewardMultiplierTable | null): void {
    this.multipliers = multipliers;
  }

  get rewardMultipliersWired(): boolean {
    return this.multipliers !== null;
  }

  /**
   * 고가치 수송선 등록. 배율 참조 키만 보관하며 보상 계산은 하지 않는다.
   */
  registerTransport(entityId: number): HighValueTransportView {
    const view: HighValueTransportView = {
      entityId,
      archetypeId: HIGH_VALUE_TRANSPORT_ARCHETYPE,
      rewardMultiplierRef: HIGH_VALUE_REWARD_MULTIPLIER_REF,
    };
    this.transports.set(entityId, view);
    return view;
  }

  get highValueTransports(): readonly HighValueTransportView[] {
    return [...this.transports.values()];
  }

  /**
   * 참조 키로 공식 배율 조회 — **공식 값이 없으면 null**.
   * null을 1이나 임의 배율로 바꾸지 않는다 (호출측이 배율 없음으로 처리).
   */
  rewardMultiplierFor(transportEntityId: number): number | null {
    const view = this.transports.get(transportEntityId);
    if (!view || !this.multipliers) return null;
    const value = this.multipliers[view.rewardMultiplierRef];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  }

  /**
   * 호위함 ↔ 수송선 결속. 이탈 상한 거리는 **전달만** 한다 (값 소유는 params).
   * 같은 호위함의 재결속은 덮어쓴다 — 호위함 1척은 수송선 1척만 호위한다.
   */
  bindEscort(binding: EscortBinding): void {
    const existing = this.bindings.findIndex(
      (candidate) => candidate.escortEntityId === binding.escortEntityId,
    );
    if (existing >= 0) this.bindings.splice(existing, 1);
    this.bindings.push(binding);
  }

  get escortBindings(): readonly EscortBinding[] {
    return this.bindings;
  }

  escortsOf(transportEntityId: number): readonly EscortBinding[] {
    return this.bindings.filter((binding) => binding.escortedTransportId === transportEntityId);
  }

  /**
   * 수송선 **유효 피격** 보고 — `transportAttacked` 1회 발행 후 호위 교전
   * 요청 목록을 반환한다. 같은 `attackCorrelationId`의 두 번째 보고는
   * 무시한다(중복 요청 금지 — 경비 원장과 같은 원칙, 별도 표를 만들지 않고
   * 이 시스템 자신의 사건만 기록한다).
   *
   * 등록되지 않은 수송선이면 아무 일도 하지 않는다.
   */
  reportTransportAttacked(
    transportEntityId: number,
    attackerEntityId: number,
    attackWorldPosition: IncidentPosition,
    attackCorrelationId: string,
  ): readonly EscortEngagementRequest[] {
    if (!this.transports.has(transportEntityId)) return [];
    if (this.requestedAttacks.has(attackCorrelationId)) return [];
    this.requestedAttacks.add(attackCorrelationId);

    this.bus.emit('transportAttacked', {
      transportEntityId,
      attackerEntityId,
      attackWorldPosition,
      attackCorrelationId,
    });

    return this.escortsOf(transportEntityId).map((binding) => {
      const request: EscortEngagementRequest = {
        requestId: `escort:${attackCorrelationId}:${this.nextRequestSequence}`,
        escortEntityId: binding.escortEntityId,
        escortedTransportId: binding.escortedTransportId,
        targetEntityId: attackerEntityId,
        incidentPosition: attackWorldPosition,
        correlationId: attackCorrelationId,
      };
      this.nextRequestSequence += 1;
      return request;
    });
  }

  /**
   * 이탈 상한 거리 안에 있는 호위만 남긴다 — `maximumEscortDistanceMeters`
   * 소비 지점. 거리 값은 결속이 들고 있고 이 함수는 비교만 한다.
   */
  escortsWithinRange(
    transportEntityId: number,
    transportPosition: EscortPositionView,
    escortPositions: readonly EscortPositionView[],
  ): readonly EscortBinding[] {
    return this.escortsOf(transportEntityId).filter((binding) => {
      const escort = escortPositions.find(
        (candidate) => candidate.id === binding.escortEntityId,
      );
      if (!escort) return false;
      const distance = Math.hypot(
        escort.positionX - transportPosition.positionX,
        escort.positionZ - transportPosition.positionZ,
      );
      return distance <= binding.maximumEscortDistanceMeters;
    });
  }

  /* ── 공식 이탈 거리 (없으면 결속 자체를 활성화하지 않는다) ────────── */

  /**
   * 공식 이탈 상한 거리 주입 (조립부). 공식 항목이 **아직 없으므로**
   * production에서는 null이며, 그동안 `bindEscortFromOfficial`은 결속을
   * 만들지 않는다 — 임의 거리를 발명하지 않는다.
   */
  attachEscortDistanceMeters(meters: number | null): void {
    this.escortDistance =
      typeof meters === 'number' && Number.isFinite(meters) && meters > 0 ? meters : null;
  }

  get escortDistanceWired(): boolean {
    return this.escortDistance !== null;
  }

  /**
   * 공식 거리로 결속 — 공식 값이 없으면 **false**(결속 없음).
   * 거리 값을 여기서 만들지 않는다.
   */
  bindEscortFromOfficial(escortEntityId: number, escortedTransportId: number): boolean {
    if (this.escortDistance === null) return false;
    this.bindEscort({
      escortEntityId,
      escortedTransportId,
      maximumEscortDistanceMeters: this.escortDistance,
    });
    return true;
  }

  /** 새 출항 초기화 — 사건 기록만 비운다(결속·등록은 배치가 소유) */
  resetForNewSortie(): void {
    this.requestedAttacks.clear();
  }
}

/**
 * 호위 교전 요청 → **범용** 구축함 AI 팩토리 입력 변환 (B6 어댑터).
 *
 * 경비함과 **같은** `DestroyerAIFactory`·`SurfaceShipMotionPortFactory`
 * 경로를 재사용하기 위한 형태 변환일 뿐이다 — 호위 전용 AI를 만들지 않는다.
 * 공격자가 그대로 초기 표적이 되고, 사건 지점이 마지막 확인 위치가 된다.
 *
 * 세력·엔티티 id·스폰 위치·라벨 키는 **호출측(월드에 실재하는 호위함)**이
 * 준다 — 이 함수가 세력이나 좌표를 만들어 내지 않는다. 월드에 호위함
 * 개체가 없으면 변환할 대상 자체가 없다(B6 실기동 미완료 사유).
 */
export function escortEngagementToAdapterConfig(
  request: EscortEngagementRequest,
  escort: {
    readonly entityId: number;
    readonly faction: FactionId;
    readonly spawnPosition: GuardSpawnLocation;
    readonly displayLabelId: string;
  },
): GuardShipAdapterConfig {
  return {
    entityId: escort.entityId,
    faction: escort.faction,
    // 스폰 사유 어휘는 계약이 고정한 값만 쓴다 — 임의 문자열을 만들지 않는다.
    spawnReason: 'neutralAttack',
    initialTargetEntityId: request.targetEntityId,
    initialTargetPosition: request.incidentPosition,
    spawnPosition: escort.spawnPosition,
    displayLabelId: escort.displayLabelId,
  };
}
