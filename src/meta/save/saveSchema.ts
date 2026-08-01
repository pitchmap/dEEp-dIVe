/**
 * 저장 데이터 스키마 (툴링 소유 — 6차 대회의 결의 7 · 개발 소회의(11) 결의 3).
 *
 * 원칙:
 *  - 명시적 schemaVersion — 구조가 바뀌는 커밋은 반드시 마이그레이션 함수를
 *    동반한다 (소회의 결의 7: 미동반 커밋은 리뷰 반려).
 *  - 저장 범위는 6차 결의 7의 '영구 요소'만: 크레딧·희귀 부품·영구 업그레이드
 *    단계·장착 장비·해금/보스 진행·저장이 필요한 설정값.
 *  - 암호화·체크섬 없음 [확정 — 소회의 결의 3: 싱글 오프라인에서 세이브 조작은
 *    유저 자유].
 */

export const CURRENT_SCHEMA_VERSION = 1;

export interface SaveDataV1 {
  schemaVersion: 1;
  /** 일반 크레딧 (기지 귀환 정산 시 확정 — 6차 결의 7) */
  credits: number;
  /** 희귀 부품 (획득 즉시 확정 저장 — 6차 결의 7) */
  rareParts: number;
  /** 영구 업그레이드 단계: 업그레이드 id(params/upgrades.json) → 현재 단계 */
  upgradeLevels: Record<string, number>;
  /** 장착 장비 id 목록 — 슬롯 제한·유효성 판정은 게임플레이 소유 */
  equippedGear: string[];
  /** 해금·보스 진행 (6차 결의: 단서 3개 → 보스 개방) */
  progress: {
    bossCluesFound: number;
    bossUnlocked: boolean;
    bossDefeated: boolean;
  };
  /** 저장이 필요한 설정값만 — 밸런스 값 아님 */
  settings: {
    /** Keyboard Lock·병행 키 1회 안내 표시 여부 (5차 결의 4) */
    keyboardLockNoticeShown: boolean;
  };
}

/** 현재 스키마의 저장 데이터 타입 별칭 — 버전 추가 시 유니온으로 확장 */
export type SaveData = SaveDataV1;

export function createDefaultSave(): SaveData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    credits: 0,
    rareParts: 0,
    upgradeLevels: {},
    equippedGear: [],
    progress: {
      bossCluesFound: 0,
      bossUnlocked: false,
      bossDefeated: false,
    },
    settings: {
      keyboardLockNoticeShown: false,
    },
  };
}

export class SaveValidationError extends Error {
  constructor(path: string, detail: string) {
    super(`[세이브 검증 실패] ${path}: ${detail}`);
    this.name = 'SaveValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonNegativeNumber(path: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new SaveValidationError(path, `0 이상의 숫자가 필요합니다 (받은 값: ${JSON.stringify(value)})`);
  }
  return value;
}

function requireBoolean(path: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new SaveValidationError(path, `불리언이 필요합니다 (받은 값: ${JSON.stringify(value)})`);
  }
  return value;
}

/**
 * 현재 버전(schemaVersion === CURRENT) 데이터의 구조 검증.
 * 구버전 데이터는 여기 오기 전에 마이그레이션(migrations.ts)을 거쳐야 한다.
 */
export function validateSaveData(raw: unknown): SaveData {
  if (!isRecord(raw)) throw new SaveValidationError('(루트)', '객체가 필요합니다');
  if (raw['schemaVersion'] !== CURRENT_SCHEMA_VERSION) {
    throw new SaveValidationError(
      'schemaVersion',
      `현재 버전 ${CURRENT_SCHEMA_VERSION} 이 필요합니다 (받은 값: ${JSON.stringify(raw['schemaVersion'])})`,
    );
  }

  const upgradeLevelsRaw = raw['upgradeLevels'];
  if (!isRecord(upgradeLevelsRaw)) {
    throw new SaveValidationError('upgradeLevels', '객체가 필요합니다');
  }
  const upgradeLevels: Record<string, number> = {};
  for (const [id, level] of Object.entries(upgradeLevelsRaw)) {
    const parsed = requireNonNegativeNumber(`upgradeLevels.${id}`, level);
    if (!Number.isInteger(parsed)) {
      throw new SaveValidationError(`upgradeLevels.${id}`, '정수 단계가 필요합니다');
    }
    upgradeLevels[id] = parsed;
  }

  const gearRaw = raw['equippedGear'];
  if (!Array.isArray(gearRaw) || gearRaw.some((g) => typeof g !== 'string')) {
    throw new SaveValidationError('equippedGear', '문자열 배열이 필요합니다');
  }

  const progressRaw = raw['progress'];
  if (!isRecord(progressRaw)) throw new SaveValidationError('progress', '객체가 필요합니다');
  const clues = requireNonNegativeNumber('progress.bossCluesFound', progressRaw['bossCluesFound']);
  if (!Number.isInteger(clues)) {
    throw new SaveValidationError('progress.bossCluesFound', '정수가 필요합니다');
  }

  const settingsRaw = raw['settings'];
  if (!isRecord(settingsRaw)) throw new SaveValidationError('settings', '객체가 필요합니다');

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    credits: requireNonNegativeNumber('credits', raw['credits']),
    rareParts: requireNonNegativeNumber('rareParts', raw['rareParts']),
    upgradeLevels,
    equippedGear: [...(gearRaw as string[])],
    progress: {
      bossCluesFound: clues,
      bossUnlocked: requireBoolean('progress.bossUnlocked', progressRaw['bossUnlocked']),
      bossDefeated: requireBoolean('progress.bossDefeated', progressRaw['bossDefeated']),
    },
    settings: {
      keyboardLockNoticeShown: requireBoolean(
        'settings.keyboardLockNoticeShown',
        settingsRaw['keyboardLockNoticeShown'],
      ),
    },
  };
}
