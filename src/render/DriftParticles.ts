/**
 * 부유물(마린 스노우) 파티클 — 아트 타깃의 수중 밀도감 (저비용).
 *
 * 성능 규칙:
 *  - `THREE.Points` 1개 = **드로우 콜 1** (개수와 무관).
 *  - 스프라이트는 코드 생성 8×8 라디얼 도트 텍스처 1장 재사용.
 *  - 파티클은 카메라 주변 상자 안에서만 살고, 상자를 벗어나면 반대편으로
 *    되감는다(생성·소멸 없음 — GC 0, 밀도 일정).
 *  - 저사양(?quality=low)에서는 개수를 params.lowSpec.driftCount로 줄인다.
 *
 * 판정 무관: 순수 연출이며 게임 상태를 읽지도 쓰지도 않는다.
 */

import * as THREE from 'three';
import visualParams from './renderVisualParams.json';

const ART = visualParams.artDirection;

/** 코드 생성 소프트 도트 텍스처 — 외부 에셋 없음 (항법등 글로우와 공유) */
export function buildDotTexture(): THREE.Texture {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2,
    );
    gradient.addColorStop(0, 'rgba(210,235,240,0.9)');
    gradient.addColorStop(0.55, 'rgba(190,220,230,0.35)');
    gradient.addColorStop(1, 'rgba(180,210,220,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class DriftParticles {
  readonly points: THREE.Points;

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private readonly texture: THREE.Texture;
  private readonly positions: Float32Array;
  /** 입자별 좌우 흔들림 위상 (결정적 — 인덱스 파생) */
  private readonly phases: Float32Array;
  private readonly count: number;
  private elapsed = 0;

  constructor(count: number = ART.drift.count) {
    this.count = Math.max(0, Math.floor(count));
    this.positions = new Float32Array(this.count * 3);
    this.phases = new Float32Array(this.count);
    const radius = ART.drift.boxRadiusMeters;
    for (let i = 0; i < this.count; i += 1) {
      // 결정적 초기 분포 — 난수 대신 저불일치 수열 (재현 가능)
      const a = (i * 0.754877666) % 1;
      const b = (i * 0.569840296) % 1;
      const c = (i * 0.928615753) % 1;
      this.positions[i * 3] = (a * 2 - 1) * radius;
      this.positions[i * 3 + 1] = (b * 2 - 1) * radius;
      this.positions[i * 3 + 2] = (c * 2 - 1) * radius;
      this.phases[i] = a * Math.PI * 2;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.texture = buildDotTexture();
    this.material = new THREE.PointsMaterial({
      map: this.texture,
      size: ART.drift.sizeMeters,
      transparent: true,
      opacity: ART.drift.opacity,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    // 반투명 서열: 수면(3)과 같은 층 — 폭발(4)·보조선(5) 아래
    this.points.renderOrder = 3;
    this.points.frustumCulled = false; // 항상 카메라 주변 — 컬링 계산 생략
    this.points.visible = this.count > 0;
  }

  /** 매 프레임 — 상승 부유 + 카메라 상자 되감기 (할당 없음) */
  update(deltaSeconds: number, cameraX: number, cameraY: number, cameraZ: number): void {
    if (this.count === 0) return;
    this.elapsed += deltaSeconds;
    const radius = ART.drift.boxRadiusMeters;
    const span = radius * 2;
    const rise = ART.drift.riseMetersPerSecond * deltaSeconds;
    const sway = ART.drift.swayMetersPerSecond * deltaSeconds;

    for (let i = 0; i < this.count; i += 1) {
      const base = i * 3;
      this.positions[base] =
        this.positions[base]! + Math.sin(this.elapsed * 0.6 + this.phases[i]!) * sway;
      this.positions[base + 1] = this.positions[base + 1]! + rise;
      // 카메라 기준 상자로 되감기 — 밀도 일정 유지
      for (let axis = 0; axis < 3; axis += 1) {
        const cameraAxis = axis === 0 ? cameraX : axis === 1 ? cameraY : cameraZ;
        let value = this.positions[base + axis]!;
        // 월드 좌표 저장 — 카메라와의 차로 판정
        const offset = value - cameraAxis;
        if (offset > radius) value -= span;
        else if (offset < -radius) value += span;
        this.positions[base + axis] = value;
      }
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** 심도 그레이딩용 불투명 배율 — 기본 opacity × scale (판정 무관 연출) */
  setOpacityScale(scale: number): void {
    this.material.opacity = ART.drift.opacity * scale;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
