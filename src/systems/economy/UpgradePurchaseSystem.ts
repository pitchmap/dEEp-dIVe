/**
 * 업그레이드 구매 판정 — 게임플레이 창(창 2)의 '판정 내용'.
 *
 * 트랜잭션 규격 [13차 보완분 결의 7 — 원자성]:
 * ```
 * 구매 전 상태 스냅샷 → 구매 가능 여부 재검증 → 크레딧 차감
 *  → 업그레이드 단계 변경 → 저장 시도
 *  → 저장 성공 시 구매 확정 / 저장 실패 시 구매 전 상태로 롤백
 * ```
 * - 부분 성공 없음: 중간 단계 하나라도 실패하면 지갑·단계 모두 구매 전 값.
 * - 저장 실패는 일반 불가 사유와 **구분**해 반환한다(카테고리 분리).
 * - 구매 성공 후보 상태는 저장까지 성공해 **확정되기 전에는 외부로 노출되지
 *   않는다** — 지갑·단계 반영은 커밋 시점에 한 번에 이뤄진다.
 *
 * 범위 규칙:
 *  - 테크 트리·선행 조건 **없음** (6차 결의 — 1층 7항목 평면 구조).
 *  - 8번째 항목 추가 금지 — 카탈로그가 공식 `UpgradeStatId` 7종을 벗어나면
 *    구매를 거부한다(신 스코프 가드의 런타임 방어선).
 *  - 가격·효과는 공식 params에서 읽는다(주입). **params 원본을 mutate하지
 *    않는다** — 이 시스템은 카탈로그를 읽기만 한다.
 */

import type { CurrencyBundle, UpgradeModifiers, UpgradeStatId } from '../../contracts/meta';
import {
  conditionFailure,
  saveFailure,
  type UpgradePurchaseResult,
} from './purchaseTypes';
import { provisionalUpgradeCost } from './provisionalUpgradeCost';

/** 공식 업그레이드 항목 7종 — 계약 UpgradeStatId와 1:1 (8번째 금지) */
const OFFICIAL_STAT_IDS: readonly UpgradeStatId[] = [
  'hullIntegrity',
  'maxSpeed',
  'turnRate',
  'maxDepth',
  'torpedoDamage',
  'reloadSpeed',
  'sonarRange',
];

/** 카탈로그 항목 — 공식 params(upgrades.json) 정의의 읽기 전용 단면 */
export interface UpgradeCatalogEntry {
  readonly id: string;
  readonly maxLevel: number;
  readonly bonusPerLevel: number;
}

/** 지갑 포트 — 리드 메타 지갑(MetaLoop) 또는 저장 지갑이 충족 (조립부 주입) */
export interface PurchaseWalletPort {
  readonly credits: number;
  readonly rareParts: number;
  /** 차감·환불을 한 번에 적용 (음수 = 차감). 커밋·롤백에서만 호출된다 */
  applyDelta(creditsDelta: number, rarePartsDelta: number): void;
}

/**
 * 저장 포트 — 툴링 저장소가 충족한다 [결의 4: 구매 성공 직후 즉시 저장].
 * 성공 여부만 반환하고, 실패 원인(예외)은 호출자가 개발 로그로만 남긴다.
 */
export interface PurchaseSavePort {
  save(): boolean;
}

/** 다음 단계 가격 계산 (주입) — 공식 경제 params 도착 시 교체 */
export type UpgradeCostResolver = (statId: string, nextLevel: number) => CurrencyBundle;

export class UpgradePurchaseSystem {
  private levels = new Map<string, number>();

  // 검증 러너(run.mjs) Node 타입 스트리핑 호환 — 매개변수 프로퍼티 미사용
  private readonly catalog: readonly UpgradeCatalogEntry[];
  private readonly wallet: PurchaseWalletPort;
  private readonly save: PurchaseSavePort;
  private readonly costOf: UpgradeCostResolver;

  constructor(
    catalog: readonly UpgradeCatalogEntry[],
    wallet: PurchaseWalletPort,
    save: PurchaseSavePort,
    costOf: UpgradeCostResolver = (_id, nextLevel) => provisionalUpgradeCost(nextLevel),
  ) {
    this.catalog = catalog;
    this.wallet = wallet;
    this.save = save;
    this.costOf = costOf;
  }

  /** 저장에서 복원한 단계 주입 (부팅 시 1회 — 구매 경로가 아니다) */
  restoreLevels(levels: Readonly<Record<string, number>>): void {
    this.levels = new Map(
      Object.entries(levels)
        .filter(([id]) => this.entryOf(id) !== undefined)
        .map(([id, level]) => [id, Math.max(0, Math.floor(level))]),
    );
  }

  /** 현재 단계 (미구매 = 0) */
  levelOf(statId: string): number {
    return this.levels.get(statId) ?? 0;
  }

  /** 확정 단계 스냅샷 — 저장·UI가 읽는다 (구매 후보 상태는 포함되지 않는다) */
  get levelSnapshot(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.levels);
  }

  /** 확정 단계 기준 합연산 보정 — 유효 파라미터 산출 입력 */
  get modifiers(): UpgradeModifiers {
    const result: Record<string, number> = {};
    for (const entry of this.catalog) {
      const level = this.levelOf(entry.id);
      if (level > 0) result[entry.id] = entry.bonusPerLevel * level;
    }
    return result as UpgradeModifiers;
  }

  /** 다음 단계 가격 (UI 표시용) — 최대 단계면 null */
  nextCost(statId: string): CurrencyBundle | null {
    const entry = this.entryOf(statId);
    if (!entry) return null;
    const nextLevel = this.levelOf(statId) + 1;
    if (nextLevel > entry.maxLevel) return null;
    return this.costOf(statId, nextLevel);
  }

  /**
   * 구매 가능 여부만 검사 (상태 변경 없음) — UI 비활성·사유 표시용.
   * 성공 시 null, 불가 시 사유를 반환한다.
   */
  checkPurchasable(statId: string): UpgradePurchaseResult | null {
    const entry = this.entryOf(statId);
    if (!entry) return conditionFailure('maxLevelReached'); // 미등록·8번째 항목은 구매 불가

    const nextLevel = this.levelOf(statId) + 1;
    if (nextLevel > entry.maxLevel) return conditionFailure('maxLevelReached');

    const cost = this.costOf(statId, nextLevel);
    if (this.wallet.credits < cost.credits) return conditionFailure('insufficientCredits');
    if (this.wallet.rareParts < cost.rareParts) return conditionFailure('insufficientRareParts');
    return null;
  }

  /**
   * 구매 실행 — 원자적 트랜잭션. 저장까지 성공해야 확정된다.
   * 실패 시 지갑·단계는 호출 전과 **완전히 동일**하며, 실패 직후 조건이
   * 충족되면 재구매가 가능하다.
   */
  purchase(statId: string): UpgradePurchaseResult {
    // 1) 구매 전 상태 스냅샷
    const snapshotLevel = this.levelOf(statId);
    const snapshotCredits = this.wallet.credits;
    const snapshotRareParts = this.wallet.rareParts;

    // 2) 구매 가능 여부 재검증
    const rejection = this.checkPurchasable(statId);
    if (rejection) return rejection;

    const entry = this.entryOf(statId);
    if (!entry) return conditionFailure('maxLevelReached');
    const nextLevel = snapshotLevel + 1;
    const cost = this.costOf(statId, nextLevel);

    // 3~4) 크레딧 차감 + 단계 변경 (아직 '후보' 상태 — 저장 성공 전)
    this.wallet.applyDelta(-cost.credits, -cost.rareParts);
    this.levels.set(statId, nextLevel);

    // 5) 저장 시도
    let saved = false;
    try {
      saved = this.save.save();
    } catch (error) {
      // 내부 예외 문자열은 사용자에게 노출하지 않는다 — 개발 로그만
      console.warn('[UpgradePurchaseSystem] 저장 실패로 구매를 롤백합니다.', error);
      saved = false;
    }

    if (!saved) {
      // 6) 롤백 — 지갑·단계 모두 구매 전 값으로 복원 (부분 성공 없음)
      this.wallet.applyDelta(
        snapshotCredits - this.wallet.credits,
        snapshotRareParts - this.wallet.rareParts,
      );
      if (snapshotLevel === 0) this.levels.delete(statId);
      else this.levels.set(statId, snapshotLevel);
      return saveFailure();
    }

    // 7) 구매 확정
    return { ok: true, statId, level: nextLevel, spent: cost };
  }

  private entryOf(statId: string): UpgradeCatalogEntry | undefined {
    if (!(OFFICIAL_STAT_IDS as readonly string[]).includes(statId)) return undefined;
    return this.catalog.find((entry) => entry.id === statId);
  }
}
