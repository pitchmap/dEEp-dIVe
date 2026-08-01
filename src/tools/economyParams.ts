/**
 * 경제 공식 params 로드·핫리로드 (툴링 소유).
 *
 * `params/{upgrades,equipment,economy,cargo}.json`을 **검증을 통과한 형태로만**
 * 내보내는 단일 진입점이다. 게임플레이(`src/systems/`)·리드(`src/core`,
 * `src/meta`)는 각자 JSON을 읽거나 수치를 코드에 복제하지 않고 여기서 받는다
 * (CLAUDE.md 규칙 6 — JSON → 시스템 단방향 주입).
 *
 * 방식은 aimingParams·ParamLoader와 동일: 정적 import + Vite HMR, 검증 실패 시
 * 거부하고 기존 값 유지, 코드에서 JSON 역기록 없음.
 *
 * 남은 provisional 소비 지점(`provisionalEconomy`·`provisionalCargo`·
 * `provisionalEquipment`·`provisionalUpgradeCost` import)의 교체는 각 파일
 * 소유 역할의 몫이다 — 툴링은 대체 공급원만 제공한다.
 */

import cargoJson from '../../params/cargo.json';
import economyJson from '../../params/economy.json';
import equipmentJson from '../../params/equipment.json';
import upgradesJson from '../../params/upgrades.json';
import {
  validateCargoParams,
  validateEconomyParams,
  validateEquipmentCatalog,
  validateUpgradeCatalog,
  type CargoParams,
  type EconomyParams,
  type EquipmentCatalog,
  type UpgradeEntry,
} from './economyMath';

export type {
  CargoParams,
  DropTableEntry,
  EconomyParams,
  EquipmentCatalog,
  EquipmentEntry,
  OfficialEquipmentId,
  OfficialUpgradeId,
  SalvageSpawn,
  UpgradeEntry,
} from './economyMath';
export {
  APPROVED_SLOT_CAPACITY,
  OFFICIAL_EQUIPMENT_IDS,
  OFFICIAL_UPGRADE_IDS,
  STARTING_EQUIPMENT_ID,
  bossReadinessCost,
  cumulativeBonus,
  sortieMaxIncome,
  totalUpgradeCost,
} from './economyMath';

/** 네 파일을 한 묶음으로 다룬다 — 부분 리로드로 서로 어긋나지 않게 한다 */
export interface EconomyParamsBundle {
  readonly upgrades: readonly UpgradeEntry[];
  readonly equipment: EquipmentCatalog;
  readonly economy: EconomyParams;
  readonly cargo: CargoParams;
}

interface RawBundle {
  upgrades: unknown;
  equipment: unknown;
  economy: unknown;
  cargo: unknown;
}

function validateBundle(raw: RawBundle): EconomyParamsBundle {
  return {
    upgrades: validateUpgradeCatalog(raw.upgrades),
    equipment: validateEquipmentCatalog(raw.equipment),
    economy: validateEconomyParams(raw.economy),
    cargo: validateCargoParams(raw.cargo),
  };
}

let raw: RawBundle = {
  upgrades: upgradesJson,
  equipment: equipmentJson,
  economy: economyJson,
  cargo: cargoJson,
};
let cached: EconomyParamsBundle | null = null;

export function loadEconomyParams(): EconomyParamsBundle {
  if (!cached) cached = validateBundle(raw);
  return cached;
}

export type EconomyParamsReloadListener = (bundle: EconomyParamsBundle) => void;
const reloadListeners = new Set<EconomyParamsReloadListener>();

export function onEconomyParamsReloaded(listener: EconomyParamsReloadListener): () => void {
  reloadListeners.add(listener);
  return () => reloadListeners.delete(listener);
}

if (import.meta.hot) {
  import.meta.hot.accept(
    [
      '../../params/upgrades.json',
      '../../params/equipment.json',
      '../../params/economy.json',
      '../../params/cargo.json',
    ],
    ([upgradesMod, equipmentMod, economyMod, cargoMod]) => {
      const next: RawBundle = {
        upgrades: upgradesMod ? upgradesMod.default : raw.upgrades,
        equipment: equipmentMod ? equipmentMod.default : raw.equipment,
        economy: economyMod ? economyMod.default : raw.economy,
        cargo: cargoMod ? cargoMod.default : raw.cargo,
      };
      try {
        const validated = validateBundle(next);
        raw = next;
        cached = validated;
        for (const listener of [...reloadListeners]) listener(validated);
        console.info('[economyParams] 경제 파라미터 핫리로드 적용 완료.', validated);
      } catch (error) {
        console.error('[economyParams] 핫리로드 거부 — 검증 실패, 기존 값을 유지합니다.', error);
      }
    },
  );
}
