/**
 * ⚠ 임시 수직 월드 구성 — 확정 레벨·밸런스 값 아님 (R7 선진행, INT-GAME-004).
 *
 * 연속 심도 이동에 필요한 수면 상한·해저 하한·심도 3구간 경계는
 * 레벨 디자인(최윤아) 블록아웃·params 어디에도 아직 없다. 현재 회색 박스
 * 장면(src/render/CanyonScene.ts)의 시각 상수(해저 FLOOR_Y = -6, 잠수함
 * 시작 y = 0)와 맞물리는 임시값을 여기 한 곳에만 둔다.
 * 정식 블록아웃 수신·params 이관 시 이 파일을 삭제·교체한다.
 *
 * 구간 규칙 (마스터 플랜 §3.4 — 심도는 정확히 3구간, 4구간 이상 금지):
 *   y ≥ PERISCOPE_MIN_Y            → 잠망경 심도 (periscope)
 *   CRUISE_MIN_Y ≤ y < PERISCOPE_MIN_Y → 순항 심도 (cruise)
 *   y < CRUISE_MIN_Y               → 심해 (deep)
 */

/** 잠수함 중심의 상한 (수면 이탈 방지 — 수면보다 선체 반경만큼 아래) */
export const PROVISIONAL_SUBMARINE_MAX_Y = 12.5;

/** 잠수함 중심의 하한 (해저 FLOOR_Y(-6) + 선체 반경 — 바닥 이탈 방지) */
export const PROVISIONAL_SUBMARINE_MIN_Y = -5;

/** 이 높이 이상 = 잠망경 심도 */
export const PROVISIONAL_PERISCOPE_MIN_Y = 8;

/** 이 높이 이상(잠망경 미만) = 순항 심도. 미만 = 심해 */
export const PROVISIONAL_CRUISE_MIN_Y = -2;
