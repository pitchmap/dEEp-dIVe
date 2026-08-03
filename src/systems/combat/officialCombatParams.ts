/**
 * C1·C4 공식 전투 params 리더 — **미확정은 null 그대로 통과** (스프린트 C).
 *
 * ## 원칙
 *
 *  - 이 모듈은 **수치를 만들지 않는다.** 공식 파일에 항목이 없으면 `null`을
 *    그대로 내보내고, 소비 시스템은 그 상태를 `unwired`로 유지한다
 *    (게이지 0 고정 / 피해 없음). null을 0·기본값으로 바꾸지 않는다.
 *  - production 시스템은 JSON을 직접 읽지 않는다 — 조립부가 읽은 원본을
 *    이 구조 어댑터에 넘긴다 (INT-CORE-011에서 고정한 주입 규칙).
 *  - 테스트 픽스처 수치를 production fallback으로 쓰지 않는다. 픽스처는
 *    검증 코드 안에서만 만들어 주입한다.
 *
 * ## 현재 상태 (정직한 기록)
 *
 * `params/combat.json`에는 C9 [COMBAT] 이관 대상 필드가 **아직 없다** —
 * 폭뢰 direct/near 반경·피해·투하 쿨다운, 탐지 거리 감쇠·게이지 감소율.
 * 따라서 아래 리더는 전부 null을 반환하고 production은 unwired다.
 */

import type { DetectionTuningParams } from '../../contracts/detection';
import type { DepthChargeDamageParams } from '../../contracts/survival';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 확정 수치 표기 흡수 — `12` 또는 `{ value: 12, range, unit, note }`.
 * 값이 없거나 유한하지 않으면 **null**(미확정)이다.
 */
function officialNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const record = asRecord(raw);
  const value = record?.['value'];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 탐지 미확정 2종 읽기 — 거리 감쇠 곡선·게이지 감소율.
 * 공식 문서에 없으므로 현재는 둘 다 null이며, 그 상태가 곧 `unwired`다.
 */
export function readDetectionTuningParams(rawCombat: unknown): DetectionTuningParams {
  const root = asRecord(rawCombat);
  const falloffRaw = asRecord(root?.['distanceFalloff']);
  const fullEffectMeters = officialNumber(falloffRaw?.['fullEffectMeters']);
  const zeroEffectMeters = officialNumber(falloffRaw?.['zeroEffectMeters']);
  const distanceFalloff =
    fullEffectMeters === null || zeroEffectMeters === null || zeroEffectMeters <= fullEffectMeters
      ? null
      : Object.freeze({ fullEffectMeters, zeroEffectMeters });

  return Object.freeze({
    distanceFalloff,
    gaugeDecayPerSecond: nonNegativeOrNull(officialNumber(root?.['gaugeDecayPerSecond'])),
  });
}

/**
 * 폭뢰 피해 params 읽기 — 반경·피해량·투하 쿨다운.
 * 하나라도 null이면 해당 판정이 unwired다 (폭발 연출은 가능하되 피해 없음).
 */
export function readDepthChargeDamageParams(rawCombat: unknown): DepthChargeDamageParams {
  const root = asRecord(rawCombat);
  return Object.freeze({
    directRadiusMeters: nonNegativeOrNull(officialNumber(root?.['directRadiusMeters'])),
    nearRadiusMeters: nonNegativeOrNull(officialNumber(root?.['nearRadiusMeters'])),
    directDamage: nonNegativeOrNull(officialNumber(root?.['directDamage'])),
    nearDamage: nonNegativeOrNull(officialNumber(root?.['nearDamage'])),
    dropCooldownSeconds: nonNegativeOrNull(officialNumber(root?.['dropCooldownSeconds'])),
  });
}

/** 음수는 미확정과 같게 다룬다 — 잘못된 값을 보정해 쓰지 않는다 */
function nonNegativeOrNull(value: number | null): number | null {
  return value === null || value < 0 ? null : value;
}

/** 폭뢰 피해 판정에 필요한 값이 전부 확정됐는가 (하나라도 null이면 false) */
export function depthChargeDamageWired(params: DepthChargeDamageParams | null): boolean {
  if (!params) return false;
  return (
    params.directRadiusMeters !== null &&
    params.nearRadiusMeters !== null &&
    params.directDamage !== null &&
    params.nearDamage !== null
  );
}
