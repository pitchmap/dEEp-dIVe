/**
 * A안 — 유영 순찰 모션 (스파이크 기본값).
 *
 * 완만한 원형 순찰로 분절 사인파 애니메이션을 다양한 각도에서 판정할 수
 * 있게 한다. QA 시연 경로 — 본통합 시 보스 AI 포즈 소비로 교체.
 */

import type * as THREE from 'three';
import type { BossMotionStyle } from './BossMotionStyle';

const ORBIT_RADIUS = 26;
const ORBIT_SECONDS = 30;

export class SegmentedSwimMotion implements BossMotionStyle {
  private elapsed = 0;

  constructor(
    private readonly centerX: number,
    private readonly y: number,
    private readonly centerZ: number,
  ) {}

  update(deltaSeconds: number, root: THREE.Group): void {
    this.elapsed += deltaSeconds;
    const angle = (this.elapsed / ORBIT_SECONDS) * Math.PI * 2;
    root.position.set(
      this.centerX + Math.cos(angle) * ORBIT_RADIUS,
      this.y,
      this.centerZ + Math.sin(angle) * ORBIT_RADIUS,
    );
    // 진행 접선 방향으로 선수(-Z) 정렬
    const tangentX = -Math.sin(angle);
    const tangentZ = Math.cos(angle);
    root.rotation.y = Math.atan2(-tangentX, -tangentZ);
  }
}
