/**
 * 세이브 스키마 마이그레이션 (툴링 소유).
 *
 * 규칙 (개발 소회의(11) 결의 3·7):
 *  - 스키마를 바꾸는 커밋은 반드시 여기 마이그레이션 함수를 동반한다 —
 *    미동반 커밋은 코드 리뷰 반려 대상.
 *  - 키 = 마이그레이션의 '출발' 버전. 함수는 schemaVersion을 정확히 +1로
 *    올린 객체를 반환한다. migrateToCurrent가 현재 버전까지 순차 적용한다.
 *  - 마이그레이션 실패는 throw — SaveStore가 백업 복구 경로로 넘긴다.
 */

import { CURRENT_SCHEMA_VERSION } from './saveSchema';

export type SaveMigration = (old: Record<string, unknown>) => Record<string, unknown>;

/**
 * 버전별 마이그레이션 등록부.
 * 현재 스키마가 v1(최초)이므로 비어 있다 — v2 도입 커밋이 `1: (old) => ...`
 * 를 함께 추가해야 한다.
 */
export const SAVE_MIGRATIONS: Record<number, SaveMigration> = {};

export class SaveMigrationError extends Error {
  constructor(fromVersion: unknown, detail: string) {
    super(`[세이브 마이그레이션 실패] v${String(fromVersion)}: ${detail}`);
    this.name = 'SaveMigrationError';
  }
}

/**
 * 파싱된 원시 세이브를 현재 스키마 버전까지 순차 마이그레이션한다.
 * 구조 검증(validateSaveData)은 호출 측(SaveStore)이 이어서 수행한다.
 *
 * @param migrations 테스트에서 대체 주입 가능 (기본: SAVE_MIGRATIONS)
 */
export function migrateToCurrent(
  raw: unknown,
  migrations: Record<number, SaveMigration> = SAVE_MIGRATIONS,
): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SaveMigrationError('?', '객체가 아닌 저장 데이터');
  }
  let current = raw as Record<string, unknown>;
  const initial = current['schemaVersion'];
  if (typeof initial !== 'number' || !Number.isInteger(initial) || initial < 0) {
    throw new SaveMigrationError(initial, 'schemaVersion이 없거나 정수가 아님');
  }
  if (initial > CURRENT_SCHEMA_VERSION) {
    throw new SaveMigrationError(initial, `미래 버전 (현재 ${CURRENT_SCHEMA_VERSION}) — 다운그레이드 미지원`);
  }

  let version: number = initial;
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new SaveMigrationError(version, `v${version} → v${version + 1} 마이그레이션 함수 없음`);
    }
    current = migrate(current);
    const next = current['schemaVersion'];
    if (next !== version + 1) {
      throw new SaveMigrationError(version, `마이그레이션이 버전을 ${String(next)} 로 설정 (기대: ${version + 1})`);
    }
    version += 1;
  }
  return current;
}
