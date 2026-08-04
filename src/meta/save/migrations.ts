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
 *
 * v1 → v2 (M2 단서 — INT-CORE-020): `progress.bossCluesFound`(개수) →
 * `bossCluesCollected`(id 목록). v1에는 개별 단서 id가 없으므로 개수를
 * `legacy-clue-N` 합성 id로 보존한다 — 표시 개수·해금 판정의 하위 호환용이며,
 * 정본 단서 id(params/boss.json `unlock.clueIds`)와 겹치지 않아 같은 단서의
 * 이중 반영이 생기지 않는다. `bossUnlocked`/`bossDefeated` 플래그는 그대로
 * 이관한다(해금 정본은 플래그 — 한 번 true면 유지).
 */
export const SAVE_MIGRATIONS: Record<number, SaveMigration> = {
  1: (old) => {
    const progressRaw = old['progress'];
    const progress =
      typeof progressRaw === 'object' && progressRaw !== null && !Array.isArray(progressRaw)
        ? (progressRaw as Record<string, unknown>)
        : {};
    const foundRaw = progress['bossCluesFound'];
    const found =
      typeof foundRaw === 'number' && Number.isFinite(foundRaw) && foundRaw > 0
        ? Math.floor(foundRaw)
        : 0;
    const bossCluesCollected: string[] = [];
    for (let index = 1; index <= found; index += 1) {
      bossCluesCollected.push(`legacy-clue-${index}`);
    }
    return {
      ...old,
      schemaVersion: 2,
      progress: {
        bossCluesCollected,
        bossUnlocked: progress['bossUnlocked'] === true,
        bossDefeated: progress['bossDefeated'] === true,
      },
    };
  },
};

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
