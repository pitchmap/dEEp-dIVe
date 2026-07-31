/**
 * 개발용 성능 오버레이 (화면 좌상단 모서리).
 *
 * 표시: 현재 FPS / 최근 구간 평균 FPS / 최소 FPS / 초기 로딩 시간 /
 *       빌드 모드 / 렌더러 정보.
 *
 * 개발 모드에서 기본 표시. 프로덕션에서는 쿼리 파라미터 `?debug=1`로 켠다.
 */

import type { EventBus, Unsubscribe } from '../core/EventBus';
import type { GateMetricRecorder } from '../tools/GateMetricRecorder';
import type { LoadingTimer } from '../tools/LoadingTimer';

export interface OverlayDeps {
  loadingTimer: LoadingTimer;
  recorder: GateMetricRecorder;
  rendererInfo: () => string;
}

export class PerformanceOverlay {
  static shouldShow(): boolean {
    if (import.meta.env.DEV) return true;
    return new URLSearchParams(window.location.search).get('debug') === '1';
  }

  private readonly root: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly unsubscribe: Unsubscribe;

  constructor(
    container: HTMLElement,
    bus: EventBus,
    private readonly deps: OverlayDeps,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'perf-overlay';

    this.text = document.createElement('div');
    this.root.appendChild(this.text);

    const download = document.createElement('button');
    download.type = 'button';
    download.textContent = '게이트 기록 다운로드 (JSON)';
    download.addEventListener('click', () => this.deps.recorder.download());
    this.root.appendChild(download);

    container.appendChild(this.root);
    this.renderText(null);

    this.unsubscribe = bus.on('performanceSampled', (sample) => {
      this.renderText(sample);
    });
  }

  private renderText(
    sample: { fps: number; averageFps: number; minFps: number } | null,
  ): void {
    const loading = this.deps.loadingTimer.firstRenderMs;
    const lines = [
      `FPS      ${sample ? sample.fps.toFixed(0) : '--'}`,
      `평균 FPS ${sample ? sample.averageFps.toFixed(1) : '--'}`,
      `최소 FPS ${sample ? sample.minFps.toFixed(1) : '--'}`,
      `로딩     ${loading !== null ? `${Math.round(loading)} ms` : '측정 중'}`,
      `모드     ${import.meta.env.MODE}`,
      `렌더러   ${this.deps.rendererInfo()}`,
    ];
    this.text.textContent = lines.join('\n');
  }

  dispose(): void {
    this.unsubscribe();
    this.root.remove();
  }
}
