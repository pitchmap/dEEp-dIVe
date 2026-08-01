/**
 * 상위 메타 루프 상태 정의와 허용 전환표 (소회의 결의 2 — 2계층 상태 머신).
 *
 *  BASE        — 기지 (성장·장비·출항 결정의 장)
 *  SORTIE_PREP — 출항 준비 (해역·장비 확인. 취소 시 기지 복귀)
 *  SORTIE      — 해역 세션 (하위 = 기존 게임 상태 머신 BOOT→…→RESULT 전체.
 *                상위는 하위 내부 상태를 읽지 않는다 — SortieSessionPort 경유만)
 *  DEBRIEF     — 귀환 정산 (정산 확정 후 저장 요청 → 기지 복귀)
 *
 * 하위 해역 상태 머신(core/GameState.ts)은 무수정 유지 — 이 표는 별개 계층이다.
 */

import type { MetaStateId } from '../contracts/meta';

export const META_STATES: readonly MetaStateId[] = [
  'BASE',
  'SORTIE_PREP',
  'SORTIE',
  'DEBRIEF',
];

/** 허용 전환표 — SORTIE_PREP→BASE는 출항 취소 경로 */
export const META_TRANSITIONS: Readonly<Record<MetaStateId, readonly MetaStateId[]>> = {
  BASE: ['SORTIE_PREP'],
  SORTIE_PREP: ['SORTIE', 'BASE'],
  SORTIE: ['DEBRIEF'],
  DEBRIEF: ['BASE'],
};
