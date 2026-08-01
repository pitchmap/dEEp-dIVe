/**
 * params/ui.json 로더 — HUD 전용 파라미터 (툴링 소유).
 *
 * GameParams 계약(src/contracts/params.ts)과 validateParams.ts는 보호/준보호
 * 파일이라 건드리지 않고, UI 파라미터는 여기서 독립적으로 로드·검증·핫리로드한다.
 * 방식은 ParamLoader와 동일: 정적 import + Vite HMR, 잘못된 값은 거부하고
 * 기존 값 유지, JSON → 코드 단방향.
 */

import uiJson from '../../params/ui.json';
import { ParamValidationError } from '../config/validateParams';

const FILE = 'params/ui.json';

export interface UiTunable {
  value: number;
  range: [number, number];
  unit: string;
  note?: string;
}

export interface UiFlag {
  value: boolean;
  note?: string;
}

export interface UiParams {
  screenButtonBaseOpacity: UiTunable;
  screenButtonDimmedOpacity: UiTunable;
  mouseAimCountToDimButtons: UiTunable;
  showScreenButtonsByDefault: UiFlag;
  showControlsGuideByDefault: UiFlag;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateUiTunable(path: string, raw: unknown): UiTunable {
  if (!isRecord(raw)) {
    throw new ParamValidationError(FILE, path, '객체({ value, range, unit })가 필요합니다');
  }
  const value = raw['value'];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ParamValidationError(FILE, `${path}.value`, '유한한 숫자가 필요합니다');
  }
  const range = raw['range'];
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    typeof range[0] !== 'number' ||
    typeof range[1] !== 'number' ||
    range[0] > range[1]
  ) {
    throw new ParamValidationError(FILE, `${path}.range`, '[최소, 최대] 배열이 필요합니다');
  }
  if (value < range[0] || value > range[1]) {
    throw new ParamValidationError(
      FILE,
      `${path}.value`,
      `${value} 가 허용 범위 [${range[0]}, ${range[1]}] 를 벗어났습니다`,
    );
  }
  if (typeof raw['unit'] !== 'string') {
    throw new ParamValidationError(FILE, `${path}.unit`, '단위 문자열이 필요합니다');
  }
  const result: UiTunable = { value, range: [range[0], range[1]], unit: raw['unit'] };
  if (typeof raw['note'] === 'string') result.note = raw['note'];
  return result;
}

function validateUiFlag(path: string, raw: unknown): UiFlag {
  if (!isRecord(raw) || typeof raw['value'] !== 'boolean') {
    throw new ParamValidationError(FILE, path, '객체({ value: boolean })가 필요합니다');
  }
  const result: UiFlag = { value: raw['value'] };
  if (typeof raw['note'] === 'string') result.note = raw['note'];
  return result;
}

export function validateUiParams(raw: unknown): UiParams {
  if (!isRecord(raw)) throw new ParamValidationError(FILE, '(루트)', '객체가 필요합니다');
  return {
    screenButtonBaseOpacity: validateUiTunable('screenButtonBaseOpacity', raw['screenButtonBaseOpacity']),
    screenButtonDimmedOpacity: validateUiTunable('screenButtonDimmedOpacity', raw['screenButtonDimmedOpacity']),
    mouseAimCountToDimButtons: validateUiTunable('mouseAimCountToDimButtons', raw['mouseAimCountToDimButtons']),
    showScreenButtonsByDefault: validateUiFlag('showScreenButtonsByDefault', raw['showScreenButtonsByDefault']),
    showControlsGuideByDefault: validateUiFlag('showControlsGuideByDefault', raw['showControlsGuideByDefault']),
  };
}

let cached: UiParams | null = null;

/** UI 파라미터 로드·검증. 실패 시 ParamValidationError를 던진다. */
export function loadUiParams(): UiParams {
  if (!cached) {
    cached = validateUiParams(uiJson);
  }
  return cached;
}

export type UiParamsReloadListener = (params: UiParams) => void;

const reloadListeners = new Set<UiParamsReloadListener>();

/** 핫리로드로 UI 파라미터가 교체될 때 통지 (개발 모드 전용). 반환값은 구독 해제 함수 */
export function onUiParamsReloaded(listener: UiParamsReloadListener): () => void {
  reloadListeners.add(listener);
  return () => reloadListeners.delete(listener);
}

if (import.meta.hot) {
  import.meta.hot.accept(['../../params/ui.json'], ([mod]) => {
    try {
      const validated = validateUiParams(mod ? mod.default : uiJson);
      cached = validated;
      for (const listener of [...reloadListeners]) listener(validated);
      console.info('[uiParams] UI 파라미터 핫리로드 적용 완료.', validated);
    } catch (error) {
      console.error('[uiParams] 핫리로드 거부 — 검증 실패, 기존 값을 유지합니다.', error);
    }
  });
}
