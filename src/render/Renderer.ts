/**
 * WebGLRenderer + PerspectiveCamera 래퍼.
 *
 * 성능 예산(마스터 플랜 §12): 실시간 그림자 미사용, 반사·굴절 미사용.
 * 그림자 맵은 아예 비활성화 상태로 시작한다.
 */

import * as THREE from 'three';

export class Renderer {
  readonly webgl: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;

  constructor(canvas: HTMLCanvasElement) {
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webgl.shadowMap.enabled = false;

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );
  }

  resize(width: number, height: number): void {
    this.webgl.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(scene: THREE.Scene): void {
    this.webgl.render(scene, this.camera);
  }

  /** 계측 오버레이 표시용 렌더러 정보 */
  describe(): string {
    const gl = this.webgl.getContext();
    const version = this.webgl.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1';
    const info = this.webgl.info.render;
    return `${version} · ${gl.drawingBufferWidth}x${gl.drawingBufferHeight} · draw ${info.calls} · tri ${info.triangles}`;
  }

  dispose(): void {
    this.webgl.dispose();
  }
}
