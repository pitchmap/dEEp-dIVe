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
import { UpgradePurchaseSystem } from '../systems/economy/UpgradePurchaseSystem';
import { PurchaseTransaction } from '../meta/PurchaseTransaction';
import { EquipmentTransaction } from '../meta/EquipmentTransaction';
import { PerformanceOverlay } from '../ui/PerformanceOverlay';
import { ControlsHud } from '../ui/ControlsHud';
import { EconomyHud } from '../ui/EconomyHud';
import { SortiePrepScreen } from '../ui/SortiePrepScreen';
import { GateMetricRecorder } from '../tools/GateMetricRecorder';
import { LoadingTimer } from '../tools/LoadingTimer';
import { STARTING_CANYON_LAYOUT } from '../world/startingCanyonLayout';
import { MetaLoop } from '../meta/MetaLoop';
import { PROVISIONAL_CREDIT_LOSS_ON_DESTROYED_RATIO } from '../meta/provisionalEconomy';
import { defaultSaveStore } from '../meta/save/SaveStore';
import { loadEquipmentCatalog, loadUpgradeCatalog } from '../tools/upgradeCalculator';
import { WebAudioSystem } from '../audio/WebAudioSystem';
import { AudioCueRouter } from '../audio/AudioCueRouter';
import {
  AudioSystemAdapter,
  CountingSavePort,
  DepartureCommand,
  EquipmentJudgeAdapter,
  MetaUiAdapter,
  SaveBridge,
  SortieEconomyBridge,
  UpgradeState,
  createBaseScreenPort,
  createMetaUiPorts,
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
        // 출항의 유일한 경로 = Departure command (출항 확정 직전 저장 포함,
        // 저장 실패 시 전환 없음 — INT-CORE-010 저장 책임 표). 결과 표시는
        // SortiePrepScreen이 같은 baseScreen 포트로 수행한다.
        this.baseScreen?.confirmDeparture();
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
      equipmentCatalog: loadEquipmentCatalog(),
      levelsOf: () => upgradePurchase.levelSnapshot,
      loadoutOf: () => gameplay.equipment.loadout,
      purchaseTx,
      equipmentTx,
      departure,
      // 구매 확정 후 파생 상태 갱신: 유효 파라미터(다음 출항부터 적용)·
      // 장비 배율·외형 단계. UpgradeState는 파생 뷰로만 동기화한다.
      onPurchaseCommitted: () => {
        upgrades.setLevels(upgradePurchase.levelSnapshot);
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
    const uiPorts = createMetaUiPorts({
      baseScreen,
      rawCatalog: catalog,
      slotsOf: () => gameplay.equipment.slots,
    });
    const economyHud = new EconomyHud(this.container);
    economyHud.attachWalletSource(metaLoop);
    economyHud.attachSortieEarningsSource(uiPorts.earningsSource);
    const prepScreen = new SortiePrepScreen(this.container);
    prepScreen.attachWalletSource(metaLoop);
    prepScreen.attachUpgradePort(uiPorts.upgradePort);
    prepScreen.attachEquipmentPort(uiPorts.equipmentPort);
    prepScreen.attachDeparturePort(uiPorts.departurePort);
    this.registry.register(new MetaUiAdapter([economyHud, prepScreen]));

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
    // 조준 카메라 소켓 — 어뢰 생성과 **같은 rig**를 넘긴다. 렌더는 위치·전방축을
    // 읽기만 하고 오프셋을 자체 계산하지 않는다 (2소켓 구조: aimCameraSocket /
    // torpedoSpawnSocket이 동일 앵커·동일 전방축, 안전 오프셋은 소켓 정의 1곳).
    scene.attachTorpedoTubeSocket(gameplay.torpedoTubeSocket);
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
