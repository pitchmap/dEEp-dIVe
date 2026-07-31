/**
 * 게임플레이 결정적 검증 (D3~D5 범위).
 *
 * 브라우저 없이 시스템 로직만 고정 시나리오로 구동해 다음을 확인한다:
 *  1. params/*.json 로드·검증 경로가 실제 JSON으로 통과하는가
 *  2. 정지 관성·90도 선회가 params 값과 일치하는가 (하드코딩 검출)
 *  3. delta time 크기와 무관하게 같은 결과가 나오는가 (프레임 독립성)
 *  4. 심도가 정확히 3층이고, 경계 초과 요청이 무시되며,
 *     층 이동마다 depthChanged 이벤트가 발행되는가
 *  5. 키 반복·포커스 상실·탭 전환 상황이 안전하게 처리되는가
 *
 * 실행: `node src/systems/__verification__/run.mjs` (러너가 params JSON을 읽어 주입)
 * 이 모듈은 Vite 번들 그래프에 포함되지 않는다 (main.ts에서 도달 불가).
 */

import { validateGameParams } from '../../config/validateParams';
import { EventBus } from '../../core/EventBus';
import type { DepthLayerId } from '../../contracts/events';
import { GameplaySystems } from '../GameplaySystems';
import { KeyboardInput, type MovementInput, type VisibilitySource } from '../KeyboardInput';
import { LayeredDepthSystem } from '../LayeredDepthSystem';
import { SubmarinePlayerController } from '../SubmarinePlayerController';

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
  brake = false;
  turnLeft = false;
  turnRight = false;

  release(): void {
    this.throttleForward = false;
    this.brake = false;
    this.turnLeft = false;
    this.turnRight = false;
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
  const dt = 1 / 120;

  // 2. 정지 관성 — 최고 속력 도달 후 입력 해제 → stopInertiaSeconds 안에 정지
  {
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    const maxSpeed = params.movement.maxSpeedMetersPerSecond.value;
    const accelerationSeconds = params.movement.accelerationSeconds.value;
    input.throttleForward = true;
    simulate(controller, accelerationSeconds + 1, dt);
    const reachedMax = Math.abs(controller.speed - maxSpeed) < 1e-9;
    check(
      '이동: 가속 상한 = movement.json maxSpeedMetersPerSecond',
      reachedMax,
      `speed=${controller.speed.toFixed(3)} / max=${maxSpeed}`,
    );

    input.release();
    let elapsed = 0;
    while (controller.speed > 0 && elapsed < stopSeconds * 2) {
      controller.update(dt);
      elapsed += dt;
    }
    const withinTolerance = Math.abs(elapsed - stopSeconds) <= dt * 2;
    check(
      '이동: 정지 관성 = movement.json stopInertiaSeconds',
      withinTolerance && controller.speed === 0,
      `정지까지 ${elapsed.toFixed(3)}s (기대 ${stopSeconds}s ± ${(dt * 2).toFixed(3)}s)`,
    );
  }

  // 3. 90도 선회 — turn90Seconds 동안 정확히 π/2, A=증가(좌) / D=감소(우)
  {
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    input.turnLeft = true;
    simulate(controller, turnSeconds, dt);
    const leftOk = Math.abs(controller.headingRadians - Math.PI / 2) < 1e-6;
    check(
      '선회: 90도 = movement.json turn90Seconds (A=좌)',
      leftOk,
      `heading=${controller.headingRadians.toFixed(6)} (기대 ${(Math.PI / 2).toFixed(6)})`,
    );

    input.release();
    input.turnRight = true;
    simulate(controller, turnSeconds * 2, dt);
    const rightOk = Math.abs(controller.headingRadians - -Math.PI / 2) < 1e-6;
    check(
      '선회: D=우 (heading 감소, 정규화 유지)',
      rightOk,
      `heading=${controller.headingRadians.toFixed(6)} (기대 ${(-Math.PI / 2).toFixed(6)})`,
    );
  }

  // 4. 잠수함 방향 기준 이동 — heading 0 → -Z, 좌 90도 후 → -X
  {
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    input.throttleForward = true;
    simulate(controller, 2, dt);
    const forwardIsMinusZ = Math.abs(controller.positionX) < 1e-9 && controller.positionZ < -1;
    check(
      '이동: heading 0 전진 = -Z 방향 (좌표 규약)',
      forwardIsMinusZ,
      `pos=(${controller.positionX.toFixed(3)}, ${controller.positionZ.toFixed(3)})`,
    );

    input.release();
    input.turnLeft = true;
    simulate(controller, turnSeconds, dt); // 관성 감속과 동시에 좌 90도
    input.release();
    const zBefore = controller.positionZ;
    input.throttleForward = true;
    simulate(controller, 2, dt);
    const movedMinusX = controller.positionX < -1;
    const zDrift = Math.abs(controller.positionZ - zBefore);
    check(
      '이동: 좌 90도 선회 후 전진 = -X 방향 (잠수함 기준 조작)',
      movedMinusX && zDrift < 1e-6,
      `x=${controller.positionX.toFixed(3)}, zDrift=${zDrift.toExponential(2)}`,
    );
  }

  // 5. 프레임 독립성 — 같은 시나리오를 30fps/240fps로 실행해 결과 비교
  {
    const run = (stepSeconds: number): { x: number; z: number; heading: number; speed: number } => {
      const input = new ScriptedInput();
      const controller = new SubmarinePlayerController(params.movement, input);
      input.throttleForward = true;
      simulate(controller, 3, stepSeconds);
      input.release();
      input.turnLeft = true;
      simulate(controller, 2, stepSeconds);
      input.release();
      simulate(controller, 2, stepSeconds);
      return {
        x: controller.positionX,
        z: controller.positionZ,
        heading: controller.headingRadians,
        speed: controller.speed,
      };
    };
    const coarse = run(1 / 30);
    const fine = run(1 / 240);
    const positionDiff = Math.hypot(coarse.x - fine.x, coarse.z - fine.z);
    const headingDiff = Math.abs(coarse.heading - fine.heading);
    const speedDiff = Math.abs(coarse.speed - fine.speed);
    check(
      'delta time: 30fps vs 240fps 결과 일치 (프레임 독립성)',
      positionDiff < 0.75 && headingDiff < 1e-3 && speedDiff < 0.4,
      `Δpos=${positionDiff.toFixed(4)}m, Δheading=${headingDiff.toExponential(2)}, Δspeed=${speedDiff.toFixed(4)}`,
    );

    const repeat = run(1 / 30);
    const deterministic =
      repeat.x === coarse.x &&
      repeat.z === coarse.z &&
      repeat.heading === coarse.heading &&
      repeat.speed === coarse.speed;
    check('delta time: 동일 시나리오 재실행 = 완전 동일 결과', deterministic, '결정성 확인');
  }

  // 6. 비정상 dt 방어 — 0·음수·NaN은 상태를 바꾸지 않는다
  {
    const input = new ScriptedInput();
    const controller = new SubmarinePlayerController(params.movement, input);
    input.throttleForward = true;
    controller.update(0);
    controller.update(-1);
    controller.update(Number.NaN);
    const unchanged =
      controller.speed === 0 && controller.positionX === 0 && controller.positionZ === 0;
    check('delta time: dt≤0·NaN 무시', unchanged, `speed=${controller.speed}`);
  }

  // 7. 심도 — 순항 시작, 경계 무시, 층 이동마다 depthChanged, 정확히 3층
  {
    const bus = new EventBus();
    const emitted: DepthLayerId[] = [];
    bus.on('depthChanged', ({ layer }) => emitted.push(layer));
    const depth = new LayeredDepthSystem(bus);

    check('심도: 시작 층 = 순항', depth.currentLayer === 'cruise', depth.currentLayer);

    depth.requestAscend(); // cruise → periscope
    depth.requestAscend(); // 최상층 초과 — 무시
    const topOk = depth.currentLayer === 'periscope' && emitted.length === 1;
    check('심도: 부상 + 최상층 초과 요청 무시(이벤트 없음)', topOk, `events=${emitted.join(',')}`);

    const visited = new Set<DepthLayerId>([depth.currentLayer]);
    depth.requestDescend(); // periscope → cruise
    visited.add(depth.currentLayer);
    depth.requestDescend(); // cruise → deep
    visited.add(depth.currentLayer);
    depth.requestDescend(); // 최하층 초과 — 무시
    visited.add(depth.currentLayer);
    const bottomOk = depth.currentLayer === 'deep' && emitted.length === 3;
    check('심도: 잠항 + 최하층 초과 요청 무시', bottomOk, `events=${emitted.join(',')}`);
    check(
      '심도: 도달 가능한 층은 정확히 3개 (잠망경/순항/심해)',
      visited.size === 3,
      [...visited].join(','),
    );

    const eventSequenceOk =
      emitted.length === 3 &&
      emitted[0] === 'periscope' &&
      emitted[1] === 'cruise' &&
      emitted[2] === 'deep';
    check('심도: 층 이동마다 depthChanged 발행 (순서 일치)', eventSequenceOk, emitted.join(' → '));
  }

  // 8. 키보드 안전성 — 반복 입력·포커스 상실·탭 전환
  {
    const keySource = new EventTarget();
    const visibility = new FakeVisibilitySource();
    const input = new KeyboardInput();
    input.attach(keySource, visibility);

    keySource.dispatchEvent(keyEvent('keydown', 'ShiftLeft'));
    keySource.dispatchEvent(keyEvent('keydown', 'ShiftLeft', true)); // OS 키 반복
    keySource.dispatchEvent(keyEvent('keydown', 'ShiftLeft', true));
    const repeatIgnored = input.consumeAscendRequests() === 1;
    check('입력: Shift 키 반복(repeat)은 층 이동 1회로 처리', repeatIgnored, 'repeat 이벤트 무시');

    keySource.dispatchEvent(keyEvent('keydown', 'KeyW'));
    keySource.dispatchEvent(keyEvent('keydown', 'ControlRight'));
    const heldBeforeBlur = input.throttleForward;
    keySource.dispatchEvent(new Event('blur')); // 키가 눌린 채 포커스 상실
    const clearedByBlur = !input.throttleForward && input.consumeDescendRequests() === 0;
    check('입력: 포커스 상실 시 눌린 키·대기 요청 전부 해제', heldBeforeBlur && clearedByBlur, 'blur → reset');

    keySource.dispatchEvent(keyEvent('keydown', 'KeyW'));
    visibility.setHidden(); // 키가 눌린 채 탭 전환
    const clearedByHidden = !input.throttleForward;
    check('입력: 탭 전환(visibility hidden) 시 키 상태 해제', clearedByHidden, 'hidden → reset');

    input.detach();
    keySource.dispatchEvent(keyEvent('keydown', 'KeyW'));
    check('입력: detach 후 이벤트 무시', !input.throttleForward, 'detach → 리스너 해제');
  }

  // 9. 조립 통합 — GameplaySystems 경유로 입력→이동·심도가 함께 동작
  {
    const bus = new EventBus();
    const emitted: DepthLayerId[] = [];
    bus.on('depthChanged', ({ layer }) => emitted.push(layer));

    const systems = new GameplaySystems(bus, params);
    const keySource = new EventTarget();
    systems.attachInput(keySource);

    keySource.dispatchEvent(keyEvent('keydown', 'KeyW'));
    keySource.dispatchEvent(keyEvent('keydown', 'ShiftLeft'));
    for (let i = 0; i < 120; i += 1) systems.update(dt); // 1초 진행

    const moved = systems.player.speed > 0 && systems.player.positionZ < 0;
    const surfaced = systems.depth.currentLayer === 'periscope' && emitted.length === 1;
    check('통합: W+Shift → 전진 + 잠망경 심도 부상', moved && surfaced, `speed=${systems.player.speed.toFixed(2)}, layer=${systems.depth.currentLayer}`);

    keySource.dispatchEvent(new Event('blur'));
    for (let i = 0; i < 600; i += 1) systems.update(dt); // 5초 — 관성 감속 충분
    check('통합: 포커스 상실 후 관성 감속으로 완전 정지', systems.player.speed === 0, `speed=${systems.player.speed}`);
    systems.detachInput();
  }

  return results;
}
