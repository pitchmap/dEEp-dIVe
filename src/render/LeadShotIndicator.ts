/**
 * 리드샷 보조선 — 조준경 안에서 유지 (5차 결의 3, 3차 결의 계승).
 *
 * 규칙:
 *  - 게임플레이가 소유한 읽기 전용 상태(표적 위치·속도 = CargoShipStateSource,
 *    어뢰 속력 = TorpedoStateSource)만으로 **표시 위치를 계산하는 표현**이다 —
 *    명중 판정·발사 로직과 무관하며 판정을 복제하지 않는다
 *    (게임플레이 통합 주의사항: '리드샷 보조선 = targets 위치·속도 +
 *    torpedoSpeed + player 포즈로 계산' — 소비 측 계산으로 규정됨).
 *  - 조준 중에만 표시 (aimModeChanged 소비 측이 setVisible 호출).
 */

import * as THREE from 'three';

export class LeadShotIndicator {
  readonly root = new THREE.Group();

  private readonly ring: THREE.Mesh;
  private readonly ringGeometry: THREE.RingGeometry;
  private readonly ringMaterial: THREE.MeshBasicMaterial;

  constructor() {
    this.ringGeometry = new THREE.RingGeometry(1.4, 1.9, 20);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xd9f2a8,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
    this.ring.renderOrder = 5;
    this.root.add(this.ring);
    this.root.visible = false;
  }

  /**
   * 요격 예상 지점 갱신 — 등속 표적·등속 어뢰의 교차 시각(표준 리드 계산).
   * 해가 없으면(따라잡을 수 없음) 숨긴다.
   */
  update(
    visible: boolean,
    shooterX: number,
    shooterZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    targetVelocityX: number,
    targetVelocityZ: number,
    torpedoSpeed: number,
    camera: THREE.Camera,
  ): void {
    if (!visible || torpedoSpeed <= 0) {
      this.root.visible = false;
      return;
    }
    const dx = targetX - shooterX;
    const dz = targetZ - shooterZ;
    const a =
      targetVelocityX * targetVelocityX +
      targetVelocityZ * targetVelocityZ -
      torpedoSpeed * torpedoSpeed;
    const b = 2 * (dx * targetVelocityX + dz * targetVelocityZ);
    const c = dx * dx + dz * dz;
    let interceptSeconds = Number.NaN;
    if (Math.abs(a) < 1e-6) {
      if (Math.abs(b) > 1e-6) interceptSeconds = -c / b;
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const sqrt = Math.sqrt(discriminant);
        const t1 = (-b - sqrt) / (2 * a);
        const t2 = (-b + sqrt) / (2 * a);
        interceptSeconds = Math.min(
          t1 > 0 ? t1 : Number.POSITIVE_INFINITY,
          t2 > 0 ? t2 : Number.POSITIVE_INFINITY,
        );
      }
    }
    if (!Number.isFinite(interceptSeconds) || interceptSeconds <= 0) {
      this.root.visible = false;
      return;
    }

    this.root.visible = true;
    this.root.position.set(
      targetX + targetVelocityX * interceptSeconds,
      targetY,
      targetZ + targetVelocityZ * interceptSeconds,
    );
    this.ring.quaternion.copy(camera.quaternion); // 빌보드 — 항상 카메라를 향함
  }

  dispose(): void {
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
    this.root.removeFromParent();
    this.root.clear();
  }
}
