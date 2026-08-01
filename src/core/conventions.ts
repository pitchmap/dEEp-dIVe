/**
 * 공통 공간·방향 규약 — core 소유 (D+5 플레이테스트 리뷰 후속 확정).
 *
 * 목적: 이동·카메라·프로펠러·UI·어뢰가 축 방향을 각자 추측하지 않도록
 * 단일 기준을 코드로 제공한다. 아래 규약은 기존 D+5 통합 구현
 * (SubmarinePlayerController·CanyonScene·CameraRig)과 정합하며,
 * 새 코드는 이 파일의 상수·함수를 참조한다 — 숫자를 복제하지 않는다.
 *
 * 확정 규약:
 *  1. 잠수함 로컬 -Z = 선수(bow), 로컬 +Z = 선미(stern). 월드 +Y = 위.
 *  2. headingRadians는 Y축(위) 기준 요(yaw) 각. heading 0의 선수 방향은
 *     월드 (0, 0, -1)이며, 렌더는 mesh.rotation.y = headingRadians 그대로 사용.
 *  3. 이동 방향 기준은 잠수함 로컬 축이다 — 카메라 기준이 아니다 [확정 §3.3].
 *  4. Space 카메라 리센터 = 선미 뒤쪽 상단에서 선수 방향을 바라보는 후방 뷰.
 *     위치 오프셋 방향(cameraRecenterOffsetDirectionXZ = 선미)과 시선 방향
 *     (cameraRecenterLookDirectionXZ = 선수)은 **서로 다른 함수**다 — 하나의
 *     yaw 값을 두 의미로 재사용하지 않는다 (INT-CORE-004).
 *  5. 어뢰는 선수 방향(bowDirectionXZ)에서 생성된다.
 *  6. 프로펠러는 선미(LOCAL_STERN)에 배치된다.
 *  7. 프로펠러 회전은 실제 전후 속도값에만 연결한다 — A/D 선회 단독 입력은
 *     회전에 영향을 주지 않는다 (propellerSpinRatio가 속도만 입력받는 이유).
 *  8. 정지 상태 공회전 비율은 params/movement.json propellerIdleSpinRatio
 *     (기본 0.08)로 외부 조정한다 — 코드 하드코딩 금지.
 *
 * 이 파일은 프레임워크 중립이다 — Three.js를 import하지 않는다.
 * 렌더 측은 반환값으로 THREE.Vector3를 구성해 쓴다.
 */

/** 수평면(XZ) 단위 방향 */
export interface DirectionXZ {
  readonly x: number;
  readonly z: number;
}

/** 3D 방향 (잠수함 로컬 또는 월드) */
export interface Direction3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 잠수함 로컬 선수 방향 — 로컬 -Z [확정] */
export const LOCAL_BOW: Direction3 = Object.freeze({ x: 0, y: 0, z: -1 });

/** 잠수함 로컬 선미 방향 — 로컬 +Z [확정]. 프로펠러 배치 기준 */
export const LOCAL_STERN: Direction3 = Object.freeze({ x: 0, y: 0, z: 1 });

/** 월드 상단 방향 — +Y. heading(요)의 회전축 */
export const WORLD_UP: Direction3 = Object.freeze({ x: 0, y: 1, z: 0 });

/**
 * 선수(전진) 방향의 월드 XZ 단위 벡터.
 * heading 0 → (0, -1). 이동·어뢰 생성 방향의 단일 기준.
 * SubmarinePlayerController의 전진 벡터 (-sin h, -cos h)와 동일 정의다.
 */
export function bowDirectionXZ(headingRadians: number): DirectionXZ {
  return { x: -Math.sin(headingRadians), z: -Math.cos(headingRadians) };
}

/** 선미 방향의 월드 XZ 단위 벡터 — 선수의 반대 */
export function sternDirectionXZ(headingRadians: number): DirectionXZ {
  return { x: Math.sin(headingRadians), z: Math.cos(headingRadians) };
}

/**
 * 렌더 메시 요 각 — 모델의 로컬 -Z가 선수로 제작되어 있으면
 * mesh.rotation.y에 이 값을 그대로 대입한다 (변환 없음).
 */
export function meshYawRadians(headingRadians: number): number {
  return headingRadians;
}

/**
 * Space 리센터 시 카메라 **위치 오프셋** 방향 (수평 성분) [확정 — INT-CORE-004]:
 *   카메라 위치 = 잠수함 위치 + (이 방향 × 추적 거리) + 상단 높이(피치 상수).
 * 카메라는 선미 뒤쪽 상단에 선다 — 값은 선미 방향(sternDirectionXZ)이다.
 *
 * 시선 방향과 별개의 함수다. 이전의 cameraRecenterYawRadians(heading+π)는
 * '시선 요'와 '위치 오프셋 요'로 이중 해석되어 카메라가 선수 쪽에 배치되는
 * 결함(구 CameraRig — W 전진 시 화면 바깥쪽으로 이동)을 낳아 폐기했다.
 * 하나의 yaw 값을 두 의미로 재사용하지 않는다.
 */
export function cameraRecenterOffsetDirectionXZ(headingRadians: number): DirectionXZ {
  return sternDirectionXZ(headingRadians);
}

/**
 * Space 리센터 시 카메라 **시선** 방향 (수평 성분) [확정 — INT-CORE-004]:
 * 선수 방향(bowDirectionXZ)을 바라본다. lookAt 대상을 잠수함 위치로 두면
 * 선미 뒤 카메라에서 자동 충족된다.
 *
 * 리센터 검증 기준:
 *  ① 프로펠러(선미)가 카메라에 가장 가까운 쪽에 보인다.
 *  ② W 전진 시 잠수함이 화면 안쪽(카메라에서 멀어지는 방향)으로 나아간다.
 */
export function cameraRecenterLookDirectionXZ(headingRadians: number): DirectionXZ {
  return bowDirectionXZ(headingRadians);
}

/**
 * 미세 조준각 yaw 클램프 (13차 결의 3) — 한계는 도(°) 단위 양수 크기, ± 대칭.
 * 카메라·조준·테스트가 **이 함수 하나만** 사용한다 (이중 부호·개별 계산 금지).
 */
export function clampAimYawRadians(yawRadians: number, yawLimitDegrees: number): number {
  const limit = (Math.abs(yawLimitDegrees) * Math.PI) / 180;
  return Math.min(limit, Math.max(-limit, yawRadians));
}

/**
 * 미세 조준각 pitch 클램프 (13차 결의 8) — 상향·하향 한계는 **모두 양의
 * 크기**로 받는다(JSON 저장 규칙과 동일). 하향 방향의 음수 적용은 이
 * 계산에서만 한다: pitchMin = −down, pitchMax = +up.
 */
export function clampAimPitchRadians(
  pitchRadians: number,
  upLimitDegrees: number,
  downLimitDegrees: number,
): number {
  const max = (Math.abs(upLimitDegrees) * Math.PI) / 180;
  const min = -(Math.abs(downLimitDegrees) * Math.PI) / 180;
  return Math.min(max, Math.max(min, pitchRadians));
}

/**
 * 조준 전방 단위 벡터 — 선체 heading + 잠수함 로컬 미세 조준각 (yaw + = 좌,
 * pitch + = 상향). 미세각 0이면 bowDirectionXZ와 수평 성분이 일치한다.
 * **어뢰 초기 진행 방향과 조준 카메라 시선이 모두 이 함수 하나에서 나온다**
 * (십자선 = 탄도, 7차 결의 1-④) — 시스템별 방향 계산 금지.
 */
export function aimForwardDirection(
  headingRadians: number,
  aimYawRadians: number,
  aimPitchRadians: number,
): Direction3 {
  const totalYaw = headingRadians + aimYawRadians;
  const cosPitch = Math.cos(aimPitchRadians);
  return {
    x: -Math.sin(totalYaw) * cosPitch,
    y: Math.sin(aimPitchRadians),
    z: -Math.cos(totalYaw) * cosPitch,
  };
}

/**
 * 프로펠러 회전 비율 (0~1, 최대 회전 속도 대비).
 *
 *  - 실제 전후 속도에만 연결 [확정] — 선회(A/D)·카메라 입력은 인자에 없다.
 *  - 정지 상태에서도 idleSpinRatio만큼 공회전한다
 *    (params/movement.json propellerIdleSpinRatio 주입 — 기본 0.08).
 *  - 실제 회전 각속도(rad/s) 최대치는 시각 연출 상수로 렌더 소유 —
 *    여기서는 비율만 정한다.
 */
export function propellerSpinRatio(
  speedMetersPerSecond: number,
  maxSpeedMetersPerSecond: number,
  idleSpinRatio: number,
): number {
  if (!Number.isFinite(speedMetersPerSecond) || maxSpeedMetersPerSecond <= 0) {
    return idleSpinRatio;
  }
  const ratio = Math.abs(speedMetersPerSecond) / maxSpeedMetersPerSecond;
  return Math.min(1, Math.max(idleSpinRatio, ratio));
}
