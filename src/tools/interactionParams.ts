/**
 * `params/interaction.json` 공식 스키마·로더 (툴링 소유 — INT-CORE-022).
 *
 * 시스템·UI는 JSON을 직접 읽지 않는다 — composition root가 이 로더 결과를
 * 주입한다 (CLAUDE.md 규칙 6, `contracts/officialParams.ts`와 같은 규약).
 *
 * ## unwired 판정을 로더가 들고 있는 이유
 *
 * `interactRadiusMeters`·`noiseContribution` 중 하나라도 null이면 회수는
 * **성립할 수 없다**. 반경이 없으면 '가까이 있다'를 판정할 수 없고, 소음
 * 기여가 없으면 소음 없는 회수가 되어 16차 결의에 반한다. 소비 측이 각자
 * 판단하면 한 곳이라도 빠뜨렸을 때 조용히 회수가 열리므로, 로더가
 * `productionWired`로 한 번에 답한다 — **null을 0으로 바꾸지 않는다.**
 */

import type { NullableTunable, Tunable } from '../contracts/params';
import {
  isRecord,
  pendingTunables,
  readNullableTunable,
  readTunable,
  rejectUnknownKeys,
  requireBlock,
  TunableValidationError,
} from './tunableSchema';

const FILE = 'params/interaction.json';
export const INTERACTION_HOLD_FIELDS = [
  'holdSeconds',
  'interactRadiusMeters',
  'noiseContribution',
] as const;

/** 조립부에 넘어가는 읽기 전용 DTO — 원본 JSON 참조를 넘기지 않는다 */
export interface InteractionParamsConfig {
  readonly hold: {
    readonly holdSeconds: Tunable;
    readonly interactRadiusMeters: NullableTunable;
    readonly noiseContribution: NullableTunable;
  };
  /** 미확정 필드 경로 (예: `hold.interactRadiusMeters`) */
  readonly pendingFields: readonly string[];
  /**
   * production 회수 배선 가능 여부. 필수 수치가 하나라도 null이면 false —
   * 이 값이 false인 동안 interaction production은 **blocked**다.
   */
  readonly productionWired: boolean;
}

export function validateInteractionParams(raw: unknown): InteractionParamsConfig {
  if (!isRecord(raw)) throw new TunableValidationError(FILE, '(루트)', '객체가 필요합니다');
  const hold = requireBlock(FILE, raw, 'hold');
  rejectUnknownKeys(FILE, hold, 'hold.', INTERACTION_HOLD_FIELDS);

  const holdSeconds = readTunable(FILE, hold, 'hold.', 'holdSeconds');
  const interactRadiusMeters = readNullableTunable(FILE, hold, 'hold.', 'interactRadiusMeters');
  const noiseContribution = readNullableTunable(FILE, hold, 'hold.', 'noiseContribution');

  const pendingFields = pendingTunables([
    ['hold.interactRadiusMeters', interactRadiusMeters],
    ['hold.noiseContribution', noiseContribution],
  ]);

  return {
    hold: { holdSeconds, interactRadiusMeters, noiseContribution },
    pendingFields,
    productionWired: pendingFields.length === 0,
  };
}
