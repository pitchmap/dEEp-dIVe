/**
 * ⚠ 임시 기본값 — 확정 밸런스·레벨 값 아님, params/레이아웃 이관 대기 중
 * (R7 선진행, 이관 요청 INT-GAME-007).
 *
 * 화물선 항행·격침에 필요한 수치가 params·튜닝표 §11.2·레벨 산출물 어디에도
 * 아직 없다. INT-GAME-001과 동일한 절차로 여기 한 곳에만 두고 선진행한다.
 * 기획·레벨 확정 시 이 파일을 삭제하고 주입 경로로 교체한다.
 *
 * 이 파일 외의 코드에 화물선 수치를 두지 않는다 (하드코딩 금지 규칙 유지).
 */

/** 화물선 항행 속력 (m/s) — 잠수함 최고 속력(10)보다 충분히 느린 초안 */
export const PROVISIONAL_CARGO_SPEED_MPS = 4;

/** 명중 판정 반경 (수평면, m) — 렌더 임시 선체 길이 20m의 절반보다 약간 작게 */
export const PROVISIONAL_CARGO_HIT_RADIUS = 9;

/** 침몰 진행 0→1 소요 시간 (초) — 시간축은 게임플레이 소유 (INT-CORE-003) */
export const PROVISIONAL_CARGO_SINK_DURATION_SECONDS = 6;

/** 직선 왕복 경로 양 끝점 (수평면) — 정식 레벨 블록아웃 수신 시 교체 */
export const PROVISIONAL_CARGO_WAYPOINT_A = { x: -30, z: -40 } as const;
export const PROVISIONAL_CARGO_WAYPOINT_B = { x: 30, z: -40 } as const;

/** VS 화물선 1척의 표적 식별자 (torpedoHit.targetId 체계) */
export const PROVISIONAL_CARGO_ID = 1;
