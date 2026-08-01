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
import { CargoShipSystem, cargoShipConfigFromOfficial } from './CargoShipSystem';
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
   * 정적 충돌 월드 — 공유 CanyonLayout.blocks를 충돌체로 해석해 등록한다
   * (렌더와 동일 데이터, INT-CORE-004). 레벨 교체 = 새 레이아웃 주입
   * (clear() 후 재등록) — colliders는 시야 차폐와 공유(읽기 전용).
   */
  readonly collision: CollisionWorld;
  /** 소비 중인 협곡 레이아웃 (단일 소스) — 렌더·검증 참조용 읽기 전용 */
  readonly layout: CanyonLayout;

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
    this.cargoShip = new CargoShipSystem(
      bus,
      this.targets,
      official ? cargoShipConfigFromOfficial(official.cargo, layout.seaSurfaceY) : null,
    );
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

  /** 세력 태그가 붙은 함선 목록 — 경제 반응·잠수함-함선 충돌이 순회한다 */
  get ships(): readonly CargoShipSystem[] {
    return [this.cargoShip];
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
    this.detachInput();
  }
}
