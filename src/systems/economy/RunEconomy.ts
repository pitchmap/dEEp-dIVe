/**
 * 출항 경제 원장 — 일반 크레딧·희귀 부품 보유와 출항 정산 (게임플레이 소유).
 *
 * 규칙 (6차 대회의·소회의 11):
 *  - **일반 크레딧과 희귀 부품은 분리**한다. 크레딧은 출항분(sortie)과
 *    확정분(confirmed)을 구분 — 확정은 정산(귀환·패배) 시점에만 이동한다.
 *  - 플레이어 파괴 시 이번 출항 크레딧의 일부를 손실한다(손실률 파라미터).
 *    **영구 업그레이드·희귀 부품은 손실하지 않는다.**
 *  - 희귀 부품 획득 시 즉시 저장 신호를 구독자(툴링 저장 시스템)에 알린다 —
 *    정식 `rarePartAcquired` 이벤트 계약은 INT-GAME-008 제안 중, 그 전까지
 *    콜백 구독(onRarePartAcquired)이 연결점이다.
 *  - 저장 자체는 툴링 소유 — 이 클래스는 결과 이벤트·정산 데이터만 제공한다.
 */

/** 출항 정산 데이터 — 저장(툴링)·결과 UI가 소비한다 */
export interface SortieSettlement {
  readonly outcome: 'return' | 'defeat';
  /** 이번 출항에서 획득했던 일반 크레딧 총액 */
  readonly creditsEarned: number;
  /** 정산 후 확정분에 합산된 크레딧 */
  readonly creditsKept: number;
  /** 손실된 크레딧 (귀환 시 0) */
  readonly creditsLost: number;
  /** 정산 후 확정 크레딧 잔액 */
  readonly totalCreditsAfter: number;
  /** 보유 희귀 부품 — 정산과 무관하게 보존된다 */
  readonly rarePartsHeld: readonly string[];
}

export class RunEconomy {
  private confirmed = 0;
  private sortie = 0;
  private parts: string[] = [];
  private readonly rarePartListeners = new Set<(partId: string) => void>();

  /** 확정 크레딧 (기지 저장 대상) */
  get confirmedCredits(): number {
    return this.confirmed;
  }

  /** 이번 출항 획득분 (미정산 — 파괴 시 손실 대상) */
  get sortieCredits(): number {
    return this.sortie;
  }

  /** UI 표시용 합계 */
  get totalCredits(): number {
    return this.confirmed + this.sortie;
  }

  /** 보유 희귀 부품 (획득 순서 유지, 손실 없음) */
  get rareParts(): readonly string[] {
    return this.parts;
  }

  /** 일반 크레딧 획득 (이번 출항분에 적립) */
  addCredits(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.sortie += amount;
  }

  /**
   * 희귀 부품 획득 — 즉시 저장 신호를 구독자에게 알린다 (저장은 툴링 소유).
   * 중복 id는 무시한다 (동일 부품 이중 획득 방지).
   */
  acquireRarePart(partId: string): boolean {
    if (this.parts.includes(partId)) return false;
    this.parts.push(partId);
    for (const listener of [...this.rarePartListeners]) listener(partId);
    return true;
  }

  /** 희귀 부품 즉시 저장 신호 구독 (툴링 저장 시스템 연결점) */
  onRarePartAcquired(listener: (partId: string) => void): () => void {
    this.rarePartListeners.add(listener);
    return () => this.rarePartListeners.delete(listener);
  }

  /**
   * 출항 정산 — 'return'(귀환) = 전액 확정 / 'defeat'(파괴) = 손실률만큼
   * 잃고 나머지 확정. 희귀 부품·확정 크레딧(영구분)은 건드리지 않는다.
   * 반환값이 저장·결과 화면용 정산 데이터다.
   */
  settleSortie(outcome: 'return' | 'defeat', defeatLossRatio: number): SortieSettlement {
    const earned = this.sortie;
    const lossRatio = outcome === 'defeat' ? Math.min(1, Math.max(0, defeatLossRatio)) : 0;
    const lost = Math.floor(earned * lossRatio);
    const kept = earned - lost;

    this.confirmed += kept;
    this.sortie = 0;

    return {
      outcome,
      creditsEarned: earned,
      creditsKept: kept,
      creditsLost: lost,
      totalCreditsAfter: this.confirmed,
      rarePartsHeld: [...this.parts],
    };
  }
}
