/**
 * 업그레이드 배율 레이어 — 순수 계산 함수 (소회의 결의 4).
 *
 * 규칙:
 *  - 최종값 = 기준값 × (1 + 보정 합). **합연산만** — 곱연산 스택 금지
 *    (기획이 '5단계 = +50%'를 암산할 수 있어야 한다).
 *  - params JSON 원본은 불변 — 이 함수는 결과값을 반환할 뿐 어떤 객체도
 *    수정하지 않는다. 코드→JSON 역기록 금지.
 *  - 실제 게임 시스템과 툴 시뮬레이터가 **이 모듈의 동일 함수**를 사용한다
 *    (툴은 composition root 또는 직접 import로 공유 — 계산 복제 금지).
 *
 * 소비 방식: 게임플레이 시스템은 이 함수를 직접 호출하지 않고, composition
 * root가 계산한 유효 파라미터를 명시적 주입으로 받는다 (applyParams 경로).
 */

import type { UpgradeModifiers, UpgradeStatId } from '../contracts/meta';

function assertModifierSum(modifierSum: number): void {
  if (!Number.isFinite(modifierSum)) {
    throw new Error(`[upgradeMath] 보정 합이 유한하지 않습니다: ${modifierSum}`);
  }
  // -100% 이하는 값의 부호가 뒤집히거나 0 나눗셈이 된다 — 계약 위반으로 거부
  if (modifierSum <= -1) {
    throw new Error(`[upgradeMath] 보정 합은 -1(-100%) 초과여야 합니다: ${modifierSum}`);
  }
}

/** 클수록 좋은 값(속도·피해·사거리 등): 최종값 = 기준값 × (1 + 보정 합) */
export function effectiveValue(baseValue: number, modifierSum: number): number {
  assertModifierSum(modifierSum);
  if (!Number.isFinite(baseValue)) {
    throw new Error(`[upgradeMath] 기준값이 유한하지 않습니다: ${baseValue}`);
  }
  return baseValue * (1 + modifierSum);
}

/**
 * 시간형 파라미터(작을수록 좋은 값 — 재장전 시간·선회 소요 시간 등):
 * '+X% 향상'을 시간 단축으로 적용한다. 최종 시간 = 기준 시간 ÷ (1 + 보정 합).
 * (시간에 effectiveValue를 곱하면 업그레이드가 페널티가 되는 실수 방지용)
 */
export function effectiveDurationSeconds(baseSeconds: number, modifierSum: number): number {
  assertModifierSum(modifierSum);
  if (!Number.isFinite(baseSeconds)) {
    throw new Error(`[upgradeMath] 기준 시간이 유한하지 않습니다: ${baseSeconds}`);
  }
  return baseSeconds / (1 + modifierSum);
}

/** 여러 보정 집합(영구 성장 + 장비 등)을 합연산으로 병합한다. 입력 불변 */
export function mergeModifiers(...sets: readonly UpgradeModifiers[]): UpgradeModifiers {
  const merged: Partial<Record<UpgradeStatId, number>> = {};
  for (const set of sets) {
    for (const key of Object.keys(set) as UpgradeStatId[]) {
      const value = set[key];
      if (value === undefined) continue;
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return merged;
}

/** 특정 항목의 보정 합 조회 (미정의 = 0) */
export function modifierSumFor(modifiers: UpgradeModifiers, stat: UpgradeStatId): number {
  return modifiers[stat] ?? 0;
}
