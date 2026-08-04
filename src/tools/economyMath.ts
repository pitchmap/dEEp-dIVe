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
import { rewardDropTableIdFor } from '../contracts/faction';
import type { NullableTunable } from '../contracts/params';
import { readNullableTunable } from './tunableSchema';
import type { FactionId } from '../contracts/faction';

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

/**
 * 미확정 수치 표기. 공식 데이터 승인(2026-08-01) 이후 신규 null은 허용하지
 * 않는다 — `assertNoPendingFields()`가 로드 시점에 0개를 강제한다.
 * 타입은 이관 이력·회귀 검출을 위해 유지한다.
 */
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
  /** 이 장비가 차지하는 슬롯 수 */
  readonly slotCost: PendingNumber;
  /** 첫 출항 성립 조건 — 시작 시점부터 보유하는가 */
  readonly startingItem: boolean;
  /**
   * 성능 수치. 어뢰류는 speedMetersPerSecond·damage, 디코이는
   * stockPerSortie·lifetimeSeconds·cooldownSeconds — 종류마다 키가 다르므로
   * 숫자 맵으로 받고 필수 키는 종류별로 검사한다.
   */
  readonly performance: Readonly<Record<string, number>>;
  readonly note?: string;
}

export interface EquipmentCatalog {
  /** 장비 슬롯 규칙 — 동시 장착 가능 종수 */
  readonly slotCapacity: PendingNumber;
  readonly items: readonly EquipmentEntry[];
}

/** 승인된 슬롯 용량 (6차 결의 5 · 사용자 승인) */
export const APPROVED_SLOT_CAPACITY = 2;

/** 시작 보유 장비 — 첫 출항이 성립하려면 반드시 하나여야 한다 */
export const STARTING_EQUIPMENT_ID = 'standardTorpedo';

/** 종류별 필수 성능 키 — 누락 시 거부 */
const REQUIRED_PERFORMANCE_KEYS: Readonly<Record<string, readonly string[]>> = {
  standardTorpedo: ['speedMetersPerSecond', 'damage'],
  fastTorpedo: ['speedMetersPerSecond', 'damage'],
  heavyTorpedo: ['speedMetersPerSecond', 'damage'],
  decoy: ['stockPerSortie', 'lifetimeSeconds', 'cooldownSeconds'],
};

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

/** 희귀 부품·슬롯처럼 쪼갤 수 없는 값: null 허용, 숫자면 0 이상 정수만 */
function validateIntegerCost(file: string, path: string, value: unknown): PendingNumber {
  const parsed = validateCost(file, path, value);
  if (parsed !== null && !Number.isInteger(parsed)) {
    throw new ParamValidationError(file, path, `정수가 필요합니다 (받은 값: ${parsed})`);
  }
  return parsed;
}

/** 성능 맵: 종류별 필수 키가 모두 있고 전부 유한 양수인지 확인 */
function validatePerformance(
  file: string,
  path: string,
  value: unknown,
  requiredKeys: readonly string[],
): Readonly<Record<string, number>> {
  if (!isRecord(value)) {
    throw new ParamValidationError(file, path, '성능 수치 객체가 필요합니다 (누락 거부)');
  }
  const parsed: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      throw new ParamValidationError(file, `${path}.${key}`, '유한한 숫자가 필요합니다');
    }
    if (entry <= 0) {
      throw new ParamValidationError(file, `${path}.${key}`, `0 이하 성능값은 허용되지 않습니다 (받은 값: ${entry})`);
    }
    parsed[key] = entry;
  }
  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new ParamValidationError(file, `${path}.${key}`, '필수 성능 키가 없습니다');
    }
  }
  return parsed;
}

function validateLevelArray(
  file: string,
  path: string,
  value: unknown,
  maxLevel: number,
  allowNegative = false,
  requireInteger = false,
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
    if (requireInteger && !Number.isInteger(entry)) {
      throw new ParamValidationError(file, entryPath, `정수가 필요합니다 (받은 값: ${entry})`);
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
      costRareParts: validateLevelArray(
        UPGRADES_FILE,
        `${path}.costRareParts`,
        itemRaw['costRareParts'],
        maxLevel,
        false,
        true,
      ),
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
    const startingItem = itemRaw['startingItem'];
    if (typeof startingItem !== 'boolean') {
      throw new ParamValidationError(EQUIPMENT_FILE, `${path}.startingItem`, 'true/false가 필요합니다 (누락 거부)');
    }
    const entry: EquipmentEntry = {
      id: id as OfficialEquipmentId,
      label: itemRaw['label'],
      costCredits: validateCost(EQUIPMENT_FILE, `${path}.costCredits`, itemRaw['costCredits']),
      costRareParts: validateIntegerCost(EQUIPMENT_FILE, `${path}.costRareParts`, itemRaw['costRareParts']),
      slotCost: validateIntegerCost(EQUIPMENT_FILE, `${path}.slotCost`, itemRaw['slotCost']),
      startingItem,
      performance: validatePerformance(
        EQUIPMENT_FILE,
        `${path}.performance`,
        itemRaw['performance'],
        REQUIRED_PERFORMANCE_KEYS[id] ?? [],
      ),
      ...(typeof itemRaw['note'] === 'string' ? { note: itemRaw['note'] } : {}),
    };
    return entry;
  });

  const slotCapacity = validateIntegerCost(EQUIPMENT_FILE, 'slotCapacity', raw['slotCapacity']);
  if (slotCapacity !== null && slotCapacity !== APPROVED_SLOT_CAPACITY) {
    throw new ParamValidationError(
      EQUIPMENT_FILE,
      'slotCapacity',
      `승인된 슬롯 용량은 ${APPROVED_SLOT_CAPACITY}입니다 (받은 값: ${slotCapacity})`,
    );
  }

  // 시작 보유 장비는 정확히 하나 — 없으면 첫 출항이 성립하지 않고,
  // 둘 이상이면 시작 슬롯 규칙이 무너진다.
  const starting = parsed.filter((entry) => entry.startingItem);
  if (starting.length !== 1) {
    throw new ParamValidationError(
      EQUIPMENT_FILE,
      'items[].startingItem',
      `시작 보유 장비는 정확히 1종이어야 합니다 (현재 ${starting.length}종)`,
    );
  }
  const startingEntry = starting[0]!;
  if (startingEntry.id !== STARTING_EQUIPMENT_ID) {
    throw new ParamValidationError(
      EQUIPMENT_FILE,
      'items[].startingItem',
      `시작 보유 장비는 ${STARTING_EQUIPMENT_ID}입니다 (받은 값: ${startingEntry.id})`,
    );
  }
  if (startingEntry.costCredits !== 0 || startingEntry.costRareParts !== 0) {
    throw new ParamValidationError(
      EQUIPMENT_FILE,
      `items[].${STARTING_EQUIPMENT_ID}`,
      '시작 보유 장비는 가격이 0이어야 합니다 (구매 대상이 아님)',
    );
  }

  return { slotCapacity, items: parsed };
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


/* ── 승인 수치 규칙 (사용자 승인 2026-08-01) ─────────────────── */

/** 전 업그레이드 공통 단계별 크레딧 [승인] */
export const APPROVED_UPGRADE_CREDITS = [100, 160, 240, 340, 460] as const;
/** 전 업그레이드 공통 단계별 희귀 부품 [승인] */
export const APPROVED_UPGRADE_RARE_PARTS = [0, 0, 0, 1, 2] as const;
/** A군 목표 누적 효과 [승인] */
export const APPROVED_A_GROUP_CUMULATIVE = [0.05, 0.1, 0.16, 0.22, 0.3] as const;
/** B군 목표 누적 효과 [승인] */
export const APPROVED_B_GROUP_CUMULATIVE = [0.1, 0.2, 0.32, 0.44, 0.6] as const;
/** A군 대상 (나머지 3종은 B군) */
export const A_GROUP_UPGRADE_IDS: readonly OfficialUpgradeId[] = [
  'maxSpeed',
  'turnRate',
  'reloadSpeed',
  'sonarRange',
];

const ECONOMY_FILE = 'params/economy.json';
const CARGO_FILE = 'params/cargo.json';
const EPSILON = 1e-9;

export interface DropTableEntry {
  readonly credits: number;
  readonly rareParts: number;
}

export interface SalvageSpawn {
  readonly spawnId: string;
  readonly kind: string;
  readonly dropTableId: string;
  /** 확정 배치 희귀 부품 id (없으면 null) — 확률 아님 */
  readonly rarePartId: string | null;
}

/* ── 스프린트 B 확장 (B3·B4·B6) ─────────────────────────────── */

/**
 * 세력별 보상 정책 [B3].
 *
 *  - `dropTable`: 계약 `FACTION_RULES`가 가리키는 공식 테이블로 보상한다.
 *  - `none`: **확정된 무보상.** 0은 결정된 값이며 미정이 아니다.
 *  - `pending`: **공식 결정 없음.** 수치 필드를 갖지 않는다 — 0으로 확정하는
 *    것도 결정이므로 하지 않는다 (수치 발명 금지).
 *
 * `none`과 `pending`의 구분이 이 타입의 존재 이유다. 둘 다 런타임 보상은
 * 발생하지 않지만, `none`은 '그렇게 정했다'이고 `pending`은 '아직 모른다'다.
 */
export type FactionRewardPolicy = 'dropTable' | 'none' | 'pending';

export interface FactionRewardRule {
  readonly faction: FactionId;
  readonly policy: FactionRewardPolicy;
  /** 계약이 가리키는 드롭 테이블 id — 정본은 contracts/faction.ts (여기서 복제하지 않음) */
  readonly dropTableId: string | null;
  /** `none`일 때만 존재하는 확정 0. `pending`은 null (= 값 없음) */
  readonly credits: number | null;
  readonly rareParts: number | null;
}

/** B6 고가치 수송선 — 배율 미확정 시 전 수치 null */
export interface HighValueTransportParams {
  readonly archetypeId: string;
  /** 배율이 곱해지는 기준 테이블 (dropTables에 실재해야 함) */
  readonly baseDropTableId: string;
  /** 공식 배율. null = 튜닝표 미도착 */
  readonly rewardMultiplier: number | null;
  /** 확정 시 값이 들어가야 하는 범위 [최소, 최대]. null = 미도착 */
  readonly rewardMultiplierRange: readonly [number, number] | null;
  readonly escortMaximumDistanceMeters: number | null;
}

/** B4·B5 경비함 스폰 위치 파라미터 — 전 항목 미확정(null) 가능 */
export interface GuardSpawnParams {
  readonly minDistanceFromPlayerMeters: number | null;
  readonly maxDistanceFromIncidentMeters: number | null;
  readonly candidateCount: number | null;
  readonly worldBoundsPaddingMeters: number | null;
  readonly spawnRetryCount: number | null;
}

/** [M2] 4단계 파밍 보상 상한 — INT-CORE-022. 미확정 시 지급 자체를 하지 않는다 */
export interface FarmingParams {
  readonly sectorCapRatioOfCombatAverage: NullableTunable;
  readonly combatRewardAverageCredits: NullableTunable;
  /** 상한을 계산할 수 있는가 — 둘 다 확정일 때만 true. false면 파밍 무지급 */
  readonly capComputable: boolean;
}

export interface EconomyParams {
  /** [M2] 미도입 시 null (A·B 스택 호환) */
  readonly farming: FarmingParams | null;
  readonly creditLossOnDestroyedRatio: number;
  readonly pickupRadiusMeters: number;
  readonly dropTables: Readonly<Record<string, DropTableEntry>>;
  readonly salvageSpawns: readonly SalvageSpawn[];
  /** [B3] 세력별 보상 정책 — 미도입 시 null (A 스택 호환) */
  readonly factionRewards: Readonly<Record<FactionId, FactionRewardRule>> | null;
  /** [B6] 미도입 시 null */
  readonly highValueTransport: HighValueTransportParams | null;
  /** [B4] 미도입 시 null */
  readonly guardSpawn: GuardSpawnParams | null;
  readonly sortieIncomeReference: {
    readonly cargoCredits: number;
    readonly salvageCredits: number;
    readonly totalCredits: number;
    readonly rareParts: number;
  };
  readonly bossReadinessReference: {
    readonly upgradeIds: readonly string[];
    readonly upgradeLevel: number;
    readonly equipmentIds: readonly string[];
    readonly expectedSortieRange: readonly [number, number];
  };
}

function requireNonNegative(file: string, path: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ParamValidationError(file, path, `유한한 숫자가 필요합니다 (받은 값: ${JSON.stringify(value)})`);
  }
  if (value < 0) throw new ParamValidationError(file, path, `음수는 허용되지 않습니다 (받은 값: ${value})`);
  return value;
}

function requireNonNegativeInteger(file: string, path: string, value: unknown): number {
  const n = requireNonNegative(file, path, value);
  if (!Number.isInteger(n)) {
    throw new ParamValidationError(file, path, `정수가 필요합니다 (받은 값: ${n})`);
  }
  return n;
}

/** null 허용 숫자 — 값이 있으면 유한·비음수여야 한다 */
function optionalNonNegative(file: string, path: string, value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return requireNonNegative(file, path, value);
}

function optionalNonNegativeInteger(file: string, path: string, value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return requireNonNegativeInteger(file, path, value);
}

const FACTION_ORDER: readonly FactionId[] = ['hostile', 'neutral', 'patrol'];
const REWARD_POLICIES: readonly FactionRewardPolicy[] = ['dropTable', 'none', 'pending'];

/**
 * [B3] 세력별 보상 정책 검증.
 *
 * 핵심은 **계약과의 대조**다. 세력→드롭 테이블 매핑의 정본은
 * `contracts/faction.ts`의 `FACTION_RULES`이고, 이 JSON은 정책 상태만 갖는다.
 * 둘이 어긋나면(예: patrol을 pending으로 적어 두고 계약에는 테이블을 달아 둠)
 * 로드를 거부한다 — 수치가 두 곳에서 서로 다른 말을 하는 상태를 만들지 않는다.
 */
function validateFactionRewards(
  raw: unknown,
  dropTables: Readonly<Record<string, DropTableEntry>>,
): Readonly<Record<FactionId, FactionRewardRule>> | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) {
    throw new ParamValidationError(ECONOMY_FILE, 'factionRewards', '객체가 필요합니다');
  }

  const rules: Partial<Record<FactionId, FactionRewardRule>> = {};
  for (const faction of FACTION_ORDER) {
    const path = `factionRewards.${faction}`;
    const entry = raw[faction];
    if (!isRecord(entry)) {
      throw new ParamValidationError(ECONOMY_FILE, path, '세력 3종 전부 정책이 필요합니다 (누락 거부)');
    }
    const policy = entry['policy'];
    if (typeof policy !== 'string' || !(REWARD_POLICIES as readonly string[]).includes(policy)) {
      throw new ParamValidationError(
        ECONOMY_FILE,
        `${path}.policy`,
        `${REWARD_POLICIES.join(' | ')} 중 하나여야 합니다 (받은 값: ${JSON.stringify(policy)})`,
      );
    }

    // 계약 정본과 대조 — 매핑을 복제하지 않고 참조해서 확인한다.
    const contractTableId = rewardDropTableIdFor(faction);
    let credits: number | null = null;
    let rareParts: number | null = null;

    if (policy === 'dropTable') {
      if (contractTableId === null) {
        throw new ParamValidationError(
          ECONOMY_FILE,
          `${path}.policy`,
          `계약(FACTION_RULES.${faction}.dropTableId)이 null인데 policy가 dropTable입니다 — 계약과 정책이 어긋납니다`,
        );
      }
      if (!(contractTableId in dropTables)) {
        throw new ParamValidationError(
          ECONOMY_FILE,
          `${path}.policy`,
          `계약이 가리키는 드롭 테이블이 dropTables에 없습니다: ${contractTableId}`,
        );
      }
      if ('credits' in entry || 'rareParts' in entry) {
        throw new ParamValidationError(
          ECONOMY_FILE,
          path,
          'dropTable 정책은 수치를 직접 갖지 않습니다 — 값은 dropTables가 소유합니다 (중복 정의 금지)',
        );
      }
    } else {
      if (contractTableId !== null) {
        throw new ParamValidationError(
          ECONOMY_FILE,
          `${path}.policy`,
          `계약(FACTION_RULES.${faction}.dropTableId)이 ${contractTableId}인데 policy가 ${policy}입니다 — 계약과 정책이 어긋납니다`,
        );
      }
      if (policy === 'none') {
        // 확정된 무보상 — 0을 명시적으로 실어 '결정했다'를 표현한다.
        credits = requireNonNegative(ECONOMY_FILE, `${path}.credits`, entry['credits']);
        rareParts = requireNonNegativeInteger(ECONOMY_FILE, `${path}.rareParts`, entry['rareParts']);
        if (credits !== 0 || rareParts !== 0) {
          throw new ParamValidationError(
            ECONOMY_FILE,
            path,
            `none 정책은 확정 0만 허용합니다 (받은 값: credits ${credits}, rareParts ${rareParts}) — 0이 아닌 보상은 dropTable 정책으로 표현하세요`,
          );
        }
      } else if ('credits' in entry || 'rareParts' in entry) {
        // pending에 0을 적으면 '미정'이 '무보상 확정'으로 위장된다.
        throw new ParamValidationError(
          ECONOMY_FILE,
          path,
          'pending 정책은 수치 필드를 가질 수 없습니다 — 0을 적는 것도 결정입니다. 결정됐다면 policy를 none으로 바꾸세요',
        );
      }
    }

    rules[faction] = {
      faction,
      policy: policy as FactionRewardPolicy,
      dropTableId: contractTableId,
      credits,
      rareParts,
    };
  }

  // 계약에 없는 세력 키가 섞이면 거부 — 오타로 규칙이 조용히 무시되는 것을 막는다.
  for (const key of Object.keys(raw)) {
    if (key.startsWith('$')) continue;
    if (!(FACTION_ORDER as readonly string[]).includes(key)) {
      throw new ParamValidationError(
        ECONOMY_FILE,
        `factionRewards.${key}`,
        `계약(meta.ts FactionId)에 없는 세력입니다: ${FACTION_ORDER.join(', ')} 만 허용`,
      );
    }
  }

  return rules as Record<FactionId, FactionRewardRule>;
}

/**
 * [B6] 고가치 수송선 검증.
 *
 * `rewardMultiplier`의 하한 1은 발명한 수치가 아니라 **B6의 종료 조건에서
 * 파생된 구조 조건**이다 (12차 B6: '고가치 수송선 격침 보상 > 일반 수송선').
 * 상한은 튜닝표 항목이므로 `rewardMultiplierRange`가 함께 도착할 때만
 * 검사한다 — 여기서 상한을 지어내지 않는다.
 */
function validateHighValueTransport(
  raw: unknown,
  dropTables: Readonly<Record<string, DropTableEntry>>,
): HighValueTransportParams | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) {
    throw new ParamValidationError(ECONOMY_FILE, 'highValueTransport', '객체가 필요합니다');
  }
  const archetypeId = raw['archetypeId'];
  if (typeof archetypeId !== 'string' || archetypeId.length === 0) {
    throw new ParamValidationError(ECONOMY_FILE, 'highValueTransport.archetypeId', '문자열이 필요합니다');
  }
  const baseDropTableId = raw['baseDropTableId'];
  if (typeof baseDropTableId !== 'string' || !(baseDropTableId in dropTables)) {
    throw new ParamValidationError(
      ECONOMY_FILE,
      'highValueTransport.baseDropTableId',
      `dropTables에 없는 참조입니다: ${JSON.stringify(baseDropTableId)}`,
    );
  }

  const rangeRaw = raw['rewardMultiplierRange'];
  let range: readonly [number, number] | null = null;
  if (rangeRaw !== null && rangeRaw !== undefined) {
    if (!Array.isArray(rangeRaw) || rangeRaw.length !== 2) {
      throw new ParamValidationError(
        ECONOMY_FILE,
        'highValueTransport.rewardMultiplierRange',
        '[최소, 최대] 배열 또는 null이 필요합니다',
      );
    }
    const min = requireNonNegative(ECONOMY_FILE, 'highValueTransport.rewardMultiplierRange[0]', rangeRaw[0]);
    const max = requireNonNegative(ECONOMY_FILE, 'highValueTransport.rewardMultiplierRange[1]', rangeRaw[1]);
    if (min > max) {
      throw new ParamValidationError(
        ECONOMY_FILE,
        'highValueTransport.rewardMultiplierRange',
        `최소가 최대보다 큽니다 (${min} > ${max})`,
      );
    }
    range = [min, max];
  }

  const multiplierRaw = raw['rewardMultiplier'];
  let multiplier: number | null = null;
  if (multiplierRaw !== null && multiplierRaw !== undefined) {
    multiplier = requireNonNegative(ECONOMY_FILE, 'highValueTransport.rewardMultiplier', multiplierRaw);
    if (multiplier <= 1) {
      throw new ParamValidationError(
        ECONOMY_FILE,
        'highValueTransport.rewardMultiplier',
        `1보다 커야 합니다 (받은 값: ${multiplier}) — B6 종료 조건 '고가치 수송선 보상 > 일반 수송선'`,
      );
    }
    if (range && (multiplier < range[0] || multiplier > range[1])) {
      throw new ParamValidationError(
        ECONOMY_FILE,
        'highValueTransport.rewardMultiplier',
        `조정 범위 [${range[0]}, ${range[1]}]를 벗어났습니다 (받은 값: ${multiplier})`,
      );
    }
  }

  return {
    archetypeId,
    baseDropTableId,
    rewardMultiplier: multiplier,
    rewardMultiplierRange: range,
    escortMaximumDistanceMeters: optionalNonNegative(
      ECONOMY_FILE,
      'highValueTransport.escortMaximumDistanceMeters',
      raw['escortMaximumDistanceMeters'],
    ),
  };
}

/** [B4] 경비함 스폰 params — 전 항목 null 가능, 값이 있으면 형식만 검사한다 */
function validateGuardSpawn(raw: unknown): GuardSpawnParams | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) {
    throw new ParamValidationError(ECONOMY_FILE, 'guardSpawn', '객체가 필요합니다');
  }
  const params: GuardSpawnParams = {
    minDistanceFromPlayerMeters: optionalNonNegative(
      ECONOMY_FILE,
      'guardSpawn.minDistanceFromPlayerMeters',
      raw['minDistanceFromPlayerMeters'],
    ),
    maxDistanceFromIncidentMeters: optionalNonNegative(
      ECONOMY_FILE,
      'guardSpawn.maxDistanceFromIncidentMeters',
      raw['maxDistanceFromIncidentMeters'],
    ),
    candidateCount: optionalNonNegativeInteger(ECONOMY_FILE, 'guardSpawn.candidateCount', raw['candidateCount']),
    worldBoundsPaddingMeters: optionalNonNegative(
      ECONOMY_FILE,
      'guardSpawn.worldBoundsPaddingMeters',
      raw['worldBoundsPaddingMeters'],
    ),
    spawnRetryCount: optionalNonNegativeInteger(ECONOMY_FILE, 'guardSpawn.spawnRetryCount', raw['spawnRetryCount']),
  };
  if (
    params.minDistanceFromPlayerMeters !== null &&
    params.maxDistanceFromIncidentMeters !== null &&
    params.minDistanceFromPlayerMeters > params.maxDistanceFromIncidentMeters
  ) {
    throw new ParamValidationError(
      ECONOMY_FILE,
      'guardSpawn',
      `최소 이격(${params.minDistanceFromPlayerMeters}m)이 사건 최대 거리(${params.maxDistanceFromIncidentMeters}m)보다 큽니다 — 스폰 가능 영역이 비어 있습니다`,
    );
  }
  return params;
}

/** B 확장 블록 중 아직 공식값이 없는 필드 목록 — '미확정'을 정직하게 보고한다 */
export function pendingSprintBFields(economy: EconomyParams): string[] {
  const pending: string[] = [];
  const rewards = economy.factionRewards;
  if (rewards) {
    for (const faction of FACTION_ORDER) {
      if (rewards[faction].policy === 'pending') pending.push(`factionRewards.${faction} (정책 미결정)`);
    }
  }
  const hv = economy.highValueTransport;
  if (hv) {
    if (hv.rewardMultiplier === null) pending.push('highValueTransport.rewardMultiplier');
    if (hv.rewardMultiplierRange === null) pending.push('highValueTransport.rewardMultiplierRange');
    if (hv.escortMaximumDistanceMeters === null) pending.push('highValueTransport.escortMaximumDistanceMeters');
  }
  const guard = economy.guardSpawn;
  if (guard) {
    for (const [key, value] of Object.entries(guard)) {
      if (value === null) pending.push(`guardSpawn.${key}`);
    }
  }
  return pending;
}

/** 경비함 스폰 위치 전략을 params만으로 구성할 수 있는가 (전 항목 확정 시에만 true) */
export function guardSpawnParamsUsable(economy: EconomyParams): boolean {
  const guard = economy.guardSpawn;
  if (!guard) return false;
  return Object.values(guard).every((value) => value !== null);
}

/**
 * [M2] farming 블록 검증. 두 항목 모두 `NullableTunable`이며 툴링 공용
 * 리더를 재사용한다 — 스키마를 여기 복제하지 않는다.
 *
 * **clue 진행과 혼합하지 않는다**: 이 블록은 진행도·단서 id를 알지 못하고,
 * 검증기도 그 둘을 잇는 필드를 허용하지 않는다.
 */
function validateFarming(raw: unknown): FarmingParams | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) {
    throw new ParamValidationError(ECONOMY_FILE, 'farming', '객체가 필요합니다');
  }
  const allowed = ['sectorCapRatioOfCombatAverage', 'combatRewardAverageCredits'];
  for (const key of Object.keys(raw)) {
    if (key.startsWith('$')) continue;
    if (!allowed.includes(key)) {
      throw new ParamValidationError(
        ECONOMY_FILE,
        `farming.${key}`,
        `계약에 없는 필드입니다. 허용: ${allowed.join(', ')} (clue 진행 필드 혼합 금지)`,
      );
    }
  }
  const ratio = readNullableTunable(ECONOMY_FILE, raw, 'farming.', 'sectorCapRatioOfCombatAverage');
  const average = readNullableTunable(ECONOMY_FILE, raw, 'farming.', 'combatRewardAverageCredits');
  return {
    sectorCapRatioOfCombatAverage: ratio,
    combatRewardAverageCredits: average,
    capComputable: ratio.value !== null && average.value !== null,
  };
}

export function validateEconomyParams(raw: unknown): EconomyParams {
  if (!isRecord(raw)) throw new ParamValidationError(ECONOMY_FILE, '(루트)', '객체가 필요합니다');

  const lossRaw = raw['creditLossOnDestroyedRatio'];
  if (!isRecord(lossRaw)) {
    throw new ParamValidationError(ECONOMY_FILE, 'creditLossOnDestroyedRatio', '객체({ value, range })가 필요합니다');
  }
  const loss = requireNonNegative(ECONOMY_FILE, 'creditLossOnDestroyedRatio.value', lossRaw['value']);
  if (loss > 1) {
    throw new ParamValidationError(ECONOMY_FILE, 'creditLossOnDestroyedRatio.value', `0~1 이어야 합니다 (받은 값: ${loss})`);
  }

  const pickupRaw = raw['pickupRadiusMeters'];
  if (!isRecord(pickupRaw)) {
    throw new ParamValidationError(ECONOMY_FILE, 'pickupRadiusMeters', '객체({ value })가 필요합니다');
  }
  const pickup = requireNonNegative(ECONOMY_FILE, 'pickupRadiusMeters.value', pickupRaw['value']);

  const tablesRaw = raw['dropTables'];
  if (!isRecord(tablesRaw)) {
    throw new ParamValidationError(ECONOMY_FILE, 'dropTables', '객체가 필요합니다');
  }
  const dropTables: Record<string, DropTableEntry> = {};
  for (const [id, entryRaw] of Object.entries(tablesRaw)) {
    if (!isRecord(entryRaw)) {
      throw new ParamValidationError(ECONOMY_FILE, `dropTables.${id}`, '객체가 필요합니다');
    }
    dropTables[id] = {
      credits: requireNonNegative(ECONOMY_FILE, `dropTables.${id}.credits`, entryRaw['credits']),
      rareParts: requireNonNegativeInteger(ECONOMY_FILE, `dropTables.${id}.rareParts`, entryRaw['rareParts']),
    };
  }

  const spawnsRaw = raw['salvageSpawns'];
  if (!Array.isArray(spawnsRaw)) {
    throw new ParamValidationError(ECONOMY_FILE, 'salvageSpawns', '배열이 필요합니다');
  }
  const seenSpawn = new Set<string>();
  const salvageSpawns = spawnsRaw.map((entryRaw, index) => {
    const path = `salvageSpawns[${index}]`;
    if (!isRecord(entryRaw)) throw new ParamValidationError(ECONOMY_FILE, path, '객체가 필요합니다');
    const spawnId = entryRaw['spawnId'];
    if (typeof spawnId !== 'string' || spawnId.length === 0) {
      throw new ParamValidationError(ECONOMY_FILE, `${path}.spawnId`, '비어 있지 않은 문자열이 필요합니다');
    }
    if (seenSpawn.has(spawnId)) {
      throw new ParamValidationError(ECONOMY_FILE, `${path}.spawnId`, `중복 spawnId: ${spawnId}`);
    }
    seenSpawn.add(spawnId);
    const dropTableId = entryRaw['dropTableId'];
    if (typeof dropTableId !== 'string' || !(dropTableId in dropTables)) {
      throw new ParamValidationError(
        ECONOMY_FILE,
        `${path}.dropTableId`,
        `dropTables에 없는 참조입니다: ${JSON.stringify(dropTableId)}`,
      );
    }
    const kind = entryRaw['kind'];
    if (typeof kind !== 'string' || kind.length === 0) {
      throw new ParamValidationError(ECONOMY_FILE, `${path}.kind`, '문자열이 필요합니다');
    }
    const rarePartId = entryRaw['rarePartId'];
    if (rarePartId !== null && typeof rarePartId !== 'string') {
      throw new ParamValidationError(ECONOMY_FILE, `${path}.rarePartId`, '문자열 또는 null이 필요합니다');
    }
    return { spawnId, kind, dropTableId, rarePartId } as SalvageSpawn;
  });

  const incomeRaw = raw['sortieIncomeReference'];
  if (!isRecord(incomeRaw)) {
    throw new ParamValidationError(ECONOMY_FILE, 'sortieIncomeReference', '객체가 필요합니다');
  }
  const income = {
    cargoCredits: requireNonNegative(ECONOMY_FILE, 'sortieIncomeReference.cargoCredits', incomeRaw['cargoCredits']),
    salvageCredits: requireNonNegative(ECONOMY_FILE, 'sortieIncomeReference.salvageCredits', incomeRaw['salvageCredits']),
    totalCredits: requireNonNegative(ECONOMY_FILE, 'sortieIncomeReference.totalCredits', incomeRaw['totalCredits']),
    rareParts: requireNonNegativeInteger(ECONOMY_FILE, 'sortieIncomeReference.rareParts', incomeRaw['rareParts']),
  };

  const bossRaw = raw['bossReadinessReference'];
  if (!isRecord(bossRaw)) {
    throw new ParamValidationError(ECONOMY_FILE, 'bossReadinessReference', '객체가 필요합니다');
  }
  const rangeRaw = bossRaw['expectedSortieRange'];
  if (!Array.isArray(rangeRaw) || rangeRaw.length !== 2) {
    throw new ParamValidationError(ECONOMY_FILE, 'bossReadinessReference.expectedSortieRange', '[최소, 최대] 배열이 필요합니다');
  }
  const upgradeIds = bossRaw['upgradeIds'];
  const equipmentIds = bossRaw['equipmentIds'];
  if (!Array.isArray(upgradeIds) || upgradeIds.some((id) => typeof id !== 'string')) {
    throw new ParamValidationError(ECONOMY_FILE, 'bossReadinessReference.upgradeIds', '문자열 배열이 필요합니다');
  }
  if (!Array.isArray(equipmentIds) || equipmentIds.some((id) => typeof id !== 'string')) {
    throw new ParamValidationError(ECONOMY_FILE, 'bossReadinessReference.equipmentIds', '문자열 배열이 필요합니다');
  }

  return {
    creditLossOnDestroyedRatio: loss,
    pickupRadiusMeters: pickup,
    dropTables,
    salvageSpawns,
    farming: validateFarming(raw['farming']),
    factionRewards: validateFactionRewards(raw['factionRewards'], dropTables),
    highValueTransport: validateHighValueTransport(raw['highValueTransport'], dropTables),
    guardSpawn: validateGuardSpawn(raw['guardSpawn']),
    sortieIncomeReference: income,
    bossReadinessReference: {
      upgradeIds: upgradeIds as string[],
      upgradeLevel: requireNonNegativeInteger(ECONOMY_FILE, 'bossReadinessReference.upgradeLevel', bossRaw['upgradeLevel']),
      equipmentIds: equipmentIds as string[],
      expectedSortieRange: [
        requireNonNegative(ECONOMY_FILE, 'bossReadinessReference.expectedSortieRange[0]', rangeRaw[0]),
        requireNonNegative(ECONOMY_FILE, 'bossReadinessReference.expectedSortieRange[1]', rangeRaw[1]),
      ] as const,
    },
  };
}

export interface CargoParams {
  readonly targetId: number;
  readonly speedMetersPerSecond: number;
  readonly hitRadiusMeters: number;
  readonly sinkDurationSeconds: number;
  readonly waypointA: { readonly x: number; readonly z: number };
  readonly waypointB: { readonly x: number; readonly z: number };
  readonly hullBox: {
    readonly halfLengthMeters: number;
    readonly halfBeamMeters: number;
    readonly judgmentDraftMeters: number;
    readonly freeboardMeters: number;
  };
}

function requireWaypoint(path: string, raw: unknown): { x: number; z: number } {
  if (!isRecord(raw)) throw new ParamValidationError(CARGO_FILE, path, '{ x, z } 객체가 필요합니다');
  const x = raw['x'];
  const z = raw['z'];
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof z !== 'number' || !Number.isFinite(z)) {
    throw new ParamValidationError(CARGO_FILE, path, 'x·z는 유한한 숫자여야 합니다');
  }
  return { x, z };
}

export function validateCargoParams(raw: unknown): CargoParams {
  if (!isRecord(raw)) throw new ParamValidationError(CARGO_FILE, '(루트)', '객체가 필요합니다');
  const hullRaw = raw['hullBox'];
  if (!isRecord(hullRaw)) throw new ParamValidationError(CARGO_FILE, 'hullBox', '객체가 필요합니다');
  return {
    targetId: requireNonNegativeInteger(CARGO_FILE, 'targetId', raw['targetId']),
    speedMetersPerSecond: requireNonNegative(CARGO_FILE, 'speedMetersPerSecond', raw['speedMetersPerSecond']),
    hitRadiusMeters: requireNonNegative(CARGO_FILE, 'hitRadiusMeters', raw['hitRadiusMeters']),
    sinkDurationSeconds: requireNonNegative(CARGO_FILE, 'sinkDurationSeconds', raw['sinkDurationSeconds']),
    waypointA: requireWaypoint('waypointA', raw['waypointA']),
    waypointB: requireWaypoint('waypointB', raw['waypointB']),
    hullBox: {
      halfLengthMeters: requireNonNegative(CARGO_FILE, 'hullBox.halfLengthMeters', hullRaw['halfLengthMeters']),
      halfBeamMeters: requireNonNegative(CARGO_FILE, 'hullBox.halfBeamMeters', hullRaw['halfBeamMeters']),
      judgmentDraftMeters: requireNonNegative(CARGO_FILE, 'hullBox.judgmentDraftMeters', hullRaw['judgmentDraftMeters']),
      freeboardMeters: requireNonNegative(CARGO_FILE, 'hullBox.freeboardMeters', hullRaw['freeboardMeters']),
    },
  };
}

/* ── 진행 곡선·승인값 대조 ─────────────────────────────────── */

/** null이 하나라도 있으면 throw — 공식 데이터 확정 이후의 회귀 차단 */
export function assertNoPendingFields(
  upgrades: readonly UpgradeEntry[],
  equipment: EquipmentCatalog,
): void {
  const pending = pendingFields(upgrades, equipment);
  if (pending.length > 0) {
    throw new ParamValidationError(
      UPGRADES_FILE,
      '(미확정)',
      `공식 승인 이후 null은 허용되지 않습니다 — ${pending.length}개: ${pending.slice(0, 5).join(', ')}${pending.length > 5 ? ' …' : ''}`,
    );
  }
}

/** 단계별 증가량의 누적 합 (level은 1-based) */
export function cumulativeBonus(entry: UpgradeEntry, level: number): number {
  let sum = 0;
  for (let i = 0; i < Math.min(level, entry.effectBonus.length); i += 1) {
    const value = entry.effectBonus[i];
    if (value === null || value === undefined) return Number.NaN;
    sum += value;
  }
  return sum;
}

/** 승인된 누적 목표치와 대조 — 어긋나면 문자열 목록 반환 (비어 있으면 일치) */
export function checkApprovedProgression(upgrades: readonly UpgradeEntry[]): string[] {
  const problems: string[] = [];
  for (const entry of upgrades) {
    const target = (A_GROUP_UPGRADE_IDS as readonly string[]).includes(entry.id)
      ? APPROVED_A_GROUP_CUMULATIVE
      : APPROVED_B_GROUP_CUMULATIVE;
    for (let level = 1; level <= entry.maxLevel; level += 1) {
      const actual = cumulativeBonus(entry, level);
      const expected = target[level - 1];
      if (expected === undefined || Math.abs(actual - expected) > EPSILON) {
        problems.push(`${entry.id} ${level}단계 누적 ${actual} ≠ 승인값 ${expected}`);
      }
    }
    for (let level = 0; level < entry.maxLevel; level += 1) {
      if (entry.costCredits[level] !== APPROVED_UPGRADE_CREDITS[level]) {
        problems.push(`${entry.id} ${level + 1}단계 크레딧 ${entry.costCredits[level]} ≠ ${APPROVED_UPGRADE_CREDITS[level]}`);
      }
      if (entry.costRareParts[level] !== APPROVED_UPGRADE_RARE_PARTS[level]) {
        problems.push(`${entry.id} ${level + 1}단계 희귀 ${entry.costRareParts[level]} ≠ ${APPROVED_UPGRADE_RARE_PARTS[level]}`);
      }
    }
  }
  return problems;
}

/** 출항 1회 최대 수입 — dropTables·salvageSpawns에서 파생 계산 */
export function sortieMaxIncome(economy: EconomyParams): {
  cargoCredits: number;
  salvageCredits: number;
  totalCredits: number;
  rareParts: number;
} {
  const cargoCredits = economy.dropTables['cargo-standard']?.credits ?? 0;
  let salvageCredits = 0;
  let rareParts = 0;
  for (const spawn of economy.salvageSpawns) {
    const table = economy.dropTables[spawn.dropTableId];
    if (table) {
      salvageCredits += table.credits;
      rareParts += table.rareParts;
    }
    if (spawn.rarePartId !== null) rareParts += 1;
  }
  return { cargoCredits, salvageCredits, totalCredits: cargoCredits + salvageCredits, rareParts };
}

/** 보스 준비 최소 사양 총비용 (economy.bossReadinessReference 기준) */
export function bossReadinessCost(
  upgrades: readonly UpgradeEntry[],
  equipment: EquipmentCatalog,
  economy: EconomyParams,
): { credits: number; rareParts: number } {
  const ref = economy.bossReadinessReference;
  let credits = 0;
  let rareParts = 0;
  for (const id of ref.upgradeIds) {
    const entry = upgrades.find((u) => u.id === id);
    if (!entry) continue;
    for (let level = 0; level < Math.min(ref.upgradeLevel, entry.maxLevel); level += 1) {
      credits += entry.costCredits[level] ?? 0;
      rareParts += entry.costRareParts[level] ?? 0;
    }
  }
  for (const id of ref.equipmentIds) {
    const item = equipment.items.find((e) => e.id === id);
    if (!item) continue;
    credits += item.costCredits ?? 0;
    rareParts += item.costRareParts ?? 0;
  }
  return { credits, rareParts };
}
