/**
 * params/*.json 런타임 검증.
 *
 * 목적: 조정 범위를 벗어난 값·형식 오류를 로드 시점에 명확한 오류 메시지로
 * 거부한다 (조용한 클램프 금지 — 잘못된 값은 게이트 데이터를 오염시킨다).
 *
 * 여기서는 "형식과 범위"만 검증한다. 값 자체의 밸런스 판단은
 * docs/templates/TUNING_LOG.md 프로세스(마스터 플랜 §11)를 따른다.
 */

import type {
  CombatParams,
  CrewMemberId,
  CrewParams,
  DetectionParams,
  FixedNumber,
  GameParams,
  MovementParams,
  Tunable,
} from '../contracts/params';
import type { DepthLayerId } from '../contracts/events';

const DEPTH_LAYERS: readonly DepthLayerId[] = ['periscope', 'cruise', 'deep'];
const CREW_MEMBERS: readonly CrewMemberId[] = [
  'captain',
  'sonarOperator',
  'chiefEngineer',
  'torpedoOperator',
];

export class ParamValidationError extends Error {
  constructor(file: string, path: string, detail: string) {
    super(`[파라미터 검증 실패] ${file} → ${path}: ${detail}`);
    this.name = 'ParamValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireFiniteNumber(file: string, path: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ParamValidationError(file, path, `유한한 숫자가 필요하지만 ${JSON.stringify(value)} 를 받았습니다`);
  }
  return value;
}

function validateFixedNumber(file: string, path: string, raw: unknown): FixedNumber {
  if (!isRecord(raw)) {
    throw new ParamValidationError(file, path, '객체({ value, unit })가 필요합니다');
  }
  const value = requireFiniteNumber(file, `${path}.value`, raw['value']);
  if (typeof raw['unit'] !== 'string') {
    throw new ParamValidationError(file, `${path}.unit`, '단위 문자열이 필요합니다');
  }
  const result: FixedNumber = { value, unit: raw['unit'] };
  if (typeof raw['note'] === 'string') result.note = raw['note'];
  return result;
}

function validateTunable(file: string, path: string, raw: unknown): Tunable {
  if (!isRecord(raw)) {
    throw new ParamValidationError(file, path, '객체({ value, range, unit })가 필요합니다');
  }
  const value = requireFiniteNumber(file, `${path}.value`, raw['value']);

  const range = raw['range'];
  if (!Array.isArray(range) || range.length !== 2) {
    throw new ParamValidationError(file, `${path}.range`, '[최소, 최대] 두 값의 배열이 필요합니다');
  }
  const min = requireFiniteNumber(file, `${path}.range[0]`, range[0]);
  const max = requireFiniteNumber(file, `${path}.range[1]`, range[1]);
  if (min > max) {
    throw new ParamValidationError(file, `${path}.range`, `최소(${min})가 최대(${max})보다 큽니다`);
  }
  if (value < min || value > max) {
    throw new ParamValidationError(
      file,
      `${path}.value`,
      `${value} 가 허용 범위 [${min}, ${max}] 를 벗어났습니다`,
    );
  }
  if (typeof raw['unit'] !== 'string') {
    throw new ParamValidationError(file, `${path}.unit`, '단위 문자열이 필요합니다');
  }
  const result: Tunable = { value, range: [min, max], unit: raw['unit'] };
  if (typeof raw['note'] === 'string') result.note = raw['note'];
  return result;
}

export function validateMovementParams(raw: unknown): MovementParams {
  const file = 'params/movement.json';
  if (!isRecord(raw)) throw new ParamValidationError(file, '(루트)', '객체가 필요합니다');
  return {
    stopInertiaSeconds: validateTunable(file, 'stopInertiaSeconds', raw['stopInertiaSeconds']),
    turn90Seconds: validateTunable(file, 'turn90Seconds', raw['turn90Seconds']),
  };
}

export function validateDetectionParams(raw: unknown): DetectionParams {
  const file = 'params/detection.json';
  if (!isRecord(raw)) throw new ParamValidationError(file, '(루트)', '객체가 필요합니다');

  const modifiersRaw = raw['depthModifiers'];
  if (!isRecord(modifiersRaw)) {
    throw new ParamValidationError(file, 'depthModifiers', '심도 3층 보정값 객체가 필요합니다');
  }
  const depthModifiers = {} as Record<DepthLayerId, number>;
  for (const layer of DEPTH_LAYERS) {
    depthModifiers[layer] = requireFiniteNumber(file, `depthModifiers.${layer}`, modifiersRaw[layer]);
  }
  const extraKeys = Object.keys(modifiersRaw).filter(
    (key) => !(DEPTH_LAYERS as readonly string[]).includes(key),
  );
  if (extraKeys.length > 0) {
    throw new ParamValidationError(
      file,
      'depthModifiers',
      `심도 층은 3개로 확정되어 있습니다 (4층 이상 확장 금지) — 허용되지 않은 키: ${extraKeys.join(', ')}`,
    );
  }

  return {
    gaugeFillSecondsAtPeriscope: validateTunable(
      file,
      'gaugeFillSecondsAtPeriscope',
      raw['gaugeFillSecondsAtPeriscope'],
    ),
    depthModifiers,
    silentRunningNoiseMultiplier: validateTunable(
      file,
      'silentRunningNoiseMultiplier',
      raw['silentRunningNoiseMultiplier'],
    ),
  };
}

export function validateCombatParams(raw: unknown): CombatParams {
  const file = 'params/combat.json';
  if (!isRecord(raw)) throw new ParamValidationError(file, '(루트)', '객체가 필요합니다');

  const fuse = validateTunable(file, 'depthChargeFuseSeconds', raw['depthChargeFuseSeconds']);
  // 신관 하한 3.0초는 인간 반응 사슬(1.8초)+관성 근거의 고정 하한 [확정 — §5.12]
  if (fuse.range[0] < 3.0) {
    throw new ParamValidationError(
      file,
      'depthChargeFuseSeconds.range',
      `신관 하한은 3.0초 고정입니다 (받은 값: ${fuse.range[0]}) — 난이도는 동시 폭뢰 수로 조절합니다`,
    );
  }

  const simultaneous = validateTunable(
    file,
    'simultaneousDepthCharges',
    raw['simultaneousDepthCharges'],
  );
  if (!Number.isInteger(simultaneous.value)) {
    throw new ParamValidationError(file, 'simultaneousDepthCharges.value', '정수가 필요합니다');
  }

  const capacity = validateFixedNumber(file, 'torpedoCapacity', raw['torpedoCapacity']);
  if (!Number.isInteger(capacity.value) || capacity.value <= 0) {
    throw new ParamValidationError(file, 'torpedoCapacity.value', '1 이상의 정수가 필요합니다');
  }

  return {
    torpedoCapacity: capacity,
    torpedoReloadSeconds: validateTunable(file, 'torpedoReloadSeconds', raw['torpedoReloadSeconds']),
    depthChargeFuseSeconds: fuse,
    simultaneousDepthCharges: simultaneous,
    nearMissPushbackMeters: validateTunable(
      file,
      'nearMissPushbackMeters',
      raw['nearMissPushbackMeters'],
    ),
  };
}

export function validateCrewParams(raw: unknown): CrewParams {
  const file = 'params/crew.json';
  if (!isRecord(raw)) throw new ParamValidationError(file, '(루트)', '객체가 필요합니다');

  const membersRaw = raw['members'];
  if (!isRecord(membersRaw)) {
    throw new ParamValidationError(file, 'members', '승무원 4인 객체가 필요합니다');
  }
  const members = {} as CrewParams['members'];
  for (const id of CREW_MEMBERS) {
    const memberRaw = membersRaw[id];
    if (!isRecord(memberRaw)) {
      throw new ParamValidationError(file, `members.${id}`, '승무원 스킬 객체가 필요합니다');
    }
    members[id] = {
      cooldownSeconds: validateTunable(file, `members.${id}.cooldownSeconds`, memberRaw['cooldownSeconds']),
    };
  }
  const extraMembers = Object.keys(membersRaw).filter(
    (key) => !(CREW_MEMBERS as readonly string[]).includes(key),
  );
  if (extraMembers.length > 0) {
    throw new ParamValidationError(
      file,
      'members',
      `승무원은 4명 고정입니다 — 허용되지 않은 키: ${extraMembers.join(', ')}`,
    );
  }

  return {
    members,
    torpedoOperatorReloadSeconds: validateTunable(
      file,
      'torpedoOperatorReloadSeconds',
      raw['torpedoOperatorReloadSeconds'],
    ),
  };
}

export function validateGameParams(raw: {
  movement: unknown;
  detection: unknown;
  combat: unknown;
  crew: unknown;
}): GameParams {
  return {
    movement: validateMovementParams(raw.movement),
    detection: validateDetectionParams(raw.detection),
    combat: validateCombatParams(raw.combat),
    crew: validateCrewParams(raw.crew),
  };
}
