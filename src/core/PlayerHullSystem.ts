/**
 * 플레이어 선체 공용 코어 (INT-CORE-014, C5) — 피해 수신의 **단일 창구**.
 *
 * 책임(리드 공용 경계):
 *  - 현재·최대 선체 보관, `hullIntegrity` 업그레이드 보정 소비
 *  - `DamageReceiverPort` 구현 — 검증 → 중복 방지 → 차감 → 상태 전이 →
 *    파괴 판정을 **한 트랜잭션 경계** 안에서 수행 (예외 무전파)
 *  - `damageEventId`·`correlationId` 중복 1회 보장
 *  - `survivalState` 계산, 파괴 전이 **1회만**(`playerDestroyed` 1회 발행)
 *  - 읽기 전용 스냅샷·생존 HUD 모델 제공, 출항 초기화, dispose
 *
 * 여기에 없는 것: 피해 **source**(폭뢰·충돌·압력 판정은 게임플레이 소유) ·
 * 수리 · 이동 성능 저하 · 연출 · 수치.
 *
 * ## 수치 미주입(unwired) 규칙
 *
 * 선체 기준값(`HullBaseParams`)은 **공식 params에 아직 없다**(upgrades.json의
 * hullIntegrity는 배율만 승인, `paramRef` 없음 — C9 [COMBAT] 이관 대상).
 * 주입 전에는:
 *  - 모든 피해가 `unwired`로 거부된다 (상태 변경 0)
 *  - `PlayerHullState.unwired = true` — UI에 정상 선체로 위장하지 않는다
 *  - 임시 최대치·임시 피해값을 만들지 않는다
 */

import type {
  DamageApplyResult,
  DamageReceiverPort,
  DamageRequest,
  DamageSourceType,
  HullBaseParams,
  HullUpgradeConsumer,
  PlayerAliveSource,
  PlayerHullState,
  SortieFailureReason,
  SortieResettable,
  SurvivalReadModel,
  SurvivalState,
  SurvivalWarningId,
} from '../contracts/survival';
import { effectiveValue } from '../meta/upgradeMath';
import type { FloodingCore } from './FloodingCore';
import type { EventBus } from './EventBus';
import type { GameSystem, SystemContext } from './GameSystem';

/** 침수가 유발한 지속 피해의 출처 태그 (공격자 없음) */
const FLOODING_DAMAGE_SOURCE: DamageSourceType = 'environment';

export class PlayerHullSystem
  implements GameSystem, DamageReceiverPort, HullUpgradeConsumer, PlayerAliveSource, SortieResettable
{
  readonly id = 'playerHull';

  private readonly entityId: number;
  private readonly flooding: FloodingCore;
  private base: HullBaseParams | null;
  private hullModifierSum = 0;

  private maxHullValue = 0;
  private currentHullValue = 0;
  private destroyed = false;
  private failurePending = false;
  private lastSource: DamageSourceType | null = null;
  private lastAmount = 0;
  private lastAt: number | null = null;
  private lastHitDirectionValue: { x: number; z: number } | null = null;
  private damageFlash = false;

  /** 중복 방지 원장 — 이벤트 id·상관 id 공용 단일 저장소 (출항 경계 리셋) */
  private readonly appliedEventIds = new Set<string>();
  private readonly appliedCorrelationIds = new Set<string>();
  /** 침수 tick id 카운터 — 출항 내 단조 증가, 출항 경계 리셋 */
  private floodTickCounter = 0;

  private bus: EventBus | null = null;

  constructor(entityId: number, flooding: FloodingCore, base: HullBaseParams | null = null) {
    this.entityId = entityId;
    this.flooding = flooding;
    this.base = base;
    this.recomputeMaxHull(true);
  }

  /** 공식 선체 수치 주입 (C9 [COMBAT] 이관 후) — 미주입이면 unwired 유지 */
  attachHullParams(base: HullBaseParams | null): void {
    this.base = base;
    this.recomputeMaxHull(true);
  }

  get wired(): boolean {
    return this.base !== null;
  }

  /** `hullIntegrity` 보정 합 소비 — 최종 최대치 = 기준값 × (1 + 보정 합) */
  applyHullIntegrityModifier(modifierSum: number): void {
    this.hullModifierSum = Number.isFinite(modifierSum) && modifierSum > 0 ? modifierSum : 0;
    // 정책 확정 [INT-CORE-015]: 구매 순간에는 진행 중 출항의 currentHull을
    // 회복시키지 않는다 — 최대치만 갱신하고 현재치는 상한 클램프만. 효과는
    // 다음 출항 초기화(resetForNewSortie)에서 currentHull=maxHull로 반영된다.
    // 기지까지 이어지는 영구 손상·수리비·수리 시간은 후속 스프린트 이관.
    this.recomputeMaxHull(false);
  }

  get isPlayerAlive(): boolean {
    return !this.destroyed;
  }

  snapshot(): PlayerHullState {
    const wired = this.base !== null;
    return {
      currentHull: this.currentHullValue,
      maxHull: this.maxHullValue,
      hullRatio: wired && this.maxHullValue > 0 ? this.currentHullValue / this.maxHullValue : null,
      floodingLevel: this.flooding.level,
      floodingRate: this.flooding.ratePerSecond,
      survivalState: this.survivalState(),
      isDestroyed: this.destroyed,
      lastDamageSource: this.lastSource,
      lastDamageAmount: this.lastAmount,
      lastDamageAt: this.lastAt,
      recoverable: !this.destroyed,
      sortieFailurePending: this.failurePending,
      unwired: !wired,
    };
  }

  /** 그래픽스 HUD 소비 모델 — 내부 객체를 노출하지 않는다 */
  survivalReadModel(): SurvivalReadModel {
    const state = this.snapshot();
    return {
      currentHull: state.currentHull,
      maxHull: state.maxHull,
      hullRatio: state.hullRatio,
      floodingLevel: state.floodingLevel,
      survivalState: state.survivalState,
      lastHitDirection: this.lastHitDirectionValue,
      damageFlashRequested: this.damageFlash,
      warningIds: this.warnings(state.survivalState),
      // 실패 카운트다운은 도입 결정이 없다 — 항상 null (스텁 금지)
      failureCountdown: null,
      isDestroyed: state.isDestroyed,
    };
  }

  /** 렌더가 플래시를 소비한 뒤 해제한다 (상태를 쓰는 유일한 예외 — 표시 전용) */
  consumeDamageFlash(): void {
    this.damageFlash = false;
  }

  /**
   * 피해 적용 — 검증·중복 방지·차감·전이·파괴 판정 한 트랜잭션.
   * 예외를 던지지 않고 결과 코드로만 보고한다.
   */
  applyDamage(request: DamageRequest): DamageApplyResult {
    if (this.base === null) return this.result('unwired', 0);
    if (request.targetEntityId !== this.entityId) return this.result('targetNotFound', 0);
    if (!isValidDamage(request.rawDamage)) return this.result('invalidDamage', 0);
    if (!request.damageEventId || !request.correlationId) return this.result('invalidDamage', 0);
    // 파괴 이후 반복 피해 금지 — 중복 원장보다 먼저 본다.
    if (this.destroyed) return this.result('ignoredDestroyed', 0);
    if (this.appliedEventIds.has(request.damageEventId)) return this.result('ignoredDuplicate', 0);
    if (this.appliedCorrelationIds.has(request.correlationId)) {
      return this.result('ignoredDuplicate', 0);
    }

    this.appliedEventIds.add(request.damageEventId);
    this.appliedCorrelationIds.add(request.correlationId);

    const applied = Math.min(request.rawDamage, this.currentHullValue);
    this.currentHullValue = Math.max(0, this.currentHullValue - applied);
    this.lastSource = request.sourceType;
    this.lastAmount = applied;
    this.lastAt = request.occurredAt;
    this.damageFlash = true;
    this.lastHitDirectionValue = null;

    if (request.causesFlooding) this.flooding.addContribution(request.floodingContribution);

    this.bus?.emit('hullDamaged', {
      amount: applied,
      hullRemaining: this.maxHullValue > 0 ? this.currentHullValue / this.maxHullValue : 0,
      // 폭뢰 근접도 분류 — 폭뢰가 아닌 출처는 직격으로 보고한다.
      cause: request.proximity ?? 'direct',
    });
    this.emitFlooding();

    if (this.currentHullValue <= 0) {
      this.enterDestroyed(request);
      return this.result('destroyed', applied);
    }
    return this.result('applied', applied);
  }

  initialize(context: SystemContext): void {
    this.bus = context.bus;
  }

  /**
   * 침수 지속 피해 — FloodingCore가 계산한 피해도 선체를 직접 깎지 않고
   * **같은 단일 창구(`applyDamage`)를 통과한다** [INT-CORE-015].
   *
   * 중복 원장 규칙 (정상 tick vs 실제 중복의 구분):
   *  - tick별 `damageEventId` = `flood:<출항 내 단조 증가 카운터>` — 매 tick
   *    새 id이므로 정상적인 후속 tick은 원장에 막히지 않는다.
   *  - `correlationId`도 같은 tick id를 쓴다 — 침수 tick 1회 = 독립된 피해
   *    적용 1회이며, '같은 공격의 중복'이 아니다.
   *  - 실제 중복(같은 tick id의 재적용)만 원장이 차단한다.
   */
  update(deltaSeconds: number): void {
    if (this.base === null || this.destroyed) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

    const floodDamage = this.flooding.update(deltaSeconds);
    if (floodDamage <= 0) return;

    this.floodTickCounter += 1;
    const tickId = `flood:${this.floodTickCounter}`;
    const flashBefore = this.damageFlash;
    this.applyDamage({
      damageEventId: tickId,
      targetEntityId: this.entityId,
      attackerEntityId: null,
      sourceType: FLOODING_DAMAGE_SOURCE,
      rawDamage: floodDamage,
      // 침수는 위치 없는 내부 피해 — 좌표는 의미를 갖지 않는다.
      worldPosition: { x: 0, y: 0, z: 0 },
      occurredAt: this.floodTickCounter,
      correlationId: tickId,
      causesFlooding: false,
      floodingContribution: 0,
      // 기존 hullDamaged 계약 형태 유지 — 간접(near) 피해로 보고한다.
      proximity: 'near',
    });
    // 지속 피해는 피격 플래시를 만들지 않는다 (연속 점멸 방지).
    this.damageFlash = flashBefore;
  }

  /** 출항 한정 상태 초기화 — 지갑·업그레이드·loadout은 건드리지 않는다 */
  resetForNewSortie(): void {
    this.destroyed = false;
    this.failurePending = false;
    this.lastSource = null;
    this.lastAmount = 0;
    this.lastAt = null;
    this.lastHitDirectionValue = null;
    this.damageFlash = false;
    this.appliedEventIds.clear();
    this.appliedCorrelationIds.clear();
    this.floodTickCounter = 0;
    this.flooding.resetForNewSortie();
    // 정책 확정 [INT-CORE-015]: 선체 손상·침수는 출항 단위 상태 — 새 출항
    // 시작 시 업그레이드 반영 maxHull 재계산 + currentHull = maxHull.
    this.recomputeMaxHull(true);
  }

  /** 실패 정산이 끝났음을 코디네이터가 표시한다 (중복 실패 방지 보조) */
  markFailureSettled(): void {
    this.failurePending = false;
  }

  dispose(): void {
    this.appliedEventIds.clear();
    this.appliedCorrelationIds.clear();
    this.bus = null;
  }

  private enterDestroyed(request: DamageRequest | null): void {
    if (this.destroyed) return; // 파괴 전이는 1회만
    this.destroyed = true;
    this.failurePending = true;
    const reason: SortieFailureReason =
      request?.sourceType === 'pressure' ? 'pressureCollapse' : 'hullDestroyed';
    this.bus?.emit('playerDestroyed', {
      reason,
      destroyedByEntityId: request?.attackerEntityId ?? null,
      damageSource: request?.sourceType ?? FLOODING_DAMAGE_SOURCE,
      worldPosition: request?.worldPosition ?? { x: 0, y: 0, z: 0 },
    });
  }

  private emitFlooding(): void {
    const snapshot = this.flooding.snapshot();
    // 구획 개념은 도입되지 않았다 — 단일 선체를 뜻하는 고정 키를 쓴다.
    this.bus?.emit('floodingChanged', { compartment: 'hull', severity: snapshot.level });
  }

  private recomputeMaxHull(resetCurrent: boolean): void {
    if (this.base === null) {
      this.maxHullValue = 0;
      this.currentHullValue = 0;
      return;
    }
    // 합연산 정본 함수 사용 — 자체 수식 복제 금지 (meta/upgradeMath).
    this.maxHullValue = effectiveValue(this.base.baseMaxHull, this.hullModifierSum);
    if (resetCurrent) this.currentHullValue = this.maxHullValue;
    else this.currentHullValue = Math.min(this.currentHullValue, this.maxHullValue);
  }

  private survivalState(): SurvivalState {
    if (this.destroyed) return 'destroyed';
    const base = this.base;
    if (!base || this.maxHullValue <= 0) return 'stable';
    const ratio = this.currentHullValue / this.maxHullValue;
    if (ratio <= base.criticalRatioThreshold) return 'critical';
    if (ratio <= base.damagedRatioThreshold) return 'damaged';
    return 'stable';
  }

  private warnings(state: SurvivalState): readonly SurvivalWarningId[] {
    const ids: SurvivalWarningId[] = [];
    if (state === 'damaged') ids.push('hull.damaged');
    if (state === 'critical' || state === 'destroyed') ids.push('hull.critical');
    const stage = this.flooding.stage;
    if (stage === 'minor') ids.push('flooding.minor');
    if (stage === 'major') ids.push('flooding.major');
    if (stage === 'catastrophic') ids.push('flooding.catastrophic');
    return ids;
  }

  private result(
    outcome: DamageApplyResult['outcome'],
    appliedDamage: number,
  ): DamageApplyResult {
    return { outcome, appliedDamage, hull: this.snapshot() };
  }
}

function isValidDamage(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
