/**
 * ⚠ 임시 기본값 — 확정 밸런스 아님, params/economy.json 이관 대기 (R7 선진행).
 *
 * 경제 수치표(기획 박태현, PvE D+3 절대 마감 — 소회의 병목 지정)가 아직 없다.
 * INT-GAME-001과 동일한 절차로 여기 한 곳에만 두고 선진행한다 — 이관 요청은
 * docs/INTEGRATION_NOTES.md INT-CORE-007. 기획 확정·params/economy.json 이관
 * 즉시 이 파일을 삭제하고 주입 경로로 교체한다.
 */

/** 파괴 시 일반 크레딧 손실률 — 초기값 50% [조정 범위 30~70%, 6차 결의 7 튜닝표 등재 예정] */
export const PROVISIONAL_CREDIT_LOSS_ON_DESTROYED_RATIO = 0.5;
