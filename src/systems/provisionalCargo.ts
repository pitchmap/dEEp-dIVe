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

/* ── 선체 박스 근사 치수 (5차 결의 1 — 어뢰 명중·잠수함 충돌 공유 데이터).
 *    렌더 임시 모델(길이 20 × 폭 5)을 감싸는 구조 치수 — 밸런스 수치 아님. */

/** 선수·선미 반길이 (로컬 Z) */
export const PROVISIONAL_CARGO_HALF_LENGTH = 10;

/** 좌우 반폭 (로컬 X) */
export const PROVISIONAL_CARGO_HALF_BEAM = 2.5;

/**
 * 판정용 흘수 (m) — 흘수선 아래로 잠기는 판정 깊이. 시각 흘수(렌더 2.2)와
 * 달리 잠망경 심도 어뢰 주행 고도를 덮도록 잡는다 (기존 원 판정과 동일하게
 * 잠망경 어뢰가 명중 가능해야 함 — 값 확정은 INT-GAME-008 이관)
 */
export const PROVISIONAL_CARGO_JUDGMENT_DRAFT = 4;

/** 흘수선 위 선체 높이 (m) */
export const PROVISIONAL_CARGO_FREEBOARD = 3;
