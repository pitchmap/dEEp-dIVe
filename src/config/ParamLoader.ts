/**
 * 파라미터 로더.
 *
 * params/*.json을 로드하고 런타임 검증(validateParams.ts)을 통과한
 * 타입 안전 객체(GameParams)를 반환한다.
 *
 * 현재(D1~D2)는 Vite 정적 import를 사용한다 — 개발 서버에서 JSON 저장 시
 * 즉시 리로드되며, 빌드 시 번들에 포함된다. 빌드 없이 값이 반영되는
 * 핫리로드 툴(fetch 기반 교체)은 툴링 파트의 후속 작업이다
 * (docs/CURRENT_STATUS.md 참조).
 *
 * 주의: JSON → 시스템 단방향. 이 모듈은 JSON을 절대 수정·역기록하지 않는다.
 */

import movementJson from '../../params/movement.json';
import detectionJson from '../../params/detection.json';
import combatJson from '../../params/combat.json';
import crewJson from '../../params/crew.json';
import type { GameParams } from '../contracts/params';
import { validateGameParams } from './validateParams';

let cached: GameParams | null = null;

/**
 * 파라미터 로드·검증. 실패 시 ParamValidationError를 던진다 —
 * 호출 측은 이를 숨기지 말고 초기화 실패로 처리해야 한다.
 */
export function loadParams(): GameParams {
  if (!cached) {
    cached = validateGameParams({
      movement: movementJson,
      detection: detectionJson,
      combat: combatJson,
      crew: crewJson,
    });
  }
  return cached;
}
