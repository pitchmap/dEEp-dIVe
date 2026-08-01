/**
 * ⚠ 업그레이드 가격 임시 소스 — 공식 경제 params 도착 전까지의 R7 선진행.
 *
 * `params/upgrades.json`은 효과(bonusPerLevel·maxLevel)만 정의하고 **가격이
 * 없다.** 가격은 기획 경제 수치표(D+3 절대 마감, 병목 R-P2)에서 오며
 * `/params/economy.json` 신설이 예정돼 있다. 그 전까지 가격을 여기 한
 * 곳에만 두고, 구매 판정은 주입된 가격 함수로만 읽는다 — 파일이 오면 이
 * 파일을 삭제하고 주입원만 교체한다 (요청: INT-GAME-009).
 *
 * 임시 가격식: 단계가 오를수록 비싸지는 단순 선형 증가.
 *   크레딧 = base × 다음 단계
 *   희귀 부품 = 4단계 이상부터 1개 (후반 단계 게이트)
 */

import type { CurrencyBundle } from '../../contracts/meta';

/** 1단계 기준 가격 (크레딧) */
export const PROVISIONAL_UPGRADE_BASE_CREDITS = 100;

/** 희귀 부품을 요구하기 시작하는 단계 */
export const PROVISIONAL_RARE_PART_FROM_LEVEL = 4;

/** 다음 단계 구매 비용 — nextLevel은 1 이상 */
export function provisionalUpgradeCost(nextLevel: number): CurrencyBundle {
  const level = Math.max(1, Math.floor(nextLevel));
  return {
    credits: PROVISIONAL_UPGRADE_BASE_CREDITS * level,
    rareParts: level >= PROVISIONAL_RARE_PART_FROM_LEVEL ? 1 : 0,
  };
}
