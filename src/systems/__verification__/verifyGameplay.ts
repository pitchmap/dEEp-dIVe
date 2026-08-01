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

import { validateGameParams } from '../../config/validateParams';
import { EventBus } from '../../core/EventBus';
import type { DepthLayerId } from '../../contracts/events';
import { CollisionWorld } from '../collision/CollisionWorld';
import { computeHullSpheres } from '../collision/submarineHull';
import { CargoShipSystem, type CargoShipConfig } from '../CargoShipSystem';
import { BossWeakPointTarget, provisionalBossWeakPointConfig } from '../BossWeakPointTarget';
import { EconomySystem } from '../economy/EconomySystem';
import { PROVISIONAL_DEFEAT_CREDIT_LOSS_RATIO, PROVISIONAL_DROP_TABLES } from '../economy/provisionalEconomy';
import { EquipmentSystem } from '../EquipmentSystem';
import { computeShipBoxPush } from '../collision/shipHullBox';
import { GameplaySystems } from '../GameplaySystems';
import { KeyboardInput, type MovementInput, type VisibilitySource } from '../KeyboardInput';
import { LayeredDepthSystem } from '../LayeredDepthSystem';
import { SubmarineAimSystem } from '../SubmarineAimSystem';
import { aimForwardVector, clampAimAngles } from '../aimGeometry';
import { BASE_CAMERA_RADIANS_PER_PIXEL, PROVISIONAL_AIMING_PARAMS } from '../provisionalAiming';
import { torpedoSpawnSocket, TORPEDO_COLLISION_RADIUS } from '../collision/torpedoTubeSocket';
import { UpgradePurchaseSystem, type PurchaseWalletPort, type PurchaseSavePort } from '../economy/UpgradePurchaseSystem';
import { provisionalUpgradeCost } from '../economy/provisionalUpgradeCost';
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
}

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
} {
  const bus = new EventBus();
  const input = new ScriptedInput();
  const controller = new SubmarinePlayerController(params.movement, input);
  const depth = new LayeredDepthSystem(bus, controller);
  const world = new CollisionWorld();
  const targets = new TargetRegistry();
  const equipment = new EquipmentSystem();
  // 조준↔어뢰 지연 참조 (GameplaySystems와 동일한 단일 출처 배선)
  let aimRef: SubmarineAimSystem | null = null;
  const torpedo = new StraightRunTorpedoSystem(bus, params.combat, controller, world, targets, equipment, {
    get forward() {
      return (aimRef as SubmarineAimSystem).forward;
    },
  });
  const aim = new SubmarineAimSystem(bus, controller, torpedo);
  aimRef = aim;
  return { bus, input, controller, depth, world, targets, equipment, torpedo, aim };
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
    const systems = new GameplaySystems(bus, params);
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

    const systems = new GameplaySystems(bus, params);
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
      const systems = new GameplaySystems(bus, params);
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
    const systems = new GameplaySystems(bus, params);
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
    const systems = new GameplaySystems(bus, params);
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
    const systems = new GameplaySystems(bus, params);
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
    const systems = new GameplaySystems(bus, params);
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
      faction: 'hostile',
      dropTableId: 'cargo-standard',
    });
    const economy = new EconomySystem(targets, controller, () => [ship]);
    const step = 1 / 60;

    ship.onTorpedoHit(0, -20, 1); // 적대 수송선 파괴
    economy.update(step);
    const dropTable = PROVISIONAL_DROP_TABLES['cargo-standard'];
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
      faction: 'neutral',
      dropTableId: 'cargo-standard', // 테이블이 있어도 중립은 드롭 금지
    });
    const economy = new EconomySystem(targets, controller, () => [neutral]);

    neutral.onTorpedoHit(5, -25, 1);
    economy.update(1 / 60);
    const request = economy.guardSpawnRequests[0];
    check(
      '[ECON] 중립 선박 공격 → 크레딧 없음 + 경비함 출현 요청 발생',
      economy.wallet.sortieCredits === 0 &&
        economy.dropField.drops.length === 0 &&
        economy.guardSpawnRequests.length === 1 &&
        request?.provokedByTargetId === 930 &&
        request?.x === 5 &&
        request?.z === -25,
      `requests=${economy.guardSpawnRequests.length}`,
    );
    const drained = economy.consumeGuardSpawnRequests();
    check(
      '[ECON] 경비 요청 소비 API — AI(구축함 재사용, 리드 소유)가 큐를 비운다',
      drained.length === 1 && economy.guardSpawnRequests.length === 0,
      `drained=${drained.length}`,
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
    const economy = new EconomySystem(targets, controller, () => []);
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
    const chestCredits = PROVISIONAL_DROP_TABLES['salvage-chest']?.credits ?? -1;
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

  // 35. [ECON] 손실 페널티 — 출항 크레딧 일부 손실, 희귀 부품·확정분 보존
  {
    const targets = new TargetRegistry();
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    const economy = new EconomySystem(targets, controller, () => []);

    economy.wallet.addCredits(180);
    economy.wallet.acquireRarePart('rare-core');
    const settlement = economy.settleDefeat();
    const expectedLost = Math.floor(180 * PROVISIONAL_DEFEAT_CREDIT_LOSS_RATIO);
    check(
      '[ECON] 파괴 정산: 손실률 파라미터 적용 — 일반 크레딧 일부 손실',
      settlement.outcome === 'defeat' &&
        settlement.creditsEarned === 180 &&
        settlement.creditsLost === expectedLost &&
        settlement.creditsKept === 180 - expectedLost &&
        economy.wallet.confirmedCredits === 180 - expectedLost &&
        economy.wallet.sortieCredits === 0,
      `lost=${settlement.creditsLost}/${settlement.creditsEarned} (률 ${PROVISIONAL_DEFEAT_CREDIT_LOSS_RATIO})`,
    );
    check(
      '[ECON] 희귀 부품은 손실하지 않는다 (정산 데이터에 보존 명시)',
      economy.wallet.rareParts.length === 1 && settlement.rarePartsHeld[0] === 'rare-core',
      `parts=${settlement.rarePartsHeld.join(',')}`,
    );

    economy.wallet.addCredits(50);
    const returned = economy.settleReturn();
    check(
      '[ECON] 귀환 정산: 전액 확정 (손실 없음) — 저장용 정산 데이터 제공',
      returned.creditsLost === 0 &&
        returned.creditsKept === 50 &&
        economy.wallet.confirmedCredits === 180 - expectedLost + 50,
      `total=${economy.wallet.confirmedCredits}`,
    );
  }

  // 36. [LOOP] 장비 4종 — 슬롯 제한·상위호환 없음·합연산 배율·발사 반영·디코이
  {
    const standardProfile = new EquipmentSystem().activeTorpedoProfile();
    const bench = new EquipmentSystem();
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

    const cameraForward = rig.aim.forward; // 조준 카메라가 소비하는 값과 동일 출처
    const expectedSpawn = torpedoSpawnSocket(rig.controller, cameraForward);
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
      Math.abs(shot.x - expectedSpawn.x) < 1e-12 &&
      Math.abs(shot.y - expectedSpawn.y) < 1e-12 &&
      Math.abs(shot.z - expectedSpawn.z) < 1e-12;
    check(
      '탄도: 생성 위치 = torpedoSpawnSocket (TorpedoSystem 자체 오프셋 없음)',
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

  // 38. [ECON] 업그레이드 구매 — 성공·조건 실패·저장 실패 롤백 (A5-T1~T6)
  {
    const catalog = [
      { id: 'maxSpeed', maxLevel: 5, bonusPerLevel: 0.1 },
      { id: 'sonarRange', maxLevel: 1, bonusPerLevel: 0.1 },
    ];
    const makeWallet = (credits: number, rareParts: number): PurchaseWalletPort => {
      const state = { credits, rareParts };
      return {
        get credits() {
          return state.credits;
        },
        get rareParts() {
          return state.rareParts;
        },
        applyDelta(creditsDelta, rarePartsDelta) {
          state.credits += creditsDelta;
          state.rareParts += rarePartsDelta;
        },
      };
    };
    const makeSave = (behavior: { ok: boolean; throws?: boolean }): PurchaseSavePort => ({
      save() {
        if (behavior.throws) throw new Error('quota exceeded (테스트)');
        return behavior.ok;
      },
    });

    // A5-T1 구매·저장 성공
    {
      const wallet = makeWallet(1000, 0);
      const purchase = new UpgradePurchaseSystem(catalog, wallet, makeSave({ ok: true }));
      const cost = provisionalUpgradeCost(1);
      const result = purchase.purchase('maxSpeed');
      check(
        '[ECON] A5-T1 구매 성공 — 크레딧 차감·단계 증가·보정 반영',
        result.ok &&
          purchase.levelOf('maxSpeed') === 1 &&
          wallet.credits === 1000 - cost.credits &&
          purchase.modifiers.maxSpeed === 0.1,
        `credits=${wallet.credits}, level=${purchase.levelOf('maxSpeed')}`,
      );
    }

    // A5-T2 크레딧 부족 — 상태 변경 없이 거부
    {
      const wallet = makeWallet(10, 0);
      const purchase = new UpgradePurchaseSystem(catalog, wallet, makeSave({ ok: true }));
      const result = purchase.purchase('maxSpeed');
      check(
        '[ECON] A5-T2 크레딧 부족 — insufficientCredits, 상태 변경 없음',
        !result.ok &&
          result.reason === 'insufficientCredits' &&
          result.category === 'condition' &&
          wallet.credits === 10 &&
          purchase.levelOf('maxSpeed') === 0,
        `reason=${result.ok ? 'ok' : result.reason}`,
      );
    }

    // 희귀 부품 부족 (4단계부터 요구)
    {
      const wallet = makeWallet(100000, 0);
      const purchase = new UpgradePurchaseSystem(catalog, wallet, makeSave({ ok: true }));
      purchase.restoreLevels({ maxSpeed: 3 });
      const creditsBefore = wallet.credits;
      const result = purchase.purchase('maxSpeed');
      check(
        '[ECON] 희귀 부품 부족 — insufficientRareParts, 크레딧 차감 없음',
        !result.ok &&
          result.reason === 'insufficientRareParts' &&
          wallet.credits === creditsBefore &&
          purchase.levelOf('maxSpeed') === 3,
        `reason=${result.ok ? 'ok' : result.reason}`,
      );
    }

    // 최대 단계
    {
      const wallet = makeWallet(100000, 10);
      const purchase = new UpgradePurchaseSystem(catalog, wallet, makeSave({ ok: true }));
      purchase.restoreLevels({ sonarRange: 1 });
      const result = purchase.purchase('sonarRange');
      const unknown = purchase.purchase('eighthUpgrade');
      check(
        '[ECON] 최대 단계 도달 — maxLevelReached (+ 8번째 항목 구매 불가)',
        !result.ok &&
          result.reason === 'maxLevelReached' &&
          !unknown.ok &&
          unknown.reason === 'maxLevelReached' &&
          wallet.credits === 100000,
        `level=${purchase.levelOf('sonarRange')}/1`,
      );
    }

    // A5-T3·T4·T5·T7 저장 실패 롤백 (반환값 false / 예외 둘 다)
    for (const mode of [{ ok: false }, { ok: false, throws: true }]) {
      const wallet = makeWallet(1000, 5);
      const purchase = new UpgradePurchaseSystem(catalog, wallet, makeSave(mode));
      purchase.restoreLevels({ maxSpeed: 2 });
      const creditsBefore = wallet.credits;
      const rareBefore = wallet.rareParts;
      const levelBefore = purchase.levelOf('maxSpeed');

      const result = purchase.purchase('maxSpeed');
      const rolledBack =
        !result.ok &&
        result.category === 'save' &&
        result.reason === 'saveFailed' &&
        wallet.credits === creditsBefore &&
        wallet.rareParts === rareBefore &&
        purchase.levelOf('maxSpeed') === levelBefore &&
        purchase.modifiers.maxSpeed === levelBefore * 0.1;
      check(
        `[ECON] A5-T3·T4 저장 실패(${mode.throws ? '예외' : 'false'}) → 크레딧·단계 전부 롤백`,
        rolledBack,
        `credits=${wallet.credits}/${creditsBefore}, level=${purchase.levelOf('maxSpeed')}/${levelBefore}`,
      );

      // A5-T5: 재로드(스냅샷 = 저장된 상태)에서도 구매 전 상태 유지
      const reloaded = new UpgradePurchaseSystem(catalog, makeWallet(creditsBefore, rareBefore), makeSave({ ok: true }));
      reloaded.restoreLevels(purchase.levelSnapshot);
      check(
        `[ECON] A5-T5 저장 실패 후 재로드 — 구매 전 단계 유지 (${mode.throws ? '예외' : 'false'})`,
        reloaded.levelOf('maxSpeed') === levelBefore,
        `level=${reloaded.levelOf('maxSpeed')}`,
      );
    }

    // A5-T6: 저장 실패 안내와 일반 불가 안내가 구분됨 + 롤백 후 재구매 가능
    {
      const wallet = makeWallet(1000, 0);
      const failing = { ok: false };
      const save: PurchaseSavePort = {
        save() {
          return failing.ok;
        },
      };
      const purchase = new UpgradePurchaseSystem(catalog, wallet, save);
      const failed = purchase.purchase('maxSpeed');
      const poor = new UpgradePurchaseSystem(catalog, makeWallet(1, 0), save).purchase('maxSpeed');
      const distinct =
        !failed.ok && !poor.ok && failed.category === 'save' && poor.category === 'condition';

      failing.ok = true; // 저장 복구 후 재구매
      const retry = purchase.purchase('maxSpeed');
      check(
        '[ECON] A5-T6 저장 실패·조건 실패 안내 구분 + 롤백 뒤 재구매 성공',
        distinct && retry.ok && purchase.levelOf('maxSpeed') === 1,
        `save=${failed.ok ? '-' : failed.category}, condition=${poor.ok ? '-' : poor.category}, retry=${retry.ok}`,
      );
    }
  }

  // 39. [ECON] 장비 장착·교체·해제 — 슬롯 제한·중복·저장 실패 롤백
  {
    const equipment = new EquipmentSystem(['standardTorpedo']);
    const equipped = equipment.equipItem('fastTorpedo'); // 빈 슬롯 자동 배정
    const duplicate = equipment.equipItem('fastTorpedo');
    const full = equipment.equipItem('heavyTorpedo'); // 슬롯 2 소진
    check(
      '[ECON] 장비: 장착 성공 / 이미 장착 중(alreadyEquipped) / 슬롯 부족(slotFull)',
      equipped.ok &&
        !duplicate.ok &&
        duplicate.reason === 'alreadyEquipped' &&
        !full.ok &&
        full.reason === 'slotFull' &&
        equipment.loadout.equipped.length === 2,
      `loadout=${equipment.loadout.equipped.join('/')}`,
    );

    const replaced = equipment.replaceItem(1, 'heavyTorpedo');
    const replaceDuplicate = equipment.replaceItem(1, 'standardTorpedo'); // 0번에 이미 있음
    check(
      '[ECON] 장비: 교체 성공 / 다른 슬롯 중복 교체 거부',
      replaced.ok &&
        equipment.slots[1] === 'heavyTorpedo' &&
        !replaceDuplicate.ok &&
        replaceDuplicate.reason === 'alreadyEquipped',
      `slots=${equipment.slots.join('/')}`,
    );

    const removed = equipment.unequipItem(1);
    check(
      '[ECON] 장비: 해제 성공 (슬롯 비움, 활성 슬롯 자동 보정)',
      removed.ok && equipment.slots[1] === null && equipment.activeEquipment !== null,
      `slots=${equipment.slots.join('/')}, active=${equipment.activeEquipment}`,
    );

    // 저장 실패 → 이전 loadout 복원
    const failing = { ok: false };
    equipment.attachSavePort({
      save() {
        return failing.ok;
      },
    });
    const before = [...equipment.slots];
    const saveFailed = equipment.equipItem('fastTorpedo');
    check(
      '[ECON] 장비: 저장 실패 시 이전 loadout으로 롤백 (saveFailed 구분)',
      !saveFailed.ok &&
        saveFailed.category === 'save' &&
        saveFailed.reason === 'saveFailed' &&
        equipment.slots.join('/') === before.join('/'),
      `slots=${equipment.slots.join('/')} (기대 ${before.join('/')})`,
    );

    failing.ok = true;
    const retried = equipment.equipItem('fastTorpedo');
    const profileAfter = (() => {
      equipment.selectSlot(equipment.slots.indexOf('fastTorpedo'));
      return equipment.activeTorpedoProfile();
    })();
    const standardProfile = (() => {
      equipment.selectSlot(equipment.slots.indexOf('standardTorpedo'));
      return equipment.activeTorpedoProfile();
    })();
    check(
      '[ECON] 장비: 저장 복구 후 장착 성공 + 변경이 전투 유효 파라미터에 반영',
      retried.ok &&
        profileAfter !== null &&
        standardProfile !== null &&
        profileAfter.speedMetersPerSecond !== standardProfile.speedMetersPerSecond,
      `fast=${profileAfter?.speedMetersPerSecond}, standard=${standardProfile?.speedMetersPerSecond}`,
    );
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

  return results;
}
