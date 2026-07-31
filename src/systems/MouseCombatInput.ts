/**
 * 마우스 전투 입력 어댑터 — 우클릭 홀드(조준)·좌클릭(발사)만 추적한다.
 *
 * 책임: 버튼 상태 추적뿐이다. 전투 규칙은 AimSystem·TorpedoSystem이
 * 소유하며, 이 어댑터의 상태는 GameplaySystems가 매 프레임 읽어
 * **AimSystem 공용 진입점(beginAim/endAim/fireTorpedo)** 호출로 번역한다 —
 * HUD 버튼(빌드·툴 소유)도 같은 진입점을 호출하므로 경로가 하나다
 * (INT-CORE-002: 별도 전투 시스템 금지).
 *
 * 안전 규칙 (KeyboardInput과 동일 원칙):
 *  - blur·탭 전환 시 버튼 상태·대기 클릭 해제 — 우클릭이 눌린 채 고정 방지.
 *  - 좌클릭은 에지(횟수) 단위 — 한 번 클릭 = 발사 요청 1회.
 *  - 게임 중 우클릭 컨텍스트 메뉴를 막는다 (조준 홀드용).
 */

import type { KeyEventSource, VisibilitySource } from './KeyboardInput';

const RIGHT_BUTTON = 2;
const LEFT_BUTTON = 0;

export class MouseCombatInput {
  private aimButtonHeld = false;
  private fireClickCount = 0;
  private detachListeners: Array<() => void> = [];

  attach(source: KeyEventSource, visibilitySource?: VisibilitySource): void {
    this.detach();

    source.addEventListener('mousedown', this.onMouseDown);
    source.addEventListener('mouseup', this.onMouseUp);
    source.addEventListener('blur', this.onFocusLost);
    source.addEventListener('contextmenu', this.onContextMenu);
    this.detachListeners.push(() => {
      source.removeEventListener('mousedown', this.onMouseDown);
      source.removeEventListener('mouseup', this.onMouseUp);
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

  reset(): void {
    this.aimButtonHeld = false;
    this.fireClickCount = 0;
  }

  /** 우클릭이 눌려 있는 동안 true — 조준 유지 의도 */
  get aimHeld(): boolean {
    return this.aimButtonHeld;
  }

  /** 마지막 호출 이후의 좌클릭(발사 요청) 횟수를 반환하고 0으로 되돌린다 */
  consumeFireClicks(): number {
    const count = this.fireClickCount;
    this.fireClickCount = 0;
    return count;
  }

  private readonly onMouseDown = (event: Event): void => {
    const button = (event as MouseEvent).button;
    if (button === RIGHT_BUTTON) this.aimButtonHeld = true;
    else if (button === LEFT_BUTTON) this.fireClickCount += 1;
  };

  private readonly onMouseUp = (event: Event): void => {
    if ((event as MouseEvent).button === RIGHT_BUTTON) this.aimButtonHeld = false;
  };

  private readonly onFocusLost = (): void => {
    this.reset();
  };

  private readonly onContextMenu = (event: Event): void => {
    event.preventDefault();
  };
}
