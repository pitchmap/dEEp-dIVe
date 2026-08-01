/**
 * 조준경 표현 — 동일 3D 카메라 + 원형 마스크 + FOV 축소 + 십자선·거리 눈금
 * (5차 결의 3: 별도 장면 금지, '렌즈만 끼운다').
 *
 * 규칙:
 *  - 조준 상태는 게임플레이가 발행하는 `aimModeChanged` 이벤트로만 받는다 —
 *    렌더가 독자적으로 진입·해제 상태를 바꾸지 않는다 (setAiming은 장면의
 *    이벤트 구독 핸들러만 호출).
 *  - FOV 보간은 렌더 소유 카메라의 표현 — 조준 판정과 무관.
 *  - 마스크·십자선·눈금은 DOM 오버레이(그리기 비용 0, 캔버스 위 겹침) —
 *    리드 확인(11차 결의 1): FOV 전환 프레임 비용 측정 오차 내 통과.
 *  - 거리 눈금은 일반 거리 표식(시각 보조)이며 판정 수치를 복제하지 않는다.
 */

import * as THREE from 'three';
import visualParams from './renderVisualParams.json';

const PARAMS = visualParams.periscope;

export class PeriscopeView {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly baseFov: number;
  private readonly overlay: HTMLDivElement;
  private aiming = false;
  private currentFov: number;

  constructor(camera: THREE.PerspectiveCamera, host: HTMLElement) {
    this.camera = camera;
    this.baseFov = camera.fov;
    this.currentFov = camera.fov;

    this.overlay = document.createElement('div');
    this.overlay.setAttribute('data-render-periscope', '');
    this.overlay.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      'display:none',
      'z-index:30',
    ].join(';');

    // 원형 마스크 — 원 바깥을 어둡게 (box-shadow 컷아웃, 렌더 비용 0)
    const diameter = `min(${PARAMS.maskDiameterViewportRatio * 100}vw, ${
      PARAMS.maskDiameterViewportRatio * 100
    }vh)`;
    const mask = document.createElement('div');
    mask.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      `width:${diameter}`,
      `height:${diameter}`,
      'transform:translate(-50%,-50%)',
      'border-radius:50%',
      'box-shadow:0 0 0 200vmax rgba(2,8,12,0.92), inset 0 0 42px rgba(2,8,12,0.85)',
      'border:2px solid rgba(150,190,205,0.35)',
    ].join(';');
    this.overlay.appendChild(mask);

    // 십자선 — 수평·수직 (중앙 개방형)
    for (const line of [
      'left:50%;top:12%;width:1px;height:32%;transform:translateX(-0.5px)',
      'left:50%;top:56%;width:1px;height:32%;transform:translateX(-0.5px)',
      'top:50%;left:14%;height:1px;width:31%;transform:translateY(-0.5px)',
      'top:50%;left:55%;height:1px;width:31%;transform:translateY(-0.5px)',
    ]) {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;background:rgba(190,225,235,0.65);${line}`;
      mask.appendChild(el);
    }

    // 거리 눈금 — 수직 십자선 위의 가로 눈금 (일반 표식, 위로 갈수록 먼 거리)
    for (let i = 1; i <= PARAMS.rangeTickCount; i += 1) {
      const tick = document.createElement('div');
      const width = 12 - i * 2;
      tick.style.cssText = [
        'position:absolute',
        'left:50%',
        `top:${50 - i * 9}%`,
        `width:${width}%`,
        'height:1px',
        'transform:translateX(-50%)',
        'background:rgba(190,225,235,0.5)',
      ].join(';');
      mask.appendChild(tick);
    }

    host.appendChild(this.overlay);
  }

  /** aimModeChanged 이벤트 핸들러에서만 호출 — 렌더는 상태를 소비만 한다 */
  setAiming(aiming: boolean): void {
    this.aiming = aiming;
    this.overlay.style.display = aiming ? 'block' : 'none';
  }

  get isAiming(): boolean {
    return this.aiming;
  }

  /** FOV 보간 — 프레임레이트 독립 지수 감쇠 */
  update(deltaSeconds: number): void {
    const target = this.aiming ? PARAMS.aimFovDegrees : this.baseFov;
    if (Math.abs(this.currentFov - target) < 0.01) return;
    const t = 1 - Math.exp(-PARAMS.fovLerpDamping * deltaSeconds);
    this.currentFov += (target - this.currentFov) * t;
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    // FOV 원복 — 장면 전환 시 카메라를 기본 상태로 되돌린다
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.overlay.remove();
  }
}
