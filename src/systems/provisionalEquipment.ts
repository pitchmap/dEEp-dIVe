/**
 * ⚠ 임시 기본값 — 확정 밸런스 아님, params 이관 대기 중 (R7 선진행).
 *
 * 장비 4종(6차 신 스코프 가드 — 정확히 4종)의 수치가 `/params/upgrades.json`
 * ·경제 수치표(D+3 병목)에 아직 없다. 여기 한 곳에만 두고 선진행한다 —
 * 이관 요청은 docs/INTEGRATION_NOTES.md INT-GAME-008.
 *
 * 설계 원칙 (회의 11 안건 6·작업 지시):
 *  - 상위호환 금지: 고속 어뢰 = 속력↑·피해↓ / 중어뢰 = 속력↓·피해↑.
 *    기본 어뢰가 균형점 — 어느 것도 다른 것을 전 지표에서 이기지 않는다.
 *  - 기본 어뢰 속력·피해의 기준값은 기존 어뢰 임시값(provisionalCombat)을
 *    승계한다 (플레이테스트 검증 수치 보존).
 */

import { PROVISIONAL_TORPEDO_SPEED_MPS } from './provisionalCombat';

/** 장비 슬롯 수 (출항 시 장착 가능 종수) */
export const PROVISIONAL_EQUIPMENT_SLOTS = 2;

/** 기본 어뢰 — 균형 기준점 */
export const PROVISIONAL_STANDARD_TORPEDO = {
  speedMetersPerSecond: PROVISIONAL_TORPEDO_SPEED_MPS, // 20
  damage: 1.0,
} as const;

/** 고속 어뢰 — 빠르지만 피해 낮음 (상위호환 아님) */
export const PROVISIONAL_FAST_TORPEDO = {
  speedMetersPerSecond: PROVISIONAL_TORPEDO_SPEED_MPS * 1.5, // 30
  damage: 0.5,
} as const;

/** 중어뢰 — 느리지만 높은 피해(관통 역할) (상위호환 아님) */
export const PROVISIONAL_HEAVY_TORPEDO = {
  speedMetersPerSecond: PROVISIONAL_TORPEDO_SPEED_MPS * 0.6, // 12
  damage: 2.5,
} as const;

/** 디코이 — 가짜 음향 표적 (교란 요청 생성) */
export const PROVISIONAL_DECOY = {
  /** 출항당 보유 수 */
  stock: 2,
  /** 교란 지속 시간 (초) — AI가 가짜 표적으로 취급하는 기간 */
  lifetimeSeconds: 20,
  /** 재사용 대기 (초) */
  cooldownSeconds: 5,
} as const;
