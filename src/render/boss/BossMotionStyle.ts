/**
 * 보스 이동 표현 스타일 경계 (11차 결의 5 — A안/B안 코드 경계).
 *
 * 스파이크 판정 실패 시 B안(이동 곡선·관성·근접 카메라 흔들림) 전환이
 * 0.5일 이관으로 확정되어 있으므로, 이동 표현을 이 인터페이스 뒤로 격리한다.
 * 두 구현 모두 **시각 전용** — 실제 보스 위치·AI는 게임플레이(보스 상태
 * 머신, D10~16)가 소유하며, 본통합 시 이 모듈은 AI가 준 포즈를 소비하는
 * 형태로 교체된다 (스파이크 단계의 자체 순찰은 QA 시연 경로).
 */

import type * as THREE from 'three';

export interface BossMotionStyle {
  /** root(보스 최상위 그룹)의 위치·요만 움직인다 — 분절 회전은 스파이크 소유 */
  update(deltaSeconds: number, root: THREE.Group): void;
}
