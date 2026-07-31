/**
 * 수직 월드 값 — 공유 레이아웃 파생 + 심도 구간 임시 경계.
 *
 * 해수면·해저는 공유 레이아웃(`src/world/startingCanyonLayout.ts`,
 * INT-CORE-004 단일 소스)에서 읽고, 잠수함 수직 한계는 여기서 **파생**만
 * 한다 — 수치 복제 없음:
 *   상한 = seaSurfaceY − 선체 반경 (수면 돌출 방지)
 *   하한 = floorY + 선체 반경 (해저 이탈 방지)
 *
 * ⚠ 심도 3구간 경계(잠망경/순항)만 임시값이다 (R7 선진행, INT-GAME-004) —
 * params·레벨 데이터 이관 시 이 파일을 삭제·교체한다.
 *
 * 구간 규칙 (마스터 플랜 §3.4 — 심도는 정확히 3구간, 4구간 이상 금지):
 *   y ≥ PERISCOPE_MIN_Y            → 잠망경 심도 (periscope)
 *   CRUISE_MIN_Y ≤ y < PERISCOPE_MIN_Y → 순항 심도 (cruise)
 *   y < CRUISE_MIN_Y               → 심해 (deep)
 */

import { STARTING_CANYON_LAYOUT } from '../world/startingCanyonLayout';
import { SUBMARINE_HULL_RADIUS } from './collision/submarineHull';

/** 잠수함 중심의 상한 — 공유 레이아웃 해수면 − 선체 반경 (파생값) */
export const SUBMARINE_MAX_Y = STARTING_CANYON_LAYOUT.seaSurfaceY - SUBMARINE_HULL_RADIUS;

/** 잠수함 중심의 하한 — 공유 레이아웃 해저 + 선체 반경 (파생값) */
export const SUBMARINE_MIN_Y = STARTING_CANYON_LAYOUT.floorY + SUBMARINE_HULL_RADIUS;

/** 이 높이 이상 = 잠망경 심도 [임시값 — INT-GAME-004 이관 대기] */
export const PROVISIONAL_PERISCOPE_MIN_Y = 8;

/** 이 높이 이상(잠망경 미만) = 순항 심도. 미만 = 심해 [임시값] */
export const PROVISIONAL_CRUISE_MIN_Y = -2;
