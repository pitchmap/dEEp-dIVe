/**
 * ⚠ 임시 기본값 — 확정 밸런스 아님. 경제 수치표(기획 D+3 절대 마감 —
 * 회의 11 병목)와 `/params/economy.json` 계약이 아직 없어 R7 규칙으로
 * 여기 한 곳에만 두고 선진행한다 — 이관 요청은 INTEGRATION_NOTES
 * INT-GAME-008. 수치표·계약 확정 즉시 이 파일을 삭제하고 주입 경로로
 * 교체한다.
 *
 * 이 파일 외의 코드에 경제 수치를 두지 않는다 (하드코딩 금지 규칙 유지).
 */

/** 드롭 테이블 — 표적의 dropTableId → 일반 크레딧 드롭량 */
export const PROVISIONAL_DROP_TABLES: Readonly<Record<string, { readonly credits: number }>> = {
  /** 적대 수송선 격침 */
  'cargo-standard': { credits: 120 },
  /** 해저 보물 — 부순다 3종 */
  'salvage-chest': { credits: 60 },
  'salvage-container': { credits: 40 },
  'salvage-mineral': { credits: 25 },
};

/** 드롭 자동 회수(줍는다) 반경 (m) — 접근 또는 접촉 */
export const PROVISIONAL_PICKUP_RADIUS_METERS = 6;

/**
 * 플레이어 파괴 시 이번 출항 일반 크레딧 손실률 [0~1].
 * 영구 업그레이드·희귀 부품은 손실 대상이 아니다 (6차 결의).
 */
export const PROVISIONAL_DEFEAT_CREDIT_LOSS_RATIO = 0.4;
