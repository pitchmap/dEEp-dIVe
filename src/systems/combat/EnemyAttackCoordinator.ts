/**
 * 적 공격 경계 — 계약 `EnemyAttackPort` production 구현 (C4).
 *
 * ## 소유 경계
 *
 * AI는 **공격 요청만** 만든다. 사거리·쿨다운 판정과 무기(폭뢰) 투하는
 * 이 계층이 소유한다 — AI는 피해량·폭발 반경·쿨다운을 갖지 않는다.
 *
 * ```
 * DestroyerAIController(attack 상태) → EnemyAttackRequest
 *   → EnemyAttackPort  ← **이 파일** (쿨다운·사거리)
 *   → DepthChargeRunSystem.drop (투하만 — 피해 없음)
 *   → 신관 → 폭발 → DamageRequest → DamageReceiverPort.applyDamage
 * ```
 *
 * ## 규칙
 *
 *  - **요청 생성 즉시 피해 없음.** 이 포트는 폭뢰를 투하할 뿐이고, 피해는
 *    신관이 끝난 뒤 폭발 판정에서만 발생한다.
 *  - 공식 params(사거리·쿨다운·피해)가 없으면 `unwired`를 반환하고 아무것도
 *    투하하지 않는다 — 거리 무관 자동 피해를 만들지 않는다.
 *  - 표적이 파괴됐으면 요청을 거부한다 (`PlayerAliveSource` 정본 소비).
 *  - 같은 `attackId`의 두 번째 요청은 `duplicate` — 중복 소비를 막는다.
 *
 * ## 사거리 출처 (정직한 기록)
 *
 * 공격 사거리 전용 공식 항목이 없다. **임의 사거리를 만들지 않고**
 * 폭뢰 근접 판정 반경(`nearRadiusMeters`, 공식 params)을 그대로 사거리
 * 상한으로 쓴다 — "피해를 줄 수 있는 거리 밖에서는 투하하지 않는다"는
 * 구조적 규칙이며 새 수치가 아니다. 그 값이 null이면 unwired다.
 */

import type {
  DepthChargeDamageParams,
  EnemyAttackOutcome,
  EnemyAttackPort,
  EnemyAttackRequest,
  PlayerAliveSource,
  SortieResettable,
} from '../../contracts/survival';
import type { DepthChargeRunSystem } from './DepthChargeRunSystem';
import { depthChargeDamageWired } from './officialCombatParams';

export class EnemyAttackCoordinator implements EnemyAttackPort, SortieResettable {
  private readonly depthCharges: DepthChargeRunSystem;
  private damageParams: DepthChargeDamageParams | null;
  private aliveSource: PlayerAliveSource | null;

  /** 공격자별 마지막 투하 시각 (초) — 쿨다운 판정 */
  private readonly lastAttackAt = new Map<number, number>();
  /** 이미 처리한 attackId — 중복 요청 차단 */
  private readonly handledAttacks = new Set<string>();
  private elapsedSeconds = 0;
  private lastOutcomeValue: EnemyAttackOutcome | null = null;

  constructor(
    depthCharges: DepthChargeRunSystem,
    damageParams: DepthChargeDamageParams | null = null,
    aliveSource: PlayerAliveSource | null = null,
  ) {
    this.depthCharges = depthCharges;
    this.damageParams = damageParams;
    this.aliveSource = aliveSource;
  }

  /** 공식 전투 params 주입 (조립부) */
  attachDamageParams(params: DepthChargeDamageParams | null): void {
    this.damageParams = params;
  }

  /** 플레이어 생사 정본 연결 — 파괴 후 공격 요청을 거부한다 */
  attachPlayerAliveSource(source: PlayerAliveSource | null): void {
    this.aliveSource = source;
  }

  /**
   * 공격 판정이 구동 가능한가. 피해 params와 쿨다운이 **모두** 확정돼야
   * 한다 — 하나라도 없으면 unwired다.
   */
  get wired(): boolean {
    return (
      depthChargeDamageWired(this.damageParams) &&
      this.damageParams?.dropCooldownSeconds !== null &&
      this.damageParams?.dropCooldownSeconds !== undefined
    );
  }

  get lastOutcome(): EnemyAttackOutcome | null {
    return this.lastOutcomeValue;
  }

  /** 시뮬레이션 시간 진행 — 쿨다운 기준 시각 (결정적) */
  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.elapsedSeconds += deltaSeconds;
  }

  /* ── 계약 `EnemyAttackPort` ─────────────────────────────────────── */

  requestAttack(request: EnemyAttackRequest): EnemyAttackOutcome {
    // 표적이 파괴됐으면 어떤 공격도 만들지 않는다 (생사 정본은 외부 소스).
    if (this.aliveSource !== null && !this.aliveSource.isPlayerAlive) {
      return this.record('outOfRange');
    }
    if (this.handledAttacks.has(request.attackId)) return this.record('duplicate');
    // 공식 수치 미확정 — 투하하지 않고 unwired. 임시 사거리·피해 금지.
    if (!this.wired) return this.record('unwired');

    const params = this.damageParams as DepthChargeDamageParams;
    const maxRange = params.nearRadiusMeters as number;
    const distance = Math.hypot(
      request.targetPosition.x - request.attackerPosition.x,
      request.targetPosition.y - request.attackerPosition.y,
      request.targetPosition.z - request.attackerPosition.z,
    );
    if (distance > maxRange) return this.record('outOfRange');

    const cooldown = params.dropCooldownSeconds as number;
    const lastAt = this.lastAttackAt.get(request.attackerEntityId);
    if (lastAt !== undefined && this.elapsedSeconds - lastAt < cooldown) {
      return this.record('onCooldown');
    }

    // 투하만 한다 — 피해는 신관 이후 폭발 판정에서만 발생한다.
    const dropped = this.depthCharges.drop({
      attackerEntityId: request.attackerEntityId,
      targetEntityId: request.targetEntityId,
      worldX: request.targetPosition.x,
      worldY: request.targetPosition.y,
      worldZ: request.targetPosition.z,
      correlationId: request.correlationId,
    });
    if (!dropped) return this.record('onCooldown'); // 동시 상한 — 지금은 투하 불가

    this.handledAttacks.add(request.attackId);
    this.lastAttackAt.set(request.attackerEntityId, this.elapsedSeconds);
    return this.record('delivered');
  }

  private record(outcome: EnemyAttackOutcome): EnemyAttackOutcome {
    this.lastOutcomeValue = outcome;
    return outcome;
  }

  /** 출항 한정 상태 — 쿨다운·중복 기록 초기화 */
  resetForNewSortie(): void {
    this.lastAttackAt.clear();
    this.handledAttacks.clear();
    this.elapsedSeconds = 0;
    this.lastOutcomeValue = null;
  }

  dispose(): void {
    this.resetForNewSortie();
  }
}
