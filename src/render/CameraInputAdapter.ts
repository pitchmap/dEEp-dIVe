/**
 * 카메라 전용 입력 어댑터 — 마우스 궤도 회전 + Space 리센터 (§3.2·§5.2).
 *
 * D+5 책임 경계 (통합 결정):
 *  - 잠수함 이동·심도 키(WASD·Shift·Ctrl)는 게임플레이(KeyboardInput) 담당 —
 *    여기서는 다루지 않는다 (중복 금지).
 *  - 이 어댑터는 CameraRig의 rotate()/recenter()만 호출한다. 판정·이동 계산 없음.
 *  - 범용 입력 프레임워크가 아니다 — 카메라 조작에 필요한 최소 바인딩만 둔다.
 *
 * 안전 규칙:
 *  - 드래그 중 창 포커스 상실(blur)·마우스 이탈 후 keyup/mouseup 유실 시에도
 *    드래그 상태가 고착되지 않도록 blur에서 상태를 해제한다.
 *  - Space의 OS 키 반복은 무시한다 (리센터 1회면 충분).
 *  - dispose()에서 모든 리스너를 해제한다.
 */

import type { GameSystem, SystemContext } from '../core/GameSystem';
import type { CameraRig } from './CameraRig';

/** 드래그 픽셀 → 회전 라디안 감도 — 시각 조작감 상수 (밸런스 수치 아님) */
const ORBIT_RADIANS_PER_PIXEL = 0.005;

export class CameraInputAdapter implements GameSystem {
  readonly id = 'cameraInput';

  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private detachListeners: Array<() => void> = [];

  // 생성자 매개변수 프로퍼티 미사용 — src/render 공통 스타일 유지
  private readonly rig: CameraRig;

  constructor(rig: CameraRig) {
    this.rig = rig;
  }

  initialize(_context: SystemContext): void {
    const onMouseDown = (event: Event): void => {
      const mouse = event as MouseEvent;
      if (mouse.button !== 0) return; // 좌클릭 드래그만 — 우클릭은 조준(D6+) 예약
      this.dragging = true;
      this.lastX = mouse.clientX;
      this.lastY = mouse.clientY;
    };
    const onMouseMove = (event: Event): void => {
      if (!this.dragging) return;
      const mouse = event as MouseEvent;
      const dx = mouse.clientX - this.lastX;
      const dy = mouse.clientY - this.lastY;
      this.lastX = mouse.clientX;
      this.lastY = mouse.clientY;
      // 드래그 방향으로 시점이 도는 궤도 조작. 상하 ±60도 제한은 rig가 보장.
      this.rig.rotate(-dx * ORBIT_RADIANS_PER_PIXEL, -dy * ORBIT_RADIANS_PER_PIXEL);
    };
    const onMouseUp = (): void => {
      this.dragging = false;
    };
    const onKeyDown = (event: Event): void => {
      const key = event as KeyboardEvent;
      if (key.code !== 'Space' || key.repeat) return;
      this.rig.recenter();
    };
    const onBlur = (): void => {
      // 포커스 상실 시 드래그 고착 방지 — mouseup 유실 대비
      this.dragging = false;
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    this.detachListeners.push(() => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
    });
  }

  update(_deltaSeconds: number): void {
    // 회전은 이벤트 시점에 rig에 즉시 반영된다 — 프레임 작업 없음.
    // 카메라 위치 갱신 자체는 CanyonScene.update → rig.update가 수행.
  }

  dispose(): void {
    for (const remove of this.detachListeners) remove();
    this.detachListeners = [];
    this.dragging = false;
  }
}
