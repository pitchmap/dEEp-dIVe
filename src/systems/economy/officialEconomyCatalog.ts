/**
 * 공식 경제 카탈로그 어댑터 — `params/upgrades.json`·`params/equipment.json`의
 * 검증된 내용을 게임플레이 판정이 소비하는 읽기 전용 형태로 옮긴다.
 *
 * 원칙 (스프린트 A A8 — 임시 경제 수치 금지):
 *  - **공식 파일이 유일한 가격 출처다.** 값이 `null`이면 "기획 경제 수치표
 *    미도착"이라는 뜻이며, 임의의 숫자로 대체하거나 provisional 비용으로
 *    되돌리지 않는다 — 그 항목은 **구매 불가**로 판정된다.
 *  - **공식 ID 밖은 런타임에서 거부한다** (업그레이드 7종·장비 4종 상한 —
 *    신 스코프 가드의 런타임 방어선). 파일이 상한을 넘겨도 게임플레이가
 *    소비하지 않는다.
 *  - 이 모듈은 **읽기 전용**이다. params 원본을 변형하거나 역기록하지 않는다.
 *
 * 파일 로드·스키마 검증은 툴링 소유(`src/tools/economyMath.ts`)이며, 이
 * 모듈은 그 결과(또는 원본 JSON)를 구조적으로 받아 게임플레이 관점으로만
 * 좁힌다 — 파트 간 직접 import 없이 조립부가 주입한다.
 */

import type { EquipmentId, PurchaseCost, UpgradeStatId } from '../../contracts/meta';

/** 공식 업그레이드 7종 — 계약 `UpgradeStatId`와 1:1 (8번째 금지) */
export const OFFICIAL_UPGRADE_IDS: readonly UpgradeStatId[] = Object.freeze([
  'hullIntegrity',
  'maxSpeed',
  'turnRate',
  'maxDepth',
  'torpedoDamage',
  'reloadSpeed',
  'sonarRange',
]);

/** 공식 장비 4종 — 계약 `EquipmentId`와 1:1 (5번째 금지) */
export const OFFICIAL_EQUIPMENT_IDS: readonly EquipmentId[] = Object.freeze([
  'standardTorpedo',
  'fastTorpedo',
  'heavyTorpedo',
  'decoy',
]);

/** 미확정 수치 — 공식 파일의 `null`을 그대로 옮긴다 (임의 대입 금지) */
export type PendingNumber = number | null;

/** 업그레이드 1항목의 게임플레이 소비 단면 */
export interface UpgradeCatalogEntry {
  readonly id: UpgradeStatId;
  readonly label: string;
  readonly maxLevel: number;
  /** 단계별 크레딧 가격 (index 0 = 1단계). null = 미확정 */
  readonly costCredits: readonly PendingNumber[];
  /** 단계별 희귀 부품 요구량. null = 미확정 */
  readonly costRareParts: readonly PendingNumber[];
  /** 단계별 합연산 보정. null = 미확정 → 보정 0으로 취급(효과 발명 금지) */
  readonly effectBonus: readonly PendingNumber[];
}

/** 장비 1항목의 게임플레이 소비 단면 (성능이 아니라 **가격·해금** 정보) */
export interface EquipmentCatalogEntry {
  readonly id: EquipmentId;
  readonly label: string;
  readonly costCredits: PendingNumber;
  readonly costRareParts: PendingNumber;
}

export interface EquipmentCatalog {
  /** 공식 슬롯 수. null = 미확정 (게임플레이는 임의 값을 만들지 않는다) */
  readonly slotCapacity: PendingNumber;
  readonly items: readonly EquipmentCatalogEntry[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pendingNumber(value: unknown): PendingNumber {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pendingArray(value: unknown, length: number): readonly PendingNumber[] {
  const source = Array.isArray(value) ? value : [];
  return Object.freeze(
    Array.from({ length }, (_unused, index) => pendingNumber(source[index])),
  );
}

/**
 * 공식 업그레이드 카탈로그 읽기 — 공식 7종만 통과시킨다.
 * 파일에 없는 공식 항목은 목록에서 빠지고(구매 대상 아님), 공식 목록 밖
 * id는 무시된다.
 */
export function readOfficialUpgradeCatalog(raw: unknown): readonly UpgradeCatalogEntry[] {
  const root = asRecord(raw);
  const items = Array.isArray(root?.['items']) ? (root['items'] as unknown[]) : [];
  const entries: UpgradeCatalogEntry[] = [];

  for (const item of items) {
    const record = asRecord(item);
    if (!record) continue;
    const id = record['id'];
    if (typeof id !== 'string') continue;
    if (!(OFFICIAL_UPGRADE_IDS as readonly string[]).includes(id)) continue; // 8번째 거부
    if (entries.some((entry) => entry.id === id)) continue; // 중복 정의 거부

    const maxLevel = pendingNumber(record['maxLevel']);
    if (maxLevel === null || maxLevel <= 0) continue; // 단계 정의 없는 항목은 구매 대상 아님

    entries.push(
      Object.freeze({
        id: id as UpgradeStatId,
        label: typeof record['label'] === 'string' ? record['label'] : id,
        maxLevel: Math.floor(maxLevel),
        costCredits: pendingArray(record['costCredits'], Math.floor(maxLevel)),
        costRareParts: pendingArray(record['costRareParts'], Math.floor(maxLevel)),
        effectBonus: pendingArray(record['effectBonus'], Math.floor(maxLevel)),
      }),
    );
  }
  return Object.freeze(entries);
}

/** 공식 장비 카탈로그 읽기 — 공식 4종만 통과시킨다 */
export function readOfficialEquipmentCatalog(raw: unknown): EquipmentCatalog {
  const root = asRecord(raw);
  const items = Array.isArray(root?.['items']) ? (root['items'] as unknown[]) : [];
  const entries: EquipmentCatalogEntry[] = [];

  for (const item of items) {
    const record = asRecord(item);
    if (!record) continue;
    const id = record['id'];
    if (typeof id !== 'string') continue;
    if (!(OFFICIAL_EQUIPMENT_IDS as readonly string[]).includes(id)) continue; // 5번째 거부
    if (entries.some((entry) => entry.id === id)) continue;

    entries.push(
      Object.freeze({
        id: id as EquipmentId,
        label: typeof record['label'] === 'string' ? record['label'] : id,
        costCredits: pendingNumber(record['costCredits']),
        costRareParts: pendingNumber(record['costRareParts']),
      }),
    );
  }

  return Object.freeze({
    slotCapacity: pendingNumber(root?.['slotCapacity']),
    items: Object.freeze(entries),
  });
}

/**
 * 다음 단계 비용 — **공식 값이 하나라도 미확정이면 null**(구매 불가).
 * null을 0이나 임의 값으로 해석하지 않는다.
 */
export function upgradeCostAtLevel(
  entry: UpgradeCatalogEntry,
  nextLevel: number,
): PurchaseCost | null {
  if (nextLevel < 1 || nextLevel > entry.maxLevel) return null;
  const credits = entry.costCredits[nextLevel - 1] ?? null;
  const rareParts = entry.costRareParts[nextLevel - 1] ?? null;
  if (credits === null || rareParts === null) return null; // 미확정 → 구매 불가
  if (credits < 0 || rareParts < 0) return null; // 음수 가격 거부
  return { credits, rareParts };
}

/** 단계별 합연산 보정 합 — 미확정 단계는 0으로 취급(효과를 발명하지 않는다) */
export function upgradeBonusSum(entry: UpgradeCatalogEntry, level: number): number {
  let sum = 0;
  for (let index = 0; index < Math.min(level, entry.maxLevel); index += 1) {
    sum += entry.effectBonus[index] ?? 0;
  }
  return sum;
}

/** 장비 구매 비용 — 미확정이면 null (null을 '구매 가능'으로 해석 금지) */
export function equipmentCost(entry: EquipmentCatalogEntry): PurchaseCost | null {
  if (entry.costCredits === null || entry.costRareParts === null) return null;
  if (entry.costCredits < 0 || entry.costRareParts < 0) return null;
  return { credits: entry.costCredits, rareParts: entry.costRareParts };
}
