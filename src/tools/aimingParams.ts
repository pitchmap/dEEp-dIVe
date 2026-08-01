/**
 * params/aiming.json 로드·핫리로드 (툴링 소유).
 *
 * 카메라(그래픽스)와 조준(게임플레이)이 **이 로더와 aimingMath의 동일 타입·
 * 동일 제한 계산 함수**를 사용한다 — 각자 JSON을 읽거나 부호를 붙이지 않는다
 * (보완분 결의 8, 남유리 요청). 방식은 ParamLoader와 동일: 정적 import +
 * Vite HMR, 검증 실패 시 거부하고 기존 값 유지, JSON → 코드 단방향.
 */

import aimingJson from '../../params/aiming.json';
import { validateAimingParams, type AimingParams } from './aimingMath';

export {
  AIMING_RANGES,
  RESET_AIM_OFFSET,
  applyAimSensitivity,
  clampAimOffsetDegrees,
  pitchLimitsDegrees,
  validateAimingParams,
  yawLimitsDegrees,
  type AimingParams,
} from './aimingMath';

let cached: AimingParams | null = null;
let raw: unknown = aimingJson;

export function loadAimingParams(): AimingParams {
  if (!cached) cached = validateAimingParams(raw);
  return cached;
}

export type AimingParamsReloadListener = (params: AimingParams) => void;
const reloadListeners = new Set<AimingParamsReloadListener>();

export function onAimingParamsReloaded(listener: AimingParamsReloadListener): () => void {
  reloadListeners.add(listener);
  return () => reloadListeners.delete(listener);
}

if (import.meta.hot) {
  import.meta.hot.accept(['../../params/aiming.json'], ([mod]) => {
    try {
      const next = mod ? mod.default : raw;
      const validated = validateAimingParams(next);
      raw = next;
      cached = validated;
      for (const listener of [...reloadListeners]) listener(validated);
      console.info('[aimingParams] 조준 파라미터 핫리로드 적용 완료.', validated);
    } catch (error) {
      console.error('[aimingParams] 핫리로드 거부 — 검증 실패, 기존 값을 유지합니다.', error);
    }
  });
}
