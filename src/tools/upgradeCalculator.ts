/**
 * 업그레이드 카탈로그 로드·핫리로드 (툴링 소유 — 소회의(11) 결의 4).
 *
 * 계산 수식·검증은 upgradeMath.ts (순수 함수부 — Node 검증 러너 공용)에 있고,
 * 이 모듈은 params/upgrades.json의 정적 import + Vite HMR만 담당한다
 * (ParamLoader와 동일 방식 — 원본 불변, 검증 실패 시 기존 값 유지).
 */

import upgradesJson from '../../params/upgrades.json';
import {
  validateUpgradeCatalog,
  type UpgradeDefinition,
} from './upgradeMath';

export {
  applyUpgradeBonus,
  MAX_UPGRADE_ITEMS,
  sumUpgradeBonuses,
  validateUpgradeCatalog,
  type UpgradeDefinition,
} from './upgradeMath';

let cached: UpgradeDefinition[] | null = null;
let rawCatalog: unknown = upgradesJson;

export function loadUpgradeCatalog(): UpgradeDefinition[] {
  if (!cached) cached = validateUpgradeCatalog(rawCatalog);
  return cached;
}

export type UpgradeCatalogReloadListener = (catalog: UpgradeDefinition[]) => void;
const reloadListeners = new Set<UpgradeCatalogReloadListener>();

export function onUpgradeCatalogReloaded(listener: UpgradeCatalogReloadListener): () => void {
  reloadListeners.add(listener);
  return () => reloadListeners.delete(listener);
}

if (import.meta.hot) {
  import.meta.hot.accept(['../../params/upgrades.json'], ([mod]) => {
    try {
      const next = mod ? mod.default : rawCatalog;
      const validated = validateUpgradeCatalog(next);
      rawCatalog = next;
      cached = validated;
      for (const listener of [...reloadListeners]) listener(validated);
      console.info('[upgradeCalculator] 업그레이드 카탈로그 핫리로드 적용 완료.');
    } catch (error) {
      console.error('[upgradeCalculator] 핫리로드 거부 — 검증 실패, 기존 값을 유지합니다.', error);
    }
  });
}
