/**
 * `Tunable` / `NullableTunable` 공용 리더 (툴링 소유 — INT-CORE-022).
 *
 * 계약 정본은 `src/contracts/params.ts`이며 **여기서 타입을 재정의하지
 * 않는다**. 리드의 `src/config/bossParams.ts`가 같은 규약의 리더를 갖고
 * 있으나 그 파일은 공통 보호 영역이라 export를 늘리지 않았다 — 대신 툴링이
 * 소유한 params(interaction·sonar·economy farming)용 리더를 여기 한 곳에
 * 둔다. 보스 params는 **리드 로더를 그대로 재사용**하고 이 파일로 다시
 * 구현하지 않는다.
 *
 * ## null과 누락은 다르다
 *
 *  - `value: null` → 미확정. 통과시키되 소비 측이 해당 축을 unwired로 둔다.
 *  - 키 누락 → **거부.** '정책이 없다'와 '수치가 아직 없다'는 다른 상태이고,
 *    누락을 null로 읽어 주면 오타가 조용히 미확정으로 둔갑한다.
 *  - `null → 0` 변환 **금지.** 0은 '0이라고 정했다'는 결정이다.
 *  - fallback 금지 — 값이 없으면 없는 대로 전달한다.
 */

import type { NullableTunable, Tunable } from '../contracts/params';

export class TunableValidationError extends Error {
  readonly file: string;
  readonly path: string;

  constructor(file: string, path: string, message: string) {
    super(`[params 검증 실패] ${file} → ${path}: ${message}`);
    this.name = 'TunableValidationError';
    this.file = file;
    this.path = path;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireBlock(
  file: string,
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const block = parent[key];
  if (!isRecord(block)) {
    throw new TunableValidationError(file, key, '객체 블록이 필요합니다 (키 누락 거부)');
  }
  return block;
}

/** range·unit 공통 검사 — Tunable·NullableTunable이 같은 규칙을 쓴다 */
function readRangeAndUnit(
  file: string,
  path: string,
  raw: Record<string, unknown>,
): { min: number; max: number; unit: string; note?: string } {
  const range = raw['range'];
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    range.some((r) => typeof r !== 'number' || !Number.isFinite(r))
  ) {
    throw new TunableValidationError(file, `${path}.range`, '[최소, 최대] 숫자 2개가 필요합니다');
  }
  const [min, max] = range as [number, number];
  if (!(min <= max)) {
    throw new TunableValidationError(file, `${path}.range`, `최소(${min}) ≤ 최대(${max}) 이어야 합니다`);
  }
  const unit = raw['unit'];
  if (typeof unit !== 'string' || unit.length === 0) {
    throw new TunableValidationError(file, `${path}.unit`, '단위 문자열이 필요합니다 (unit 필수)');
  }
  const note = raw['note'];
  return { min, max, unit, ...(typeof note === 'string' ? { note } : {}) };
}

/** 숫자 검사 — NaN·Infinity·문자열·boolean 전부 거부 */
function requireFiniteNumber(file: string, path: string, value: unknown): number {
  if (typeof value === 'string') {
    throw new TunableValidationError(file, path, `문자열이 아니라 숫자여야 합니다 (받은 값: ${JSON.stringify(value)})`);
  }
  if (typeof value !== 'number') {
    throw new TunableValidationError(file, path, `숫자가 필요합니다 (받은 값: ${JSON.stringify(value)})`);
  }
  if (Number.isNaN(value)) throw new TunableValidationError(file, path, 'NaN은 허용되지 않습니다');
  if (!Number.isFinite(value)) throw new TunableValidationError(file, path, 'Infinity는 허용되지 않습니다');
  return value;
}

/** 확정 수치 — value는 반드시 숫자이고 range 안이어야 한다 */
export function readTunable(
  file: string,
  parent: Record<string, unknown>,
  path: string,
  key: string,
): Tunable {
  const raw = parent[key];
  const full = `${path}${key}`;
  if (!isRecord(raw)) {
    throw new TunableValidationError(file, full, '{ value, range, unit } 객체가 필요합니다 (키 누락 거부)');
  }
  if (!('value' in raw)) {
    throw new TunableValidationError(file, `${full}.value`, 'value 키가 필요합니다');
  }
  const { min, max, unit, note } = readRangeAndUnit(file, full, raw);
  const value = requireFiniteNumber(file, `${full}.value`, raw['value']);
  if (value < min || value > max) {
    throw new TunableValidationError(file, `${full}.value`, `조정 범위 [${min}, ${max}] 밖의 값입니다: ${value}`);
  }
  return { value, range: [min, max], unit, ...(note !== undefined ? { note } : {}) };
}

/** 승인 대기 수치 — value: null 허용. null→0 변환·fallback 없음 */
export function readNullableTunable(
  file: string,
  parent: Record<string, unknown>,
  path: string,
  key: string,
): NullableTunable {
  const raw = parent[key];
  const full = `${path}${key}`;
  if (!isRecord(raw)) {
    throw new TunableValidationError(
      file,
      full,
      '{ value: 숫자|null, range, unit } 객체가 필요합니다 (키 누락 불가 — null과 누락은 다르다)',
    );
  }
  if (!('value' in raw)) {
    throw new TunableValidationError(file, `${full}.value`, 'value 키가 필요합니다 (미확정이면 null)');
  }
  const { min, max, unit, note } = readRangeAndUnit(file, full, raw);
  const rawValue = raw['value'];
  let value: number | null = null;
  if (rawValue !== null) {
    value = requireFiniteNumber(file, `${full}.value`, rawValue);
    if (value < min || value > max) {
      throw new TunableValidationError(file, `${full}.value`, `조정 범위 [${min}, ${max}] 밖의 값입니다: ${value}`);
    }
  }
  return { value, range: [min, max], unit, ...(note !== undefined ? { note } : {}) };
}

/** 계약에 없는 키 거부 — 오타로 필드가 조용히 무시되는 것을 막는다 */
export function rejectUnknownKeys(
  file: string,
  block: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(block)) {
    if (key.startsWith('$')) continue;
    if (!allowed.includes(key)) {
      throw new TunableValidationError(file, `${path}${key}`, `계약에 없는 필드입니다. 허용: ${allowed.join(', ')}`);
    }
  }
}

/** 미확정(null) 필드 경로 목록 — '수치를 발명하지 않았다'의 기계적 증거 */
export function pendingTunables(
  entries: readonly (readonly [string, NullableTunable | Tunable])[],
): string[] {
  return entries
    .filter(([, tunable]) => (tunable as NullableTunable).value === null)
    .map(([path]) => path);
}
