/**
 * 귀환 정산 — 순수 계산 (6차 결의 7·9).
 *
 * 규칙:
 *  - returned/aborted(정상·중도 귀환): 손실 0, 이번 출항 크레딧 전액 반영
 *  - destroyed(파괴): 이번 출항 크레딧 × 손실률 손실 (내림)
 *  - 희귀 부품은 획득 즉시 확정이므로 정산에서 손실되지 않는다
 *  - 영구 업그레이드·기구매 장비는 정산 대상 아님 (불멸)
 */

import type { SortieOutcome, SortieSettlement } from '../contracts/meta';

export function computeSortieSettlement(input: {
  outcome: SortieOutcome;
  creditsEarned: number;
  rarePartsSecured: number;
  /** 파괴 시 크레딧 손실률 0~1 — 공식 `params/economy.json`에서 주입된 값 */
  creditLossOnDestroyedRatio: number;
}): SortieSettlement {
  const { outcome, creditsEarned, rarePartsSecured, creditLossOnDestroyedRatio } = input;
  if (!Number.isFinite(creditsEarned) || creditsEarned < 0) {
    throw new Error(`[settlement] 획득 크레딧이 유효하지 않습니다: ${creditsEarned}`);
  }
  if (
    !Number.isFinite(creditLossOnDestroyedRatio) ||
    creditLossOnDestroyedRatio < 0 ||
    creditLossOnDestroyedRatio > 1
  ) {
    throw new Error(`[settlement] 손실률은 0~1 이어야 합니다: ${creditLossOnDestroyedRatio}`);
  }

  const creditsLost =
    outcome === 'destroyed' ? Math.floor(creditsEarned * creditLossOnDestroyedRatio) : 0;

  return {
    outcome,
    creditsEarned,
    creditsLost,
    creditsNet: creditsEarned - creditsLost,
    rarePartsSecured,
  };
}
