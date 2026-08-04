/**
 * `params/sonar.json` 공식 스키마·로더 (툴링 소유 — INT-CORE-022).
 *
 * 결과는 읽기 전용 DTO로 조립부에 전달한다 — 시스템이 JSON을 직접 읽지
 * 않는다. **gameplay·render 로직은 여기 없다**: 이 파일은 수치의 형식과
 * 미확정 여부만 판정하고, 접점 계산·표시는 각 소유 파트가 한다.
 *
 * ## 축별 unwired
 *
 * 액티브 핑과 패시브 방위는 **별개 축**이다. 핑 3종 중 하나라도 null이면
 * 액티브 축이 unwired고(표시만 있고 대가가 없거나, 대가만 있고 쿨다운이
 * 없는 반쪽 상태를 만들지 않는다), 방위 번짐이 null이면 패시브 축이
 * unwired다. 한쪽이 살아 있어도 다른 쪽을 pass로 올리지 않는다.
 */

import type { NullableTunable } from '../contracts/params';
import {
  isRecord,
  pendingTunables,
  readNullableTunable,
  rejectUnknownKeys,
  requireBlock,
  TunableValidationError,
} from './tunableSchema';

const FILE = 'params/sonar.json';
export const SONAR_ACTIVE_PING_FIELDS = [
  'displaySeconds',
  'detectionGaugeRise',
  'cooldownSeconds',
] as const;
export const SONAR_PASSIVE_FIELDS = ['bearingSpreadRadiansAtMaxNoise'] as const;

/**
 * 입력 키는 params가 아니다 — 이 목록이 sonar.json에 나타나면 거부한다.
 * 키 바인딩은 `controlsConfig`(툴링 UI) 소유이며 밸런스 수치가 아니다.
 */
export const FORBIDDEN_SONAR_INPUT_KEYS = ['pingKey', 'activePingKey', 'keyBinding', 'inputKey'] as const;

export interface SonarParamsConfig {
  readonly activePing: {
    readonly displaySeconds: NullableTunable;
    readonly detectionGaugeRise: NullableTunable;
    readonly cooldownSeconds: NullableTunable;
  };
  readonly passive: {
    readonly bearingSpreadRadiansAtMaxNoise: NullableTunable;
  };
  readonly pendingFields: readonly string[];
  /** 액티브 핑 축을 production에 배선할 수 있는가 (3종 전부 확정 시에만) */
  readonly activePingWired: boolean;
  /** 패시브 방위 축을 배선할 수 있는가 */
  readonly passiveBearingWired: boolean;
}

export function validateSonarParams(raw: unknown): SonarParamsConfig {
  if (!isRecord(raw)) throw new TunableValidationError(FILE, '(루트)', '객체가 필요합니다');

  for (const forbidden of FORBIDDEN_SONAR_INPUT_KEYS) {
    if (forbidden in raw) {
      throw new TunableValidationError(
        FILE,
        forbidden,
        '입력 키는 params가 아닙니다 — 키 바인딩은 controlsConfig 소유입니다',
      );
    }
  }

  const active = requireBlock(FILE, raw, 'activePing');
  rejectUnknownKeys(FILE, active, 'activePing.', SONAR_ACTIVE_PING_FIELDS);
  const passive = requireBlock(FILE, raw, 'passive');
  rejectUnknownKeys(FILE, passive, 'passive.', SONAR_PASSIVE_FIELDS);

  const displaySeconds = readNullableTunable(FILE, active, 'activePing.', 'displaySeconds');
  const detectionGaugeRise = readNullableTunable(FILE, active, 'activePing.', 'detectionGaugeRise');
  const cooldownSeconds = readNullableTunable(FILE, active, 'activePing.', 'cooldownSeconds');
  const bearingSpread = readNullableTunable(
    FILE,
    passive,
    'passive.',
    'bearingSpreadRadiansAtMaxNoise',
  );

  const pendingFields = pendingTunables([
    ['activePing.displaySeconds', displaySeconds],
    ['activePing.detectionGaugeRise', detectionGaugeRise],
    ['activePing.cooldownSeconds', cooldownSeconds],
    ['passive.bearingSpreadRadiansAtMaxNoise', bearingSpread],
  ]);

  return {
    activePing: { displaySeconds, detectionGaugeRise, cooldownSeconds },
    passive: { bearingSpreadRadiansAtMaxNoise: bearingSpread },
    pendingFields,
    activePingWired:
      displaySeconds.value !== null && detectionGaugeRise.value !== null && cooldownSeconds.value !== null,
    passiveBearingWired: bearingSpread.value !== null,
  };
}
