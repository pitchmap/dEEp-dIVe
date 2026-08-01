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
import { UpgradeSimulator } from '../tools/UpgradeSimulator';

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
  private simulator: UpgradeSimulator | null = null;

  constructor(
    container: HTMLElement,
    bus: EventBus,
    private readonly deps: OverlayDeps,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'perf-overlay';
    // 오버레이·시뮬레이터 조작이 window의 전투 입력(MouseCombatInput)으로
    // 새지 않게 전파를 끊는다 (조준 중 다운로드 클릭 = 발사 방지)
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click'] as const) {
      this.root.addEventListener(type, (e) => e.stopPropagation());
    }

    this.text = document.createElement('div');
    this.root.appendChild(this.text);

    const download = document.createElement('button');
    download.type = 'button';
    download.textContent = '게이트 기록 다운로드 (JSON)';
    download.addEventListener('click', () => this.deps.recorder.download());
    this.root.appendChild(download);

    // 업그레이드 시뮬레이터 (소회의 11 결의 4) — 계측 오버레이와 같은
    // 개발·디버그 노출 조건을 공유한다. 지연 생성으로 게임 부팅 비용 0.
    const simToggle = document.createElement('button');
    simToggle.type = 'button';
    simToggle.textContent = '업그레이드 시뮬레이터';
    simToggle.addEventListener('click', () => {
      if (!this.simulator) this.simulator = new UpgradeSimulator(container);
      this.simulator.toggle();
    });
    this.root.appendChild(simToggle);

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
    this.simulator?.dispose();
    this.simulator = null;
    this.root.remove();
  }
}
