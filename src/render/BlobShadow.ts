/**
 * 블롭 섀도 — 잠수함 아래 부드러운 원형 그림자 (§3.1·§12.2).
 *
 * 실시간 그림자는 성능 예산상 미사용 [확정] — 코드 생성 방사형 그라데이션
 * 텍스처를 얹은 평면 하나로 대체한다. 최종 아트 에셋이 아니다.
 */

import * as THREE from 'three';

/** 그림자 지름·바닥 이격 — 시각 상수 (밸런스 수치 아님) */
const SHADOW_RADIUS = 4.5;
const FLOOR_CLEARANCE = 0.03;
const TEXTURE_SIZE = 128;
const MAX_OPACITY = 0.4;

function createRadialTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('[BlobShadow] 2D 컨텍스트 생성 실패');
  }
  const half = TEXTURE_SIZE / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.55)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  return new THREE.CanvasTexture(canvas);
}

export class BlobShadow {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly texture: THREE.CanvasTexture;

  constructor(private readonly floorY: number) {
    this.texture = createRadialTexture();
    this.geometry = new THREE.PlaneGeometry(SHADOW_RADIUS * 2, SHADOW_RADIUS * 2);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: MAX_OPACITY,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = floorY + FLOOR_CLEARANCE;
    this.mesh.renderOrder = 1;
  }

  /** 잠수함 수평 위치를 따라간다 (Y는 바닥 고정) */
  follow(x: number, z: number): void {
    this.mesh.position.set(x, this.floorY + FLOOR_CLEARANCE, z);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
