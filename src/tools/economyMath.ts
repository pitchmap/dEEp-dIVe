/**
 * 공식 경제·업그레이드·장비 params 검증 (툴링 소유 — 7차 결의 4, 소회의 13).
 *
 * 검증 원칙 (작업 지시 §4 + 신 스코프 가드):
 *  - 업그레이드 7항목 초과 거부 / 장비 4종 초과 거부 (6차 결의 2)
 *  - 음수 가격 거부 (크레딧·희귀 부품 모두)
 *  - 존재하지 않는 paramRef 거부 — 실제 params 트리에서 해석 가능해야 한다
 *  - 단계 배열 누락 거부 — 단계별 가격·배율 배열이 maxLevel과 길이가 맞아야 함
 *  - 미확정 필드는 `null`로 명시한다. **임의의 숫자를 발명하지 않는다** —
 *    null은 '기획 수치표 대기'를 뜻하며, 검증은 통과시키되
 *    `pendingFields()`가 목록으로 보고한다 (provisional을 확정값으로 위장 금지).
 *
 * 계약 상한은 src/contracts/meta.ts의 UpgradeStatId(7)·EquipmentId(4) 유니언과
 * 1:1 대응한다 — id가 계약 밖이면 거부한다.
 */

import { ParamValidationError } from '../config/validateParams';

const UPGRADES_FILE = 'params/upgrades.json';
const EQUIPMENT_FILE = 'params/equipment.json';

/** 계약(meta.ts UpgradeStatId)의 공식 7항목 — 초과·미지 id 거부 기준 */
export const OFFICIAL_UPGRADE_IDS = [
  'hullIntegrity',
  'maxSpeed',
  'turnRate',
  'maxDepth',
  'torpedoDamage',
  'reloadSpeed',
  'sonarRange',
] as const;

/** 계약(meta.ts EquipmentId)의 공식 4종 */
export const OFFICIAL_EQUIPMENT_IDS = [
  'standardTorpedo',
  'fastTorpedo',
  'heavyTorpedo',
  'decoy',
] as const;

export const MAX_UPGRADE_ITEMS = OFFICIAL_UPGRADE_IDS.length;
export const MAX_EQUIPMENT_ITEMS = OFFICIAL_EQUIPMENT_IDS.length;

export type OfficialUpgradeId = (typeof OFFICIAL_UPGRADE_IDS)[number];
export type OfficialEquipmentId = (typeof OFFICIAL_EQUIPMENT_IDS)[number];

/** 미확정 수치는 null — 기획 수치표(D+3 병목) 도착 전 상태를 정직하게 표현 */
export type PendingNumber = number | null;

export interface UpgradeEntry {
  readonly id: OfficialUpgradeId;
  readonly label: string;
  /** 단계 상한 */
  readonly maxLevel: number;
  /** 단계별 크레딧 가격 — 길이 = maxLevel. 미확정 단계는 null */
  readonly costCredits: readonly PendingNumber[];
  /** 단계별 희귀 부품 요구량 — 길이 = maxLevel. 미확정은 null */
  readonly costRareParts: readonly PendingNumber[];
  /** 단계별 누적 효과 배율(합연산 보정) — 길이 = maxLevel. 미확정은 null */
  readonly effectBonus: readonly PendingNumber[];
  /** 기준값 파라미터 경로 (해석 불가 시 거부). 대상 params 미도입 항목은 생략 */
  readonly paramRef?: string;
  readonly note?: string;
}

export interface EquipmentEntry {
  readonly id: OfficialEquipmentId;
  readonly label: string;
  readonly costCredits: PendingNumber;
  readonly costRareParts: PendingNumber;
  readonly note?: string;
}

export interface EquipmentCatalog {
  /** 장비 슬롯 규칙 — 동시 장착 가능 종수 */
  readonly slotCapacity: PendingNumber;
  readonly items: readonly EquipmentEntry[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 가격류: null(미확정) 허용, 숫자면 0 이상 유한값만 — 음수 거부 */
function validateCost(file: string, path: string, value: unknown): PendingNumber {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ParamValidationError(file, path, `숫자 또는 null(미확정)이 필요합니다 (받은 값: ${JSON.stringify(value)})`);
  }
  if (value < 0) {
    throw new ParamValidationError(file, path, `음수 가격은 허용되지 않습니다 (받은 값: ${value})`);
  }
  return value;
}

function validateLevelArray(
  file: string,
  path: string,
  value: unknown,
  maxLevel: number,
  allowNegative = false,
): readonly PendingNumber[] {
  if (!Array.isArray(value)) {
    throw new ParamValidationError(file, path, `길이 ${maxLevel}의 단계 배열이 필요합니다 (누락 거부)`);
  }
  if (value.length !== maxLevel) {
    throw new ParamValidationError(
      file,
      path,
      `단계 배열 길이가 maxLevel과 다릅니다 (기대 ${maxLevel}, 받은 ${value.length})`,
    );
  }
  return value.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (entry === null) return null;
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      throw new ParamValidationError(file, entryPath, '숫자 또는 null(미확정)이 필요합니다');
    }
    if (!allowNegative && entry < 0) {
      throw new ParamValidationError(file, entryPath, `음수는 허용되지 않습니다 (받은 값: ${entry})`);
    }
    return entry;
  });
}

/** paramRef 경로가 실제 params 트리에서 해석되는지 확인 (미해석 → 거부) */
export function resolveParamRef(paramsRoot: unknown, ref: string): number | null {
  let node: unknown = paramsRoot;
  for (const segment of ref.split('.')) {
    if (!isRecord(node)) return null;
    node = node[segment];
  }
  if (isRecord(node) && 'value' in node) {
    const value = node['value'];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  return typeof node === 'number' && Number.isFinite(node) ? node : null;
}

/**
 * 업그레이드 카탈로그 검증.
 * @param paramsRoot paramRef 해석에 사용할 params 트리 (없으면 paramRef 검사 생략)
 */
export function validateUpgradeCatalog(raw: unknown, paramsRoot?: unknown): UpgradeEntry[] {
  if (!isRecord(raw) || !Array.isArray(raw['items'])) {
    throw new ParamValidationError(UPGRADES_FILE, 'items', '업그레이드 항목 배열이 필요합니다');
  }
  const items = raw['items'];
  if (items.length > MAX_UPGRADE_ITEMS) {
    throw new ParamValidationError(
      UPGRADES_FILE,
      'items',
      `영구 업그레이드는 ${MAX_UPGRADE_ITEMS}항목 이하입니다 (신 스코프 가드, 6차 결의 2) — 현재 ${items.length}개`,
    );
  }
  const seen = new Set<string>();
  return items.map((itemRaw, index) => {
    const path = `items[${index}]`;
    if (!isRecord(itemRaw)) throw new ParamValidationError(UPGRADES_FILE, path, '객체가 필요합니다');

    const id = itemRaw['id'];
    if (typeof id !== 'string' || !(OFFICIAL_UPGRADE_IDS as readonly string[]).includes(id)) {
      throw new ParamValidationError(
        UPGRADES_FILE,
        `${path}.id`,
        `계약(meta.ts UpgradeStatId)의 공식 ID여야 합니다: ${OFFICIAL_UPGRADE_IDS.join(', ')} (받은 값: ${JSON.stringify(id)})`,
      );
    }
    if (seen.has(id)) throw new ParamValidationError(UPGRADES_FILE, `${path}.id`, `중복 id: ${id}`);
    seen.add(id);

    if (typeof itemRaw['label'] !== 'string') {
      throw new ParamValidationError(UPGRADES_FILE, `${path}.label`, '문자열이 필요합니다');
    }
    const maxLevel = itemRaw['maxLevel'];
    if (typeof maxLevel !== 'number' || !Number.isInteger(maxLevel) || maxLevel < 1) {
      throw new ParamValidationError(UPGRADES_FILE, `${path}.maxLevel`, '1 이상의 정수 단계 상한이 필요합니다');
    }

    const paramRef = itemRaw['paramRef'];
    if (paramRef !== undefined) {
      if (typeof paramRef !== 'string') {
        throw new ParamValidationError(UPGRADES_FILE, `${path}.paramRef`, '문자열 경로가 필요합니다');
      }
      if (paramsRoot !== undefined && resolveParamRef(paramsRoot, paramRef) === null) {
        throw new ParamValidationError(
          UPGRADES_FILE,
          `${path}.paramRef`,
          `존재하지 않는 파라미터 경로입니다: ${paramRef}`,
        );
      }
    }

    const entry: UpgradeEntry = {
      id: id as OfficialUpgradeId,
      label: itemRaw['label'],
      maxLevel,
      costCredits: validateLevelArray(UPGRADES_FILE, `${path}.costCredits`, itemRaw['costCredits'], maxLevel),
      costRareParts: validateLevelArray(UPGRADES_FILE, `${path}.costRareParts`, itemRaw['costRareParts'], maxLevel),
      effectBonus: validateLevelArray(UPGRADES_FILE, `${path}.effectBonus`, itemRaw['effectBonus'], maxLevel),
      ...(typeof paramRef === 'string' ? { paramRef } : {}),
      ...(typeof itemRaw['note'] === 'string' ? { note: itemRaw['note'] } : {}),
    };
    return entry;
  });
}

export function validateEquipmentCatalog(raw: unknown): EquipmentCatalog {
  if (!isRecord(raw) || !Array.isArray(raw['items'])) {
    throw new ParamValidationError(EQUIPMENT_FILE, 'items', '장비 항목 배열이 필요합니다');
  }
  const items = raw['items'];
  if (items.length > MAX_EQUIPMENT_ITEMS) {
    throw new ParamValidationError(
      EQUIPMENT_FILE,
      'items',
      `장비는 ${MAX_EQUIPMENT_ITEMS}종 이하입니다 (신 스코프 가드, 6차 결의 2) — 현재 ${items.length}개`,
    );
  }
  const seen = new Set<string>();
  const parsed = items.map((itemRaw, index) => {
    const path = `items[${index}]`;
    if (!isRecord(itemRaw)) throw new ParamValidationError(EQUIPMENT_FILE, path, '객체가 필요합니다');
    const id = itemRaw['id'];
    if (typeof id !== 'string' || !(OFFICIAL_EQUIPMENT_IDS as readonly string[]).includes(id)) {
      throw new ParamValidationError(
        EQUIPMENT_FILE,
        `${path}.id`,
        `계약(meta.ts EquipmentId)의 공식 ID여야 합니다: ${OFFICIAL_EQUIPMENT_IDS.join(', ')} (받은 값: ${JSON.stringify(id)})`,
      );
    }
    if (seen.has(id)) throw new ParamValidationError(EQUIPMENT_FILE, `${path}.id`, `중복 id: ${id}`);
    seen.add(id);
    if (typeof itemRaw['label'] !== 'string') {
      throw new ParamValidationError(EQUIPMENT_FILE, `${path}.label`, '문자열이 필요합니다');
    }
    const entry: EquipmentEntry = {
      id: id as OfficialEquipmentId,
      label: itemRaw['label'],
      costCredits: validateCost(EQUIPMENT_FILE, `${path}.costCredits`, itemRaw['costCredits']),
      costRareParts: validateCost(EQUIPMENT_FILE, `${path}.costRareParts`, itemRaw['costRareParts']),
      ...(typeof itemRaw['note'] === 'string' ? { note: itemRaw['note'] } : {}),
    };
    return entry;
  });

  return {
    slotCapacity: validateCost(EQUIPMENT_FILE, 'slotCapacity', raw['slotCapacity']),
    items: parsed,
  };
}

/**
 * 미확정(null) 필드 목록 — '기획 수치표 대기'를 정직하게 드러내는 보고용.
 * 비어 있으면 공식 데이터 이관 완료다.
 */
export function pendingFields(
  upgrades: readonly UpgradeEntry[],
  equipment: EquipmentCatalog | null,
): string[] {
  const pending: string[] = [];
  for (const item of upgrades) {
    const mark = (name: string, arr: readonly PendingNumber[]): void => {
      arr.forEach((value, level) => {
        if (value === null) pending.push(`upgrades.${item.id}.${name}[단계 ${level + 1}]`);
      });
    };
    mark('costCredits', item.costCredits);
    mark('costRareParts', item.costRareParts);
    mark('effectBonus', item.effectBonus);
  }
  if (equipment) {
    if (equipment.slotCapacity === null) pending.push('equipment.slotCapacity');
    for (const item of equipment.items) {
      if (item.costCredits === null) pending.push(`equipment.${item.id}.costCredits`);
      if (item.costRareParts === null) pending.push(`equipment.${item.id}.costRareParts`);
    }
  }
  return pending;
}

/**
 * 보스 도전 최소 사양까지의 총비용 — 7차 결의 8의 '출항 4~6회' 검증 입력.
 * 미확정(null)이 하나라도 있으면 계산하지 않고 null을 반환한다
 * (임의 값 대입 금지 — 검증 자체를 보류한다).
 */
export function totalUpgradeCost(
  upgrades: readonly UpgradeEntry[],
  levelsPerUpgrade: Readonly<Partial<Record<OfficialUpgradeId, number>>>,
): { credits: number; rareParts: number } | null {
  let credits = 0;
  let rareParts = 0;
  for (const item of upgrades) {
    const target = levelsPerUpgrade[item.id] ?? 0;
    for (let level = 0; level < Math.min(target, item.maxLevel); level += 1) {
      const c = item.costCredits[level];
      const r = item.costRareParts[level];
      if (c === null || c === undefined || r === null || r === undefined) return null;
      credits += c;
      rareParts += r;
    }
  }
  return { credits, rareParts };
}

/**
 * '보스 도전까지 예상 출항 횟수' — 7차 결의 8 판정 기준 4~6회.
 * 총비용·출항당 평균 수익 중 하나라도 미확정이면 null(판정 보류).
 */
export function estimatedSortiesToAfford(
  totalCredits: number | null,
  creditsPerSortie: number | null,
): number | null {
  if (totalCredits === null || creditsPerSortie === null || creditsPerSortie <= 0) return null;
  return totalCredits / creditsPerSortie;
}
