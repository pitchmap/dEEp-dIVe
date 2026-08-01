/**
 * 조준 기하 — 미세 조준각의 **단일 제한 계산 함수**와 전방 벡터 산출.
 *
 * 13차 보완분 결의 8: "카메라·조준·테스트 코드가 동일한 제한 계산 함수를
 * 사용한다" — 이중 부호 오류(카메라에서 한 번, 게임플레이에서 또 한 번
 * 음수를 붙이는 사고) 방지. 조준 각도를 다루는 코드는 이 모듈만 쓴다.
 *
 * 좌표 규약 (core/conventions):
 *  - 미세각은 **잠수함 로컬 기준** [결의 3] — 선체가 A/D로 돌면 조준선도
 *    함께 돌고, 미세각은 그 위에 얹히는 상대각이다.
 *  - yaw 양수 = 좌현(port) 방향 — heading 증가와 같은 부호(A = 좌선회).
 *  - pitch 양수 = 상향(월드 +Y).
 *  - yaw=pitch=0이면 전방 벡터는 `conventions.bowDirectionXZ`와 정확히 같다.
 */

import { bowDirectionXZ } from '../core/conventions';
import type { AimingParams } from './provisionalAiming';

const DEG_TO_RAD = Math.PI / 180;

/** 미세 조준각 (라디안, 잠수함 로컬 기준) */
export interface AimAngles {
  readonly yawRadians: number;
  readonly pitchRadians: number;
}

/** 조준 전방 단위 벡터 (월드) */
export interface AimForward {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

/**
 * 미세각 제한 — **유일한 제한 계산 지점**.
 * pitchMin = −aimPitchDownLimitDegrees / pitchMax = +aimPitchUpLimitDegrees
 * (params에는 양수 크기만 저장된다 — 보완분 결의 8).
 */
export function clampAimAngles(
  yawRadians: number,
  pitchRadians: number,
  params: AimingParams,
): AimAngles {
  const yawLimit = Math.abs(params.aimYawLimitDegrees) * DEG_TO_RAD;
  const pitchMax = Math.abs(params.aimPitchUpLimitDegrees) * DEG_TO_RAD;
  const pitchMin = -Math.abs(params.aimPitchDownLimitDegrees) * DEG_TO_RAD;
  return {
    yawRadians: clamp(yawRadians, -yawLimit, yawLimit),
    pitchRadians: clamp(pitchRadians, pitchMin, pitchMax),
  };
}

/**
 * 조준 전방 벡터 — 십자선 중심 ray와 어뢰 초기 진행 방향의 **공통 산출식**.
 * 선체 heading에 로컬 미세각을 얹는다 (미세각이 선체와 함께 회전).
 */
export function aimForwardVector(
  headingRadians: number,
  angles: AimAngles,
): AimForward {
  const horizontal = bowDirectionXZ(headingRadians + angles.yawRadians);
  const cosPitch = Math.cos(angles.pitchRadians);
  return {
    x: horizontal.x * cosPitch,
    y: Math.sin(angles.pitchRadians),
    z: horizontal.z * cosPitch,
  };
}
