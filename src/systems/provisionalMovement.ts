/**
 * ⚠ 임시 기본값 — 확정 밸런스 아님, params 이관 대기 중 (2차 R7 선진행).
 *
 * D+5 리뷰 스프린트의 이동 개편(후진·연속 상승 하강)에 필요한 비율 수치가
 * `params/movement.json`·튜닝표 §11.2에 아직 없다. INT-GAME-001과 동일한
 * 절차(R7: "수치표 지연 → 임시 기본값 선진행")로 여기 한 곳에만 두고
 * 선진행한다 — 이관 요청은 docs/INTEGRATION_NOTES.md INT-GAME-004.
 * 기획(박태현) 확정·이관 즉시 이 파일을 삭제하고 주입 경로로 교체한다.
 *
 * 이 파일 외의 코드에 이동 수치를 두지 않는다 (하드코딩 금지 규칙 유지).
 */

/** 후진 최고 속력 = 전진 최고 속력 × 이 비율 (스프린트 지시 초기값 50%) */
export const PROVISIONAL_REVERSE_MAX_RATIO = 0.5;

/** 상승·하강 최고 속력 = 전진 최고 속력 × 이 비율 (스프린트 지시 초기값 50%) */
export const PROVISIONAL_VERTICAL_MAX_RATIO = 0.5;
