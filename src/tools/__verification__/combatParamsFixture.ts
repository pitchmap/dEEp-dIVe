/**
 * C9 combat params 검증용 픽스처 (툴링 소유 — **테스트 전용**).
 *
 * production `params/combat.json`과 **분리된 파일**이다. 여기의 숫자는
 * 검증기가 관계 규칙·거부 규칙을 제대로 구현했는지 확인하기 위한 합성값이며,
 * **공식 밸런스 수치가 아니다.** production 코드가 이 파일을 import하면
 * `verify:sprint-c`의 `C9-fixtureIsolation`이 실패한다.
 *
 * 숫자를 여기 두는 이유: production JSON은 전 항목 null이라 '값이 있을 때의
 * 관계 검증'을 스스로 검사할 수 없다. 그렇다고 production에 임시 숫자를
 * 넣으면 미확정이 확정으로 위장되므로, 확정값은 이 파일에만 둔다.
 */

/** 전 항목 null — production JSON과 같은 상태 (미확정 통과 확인용) */
export function allNullCombatFixture(): Record<string, unknown> {
  const wrap = (): Record<string, unknown> => ({ value: null });
  return {
    hull: { baseMaxHull: wrap(), damagedRatioThreshold: wrap(), criticalRatioThreshold: wrap() },
    depthCharge: {
      directRadiusMeters: wrap(),
      nearRadiusMeters: wrap(),
      directDamage: wrap(),
      nearDamage: wrap(),
      dropCooldownSeconds: wrap(),
      directFloodingContribution: wrap(),
      nearFloodingContribution: wrap(),
    },
    flooding: {
      minorThreshold: wrap(),
      majorThreshold: wrap(),
      catastrophicThreshold: wrap(),
      hullDamagePerSecondAtFull: wrap(),
      spreadPerSecond: wrap(),
    },
    detection: { distanceFalloff: wrap(), gaugeDecayPerSecond: wrap() },
  };
}

/**
 * 전 항목 확정 — 관계 규칙을 전부 만족하는 합성값.
 * **밸런스 제안이 아니다.** 검증기가 정상값을 통과시키는지만 본다.
 */
export function fullyDefinedCombatFixture(): Record<string, unknown> {
  const wrap = (value: unknown): Record<string, unknown> => ({ value });
  return {
    hull: {
      baseMaxHull: wrap(100),
      damagedRatioThreshold: wrap(0.6),
      criticalRatioThreshold: wrap(0.25),
    },
    depthCharge: {
      directRadiusMeters: wrap(4),
      nearRadiusMeters: wrap(12),
      directDamage: wrap(40),
      nearDamage: wrap(15),
      dropCooldownSeconds: wrap(6),
      directFloodingContribution: wrap(0.5),
      nearFloodingContribution: wrap(0.2),
    },
    flooding: {
      minorThreshold: wrap(0.2),
      majorThreshold: wrap(0.5),
      catastrophicThreshold: wrap(0.8),
      hullDamagePerSecondAtFull: wrap(5),
      spreadPerSecond: wrap(0.02),
    },
    detection: {
      distanceFalloff: wrap({ fullEffectMeters: 20, zeroEffectMeters: 80 }),
      gaugeDecayPerSecond: wrap(0.15),
    },
  };
}

/** 임의 경로의 값을 바꾼 사본 — 거부 규칙 테스트용 */
export function withCombatOverride(
  base: Record<string, unknown>,
  block: string,
  field: string,
  value: unknown,
): Record<string, unknown> {
  const draft = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  const target = draft[block] as Record<string, unknown>;
  target[field] = { value };
  return draft;
}

/** 필드를 통째로 삭제한 사본 — '누락 vs null' 구분 테스트용 */
export function withCombatFieldRemoved(
  base: Record<string, unknown>,
  block: string,
  field: string,
): Record<string, unknown> {
  const draft = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  delete (draft[block] as Record<string, unknown>)[field];
  return draft;
}
