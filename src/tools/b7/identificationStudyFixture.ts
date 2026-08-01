/**
 * B7 결정적 픽스처 — 집계·판정 로직 검증용 합성 데이터 (툴링 소유).
 *
 * **실측 데이터가 아니다.** 실제 오인 사격률은 최종 A+B 통합 브라우저
 * 빌드에서 사람이 플레이해야 나온다. 이 픽스처는 '집계기가 계산식과 제외
 * 규칙을 제대로 구현했는가'만 확인하기 위한 것이며, 어떤 보고서에도
 * 측정 결과로 실려서는 안 된다.
 *
 * 난수를 쓰지 않는다 — 같은 입력이 항상 같은 요약을 만들어야 회귀를 잡는다.
 */

import type { StudyEntry, InputMistakeEvidence } from './identificationStudy';
import type { FactionId } from '../../contracts/faction';
import type {
  IdentificationAction,
  IdentificationDecision,
  IdentificationResultClassification,
} from '../../contracts/identification';

interface FixtureSpec {
  readonly testerCount: number;
  /** 유효 기회(분모)에 들어갈 정답 수 */
  readonly correct: number;
  /** 유효 기회(분모)에 들어갈 오인 수 */
  readonly misidentifications: number;
  readonly intentionalNeutralAttacks?: number;
  readonly inputMistakes?: number;
  readonly invalidOpportunities?: number;
}

const BOTH_EVIDENCE: readonly InputMistakeEvidence[] = ['screenRecording', 'inputLog'];

function entry(
  index: number,
  testerCount: number,
  actualFaction: FactionId,
  identificationTagVisible: boolean,
  playerDecision: IdentificationDecision,
  playerAction: IdentificationAction,
  resultClassification: IdentificationResultClassification,
  evidence: readonly InputMistakeEvidence[] = [],
): StudyEntry {
  return {
    // 테스터를 순환 배정해 한 명에게 쏠리지 않게 한다.
    anonymousTesterId: `t${String((index % testerCount) + 1).padStart(2, '0')}`,
    opportunityId: `op-${String(index).padStart(4, '0')}`,
    actualFaction,
    identificationTagVisible,
    playerDecision,
    playerAction,
    resultClassification,
    // epoch가 아니라 순번 기반 — Date.now()를 쓰면 픽스처가 결정적이지 않다.
    timestamp: 1_700_000_000_000 + index * 1000,
    inputMistakeEvidence: evidence,
  };
}

/** 명세대로 정확한 분류 구성을 만드는 결정적 픽스처 */
export function buildStudyFixture(spec: FixtureSpec): StudyEntry[] {
  const entries: StudyEntry[] = [];
  const testers = Math.max(1, spec.testerCount);
  let index = 0;

  for (let i = 0; i < spec.correct; i += 1, index += 1) {
    // 정답 — 적대를 적대로 보고 공격 / 중립을 중립으로 보고 보류를 번갈아 낸다.
    const hostileTurn = i % 2 === 0;
    entries.push(
      hostileTurn
        ? entry(index, testers, 'hostile', true, 'hostile', 'attack', 'correct')
        : entry(index, testers, 'neutral', true, 'neutral', 'hold', 'correct'),
    );
  }
  for (let i = 0; i < spec.misidentifications; i += 1, index += 1) {
    // 오인 — 중립을 적대로 판단하고 공격 (분자의 유일한 조건)
    entries.push(entry(index, testers, 'neutral', true, 'hostile', 'attack', 'misidentification'));
  }
  for (let i = 0; i < (spec.intentionalNeutralAttacks ?? 0); i += 1, index += 1) {
    entries.push(entry(index, testers, 'neutral', true, 'neutral', 'attack', 'intentionalNeutralAttack'));
  }
  for (let i = 0; i < (spec.inputMistakes ?? 0); i += 1, index += 1) {
    // 근거 2종 — 인정 조건을 충족하는 경우만 픽스처에 넣는다.
    entries.push(entry(index, testers, 'neutral', true, 'neutral', 'attack', 'inputMistake', BOTH_EVIDENCE));
  }
  for (let i = 0; i < (spec.invalidOpportunities ?? 0); i += 1, index += 1) {
    // 태그 노출 전 발사 — 분모에서 빠진다.
    entries.push(entry(index, testers, 'neutral', false, 'unknown', 'attack', 'invalidOpportunity'));
  }
  return entries;
}

/**
 * 표본 충족 픽스처 — 테스터 5명·유효 기회 60회, 오인 6건 = 10.0%.
 * 목표 구간(5~20%) 안이므로 `WITHIN_TARGET`이 나와야 한다.
 */
export const SUFFICIENT_SAMPLE_FIXTURE: readonly StudyEntry[] = buildStudyFixture({
  testerCount: 5,
  correct: 54,
  misidentifications: 6,
  intentionalNeutralAttacks: 3,
  inputMistakes: 2,
  invalidOpportunities: 4,
});

/**
 * 표본 미달 픽스처 — 테스터 3명·유효 기회 12회.
 * 비율은 계산되지만 판정은 `INSUFFICIENT_SAMPLE`이어야 한다.
 */
export const INSUFFICIENT_SAMPLE_FIXTURE: readonly StudyEntry[] = buildStudyFixture({
  testerCount: 3,
  correct: 9,
  misidentifications: 3,
  invalidOpportunities: 1,
});

/** 강화 임계 초과 픽스처 — 유효 60회 중 오인 15건 = 25.0% → REINFORCE_VISUALS */
export const HIGH_MISIDENTIFICATION_FIXTURE: readonly StudyEntry[] = buildStudyFixture({
  testerCount: 5,
  correct: 45,
  misidentifications: 15,
});

/** 완화 검토 픽스처 — 유효 100회 중 오인 2건 = 2.0% → RELAXATION_CANDIDATE */
export const LOW_MISIDENTIFICATION_FIXTURE: readonly StudyEntry[] = buildStudyFixture({
  testerCount: 5,
  correct: 98,
  misidentifications: 2,
});
