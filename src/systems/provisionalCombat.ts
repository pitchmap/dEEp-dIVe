/**
 * ⚠ 임시 기본값 — 확정 밸런스 아님, params 이관 대기 중 (R7 선진행).
 *
 * 어뢰 주행에 필요한 속력·최대 사거리가 `params/combat.json`·튜닝표 §11.2에
 * 아직 없다. INT-GAME-001과 동일한 절차(R7: "수치표 지연 → 임시 기본값
 * 선진행")로 여기 한 곳에만 두고 선진행한다 — 이관 요청은
 * docs/INTEGRATION_NOTES.md INT-GAME-006. 기획 확정·이관 즉시 이 파일을
 * 삭제하고 주입 경로로 교체한다.
 *
 * 이 파일 외의 코드에 어뢰 수치를 두지 않는다 (하드코딩 금지 규칙 유지).
 */

/** 어뢰 직선 주행 속력 (m/s) — 잠수함 최고 속력(10)의 2배 초안 */
export const PROVISIONAL_TORPEDO_SPEED_MPS = 20;

/** 어뢰 최대 사거리 (m) — 초과 시 제거. 협곡 스케일·포그 가시거리 기준 초안 */
export const PROVISIONAL_TORPEDO_MAX_RANGE_METERS = 90;
