/**
 * B7 오인 사격률 측정 — 스키마 검증·집계·판정 (툴링 소유).
 *
 * 계약(`contracts/identification.ts`)은 기록 1건의 **형태**만 정의한다.
 * 계산식·최소 표본·제외 규칙·합격 판정은 전부 여기 있다 (리드 계약 주석의
 * '판정은 툴링 담당'을 그대로 이행한다).
 *
 * ## 계산식 [13차 결의 10]
 *
 * ```text
 * 오인 사격률 =
 *   중립을 적대로 오인해 공격한 횟수
 *   ÷ 적대·중립 식별 후 공격 여부를 결정한 전체 **유효** 기회
 *   × 100
 * ```
 *
 * ## 분모에서 빠지는 것 (유효 기회 아님)
 *
 *  - `invalidOpportunity` — 태그가 노출되기 전 발사 등, 애초에 '식별 후
 *    결정'이 아니었던 기회
 *  - `inputMistake` — 조작 실수 (식별 오류가 아니라 입력 오류)
 *  - `intentionalNeutralAttack` — 중립임을 **알고** 공격. 오인이 아니므로
 *    분자에서 빼되, 행동 기록으로는 남는다
 *
 * 분모에 남는 것은 `correct` + `misidentification` 두 종뿐이고, 분자는
 * `misidentification`이다.
 *
 * ## 조작 실수 인정 조건 [13차 서지우·오세진]
 *
 * 테스터의 사후 진술만으로는 제외하지 않는다. 화면 기록 / 입력 로그 /
 * 즉시 인터뷰 **3종 중 2종 이상**이 일치할 때만 `inputMistake`로 분류한다.
 * 근거가 모자란 기록은 분류를 강등해 분모에 남긴다 — 제외가 쉬우면 결과가
 * 왜곡된다.
 *
 * ## 최소 표본 [13차 임찬영]
 *
 * 테스터 5명 이상 **그리고** 유효 기회 50회 이상. 하나라도 미달이면 비율을
 * 계산해 참고로 출력하되 **합격·실패 판정에 쓰지 않는다** (`INSUFFICIENT_SAMPLE`).
 *
 * ## 개인정보
 *
 * `anonymousTesterId` 외의 식별 정보는 저장하지 않는다. 검증기가 이름·이메일·
 * 전화번호 형태의 값이 섞이면 거부한다 (prompts/TOOLING.md 계측 규칙).
 */

import type {
  IdentificationAction,
  IdentificationDecision,
  IdentificationOpportunityLog,
  IdentificationResultClassification,
} from '../../contracts/identification';
import type { FactionId } from '../../contracts/faction';

/* ── 판정 기준 상수 [13차 결의 10 · 12차 서지우] ─────────────── */

/** 최소 테스터 수 */
export const MINIMUM_TESTER_COUNT = 5;
/** 최소 유효 식별 기회 수 */
export const MINIMUM_VALID_OPPORTUNITIES = 50;
/** 이 비율을 넘으면 시각 구분 강화 (태그 → 항해등·색 → 실루엣 → 사운드 순) */
export const VISUAL_REINFORCEMENT_THRESHOLD_PERCENT = 20;
/** 이 비율 미만이면서 '구분이 시시하다' 응답이 있으면 완화 검토 */
export const RELAXATION_REVIEW_THRESHOLD_PERCENT = 5;
/** 조작 실수 인정에 필요한 근거 개수 */
export const INPUT_MISTAKE_EVIDENCE_REQUIRED = 2;

/** 조작 실수 근거 3종 — 2종 이상 일치할 때만 inputMistake 인정 */
export type InputMistakeEvidence = 'screenRecording' | 'inputLog' | 'immediateInterview';

export const INPUT_MISTAKE_EVIDENCE_KINDS: readonly InputMistakeEvidence[] = [
  'screenRecording',
  'inputLog',
  'immediateInterview',
];

/**
 * 저장 기록 1건 = 계약 8항목 + 툴링이 판정에 쓰는 근거 목록.
 *
 * `inputMistakeEvidence`는 계약에 없다 — 제외 심사는 툴링 판정이므로
 * 계약을 넓히지 않고 수집기 쪽에서만 붙인다.
 */
export interface StudyEntry extends IdentificationOpportunityLog {
  /** `inputMistake` 분류를 주장할 때의 근거 목록 (중복 제거됨) */
  readonly inputMistakeEvidence: readonly InputMistakeEvidence[];
}

export class StudyValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`[B7 ${field}] ${message}`);
    this.name = 'StudyValidationError';
    this.field = field;
  }
}

const DECISIONS: readonly IdentificationDecision[] = ['hostile', 'neutral', 'unknown'];
const ACTIONS: readonly IdentificationAction[] = ['attack', 'hold', 'disengage'];
const CLASSIFICATIONS: readonly IdentificationResultClassification[] = [
  'correct',
  'misidentification',
  'intentionalNeutralAttack',
  'inputMistake',
  'invalidOpportunity',
];
const FACTIONS: readonly FactionId[] = ['hostile', 'neutral', 'patrol'];

/**
 * 개인정보로 보이는 값 차단 — 이메일·전화번호·한글 이름 형태.
 *
 * 완벽한 탐지가 목적이 아니라 **실수로 실명을 넣는 것**을 막는 것이 목적이다.
 * 익명 id는 `t01`·`tester-a` 같은 형태를 기대한다.
 */
const EMAIL_PATTERN = /@/;
const PHONE_PATTERN = /\d{2,4}[- ]?\d{3,4}[- ]?\d{4}/;
const HANGUL_PATTERN = /[가-힣]/;

function assertAnonymous(field: string, value: string): void {
  if (EMAIL_PATTERN.test(value)) {
    throw new StudyValidationError(field, '이메일 형태의 값은 저장하지 않습니다 (익명 id만 허용)');
  }
  if (PHONE_PATTERN.test(value)) {
    throw new StudyValidationError(field, '전화번호 형태의 값은 저장하지 않습니다 (익명 id만 허용)');
  }
  if (HANGUL_PATTERN.test(value)) {
    throw new StudyValidationError(field, '실명으로 보이는 값은 저장하지 않습니다 (익명 id만 허용)');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireEnum<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new StudyValidationError(field, `${allowed.join(' | ')} 중 하나여야 합니다 (받은 값: ${JSON.stringify(value)})`);
  }
  return value as T;
}

function requireNonEmptyString(field: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new StudyValidationError(field, '비어 있지 않은 문자열이 필요합니다');
  }
  return value;
}

/**
 * 기록 1건 검증.
 *
 * 형식 검사에 더해 **분류의 정합성**까지 본다. 예를 들어 `misidentification`
 * 인데 실제 세력이 중립이 아니거나 공격하지 않았다면, 그 기록은 분자에 들어갈
 * 자격이 없다 — 조용히 통과시키면 비율이 왜곡되므로 거부한다.
 */
export function validateStudyEntry(raw: unknown): StudyEntry {
  if (!isRecord(raw)) throw new StudyValidationError('(루트)', '객체가 필요합니다');

  const anonymousTesterId = requireNonEmptyString('anonymousTesterId', raw['anonymousTesterId']);
  assertAnonymous('anonymousTesterId', anonymousTesterId);
  const opportunityId = requireNonEmptyString('opportunityId', raw['opportunityId']);

  const actualFaction = requireEnum('actualFaction', raw['actualFaction'], FACTIONS);
  const identificationTagVisible = raw['identificationTagVisible'];
  if (typeof identificationTagVisible !== 'boolean') {
    throw new StudyValidationError('identificationTagVisible', 'true/false가 필요합니다');
  }
  const playerDecision = requireEnum('playerDecision', raw['playerDecision'], DECISIONS);
  const playerAction = requireEnum('playerAction', raw['playerAction'], ACTIONS);
  const resultClassification = requireEnum('resultClassification', raw['resultClassification'], CLASSIFICATIONS);

  const timestamp = raw['timestamp'];
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    throw new StudyValidationError('timestamp', '유한한 숫자가 필요합니다');
  }

  const notesRaw = raw['notes'];
  if (notesRaw !== undefined && typeof notesRaw !== 'string') {
    throw new StudyValidationError('notes', '문자열 또는 생략이어야 합니다');
  }
  if (typeof notesRaw === 'string') assertAnonymous('notes', notesRaw);

  const evidenceRaw = raw['inputMistakeEvidence'];
  let evidence: InputMistakeEvidence[] = [];
  if (evidenceRaw !== undefined && evidenceRaw !== null) {
    if (!Array.isArray(evidenceRaw)) {
      throw new StudyValidationError('inputMistakeEvidence', '배열이 필요합니다');
    }
    const seen = new Set<InputMistakeEvidence>();
    for (const item of evidenceRaw) {
      seen.add(requireEnum('inputMistakeEvidence[]', item, INPUT_MISTAKE_EVIDENCE_KINDS));
    }
    evidence = [...seen];
  }

  // ── 분류 정합성 ──────────────────────────────────────────
  if (resultClassification === 'misidentification') {
    if (actualFaction !== 'neutral') {
      throw new StudyValidationError(
        'resultClassification',
        `오인 사격은 중립 표적에만 성립합니다 (실제 세력: ${actualFaction})`,
      );
    }
    if (playerAction !== 'attack') {
      throw new StudyValidationError('resultClassification', '오인 사격은 공격 행동에만 성립합니다');
    }
    if (playerDecision === 'neutral') {
      throw new StudyValidationError(
        'resultClassification',
        '중립으로 판단하고 공격했다면 오인이 아닙니다 — intentionalNeutralAttack 또는 inputMistake로 분류하세요',
      );
    }
  }

  if (resultClassification === 'intentionalNeutralAttack') {
    if (actualFaction !== 'neutral' || playerAction !== 'attack') {
      throw new StudyValidationError(
        'resultClassification',
        '고의 중립 공격은 중립 표적 + 공격 행동에만 성립합니다',
      );
    }
    if (playerDecision !== 'neutral') {
      throw new StudyValidationError(
        'resultClassification',
        "'중립인 것을 알고 공격'이므로 playerDecision이 neutral이어야 합니다",
      );
    }
  }

  if (resultClassification === 'inputMistake' && evidence.length < INPUT_MISTAKE_EVIDENCE_REQUIRED) {
    throw new StudyValidationError(
      'resultClassification',
      `조작 실수는 근거 ${INPUT_MISTAKE_EVIDENCE_REQUIRED}종 이상 일치할 때만 인정합니다 (받은 근거: ${evidence.length}종) — 사후 진술만으로는 제외하지 않습니다`,
    );
  }

  // 태그가 보이지 않았다면 '식별 후 결정'이 아니다.
  if (!identificationTagVisible && resultClassification !== 'invalidOpportunity') {
    throw new StudyValidationError(
      'resultClassification',
      '태그 노출 전 기록은 유효 식별 기회가 아닙니다 — invalidOpportunity로 분류하세요',
    );
  }

  return {
    anonymousTesterId,
    opportunityId,
    actualFaction,
    identificationTagVisible,
    playerDecision,
    playerAction,
    resultClassification,
    timestamp,
    ...(typeof notesRaw === 'string' ? { notes: notesRaw } : {}),
    inputMistakeEvidence: evidence,
  };
}

/* ── 집계 ─────────────────────────────────────────────────── */

export type StudyVerdict =
  /** 표본 미달 — 판정 금지, 참고 수치만 */
  | 'INSUFFICIENT_SAMPLE'
  /** 20% 초과 — 시각 구분 강화 필요 */
  | 'REINFORCE_VISUALS'
  /** 5% 미만 — 완화 검토 대상 (구분이 시시하다는 응답과 함께 판단) */
  | 'RELAXATION_CANDIDATE'
  /** 5~20% — 현행 유지 */
  | 'WITHIN_TARGET';

export interface StudySummary {
  readonly testerCount: number;
  readonly totalEntries: number;
  /** 분모 — correct + misidentification */
  readonly validOpportunities: number;
  /** 분자 */
  readonly misidentifications: number;
  readonly correct: number;
  /** 분모·분자 모두에서 빠진 기록 (분류별) */
  readonly excluded: Readonly<Record<'intentionalNeutralAttack' | 'inputMistake' | 'invalidOpportunity', number>>;
  readonly excludedTotal: number;
  /** 오인 사격률(%). 분모 0이면 null — 0%로 위장하지 않는다 */
  readonly misidentificationRatePercent: number | null;
  readonly sampleSufficient: boolean;
  readonly verdict: StudyVerdict;
  /** 표본 미달 사유 (충족 시 빈 배열) */
  readonly sampleShortfalls: readonly string[];
  /** 테스터별 유효 기회 수 — 한 명에게 쏠렸는지 확인용 */
  readonly perTesterValidOpportunities: Readonly<Record<string, number>>;
}

/** 분모에 들어가는 분류 — '식별 후 공격 여부를 결정한 유효 기회' */
function isValidOpportunity(entry: StudyEntry): boolean {
  return entry.resultClassification === 'correct' || entry.resultClassification === 'misidentification';
}

/**
 * 집계. 같은 `opportunityId`는 1건으로 취급한다 (수집기 중복 기록 방어) —
 * 마지막 기록이 이긴다(재분류가 심사 결과이므로).
 */
export function summarizeStudy(entries: readonly StudyEntry[]): StudySummary {
  const byOpportunity = new Map<string, StudyEntry>();
  for (const entry of entries) byOpportunity.set(entry.opportunityId, entry);
  const unique = [...byOpportunity.values()];

  const testers = new Set<string>();
  const perTester: Record<string, number> = {};
  const excluded = { intentionalNeutralAttack: 0, inputMistake: 0, invalidOpportunity: 0 };
  let valid = 0;
  let misidentifications = 0;
  let correct = 0;

  for (const entry of unique) {
    testers.add(entry.anonymousTesterId);
    if (isValidOpportunity(entry)) {
      valid += 1;
      perTester[entry.anonymousTesterId] = (perTester[entry.anonymousTesterId] ?? 0) + 1;
      if (entry.resultClassification === 'misidentification') misidentifications += 1;
      else correct += 1;
    } else {
      excluded[entry.resultClassification as keyof typeof excluded] += 1;
    }
  }

  const rate = valid > 0 ? (misidentifications / valid) * 100 : null;

  const shortfalls: string[] = [];
  if (testers.size < MINIMUM_TESTER_COUNT) {
    shortfalls.push(`테스터 ${testers.size}명 < 최소 ${MINIMUM_TESTER_COUNT}명`);
  }
  if (valid < MINIMUM_VALID_OPPORTUNITIES) {
    shortfalls.push(`유효 기회 ${valid}회 < 최소 ${MINIMUM_VALID_OPPORTUNITIES}회`);
  }
  const sufficient = shortfalls.length === 0;

  let verdict: StudyVerdict;
  if (!sufficient || rate === null) verdict = 'INSUFFICIENT_SAMPLE';
  else if (rate > VISUAL_REINFORCEMENT_THRESHOLD_PERCENT) verdict = 'REINFORCE_VISUALS';
  else if (rate < RELAXATION_REVIEW_THRESHOLD_PERCENT) verdict = 'RELAXATION_CANDIDATE';
  else verdict = 'WITHIN_TARGET';

  return {
    testerCount: testers.size,
    totalEntries: unique.length,
    validOpportunities: valid,
    misidentifications,
    correct,
    excluded,
    excludedTotal: excluded.intentionalNeutralAttack + excluded.inputMistake + excluded.invalidOpportunity,
    misidentificationRatePercent: rate,
    sampleSufficient: sufficient,
    verdict,
    sampleShortfalls: shortfalls,
    perTesterValidOpportunities: perTester,
  };
}

/** 강화 우선순위 [12차 서지우] — 저비용·직접적인 것부터, 한 번에 전부 과장하지 않는다 */
export const REINFORCEMENT_PRIORITY: readonly string[] = [
  '조준경 식별 태그 가독성',
  '항해등과 색 대비',
  '실루엣 차이',
  '사운드 구분',
];

/* ── 내보내기 ─────────────────────────────────────────────── */

const CSV_COLUMNS = [
  'anonymousTesterId',
  'opportunityId',
  'actualFaction',
  'identificationTagVisible',
  'playerDecision',
  'playerAction',
  'resultClassification',
  'timestamp',
  'inputMistakeEvidence',
  'notes',
] as const;

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV 내보내기 — 개인정보 열 없음 (검증을 통과한 기록만 들어온다) */
export function toCsv(entries: readonly StudyEntry[]): string {
  const rows = [CSV_COLUMNS.join(',')];
  for (const entry of entries) {
    rows.push(
      CSV_COLUMNS.map((column) =>
        column === 'inputMistakeEvidence'
          ? csvCell(entry.inputMistakeEvidence.join('|'))
          : csvCell((entry as unknown as Record<string, unknown>)[column]),
      ).join(','),
    );
  }
  return `${rows.join('\n')}\n`;
}

export interface StudyExport {
  readonly schemaVersion: 1;
  readonly summary: StudySummary;
  readonly entries: readonly StudyEntry[];
}

/** JSON 내보내기 — 집계 결과를 함께 실어 재계산 없이 읽을 수 있게 한다 */
export function toJsonExport(entries: readonly StudyEntry[]): StudyExport {
  return { schemaVersion: 1, summary: summarizeStudy(entries), entries };
}

/** 사람이 읽는 보고 — 표본 미달이면 비율을 참고값으로만 표시한다 */
export function formatSummary(summary: StudySummary): string {
  const rate =
    summary.misidentificationRatePercent === null
      ? '계산 불가 (유효 기회 0)'
      : `${summary.misidentificationRatePercent.toFixed(1)}%`;
  const lines = [
    `테스터 ${summary.testerCount}명 / 유효 식별 기회 ${summary.validOpportunities}회 (기록 ${summary.totalEntries}건)`,
    `오인 ${summary.misidentifications} · 정답 ${summary.correct}`,
    `제외 ${summary.excludedTotal}건 — 고의 중립 공격 ${summary.excluded.intentionalNeutralAttack} / 조작 실수 ${summary.excluded.inputMistake} / 무효 기회 ${summary.excluded.invalidOpportunity}`,
    summary.sampleSufficient
      ? `오인 사격률 ${rate} → ${summary.verdict}`
      : `오인 사격률 ${rate} (참고값 — 판정에 사용 금지)`,
  ];
  if (!summary.sampleSufficient) {
    lines.push(`INSUFFICIENT_SAMPLE: ${summary.sampleShortfalls.join(' / ')}`);
  }
  if (summary.verdict === 'REINFORCE_VISUALS') {
    lines.push(`강화 우선순위: ${REINFORCEMENT_PRIORITY.join(' → ')}`);
  }
  return lines.join('\n');
}
