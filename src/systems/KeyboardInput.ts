/**
 * 키보드 입력 어댑터 — 게임플레이 시스템의 유일한 DOM 입력 진입점.
 *
 * 책임: 키 상태 추적뿐이다. 이동·심도 규칙은 각 시스템이 소유한다.
 *
 * 안전 규칙 (마스터 플랜 §5.1~5.3 조작 신뢰성):
 *  - OS 키 반복(repeat) 이벤트는 무시한다 — Shift/Ctrl 층 이동이
 *    "누르고 있는 동안 연속 발동"되는 것을 막는다 (층 단위 이동 [확정]).
 *  - 창 포커스 상실(blur)·탭 전환(visibilitychange hidden) 시 모든 키 상태를
 *    해제한다 — keyup을 놓쳐 키가 눌린 채 고정되는 상황 방지.
 */

/** 이동 입력 (매 프레임 폴링) — PlayerController가 읽는다 */
export interface MovementInput {
  /** W — 전진 가속 */
  readonly throttleForward: boolean;
  /** S — 감속(제동). W와 동시 입력 시 제동이 우선한다 */
  readonly brake: boolean;
  /** A — 좌선회 (잠수함 방향 기준) */
  readonly turnLeft: boolean;
  /** D — 우선회 (잠수함 방향 기준) */
  readonly turnRight: boolean;
}

/** 심도 입력 (에지 단위) — 층 단위 이동이므로 '누른 횟수'만 의미가 있다 */
export interface DepthInput {
  /** 마지막 호출 이후의 부상(Shift) 입력 횟수를 반환하고 0으로 되돌린다 */
  consumeAscendRequests(): number;
  /** 마지막 호출 이후의 잠항(Ctrl) 입력 횟수를 반환하고 0으로 되돌린다 */
  consumeDescendRequests(): number;
}

/** window 대용으로 주입 가능한 최소 이벤트 소스 (검증 코드에서 EventTarget 사용) */
export type KeyEventSource = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/** document 대용 — visibilitychange와 현재 가시성 상태 */
export interface VisibilitySource extends KeyEventSource {
  readonly visibilityState: DocumentVisibilityState;
}

export class KeyboardInput implements MovementInput, DepthInput {
  private readonly heldCodes = new Set<string>();
  private ascendRequests = 0;
  private descendRequests = 0;
  private detachListeners: Array<() => void> = [];

  /**
   * 이벤트 소스에 연결한다. 실제 게임에서는 attach(window, document),
   * 검증 코드에서는 가짜 EventTarget을 주입한다.
   */
  attach(keySource: KeyEventSource, visibilitySource?: VisibilitySource): void {
    this.detach();

    keySource.addEventListener('keydown', this.onKeyDown);
    keySource.addEventListener('keyup', this.onKeyUp);
    keySource.addEventListener('blur', this.onFocusLost);
    this.detachListeners.push(() => {
      keySource.removeEventListener('keydown', this.onKeyDown);
      keySource.removeEventListener('keyup', this.onKeyUp);
      keySource.removeEventListener('blur', this.onFocusLost);
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

  /** 모든 키 상태·대기 중 심도 요청 해제 (포커스 상실 대응) */
  reset(): void {
    this.heldCodes.clear();
    this.ascendRequests = 0;
    this.descendRequests = 0;
  }

  get throttleForward(): boolean {
    return this.heldCodes.has('KeyW');
  }

  get brake(): boolean {
    return this.heldCodes.has('KeyS');
  }

  get turnLeft(): boolean {
    return this.heldCodes.has('KeyA');
  }

  get turnRight(): boolean {
    return this.heldCodes.has('KeyD');
  }

  consumeAscendRequests(): number {
    const count = this.ascendRequests;
    this.ascendRequests = 0;
    return count;
  }

  consumeDescendRequests(): number {
    const count = this.descendRequests;
    this.descendRequests = 0;
    return count;
  }

  private readonly onKeyDown = (event: Event): void => {
    const key = event as KeyboardEvent;
    // OS 키 반복은 새 입력이 아니다 — 이동 키는 held 집합이 이미 참이고,
    // 심도 키는 반복 발동을 금지해야 한다 (층 단위 이동 [확정])
    if (key.repeat) return;

    switch (key.code) {
      case 'KeyW':
      case 'KeyS':
      case 'KeyA':
      case 'KeyD':
        this.heldCodes.add(key.code);
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.ascendRequests += 1;
        break;
      case 'ControlLeft':
      case 'ControlRight':
        this.descendRequests += 1;
        break;
      default:
        break;
    }
  };

  private readonly onKeyUp = (event: Event): void => {
    this.heldCodes.delete((event as KeyboardEvent).code);
  };

  private readonly onFocusLost = (): void => {
    this.reset();
  };
}
