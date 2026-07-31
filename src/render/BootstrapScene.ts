/**
 * D1~D2 부트스트랩 장면 — 렌더링 파이프라인 검증 전용.
 *
 * 포함: 단색 배경 + 단순 포그, 조명 2개 이내(성능 예산 §12),
 * 회전하는 기준 오브젝트 1개(플랫 셰이딩 정이십면체).
 *
 * 기준 오브젝트는 게임 에셋이 아니다 — 렌더링·프레임 계측 검증용이며
 * D3 이후 회색 박스 잠수함으로 교체된다.
 * 잠수함·화물선·구축함·어뢰·폭뢰는 여기서 구현하지 않는다.
 */

import * as THREE from 'three';
import type { ManagedScene } from '../core/SceneManager';
import type { Renderer } from './Renderer';

/** 심해 그라데이션 포그 톤 — 임시 색상. 아트 방향 확정 색상은 D13 이후 적용 */
const BACKGROUND_COLOR = 0x0b2b3d;

export class BootstrapScene implements ManagedScene {
  private readonly scene = new THREE.Scene();
  private readonly marker: THREE.Mesh;
  private readonly markerMaterial: THREE.MeshStandardMaterial;
  private readonly markerGeometry: THREE.IcosahedronGeometry;

  constructor(private readonly renderer: Renderer) {
    this.scene.background = new THREE.Color(BACKGROUND_COLOR);
    this.scene.fog = new THREE.Fog(BACKGROUND_COLOR, 8, 60);

    // 조명 예산: 실시간 조명 최대 2개 — 방향광 1개만 사용 (+보조 환경광)
    const sun = new THREE.DirectionalLight(0xbfe3f2, 2.2);
    sun.position.set(3, 10, 4);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x24404f, 1.2));

    // 렌더링 검증용 기준 오브젝트 (게임 에셋 아님)
    this.markerGeometry = new THREE.IcosahedronGeometry(1, 0);
    this.markerMaterial = new THREE.MeshStandardMaterial({
      color: 0xf2a44a,
      flatShading: true,
    });
    this.marker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
    this.scene.add(this.marker);

    const camera = this.renderer.camera;
    camera.position.set(0, 1.2, 4.5);
    camera.lookAt(0, 0, 0);
  }

  update(deltaSeconds: number): void {
    this.marker.rotation.y += deltaSeconds * 0.6;
    this.marker.rotation.x += deltaSeconds * 0.25;
  }

  render(): void {
    this.renderer.render(this.scene);
  }

  resize(_width: number, _height: number): void {
    // 카메라 종횡비는 Renderer.resize가 처리한다. 장면 쪽 대응 없음.
  }

  dispose(): void {
    this.markerGeometry.dispose();
    this.markerMaterial.dispose();
  }
}
