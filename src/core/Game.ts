/**
 * 게임 최상위 조립점.
 *
 * D1~D2 범위: 파라미터 로드·검증, 게임 루프, 상태 머신, 부트스트랩 장면,
 * 성능·로딩 계측만 연결한다. 게임플레이 시스템 구현은 D3 이후 각 파트 소유.
 */

import { loadParams } from '../config/ParamLoader';
import { Renderer } from '../render/Renderer';
import { BootstrapScene } from '../render/BootstrapScene';
import { PerformanceOverlay } from '../ui/PerformanceOverlay';
import { ControlsHud } from '../ui/ControlsHud';
import { GateMetricRecorder } from '../tools/GateMetricRecorder';
import { LoadingTimer } from '../tools/LoadingTimer';
import { EventBus } from './EventBus';
import { GameLoop } from './GameLoop';
import { GameStateMachine } from './GameStateMachine';
import { SceneManager } from './SceneManager';

/** 성능 샘플 발행 주기 (초) */
const PERF_SAMPLE_INTERVAL_SECONDS = 1;
/** 초기 로딩 스파이크가 최소 FPS 통계를 오염시키지 않도록 제외하는 워밍업 구간 (초) */
const PERF_WARMUP_SECONDS = 2;

export class Game {
  private readonly bus = new EventBus();
  private readonly stateMachine = new GameStateMachine(this.bus);
  private readonly sceneManager = new SceneManager();
  private readonly loadingTimer = new LoadingTimer();
  private readonly loop = new GameLoop({
    update: (dt) => this.update(dt),
    render: () => this.render(),
  });

  private renderer: Renderer | null = null;
  private recorder: GateMetricRecorder | null = null;
  private overlay: PerformanceOverlay | null = null;
  private controlsHud: ControlsHud | null = null;

  // 성능 샘플링 상태
  private frameCount = 0;
  private sampleElapsed = 0;
  private totalElapsed = 0;
  private recentFps: number[] = [];
  private minFps = Number.POSITIVE_INFINITY;
  private firstRenderDone = false;

  constructor(private readonly container: HTMLElement) {}

  start(): void {
    // 파라미터 로드·검증 — 범위를 벗어난 값이 있으면 여기서 명확한 오류로 중단된다.
    const params = loadParams();
    console.info(
      '[Game] 파라미터 4종 로드·검증 완료 (movement/detection/combat/crew).',
      params,
    );

    const canvas = document.createElement('canvas');
    canvas.id = 'game-canvas';
    this.container.appendChild(canvas);

    this.renderer = new Renderer(canvas);
    this.sceneManager.setActive(new BootstrapScene(this.renderer));

    this.recorder = new GateMetricRecorder(this.bus, this.loadingTimer);
    if (PerformanceOverlay.shouldShow()) {
      this.overlay = new PerformanceOverlay(this.container, this.bus, {
        loadingTimer: this.loadingTimer,
        recorder: this.recorder,
        rendererInfo: () => this.renderer?.describe() ?? '',
      });
    }

    // 조작 안내·Pointer Lock·화면 버튼 HUD (툴링·UI 소유 — src/ui/ControlsHud.ts).
    // 일시정지는 루프 정지/재개로 연결한다. 전투 의도 sink는 게임플레이 연결 전
    // 기본(계측+개발 로그) 구현을 쓴다 (INTEGRATION_NOTES #004).
    this.controlsHud = new ControlsHud(this.container, canvas, {
      setPaused: (paused) => (paused ? this.loop.stop() : this.loop.start()),
    });

    window.addEventListener('resize', this.handleResize);
    this.handleResize();

    this.loop.start();
  }

  stop(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.handleResize);
    this.controlsHud?.dispose();
    this.controlsHud = null;
    this.overlay?.dispose();
    this.sceneManager.dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }

  private readonly handleResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer?.resize(width, height);
    this.sceneManager.resize(width, height);
  };

  private update(deltaSeconds: number): void {
    this.sceneManager.update(deltaSeconds);
    this.samplePerformance(deltaSeconds);
  }

  private render(): void {
    this.sceneManager.render();

    if (!this.firstRenderDone) {
      this.firstRenderDone = true;
      this.loadingTimer.markFirstRender();
      // 부트 완료 — 상태 머신 기본 전환 구조 검증을 겸한다.
      this.stateMachine.transition('DEPARTURE');
    }
  }

  private samplePerformance(deltaSeconds: number): void {
    this.frameCount += 1;
    this.sampleElapsed += deltaSeconds;
    this.totalElapsed += deltaSeconds;
    if (this.sampleElapsed < PERF_SAMPLE_INTERVAL_SECONDS) return;

    const fps = this.frameCount / this.sampleElapsed;
    this.frameCount = 0;
    this.sampleElapsed = 0;

    this.recentFps.push(fps);
    if (this.recentFps.length > 60) this.recentFps.shift();
    const averageFps =
      this.recentFps.reduce((sum, v) => sum + v, 0) / this.recentFps.length;

    if (this.totalElapsed > PERF_WARMUP_SECONDS) {
      this.minFps = Math.min(this.minFps, fps);
    }

    this.bus.emit('performanceSampled', {
      fps,
      averageFps,
      minFps: Number.isFinite(this.minFps) ? this.minFps : fps,
    });
  }
}
