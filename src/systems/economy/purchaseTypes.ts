/**
 * 구매·장착 판정 결과 타입 — 게임플레이 창(창 2)의 '판정 내용' 소유분.
 *
 * 경계 [14차 결의 2]: **틀(트랜잭션 순서·롤백 규격) = 리드 창 / 내용(가능
 * 여부·실패 사유) = 게임플레이 창.** 리드의 공식 트랜잭션 계약이 도착하면
 * 이 타입들은 그 계약으로 승격·교체되고 판정 함수는 그대로 꽂힌다
 * (요청: INTEGRATION_NOTES INT-GAME-009).
 *
 * 실패 사유는 두 갈래로 **구분**한다 [보완분 결의 7]:
 *  - `condition` — 일반 구매 불가 5종 (조건 미충족). 상태 변경 없음.
 *  - `save` — 저장 실패. 메모리 상태는 구매 전으로 롤백되며, UI는 일반
 *    불가 사유와 다른 안내를 띄운다(내부 예외 문자열 노출 금지).
 */

import type { CurrencyBundle } from '../../contracts/meta';

/** 일반 구매·장착 불가 사유 5종 (조건 미충족) */
export type ConditionFailureReason =
  | 'insufficientCredits'
  | 'insufficientRareParts'
  | 'maxLevelReached'
  | 'slotFull'
  | 'alreadyEquipped';

/** 저장 실패 사유 — 일반 불가 사유와 구분해 표시한다 */
export type SaveFailureReason = 'saveFailed';

export type FailureReason = ConditionFailureReason | SaveFailureReason;

export interface TransactionSuccess {
  readonly ok: true;
}

export interface TransactionFailure {
  readonly ok: false;
  /** 안내 분기용 — 'condition'(조건) vs 'save'(저장 실패) */
  readonly category: 'condition' | 'save';
  readonly reason: FailureReason;
}

export type TransactionResult = TransactionSuccess | TransactionFailure;

export interface UpgradePurchaseSuccess extends TransactionSuccess {
  readonly statId: string;
  /** 구매 후 확정 단계 */
  readonly level: number;
  /** 실제 차감액 */
  readonly spent: CurrencyBundle;
}

export type UpgradePurchaseResult = UpgradePurchaseSuccess | TransactionFailure;

export function conditionFailure(reason: ConditionFailureReason): TransactionFailure {
  return { ok: false, category: 'condition', reason };
}

export function saveFailure(): TransactionFailure {
  return { ok: false, category: 'save', reason: 'saveFailed' };
}
