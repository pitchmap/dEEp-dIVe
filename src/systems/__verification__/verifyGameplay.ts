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
import { GameplaySystems } from '../GameplaySystems';
import { KeyboardInput, type MovementInput, type VisibilitySource } from '../KeyboardInput';
import { LayeredDepthSystem } from '../LayeredDepthSystem';
import { SubmarinePlayerController } from '../SubmarinePlayerController';
import {
  PROVISIONAL_REVERSE_MAX_RATIO,
  PROVISIONAL_VERTICAL_MAX_RATIO,
} from '../provisionalMovement';
import {
  PROVISIONAL_SUBMARINE_MAX_Y,
  PROVISIONAL_SUBMARINE_MIN_Y,
} from '../provisionalWorld';

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
    let minSpeed = 0;
    for (let i = 0; i < Math.round(4 / dt); i += 1) {
      controller.update(dt);
      minSpeed = Math.min(minSpeed, controller.speed);
    }
    const capOk = Math.abs(controller.speed - -maxReverse) < 1e-9 && minSpeed >= -maxReverse - 1e-9;
    check(
      '후진: S 최고 속력 = 전진의 50% (부호 있는 속도, 상한 초과 없음)',
      capOk,
      `speed=${controller.speed.toFixed(3)} / 기대 ${-maxReverse}`,
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

    input.release();
    let elapsed = 0;
    while (controller.verticalSpeed > 0 && elapsed < stopSeconds * 2) {
      controller.update(dt);
      elapsed += dt;
    }
    const yAfterStop = controller.positionY;
    simulate(controller, 1, dt);
    check(
      '수직: 키 해제 = 관성 감속 후 높이 유지 (자동 복원 없음)',
      Math.abs(elapsed - stopSeconds) <= dt * 2 && controller.positionY === yAfterStop,
      `감속 ${elapsed.toFixed(3)}s (기대 ${stopSeconds}s), y=${controller.positionY.toFixed(2)}`,
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
      controller.positionY === PROVISIONAL_SUBMARINE_MAX_Y &&
        maxObservedY <= PROVISIONAL_SUBMARINE_MAX_Y + 1e-9,
      `y=${controller.positionY} (상한 ${PROVISIONAL_SUBMARINE_MAX_Y})`,
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
      controller.positionY === PROVISIONAL_SUBMARINE_MIN_Y &&
        minObservedY >= PROVISIONAL_SUBMARINE_MIN_Y - 1e-9,
      `y=${controller.positionY} (하한 ${PROVISIONAL_SUBMARINE_MIN_Y})`,
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

    keySource.dispatchEvent(keyEvent('keydown', 'ShiftLeft'));
    keySource.dispatchEvent(keyEvent('keydown', 'ShiftLeft', true)); // OS 키 반복
    const heldOk = input.ascend;
    keySource.dispatchEvent(keyEvent('keyup', 'ShiftLeft'));
    check('입력: Shift 유지 입력 (반복 이벤트 무해, keyup으로 해제)', heldOk && !input.ascend, 'hold → release');

    keySource.dispatchEvent(keyEvent('keydown', 'ControlRight'));
    check('입력: Ctrl(좌우 무관) = 하강 유지 입력', input.descend, 'ControlRight');

    keySource.dispatchEvent(keyEvent('keydown', 'KeyW'));
    const heldBeforeBlur = input.throttleForward && input.descend;
    keySource.dispatchEvent(new Event('blur')); // 키가 눌린 채 포커스 상실
    check(
      '입력: 포커스 상실 시 눌린 키 전부 해제 (키 고착 방지)',
      heldBeforeBlur && !input.throttleForward && !input.descend,
      'blur → reset',
    );

    keySource.dispatchEvent(keyEvent('keydown', 'KeyS'));
    keySource.dispatchEvent(keyEvent('keydown', 'ShiftRight'));
    visibility.setHidden(); // 키가 눌린 채 탭 전환
    check('입력: 탭 전환(visibility hidden) 시 키 상태 해제', !input.reverse && !input.ascend, 'hidden → reset');

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
    keySource.dispatchEvent(keyEvent('keydown', 'ControlLeft'));
    for (let i = 0; i < Math.round(4 / dt); i += 1) systems.update(dt);

    const moved = systems.player.speed > 0 && systems.player.positionZ < -1;
    const dived =
      systems.depth.currentLayer === 'deep' &&
      emitted.length === 1 &&
      emitted[0] === 'deep' &&
      systems.player.positionY >= PROVISIONAL_SUBMARINE_MIN_Y;
    check(
      '통합: W+Ctrl → 전진 + 연속 하강 + 심해 구간 전이 (depthChanged)',
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

  return results;
}
