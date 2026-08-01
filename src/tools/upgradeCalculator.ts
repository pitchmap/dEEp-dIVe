/**
 * 업그레이드·장비 카탈로그 로드·핫리로드 (툴링 소유).
 *
 * 계산은 **`src/meta/upgradeMath.ts`(리드 소유 정본)** 만 사용한다 —
 * INT-CORE-007 적용 요청: "시뮬레이터는 동일 함수 사용, 계산 복제 금지".
 * 이 모듈은 params/upgrades.json·equipment.json의 정적 import + Vite HMR과
 * 검증(economyMath) 호출만 담당한다 (원본 불변, 실패 시 기존 값 유지).
 */

import upgradesJson from '../../params/upgrades.json';
import equipmentJson from '../../params/equipment.json';
import { loadParams } from '../config/ParamLoader';
import {
  validateEquipmentCatalog,
  validateUpgradeCatalog,
  type EquipmentCatalog,
  type UpgradeEntry,
} from './economyMath';

export {
  MAX_EQUIPMENT_ITEMS,
  MAX_UPGRADE_ITEMS,
  OFFICIAL_EQUIPMENT_IDS,
  OFFICIAL_UPGRADE_IDS,
  estimatedSortiesToAfford,
  pendingFields,
  resolveParamRef,
  totalUpgradeCost,
  validateEquipmentCatalog,
  validateUpgradeCatalog,
  type EquipmentCatalog,
  type EquipmentEntry,
  type OfficialUpgradeId,
  type UpgradeEntry,
} from './economyMath';

let cachedUpgrades: UpgradeEntry[] | null = null;
let rawUpgrades: unknown = upgradesJson;
let cachedEquipment: EquipmentCatalog | null = null;
let rawEquipment: unknown = equipmentJson;

export function loadUpgradeCatalog(): UpgradeEntry[] {
  if (!cachedUpgrades) cachedUpgrades = validateUpgradeCatalog(rawUpgrades, loadParams());
  return cachedUpgrades;
}

export function loadEquipmentCatalog(): EquipmentCatalog {
  if (!cachedEquipment) cachedEquipment = validateEquipmentCatalog(rawEquipment);
  return cachedEquipment;
}

export type CatalogReloadListener = () => void;
const reloadListeners = new Set<CatalogReloadListener>();

export function onCatalogReloaded(listener: CatalogReloadListener): () => void {
  reloadListeners.add(listener);
  return () => reloadListeners.delete(listener);
}

if (import.meta.hot) {
  import.meta.hot.accept(
    ['../../params/upgrades.json', '../../params/equipment.json'],
    ([upgrades, equipment]) => {
      try {
        const nextUpgrades = upgrades ? upgrades.default : rawUpgrades;
        const nextEquipment = equipment ? equipment.default : rawEquipment;
        const validatedUpgrades = validateUpgradeCatalog(nextUpgrades, loadParams());
        const validatedEquipment = validateEquipmentCatalog(nextEquipment);
        rawUpgrades = nextUpgrades;
        rawEquipment = nextEquipment;
        cachedUpgrades = validatedUpgrades;
        cachedEquipment = validatedEquipment;
        for (const listener of [...reloadListeners]) listener();
        console.info('[upgradeCalculator] 업그레이드·장비 카탈로그 핫리로드 적용 완료.');
      } catch (error) {
        console.error('[upgradeCalculator] 핫리로드 거부 — 검증 실패, 기존 값을 유지합니다.', error);
      }
    },
  );
}
