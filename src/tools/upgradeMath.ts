/**
 * 영구 업그레이드 공용 계산 — 순수 함수부 (툴링 소유, 소회의(11) 결의 4).
 *
 * 확정 공식 [합연산 — 곱연산 스택 금지]:
 *    최종값 = 기준값 × (1 + 보정값들의 합)
 *
 * 이 모듈은 **카탈로그(params/upgrades.json) 검증·단계 합산**을 담당한다.
 * 수식 자체의 유일한 구현은 리드 소유 `src/meta/upgradeMath.ts`이며
 * (PvE 1차 통합 결정 — 중복 구현 해소), 여기서는 위임만 한다.
 * 시뮬레이터와 게임플레이 런타임 배율 레이어가 같은 계산을 공유한다.
 * JSON import가 없어 Node 검증 러너에서도 그대로 로드된다. 로드·핫리로드는
 * upgradeCalculator.ts 담당.
 */

import { ParamValidationError } from '../config/validateParams';
import { effectiveValue } from '../meta/upgradeMath';

const FILE = 'params/upgrades.json';

/** 신 스코프 가드 상한 (6차 대회의 결의 2 — 초과 제안은 자동 백로그) */
export const MAX_UPGRADE_ITEMS = 7;

export interface UpgradeDefinition {
  id: string;
  label: string;
  /** 기준값이 이미 존재하는 파라미터 경로 (예: "movement.maxSpeedMetersPerSecond") */
  paramRef?: string;
  /** 단계당 합연산 보정 (0.1 = +10%) */
  bonusPerLevel: number;
  maxLevel: number;
  note?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateUpgradeCatalog(raw: unknown): UpgradeDefinition[] {
  if (!isRecord(raw) || !Array.isArray(raw['items'])) {
    throw new ParamValidationError(FILE, 'items', '업그레이드 항목 배열이 필요합니다');
  }
  const items = raw['items'];
  if (items.length > MAX_UPGRADE_ITEMS) {
    throw new ParamValidationError(
      FILE,
      'items',
      `영구 업그레이드는 ${MAX_UPGRADE_ITEMS}항목 이하입니다 (신 스코프 가드, 6차 결의 2) — 현재 ${items.length}개. 초과분은 백로그로`,
    );
  }
  const seen = new Set<string>();
  return items.map((itemRaw, index) => {
    const path = `items[${index}]`;
    if (!isRecord(itemRaw)) throw new ParamValidationError(FILE, path, '객체가 필요합니다');
    const id = itemRaw['id'];
    if (typeof id !== 'string' || id.length === 0) {
      throw new ParamValidationError(FILE, `${path}.id`, '비어 있지 않은 문자열이 필요합니다');
    }
    if (seen.has(id)) throw new ParamValidationError(FILE, `${path}.id`, `중복 id: ${id}`);
    seen.add(id);
    if (typeof itemRaw['label'] !== 'string') {
      throw new ParamValidationError(FILE, `${path}.label`, '문자열이 필요합니다');
    }
    const bonus = itemRaw['bonusPerLevel'];
    if (typeof bonus !== 'number' || !Number.isFinite(bonus) || bonus < 0) {
      throw new ParamValidationError(FILE, `${path}.bonusPerLevel`, '0 이상의 숫자가 필요합니다');
    }
    const maxLevel = itemRaw['maxLevel'];
    if (typeof maxLevel !== 'number' || !Number.isInteger(maxLevel) || maxLevel < 1) {
      throw new ParamValidationError(FILE, `${path}.maxLevel`, '1 이상의 정수가 필요합니다');
    }
    const def: UpgradeDefinition = {
      id,
      label: itemRaw['label'],
      bonusPerLevel: bonus,
      maxLevel,
    };
    if (typeof itemRaw['paramRef'] === 'string') def.paramRef = itemRaw['paramRef'];
    if (typeof itemRaw['note'] === 'string') def.note = itemRaw['note'];
    return def;
  });
}

/**
 * 단계 상태 → 합연산 보정 합. 단계는 [0, maxLevel]로 클램프,
 * 카탈로그에 없는 id는 무시한다 (세이브가 미래·과거 항목을 담고 있어도 안전).
 */
export function sumUpgradeBonuses(
  catalog: readonly UpgradeDefinition[],
  levels: Readonly<Record<string, number>>,
): number {
  let sum = 0;
  for (const def of catalog) {
    const rawLevel = levels[def.id] ?? 0;
    const level = Math.min(Math.max(Math.floor(rawLevel), 0), def.maxLevel);
    sum += level * def.bonusPerLevel;
  }
  return sum;
}

/**
 * 확정 공식 적용 — **계산 본체는 리드 소유 `src/meta/upgradeMath.ts`의
 * `effectiveValue`** 하나뿐이다 (PvE 1차 통합에서 중복 구현 해소,
 * INTEGRATION_NOTES '계약 이름 통합 결정' #2).
 *
 * 이 함수는 시뮬레이터·툴링 호출부의 이름을 유지하기 위한 위임 래퍼다.
 * 여기에 수식을 다시 쓰지 말 것 — 보정 합 유효성 검사(-100% 이하 거부)도
 * 리드 구현이 함께 수행한다.
 */
export function applyUpgradeBonus(baseValue: number, bonusSum: number): number {
  return effectiveValue(baseValue, bonusSum);
}
