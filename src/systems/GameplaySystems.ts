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

import type { GameParams } from '../contracts/params';
import type {
  AimSystem,
  CargoShipStateSource,
  DepthSystem,
  SubmarinePoseSource,
} from '../contracts/systems';
import type { EventBus } from '../core/EventBus';
import type { GameSystem, SystemContext } from '../core/GameSystem';
import { CargoShipSystem } from './CargoShipSystem';
import { CollisionWorld } from './collision/CollisionWorld';
import { computeHullSpheres } from './collision/submarineHull';
import { registerStartingAreaColliders } from './collision/startingArea';
import { KeyboardInput, type KeyEventSource, type VisibilitySource } from './KeyboardInput';
import { LayeredDepthSystem } from './LayeredDepthSystem';
import { MouseCombatInput } from './MouseCombatInput';
import { PeriscopeAimSystem } from './PeriscopeAimSystem';
import { StraightRunTorpedoSystem } from './StraightRunTorpedoSystem';
import { SubmarinePlayerController } from './SubmarinePlayerController';
import { TargetRegistry } from './TargetRegistry';

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
   * 이 인스턴스의 beginAim/endAim/fireTorpedo를 호출한다 (배선은 composition root).
   */
  readonly aim: AimSystem;
  /** 어뢰 상태 — remaining·reloadRemainingSeconds(UI), torpedoes(렌더 항적) */
  readonly torpedo: StraightRunTorpedoSystem;
  /** 전투 표적 등록소 — 명중 판정·리드샷 보조선이 같은 목록을 읽는다 */
  readonly targets: TargetRegistry;
  /**
   * 화물선 (VS 1척 [확정 §12.2]) — 계약 `CargoShipStateSource` 구현.
   * composition root가 렌더(CargoShipVisual)에 상태 소스로 1회 주입한다.
   */
  readonly cargoShip: CargoShipSystem;
  /**
   * 정적 충돌 월드. 시작 지역 임시 레이아웃이 기본 등록되어 있다.
   * 레벨 교체 시 clear() 후 재등록 — colliders는 시야 차폐와 공유(읽기 전용).
   */
  readonly collision: CollisionWorld;

  private readonly subscribeToParamsReload: ParamsReloadSubscribe | null;
  private unsubscribeParamsReload: (() => void) | null = null;
  /** 우클릭 홀드의 에지 검출용 직전 상태 */
  private previousAimHeld = false;

  constructor(
    bus: EventBus,
    params: GameParams,
    subscribeToParamsReload?: ParamsReloadSubscribe,
  ) {
    this.input = new KeyboardInput();
    this.mouse = new MouseCombatInput();
    this.player = new SubmarinePlayerController(params.movement, this.input);
    this.depth = new LayeredDepthSystem(bus, this.player);
    this.collision = new CollisionWorld();
    registerStartingAreaColliders(this.collision);
    this.targets = new TargetRegistry();
    this.cargoShip = new CargoShipSystem(bus, this.targets);
    this.torpedo = new StraightRunTorpedoSystem(
      bus,
      params.combat,
      this.player,
      this.collision,
      this.targets,
    );
    this.aim = new PeriscopeAimSystem(bus, this.depth, this.torpedo);
    this.subscribeToParamsReload = subscribeToParamsReload ?? null;
  }

  /**
   * 읽기 전용 포즈 소스 — 계약 `SubmarinePoseSource` (INT-CORE-003).
   * 렌더 장면·카메라·프로펠러 주입용, composition root에서만 연결.
   */
  get poseSource(): SubmarinePoseSource {
    return this.player;
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

    // 3) 보정된 최종 높이로 심도 구간 판정 (depthChanged 발행)
    this.depth.update(deltaSeconds);

    // 3.5) 화물선 항행·침몰 진행 — 어뢰 판정(7)보다 먼저 최신 위치로 갱신
    this.cargoShip.update(deltaSeconds);

    // 4) 마우스 조준 의도 → AimSystem 공용 진입점 (에지 단위 — HUD 버튼과 동일 경로)
    const aimHeld = this.mouse.aimHeld;
    if (aimHeld && !this.previousAimHeld) this.aim.beginAim();
    else if (!aimHeld && this.previousAimHeld) this.aim.endAim();
    this.previousAimHeld = aimHeld;

    // 5) 조준 유지 조건 감시 (잠망경 심도 이탈 시 자동 해제)
    this.aim.update(deltaSeconds);

    // 6) 좌클릭 발사 요청 — 클릭 1회 = fireTorpedo 1회 (성공 여부는 단일 fire 판정)
    const fireClicks = this.mouse.consumeFireClicks();
    for (let i = 0; i < fireClicks; i += 1) this.aim.fireTorpedo();

    // 7) 어뢰 주행·명중·사거리 판정
    this.torpedo.update(deltaSeconds);
  }

  dispose(): void {
    this.unsubscribeParamsReload?.();
    this.unsubscribeParamsReload = null;
    this.cargoShip.dispose(); // 표적 등록·참조 정리
    this.detachInput();
  }
}
