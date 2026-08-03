/**
 * 파밍 보상 배관 — 금괴·난파선 회수 보상과 **해역당 상한** (M2 4단계).
 *
 * 근거: 16차 결의 2-3. 세 가지 제약이 결의문에 명시돼 있고 전부 여기서
 * 구조로 강제된다.
 *
 *  1. **신규 화폐 금지** — 기존 단일 재화(`RunEconomy`의 크레딧)로만 지급한다.
 *     이 파일은 지갑을 만들지 않고 주입받은 지갑 포트에 적립만 한다.
 *  2. **해역당 상한** — 상한 = 전투 보상 평균 × 비율(16차 튜닝표 초기값 40%).
 *     상한에 닿으면 그 이후 회수는 **0 크레딧**이다(회수 자체는 성립한다 —
 *     단서 회수까지 막지 않기 위해서다).
 *  3. **파밍은 보조 수입** — 그래서 상한이 미주입이면 **아무것도 지급하지
 *     않는다.** 상한 없는 지급은 결의가 명시적으로 거부한 방향("경제가
 *     무너지는 방향으로 이으면 안 됩니다")이므로, 미확정을 '무제한'으로
 *     해석하지 않는다. `unwired`로 드러난다. 요청: INT-GAME-016.
 *
 * ## 이 파일에 없는 것
 *
 * 회수 절차(=`InteractionSystem`), 정산(=`MetaLoop.settleSortie`), 저장,
 * 대상 배치·보상 금액 정의(기획·월드 소유 — 주입). 단서·심층 지점은
 * 재화 대상이 아니므로 여기서 지급하지 않는다(진행 상태는
 * `CluePickupProgress` 소유).
 */

import type { InteractableKind, InteractionCompletion } from '../interaction/InteractionSystem';

/** 지갑 단면 — 기존 `RunEconomy`가 그대로 충족한다 (두 번째 지갑 금지) */
export interface FarmingWalletPort {
  addCredits(amount: number): void;
}

/** 해역당 상한 수치 — 전부 공식 params 소유 (미확정이면 null) */
export interface FarmingRewardParams {
  /**
   * 해역당 파밍 상한 = 전투 보상 평균의 몇 배인가.
   * 16차 튜닝표 초기값 0.40 (조정 범위 0.20~0.60).
   */
  readonly sectorCapRatioOfCombatAverage: number | null;
  /**
   * 한 출항의 전투 보상 평균 크레딧 — 상한의 기준선.
   * `params/economy.json`이 소유한다(예: 격침 보상 참조값에서 파생).
   */
  readonly combatRewardAverageCredits: number | null;
}

/** 회수 대상 1개의 보상 — 배치·금액은 기획·월드 소유 (주입 데이터) */
export interface FarmingRewardEntry {
  readonly interactableId: string;
  readonly credits: number;
}

/** 지급 결과 — 검증·UI가 '왜 안 들어왔는지'를 구분할 수 있어야 한다 */
export type FarmingPayoutOutcome =
  /** 전액 지급 */
  | { readonly status: 'paid'; readonly credits: number }
  /** 상한에 걸려 일부만 지급 */
  | { readonly status: 'partial'; readonly credits: number; readonly forfeited: number }
  /** 해역 상한 소진 — 회수는 됐지만 재화는 0 */
  | { readonly status: 'capReached'; readonly forfeited: number }
  /** 재화 대상이 아님 (단서·심층 지점) 또는 보상 정의 없음 */
  | { readonly status: 'noReward' }
  /** 같은 대상 재지급 시도 */
  | { readonly status: 'duplicate' }
  /** 상한 수치 미주입 — 상한 없는 지급을 하지 않는다 */
  | { readonly status: 'unwired' };

/** 재화 지급 대상 종류 — 단서·심층 지점은 진행 상태이지 수입이 아니다 */
const PAYABLE_KINDS: readonly InteractableKind[] = Object.freeze(['gold', 'salvage']);

export class SectorFarmingRewards {
  private readonly wallet: FarmingWalletPort;
  private params: FarmingRewardParams | null;
  /** interactableId → 보상 (주입 전에는 비어 있다) */
  private rewards = new Map<string, number>();
  private paidCredits = 0;
  private forfeitedCredits = 0;
  private readonly paidTargets = new Set<string>();

  constructor(wallet: FarmingWalletPort, params: FarmingRewardParams | null = null) {
    this.wallet = wallet;
    this.params = params;
  }

  /** 공식 상한 수치 주입 (조립부) — null이면 지급하지 않는다 */
  attachParams(params: FarmingRewardParams | null): void {
    this.params = params;
  }

  /** 회수 대상별 보상 금액 주입 (기획·월드 데이터) */
  attachRewards(rewards: readonly FarmingRewardEntry[] | null): void {
    this.rewards = new Map();
    for (const entry of rewards ?? []) {
      if (!Number.isFinite(entry.credits) || entry.credits < 0) continue;
      this.rewards.set(entry.interactableId, entry.credits);
    }
  }

  get wired(): boolean {
    const params = this.params;
    return (
      params !== null &&
      params.sectorCapRatioOfCombatAverage !== null &&
      params.sectorCapRatioOfCombatAverage > 0 &&
      params.combatRewardAverageCredits !== null &&
      params.combatRewardAverageCredits > 0
    );
  }

  /** 해역 상한 크레딧 — 미주입이면 0 (지급 없음) */
  get sectorCapCredits(): number {
    if (!this.wired) return 0;
    const params = this.params as FarmingRewardParams;
    return (params.combatRewardAverageCredits as number) *
      (params.sectorCapRatioOfCombatAverage as number);
  }

  /** 이번 해역에서 파밍으로 지급된 크레딧 */
  get paidThisSector(): number {
    return this.paidCredits;
  }

  /** 상한에 걸려 지급되지 못한 크레딧 (튜닝 관찰용 — 상한이 실제로 무는가) */
  get forfeitedThisSector(): number {
    return this.forfeitedCredits;
  }

  get remainingCap(): number {
    return Math.max(0, this.sectorCapCredits - this.paidCredits);
  }

  /**
   * 회수 완료 1건 소비 — `InteractionSystem.onCompleted`에 연결한다.
   * 단서 회수는 `noReward`로 통과시킨다(단서 진행은 다른 시스템 소유).
   */
  handleCompletion(entry: InteractionCompletion): FarmingPayoutOutcome {
    if (!PAYABLE_KINDS.includes(entry.kind)) return { status: 'noReward' };
    if (this.paidTargets.has(entry.interactableId)) return { status: 'duplicate' };

    const reward = this.rewards.get(entry.interactableId);
    if (reward === undefined || reward <= 0) return { status: 'noReward' };
    // 상한 수치가 없으면 지급 자체를 하지 않는다 (무제한 지급 금지).
    if (!this.wired) return { status: 'unwired' };

    this.paidTargets.add(entry.interactableId);
    const remaining = this.remainingCap;
    if (remaining <= 0) {
      this.forfeitedCredits += reward;
      return { status: 'capReached', forfeited: reward };
    }
    if (reward <= remaining) {
      this.paidCredits += reward;
      this.wallet.addCredits(reward);
      return { status: 'paid', credits: reward };
    }
    const forfeited = reward - remaining;
    this.paidCredits += remaining;
    this.forfeitedCredits += forfeited;
    this.wallet.addCredits(remaining);
    return { status: 'partial', credits: remaining, forfeited };
  }

  /**
   * 새 해역·새 출항 — 상한 예산을 다시 채운다.
   * MVP는 해역이 하나(협곡)이므로 해역 경계 = 출항 경계다. 해역이 늘어나면
   * 조립부가 해역 전환 시점에 같은 함수를 부른다(여기에 해역 목록을 두지
   * 않는다 — 해역 정의는 기획·월드 소유다).
   */
  resetForNewSortie(): void {
    this.paidCredits = 0;
    this.forfeitedCredits = 0;
    this.paidTargets.clear();
  }
}
