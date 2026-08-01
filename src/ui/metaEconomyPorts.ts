/**
 * 성장·경제 UI 소비 계층 — production 배선판 (스프린트 A 마감).
 *
 * 데이터 접근 규칙 (작업 지시 §3 + INT-CORE-008):
 *  - 기지 화면 UI의 명령·상태 진입점은 **공통 계약 `BaseScreenPort` 하나**다
 *    (contracts/meta.ts). UI는 지갑·단계·loadout·저장소를 직접 만지지 않는다.
 *  - 카탈로그(공식 params — 이름·단계·가격·효과)는 툴링 검증기(economyMath)의
 *    읽기 전용 결과를 표시용 뷰로만 변환한다. **null(기획 수치표 미도착)을
 *    임의 숫자로 바꾸지 않는다** — null이면 구매 비활성 + 미확정 표기.
 *  - 결과 표시는 계약 `TransactionResult` 그대로 + UI 전용 상태 1종
 *    (`economyDataUnavailable` — 가격 null이라 트랜잭션을 시작조차 하지 않은
 *    경우)만 더한다. 내부 예외 문자열은 계약이 이미 차단한다.
 */

import type {
  CurrencyBundle,
  MetaStateId,
  TransactionResult,
  UpgradeStatId,
} from '../contracts/meta';
import type { UpgradeEntry } from '../tools/economyMath';

/**
 * UI 결과 = 계약 트랜잭션 결과 + '경제 데이터 미확정'(가격 null — 구매를
 * 0원으로 처리하지 않고 트랜잭션 진입 전에 차단했음을 뜻한다, 지시 §4).
 */
export type UiActionResult =
  | TransactionResult
  | { readonly status: 'economyDataUnavailable' };

/** 저장 실패 고정 문구 [보완분 결의 7] — 내부 예외 문자열 비노출 */
export const SAVE_FAILED_MESSAGE =
  '저장에 실패하여 구매가 취소되었습니다. 저장 공간 또는 브라우저 설정을 확인해주세요.';

/** 경제 데이터 미확정 고정 문구 (지시 §4 — 기획 수치표 대기 상태 표기) */
export const ECONOMY_DATA_UNAVAILABLE_MESSAGE =
  '경제 데이터 미확정 — 가격 데이터 대기 중입니다. 구매가 진행되지 않았습니다.';

/**
 * 결과 → 사용자 문구. 색이 아니라 아이콘·문구로 구분한다 (§11 접근성).
 * 불가 5종 + 저장 실패 + 경제 데이터 미확정을 전부 구분 표기 (지시 §5).
 */
export function uiResultMessage(result: UiActionResult): string {
  switch (result.status) {
    case 'success':
      return '✓ 완료되었습니다.';
    case 'saveFailedRolledBack':
      return `✕ ${SAVE_FAILED_MESSAGE}`;
    case 'economyDataUnavailable':
      return `✕ ${ECONOMY_DATA_UNAVAILABLE_MESSAGE}`;
    case 'denied':
      switch (result.reason) {
        case 'insufficientCredits':
          return '✕ 크레딧이 부족합니다.';
        case 'insufficientRareParts':
          return '✕ 희귀 부품이 부족합니다.';
        case 'maxLevelReached':
          return '✕ 이미 최대 단계입니다.';
        case 'noFreeSlot':
          return '✕ 빈 장비 슬롯이 없습니다.';
        case 'alreadyEquipped':
          return '✕ 이미 장착 중인 장비입니다.';
      }
  }
}

/**
 * 재화 HUD 소스 — 메타 루프 실상태의 읽기 전용 단면 (composition root 조립).
 * UI는 매 프레임 다시 읽기만 한다 — 내부 지갑·집계 사본 없음.
 */
export interface EconomyHudSource {
  readonly metaState: MetaStateId;
  /** 확정 자산 (영구 지갑) */
  readonly wallet: CurrencyBundle;
  /** 이번 출항 획득 (정산 전 미확정 집계) */
  readonly sortieEarnings: CurrencyBundle;
}

/** 업그레이드 1항목 표시 뷰 — 공식 카탈로그 값의 무가공 전달 */
export interface UpgradeOfferView {
  readonly statId: UpgradeStatId;
  readonly label: string;
  readonly currentLevel: number;
  readonly maxLevel: number;
  /** 다음 단계 효과(합연산 보정) — 공식 effectBonus. null = 수치표 미도착 */
  readonly nextEffectBonus: number | null;
  /** 다음 단계 가격 — 구성 요소에 null이 하나라도 있으면 null(미확정) */
  readonly cost: CurrencyBundle | null;
  /** 최대 단계 도달 여부 */
  readonly atMaxLevel: boolean;
}

/**
 * 공식 카탈로그(economyMath UpgradeEntry — null 허용) + 현재 단계 →
 * 표시 뷰. 순수 변환만 한다: null은 null로 흐르고, 어떤 값도 발명하지
 * 않는다. 공식 params에 숫자가 채워지면 이 함수 결과가 그대로 활성
 * 가격·효과가 된다 (코드 변경 불필요 — 지시 §4).
 */
export function buildUpgradeOffers(
  catalog: readonly UpgradeEntry[],
  levels: Readonly<Record<string, number>>,
): UpgradeOfferView[] {
  return catalog.map((entry) => {
    const currentLevel = levels[entry.id] ?? 0;
    const atMaxLevel = currentLevel >= entry.maxLevel;
    // 다음 단계 인덱스 = currentLevel (0-기반 배열, 단계 1의 가격 = [0])
    const credits = atMaxLevel ? null : (entry.costCredits[currentLevel] ?? null);
    const rareParts = atMaxLevel ? null : (entry.costRareParts[currentLevel] ?? null);
    const bonus = atMaxLevel ? null : (entry.effectBonus[currentLevel] ?? null);
    return {
      statId: entry.id,
      label: entry.label,
      currentLevel,
      maxLevel: entry.maxLevel,
      nextEffectBonus: bonus,
      cost:
        credits !== null && rareParts !== null
          ? { credits, rareParts }
          : null,
      atMaxLevel,
    };
  });
}
