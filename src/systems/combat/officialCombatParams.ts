/**
 * C1·C4 전투 params — 게임플레이 **정규화 입력 단면** (INT-CORE-017 개정).
 *
 * ## 정규화 소유자는 여기가 아니다
 *
 * `params/combat.json`의 중첩 스키마(`hull.*`·`depthCharge.*`·`flooding.*`·
 * `detection.*`, `{ value, unit, note }` 래퍼) 해석·검증은 **공인 로더
 * 한 곳**(`src/tools/combatParams.validateCombatParams` →
 * `tools/combatParamsLoader.loadCombatParams`)의 책임이다. 조립부는 그
 * 결과(계약 타입 블록)를 이 단면으로 넘기고, 게임플레이는 툴링 스키마를
 * 직접 해석하지 않는다.
 *
 * 구 평면 리더(`readDetectionTuningParams`/`readDepthChargeDamageParams` —
 * root에서 평면 키를 읽던 이중 정규화)는 **제거됐다**: 중첩 스키마와
 * 어긋나 값이 도착해도 읽히지 않는 충돌의 원인이었다 (C_RUNTIME blocker 2).
 *
 * ## null 규칙
 *
 * null 블록·null 필드는 그대로 전달된다 — 소비 시스템은 unwired로 남고
 * (게이지 0 고정 / 공격 unwired / 폭뢰 피해 0), null→0·기본값·픽스처
 * fallback 변환은 금지다.
 */

import type { DetectionTuningParams } from '../../contracts/detection';
import type { DepthChargeDamageParams } from '../../contracts/survival';

/**
 * 조립부 → 게임플레이 전투 params 정규화 입력.
 * 공인 로더 `CombatParamsResult`의 게임플레이 소비 단면(구조적 부분집합)이다 —
 * 선체·침수 블록은 리드 코어(PlayerHullSystem·FloodingCore)가 직접 받는다.
 */
export interface NormalizedCombatParams {
  readonly detectionTuning: DetectionTuningParams | null;
  readonly depthCharge: DepthChargeDamageParams | null;
}

/** 폭뢰 피해 판정에 필요한 값이 전부 확정됐는가 (하나라도 null이면 false) */
export function depthChargeDamageWired(params: DepthChargeDamageParams | null): boolean {
  if (!params) return false;
  return (
    params.directRadiusMeters !== null &&
    params.nearRadiusMeters !== null &&
    params.directDamage !== null &&
    params.nearDamage !== null
  );
}
