/**
 * 기지 화면 UI 표시 규칙 — **BaseScreenPort v2 전용 표현 계층** (INT-CORE-010).
 *
 * 데이터 접근 규칙:
 *  - UI의 유일한 상태·명령 진입점은 공통 계약 `BaseScreenPort`다. 지갑·단계·
 *    loadout·카탈로그·SaveStore를 UI가 직접 만지지 않는다.
 *  - **게임플레이 로컬 결과 타입(systems/economy/purchaseTypes)을 UI가 읽지
 *    않는다** — 결과는 계약 `BaseCommandOutcome`·`DepartureResult` 문자열
 *    코드뿐이다. 구계약(TransactionResult 객체) 변환 어댑터는 v2 동기화로
 *    불필요해져 제거했다.
 *  - 이 파일에는 가격·보상 수치가 없다. 표시값은 전부 포트가 준 카탈로그에서
 *    온다 (공식 params → composition root → 포트 → UI 단방향).
 */

import type {
  BaseCommandOutcome,
  DepartureResult,
  UpgradeCatalogItem,
} from '../contracts/meta';

/** 저장 실패 고정 문구 [보완분 결의 7] — 내부 예외 문자열 비노출 */
export const SAVE_FAILED_MESSAGE =
  '저장에 실패하여 구매가 취소되었습니다. 저장 공간 또는 브라우저 설정을 확인해주세요.';

/** 출항 확정 직전 저장 실패 문구 — 해역 전환 없이 기지를 유지한다 */
export const DEPARTURE_SAVE_FAILED_MESSAGE =
  '저장에 실패하여 출항이 취소되었습니다. 저장 공간 또는 브라우저 설정을 확인해주세요. (기지 화면 유지)';

/** 공식 경제 params 미확정 문구 — 상태·저장 변경 없이 차단됐음을 알린다 */
export const ECONOMY_DATA_UNAVAILABLE_MESSAGE =
  '경제 데이터 미확정 — 가격 데이터 대기 중입니다. 구매가 진행되지 않았습니다.';

/**
 * 명령 결과 코드 → 사용자 문구 (구매·장비 공용).
 * 색이 아니라 아이콘 + 문구로 구분한다 (§11 접근성).
 */
export function commandOutcomeMessage(outcome: BaseCommandOutcome): string {
  switch (outcome) {
    case 'success':
      return '✓ 완료되었습니다.';
    case 'insufficientCredits':
      return '✕ 크레딧이 부족합니다.';
    case 'insufficientRareParts':
      return '✕ 희귀 부품이 부족합니다.';
    case 'maxLevelReached':
      return '✕ 이미 최대 단계입니다.';
    case 'slotFull':
      return '✕ 빈 장비 슬롯이 없습니다.';
    case 'alreadyEquipped':
      return '✕ 이미 장착 중인 장비입니다.';
    case 'economyDataUnavailable':
      return `✕ ${ECONOMY_DATA_UNAVAILABLE_MESSAGE}`;
    case 'saveFailedRolledBack':
      return `✕ ${SAVE_FAILED_MESSAGE}`;
  }
}

/** 출항 결과 코드 → 사용자 문구 */
export function departureOutcomeMessage(result: DepartureResult): string {
  switch (result) {
    case 'departed':
      return '✓ 출항했습니다.';
    case 'saveFailed':
      return `✕ ${DEPARTURE_SAVE_FAILED_MESSAGE}`;
    case 'invalidState':
      return '✕ 지금은 출항할 수 없습니다.';
    case 'economyDataUnavailable':
      return `✕ ${ECONOMY_DATA_UNAVAILABLE_MESSAGE}`;
  }
}

/** 카탈로그 항목 하나의 가격 표시 문구 — 미확정·최대 단계를 구분한다 */
export function upgradePriceText(item: UpgradeCatalogItem, atMaxLevel: boolean): string {
  if (atMaxLevel) return '—';
  if (item.nextCostPending || !item.nextCost) return '가격: 경제 데이터 미확정 (수치표 대기)';
  const { credits, rareParts } = item.nextCost;
  return `가격: 크레딧 ${credits}${rareParts > 0 ? ` · 희귀 부품 ${rareParts}` : ''}`;
}
