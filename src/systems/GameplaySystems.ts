/**
 * 게임플레이 시스템 조립점 — 이동·충돌 + 어뢰 전투(D6, 통합 순서 [5]) 범위.
 *
 * core/Game(리드 소유)이 이 클래스 하나를 SystemRegistry에 등록하면 되도록
 * 입력 → 조작(전후·수직·선회) → 충돌 보정 → 심도 구간 판정 → 조준·어뢰의
 * 배선을 캡슐화한다 (INTEGRATION_NOTES INT-GAME-002 반영).
 * core의 GameSystem 수명주기(initialize → update* → dispose)를 구현한다.
 *
 * 전투 입력 단일화 (INT-CORE-002 [확정]):
 *  - 마우스 우클릭 홀드/좌클릭은 MouseCombatInput이 추적하고, 이 클래스가
 *    매 프레임 **AimSystem 공용 진입점**(beginAim/endAim/fireTorpedo)으로
 *    번역한다. PC HUD의 조준·발사 버튼(빌드·툴 소유)은 composition root에서
 *    같은 `aim` 인스턴스의 같은 메서드를 호출한다 — 별도 전투 시스템 없음,
 *    입력 소스가 달라도 발사 결과·재장전 판정 동일.
 *
 * 통신 규칙: 렌더·오디오·UI 모듈을 직접 참조하지 않는다.
 *  - 이벤트: `depthChanged` / `aimModeChanged` / `torpedoFired` (EventBus)
 *  - 읽기 전용 상태: player(위치 x/y/z·방향·부호 있는 속도),
 *    depth(심도 구간), aim(조준 여부), torpedo(잔량·재장전·주행 어뢰),
 *    targets(표적 위치·속도 — 리드샷 보조선 입력), collision(충돌체 집합)
 *
 * 파라미터 규칙: 검증 완료된 params는 생성 시 1회 주입받고, 개발 모드
 * 핫리로드는 구독 함수(subscribeToParamsReload)로 유효한 새 값이 올 때만
 * 내부 참조를 교체한다. update()마다 loadParams()를 호출하지 않는다.
 */

import type { NormalizedCombatParams } from './combat/officialCombatParams';
import type { CanyonLayout } from '../contracts/layout';
import type { EquipmentChangeJudgePort } from '../contracts/meta';
import type { SalvageSpawnPlanEntry } from '../contracts/officialParams';
import type { GameParams } from '../contracts/params';
import type {
  CargoShipStateSource,
  DepthSystem,
  SubmarinePoseSource,
} from '../contracts/systems';
import type { EventBus } from '../core/EventBus';
import type { GameSystem, SystemContext } from '../core/GameSystem';
import { TorpedoTubeSocketRig } from '../core/TorpedoTubeSocketRig';
import { STARTING_CANYON_LAYOUT } from '../world/startingCanyonLayout';
import type { DetectionHudView, DetectionStageSource } from '../contracts/detection';
import type {
  DamageApplyResult,
  DamageReceiverPort,
  DamageRequest,
  EnemyAttackPort,
  PlayerAliveSource,
  PlayerHullState,
} from '../contracts/survival';
import { PLAYER_ENTITY_ID } from '../contracts/guard';
import { CargoShipSystem, cargoShipConfigFromOfficial } from './CargoShipSystem';
import { DepthChargeRunSystem } from './combat/DepthChargeRunSystem';
import { EnemyAttackCoordinator } from './combat/EnemyAttackCoordinator';
import { DetectionEnvironmentAdapter } from './detection/DetectionEnvironmentAdapter';
import { SubmarineDetectionSystem } from './detection/SubmarineDetectionSystem';
import { CanyonPatrolSpawnLocation } from './faction/CanyonPatrolSpawnLocation';
import { HighValueTransportSystem } from './faction/HighValueTransportSystem';
import type { SurfaceShipMotionPortFactory } from '../contracts/guard';
import type { PatrolShipEntity } from './faction/PatrolShipEntity';
import { PatrolShipFleet } from './faction/PatrolShipFleet';
import {
  CombinedShipWorldSource,
  type ShipWorldSource,
} from './faction/ShipWorldSource';
import {
  ShipIdentificationSystem,
  type IdentifiableShipView,
} from './faction/ShipIdentificationSystem';
import {
  patrolShipMotionProfile,
  shipPlacementsFromOfficialCargo,
} from './faction/shipPlacements';
import {
  canyonHorizontalBounds,
  type CanyonHorizontalBounds,
} from './collision/canyonBounds';
import { CollisionWorld } from './collision/CollisionWorld';
import { computeShipBoxPush } from './collision/shipHullBox';
import { computeHullSpheres } from './collision/submarineHull';
import { registerStartingAreaColliders } from './collision/startingArea';
import { EconomySystem, type SalvageSpawnOutcome } from './economy/EconomySystem';
import {
  OFFICIAL_EQUIPMENT_IDS,
  readOfficialEquipmentCatalog,
  readOfficialUpgradeCatalog,
  type CargoRuntimeParams,
  type EconomyRuntimeParams,
  type EquipmentCatalog,
} from './economy/officialEconomyCatalog';
import {
  UpgradePurchaseSystem,
  type PurchaseWalletPort,
} from './economy/UpgradePurchaseSystem';
import { EquipmentSystem, type EquipmentId } from './EquipmentSystem';
import { KeyboardInput, type KeyEventSource, type VisibilitySource } from './KeyboardInput';
import { LayeredDepthSystem } from './LayeredDepthSystem';
import { MouseCombatInput } from './MouseCombatInput';
import { SubmarineAimSystem } from './SubmarineAimSystem';
import { StraightRunTorpedoSystem } from './StraightRunTorpedoSystem';
import { SubmarinePlayerController } from './SubmarinePlayerController';
import { TargetRegistry } from './TargetRegistry';

/**
 * 게임플레이가 소비하는 공식 런타임 params의 구조 단면 [INT-CORE-011].
 * 조립부의 `OfficialRuntimeParams`가 그대로 대입된다 — 게임플레이는 필요한
 * 세 묶음만 좁혀 받고, JSON·툴링 로더에는 접근하지 않는다.
 */
export interface GameplayOfficialParams {
  readonly economy: EconomyRuntimeParams;
  readonly cargo: CargoRuntimeParams;
  readonly equipment: EquipmentCatalog;
}

/**
 * 피해 수신 창구가 미연결일 때 돌려주는 선체 상태 — **전부 미확정 표기**다.
 * 게임플레이는 자체 체력을 갖지 않으므로 값을 만들어 내지 않는다.
 */
const UNWIRED_HULL_STATE: PlayerHullState = Object.freeze({
  currentHull: 0,
  maxHull: 0,
  hullRatio: null,
  floodingLevel: 0,
  floodingRate: 0,
  survivalState: 'stable',
  isDestroyed: false,
  lastDamageSource: null,
  lastDamageAmount: 0,
  lastDamageAt: null,
  recoverable: true,
  sortieFailurePending: false,
  unwired: true,
});

/** 출항 준비 상태 — 리드 Departure command가 소비하는 판정 결과 */
export interface SortieReadiness {
  /** 기지(BASE) 상태 여부 — 리드가 넘긴 값을 그대로 반영 */
  readonly inBase: boolean;
  readonly loadoutValid: boolean;
  readonly upgradesValid: boolean;
  /** 전부 충족 시에만 true — 저장·화면 전환은 호출 측(리드) 책임 */
  readonly ready: boolean;
  readonly blockers: readonly string[];
}

/** 승인된 파라미터 로더의 onParamsReloaded 시그니처 (config/ParamLoader.ts) */
export type ParamsReloadSubscribe = (
  listener: (params: GameParams) => void,
) => () => void;

export class GameplaySystems implements GameSystem {
  readonly id = 'gameplay';

  /** 키 입력 어댑터 — attachInput()으로 window/document에 연결한다 */
  readonly input: KeyboardInput;
  /** 마우스 전투 입력(우클릭 조준 홀드·좌클릭 발사) — attachInput이 함께 연결 */
  readonly mouse: MouseCombatInput;
  /** 위치(x/y/z)·방향·부호 있는 속도 읽기 전용 상태 (탐지·렌더링·카메라 소비용) */
  readonly player: SubmarinePlayerController;
  /** 현재 심도 구간 읽기 전용 상태 + depthChanged 이벤트 발행 */
  readonly depth: DepthSystem;
  /**
   * 조준 공용 진입점 [INT-CORE-002 확정] — 마우스와 PC HUD 버튼이 모두
   * 이 인스턴스를 호출한다 (배선은 composition root). 5차 결의 3에 따라
   * **토글** 방식: 우클릭·HUD 조준 버튼 = toggleAim(), 비조준 발사 시도는
   * aimRequiredCount로 안내 신호를 남긴다.
   */
  readonly aim: SubmarineAimSystem;
  /** 어뢰 상태 — remaining·reloadRemainingSeconds(UI), torpedoes(렌더 항적) */
  readonly torpedo: StraightRunTorpedoSystem;
  /**
   * 발사관 소켓 rig (리드 정본 `TorpedoTubeSocketRig`) — **단일 인스턴스**.
   * 조준 카메라(그래픽스)는 composition root에서 이 인스턴스를 주입받아
   * `aimCameraSocket`을 읽는다. 어뢰는 같은 rig의 `torpedoSpawnSocket`을
   * 쓴다 — 두 소켓의 전방축이 동일하므로 십자선 = 탄도.
   */
  readonly torpedoTubeSocket: TorpedoTubeSocketRig;
  /** 장비 4종 (기본/고속/중어뢰/디코이) — 슬롯·업그레이드 배율 주입점 */
  readonly equipment: EquipmentSystem;
  /** 경제 — 드롭·픽업·크레딧·희귀 부품·경비 요청·출항 정산 */
  readonly economy: EconomySystem;

  /**
   * 기지 업그레이드 구매 판정 — 지갑(리드 MetaLoop)이 조립부에서 주입되어야
   * 하므로 여기서 생성하지 않고 연결만 받는다 (미연결 = 기지 밖 맥락).
   */
  private purchaseSystem: UpgradePurchaseSystem | null = null;
  /** 전투 표적 등록소 — 명중 판정·리드샷 보조선이 같은 목록을 읽는다 */
  readonly targets: TargetRegistry;
  /**
   * 화물선 (VS 1척 [확정 §12.2]) — 계약 `CargoShipStateSource` 구현.
   * composition root가 렌더(CargoShipVisual)에 상태 소스로 1회 주입한다.
   */
  readonly cargoShip: CargoShipSystem;
  /**
   * [B1] 적대 화물선 외의 선박들 (현재 중립 1척) — 같은 `CargoShipSystem`
   * 원형을 세력 태그만 바꿔 재사용한다. 렌더 배선은 그래픽스가 다중 선박
   * 소스를 소비할 때 연결된다 (INT-GAME-012 그래픽스 지침).
   */
  private otherShips: readonly CargoShipSystem[];
  /**
   * [B2] 선박 식별 read model — 계약 `ShipIdentificationSource` 구현.
   * composition root가 렌더에 주입한다 (렌더는 게임플레이를 직접 import하지
   * 않는다). 그래픽스가 모델명으로 세력을 추측할 필요가 없다.
   */
  readonly shipIdentification: ShipIdentificationSystem;
  /**
   * [B4] 경비함 스폰 위치 전략 — 계약 `GuardSpawnLocationStrategy` 구현.
   * 조립부가 `GuardSpawnCoordinator.attachLocationStrategy`로 연결한다.
   */
  readonly guardSpawnLocation: CanyonPatrolSpawnLocation;
  /**
   * [B5] 경비함 함대 — 계약 `SurfaceShipMotionPortFactory` production 구현.
   * 스폰 1건마다 월드 엔티티(pose 정본) 1개와 이동 포트 1개를 만든다.
   * 조립부가 `createProductionDestroyerAIFactory(gameplay.surfaceShipMotionPortFactory)`
   * 로 연결한다 — 검증 더블은 production 경로에 들어오지 않는다.
   */
  private readonly patrolFleet: PatrolShipFleet;
  /**
   * 다중 선박 read source — 적대·중립 화물선 + 경비함을 한 목록으로 노출한다.
   * 렌더는 이 **읽기 전용 스냅샷**만 소비한다(게임플레이 객체 참조 없음).
   */
  private readonly shipWorldSourceValue: CombinedShipWorldSource;
  /** 월드 수평 경계 (레이아웃 블록 + 공식 항로 파생) — 소비자 공용 단일 인스턴스 */
  private readonly worldBoundsValue: CanyonHorizontalBounds | null;
  /** [C4] 피해 수신 창구 (리드 `PlayerHullSystem`) — 미연결이면 피해 없음 */
  private damageReceiver: DamageReceiverPort | null = null;
  /**
   * [C1] 탐지 게이지 **정본** — 계약 `DetectionSystem` 구현.
   * HUD는 `detectionHudView()`, AI는 `detectionStageSource`만 소비한다.
   */
  readonly detection: SubmarineDetectionSystem;
  /** [C2] 은신·심도 보정 입력 — 계약 `DetectionEnvironmentSource` 구현 */
  readonly detectionEnvironment: DetectionEnvironmentAdapter;
  /** [C4] 폭뢰 lifecycle — 투하·신관·폭발·direct/near 판정 */
  readonly depthCharges: DepthChargeRunSystem;
  /** [C4] 적 공격 경계 — 사거리·쿨다운 판정 (AI는 요청만 만든다) */
  readonly enemyAttack: EnemyAttackCoordinator;
  /**
   * [B6] 고가치 수송선·호위 — **핵심 게이트 B1~B5와 독립**이다.
   * 이 시스템을 빼도 배치·식별·보상·중립 사건·경비 스폰은 그대로 동작한다.
   */
  readonly highValueTransport: HighValueTransportSystem;
  /**
   * 정적 충돌 월드 — 공유 CanyonLayout.blocks를 충돌체로 해석해 등록한다
   * (렌더와 동일 데이터, INT-CORE-004). 레벨 교체 = 새 레이아웃 주입
   * (clear() 후 재등록) — colliders는 시야 차폐와 공유(읽기 전용).
   */
  readonly collision: CollisionWorld;
  /** 소비 중인 협곡 레이아웃 (단일 소스) — 렌더·검증 참조용 읽기 전용 */
  readonly layout: CanyonLayout;

  /** 월드 수평 경계 (읽기 전용) — 스폰·이동 판정이 공유하는 값 */
  get worldBounds(): CanyonHorizontalBounds | null {
    return this.worldBoundsValue;
  }

  /** 이벤트 버스 — B1 추가 선박을 나중에 배치할 때 필요 (attach 경로) */
  private readonly bus: EventBus;
  private readonly subscribeToParamsReload: ParamsReloadSubscribe | null;
  private unsubscribeParamsReload: (() => void) | null = null;
  private officialWired = false;

  constructor(
    bus: EventBus,
    params: GameParams,
    subscribeToParamsReload?: ParamsReloadSubscribe,
    /** 협곡 레이아웃 — composition root 주입 우선, 기본은 공유 단일 인스턴스 */
    layout: CanyonLayout = STARTING_CANYON_LAYOUT,
    /**
     * 공식 런타임 params [INT-CORE-011] — 조립부가 로더 1회 호출로 만든 번들.
     * 생성자에서 못 받으면 `attachOfficialParams()`로 주입한다. 둘 다 없으면
     * 경제·화물선·장비가 **명시적 미배선(unwired)** 상태로 남는다 —
     * 임시 수치를 만들지 않는다.
     */
    official: GameplayOfficialParams | null = null,
  ) {
    // 지연 참조용 자기 별칭 (조준↔어뢰 조립 순환 해소)
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.bus = bus;
    this.layout = layout;
    this.input = new KeyboardInput();
    this.mouse = new MouseCombatInput();
    this.player = new SubmarinePlayerController(params.movement, this.input, {
      x: layout.submarineSpawn.x,
      y: 0,
      z: layout.submarineSpawn.z,
      headingRadians: layout.submarineSpawn.headingRadians,
    });
    this.depth = new LayeredDepthSystem(bus, this.player);
    this.collision = new CollisionWorld();
    registerStartingAreaColliders(this.collision, layout);
    this.targets = new TargetRegistry();
    // 화물선 수치는 공식 params가 유일한 출처다 — 해수면 높이만 공유
    // 레이아웃(월드 소유)에서 온다. 미주입이면 비활성(표적 미등록).
    // [B1] 적대 1척 + 중립 1척을 **같은 원형**으로 동시에 배치한다 —
    // 세력은 태그로만 구분되며 세력별 선박 클래스·AI를 만들지 않는다.
    // `cargoShip`은 기존 적대 화물선 그대로다(렌더 배선·A 회귀 보호).
    const placements = official
      ? shipPlacementsFromOfficialCargo(official.cargo, layout.seaSurfaceY)
      : [];
    this.cargoShip = new CargoShipSystem(
      bus,
      this.targets,
      official ? cargoShipConfigFromOfficial(official.cargo, layout.seaSurfaceY) : null,
    );
    this.otherShips = placements
      .filter((placement) => placement.faction !== 'hostile')
      .map((placement) => new CargoShipSystem(bus, this.targets, placement.config));
    this.equipment = new EquipmentSystem();
    if (official) this.equipment.applyCatalog(official.equipment);
    // 발사관 소켓 rig — 공식 정본(리드) 단일 인스턴스. 조준 카메라(그래픽스)와
    // 어뢰 생성(게임플레이)이 **이 하나**를 공유하므로 십자선 = 탄도가
    // 구조적으로 보장된다 (스프린트 A 소켓 정규화). 미세각 소스는 조준
    // 시스템이 생성된 뒤 attachFineAimSource로 연결한다(조립 순환 해소 —
    // 연결 전에는 계약대로 미세각 0 = 조준 해제 기준 상태).
    this.torpedoTubeSocket = new TorpedoTubeSocketRig(this.player);
    this.torpedo = new StraightRunTorpedoSystem(
      bus,
      params.combat,
      this.collision,
      this.targets,
      this.equipment,
      this.torpedoTubeSocket,
    );
    this.aim = new SubmarineAimSystem(bus, this.player, this.torpedo);
    this.torpedoTubeSocket.attachFineAimSource(this.aim);
    void self;
    this.economy = new EconomySystem(
      this.targets,
      this.player,
      () => this.ships,
      official ? official.economy : null,
    );
    // [B2] 식별 판정 — 거리 조건은 어뢰 유효 사거리(기존 판정 범위)를
    //      재사용한다. 새 식별 거리 상수를 만들지 않는다.
    //      [B5] 경비함(patrol)도 같은 목록에 들어간다 — 렌더가 원형 이름으로
    //      세력을 추측하지 않도록 세 세력이 한 소스에서 나온다.
    this.shipIdentification = new ShipIdentificationSystem(
      () => this.identifiableShips,
      this.player,
      this.aim,
      this.torpedo,
    );
    // 월드 수평 경계 — 공유 레이아웃 블록 + **공식 선박 항로 끝점**에서
    // 파생한다(협곡 벽만으로 잡으면 수면 항로가 경계 밖이 된다). 스폰 위치
    // 전략과 경비함 함대가 **같은 인스턴스**를 소비해야 스폰이 자기 경계에서
    // 거부되지 않는다.
    this.worldBoundsValue = canyonHorizontalBounds(
      layout,
      placements.flatMap((placement) => [placement.config.waypointA, placement.config.waypointB]),
    );
    // [B5] 경비함 함대 — 운동 수치는 전부 기존 공식·검증 값 상속이며
    //      경비함 전용 공식 튜닝값이 아니다(patrolShipMotionProfile 참조).
    //      공식 params가 없으면 함대를 만들지 않는다(수치 발명 금지).
    this.patrolFleet = new PatrolShipFleet(
      this.targets,
      this.player,
      official
        ? patrolShipMotionProfile(
            official.cargo,
            layout.seaSurfaceY,
            params.movement.turn90Seconds.value,
          )
        : null,
      this.worldBoundsValue,
    );
    this.shipWorldSourceValue = new CombinedShipWorldSource(
      () => this.ships,
      () => this.patrolFleet.ships,
      {
        isHighValue: (entityId) =>
          this.highValueTransport.highValueTransports.some(
            (view) => view.entityId === entityId,
          ),
        escortedTransportIdOf: (entityId) =>
          this.highValueTransport.escortBindings.find(
            (binding) => binding.escortEntityId === entityId,
          )?.escortedTransportId ?? null,
      },
    );
    // [B4] 스폰 위치 — 지형·플레이어·사건 지점 회피는 기존 충돌 월드와
    //      공유 레이아웃으로 판정한다. 후보가 없으면 null(임의 좌표 금지).
    this.guardSpawnLocation = new CanyonPatrolSpawnLocation(
      this.player,
      this.collision,
      layout,
      this.torpedo,
      this.cargoShip,
      this.worldBoundsValue,
    );
    this.highValueTransport = new HighValueTransportSystem(bus);
    // [C2] 탐지 환경 입력 — 기존 3층 심도 정본 소비. 소음·침묵 항행 소스는
    //      공식 규칙이 없어 미연결(중립 입력)이며 자체 계산하지 않는다.
    this.detectionEnvironment = new DetectionEnvironmentAdapter(this.depth);
    // [C1] 탐지 게이지 정본 — 확정 3종은 params/detection.json, 거리 감쇠·
    //      감소율은 공식 문서에 없어 null이면 unwired(게이지 0·safe 고정).
    //      관측자는 세력과 무관하게 같은 계약을 쓴다(적대·patrol·호위 공용).
    this.detection = new SubmarineDetectionSystem(
      bus,
      this.detectionEnvironment,
      this.player,
      () => this.detectionObservers,
      params.detection,
      null,
    );
    // [C4] 폭뢰 — 피해는 오직 DamageReceiverPort를 통과한다. 수신 포트가
    //      연결되기 전까지 폭발해도 피해 경로가 없다(자체 체력 상태 없음).
    this.depthCharges = new DepthChargeRunSystem(
      { applyDamage: (request) => this.forwardDamage(request) },
      () => this.depthChargeTargets,
      params.combat.depthChargeFuseSeconds.value,
      null,
      params.combat.simultaneousDepthCharges.value,
    );
    this.enemyAttack = new EnemyAttackCoordinator(this.depthCharges, null, null);
    // [C3] 추적 입력 — AI는 stage만 읽는다. 전이 로직은 리드
    //      DestroyerAIController 소유이며 여기서 복제하지 않는다.
    this.patrolFleet.attachDetectionStageSource(this.detection.stageSource);
    this.officialWired = official !== null;
    this.subscribeToParamsReload = subscribeToParamsReload ?? null;
  }

  /**
   * 공식 런타임 params 주입 [INT-CORE-011] — 조립부 전용 단일 진입점.
   *
   * 경제(드롭·픽업·손실) / 화물선(항행·명중·침몰) / 장비(성능·가격·슬롯)를
   * 한 번에 배선한다. 시스템은 JSON을 읽지 않고 툴링 로더도 부르지 않는다 —
   * 여기로 들어온 값만 소비한다. 주입 객체는 읽기만 하며 역기록하지 않는다.
   */
  attachOfficialParams(official: GameplayOfficialParams): void {
    this.economy.attachEconomyParams(official.economy);
    this.cargoShip.applyCargoParams(
      official.cargo,
      this.layout.seaSurfaceY,
    );
    // [B1] 적대 외 선박(중립)도 같은 주입으로 배치된다 — 생성자 경로와
    //      동일한 결과를 만든다(재호출 시 이전 배치를 먼저 정리).
    for (const ship of this.otherShips) ship.dispose();
    this.otherShips = shipPlacementsFromOfficialCargo(official.cargo, this.layout.seaSurfaceY)
      .filter((placement) => placement.faction !== 'hostile')
      .map((placement) => new CargoShipSystem(this.bus, this.targets, placement.config));
    this.equipment.applyCatalog(official.equipment);
    this.officialWired = true;
  }

  /** 공식 params 배선 여부 — false면 경제·화물선·장비가 전부 미배선 */
  get officialParamsWired(): boolean {
    return this.officialWired;
  }

  /**
   * 저장에서 복원한 장착 상태 주입 (조립부 부팅 1회).
   * `null` = 저장 데이터 없음(SaveStore source 'fresh') → 공식 시작 장비 부여.
   * `[]` = 저장이 명시한 전부 해제 → 그대로 유지 (기본 어뢰 재부여 금지).
   */
  restoreSavedLoadout(saved: readonly EquipmentId[] | null): void {
    this.equipment.restoreSavedLoadout(saved);
  }

  /**
   * 해저 재화 spawn 어댑터 [INT-CORE-011] — 리드 `SortieSalvageSpawner`가
   * 결합한 plan 항목을 그대로 넘긴다. spawnId 중복·회수 후 재생성은 여기서
   * 거부되고, 새 출항 리셋에서만 다시 열린다.
   */
  spawnSalvageFromPlan(entry: SalvageSpawnPlanEntry): SalvageSpawnOutcome {
    return this.economy.spawnSalvageFromPlan(entry);
  }

  /**
   * [B5] 계약 `SurfaceShipMotionPortFactory` production 구현 (읽기 전용).
   * 조립부 배선: `createProductionDestroyerAIFactory(gameplay.surfaceShipMotionPortFactory)`.
   * 스폰 1건마다 독립 pose를 가진 월드 엔티티와 전용 이동 포트를 만든다.
   */
  get surfaceShipMotionPortFactory(): SurfaceShipMotionPortFactory {
    return this.patrolFleet;
  }

  /**
   * 다중 선박 read source — 적대·중립 화물선 + 경비함(patrol)을 한 목록으로.
   * 렌더가 소비하는 **읽기 전용 스냅샷**이며 게임플레이 객체 참조가 없다.
   */
  get shipWorldSource(): ShipWorldSource {
    return this.shipWorldSourceValue;
  }

  /** 스폰된 경비함 (읽기 전용) — 검증·디버깅용 */
  get patrolShips(): readonly PatrolShipEntity[] {
    return this.patrolFleet.ships;
  }

  /* ── C1~C4 production API ─────────────────────────────────────── */

  /**
   * [C1] HUD 소비 모델 — 게이지·stage·unwired. 값 복사본이며 렌더가
   * 게이지를 재계산하지 않는다.
   */
  detectionHudView(): DetectionHudView {
    return this.detection.hudView();
  }

  /** [C1·C3] AI 소비 모델 — **stage와 마지막 노출 위치만** (게이지 비노출) */
  get detectionStageSource(): DetectionStageSource {
    return this.detection.stageSource;
  }

  /**
   * [C3] 추적 입력 교체 — 기본값은 이 클래스의 탐지 정본이며, 조립부가
   * 다른 소스를 쓰려면 이 진입점으로만 바꾼다. AI는 여전히 stage만 읽고
   * 전이 로직은 리드 `DestroyerAIController` 소유다(복제 없음).
   */
  attachDetectionStageSource(source: DetectionStageSource | null): void {
    this.patrolFleet.attachDetectionStageSource(source);
  }

  /** [C4] 적 공격 경계 — AI가 요청만 넣는 포트 */
  get enemyAttackPort(): EnemyAttackPort {
    return this.enemyAttack;
  }

  /**
   * [C4] 플레이어 생사 정본 연결 — 조립부가
   * `gameplay.attachPlayerAliveSource(playerHull)` 1줄로 호출한다.
   *
   * 연결되면 `PatrolShipFleet.isTargetAlive(PLAYER_ENTITY_ID)`의 항상 true
   * 경로가 사라지고, 파괴 후에는 추적(관측 불가)·공격 요청이 모두 멈춘다.
   * 게임플레이는 자체 체력 상태를 두지 않는다 — 정본은 리드 `PlayerHullSystem`.
   */
  attachPlayerAliveSource(source: PlayerAliveSource | null): void {
    this.patrolFleet.attachPlayerAliveSource(source);
    this.enemyAttack.attachPlayerAliveSource(source);
  }

  get playerAliveSourceWired(): boolean {
    return this.patrolFleet.playerAliveWired;
  }

  /**
   * [C4] 피해 수신 창구 연결 — 조립부가 `PlayerHullSystem`을 넘긴다.
   * 미연결이면 폭발해도 피해 경로가 없다(자체 체력 상태를 만들지 않는다).
   */
  attachDamageReceiver(receiver: DamageReceiverPort | null): void {
    this.damageReceiver = receiver;
  }

  get damageReceiverWired(): boolean {
    return this.damageReceiver !== null;
  }

  /**
   * [C1·C4] 공식 전투 params 주입 (조립부) — **정규화된 계약 타입**을 받는다
   * [INT-CORE-017 개정]. 중첩 스키마의 해석·검증은 공인 로더
   * (`tools/combatParams.validateCombatParams`) **한 곳**의 책임이며,
   * 게임플레이는 툴링 스키마를 해석하지 않는다. null 블록은 null 그대로
   * 전달돼 해당 판정이 unwired로 남는다 — 임의 기본값·0 변환 금지.
   */
  attachCombatParams(params: NormalizedCombatParams): void {
    this.detection.attachTuningParams(params.detectionTuning);
    this.depthCharges.attachCombatParams({ damageParams: params.depthCharge });
    this.enemyAttack.attachDamageParams(params.depthCharge);
  }

  /** [C1] 탐지가 실제로 구동 중인가 — false면 게이지 0·safe 고정 */
  get detectionWired(): boolean {
    return this.detection.wired;
  }

  /** 탐지 관측자 — 세력과 무관하게 월드의 모든 적 함선이 같은 계약을 쓴다 */
  private get detectionObservers(): readonly { positionX: number; positionZ: number }[] {
    return [...this.ships, ...this.patrolFleet.aliveShips];
  }

  /** 폭뢰 피해 판정 대상 — 플레이어(잠수함) 하나 */
  private get depthChargeTargets(): readonly {
    entityId: number;
    positionX: number;
    positionY: number;
    positionZ: number;
  }[] {
    return [
      {
        entityId: PLAYER_ENTITY_ID,
        positionX: this.player.positionX,
        positionY: this.player.positionY,
        positionZ: this.player.positionZ,
      },
    ];
  }

  /**
   * 피해 전달 — **단일 창구**. 게임플레이는 선체 상태를 갖지 않으므로
   * 수신 포트가 없으면 아무것도 적용되지 않는다(임시 체력 생성 금지).
   */
  private forwardDamage(request: DamageRequest): DamageApplyResult {
    const receiver = this.damageReceiver;
    if (!receiver) {
      return { outcome: 'unwired', appliedDamage: 0, hull: UNWIRED_HULL_STATE };
    }
    return receiver.applyDamage(request);
  }

  /**
   * [B2] 식별 대상 선박 전체 — 적대·중립 화물선 + 경비함(patrol).
   * 세 세력이 한 목록에서 나오므로 렌더가 원형으로 세력을 추측할 필요가 없다.
   */
  private get identifiableShips(): readonly IdentifiableShipView[] {
    return [
      ...this.ships,
      ...this.patrolFleet.ships.map((ship) => ({
        id: ship.entityId,
        faction: ship.faction,
        positionX: ship.positionX,
        positionY: ship.positionY,
        positionZ: ship.positionZ,
        // 경비함은 피격 즉시 파괴된다 — hit/removed를 alive 하나로 표현한다.
        hit: !ship.alive,
        removed: !ship.alive,
      })),
    ];
  }

  /**
   * 세력 태그가 붙은 함선 목록 — 경제 반응·잠수함-함선 충돌·식별이 같은
   * 목록을 순회한다. [B1] 적대 1척 + 중립 1척이 동시에 들어 있다.
   */
  get ships(): readonly CargoShipSystem[] {
    return [this.cargoShip, ...this.otherShips];
  }

  /**
   * 읽기 전용 포즈 소스 — 계약 `SubmarinePoseSource` (INT-CORE-003).
   * 렌더 장면·카메라·프로펠러 주입용, composition root에서만 연결.
   */
  get poseSource(): SubmarinePoseSource {
    return this.player;
  }

  /**
   * 기지 경제 연결 [조립부 전용, INT-CORE-009 배선 스니펫] — 공식 경제
   * params(raw)와 리드 지갑을 주입하면 구매 판정 시스템을 만들고 장비
   * 카탈로그(가격·슬롯)를 적용한다.
   *
   * **저장은 연결하지 않는다** — 저장·롤백 순서는 리드 트랜잭션 소유이며
   * 게임플레이는 판정·적용·복원 포트만 제공한다 (저장 직접 호출 0회).
   */
  attachBaseEconomy(
    options:
      | {
          /** params/upgrades.json 내용 (공식) */
          readonly upgradesParams: unknown;
          /** params/equipment.json 내용 (공식) */
          readonly equipmentParams: unknown;
          /** 리드 MetaLoop 지갑 — 판정에만 쓰인다(차감은 트랜잭션 소유) */
          readonly wallet: PurchaseWalletPort;
          /** 저장에서 복원한 업그레이드 단계 (없으면 전부 0) */
          readonly restoredLevels?: Readonly<Record<string, number>>;
        }
      /** 조립부가 이미 만든 판정 시스템을 그대로 채택하는 경로 */
      | UpgradePurchaseSystem,
    /**
     * 저장 포트 — production은 **반드시 null**이다. 장비 저장은 리드
     * `EquipmentTransaction` 한 곳뿐이며(저장 책임 표) 게임플레이는 저장소에
     * 접근하지 않는다. null이 아닌 값이 오면 조립 규칙 위반이므로 무시한다.
     */
    savePort: null = null,
  ): UpgradePurchaseSystem {
    if (savePort !== null) {
      console.error('[GameplaySystems] 장비 저장 포트는 연결하지 않는다 (저장 책임 표) — 무시됨');
    }
    if (options instanceof UpgradePurchaseSystem) {
      this.purchaseSystem = options;
      return options;
    }
    const catalog = readOfficialUpgradeCatalog(options.upgradesParams);
    const purchase = new UpgradePurchaseSystem(catalog, options.wallet);
    if (options.restoredLevels) purchase.restoreLevels(options.restoredLevels);
    this.purchaseSystem = purchase;
    this.equipment.applyCatalog(readOfficialEquipmentCatalog(options.equipmentParams));
    return purchase;
  }

  /** 구매 판정 시스템 (미연결 시 null) — 기지 UI가 소비 */
  get upgradePurchase(): UpgradePurchaseSystem | null {
    return this.purchaseSystem;
  }

  /**
   * 계약 `UpgradePurchaseJudgePort`(+`UpgradeLevelsPort`) 구현체 —
   * 리드 `PurchaseTransaction` 생성자에 그대로 넘긴다. 미연결 시 null.
   */
  get purchaseJudge(): UpgradePurchaseSystem | null {
    return this.purchaseSystem;
  }

  /** 계약 `EquipmentChangeJudgePort` 구현체 — 리드 `EquipmentTransaction`에 주입 */
  get equipmentJudge(): EquipmentChangeJudgePort {
    return this.equipment;
  }

  /* ── 출항 중 획득량 (EconomyHud read-only source) ─────────────────────
   * 값은 실제 loot 회수·정산 상태에서만 파생된다 — 임시 숫자 없음.
   */

  /** 이번 출항에서 회수했으나 아직 정산되지 않은 일반 크레딧 */
  get sortiePendingCredits(): number {
    return this.economy.wallet.sortieCredits;
  }

  /** 이번 출항에서 확보한 희귀 부품 수 (획득 즉시 확정 — 손실 대상 아님) */
  get sortiePendingRareParts(): number {
    return this.economy.wallet.rareParts.length;
  }

  /**
   * 출항 준비 상태 — 리드 Departure command가 읽는 **게임플레이 측 판정**.
   * 저장·화면 전환·메타 상태 전이는 여기서 하지 않는다 (판단 재료만 제공).
   * `canLaunchSortie`(BASE 여부)는 리드 MetaLoop 소유이므로 인자로 받는다.
   */
  sortieReadiness(isBaseState: boolean): SortieReadiness {
    const blockers: string[] = [];
    if (!isBaseState) blockers.push('notInBase');

    const loadout = this.equipment.loadout;
    const loadoutValid =
      loadout.slotCapacity > 0 &&
      loadout.equipped.length > 0 &&
      loadout.equipped.length <= loadout.slotCapacity &&
      new Set(loadout.equipped).size === loadout.equipped.length &&
      loadout.equipped.every((id) =>
        (OFFICIAL_EQUIPMENT_IDS as readonly string[]).includes(id),
      );
    if (!loadoutValid) blockers.push('invalidLoadout');

    // 업그레이드 단계가 공식 카탈로그 상한 안에 있는지 (미연결이면 검사 없음)
    const purchase = this.purchaseSystem;
    const upgradesValid =
      purchase === null ||
      Object.entries(purchase.levelSnapshot).every(([id, level]) => {
        const entry = purchase.entries.find((candidate) => candidate.id === id);
        return entry !== undefined && level >= 0 && level <= entry.maxLevel;
      });
    if (!upgradesValid) blockers.push('invalidUpgrades');

    return {
      inBase: isBaseState,
      loadoutValid,
      upgradesValid,
      ready: isBaseState && loadoutValid && upgradesValid,
      blockers,
    };
  }

  /** 화물선 상태 소스 — 계약 타입으로 노출 (렌더 CargoShipVisual 주입용) */
  get cargoShipState(): CargoShipStateSource {
    return this.cargoShip;
  }

  initialize(_context: SystemContext): void {
    this.attachInput(window, document);
    // 개발 모드 params 핫리로드 — 검증을 통과한 값만 통지되므로 그대로 교체
    this.unsubscribeParamsReload =
      this.subscribeToParamsReload?.((next) => this.applyParams(next)) ?? null;
  }

  /** 유효(검증 통과)한 새 파라미터로 내부 참조 교체 */
  applyParams(params: GameParams): void {
    this.player.applyMovementParams(params.movement);
    this.torpedo.applyCombatParams(params.combat);
  }

  /**
   * 재출항 세션 초기화 — 상위 메타 루프가 출항을 시작할 때
   * (SortieSessionPort.start) 조립부가 호출하는 진입점이다.
   *
   * 되돌리는 것: 잠수함 위치·자세·관성, 어뢰 잔량·재장전·주행 중 어뢰,
   * 조준 상태, 입력 눌림 상태, 화물선, 월드 드롭·해저 재화·경비 요청,
   * 미정산 출항 크레딧.
   * 유지하는 것: 확정 크레딧·희귀 부품(영구분), 장비 장착·업그레이드 배율,
   * 협곡 레이아웃·충돌체(정적 지형은 세션마다 바뀌지 않는다).
   */
  resetSortieSession(params: GameParams): void {
    this.aim.endAim();
    this.input.reset();
    this.mouse.reset();
    this.player.resetTo({
      x: this.layout.submarineSpawn.x,
      y: 0,
      z: this.layout.submarineSpawn.z,
      headingRadians: this.layout.submarineSpawn.headingRadians,
    });
    this.torpedo.resetForNewSortie(params.combat.torpedoCapacity.value);
    this.equipment.refillDecoyStock(); // 출항당 보유 수 (공식 stockPerSortie)
    this.cargoShip.resetForNewSortie(this.targets);
    for (const ship of this.otherShips) ship.resetForNewSortie(this.targets);
    this.patrolFleet.resetForNewSortie();
    this.highValueTransport.resetForNewSortie();
    // [C1·C4] 출항 한정 상태 — 게이지·노출 위치·수중 폭뢰·쿨다운 초기화
    this.detection.resetForNewSortie();
    this.depthCharges.resetForNewSortie();
    this.enemyAttack.resetForNewSortie();
    this.economy.resetForNewSortie();
  }

  /** 실제 게임에서는 attachInput(window, document) — initialize가 호출 */
  attachInput(keySource: KeyEventSource, visibilitySource?: VisibilitySource): void {
    this.input.attach(keySource, visibilitySource);
    this.mouse.attach(keySource, visibilitySource);
  }

  detachInput(): void {
    this.input.detach();
    this.mouse.detach();
  }

  update(deltaSeconds: number): void {
    // 1) 조작·관성 적분 (Shift/Ctrl 연속 수직 이동 포함 — 입력은 폴링)
    this.player.update(deltaSeconds);

    // 2) 충돌 보정 — 통과 방지·밀어내기까지만 (피해 없음)
    const hull = computeHullSpheres(
      this.player.positionX,
      this.player.positionY,
      this.player.positionZ,
      this.player.headingRadians,
    );
    const push = this.collision.resolveHull(hull);
    if (push) this.player.applyExternalOffset(push.x, push.y, push.z);

    // 3) 화물선 항행·침몰 진행 — 함선 충돌·어뢰 판정보다 먼저 최신 위치로
    this.cargoShip.update(deltaSeconds);
    for (const ship of this.otherShips) ship.update(deltaSeconds);
    // 경비함 이동은 AI(리드 GuardShipAdapter)가 포트로 수행한다 — 여기서는
    // 파괴분 정리만 한다(수명주기). 판단·조종을 중복 실행하지 않는다.
    this.patrolFleet.update(deltaSeconds);

    // 10) [C1] 탐지 게이지 — 관측자·환경 입력에서 갱신 (unwired면 0 고정)
    this.detection.update(deltaSeconds);
    // 11) [C4] 폭뢰 신관·폭발 + 공격 쿨다운 시각 진행
    this.enemyAttack.update(deltaSeconds);
    this.depthCharges.update(deltaSeconds);

    // 3.5) 잠수함-함선 충돌 — 통과 방지·밀어냄만, 피해 없음 (5차 결의 1).
    //      어뢰 명중 판정과 동일한 박스 근사(hullBox)를 공유한다.
    this.resolveShipCollisions();

    // 4) 보정된 최종 높이로 심도 구간 판정 (depthChanged 발행)
    this.depth.update(deltaSeconds);

    // 5) 우클릭 토글 → 조준경 전환 (5차 결의 3 — HUD 조준 버튼과 동일 경로)
    const toggles = this.mouse.consumeAimToggleClicks();
    for (let i = 0; i < toggles; i += 1) this.aim.toggleAim();

    // 6) 마우스 이동 → 미세 조준각 (조준 중에만 반응, 감도·한계는 params)
    const move = this.mouse.consumeMoveDelta();
    this.aim.applyMouseDelta(move.dx, move.dy);
    this.aim.update(deltaSeconds);

    // 7) 좌클릭 발사 — **조준경 상태에서만** 발사 경로로 전달 (결의 2).
    //    비조준 좌클릭은 카메라 전용이므로 여기서 버린다 (fire 시도 아님).
    const fireClicks = this.mouse.consumeFireClicks();
    if (this.aim.aiming) {
      for (let i = 0; i < fireClicks; i += 1) this.aim.fireTorpedo();
    }

    // 8) 어뢰 주행·명중·사거리 판정 + 장비(디코이 수명·쿨다운)
    this.torpedo.update(deltaSeconds);
    this.equipment.update(deltaSeconds);

    // 9) 경제 — 격침·파괴 반응(드롭 생성·경비 요청) 및 접근 자동 회수
    this.economy.update(deltaSeconds);
  }

  /** 함선 박스 근사에 대한 잠수함 밀어냄 (함선은 밀리지 않음) — 결의 1 */
  private resolveShipCollisions(): void {
    for (let pass = 0; pass < 2; pass += 1) {
      let pushed = false;
      const spheres = computeHullSpheres(
        this.player.positionX,
        this.player.positionY,
        this.player.positionZ,
        this.player.headingRadians,
      );
      for (const ship of this.ships) {
        if (ship.removed) continue;
        for (const sphere of spheres) {
          const push = computeShipBoxPush(
            ship.hullBox,
            ship,
            sphere.x,
            sphere.y,
            sphere.z,
            sphere.radius,
          );
          if (push) {
            this.player.applyExternalOffset(push.x, push.y, push.z);
            pushed = true;
            break; // 위치가 바뀌었으므로 구를 다시 계산 (다음 패스)
          }
        }
        if (pushed) break;
      }
      if (!pushed) break;
    }
  }

  dispose(): void {
    this.unsubscribeParamsReload?.();
    this.unsubscribeParamsReload = null;
    this.economy.dispose(); // 해저 재화 등록·드롭 정리
    this.cargoShip.dispose(); // 표적 등록·참조 정리
    for (const ship of this.otherShips) ship.dispose();
    this.patrolFleet.dispose();
    this.detection.dispose();
    this.depthCharges.dispose();
    this.enemyAttack.dispose();
    this.detachInput();
  }
}
