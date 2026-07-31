/**
 * 카메라 추적 시각 구조 — 잠수함 후방 추적 + 궤도 오프셋 + 리센터 (§3.2·§5.2).
 *
 * 이 클래스는 카메라의 "시각 구조"만 소유한다:
 *  - 대상 포즈(위치·방향)를 따라가는 후방 뷰
 *  - 마우스 궤도 회전을 위한 yaw/pitch 오프셋 (상하 ±60도 제한 [확정 §3.2])
 *  - Space 리센터를 위한 recenter() (후방 뷰 복귀)
 *
 * 입력(마우스·Space 키) 바인딩은 게임플레이 소유(§5.2 구현 오세진)다 —
 * 게임플레이 측이 rotate()/recenter()를 호출하는 구조로 연결한다.
 * 렌더는 여기서 어떤 판정·수치 계산도 하지 않는다.
 */

import * as THREE from 'three';

/** 상하 회전 제한 ±60도 [확정 — 마스터 플랜 §3.2] */
const PITCH_LIMIT_RADIANS = (60 * Math.PI) / 180;

/** 후방 추적 거리·높이·기본 내려보기 각 — 시각 구도 상수 (밸런스 수치 아님) */
const FOLLOW_DISTANCE = 14;
const BASE_PITCH_RADIANS = (14 * Math.PI) / 180;
const LOOK_HEIGHT_OFFSET = 1.0;

/** 추적 감쇠 계수 — 클수록 즉각 반응. 프레임레이트 독립(지수 감쇠) */
const FOLLOW_DAMPING = 6;

export class CameraRig {
  private yawOffset = 0;
  private pitchOffset = 0;
  private initialized = false;
  private readonly currentPosition = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /** 마우스 궤도 회전 입력 (게임플레이 측이 호출). pitch는 ±60도로 잘린다 */
  rotate(deltaYawRadians: number, deltaPitchRadians: number): void {
    this.yawOffset += deltaYawRadians;
    this.pitchOffset = THREE.MathUtils.clamp(
      this.pitchOffset + deltaPitchRadians,
      -PITCH_LIMIT_RADIANS,
      PITCH_LIMIT_RADIANS,
    );
  }

  /** Space 리센터 — 잠수함 후방 뷰로 복귀 (§3.2 방향 상실 대응) */
  recenter(): void {
    this.yawOffset = 0;
    this.pitchOffset = 0;
  }

  /**
   * 매 프레임 호출. 대상 포즈는 게임플레이 시스템의 읽기 전용 상태에서 온다 —
   * 렌더는 위치·방향을 소비만 한다.
   */
  update(
    deltaSeconds: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    headingRadians: number,
  ): void {
    // 후방 뷰 기준: 선수·선미 규약(로컬 -Z = 선수, +Z = 선미)에 따라
    // 카메라는 선미(+Z) 쪽에 놓여 선수 방향을 바라본다 — 리센터 시
    // 프로펠러(선미)가 카메라 가까운 쪽에 보인다.
    const yaw = headingRadians + this.yawOffset;
    const pitch = THREE.MathUtils.clamp(
      BASE_PITCH_RADIANS + this.pitchOffset,
      -PITCH_LIMIT_RADIANS,
      PITCH_LIMIT_RADIANS,
    );

    const horizontal = Math.cos(pitch) * FOLLOW_DISTANCE;
    this.desiredPosition.set(
      targetX + Math.sin(yaw) * horizontal,
      targetY + Math.sin(pitch) * FOLLOW_DISTANCE,
      targetZ + Math.cos(yaw) * horizontal,
    );

    if (!this.initialized) {
      this.currentPosition.copy(this.desiredPosition);
      this.initialized = true;
    } else {
      const t = 1 - Math.exp(-FOLLOW_DAMPING * deltaSeconds);
      this.currentPosition.lerp(this.desiredPosition, t);
    }

    this.camera.position.copy(this.currentPosition);
    this.lookTarget.set(targetX, targetY + LOOK_HEIGHT_OFFSET, targetZ);
    this.camera.lookAt(this.lookTarget);
  }
}
