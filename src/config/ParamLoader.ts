/**
 * 파라미터 로더.
 *
 * params/*.json을 로드하고 런타임 검증(validateParams.ts)을 통과한
 * 타입 안전 객체(GameParams)를 반환한다.
 *
 * 핫리로드 (개발 모드 전용):
 *  - Vite HMR(import.meta.hot)로 params/*.json 저장을 감지해 전체 리로드·재빌드
 *    없이 값을 교체한다. 프로덕션 빌드에서는 이 블록이 제거되고 번들 값만 쓴다.
 *  - 새 값도 동일한 validateGameParams를 통과해야 한다 — 범위 밖·형식 오류
 *    값은 거부되고 기존 값이 유지된다 (조용한 클램프 금지).
 *  - 시스템은 loadParams() 반환값을 매 프레임 다시 읽거나 onParamsReloaded로
 *    교체 통지를 받는다. 인터페이스 loadParams()는 정적 import 시절과 동일하다.
 *
 * 주의: JSON → 시스템 단방향. 이 모듈은 JSON을 절대 수정·역기록하지 않는다.
 */

import movementJson from '../../params/movement.json';
import detectionJson from '../../params/detection.json';
import combatJson from '../../params/combat.json';
import crewJson from '../../params/crew.json';
import type { GameParams } from '../contracts/params';
import { validateGameParams } from './validateParams';

interface RawParamFiles {
  movement: unknown;
  detection: unknown;
  combat: unknown;
  crew: unknown;
}

let raw: RawParamFiles = {
  movement: movementJson,
  detection: detectionJson,
  combat: combatJson,
  crew: crewJson,
};

let cached: GameParams | null = null;

/**
 * 파라미터 로드·검증. 실패 시 ParamValidationError를 던진다 —
 * 호출 측은 이를 숨기지 말고 초기화 실패로 처리해야 한다.
 */
export function loadParams(): GameParams {
  if (!cached) {
    cached = validateGameParams(raw);
  }
  return cached;
}

export type ParamsReloadListener = (params: GameParams) => void;

const reloadListeners = new Set<ParamsReloadListener>();

/**
 * 핫리로드로 파라미터가 교체될 때 통지를 받는다 (개발 모드에서만 발생).
 * 반환값은 구독 해제 함수.
 */
export function onParamsReloaded(listener: ParamsReloadListener): () => void {
  reloadListeners.add(listener);
  return () => reloadListeners.delete(listener);
}

if (import.meta.hot) {
  import.meta.hot.accept(
    [
      '../../params/movement.json',
      '../../params/detection.json',
      '../../params/combat.json',
      '../../params/crew.json',
    ],
    ([movement, detection, combat, crew]) => {
      // 변경된 파일만 새 모듈이 온다 — 나머지는 기존 원본 유지
      const next: RawParamFiles = {
        movement: movement ? movement.default : raw.movement,
        detection: detection ? detection.default : raw.detection,
        combat: combat ? combat.default : raw.combat,
        crew: crew ? crew.default : raw.crew,
      };
      try {
        const validated = validateGameParams(next);
        raw = next;
        cached = validated;
        for (const listener of [...reloadListeners]) listener(validated);
        console.info('[ParamLoader] 파라미터 핫리로드 적용 완료.', validated);
      } catch (error) {
        console.error(
          '[ParamLoader] 핫리로드 거부 — 검증 실패, 기존 값을 유지합니다.',
          error,
        );
      }
    },
  );
}
