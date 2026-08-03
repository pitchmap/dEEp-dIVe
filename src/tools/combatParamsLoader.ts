/**
 * C9 전투 params 로더 (툴링 소유) — **production 단일 출처**.
 *
 * `params/combat.json`의 C9 블록을 검증 통과 형태로만 내보낸다.
 * 시스템·UI는 이 로더를 직접 호출하지 않고 composition root가 주입한 값을
 * 소비한다 (CLAUDE.md 규칙 6, 계약 `contracts/officialParams.ts`와 동일 규약).
 *
 * ## provisional 값을 삽입하지 않는다
 *
 * 검증기가 `null`을 돌려주면 로더도 `null`을 그대로 넘긴다. 기본값·0·
 * 임시 상수를 채우는 경로가 이 파일에 없다 — 미확정이면 소비 측이 계약대로
 * `unwired`로 남는 것이 정상 동작이다. 로드 자체가 실패하면(스키마 위반)
 * 예외를 던지고 조용한 fallback을 만들지 않는다.
 *
 * 방식은 `aimingParams`·`economyParams`와 같다: 정적 import + Vite HMR,
 * 검증 실패 시 거부하고 기존 값 유지, 코드에서 JSON 역기록 없음.
 */

import combatJson from '../../params/combat.json';
import { validateCombatParams, type CombatParamsResult } from './combatParams';

export {
  DEPTH_CHARGE_FIELDS,
  DETECTION_TUNING_FIELDS,
  EXCLUDED_PRESSURE_FIELDS,
  FLOODING_FIELDS,
  HULL_FIELDS,
  combatParamsFullyDefined,
  validateCombatParams,
  type CombatParamsResult,
} from './combatParams';

let cached: CombatParamsResult | null = null;
let raw: unknown = combatJson;

export function loadCombatParams(): CombatParamsResult {
  if (!cached) cached = validateCombatParams(raw);
  return cached;
}

export type CombatParamsReloadListener = (params: CombatParamsResult) => void;
const reloadListeners = new Set<CombatParamsReloadListener>();

export function onCombatParamsReloaded(listener: CombatParamsReloadListener): () => void {
  reloadListeners.add(listener);
  return () => reloadListeners.delete(listener);
}

if (import.meta.hot) {
  import.meta.hot.accept(['../../params/combat.json'], ([mod]) => {
    try {
      const next = mod ? mod.default : raw;
      const validated = validateCombatParams(next);
      raw = next;
      cached = validated;
      for (const listener of [...reloadListeners]) listener(validated);
      console.info('[combatParams] 전투 파라미터 핫리로드 적용 완료.', validated);
    } catch (error) {
      console.error('[combatParams] 핫리로드 거부 — 검증 실패, 기존 값을 유지합니다.', error);
    }
  });
}
