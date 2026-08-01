/**
 * 성장·경제 UI 연결점(포트) — Sprint A 창3 (14차 회의).
 *
 * 원칙 (과제 §7~§9):
 *  - UI는 **실제 상태 소비 + command 호출 + 결과 표시**만 한다.
 *  - 지갑·집계를 UI 내부에 복제하지 않는다 (임시 지갑 금지) — 표시 값은
 *    매 프레임 소스에서 다시 읽는다.
 *  - 구매·장착 판정, 재화 차감, 저장 트랜잭션·rollback은 게임플레이·리드
 *    소유 — UI는 결과 코드를 사유 문구로 바꿔 보여줄 뿐이다.
 *  - 공식 경제 데이터(가격)가 없는 동안 UI는 가격을 **발명하지 않는다**:
 *    cost=null → 가격 미표시 + 구매 버튼 비활성('가격 데이터 대기').
 *
 * 정식 계약(contracts/*) 이관은 docs/INTEGRATION_NOTES.md의 INT-RENDER-008
 * 요청 절차를 따른다 — 여기 타입은 그 전까지의 구조적 소비 인터페이스다.
 */

import type { CurrencyBundle, EquipmentId, MetaStateId } from '../contracts/meta';

/** 확정 지갑 + 메타 상태 — MetaLoop 실상태의 읽기 전용 구조적 단면 */
export interface MetaWalletSource {
  readonly metaState: MetaStateId;
  readonly wallet: CurrencyBundle;
}

/**
 * 이번 출항 획득 집계 (미확정 재화) — 메타 루프 내부 집계의 공개 getter가
 * 아직 없다(게임플레이·리드 상태 요청 중). 소스 미주입 시 UI는 '집계
 * 배선 대기'로 표기하고 값을 UI에서 계산하지 않는다 (임시 지갑 금지).
 */
export interface SortieEarningsSource {
  readonly creditsEarnedThisSortie: number;
  readonly rarePartsSecuredThisSortie: number;
}

/** 구매·장착 불가 사유 5종(과제 §8) + 저장 실패 */
export type MetaCommandFailure =
  | 'insufficientCredits'
  | 'insufficientRareParts'
  | 'maxLevel'
  | 'slotFull'
  | 'alreadyEquipped'
  | 'saveFailed';

export type MetaCommandResult = 'ok' | MetaCommandFailure;

/**
 * 저장 실패 고정 문구 (과제 §8 지정 문구 그대로) — 내부 예외 문자열을
 * 사용자에게 노출하지 않는다.
 */
export const SAVE_FAILED_MESSAGE =
  '저장에 실패하여 구매가 취소되었습니다. 저장 공간 또는 브라우저 설정을 확인해주세요.';

/** 결과 코드 → 사용자 문구. 색이 아니라 아이콘·문구로 전달한다 (§11) */
export function resultMessage(result: MetaCommandResult): string {
  switch (result) {
    case 'ok':
      return '✓ 완료되었습니다.';
    case 'insufficientCredits':
      return '✕ 크레딧이 부족합니다.';
    case 'insufficientRareParts':
      return '✕ 희귀 부품이 부족합니다.';
    case 'maxLevel':
      return '✕ 이미 최대 단계입니다.';
    case 'slotFull':
      return '✕ 빈 장비 슬롯이 없습니다.';
    case 'alreadyEquipped':
      return '✕ 이미 장착 중인 장비입니다.';
    case 'saveFailed':
      return `✕ ${SAVE_FAILED_MESSAGE}`;
  }
}

/**
 * 업그레이드 1항목 표시 모델. 이름·단계·효과는 공식 카탈로그(params) 값의
 * 전달이며 UI가 수치를 만들지 않는다. cost=null = 공식 가격 데이터 부재.
 */
export interface UpgradeOfferView {
  readonly statId: string;
  readonly displayName: string;
  readonly currentLevel: number;
  readonly maxLevel: number;
  /** 다음 단계 효과 설명 — 공식 bonusPerLevel 기반 문구. 부재 시 null */
  readonly nextEffectText: string | null;
  /** 다음 단계 가격 — 공식 경제 params 부재 시 null (UI 가격 발명 금지) */
  readonly cost: CurrencyBundle | null;
}

/**
 * 업그레이드 구매 포트. purchase=null = 구매 트랜잭션(판정·차감·저장·rollback,
 * 리드 소유) 미배선 — UI는 구매 버튼을 비활성으로 두고 사유를 표기한다.
 */
export interface UpgradePurchasePort {
  listOffers(): readonly UpgradeOfferView[];
  purchase: ((statId: string) => MetaCommandResult) | null;
}

/**
 * 장비 command 포트 — 장착 상태는 읽기 전용, 변경은 command 호출뿐이다
 * (UI가 loadout 배열을 직접 만들거나 고치지 않는다, 과제 §9).
 */
export interface EquipmentUiPort {
  readonly slots: readonly (EquipmentId | null)[];
  equip(slotIndex: number, id: EquipmentId): MetaCommandResult;
  unequip(slotIndex: number): MetaCommandResult;
}

/** 출항 확정 포트 — 확정 직전 저장(리드·툴링 구조)을 포함한 결과를 돌려준다 */
export interface DeparturePort {
  /** 실패(saveFailed) 시 호출 측 구현이 해역 전환을 하지 않아야 한다 (§10) */
  confirmDeparture(): MetaCommandResult;
}

/**
 * 실존 게임플레이 EquipmentSystem(불리언 결과) → 결과 코드 어댑터.
 * 판정은 전부 시스템이 한다 — 여기서는 거부(false)에 사유 라벨만 붙인다
 * (거부 원인 구분은 시스템의 읽기 전용 slots 상태로만 판별).
 * 저장 트랜잭션·rollback은 리드 구조 대기 — 배선되면 이 어댑터를 대체한다.
 */
export function createEquipmentUiPort(system: {
  readonly slots: readonly (EquipmentId | null)[];
  equip(slotIndex: number, id: EquipmentId): boolean;
  unequip(slotIndex: number): void;
}): EquipmentUiPort {
  return {
    get slots(): readonly (EquipmentId | null)[] {
      return system.slots;
    },
    equip(slotIndex: number, id: EquipmentId): MetaCommandResult {
      if (system.equip(slotIndex, id)) return 'ok';
      // 시스템 거부 사유 구분: 이미 어느 슬롯엔가 장착됨 vs 슬롯 범위 밖
      return system.slots.includes(id) ? 'alreadyEquipped' : 'slotFull';
    },
    unequip(slotIndex: number): MetaCommandResult {
      system.unequip(slotIndex);
      return 'ok';
    },
  };
}
