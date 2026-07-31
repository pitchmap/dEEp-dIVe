/**
 * 잠수함 조작 — contracts/systems.ts `PlayerController` 구현 (§5.1~5.2 +
 * D+5 리뷰 스프린트 '이동·충돌' 개편: 후진·연속 상승 하강·수직 한계).
 *
 * 규칙:
 *  - W = 선수 방향 전진, S = 선미 방향 후진 (후진 최고 속력 = 전진의 비율 —
 *    임시값 provisionalMovement.ts, 이관 요청 INT-GAME-004).
 *    W·S 동시 입력은 상쇄 = 자연 감속. 전진↔후진 전환 시 0을 지나는
 *    제동 구간은 정지 관성률(stopInertiaSeconds)을 그대로 쓴다.
 *  - Shift/Ctrl = 누르는 동안 연속 상승·하강 (최고 수직 속력 = 전진의 비율).
 *    수면 상한·해저 하한(provisionalWorld.ts)을 이탈하지 않는다.
 *  - 키 해제 = 관성 감속 (수평·수직 동일 원칙). 정지 관성은
 *    params/movement.json stopInertiaSeconds.
 *  - A/D 선회는 잠수함 방향 기준 [확정] — 카메라 방향은 이동 계산에 쓰지
 *    않는다. 정지 상태 제자리 선회 유지 (8차 소회의 S9, R15).
 *    A/D는 속도값(프로펠러 입력)에 어떤 영향도 주지 않는다 (S7).
 *  - delta time 기반 — 프레임 속도와 무관하게 동일 결과 (dt≤0·비유한값 무시).
 *
 * 좌표 규약 (리드 확정 — 렌더링·카메라 파트 통합 기준):
 *  - 잠수함 로컬 -Z가 선수, +Z가 선미. headingRadians는 Y축(위) 기준 요(yaw) 각.
 *  - heading 0 → 선수 방향 월드 (0, 0, -1). 선수 벡터 =
 *    (-sin(heading), 0, -cos(heading)) — 렌더 측은
 *    mesh.rotation.y = headingRadians 로 그대로 사용 가능하다.
 *  - A(좌선회) = heading 증가 / D(우선회) = heading 감소. (-π, π] 정규화.
 *  - `speed`는 **부호 있는 전후 속도**다 (INT-GAME-004 / 관리 창 INT-RENDER-002):
 *    양수 = 전진, 음수 = 후진. 프로펠러 렌더(S7)·소음 산출은 이 값을 소비한다.
 */

import type { MovementParams } from '../contracts/params';
import type { PlayerController } from '../contracts/systems';
import type { MovementInput } from './KeyboardInput';
import {
  PROVISIONAL_REVERSE_MAX_RATIO,
  PROVISIONAL_VERTICAL_MAX_RATIO,
} from './provisionalMovement';
import {
  PROVISIONAL_SUBMARINE_MAX_Y,
  PROVISIONAL_SUBMARINE_MIN_Y,
} from './provisionalWorld';

const QUARTER_TURN_RADIANS = Math.PI / 2;
const TWO_PI = Math.PI * 2;

/** (-π, π] 범위로 정규화 — 장시간 선회 시 각도 누적 오차 방지 */
function normalizeAngle(radians: number): number {
  const wrapped = radians % TWO_PI;
  if (wrapped > Math.PI) return wrapped - TWO_PI;
  if (wrapped <= -Math.PI) return wrapped + TWO_PI;
  return wrapped;
}

/** 크기를 amount만큼 0을 향해 줄인다 (부호 유지, 0 교차 없음) */
function decayTowardZero(value: number, amount: number): number {
  if (value > 0) return Math.max(0, value - amount);
  if (value < 0) return Math.min(0, value + amount);
  return 0;
}

export interface SubmarineSpawn {
  x: number;
  y: number;
  z: number;
  headingRadians: number;
}

export class SubmarinePlayerController implements PlayerController {
  private x: number;
  private y: number;
  private z: number;
  private heading: number;
  /** 부호 있는 전후 속도 (m/s). 양수 = 전진(선수 -Z 방향) */
  private currentSpeed = 0;
  /** 수직 속도 (m/s). 양수 = 상승 */
  private currentVerticalSpeed = 0;

  // 파생 수치(가감속·선회율)는 applyMovementParams가 재계산한다 —
  // 개발 모드 params 핫리로드 시 내부 참조 교체를 지원하기 위해 mutable.
  private maxSpeed = 0;
  private maxReverseSpeed = 0;
  private maxVerticalSpeed = 0;
  /** 가속률 (m/s²) — accelerationSeconds: 정지→최고 속력 도달 시간 */
  private accelerationPerSecond = 0;
  /** 감속률 (m/s²) — stopInertiaSeconds: 최고 속력→정지 소요 시간 */
  private decelerationPerSecond = 0;
  private verticalAccelerationPerSecond = 0;
  private verticalDecelerationPerSecond = 0;
  /** 선회율 (rad/s) — turn90Seconds: 90도 선회 소요 시간 */
  private turnRatePerSecond = 0;

  // 주의: 생성자 매개변수 프로퍼티를 쓰지 않는다 — 검증 러너(run.mjs)가
  // Node 타입 스트리핑으로 이 파일을 직접 로드하므로 삭제 가능 문법만 사용.
  private readonly input: MovementInput;

  constructor(
    movement: MovementParams,
    input: MovementInput,
    spawn: SubmarineSpawn = { x: 0, y: 0, z: 0, headingRadians: 0 },
  ) {
    this.input = input;
    this.x = spawn.x;
    this.y = this.clampY(spawn.y);
    this.z = spawn.z;
    this.heading = normalizeAngle(spawn.headingRadians);
    this.applyMovementParams(movement);
  }

  /**
   * 검증 완료된 이동 파라미터를 (재)적용한다. 초기화 1회 + 개발 모드
   * 핫리로드(onParamsReloaded — 유효 값만 통지됨) 시에만 호출된다.
   * update()마다 loadParams()를 다시 읽지 않는다.
   */
  applyMovementParams(movement: MovementParams): void {
    this.maxSpeed = movement.maxSpeedMetersPerSecond.value;
    this.maxReverseSpeed = this.maxSpeed * PROVISIONAL_REVERSE_MAX_RATIO;
    this.maxVerticalSpeed = this.maxSpeed * PROVISIONAL_VERTICAL_MAX_RATIO;
    this.accelerationPerSecond = this.maxSpeed / movement.accelerationSeconds.value;
    this.decelerationPerSecond = this.maxSpeed / movement.stopInertiaSeconds.value;
    this.verticalAccelerationPerSecond =
      this.maxVerticalSpeed / movement.accelerationSeconds.value;
    this.verticalDecelerationPerSecond =
      this.maxVerticalSpeed / movement.stopInertiaSeconds.value;
    this.turnRatePerSecond = QUARTER_TURN_RADIANS / movement.turn90Seconds.value;
    // 상한이 낮아진 경우 현재 속도가 새 상한을 넘지 않게 맞춘다
    this.currentSpeed = Math.min(
      Math.max(this.currentSpeed, -this.maxReverseSpeed),
      this.maxSpeed,
    );
    this.currentVerticalSpeed = Math.min(
      Math.max(this.currentVerticalSpeed, -this.maxVerticalSpeed),
      this.maxVerticalSpeed,
    );
  }

  get positionX(): number {
    return this.x;
  }

  /** 수직 위치 — 계약(PlayerController) 밖 확장 상태 (INT-GAME-004 제안 중) */
  get positionY(): number {
    return this.y;
  }

  get positionZ(): number {
    return this.z;
  }

  get headingRadians(): number {
    return this.heading;
  }

  /** 부호 있는 전후 속도 (양수 = 전진). 프로펠러(S7)·소음 산출 입력 */
  get speed(): number {
    return this.currentSpeed;
  }

  /** 수직 속도 (양수 = 상승) — 렌더 보간·연출 참고용 읽기 전용 상태 */
  get verticalSpeed(): number {
    return this.currentVerticalSpeed;
  }

  update(deltaSeconds: number): void {
    // 비정상 dt 방어 — 탭 복귀 시 큰 dt는 core/GameLoop가 이미 0.1초로 상한 처리
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

    this.updateHeading(deltaSeconds);
    this.updateForwardSpeed(deltaSeconds);
    this.updateVerticalSpeed(deltaSeconds);

    // 잠수함 방향 기준 전후진 — 선수 벡터는 파일 상단 좌표 규약 참조
    const distance = this.currentSpeed * deltaSeconds;
    this.x += -Math.sin(this.heading) * distance;
    this.z += -Math.cos(this.heading) * distance;

    this.y += this.currentVerticalSpeed * deltaSeconds;
    if (this.y >= PROVISIONAL_SUBMARINE_MAX_Y) {
      this.y = PROVISIONAL_SUBMARINE_MAX_Y;
      if (this.currentVerticalSpeed > 0) this.currentVerticalSpeed = 0;
    } else if (this.y <= PROVISIONAL_SUBMARINE_MIN_Y) {
      this.y = PROVISIONAL_SUBMARINE_MIN_Y;
      if (this.currentVerticalSpeed < 0) this.currentVerticalSpeed = 0;
    }
  }

  /**
   * 외부 보정 오프셋 적용 — 충돌 밀어내기 전용 (GameplaySystems가 호출).
   * 수직 한계는 여기서도 재클램프한다.
   */
  applyExternalOffset(dx: number, dy: number, dz: number): void {
    this.x += dx;
    this.z += dz;
    this.y = this.clampY(this.y + dy);
  }

  /**
   * 수직 위치 직접 설정 — DepthSystem의 층 단위 이동 요청
   * (requestAscend/Descend 계약 경로) 전용. 수직 관성은 초기화한다.
   */
  setPositionY(y: number): void {
    this.y = this.clampY(y);
    this.currentVerticalSpeed = 0;
  }

  private clampY(y: number): number {
    return Math.min(PROVISIONAL_SUBMARINE_MAX_Y, Math.max(PROVISIONAL_SUBMARINE_MIN_Y, y));
  }

  private updateHeading(deltaSeconds: number): void {
    let direction = 0;
    if (this.input.turnLeft) direction += 1;
    if (this.input.turnRight) direction -= 1;
    if (direction === 0) return;

    this.heading = normalizeAngle(this.heading + direction * this.turnRatePerSecond * deltaSeconds);
  }

  private updateForwardSpeed(deltaSeconds: number): void {
    const forward = this.input.throttleForward;
    const reverse = this.input.reverse;

    if (forward === reverse) {
      // 무입력 또는 W·S 상쇄 = 관성 감속 (계약 명세 '입력 없음 = 관성 감속')
      this.currentSpeed = decayTowardZero(
        this.currentSpeed,
        this.decelerationPerSecond * deltaSeconds,
      );
      return;
    }

    if (forward) {
      if (this.currentSpeed < 0) {
        // 후진 중 W = 제동 — 정지 관성률로 0까지 (0 교차 없음)
        this.currentSpeed = Math.min(
          0,
          this.currentSpeed + this.decelerationPerSecond * deltaSeconds,
        );
      } else {
        this.currentSpeed = Math.min(
          this.maxSpeed,
          this.currentSpeed + this.accelerationPerSecond * deltaSeconds,
        );
      }
      return;
    }

    if (this.currentSpeed > 0) {
      // 전진 중 S = 제동 — 정지 관성률로 0까지 (기존 제동감 유지)
      this.currentSpeed = Math.max(
        0,
        this.currentSpeed - this.decelerationPerSecond * deltaSeconds,
      );
    } else {
      this.currentSpeed = Math.max(
        -this.maxReverseSpeed,
        this.currentSpeed - this.accelerationPerSecond * deltaSeconds,
      );
    }
  }

  private updateVerticalSpeed(deltaSeconds: number): void {
    const up = this.input.ascend;
    const down = this.input.descend;

    if (up === down) {
      // 무입력 또는 Shift·Ctrl 상쇄 = 수직 관성 감속
      this.currentVerticalSpeed = decayTowardZero(
        this.currentVerticalSpeed,
        this.verticalDecelerationPerSecond * deltaSeconds,
      );
      return;
    }

    if (up) {
      if (this.currentVerticalSpeed < 0) {
        this.currentVerticalSpeed = Math.min(
          0,
          this.currentVerticalSpeed + this.verticalDecelerationPerSecond * deltaSeconds,
        );
      } else {
        this.currentVerticalSpeed = Math.min(
          this.maxVerticalSpeed,
          this.currentVerticalSpeed + this.verticalAccelerationPerSecond * deltaSeconds,
        );
      }
      return;
    }

    if (this.currentVerticalSpeed > 0) {
      this.currentVerticalSpeed = Math.max(
        0,
        this.currentVerticalSpeed - this.verticalDecelerationPerSecond * deltaSeconds,
      );
    } else {
      this.currentVerticalSpeed = Math.max(
        -this.maxVerticalSpeed,
        this.currentVerticalSpeed - this.verticalAccelerationPerSecond * deltaSeconds,
      );
    }
  }
}
