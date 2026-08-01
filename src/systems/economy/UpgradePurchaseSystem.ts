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

import type {
  CurrencyBundle,
  PurchaseCost,
  PurchaseDenialReason,
  UpgradeModifiers,
  UpgradeStatId,
} from '../../contracts/meta';
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
  private readonly costOf: UpgradeCostResolver;

  /**
   * 저장 포트를 받지 않는다 — 저장·롤백 순서는 리드 정본 트랜잭션 소유이며
   * **게임플레이는 저장소에 접근하지 않는다** (스프린트 A 정규화).
   */
  constructor(
    catalog: readonly UpgradeCatalogEntry[],
    wallet: PurchaseWalletPort,
    costOf: UpgradeCostResolver = (_id, nextLevel) => provisionalUpgradeCost(nextLevel),
  ) {
    this.catalog = catalog;
    this.wallet = wallet;
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
  checkPurchasable(statId: string): PurchaseDenialReason | null {
    return this.evaluateUpgradePurchase(statId as UpgradeStatId).denial;
  }

  /**
   * 공식 판정 포트 `UpgradePurchaseJudgePort`(contracts/meta.ts) 구현.
   * **상태를 바꾸지 않고 판정만** 한다 — 차감·적용·저장·롤백의 순서(틀)는
   * 리드 정본 `src/meta/PurchaseTransaction.ts`가 소유한다 [14차 결의 2].
   * throw 금지: 불가 시 사유, 가능 시 denial=null을 반환한다.
   */
  evaluateUpgradePurchase(id: UpgradeStatId): {
    readonly denial: PurchaseDenialReason | null;
    readonly cost: PurchaseCost;
  } {
    const entry = this.entryOf(id);
    const nextLevel = this.levelOf(id) + 1;
    // 카탈로그 밖·최대 단계는 비용을 산출할 수 없다 — 0 비용으로 거부만 알린다
    if (!entry || nextLevel > entry.maxLevel) {
      return { denial: 'maxLevelReached', cost: { credits: 0, rareParts: 0 } };
    }
    const cost = this.costOf(id, nextLevel);
    if (this.wallet.credits < cost.credits) {
      return { denial: 'insufficientCredits', cost };
    }
    if (this.wallet.rareParts < cost.rareParts) {
      return { denial: 'insufficientRareParts', cost };
    }
    return { denial: null, cost };
  }

  /* ── 공식 단계 포트 `UpgradeLevelsPort` 구현 (롤백용 스냅샷·복원) ── */

  snapshotLevels(): Readonly<Record<string, number>> {
    return this.levelSnapshot;
  }

  /** 구매 확정 후보 적용 — 해당 항목 단계 +1 (트랜잭션만 호출) */
  applyPurchasedLevel(id: UpgradeStatId): void {
    const entry = this.entryOf(id);
    if (!entry) return;
    const next = Math.min(this.levelOf(id) + 1, entry.maxLevel);
    this.levels.set(id, next);
  }

  private entryOf(statId: string): UpgradeCatalogEntry | undefined {
    if (!(OFFICIAL_STAT_IDS as readonly string[]).includes(statId)) return undefined;
    return this.catalog.find((entry) => entry.id === statId);
  }
}
