/**
 * params/boss.json 검증·로드 (계약 `contracts/params.BossParams`와 한 몸 —
 * `src/config/` 규약. 17차 결의 3 창 1).
 *
 * 원칙:
 *  - 정규화·검증은 이 파일 **한 곳**뿐이다 — 시스템·UI의 boss.json 직접
 *    import 금지 (C9 로더 단일 소유 원칙 재사용).
 *  - Tunable은 range를 벗어나면 로드 거부 (§11 — 코드가 밸런스를 정하지
 *    않는다).
 *  - 패턴 플래그는 정확히 4키 — **미지 키(소환·회전 근접 등)는 거부**한다
 *    (16차 결의 1-3 봉인, 스텁·플래그 선점 금지).
 *  - 관계 검증: phase2 임계 > phase3 임계 / clueIds 길이 = requiredClues ·
 *    중복 금지.
 */

import type { BossParams, BossPatternFlags, FixedNumber, Tunable } from '../contracts/params';

export class BossParamValidationError extends Error {
  constructor(path: string, detail: string) {
    super(`[보스 파라미터 검증 실패] params/boss.json → ${path}: ${detail}`);
    this.name = 'BossParamValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireBlock(parent: Record<string, unknown>, path: string, key: string): Record<string, unknown> {
  const block = parent[key];
  if (!isRecord(block)) throw new BossParamValidationError(`${path}${key}`, '객체가 필요합니다');
  return block;
}

function readTunable(parent: Record<string, unknown>, path: string, key: string): Tunable {
  const raw = parent[key];
  if (!isRecord(raw)) throw new BossParamValidationError(`${path}${key}`, '{ value, range, unit } 객체가 필요합니다');
  const value = raw['value'];
  const range = raw['range'];
  const unit = raw['unit'];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BossParamValidationError(`${path}${key}.value`, `유한한 숫자가 필요합니다 (받은 값: ${JSON.stringify(value)})`);
  }
  if (!Array.isArray(range) || range.length !== 2 || range.some((r) => typeof r !== 'number' || !Number.isFinite(r))) {
    throw new BossParamValidationError(`${path}${key}.range`, '[최소, 최대] 숫자 2개가 필요합니다');
  }
  const [min, max] = range as [number, number];
  if (!(min <= max)) throw new BossParamValidationError(`${path}${key}.range`, `최소(${min}) ≤ 최대(${max}) 이어야 합니다`);
  if (value < min || value > max) {
    throw new BossParamValidationError(`${path}${key}.value`, `조정 범위 [${min}, ${max}] 밖의 값입니다: ${value}`);
  }
  if (typeof unit !== 'string' || unit.length === 0) {
    throw new BossParamValidationError(`${path}${key}.unit`, '단위 문자열이 필요합니다');
  }
  return { value, range: [min, max], unit, note: typeof raw['note'] === 'string' ? raw['note'] : undefined };
}

function readFixedNumber(parent: Record<string, unknown>, path: string, key: string): FixedNumber {
  const raw = parent[key];
  if (!isRecord(raw)) throw new BossParamValidationError(`${path}${key}`, '{ value, unit } 객체가 필요합니다');
  const value = raw['value'];
  const unit = raw['unit'];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BossParamValidationError(`${path}${key}.value`, `0 이상의 유한한 숫자가 필요합니다 (받은 값: ${JSON.stringify(value)})`);
  }
  if (typeof unit !== 'string' || unit.length === 0) {
    throw new BossParamValidationError(`${path}${key}.unit`, '단위 문자열이 필요합니다');
  }
  return { value, unit, note: typeof raw['note'] === 'string' ? raw['note'] : undefined };
}

/** 패턴 플래그 정본 키 — 이 4키 외의 키는 거부한다 (봉인 강제) */
const PATTERN_FLAG_KEYS = ['ram', 'projectile', 'weakPointOpen', 'finalAcceleration'] as const;

function readPatternFlags(parent: Record<string, unknown>, path: string): BossPatternFlags {
  const raw = requireBlock(parent, path, 'flags');
  for (const key of Object.keys(raw)) {
    if (key.startsWith('$')) continue;
    if (!(PATTERN_FLAG_KEYS as readonly string[]).includes(key)) {
      throw new BossParamValidationError(
        `${path}flags.${key}`,
        `봉인된 패턴 목록에 없는 키입니다 — 허용: ${PATTERN_FLAG_KEYS.join(', ')} (16차 결의 1-3: 소환·회전 근접은 부활 절차 없이 추가 금지)`,
      );
    }
  }
  const read = (key: (typeof PATTERN_FLAG_KEYS)[number]): boolean => {
    const value = raw[key];
    if (typeof value !== 'boolean') {
      throw new BossParamValidationError(`${path}flags.${key}`, `불리언이 필요합니다 (받은 값: ${JSON.stringify(value)})`);
    }
    return value;
  };
  return {
    ram: read('ram'),
    projectile: read('projectile'),
    weakPointOpen: read('weakPointOpen'),
    finalAcceleration: read('finalAcceleration'),
  };
}

export function validateBossParams(raw: unknown): BossParams {
  if (!isRecord(raw)) throw new BossParamValidationError('(루트)', '객체가 필요합니다');

  const id = raw['id'];
  if (typeof id !== 'string' || id.length === 0) {
    throw new BossParamValidationError('id', '보스 식별자 문자열이 필요합니다 (스코프 가드 개체 수 키)');
  }
  const name = raw['name'];
  if (typeof name !== 'string' || name.length === 0) {
    throw new BossParamValidationError('name', '이름 문자열이 필요합니다');
  }

  const hullBlock = requireBlock(raw, '', 'hull');
  const maxHull = readTunable(hullBlock, 'hull.', 'maxHull');
  const phase2AtHullRatio = readTunable(hullBlock, 'hull.', 'phase2AtHullRatio');
  const phase3AtHullRatio = readTunable(hullBlock, 'hull.', 'phase3AtHullRatio');
  if (maxHull.value <= 0) {
    throw new BossParamValidationError('hull.maxHull.value', '0보다 커야 합니다');
  }
  if (!(phase2AtHullRatio.value > phase3AtHullRatio.value)) {
    throw new BossParamValidationError(
      'hull',
      `phase2AtHullRatio(${phase2AtHullRatio.value})는 phase3AtHullRatio(${phase3AtHullRatio.value})보다 커야 합니다 — 단계는 1→2→3 순서로만 진행`,
    );
  }
  for (const [key, ratio] of [
    ['phase2AtHullRatio', phase2AtHullRatio],
    ['phase3AtHullRatio', phase3AtHullRatio],
  ] as const) {
    if (ratio.value <= 0 || ratio.value >= 1) {
      throw new BossParamValidationError(`hull.${key}.value`, `0과 1 사이 비율이어야 합니다 (받은 값: ${ratio.value})`);
    }
  }

  const patternsBlock = requireBlock(raw, '', 'patterns');
  const flags = readPatternFlags(patternsBlock, 'patterns.');
  const intervalSeconds = readTunable(patternsBlock, 'patterns.', 'intervalSeconds');
  const telegraphSeconds = readTunable(patternsBlock, 'patterns.', 'telegraphSeconds');
  const ramBlock = requireBlock(patternsBlock, 'patterns.', 'ram');
  const projectileBlock = requireBlock(patternsBlock, 'patterns.', 'projectile');
  const weakPointBlock = requireBlock(patternsBlock, 'patterns.', 'weakPointOpen');
  const finalPhaseBlock = requireBlock(patternsBlock, 'patterns.', 'finalPhase');

  const unlockBlock = requireBlock(raw, '', 'unlock');
  const requiredClues = readFixedNumber(unlockBlock, 'unlock.', 'requiredClues');
  if (!Number.isInteger(requiredClues.value) || requiredClues.value <= 0) {
    throw new BossParamValidationError('unlock.requiredClues.value', '1 이상의 정수가 필요합니다');
  }
  const clueIdsRaw = unlockBlock['clueIds'];
  if (!Array.isArray(clueIdsRaw) || clueIdsRaw.some((c) => typeof c !== 'string' || c.length === 0)) {
    throw new BossParamValidationError('unlock.clueIds', '비어 있지 않은 문자열 배열이 필요합니다');
  }
  const clueIds = clueIdsRaw as string[];
  if (new Set(clueIds).size !== clueIds.length) {
    throw new BossParamValidationError('unlock.clueIds', '단서 id가 중복됩니다');
  }
  if (clueIds.length !== requiredClues.value) {
    throw new BossParamValidationError(
      'unlock.clueIds',
      `단서 id 수(${clueIds.length})가 requiredClues(${requiredClues.value})와 다릅니다`,
    );
  }

  const rewardBlock = requireBlock(raw, '', 'reward');
  const rewardRareParts = readFixedNumber(rewardBlock, 'reward.', 'rareParts');
  if (!Number.isInteger(rewardRareParts.value)) {
    throw new BossParamValidationError('reward.rareParts.value', '정수가 필요합니다');
  }

  return {
    id,
    name,
    hull: { maxHull, phase2AtHullRatio, phase3AtHullRatio },
    patterns: {
      flags,
      intervalSeconds,
      telegraphSeconds,
      ram: {
        speedMetersPerSecond: readTunable(ramBlock, 'patterns.ram.', 'speedMetersPerSecond'),
        durationSeconds: readTunable(ramBlock, 'patterns.ram.', 'durationSeconds'),
      },
      projectile: {
        speedMetersPerSecond: readTunable(projectileBlock, 'patterns.projectile.', 'speedMetersPerSecond'),
        damage: readTunable(projectileBlock, 'patterns.projectile.', 'damage'),
      },
      weakPointOpen: {
        openSeconds: readTunable(weakPointBlock, 'patterns.weakPointOpen.', 'openSeconds'),
        weakPointDamageMultiplier: readTunable(weakPointBlock, 'patterns.weakPointOpen.', 'weakPointDamageMultiplier'),
        closedHullDamageMultiplier: readTunable(weakPointBlock, 'patterns.weakPointOpen.', 'closedHullDamageMultiplier'),
      },
      finalPhase: {
        speedMultiplier: readTunable(finalPhaseBlock, 'patterns.finalPhase.', 'speedMultiplier'),
        intervalMultiplier: readTunable(finalPhaseBlock, 'patterns.finalPhase.', 'intervalMultiplier'),
      },
    },
    unlock: { requiredClues, clueIds: [...clueIds] },
    reward: { rareParts: rewardRareParts, credits: readFixedNumber(rewardBlock, 'reward.', 'credits') },
  };
}
