/**
 * 게이트 계측 기록기 (G1·G2).
 *
 * performanceSampled 이벤트를 메모리에 누적하고,
 * 스냅샷을 JSON 파일로 다운로드할 수 있게 한다.
 *
 * 개인정보·고유 식별자는 기록하지 않는다 — 브라우저 종류(userAgent)와
 * 화면 크기 등 환경 정보만 담는다.
 */

import type { EventBus, Unsubscribe } from '../core/EventBus';
import type { LoadingTimer } from './LoadingTimer';
import { inputTelemetry, type InputMetricsSnapshot } from './InputTelemetry';

interface PerfSample {
  fps: number;
  averageFps: number;
  minFps: number;
}

export interface GateMetricSnapshot {
  /** 측정 시각 (ISO 8601) */
  recordedAt: string;
  /** 누적 샘플 전체의 평균 FPS (구간 평균의 평균이 아니라 초당 샘플의 평균) */
  averageFps: number | null;
  /** 워밍업(2초) 이후의 최소 FPS — core/Game이 집계 (G1 판정값) */
  minFps: number | null;
  /** 페이지 진입 → 첫 렌더 완료 (ms) — G2(접속 3초) 판정값 */
  firstRenderMs: number | null;
  /**
   * 초당 FPS 시계열 (오래된 것부터) — G1 운영표의 '구간별 fps 로그'.
   * 어느 구간에서 프레임이 떨어졌는지 역추적용.
   */
  fpsSamples: number[];
  /** 입력·버튼 사용 세션 카운터 (G3 참고 + 화면 버튼 사용률 판단 근거) */
  input: InputMetricsSnapshot;
  /** 환경 정보만 기록한다 — 개인정보·고유 사용자 식별자 금지 (TOOLING 규칙) */
  browser: string;
  buildMode: string;
  screen: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  sampleCount: number;
}

/** 메모리 사용 상한 — 오래 켜둔 세션에서도 최근 1시간 분량만 유지 */
const MAX_SAMPLES = 3600;

export class GateMetricRecorder {
  private readonly samples: PerfSample[] = [];
  private readonly unsubscribe: Unsubscribe;

  constructor(
    bus: EventBus,
    private readonly loadingTimer: LoadingTimer,
  ) {
    this.unsubscribe = bus.on('performanceSampled', (sample) => {
      this.samples.push(sample);
      if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    });
  }

  snapshot(): GateMetricSnapshot {
    const last = this.samples.at(-1) ?? null;
    const averageFps =
      this.samples.length > 0
        ? this.samples.reduce((sum, s) => sum + s.fps, 0) / this.samples.length
        : null;
    return {
      recordedAt: new Date().toISOString(),
      averageFps: averageFps !== null ? round1(averageFps) : null,
      minFps: last ? round1(last.minFps) : null,
      firstRenderMs: this.loadingTimer.firstRenderMs !== null
        ? Math.round(this.loadingTimer.firstRenderMs)
        : null,
      fpsSamples: this.samples.map((s) => round1(s.fps)),
      input: inputTelemetry.snapshot(),
      browser: navigator.userAgent,
      buildMode: import.meta.env.MODE,
      screen: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      sampleCount: this.samples.length,
    };
  }

  /** 스냅샷을 JSON 파일로 다운로드 */
  download(): void {
    const snapshot = this.snapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `gate-metrics-${snapshot.recordedAt.replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  dispose(): void {
    this.unsubscribe();
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
