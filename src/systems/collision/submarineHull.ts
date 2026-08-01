/**
 * 잠수함 선체 충돌 근사 — 구 3개(선수/중앙/선미)로 캡슐을 근사한다.
 *
 * 렌더 대체 오브젝트(CanyonScene: 캡슐 반경 0.9, 전체 길이 5.6)를 약간의
 * 여유를 두고 감싸는 구조 치수다 — 시각·구조 상수이며 밸런스 수치가 아니다.
 * 정식 모델(D+8) 임포트 시 치수만 재검토한다.
 *
 * 좌표 규약: 로컬 -Z가 선수 — 선수 구는 heading의 전방 벡터 방향에 놓인다.
 */

import type { HullSphere } from './CollisionWorld';

/** 선체 근사 구 반지름 (렌더 캡슐 0.9 + 여유) */
export const SUBMARINE_HULL_RADIUS = 1.0;

/** 선체 절반 길이 (전체 5.6/2 = 2.8) */
export const SUBMARINE_HULL_HALF_LENGTH = 2.8;

/** 선수·선미 구 중심의 축 방향 오프셋 — 구 표면이 선체 끝과 일치하도록 */
const AXIAL_OFFSET = SUBMARINE_HULL_HALF_LENGTH - SUBMARINE_HULL_RADIUS;

/** 현재 포즈의 선체 근사 구 3개 (선수, 중앙, 선미 순 — 순서 고정, 결정적) */
export function computeHullSpheres(
  x: number,
  y: number,
  z: number,
  headingRadians: number,
): [HullSphere, HullSphere, HullSphere] {
  // 선수 벡터 = (-sin h, 0, -cos h) — SubmarinePlayerController 좌표 규약과 동일
  const forwardX = -Math.sin(headingRadians);
  const forwardZ = -Math.cos(headingRadians);

  return [
    {
      x: x + forwardX * AXIAL_OFFSET,
      y,
      z: z + forwardZ * AXIAL_OFFSET,
      radius: SUBMARINE_HULL_RADIUS,
    },
    { x, y, z, radius: SUBMARINE_HULL_RADIUS },
    {
      x: x - forwardX * AXIAL_OFFSET,
      y,
      z: z - forwardZ * AXIAL_OFFSET,
      radius: SUBMARINE_HULL_RADIUS,
    },
  ];
}
