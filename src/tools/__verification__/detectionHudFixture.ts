/**
 * DetectionHud 처분 판정 픽스처 — `judgeDetectionHudDisposition()`이 실제로
 * 모순 상태를 잡는지 자체 증명한다.
 *
 * 리드 결정 기록이 아직 없는 동안에도 D1의 `blocked`(방치) 판정을 믿으려면,
 * 판정 함수가 다른 상태를 정말 구분한다는 증거가 있어야 한다 — clue mapping
 * 픽스처와 같은 태도다. **이 파일은 fixture이며 production 증거가 아니다.**
 */

import type {
  DetectionHudDeferralDecision,
  DetectionHudDispositionObservation,
} from './verifyRuntimeClosure';

const PRODUCTION_PRESENT = {
  productionImportSites: ['src/core/Game.ts:22'],
  productionConstructSites: ['src/core/Game.ts:1253'],
  productionLifecycleSites: ['src/core/Game.ts:1351', 'src/core/Game.ts:1368'],
  domAnchorDeclSites: ['src/ui/DetectionHud.ts:58'],
  fixtureOnlySites: ['src/ui/sprintCUiFixture.ts:62'],
} as const;

const PRODUCTION_ABSENT = {
  productionImportSites: [],
  productionConstructSites: [],
  productionLifecycleSites: [],
  domAnchorDeclSites: [],
  fixtureOnlySites: ['src/ui/sprintCUiFixture.ts:62'],
} as const;

const VALID_DECISION: DetectionHudDeferralDecision = {
  sourcePath: 'docs/DECISIONS.md',
  decisionId: 'M-14',
  informationParityRationale:
    'SonarScope는 방위·거리 접점을 보여주지만 탐지 게이지 수치와 stage 전이를 노출하지 않아 정보가 동등하지 않다',
  followUpMilestone: 'M3',
  declaredRemoved: false,
  declaredDeferred: true,
  declaredInformationParity: false,
};

/** ② 승인된 M3 이관 — 통과해야 한다 */
export const approvedDeferralFixture: DetectionHudDispositionObservation = {
  ...PRODUCTION_PRESENT,
  leadDecision: VALID_DECISION,
  leadDecisionAbsenceReason: null,
  sonarProviderWired: true,
  sonarRenderWired: true,
};

/** ③ 결정 없는 방치 — incomplete(blocked)여야 하며 pass가 아니다 */
export const undecidedFixture: DetectionHudDispositionObservation = {
  ...PRODUCTION_PRESENT,
  leadDecision: null,
  leadDecisionAbsenceReason: 'docs/DECISIONS.md에 DetectionHud 처분 항목 없음',
  sonarProviderWired: true,
  sonarRenderWired: true,
};

/** 결정은 있으나 이관을 선언하지 않음 — incomplete(blocked) */
export const decisionWithoutDeferralFixture: DetectionHudDispositionObservation = {
  ...PRODUCTION_PRESENT,
  leadDecision: { ...VALID_DECISION, declaredDeferred: false },
  leadDecisionAbsenceReason: null,
  sonarProviderWired: true,
  sonarRenderWired: true,
};

/** ① 실제 제거 + removed=true 선언 — production 부재와 일치 */
export const actuallyRemovedFixture: DetectionHudDispositionObservation = {
  ...PRODUCTION_ABSENT,
  leadDecision: {
    ...VALID_DECISION,
    decisionId: 'M-15',
    declaredRemoved: true,
    declaredDeferred: false,
    declaredInformationParity: true,
  },
  leadDecisionAbsenceReason: null,
  sonarProviderWired: true,
  sonarRenderWired: true,
};

/* ── 아래는 전부 fail이어야 하는 모순 상태 ────────────────── */

/** removed=true 선언 + DOM·production 존재 → 위장. 반드시 fail */
export const falseRemovalClaimFixture: DetectionHudDispositionObservation = {
  ...PRODUCTION_PRESENT,
  leadDecision: { ...VALID_DECISION, declaredRemoved: true, declaredDeferred: false },
  leadDecisionAbsenceReason: null,
  sonarProviderWired: true,
  sonarRenderWired: true,
};

/** 이관 선언 + 정보 비동등 사유 없음 → fail */
export const deferralWithoutRationaleFixture: DetectionHudDispositionObservation = {
  ...PRODUCTION_PRESENT,
  leadDecision: { ...VALID_DECISION, informationParityRationale: null },
  leadDecisionAbsenceReason: null,
  sonarProviderWired: true,
  sonarRenderWired: true,
};

/** 이관 선언 + 후속 마일스톤이 M3가 아님 → fail */
export const deferralWrongMilestoneFixture: DetectionHudDispositionObservation = {
  ...PRODUCTION_PRESENT,
  leadDecision: { ...VALID_DECISION, followUpMilestone: 'M4' },
  leadDecisionAbsenceReason: null,
  sonarProviderWired: true,
  sonarRenderWired: true,
};

/** 이관 선언 + SonarScope provider 미배선 → fail (대체 계기가 없다) */
export const deferralWithoutSonarFixture: DetectionHudDispositionObservation = {
  ...PRODUCTION_PRESENT,
  leadDecision: VALID_DECISION,
  leadDecisionAbsenceReason: null,
  sonarProviderWired: false,
  sonarRenderWired: true,
};

/** 이관 선언 + render consumer 미배선 → fail */
export const deferralWithoutSonarRenderFixture: DetectionHudDispositionObservation = {
  ...PRODUCTION_PRESENT,
  leadDecision: VALID_DECISION,
  leadDecisionAbsenceReason: null,
  sonarProviderWired: true,
  sonarRenderWired: false,
};

/** 이관 선언인데 이미 제거돼 있음 → 상태 모순. fail */
export const deferralButAlreadyRemovedFixture: DetectionHudDispositionObservation = {
  ...PRODUCTION_ABSENT,
  leadDecision: VALID_DECISION,
  leadDecisionAbsenceReason: null,
  sonarProviderWired: true,
  sonarRenderWired: true,
};
