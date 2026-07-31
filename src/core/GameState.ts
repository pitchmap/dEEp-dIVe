/**
 * 게임 상태 정의와 허용 전환표.
 *
 * 상태는 코어 루프(마스터 플랜 §4)의 국면에 대응한다:
 *  BOOT      — 로드·초기화
 *  DEPARTURE — 출항 (§4.1, 안전 구간)
 *  APPROACH  — 탐지·은신 접근 (§4.2~4.3)
 *  ATTACK    — 어뢰 조준·발사 (§4.4~4.5)
 *  ESCAPE    — 추격·폭뢰 회피·탈출 (§4.6~4.8 — 재발각 루프는 이 상태 안에서 순환)
 *  RESULT    — 결과 화면 (§4.8, 판 간 지속 요소 없음)
 *
 * 실제 게임 규칙(전환 조건 판정)은 여기서 구현하지 않는다 — D6 이후 작업.
 */

import type { GameStateId } from '../contracts/events';

export type { GameStateId };

export const GAME_STATES: readonly GameStateId[] = [
  'BOOT',
  'DEPARTURE',
  'APPROACH',
  'ATTACK',
  'ESCAPE',
  'RESULT',
];

/**
 * 허용 전환표.
 *  - APPROACH → ESCAPE: 조기 발각 시 공격 기회 상실 점프 (§4.3 실패 가능성)
 *  - ATTACK → ESCAPE: 발사 지점 노출로 인한 국면 전환 (§4.5)
 *  - RESULT → DEPARTURE: 재시작 (영구 성장 없음)
 */
export const STATE_TRANSITIONS: Readonly<Record<GameStateId, readonly GameStateId[]>> = {
  BOOT: ['DEPARTURE'],
  DEPARTURE: ['APPROACH'],
  APPROACH: ['ATTACK', 'ESCAPE'],
  ATTACK: ['ESCAPE'],
  ESCAPE: ['RESULT'],
  RESULT: ['DEPARTURE'],
};
