/**
 * B안 — 이동 곡선·관성·근접 카메라 흔들림으로 위협감을 내는 대체 모션
 * (11차 결의 5 · R-P1 대응 경로, 이관 공수 0.5일).
 *
 * **기본 비활성** — `?bossSpike=1&bossMotion=b`로만 활성화된다.
 * 분절 사인파가 '우스꽝스럽다' 판정을 받으면 이 모션 + 분절 진폭 0으로
 * 전환한다. 시각 전용 — 판정·AI 없음 (스파이크 단계 QA 시연 경로).
 *
 * 구성: 목표점 대시(급가속 → 관성 감속 활공) + 방향 전환 곡선 +
 * 근접 시 카메라 흔들림 훅(onNearPass — 장면이 카메라 오프셋에 연결).
 */

import * as THREE from 'three';
import visualParams from '../renderVisualParams.json';
import type { BossMotionStyle } from './BossMotionStyle';

const PARAMS = visualParams.bossSpike;

const DASH_POINTS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -22, z: -18 },
  { x: 20, z: -30 },
  { x: 8, z: 10 },
  { x: -18, z: 20 },
];

export class BossMotionFallback implements BossMotionStyle {
  /** 근접 통과 강도(0~1) — 장면이 카메라 흔들림에 연결하는 훅 */
  onNearPass: ((intensity: number) => void) | null = null;

  private elapsed = 0;
  private pointIndex = 0;
  private readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private initialized = false;

  constructor(
    private readonly y: number,
    private readonly cameraPosition: THREE.Vector3 | null,
  ) {}

  update(deltaSeconds: number, root: THREE.Group): void {
    this.elapsed += deltaSeconds;
    const target = DASH_POINTS[this.pointIndex];
    if (!target) return;

    if (!this.initialized) {
      this.initialized = true;
      const start = DASH_POINTS[DASH_POINTS.length - 1];
      this.position.set(start?.x ?? 0, this.y, start?.z ?? 0);
    }

    // 대시 주기 내 위치: 급가속(제곱 이징) 후 관성 활공
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 2.5) {
      this.pointIndex = (this.pointIndex + 1) % DASH_POINTS.length;
      return;
    }

    // 급가속: 목표 방향으로 강한 가속, 속도 상한은 거리 비례 (관성 강조)
    const accel = 34 / Math.max(PARAMS.fallbackDashSeconds, 0.5);
    this.velocity.x += (dx / distance) * accel * deltaSeconds;
    this.velocity.z += (dz / distance) * accel * deltaSeconds;
    // 관성 감속 — 물 저항 (지수 감쇠)
    const drag = Math.exp(-0.6 * deltaSeconds);
    this.velocity.multiplyScalar(drag);

    this.position.x += this.velocity.x * deltaSeconds;
    this.position.z += this.velocity.z * deltaSeconds;
    root.position.set(this.position.x, this.y, this.position.z);

    // 속도 방향으로 선수(-Z) 정렬 — 곡선 선회가 자연히 생긴다
    if (this.velocity.lengthSq() > 0.01) {
      root.rotation.y = Math.atan2(-this.velocity.x, -this.velocity.z);
    }

    // 근접 카메라 흔들림 훅 — 카메라와의 거리 기반 강도(시각 전용)
    if (this.onNearPass && this.cameraPosition) {
      const near = this.position.distanceTo(this.cameraPosition);
      if (near < 18) {
        const intensity =
          (1 - near / 18) * PARAMS.fallbackShakeAmplitude *
          Math.min(this.velocity.length() / 10, 1);
        if (intensity > 0.01) this.onNearPass(intensity);
      }
    }
  }
}
