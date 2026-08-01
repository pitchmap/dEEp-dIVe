/**
 * 마우스 전투 입력 어댑터 — 우클릭 **토글**(조준경 전환)·좌클릭(발사)만 추적.
 *
 * 5차 대회의 결의 3 (조준 체계 개편): 우클릭 홀드 폐기 → **우클릭 토글**.
 *  - 우클릭 1회 = 조준경 진입/해제 토글 요청 (에지 단위)
 *  - 좌클릭 = 조준경 상태에서만 발사 (비조준 좌클릭 = 카메라 전용 — 결의 2.
 *    발사 여부 판단은 GameplaySystems·AimSystem 소유, 이 어댑터는 횟수만 추적)
 *
 * 책임: 버튼 에지 추적뿐이다. 전투 규칙은 AimSystem·TorpedoSystem이
 * 소유하며, GameplaySystems가 매 프레임 에지를 **AimSystem 공용 진입점**
 * 호출로 번역한다 — HUD 버튼도 같은 진입점을 호출한다(INT-CORE-002).
 *
 * 안전 규칙:
 *  - blur·탭 전환 시 대기 중 에지를 버린다 (의도치 않은 지연 토글·발사 방지).
 *    조준 토글 **상태** 자체는 AimSystem 소유라 여기서 건드리지 않는다.
 *  - 게임 중 우클릭 컨텍스트 메뉴를 막는다.
 */

import type { KeyEventSource, VisibilitySource } from './KeyboardInput';

const RIGHT_BUTTON = 2;
const LEFT_BUTTON = 0;

export class MouseCombatInput {
  private aimToggleClicks = 0;
  private fireClickCount = 0;
  private moveDeltaX = 0;
  private moveDeltaY = 0;
  private detachListeners: Array<() => void> = [];

  attach(source: KeyEventSource, visibilitySource?: VisibilitySource): void {
    this.detach();

    source.addEventListener('mousedown', this.onMouseDown);
    source.addEventListener('mousemove', this.onMouseMove);
    source.addEventListener('blur', this.onFocusLost);
    source.addEventListener('contextmenu', this.onContextMenu);
    this.detachListeners.push(() => {
      source.removeEventListener('mousedown', this.onMouseDown);
      source.removeEventListener('mousemove', this.onMouseMove);
      source.removeEventListener('blur', this.onFocusLost);
      source.removeEventListener('contextmenu', this.onContextMenu);
    });

    if (visibilitySource) {
      const onVisibilityChange = (): void => {
        if (visibilitySource.visibilityState === 'hidden') this.reset();
      };
      visibilitySource.addEventListener('visibilitychange', onVisibilityChange);
      this.detachListeners.push(() =>
        visibilitySource.removeEventListener('visibilitychange', onVisibilityChange),
      );
    }
  }

  detach(): void {
    for (const remove of this.detachListeners) remove();
    this.detachListeners = [];
    this.reset();
  }

  /** 대기 중 에지 폐기 (포커스 상실·탭 전환 대응) — 토글 '상태'는 AimSystem 소유 */
  reset(): void {
    this.aimToggleClicks = 0;
    this.fireClickCount = 0;
    this.moveDeltaX = 0;
    this.moveDeltaY = 0;
  }

  /**
   * 마지막 호출 이후 누적된 마우스 이동량(픽셀)을 반환하고 0으로 되돌린다.
   * 감도·각도 제한은 조준 시스템이 적용한다 — 여기서는 원시 델타만 모은다.
   */
  consumeMoveDelta(): { dx: number; dy: number } {
    const delta = { dx: this.moveDeltaX, dy: this.moveDeltaY };
    this.moveDeltaX = 0;
    this.moveDeltaY = 0;
    return delta;
  }

  /** 마지막 호출 이후의 우클릭(조준경 토글 요청) 횟수를 반환하고 0으로 되돌린다 */
  consumeAimToggleClicks(): number {
    const count = this.aimToggleClicks;
    this.aimToggleClicks = 0;
    return count;
  }

  /** 마지막 호출 이후의 좌클릭(발사 요청) 횟수를 반환하고 0으로 되돌린다 */
  consumeFireClicks(): number {
    const count = this.fireClickCount;
    this.fireClickCount = 0;
    return count;
  }

  private readonly onMouseDown = (event: Event): void => {
    const button = (event as MouseEvent).button;
    if (button === RIGHT_BUTTON) this.aimToggleClicks += 1;
    else if (button === LEFT_BUTTON) this.fireClickCount += 1;
  };

  /**
   * 이동 누적 — Pointer Lock 상태의 movementX/Y를 우선 사용하고, 없으면
   * 0으로 둔다(비잠금 UI 모드에서는 절대좌표 차분을 쓰지 않는다 — 커서
   * 점프가 조준각으로 새는 것을 막기 위함).
   */
  private readonly onMouseMove = (event: Event): void => {
    const mouse = event as MouseEvent;
    this.moveDeltaX += Number.isFinite(mouse.movementX) ? mouse.movementX : 0;
    this.moveDeltaY += Number.isFinite(mouse.movementY) ? mouse.movementY : 0;
  };

  private readonly onFocusLost = (): void => {
    this.reset();
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };
}
