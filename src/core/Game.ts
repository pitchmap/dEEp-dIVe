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
import type { EquipmentId } from '../systems/EquipmentSystem';
import { OFFICIAL_EQUIPMENT_IDS } from '../systems/economy/officialEconomyCatalog';
import { UpgradePurchaseSystem } from '../systems/economy/UpgradePurchaseSystem';
import { PurchaseTransaction } from '../meta/PurchaseTransaction';
import { EquipmentTransaction } from '../meta/EquipmentTransaction';
import { PerformanceOverlay } from '../ui/PerformanceOverlay';
import { ControlsHud } from '../ui/ControlsHud';
import { DetectionHud } from '../ui/DetectionHud';
import { EconomyHud } from '../ui/EconomyHud';
import { SortieFailureScreen } from '../ui/SortieFailureScreen';
import { SortieReturnScreen } from '../ui/SortieReturnScreen';
import { SurvivalHud } from '../ui/SurvivalHud';
import { SortiePrepScreen } from '../ui/SortiePrepScreen';
import { GateMetricRecorder } from '../tools/GateMetricRecorder';
import { LoadingTimer } from '../tools/LoadingTimer';
import { STARTING_CANYON_LAYOUT } from '../world/startingCanyonLayout';
import { STARTING_AREA_SALVAGE_PLACEMENTS } from '../world/salvagePlacements';
import { MetaLoop } from '../meta/MetaLoop';
import { defaultSaveStore } from '../meta/save/SaveStore';
import { loadEconomyParams } from '../tools/economyParams';
import { loadAimingParams } from '../tools/aimingParams';
import type { OfficialRuntimeParams } from '../contracts/officialParams';
import { GuardShipAdapter } from './GuardShipAdapter';
import { FloodingCore } from './FloodingCore';
import { PlayerHullSystem } from './PlayerHullSystem';
import { SortieFailureCoordinator } from './SortieFailureCoordinator';
import { PLAYER_ENTITY_ID } from '../contracts/guard';
import { createProductionDestroyerAIFactory } from './destroyerAiFactory';
import type { SurfaceShipMotionPortFactory } from '../contracts/guard';
import { WebAudioSystem } from '../audio/WebAudioSystem';
import { AudioCueRouter } from '../audio/AudioCueRouter';
import {
  AudioSystemAdapter,
  CountingSavePort,
  DepartureCommand,
  EquipmentJudgeAdapter,
  MetaUiAdapter,
  GuardIncidentLedger,
  GuardSpawnBridge,
  GuardSpawnCoordinator,
  NeutralIncidentBoundary,
  DebriefStateTracker,
  SaveBridge,
  SortieEconomyBridge,
  SortieSalvageSpawner,
  UpgradeState,
  createBaseScreenPort,
  deriveEffectiveParams,
} from './PveIntegration';
import type { BaseScreenPort } from '../contracts/meta';
import { EventBus } from './EventBus';
import { TorpedoTubeSocketRig } from './TorpedoTubeSocketRig';
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
  /** 선수 발사관 소켓 — 조준 카메라·어뢰 생성의 단일 소스 (INT-CORE-008·009) */
  private tubeSockets: TorpedoTubeSocketRig | null = null;
  /** production 기지 화면 포트 — UI·HUD의 유일한 명령 진입점 (INT-CORE-010) */
  private baseScreen: BaseScreenPort | null = null;
  /** 계측 가능한 저장 포트 — 명령당 호출 횟수 검증용 (저장 책임 표) */
  private savePort: CountingSavePort | null = null;
  /** 공식 런타임 params 번들 — 로더 호출은 composeSystems 1회뿐 (INT-CORE-011) */
  private officialParams: OfficialRuntimeParams | null = null;
  /** 출항당 1회 salvage 스포너 — 좌표는 SalvagePlacementSource 전용 */
  private salvageSpawner: SortieSalvageSpawner | null = null;
  /** 경비 사건 중복 방지 원장 — 요청·스폰 공용 단일 저장소 (INT-CORE-012) */
  private guardLedger: GuardIncidentLedger | null = null;
  /** 경비함 어댑터 — 기존 구축함 AI 위임 (신규 AI 코어 없음) */
  private guardAdapter: GuardShipAdapter | null = null;
  /** 경비함 생성 포트 — 위치 전략·AI 팩토리 연결 지점 */
  private guardSpawn: GuardSpawnCoordinator | null = null;
  /** 플레이어 선체 공용 코어 — 피해 수신 단일 창구 (INT-CORE-014) */
  private playerHull: PlayerHullSystem | null = null;
  /** 침수 결정적 코어 — 선체와 연계, 수치는 params 주입 */
  private floodingCore: FloodingCore | null = null;
  /** 출항 실패 조정자 — 파괴 1회 = 정산 1회 */
  private sortieFailure: SortieFailureCoordinator | null = null;
  /** DEBRIEF 읽기 모델 — 정산·실패 화면의 유일한 데이터 소스 (C6·C7) */
  private debriefState: DebriefStateTracker | null = null;
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
      // 출항 진입점은 기지 화면(SortiePrepScreen → BaseScreenPort.
      // confirmDeparture) **하나만** 노출한다 — 기지 화면 UI가 production에
      // 마운트됐으므로 HUD의 구 출항 버튼은 대체 완료 (INT-RENDER-010 §6
      // 중복 진입점 정리, 리드 주석의 예정된 대체 조건 충족).
      // launchSortie 미주입 → HUD 출항 버튼 항상 숨김.
    });

    // 부팅 시 초기 메타 상태 방송 (previous=null 규약) — 최초 전이 전에는
    // metaStateChanged가 발행되지 않으므로 기지 화면·HUD 버튼 표시를 여기서
    // 동기화한다 (자동 출항 없이 게임은 기지에서 시작한다).
    this.bus.emit('metaStateChanged', {
      previous: null,
      next: this.metaLoop?.metaState ?? 'BASE',
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
        // PvE 통합 검증용 추가 핸들 (읽기 전용 실제 인스턴스)
        bus: this.bus,
        depth: gameplay.depth,
        economy: gameplay.economy,
        equipment: gameplay.equipment,
        upgrades: this.upgrades,
        effectiveParams: this.effectiveParams,
        tubeSockets: this.tubeSockets,
        baseScreen: this.baseScreen,
        savePort: this.savePort,
        officialParams: this.officialParams,
        salvageSpawner: this.salvageSpawner,
        guardAdapter: this.guardAdapter,
        playerHull: this.playerHull,
        debrief: this.debriefState,
        flooding: this.floodingCore,
        sortieFailure: this.sortieFailure,
        guardSpawn: this.guardSpawn,
        guardLedger: this.guardLedger,
        // 스프린트 B 실측용 읽기 전용 핸들 (실제 인스턴스 — 더미 아님).
        // 목록은 **접근 시점에 평가**되도록 getter로 노출한다 — 부팅 시점
        // 스냅샷을 박아 두면 스폰 이후 상태를 관측할 수 없다.
        get ships() {
          return gameplay.ships;
        },
        shipWorldSource: gameplay.shipWorldSource,
        shipIdentification: gameplay.shipIdentification,
        get patrolFleet() {
          return gameplay.patrolShips;
        },
        highValueTransport: gameplay.highValueTransport,
        scene,
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
    // ⓪-pre 공식 런타임 params (INT-CORE-011) — 툴링 로더를 **여기서만,
    //   각 1회** 호출해 번들을 만들고 아래 소비자에 주입한다. 시스템·UI가
    //   JSON이나 로더를 직접 호출하는 것은 계약 위반이다
    //   (contracts/officialParams.ts — JSON → 시스템 단방향 주입).
    const official: OfficialRuntimeParams = {
      ...loadEconomyParams(),
      aiming: loadAimingParams(),
    };
    this.officialParams = official;
    console.info(
      '[Game] 공식 경제 params 로드·검증 완료 (upgrades/equipment/economy/cargo + aiming) — ' +
        `손실률 ${official.economy.creditLossOnDestroyedRatio} · salvage 배치 ${official.economy.salvageSpawns.length}건`,
    );

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
        // 출항 월드 초기화 — salvage 확정 배치 (INT-CORE-011 production spawn
        // 규칙: 출항당 1회, 보상=economy params·좌표=SalvagePlacementSource.
        // 배치 미연결이면 임시 좌표를 만들지 않고 unwired로 기록만 한다).
        // 경비 사건 원장은 출항 경계에서 비운다 — 이전 출항의 상관 id가
        // 새 출항의 같은 표적 사건을 삼키지 않게 한다 (INT-CORE-012).
        this.guardLedger?.resetForNewSortie();
        // 출항 한정 생존 상태 초기화 — 선체·침수·중복 원장·실패 처리 이력.
        // 지갑·업그레이드·loadout(영구분)은 건드리지 않는다 (INT-CORE-014).
        this.playerHull?.resetForNewSortie();
        this.sortieFailure?.resetForNewSortie();
        const spawnReport = this.salvageSpawner?.beginSortie();
        if (spawnReport) {
          if (spawnReport.status === 'spawned') {
            console.info(`[Game] salvage ${spawnReport.count}개 배치 완료 (economy.salvageSpawns)`);
          } else if (spawnReport.status === 'unwired') {
            console.warn(
              '[Game] SalvagePlacementSource 미연결 — salvage 미생성 (그래픽스 배치 대기, INT-CORE-011)',
            );
          } else if (spawnReport.status === 'rejected') {
            console.error(`[Game] salvage 결합 거부 — 생성 0건: ${spawnReport.message}`);
          }
        }
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
      // 공식 params 소비 (INT-CORE-011) — provisional 이관 완료 [6차 결의 7: 0.5]
      creditLossOnDestroyedRatio: official.economy.creditLossOnDestroyedRatio,
    });
    this.registry.register(this.metaLoop);

    // ⓪-b 저장 복원 — 부팅 시 1회, BASE 상태에서만. 저장 코드가 메타 상태
    //     머신을 조작하지 않도록 복원은 여기(조립부)에서만 수행한다.
    const loaded = defaultSaveStore.load();
    const catalog = official.upgrades;
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
    //    공식 경제·화물선·장비 params는 위에서 1회 로드한 번들을 **생성자 1회
    //    주입**으로 넘긴다 (INT-CORE-011 단일 진입점 — 시스템이 JSON이나 툴링
    //    로더를 직접 부르지 않는다. `attachOfficialParams()`는 생성자에서 못
    //    받은 경우의 대체 경로이며, 여기서 이중 주입하지 않는다).
    const gameplay = new GameplaySystems(
      this.bus,
      effectiveParams,
      (listener) =>
        onParamsReloaded((reloaded) =>
          listener(deriveEffectiveParams(reloaded, this.upgrades?.modifiers ?? {})),
        ),
      STARTING_CANYON_LAYOUT,
      official,
    );
    this.registry.register(gameplay);
    this.gameplay = gameplay;

    // ①-a1 저장 loadout 복원 (부팅 1회 — 저장 책임 표).
    //     'fresh' = 저장 데이터 자체가 없음 → null을 넘겨 공식 시작 장비를
    //     부여한다. 저장이 있으면 배열을 그대로 넘긴다 — **빈 배열은 '전부
    //     해제'라는 명시적 저장**이므로 기본 어뢰를 되돌려 주지 않는다
    //     (새로고침마다 장비가 되살아나던 문제의 원인). 공식 4종에 없는 id는
    //     여기서 걸러 낸다 (5번째 장비 금지).
    gameplay.restoreSavedLoadout(
      loaded.source === 'fresh'
        ? null
        : loaded.data.equippedGear.filter((id): id is EquipmentId =>
            (OFFICIAL_EQUIPMENT_IDS as readonly string[]).includes(id),
          ),
    );

    // ①-a2 선수 발사관 소켓 (INT-CORE-008·009 — 스프린트 A 최종 조립 기준).
    //     조준 카메라(그래픽스)와 어뢰 생성(게임플레이)이 **하나의 인스턴스**를
    //     소비해야 십자선 = 탄도가 구조적으로 보장된다 (7차 결의 1-① 단일 앵커,
    //     개별 오프셋 계산 금지). 정본은 게임플레이가 조립 시 생성하고
    //     `attachFineAimSource(aim)`까지 마친 `gameplay.torpedoTubeSocket`이다 —
    //     조립부는 그 참조를 그대로 쓴다. 여기서 rig를 다시 만들면 미세각이
    //     연결되지 않은 두 번째 인스턴스가 생겨 조준 카메라 pitch가 어뢰를
    //     따라가지 못한다 (스프린트 A 런타임 실측 결함).
    this.tubeSockets = gameplay.torpedoTubeSocket;

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

    // ②-a2 해저 재화 스포너 (INT-CORE-011) — economy.salvageSpawns(보상)와
    //     SalvagePlacementSource(좌표, 월드·그래픽스 소유)를 spawnId로 결합해
    //     게임플레이 spawn 어댑터를 호출한다. 좌표는 여기서 만들지 않는다 —
    //     그래픽스 배치 구현체 도착 시 attachPlacementSource로 연결한다
    //     (그 전까지 명시적 unwired: 출항 시 경고 로그, salvage 미생성).
    //     결합 entry는 **통째로** 게임플레이 진입점에 넘긴다 — spawnId가
    //     넘어와야 게임플레이 측 중복·회수 후 재생성 거부가 작동한다.
    this.salvageSpawner = new SortieSalvageSpawner(official.economy, {
      spawnSalvageFromPlan: (entry) => gameplay.spawnSalvageFromPlan(entry),
    });
    //     월드·그래픽스 배치 연결 (INT-RENDER-010): 좌표 전용 소스 —
    //     보상(credits·rareParts)은 economy params에만 있고 배치에는 없다.
    //     spawnId 결합·검증은 composeSalvageSpawnPlan이 수행한다.
    this.salvageSpawner.attachPlacementSource(STARTING_AREA_SALVAGE_PLACEMENTS);

    // ②-a3 중립 사건 → 경비함 스폰 경계 (INT-CORE-012 — 스프린트 B 선행개발).
    //     중복 방지 저장소는 이 원장 **하나뿐**이다: 경비 요청(상관 id)과
    //     스폰(요청 id)이 같은 원장을 공유한다. 시스템 내부에 별도 중복
    //     표를 두지 않는다.
    //     경비함 AI는 **기존 구축함 AI 재사용**이며 신규 AI 코어는 없다 —
    //     A 스택에 DestroyerAI 구현체가 아직 없으므로 팩토리·위치 전략
    //     모두 명시적 미연결 상태다(임의 좌표·대체 AI 생성 금지). 각각
    //     `attachFactory` / `attachLocationStrategy` 한 줄로 연결된다.
    const guardLedger = new GuardIncidentLedger();
    this.guardLedger = guardLedger;
    const guardAdapter = new GuardShipAdapter(null);
    this.guardAdapter = guardAdapter;
    const guardSpawn = new GuardSpawnCoordinator(guardLedger, guardAdapter, null);
    this.guardSpawn = guardSpawn;
    //     스폰 위치 전략 — 월드 지식(협곡 bounds·지형·사건 위치·플레이어
    //     선체 회피)이 필요하므로 게임플레이·월드 소유 정본을 연결한다.
    //     **정확히 1회** 호출. 원점·플레이어 위치 fallback을 두지 않는다 —
    //     전략이 자리를 못 찾으면 `noSpawnLocation`으로 끝나야 한다.
    guardSpawn.attachLocationStrategy(gameplay.guardSpawnLocation);
    //     범용 구축함 AI 팩토리 (INT-CORE-013 — B5 개정). 판단은 리드 소유
    //     `DestroyerAIController`(production 유일 구현체), 실제 이동은
    //     게임플레이 소유 `SurfaceShipMotionPort`다. 이동 포트 팩토리가
    //     도착했으므로 게임플레이 production 팩토리(`PatrolShipFleet`)를 그대로
    //     연결한다 — 테스트 더블 없음. 팩토리는 스폰마다 독립 `PatrolShipEntity`
    //     와 그 entity에 붙은 포트를 만들며, AI는 transform을 소유하지 않는다
    //     (pose 정본 = 게임플레이 entity 하나).
    const surfaceMotionPorts: SurfaceShipMotionPortFactory =
      gameplay.surfaceShipMotionPortFactory;
    guardAdapter.attachFactory(createProductionDestroyerAIFactory(surfaceMotionPorts));
    //     경비함 등장 방향 표시(B5) — **실제 스폰 결과만** 렌더에 넘긴다.
    //     스폰이 차단된 동안(위치 전략·AI 팩토리 미연결) 목록은 비어 있고
    //     마커도 뜨지 않는다: 존재하지 않는 경비함을 가리키지 않는다.
    const guardSightings: Array<{
      requestId: string;
      worldPosition: { x: number; y: number; z: number };
    }> = [];
    guardSpawn.attachSpawnListener((handle) => {
      guardSightings.push({
        requestId: handle.requestId,
        // 실제 스폰 좌표 그대로 — 렌더가 위치를 추정하지 않는다.
        // 경비함은 수상 전투함이므로 표시 높이는 해수면 기준이다.
        worldPosition: {
          x: handle.spawnPosition.x,
          y: STARTING_CANYON_LAYOUT.seaSurfaceY,
          z: handle.spawnPosition.z,
        },
      });
    });
    scene.attachGuardSightingSource({
      get sightings() {
        return guardSightings;
      },
    });

    this.registry.register(new NeutralIncidentBoundary(guardLedger));
    this.registry.register(new GuardSpawnBridge(guardSpawn));
    // ③ AI 그룹 — 스폰된 기존 구축함 AI들의 수명주기 전달만 담당한다.
    this.registry.register(guardAdapter);

    // ②-b 생존 계통 (INT-CORE-014 — 스프린트 C 공용 코어).
    //     선체는 **피해 수신의 단일 창구**다: 게임플레이 피해 source(폭뢰·
    //     충돌·압력)는 전부 이 포트를 통과하며, 중복 방지·차감·전이·파괴
    //     판정이 한 트랜잭션 경계 안에서 일어난다.
    //     선체 기준값·침수 수치는 **공식 params에 아직 없다**(C9 [COMBAT]
    //     이관 대상) — 주입 전까지 unwired 상태이며 피해가 적용되지 않고
    //     임시 수치도 만들지 않는다. 도착 시 attachHullParams·attachParams
    //     두 줄로 연결된다.
    const floodingCore = new FloodingCore(null);
    this.floodingCore = floodingCore;
    const playerHull = new PlayerHullSystem(PLAYER_ENTITY_ID, floodingCore, null);
    this.playerHull = playerHull;
    // hullIntegrity 업그레이드 소비 — 배율은 공식 승인값, 기준값은 대기.
    playerHull.applyHullIntegrityModifier(this.upgrades?.modifiers.hullIntegrity ?? 0);
    this.registry.register(playerHull);
    //     [배선 대기 — 게임플레이 attach API] PatrolShipFleet의
    //     isTargetAlive(PLAYER_ENTITY_ID)는 현재 항상 true다. 게임플레이가
    //     attachPlayerAliveSource(source: PlayerAliveSource)를 제공하면
    //     여기서 `gameplay.attachPlayerAliveSource(playerHull)` 1줄로 연결한다
    //     — 파괴 후 추적·공격 요청이 멈춘다 (INT-CORE-015 §PlayerAliveSource).

    // ①-c 업그레이드 구매 판정 시스템 (게임플레이 소유 — 조립부가 공식
    //     카탈로그와 실지갑 읽기 단면을 주입한다). **단계의 단일 저장소** —
    //     저장·UI·유효 파라미터가 전부 이 시스템의 levelSnapshot에서 파생된다.
    //     비용 resolver는 공식 params만 사용 — provisional 기본값을 쓰지
    //     않는다. null(미확정)은 BaseScreenPort가 트랜잭션 진입 전에
    //     economyDataUnavailable로 차단하므로 여기 방어 분기는 도달 불가
    //     (도달 시 무한대 비용 = 구매 거부로 수렴, 상태·저장 무변경).
    const metaLoop = this.metaLoop;
    const upgradePurchase = new UpgradePurchaseSystem(
      catalog.map((entry) => ({
        id: entry.id,
        maxLevel: entry.maxLevel,
        // 판정 경로에서는 미사용(보정 산출은 UpgradeState 소유) — 표기용 전달만
        bonusPerLevel: entry.effectBonus.find((value) => value !== null) ?? 0,
      })),
      {
        get credits() {
          return metaLoop.wallet.credits;
        },
        get rareParts() {
          return metaLoop.wallet.rareParts;
        },
        applyDelta: (creditsDelta: number, rarePartsDelta: number): void => {
          // 지갑 변경은 리드 PurchaseTransaction(WalletTransactionPort) 경유만 —
          // 이 경로가 호출되면 조립 규칙 위반이다 (지갑 불변 유지, 로그만).
          console.error(
            `[Game] applyDelta(${creditsDelta}, ${rarePartsDelta}) 직접 호출 감지 — 무시됨 (저장 책임 표)`,
          );
        },
      },
      (statId, nextLevel) => {
        const entry = catalog.find((candidate) => candidate.id === statId);
        const credits = entry?.costCredits[nextLevel - 1] ?? null;
        const rareParts = entry?.costRareParts[nextLevel - 1] ?? null;
        if (credits === null || rareParts === null) {
          return { credits: Number.POSITIVE_INFINITY, rareParts: Number.POSITIVE_INFINITY };
        }
        return { credits, rareParts };
      },
    );
    upgradePurchase.restoreLevels(loaded.data.upgradeLevels);
    // 장비 저장 포트는 연결하지 않는다 — 장비 저장은 리드 EquipmentTransaction
    // 한 곳(저장 책임 표, 이중 저장 금지). 내부 커밋 경로는 무저장으로 동작.
    gameplay.attachBaseEconomy(upgradePurchase, null);

    // ②-b 저장 브리지 — saveRequested(리드 발행: 정산·희귀 2종) 구독 →
    //     SaveStore 기록. 구매·장비·출항 저장은 아래 CountingSavePort를
    //     트랜잭션·Departure command가 직접 호출한다 (동일 명령 1회 보장).
    const upgrades = this.upgrades;
    const saveBridge = new SaveBridge(
      defaultSaveStore,
      {
        get wallet() {
          return metaLoop.wallet;
        },
        get upgradeLevels() {
          // 단일 저장소 = 판정 시스템의 확정 단계 (UpgradeState는 파생 뷰)
          return upgradePurchase.levelSnapshot;
        },
        get equippedGear() {
          return gameplay.equipment.slots.filter((slot) => slot !== null);
        },
      },
      loaded.data,
    );
    this.registry.register(saveBridge);

    // ②-c 출항 실패 조정자 (INT-CORE-014 — C6·C7·C8).
    //     파괴 1회 = 실패 1회 = 정산 1회. 손실 계산·지갑·상태 전이는 기존
    //     MetaLoop 정산 경로가, 저장은 기존 saveRequested('settlement') →
    //     SaveBridge 경로가 수행한다 — 코디네이터는 SavePort를 직접 호출하지
    //     않는다(저장 책임 표 A-12 유지). 저장 실패 시 DEBRIEF에 머물며
    //     재정산 없이 저장만 재시도한다.
    const sortieFailure = new SortieFailureCoordinator(metaLoop, saveBridge, () =>
      playerHull.markFailureSettled(),
    );
    this.sortieFailure = sortieFailure;
    this.registry.register(sortieFailure);

    // ②-c2 DEBRIEF 읽기 모델 (INT-CORE-015 — C6·C7 화면 분리). 그래픽스
    //     정산·실패 화면은 isDestroyed 추측이 아니라 이 모델만 소비한다:
    //     kind('returned'/'aborted'/'destroyed')·settlement·failure·
    //     saveStatus·canRetrySave. 재시도 명령은 sortieFailure.retrySave를
    //     조립부가 command로 감싸 제공한다(모델은 읽기 전용).
    const debriefState = new DebriefStateTracker(sortieFailure, saveBridge);
    this.debriefState = debriefState;
    this.registry.register(debriefState);

    // ②-c production 기지 경제 조립 (INT-CORE-010) — 저장 책임 단일화.
    //     savePort: 명령당 호출 횟수 계측 가능 (CountingSavePort.callCount).
    const savePort = new CountingSavePort({
      save: () => {
        saveBridge.writeSnapshot();
        return saveBridge.lastSaveSucceeded;
      },
    });
    this.savePort = savePort;
    const purchaseTx = new PurchaseTransaction(upgradePurchase, metaLoop, upgradePurchase, savePort);
    const equipmentTx = new EquipmentTransaction(new EquipmentJudgeAdapter(gameplay.equipment), savePort);
    const departure = new DepartureCommand(metaLoop, savePort);
    const baseScreen = createBaseScreenPort({
      meta: metaLoop,
      upgradeCatalog: catalog,
      equipmentCatalog: official.equipment,
      levelsOf: () => upgradePurchase.levelSnapshot,
      loadoutOf: () => gameplay.equipment.loadout,
      purchaseTx,
      equipmentTx,
      departure,
      // 구매 확정 후 파생 상태 갱신: 유효 파라미터(다음 출항부터 적용)·
      // 장비 배율·외형 단계. UpgradeState는 파생 뷰로만 동기화한다.
      onPurchaseCommitted: () => {
        upgrades.setLevels(upgradePurchase.levelSnapshot);
        // hullIntegrity 구매 반영 [INT-CORE-015 정책]: 최대치만 재계산 —
        // 진행 중 출항의 currentHull은 회복시키지 않으며, 효과는 다음 출항
        // 초기화(currentHull=maxHull)에서 적용된다.
        this.playerHull?.applyHullIntegrityModifier(upgrades.modifiers.hullIntegrity ?? 0);
        this.effectiveParams = deriveEffectiveParams(params, upgrades.modifiers);
        gameplay.equipment.setUpgradeModifiers({
          torpedoSpeedBonus: 0,
          torpedoDamageBonus: upgrades.modifiers.torpedoDamage ?? 0,
        });
        const tiers = upgrades.visualTiers;
        scene.setSubmarineVisualTiers(tiers.hull, tiers.weapon);
      },
    });
    this.baseScreen = baseScreen;

    // ②-d production 경제 UI 마운트 (그래픽스 소유 컴포넌트 — 조립부는 포트만
    //     주입한다. DOM·스타일 무접촉). QA 데모(econUiQaDemo)는 ?econdemo
    //     플래그 전용이며 이 production 경로에 포함되지 않는다.
    //     UI는 **BaseScreenPort v2 하나만** 소비한다 (읽기 모델·명령·lastResult
    //     전부 포트 경유) — 구계약 변환 어댑터(createMetaUiPorts)는 UI v2
    //     동기화로 불필요해져 제거했다 (INT-RENDER-010 §2).
    const economyHud = new EconomyHud(this.container);
    economyHud.attachBaseScreen(baseScreen);
    economyHud.attachMetaState(metaLoop);
    const prepScreen = new SortiePrepScreen(this.container);
    prepScreen.attachBaseScreen(baseScreen);
    //     슬롯 위치 뷰 — v2 loadout.equipped는 빈 슬롯이 압축돼 실제 슬롯
    //     인덱스를 복원할 수 없다. 슬롯 지정 명령(equipItem·unequipItem)이
    //     실제 인덱스를 받으므로 읽기 전용 위치 뷰를 함께 준다
    //     (계약 편입 요청: INT-RENDER-010).
    prepScreen.attachSlotPositions(gameplay.equipment);
    this.registry.register(new MetaUiAdapter([economyHud, prepScreen]));

    // ②-e 스프린트 C HUD·정산 화면 마운트 (그래픽스 소유 — INT-RENDER-012).
    //     전부 리드 read model 소비 전용이다: DetectionHudView·
    //     TrackingStateSource(게임플레이 도착 시 attach 2줄)·
    //     SurvivalReadModel(playerHull)·DebriefReadModel(debriefState).
    const detectionHud = new DetectionHud(this.container);
    //     [배선 대기 — 게임플레이 DetectionSystem·TrackingStateSource]
    //     도착 시: detectionHud.attachDetectionSource(gameplay.detection);
    //             detectionHud.attachTrackingSource(gameplay.trackingState);
    //     그 전까지 HUD는 '탐지 계기 미연결'을 표시한다 (위장 없음).
    const survivalHud = new SurvivalHud(this.container);
    survivalHud.attachSource(playerHull, () => playerHull.consumeDamageFlash());
    const rendererCamera = this.renderer?.camera ?? null;
    survivalHud.attachViewContext({
      get headingRadians() {
        return gameplay.poseSource.headingRadians;
      },
      get cameraForwardX() {
        // 카메라 월드 -Z축 (matrixWorld 3열) — three 스크래치 객체 불필요
        return -(rendererCamera?.matrixWorld.elements[8] ?? 0);
      },
      get cameraForwardZ() {
        return -(rendererCamera?.matrixWorld.elements[10] ?? 1);
      },
    });

    //     실패·귀환 화면 — 데이터 소스와 컴포넌트가 모두 분리돼 있다 (C7).
    //     재시도 command = 리드 retrySave 래퍼 (재정산 없음 — 저장만),
    //     확인 command = completeDebrief (구 자동 호출을 이 버튼이 대체).
    const failureScreen = new SortieFailureScreen(this.container);
    failureScreen.attach(debriefState, () => {
      sortieFailure.retrySave(() => {
        saveBridge.writeSnapshot();
        return saveBridge.lastSaveSucceeded;
      });
    });
    const returnScreen = new SortieReturnScreen(this.container);
    returnScreen.attach(debriefState, metaLoop, () => metaLoop.completeDebrief());

    this.registry.register({
      id: 'sprintCHud',
      initialize: () => {},
      update: (deltaSeconds: number) => {
        const inSortie = metaLoop.metaState === 'SORTIE';
        detectionHud.setVisible(inSortie);
        survivalHud.setVisible(inSortie);
        detectionHud.update();
        survivalHud.update(deltaSeconds);
        failureScreen.update();
        returnScreen.update();
      },
      dispose: () => {
        detectionHud.dispose();
        survivalHud.dispose();
        failureScreen.dispose();
        returnScreen.dispose();
      },
    });

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
    // 다중 선박(B1·B5) — 적대·중립 화물선 + 스폰된 경비함이 한 목록으로 온다.
    // 이 소스가 주입되면 렌더의 단일 화물선 경로를 **대체**하므로 적대
    // 화물선이 두 경로로 중복 렌더되지 않는다. 세력 변형 선택은 목록이 준
    // faction 값으로만 이뤄진다 (렌더가 모델·클래스 이름으로 추측 금지).
    scene.attachShipWorldSource(gameplay.shipWorldSource);
    // 식별 태그(B2) — 판정은 게임플레이 `ShipIdentificationSystem` 소유이고
    // 렌더는 read model만 표시한다. 미식별 상태에서는 세력 문자열이 나오지
    // 않는다(계약이 faction을 노출하지 않음).
    scene.attachIdentificationSource(gameplay.shipIdentification);
    // 호위 표현(B6 구조) — 고가치 수송선·결속 read model. 공식 params가 없어
    // production에서 목록은 비어 있고, 따라서 배지·결속선도 표시되지 않는다
    // (수치·개체를 지어내지 않는다).
    scene.attachConvoySource(gameplay.highValueTransport);
    scene.attachEventBus(this.bus);
    // 어뢰 모델·기포 항적 — 실제 발사 어뢰 상태를 그대로 소비한다
    // (INT-RENDER-006. 렌더는 스냅샷만 읽고 판정하지 않는다).
    scene.attachTorpedoSource(gameplay.torpedo);
    // 조준 카메라 소켓 — 어뢰 생성과 **같은 rig**를 넘긴다. 렌더는 위치·전방축을
    // 읽기만 하고 오프셋을 자체 계산하지 않는다 (2소켓 구조: aimCameraSocket /
    // torpedoSpawnSocket이 동일 앵커·동일 전방축, 안전 오프셋은 소켓 정의 1곳).
    scene.attachTorpedoTubeSocket(gameplay.torpedoTubeSocket);
    // 해저 재화 시각 — 게임플레이 배치 상태(읽기 전용)와 실제 회수 반경을
    // 그대로 넘긴다. 렌더는 판정·보상을 계산하지 않으며, 희귀 부품 포함
    // 여부를 사전에 노출하지 않는다 (INT-RENDER-010 §5).
    scene.attachSalvageSource(gameplay.economy, gameplay.economy.pickupRadiusMeters);
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
        // DEBRIEF 자동 완료는 제거됐다 — 정산 결과 화면이 도입되어
        // 귀환 화면의 '확인'(completeDebrief command)과 실패 화면의 저장
        // 성공 전환(SortieFailureCoordinator)이 기지 복귀를 소유한다
        // (리드 주석의 예정된 대체 — INT-RENDER-012).
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
      // 부트 완료 — 게임은 기지(BASE)에서 시작한다. 출항의 유일한 경로는
      // 기지 화면 출항 버튼 → BaseScreenPort.confirmDeparture(확정 직전
      // 저장 포함)다. 자동 출항 재도입 금지 (INT-RENDER-010 §6).
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
