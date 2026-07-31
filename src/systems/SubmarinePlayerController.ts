/**
 * 잠수함 조작 — contracts/systems.ts `PlayerController` 구현 (§5.1~5.2).
 *
 * 규칙:
 *  - W = 전진 가속, S = 감속(제동). 후진 없음 (마스터 플랜 §3.3 "W/S 전진·감속").
 *  - W·S 동시 입력 시 제동이 우선한다.
 *  - 입력 없음 = 관성 감속 (계약 명세). 정지 관성은 params/movement.json
 *    stopInertiaSeconds — 최고 속력에서 정지까지의 시간으로 해석한다.
 *  - A/D 선회는 잠수함 방향 기준 [확정] — 카메라 기준이 아니다.
 *    90도 선회 시간은 params/movement.json turn90Seconds.
 *  - delta time 기반 — 프레임 속도와 무관하게 동일 결과 (dt≤0·비유한값은 무시).
 *
 * 좌표 규약 (렌더링·카메라 파트 통합 기준):
 *  - 수평면 XZ. headingRadians는 Y축(위) 기준 요(yaw) 각.
 *  - heading 0 → 전진 방향 (0, -1) [Three.js -Z 전방 관례].
 *    전진 벡터 = (-sin(heading), -cos(heading)) — 렌더 측은
 *    mesh.rotation.y = headingRadians 로 그대로 사용 가능하다.
 *  - A(좌선회) = heading 증가 / D(우선회) = heading 감소. (-π, π] 정규화.
 */

import type { MovementParams } from '../contracts/params';
import type { PlayerController } from '../contracts/systems';
import type { MovementInput } from './KeyboardInput';

const QUARTER_TURN_RADIANS = Math.PI / 2;
const TWO_PI = Math.PI * 2;

/** (-π, π] 범위로 정규화 — 장시간 선회 시 각도 누적 오차 방지 */
function normalizeAngle(radians: number): number {
  const wrapped = radians % TWO_PI;
  if (wrapped > Math.PI) return wrapped - TWO_PI;
  if (wrapped <= -Math.PI) return wrapped + TWO_PI;
  return wrapped;
}

export interface SubmarineSpawn {
  x: number;
  z: number;
  headingRadians: number;
}

export class SubmarinePlayerController implements PlayerController {
  private x: number;
  private z: number;
  private heading: number;
  private currentSpeed = 0;

  // 파생 수치(가감속·선회율)는 applyMovementParams가 재계산한다 —
  // 개발 모드 params 핫리로드 시 내부 참조 교체를 지원하기 위해 mutable.
  private maxSpeed = 0;
  /** 가속률 (m/s²) — accelerationSeconds: 정지→최고 속력 도달 시간 */
  private accelerationPerSecond = 0;
  /** 감속률 (m/s²) — stopInertiaSeconds: 최고 속력→정지 소요 시간 */
  private decelerationPerSecond = 0;
  /** 선회율 (rad/s) — turn90Seconds: 90도 선회 소요 시간 */
  private turnRatePerSecond = 0;

  // 주의: 생성자 매개변수 프로퍼티를 쓰지 않는다 — 검증 러너(run.mjs)가
  // Node 타입 스트리핑으로 이 파일을 직접 로드하므로 삭제 가능 문법만 사용.
  private readonly input: MovementInput;

  constructor(
    movement: MovementParams,
    input: MovementInput,
    spawn: SubmarineSpawn = { x: 0, z: 0, headingRadians: 0 },
  ) {
    this.input = input;
    this.x = spawn.x;
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
    this.accelerationPerSecond = this.maxSpeed / movement.accelerationSeconds.value;
    this.decelerationPerSecond = this.maxSpeed / movement.stopInertiaSeconds.value;
    this.turnRatePerSecond = QUARTER_TURN_RADIANS / movement.turn90Seconds.value;
    // 상한이 낮아진 경우 현재 속력이 새 상한을 넘지 않게 맞춘다
    this.currentSpeed = Math.min(this.currentSpeed, this.maxSpeed);
  }

  get positionX(): number {
    return this.x;
  }

  get positionZ(): number {
    return this.z;
  }

  get headingRadians(): number {
    return this.heading;
  }

  get speed(): number {
    return this.currentSpeed;
  }

  update(deltaSeconds: number): void {
    // 비정상 dt 방어 — 탭 복귀 시 큰 dt는 core/GameLoop가 이미 0.1초로 상한 처리
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

    this.updateHeading(deltaSeconds);
    this.updateSpeed(deltaSeconds);

    // 잠수함 방향 기준 전진 — 전진 벡터는 파일 상단 좌표 규약 참조
    const distance = this.currentSpeed * deltaSeconds;
    this.x += -Math.sin(this.heading) * distance;
    this.z += -Math.cos(this.heading) * distance;
  }

  private updateHeading(deltaSeconds: number): void {
    let direction = 0;
    if (this.input.turnLeft) direction += 1;
    if (this.input.turnRight) direction -= 1;
    if (direction === 0) return;

    this.heading = normalizeAngle(this.heading + direction * this.turnRatePerSecond * deltaSeconds);
  }

  private updateSpeed(deltaSeconds: number): void {
    if (this.input.brake) {
      // S = 제동. W 동시 입력보다 우선한다
      this.currentSpeed = Math.max(0, this.currentSpeed - this.decelerationPerSecond * deltaSeconds);
    } else if (this.input.throttleForward) {
      this.currentSpeed = Math.min(
        this.maxSpeed,
        this.currentSpeed + this.accelerationPerSecond * deltaSeconds,
      );
    } else {
      // 입력 없음 = 관성 감속 (계약 명세)
      this.currentSpeed = Math.max(0, this.currentSpeed - this.decelerationPerSecond * deltaSeconds);
    }
  }
}
