/**
 * 폭뢰 — 계약 `DepthChargeSystem` production 구현 (C4).
 *
 * ## lifecycle
 *
 * ```
 * 투하(drop) → 낙하(falling) → 신관 대기(fuse) → 폭발(detonated)
 *   → direct/near 판정 → DamageRequest → DamageReceiverPort.applyDamage
 *   → 제거(removed)
 * ```
 *
 * ## 규칙
 *
 *  - **신관 하한 3.0초** — 공식 `combat.json depthChargeFuseSeconds`를
 *    주입받고, 그보다 짧게 만들지 않는다(하한 미만 값이 오면 하한으로 올린다).
 *  - direct/near 판정은 **공식 전투 params로만** 계산한다. 반경·피해량이
 *    null이면 폭발 시각·상태 전이는 진행하되 **피해는 unwired**다 —
 *    연출만 있고 피해가 없는 상태를 정상 피해로 위장하지 않는다.
 *  - direct와 near를 **동시에 중복 적용하지 않는다** — 근접도 분류는
 *    폭발 1건당 하나이며, direct 반경 안이면 direct만이다.
 *  - 사거리 밖이면 피해 요청 자체를 만들지 않는다.
 *  - 모든 피해는 `DamageReceiverPort.applyDamage` **단일 창구**만 통과한다.
 *    이 시스템은 선체 상태를 갖지 않고 차감도 하지 않는다.
 *  - `damageEventId`는 폭발 1건마다 고유하고, `correlationId`는 그 폭뢰를
 *    낳은 공격 요청과 같다 — 중복 소비 차단의 두 키다.
 *
 * ## 이 파일에 없는 것
 *
 * AI 판단·탐지·소나·선체 체력·침수·압력 피해. 피해 이벤트를 AI가 직접
 * 만들지 않으며, 여기서도 체력을 깎지 않는다.
 */

import type {
  DamageReceiverPort,
  DamageRequest,
  DepthChargeDamageParams,
  SortieResettable,
} from '../../contracts/survival';
import type { DepthChargeSystem } from '../../contracts/systems';
import type { EventBus } from '../../core/EventBus';
import { depthChargeDamageWired } from './officialCombatParams';

/** 계약이 고정한 신관 하한 (초) — 인간 반응 사슬 근거, 더 짧게 만들지 않는다 */
export const DEPTH_CHARGE_FUSE_LOWER_BOUND_SECONDS = 3.0;

/** 폭뢰 1발의 진행 상태 */
export type DepthChargePhase = 'falling' | 'detonated' | 'removed';

/** 피해 대상 위치 단면 — 폭발 시점의 거리 판정 입력 */
export interface DepthChargeTargetView {
  readonly entityId: number;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
}

/** 폭뢰 투하 1건의 입력 (공격 포트가 만든다 — 이 시스템이 만들지 않는다) */
export interface DepthChargeDropRequest {
  readonly attackerEntityId: number;
  readonly targetEntityId: number;
  readonly worldX: number;
  /**
   * **목표 기폭 심도** — 공격 요청에 고정된 관측 표적의 y (INT-CORE-019).
   * 투하 후 표적을 재추적하지 않으며, 신관 만료 시 이 심도에서 기폭한다.
   */
  readonly worldY: number;
  readonly worldZ: number;
  /** 투하 시작 y (공격자 수면 고도) — 낙하 보간의 시작점. 판정에 쓰지 않는다 */
  readonly dropFromY: number;
  /** 이 폭뢰를 낳은 공격 요청의 상관 id */
  readonly correlationId: string;
}

/** 폭뢰 1발의 읽기 전용 상태 (렌더·검증 소비) */
export interface DepthChargeView {
  readonly chargeId: string;
  readonly phase: DepthChargePhase;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
  readonly fuseRemainingSeconds: number;
  readonly correlationId: string;
}

/** 폭발 1건의 결과 — 피해가 적용됐는지, 왜 아닌지 드러낸다 */
export type DepthChargeDetonationOutcome =
  | 'directDamage'
  | 'nearDamage'
  | 'outOfRange'
  /** 반경·피해량 미확정 — 폭발은 했으나 피해 없음 */
  | 'damageUnwired'
  | 'targetUnavailable';

interface ActiveCharge {
  readonly chargeId: string;
  readonly attackerEntityId: number;
  readonly targetEntityId: number;
  readonly worldX: number;
  /** 현재 y — 낙하 보간 값 (뷰 소비). 기폭 순간에는 targetDepthY와 같다 */
  worldY: number;
  readonly worldZ: number;
  /** 목표 기폭 심도 — 투하 요청에 고정된 관측 y (재추적 없음) */
  readonly targetDepthY: number;
  /** 투하 시작 y (공격자 수면 고도) */
  readonly dropFromY: number;
  readonly correlationId: string;
  fuseRemaining: number;
  phase: DepthChargePhase;
}

export class DepthChargeRunSystem implements DepthChargeSystem, SortieResettable {
  private readonly receiver: DamageReceiverPort;
  private readonly targets: () => readonly DepthChargeTargetView[];
  /** 공식 신관 시간 (초) — 주입값이며 하한 미만으로 내려가지 않는다 */
  private fuseSeconds: number;
  private damageParams: DepthChargeDamageParams | null;
  /** 동시 폭뢰 상한 — 공식 `simultaneousDepthCharges`. null이면 제한 없음 */
  private simultaneousLimit: number | null;

  private charges: ActiveCharge[] = [];
  private nextSequence = 1;
  private elapsedSeconds = 0;
  private lastOutcomeValue: DepthChargeDetonationOutcome | null = null;
  /** 이미 피해를 적용한 폭발 상관 id — 중복 피해 차단 */
  private readonly damagedCorrelations = new Set<string>();

  /**
   * 사운드·연출용 lifecycle 이벤트 버스 (선택 주입).
   *
   * 미주입이면 아무것도 발행하지 않는다 — 결정적 검증은 버스 없이도 돌고,
   * production 조립부만 연결한다. **판정은 이 버스에 의존하지 않는다**:
   * 이벤트는 이미 확정된 상태 전이를 알리기만 하며, 구독자가 없거나
   * 예외를 던져도 폭뢰 판정은 그대로 진행된다.
   */
  private bus: EventBus | null = null;
  /**
   * 이벤트 payload용 숫자 id. 계약(`events.ts`)이 `id: number`를 요구하는데
   * 내부 `chargeId`는 문자열이라 별도로 센다 — 문자열을 파싱해 숫자를
   * 만들어내지 않는다(형식이 바뀌면 조용히 깨진다).
   */
  private nextEventId = 1;
  /** 이 폭뢰가 이미 입수/폭발을 알렸는가 — 정확히 1회 보장 */
  private readonly eventIds = new Map<string, number>();
  private readonly explodedAnnounced = new Set<string>();

  constructor(
    receiver: DamageReceiverPort,
    targets: () => readonly DepthChargeTargetView[],
    fuseSeconds: number = DEPTH_CHARGE_FUSE_LOWER_BOUND_SECONDS,
    damageParams: DepthChargeDamageParams | null = null,
    simultaneousLimit: number | null = null,
  ) {
    this.receiver = receiver;
    this.targets = targets;
    this.fuseSeconds = clampFuse(fuseSeconds);
    this.damageParams = damageParams;
    this.simultaneousLimit = simultaneousLimit;
  }

  /**
   * lifecycle 이벤트 버스 연결 (조립부).
   *
   * 입수 1회·폭발 1회만 발행한다. 취소·제거·출항 리셋은 발행 경로가 아니다 —
   * 물에 들어가지 않은 폭뢰의 입수음이나, 터지지 않은 폭뢰의 폭발음이
   * 나면 '풍덩→3초→폭발' 리듬 자체가 거짓이 된다.
   */
  attachEventBus(bus: EventBus | null): void {
    this.bus = bus;
  }

  /** 구독자 예외가 폭뢰 판정을 멈추지 않게 격리한다 */
  private emitSafely(emit: (bus: EventBus) => void): void {
    if (!this.bus) return;
    try {
      emit(this.bus);
    } catch (error) {
      console.error('[DepthChargeRun] lifecycle 이벤트 구독자 예외 — 판정은 계속됩니다.', error);
    }
  }

  /** 공식 전투 params 주입 (조립부) — 신관·동시 상한·피해 수치 */
  attachCombatParams(options: {
    readonly fuseSeconds?: number;
    readonly simultaneousLimit?: number | null;
    readonly damageParams?: DepthChargeDamageParams | null;
  }): void {
    if (options.fuseSeconds !== undefined) this.fuseSeconds = clampFuse(options.fuseSeconds);
    if (options.simultaneousLimit !== undefined) this.simultaneousLimit = options.simultaneousLimit;
    if (options.damageParams !== undefined) this.damageParams = options.damageParams;
  }

  /** 피해 판정이 구동 가능한가 — false면 폭발해도 피해가 없다 */
  get damageWired(): boolean {
    return depthChargeDamageWired(this.damageParams);
  }

  /** 적용 중인 신관 시간 (초) — 항상 하한 이상 */
  get fuseSecondsInUse(): number {
    return this.fuseSeconds;
  }

  /** 계약 `DepthChargeSystem` — 현재 수중 폭뢰 수 */
  get activeCount(): number {
    return this.charges.filter((charge) => charge.phase === 'falling').length;
  }

  /** 폭뢰 읽기 전용 목록 (렌더·검증) */
  get charges_(): readonly DepthChargeView[] {
    return this.charges.map((charge) => ({
      chargeId: charge.chargeId,
      phase: charge.phase,
      worldX: charge.worldX,
      worldY: charge.worldY,
      worldZ: charge.worldZ,
      fuseRemainingSeconds: charge.fuseRemaining,
      correlationId: charge.correlationId,
    }));
  }

  get lastDetonationOutcome(): DepthChargeDetonationOutcome | null {
    return this.lastOutcomeValue;
  }

  /**
   * 투하 — 신관 타이머가 시작된다. **투하 순간에는 피해가 없다.**
   * 동시 상한을 넘으면 투하하지 않는다(공식 `simultaneousDepthCharges`).
   */
  drop(request: DepthChargeDropRequest): DepthChargeView | null {
    if (
      !Number.isFinite(request.worldX) ||
      !Number.isFinite(request.worldZ) ||
      !Number.isFinite(request.worldY) ||
      !Number.isFinite(request.dropFromY)
    ) {
      return null;
    }
    if (this.simultaneousLimit !== null && this.activeCount >= this.simultaneousLimit) return null;

    const charge: ActiveCharge = {
      chargeId: `depthCharge:${request.correlationId}:${this.nextSequence}`,
      attackerEntityId: request.attackerEntityId,
      targetEntityId: request.targetEntityId,
      worldX: request.worldX,
      worldY: request.dropFromY, // 낙하 시작점 — 신관 만료 시 targetDepthY 도달
      worldZ: request.worldZ,
      targetDepthY: request.worldY,
      dropFromY: request.dropFromY,
      correlationId: request.correlationId,
      fuseRemaining: this.fuseSeconds,
      phase: 'falling',
    };
    this.nextSequence += 1;
    this.charges.push(charge);

    // 입수 = 투하가 실제로 성립한 순간. 위 조기 반환(좌표 비유한·동시 상한
    // 초과)은 물에 들어가지 않았으므로 여기까지 오지 않는다 = 발행 0회.
    const eventId = this.nextEventId;
    this.nextEventId += 1;
    this.eventIds.set(charge.chargeId, eventId);
    this.emitSafely((bus) =>
      bus.emit('depthChargeEnteredWater', {
        id: eventId,
        x: charge.worldX,
        z: charge.worldZ,
        // 사운드가 '풍덩→폭발' 간격을 예약할 수 있도록 실제 적용 신관을 싣는다.
        fuseSeconds: this.fuseSeconds,
      }),
    );

    return this.charges_[this.charges.length - 1] ?? null;
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    if (this.charges.length === 0) return;
    this.elapsedSeconds += deltaSeconds;

    const survivors: ActiveCharge[] = [];
    for (const charge of this.charges) {
      if (charge.phase !== 'falling') continue; // 폭발분은 같은 프레임에 제거된다
      charge.fuseRemaining -= deltaSeconds;
      // 신관 이전에는 어떤 피해도 없다 — 상태만 진행한다.
      if (charge.fuseRemaining > 0) {
        // 낙하 — 투하 요청에 고정된 목표 심도까지 신관 시간 동안 선형 강하
        // (INT-CORE-019). 별도 낙하 속도 상수를 만들지 않는다: 시작·목표
        // 심도와 공식 신관 시간에서 파생된 보간이며, 현재 플레이어 위치를
        // 추적·유도하지 않는다.
        const progress = 1 - charge.fuseRemaining / this.fuseSeconds;
        charge.worldY = charge.dropFromY + (charge.targetDepthY - charge.dropFromY) * progress;
        survivors.push(charge);
        continue;
      }
      // 기폭은 정확히 목표 심도에서 — 판정 위치의 정본이다.
      charge.worldY = charge.targetDepthY;
      charge.phase = 'detonated';
      this.detonate(charge);
      charge.phase = 'removed';

      // 폭발 = 신관 만료로 실제 기폭한 경우에만. 같은 폭뢰가 두 번 세어지지
      // 않도록 기록으로 막는다(update가 어떤 순서로 불려도 1회).
      if (!this.explodedAnnounced.has(charge.chargeId)) {
        this.explodedAnnounced.add(charge.chargeId);
        const eventId = this.eventIds.get(charge.chargeId);
        // id를 모르는 폭뢰는 drop()을 거치지 않았다는 뜻이라 발행하지 않는다.
        if (eventId !== undefined) {
          this.emitSafely((bus) =>
            bus.emit('depthChargeExploded', { id: eventId, x: charge.worldX, z: charge.worldZ }),
          );
        }
      }
    }
    this.charges = survivors;
  }

  /**
   * 폭발 판정 — 거리로 direct/near를 **하나만** 고르고 피해를 1회 요청한다.
   * 피해 적용은 전적으로 `DamageReceiverPort`가 한다.
   */
  private detonate(charge: ActiveCharge): DepthChargeDetonationOutcome {
    const target = this.targets().find(
      (candidate) => candidate.entityId === charge.targetEntityId,
    );
    if (!target) return this.record('targetUnavailable');

    const params = this.damageParams;
    if (!depthChargeDamageWired(params)) return this.record('damageUnwired');
    const directRadius = params?.directRadiusMeters as number;
    const nearRadius = params?.nearRadiusMeters as number;

    const distance = Math.hypot(
      target.positionX - charge.worldX,
      target.positionY - charge.worldY,
      target.positionZ - charge.worldZ,
    );
    // direct 우선 — direct 반경 안이면 near를 **추가로** 적용하지 않는다.
    const proximity = distance <= directRadius ? 'direct' : distance <= nearRadius ? 'near' : null;
    if (proximity === null) return this.record('outOfRange');

    // 같은 폭발(상관 id)의 중복 피해 차단 — 수신측 중복 방지와 이중 방어다.
    if (this.damagedCorrelations.has(charge.correlationId)) {
      return this.record(proximity === 'direct' ? 'directDamage' : 'nearDamage');
    }
    this.damagedCorrelations.add(charge.correlationId);

    const rawDamage =
      proximity === 'direct'
        ? (params?.directDamage as number)
        : (params?.nearDamage as number);
    // 침수 기여량 — 공식 params 소유 (C9 v0.1.1). null = 침수만 unwired:
    // 피해는 정상 적용하되 기여 0·causesFlooding false (boolean으로 양을
    // 추측하지 않는다). miss는 여기 도달하지 않으므로 기여 자체가 없다.
    const floodingContribution =
      proximity === 'direct'
        ? (params?.directFloodingContribution ?? null)
        : (params?.nearFloodingContribution ?? null);
    const request: DamageRequest = {
      damageEventId: `${charge.chargeId}:damage`,
      targetEntityId: charge.targetEntityId,
      attackerEntityId: charge.attackerEntityId,
      sourceType: 'enemyWeapon',
      rawDamage,
      worldPosition: { x: charge.worldX, y: charge.worldY, z: charge.worldZ },
      occurredAt: this.elapsedSeconds,
      correlationId: charge.correlationId,
      causesFlooding: floodingContribution !== null && floodingContribution > 0,
      floodingContribution: floodingContribution ?? 0,
      proximity,
    };
    this.receiver.applyDamage(request);
    return this.record(proximity === 'direct' ? 'directDamage' : 'nearDamage');
  }

  private record(outcome: DepthChargeDetonationOutcome): DepthChargeDetonationOutcome {
    this.lastOutcomeValue = outcome;
    return outcome;
  }

  /** 출항 한정 상태 — 수중 폭뢰·중복 기록 전부 초기화 */
  resetForNewSortie(): void {
    // 낙하 중이던 폭뢰는 여기서 사라진다 — **폭발이 아니라 제거**이므로
    // depthChargeExploded를 발행하지 않는다.
    this.charges = [];
    this.damagedCorrelations.clear();
    this.lastOutcomeValue = null;
    this.elapsedSeconds = 0;
    this.eventIds.clear();
    this.explodedAnnounced.clear();
  }

  dispose(): void {
    this.resetForNewSortie();
  }
}

/** 신관 하한 고정 — 공식 값이 하한보다 짧아도 하한을 지킨다 */
function clampFuse(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEPTH_CHARGE_FUSE_LOWER_BOUND_SECONDS;
  return Math.max(DEPTH_CHARGE_FUSE_LOWER_BOUND_SECONDS, seconds);
}
