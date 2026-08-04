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

export const CURRENT_SCHEMA_VERSION = 2;

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

/**
 * v2 (M2 단서·해금 — 17차 결의 3 창 1 / INT-CORE-020):
 * `progress.bossCluesFound`(개수) → `bossCluesCollected`(단서 **id 목록**).
 *
 * 개수만으로는 '동일 단서 중복 반영 금지'(16차 M2 규격)를 재접속 후에
 * 보장할 수 없다 — 어떤 단서를 이미 회수했는지가 정본이어야 같은 단서가
 * 두 번 세어지지 않는다. 개수는 `bossCluesCollected.length` 파생값이다
 * (이중 저장 금지 원칙).
 */
export interface SaveDataV2 {
  schemaVersion: 2;
  credits: number;
  rareParts: number;
  upgradeLevels: Record<string, number>;
  equippedGear: string[];
  progress: {
    /** 회수한 단서 id 목록 (중복 없음) — 정본. 개수는 length 파생 */
    bossCluesCollected: string[];
    bossUnlocked: boolean;
    bossDefeated: boolean;
  };
  settings: {
    keyboardLockNoticeShown: boolean;
  };
}

/** 현재 스키마의 저장 데이터 타입 별칭 — 버전 추가 시 유니온으로 확장 */
export type SaveData = SaveDataV2;

export function createDefaultSave(): SaveData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    credits: 0,
    rareParts: 0,
    upgradeLevels: {},
    equippedGear: [],
    progress: {
      bossCluesCollected: [],
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
  const cluesRaw = progressRaw['bossCluesCollected'];
  if (!Array.isArray(cluesRaw) || cluesRaw.some((c) => typeof c !== 'string' || c.length === 0)) {
    throw new SaveValidationError('progress.bossCluesCollected', '비어 있지 않은 문자열 배열이 필요합니다');
  }
  // 중복은 저장 손상으로 보고 정규화한다 — 중복 반영 금지 규격의 방어선
  const clues = [...new Set(cluesRaw as string[])];

  const settingsRaw = raw['settings'];
  if (!isRecord(settingsRaw)) throw new SaveValidationError('settings', '객체가 필요합니다');

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    credits: requireNonNegativeNumber('credits', raw['credits']),
    rareParts: requireNonNegativeNumber('rareParts', raw['rareParts']),
    upgradeLevels,
    equippedGear: [...(gearRaw as string[])],
    progress: {
      bossCluesCollected: clues,
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
