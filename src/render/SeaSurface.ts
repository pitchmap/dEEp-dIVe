/**
 * 해수면 — 저비용 평면 + 정점 기반 파도 (§3.1 [확정]: 물 = 정점 애니메이션).
 *
 * 반사·굴절·유체 물리는 사용하지 않는다 (성능 예산 §12.2 [확정]).
 * 파도 진폭·속도는 renderVisualParams.json(렌더 소유 외부 설정)에서 읽는다.
 * 법선은 flatShading 셰이더 경로가 계산하므로 매 프레임 CPU 법선 재계산이 없다.
 */

import * as THREE from 'three';
import visualParams from './renderVisualParams.json';

const PARAMS = visualParams.seaSurface;

/** 평면 크기·분할 — 협곡 블록아웃(240) 전체를 덮는 시각 상수 */
const SURFACE_SIZE = 240;
const SURFACE_SEGMENTS = 40;

export class SeaSurface {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly baseX: Float32Array;
  private readonly baseZ: Float32Array;
  private elapsed = 0;

  constructor(surfaceY: number) {
    this.geometry = new THREE.PlaneGeometry(
      SURFACE_SIZE,
      SURFACE_SIZE,
      SURFACE_SEGMENTS,
      SURFACE_SEGMENTS,
    );
    this.geometry.rotateX(-Math.PI / 2); // XZ 평면, Y가 파고

    const positions = this.geometry.attributes.position;
    if (!positions) {
      throw new Error('[SeaSurface] position 속성이 없습니다.');
    }
    const count = positions.count;
    this.baseX = new Float32Array(count);
    this.baseZ = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      this.baseX[i] = positions.getX(i);
      this.baseZ[i] = positions.getZ(i);
    }

    // 수면은 위(하늘)에서 밝게, 아래(수중)에서 실루엣 배경이 되도록 양면 렌더.
    // 반사·굴절 없음 — 색과 약한 투명도만으로 표현한다.
    // emissive: 이면(수중에서 본 아랫면)은 방향광을 받지 못해 ambient만으로는
    // 검게 가라앉는다 — '밝음(수면)→어둠(심해)' 문법(§3.1)대로 수중에서
    // 올려다본 수면이 밝은 배경이 되도록 자발광을 더한다 (조명 수 증가 없음).
    this.material = new THREE.MeshLambertMaterial({
      color: 0x3c7f97,
      emissive: 0x2b6478,
      flatShading: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.y = surfaceY;
    this.mesh.renderOrder = 3; // 수중 오브젝트(불투명) 뒤에 그려 실루엣 유지
  }

  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds * PARAMS.waveTimeScale;
    const positions = this.geometry.attributes.position;
    if (!positions) return;
    const t = this.elapsed;
    for (let i = 0; i < positions.count; i += 1) {
      const x = this.baseX[i] ?? 0;
      const z = this.baseZ[i] ?? 0;
      const height =
        PARAMS.waveAmplitude *
        (Math.sin(x * 0.07 + t * 1.6) * 0.6 +
          Math.sin(z * 0.09 + x * 0.03 + t * 1.1) * 0.4);
      positions.setY(i, height);
    }
    positions.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
