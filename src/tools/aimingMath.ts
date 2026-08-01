/**
 * 미세 조준각 파라미터 — 검증·제한 계산 순수 함수부 (툴링 소유).
 *
 * 근거: 7차 대회의 결의 1-⑤ / 개발 소회의(13) 결의 3 / 보완분 결의 8·9.
 *
 * 규칙 [확정]:
 *  - 상향·하향 제한각은 **양의 각도 크기**로만 저장한다. 음수·0 이하 거부.
 *    부호는 여기 `pitchLimitsDegrees()` 한 곳에서만 적용한다 —
 *    카메라와 게임플레이가 각자 음수를 붙이는 이중 부호 오류 방지
 *    (보완분 결의 8, 남유리 요청).
 *  - `aimReturnBehavior`·`persist`는 스키마에 두지 않는다. 스프린트 A는
 *    reset 단일 동작이며, 미구현 선택지의 스텁을 만들지 않는다(보완분 결의 9).
 *  - 조준 해제 시 yaw·pitch는 항상 0 — `RESET_AIM_OFFSET`이 그 단일 값이다.
 *
 * 이 모듈은 JSON import가 없어 Node 검증 러너에서도 그대로 로드된다.
 * 로드·핫리로드는 aimingParams.ts 담당.
 */

import { ParamValidationError } from '../config/validateParams';

const FILE = 'params/aiming.json';

/** 검증된 미세 조준각 파라미터 — 카메라·게임플레이 공용 타입 */
export interface AimingParams {
  /** 좌우 미세각 크기(도). 큰 각은 A/D 선체 선회 */
  readonly aimYawLimitDegrees: number;
  /** 상향 제한각 크기(도) — 양수 */
  readonly aimPitchUpLimitDegrees: number;
  /** 하향 제한각 크기(도) — 양수. 부호는 pitchLimitsDegrees()가 적용 */
  readonly aimPitchDownLimitDegrees: number;
  /** 조준 중 마우스 감도 배율 (일반 카메라 대비) */
  readonly aimMouseSensitivity: number;
}

/** 조정 범위 [최소, 최대] — 소회의(13) 결의 3·보완분 결의 8 표 그대로 */
export const AIMING_RANGES = {
  aimYawLimitDegrees: [10, 25],
  aimPitchUpLimitDegrees: [5, 15],
  aimPitchDownLimitDegrees: [10, 25],
  aimMouseSensitivity: [0.3, 1.0],
} as const satisfies Record<keyof AimingParams, readonly [number, number]>;

/** 조준 해제 시 초기화 값 [보완분 결의 9 — reset 단일 동작] */
export const RESET_AIM_OFFSET = { yawDegrees: 0, pitchDegrees: 0 } as const;

const KEYS = Object.keys(AIMING_RANGES) as (keyof AimingParams)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * params/aiming.json 검증. 음수·0 이하·범위 밖·형식 오류·미구현 키를 거부한다.
 * 조용한 클램프 금지 — 잘못된 값은 로드 시점에 명확한 오류로 막는다.
 */
export function validateAimingParams(raw: unknown): AimingParams {
  if (!isRecord(raw)) throw new ParamValidationError(FILE, '(루트)', '객체가 필요합니다');

  // 미구현 선택지의 스키마 침투 차단 (보완분 결의 9)
  if ('aimReturnBehavior' in raw) {
    throw new ParamValidationError(
      FILE,
      'aimReturnBehavior',
      '스프린트 A는 reset 단일 동작입니다 — 이 키를 두지 않습니다 (보완분 결의 9: persist 스키마·스텁 금지)',
    );
  }

  const result = {} as Record<keyof AimingParams, number>;
  for (const key of KEYS) {
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ParamValidationError(FILE, key, `유한한 숫자가 필요합니다 (받은 값: ${JSON.stringify(value)})`);
    }
    if (value <= 0) {
      throw new ParamValidationError(
        FILE,
        key,
        `양의 크기만 저장합니다 (받은 값: ${value}) — 하향각도 음수가 아닌 크기로 두고 부호는 런타임 계산에서만 적용합니다 (보완분 결의 8)`,
      );
    }
    const [min, max] = AIMING_RANGES[key];
    if (value < min || value > max) {
      throw new ParamValidationError(FILE, key, `${value} 가 허용 범위 [${min}, ${max}] 를 벗어났습니다`);
    }
    result[key] = value;
  }
  return result as AimingParams;
}

/**
 * 런타임 피치 제한 — **부호를 적용하는 유일한 지점**.
 * 카메라·조준·테스트가 전부 이 함수를 호출한다 (이중 부호 금지).
 */
export function pitchLimitsDegrees(params: AimingParams): { min: number; max: number } {
  return { min: -params.aimPitchDownLimitDegrees, max: +params.aimPitchUpLimitDegrees };
}

/** 좌우 미세각 제한 (대칭) */
export function yawLimitsDegrees(params: AimingParams): { min: number; max: number } {
  return { min: -params.aimYawLimitDegrees, max: +params.aimYawLimitDegrees };
}

/**
 * 마우스 델타 → 제한된 미세 조준각(잠수함 로컬 기준).
 * 카메라와 게임플레이가 같은 결과를 얻도록 이 함수 하나만 사용한다.
 */
export function clampAimOffsetDegrees(
  params: AimingParams,
  yawDegrees: number,
  pitchDegrees: number,
): { yawDegrees: number; pitchDegrees: number } {
  const yaw = yawLimitsDegrees(params);
  const pitch = pitchLimitsDegrees(params);
  return {
    yawDegrees: Math.min(Math.max(yawDegrees, yaw.min), yaw.max),
    pitchDegrees: Math.min(Math.max(pitchDegrees, pitch.min), pitch.max),
  };
}

/** 마우스 이동량(픽셀 등)에 조준 감도를 적용한 각도 증분 */
export function applyAimSensitivity(params: AimingParams, rawDelta: number): number {
  return rawDelta * params.aimMouseSensitivity;
}
