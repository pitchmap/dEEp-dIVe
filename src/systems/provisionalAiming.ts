/**
 * ⚠ 조준 파라미터 임시 소스 — `/params/aiming.json` 도착 전까지의 R7 선진행.
 *
 * 규격은 13차 소회의 결의 3 + 보완분 결의 8·9로 **확정**되어 있으나, 파일
 * 자체(`params/aiming.json`)와 validator는 **빌드·툴 창(창 4)** 산출물이라
 * 아직 저장소에 없다. 게임플레이 창은 값을 여기 한 곳에만 두고, 소비는
 * 전부 주입(AimingParams)으로 한다 — 파일이 도착하면 이 파일을 삭제하고
 * 주입원만 교체한다 (이관 요청: INTEGRATION_NOTES INT-GAME-009).
 *
 * 부호 규칙 [보완분 결의 8]: 상·하향 제한은 **양의 각도 크기**로 저장한다.
 * 실제 제한은 계산 시에만 부호를 붙인다 — pitchMin = −down, pitchMax = +up.
 * `aimReturnBehavior`는 스키마에 넣지 않는다 [보완분 결의 9 — reset만 지원].
 */

/** 미세 조준 파라미터 (aiming.json 4종과 1:1 — 확정 규격) */
export interface AimingParams {
  /** 좌우 미세각 한계 (도, 양수 크기). 큰 각은 A/D 선체 선회 */
  readonly aimYawLimitDegrees: number;
  /** 상향 한계 (도, 양수 크기) */
  readonly aimPitchUpLimitDegrees: number;
  /** 하향 한계 (도, **양수 크기** — 계산에서만 음수 적용) */
  readonly aimPitchDownLimitDegrees: number;
  /** 조준 중 마우스 감도 (일반 카메라 대비 배율) */
  readonly aimMouseSensitivity: number;
}

/** 확정 초기 테스트값 (13차 보완분 '개정된 /params/aiming.json 초기값') */
export const PROVISIONAL_AIMING_PARAMS: AimingParams = Object.freeze({
  aimYawLimitDegrees: 15,
  aimPitchUpLimitDegrees: 10,
  aimPitchDownLimitDegrees: 15,
  aimMouseSensitivity: 0.5,
});

/**
 * 일반 카메라 회전 감도 (라디안/픽셀) — `aimMouseSensitivity`가 "일반 카메라
 * 대비 배율"이므로 기준값이 필요하다. 렌더의 궤도 회전 감도
 * (`CameraInputAdapter.ORBIT_RADIANS_PER_PIXEL` = 0.005)와 같은 값이며,
 * 파트 간 직접 import가 금지되어 여기에 기준을 둔다.
 *
 * ⚠ 중복 정의 상태다 — 정식 해소는 조준·카메라 공통 감도 기준을 리드 계약
 * 또는 `params/aiming.json`에 두는 것이다 (요청: INT-GAME-009).
 * 조준 감도 = BASE_CAMERA_RADIANS_PER_PIXEL × aimMouseSensitivity.
 */
export const BASE_CAMERA_RADIANS_PER_PIXEL = 0.005;
