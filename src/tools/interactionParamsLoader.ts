/**
 * `params/interaction.json` 공식 로더 (툴링 소유 — INT-CORE-022).
 *
 * 스키마·검증은 `interactionParams.ts`가 갖고, 이 파일은 **정적 JSON import와
 * HMR만** 담당한다. 둘을 나눈 이유는 검증 러너가 Node에서 `.ts`를 직접
 * 로드하는데 Node의 JSON import는 import attribute를 요구하기 때문이다 —
 * 검증기는 순수 모듈이라 어디서든 돌고, 로더는 Vite 번들에서만 쓰인다
 * (`combatParams` / `combatParamsLoader`와 같은 분리).
 *
 * 시스템·UI는 이 로더를 직접 호출하지 않는다 — composition root가 결과를
 * 읽기 전용 DTO로 주입한다.
 */

import interactionJson from '../../params/interaction.json';
import { validateInteractionParams, type InteractionParamsConfig } from './interactionParams';

export * from './interactionParams';

let cached: InteractionParamsConfig | null = null;
let rawSource: unknown = interactionJson;

export function loadInteractionParams(): InteractionParamsConfig {
  if (!cached) cached = validateInteractionParams(rawSource);
  return cached;
}

export type InteractionParamsReloadListener = (config: InteractionParamsConfig) => void;
const listeners = new Set<InteractionParamsReloadListener>();

export function onInteractionParamsReloaded(listener: InteractionParamsReloadListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (import.meta.hot) {
  import.meta.hot.accept(['../../params/interaction.json'], ([mod]) => {
    try {
      const next = mod ? mod.default : rawSource;
      const validated = validateInteractionParams(next);
      rawSource = next;
      cached = validated;
      for (const listener of [...listeners]) listener(validated);
      console.info('[interactionParams] 핫리로드 적용 완료.', validated);
    } catch (error) {
      console.error('[interactionParams] 핫리로드 거부 — 검증 실패, 기존 값 유지.', error);
    }
  });
}
