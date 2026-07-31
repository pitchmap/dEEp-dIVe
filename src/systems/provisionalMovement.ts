/**
 * ⚠ 임시 기본값 — 확정 밸런스 아님, params 이관 대기 중.
 *
 * `params/movement.json`(과 튜닝표 §11.2)에는 정지 관성·90도 선회만 정의되어
 * 있고, 이동 구현에 반드시 필요한 최고 속도·가속 수치가 아직 없다.
 * 마스터 플랜 단계 1 실패 대응 규칙(R7: "수치표 지연 → 임시 기본값 선진행,
 * 책임은 지연 측")에 따라 여기 한 곳에만 임시값을 두고 선진행한다.
 *
 * 처리 절차 (docs/INTEGRATION_NOTES.md #002 요청 기록):
 *  - contracts/params.ts `MovementParams`에 최고 속도·가속 항목 추가 (리드 승인)
 *  - 기획(박태현)이 params/movement.json에 값·범위 확정 커밋
 *  - 반영 즉시 이 파일을 삭제하고 주입 경로로 교체한다
 *
 * 이 파일 외의 코드에 이동 수치를 두지 않는다 (하드코딩 금지 규칙 유지).
 */

/** 최고 속력 (m/s) — 소음·탐지 연동 전의 회색 박스 기준 스케일 */
export const PROVISIONAL_MAX_SPEED_MPS = 10;

/** 정지 → 최고 속력 도달 시간 (초). "묵직하지만 답답하지 않은" 절충 초안 */
export const PROVISIONAL_ACCELERATION_SECONDS = 3.0;
