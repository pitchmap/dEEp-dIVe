/**
 * 개발용 성능 오버레이 (화면 **우측 상단** — 자산 HUD 아래).
 *
 * 표시: 현재 FPS / 최근 구간 평균 FPS / 최소 FPS / 초기 로딩 시간 /
 *       빌드 모드 / 렌더러 정보.
 *
 * 개발 모드에서 기본 표시. 프로덕션에서는 쿼리 파라미터 `?debug=1`로 켠다.
 *
 * ## 배치 (L-1 — 좌상단 소나 스코프 가림 해소)
 *
 * 좌상단은 소나 스코프(`SonarScope`, left/top 0.75rem · 18vh)의 자리다.
 * 이 패널은 우측 상단 자산 HUD(`[data-ui-economy-hud]`) **아래** 12px에
 * 붙는다. 자산 HUD는 출항 중 '이번 출항 획득' 줄이 늘고 문구 길이에 따라
 * 줄바꿈되어 높이가 변하므로, 고정 top 대신 실제 하단을 측정해
 * `--perf-overlay-top`으로 넣는다. 측정은 자산 HUD 크기 변화(ResizeObserver)·
 * 창 크기 변화·성능 샘플(1초) 시점에만 하고 매 프레임 하지 않는다.
 *
 * 자체 판정·게임 상태는 없다 — 이 파일은 배치와 표시만 다룬다.
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

/** 자산 HUD 하단과 이 패널 사이 간격 / 자산 HUD가 없을 때의 상단 여백 (px) */
const GAP_BELOW_ASSET_HUD_PX = 12;
const TOP_MARGIN_PX = 12;
/** 자산 HUD 마운트를 기다리는 프레임 상한 (조립 순서상 오버레이가 먼저 생긴다) */
const ASSET_HUD_WAIT_FRAMES = 240;

export class PerformanceOverlay {
  static shouldShow(): boolean {
    if (import.meta.env.DEV) return true;
    return new URLSearchParams(window.location.search).get('debug') === '1';
  }

  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly unsubscribe: Unsubscribe;
  private simulator: UpgradeSimulator | null = null;

  private assetHud: HTMLElement | null = null;
  private readonly assetHudResize: ResizeObserver | null;
  private assetHudWaitFrames = 0;
  private lastTopValue = '';
  private disposed = false;

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

    // 접기 토글 — 새 단축키를 만들지 않는다(클릭 전용). 기본은 펼침이라
    // 기존 표시 내용·검증 경로(.perf-overlay textContent)가 그대로다.
    const toggleRow = document.createElement('div');
    toggleRow.className = 'perf-overlay-toggle';
    const collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.textContent = '접기';
    collapse.addEventListener('click', () => {
      const collapsed = this.root.classList.toggle('perf-overlay-collapsed');
      collapse.textContent = collapsed ? '펼치기' : '접기';
    });
    toggleRow.appendChild(collapse);
    this.root.appendChild(toggleRow);

    this.body = document.createElement('div');
    this.body.className = 'perf-overlay-body';
    this.root.appendChild(this.body);

    this.text = document.createElement('div');
    this.body.appendChild(this.text);

    const download = document.createElement('button');
    download.type = 'button';
    download.textContent = '게이트 기록 다운로드 (JSON)';
    download.addEventListener('click', () => this.deps.recorder.download());
    this.body.appendChild(download);

    // 업그레이드 시뮬레이터 (소회의 11 결의 4) — 계측 오버레이와 같은
    // 개발·디버그 노출 조건을 공유한다. 지연 생성으로 게임 부팅 비용 0.
    const simToggle = document.createElement('button');
    simToggle.type = 'button';
    simToggle.textContent = '업그레이드 시뮬레이터';
    simToggle.addEventListener('click', () => {
      if (!this.simulator) this.simulator = new UpgradeSimulator(container);
      this.simulator.toggle();
    });
    this.body.appendChild(simToggle);

    container.appendChild(this.root);
    this.renderText(null);

    this.assetHudResize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.syncLayout());
    window.addEventListener('resize', this.syncLayout);
    this.syncLayout();
    this.waitForAssetHud();

    this.unsubscribe = bus.on('performanceSampled', (sample) => {
      this.renderText(sample);
      this.syncLayout();
    });
  }

  /**
   * 자산 HUD 실제 하단 + 12px를 상단 좌표로 넣는다. 자산 HUD가 아직
   * 없거나 숨김(display:none — 높이 0)이면 화면 상단 여백만 쓴다.
   */
  private readonly syncLayout = (): void => {
    if (this.disposed) return;
    if (!this.assetHud) {
      const found = document.querySelector<HTMLElement>('[data-ui-economy-hud]');
      if (found) {
        this.assetHud = found;
        this.assetHudResize?.observe(found);
      }
    }
    const rect = this.assetHud?.getBoundingClientRect() ?? null;
    const top =
      rect && rect.height > 0 ? rect.bottom + GAP_BELOW_ASSET_HUD_PX : TOP_MARGIN_PX;
    const next = `${Math.round(top)}px`;
    if (next === this.lastTopValue) return;
    this.lastTopValue = next;
    this.root.style.setProperty('--perf-overlay-top', next);
  };

  /** 자산 HUD는 이 오버레이보다 나중에 마운트된다 — 찾을 때까지만 짧게 본다 */
  private waitForAssetHud(): void {
    if (this.disposed || this.assetHud) return;
    if (this.assetHudWaitFrames >= ASSET_HUD_WAIT_FRAMES) return;
    this.assetHudWaitFrames += 1;
    requestAnimationFrame(() => {
      this.syncLayout();
      this.waitForAssetHud();
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
    this.disposed = true;
    this.unsubscribe();
    window.removeEventListener('resize', this.syncLayout);
    this.assetHudResize?.disconnect();
    this.assetHud = null;
    this.simulator?.dispose();
    this.simulator = null;
    this.root.remove();
  }
}
