/**
 * 게임 최상위 조립점.
 *
 * 연결하는 것: 파라미터 로드·검증, 게임 루프, 상태 머신, 장면 관리,
 * 시스템 등록(SystemRegistry — composeSystems가 유일한 등록 지점),
 * 성능·로딩 계측. 시스템 구현 자체는 각 파트 소유 영역에 있다.
 */

import { loadParams } from '../config/ParamLoader';
import type { GameParams } from '../contracts/params';
import { Renderer } from '../render/Renderer';
import { BootstrapScene } from '../render/BootstrapScene';
import { PerformanceOverlay } from '../ui/PerformanceOverlay';
import { GateMetricRecorder } from '../tools/GateMetricRecorder';
import { LoadingTimer } from '../tools/LoadingTimer';
import { EventBus } from './EventBus';
import { GameLoop } from './GameLoop';
import { GameStateMachine } from './GameStateMachine';
import { SceneManager } from './SceneManager';
import { SystemRegistry } from './SystemRegistry';

/** 성능 샘플 발행 주기 (초) */
const PERF_SAMPLE_INTERVAL_SECONDS = 1;
/** 초기 로딩 스파이크가 최소 FPS 통계를 오염시키지 않도록 제외하는 워밍업 구간 (초) */
const PERF_WARMUP_SECONDS = 2;

export class Game {
  private readonly bus = new EventBus();
  private readonly stateMachine = new GameStateMachine(this.bus);
  private readonly sceneManager = new SceneManager();
  private readonly registry = new SystemRegistry();
  private readonly loadingTimer = new LoadingTimer();
  private readonly loop = new GameLoop({
    update: (dt) => this.update(dt),
    render: () => this.render(),
  });

  private renderer: Renderer | null = null;
  private recorder: GateMetricRecorder | null = null;
  private overlay: PerformanceOverlay | null = null;

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

    this.composeSystems(params);
    this.registry.initializeAll({
      bus: this.bus,
      params,
      stateMachine: this.stateMachine,
    });

    window.addEventListener('resize', this.handleResize);
    this.handleResize();

    this.loop.start();
  }

  /**
   * 시스템 등록 지점 — 여기가 각 파트 구현체를 조립하는 유일한 자리다.
   *
   * 규칙 (docs/ARCHITECTURE.md '시스템 수명주기와 실행 순서'):
   *  - 실행 순서 = 등록 순서. 아래 그룹 순서를 지킨다:
   *      ① 입력·조작 (게임플레이: PlayerController, DepthSystem, 카메라)
   *      ② 판정 (게임플레이: 탐지·어뢰·폭뢰·내구도 — D6 이후)
   *      ③ AI (리드: DestroyerAI — D6 이후)
   *      ④ 표현 연동 (렌더 이펙트·UI·오디오 배관 — 이벤트 구독 측)
   *  - 파트 간 의존은 EventBus로만. 구현체 간 직접 참조를 여기서 잇지 않는다.
   *  - params 외 의존성(렌더러 등)은 이 지점에서 생성자 주입한다.
   *  - src/core는 공통 보호 파일 — 등록 추가는 feat→dev 병합 시 리드가 배선한다.
   *
   * D3~D5 현재: 등록할 구현체가 아직 없다 (각 파트 feat 브랜치 작업 중).
   * 3D 장면(회색 박스 블록아웃)은 시스템이 아니라 SceneManager가 관리한다.
   */
  private composeSystems(_params: GameParams): void {
    // (D+5 통합 시 여기서 registry.register(...) 순서대로 배선)
  }

  stop(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.handleResize);
    this.registry.disposeAll();
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

  /** 프레임 순서: 시스템 시뮬레이션 → 장면(표현) 갱신 → 계측 */
  private update(deltaSeconds: number): void {
    this.registry.update(deltaSeconds);
    this.sceneManager.update(deltaSeconds);
    this.samplePerformance(deltaSeconds);
  }

  /** 렌더 순서: 3D 장면 → 시스템 render (UI 등 오버레이 계층) */
  private render(): void {
    this.sceneManager.render();
    this.registry.render();

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
