/**
 * 게임 최상위 조립점.
 *
 * 연결하는 것: 파라미터 로드·검증, 게임 루프, 상태 머신, 장면 관리,
 * 시스템 등록(SystemRegistry — composeSystems가 유일한 등록 지점),
 * 성능·로딩 계측. 시스템 구현 자체는 각 파트 소유 영역에 있다.
 */

import { loadParams, onParamsReloaded } from '../config/ParamLoader';
import type { GameParams } from '../contracts/params';
import { Renderer } from '../render/Renderer';
import { CanyonScene } from '../render/CanyonScene';
import { CameraInputAdapter } from '../render/CameraInputAdapter';
import { GameplaySystems } from '../systems/GameplaySystems';
import { PerformanceOverlay } from '../ui/PerformanceOverlay';
import { ControlsHud } from '../ui/ControlsHud';
import { GateMetricRecorder } from '../tools/GateMetricRecorder';
import { LoadingTimer } from '../tools/LoadingTimer';
import { STARTING_CANYON_LAYOUT } from '../world/startingCanyonLayout';
import { MetaLoop } from '../meta/MetaLoop';
import { PROVISIONAL_CREDIT_LOSS_ON_DESTROYED_RATIO } from '../meta/provisionalEconomy';
import { defaultSaveStore } from '../meta/save/SaveStore';
import { loadUpgradeCatalog } from '../tools/upgradeCalculator';
import { WebAudioSystem } from '../audio/WebAudioSystem';
import { AudioCueRouter } from '../audio/AudioCueRouter';
import {
  AudioSystemAdapter,
  SaveBridge,
  SortieEconomyBridge,
  UpgradeState,
  deriveEffectiveParams,
} from './PveIntegration';
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
  private controlsHud: ControlsHud | null = null;
  private metaLoop: MetaLoop | null = null;
  /** 영구 업그레이드 단계 — 저장에서 복원, 유효 파라미터·외형 단계의 원천 */
  private upgrades: UpgradeState | null = null;
  /** 재출항 세션 초기화를 위해 조립부가 보관하는 참조 */
  private gameplay: GameplaySystems | null = null;
  /** 업그레이드 반영 유효 파라미터 (params 원본의 파생 복사본) */
  private effectiveParams: GameParams | null = null;
  /** 조립부가 건 EventBus 구독 해제 함수 — stop()에서 전부 해제한다 */
  private readonly unsubscribes: Array<() => void> = [];

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
    // D+5 회색 박스 장면 — BootstrapScene 별칭은 INT-RENDER-001 승인으로 정리됨.
    // 레이아웃은 게임플레이 충돌과 같은 단일 인스턴스를 명시 주입한다 (INT-CORE-004).
    const scene = new CanyonScene(this.renderer, STARTING_CANYON_LAYOUT);
    this.sceneManager.setActive(scene);

    this.recorder = new GateMetricRecorder(this.bus, this.loadingTimer);
    if (PerformanceOverlay.shouldShow()) {
      this.overlay = new PerformanceOverlay(this.container, this.bus, {
        loadingTimer: this.loadingTimer,
        recorder: this.recorder,
        rendererInfo: () => this.renderer?.describe() ?? '',
      });
    }

    const gameplay = this.composeSystems(params, scene);
    this.registry.initializeAll({
      bus: this.bus,
      params,
      stateMachine: this.stateMachine,
    });

    // 조작 안내·Pointer Lock·화면 버튼 HUD (툴링·UI 소유 — src/ui/ControlsHud.ts).
    // 일시정지는 루프 정지/재개로 연결한다. 전투 입력은 마우스(MouseCombatInput)와
    // 같은 gameplay.aim 단일 진입점을 호출한다 (INT-CORE-002 — 별도 전투 시스템 금지,
    // 배선은 이 composition root에서만. INTEGRATION_NOTES INT-TOOL-002).
    this.controlsHud = new ControlsHud(this.container, canvas, {
      setPaused: (paused) => (paused ? this.loop.stop() : this.loop.start()),
      combat: { aim: gameplay.aim, torpedo: gameplay.torpedo },
      bus: this.bus,
      // 기지 → 출항. 상태 전이는 상위 메타 루프 소유이며 HUD는 요청만 한다
      // (기지 화면 UI가 도입되면 그 화면의 출항 버튼으로 대체된다).
      launchSortie: () => {
        if (this.metaLoop?.metaState !== 'BASE') return;
        this.metaLoop.beginSortiePrep();
        this.metaLoop.launchSortie();
      },
    });

    window.addEventListener('resize', this.handleResize);
    this.handleResize();

    // 개발 모드 한정 통합 검증용 읽기 전용 핸들 — 실제 인스턴스를 그대로 노출한다
    // (더미 상태 소스 아님). 프로덕션 번들에서는 제거된다. InputTelemetry의
    // __deepDiveInput과 같은 관례 (D+10 통합 브라우저 검증에서 사용).
    if (import.meta.env.DEV) {
      (globalThis as unknown as Record<string, unknown>)['__deepDiveDebug'] = {
        pose: gameplay.poseSource,
        cargo: gameplay.cargoShipState,
        aim: gameplay.aim,
        torpedo: gameplay.torpedo,
        layout: gameplay.layout,
        camera: this.renderer.camera,
        meta: this.metaLoop,
      };
    }

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
   *  - 파트 간 통신은 EventBus로만. 구현체 간 직접 참조(포즈 주입 등)는
   *    이 composition root에서만 잇는다 — 각 파트 코드끼리는 서로 모른다.
   *  - params 외 의존성(렌더러·장면 등)은 이 지점에서 생성자 주입한다.
   *  - src/core는 공통 보호 파일 — 등록 추가는 feat→dev 병합 시 리드가 배선한다.
   *
   * 현재 배선 (INT-GAME-002·INT-RENDER-001·INT-CORE-006·007 반영):
   *  ⓪ metaLoop    — 상위 메타 루프 (기지→출항→정산, 리드 — 하위 세션은
   *                  SortieSessionPort 어댑터 경유만)
   *  ① gameplay    — WASD 이동·관성, Shift/Ctrl 심도 3층 (입력·조작)
   *  ② cameraInput — 마우스 궤도 회전·Space 리센터 (렌더 소유 카메라 입력)
   *  장면(CanyonScene)은 시스템이 아니라 SceneManager가 관리하며, 잠수함
   *  포즈는 게임플레이의 읽기 전용 상태를 여기서 1회 주입한다. 렌더는
   *  판정·이동을 계산하지 않는다.
   */
  /** 조립부 구독 등록 — stop()에서 일괄 해제 */
  private registerUnsubscribe(off: () => void): void {
    this.unsubscribes.push(off);
  }

  private composeSystems(params: GameParams, scene: CanyonScene): GameplaySystems {
    // ⓪ 상위 메타 루프 (리드 소유, src/meta — INT-CORE-006·007).
    //    하위 해역 세션은 SortieSessionPort 어댑터로만 접촉한다 (통신 3종 제한).
    //    이 어댑터가 계층 경계의 유일한 구현 지점이다 — 상위는 하위 내부 상태를
    //    읽지 않고, 하위는 상위의 존재를 모른다.
    const sessionPort = {
      // ① 세션 시작 — 초회 출항은 부트 전환. 재출항 시 하위 세션 재초기화는
      //   게임플레이 세션 리셋 API 합류 후 이 어댑터만 확장한다 (INT-CORE-007
      //   적용 요청 — CURRENT_STATUS). RESULT→DEPARTURE 재시작 전환은 허용표 기존안.
      start: (): void => {
        // 재출항이면 하위 전투 세션을 먼저 초기화한다 (이전 출항의 위치·
        // 잔탄·드롭이 이월되지 않게). 초회 출항에서는 갓 생성된 상태라 무해.
        const gameplay = this.gameplay;
        if (gameplay) gameplay.resetSortieSession(this.effectiveParams ?? params);
        if (this.stateMachine.state === 'BOOT') {
          // 첫 렌더 완료 후 호출됨 — 부트 완료 전환을 상위 루프가 소유한다
          this.stateMachine.transition('DEPARTURE');
        } else if (this.stateMachine.canTransition('DEPARTURE')) {
          this.stateMachine.transition('DEPARTURE');
        }
      },
      // ③ 중도 귀환 — 하위 세션 정리 후 결과를 상위로 보고한다.
      //   중도 귀환은 'aborted' (획득 크레딧은 손실 없이 확정 — 손실은
      //   'destroyed'에만 적용된다, settlement.ts).
      requestReturnToBase: (): void => {
        this.metaLoop?.settleSortie({ outcome: 'aborted' });
      },
    };
    this.metaLoop = new MetaLoop(this.bus, sessionPort, {
      // ⚠ R7 임시값 — params/economy.json 이관 대기 (INT-CORE-007)
      creditLossOnDestroyedRatio: PROVISIONAL_CREDIT_LOSS_ON_DESTROYED_RATIO,
    });
    this.registry.register(this.metaLoop);

    // ⓪-b 저장 복원 — 부팅 시 1회, BASE 상태에서만. 저장 코드가 메타 상태
    //     머신을 조작하지 않도록 복원은 여기(조립부)에서만 수행한다.
    const loaded = defaultSaveStore.load();
    const catalog = loadUpgradeCatalog();
    this.upgrades = new UpgradeState(catalog, loaded.data.upgradeLevels);
    this.metaLoop.restoreWallet({
      credits: loaded.data.credits,
      rareParts: loaded.data.rareParts,
    });
    console.info(
      `[Game] 세이브 로드: ${loaded.source}${loaded.recovered ? ' (백업 복구)' : ''} — ` +
        `크레딧 ${loaded.data.credits} · 희귀 부품 ${loaded.data.rareParts}`,
    );

    // ⓪-c 업그레이드 배율 → 유효 파라미터. params 원본은 불변이며 파생
    //     복사본만 하위 시스템에 주입한다 (JSON 역기록 금지).
    const effectiveParams = deriveEffectiveParams(params, this.upgrades.modifiers);
    this.effectiveParams = effectiveParams;

    // ① 입력·조작 — 게임플레이. 개발 모드 params 핫리로드는 승인된 로더의
    //    onParamsReloaded를 주입해 유효 값 교체만 허용한다 (JSON 역기록 없음).
    //    협곡 레이아웃은 장면과 같은 STARTING_CANYON_LAYOUT 단일 인스턴스 주입.
    //    업그레이드 반영 유효 파라미터를 주입한다 — 핫리로드 시에도 같은
    //    파생 규칙을 다시 적용해야 하므로 구독을 감싼다.
    const gameplay = new GameplaySystems(
      this.bus,
      effectiveParams,
      (listener) =>
        onParamsReloaded((reloaded) =>
          listener(deriveEffectiveParams(reloaded, this.upgrades?.modifiers ?? {})),
        ),
      STARTING_CANYON_LAYOUT,
    );
    this.registry.register(gameplay);
    this.gameplay = gameplay;

    // ①-b 장비 배율 — 공식 UpgradeModifiers(계약)를 장비 시스템의 로컬
    //     보정 형태로 변환해 주입한다. 어뢰 속도 보정에 대응하는 공식
    //     스탯이 없어(7항목 상한) 0으로 둔다 — 장비 기능은 유지된다.
    gameplay.equipment.setUpgradeModifiers({
      torpedoSpeedBonus: 0,
      torpedoDamageBonus: this.upgrades?.modifiers.torpedoDamage ?? 0,
    });

    // ②-a 경제 → 공식 이벤트 브리지 (lootDropped·guardShipRequested).
    //     게임플레이 뒤에 등록해 같은 프레임의 드롭·요청을 흘린다.
    this.registry.register(new SortieEconomyBridge(gameplay.economy));

    // ②-b 저장 브리지 — saveRequested(리드 발행) 구독 → SaveStore 기록.
    //     주기 저장 없음: 정산 확정·희귀 부품 획득 두 시점만.
    const metaLoop = this.metaLoop;
    const upgrades = this.upgrades;
    this.registry.register(
      new SaveBridge(
        defaultSaveStore,
        {
          get wallet() {
            return metaLoop.wallet;
          },
          get upgradeLevels() {
            return upgrades.currentLevels;
          },
          get equippedGear() {
            return gameplay.equipment.slots.filter((slot) => slot !== null);
          },
        },
        loaded.data,
      ),
    );

    // ④ 표현 연동 — 렌더 소유 카메라 입력(회전·리센터). 이동키와 중복 없음.
    this.registry.register(new CameraInputAdapter(scene.cameraRig));

    // ④-b 오디오 배관 (툴링 소유). 사운드 세트(D+10) 도착 전까지 무음이며,
    //     조준·경제·기지 큐 라우팅 경로만 살아 있다. 판정 타이밍은 여기 없다.
    const audio = new WebAudioSystem();
    this.registry.register(new AudioSystemAdapter(audio, new AudioCueRouter(audio, this.bus)));

    // 구현체 간 직접 참조는 composition root에서만 잇는다:
    //  - 읽기 전용 잠수함 포즈 (positionX/Y/Z·heading·부호 있는 forwardSpeed)
    //  - 화물선 상태 계약 소스 (INT-RENDER-005 — 렌더는 표현만, 시간축은 게임플레이)
    //  - EventBus (torpedoHit 폭발 연출 등 이벤트 구독용)
    scene.attachPoseSource(gameplay.poseSource);
    scene.attachCargoShipSource(gameplay.cargoShipState);
    scene.attachEventBus(this.bus);
    // 어뢰 모델·기포 항적 — 실제 발사 어뢰 상태를 그대로 소비한다
    // (INT-RENDER-006. 렌더는 스냅샷만 읽고 판정하지 않는다).
    scene.attachTorpedoSource(gameplay.torpedo);
    // 성장 외형 — 렌더에는 계산된 단계(1~3)만 전달한다. 렌더가 업그레이드
    // 수치·저장 데이터를 읽지 않는다 (INT-RENDER-007).
    const tiers = this.upgrades.visualTiers;
    scene.setSubmarineVisualTiers(tiers.hull, tiers.weapon);

    // 메타 상태 → 화면. BASE에서 기지 화면, 출항하면 해역 화면으로 돌아온다.
    // 정산(DEBRIEF)이 끝나면 기지로 복귀시킨다 — 정산 결과 화면(UI)이
    // 도입되면 그 화면의 '확인'이 completeDebrief를 대신 호출한다.
    this.registerUnsubscribe(
      this.bus.on('metaStateChanged', ({ next }) => {
        scene.setMetaBaseActive(next === 'BASE', this.upgrades?.visualTiers);
        if (next === 'DEBRIEF') {
          // 정산 확정 직후 기지 복귀 (별도 결과 화면 없음 — PvE 1차 통합)
          this.metaLoop?.completeDebrief();
        }
      }),
    );

    // HUD 전투 버튼 배선(start()에서 수행)을 위해 gameplay를 돌려준다.
    return gameplay;
  }

  stop(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.handleResize);
    for (const off of this.unsubscribes) off();
    this.unsubscribes.length = 0;
    this.controlsHud?.dispose();
    this.controlsHud = null;
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
      // 부트 완료 — 세션 시작은 상위 메타 루프를 경유한다 (BOOT→DEPARTURE
      // 전환은 SortieSessionPort 어댑터가 수행). 기지 화면(그래픽·UI) 도입
      // 전까지는 자동 출항 — 도입 시 이 두 줄이 기지 UI 트리거로 대체된다.
      this.metaLoop?.beginSortiePrep();
      this.metaLoop?.launchSortie();
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
