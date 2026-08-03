/**
 * 게임플레이 결정적 검증 (D+5 리뷰 스프린트 '이동·충돌' 범위).
 *
 * 브라우저 없이 시스템 로직만 고정 시나리오로 구동해 다음을 확인한다:
 *  1. params/*.json 로드·검증 경로가 실제 JSON으로 통과하는가
 *  2. 관성·선회·최고 속력이 params 값과 일치하는가 (하드코딩 검출)
 *  3. W 전진 / S 후진(전진의 비율 상한) / Shift·Ctrl 연속 상승 하강
 *  4. 수면 상한·해저 하한을 이탈하지 않는가
 *  5. 높이 기반 심도 3구간 판정 + depthChanged + 층 단위 요청 계약 유지
 *  6. 충돌(구·박스): 통과 방지·밀어내기·떨림 없음·끼임 없음
 *  7. delta time 크기와 무관하게 같은 결과가 나오는가 (프레임 독립성)
 *  8. 키 반복·포커스 상실·탭 전환 상황이 안전하게 처리되는가
 *
 * 실행: `node src/systems/__verification__/run.mjs` (러너가 params JSON을 읽어 주입)
 * 이 모듈은 Vite 번들 그래프에 포함되지 않는다 (main.ts에서 도달 불가).
 */

import { validateCombatParams } from '../../tools/combatParams';
import { DepthChargeRunSystem } from '../combat/DepthChargeRunSystem';
import { validateGameParams } from '../../config/validateParams';
import { EventBus } from '../../core/EventBus';
import type { DepthLayerId } from '../../contracts/events';
import { CollisionWorld } from '../collision/CollisionWorld';
import { computeHullSpheres } from '../collision/submarineHull';
import {
  CargoShipSystem,
  cargoShipConfigFromOfficial,
  type CargoShipConfig,
} from '../CargoShipSystem';
import type { SalvageSpawnPlanEntry } from '../../contracts/officialParams';
import { PLAYER_ENTITY_ID } from '../../contracts/guard';
import type {
  GuardShipAdapterConfig,
  GuardShipRequestPayload,
  NeutralShipHitPayload,
  TransportAttackedPayload,
} from '../../contracts/guard';
import { rewardDropTableIdFor } from '../../contracts/faction';
import type { DetectionStage } from '../../contracts/events';
import type {
  DamageRequest,
  DepthChargeDamageParams,
  EnemyAttackRequest,
  PlayerHullState,
} from '../../contracts/survival';
import type { FactionId } from '../../contracts/faction';
import type { GameParams } from '../../contracts/params';
import type { SystemContext } from '../../core/GameSystem';
import { GuardShipAdapter } from '../../core/GuardShipAdapter';
import {
  GuardIncidentLedger,
  GuardSpawnBridge,
  GuardSpawnCoordinator,
  NeutralIncidentBoundary,
} from '../../core/PveIntegration';
import { createProductionDestroyerAIFactory } from '../../core/destroyerAiFactory';
import { canyonHorizontalBounds } from '../collision/canyonBounds';
import {
  escortEngagementToAdapterConfig,
  HighValueTransportSystem,
} from '../faction/HighValueTransportSystem';
import { shipPlacementsFromOfficialCargo } from '../faction/shipPlacements';

/** 공식 세력 3종 — 계약 정본과 대조하는 검증 상수 */
const OFFICIAL_FACTIONS: readonly FactionId[] = ['hostile', 'neutral', 'patrol'];
import { BossWeakPointTarget, provisionalBossWeakPointConfig } from '../BossWeakPointTarget';
import { EconomySystem } from '../economy/EconomySystem';
import { EquipmentSystem } from '../EquipmentSystem';
import { computeShipBoxPush } from '../collision/shipHullBox';
import { GameplaySystems, type GameplayOfficialParams } from '../GameplaySystems';
import { KeyboardInput, type MovementInput, type VisibilitySource } from '../KeyboardInput';
import { LayeredDepthSystem } from '../LayeredDepthSystem';
import { SubmarineAimSystem } from '../SubmarineAimSystem';
import { aimForwardVector, clampAimAngles } from '../aimGeometry';
import { BASE_CAMERA_RADIANS_PER_PIXEL, PROVISIONAL_AIMING_PARAMS } from '../provisionalAiming';
import { TORPEDO_COLLISION_RADIUS } from '../collision/torpedoTubeSocket';
import { TorpedoTubeSocketRig } from '../../core/TorpedoTubeSocketRig';
import {
  UpgradePurchaseSystem,
  type PurchaseWalletPort,
} from '../economy/UpgradePurchaseSystem';
import {
  OFFICIAL_EQUIPMENT_IDS,
  OFFICIAL_UPGRADE_IDS,
  readOfficialCargoParams,
  readOfficialEconomyRuntime,
  readOfficialEquipmentCatalog,
  readOfficialUpgradeCatalog,
  upgradeCostAtLevel,
  type CargoRuntimeParams,
  type EconomyRuntimeParams,
  type EquipmentCatalog,
} from '../economy/officialEconomyCatalog';
import {
  DEFERRED_UPGRADE_CONSUMERS,
  UPGRADE_EFFECT_CONSUMERS,
} from '../economy/upgradeEffectConsumers';
import { PENDING_OFFICIAL_DATA } from '../economy/pendingOfficialData';
import { StraightRunTorpedoSystem } from '../StraightRunTorpedoSystem';
import { SubmarinePlayerController } from '../SubmarinePlayerController';
import { TargetRegistry, type CombatTarget } from '../TargetRegistry';
import {
  PROVISIONAL_REVERSE_MAX_RATIO,
  PROVISIONAL_VERTICAL_MAX_RATIO,
} from '../provisionalMovement';
import { SUBMARINE_MAX_Y, SUBMARINE_MIN_Y } from '../provisionalWorld';
import { STARTING_CANYON_LAYOUT } from '../../world/startingCanyonLayout';
import { blockToColliderBounds } from '../collision/startingArea';
import { SUBMARINE_HULL_RADIUS } from '../collision/submarineHull';

export interface VerificationResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface RawParamFiles {
  movement: unknown;
  detection: unknown;
  combat: unknown;
  crew: unknown;
  /** 공식 경제 params — 스프린트 A 마감 어댑터가 소비 */
  upgrades: unknown;
  equipment: unknown;
  /** 공식 경제 런타임 수치 (드롭·픽업·손실) — production 소비 전환분 */
  economy: unknown;
  /** 공식 화물선 수치 (항행·명중·침몰) */
  cargo: unknown;
}

/* 검증 전용 공식 params 보관 — 러너가 읽은 JSON을 runGameplayVerification이
 * 한 번 해석해 여기 담고, 각 시나리오 헬퍼가 **주입 경로로만** 소비한다.
 * (production 시스템은 이 변수를 보지 않는다 — 조립부 주입이 유일 경로다.) */
let testEquipmentCatalog: EquipmentCatalog | null = null;
let testEconomyParams: EconomyRuntimeParams | null = null;
let testCargoParams: CargoRuntimeParams | null = null;

/** 공식 params 묶음 (해석 완료분) — GameplaySystems 조립 주입용 */
function testOfficialParams(): GameplayOfficialParams | null {
  if (!testEconomyParams || !testCargoParams || !testEquipmentCatalog) return null;
  return {
    economy: testEconomyParams,
    cargo: testCargoParams,
    equipment: testEquipmentCatalog,
  };
}

/** 검증용 화물선 선체 치수 — 공식 params 도착 전 시나리오의 고정 픽스처 */
const TEST_CARGO_HULL = {
  halfLengthMeters: 10,
  halfBeamMeters: 2.5,
  judgmentDraftMeters: 4,
  freeboardMeters: 3,
} as const;

/** 검증에서 조작 시나리오를 서술하기 위한 가변 입력 스텁 */
class ScriptedInput implements MovementInput {
  throttleForward = false;
  reverse = false;
  turnLeft = false;
  turnRight = false;
  ascend = false;
  descend = false;

  release(): void {
    this.throttleForward = false;
    this.reverse = false;
    this.turnLeft = false;
    this.turnRight = false;
    this.ascend = false;
    this.descend = false;
  }
}

function simulate(
  controller: SubmarinePlayerController,
  seconds: number,
  deltaSeconds: number,
): void {
  const steps = Math.round(seconds / deltaSeconds);
  for (let i = 0; i < steps; i += 1) controller.update(deltaSeconds);
}

/** 충돌 보정 포함 시뮬레이션 (GameplaySystems.update와 동일한 순서) */
function simulateWithCollision(
  controller: SubmarinePlayerController,
  world: CollisionWorld,
  seconds: number,
  deltaSeconds: number,
  onFrame?: (controller: SubmarinePlayerController) => void,
): void {
  const steps = Math.round(seconds / deltaSeconds);
  for (let i = 0; i < steps; i += 1) {
    controller.update(deltaSeconds);
    const hull = computeHullSpheres(
      controller.positionX,
      controller.positionY,
      controller.positionZ,
      controller.headingRadians,
    );
    const push = world.resolveHull(hull);
    if (push) controller.applyExternalOffset(push.x, push.y, push.z);
    onFrame?.(controller);
  }
}

/** 가짜 키보드 이벤트 (Node의 전역 EventTarget/Event로 구동) */
function keyEvent(type: 'keydown' | 'keyup', code: string, repeat = false): Event {
  const event = new Event(type);
  Object.assign(event, { code, repeat });
  return event;
}

/** 가짜 마우스 이벤트 — button: 0=좌클릭(발사), 2=우클릭(조준) */
function mouseEvent(type: 'mousedown' | 'mouseup', button: number): Event {
  const event = new Event(type);
  Object.assign(event, { button });
  return event;
}

/** 전투 검증용 최소 조립 (빈 환경·빈 표적 — 필요한 것만 주입) */
function makeCombatRig(
  params: ReturnType<typeof validateGameParams>,
): {
  bus: EventBus;
  input: ScriptedInput;
  controller: SubmarinePlayerController;
  depth: LayeredDepthSystem;
  world: CollisionWorld;
  targets: TargetRegistry;
  equipment: EquipmentSystem;
  torpedo: StraightRunTorpedoSystem;
  aim: SubmarineAimSystem;
  socket: TorpedoTubeSocketRig;
} {
  const bus = new EventBus();
  const input = new ScriptedInput();
  const controller = new SubmarinePlayerController(params.movement, input);
  const depth = new LayeredDepthSystem(bus, controller);
  const world = new CollisionWorld();
  const targets = new TargetRegistry();
  const equipment = new EquipmentSystem();
  // 장비 성능은 공식 카탈로그에서만 온다 — 주입 없이는 발사가 성립하지 않는다
  if (testEquipmentCatalog) equipment.applyCatalog(testEquipmentCatalog);
  // 공식 소켓 rig 단일 인스턴스 — GameplaySystems와 동일한 배선 (스프린트 A
  // 정규화: 조준 카메라와 어뢰가 같은 rig의 두 소켓을 공유)
  const socket = new TorpedoTubeSocketRig(controller);
  const torpedo = new StraightRunTorpedoSystem(bus, params.combat, world, targets, equipment, socket);
  const aim = new SubmarineAimSystem(bus, controller, torpedo);
  socket.attachFineAimSource(aim);
  return { bus, input, controller, depth, world, targets, equipment, torpedo, aim, socket };
}

class FakeVisibilitySource extends EventTarget implements VisibilitySource {
  visibilityState: DocumentVisibilityState = 'visible';

  setHidden(): void {
    this.visibilityState = 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

export function runGameplayVerification(rawParams: RawParamFiles): VerificationResult[] {
  const results: VerificationResult[] = [];
  const check = (name: string, passed: boolean, detail: string): void => {
    results.push({ name, passed, detail });
  };

  // 1. 실제 params JSON이 검증기를 통과하는가 (실패 시 즉시 반환)
  const params = validateGameParams(rawParams);
  check('params: 4종 로드·범위 검증 통과', true, 'movement/detection/combat/crew');

  // 공식 경제·화물선·장비 params 해석 — 이후 시나리오는 전부 **주입**으로만
  // 소비한다 (시스템이 JSON을 읽는 경로는 없다, INT-CORE-011).
  testEquipmentCatalog = readOfficialEquipmentCatalog(rawParams.equipment);
  testEconomyParams = readOfficialEconomyRuntime(rawParams.economy);
  testCargoParams = readOfficialCargoParams(rawParams.cargo);
  check(
    '[ECON] 공식 경제·화물선 params 해석 — economy.json·cargo.json 주입 가능 형태',
    testEconomyParams !== null && testCargoParams !== null,
    `economy=${testEconomyParams !== null}, cargo=${testCargoParams !== null}`,
  );

  const stopSeconds = params.movement.stopInertiaSeconds.value;
  const turnSeconds = params.movement.turn90Seconds.value;
  const maxSpeed = params.movement.maxSpeedMetersPerSecond.value;
  const accelerationSeconds = params.movement.accelerationSeconds.value;
  const maxReverse = maxSpeed * PROVISIONAL_REVERSE_MAX_RATIO;
  const maxVertical = maxSpeed * PROVISIONAL_VERTICAL_MAX_RATIO;
  const dt = 1 / 120;

  // 2. 전진 가속 상한 + 정지 관성 (params 일치 — 하드코딩 검출)
  {
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    input.throttleForward = true;
    simulate(controller, accelerationSeconds + 1, dt);
    check(
      '이동: 가속 상한 = movement.json maxSpeedMetersPerSecond',
      Math.abs(controller.speed - maxSpeed) < 1e-9,
      `speed=${controller.speed.toFixed(3)} / max=${maxSpeed}`,
    );

    input.release();
    let elapsed = 0;
    while (controller.speed > 0 && elapsed < stopSeconds * 2) {
      controller.update(dt);
      elapsed += dt;
    }
    check(
      '이동: 정지 관성 = movement.json stopInertiaSeconds',
      Math.abs(elapsed - stopSeconds) <= dt * 2 && controller.speed === 0,
      `정지까지 ${elapsed.toFixed(3)}s (기대 ${stopSeconds}s ± ${(dt * 2).toFixed(3)}s)`,
    );
  }

  // 3. S 후진 — 상한은 전진의 비율, W 전환 시 제동 후 전진
  {
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    input.reverse = true;
    let minForward = 0;
    for (let i = 0; i < Math.round(4 / dt); i += 1) {
      controller.update(dt);
      minForward = Math.min(minForward, controller.forwardSpeedMetersPerSecond);
    }
    const forward = controller.forwardSpeedMetersPerSecond;
    const capOk = Math.abs(forward - -maxReverse) < 1e-9 && minForward >= -maxReverse - 1e-9;
    check(
      '후진: S 최고 속력 = 전진의 50% (forwardSpeed 부호 −, 상한 초과 없음)',
      capOk,
      `forward=${forward.toFixed(3)} / 기대 ${-maxReverse}`,
    );
    check(
      '포즈 계약: speed = |forwardSpeedMetersPerSecond| (비부호 크기 — INT-CORE-003)',
      controller.speed === Math.abs(forward) && controller.speed > 0,
      `speed=${controller.speed.toFixed(3)}, forward=${forward.toFixed(3)}`,
    );
    check(
      '후진: 선미(+Z) 방향 이동 (heading 0 기준)',
      controller.positionZ > 1 && Math.abs(controller.positionX) < 1e-9,
      `pos=(${controller.positionX.toFixed(3)}, ${controller.positionZ.toFixed(3)})`,
    );

    input.release();
    input.throttleForward = true;
    simulate(controller, stopSeconds * PROVISIONAL_REVERSE_MAX_RATIO + dt * 2, dt); // 제동 구간
    const braked = Math.abs(controller.speed) < 0.1;
    simulate(controller, 1, dt);
    check(
      '후진: 후진 중 W = 제동(0 교차 없음) 후 전진 가속',
      braked && controller.speed > 2,
      `제동 직후 |speed|<0.1: ${braked}, 이후 speed=${controller.speed.toFixed(3)}`,
    );
  }

  // 4. W+S 동시 입력 = 상쇄 (관성 감속과 동일)
  {
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    input.throttleForward = true;
    simulate(controller, accelerationSeconds + 1, dt);
    input.reverse = true; // W 유지 채 S 추가
    simulate(controller, stopSeconds + 0.1, dt);
    check(
      '이동: W+S 동시 입력 = 상쇄 → 관성 감속으로 정지 유지',
      controller.speed === 0,
      `speed=${controller.speed}`,
    );
  }

  // 5. 선회 — params 일치 + A/D는 속도(프로펠러 입력)에 무영향, 제자리 선회 유지
  {
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    input.turnLeft = true;
    simulate(controller, turnSeconds, dt);
    check(
      '선회: 90도 = movement.json turn90Seconds (A=좌, heading 증가)',
      Math.abs(controller.headingRadians - Math.PI / 2) < 1e-6,
      `heading=${controller.headingRadians.toFixed(6)}`,
    );
    check(
      '선회: 정지 상태 제자리 선회 유지 + A/D는 속도·위치에 무영향 (S7·S9)',
      controller.speed === 0 &&
        controller.positionX === 0 &&
        controller.positionZ === 0,
      `speed=${controller.speed}, pos=(${controller.positionX}, ${controller.positionZ})`,
    );

    input.release();
    input.turnRight = true;
    simulate(controller, turnSeconds * 2, dt);
    check(
      '선회: D=우 (heading 감소, 정규화 유지)',
      Math.abs(controller.headingRadians - -Math.PI / 2) < 1e-6,
      `heading=${controller.headingRadians.toFixed(6)}`,
    );
  }

  // 6. 잠수함 방향 기준 이동 — 선수 = 로컬 -Z (카메라와 무관)
  {
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    input.throttleForward = true;
    simulate(controller, 2, dt);
    check(
      '이동: heading 0 전진 = 월드 -Z (선수 = 로컬 -Z 규약)',
      Math.abs(controller.positionX) < 1e-9 && controller.positionZ < -1,
      `pos=(${controller.positionX.toFixed(3)}, ${controller.positionZ.toFixed(3)})`,
    );

    input.release();
    input.turnLeft = true;
    simulate(controller, turnSeconds, dt); // 관성 감속과 동시에 좌 90도
    input.release();
    const zBefore = controller.positionZ;
    input.throttleForward = true;
    simulate(controller, 2, dt);
    const zDrift = Math.abs(controller.positionZ - zBefore);
    check(
      '이동: 좌 90도 선회 후 전진 = 월드 -X (잠수함 기준 조작)',
      controller.positionX < -1 && zDrift < 1e-6,
      `x=${controller.positionX.toFixed(3)}, zDrift=${zDrift.toExponential(2)}`,
    );
  }

  // 7. Shift/Ctrl 연속 상승·하강 + 수직 상한·하한
  {
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    input.ascend = true;
    simulate(controller, accelerationSeconds, dt); // 상한 도달 직전까지 (수면 클램프 전)
    check(
      '수직: Shift 연속 상승 — 수직 최고 속력 = 전진의 50%',
      Math.abs(controller.verticalSpeed - maxVertical) < 1e-6 && controller.positionY > 1,
      `vy=${controller.verticalSpeed.toFixed(3)} / 기대 ${maxVertical}, y=${controller.positionY.toFixed(2)}`,
    );

    // 수직 관성 감속률 = maxVertical / stopInertiaSeconds (하드코딩 검출) —
    // 수면 상한 클램프에 걸리지 않도록 부분 가속 상태에서 측정한다
    const partial = new ScriptedInput();
    const partialController = new SubmarinePlayerController(params.movement, partial);
    partial.ascend = true;
    simulate(partialController, 1.2, dt);
    const vy0 = partialController.verticalSpeed;
    partial.release();
    let elapsed = 0;
    while (partialController.verticalSpeed > 0 && elapsed < stopSeconds * 2) {
      partialController.update(dt);
      elapsed += dt;
    }
    const expectedDecay = vy0 / (maxVertical / stopSeconds);
    const yAfterStop = partialController.positionY;
    simulate(partialController, 1, dt);
    check(
      '수직: 키 해제 = 관성 감속(정지 관성률) 후 높이 유지 (자동 복원 없음)',
      vy0 > 0 &&
        Math.abs(elapsed - expectedDecay) <= dt * 2 &&
        partialController.positionY === yAfterStop,
      `감속 ${elapsed.toFixed(3)}s (기대 ${expectedDecay.toFixed(3)}s), y=${partialController.positionY.toFixed(2)}`,
    );

    // 상한: 오래 상승해도 수면 상한 고정, 이탈 프레임 없음
    input.ascend = true;
    let maxObservedY = controller.positionY;
    for (let i = 0; i < Math.round(10 / dt); i += 1) {
      controller.update(dt);
      maxObservedY = Math.max(maxObservedY, controller.positionY);
    }
    check(
      '수직: 수면 상한 이탈 없음 (연속 상승 유지 시 상한 고정)',
      controller.positionY === SUBMARINE_MAX_Y &&
        maxObservedY <= SUBMARINE_MAX_Y + 1e-9,
      `y=${controller.positionY} (상한 ${SUBMARINE_MAX_Y})`,
    );

    // 하한: Ctrl 유지 시 해저 하한 고정
    input.release();
    input.descend = true;
    let minObservedY = controller.positionY;
    for (let i = 0; i < Math.round(15 / dt); i += 1) {
      controller.update(dt);
      minObservedY = Math.min(minObservedY, controller.positionY);
    }
    check(
      '수직: 해저 하한 이탈 없음 (연속 하강 유지 시 하한 고정)',
      controller.positionY === SUBMARINE_MIN_Y &&
        minObservedY >= SUBMARINE_MIN_Y - 1e-9,
      `y=${controller.positionY} (하한 ${SUBMARINE_MIN_Y})`,
    );
  }

  // 8. 높이 기반 심도 3구간 판정 + depthChanged
  {
    const bus = new EventBus();
    const emitted: DepthLayerId[] = [];
    bus.on('depthChanged', ({ layer }) => emitted.push(layer));
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    const depth = new LayeredDepthSystem(bus, controller);
    const step = (seconds: number): void => {
      for (let i = 0; i < Math.round(seconds / dt); i += 1) {
        controller.update(dt);
        depth.update(dt);
      }
    };

    check('심도: 시작 높이(0) 판정 = 순항', depth.currentLayer === 'cruise', depth.currentLayer);

    const visited = new Set<DepthLayerId>([depth.currentLayer]);
    input.ascend = true;
    step(12); // 상한(12.5)까지 — 잠망경 구간 진입
    visited.add(depth.currentLayer);
    const surfacedOk = depth.currentLayer === 'periscope' && emitted.length === 1;
    check('심도: 상승 → 잠망경 구간 판정 + depthChanged 1회', surfacedOk, `events=${emitted.join(',')}`);

    input.release();
    input.descend = true;
    step(20); // 하한(-5)까지 — 순항 경유 심해
    visited.add(depth.currentLayer);
    const seq =
      emitted.length === 3 &&
      emitted[0] === 'periscope' &&
      emitted[1] === 'cruise' &&
      emitted[2] === 'deep';
    check('심도: 하강 → 순항 경유 심해 (경계마다 depthChanged, 순서 일치)', seq, emitted.join(' → '));
    check(
      '심도: 도달 가능한 구간은 정확히 3개 (잠망경/순항/심해)',
      visited.size === 3 && depth.currentLayer === 'deep',
      [...visited].join(','),
    );
  }

  // 9. 층 단위 이동 계약(requestAscend/Descend) 유지 — 경계 초과 무시
  {
    const bus = new EventBus();
    const emitted: DepthLayerId[] = [];
    bus.on('depthChanged', ({ layer }) => emitted.push(layer));
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    const depth = new LayeredDepthSystem(bus, controller);

    depth.requestAscend(); // cruise → periscope
    const yAtPeriscope = controller.positionY;
    depth.requestAscend(); // 최상 구간 초과 — 무시
    const topOk =
      depth.currentLayer === 'periscope' &&
      emitted.length === 1 &&
      controller.positionY === yAtPeriscope &&
      controller.positionY >= 8;
    check('심도 계약: 층 단위 부상 + 최상 구간 초과 무시(이벤트 없음)', topOk, `y=${controller.positionY}, events=${emitted.join(',')}`);

    depth.requestDescend(); // periscope → cruise
    depth.requestDescend(); // cruise → deep
    depth.requestDescend(); // 최하 구간 초과 — 무시
    const bottomOk = depth.currentLayer === 'deep' && emitted.length === 3;
    check('심도 계약: 층 단위 잠항 + 최하 구간 초과 무시', bottomOk, emitted.join(' → '));
  }

  // 10. 충돌(구) — 통과 방지·정지 안정(떨림 없음)
  {
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    const world = new CollisionWorld();
    world.addSphere(0, 0, -20, 3);

    input.throttleForward = true;
    let minZ = 0;
    const tail: number[] = [];
    const totalSteps = Math.round(30 / (1 / 60));
    let frame = 0;
    simulateWithCollision(controller, world, 30, 1 / 60, (c) => {
      minZ = Math.min(minZ, c.positionZ);
      frame += 1;
      if (frame > totalSteps - 60) tail.push(c.positionZ);
    });
    // 접촉 정지 기대 위치: 바위 표면(-17) + 선체 반경(1) + 선수 오프셋(1.8) ≈ -14.2
    const restZ = controller.positionZ;
    const jitter = Math.max(...tail) - Math.min(...tail);
    check(
      '충돌(구): 계속 전진해도 관통 없음 + 접촉 지점 정지',
      minZ > -16 && restZ > -14.5 && restZ < -13.5,
      `restZ=${restZ.toFixed(3)} (기대 ≈ -14.2), minZ=${minZ.toFixed(3)}`,
    );
    check('충돌(구): 접촉 유지 중 떨림 없음 (마지막 1초 위치 변화 < 2cm)', jitter < 0.02, `jitter=${jitter.toFixed(5)}m`);
  }

  // 11. 충돌(박스, 시작 지역 기둥) — GameplaySystems 자동 등록 레이아웃
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const keySource = new EventTarget();
    systems.attachInput(keySource);
    keySource.dispatchEvent(keyEvent('keydown', 'KeyW'));

    let minZ = 0;
    const tail: number[] = [];
    const steps = Math.round(30 / (1 / 60));
    for (let i = 0; i < steps; i += 1) {
      systems.update(1 / 60);
      minZ = Math.min(minZ, systems.player.positionZ);
      if (i > steps - 60) tail.push(systems.player.positionZ);
    }
    // 원점에서 -Z 직진 → 기둥 1(전면 z≈-15.7)에 막힌다. 기대 정지 z ≈ -12.9
    const restZ = systems.player.positionZ;
    const jitter = Math.max(...tail) - Math.min(...tail);
    check(
      '충돌(박스): 시작 지역 기둥 통과 없음 + 접촉 정지 (임시 레이아웃)',
      minZ > -15.7 && restZ > -13.5 && restZ < -12.3,
      `restZ=${restZ.toFixed(3)} (기대 ≈ -12.9), minZ=${minZ.toFixed(3)}`,
    );
    check('충돌(박스): 접촉 유지 중 떨림 없음', jitter < 0.02, `jitter=${jitter.toFixed(5)}m`);
    systems.detachInput();
  }

  // 12. 충돌 끼임 방지 — 박스 내부에서 시작해도 탈출한다
  {
    const world = new CollisionWorld();
    world.addBox(-2, -2, -2, 2, 2, 2);
    const push = world.resolveHull([{ x: 0.5, y: 0, z: 0, radius: 1 }]);
    let escaped = false;
    if (push) {
      const x = 0.5 + push.x;
      const y = 0 + push.y;
      const z = 0 + push.z;
      const inside = x > -2 && x < 2 && y > -2 && y < 2 && z > -2 && z < 2;
      const clearOfSurface =
        x >= 3 - 1e-6 || x <= -3 + 1e-6 || y >= 3 - 1e-6 || y <= -3 + 1e-6 || z >= 3 - 1e-6 || z <= -3 + 1e-6;
      escaped = !inside && clearOfSurface;
    }
    check('충돌: 오브젝트 내부 끼임 시 가장 얕은 면으로 탈출 (관통·고착 방지)', escaped, JSON.stringify(push));
  }

  // 13. 프레임 독립성 — 30fps vs 240fps (수평·수직·선회 복합 시나리오)
  {
    const run = (stepSeconds: number): { x: number; z: number; y: number; heading: number; speed: number } => {
      const input = new ScriptedInput();
      const controller = new SubmarinePlayerController(params.movement, input);
      input.throttleForward = true;
      simulate(controller, 3, stepSeconds);
      input.release();
      input.turnLeft = true;
      simulate(controller, 2, stepSeconds);
      input.release();
      input.ascend = true;
      simulate(controller, 2, stepSeconds);
      input.release();
      input.reverse = true;
      simulate(controller, 2, stepSeconds);
      input.release();
      simulate(controller, 2, stepSeconds);
      return {
        x: controller.positionX,
        z: controller.positionZ,
        y: controller.positionY,
        heading: controller.headingRadians,
        speed: controller.speed,
      };
    };
    const coarse = run(1 / 30);
    const fine = run(1 / 240);
    const positionDiff = Math.hypot(coarse.x - fine.x, coarse.z - fine.z);
    const yDiff = Math.abs(coarse.y - fine.y);
    const headingDiff = Math.abs(coarse.heading - fine.heading);
    const speedDiff = Math.abs(coarse.speed - fine.speed);
    check(
      'delta time: 30fps vs 240fps 결과 일치 (프레임 독립성)',
      positionDiff < 0.75 && yDiff < 0.2 && headingDiff < 1e-3 && speedDiff < 0.4,
      `Δpos=${positionDiff.toFixed(4)}m, Δy=${yDiff.toFixed(4)}m, Δheading=${headingDiff.toExponential(2)}, Δspeed=${speedDiff.toFixed(4)}`,
    );

    const repeat = run(1 / 30);
    const deterministic =
      repeat.x === coarse.x &&
      repeat.z === coarse.z &&
      repeat.y === coarse.y &&
      repeat.heading === coarse.heading &&
      repeat.speed === coarse.speed;
    check('delta time: 동일 시나리오 재실행 = 완전 동일 결과', deterministic, '결정성 확인');
  }

  // 14. 충돌 정지 위치의 프레임 독립성
  {
    const run = (stepSeconds: number): number => {
      const input = new ScriptedInput();
      const controller = new SubmarinePlayerController(params.movement, input);
      const world = new CollisionWorld();
      world.addSphere(0, 0, -20, 3);
      input.throttleForward = true;
      simulateWithCollision(controller, world, 20, stepSeconds);
      return controller.positionZ;
    };
    const diff = Math.abs(run(1 / 30) - run(1 / 240));
    check('delta time: 충돌 접촉 정지 위치 30fps vs 240fps 일치', diff < 0.2, `Δz=${diff.toFixed(4)}m`);
  }

  // 15. 비정상 dt 방어 — 0·음수·NaN은 상태를 바꾸지 않는다
  {
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    input.throttleForward = true;
    input.ascend = true;
    controller.update(0);
    controller.update(-1);
    controller.update(Number.NaN);
    const unchanged =
      controller.speed === 0 &&
      controller.verticalSpeed === 0 &&
      controller.positionX === 0 &&
      controller.positionY === 0 &&
      controller.positionZ === 0;
    check('delta time: dt≤0·NaN 무시', unchanged, `speed=${controller.speed}, y=${controller.positionY}`);
  }

  // 16. 키보드 안전성 — 유지 입력·반복·포커스 상실·탭 전환
  {
    const keySource = new EventTarget();
    const visibility = new FakeVisibilitySource();
    const input = new KeyboardInput();
    input.attach(keySource, visibility);

    // 5차 결의 4 (키 스왑): Ctrl = 상승 / Shift = 하강 / E = 상승 병행 키
    keySource.dispatchEvent(keyEvent('keydown', 'ShiftLeft'));
    keySource.dispatchEvent(keyEvent('keydown', 'ShiftLeft', true)); // OS 키 반복
    const shiftDescends = input.descend && !input.ascend;
    keySource.dispatchEvent(keyEvent('keyup', 'ShiftLeft'));
    check(
      '입력: Shift = 하강 유지 입력 (결의 4 키 스왑, 반복 무해·keyup 해제)',
      shiftDescends && !input.descend,
      'hold → release',
    );

    keySource.dispatchEvent(keyEvent('keydown', 'ControlRight'));
    const ctrlAscends = input.ascend && !input.descend;
    keySource.dispatchEvent(keyEvent('keyup', 'ControlRight'));
    keySource.dispatchEvent(keyEvent('keydown', 'KeyE'));
    check(
      '입력: Ctrl(좌우 무관) = 상승, E = 상승 병행 키 (Ctrl+W 탭 닫힘 회피)',
      ctrlAscends && input.ascend,
      'Ctrl↑ / E↑',
    );
    keySource.dispatchEvent(keyEvent('keyup', 'KeyE'));

    keySource.dispatchEvent(keyEvent('keydown', 'KeyW'));
    keySource.dispatchEvent(keyEvent('keydown', 'ControlLeft'));
    const heldBeforeBlur = input.throttleForward && input.ascend;
    keySource.dispatchEvent(new Event('blur')); // 키가 눌린 채 포커스 상실
    check(
      '입력: 포커스 상실 시 눌린 키 전부 해제 (키 고착 방지)',
      heldBeforeBlur && !input.throttleForward && !input.ascend,
      'blur → reset',
    );

    keySource.dispatchEvent(keyEvent('keydown', 'KeyS'));
    keySource.dispatchEvent(keyEvent('keydown', 'ShiftRight'));
    visibility.setHidden(); // 키가 눌린 채 탭 전환
    check('입력: 탭 전환(visibility hidden) 시 키 상태 해제', !input.reverse && !input.descend, 'hidden → reset');

    input.detach();
    keySource.dispatchEvent(keyEvent('keydown', 'KeyW'));
    check('입력: detach 후 이벤트 무시', !input.throttleForward, 'detach → 리스너 해제');
  }

  // 17. 조립 통합 — W+Ctrl 이동·하강·구간 전이, blur 후 완전 정지
  {
    const bus = new EventBus();
    const emitted: DepthLayerId[] = [];
    bus.on('depthChanged', ({ layer }) => emitted.push(layer));

    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const keySource = new EventTarget();
    systems.attachInput(keySource);

    keySource.dispatchEvent(keyEvent('keydown', 'KeyW'));
    keySource.dispatchEvent(keyEvent('keydown', 'ShiftLeft')); // 결의 4: Shift = 하강
    for (let i = 0; i < Math.round(4 / dt); i += 1) systems.update(dt);

    const moved = systems.player.speed > 0 && systems.player.positionZ < -1;
    const dived =
      systems.depth.currentLayer === 'deep' &&
      emitted.length === 1 &&
      emitted[0] === 'deep' &&
      systems.player.positionY >= SUBMARINE_MIN_Y;
    check(
      '통합: W+Shift → 전진 + 연속 하강 + 심해 구간 전이 (결의 4 키 스왑)',
      moved && dived,
      `speed=${systems.player.speed.toFixed(2)}, y=${systems.player.positionY.toFixed(2)}, layer=${systems.depth.currentLayer}`,
    );

    keySource.dispatchEvent(new Event('blur'));
    for (let i = 0; i < Math.round(5 / dt); i += 1) systems.update(dt);
    check(
      '통합: 포커스 상실 후 수평·수직 관성 감속으로 완전 정지',
      systems.player.speed === 0 && systems.player.verticalSpeed === 0,
      `speed=${systems.player.speed}, vy=${systems.player.verticalSpeed}`,
    );

    check(
      '통합: 충돌체 집합 공유 노출 (시야 차폐 재사용 구조)',
      systems.collision.colliders.length > 0,
      `colliders=${systems.collision.colliders.length}개 (시작 지역 임시 레이아웃)`,
    );
    systems.detachInput();
  }

  // 18. 전 심도 조준 — 모든 유효 심도에서 진입, aimModeChanged 중복 없음
  {
    const rig = makeCombatRig(params);
    const aimEvents: boolean[] = [];
    rig.bus.on('aimModeChanged', ({ aiming }) => aimEvents.push(aiming));

    const began = rig.aim.beginAim(); // 순항 심도(초기 y=0) — 부상 없이 즉시 진입
    const beganAgain = rig.aim.beginAim(); // 중복 호출 — 이벤트 재발행 없음
    check(
      '조준: 순항 심도에서 조준 가능 (부상 요구 없음) + aimModeChanged{true} 1회',
      began &&
        beganAgain &&
        rig.aim.aiming &&
        rig.depth.currentLayer === 'cruise' &&
        aimEvents.length === 1 &&
        aimEvents[0] === true,
      `layer=${rig.depth.currentLayer}, events=${aimEvents.join(',')}`,
    );

    rig.aim.endAim();
    rig.aim.endAim(); // 중복 해제 — 이벤트 재발행 없음
    check(
      '조준: endAim → aimModeChanged{false} 1회 (중복 없음)',
      !rig.aim.aiming && aimEvents.length === 2 && aimEvents[1] === false,
      `events=${aimEvents.join(',')}`,
    );

    // 심도가 바뀌어도 조준은 유지된다 — 심도 조건 자체가 없다
    rig.aim.beginAim();
    rig.input.descend = true;
    for (let i = 0; i < Math.round(3 / dt); i += 1) {
      rig.controller.update(dt);
      rig.depth.update(dt);
      rig.aim.update(dt);
    }
    rig.input.release();
    check(
      '조준: 조준 중 심도가 바뀌어도 자동 해제되지 않음 (심도 조건 없음)',
      rig.aim.aiming && rig.depth.currentLayer === 'deep' && aimEvents.length === 3,
      `layer=${rig.depth.currentLayer}, aiming=${rig.aim.aiming}`,
    );
  }

  // 18b. 전 심도 조준 — 수면 근처·심해 경계에서도 진입 가능 + Y 불변
  {
    const depthCases: Array<{ label: string; y: number; layer: string }> = [
      { label: '수면 근처', y: SUBMARINE_MAX_Y, layer: 'periscope' },
      { label: '순항 심도', y: 0, layer: 'cruise' },
      { label: '심해', y: SUBMARINE_MIN_Y, layer: 'deep' },
    ];
    let allEntered = true;
    let allYStable = true;
    const detail: string[] = [];

    for (const testCase of depthCases) {
      const rig = makeCombatRig(params);
      rig.controller.setPositionY(testCase.y);
      rig.depth.update(dt);

      const yBeforeAim = rig.controller.positionY;
      const entered = rig.aim.beginAim();
      const yAfterAim = rig.controller.positionY;
      rig.aim.update(dt);
      const yWhileAiming = rig.controller.positionY;
      rig.aim.endAim();
      const yAfterRelease = rig.controller.positionY;

      const stable =
        yAfterAim === yBeforeAim &&
        yWhileAiming === yBeforeAim &&
        yAfterRelease === yBeforeAim;
      if (!entered || rig.depth.currentLayer !== testCase.layer) allEntered = false;
      if (!stable) allYStable = false;
      detail.push(`${testCase.label}(${rig.depth.currentLayer}) y=${yAfterRelease}`);
    }

    check('조준: 수면 근처·순항·심해 전 구간에서 조준 진입 가능', allEntered, detail.join(' / '));
    check(
      '조준: 진입·유지·해제 전후 잠수함 Y 변화 없음 (자동 부상·심도 보정 제거)',
      allYStable,
      detail.join(' / '),
    );
  }

  // 18c. 조준 중 기동 — 전후진·선회·상승·하강이 기존 물리 규칙 그대로 동작
  {
    const rig = makeCombatRig(params);
    rig.aim.beginAim();

    rig.input.throttleForward = true;
    simulate(rig.controller, 2, dt);
    const movedForward = rig.controller.forwardSpeedMetersPerSecond > 0;
    const cappedByPhysics = rig.controller.forwardSpeedMetersPerSecond <= maxSpeed + 1e-9;

    rig.input.release();
    rig.input.reverse = true;
    simulate(rig.controller, 4, dt);
    const reversed = rig.controller.forwardSpeedMetersPerSecond < 0;
    const reverseCapped =
      rig.controller.forwardSpeedMetersPerSecond >= -maxReverse - 1e-9;

    rig.input.release();
    rig.input.turnLeft = true;
    const headingBefore = rig.controller.headingRadians;
    simulate(rig.controller, turnSeconds, dt);
    const turned = Math.abs(rig.controller.headingRadians - headingBefore - Math.PI / 2) < 1e-6;

    rig.input.release();
    rig.input.ascend = true;
    const yBefore = rig.controller.positionY;
    simulate(rig.controller, 1, dt);
    const ascended = rig.controller.positionY > yBefore;
    rig.input.release();
    rig.input.descend = true;
    simulate(rig.controller, 2, dt);
    const descended = rig.controller.positionY < yBefore;
    rig.input.release();

    check(
      '조준 중 기동: W/S 전후진 허용 (기존 관성·상한 규칙 우회 없음)',
      movedForward && cappedByPhysics && reversed && reverseCapped && rig.aim.aiming,
      `forward 상한 ${maxSpeed}, 후진 상한 ${-maxReverse}`,
    );
    check(
      '조준 중 기동: A/D 선체 선회 허용 (선회 시간 = params)',
      turned && rig.aim.aiming,
      `90도 ${turnSeconds}s`,
    );
    check(
      '조준 중 기동: Ctrl/E 상승·Shift 하강 허용',
      ascended && descended && rig.aim.aiming,
      `y ${yBefore.toFixed(2)} → 상승 후 하강`,
    );
  }

  // 18d. 미세 조준 — clamp·로컬 좌표·해제 시 reset·감도
  {
    const rig = makeCombatRig(params);
    const limits = clampAimAngles(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, PROVISIONAL_AIMING_PARAMS);
    const lowerLimits = clampAimAngles(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, PROVISIONAL_AIMING_PARAMS);
    const degrees = (radians: number): number => (radians * 180) / Math.PI;

    const notAimingIgnored = (() => {
      rig.aim.applyMouseDelta(100, 100);
      return rig.aim.yawRadians === 0 && rig.aim.pitchRadians === 0;
    })();

    rig.aim.beginAim();
    rig.aim.applyMouseDelta(-10, 0); // 좌측 이동 → yaw 증가(좌현)
    const expectedYaw =
      10 * BASE_CAMERA_RADIANS_PER_PIXEL * PROVISIONAL_AIMING_PARAMS.aimMouseSensitivity;
    const sensitivityOk = Math.abs(rig.aim.yawRadians - expectedYaw) < 1e-9;
    check(
      '미세 조준: 비조준 시 무반응 + 감도 = aimMouseSensitivity 적용',
      notAimingIgnored && sensitivityOk,
      `yaw=${rig.aim.yawRadians.toFixed(4)} (감도 ${PROVISIONAL_AIMING_PARAMS.aimMouseSensitivity})`,
    );

    rig.aim.applyMouseDelta(-100000, -100000); // 상·좌 대량 입력 → clamp
    const yawClamped = Math.abs(degrees(rig.aim.yawRadians) - PROVISIONAL_AIMING_PARAMS.aimYawLimitDegrees) < 1e-9;
    const pitchUpClamped =
      Math.abs(degrees(rig.aim.pitchRadians) - PROVISIONAL_AIMING_PARAMS.aimPitchUpLimitDegrees) < 1e-9;
    rig.aim.applyMouseDelta(200000, 200000); // 하·우 대량 입력 → 반대편 clamp
    const yawClampedNeg = Math.abs(degrees(rig.aim.yawRadians) + PROVISIONAL_AIMING_PARAMS.aimYawLimitDegrees) < 1e-9;
    const pitchDownClamped =
      Math.abs(degrees(rig.aim.pitchRadians) + PROVISIONAL_AIMING_PARAMS.aimPitchDownLimitDegrees) < 1e-9;
    check(
      '미세 조준: yaw ±15° / pitch +10°·15° 하향으로 clamp (양수 크기 → 계산에서만 부호)',
      yawClamped && pitchUpClamped && yawClampedNeg && pitchDownClamped,
      `한계 yaw=${degrees(limits.yawRadians).toFixed(1)}°, pitchMax=${degrees(limits.pitchRadians).toFixed(1)}°, pitchMin=${degrees(lowerLimits.pitchRadians).toFixed(1)}°`,
    );

    rig.aim.endAim();
    const resetOk = rig.aim.yawRadians === 0 && rig.aim.pitchRadians === 0;
    rig.aim.beginAim();
    const startsAtBow = rig.aim.yawRadians === 0 && rig.aim.pitchRadians === 0;
    check(
      '미세 조준: 조준 해제 시 yaw·pitch reset — 다음 조준은 선수 정면에서 시작',
      resetOk && startsAtBow,
      `yaw=${rig.aim.yawRadians}, pitch=${rig.aim.pitchRadians}`,
    );

    // 로컬 좌표: A/D로 선체가 돌면 미세각은 그대로 유지되고 전방 벡터만 함께 회전
    rig.aim.applyMouseDelta(-500, 0);
    const yawBefore = rig.aim.yawRadians;
    const forwardBefore = rig.aim.forward;
    rig.input.turnLeft = true;
    simulate(rig.controller, turnSeconds, dt); // 좌 90도
    rig.input.release();
    const forwardAfter = rig.aim.forward;
    const expected = aimForwardVector(rig.controller.headingRadians, {
      yawRadians: yawBefore,
      pitchRadians: rig.aim.pitchRadians,
    });
    const rotatedWithHull =
      rig.aim.yawRadians === yawBefore &&
      Math.abs(forwardAfter.x - expected.x) < 1e-9 &&
      Math.abs(forwardAfter.z - expected.z) < 1e-9 &&
      Math.abs(forwardAfter.x - forwardBefore.x) > 0.5;
    check(
      '미세 조준: 잠수함 로컬 기준 — 선체 선회 시 미세각 유지·조준선 함께 회전',
      rotatedWithHull,
      `yaw 유지 ${yawBefore.toFixed(4)}, forward x ${forwardBefore.x.toFixed(3)} → ${forwardAfter.x.toFixed(3)}`,
    );
  }

  // 19. 발사 — 단발·재장전·잔량·torpedoFired·선수 생성
  {
    const rig = makeCombatRig(params);
    const fired: Array<{ originX: number; originZ: number }> = [];
    rig.bus.on('torpedoFired', (payload) => fired.push(payload));
    const capacity = params.combat.torpedoCapacity.value;
    const reloadSeconds = params.combat.torpedoReloadSeconds.value;
    const step = 1 / 60;

    const notAimingFire = !rig.aim.fireTorpedo();
    rig.aim.beginAim();
    const fire1 = rig.aim.fireTorpedo();
    const fire2 = rig.aim.fireTorpedo(); // 재장전 중 — 거부
    check(
      '발사: 미조준 거부 + 조준 중 1회 호출 = 정확히 1발 (재장전 중 추가 거부)',
      notAimingFire &&
        fire1 &&
        !fire2 &&
        rig.torpedo.remaining === capacity - 1 &&
        rig.torpedo.torpedoes.length === 1 &&
        fired.length === 1,
      `remaining=${rig.torpedo.remaining}, active=${rig.torpedo.torpedoes.length}`,
    );

    const origin = fired[0];
    const snapshot = rig.torpedo.torpedoes[0];
    const bowSpawnOk =
      origin !== undefined &&
      snapshot !== undefined &&
      Math.abs(origin.originX) < 1e-9 &&
      origin.originZ < -3 && // heading 0 선수 = -Z — 프로펠러(+Z 선미) 반대편
      snapshot.y === rig.controller.positionY;
    check(
      '발사: 어뢰는 선수(-Z) 발사 지점에서 생성 (발사 시점 높이 유지)',
      bowSpawnOk,
      `origin=(${origin?.originX.toFixed(2)}, ${origin?.originZ.toFixed(2)}), y=${snapshot?.y.toFixed(2)}`,
    );

    check(
      '발사: 재장전 시작 = combat.json torpedoReloadSeconds',
      rig.torpedo.reloadRemainingSeconds === reloadSeconds,
      `reload=${rig.torpedo.reloadRemainingSeconds}s`,
    );

    for (let i = 0; i < Math.round((reloadSeconds - 0.5) / step); i += 1) rig.torpedo.update(step);
    const duringReload = !rig.aim.fireTorpedo();
    for (let i = 0; i < Math.round(1 / step); i += 1) rig.torpedo.update(step);
    const afterReload = rig.aim.fireTorpedo();
    check(
      '발사: 재장전 경과 전 거부 → 경과 후 허용',
      duringReload && afterReload && rig.torpedo.remaining === capacity - 2,
      `remaining=${rig.torpedo.remaining}`,
    );

    for (let i = 0; i < Math.round((reloadSeconds + 0.5) / step); i += 1) rig.torpedo.update(step);
    const lastFire = rig.aim.fireTorpedo(); // 마지막 1발 (capacity 3 기준)
    const emptyFire = rig.aim.fireTorpedo(); // 잔량 0 — 거부
    check(
      '발사: 잔량 0 = 거부, torpedoFired는 성공 횟수만큼만 발행',
      lastFire && !emptyFire && rig.torpedo.remaining === 0 && fired.length === capacity,
      `remaining=${rig.torpedo.remaining}, fired=${fired.length}/${capacity}`,
    );
  }

  // 20. 어뢰 직선 주행 + 최대 사거리 초과 시 제거 (빗나간 어뢰 정리)
  {
    const rig = makeCombatRig(params);
    rig.aim.beginAim();
    rig.aim.fireTorpedo();
    const step = 1 / 60;
    const speed = rig.torpedo.torpedoSpeedMetersPerSecond;

    for (let i = 0; i < Math.round(2 / step); i += 1) rig.torpedo.update(step);
    const midFlight = rig.torpedo.torpedoes[0];
    const straight =
      midFlight !== undefined && Math.abs(midFlight.x) < 1e-9 && midFlight.z < -30;
    check('어뢰: 선수 방향 직선 비행 (heading 0 → x 고정, -Z 전진)', straight, `pos=(${midFlight?.x}, ${midFlight?.z.toFixed(1)})`);

    // 사거리 90m / 속력 20m/s ≈ 4.5s — 여유를 두고 6초까지 진행
    for (let i = 0; i < Math.round(4 / step); i += 1) rig.torpedo.update(step);
    check(
      '어뢰: 최대 사거리 초과 시 정상 제거 (표적 없음 = 빗나감)',
      rig.torpedo.torpedoes.length === 0,
      `${speed}m/s × 사거리 초과 후 active=${rig.torpedo.torpedoes.length}`,
    );
  }

  // 21. 함선 명중 — 어뢰 1발당 통지 정확히 1회 (중복 명중 없음)
  {
    const rig = makeCombatRig(params);
    let hits = 0;
    let lastHitZ = 0;
    const cargo: CombatTarget = {
      id: 901,
      faction: 'hostile',
      positionX: 0,
      positionY: 13,
      positionZ: -40,
      velocityX: 0,
      velocityZ: 0,
      hitRadius: 4,
      onTorpedoHit(_hitX, hitZ) {
        hits += 1;
        lastHitZ = hitZ;
      },
    };
    rig.targets.register(cargo);

    rig.aim.beginAim();
    rig.aim.fireTorpedo();
    const step = 1 / 60;
    for (let i = 0; i < Math.round(6 / step); i += 1) rig.torpedo.update(step);

    check(
      '어뢰: 함선 명중 통지 정확히 1회 + 어뢰 즉시 제거 (중복 명중 없음)',
      hits === 1 && rig.torpedo.torpedoes.length === 0 && lastHitZ > -40 && lastHitZ < -35,
      `hits=${hits}, hitZ=${lastHitZ.toFixed(2)}`,
    );
  }

  // 22. 환경 명중 — 지형 충돌 시 제거 (표적 통지 없음)
  {
    const rig = makeCombatRig(params);
    let hits = 0;
    rig.targets.register({
      id: 902,
      faction: 'hostile',
      positionX: 50,
      positionY: 13,
      positionZ: -80,
      velocityX: 0,
      velocityZ: 0,
      hitRadius: 4,
      onTorpedoHit() {
        hits += 1;
      },
    });
    rig.depth.requestAscend(); // y = 10.25
    rig.world.addBox(-5, 8, -30, 5, 13, -28); // 어뢰 고도를 가로막는 벽

    rig.aim.beginAim();
    rig.aim.fireTorpedo();
    const step = 1 / 60;
    for (let i = 0; i < Math.round(2 / step); i += 1) rig.torpedo.update(step);
    check(
      '어뢰: 환경(지형) 충돌 시 1회만 소멸 — 표적 통지 없음',
      rig.torpedo.torpedoes.length === 0 && hits === 0,
      `active=${rig.torpedo.torpedoes.length}, targetHits=${hits}`,
    );
  }

  // 23. 입력 소스 동등성 — 마우스 경로 vs HUD(직접 호출) 경로 완전 동일
  {
    const runScenario = (
      useMouse: boolean,
    ): { aiming: boolean; remaining: number; reload: number; count: number; x: number; z: number } => {
      const bus = new EventBus();
      const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
      const keySource = new EventTarget();
      systems.attachInput(keySource);

      if (useMouse) {
        keySource.dispatchEvent(mouseEvent('mousedown', 2)); // 우클릭 토글 = 조준경 진입
        systems.update(dt);
        keySource.dispatchEvent(mouseEvent('mousedown', 0)); // 조준경 상태 좌클릭 = 발사
        systems.update(dt);
      } else {
        systems.update(dt);
        systems.aim.beginAim(); // HUD 조준 버튼과 동일한 공용 진입점
        systems.aim.fireTorpedo(); // HUD 발사 버튼과 동일한 fire 경로
        systems.update(dt);
      }

      const torpedo = systems.torpedo.torpedoes[0];
      const state = {
        aiming: systems.aim.aiming,
        remaining: systems.torpedo.remaining,
        reload: systems.torpedo.reloadRemainingSeconds,
        count: systems.torpedo.torpedoes.length,
        x: torpedo?.x ?? Number.NaN,
        z: torpedo?.z ?? Number.NaN,
      };
      systems.detachInput();
      return state;
    };

    const viaMouse = runScenario(true);
    const viaHud = runScenario(false);
    const identical =
      viaMouse.aiming === viaHud.aiming &&
      viaMouse.remaining === viaHud.remaining &&
      viaMouse.reload === viaHud.reload &&
      viaMouse.count === viaHud.count &&
      viaMouse.x === viaHud.x &&
      viaMouse.z === viaHud.z;
    check(
      '동등성: 마우스(우클릭·좌클릭)와 HUD 버튼 경로의 조준·발사·재장전 상태 완전 동일',
      identical && viaMouse.count === 1,
      `mouse=${JSON.stringify(viaMouse)} hud=${JSON.stringify(viaHud)}`,
    );
  }

  // 24. 마우스 안전성 — 연속 클릭 1발 제한, blur 시 조준 해제, 컨텍스트 메뉴 방지
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const keySource = new EventTarget();
    systems.attachInput(keySource);
    systems.depth.requestAscend();

    keySource.dispatchEvent(mouseEvent('mousedown', 2));
    systems.update(dt);
    keySource.dispatchEvent(mouseEvent('mousedown', 0));
    keySource.dispatchEvent(mouseEvent('mousedown', 0));
    keySource.dispatchEvent(mouseEvent('mousedown', 0)); // 같은 프레임 연타
    systems.update(dt);
    check(
      '발사: 같은 프레임 연타에도 재장전 판정으로 1발만 생성',
      systems.torpedo.torpedoes.length === 1 && systems.torpedo.remaining === 2,
      `active=${systems.torpedo.torpedoes.length}, remaining=${systems.torpedo.remaining}`,
    );

    // 토글 상태는 홀드가 아니므로 blur에도 유지된다 (결의 3) —
    // 대기 중이던 클릭 에지만 폐기되어 지연 발사가 없다
    const aimingBeforeBlur = systems.aim.aiming;
    keySource.dispatchEvent(mouseEvent('mousedown', 0)); // 소비 전 클릭
    keySource.dispatchEvent(new Event('blur'));
    systems.update(dt);
    check(
      '조준: blur 시 대기 클릭 폐기 + 조준경 토글 상태는 유지 (홀드 아님)',
      aimingBeforeBlur && systems.aim.aiming && systems.torpedo.torpedoes.length === 1,
      `aiming=${systems.aim.aiming}, active=${systems.torpedo.torpedoes.length}`,
    );

    const contextMenu = new Event('contextmenu', { cancelable: true });
    keySource.dispatchEvent(contextMenu);
    check('입력: 우클릭 컨텍스트 메뉴 방지 (조준경 토글 보호)', contextMenu.defaultPrevented, 'preventDefault');
    systems.detachInput();
  }

  // 24b. 공유 CanyonLayout 소비 — 블록↔충돌체 1:1 정합 (INT-CORE-004)
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const layout = systems.layout;
    const colliders = systems.collision.colliders;

    check(
      '레이아웃: 블록 수 = 충돌체 수 (자체 수식·복제 없음)',
      layout === STARTING_CANYON_LAYOUT && colliders.length === layout.blocks.length,
      `blocks=${layout.blocks.length}, colliders=${colliders.length}`,
    );

    let mismatches = 0;
    for (let i = 0; i < layout.blocks.length; i += 1) {
      const block = layout.blocks[i];
      const collider = colliders[i];
      if (!block || !collider || collider.kind !== 'box') {
        mismatches += 1;
        continue;
      }
      const expected = blockToColliderBounds(block, layout.floorY);
      const equal =
        collider.minX === expected.minX &&
        collider.minY === expected.minY &&
        collider.minZ === expected.minZ &&
        collider.maxX === expected.maxX &&
        collider.maxY === expected.maxY &&
        collider.maxZ === expected.maxZ;
      if (!equal) mismatches += 1;
    }
    check(
      '레이아웃: 각 블록의 중심·크기 ↔ 충돌체 경계 정합 (순서 1:1)',
      mismatches === 0,
      `불일치 ${mismatches}/${layout.blocks.length}`,
    );

    check(
      '레이아웃: 잠수함 수직 상한 = seaSurfaceY − 선체 반경 (파생, 복제 없음)',
      SUBMARINE_MAX_Y === layout.seaSurfaceY - SUBMARINE_HULL_RADIUS &&
        SUBMARINE_MIN_Y === layout.floorY + SUBMARINE_HULL_RADIUS,
      `maxY=${SUBMARINE_MAX_Y} (수면 ${layout.seaSurfaceY} − ${SUBMARINE_HULL_RADIUS}), minY=${SUBMARINE_MIN_Y}`,
    );

    check(
      '레이아웃: 화물선 흘수선 = 공유 seaSurfaceY',
      systems.cargoShipState.positionY === layout.seaSurfaceY,
      `cargoY=${systems.cargoShipState.positionY}`,
    );
    systems.dispose();
  }

  // 25. 화물선 — 직선 왕복 항행 + 해수면 높이 유지
  {
    const bus = new EventBus();
    const targets = new TargetRegistry();
    const config: CargoShipConfig = {
      id: 900,
      waypointA: { x: 0, z: -30 },
      waypointB: { x: 20, z: -30 },
      surfaceY: STARTING_CANYON_LAYOUT.seaSurfaceY,
      speedMetersPerSecond: 4,
      hitRadius: 9,
      sinkDurationSeconds: 2,
      hullBox: TEST_CARGO_HULL,
      faction: 'hostile',
    };
    const ship = new CargoShipSystem(bus, targets, config);
    const step = 1 / 60;

    const registered = targets.list.length === 1 && targets.list[0]?.id === 900;
    check('화물선: TargetRegistry에 표적으로 조회 가능', registered, `targets=${targets.list.length}`);

    let maxX = ship.positionX;
    let zDrift = 0;
    let surfaceHeld = true;
    for (let i = 0; i < Math.round(4 / step); i += 1) {
      ship.update(step);
      maxX = Math.max(maxX, ship.positionX);
      zDrift = Math.max(zDrift, Math.abs(ship.positionZ - -30));
      if (ship.positionY !== STARTING_CANYON_LAYOUT.seaSurfaceY) surfaceHeld = false;
    }
    const outboundOk =
      Math.abs(ship.positionX - 16) < 1e-6 && ship.velocityX > 0 && zDrift < 1e-9;
    check('화물선: 직선 항행 (경로 축 이탈 없음, 속도 = 임시값)', outboundOk, `x=${ship.positionX.toFixed(2)}, zDrift=${zDrift.toExponential(1)}`);

    for (let i = 0; i < Math.round(3 / step); i += 1) {
      ship.update(step);
      maxX = Math.max(maxX, ship.positionX);
      if (ship.positionY !== STARTING_CANYON_LAYOUT.seaSurfaceY) surfaceHeld = false;
    }
    // 4+3초 × 4m/s = 28m — 20m 지점(B)에서 반전해 x=12로 복귀 중이어야 한다
    const bounced =
      maxX <= 20 + 1e-6 && Math.abs(ship.positionX - 12) < 1e-6 && ship.velocityX < 0;
    check('화물선: 끝점 도달 시 왕복 반전 (경로 초과 없음)', bounced, `maxX=${maxX.toFixed(3)}, x=${ship.positionX.toFixed(2)}`);
    check('화물선: 해수면 높이 유지 (전 프레임)', surfaceHeld && ship.positionY === STARTING_CANYON_LAYOUT.seaSurfaceY, `y=${ship.positionY}`);

    const heading = ship.headingRadians; // 복귀 중 (-X 방향) → 선수 -X: h = +π/2
    check('화물선: 선수각 = 진행 방향 (conventions 선수 규약)', Math.abs(heading - Math.PI / 2) < 1e-6, `heading=${heading.toFixed(4)}`);
  }

  // 26. 화물선 — 왕복 궤적의 프레임 독립성 (반전 잔여 이동량 이월)
  {
    const run = (stepSeconds: number): number => {
      const bus = new EventBus();
      const targets = new TargetRegistry();
      const ship = new CargoShipSystem(bus, targets, {
        id: 900,
        waypointA: { x: 0, z: -30 },
        waypointB: { x: 10, z: -30 },
        surfaceY: STARTING_CANYON_LAYOUT.seaSurfaceY,
        speedMetersPerSecond: 4,
        hitRadius: 9,
        sinkDurationSeconds: 2,
        hullBox: TEST_CARGO_HULL,
        faction: 'hostile',
      });
      const steps = Math.round(10 / stepSeconds);
      for (let i = 0; i < steps; i += 1) ship.update(stepSeconds);
      return ship.positionX;
    };
    const diff = Math.abs(run(1 / 30) - run(1 / 240));
    check('화물선: 30fps vs 240fps 왕복 위치 일치', diff < 1e-6, `Δx=${diff.toExponential(2)}`);
  }

  // 27. 화물선 — 어뢰 명중 1회: torpedoHit 1회·hit 고정·표적 제거·중복 침몰 방지
  {
    const rig = makeCombatRig(params);
    const hitEvents: Array<{ targetId: number; x: number; z: number }> = [];
    rig.bus.on('torpedoHit', (payload) => hitEvents.push(payload));
    const ship = new CargoShipSystem(rig.bus, rig.targets, {
      id: 900,
      waypointA: { x: 0, z: -30 },
      waypointB: { x: 60, z: -30 },
      surfaceY: STARTING_CANYON_LAYOUT.seaSurfaceY,
      speedMetersPerSecond: 4,
      hitRadius: 9,
      sinkDurationSeconds: 2,
      hullBox: TEST_CARGO_HULL,
      faction: 'hostile',
    });

    // 수상 화물선 흘수 높이에서 수평 사격 (심도는 조준 조건이 아니라 탄도 조건)
    rig.controller.setPositionY(STARTING_CANYON_LAYOUT.seaSurfaceY - 2);
    rig.aim.beginAim();
    rig.aim.fireTorpedo();
    const step = 1 / 60;
    for (let i = 0; i < Math.round(3 / step); i += 1) {
      ship.update(step);
      rig.torpedo.update(step);
    }

    const hitOnce =
      hitEvents.length === 1 &&
      hitEvents[0]?.targetId === 900 &&
      ship.hit &&
      ship.velocityX === 0 &&
      ship.velocityZ === 0 &&
      rig.torpedo.torpedoes.length === 0;
    check(
      '화물선: 어뢰 명중 → torpedoHit 정확히 1회 + 항행 정지',
      hitOnce,
      `events=${hitEvents.length}, hit=${ship.hit}, target=${hitEvents[0]?.targetId}`,
    );
    check(
      '화물선: 명중 즉시 표적 목록에서 제거 — 추가 어뢰가 중복 침몰을 시작하지 못함',
      rig.targets.list.length === 0,
      `targets=${rig.targets.list.length}`,
    );

    const progressBefore = ship.sinkProgress;
    ship.onTorpedoHit(ship.positionX, ship.positionZ, 1); // 중복 통지 시도
    check(
      '화물선: 중복 명중 통지 무시 (이벤트·침몰 재시작 없음)',
      hitEvents.length === 1 && ship.sinkProgress === progressBefore,
      `events=${hitEvents.length}`,
    );
  }

  // 28. 화물선 — 침몰 진행(시간축 게임플레이 소유) → 완료 시 removed
  {
    const bus = new EventBus();
    const targets = new TargetRegistry();
    const ship = new CargoShipSystem(bus, targets, {
      id: 900,
      waypointA: { x: 0, z: -30 },
      waypointB: { x: 20, z: -30 },
      surfaceY: STARTING_CANYON_LAYOUT.seaSurfaceY,
      speedMetersPerSecond: 4,
      hitRadius: 9,
      sinkDurationSeconds: 2,
      hullBox: TEST_CARGO_HULL,
      faction: 'hostile',
    });
    ship.onTorpedoHit(ship.positionX, ship.positionZ, 1);
    const step = 1 / 60;

    for (let i = 0; i < Math.round(1 / step); i += 1) ship.update(step);
    const midSink =
      ship.sinkProgress > 0.45 && ship.sinkProgress < 0.55 && !ship.removed && ship.hit;
    check('화물선: sinkProgress 0→1 진행 (침몰 시간축 = 게임플레이)', midSink, `progress=${ship.sinkProgress.toFixed(3)}`);

    for (let i = 0; i < Math.round(1.2 / step); i += 1) ship.update(step);
    check(
      '화물선: 침몰 완료 → sinkProgress=1·removed=true (렌더 정리 신호)',
      ship.sinkProgress === 1 && ship.removed,
      `progress=${ship.sinkProgress}, removed=${ship.removed}`,
    );
  }

  // 29. 조립 통합 — GameplaySystems 기본 화물선: 계약 상태 노출·항행·정리
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const state = systems.cargoShipState;

    const inRegistry = systems.targets.list.some((target) => target.id === state.id);
    check(
      '화물선: 기본 조립에서 1척 생성 + TargetRegistry 등록 + 계약 상태 노출',
      inRegistry && state.positionY === STARTING_CANYON_LAYOUT.seaSurfaceY && !state.hit && !state.removed,
      `id=${state.id}, y=${state.positionY}`,
    );

    const xBefore = state.positionX;
    for (let i = 0; i < Math.round(2 / dt); i += 1) systems.update(dt);
    check(
      '화물선: 조립 update 경로에서 항행 진행 (그래픽 폴링용 상태 갱신)',
      state.positionX !== xBefore && state.positionY === STARTING_CANYON_LAYOUT.seaSurfaceY,
      `x: ${xBefore.toFixed(2)} → ${state.positionX.toFixed(2)}`,
    );

    systems.dispose();
    check(
      '화물선: dispose 시 표적 등록·참조 정리 (removed 신호)',
      systems.targets.list.length === 0 && state.removed,
      `targets=${systems.targets.list.length}, removed=${state.removed}`,
    );
  }

  // 30. 비조준 발사 거부 (5차 결의 2) + 우클릭 토글 (결의 3)
  {
    const rig = makeCombatRig(params);
    const fired: unknown[] = [];
    rig.bus.on('torpedoFired', (payload) => fired.push(payload));

    const rejected = !rig.aim.fireTorpedo(); // 비조준 발사 시도 (HUD 버튼 경로)
    check(
      '전투: 비조준 발사 절대 불가 — 결과는 발사가 아니라 aimRequired 신호',
      rejected &&
        rig.aim.aimRequiredCount === 1 &&
        rig.torpedo.torpedoes.length === 0 &&
        fired.length === 0 &&
        rig.torpedo.remaining === params.combat.torpedoCapacity.value,
      `aimRequired=${rig.aim.aimRequiredCount}, fired=${fired.length}`,
    );

    const on = rig.aim.toggleAim();
    const stateOn = rig.aim.aiming;
    const off = rig.aim.toggleAim(); // 조준 중 우클릭 재입력 = 해제
    const stateOff = rig.aim.aiming;
    const onAgain = rig.aim.toggleAim();
    check(
      '조준: 우클릭 토글 — 진입/재입력 해제/재진입 (홀드 아님)',
      on && stateOn && !off && !stateOff && onAgain && rig.aim.aiming,
      `on→off→on = ${on},${off},${onAgain}`,
    );
  }

  // 30b. 마우스 경로의 토글·카메라 규칙 (GameplaySystems 배선)
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const keySource = new EventTarget();
    systems.attachInput(keySource);
    systems.depth.requestAscend();

    // 비조준 좌클릭 = 카메라 전용 — 발사 시도조차 아님 (aimRequired 미발생)
    keySource.dispatchEvent(mouseEvent('mousedown', 0));
    systems.update(dt);
    const cameraOnly =
      systems.torpedo.torpedoes.length === 0 && systems.aim.aimRequiredCount === 0;
    check('전투: 비조준 좌클릭 = 카메라 전용 (발사 시도 아님)', cameraOnly, `active=${systems.torpedo.torpedoes.length}`);

    keySource.dispatchEvent(mouseEvent('mousedown', 2)); // 토글 진입
    systems.update(dt);
    const aimedOn = systems.aim.aiming;
    keySource.dispatchEvent(mouseEvent('mousedown', 2)); // 재입력 해제
    systems.update(dt);
    check('조준: 마우스 우클릭 토글 진입·재입력 해제 (배선 경로)', aimedOn && !systems.aim.aiming, `on=${aimedOn}`);
    systems.detachInput();
  }

  // 31. 잠수함-함선 충돌 — 통과 방지·밀어냄만 (5차 결의 1, 어뢰와 박스 공유)
  {
    const bus = new EventBus();
    const targets = new TargetRegistry();
    const ship = new CargoShipSystem(bus, targets, {
      id: 910,
      waypointA: { x: 0, z: -30 },
      waypointB: { x: 0, z: -30 }, // 정지 함선 (왕복 경로 길이 0)
      surfaceY: STARTING_CANYON_LAYOUT.seaSurfaceY,
      speedMetersPerSecond: 4,
      hitRadius: 9,
      sinkDurationSeconds: 2,
      hullBox: TEST_CARGO_HULL,
      faction: 'hostile',
    });
    const step = 1 / 60;

    const runToward = (startY: number): { rest: number; minZ: number; jitter: number } => {
      const input = new ScriptedInput();
      const controller = new SubmarinePlayerController(params.movement, input, {
        x: 0,
        y: startY,
        z: 0,
        headingRadians: 0,
      });
      input.throttleForward = true;
      let minZ = 0;
      const tail: number[] = [];
      const steps = Math.round(20 / step);
      for (let i = 0; i < steps; i += 1) {
        controller.update(step);
        ship.update(step);
        for (let pass = 0; pass < 2; pass += 1) {
          let pushed = false;
          const spheres = computeHullSpheres(
            controller.positionX,
            controller.positionY,
            controller.positionZ,
            controller.headingRadians,
          );
          for (const sphere of spheres) {
            const push = computeShipBoxPush(ship.hullBox, ship, sphere.x, sphere.y, sphere.z, sphere.radius);
            if (push) {
              controller.applyExternalOffset(push.x, push.y, push.z);
              pushed = true;
              break;
            }
          }
          if (!pushed) break;
        }
        minZ = Math.min(minZ, controller.positionZ);
        if (i > steps - 60) tail.push(controller.positionZ);
      }
      return {
        rest: controller.positionZ,
        minZ,
        jitter: Math.max(...tail) - Math.min(...tail),
      };
    };

    // 흘수 범위(수면 근처)에서 접근 — 선수면(z=-20)에 막힌다
    const surfaced = runToward(10.5);
    check(
      '함선 충돌: 잠수함이 함선을 통과할 수 없다 (밀어냄 정지, 피해 없음)',
      surfaced.minZ > -20.5 && surfaced.rest > -17.6 && surfaced.rest < -16.8,
      `restZ=${surfaced.rest.toFixed(2)} (기대 ≈ -17.2), minZ=${surfaced.minZ.toFixed(2)}`,
    );
    check('함선 충돌: 접촉 유지 중 떨림 없음', surfaced.jitter < 0.02, `jitter=${surfaced.jitter.toFixed(5)}m`);

    // 흘수 아래(심도)로는 함선 밑을 통과할 수 있다 — 보이지 않는 벽 없음
    const under = runToward(5);
    check(
      '함선 충돌: 흘수 아래 심도로는 함선 하부 통과 가능 (박스 수직 범위 공유)',
      under.minZ < -40,
      `minZ=${under.minZ.toFixed(1)} (자유 통과)`,
    );
  }

  // 32. [ECON] D+4 최소 완주 — 적대 파괴 → 드롭 생성 → 접근 → 획득
  {
    const bus = new EventBus();
    const targets = new TargetRegistry();
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input, {
      x: 0,
      y: 11,
      z: 40,
      headingRadians: 0, // 선수 -Z → 드롭 방향
    });
    const ship = new CargoShipSystem(bus, targets, {
      id: 920,
      waypointA: { x: 0, z: -20 },
      waypointB: { x: 0, z: -20 },
      surfaceY: STARTING_CANYON_LAYOUT.seaSurfaceY,
      speedMetersPerSecond: 4,
      hitRadius: 9,
      sinkDurationSeconds: 2,
      hullBox: TEST_CARGO_HULL,
      faction: 'hostile',
      dropTableId: 'cargo-standard',
    });
    const economy = new EconomySystem(targets, controller, () => [ship], testEconomyParams);
    const step = 1 / 60;

    ship.onTorpedoHit(0, -20, 1); // 적대 수송선 파괴
    economy.update(step);
    const dropTable = testEconomyParams?.dropTables['cargo-standard'];
    const spawnedNotCollected =
      economy.dropField.drops.length === 1 && economy.wallet.sortieCredits === 0;
    check(
      '[ECON] 적대 파괴 → 크레딧 드롭 생성 (원거리 — 생성과 획득 분리)',
      spawnedNotCollected,
      `drops=${economy.dropField.drops.length}, credits=${economy.wallet.sortieCredits}`,
    );

    input.throttleForward = true; // 드롭으로 접근
    let elapsed = 0;
    while (economy.wallet.sortieCredits === 0 && elapsed < 15) {
      controller.update(step);
      economy.update(step);
      elapsed += step;
    }
    check(
      '[ECON] 접근 시 자동 회수 → 크레딧 획득 반영 (D+4 완주 시나리오)',
      economy.wallet.sortieCredits === (dropTable?.credits ?? -1) &&
        economy.dropField.drops.length === 0,
      `credits=${economy.wallet.sortieCredits} (기대 ${dropTable?.credits}), ${elapsed.toFixed(1)}s`,
    );
  }

  // 33. [ECON] 중립 공격 — 크레딧 없음 + 경비함 출현 요청 (AI 복제 없음)
  {
    const bus = new EventBus();
    const targets = new TargetRegistry();
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    const neutral = new CargoShipSystem(bus, targets, {
      id: 930,
      waypointA: { x: 5, z: -25 },
      waypointB: { x: 5, z: -25 },
      surfaceY: STARTING_CANYON_LAYOUT.seaSurfaceY,
      speedMetersPerSecond: 4,
      hitRadius: 9,
      sinkDurationSeconds: 2,
      hullBox: TEST_CARGO_HULL,
      faction: 'neutral',
      dropTableId: 'cargo-standard', // 테이블이 있어도 중립은 드롭 금지
    });
    const economy = new EconomySystem(targets, controller, () => [neutral], testEconomyParams);
    // [B4 이행] 중립 사건의 정본은 유효 피해 지점의 neutralShipHit다.
    const neutralHits: NeutralShipHitPayload[] = [];
    bus.on('neutralShipHit', (payload) => neutralHits.push(payload));

    neutral.onTorpedoHit(5, -25, 1, {
      attackCorrelationId: 'torpedo:1',
      attackerEntityId: PLAYER_ENTITY_ID,
    });
    economy.update(1 / 60);
    check(
      '[ECON] 중립 선박 공격 → 크레딧 없음·드롭 0 (드롭 테이블이 붙어 있어도 보상 없음)',
      economy.wallet.sortieCredits === 0 && economy.dropField.drops.length === 0,
      `credits=${economy.wallet.sortieCredits}, drops=${economy.dropField.drops.length}`,
    );
    check(
      '[ECON→B4] 레거시 경비 큐는 비어 있다 — legacy:<targetId> 경로 production 미사용',
      economy.guardSpawnRequests.length === 0 &&
        economy.consumeGuardSpawnRequests().length === 0 &&
        neutralHits.length === 1 &&
        neutralHits[0]?.attackCorrelationId === 'torpedo:1',
      `queue=${economy.guardSpawnRequests.length}, neutralShipHit=${neutralHits.length}`,
    );
  }

  // 34. [ECON] 해저 재화 — 부순다(어뢰 경로 공유) / 줍는다(자동 회수) / 희귀 부품 즉시 저장 신호
  {
    const targets = new TargetRegistry();
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input, {
      x: 0,
      y: 10,
      z: -16,
      headingRadians: 0,
    });
    const economy = new EconomySystem(targets, controller, () => [], testEconomyParams);
    const savedSignals: string[] = [];
    economy.wallet.onRarePartAcquired((partId) => savedSignals.push(partId));

    const chest = economy.spawnSalvage('chest', 0, 10, -18, 'rare-sonar-lens');
    check(
      '[ECON] 부순다: 해저 보물이 기존 어뢰 표적 경로에 등록됨 (별도 판정 없음)',
      targets.list.some((target) => target.id === chest.id && target.faction === 'object'),
      `targets=${targets.list.length}`,
    );

    chest.onTorpedoHit(0, -18, 1); // 어뢰로 부순다
    economy.update(1 / 60); // 드롭 생성 + 플레이어 인접 → 자동 회수
    const chestCredits = testEconomyParams?.dropTables['salvage-chest']?.credits ?? -1;
    check(
      '[ECON] 줍는다: 파괴 드롭 자동 회수 — 일반 크레딧·희귀 부품 분리 획득',
      economy.wallet.sortieCredits === chestCredits &&
        economy.wallet.rareParts.length === 1 &&
        economy.wallet.rareParts[0] === 'rare-sonar-lens' &&
        targets.list.length === 0,
      `credits=${economy.wallet.sortieCredits}, parts=${economy.wallet.rareParts.join(',')}`,
    );
    check(
      '[ECON] 희귀 부품 획득 → 즉시 저장 신호 정확히 1회 (저장은 툴링 소유)',
      savedSignals.length === 1 && savedSignals[0] === 'rare-sonar-lens',
      `signals=${savedSignals.length}`,
    );
  }

  // 35. [ECON] 병행 정산 경로 제거 — 정산 정본은 MetaLoop 하나 (C)
  {
    const targets = new TargetRegistry();
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    const economy = new EconomySystem(targets, controller, () => [], testEconomyParams);

    economy.wallet.addCredits(180);
    economy.wallet.acquireRarePart('rare-core');
    // 게임플레이 계층에 정산 API가 존재하지 않는다 (표면 검사).
    const economySurface = Object.getOwnPropertyNames(Object.getPrototypeOf(economy));
    const walletSurface = Object.getOwnPropertyNames(Object.getPrototypeOf(economy.wallet));
    check(
      '[ECON] 병행 정산 API 제거 — settleDefeat·settleReturn·settleSortie 부재',
      !economySurface.includes('settleDefeat') &&
        !economySurface.includes('settleReturn') &&
        !walletSurface.includes('settleSortie') &&
        !economySurface.some((name) => /^settle/i.test(name)) &&
        !walletSurface.some((name) => /^settle/i.test(name)),
      `economy=${economySurface.filter((n) => /settle/i.test(n)).join(',') || '없음'}, wallet=${walletSurface.filter((n) => /settle/i.test(n)).join(',') || '없음'}`,
    );
    check(
      '[ECON] 게임플레이는 지갑 확정을 하지 않는다 — 회수분만 미정산 상태로 보관',
      economy.wallet.sortieCredits === 180 &&
        economy.wallet.confirmedCredits === 0 &&
        economy.wallet.rareParts.length === 1,
      `미정산=${economy.wallet.sortieCredits}, 확정=${economy.wallet.confirmedCredits}`,
    );
    // 재출항 초기화는 미정산분만 버린다 (확정분·희귀 부품은 영구분).
    economy.resetForNewSortie();
    check(
      '[ECON] 재출항 초기화 — 미정산분만 폐기, 희귀 부품 보존 (정산 아님)',
      economy.wallet.sortieCredits === 0 &&
        economy.wallet.confirmedCredits === 0 &&
        economy.wallet.rareParts.length === 1,
      `미정산=${economy.wallet.sortieCredits}, 희귀=${economy.wallet.rareParts.length}`,
    );
  }

  // 36. [LOOP] 장비 4종 — 슬롯 제한·상위호환 없음·합연산 배율·발사 반영·디코이
  {
    const officialEquipment = readOfficialEquipmentCatalog(rawParams.equipment);
    const standard = new EquipmentSystem();
    standard.applyCatalog(officialEquipment);
    const standardProfile = standard.activeTorpedoProfile();
    const bench = new EquipmentSystem();
    bench.applyCatalog(officialEquipment);
    const e1 = bench.equip(0, 'fastTorpedo');
    const e2 = bench.equip(1, 'heavyTorpedo');
    const overflow = bench.equip(2, 'decoy'); // 슬롯 2 제한 초과
    const duplicate = bench.equip(1, 'fastTorpedo'); // 중복 장착
    check(
      '[LOOP] 장비: 슬롯 제한·중복 장착 거부',
      e1 && e2 && !overflow && !duplicate && bench.slotCount === 2,
      `slots=${bench.slots.join('/')}`,
    );

    bench.selectSlot(0);
    const fast = bench.activeTorpedoProfile();
    bench.selectSlot(1);
    const heavy = bench.activeTorpedoProfile();
    const noStrictUpgrade =
      standardProfile !== null &&
      fast !== null &&
      heavy !== null &&
      fast.speedMetersPerSecond > standardProfile.speedMetersPerSecond &&
      fast.damage < standardProfile.damage &&
      heavy.speedMetersPerSecond < standardProfile.speedMetersPerSecond &&
      heavy.damage > standardProfile.damage;
    check(
      '[LOOP] 장비: 고속=빠르고 약함 / 중어뢰=느리고 강함 (상위호환 없음)',
      noStrictUpgrade,
      `fast=${fast?.speedMetersPerSecond}/${fast?.damage}, heavy=${heavy?.speedMetersPerSecond}/${heavy?.damage}`,
    );

    bench.setUpgradeModifiers({ torpedoSpeedBonus: 0.2, torpedoDamageBonus: 0.1 });
    bench.selectSlot(0);
    const boosted = bench.activeTorpedoProfile();
    const additiveOk =
      boosted !== null &&
      fast !== null &&
      Math.abs(boosted.speedMetersPerSecond - fast.speedMetersPerSecond * 1.2) < 1e-9 &&
      Math.abs(boosted.damage - fast.damage * 1.1) < 1e-9;
    check(
      '[LOOP] 장비: 업그레이드 합연산 배율 — 최종값 = 기준값 × (1 + 보정 합)',
      additiveOk,
      `speed=${boosted?.speedMetersPerSecond.toFixed(2)}, damage=${boosted?.damage.toFixed(3)}`,
    );
  }

  // 36b. [LOOP] 장비가 실제 전투 수치에 반영 — 발사 어뢰의 속력 차이
  {
    const rig = makeCombatRig(params);
    rig.aim.beginAim();
    rig.equipment.equip(1, 'fastTorpedo');
    rig.equipment.selectSlot(1);
    rig.aim.fireTorpedo();
    const step = 1 / 60;
    for (let i = 0; i < Math.round(1 / step); i += 1) rig.torpedo.update(step);
    const fastShot = rig.torpedo.torpedoes[0];
    const fastSpeed = rig.equipment.activeTorpedoProfile()?.speedMetersPerSecond ?? -1;
    check(
      '[LOOP] 장비: 발사된 어뢰가 장비 속력으로 주행 (유효 파라미터 → 전투 반영)',
      fastShot !== undefined &&
        fastShot.speedMetersPerSecond === fastSpeed &&
        Math.abs(fastShot.traveledMeters - fastSpeed) < fastSpeed / 30 &&
        rig.torpedo.torpedoSpeedMetersPerSecond === fastSpeed,
      `traveled=${fastShot?.traveledMeters.toFixed(1)}m/1s (속력 ${fastSpeed})`,
    );
  }

  // 36c. [LOOP] 디코이 — 단일 fire 경로 위임, 가짜 표적 생성, 어뢰 자원과 분리
  {
    const rig = makeCombatRig(params);
    rig.aim.beginAim();
    rig.equipment.equip(1, 'decoy');
    rig.equipment.selectSlot(1);

    const launched = rig.aim.fireTorpedo(); // 같은 진입점 — 디코이로 위임
    const blocked = rig.aim.fireTorpedo(); // 쿨다운 중 거부
    check(
      '[LOOP] 디코이: 단일 발사 경로로 사출 — 가짜 음향 표적 생성, 어뢰 잔량 불변',
      launched &&
        !blocked &&
        rig.equipment.activeDecoys.length === 1 &&
        rig.equipment.decoysRemaining === 1 &&
        rig.torpedo.remaining === params.combat.torpedoCapacity.value &&
        rig.torpedo.torpedoes.length === 0,
      `decoys=${rig.equipment.activeDecoys.length}, stock=${rig.equipment.decoysRemaining}`,
    );

    const step = 1 / 60;
    for (let i = 0; i < Math.round(21 / step); i += 1) rig.equipment.update(step);
    check(
      '[LOOP] 디코이: 수명 만료 시 제거 (교란 표적 정리)',
      rig.equipment.activeDecoys.length === 0,
      `decoys=${rig.equipment.activeDecoys.length}`,
    );
  }

  // 36d. [LOOP] 소켓 기반 탄도 — 조준 forward = 어뢰 초기 방향, 자기 충돌 없음
  {
    const rig = makeCombatRig(params);
    rig.aim.beginAim();
    rig.aim.applyMouseDelta(-500, -500); // 좌·상 미세 조준 (yaw·pitch 모두 0이 아님)

    // 조준 카메라가 실제로 읽는 값 = 공식 rig의 aimCameraSocket (동일 출처)
    const aimCamera = rig.socket.aimCameraSocket;
    const cameraForward = { x: aimCamera.forwardX, y: aimCamera.forwardY, z: aimCamera.forwardZ };
    const expectedSpawn = rig.socket.torpedoSpawnSocket;
    rig.aim.fireTorpedo();
    const shot = rig.torpedo.torpedoes[0];

    const directionMatches =
      shot !== undefined &&
      Math.abs(shot.directionX - cameraForward.x) < 1e-12 &&
      Math.abs(shot.directionY - cameraForward.y) < 1e-12 &&
      Math.abs(shot.directionZ - cameraForward.z) < 1e-12;
    check(
      '탄도: 십자선 ray(조준 카메라 forward)와 어뢰 초기 방향 완전 일치 (단일 출처)',
      directionMatches && Math.abs(cameraForward.y) > 1e-6 && rig.aim.yawRadians !== 0,
      `forward=(${cameraForward.x.toFixed(4)}, ${cameraForward.y.toFixed(4)}, ${cameraForward.z.toFixed(4)})`,
    );

    const spawnMatches =
      shot !== undefined &&
      Math.abs(shot.x - expectedSpawn.positionX) < 1e-12 &&
      Math.abs(shot.y - expectedSpawn.positionY) < 1e-12 &&
      Math.abs(shot.z - expectedSpawn.positionZ) < 1e-12;
    check(
      '탄도: 생성 위치 = 공식 rig torpedoSpawnSocket (TorpedoSystem 자체 오프셋 없음)',
      spawnMatches,
      `spawn=(${shot?.x.toFixed(3)}, ${shot?.y.toFixed(3)}, ${shot?.z.toFixed(3)})`,
    );

    // 자기 충돌: 생성 직후 어뢰 구가 자함 선체 근사 구 어느 것과도 겹치지 않는다
    const hull = computeHullSpheres(
      rig.controller.positionX,
      rig.controller.positionY,
      rig.controller.positionZ,
      rig.controller.headingRadians,
    );
    let minGap = Number.POSITIVE_INFINITY;
    if (shot) {
      for (const sphere of hull) {
        const distance = Math.hypot(shot.x - sphere.x, shot.y - sphere.y, shot.z - sphere.z);
        minGap = Math.min(minGap, distance - (sphere.radius + TORPEDO_COLLISION_RADIUS));
      }
    }
    check(
      '탄도: 생성 직후 잠수함 자기 충돌 없음 (고정 안전 오프셋)',
      minGap > 0,
      `선체 표면과의 여유 ${minGap.toFixed(3)}m`,
    );

    // 리드샷 보조선 입력: 실제 발사된 어뢰 속력과 동일해야 한다
    check(
      '탄도: 리드샷 보조선 속력 = 실제 발사 어뢰 속력 (장비 반영 값)',
      shot !== undefined && rig.torpedo.torpedoSpeedMetersPerSecond === shot.speedMetersPerSecond,
      `보조선 ${rig.torpedo.torpedoSpeedMetersPerSecond} / 어뢰 ${shot?.speedMetersPerSecond}`,
    );

    // pitch가 반영되면 어뢰는 수직으로도 이동한다 (수평 전용 아님)
    const yAtLaunch = shot?.y ?? 0;
    for (let i = 0; i < Math.round(1 / (1 / 60)); i += 1) rig.torpedo.update(1 / 60);
    const flying = rig.torpedo.torpedoes[0];
    check(
      '탄도: pitch 미세각이 어뢰 3D 주행에 반영 (상향 조준 = 상승 주행)',
      flying !== undefined && flying.y > yAtLaunch,
      `y ${yAtLaunch.toFixed(2)} → ${flying?.y.toFixed(2)}`,
    );
  }

  // 36e. [LOOP] 발사 후 조준 유지 + 비조준 발사 거부 (전 심도 규칙에서도 불변)
  {
    const rig = makeCombatRig(params);
    const beforeAimFire = rig.aim.fireTorpedo();
    const afterRejection = rig.torpedo.torpedoes.length;

    rig.aim.beginAim();
    rig.aim.fireTorpedo();
    check(
      '전투: 비조준 발사 거부 + 발사 후에도 조준 상태 유지 (연속 조준 사격)',
      !beforeAimFire &&
        afterRejection === 0 &&
        rig.aim.aimRequiredCount === 1 &&
        rig.torpedo.torpedoes.length === 1 &&
        rig.aim.aiming,
      `aiming=${rig.aim.aiming}, aimRequired=${rig.aim.aimRequiredCount}`,
    );
  }

  // 38. [ECON] 공식 경제 카탈로그 어댑터 — 7종·4종 상한, null 거부, provisional 미사용
  {
    const upgrades = readOfficialUpgradeCatalog(rawParams.upgrades);
    const equipment = readOfficialEquipmentCatalog(rawParams.equipment);

    const upgradeIdsOfficial =
      upgrades.length === OFFICIAL_UPGRADE_IDS.length &&
      upgrades.every((entry) => (OFFICIAL_UPGRADE_IDS as readonly string[]).includes(entry.id)) &&
      new Set(upgrades.map((entry) => entry.id)).size === upgrades.length;
    check(
      '[ECON] 공식 업그레이드 catalog 7종 — 공식 params에서만 읽고 8번째 없음',
      upgradeIdsOfficial,
      `${upgrades.length}종: ${upgrades.map((entry) => entry.id).join(',')}`,
    );

    const equipmentIdsOfficial =
      equipment.items.length === OFFICIAL_EQUIPMENT_IDS.length &&
      equipment.items.every((entry) =>
        (OFFICIAL_EQUIPMENT_IDS as readonly string[]).includes(entry.id),
      );
    check(
      '[ECON] 공식 장비 catalog 4종 — 5번째 없음',
      equipmentIdsOfficial,
      `${equipment.items.length}종: ${equipment.items.map((entry) => entry.id).join(',')}`,
    );

    // 공식 파일 밖 id는 런타임에서 거부된다
    const polluted = readOfficialUpgradeCatalog({
      items: [
        { id: 'maxSpeed', maxLevel: 2, costCredits: [10, 20], costRareParts: [0, 0], effectBonus: [0.1, 0.1] },
        { id: 'eighthUpgrade', maxLevel: 3, costCredits: [1, 1, 1], costRareParts: [0, 0, 0], effectBonus: [1, 1, 1] },
      ],
    });
    const pollutedEquipment = readOfficialEquipmentCatalog({
      slotCapacity: 2,
      items: [
        { id: 'decoy', costCredits: 10, costRareParts: 0 },
        { id: 'fifthWeapon', costCredits: 10, costRareParts: 0 },
      ],
    });
    check(
      '[ECON] 공식 ID 밖 항목 런타임 거부 (업그레이드 8번째·장비 5번째)',
      polluted.length === 1 &&
        polluted[0]?.id === 'maxSpeed' &&
        pollutedEquipment.items.length === 1 &&
        pollutedEquipment.items[0]?.id === 'decoy',
      `upgrades=${polluted.length}, equipment=${pollutedEquipment.items.length}`,
    );

    // null 경제 데이터 거부 — 가격이 미확정이면 비용을 만들어내지 않는다
    const nullCostEntry = upgrades.find((entry) => upgradeCostAtLevel(entry, 1) === null);
    const partialNull = readOfficialUpgradeCatalog({
      items: [
        {
          id: 'maxSpeed',
          maxLevel: 2,
          costCredits: [100, null],
          costRareParts: [0, 0],
          effectBonus: [0.1, 0.1],
        },
      ],
    })[0];
    const negative = readOfficialUpgradeCatalog({
      items: [
        { id: 'maxSpeed', maxLevel: 1, costCredits: [-5], costRareParts: [0], effectBonus: [0.1] },
      ],
    })[0];
    check(
      '[ECON] null·음수 비용 거부 + 공식 파일은 전 단계 확정 (A8 해소 — 미확정 0건)',
      nullCostEntry === undefined &&
        partialNull !== undefined &&
        upgradeCostAtLevel(partialNull, 1)?.credits === 100 &&
        upgradeCostAtLevel(partialNull, 2) === null &&
        negative !== undefined &&
        upgradeCostAtLevel(negative, 1) === null,
      `공식 파일 미확정 항목=${nullCostEntry?.id ?? '없음'} (합성 null·음수는 거부 유지)`,
    );

    // provisional 비용 경로가 production에 존재하지 않는다
    const pendingModules = PENDING_OFFICIAL_DATA.map((entry) => entry.module);
    check(
      '[ECON] provisional 비용 경로 제거 — 대기 목록에 가격 항목 없음',
      pendingModules.every((module) => !module.includes('provisionalUpgradeCost')) &&
        PENDING_OFFICIAL_DATA.every((entry) => !entry.contents.includes('업그레이드 가격')),
      `남은 대기 소스 ${pendingModules.length}종`,
    );
  }

  // 38b. [ECON] 업그레이드 판정 — 사유·단계·rollback 어댑터 (저장 호출 없음)
  {
    const officialCatalog = readOfficialUpgradeCatalog(rawParams.upgrades);
    const pricedCatalog = readOfficialUpgradeCatalog({
      items: [
        {
          id: 'maxSpeed',
          label: '최고 속도',
          maxLevel: 2,
          costCredits: [100, 300],
          costRareParts: [0, 2],
          effectBonus: [0.1, 0.1],
        },
      ],
    });
    const wallet = { credits: 150, rareParts: 0 };
    const walletPort: PurchaseWalletPort = {
      get credits() {
        return wallet.credits;
      },
      get rareParts() {
        return wallet.rareParts;
      },
    };

    // 공식 파일 — 가격이 확정됐으므로 잔액 판정만 남는다 (임의 값 대입 없음)
    const officialJudge = new UpgradePurchaseSystem(officialCatalog, walletPort);
    const officialOffer = officialJudge
      .listOffers()
      .find((offer) => offer.id === 'maxSpeed');
    check(
      '[ECON] 공식 가격을 그대로 판정에 사용 (150cr → 1단계 100cr 구매 가능)',
      officialOffer !== undefined &&
        officialOffer.nextCost?.credits === 100 &&
        officialOffer.denial === null &&
        officialJudge.evaluateUpgradePurchase('maxSpeed').cost.credits === 100,
      `denial=${String(officialOffer?.denial)}, cost=${String(officialOffer?.nextCost?.credits)}`,
    );

    const judge = new UpgradePurchaseSystem(pricedCatalog, walletPort);
    const affordable = judge.evaluateUpgradePurchase('maxSpeed');
    check(
      '[ECON] 구매 가능 판정 + 가격·희귀 부품 요구량 산출 (공식 값)',
      affordable.denial === null &&
        affordable.cost.credits === 100 &&
        affordable.cost.rareParts === 0 &&
        judge.nextCost('maxSpeed')?.credits === 100,
      `cost=${affordable.cost.credits}/${affordable.cost.rareParts}`,
    );

    // 후보 단계 적용 → 스냅샷 → 복원(rollback)
    const before = judge.snapshotLevels();
    judge.applyPurchasedLevel('maxSpeed');
    const afterApply = judge.levelOf('maxSpeed');
    const modifiersAfter = judge.modifiers.maxSpeed;
    judge.restoreLevels(before);
    check(
      '[ECON] 후보 단계 적용 + rollback 복원 (단계·보정 모두 원복)',
      afterApply === 1 &&
        modifiersAfter === 0.1 &&
        judge.levelOf('maxSpeed') === 0 &&
        judge.modifiers.maxSpeed === undefined,
      `apply=${afterApply} → restore=${judge.levelOf('maxSpeed')}`,
    );

    // 사유 3종: 크레딧 부족 / 희귀 부품 부족 / 최대 단계
    judge.applyPurchasedLevel('maxSpeed'); // level 1 → 다음은 300cr + 부품 2
    const poor = judge.evaluateUpgradePurchase('maxSpeed');
    wallet.credits = 1000;
    const noParts = judge.evaluateUpgradePurchase('maxSpeed');
    wallet.rareParts = 5;
    judge.applyPurchasedLevel('maxSpeed'); // level 2 = maxLevel
    const maxed = judge.evaluateUpgradePurchase('maxSpeed');
    const unknown = judge.evaluateUpgradePurchase('eighthUpgrade' as never);
    check(
      '[ECON] 업그레이드 판정 사유 — insufficientCredits/RareParts/maxLevelReached/미등록 거부',
      poor.denial === 'insufficientCredits' &&
        noParts.denial === 'insufficientRareParts' &&
        maxed.denial === 'maxLevelReached' &&
        unknown.denial === 'maxLevelReached',
      `${poor.denial} / ${noParts.denial} / ${maxed.denial} / ${unknown.denial}`,
    );
  }

  // 39. [ECON] 장비 판정·loadout 어댑터 (계약 EquipmentChangeJudgePort)
  {
    const equipment = new EquipmentSystem(['standardTorpedo']);
    equipment.applyCatalog(readOfficialEquipmentCatalog(rawParams.equipment));

    const catalogView = equipment.equipmentCatalog;
    check(
      '[ECON] 장비 catalog·loadout 읽기 (공식 4종 + 현재 장착 상태)',
      catalogView !== null &&
        catalogView.items.length === 4 &&
        equipment.loadout.equipped[0] === 'standardTorpedo' &&
        equipment.loadout.slotCapacity === equipment.slotCount,
      `slotCapacity=${equipment.loadout.slotCapacity}(공식 ${String(catalogView?.slotCapacity)}), equipped=${equipment.loadout.equipped.join('/')}`,
    );

    const equipEmpty = equipment.evaluateEquipmentChange({
      kind: 'equip',
      slotIndex: 1,
      equipmentId: 'fastTorpedo',
    });
    equipment.applyEquipmentChange({ kind: 'equip', slotIndex: 1, equipmentId: 'fastTorpedo' });
    const duplicate = equipment.evaluateEquipmentChange({
      kind: 'equip',
      slotIndex: 1,
      equipmentId: 'standardTorpedo',
    });
    // 계약상 replace = '점유 슬롯 대상 equip' — 점유는 거부 사유가 아니다
    const occupied = equipment.evaluateEquipmentChange({
      kind: 'replace',
      slotIndex: 0,
      equipmentId: 'heavyTorpedo',
    });
    const sameItemAgain = equipment.evaluateEquipmentChange({
      kind: 'equip',
      slotIndex: 1,
      equipmentId: 'fastTorpedo',
    });
    const outOfRange = equipment.evaluateEquipmentChange({
      kind: 'equip',
      slotIndex: 9,
      equipmentId: 'heavyTorpedo',
    });
    check(
      '[ECON] 장비 판정 사유 — equip/replace 가능 / 중복·동일 슬롯 alreadyEquipped / 범위 밖 slotFull',
      equipEmpty === null &&
        duplicate === 'alreadyEquipped' &&
        occupied === null &&
        sameItemAgain === 'alreadyEquipped' &&
        outOfRange === 'slotFull',
      `equip=${String(equipEmpty)} / 중복=${duplicate} / replace=${String(occupied)} / 동일=${sameItemAgain} / 범위밖=${outOfRange}`,
    );

    const unofficial = equipment.evaluateEquipmentChange({
      kind: 'equip',
      slotIndex: 1,
      equipmentId: 'fifthWeapon' as never,
    });
    check(
      '[ECON] 공식 장비 4종 밖 장착 런타임 거부 (5번째 금지)',
      unofficial !== null,
      `denial=${unofficial}`,
    );

    // replace / unequip + 스냅샷·복원(rollback)
    const snapshot = equipment.snapshotLoadout();
    equipment.applyEquipmentChange({ kind: 'replace', slotIndex: 1, equipmentId: 'heavyTorpedo' });
    const replaced = equipment.slots[1];
    equipment.applyEquipmentChange({ kind: 'unequip', slotIndex: 1 });
    const removed = equipment.slots[1];
    equipment.restoreLoadout(snapshot);
    check(
      '[ECON] replace·unequip 적용 + 이전 loadout 복원 (rollback 어댑터)',
      replaced === 'heavyTorpedo' &&
        removed === null &&
        equipment.loadout.equipped.join('/') === snapshot.equipped.join('/') &&
        equipment.loadout.slotCapacity === snapshot.slotCapacity,
      `복원 후 ${equipment.loadout.equipped.join('/')}`,
    );

    // 공식 slotCapacity가 확정되면 그 값이 반영된다 (null이면 구조 기본값 유지)
    const beforeCapacity = equipment.slotCount;
    equipment.applyCatalog({
      slotCapacity: 3,
      items: readOfficialEquipmentCatalog(rawParams.equipment).items,
    });
    const injectedCapacity = equipment.slotCount;
    equipment.applyCatalog(readOfficialEquipmentCatalog(rawParams.equipment)); // 공식 2
    const officialCapacity = equipment.slotCount;
    const nullCapacity = new EquipmentSystem(['standardTorpedo']);
    nullCapacity.applyCatalog({
      slotCapacity: null,
      items: readOfficialEquipmentCatalog(rawParams.equipment).items,
    });
    check(
      '[ECON] slotCapacity는 카탈로그 값만 반영 (3 주입→3, 공식 2→2, null→구조 기본 유지)',
      injectedCapacity === 3 &&
        officialCapacity === 2 &&
        beforeCapacity === 2 &&
        nullCapacity.slotCount === 2,
      `기본 ${beforeCapacity} → 주입 ${injectedCapacity} → 공식 ${officialCapacity} / null 유지 ${nullCapacity.slotCount}`,
    );
  }

  // 40. [LOOP] 출항 중 획득량 read-only source + 출항 준비 판정
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());

    const initialZero =
      systems.sortiePendingCredits === 0 && systems.sortiePendingRareParts === 0;
    systems.economy.wallet.addCredits(120);
    systems.economy.wallet.acquireRarePart('rare-core');
    const reflectsLoot =
      systems.sortiePendingCredits === 120 && systems.sortiePendingRareParts === 1;
    // 정산은 MetaLoop 소유다 — 게임플레이는 미정산분을 보여 주기만 하며,
    // 재출항 초기화에서 미정산분이 사라진다(확정은 정산 경로에서만).
    systems.resetSortieSession(params);
    const afterReset =
      systems.sortiePendingCredits === 0 && systems.sortiePendingRareParts === 1;
    check(
      '[LOOP] pending 재화 getter — 실제 loot 회수 상태에서만 파생 (임시 숫자 없음)',
      initialZero && reflectsLoot && afterReset,
      `획득 120 → 재출항 초기화 후 pending=${systems.sortiePendingCredits}, 희귀=${systems.sortiePendingRareParts}`,
    );

    const readyInBase = systems.sortieReadiness(true);
    const notInBase = systems.sortieReadiness(false);
    check(
      '[LOOP] 출항 준비 판정 — 기지 상태·loadout·업그레이드 유효성',
      readyInBase.ready &&
        readyInBase.loadoutValid &&
        readyInBase.upgradesValid &&
        readyInBase.blockers.length === 0 &&
        !notInBase.ready &&
        notInBase.blockers.includes('notInBase'),
      `base=${readyInBase.ready}, 비기지 blockers=${notInBase.blockers.join(',')}`,
    );

    // 장비를 모두 해제하면 출항 불가 (게임플레이 측 유효성)
    systems.equipment.applyEquipmentChange({ kind: 'unequip', slotIndex: 0 });
    const emptyLoadout = systems.sortieReadiness(true);
    check(
      '[LOOP] 장착 장비가 없으면 출항 준비 실패 (invalidLoadout)',
      !emptyLoadout.ready &&
        !emptyLoadout.loadoutValid &&
        emptyLoadout.blockers.includes('invalidLoadout'),
      `blockers=${emptyLoadout.blockers.join(',')}`,
    );
    systems.dispose();
  }

  // 41. 경계 검사 — 게임플레이는 저장·UI를 직접 호출하지 않는다
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const purchase = systems.attachBaseEconomy({
      upgradesParams: rawParams.upgrades,
      equipmentParams: rawParams.equipment,
      wallet: { credits: 0, rareParts: 0 },
    });

    const wired =
      systems.upgradePurchase === purchase &&
      systems.purchaseJudge === purchase &&
      systems.equipmentJudge === systems.equipment &&
      purchase.entries.length === OFFICIAL_UPGRADE_IDS.length;
    check(
      '[LOOP] 기지 어댑터 배선 — 판정 포트 노출 (지갑은 주입, 저장 포트 없음)',
      wired,
      `catalog=${purchase.entries.length}종`,
    );

    // 어떤 경로에도 save 호출·UI 참조가 없다: 판정 포트 표면에 save가 없음
    const purchaseSurface = new Set([
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(purchase) as object),
    ]);
    const equipmentSurface = new Set([
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(systems.equipment) as object),
    ]);
    // 저장 API = save로 시작하거나 SavePort를 다루는 이름. 'restoreSavedLoadout'
    // 처럼 저장 **데이터**를 받는 복원 API는 저장 호출이 아니다.
    const isSaveApi = (name: string): boolean =>
      /^save/i.test(name) || /saveport/i.test(name);
    const noSaveApi =
      ![...purchaseSurface].some(isSaveApi) && ![...equipmentSurface].some(isSaveApi);
    check(
      '[LOOP] 저장 직접 호출 0회 — 판정·장비 시스템에 save 계열 API 없음',
      noSaveApi,
      '저장·롤백 순서는 리드 트랜잭션 소유',
    );
    systems.dispose();
  }

  // 37. [BOSS] 약점 판정 — 활성/비활성 구분, 포트 계약만 소비 (AI 내부 접근 없음)
  {
    const port = { phase: 1, weakPointOpen: false };
    const boss = new BossWeakPointTarget(port, provisionalBossWeakPointConfig(500, 0, 12, -60));
    const targets = new TargetRegistry();
    targets.register(boss); // 기존 어뢰 단일 판정 경로 재사용 가능
    const hitLog: string[] = [];
    boss.onHit((kind) => hitLog.push(kind));

    boss.onTorpedoHit(0, -60, 2.0); // 약점 닫힘 → 일반 선체 피격
    const closedOk =
      boss.hullHits === 1 &&
      boss.weakPointHits === 0 &&
      boss.lastHitKind === 'hull' &&
      !boss.weakPointOpen;

    port.weakPointOpen = true; // 리드 AI가 패턴 4로 개방 (포트 경유 — 내부 접근 없음)
    port.phase = 2;
    boss.onTorpedoHit(0, -60, 2.0); // 약점 개방 → 약점 피격
    const weakHitsAfter: number = boss.weakPointHits;
    const lastKindAfter: string | null = boss.lastHitKind;
    check(
      '[BOSS] 약점 비활성 = 일반 피격 / 활성 = 약점 피격 구분 (판정 = 게임플레이)',
      closedOk &&
        weakHitsAfter === 1 &&
        lastKindAfter === 'weakPoint' &&
        boss.weakPointOpen &&
        boss.phase === 2 &&
        hitLog.length === 2 &&
        targets.list.length === 1,
      `hull=${boss.hullHits}, weak=${weakHitsAfter}, last=${lastKindAfter}`,
    );

    const expected = 2.0 * 0.25 + 2.0 * 2.0; // 닫힘 감쇠 + 개방 증폭 (임시 배율)
    check(
      '[BOSS] 약점 피해 증폭·선체 감쇠 누적 — 그래픽스 구독용 명시 상태 제공',
      Math.abs(boss.accumulatedDamage - expected) < 1e-9,
      `damage=${boss.accumulatedDamage} (기대 ${expected})`,
    );
  }

  /* ═══ 공식 경제 params production 소비 전환 [INT-CORE-011] ═══════════ */

  // 44. [ECON] 화물선 — 공식 params 소비 + 기존 동작 보존
  {
    const cargo = testCargoParams;
    // 이관 전 런타임 값(구 provisionalCargo) — 회귀 기준 픽스처.
    // "이관은 값 변경이 아니다"를 코드로 고정한다.
    const beforeMigration = {
      targetId: 1,
      speed: 4,
      hitRadius: 9,
      sink: 6,
      waypointA: { x: -30, z: -40 },
      waypointB: { x: 30, z: -40 },
      hull: { halfLength: 10, halfBeam: 2.5, draft: 4, freeboard: 3 },
    };
    const sameValues =
      cargo !== null &&
      cargo.targetId === beforeMigration.targetId &&
      cargo.speedMetersPerSecond === beforeMigration.speed &&
      cargo.hitRadiusMeters === beforeMigration.hitRadius &&
      cargo.sinkDurationSeconds === beforeMigration.sink &&
      cargo.waypointA.x === beforeMigration.waypointA.x &&
      cargo.waypointA.z === beforeMigration.waypointA.z &&
      cargo.waypointB.x === beforeMigration.waypointB.x &&
      cargo.waypointB.z === beforeMigration.waypointB.z &&
      cargo.hullBox.halfLengthMeters === beforeMigration.hull.halfLength &&
      cargo.hullBox.halfBeamMeters === beforeMigration.hull.halfBeam &&
      cargo.hullBox.judgmentDraftMeters === beforeMigration.hull.draft &&
      cargo.hullBox.freeboardMeters === beforeMigration.hull.freeboard;
    check(
      '[ECON] 화물선 공식 params = 이관 전 런타임 값 (동작 보존 — 새 밸런스 변경 아님)',
      sameValues,
      `speed=${cargo?.speedMetersPerSecond}, hit=${cargo?.hitRadiusMeters}, sink=${cargo?.sinkDurationSeconds}`,
    );

    if (cargo) {
      const bus = new EventBus();
      const targets = new TargetRegistry();
      const ship = new CargoShipSystem(
        bus,
        targets,
        cargoShipConfigFromOfficial(cargo, STARTING_CANYON_LAYOUT.seaSurfaceY),
      );
      const startX = ship.positionX;
      for (let i = 0; i < 60; i += 1) ship.update(1 / 60); // 1초 항행
      const traveled = ship.positionX - startX;
      const hull = ship.hullBox;
      check(
        '[ECON] 화물선 주입 구동 — 1초 이동 = 공식 속력, 선체 박스·표적 등록 유지',
        Math.abs(traveled - cargo.speedMetersPerSecond) < 1e-9 &&
          hull.halfBeamX === cargo.hullBox.halfBeamMeters &&
          hull.halfLengthZ === cargo.hullBox.halfLengthMeters &&
          hull.topY === STARTING_CANYON_LAYOUT.seaSurfaceY + cargo.hullBox.freeboardMeters &&
          ship.cargoParamsWired &&
          targets.list.length === 1 &&
          ship.id === cargo.targetId,
        `Δx=${traveled.toFixed(6)} (공식 ${cargo.speedMetersPerSecond}), targets=${targets.list.length}`,
      );
    }

    const unwired = new CargoShipSystem(new EventBus(), new TargetRegistry(), null);
    check(
      '[ECON] 화물선 미주입 = 명시적 unwired (표적 미등록·임시 수치 생성 없음)',
      !unwired.cargoParamsWired && unwired.hitRadius === 0,
      `wired=${unwired.cargoParamsWired}`,
    );
  }

  // 45. [ECON] 장비 4종 — 공식 성능값 소비 + slotCapacity 주입
  {
    const catalog = readOfficialEquipmentCatalog(rawParams.equipment);
    const performanceOf = (id: string): Readonly<Record<string, number>> =>
      catalog.items.find((entry) => entry.id === id)?.performance ?? {};
    const equipment = new EquipmentSystem(['standardTorpedo', 'fastTorpedo']);
    equipment.applyCatalog(catalog);
    equipment.selectSlot(0);
    const standard = equipment.activeTorpedoProfile();
    equipment.selectSlot(1);
    const fast = equipment.activeTorpedoProfile();
    check(
      '[ECON] 장비 성능 = 공식 params/equipment.json performance (게임플레이 상수 없음)',
      standard?.speedMetersPerSecond === performanceOf('standardTorpedo')['speedMetersPerSecond'] &&
        standard?.damage === performanceOf('standardTorpedo')['damage'] &&
        fast?.speedMetersPerSecond === performanceOf('fastTorpedo')['speedMetersPerSecond'] &&
        fast?.damage === performanceOf('fastTorpedo')['damage'] &&
        equipment.equipmentParamsWired,
      `standard=${standard?.speedMetersPerSecond}/${standard?.damage}, fast=${fast?.speedMetersPerSecond}/${fast?.damage}`,
    );

    const officialCount = catalog.items.length;
    const heavy = performanceOf('heavyTorpedo');
    const decoy = performanceOf('decoy');
    check(
      '[ECON] 공식 장비 정확히 4종 + 종류별 성능 키 (어뢰 속력·피해 / 디코이 재고·지속·쿨다운)',
      officialCount === 4 &&
        heavy['speedMetersPerSecond'] !== undefined &&
        heavy['damage'] !== undefined &&
        decoy['stockPerSortie'] !== undefined &&
        decoy['lifetimeSeconds'] !== undefined &&
        decoy['cooldownSeconds'] !== undefined,
      `items=${officialCount}, decoy=${JSON.stringify(decoy)}`,
    );

    check(
      '[ECON] slotCapacity는 공식 값에서만 온다 (2 소비 + 다른 값 주입 시 그대로 반영)',
      catalog.slotCapacity === 2 && equipment.slotCount === 2,
      `official=${String(catalog.slotCapacity)}, slots=${equipment.slotCount}`,
    );

    const resized = new EquipmentSystem(['standardTorpedo']);
    resized.applyCatalog({ slotCapacity: 3, items: catalog.items });
    check(
      '[ECON] 슬롯 수 하드코딩 아님 — 카탈로그 값 3을 주입하면 슬롯이 3이 된다',
      resized.slotCount === 3,
      `slots=${resized.slotCount}`,
    );

    // 디코이 재고·쿨다운도 공식 성능값에서만 온다
    const decoySystem = new EquipmentSystem(['decoy']);
    decoySystem.applyCatalog(catalog);
    const launched = decoySystem.launchDecoy(0, 0, 0);
    check(
      '[ECON] 디코이 재고·지속·쿨다운 = 공식 성능값 (출항당 stockPerSortie)',
      launched &&
        decoySystem.decoysRemaining === (decoy['stockPerSortie'] ?? 0) - 1 &&
        decoySystem.decoyCooldownRemainingSeconds === decoy['cooldownSeconds'] &&
        decoySystem.activeDecoys[0]?.remainingSeconds === decoy['lifetimeSeconds'],
      `remaining=${decoySystem.decoysRemaining}, cd=${decoySystem.decoyCooldownRemainingSeconds}`,
    );

    const unwired = new EquipmentSystem(['standardTorpedo']);
    check(
      '[ECON] 장비 성능 미주입 = 프로파일 없음 (기준값 발명 금지 — 발사 불성립)',
      !unwired.equipmentParamsWired && unwired.activeTorpedoProfile() === null,
      `profile=${String(unwired.activeTorpedoProfile())}`,
    );
  }

  // 46. [LOOP] 시작 로드아웃 — '저장 없음'과 '명시적 전부 해제' 구분
  {
    const catalog = readOfficialEquipmentCatalog(rawParams.equipment);
    const startingIds = catalog.items.filter((entry) => entry.startingItem).map((e) => e.id);

    const freshSave = new EquipmentSystem(null); // 저장 데이터 없음
    freshSave.applyCatalog(catalog);
    check(
      '[LOOP] 새 세이브(저장 없음) — 공식 startingItem(기본 어뢰) 1종 부여',
      startingIds.length === 1 &&
        startingIds[0] === 'standardTorpedo' &&
        freshSave.slots[0] === 'standardTorpedo' &&
        freshSave.loadout.equipped.length === 1,
      `starting=${startingIds.join(',')}, slots=${freshSave.slots.join('/')}`,
    );

    const restoredFresh = new EquipmentSystem(['standardTorpedo']);
    restoredFresh.applyCatalog(catalog);
    restoredFresh.restoreSavedLoadout(null); // SaveStore source 'fresh'
    check(
      '[LOOP] restoreSavedLoadout(null) = 저장 없음 → 기본 어뢰 부여',
      restoredFresh.slots[0] === 'standardTorpedo',
      `slots=${restoredFresh.slots.join('/')}`,
    );

    // 전부 해제한 상태를 저장한 뒤 재부팅한 경우
    const emptySaved = new EquipmentSystem(['standardTorpedo']);
    emptySaved.applyCatalog(catalog);
    emptySaved.restoreSavedLoadout([]); // 저장이 명시한 '전부 해제'
    emptySaved.applyCatalog(catalog); // 카탈로그 재적용(핫리로드)에도 되살아나지 않아야 한다
    check(
      '[LOOP] 명시적 빈 로드아웃은 유지 — 새로고침해도 기본 어뢰가 되살아나지 않는다',
      emptySaved.slots.every((slot) => slot === null) && emptySaved.loadout.equipped.length === 0,
      `slots=${emptySaved.slots.map((slot) => String(slot)).join('/')}`,
    );

    // 기지에서 직접 전부 해제한 경우도 '명시된' 로드아웃이다
    const unequippedInBase = new EquipmentSystem(null);
    unequippedInBase.applyCatalog(catalog);
    unequippedInBase.applyEquipmentChange({ kind: 'unequip', slotIndex: 0 });
    unequippedInBase.applyCatalog(catalog);
    check(
      '[LOOP] 기지에서 해제한 상태도 유지 (자동 재부여 없음)',
      unequippedInBase.slots.every((slot) => slot === null),
      `slots=${unequippedInBase.slots.map((slot) => String(slot)).join('/')}`,
    );

    const restoredSaved = new EquipmentSystem(null);
    restoredSaved.applyCatalog(catalog);
    restoredSaved.restoreSavedLoadout(['heavyTorpedo']);
    check(
      '[LOOP] 저장된 로드아웃 복원 — 슬롯 위치 그대로, 시작 장비 덮어쓰기 없음',
      restoredSaved.slots[0] === 'heavyTorpedo' && restoredSaved.slots[1] === null,
      `slots=${restoredSaved.slots.map((slot) => String(slot)).join('/')}`,
    );
  }

  // 47. [ECON] 업그레이드 — 공식 가격 배열·희귀 부품·effectBonus 누적·paramRef
  {
    const catalog = readOfficialUpgradeCatalog(rawParams.upgrades);
    const maxSpeed = catalog.find((entry) => entry.id === 'maxSpeed');
    const hull = catalog.find((entry) => entry.id === 'hullIntegrity');
    const wallet: { credits: number; rareParts: number } = { credits: 10000, rareParts: 10 };
    const judge = new UpgradePurchaseSystem(catalog, {
      get credits() {
        return wallet.credits;
      },
      get rareParts() {
        return wallet.rareParts;
      },
    });

    const level1 = judge.nextCost('maxSpeed');
    judge.applyPurchasedLevel('maxSpeed');
    judge.applyPurchasedLevel('maxSpeed');
    judge.applyPurchasedLevel('maxSpeed');
    const level4 = judge.nextCost('maxSpeed'); // 4단계 = 340cr + 희귀 1
    check(
      '[ECON] 업그레이드 가격 = 공식 단계별 배열 (100…460 / 희귀 0,0,0,1,2)',
      level1?.credits === 100 &&
        level1.rareParts === 0 &&
        level4?.credits === 340 &&
        level4.rareParts === 1 &&
        maxSpeed?.maxLevel === 5 &&
        maxSpeed.costCredits.every((value) => value !== null),
      `1단계=${level1?.credits}/${level1?.rareParts}, 4단계=${level4?.credits}/${level4?.rareParts}`,
    );

    // effectBonus 누적 — 단계별 증가량의 합 (합연산, 곱연산 금지)
    const sum3 = judge.modifiers.maxSpeed ?? 0; // 3단계 누적
    const expected3 = (maxSpeed?.effectBonus.slice(0, 3) ?? []).reduce<number>(
      (acc, value) => acc + (value ?? 0),
      0,
    );
    const hullJudge = new UpgradePurchaseSystem(catalog, { credits: 0, rareParts: 0 });
    for (let i = 0; i < 5; i += 1) hullJudge.applyPurchasedLevel('hullIntegrity');
    const hullSum = hullJudge.modifiers.hullIntegrity ?? 0;
    check(
      '[ECON] effectBonus 단계 누적 = 공식 배열 합 (A군 3단계 0.16 / B군 5단계 0.6)',
      Math.abs(sum3 - expected3) < 1e-9 &&
        Math.abs(sum3 - 0.16) < 1e-9 &&
        Math.abs(hullSum - 0.6) < 1e-9 &&
        hull?.maxLevel === 5,
      `maxSpeed 3단계=${sum3}, hullIntegrity 5단계=${hullSum}`,
    );

    check(
      '[ECON] paramRef 소비 — 기준값 파라미터 경로가 공식 파일에서 그대로 전달된다',
      maxSpeed?.paramRef === 'movement.maxSpeedMetersPerSecond' &&
        catalog.find((entry) => entry.id === 'turnRate')?.paramRef === 'movement.turn90Seconds' &&
        catalog.find((entry) => entry.id === 'reloadSpeed')?.paramRef ===
          'combat.torpedoReloadSeconds' &&
        hull?.paramRef === undefined,
      `maxSpeed=${String(maxSpeed?.paramRef)}, hullIntegrity=${String(hull?.paramRef)}`,
    );

    // 가격 미확정(null)은 economyDataUnavailable — 임의 값 대입 금지
    const pending = new UpgradePurchaseSystem(
      [
        {
          id: 'sonarRange',
          label: '소나 거리',
          maxLevel: 2,
          costCredits: [null, null],
          costRareParts: [null, null],
          effectBonus: [0.05, 0.05],
        },
      ],
      { credits: 9999, rareParts: 9 },
    );
    const denial = pending.evaluateUpgradePurchase('sonarRange');
    check(
      '[ECON] 공식 가격 미확정 → economyDataUnavailable (0 변환·임시값 대입 없음)',
      denial.denial === 'economyDataUnavailable' && pending.nextCost('sonarRange') === null,
      `denial=${denial.denial}, nextCost=${String(pending.nextCost('sonarRange'))}`,
    );

    // 조립부 축약 카탈로그 + 비용 resolver 경로 (리드 조립 호환)
    const viaResolver = new UpgradePurchaseSystem(
      catalog.map((entry) => ({ id: entry.id, maxLevel: entry.maxLevel, bonusPerLevel: 0.1 })),
      { credits: 10000, rareParts: 10 },
      (statId, nextLevel) => {
        const entry = catalog.find((candidate) => candidate.id === statId);
        return {
          credits: entry?.costCredits[nextLevel - 1] ?? Number.POSITIVE_INFINITY,
          rareParts: entry?.costRareParts[nextLevel - 1] ?? Number.POSITIVE_INFINITY,
        };
      },
    );
    check(
      '[ECON] 조립부 비용 resolver 경로도 공식 값만 반환 (provisional 비용 경로 0)',
      viaResolver.nextCost('maxSpeed')?.credits === 100 &&
        viaResolver.evaluateUpgradePurchase('maxSpeed').denial === null,
      `cost=${String(viaResolver.nextCost('maxSpeed')?.credits)}`,
    );
  }

  // 48. [ECON] 업그레이드 효과 소비자 조사 — 연결 4종 / deferred consumer 3종
  {
    const wired = UPGRADE_EFFECT_CONSUMERS.filter((entry) => entry.status === 'wired');
    const deferred = DEFERRED_UPGRADE_CONSUMERS;
    check(
      '[ECON] 업그레이드 7항목 효과 소비자 조사 — wired 4 / deferred consumer 3 (기준값 발명 없음)',
      UPGRADE_EFFECT_CONSUMERS.length === 7 &&
        wired.length === 4 &&
        deferred.length === 3 &&
        deferred.includes('hullIntegrity') &&
        deferred.includes('maxDepth') &&
        deferred.includes('sonarRange'),
      `wired=${wired.map((entry) => entry.id).join(',')} / deferred=${deferred.join(',')}`,
    );

    // 실제 소비 경로 확인 — 유효 params 주입이 조작·재장전에 반영되는가
    const boosted: typeof params = {
      ...params,
      movement: {
        ...params.movement,
        maxSpeedMetersPerSecond: {
          ...params.movement.maxSpeedMetersPerSecond,
          value: params.movement.maxSpeedMetersPerSecond.value * 1.3,
        },
      },
      combat: {
        ...params.combat,
        torpedoReloadSeconds: {
          ...params.combat.torpedoReloadSeconds,
          value: params.combat.torpedoReloadSeconds.value / 1.3,
        },
      },
    };
    const rig = makeCombatRig(boosted);
    rig.input.throttleForward = true;
    for (let i = 0; i < 600; i += 1) rig.controller.update(1 / 60);
    const boostedSpeed = rig.controller.forwardSpeedMetersPerSecond;
    rig.torpedo.fire();
    const reload = rig.torpedo.reloadRemainingSeconds;
    check(
      '[ECON] maxSpeed·reloadSpeed 소비자 실동작 — 유효 params 주입이 속력·재장전에 반영',
      Math.abs(boostedSpeed - params.movement.maxSpeedMetersPerSecond.value * 1.3) < 1e-6 &&
        Math.abs(reload - params.combat.torpedoReloadSeconds.value / 1.3) < 1e-6,
      `speed=${boostedSpeed.toFixed(3)}, reload=${reload.toFixed(3)}`,
    );

    // torpedoDamage 소비자 — 장비 프로파일에 합연산 반영
    const damageRig = makeCombatRig(params);
    const base = damageRig.equipment.activeTorpedoProfile();
    damageRig.equipment.setUpgradeModifiers({ torpedoSpeedBonus: 0, torpedoDamageBonus: 0.32 });
    const boostedProfile = damageRig.equipment.activeTorpedoProfile();
    check(
      '[ECON] torpedoDamage 소비자 실동작 — setUpgradeModifiers 합연산이 발사 피해에 반영',
      base !== null &&
        boostedProfile !== null &&
        Math.abs(boostedProfile.damage - base.damage * 1.32) < 1e-9,
      `base=${base?.damage} → boosted=${boostedProfile?.damage}`,
    );
  }

  // 49. [LOOP] 해저 재화 production spawn — spawnId 결합·중복 거부·새 출항 재생성
  {
    const rawEconomy = rawParams.economy as {
      salvageSpawns?: Array<{
        spawnId: string;
        kind: string;
        dropTableId: string;
        rarePartId: string | null;
      }>;
    };
    const spawns = rawEconomy.salvageSpawns ?? [];
    // 좌표는 월드·그래픽스 소유 — 검증에서는 플레이어 근처 픽스처 배치를 쓴다
    const plan: SalvageSpawnPlanEntry[] = spawns.map((spawn, index) => ({
      spawnId: spawn.spawnId,
      kind: spawn.kind as 'chest' | 'container' | 'mineral',
      dropTableId: spawn.dropTableId,
      credits: testEconomyParams?.dropTables[spawn.dropTableId]?.credits ?? -1,
      rarePartId: spawn.rarePartId,
      rarePartCount: spawn.rarePartId === null ? 0 : 1,
      worldPosition: { x: index * 0.1, y: 10, z: -16 },
    }));

    const targets = new TargetRegistry();
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input, {
      x: 0,
      y: 10,
      z: -16,
      headingRadians: 0,
    });
    const economy = new EconomySystem(targets, controller, () => [], testEconomyParams);
    const outcomes = plan.map((entry) => economy.spawnSalvageFromPlan(entry));
    const kinds = economy.salvageObjects.map((object) => object.kind).sort();
    check(
      '[LOOP] salvage 확정 배치 3종 (chest/container/mineral) — 확률 없음·spawnId 키 결합',
      plan.length === 3 &&
        outcomes.every((outcome) => outcome.status === 'spawned') &&
        kinds.join(',') === 'chest,container,mineral' &&
        targets.list.length === 3,
      `spawned=${economy.salvageObjects.length}, kinds=${kinds.join('/')}`,
    );

    const duplicate = economy.spawnSalvageFromPlan(plan[0] as SalvageSpawnPlanEntry);
    check(
      '[LOOP] 같은 출항 중복 spawnId 거부 — 아무것도 생성하지 않는다',
      duplicate.status === 'duplicateSpawnId' && economy.salvageObjects.length === 3,
      `status=${duplicate.status}, count=${economy.salvageObjects.length}`,
    );

    // 전부 파괴·회수 → 보상 합계와 희귀 부품 (경제 params 파생값)
    for (const object of [...economy.salvageObjects]) object.onTorpedoHit(0, -16, 1);
    economy.update(1 / 60);
    const expectedCredits = plan.reduce((sum, entry) => sum + entry.credits, 0);
    check(
      '[LOOP] salvage 총 보상 = 경제 params 파생 125 크레딧 + 희귀 부품 1개',
      economy.wallet.sortieCredits === expectedCredits &&
        expectedCredits === 125 &&
        economy.wallet.rareParts.length === 1 &&
        economy.wallet.rareParts[0] === 'rare-alloy-core',
      `credits=${economy.wallet.sortieCredits}/${expectedCredits}, parts=${economy.wallet.rareParts.join(',')}`,
    );

    const afterCollect = economy.spawnSalvageFromPlan(plan[0] as SalvageSpawnPlanEntry);
    check(
      '[LOOP] 회수된 salvage는 같은 출항에서 재생성되지 않는다',
      afterCollect.status === 'duplicateSpawnId' && economy.salvageObjects.length === 0,
      `status=${afterCollect.status}`,
    );

    economy.resetForNewSortie();
    const respawned = plan.map((entry) => economy.spawnSalvageFromPlan(entry));
    check(
      '[LOOP] 새 출항 리셋에서만 spawnId 기록이 열린다 — 전체 3개 재생성',
      economy.spawnedSalvageIds.length === 3 &&
        respawned.every((outcome) => outcome.status === 'spawned') &&
        economy.salvageObjects.length === 3,
      `respawned=${economy.salvageObjects.length}`,
    );

    const unwired = new EconomySystem(new TargetRegistry(), controller, () => [], null);
    check(
      '[LOOP] 경제 params 미주입 = unwired (보상·좌표 발명 없음)',
      unwired.spawnSalvageFromPlan(plan[0] as SalvageSpawnPlanEntry).status === 'unwired' &&
        !unwired.economyParamsWired &&
        unwired.pickupRadiusMeters === 0,
      `wired=${unwired.economyParamsWired}`,
    );
  }

  // 50. [ECON] 경제 런타임 수치 — 공식 값 소비 (손실률 0.5 / 픽업 6m / 화물 120)
  {
    const economyParams = testEconomyParams;
    check(
      '[ECON] 경제 공식 수치 소비 — 손실률 0.5(6차 결의 7)·픽업 6m·수송선 120·salvage 60/40/25',
      economyParams !== null &&
        economyParams.creditLossOnDestroyedRatio === 0.5 &&
        economyParams.pickupRadiusMeters === 6 &&
        economyParams.dropTables['cargo-standard']?.credits === 120 &&
        economyParams.dropTables['salvage-chest']?.credits === 60 &&
        economyParams.dropTables['salvage-container']?.credits === 40 &&
        economyParams.dropTables['salvage-mineral']?.credits === 25,
      `loss=${economyParams?.creditLossOnDestroyedRatio}, pickup=${economyParams?.pickupRadiusMeters}`,
    );

    const targets = new TargetRegistry();
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    const economy = new EconomySystem(targets, controller, () => [], economyParams);
    check(
      '[ECON] 손실률은 주입값에서 온다 (게임플레이 상수 0.4 잔재 없음 — 적용은 MetaLoop)',
      economy.creditLossOnDestroyedRatio === 0.5,
      `률=${economy.creditLossOnDestroyedRatio}`,
    );
  }

  // 51. [LOOP] 조립 주입 단일 진입점 — attachOfficialParams
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params);
    const beforeWired = systems.officialParamsWired;
    const official = testOfficialParams();
    if (official) systems.attachOfficialParams(official);
    check(
      '[LOOP] attachOfficialParams 1회 = 경제·화물선·장비 동시 배선 (JSON·로더 직접 접근 0)',
      !beforeWired &&
        systems.officialParamsWired &&
        systems.economy.economyParamsWired &&
        systems.cargoShip.cargoParamsWired &&
        systems.equipment.equipmentParamsWired &&
        systems.equipment.slotCount === 2,
      `wired ${beforeWired} → ${systems.officialParamsWired}`,
    );
    systems.dispose();
  }

  /* ═══ 스프린트 B 선행개발 (B 공식 미발효 — INT-CORE-012) ═══════════ */

  // 52. [FACTION] B1 — 적대·중립 선박 동시 배치
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const factions = systems.ships.map((ship) => ship.faction);
    const hostiles = systems.ships.filter((ship) => ship.faction === 'hostile');
    const neutrals = systems.ships.filter((ship) => ship.faction === 'neutral');
    check(
      '[FACTION] B1 적대 ≥1 · 중립 ≥1이 같은 월드에 동시 존재 (공식 FactionId)',
      hostiles.length >= 1 &&
        neutrals.length >= 1 &&
        factions.every((faction) => (OFFICIAL_FACTIONS as readonly string[]).includes(faction)) &&
        systems.targets.list.length === systems.ships.length,
      `factions=${factions.join('/')}, targets=${systems.targets.list.length}`,
    );

    // 세력은 태그로만 구분된다 — 클래스·모델·UI 문자열이 아니다.
    const sameClass = systems.ships.every(
      (ship) => Object.getPrototypeOf(ship) === Object.getPrototypeOf(systems.cargoShip),
    );
    check(
      '[FACTION] B1 세력은 태그로만 구분 — 선박 클래스 분화·전용 AI 없음',
      sameClass && neutrals[0]?.id !== hostiles[0]?.id,
      `동일 원형=${sameClass}, ids=${systems.ships.map((ship) => ship.id).join('/')}`,
    );

    // 중립 선박은 먼저 공격하지 않는다: 공격 진입점 자체가 없고, 항행 중
    // 플레이어 위치를 읽지 않는다(직선 왕복만).
    const neutral = neutrals[0];
    const before = { x: neutral?.positionX ?? 0, z: neutral?.positionZ ?? 0 };
    const playerBefore = systems.player.positionX;
    for (let i = 0; i < 300; i += 1) systems.update(1 / 60);
    const attackApi = neutral === undefined ? [] : Object.getOwnPropertyNames(Object.getPrototypeOf(neutral));
    check(
      '[FACTION] B1 중립 선박 선제 공격 없음 — 공격 API 부재·플레이어 상태 무변화',
      !attackApi.some((name) => /attack|fire|pursue|engage/i.test(name)) &&
        systems.player.positionX === playerBefore &&
        (neutral?.positionZ ?? 0) === before.z, // 직선 왕복 — Z 레인 유지
      `api=${attackApi.length}종, 중립 Z ${before.z} → ${neutral?.positionZ}`,
    );
    systems.dispose();
  }

  // 53. [FACTION] B2 — ShipIdentificationSource read model
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const identification = systems.shipIdentification;

    // 조준 전 — 전부 미식별, 라벨 없음 (세력 비노출)
    const unaimed = identification.identifications;
    check(
      '[FACTION] B2 미식별 시 identificationState=unidentified · displayLabelId=null',
      unaimed.length === systems.ships.length &&
        unaimed.every((view) => view.identificationState === 'unidentified') &&
        unaimed.every((view) => view.displayLabelId === null),
      `views=${unaimed.length}, labels=${unaimed.map((view) => String(view.displayLabelId)).join('/')}`,
    );

    // 조준 진입 + 사거리 이내 → 세력 확정. 잠수함을 중립 선박 옆으로 옮긴다.
    const neutralShip = systems.ships.find((ship) => ship.faction === 'neutral');
    systems.player.resetTo({
      x: neutralShip?.positionX ?? 0,
      y: 0,
      z: neutralShip?.positionZ ?? 0,
      headingRadians: 0,
    });
    systems.aim.toggleAim();
    const aimed = identification.identifications;
    const neutralView = aimed.find((view) => view.entityId === neutralShip?.id);
    const hostileView = aimed.find((view) => view.entityId === systems.cargoShip.id);
    check(
      '[FACTION] B2 식별 후 identificationState·라벨이 실제 세력과 일치',
      neutralView?.identificationState === 'neutral' &&
        neutralView.displayLabelId === 'faction.neutral' &&
        neutralView.faction === 'neutral' &&
        hostileView?.identificationState === 'hostile' &&
        hostileView.displayLabelId === 'faction.hostile',
      `neutral=${neutralView?.identificationState}/${String(neutralView?.displayLabelId)}, hostile=${hostileView?.identificationState}`,
    );

    check(
      '[FACTION] B2 식별 조건은 기존 판정 범위 재사용 — 새 거리 상수 없음 (공식 params 미도착)',
      !identification.identificationParamsWired &&
        identification.identificationRangeMeters === systems.torpedo.maxRangeMeters &&
        identification.tagDisplayRangeMeters === systems.torpedo.maxRangeMeters,
      `range=${identification.identificationRangeMeters} (어뢰 사거리 ${systems.torpedo.maxRangeMeters})`,
    );

    // 죽은 표적 — 태그 미표시·비표적
    neutralShip?.onTorpedoHit(neutralShip.positionX, neutralShip.positionZ, 1, {
      attackCorrelationId: 'torpedo:99',
      attackerEntityId: PLAYER_ENTITY_ID,
    });
    const afterKill = identification.identifications.find(
      (view) => view.entityId === neutralShip?.id,
    );
    check(
      '[FACTION] B2 죽은 표적 tagDisplayable=false · isAlive=false · isTargetable=false',
      afterKill?.tagDisplayable === false &&
        afterKill.isAlive === false &&
        afterKill.isTargetable === false &&
        afterKill.identificationState === 'unidentified',
      `alive=${afterKill?.isAlive}, tag=${afterKill?.tagDisplayable}`,
    );
    systems.dispose();
  }

  // 54. [ECON] B3 — 세력별 보상 결정
  {
    const bus = new EventBus();
    const targets = new TargetRegistry();
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    const ships = (testCargoParams
      ? shipPlacementsFromOfficialCargo(testCargoParams, STARTING_CANYON_LAYOUT.seaSurfaceY)
      : []
    ).map((placement) => new CargoShipSystem(bus, targets, placement.config));
    const economy = new EconomySystem(targets, controller, () => ships, testEconomyParams);
    const hostile = ships.find((ship) => ship.faction === 'hostile');
    const neutral = ships.find((ship) => ship.faction === 'neutral');

    // 중립 파괴 — 지갑·드롭 전후 동일
    const walletBefore = {
      sortie: economy.wallet.sortieCredits,
      confirmed: economy.wallet.confirmedCredits,
      rare: economy.wallet.rareParts.length,
    };
    neutral?.onTorpedoHit(neutral.positionX, neutral.positionZ, 1, {
      attackCorrelationId: 'torpedo:10',
      attackerEntityId: PLAYER_ENTITY_ID,
    });
    economy.update(1 / 60);
    check(
      '[ECON] B3 중립 파괴 — 드롭 엔티티 0 · 크레딧 0 · 희귀 0 · 지갑 전후 동일',
      economy.dropField.drops.length === 0 &&
        economy.wallet.sortieCredits === walletBefore.sortie &&
        economy.wallet.confirmedCredits === walletBefore.confirmed &&
        economy.wallet.rareParts.length === walletBefore.rare &&
        rewardDropTableIdFor('neutral') === null,
      `drops=${economy.dropField.drops.length}, credits=${economy.wallet.sortieCredits}`,
    );

    // 적대 파괴 — 기존 공식 보상 유지
    hostile?.onTorpedoHit(hostile.positionX, hostile.positionZ, 1, {
      attackCorrelationId: 'torpedo:11',
      attackerEntityId: PLAYER_ENTITY_ID,
    });
    economy.update(1 / 60);
    const expectedCredits = testEconomyParams?.dropTables['cargo-standard']?.credits ?? -1;
    const drop = economy.dropField.drops[0];
    check(
      '[ECON] B3 적대 파괴 — 기존 공식 cargo-standard 보상 유지 (120)',
      economy.dropField.drops.length === 1 &&
        drop?.amount === expectedCredits &&
        expectedCredits === 120 &&
        rewardDropTableIdFor('hostile') === 'cargo-standard',
      `drops=${economy.dropField.drops.length}, amount=${drop?.amount}`,
    );

    check(
      '[ECON] B3 patrol 보상 — 공식 params 없음 → 드롭 테이블 참조 null (발명 0)',
      rewardDropTableIdFor('patrol') === null,
      `patrol dropTableId=${String(rewardDropTableIdFor('patrol'))}`,
    );
  }

  // 55. [FACTION] B4 — neutralShipHit 발행 규칙
  {
    const bus = new EventBus();
    const targets = new TargetRegistry();
    const hits: NeutralShipHitPayload[] = [];
    bus.on('neutralShipHit', (payload) => hits.push(payload));
    const neutralConfig = (testCargoParams
      ? shipPlacementsFromOfficialCargo(testCargoParams, STARTING_CANYON_LAYOUT.seaSurfaceY)
      : []
    ).find((placement) => placement.faction === 'neutral')?.config;
    const neutral = neutralConfig
      ? new CargoShipSystem(bus, targets, neutralConfig)
      : null;
    const hostile = new CargoShipSystem(
      bus,
      targets,
      testCargoParams
        ? cargoShipConfigFromOfficial(testCargoParams, STARTING_CANYON_LAYOUT.seaSurfaceY)
        : null,
    );

    // 피해 0 = 유효 피해 아님 → 발행 0, 상태 무변화
    neutral?.onTorpedoHit(0, 0, 0, {
      attackCorrelationId: 'torpedo:20',
      attackerEntityId: PLAYER_ENTITY_ID,
    });
    const afterZeroDamage = hits.length === 0 && neutral?.hit === false;

    // 유효 피해 → 정확히 1회
    neutral?.onTorpedoHit(1, 2, 1, {
      attackCorrelationId: 'torpedo:21',
      attackerEntityId: PLAYER_ENTITY_ID,
    });
    const first = hits[0];
    check(
      '[FACTION] B4 중립 유효 피해 시 neutralShipHit 1회 — 피해 0·빗나감은 0회',
      afterZeroDamage &&
        hits.length === 1 &&
        first?.targetFaction === 'neutral' &&
        first.damageAmount === 1 &&
        first.attackerEntityId === PLAYER_ENTITY_ID &&
        first.attackCorrelationId === 'torpedo:21' &&
        first.firstValidNeutralHit === true &&
        first.attackWorldPosition.x === 1 &&
        first.attackWorldPosition.z === 2,
      `hits=${hits.length}, correlation=${first?.attackCorrelationId}, first=${first?.firstValidNeutralHit}`,
    );

    // 같은 표적 재처리·같은 correlationId 재발행 없음 (파괴 후 추가 발행 금지)
    neutral?.onTorpedoHit(1, 2, 1, {
      attackCorrelationId: 'torpedo:21',
      attackerEntityId: PLAYER_ENTITY_ID,
    });
    neutral?.onTorpedoHit(3, 4, 5, {
      attackCorrelationId: 'torpedo:22',
      attackerEntityId: PLAYER_ENTITY_ID,
    });
    // 적대 피격은 중립 사건이 아니다
    hostile.onTorpedoHit(0, 0, 1, {
      attackCorrelationId: 'torpedo:23',
      attackerEntityId: PLAYER_ENTITY_ID,
    });
    check(
      '[FACTION] B4 파괴 후 추가 발행 0 · 같은 correlationId 중복 0 · 적대 피격 0회',
      hits.length === 1,
      `총 발행 ${hits.length}회`,
    );

    // 조준·발사만으로는 발행되지 않는다 (유효 피해 지점에만 발행 코드가 있다)
    const rig = makeCombatRig(params);
    const aimOnlyHits: NeutralShipHitPayload[] = [];
    rig.bus.on('neutralShipHit', (payload) => aimOnlyHits.push(payload));
    rig.aim.toggleAim();
    rig.aim.fireTorpedo();
    for (let i = 0; i < 120; i += 1) rig.torpedo.update(1 / 60); // 표적 없음 = 빗나감
    check(
      '[FACTION] B4 조준·발사·빗나감으로는 발행 0회',
      aimOnlyHits.length === 0,
      `발행 ${aimOnlyHits.length}회 (주행 어뢰 ${rig.torpedo.torpedoes.length}발)`,
    );
  }

  // 56. [AI] B4·B5 — 중립 유효 피격 → 경비 요청 → 스폰 체인 (리드 경계 결합)
  {
    const bus = new EventBus();
    const requests: GuardShipRequestPayload[] = [];
    bus.on('guardShipRequested', (payload) => requests.push(payload));

    const ledger = new GuardIncidentLedger();
    const boundary = new NeutralIncidentBoundary(ledger);
    boundary.initialize(fakeSystemContext(bus, params));

    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const neutral = systems.ships.find((ship) => ship.faction === 'neutral');
    neutral?.onTorpedoHit(neutral.positionX, neutral.positionZ, 1, {
      attackCorrelationId: 'torpedo:30',
      attackerEntityId: PLAYER_ENTITY_ID,
    });
    const request = requests[0];
    check(
      '[AI] B4 중립 유효 피격 → 경비 요청 정확히 1회 (patrol 세력·공격자 전달)',
      requests.length === 1 &&
        request?.requestedFaction === 'patrol' &&
        request.attackerEntityId === PLAYER_ENTITY_ID &&
        request.sourceNeutralEntityId === neutral?.id &&
        request.spawnReason === 'neutralAttack' &&
        request.correlationId === 'torpedo:30',
      `요청 ${requests.length}건, faction=${request?.requestedFaction}`,
    );

    // 스폰 위치 전략 — 실제 좌표를 낸다 (원점·플레이어 위치 반환 금지)
    const location = request ? systems.guardSpawnLocation.resolve(request) : null;
    const playerDistance = location
      ? Math.hypot(location.x - systems.player.positionX, location.z - systems.player.positionZ)
      : -1;
    const incidentDistance =
      location && request
        ? Math.hypot(location.x - request.incidentPosition.x, location.z - request.incidentPosition.z)
        : -1;
    check(
      '[AI] B4 스폰 위치 — 플레이어 선체·사건 지점 회피, 가시 범위 내, 지형 밖',
      location !== null &&
        playerDistance > SUBMARINE_HULL_RADIUS &&
        incidentDistance >= systems.cargoShip.hitRadius &&
        playerDistance <= systems.guardSpawnLocation.maximumSpawnDistanceMeters &&
        !systems.collision.intersectsSphere(
          location.x,
          STARTING_CANYON_LAYOUT.seaSurfaceY,
          location.z,
          systems.cargoShip.hitRadius,
        ),
      `위치=(${location?.x.toFixed(1)}, ${location?.z.toFixed(1)}), 플레이어 거리=${playerDistance.toFixed(1)}`,
    );
    check(
      '[AI] B4 스폰 위치는 원점·플레이어 위치를 무조건 반환하지 않는다',
      location !== null &&
        !(location.x === 0 && location.z === 0) &&
        !(location.x === systems.player.positionX && location.z === systems.player.positionZ),
      `위치=(${location?.x.toFixed(1)}, ${location?.z.toFixed(1)})`,
    );

    // 스폰 포트 결합 — 위치는 해결되고, AI 팩토리가 없으므로 spawnFailed
    const adapter = new GuardShipAdapter(null);
    const coordinator = new GuardSpawnCoordinator(ledger, adapter, systems.guardSpawnLocation);
    const outcomeWithoutAi = request ? coordinator.spawnGuardShip(request) : null;
    check(
      '[AI] B5 blocker — 위치는 해결(noSpawnLocation 아님)되나 구축함 AI 구현 부재로 spawnFailed',
      outcomeWithoutAi === 'spawnFailed' && !adapter.aiWired && adapter.spawnedShips.length === 0,
      `결과=${String(outcomeWithoutAi)} (AI 팩토리 연결=${adapter.aiWired})`,
    );

    // 팩토리가 연결되면 같은 체인이 실제 개체를 만든다 — 어댑터는 주입만 한다.
    // (검증용 최소 AI 더블 = 기존 DestroyerAI 계약 구현. production 코드 아님)
    const notified: Array<{ x: number; z: number }> = [];
    adapter.attachFactory({
      create: () => ({
        state: 'alert' as const,
        notifyLastKnownPosition: (x: number, z: number) => notified.push({ x, z }),
        update: () => {},
      }),
    });
    const secondLedger = new GuardIncidentLedger();
    const wiredCoordinator = new GuardSpawnCoordinator(
      secondLedger,
      adapter,
      systems.guardSpawnLocation,
    );
    const spawned = request ? wiredCoordinator.spawnGuardShip(request) : null;
    const duplicate = request ? wiredCoordinator.spawnGuardShip(request) : null;
    const handle = adapter.spawnedShips[0];
    check(
      '[AI] B5 팩토리 연결 시 — 초기 표적=공격자 · 세력=patrol · 중복 요청 추가 생성 0',
      spawned === 'spawned' &&
        duplicate === 'duplicateRequest' &&
        adapter.spawnedShips.length === 1 &&
        handle?.faction === 'patrol' &&
        handle.initialTargetEntityId === PLAYER_ENTITY_ID &&
        handle.displayLabelId === 'faction.patrol' &&
        notified.length === 1,
      `결과=${String(spawned)}/${String(duplicate)}, 생성 ${adapter.spawnedShips.length}척`,
    );

    // 같은 공격(correlationId)에서 요청은 1건뿐이다 — 원장이 유일한 중복 방지 표
    neutral?.onTorpedoHit(neutral.positionX, neutral.positionZ, 1, {
      attackCorrelationId: 'torpedo:30',
      attackerEntityId: PLAYER_ENTITY_ID,
    });
    check(
      '[AI] B4 같은 correlationId 중복 요청 0 — 중복 방지 정본은 GuardIncidentLedger 하나',
      requests.length === 1 && ledger.requestedCount === 1,
      `요청 ${requests.length}건, 원장 ${ledger.requestedCount}건`,
    );
    boundary.dispose();
    systems.dispose();
  }

  // 57. [LOOP] B6 — 고가치 수송선·호위 (B1~B5와 독립)
  {
    const bus = new EventBus();
    const transport = new HighValueTransportSystem(bus);
    const attacked: TransportAttackedPayload[] = [];
    bus.on('transportAttacked', (payload) => attacked.push(payload));

    const view = transport.registerTransport(700);
    check(
      '[LOOP] B6 고가치 수송선 archetype + 보상 배율 **참조 키** (숫자 아님)',
      view.archetypeId === 'highValueTransport' &&
        typeof view.rewardMultiplierRef === 'string' &&
        transport.rewardMultiplierFor(700) === null &&
        !transport.rewardMultipliersWired,
      `ref=${view.rewardMultiplierRef}, 배율=${String(transport.rewardMultiplierFor(700))}`,
    );

    transport.attachRewardMultipliers({ [view.rewardMultiplierRef]: 2.5 });
    check(
      '[LOOP] B6 공식 배율 표가 주입되면 그 값을 그대로 소비 (하드코딩 아님)',
      transport.rewardMultiplierFor(700) === 2.5 && transport.rewardMultipliersWired,
      `배율=${String(transport.rewardMultiplierFor(700))}`,
    );

    transport.bindEscort({
      escortEntityId: 701,
      escortedTransportId: 700,
      maximumEscortDistanceMeters: 40,
    });
    const engagements = transport.reportTransportAttacked(700, PLAYER_ENTITY_ID, { x: 5, z: 6 }, 'torpedo:40');
    const repeat = transport.reportTransportAttacked(700, PLAYER_ENTITY_ID, { x: 5, z: 6 }, 'torpedo:40');
    check(
      '[LOOP] B6 transport-escort 결속 + transportAttacked 1회 + 교전 요청 (중복 0)',
      transport.escortsOf(700).length === 1 &&
        attacked.length === 1 &&
        attacked[0]?.attackCorrelationId === 'torpedo:40' &&
        engagements.length === 1 &&
        engagements[0]?.escortEntityId === 701 &&
        engagements[0].targetEntityId === PLAYER_ENTITY_ID &&
        repeat.length === 0,
      `결속=${transport.escortsOf(700).length}, 발행=${attacked.length}, 요청=${engagements.length}`,
    );

    const withinRange = transport.escortsWithinRange(
      700,
      { id: 700, positionX: 0, positionZ: 0 },
      [{ id: 701, positionX: 39, positionZ: 0 }],
    );
    const outOfRange = transport.escortsWithinRange(
      700,
      { id: 700, positionX: 0, positionZ: 0 },
      [{ id: 701, positionX: 41, positionZ: 0 }],
    );
    check(
      '[LOOP] B6 maximumEscortDistance 소비 — 상한 안/밖 구분 (거리 값은 결속이 소유)',
      withinRange.length === 1 && outOfRange.length === 0,
      `이내=${withinRange.length}, 초과=${outOfRange.length}`,
    );

    // B6 독립성 — 핵심 게이트 경로(B1~B5)는 이 시스템 없이도 성립한다.
    const coreBus = new EventBus();
    const coreSystems = new GameplaySystems(
      coreBus,
      params,
      undefined,
      STARTING_CANYON_LAYOUT,
      testOfficialParams(),
    );
    const coreHits: NeutralShipHitPayload[] = [];
    coreBus.on('neutralShipHit', (payload) => coreHits.push(payload));
    const coreNeutral = coreSystems.ships.find((ship) => ship.faction === 'neutral');
    coreNeutral?.onTorpedoHit(0, 0, 1, {
      attackCorrelationId: 'torpedo:41',
      attackerEntityId: PLAYER_ENTITY_ID,
    });
    check(
      '[LOOP] B6 독립 — 고가치·호위를 쓰지 않아도 B1~B4 경로가 그대로 성립',
      coreHits.length === 1 && coreSystems.highValueTransport.highValueTransports.length === 0,
      `중립 사건=${coreHits.length}, 등록 수송선=${coreSystems.highValueTransport.highValueTransports.length}`,
    );
    coreSystems.dispose();
  }

  /* ═══ B5 런타임 연결 — 실제 경비함 생성·이동 (INT-CORE-013) ════════ */

  // 58. [AI] SurfaceShipMotionPort — 스폰당 독립 pose·운동학·경계·표적 조회
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const factory = systems.surfaceShipMotionPortFactory;
    const incident = { x: 0, z: -20 };
    const portA = factory.create(guardConfig(1000, incident, { x: 10, z: -20 }));
    const portB = factory.create(guardConfig(1001, incident, { x: -10, z: -20 }));

    check(
      '[AI] motion port — 스폰 1건 = 포트 1개 = 독립 pose (pose 공유 없음)',
      portA !== null &&
        portB !== null &&
        portA.getPosition().x === 10 &&
        portB.getPosition().x === -10 &&
        systems.patrolShips.length === 2 &&
        systems.patrolShips[0]?.entityId !== systems.patrolShips[1]?.entityId,
      `A=(${portA?.getPosition().x}), B=(${portB?.getPosition().x}), 엔티티=${systems.patrolShips.length}`,
    );

    // 한쪽만 움직여도 다른 쪽 pose는 그대로다 (공유 상태 없음)
    const beforeB = portB?.getPosition().x ?? 0;
    portA?.moveForward(1);
    check(
      '[AI] motion port — 한 척의 이동이 다른 척·플레이어 pose에 영향 없음',
      portA?.getPosition().x !== 10 &&
        portB?.getPosition().x === beforeB &&
        systems.player.positionX === STARTING_CANYON_LAYOUT.submarineSpawn.x,
      `A=${portA?.getPosition().x.toFixed(2)}, B=${portB?.getPosition().x}, 플레이어=${systems.player.positionX}`,
    );

    // turnToward — 목표 방향으로 선수각이 바뀐다 (선수 = (−sin h, −cos h))
    const shipA = systems.patrolShips[0];
    const headingBefore = shipA?.headingRadians ?? 0;
    // 스폰 선수는 사건 지점을 향해 있다 — 직각 방향 목표로 돌려 선회를 관측한다
    const turnTarget = { x: portA?.getPosition().x ?? 0, z: (portA?.getPosition().z ?? 0) - 30 };
    for (let i = 0; i < 240; i += 1) portA?.turnToward(turnTarget.x, turnTarget.z, 1 / 60);
    const forward = portA?.getForward() ?? { x: 0, z: 0 };
    const toTarget = {
      x: turnTarget.x - (portA?.getPosition().x ?? 0),
      z: turnTarget.z - (portA?.getPosition().z ?? 0),
    };
    const length = Math.hypot(toTarget.x, toTarget.z);
    const alignment = length > 0 ? (forward.x * toTarget.x + forward.z * toTarget.z) / length : 0;
    check(
      '[AI] motion port — turnToward가 목표 방향으로 선수각을 바꾼다 (정렬 ≈ 1)',
      Math.abs(alignment - 1) < 1e-3 && (shipA?.headingRadians ?? 0) !== headingBefore,
      `정렬=${alignment.toFixed(6)}, heading ${headingBefore.toFixed(3)} → ${(shipA?.headingRadians ?? 0).toFixed(3)}`,
    );

    // moveForward — 선수 방향으로 (속력 × dt)만큼 이동
    const positionBefore = portA?.getPosition() ?? { x: 0, y: 0, z: 0 };
    const step = 1 / 60;
    portA?.moveForward(step);
    const positionAfter = portA?.getPosition() ?? { x: 0, y: 0, z: 0 };
    const traveled = Math.hypot(
      positionAfter.x - positionBefore.x,
      positionAfter.z - positionBefore.z,
    );
    const expectedTravel = (testCargoParams?.speedMetersPerSecond ?? 0) * step;
    check(
      '[AI] motion port — moveForward가 선수 방향으로 공식 속력만큼 이동',
      Math.abs(traveled - expectedTravel) < 1e-9 &&
        Math.abs(positionAfter.x - (positionBefore.x + forward.x * expectedTravel)) < 1e-9,
      `이동=${traveled.toFixed(6)} (기대 ${expectedTravel.toFixed(6)})`,
    );

    // maintainSurfaceHeight — 공식 seaSurfaceY 유지
    portA?.maintainSurfaceHeight();
    check(
      '[AI] motion port — 수상함 고도 = 공유 레이아웃 seaSurfaceY (임의 높이 없음)',
      portA?.getPosition().y === STARTING_CANYON_LAYOUT.seaSurfaceY &&
        portB?.getPosition().y === STARTING_CANYON_LAYOUT.seaSurfaceY,
      `y=${portA?.getPosition().y} (레이아웃 ${STARTING_CANYON_LAYOUT.seaSurfaceY})`,
    );

    // world bounds — 레이아웃 블록 + 공식 항로 끝점에서 파생, 밖은 거부.
    // 블록만으로 잡은 경계보다 넓어야 한다(공식 화물선 항로가 협곡 벽 바깥).
    const bounds = systems.worldBounds;
    const blocksOnly = canyonHorizontalBounds(STARTING_CANYON_LAYOUT);
    check(
      '[AI] motion port — 월드 경계 = 레이아웃 블록 + 공식 항로 파생 (경계 밖 이동 차단)',
      bounds !== null &&
        blocksOnly !== null &&
        bounds.maxX >= blocksOnly.maxX &&
        bounds.minX <= blocksOnly.minX &&
        portA?.isWithinWorldBounds(0, 0) === true &&
        portA.isWithinWorldBounds(bounds.maxX + 1, 0) === false &&
        portA.isWithinWorldBounds(0, bounds.minZ - 1) === false,
      `경계 x[${bounds?.minX.toFixed(1)}, ${bounds?.maxX.toFixed(1)}] (블록만 [${blocksOnly?.minX.toFixed(1)}, ${blocksOnly?.maxX.toFixed(1)}])`,
    );

    // 표적 조회 — [C3] 탐지 unwired면 플레이어는 **관측 불가**(위치 null),
    // 생사는 PlayerAliveSource 미연결이라 생존으로 본다. 미지 id는 안전 동작.
    const playerPosition = portA?.getTargetPosition(PLAYER_ENTITY_ID);
    check(
      '[AI] motion port — 표적 조회: 탐지 unwired = 관측 불가(null) / 미지 id는 null·비생존',
      portA?.isTargetAlive(PLAYER_ENTITY_ID) === true &&
        !systems.detectionWired &&
        playerPosition === null &&
        portA.isTargetAlive(987654) === false &&
        portA.getTargetPosition(987654) === null,
      `플레이어 관측=${String(playerPosition)}, 탐지 배선=${systems.detectionWired}`,
    );

    // 같은 entityId 재요청 — 추가 엔티티를 만들지 않는다
    const duplicatePort = factory.create(guardConfig(1000, incident, { x: 10, z: -20 }));
    check(
      '[AI] motion port — 같은 entityId 재요청 시 추가 엔티티 생성 0 (null 반환)',
      duplicatePort === null && systems.patrolShips.length === 2,
      `엔티티=${systems.patrolShips.length}`,
    );
    systems.dispose();
  }

  // 59. [AI] B4→B5 production 체인 — 중립 피격에서 경비함 생성·이동까지
  {
    const bus = new EventBus();
    const requests: GuardShipRequestPayload[] = [];
    bus.on('guardShipRequested', (payload) => requests.push(payload));

    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const ledger = new GuardIncidentLedger();
    const boundary = new NeutralIncidentBoundary(ledger);
    boundary.initialize(fakeSystemContext(bus, params));

    // production 조립과 동일한 배선 — 검증 더블 없음
    const adapter = new GuardShipAdapter(
      createProductionDestroyerAIFactory(systems.surfaceShipMotionPortFactory),
    );
    const coordinator = new GuardSpawnCoordinator(ledger, adapter, systems.guardSpawnLocation);
    const spawnedHandles: Array<{ entityId: number; faction: string }> = [];
    coordinator.attachSpawnListener((handle) => {
      spawnedHandles.push({ entityId: handle.entityId, faction: handle.faction });
    });
    const bridge = new GuardSpawnBridge(coordinator);
    bridge.initialize(fakeSystemContext(bus, params));

    const neutral = systems.ships.find((ship) => ship.faction === 'neutral');
    neutral?.onTorpedoHit(neutral.positionX, neutral.positionZ, 1, {
      attackCorrelationId: 'torpedo:50',
      attackerEntityId: PLAYER_ENTITY_ID,
    });

    const handle = adapter.spawnedShips[0];
    const patrol = systems.patrolShips[0];
    check(
      '[AI] B5 production 체인 — 중립 1회 공격 → 경비함 1척 실제 생성 (spawned)',
      requests.length === 1 &&
        bridge.lastOutcome === 'spawned' &&
        adapter.spawnedShips.length === 1 &&
        systems.patrolShips.length === 1 &&
        spawnedHandles.length === 1 &&
        adapter.aiWired,
      `요청=${requests.length}, 결과=${String(bridge.lastOutcome)}, 엔티티=${systems.patrolShips.length}`,
    );
    check(
      '[AI] B5 생성 개체 — faction=patrol · 초기 표적=플레이어 · spawnPosition 보존',
      handle?.faction === 'patrol' &&
        handle.initialTargetEntityId === PLAYER_ENTITY_ID &&
        patrol?.faction === 'patrol' &&
        patrol.entityId === handle.entityId &&
        patrol.positionX === handle.spawnPosition.x &&
        patrol.positionZ === handle.spawnPosition.z &&
        patrol.spawnPosition.x === handle.spawnPosition.x,
      `faction=${handle?.faction}, entityId=${handle?.entityId}, spawn=(${handle?.spawnPosition.x.toFixed(1)}, ${handle?.spawnPosition.z.toFixed(1)})`,
    );
    check(
      '[AI] B5 사건 위치가 마지막 확인 위치로 전달 (경비함이 그 방향에서 시작)',
      patrol?.incidentPosition.x === requests[0]?.incidentPosition.x &&
        patrol?.incidentPosition.z === requests[0]?.incidentPosition.z &&
        handle?.ai.state === 'alert',
      `사건=(${patrol?.incidentPosition.x.toFixed(1)}, ${patrol?.incidentPosition.z.toFixed(1)}), AI=${handle?.ai.state}`,
    );

    // 실제 이동 — [C3] 탐지 unwired에서는 플레이어가 관측 불가이므로 AI가
    // **마지막 확인 위치(사건 지점)** 로 접근한다(alert 유지). 전이 규칙은
    // 리드 DestroyerAIController 소유이며 여기서 복제하지 않는다.
    const incidentPoint = {
      positionX: requests[0]?.incidentPosition.x ?? 0,
      positionZ: requests[0]?.incidentPosition.z ?? 0,
    };
    const startDistance = distanceTo(patrol, incidentPoint);
    for (let i = 0; i < 300; i += 1) {
      adapter.update(1 / 60);
      systems.update(1 / 60);
    }
    const endDistance = distanceTo(patrol, incidentPoint);
    check(
      '[AI] B5 경비함 실제 이동 — 수면 유지하며 마지막 확인 위치로 접근 (탐지 unwired = alert)',
      patrol !== undefined &&
        endDistance < startDistance &&
        patrol.positionY === STARTING_CANYON_LAYOUT.seaSurfaceY &&
        handle?.ai.state === 'alert',
      `거리 ${startDistance.toFixed(1)} → ${endDistance.toFixed(1)}, AI=${handle?.ai.state}`,
    );

    // 중복 방지 — 같은 correlationId 재피격·같은 requestId 재처리
    neutral?.onTorpedoHit(neutral.positionX, neutral.positionZ, 1, {
      attackCorrelationId: 'torpedo:50',
      attackerEntityId: PLAYER_ENTITY_ID,
    });
    const duplicateOutcome = requests[0]
      ? coordinator.spawnGuardShip(requests[0])
      : null;
    check(
      '[AI] B5 중복 방지 — 같은 correlationId 요청 0 추가 · 같은 requestId는 duplicateRequest',
      requests.length === 1 &&
        duplicateOutcome === 'duplicateRequest' &&
        adapter.spawnedShips.length === 1 &&
        systems.patrolShips.length === 1,
      `요청=${requests.length}, 재처리=${String(duplicateOutcome)}, 엔티티=${systems.patrolShips.length}`,
    );

    boundary.dispose();
    bridge.dispose();
    systems.dispose();
    check(
      '[AI] B5 dispose — 경비함이 표적 등록소·렌더 소스에서 제거된다',
      systems.patrolShips.length === 0 &&
        !systems.targets.list.some((target) => target.id === handle?.entityId) &&
        !systems.shipWorldSource.shipViews.some((view) => view.entityId === handle?.entityId),
      `잔존 엔티티=${systems.patrolShips.length}`,
    );
  }

  // 60. [FACTION] 다중 선박 read source + patrol 식별
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const incident = { x: 0, z: -20 };
    systems.surfaceShipMotionPortFactory.create(guardConfig(1100, incident, { x: 4, z: -20 }));

    const views = systems.shipWorldSource.shipViews;
    const factions = views.map((view) => view.faction).sort();
    check(
      '[FACTION] 다중 선박 read source — hostile·neutral·patrol 3종 동시 노출',
      views.length === 3 &&
        factions.join(',') === 'hostile,neutral,patrol' &&
        views.every((view) => typeof view.visualArchetype === 'string' && view.alive) &&
        views.some((view) => view.visualArchetype === 'ship.patrol') &&
        views.some((view) => view.visualArchetype === 'ship.cargo'),
      `views=${views.length}, factions=${factions.join('/')}`,
    );

    // entityId가 월드 엔티티·표적·식별에서 모두 같다
    const patrolView = views.find((view) => view.faction === 'patrol');
    const patrolEntity = systems.patrolShips[0];
    const identificationIds = systems.shipIdentification.identifications.map((v) => v.entityId);
    check(
      '[FACTION] entityId 일치 — 월드 엔티티·표적 등록소·식별·렌더 소스가 같은 키',
      patrolView?.entityId === patrolEntity?.entityId &&
        systems.targets.list.some((target) => target.id === patrolEntity?.entityId) &&
        identificationIds.includes(patrolEntity?.entityId ?? -1) &&
        identificationIds.length === 3,
      `patrol=${patrolView?.entityId}, 식별=${identificationIds.join('/')}`,
    );

    // patrol 식별 — 조준 + 사거리 이내에서 세력 확정
    systems.player.resetTo({
      x: patrolEntity?.positionX ?? 0,
      y: 0,
      z: patrolEntity?.positionZ ?? 0,
      headingRadians: 0,
    });
    systems.aim.toggleAim();
    const patrolIdentification = systems.shipIdentification.identifications.find(
      (view) => view.entityId === patrolEntity?.entityId,
    );
    check(
      '[FACTION] patrol 식별 — identificationState=patrol · 라벨 키 일치',
      patrolIdentification?.identificationState === 'patrol' &&
        patrolIdentification.displayLabelId === 'faction.patrol' &&
        patrolIdentification.faction === 'patrol' &&
        patrolIdentification.tagDisplayable,
      `state=${patrolIdentification?.identificationState}, label=${String(patrolIdentification?.displayLabelId)}`,
    );

    // 죽은 경비함 — 태그 제거 + 렌더 소스에서 제외
    patrolEntity?.onTorpedoHit(0, 0, 1);
    systems.update(1 / 60);
    const deadIdentification = systems.shipIdentification.identifications.find(
      (view) => view.entityId === patrolEntity?.entityId,
    );
    check(
      '[FACTION] 죽은 경비함 — tagDisplayable=false · 표적·렌더 소스에서 제거',
      deadIdentification === undefined &&
        !systems.targets.list.some((target) => target.id === patrolEntity?.entityId) &&
        !systems.shipWorldSource.shipViews.some(
          (view) => view.entityId === patrolEntity?.entityId,
        ),
      `식별 잔존=${deadIdentification !== undefined}`,
    );
    systems.dispose();
  }

  // 61. [LOOP] B6 — 범용 factory 입력 변환 + 공식 거리 없으면 비활성
  {
    const bus = new EventBus();
    const transport = new HighValueTransportSystem(bus);
    transport.registerTransport(800);
    const notBound = transport.bindEscortFromOfficial(801, 800);
    check(
      '[LOOP] B6 공식 이탈 거리 미도착 — 결속을 만들지 않는다 (임의 거리 발명 0)',
      !notBound && !transport.escortDistanceWired && transport.escortsOf(800).length === 0,
      `결속=${transport.escortsOf(800).length}`,
    );

    transport.attachEscortDistanceMeters(40);
    const bound = transport.bindEscortFromOfficial(801, 800);
    const engagements = transport.reportTransportAttacked(
      800,
      PLAYER_ENTITY_ID,
      { x: 3, z: -7 },
      'torpedo:60',
    );
    const escortRequest = engagements[0];
    const config = escortRequest
      ? escortEngagementToAdapterConfig(escortRequest, {
          entityId: 801,
          faction: 'patrol',
          spawnPosition: { x: 3, z: -7 },
          displayLabelId: 'faction.patrol',
        })
      : null;
    check(
      '[LOOP] B6 교전 요청 → **범용** 구축함 AI 팩토리 입력 변환 (호위 전용 AI 0)',
      bound &&
        engagements.length === 1 &&
        config?.initialTargetEntityId === PLAYER_ENTITY_ID &&
        config.initialTargetPosition.x === 3 &&
        config.entityId === 801 &&
        config.faction === 'patrol',
      `요청=${engagements.length}, 초기표적=${String(config?.initialTargetEntityId)}`,
    );

    // 변환 결과를 그대로 경비함과 같은 production 팩토리에 넣을 수 있다
    const bus2 = new EventBus();
    const systems = new GameplaySystems(bus2, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const escortFactory = createProductionDestroyerAIFactory(systems.surfaceShipMotionPortFactory);
    const escortAi = config ? escortFactory.create(config) : null;
    check(
      '[LOOP] B6 호위도 경비함과 **같은** 범용 AI·이동 포트 경로를 쓴다',
      escortAi !== null && systems.patrolShips.length === 1,
      `AI 생성=${escortAi !== null}, 엔티티=${systems.patrolShips.length}`,
    );
    systems.dispose();
  }

  /* ═══ 스프린트 C1~C4 (INT-CORE-015 / SPRINT_C_HANDOFF) ═════════════ */

  // 62. [COMBAT] C1 — 탐지 게이지 unwired 고정 / 확정 시 구동
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    // unwired 보장은 **명시적 null 입력**으로 검증한다 — C9 v0.1 승인으로
    // 실파일은 더 이상 null이 아니지만, 미확정 상태의 게이지 0·safe 고정
    // 계약은 영구 보장이다. 정규화 경로 그대로: 공인 로더(validateCombatParams
    // — 중첩 스키마 단일 해석 지점)에 null 명시 픽스처를 통과시킨다 [INT-CORE-017].
    const nullValueBlock = (fields: readonly string[]): Record<string, { value: null }> =>
      Object.fromEntries(fields.map((field) => [field, { value: null }]));
    const nullCombatResult = validateCombatParams({
      // 소나 표시 정책은 null을 두지 않는다 (기본 false) — C9 4블록과 규칙이 다르다.
      depthChargeOnPassiveScope: { value: false },
      hull: nullValueBlock(['baseMaxHull', 'damagedRatioThreshold', 'criticalRatioThreshold']),
      depthCharge: nullValueBlock([
        'directRadiusMeters',
        'nearRadiusMeters',
        'directDamage',
        'nearDamage',
        'dropCooldownSeconds',
        'directFloodingContribution',
        'nearFloodingContribution',
      ]),
      flooding: nullValueBlock([
        'minorThreshold',
        'majorThreshold',
        'catastrophicThreshold',
        'hullDamagePerSecondAtFull',
        'spreadPerSecond',
      ]),
      detection: nullValueBlock(['distanceFalloff', 'gaugeDecayPerSecond']),
    });
    systems.attachCombatParams({
      detectionTuning: nullCombatResult.detectionTuning,
      depthCharge: nullCombatResult.depthCharge,
    });
    const changes: Array<{ gauge: number; stage: string }> = [];
    bus.on('detectionChanged', (payload) => changes.push(payload));

    systems.detection.reportNoise(1);
    for (let i = 0; i < 600; i += 1) systems.update(1 / 60);
    const hud = systems.detectionHudView();
    check(
      '[COMBAT] C1 tuning params null → 게이지 0·stage safe 고정·전이 0 (임의 기본값 없음)',
      !systems.detectionWired &&
        hud.gauge === 0 &&
        hud.stage === 'safe' &&
        hud.unwired &&
        changes.length === 0 &&
        systems.detectionStageSource.stage === 'safe',
      `gauge=${hud.gauge}, stage=${hud.stage}, unwired=${hud.unwired}, 전이=${changes.length}`,
    );

    // 실파일 확정 상태 단언 (C9 v0.1 승인): 공인 로더 기준 15필드 전량
    // 확정·pending 0건. 승인값이 회귀로 null·부분 확정이 되면 여기서 잡힌다.
    const realCombatResult = validateCombatParams(rawParams.combat);
    check(
      '[COMBAT] C9 v0.1 — 실파일 combat.json 15필드 전량 확정 (pending 0건·전 블록 non-null)',
      realCombatResult.pendingFields.length === 0 &&
        realCombatResult.hull !== null &&
        realCombatResult.depthCharge !== null &&
        realCombatResult.flooding !== null &&
        realCombatResult.detectionTuning !== null,
      `pending=${realCombatResult.pendingFields.length} [${realCombatResult.pendingFields.join(', ')}]`,
    );

    // 픽스처 수치 주입(검증 전용 — production params 아님) → 게이지 구동
    systems.detection.attachTuningParams(DETECTION_TUNING_FIXTURE);
    systems.player.resetTo({ x: 0, y: 0, z: 0, headingRadians: 0 });
    systems.detection.reportNoise(1);
    for (let i = 0; i < 60; i += 1) systems.update(1 / 60);
    const wiredHud = systems.detectionHudView();
    check(
      '[COMBAT] C1 확정 수치 주입 시 게이지 상승 + detectionChanged 발행 (별도 이벤트 없음)',
      systems.detectionWired &&
        !wiredHud.unwired &&
        wiredHud.gauge > 0 &&
        wiredHud.stage === 'searching' &&
        changes.length > 0,
      `gauge=${wiredHud.gauge.toFixed(4)}, stage=${wiredHud.stage}, 전이=${changes.length}`,
    );

    // AI 소비 모델에는 게이지가 없다 (stage·마지막 노출 위치만)
    const stageSourceKeys = Object.keys(systems.detectionStageSource).concat(
      Object.getOwnPropertyNames(systems.detectionStageSource),
    );
    check(
      '[COMBAT] C1 AI에는 stage만 노출 — 게이지·내부 상태 접근 경로 없음',
      !stageSourceKeys.includes('gauge') &&
        stageSourceKeys.includes('stage') &&
        stageSourceKeys.includes('lastExposedPosition'),
      `키=${[...new Set(stageSourceKeys)].join(',')}`,
    );

    // 출항 초기화에서 게이지·노출 위치가 비워진다
    systems.resetSortieSession(params);
    check(
      '[COMBAT] C1 출항 reset — 게이지 0·노출 위치 null',
      systems.detectionHudView().gauge === 0 &&
        systems.detection.lastExposedPosition === null,
      `gauge=${systems.detectionHudView().gauge}`,
    );
    systems.dispose();
  }

  // 63. [COMBAT] C2 — 은신·심도 보정 입력
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const environment = systems.detectionEnvironment;
    check(
      '[COMBAT] C2 심도 층은 기존 3층 정본 소비 · 소음·침묵 미연결 = 중립 입력',
      environment.depthLayer === systems.depth.currentLayer &&
        environment.noiseLevel === 0 &&
        environment.silentRunning === false &&
        !environment.wired.noise &&
        !environment.wired.silentRunning,
      `layer=${environment.depthLayer}, noise=${environment.noiseLevel}, silent=${environment.silentRunning}`,
    );

    // 소스를 연결하면 값을 그대로 전달한다 (보정 계산은 하지 않는다)
    const silent = { silentRunning: true };
    environment.attachNoiseSource({ noiseLevel: 1 });
    environment.attachSilentRunningSource(silent);
    systems.detection.attachTuningParams(DETECTION_TUNING_FIXTURE);
    systems.player.resetTo({ x: 0, y: 0, z: 0, headingRadians: 0 });
    for (let i = 0; i < 60; i += 1) systems.update(1 / 60);
    const silentGauge = systems.detectionHudView().gauge;

    systems.resetSortieSession(params);
    silent.silentRunning = false;
    for (let i = 0; i < 60; i += 1) systems.update(1 / 60);
    const loudGauge = systems.detectionHudView().gauge;
    const officialMultiplier = params.detection.silentRunningNoiseMultiplier.value;
    check(
      '[COMBAT] C2 침묵 항행이 게이지 증가율에 반영 — 공식 배율 그대로 (자체 계수 없음)',
      silentGauge > 0 &&
        loudGauge > silentGauge &&
        Math.abs(silentGauge - loudGauge * officialMultiplier) < 1e-9,
      `침묵=${silentGauge.toFixed(6)}, 일반=${loudGauge.toFixed(6)} (공식 배율 ${officialMultiplier})`,
    );

    // 심도 보정 — 층별 공식 배율이 그대로 곱해진다
    const depthModifier = params.detection.depthModifiers[systems.depth.currentLayer];
    check(
      '[COMBAT] C2 심도 보정은 공식 depthModifiers 사용 (렌더·어댑터 계산 0)',
      typeof depthModifier === 'number' && depthModifier > 0,
      `layer=${systems.depth.currentLayer}, modifier=${depthModifier}`,
    );
    systems.dispose();
  }

  // 64. [COMBAT] C3 — 추적 상태 연결 (기존 어휘·전이만 사용)
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const adapter = new GuardShipAdapter(
      createProductionDestroyerAIFactory(systems.surfaceShipMotionPortFactory),
    );
    const incident = { x: 0, z: -20 };
    const handle = adapter.spawn('c3', guardConfig(1200, incident, { x: 12, z: -20 }));

    // 탐지 unwired → 관측 불가 → alert(마지막 확인 위치 접근)
    for (let i = 0; i < 60; i += 1) adapter.update(1 / 60);
    const unwiredState = handle?.ai.state;

    // 픽스처 stage 소스를 detected로 두면 관측 가능 → attack 전이
    const stage: { stage: DetectionStage; lastExposedPosition: null } = {
      stage: 'detected',
      lastExposedPosition: null,
    };
    systems.attachDetectionStageSource(stage);
    for (let i = 0; i < 60; i += 1) adapter.update(1 / 60);
    const detectedState = handle?.ai.state;

    stage.stage = 'safe';
    for (let i = 0; i < 60; i += 1) adapter.update(1 / 60);
    const lostContactState = handle?.ai.state;
    check(
      '[COMBAT] C3 stage만으로 patrol/alert/attack/lost 전이 — 새 상태명·상태 머신 0',
      unwiredState === 'alert' &&
        detectedState === 'attack' &&
        lostContactState === 'alert' &&
        (['patrol', 'alert', 'attack', 'lost'] as const).includes(
          handle?.ai.state ?? 'patrol',
        ),
      `unwired=${unwiredState} → detected=${detectedState} → 상실=${lostContactState}`,
    );
    systems.dispose();
  }

  // 65. [COMBAT] C4 PlayerAliveSource 실제 배선
  {
    const bus = new EventBus();
    const systems = new GameplaySystems(bus, params, undefined, STARTING_CANYON_LAYOUT, testOfficialParams());
    const adapter = new GuardShipAdapter(
      createProductionDestroyerAIFactory(systems.surfaceShipMotionPortFactory),
    );
    const incident = { x: 0, z: -20 };
    const port = systems.surfaceShipMotionPortFactory.create(
      guardConfig(1300, incident, { x: 12, z: -20 }),
    );
    const alive = { isPlayerAlive: true };
    const beforeWired = systems.playerAliveSourceWired;
    systems.attachPlayerAliveSource(alive);
    const stage: { stage: DetectionStage; lastExposedPosition: null } = {
      stage: 'detected',
      lastExposedPosition: null,
    };
    systems.attachDetectionStageSource(stage);

    const aliveObserved = port?.getTargetPosition(PLAYER_ENTITY_ID) !== null;
    alive.isPlayerAlive = false;
    check(
      '[COMBAT] C4 destroyed 플레이어를 PatrolShipFleet가 alive로 판단하지 않음',
      !beforeWired &&
        systems.playerAliveSourceWired &&
        aliveObserved &&
        port?.isTargetAlive(PLAYER_ENTITY_ID) === false &&
        port.getTargetPosition(PLAYER_ENTITY_ID) === null,
      `생존 시 관측=${aliveObserved}, 파괴 후 alive=${port?.isTargetAlive(PLAYER_ENTITY_ID)}`,
    );

    // 파괴 후 공격 요청 0건
    systems.enemyAttack.attachDamageParams(DEPTH_CHARGE_FIXTURE);
    const destroyedOutcome = systems.enemyAttackPort.requestAttack(
      attackRequest('atk-destroyed', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    );
    check(
      '[COMBAT] C4 destroyed 후 공격 요청 0건 (폭뢰 투하 0)',
      destroyedOutcome !== 'delivered' && systems.depthCharges.activeCount === 0,
      `결과=${destroyedOutcome}, 수중 폭뢰=${systems.depthCharges.activeCount}`,
    );

    // 다음 출항 reset 후 다시 살아 있는 target으로 인식
    alive.isPlayerAlive = true;
    systems.resetSortieSession(params);
    check(
      '[COMBAT] C4 다음 출항 reset 후 alive 상태 복구',
      port?.isTargetAlive(PLAYER_ENTITY_ID) === true &&
        port.getTargetPosition(PLAYER_ENTITY_ID) !== null,
      `alive=${port?.isTargetAlive(PLAYER_ENTITY_ID)}`,
    );
    adapter.dispose();
    systems.dispose();
  }

  // 66. [COMBAT] C4 EnemyAttackPort — unwired·사거리·쿨다운·중복
  {
    const rig = makeSurvivalRig(params);
    const unwiredOutcome = rig.systems.enemyAttackPort.requestAttack(
      attackRequest('atk-unwired', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    );
    check(
      '[COMBAT] C4 params null → unwired (즉시 피해·거리 무관 피해 0)',
      unwiredOutcome === 'unwired' &&
        rig.systems.depthCharges.activeCount === 0 &&
        rig.damageCalls.length === 0,
      `결과=${unwiredOutcome}, 피해 호출=${rig.damageCalls.length}`,
    );

    rig.systems.enemyAttack.attachDamageParams(DEPTH_CHARGE_FIXTURE);
    const far = rig.systems.enemyAttackPort.requestAttack(
      attackRequest('atk-far', { x: 0, y: 0, z: 0 }, { x: 500, y: 0, z: 0 }),
    );
    check(
      '[COMBAT] C4 사거리 밖 = outOfRange (투하 0)',
      far === 'outOfRange' && rig.systems.depthCharges.activeCount === 0,
      `결과=${far}`,
    );

    const delivered = rig.systems.enemyAttackPort.requestAttack(
      attackRequest('atk-1', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    );
    check(
      '[COMBAT] C4 공격 요청 즉시 피해 없음 — 투하만 발생',
      delivered === 'delivered' &&
        rig.systems.depthCharges.activeCount === 1 &&
        rig.damageCalls.length === 0,
      `결과=${delivered}, 폭뢰=${rig.systems.depthCharges.activeCount}, 피해=${rig.damageCalls.length}`,
    );

    const duplicate = rig.systems.enemyAttackPort.requestAttack(
      attackRequest('atk-1', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    );
    check(
      '[COMBAT] C4 동일 attackId 중복 요청 차단 (duplicate)',
      duplicate === 'duplicate' && rig.systems.depthCharges.activeCount === 1,
      `결과=${duplicate}, 폭뢰=${rig.systems.depthCharges.activeCount}`,
    );

    const cooled = rig.systems.enemyAttackPort.requestAttack(
      attackRequest('atk-2', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    );
    check(
      '[COMBAT] C4 쿨다운 중 재요청 거부 (onCooldown)',
      cooled === 'onCooldown',
      `결과=${cooled}`,
    );
  }

  // 67. [COMBAT] C4 폭뢰 lifecycle — 신관 하한·direct/near·단일 창구
  {
    // 신관 하한 3.0초 — 더 짧은 값을 주입해도 하한을 지킨다
    const shortFuse = makeSurvivalRig(params, { fuseSeconds: 0.5 });
    check(
      '[COMBAT] C4 신관 하한 3.0초 준수 — 더 짧게 만들지 않는다',
      shortFuse.systems.depthCharges.fuseSecondsInUse === 3.0 &&
        params.combat.depthChargeFuseSeconds.value >= 3.0,
      `적용 신관=${shortFuse.systems.depthCharges.fuseSecondsInUse}s (공식 ${params.combat.depthChargeFuseSeconds.value}s)`,
    );

    // 신관 이전에는 피해가 없다
    const rig = makeSurvivalRig(params);
    rig.systems.enemyAttack.attachDamageParams(DEPTH_CHARGE_FIXTURE);
    rig.systems.depthCharges.attachCombatParams({ damageParams: DEPTH_CHARGE_FIXTURE });
    rig.systems.enemyAttackPort.requestAttack(
      attackRequest('atk-direct', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    );
    for (let i = 0; i < 60 * 2; i += 1) rig.systems.update(1 / 60); // 2초 — 신관 이전
    const beforeFuse = rig.damageCalls.length;
    for (let i = 0; i < 60 * 2; i += 1) rig.systems.update(1 / 60); // 총 4초 — 폭발 후
    check(
      '[COMBAT] C4 신관 이전 피해 0 → 신관 후 direct 피해 정확히 1회',
      beforeFuse === 0 &&
        rig.damageCalls.length === 1 &&
        rig.damageCalls[0]?.proximity === 'direct' &&
        rig.damageCalls[0]?.rawDamage === DEPTH_CHARGE_FIXTURE.directDamage &&
        rig.systems.depthCharges.lastDetonationOutcome === 'directDamage',
      `신관 전=${beforeFuse}, 총 피해=${rig.damageCalls.length}, 근접도=${String(rig.damageCalls[0]?.proximity)}`,
    );
    check(
      '[COMBAT] C4 direct와 near 중복 적용 없음 — 폭발 1건 = 피해 1건',
      rig.damageCalls.filter((call) => call.proximity === 'near').length === 0 &&
        rig.damageCalls.length === 1,
      `direct=${rig.damageCalls.filter((c) => c.proximity === 'direct').length}, near=${rig.damageCalls.filter((c) => c.proximity === 'near').length}`,
    );

    // near 판정 — direct 반경 밖·near 반경 안
    const nearRig = makeSurvivalRig(params);
    nearRig.systems.enemyAttack.attachDamageParams(DEPTH_CHARGE_FIXTURE);
    nearRig.systems.depthCharges.attachCombatParams({ damageParams: DEPTH_CHARGE_FIXTURE });
    const nearOffset = (DEPTH_CHARGE_FIXTURE.directRadiusMeters ?? 0) + 1;
    nearRig.systems.player.resetTo({ x: nearOffset, y: 0, z: 0, headingRadians: 0 });
    nearRig.systems.enemyAttackPort.requestAttack(
      attackRequest('atk-near', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    );
    for (let i = 0; i < 60 * 4; i += 1) nearRig.systems.update(1 / 60);
    check(
      '[COMBAT] C4 near 판정은 near 피해 1회 (direct 아님)',
      nearRig.damageCalls.length === 1 &&
        nearRig.damageCalls[0]?.proximity === 'near' &&
        nearRig.damageCalls[0]?.rawDamage === DEPTH_CHARGE_FIXTURE.nearDamage,
      `피해=${nearRig.damageCalls.length}, 근접도=${String(nearRig.damageCalls[0]?.proximity)}`,
    );

    // 범위 밖 — 폭발해도 피해 없음
    const missRig = makeSurvivalRig(params);
    missRig.systems.enemyAttack.attachDamageParams(DEPTH_CHARGE_FIXTURE);
    missRig.systems.depthCharges.attachCombatParams({ damageParams: DEPTH_CHARGE_FIXTURE });
    missRig.systems.depthCharges.drop({
      attackerEntityId: 1300,
      targetEntityId: PLAYER_ENTITY_ID,
      worldX: 1000,
      worldY: 0,
      worldZ: 1000,
      dropFromY: 10,
      correlationId: 'miss',
    });
    for (let i = 0; i < 60 * 4; i += 1) missRig.systems.update(1 / 60);
    check(
      '[COMBAT] C4 범위 밖 폭발은 피해 0 (outOfRange)',
      missRig.damageCalls.length === 0 &&
        missRig.systems.depthCharges.lastDetonationOutcome === 'outOfRange',
      `피해=${missRig.damageCalls.length}, 결과=${String(missRig.systems.depthCharges.lastDetonationOutcome)}`,
    );

    // 피해 params null — 폭발은 하되 피해 unwired
    const unwiredRig = makeSurvivalRig(params);
    unwiredRig.systems.depthCharges.drop({
      attackerEntityId: 1300,
      targetEntityId: PLAYER_ENTITY_ID,
      worldX: 0,
      worldY: 0,
      worldZ: 0,
      dropFromY: 10,
      correlationId: 'unwired',
    });
    for (let i = 0; i < 60 * 4; i += 1) unwiredRig.systems.update(1 / 60);
    check(
      '[COMBAT] C4 피해 params null → 폭발 상태는 진행하되 피해 unwired',
      unwiredRig.damageCalls.length === 0 &&
        !unwiredRig.systems.depthCharges.damageWired &&
        unwiredRig.systems.depthCharges.lastDetonationOutcome === 'damageUnwired',
      `피해=${unwiredRig.damageCalls.length}, 결과=${String(unwiredRig.systems.depthCharges.lastDetonationOutcome)}`,
    );
  }

  // 68. [COMBAT] C4 모든 피해가 DamageReceiverPort를 통과 + 중복 차단
  {
    const rig = makeSurvivalRig(params);
    rig.systems.depthCharges.attachCombatParams({ damageParams: DEPTH_CHARGE_FIXTURE });
    // 같은 상관 id로 두 발 투하 → 폭발 2회여도 피해는 1회
    for (const chargeIndex of [0, 1]) {
      rig.systems.depthCharges.drop({
        attackerEntityId: 1300,
        targetEntityId: PLAYER_ENTITY_ID,
        worldX: chargeIndex * 0.1,
        worldY: 0,
        worldZ: 0,
        dropFromY: 10,
        correlationId: 'same-attack',
      });
    }
    for (let i = 0; i < 60 * 4; i += 1) rig.systems.update(1 / 60);
    check(
      '[COMBAT] C4 같은 폭발 상관 id의 중복 피해 차단 (2발 투하 → 피해 1회)',
      rig.damageCalls.length === 1 && rig.damageCalls[0]?.correlationId === 'same-attack',
      `피해=${rig.damageCalls.length}`,
    );
    check(
      '[COMBAT] C4 모든 피해가 applyDamage 단일 창구 경유 + 고유 id·상관 id 보유',
      rig.damageCalls.every(
        (call) =>
          typeof call.damageEventId === 'string' &&
          call.damageEventId.length > 0 &&
          typeof call.correlationId === 'string' &&
          call.sourceType === 'enemyWeapon' &&
          call.targetEntityId === PLAYER_ENTITY_ID,
      ),
      `호출=${rig.damageCalls.length}, id=${String(rig.damageCalls[0]?.damageEventId)}`,
    );

    // 게임플레이 계층에 자체 체력 상태가 없다 (표면 검사)
    const systemsSurface = Object.getOwnPropertyNames(
      Object.getPrototypeOf(rig.systems),
    );
    check(
      '[COMBAT] C4 게임플레이 자체 player HP·hull 상태 0 — 수신 미연결이면 unwired',
      !systemsSurface.some((name) => /currentHull|playerHp|hullState/i.test(name)) &&
        rig.systems.damageReceiverWired,
      `표면=${systemsSurface.filter((n) => /hull|hp/i.test(n)).join(',') || '없음'}`,
    );
  }

  // 69. [COMBAT] C9 v0.1.1 — 침수 기여 outcome 결합 + 목표 심도 기폭
  {
    const makeStandalone = (
      targetView: { entityId: number; positionX: number; positionY: number; positionZ: number },
      damageParams: DepthChargeDamageParams | null,
    ): { system: DepthChargeRunSystem; calls: DamageRequest[] } => {
      const calls: DamageRequest[] = [];
      const system = new DepthChargeRunSystem(
        {
          applyDamage: (request) => {
            calls.push(request);
            return {
              outcome: 'applied',
              appliedDamage: request.rawDamage,
              hull: {
                currentHull: 1,
                maxHull: 1,
                isDestroyed: false,
                unwired: false,
              } as never,
            };
          },
        },
        () => [targetView],
        3.0,
        damageParams,
        null,
      );
      return { system, calls };
    };
    const player = { entityId: PLAYER_ENTITY_ID, positionX: 0, positionY: -5, positionZ: 0 };

    // 목표 심도 기폭 + direct 기여: 표적이 deep(y −5)에 있고 목표 심도도 −5 —
    // 구 y=0 고정이었다면 수직 5m 오차로 direct(반경 5) 경계가 무너진다.
    const direct = makeStandalone(player, DEPTH_CHARGE_FIXTURE);
    direct.system.drop({
      attackerEntityId: 1300,
      targetEntityId: PLAYER_ENTITY_ID,
      worldX: 0,
      worldY: -5,
      worldZ: 0,
      dropFromY: 10,
      correlationId: 'flood-direct',
    });
    const fallingView = direct.system.charges_[0];
    for (let i = 0; i < 60 * 4; i += 1) direct.system.update(1 / 60);
    check(
      '[COMBAT] C9 v0.1.1 폭뢰는 요청에 고정된 목표 심도에서 기폭 — direct + 침수 기여 전달',
      fallingView !== undefined &&
        fallingView.worldY === 10 && // 낙하 시작점 = 공격자 수면 고도
        direct.system.lastDetonationOutcome === 'directDamage' &&
        direct.calls.length === 1 &&
        direct.calls[0]?.worldPosition.y === -5 && // 기폭 위치 = 목표 심도 (y=0 아님)
        direct.calls[0]?.causesFlooding === true &&
        direct.calls[0]?.floodingContribution === DEPTH_CHARGE_FIXTURE.directFloodingContribution,
      `outcome=${String(direct.system.lastDetonationOutcome)}, y=${String(direct.calls[0]?.worldPosition.y)}, flood=${String(direct.calls[0]?.floodingContribution)}`,
    );

    // near 기여: 기폭 심도 −5, 표적 수평 10m (direct 5 밖·near 15 안)
    const near = makeStandalone({ ...player, positionX: 10 }, DEPTH_CHARGE_FIXTURE);
    near.system.drop({
      attackerEntityId: 1300,
      targetEntityId: PLAYER_ENTITY_ID,
      worldX: 0,
      worldY: -5,
      worldZ: 0,
      dropFromY: 10,
      correlationId: 'flood-near',
    });
    for (let i = 0; i < 60 * 4; i += 1) near.system.update(1 / 60);
    check(
      '[COMBAT] C9 v0.1.1 near 폭발 = near 피해 + near 침수 기여 (miss는 요청 자체 없음)',
      near.system.lastDetonationOutcome === 'nearDamage' &&
        near.calls.length === 1 &&
        near.calls[0]?.causesFlooding === true &&
        near.calls[0]?.floodingContribution === DEPTH_CHARGE_FIXTURE.nearFloodingContribution,
      `outcome=${String(near.system.lastDetonationOutcome)}, flood=${String(near.calls[0]?.floodingContribution)}`,
    );

    // 기여 null(피해만 확정) → 피해는 정상, 침수만 unwired — boolean으로 양을
    // 추측하지 않는다 (causesFlooding=false·기여 0).
    const partialParams: DepthChargeDamageParams = {
      ...DEPTH_CHARGE_FIXTURE,
      directFloodingContribution: null,
      nearFloodingContribution: null,
    };
    const partial = makeStandalone(player, partialParams);
    partial.system.drop({
      attackerEntityId: 1300,
      targetEntityId: PLAYER_ENTITY_ID,
      worldX: 0,
      worldY: -5,
      worldZ: 0,
      dropFromY: 10,
      correlationId: 'flood-null',
    });
    for (let i = 0; i < 60 * 4; i += 1) partial.system.update(1 / 60);
    check(
      '[COMBAT] C9 v0.1.1 침수 기여 null → 피해는 적용·침수만 unwired (양 추측 금지)',
      partial.system.lastDetonationOutcome === 'directDamage' &&
        partial.calls.length === 1 &&
        partial.calls[0]?.causesFlooding === false &&
        partial.calls[0]?.floodingContribution === 0,
      `outcome=${String(partial.system.lastDetonationOutcome)}, causes=${String(partial.calls[0]?.causesFlooding)}`,
    );
  }

  return results;
}

/**
 * 검증 전용 탐지 수치 **픽스처** — production params가 아니다.
 * 공식 `params/combat.json`에 거리 감쇠·감소율이 도착하면 그 값이 쓰이며,
 * 이 상수는 production 경로로 import되지 않는다.
 */
const DETECTION_TUNING_FIXTURE = Object.freeze({
  distanceFalloff: Object.freeze({ fullEffectMeters: 50, zeroEffectMeters: 200 }),
  gaugeDecayPerSecond: 0.2,
});

/**
 * 검증 전용 폭뢰 수치 **픽스처** — production params가 아니다.
 * 공식 combat.json에 direct/near 반경·피해·쿨다운이 도착하면 그 값이 쓰인다.
 */
const DEPTH_CHARGE_FIXTURE = Object.freeze({
  directRadiusMeters: 5,
  nearRadiusMeters: 15,
  directDamage: 30,
  nearDamage: 10,
  dropCooldownSeconds: 10,
  directFloodingContribution: 0.5,
  nearFloodingContribution: 0.2,
});

/** 검증용 공격 요청 — 계약 형태 그대로 (수치는 픽스처) */
function attackRequest(
  attackId: string,
  attackerPosition: { x: number; y: number; z: number },
  targetPosition: { x: number; y: number; z: number },
): EnemyAttackRequest {
  return {
    attackId,
    attackerEntityId: 1300,
    targetEntityId: PLAYER_ENTITY_ID,
    attackerPosition,
    targetPosition,
    correlationId: attackId,
    requestedAt: 0,
  };
}

/**
 * 생존·전투 검증 rig — 피해 수신 창구를 **기록용 더블**로 연결한다.
 * 더블은 검증 전용이며 production 경로에 들어가지 않는다(조립부는 리드
 * `PlayerHullSystem`을 연결한다).
 */
function makeSurvivalRig(
  params: GameParams,
  options: { readonly fuseSeconds?: number } = {},
): {
  systems: GameplaySystems;
  damageCalls: DamageRequest[];
} {
  const bus = new EventBus();
  const systems = new GameplaySystems(
    bus,
    params,
    undefined,
    STARTING_CANYON_LAYOUT,
    testOfficialParams(),
  );
  if (options.fuseSeconds !== undefined) {
    systems.depthCharges.attachCombatParams({ fuseSeconds: options.fuseSeconds });
  }
  const damageCalls: DamageRequest[] = [];
  systems.attachDamageReceiver({
    applyDamage: (request) => {
      damageCalls.push(request);
      return {
        outcome: 'applied' as const,
        appliedDamage: request.rawDamage,
        hull: UNWIRED_HULL_FIXTURE,
      };
    },
  });
  return { systems, damageCalls };
}

/** 검증용 선체 상태 픽스처 — 게임플레이는 선체 상태를 갖지 않는다 */
const UNWIRED_HULL_FIXTURE: PlayerHullState = Object.freeze({
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

/** 검증용 경비 스폰 config — production과 같은 계약 형태 (수치는 픽스처) */
function guardConfig(
  entityId: number,
  incident: { x: number; z: number },
  spawn: { x: number; z: number },
): GuardShipAdapterConfig {
  return {
    entityId,
    faction: 'patrol',
    spawnReason: 'neutralAttack',
    initialTargetEntityId: PLAYER_ENTITY_ID,
    initialTargetPosition: incident,
    spawnPosition: spawn,
    displayLabelId: 'faction.patrol',
  };
}

function distanceTo(
  ship: { readonly positionX: number; readonly positionZ: number } | undefined,
  player: { readonly positionX: number; readonly positionZ: number },
): number {
  if (!ship) return Number.POSITIVE_INFINITY;
  return Math.hypot(ship.positionX - player.positionX, ship.positionZ - player.positionZ);
}

/**
 * 검증용 최소 `SystemContext` — 리드 경계 시스템(NeutralIncidentBoundary)이
 * `context.bus`만 쓰므로 나머지는 사용되지 않는다.
 */
function fakeSystemContext(bus: EventBus, params: GameParams): SystemContext {
  return {
    bus,
    params,
    stateMachine: null as unknown as SystemContext['stateMachine'],
  };
}
