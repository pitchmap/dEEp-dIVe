/**
 * 은신·심도 보정 입력 — 계약 `DetectionEnvironmentSource` 구현 (C2).
 *
 * ## 하는 일
 *
 * 기존 정본 상태를 **그대로 읽어 전달**한다. 보정식·계수를 여기서 계산하지
 * 않는다 — 심도 보정 배율(`depthModifiers`)과 침묵 항행 배율은 공식
 * `params/detection.json`이 소유하고 `SubmarineDetectionSystem`이 적용한다.
 * 이 어댑터는 "지금 어느 층인가 / 소음이 얼마인가 / 침묵 항행 중인가"만
 * 알려 준다.
 *
 * ## 정본 소비
 *
 *  - 심도 층: 기존 3층 판정 `DepthSystem.currentLayer` (게임플레이 정본).
 *    렌더는 이 값을 계산하지 않는다.
 *  - 소음: `NoiseLevelSource` — 현재 공식 소음 산출 규칙이 params에 없다.
 *    **자체 계산을 하지 않고** 미연결이면 중립 입력(0)을 전달한다.
 *  - 침묵 항행: `SilentRunningSource` — 토글 시스템이 아직 없다.
 *    미연결이면 false(비활성)를 전달한다.
 *
 * 두 미연결 입력은 **중립값**이며 임의 수치가 아니다: 소음 0이면 게이지가
 * 오르지 않고, 침묵 항행 false면 공식 배율이 적용되지 않는다. `wired`
 * getter로 어느 입력이 연결됐는지 드러난다.
 *
 * ## 하지 않는 것
 *
 * 심도 이동 물리·잠수함 조작을 바꾸지 않는다. 소음 산출 공식을 만들지
 * 않는다(공식 params 도착 시 소스만 연결한다).
 */

import type { DetectionEnvironmentSource } from '../../contracts/detection';
import type { DepthLayerId } from '../../contracts/events';
import type { DepthSystem } from '../../contracts/systems';

/** 소음 공급 단면 — 공식 소음 규칙이 생기면 그 시스템이 충족한다 */
export interface NoiseLevelSource {
  /** 0~1 */
  readonly noiseLevel: number;
}

/** 침묵 항행 상태 단면 — 토글 시스템 도입 시 충족한다 */
export interface SilentRunningSource {
  readonly silentRunning: boolean;
}

export class DetectionEnvironmentAdapter implements DetectionEnvironmentSource {
  private readonly depth: DepthSystem;
  private noiseSource: NoiseLevelSource | null;
  private silentSource: SilentRunningSource | null;

  constructor(
    depth: DepthSystem,
    noiseSource: NoiseLevelSource | null = null,
    silentSource: SilentRunningSource | null = null,
  ) {
    this.depth = depth;
    this.noiseSource = noiseSource;
    this.silentSource = silentSource;
  }

  /** 공식 소음 소스 연결 (조립부) — 미연결이면 중립 입력 0 */
  attachNoiseSource(source: NoiseLevelSource | null): void {
    this.noiseSource = source;
  }

  /** 침묵 항행 소스 연결 (조립부) — 미연결이면 false */
  attachSilentRunningSource(source: SilentRunningSource | null): void {
    this.silentSource = source;
  }

  /** 어떤 입력이 연결됐는가 — 미연결을 '작동 중'으로 위장하지 않기 위한 표기 */
  get wired(): { readonly noise: boolean; readonly silentRunning: boolean } {
    return { noise: this.noiseSource !== null, silentRunning: this.silentSource !== null };
  }

  /* ── 계약 `DetectionEnvironmentSource` ─────────────────────────── */

  /** 미연결이면 0 — 중립 입력이며 임의 소음값을 만들지 않는다 */
  get noiseLevel(): number {
    const level = this.noiseSource?.noiseLevel;
    if (typeof level !== 'number' || !Number.isFinite(level)) return 0;
    return Math.min(1, Math.max(0, level));
  }

  /** 기존 3층 심도 판정 정본을 그대로 전달한다 (보정 계산 없음) */
  get depthLayer(): DepthLayerId {
    return this.depth.currentLayer;
  }

  /** 미연결이면 false — 침묵 항행 토글 시스템은 이번 범위가 아니다 */
  get silentRunning(): boolean {
    return this.silentSource?.silentRunning === true;
  }
}
