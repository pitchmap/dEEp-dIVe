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
import { ExplorationHud } from '../ui/ExplorationHud';
import { InteractionPromptHud } from '../ui/InteractionPromptHud';
import { SortieFailureScreen } from '../ui/SortieFailureScreen';
import { SortieReturnScreen } from '../ui/SortieReturnScreen';
import { SurvivalHud } from '../ui/SurvivalHud';
import { SortiePrepScreen } from '../ui/SortiePrepScreen';
import { GateMetricRecorder } from '../tools/GateMetricRecorder';
import { LoadingTimer } from '../tools/LoadingTimer';
import { STARTING_CANYON_LAYOUT } from '../world/startingCanyonLayout';
import { STARTING_AREA_SALVAGE_PLACEMENTS } from '../world/salvagePlacements';
import { MetaLoop } from '../meta/MetaLoop';
import { BossProgressStore } from '../meta/BossProgressStore';
import { defaultSaveStore } from '../meta/save/SaveStore';
import { loadBossParams } from '../config/bossParamsLoader';
import { loadEconomyParams } from '../tools/economyParams';
import { loadAimingParams } from '../tools/aimingParams';
import { loadInteractionParams } from '../tools/interactionParamsLoader';
import { loadSonarParams } from '../tools/sonarParamsLoader';
import {
  BOSS_PLACEMENT,
  BOSS_WEAK_POINT_PLACEMENT,
  BOSS_ZONE,
} from '../world/bossPlacement';
import {
  BOSS_CLUE_PLACEMENTS,
  CLUE_ID_BY_INTERACTABLE,
} from '../world/bossCluePlacements';
import { BossController } from './BossController';
import type { BossPhasePort } from '../contracts/boss';
import type { BossPhase } from '../contracts/meta';
import type { InteractableTarget } from '../systems/interaction/InteractionSystem';
import type { SonarContact } from '../systems/sonar/SonarScopeSystem';
import { loadCombatParams, combatParamsFullyDefined, type CombatParamsResult } from '../tools/combatParamsLoader';
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
  BossVictoryBridge,
  GuardSpawnCoordinator,
  NeutralIncidentBoundary,
  DebriefConfirmCommand,
  DebriefStateTracker,
  EnemyAttackPortBinding,
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

/**
 * [M1·M2 Runtime Closure §5 순서 3·4] world 단서 배치 ↔ 공식 clueId 대조.
 *
 * 세 정본이 각자 옳아도 **서로 어긋나면** 단서가 조용히 안 오른다:
 * 배치(`BOSS_CLUE_PLACEMENTS`) · 매핑(`CLUE_ID_BY_INTERACTABLE`) ·
 * 해금 목록(`params/boss.json unlock.clueIds`). 조립부는 셋을 잇는 유일한
 * 지점이므로 여기서 한 번 대조하고, 어긋나면 **부팅을 중단**한다 —
 * 무시하고 진행하면 '3/3이 안 되는데 원인을 알 수 없는' 상태가 된다.
 * 값을 고치지 않는다(정본은 world·params이며 조립부는 읽기만 한다).
 */
function assertCluePlacementIntegrity(canonicalClueIds: readonly string[]): void {
  const fail = (reason: string): never => {
    throw new Error(`[Game] 단서 정본 불일치 — production 부팅 중단: ${reason}`);
  };
  const targetIds = BOSS_CLUE_PLACEMENTS.map((placement) => placement.targetId);
  const mappingKeys = Object.keys(CLUE_ID_BY_INTERACTABLE);
  const mappedClueIds = Object.values(CLUE_ID_BY_INTERACTABLE);

  if (targetIds.length !== canonicalClueIds.length) {
    fail(`배치 ${targetIds.length}개 ≠ 공식 단서 ${canonicalClueIds.length}종`);
  }
  if (new Set(targetIds).size !== targetIds.length) {
    fail(`targetId 중복: ${targetIds.join(', ')}`);
  }
  const missingMapping = targetIds.filter((targetId) => !(targetId in CLUE_ID_BY_INTERACTABLE));
  if (missingMapping.length > 0) fail(`매핑 누락 targetId: ${missingMapping.join(', ')}`);
  const strayMapping = mappingKeys.filter((key) => !targetIds.includes(key));
  if (strayMapping.length > 0) fail(`배치 없는 매핑 키: ${strayMapping.join(', ')}`);
  const unknownClue = mappedClueIds.filter((clueId) => !canonicalClueIds.includes(clueId));
  if (unknownClue.length > 0) fail(`공식 목록 밖 clueId: ${unknownClue.join(', ')}`);
  const uncovered = canonicalClueIds.filter((clueId) => !mappedClueIds.includes(clueId));
  if (uncovered.length > 0) fail(`매핑되지 않은 공식 clueId: ${uncovered.join(', ')}`);
}

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
  /** C9 전투 params 검증 결과 — 미확정은 null 유지 (INT-CORE-016) */
  private combatParams: CombatParamsResult | null = null;
  /** M2 단서·보스 해금 진행 정본 (INT-CORE-020) — 저장 progress 블록과 왕복 */
  private bossProgress: BossProgressStore | null = null;
  /** M1 보스 코어 — 스폰 허가 이후에만 존재한다 (조립부 factory 소유) */
  private bossController: BossController | null = null;
  /** production 스폰 성공 여부 — BossCoreView 노출·update 게이트 */
  private bossSpawned = false;
  /** 출항 경계 보스 런타임 정리 (조립부 factory 재사용 — 두 번째 출항 대비) */
  private disposeBossRuntimeForSortie: (() => void) | null = null;
  /** F 홀드 프롬프트 HUD — InteractionReadModel 표시 전용 (판정 무소유) */
  private interactionPromptHud: InteractionPromptHud | null = null;
  /** 탐사 안내 HUD — 단서 진행·표식 범례·보스 구역 상태 표시 전용 */
  private explorationHud: ExplorationHud | null = null;
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
  /** DEBRIEF 확인 command — BASE 복귀의 유일한 진입점 (INT-CORE-016) */
  private debriefConfirm: DebriefConfirmCommand | null = null;
  /** 적 공격 포트 바인딩 — 게임플레이 EnemyAttackCoordinator 연결 지점 */
  private enemyAttackBinding: EnemyAttackPortBinding | null = null;
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
    const composition = this;
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
        debriefConfirm: this.debriefConfirm,
        enemyAttackBinding: this.enemyAttackBinding,
        // C9 params 검증 결과 (읽기 전용) — 미확정 목록으로 unwired 근거를
        // 실측에서 확인한다. 이 핸들로 상태를 바꾸는 경로는 없다.
        combatParams: this.combatParams,
        bossProgress: this.bossProgress,
        gameplay,
        // [M1·M2 Runtime Closure] production composition 실제 상태만 노출한다.
        // 새 fixture·검수 명령을 만들지 않으며(관측 전용), 기기 식별자·개인정보를
        // 싣지 않는다. DEV 번들 한정이라 production 빌드에는 나타나지 않는다.
        runtimeClosure: {
          fixtureLoaded: false,
          get bossSpawned() {
            return composition.bossSpawned;
          },
          get bossView() {
            return composition.bossController?.view() ?? null;
          },
          get playerInBossZone() {
            return gameplay.isPlayerInBossZone();
          },
          bossProgress: this.bossProgress,
          clueTargetIds: BOSS_CLUE_PLACEMENTS.map((placement) => placement.targetId),
          clueIdByInteractable: CLUE_ID_BY_INTERACTABLE,
          bossZone: BOSS_ZONE,
          get interaction() {
            return gameplay.interactionReadModel();
          },
          get sonarScope() {
            return gameplay.sonarScopeReadModel();
          },
          requestActivePing: () => gameplay.requestActivePing(),
        },
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

    //    C9 전투 params (INT-CORE-016 §① — 툴링 로더 1회 호출). 미확정 필드는
    //    **null 그대로** 흘러가며 소비 측이 계약대로 unwired가 된다 — 조립부가
    //    기본값·0·임시 상수를 채우지 않는다. 소비자: 선체(기준값·임계)·침수·
    //    폭뢰 피해·탐지 튜닝.
    const combat = loadCombatParams();
    this.combatParams = combat;
    console.info(
      `[Game] C9 전투 params 로드·검증 완료 — 확정 여부 ${combatParamsFullyDefined(combat) ? '전량 확정' : '미확정 필드 존재(unwired 유지)'}`,
    );

    //    [M1·M2 Runtime Closure §5 순서 1·2] 나머지 공식 로더 3종.
    //    boss는 아래 ⓪-b2에서 이미 loadBossParams()로 1회 로드하고, 여기서는
    //    interaction·sonar를 툴링 공인 로더로 각 1회 부른다. farming은 이미
    //    로드한 economy 번들의 블록을 그대로 읽는다 — 같은 JSON을 두 번
    //    파싱하지 않는다. 어느 값도 조립부가 복제·보정·fallback 하지 않으며,
    //    null은 null 그대로 소비 측에 도달해 그 축만 unwired가 된다.
    const interactionParams = loadInteractionParams();
    const sonarParams = loadSonarParams();
    const farmingParams = official.economy.farming;
    console.info(
      `[Game] Runtime Closure params 로드·검증 완료 — interaction ${
        interactionParams.productionWired ? 'wired' : `unwired(${interactionParams.pendingFields.join(',')})`
      } · sonar 액티브핑 ${sonarParams.activePingWired ? 'wired' : 'unwired'}` +
        `/패시브방위 ${sonarParams.passiveBearingWired ? 'wired' : 'unwired'} · farming 상한 ${
          farmingParams?.capComputable ? '계산 가능' : '계산 불가(무지급)'
        }`,
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
        // 소음은 상시 연결된 속도 기반 소스가 공급한다 (INT-CORE-019 —
        // 구 고정 reportNoise(1) 폐기). 소스는 무상태(현재 속도 파생)라
        // 출항 경계에서 이월될 이전 소음 상태 자체가 없고, reset이 비운
        // reportedNoise는 null로 남아 환경 소스 경로가 계속 쓰인다.
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
        // [M1] 보스 런타임도 출항 경계에서 폐기한다 — 이전 출항의 controller가
        // 계속 돌거나 BossCoreView가 남지 않게. 게임플레이 쪽 출항 한정 상태
        // (개체·약점 등록·구역 edge)는 위 resetSortieSession이 이미 비웠고,
        // 다음 스폰 허가에서 같은 factory가 controller를 새로 만든다.
        this.disposeBossRuntimeForSortie?.();
        // 표시 전용 HUD도 출항 경계에서 접는다 — 이전 출항의 홀드 링·배너가
        // 새 출항에 남지 않게. 진행 수(단서 N/M)는 정본이 소유하므로 건드리지 않는다.
        this.interactionPromptHud?.reset();
        this.explorationHud?.reset();
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

    // ⓪-b2 M2 단서·보스 해금 진행 (INT-CORE-020/021) — 공인 보스 params
    //      로드는 composition root 1회. 진행 복원도 지갑과 같은 규약(부팅 1회).
    //      단서 진행의 정본(원장·중복 방지·저장 복원·해금·게이트)은
    //      BossProgressStore 하나다. interactableId→clueId 매핑·이벤트 발행은
    //      게임플레이 어댑터(무상태) 소유 — 여기서는 kind==='clue'의
    //      canonical `clueId`만 소비한다. `targetId`는 월드 interactable
    //      ID이므로 단서 ID로 해석하지 않는다 (현재 dev 발행자 0 —
    //      구독 배선은 계약대로 상시).
    const bossParams = loadBossParams();
    //      [§5 순서 3·4 선행] world 단서 정본 ↔ 공식 clueIds 대조. 불일치를
    //      조용히 무시하면 '진행이 안 오르는데 이유를 알 수 없는' 상태가 되므로
    //      부팅을 중단한다. 여기서 고치지 않는다 — 정본은 world·params다.
    assertCluePlacementIntegrity(bossParams.unlock.clueIds);
    const bossProgress = new BossProgressStore(
      {
        requiredClues: bossParams.unlock.requiredClues.value,
        clueIds: bossParams.unlock.clueIds,
      },
      this.bus,
    );
    bossProgress.restore(loaded.data.progress);
    this.bossProgress = bossProgress;
    this.registerUnsubscribe(
      this.bus.on('interactionCollected', (payload) => {
        if (payload.kind === 'clue') bossProgress.collectClue(payload.clueId);
      }),
    );
    // 격파 → 진행 기록 + 기존 lootDropped 보상 경로 (수치는 params/boss.json)
    this.registry.register(
      new BossVictoryBridge(bossProgress, {
        credits: bossParams.reward.credits.value,
        rareParts: bossParams.reward.rareParts.value,
      }),
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
    //     적 공격 포트 바인딩 (INT-CORE-016 — C4). AI는 attack 상태에서 이
    //     바인딩으로 **요청만** 넣는다. 게임플레이 C 브랜치 병합 시
    //     `enemyAttackBinding.attach(gameplay.enemyAttackPort)` 1줄로 연결되며,
    //     그 전까지 모든 요청은 unwired — 폭뢰 투하·피해 0건(즉시 피해 금지).
    const enemyAttackBinding = new EnemyAttackPortBinding();
    this.enemyAttackBinding = enemyAttackBinding;
    //     **C4 공격 사슬의 마지막 연결** — AI가 만든 EnemyAttackRequest가 이
    //     바인딩을 거쳐 게임플레이 `EnemyAttackCoordinator`로 간다. AI는
    //     피해량·반경·쿨다운을 소유하지 않고 요청만 생성한다.
    //     폭뢰 피해 params가 null이면 포트가 `unwired`를 돌려주므로 투하·
    //     피해가 0건으로 남는다 (즉시 피해·거리 무관 피해 금지).
    enemyAttackBinding.attach(gameplay.enemyAttackPort);
    guardAdapter.attachFactory(
      createProductionDestroyerAIFactory(surfaceMotionPorts, enemyAttackBinding),
    );
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
    //     C9 params 주입 — 검증기가 돌려준 값을 그대로 넘긴다. 미확정이면
    //     `null`이 그대로 들어가 선체·침수가 unwired로 남는다(피해 미적용).
    const floodingCore = new FloodingCore(combat.flooding);
    this.floodingCore = floodingCore;
    const playerHull = new PlayerHullSystem(PLAYER_ENTITY_ID, floodingCore, combat.hull);
    this.playerHull = playerHull;
    // hullIntegrity 업그레이드 소비 — 배율은 공식 승인값, 기준값은 대기.
    playerHull.applyHullIntegrityModifier(this.upgrades?.modifiers.hullIntegrity ?? 0);
    this.registry.register(playerHull);
    //     생존 상태 배선 (INT-CORE-016 §① — 게임플레이 attach API 도착).
    //     ① PlayerAliveSource — PatrolShipFleet(추적)과 EnemyAttackCoordinator
    //        (공격) 양쪽에 도달한다. 파괴 후 추적·공격 요청이 멈춘다.
    //     ② DamageReceiver — 폭뢰·충돌 등 모든 피해가 이 **단일 창구**를
    //        통과한다. 게임플레이는 자체 체력 상태를 두지 않는다.
    gameplay.attachPlayerAliveSource(playerHull);
    gameplay.attachDamageReceiver(playerHull);
    //     ③ C9 전투 params → 게임플레이 주입 (INT-CORE-017 — blocker 해소).
    //        정규화 소유자는 공인 로더 하나다: loadCombatParams()가 중첩
    //        스키마를 계약 타입 블록으로 검증·변환했고, 여기서는 그 결과의
    //        게임플레이 단면(NormalizedCombatParams)만 넘긴다. raw JSON
    //        import·수작업 펼치기 없음, null 블록은 null 그대로(unwired 유지).
    //        선체·침수 블록은 위에서 리드 코어에 직접 주입했다.
    gameplay.attachCombatParams({
      detectionTuning: combat.detectionTuning,
      depthCharge: combat.depthCharge,
    });
    //     ④ 어뢰 발사 지점 무조건 노출 (§5.10 확정 규칙 — C1 계약
    //        DetectionSystem.reportTorpedoLaunch의 조립 배선). 발사 위치는
    //        게임플레이가 발행하는 torpedoFired payload 그대로다 — 조립부는
    //        수치·판정을 만들지 않고 이벤트를 계약 API에 잇기만 한다.
    //        소음 계산과 무관하게 항상 노출된다.
    this.registerUnsubscribe(
      this.bus.on('torpedoFired', ({ originX, originZ }) => {
        gameplay.detection.reportTorpedoLaunch(originX, originZ);
      }),
    );
    //     ⑤ 공식 production 소음 정책 (INT-CORE-019 — 구 고정 1 폐기):
    //        noiseLevel = clamp(|현재 속력| / 공인 최고 속력, 0, 1).
    //        속력 = 게임플레이 PlayerController.speed(계약이 '소음 산출의
    //        입력값'으로 지정한 비부호 속력), 최고 속력 = 업그레이드 반영
    //        유효 params(movement 정본 파생 — 조립부 하드코딩 없음).
    //        정지 = 0, 전속 = 1. 침묵 항행 배율(공식 0.1)은 탐지 시스템이
    //        environment.silentRunning으로 적용하며, 대화형 침묵 조작은
    //        미구현이라 소스 미연결 = 공식 중립값 false 유지
    //        (C_SILENT_RUNNING_INTERACTIVE=false — 임의 토글 생성 금지).
    const game = this;
    gameplay.detectionEnvironment.attachNoiseSource({
      get noiseLevel(): number {
        const maxSpeed = (game.effectiveParams ?? params).movement.maxSpeedMetersPerSecond.value;
        if (!(maxSpeed > 0)) return 0;
        return Math.min(1, Math.max(0, Math.abs(gameplay.player.speed) / maxSpeed));
      },
    });

    // ②-f [M1·M2 Runtime Closure] production composition (INT-CORE-022 §5).
    //     역할 구현체는 전부 dev에 있다 — 여기서는 **연결만** 한다. 판정·수치·
    //     AI·표현을 이 자리에서 만들지 않으며, 미확정 params 축은 null 그대로
    //     흘려보내 그 축만 unwired로 남는다.

    //     [순서 3] 단서 회수 대상 — world 배치를 공식 InteractableTarget으로
    //     변환한다. targetId는 배치 정본 그대로이고 clueId를 복사하지 않는다
    //     (매핑은 순서 4 소유). 거리·홀드 판정은 InteractionSystem 소유이므로
    //     여기서는 좌표와 존재 여부만 넘긴다. 렌더 표식은 판정 소스가 아니다.
    //     기존 salvage·금괴는 근접 자동 회수 경로(pickupRadiusMeters)를 쓰고
    //     interactable source를 갖지 않는다 — 덮어쓸 기존 대상이 없으므로
    //     단서 3개가 현재 production interactable 전부다.
    const clueInteractables: readonly InteractableTarget[] = BOSS_CLUE_PLACEMENTS.map(
      (placement) => ({
        interactableId: placement.targetId,
        kind: 'clue' as const,
        positionX: placement.x,
        positionY: placement.y,
        positionZ: placement.z,
        available: true,
      }),
    );
    gameplay.attachInteractables(() => clueInteractables);
    //     [순서 4] canonical 매핑 주입 — 조립부는 문자열을 만들지 않고 world
    //     정본을 그대로 넘긴다. 매핑 없는 대상은 발행 0(`unmappedClue`)이고,
    //     미지 clueId는 BossProgressStore가 최종 거부한다.
    gameplay.attachClueIds(CLUE_ID_BY_INTERACTABLE);
    //     [순서 21] 회수 절차 수치 — 툴링 로더 DTO의 hold 블록에서 값만 뽑아
    //     계약 형태로 넘긴다. null은 null 그대로(그 축 unwired).
    gameplay.attachInteractionParams({
      holdSeconds: interactionParams.hold.holdSeconds.value,
      interactRadiusMeters: interactionParams.hold.interactRadiusMeters.value,
      noiseContribution: interactionParams.hold.noiseContribution.value,
    });

    //     [L-2 발견 가능성] F 홀드 프롬프트 HUD — 위 회수 판정을 **바꾸지 않고**
    //     정본 `InteractionReadModel`만 그대로 표시한다. 후보 허용 목록은 world
    //     배치에서 그대로 넘긴다(HUD가 targetId 문자열을 만들지 않는다).
    //     거리·홀드 시간·완료 판정은 전부 InteractionSystem 소유로 남는다.
    const interactionPromptHud = new InteractionPromptHud(this.container);
    interactionPromptHud.attachSource({
      interactionView: () => gameplay.interactionReadModel(),
    });
    interactionPromptHud.attachClueTargets(
      BOSS_CLUE_PLACEMENTS.map((placement) => placement.targetId),
    );
    this.interactionPromptHud = interactionPromptHud;
    //     완료 피드백은 **정본이 실제로 반영했을 때만** 뜬다 — 리드
    //     BossProgressStore가 새 단서를 반영할 때 발행하는 이벤트 하나만
    //     소비한다(중복 회수는 발행 0이므로 피드백도 0).
    this.registerUnsubscribe(
      this.bus.on('bossCluesChanged', ({ collected, required }) => {
        interactionPromptHud.notifyClueCollected(collected, required);
      }),
    );

    //     [L-3 발견 가능성] 탐사 안내 HUD — 단서 진행 정본은 BossProgressStore
    //     하나이고, 구역 잠금 표시도 `requestEntry()` 결과 그대로다(해금 조건
    //     재구현 0). 구역 좌표는 world 정본 값을 그대로 찍는다.
    const explorationHud = new ExplorationHud(this.container);
    explorationHud.attachProgress(bossProgress);
    explorationHud.attachBossZone(BOSS_ZONE);
    this.explorationHud = explorationHud;

    //     [순서 5] 보스 구역 — 좌표는 world 정본이며 여기서 다시 쓰지 않는다.
    gameplay.attachBossZone(BOSS_ZONE);

    //     [순서 6·8] BossEncounter 생성 + 단계 지연 프록시.
    //     프록시가 필요한 이유: 약점 개방 판정은 리드 `BossController`가
    //     소유하는데, 그 controller는 스폰 허가 이후에만 생긴다. 그동안
    //     `BossWeakPointTarget`은 phase port를 요구하므로, 조립부가 **정본으로
    //     위임하는 얇은 프록시** 하나를 둔다. controller가 없는 동안에는
    //     계약 기본값(1단계·개방 false)을 돌려줄 뿐 가짜 시간·가짜 전환을
    //     만들지 않는다 — 프록시는 상태를 보유하지 않는다.
    const composition = this;
    const bossPhaseProxy: BossPhasePort = {
      get phase(): BossPhase {
        return composition.bossController?.phasePort.phase ?? 1;
      },
      get weakPointOpen(): boolean {
        return composition.bossController?.phasePort.weakPointOpen ?? false;
      },
    };
    //     약점 배치는 인계표 §5 순서 6의 인자 이름 그대로 둔다 — 본체 배치와
    //     약점 배치가 서로 다른 정본이라는 사실이 호출부에서 드러나야 한다.
    //     등록 자체는 `spawnBoss()`가 기존 어뢰 표적 등록소에 1회 수행하므로
    //     조립부는 `BossWeakPointTarget`을 다시 등록하지 않는다(중복 0).
    const weakPointPlacement = BOSS_WEAK_POINT_PLACEMENT;
    gameplay.createBoss(
      BOSS_PLACEMENT,
      weakPointPlacement,
      bossPhaseProxy,
      {
        moveSpeedMetersPerSecond: bossParams.movement.moveSpeedMetersPerSecond.value,
        turnRateRadiansPerSecond: bossParams.movement.turnRateRadiansPerSecond.value,
        projectileSpeedMetersPerSecond: bossParams.patterns.projectile.speedMetersPerSecond.value,
        projectileDamage: bossParams.patterns.projectile.damage.value,
        ramContactDamage: bossParams.patterns.ram.contactDamage.value,
      },
      {
        hitRadiusMeters: bossParams.patterns.weakPointOpen.hitRadiusMeters.value,
        weakPointDamageMultiplier:
          bossParams.patterns.weakPointOpen.weakPointDamageMultiplier.value,
        closedHullDamageMultiplier:
          bossParams.patterns.weakPointOpen.closedHullDamageMultiplier.value,
      },
    );
    //     생성 직후 공식 포트가 실제로 준비됐는지 확인한다. non-null 단언으로
    //     덮으면 '연결된 줄 알았는데 아무 일도 없는' 상태가 되므로 중단한다.
    const bossMotionPort = gameplay.bossMotionPort;
    const bossAttackPort = gameplay.bossAttackPort;
    if (!bossMotionPort || !bossAttackPort || !gameplay.bossWeakPoint) {
      throw new Error(
        '[Game] 보스 포트 준비 실패 — production 부팅 중단 ' +
          `(motion=${bossMotionPort !== null} attack=${bossAttackPort !== null} ` +
          `weakPoint=${gameplay.bossWeakPoint !== null})`,
      );
    }

    //     [순서 7·9·11] 보스 수명주기 — 스폰 허가 이후에만 controller를 만들고,
    //     제거·재출항에서 폐기한다. 같은 factory를 다시 부르므로 두 번째 출항도
    //     동일 경로로 성립한다(첫 출항 전용 1회성 배선 아님).
    let disposeDamageSink: (() => void) | null = null;
    const disposeBossRuntime = (): void => {
      disposeDamageSink?.();
      disposeDamageSink = null;
      this.bossController?.dispose();
      this.bossController = null;
      this.bossSpawned = false;
      explorationHud.setEncounterActive(false);
    };
    const spawnBossIfGranted = (): void => {
      // 이미 스폰됐으면 재요청하지 않는다 — 구역 체류·재진입 모두 1회.
      if (this.bossSpawned) return;
      if (bossProgress.requestEntry() !== 'granted') return;
      if (!gameplay.spawnBoss()) return;
      // 스폰 성공 이후에만 코어를 만든다 → BossCoreView 노출도 이 시점부터다.
      const controller = new BossController({
        entityId: BOSS_PLACEMENT.entityId,
        targetEntityId: PLAYER_ENTITY_ID,
        motion: bossMotionPort,
        attackPort: bossAttackPort,
        params: bossParams,
        playerAlive: playerHull,
        bus: this.bus,
        spawnPosition: { x: BOSS_PLACEMENT.spawnX, z: BOSS_PLACEMENT.spawnZ },
      });
      controller.initialize();
      this.bossController = controller;
      this.bossSpawned = true;
      //   [순서 9] 약점 명중 → 리드 체력 원장. 배율은 게임플레이가 이미
      //   1회 적용했고 여기서 다시 곱하지 않는다. 약점 표적 등록은
      //   `spawnBoss()` 내부가 이미 했으므로 조립부가 재등록하지 않는다.
      disposeDamageSink = gameplay.attachBossDamageSink(controller);
      // 교전 표시는 **스폰 성공 이후에만** — 스폰 실패·거부는 표시하지 않는다.
      explorationHud.setEncounterActive(true);
      console.info(`[Game] 보스 스폰 (${controller.bossId}) — 구역 ${BOSS_ZONE.id} 진입 허가`);
    };
    //     구역 진입 edge — 진입 1회당 통지 1회다(체류 중 반복 없음). HUD 배너는
    //     리드 게이트가 돌려준 결과를 그대로 받으며, 조립부가 허가를 다시
    //     판단하거나 문구용으로 조건을 복제하지 않는다.
    this.registerUnsubscribe(
      gameplay.onBossZoneEntered(() => {
        explorationHud.notifyZoneEntered(bossProgress.requestEntry());
        spawnBossIfGranted();
      }),
    );
    //     발사 위치 통지 — 기존 어뢰 이벤트를 코어 내비게이션에 잇기만 한다.
    this.registerUnsubscribe(
      this.bus.on('torpedoFired', ({ originX, originZ }) => {
        this.bossController?.notifyLastKnownPosition(originX, originZ);
      }),
    );
    //     격파 → 개체 제거 + 코어 폐기. 승리 보상·저장은 기존 BossVictoryBridge
    //     경로 그대로이며 여기서 새 보상 경로를 만들지 않는다.
    this.registerUnsubscribe(
      this.bus.on('bossDefeated', () => {
        gameplay.boss?.markRemoved();
        disposeBossRuntime();
      }),
    );
    //     [순서 7 update] 코어 갱신 — 스폰된 동안에만 돈다. 이전 출항의
    //     controller가 남아 계속 도는 일이 없도록 폐기 시 참조가 끊긴다.
    this.registry.register({
      id: 'bossRuntime',
      initialize: () => {},
      update: (deltaSeconds: number) => {
        if (!this.bossSpawned) return;
        this.bossController?.update(deltaSeconds);
      },
      dispose: () => disposeBossRuntime(),
    });
    this.disposeBossRuntimeForSortie = disposeBossRuntime;

    //     [순서 12·13] 소나 접점·수치. 접점은 **기존 production 상태**에서만
    //     파생한다 — 새 registry·fixture를 만들지 않고, 지형은 blip이 아니다
    //     (배경층은 레이아웃 단일 소스 소유). 탐색 kind의 패시브 선노출 차단은
    //     게임플레이 SonarScopeSystem이 kind로 수행하므로 여기서 거르지 않는다.
    //     보스는 공식 정책대로 `ship`으로 분류된 기존 구현을 유지한다.
    gameplay.attachSonarContacts(() => {
      const contacts: SonarContact[] = [];
      for (const ship of gameplay.shipWorldSource.shipViews) {
        if (!ship.alive) continue;
        contacts.push({
          contactId: `ship-${ship.entityId}`,
          kind: 'ship',
          positionX: ship.positionX,
          positionZ: ship.positionZ,
          noiseEmitting: true,
        });
      }
      const boss = gameplay.boss;
      if (boss && this.bossSpawned && !boss.removed) {
        const pose = boss.getPosition();
        contacts.push({
          contactId: `boss-${BOSS_PLACEMENT.entityId}`,
          kind: 'ship',
          positionX: pose.x,
          positionZ: pose.z,
          noiseEmitting: true,
        });
      }
      for (const torpedo of gameplay.torpedo.torpedoes) {
        contacts.push({
          contactId: `torpedo-${torpedo.id}`,
          kind: 'torpedo',
          positionX: torpedo.x,
          positionZ: torpedo.z,
          noiseEmitting: true,
        });
      }
      for (const charge of gameplay.depthCharges.charges_) {
        contacts.push({
          contactId: `depthCharge-${charge.chargeId}`,
          kind: 'depthCharge',
          positionX: charge.worldX,
          positionZ: charge.worldZ,
          noiseEmitting: true,
        });
      }
      for (const salvage of gameplay.economy.salvageObjects) {
        if (salvage.destroyed) continue;
        contacts.push({
          contactId: `salvage-${salvage.id}`,
          // 재화 상자류는 금괴 보관함, 그 외 잔해는 salvage로 분류한다.
          kind: salvage.kind === 'chest' ? 'goldCache' : 'salvage',
          positionX: salvage.positionX,
          positionZ: salvage.positionZ,
          // 무소음 — 그래서 액티브 핑에서만 드러난다 (16차 결의 2-5).
          noiseEmitting: false,
        });
      }
      for (const target of clueInteractables) {
        contacts.push({
          contactId: `clue-${target.interactableId}`,
          kind: 'clue',
          positionX: target.positionX,
          positionZ: target.positionZ,
          noiseEmitting: false,
        });
      }
      return contacts;
    });
    //     스코프 수치 = sonar.json 슬라이스 + combat 소유 패시브 정책 1필드.
    //     combat 쪽 필드는 이미 로드한 결과에서 읽고 값을 복제하지 않는다.
    gameplay.attachSonarScopeParams({
      activePingDisplaySeconds: sonarParams.activePing.displaySeconds.value,
      activePingDetectionGaugeRise: sonarParams.activePing.detectionGaugeRise.value,
      activePingCooldownSeconds: sonarParams.activePing.cooldownSeconds.value,
      passiveBearingSpreadRadiansAtMaxNoise:
        sonarParams.passive.bearingSpreadRadiansAtMaxNoise.value,
      depthChargeOnPassiveScope: combat.depthChargeOnPassiveScope,
    });
    //     테두리 상태색 입력 — 기존 탐지 정본을 그대로 잇는다(재계산 0).
    gameplay.sonarScope.attachDetectionStageSource(gameplay.detectionStageSource);

    //     [순서 20] 액티브 핑 입력 pump — production 유일 지점.
    //     `consumeActivePingPressed()`는 edge 1회 소비이므로 프레임당 한 번만
    //     부른다. 쿨다운 거부는 그대로 버린다(재시도 큐·상태 저장 없음).
    this.registry.register({
      id: 'activePingInput',
      initialize: () => {},
      update: () => {
        if (gameplay.input.consumeActivePingPressed()) gameplay.requestActivePing();
      },
      dispose: () => {},
    });

    //     [순서 22] 파밍 상한 — 비율·평균 두 값에서 소비 측이 상한을 파생한다
    //     (조립부가 48을 계산해 복제하지 않는다). 대상별 보상 금액 데이터는
    //     아직 저장소에 없으므로 `attachFarmingRewards`는 부르지 않는다 —
    //     임의 보상표를 만들지 않으며 그동안 파밍 지급은 0이다.
    gameplay.attachFarmingRewardParams(
      farmingParams
        ? {
            sectorCapRatioOfCombatAverage: farmingParams.sectorCapRatioOfCombatAverage.value,
            combatRewardAverageCredits: farmingParams.combatRewardAverageCredits.value,
          }
        : null,
    );

    //     [순서 23] save 복원 단서 표식 동기화 — 저장된 단서는
    //     `interactionCollected`가 재발행되지 않으므로 복원 직후 1회 맞춘다.
    //     매핑 **역조회**로 targetId를 얻는다(문자열 추측 0). idempotent.
    const collectedClueIds = new Set(bossProgress.collectedClueIds);
    scene.markCluesCollected(
      Object.entries(CLUE_ID_BY_INTERACTABLE)
        .filter(([, clueId]) => collectedClueIds.has(clueId))
        .map(([targetId]) => targetId),
    );

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
        get progress() {
          // M2 진행 정본 스냅샷 — 격파 순간의 rarePart 저장에 데모 완료
          // 기록이 함께 실린다 (INT-CORE-020)
          return bossProgress.snapshot();
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
    const debriefState = new DebriefStateTracker(sortieFailure, saveBridge, metaLoop);
    this.debriefState = debriefState;
    this.registry.register(debriefState);
    //     확인 command (INT-CORE-016 — 개정 DEBRIEF 종료 정책): 저장 성공이
    //     BASE 전환을 자동으로 일으키지 않는다. 귀환·실패 화면의 '확인'
    //     버튼이 이 command를 호출하며, 저장 미완료·중복 확인은 거부된다.
    //     정상 귀환·실패 양쪽 동일 정책.
    this.debriefConfirm = new DebriefConfirmCommand(metaLoop, debriefState);

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
    //     탐지 HUD 배선 (INT-CORE-016 §②).
    //     ① 탐지 read model — 게임플레이 정본은 `detectionHudView()`(호출마다
    //        값 복사본)이므로 폴링 어댑터로 감싼다. HUD는 게이지를 재계산하지
    //        않고 이 값만 표시한다.
    //     ② 추적 read model — 정본은 **리드 `GuardShipAdapter`**의
    //        `TrackingStateSource` 구현이다 (게임플레이에 없는 API를 만들지
    //        않는다). params 미확정이면 stage가 safe에 고정돼 attack 전이가
    //        없고, HUD는 그 미연결 상태를 그대로 표시한다.
    detectionHud.attachDetectionSource({
      hudView: () => gameplay.detectionHudView(),
    });
    detectionHud.attachTrackingSource(guardAdapter);
    //     [§5 순서 14] 소나 스코프(그래픽스 소유 계기)는 정본 계약
    //     `SonarScopeReadModel`(contracts/sonar.ts) **하나만** 소비한다.
    //     공급자가 dev에 도착했으므로 read model만 넘긴다 — 월드 좌표·registry·
    //     게임플레이 객체 자체는 렌더에 전달하지 않는다. params 미확정 축이
    //     있으면 read model이 unwired로 나오고 스코프가 '계기 미연결'을
    //     그대로 표시한다(조립부가 위장하지 않는다).
    scene.attachSonarScopeSource({
      scopeView: () => gameplay.sonarScopeReadModel(),
    });
    //     [§5 순서 15] BossCoreView 공급 (INT-RENDER-016) — 스폰 성공 이후에만
    //     비-null. 스폰 전·격파 폐기 후·재출항 리셋 후에는 null이라 production
    //     보스 시각물이 장착되지 않는다. 계약에 spawned 필드를 더하지 않고
    //     조립부 게이트로 해결한다.
    scene.attachBossViewSource({
      coreView: () =>
        this.bossSpawned && this.bossController ? this.bossController.view() : null,
    });
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
    //     재시도 command = 리드 retrySave 래퍼 (재정산 없음 — 저장만).
    //     확인 command = **리드 guarded command**(INT-CORE-016 §DEBRIEF 개정).
    //     `metaLoop.completeDebrief()` 직접 호출은 저장 미완료 가드를 우회하므로
    //     사용하지 않는다 — 저장 성공 전 confirm은 `saveIncomplete`로 거부되고,
    //     중복 confirm은 BASE 전환을 반복하지 않는다. 정상 귀환·실패 동일 정책.
    const debriefConfirm = this.debriefConfirm;
    const confirmDebrief = (): void => {
      debriefConfirm?.confirm();
    };
    const failureScreen = new SortieFailureScreen(this.container);
    failureScreen.attach(
      debriefState,
      () => {
        sortieFailure.retrySave(() => {
          saveBridge.writeSnapshot();
          return saveBridge.lastSaveSucceeded;
        });
      },
      // [INT-CORE-017] 실패 화면 확인 = 리드 guarded confirm command —
      // 성공(BASE 전환)했을 때만 true를 돌려 화면이 닫힌다.
      () => debriefConfirm?.confirm() === 'confirmed',
    );
    const returnScreen = new SortieReturnScreen(this.container);
    returnScreen.attach(debriefState, metaLoop, confirmDebrief);

    this.registry.register({
      id: 'sprintCHud',
      initialize: () => {},
      update: (deltaSeconds: number) => {
        const inSortie = metaLoop.metaState === 'SORTIE';
        detectionHud.setVisible(inSortie);
        survivalHud.setVisible(inSortie);
        detectionHud.update();
        survivalHud.update(deltaSeconds);
        // 발견 가능성 HUD 2종 — 같은 출항 게이트·같은 프레임에서 갱신한다.
        // 둘 다 정본 read model 표시 전용이라 판정 순서에 영향이 없다.
        interactionPromptHud.setVisible(inSortie);
        explorationHud.setVisible(inSortie);
        interactionPromptHud.update(deltaSeconds);
        explorationHud.update(deltaSeconds);
        failureScreen.update();
        returnScreen.update();
      },
      dispose: () => {
        detectionHud.dispose();
        survivalHud.dispose();
        interactionPromptHud.dispose();
        explorationHud.dispose();
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
