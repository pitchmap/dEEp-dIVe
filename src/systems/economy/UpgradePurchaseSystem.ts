/**
 * 업그레이드 구매 판정 — 계약 `UpgradePurchaseJudgePort`·`UpgradeLevelsPort`
 * 구현. 게임플레이 창의 '판정 내용' 소유분 (틀=리드 `PurchaseTransaction`).
 *
 * 경계 [14차 결의 2 / INT-CORE-009 지침]:
 *  - 이 시스템은 **상태를 스스로 확정하지 않는다.** 차감·저장·롤백 순서는
 *    리드 트랜잭션이 소유하며, 여기서는 판정(evaluate)과 트랜잭션이 지시하는
 *    후보 적용(applyPurchasedLevel)·스냅샷/복원만 수행한다.
 *  - **저장소에 접근하지 않는다** — save 포트를 보유하지 않는다.
 *
 * 경제 데이터 규칙 [스프린트 A A8]:
 *  - 가격·효과는 **공식 params(upgrades.json)에서만** 온다. provisional 비용
 *    경로는 존재하지 않는다(파일 삭제).
 *  - 공식 값이 `null`(기획 수치표 미도착)이면 그 단계는 **구매 불가**다 —
 *    임의 값 대입·0 취급·'구매 가능' 해석 금지. 사유는 계약이 신설한
 *    `economyDataUnavailable`(INT-CORE-010)이며, UI는 `nextCost()`가 null인
 *    것으로 '가격 데이터 대기'를 표시하고 버튼을 비활성화한다.
 *  - 공식 `UpgradeStatId` 7종 밖 id는 런타임에서 거부한다(8번째 금지).
 *
 * 조립 호환 [INT-CORE-011 병합]: 조립부는 공식 카탈로그 전체를 넘기거나
 * (권장 — 가격·보정이 전부 params에서 온다), 축약 카탈로그 + 비용 resolver를
 * 넘길 수 있다. 어느 쪽이든 **가격의 출처는 공식 params 하나**이며 이
 * 시스템은 provisional 비용 경로를 갖지 않는다.
 */

import type {
  PurchaseCost,
  PurchaseDenialReason,
  UpgradeModifiers,
  UpgradeStatId,
} from '../../contracts/meta';
import {
  OFFICIAL_UPGRADE_IDS,
  upgradeBonusSum,
  upgradeCostAtLevel,
  type UpgradeCatalogEntry,
} from './officialEconomyCatalog';

/** 지갑 조회 포트 — 판정에만 쓰인다 (차감은 리드 트랜잭션 소유) */
export interface PurchaseWalletPort {
  readonly credits: number;
  readonly rareParts: number;
  /**
   * 조립부 호환용 — **이 시스템은 호출하지 않는다.** 지갑 변경은 리드
   * `PurchaseTransaction`(WalletTransactionPort) 한 곳뿐이다 (저장 책임 표).
   */
  applyDelta?(creditsDelta: number, rarePartsDelta: number): void;
}

/** 조립부가 넘길 수 있는 축약 카탈로그 단면 (가격은 resolver가 공급) */
export interface CompactUpgradeEntry {
  readonly id: UpgradeStatId;
  readonly maxLevel: number;
  /** 표기용 단계 보정 — 공식 단계별 배열이 없을 때만 쓰인다 */
  readonly bonusPerLevel: number;
  readonly label?: string;
}

/** 비용 조회 함수 — 공식 params 파생값만 반환해야 한다 */
export type UpgradeCostResolver = (statId: UpgradeStatId, nextLevel: number) => PurchaseCost;

function isCompactEntry(
  entry: UpgradeCatalogEntry | CompactUpgradeEntry,
): entry is CompactUpgradeEntry {
  return !Array.isArray((entry as UpgradeCatalogEntry).costCredits);
}

/** 축약 항목 → 공식 형태. 가격은 전부 미확정(null)으로 두고 resolver에 맡긴다 */
function normalizeEntry(entry: UpgradeCatalogEntry | CompactUpgradeEntry): UpgradeCatalogEntry {
  if (!isCompactEntry(entry)) return entry;
  const levels = Math.max(0, Math.floor(entry.maxLevel));
  return Object.freeze({
    id: entry.id,
    label: entry.label ?? entry.id,
    maxLevel: levels,
    costCredits: Object.freeze(Array.from({ length: levels }, () => null)),
    costRareParts: Object.freeze(Array.from({ length: levels }, () => null)),
    effectBonus: Object.freeze(Array.from({ length: levels }, () => entry.bonusPerLevel)),
  });
}

/** UI 표시용 구매 제안 — 가격 미확정은 cost=null로 그대로 드러낸다 */
export interface UpgradeOffer {
  readonly id: UpgradeStatId;
  readonly label: string;
  readonly currentLevel: number;
  readonly maxLevel: number;
  /** 다음 단계 가격 — 공식 값 미확정이면 null (UI가 가격을 발명하지 않게) */
  readonly nextCost: PurchaseCost | null;
  /** 판정 결과 — null이면 구매 가능 */
  readonly denial: PurchaseDenialReason | null;
}

export class UpgradePurchaseSystem {
  private levels = new Map<string, number>();

  // 검증 러너(run.mjs) Node 타입 스트리핑 호환 — 매개변수 프로퍼티 미사용
  private catalog: readonly UpgradeCatalogEntry[];
  private readonly wallet: PurchaseWalletPort;
  private readonly costResolver: UpgradeCostResolver | null;

  constructor(
    catalog: readonly (UpgradeCatalogEntry | CompactUpgradeEntry)[],
    wallet: PurchaseWalletPort,
    /** 조립부가 공식 params로 만든 비용 조회 함수 (없으면 카탈로그 배열 사용) */
    costResolver?: UpgradeCostResolver,
  ) {
    this.catalog = catalog.map(normalizeEntry);
    this.wallet = wallet;
    this.costResolver = costResolver ?? null;
  }

  /** 공식 카탈로그 교체 (params 핫리로드) — 단계 상태는 유지된다 */
  applyCatalog(catalog: readonly (UpgradeCatalogEntry | CompactUpgradeEntry)[]): void {
    this.catalog = catalog.map(normalizeEntry);
  }

  /** 공식 카탈로그 (읽기 전용) — 기지 UI가 목록을 그릴 때 소비 */
  get entries(): readonly UpgradeCatalogEntry[] {
    return this.catalog;
  }

  /** 저장에서 복원한 단계 주입 (부팅 시 1회 — 구매 경로가 아니다) */
  restoreLevels(levels: Readonly<Record<string, number>>): void {
    this.levels = new Map(
      Object.entries(levels)
        .filter(([id]) => this.entryOf(id) !== undefined)
        .map(([id, level]) => [id, this.clampLevel(id, level)]),
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

  /**
   * 확정 단계 기준 합연산 보정 — 유효 파라미터 산출 입력.
   * 공식 effectBonus가 미확정(null)인 단계는 0으로 취급한다 (효과 발명 금지).
   */
  get modifiers(): UpgradeModifiers {
    const result: Record<string, number> = {};
    for (const entry of this.catalog) {
      const level = this.levelOf(entry.id);
      if (level <= 0) continue;
      const sum = upgradeBonusSum(entry, level);
      if (sum !== 0) result[entry.id] = sum;
    }
    return result as UpgradeModifiers;
  }

  /** 다음 단계 가격 — 최대 단계이거나 공식 값 미확정이면 null */
  nextCost(statId: string): PurchaseCost | null {
    const entry = this.entryOf(statId);
    if (!entry) return null;
    return this.costAt(entry, this.levelOf(statId) + 1);
  }

  /**
   * 단계 비용 조회 — resolver가 있으면 그쪽이 우선(조립부가 공식 params로
   * 만든 함수), 없으면 공식 카탈로그 배열. 유한하지 않거나 음수인 값은
   * '미확정'으로 본다 (임의 값으로 바꾸지 않는다).
   */
  private costAt(entry: UpgradeCatalogEntry, nextLevel: number): PurchaseCost | null {
    if (nextLevel < 1 || nextLevel > entry.maxLevel) return null;
    if (this.costResolver === null) return upgradeCostAtLevel(entry, nextLevel);
    const resolved = this.costResolver(entry.id, nextLevel);
    if (!Number.isFinite(resolved.credits) || !Number.isFinite(resolved.rareParts)) return null;
    if (resolved.credits < 0 || resolved.rareParts < 0) return null;
    return resolved;
  }

  /** 기지 UI용 제안 목록 — 공식 카탈로그 순서 그대로 */
  listOffers(): readonly UpgradeOffer[] {
    return this.catalog.map((entry) => {
      const judged = this.evaluateUpgradePurchase(entry.id);
      return {
        id: entry.id,
        label: entry.label,
        currentLevel: this.levelOf(entry.id),
        maxLevel: entry.maxLevel,
        nextCost: this.nextCost(entry.id),
        denial: judged.denial,
      };
    });
  }

  /**
   * 계약 `UpgradePurchaseJudgePort` 구현 — **무변경 판정**. throw 금지.
   *
   * 판정 순서: 공식 항목 여부 → 최대 단계 → 가격 확정 여부 → 잔액.
   * 가격 미확정(공식 null)은 계약이 신설한 `economyDataUnavailable`로 거부한다
   * [INT-CORE-010 — INT-GAME-010 요청에 대한 리드 결정]. 상태·저장은 변경되지
   * 않으며 UI에는 `nextCost=null`이 함께 전달된다.
   */
  evaluateUpgradePurchase(id: UpgradeStatId): {
    readonly denial: PurchaseDenialReason | null;
    readonly cost: PurchaseCost;
  } {
    const entry = this.entryOf(id);
    const noCost: PurchaseCost = { credits: 0, rareParts: 0 };
    if (!entry) return { denial: 'maxLevelReached', cost: noCost };

    const nextLevel = this.levelOf(id) + 1;
    if (nextLevel > entry.maxLevel) return { denial: 'maxLevelReached', cost: noCost };

    const cost = this.costAt(entry, nextLevel);
    if (!cost) return { denial: 'economyDataUnavailable', cost: noCost }; // 공식 가격 미확정

    if (this.wallet.credits < cost.credits) return { denial: 'insufficientCredits', cost };
    if (this.wallet.rareParts < cost.rareParts) {
      return { denial: 'insufficientRareParts', cost };
    }
    return { denial: null, cost };
  }

  /* ── 계약 `UpgradeLevelsPort` 구현 (롤백용 스냅샷·복원) ── */

  snapshotLevels(): Readonly<Record<string, number>> {
    return this.levelSnapshot;
  }

  /** 구매 확정 후보 적용 — 해당 항목 단계 +1 (리드 트랜잭션만 호출) */
  applyPurchasedLevel(id: UpgradeStatId): void {
    const entry = this.entryOf(id);
    if (!entry) return;
    this.levels.set(id, Math.min(this.levelOf(id) + 1, entry.maxLevel));
  }

  private clampLevel(statId: string, level: number): number {
    const entry = this.entryOf(statId);
    const max = entry ? entry.maxLevel : 0;
    if (!Number.isFinite(level)) return 0;
    return Math.min(Math.max(0, Math.floor(level)), max);
  }

  private entryOf(statId: string): UpgradeCatalogEntry | undefined {
    if (!(OFFICIAL_UPGRADE_IDS as readonly string[]).includes(statId)) return undefined;
    return this.catalog.find((entry) => entry.id === statId);
  }
}
