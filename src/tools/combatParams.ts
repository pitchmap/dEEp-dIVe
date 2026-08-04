/**
 * C9 전투 params 검증·로드 (툴링 소유 — 스프린트 C 인계표 '빌드·툴 창').
 *
 * ## 필드명은 계약이 정본이다
 *
 * 여기 등장하는 property 이름은 전부 `src/contracts/survival.ts`·
 * `detection.ts`의 것과 1:1이다. **새 이름을 만들지 않는다** — 이름이
 * 어긋나면 소비 측이 조용히 undefined를 읽게 되므로, 계약 타입을 직접
 * import해 컴파일 시점에 고정한다.
 *
 * ## null = 명시적 unwired
 *
 * 전 필드가 `null`(미확정) 또는 유효 숫자를 받는다.
 *
 *  - `null`  → 통과. 미확정 목록에 실려 보고된다.
 *  - 키 누락 → **거부**. '적지 않은 것'과 '미확정이라고 적은 것'은 다르다.
 *  - 0·임의 기본값으로 치환 → **하지 않는다.** 로더는 provisional 값을
 *    삽입하지 않으며, 값이 없으면 블록 전체를 `null`로 돌려준다.
 *
 * 부분 확정(일부만 값이 있음)은 주입 대상이 아니다. 계약의
 * `HullBaseParams`·`FloodingParams`는 전 필드가 non-nullable이므로,
 * 하나라도 미확정이면 그 블록은 unwired다. `DepthChargeDamageParams`만
 * 계약이 필드별 `number | null`을 허용하므로 부분 확정을 그대로 전달한다.
 *
 * ## 관계 검증은 값이 다 있을 때만
 *
 * 경계 관계(`damaged > critical`, `minor < major < catastrophic`,
 * `directRadius < nearRadius`, `fullEffect < zeroEffect`)는 **계약 주석에
 * 명시된 것만** 검사하고, 양쪽 값이 모두 존재할 때만 적용한다. 한쪽이
 * null이면 비교할 대상이 없으므로 검사하지 않는다.
 *
 * 공식 문서에 없는 범위(예: '최대 내구도는 100 이하')는 강제하지 않는다 —
 * 수치 발명 금지와 같은 이유로, 검증기가 밸런스를 정하지 않는다.
 *
 * ## 압력은 여기 없다
 *
 * `DepthPressureParams`(`safeDepthY` 등)는 DECISIONS C-8로 C 핵심 범위에서
 * 제외됐다. 스키마·게이트 어디에도 넣지 않는다.
 */

import { ParamValidationError } from '../config/validateParams';
import type { DetectionTuningParams } from '../contracts/detection';
import type {
  DepthChargeDamageParams,
  FloodingParams,
  HullBaseParams,
} from '../contracts/survival';

const COMBAT_FILE = 'params/combat.json';

/* ── 계약 필드명 정본 (오타·개명 차단) ───────────────────────── */

export const HULL_FIELDS = ['baseMaxHull', 'damagedRatioThreshold', 'criticalRatioThreshold'] as const;

export const DEPTH_CHARGE_FIELDS = [
  'directRadiusMeters',
  'nearRadiusMeters',
  'directDamage',
  'nearDamage',
  'dropCooldownSeconds',
  // C9 v0.1.1 확장 — 피격 근접도별 침수 기여량 (정규화 flooding level ratio)
  'directFloodingContribution',
  'nearFloodingContribution',
] as const;

export const FLOODING_FIELDS = [
  'minorThreshold',
  'majorThreshold',
  'catastrophicThreshold',
  'hullDamagePerSecondAtFull',
  'spreadPerSecond',
] as const;

export const DETECTION_TUNING_FIELDS = ['distanceFalloff', 'gaugeDecayPerSecond'] as const;

/** 압력 필드 — C 핵심 범위 제외(DECISIONS C-8). 필수 게이트에 넣지 않는다 */
export const EXCLUDED_PRESSURE_FIELDS = [
  'safeDepthY',
  'pressureDamageStartY',
  'damageTickSeconds',
  'damagePerTick',
  'instantCrushY',
] as const;

/**
 * 검증 결과 — 블록별 주입 값 + 미확정 목록.
 *
 * `null` 블록은 '아직 주입하지 않는다'는 뜻이며, 소비 측은 계약대로
 * `unwired` 상태로 남는다.
 */
export interface CombatParamsResult {
  /**
   * 패시브 소나 스코프에 낙하 중 폭뢰를 표시할지 (초기값 false).
   *
   * 소나 표시 정책이므로 C9 4블록과 달리 **미확정 null을 두지 않는다** —
   * 표시/미표시 둘 중 하나는 반드시 정해져 있어야 하고, 기본은 '보여주지
   * 않음'이다. 소비 측은 이 값이 false면 폭뢰를 스코프에 그리지 않는다.
   */
  readonly depthChargeOnPassiveScope: boolean;
  readonly hull: HullBaseParams | null;
  readonly depthCharge: DepthChargeDamageParams | null;
  readonly flooding: FloodingParams | null;
  readonly detectionTuning: DetectionTuningParams | null;
  /** 미확정(null) 필드 경로 — '수치를 발명하지 않았다'의 증거 */
  readonly pendingFields: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `{ value, unit?, note? }` 래퍼에서 값을 꺼낸다.
 *
 * 키 누락과 `value: null`을 구분하는 지점이다 — 블록이나 `value` 키가
 * 아예 없으면 거부하고, `value: null`은 미확정으로 통과시킨다.
 */
function readWrapped(block: Record<string, unknown>, blockPath: string, field: string): unknown {
  const entry = block[field];
  if (entry === undefined) {
    throw new ParamValidationError(
      COMBAT_FILE,
      `${blockPath}.${field}`,
      '필드가 없습니다 — 미확정이면 { "value": null }로 **명시**하세요 (생략과 null은 다릅니다)',
    );
  }
  if (!isRecord(entry)) {
    throw new ParamValidationError(COMBAT_FILE, `${blockPath}.${field}`, '{ value, unit?, note? } 객체가 필요합니다');
  }
  if (!('value' in entry)) {
    throw new ParamValidationError(COMBAT_FILE, `${blockPath}.${field}.value`, 'value 키가 없습니다 (미확정이면 null)');
  }
  return entry['value'];
}

/**
 * 숫자 검증 — null 통과, 그 외는 유한 숫자만.
 *
 * 거부: NaN · Infinity · 문자열 숫자("12") · boolean · 음수.
 * 문자열 숫자를 거부하는 이유는 JSON 편집 중 따옴표가 남는 실수가 흔하고,
 * 조용히 통과시키면 산술이 문자열 연결로 바뀌기 때문이다.
 */
function readNumberOrNull(block: Record<string, unknown>, blockPath: string, field: string): number | null {
  const raw = readWrapped(block, blockPath, field);
  const path = `${blockPath}.${field}.value`;
  if (raw === null) return null;
  if (typeof raw === 'string') {
    throw new ParamValidationError(COMBAT_FILE, path, `문자열이 아니라 숫자여야 합니다 (받은 값: ${JSON.stringify(raw)})`);
  }
  if (typeof raw !== 'number') {
    throw new ParamValidationError(COMBAT_FILE, path, `숫자 또는 null이 필요합니다 (받은 값: ${JSON.stringify(raw)})`);
  }
  if (Number.isNaN(raw)) throw new ParamValidationError(COMBAT_FILE, path, 'NaN은 허용되지 않습니다');
  if (!Number.isFinite(raw)) throw new ParamValidationError(COMBAT_FILE, path, 'Infinity는 허용되지 않습니다');
  if (raw < 0) throw new ParamValidationError(COMBAT_FILE, path, `음수는 허용되지 않습니다 (받은 값: ${raw})`);
  return raw;
}

function requireBlock(raw: Record<string, unknown>, name: string): Record<string, unknown> {
  const block = raw[name];
  if (!isRecord(block)) {
    throw new ParamValidationError(COMBAT_FILE, name, 'C9 블록 객체가 필요합니다 (누락 거부)');
  }
  return block;
}

/** 계약에 없는 키가 섞이면 거부 — 오타로 필드가 조용히 무시되는 것을 막는다 */
function rejectUnknownFields(
  block: Record<string, unknown>,
  blockPath: string,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(block)) {
    if (key.startsWith('$')) continue;
    if (!allowed.includes(key)) {
      throw new ParamValidationError(
        COMBAT_FILE,
        `${blockPath}.${key}`,
        `계약에 없는 필드입니다. 허용: ${allowed.join(', ')}`,
      );
    }
  }
}

export function validateCombatParams(raw: unknown): CombatParamsResult {
  if (!isRecord(raw)) throw new ParamValidationError(COMBAT_FILE, '(루트)', '객체가 필요합니다');

  const pending: string[] = [];
  const track = (path: string, value: unknown): void => {
    if (value === null) pending.push(path);
  };

  /* ── 소나 표시 정책 ───────────────────────────────────── */
  // 키 자체가 없으면 거부한다 — 정책은 '미확정'으로 둘 수 없고, 누락을
  // 조용히 false로 읽으면 정책이 바뀐 줄 모르고 지나간다.
  const scopeEntry = raw['depthChargeOnPassiveScope'];
  if (!isRecord(scopeEntry) || !('value' in scopeEntry)) {
    throw new ParamValidationError(
      COMBAT_FILE,
      'depthChargeOnPassiveScope',
      '{ "value": true|false } 가 필요합니다 (소나 표시 정책 — null 불가)',
    );
  }
  const scopeValue = scopeEntry['value'];
  if (typeof scopeValue !== 'boolean') {
    throw new ParamValidationError(
      COMBAT_FILE,
      'depthChargeOnPassiveScope.value',
      `true/false가 필요합니다 (받은 값: ${JSON.stringify(scopeValue)})`,
    );
  }
  const depthChargeOnPassiveScope = scopeValue;

  /* ── 선체 ─────────────────────────────────────────────── */
  const hullBlock = requireBlock(raw, 'hull');
  rejectUnknownFields(hullBlock, 'hull', HULL_FIELDS);
  const baseMaxHull = readNumberOrNull(hullBlock, 'hull', 'baseMaxHull');
  const damagedRatioThreshold = readNumberOrNull(hullBlock, 'hull', 'damagedRatioThreshold');
  const criticalRatioThreshold = readNumberOrNull(hullBlock, 'hull', 'criticalRatioThreshold');
  track('hull.baseMaxHull', baseMaxHull);
  track('hull.damagedRatioThreshold', damagedRatioThreshold);
  track('hull.criticalRatioThreshold', criticalRatioThreshold);

  // 계약 주석의 관계: damaged > critical. 양쪽이 다 있을 때만 검사한다.
  if (damagedRatioThreshold !== null && criticalRatioThreshold !== null) {
    if (!(damagedRatioThreshold > criticalRatioThreshold)) {
      throw new ParamValidationError(
        COMBAT_FILE,
        'hull',
        `damagedRatioThreshold(${damagedRatioThreshold})는 criticalRatioThreshold(${criticalRatioThreshold})보다 커야 합니다 [계약 HullBaseParams]`,
      );
    }
  }
  // 비율 필드는 계약이 0~1로 명시했다 — 문서에 있는 범위만 강제한다.
  for (const [field, value] of [
    ['damagedRatioThreshold', damagedRatioThreshold],
    ['criticalRatioThreshold', criticalRatioThreshold],
  ] as const) {
    if (value !== null && value > 1) {
      throw new ParamValidationError(COMBAT_FILE, `hull.${field}.value`, `0~1 비율이어야 합니다 (받은 값: ${value})`);
    }
  }

  const hull: HullBaseParams | null =
    baseMaxHull !== null && damagedRatioThreshold !== null && criticalRatioThreshold !== null
      ? { baseMaxHull, damagedRatioThreshold, criticalRatioThreshold }
      : null;

  /* ── 폭뢰 ─────────────────────────────────────────────── */
  const dcBlock = requireBlock(raw, 'depthCharge');
  rejectUnknownFields(dcBlock, 'depthCharge', DEPTH_CHARGE_FIELDS);
  const directRadiusMeters = readNumberOrNull(dcBlock, 'depthCharge', 'directRadiusMeters');
  const nearRadiusMeters = readNumberOrNull(dcBlock, 'depthCharge', 'nearRadiusMeters');
  const directDamage = readNumberOrNull(dcBlock, 'depthCharge', 'directDamage');
  const nearDamage = readNumberOrNull(dcBlock, 'depthCharge', 'nearDamage');
  const dropCooldownSeconds = readNumberOrNull(dcBlock, 'depthCharge', 'dropCooldownSeconds');
  const directFloodingContribution = readNumberOrNull(dcBlock, 'depthCharge', 'directFloodingContribution');
  const nearFloodingContribution = readNumberOrNull(dcBlock, 'depthCharge', 'nearFloodingContribution');
  for (const field of DEPTH_CHARGE_FIELDS) {
    track(`depthCharge.${field}`, readWrapped(dcBlock, 'depthCharge', field));
  }

  // 계약 주석의 관계: direct 판정이 near 판정 안쪽이다.
  if (directRadiusMeters !== null && nearRadiusMeters !== null) {
    if (!(directRadiusMeters < nearRadiusMeters)) {
      throw new ParamValidationError(
        COMBAT_FILE,
        'depthCharge',
        `directRadiusMeters(${directRadiusMeters})는 nearRadiusMeters(${nearRadiusMeters})보다 작아야 합니다 [계약 DepthChargeDamageParams]`,
      );
    }
  }
  // C9 v0.1.1 침수 기여 관계: 0 < near < direct ≤ 1 (존재하는 값에만 적용).
  for (const [field, value] of [
    ['directFloodingContribution', directFloodingContribution],
    ['nearFloodingContribution', nearFloodingContribution],
  ] as const) {
    if (value !== null && !(value > 0 && value <= 1)) {
      throw new ParamValidationError(
        COMBAT_FILE,
        `depthCharge.${field}.value`,
        `0 초과 1 이하의 정규화 침수 비율이어야 합니다 (받은 값: ${value})`,
      );
    }
  }
  if (
    directFloodingContribution !== null &&
    nearFloodingContribution !== null &&
    !(nearFloodingContribution < directFloodingContribution)
  ) {
    throw new ParamValidationError(
      COMBAT_FILE,
      'depthCharge',
      `nearFloodingContribution(${nearFloodingContribution})은 directFloodingContribution(${directFloodingContribution})보다 작아야 합니다 [계약 DepthChargeDamageParams]`,
    );
  }

  // 계약이 필드별 null을 허용하므로 부분 확정을 그대로 전달한다.
  // 전 필드가 null이면 블록 자체를 null로 둬 '미주입'과 구분한다.
  const depthChargeAllNull =
    directRadiusMeters === null &&
    nearRadiusMeters === null &&
    directDamage === null &&
    nearDamage === null &&
    dropCooldownSeconds === null &&
    directFloodingContribution === null &&
    nearFloodingContribution === null;
  const depthCharge: DepthChargeDamageParams | null = depthChargeAllNull
    ? null
    : {
        directRadiusMeters,
        nearRadiusMeters,
        directDamage,
        nearDamage,
        dropCooldownSeconds,
        directFloodingContribution,
        nearFloodingContribution,
      };

  /* ── 침수 ─────────────────────────────────────────────── */
  const floodBlock = requireBlock(raw, 'flooding');
  rejectUnknownFields(floodBlock, 'flooding', FLOODING_FIELDS);
  const minorThreshold = readNumberOrNull(floodBlock, 'flooding', 'minorThreshold');
  const majorThreshold = readNumberOrNull(floodBlock, 'flooding', 'majorThreshold');
  const catastrophicThreshold = readNumberOrNull(floodBlock, 'flooding', 'catastrophicThreshold');
  const hullDamagePerSecondAtFull = readNumberOrNull(floodBlock, 'flooding', 'hullDamagePerSecondAtFull');
  const spreadPerSecond = readNumberOrNull(floodBlock, 'flooding', 'spreadPerSecond');
  for (const field of FLOODING_FIELDS) {
    track(`flooding.${field}`, readWrapped(floodBlock, 'flooding', field));
  }

  // 계약 주석의 관계: minor < major < catastrophic (인접 쌍만 비교).
  if (minorThreshold !== null && majorThreshold !== null && !(minorThreshold < majorThreshold)) {
    throw new ParamValidationError(
      COMBAT_FILE,
      'flooding',
      `minorThreshold(${minorThreshold}) < majorThreshold(${majorThreshold}) 이어야 합니다 [계약 FloodingParams]`,
    );
  }
  if (majorThreshold !== null && catastrophicThreshold !== null && !(majorThreshold < catastrophicThreshold)) {
    throw new ParamValidationError(
      COMBAT_FILE,
      'flooding',
      `majorThreshold(${majorThreshold}) < catastrophicThreshold(${catastrophicThreshold}) 이어야 합니다 [계약 FloodingParams]`,
    );
  }
  for (const [field, value] of [
    ['minorThreshold', minorThreshold],
    ['majorThreshold', majorThreshold],
    ['catastrophicThreshold', catastrophicThreshold],
  ] as const) {
    if (value !== null && value > 1) {
      throw new ParamValidationError(COMBAT_FILE, `flooding.${field}.value`, `0~1 비율이어야 합니다 (받은 값: ${value})`);
    }
  }

  const flooding: FloodingParams | null =
    minorThreshold !== null &&
    majorThreshold !== null &&
    catastrophicThreshold !== null &&
    hullDamagePerSecondAtFull !== null &&
    spreadPerSecond !== null
      ? {
          minorThreshold,
          majorThreshold,
          catastrophicThreshold,
          hullDamagePerSecondAtFull,
          spreadPerSecond,
        }
      : null;

  /* ── 탐지 튜닝 ────────────────────────────────────────── */
  const detBlock = requireBlock(raw, 'detection');
  rejectUnknownFields(detBlock, 'detection', DETECTION_TUNING_FIELDS);
  const falloffRaw = readWrapped(detBlock, 'detection', 'distanceFalloff');
  const gaugeDecayPerSecond = readNumberOrNull(detBlock, 'detection', 'gaugeDecayPerSecond');
  track('detection.distanceFalloff', falloffRaw);
  track('detection.gaugeDecayPerSecond', gaugeDecayPerSecond);

  let distanceFalloff: DetectionTuningParams['distanceFalloff'] = null;
  if (falloffRaw !== null) {
    if (!isRecord(falloffRaw)) {
      throw new ParamValidationError(
        COMBAT_FILE,
        'detection.distanceFalloff.value',
        '{ fullEffectMeters, zeroEffectMeters } 객체 또는 null이 필요합니다 [계약 DetectionTuningParams]',
      );
    }
    const readInner = (key: 'fullEffectMeters' | 'zeroEffectMeters'): number => {
      const value = falloffRaw[key];
      const path = `detection.distanceFalloff.value.${key}`;
      if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
        throw new ParamValidationError(COMBAT_FILE, path, `유한한 숫자가 필요합니다 (받은 값: ${JSON.stringify(value)})`);
      }
      if (value < 0) throw new ParamValidationError(COMBAT_FILE, path, `음수는 허용되지 않습니다 (받은 값: ${value})`);
      return value;
    };
    const fullEffectMeters = readInner('fullEffectMeters');
    const zeroEffectMeters = readInner('zeroEffectMeters');
    // 감쇠 곡선이므로 full(최대 효과 거리) < zero(효과 0 거리).
    if (!(fullEffectMeters < zeroEffectMeters)) {
      throw new ParamValidationError(
        COMBAT_FILE,
        'detection.distanceFalloff.value',
        `fullEffectMeters(${fullEffectMeters})는 zeroEffectMeters(${zeroEffectMeters})보다 작아야 합니다`,
      );
    }
    distanceFalloff = { fullEffectMeters, zeroEffectMeters };
  }

  // 계약: 둘 중 하나라도 확정되면 튜닝을 전달한다(필드별 null 허용 타입).
  const detectionTuning: DetectionTuningParams | null =
    distanceFalloff === null && gaugeDecayPerSecond === null ? null : { distanceFalloff, gaugeDecayPerSecond };

  /* ── 압력 필드 유입 차단 ──────────────────────────────── */
  // C-8로 제외된 범위가 C9 블록에 섞여 들어오면 게이트가 조용히 넓어진다.
  for (const [blockName, block] of [
    ['hull', hullBlock],
    ['depthCharge', dcBlock],
    ['flooding', floodBlock],
    ['detection', detBlock],
  ] as const) {
    for (const field of EXCLUDED_PRESSURE_FIELDS) {
      if (field in block) {
        throw new ParamValidationError(
          COMBAT_FILE,
          `${blockName}.${field}`,
          '압력 관련 필드는 C 핵심 범위 제외입니다 (DECISIONS C-8) — C9 필수 블록에 넣지 마세요',
        );
      }
    }
  }

  return {
    depthChargeOnPassiveScope,
    hull,
    depthCharge,
    flooding,
    detectionTuning,
    pendingFields: pending,
  };
}

/** C9 공식 수치가 전부 확정됐는가 (하나라도 null이면 false) */
export function combatParamsFullyDefined(result: CombatParamsResult): boolean {
  return result.pendingFields.length === 0;
}
