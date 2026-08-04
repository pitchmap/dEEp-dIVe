/**
 * 키보드 입력 어댑터 — 게임플레이 시스템의 유일한 DOM 입력 진입점.
 *
 * 책임: 키 상태 추적뿐이다. 이동·심도 규칙은 각 시스템이 소유한다.
 *
 * 키 배치 (5차 대회의 결의 4 — 키 스왑):
 *  - W/S: 전진·후진, A/D: 선회 (잠수함 방향 기준)
 *  - **Ctrl = 상승 / Shift = 하강** (누르는 동안 연속 — 근거: '긴급 동작
 *    (잠항)에 최편의 키' 원리). **E = 상승 병행 키** — 창 모드에서 Ctrl+W
 *    탭 닫힘 회피용. Keyboard Lock·안내 UI는 툴링 소유, 이 어댑터는
 *    E를 Ctrl과 동일한 상승 명령으로만 처리한다.
 *  - **F = 상호작용·회수 홀드 / Q = 액티브 소나 핑** (INT-CORE-022 확정).
 *    F는 유지(hold) 상태이고 **Q는 press edge**다 — 아래 `EDGE_ONLY_CODES`.
 *
 * 안전 규칙 (조작 신뢰성):
 *  - OS 키 반복(repeat) 이벤트는 무시한다 — 유지 상태는 최초 keydown/keyup으로만
 *    관리해 반복 이벤트가 상태를 오염시키지 않는다.
 *  - 창 포커스 상실(blur)·탭 전환(visibilitychange hidden) 시 모든 키 상태를
 *    해제한다 — keyup을 놓쳐 키가 눌린 채 고정되는 상황 방지.
 */

/** 이동 입력 (매 프레임 폴링) — PlayerController가 읽는다 */
export interface MovementInput {
  /** W — 전진 (선수 방향) */
  readonly throttleForward: boolean;
  /** S — 후진 (선미 방향, 최고 속력은 전진의 비율로 제한). W와 동시 입력 시 상쇄 */
  readonly reverse: boolean;
  /** A — 좌선회 (잠수함 방향 기준) */
  readonly turnLeft: boolean;
  /** D — 우선회 (잠수함 방향 기준) */
  readonly turnRight: boolean;
  /** Ctrl 또는 E — 누르는 동안 연속 상승 (결의 4: 키 스왑 + 병행 키) */
  readonly ascend: boolean;
  /** Shift — 누르는 동안 연속 하강 (결의 4: 긴급 잠항 = 최편의 키) */
  readonly descend: boolean;
}

/** window 대용으로 주입 가능한 최소 이벤트 소스 (검증 코드에서 EventTarget 사용) */
export type KeyEventSource = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/** document 대용 — visibilitychange와 현재 가시성 상태 */
export interface VisibilitySource extends KeyEventSource {
  readonly visibilityState: DocumentVisibilityState;
}

/** 추적 대상 키 코드 (그 외 키는 무시 — 카메라·조준 입력은 각 소유 파트 담당) */
const TRACKED_CODES = new Set([
  'KeyW',
  'KeyS',
  'KeyA',
  'KeyD',
  'KeyE',
  // 회수 홀드 (INT-CORE-022 §9) — 추적 목록에 없으면 keydown이 버려져
  // getter가 영원히 false다. E는 상승 병행 키로 그대로 남는다.
  'KeyF',
  // 액티브 소나 핑 (INT-CORE-022 Q 확정) — **유지 상태가 아니라 press edge**다.
  // 아래 `onKeyDown`이 이 키만 `heldCodes`에 넣지 않고 1회성 요청으로 적립한다.
  'KeyQ', // sonar activePing — 이 키가 묶인 명령을 같은 줄에 명시한다
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
]);

/**
 * press edge로만 소비되는 키 — 유지(hold) 상태를 만들지 않는다.
 *
 * 핑은 "누르고 있는 동안 계속"이 아니라 "한 번 누르면 한 번"이다. boolean
 * hold getter를 두면 조립부가 매 프레임 `requestActivePing()`을 부르게 되고,
 * 쿨다운이 그걸 전부 거부하더라도 **입력 의미 자체가 틀린다**. 그래서 이
 * 키는 `heldCodes`에 들어가지 않는다.
 */
const EDGE_ONLY_CODES = new Set([
  'KeyQ', // sonar activePing (consumeActivePingPressed) — hold 상태 아님
]);

export class KeyboardInput implements MovementInput {
  private readonly heldCodes = new Set<string>();
  private detachListeners: Array<() => void> = [];
  /**
   * 액티브 핑 press edge 적립분 (0 또는 1).
   *
   * 최초 keydown에서 **1개만** 선다. 누른 채로 프레임이 아무리 흘러도 늘지
   * 않고, OS 키 반복도 적립하지 않으며, keyup은 아무것도 만들지 않는다.
   * 소비는 `consumeActivePingPressed()` 한 번뿐이다.
   */
  private activePingPending = false;

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

  /**
   * 모든 키 상태 해제 (포커스 상실·탭 전환·detach 대응).
   *
   * **적립된 핑 요청도 함께 버린다.** 포커스를 잃은 사이의 입력이 돌아온
   * 뒤에 뒤늦게 발사되면 플레이어가 누르지 않은 핑이 나가고, 핑은 탐지
   * 게이지를 올리는 대가가 붙는 행위라 그 오발이 그대로 손해가 된다.
   */
  reset(): void {
    this.heldCodes.clear();
    this.activePingPending = false;
  }

  /**
   * 액티브 소나 핑 press edge 소비 — **1회 누름당 정확히 1회 true**.
   *
   * 조립부·게임플레이 update가 이렇게 쓴다:
   *
   * ```ts
   * if (keyboard.consumeActivePingPressed()) gameplay.requestActivePing();
   * ```
   *
   * 이 계층은 **쿨다운을 소유하지 않는다.** 거부는 `SonarScopeSystem`(또는
   * `gameplay.requestActivePing()`)이 하며, 거부됐다고 해서 여기서 edge를
   * 다시 적립하지 않는다 — 다음 Q keydown이 새 요청을 만들고, 그때도
   * 쿨다운이면 다시 거부될 뿐이다.
   */
  consumeActivePingPressed(): boolean {
    if (!this.activePingPending) return false;
    this.activePingPending = false;
    return true;
  }

  get throttleForward(): boolean {
    return this.heldCodes.has('KeyW');
  }

  get reverse(): boolean {
    return this.heldCodes.has('KeyS');
  }

  get turnLeft(): boolean {
    return this.heldCodes.has('KeyA');
  }

  get turnRight(): boolean {
    return this.heldCodes.has('KeyD');
  }

  /**
   * 회수 홀드 입력 (M2 상호작용) — **`KeyF`** (INT-CORE-022 §9 확정).
   *
   * 이전에는 `KeyE`를 읽어 아래 `ascend`(상승 병행 키)와 같은 키를 공유했고,
   * 그래서 회수 홀드 중 상승이 동시에 진행돼 3D 거리 판정이 `outOfRange`로
   * 취소되는 경로가 있었다. 최종 정책은 **E = 상승 유지 / F hold = 회수**이며,
   * 17차 결의 2로 `F`가 키맵에서 미배정 반환된 키다(신규 규칙 신설 아님).
   *
   * 변경은 이 getter 한 줄뿐이다 — `ascend`는 손대지 않는다. 화면 문구
   * ('E'→'F')는 그래픽스·HUD 소유이며 이 파일에서 바꾸지 않는다.
   */
  get interactHold(): boolean {
    return this.heldCodes.has('KeyF');
  }

  get ascend(): boolean {
    return (
      this.heldCodes.has('ControlLeft') ||
      this.heldCodes.has('ControlRight') ||
      this.heldCodes.has('KeyE')
    );
  }

  get descend(): boolean {
    return this.heldCodes.has('ShiftLeft') || this.heldCodes.has('ShiftRight');
  }

  private readonly onKeyDown = (event: Event): void => {
    const key = event as KeyboardEvent;
    // OS 키 반복은 새 입력이 아니다 — 유지 상태는 최초 keydown이 이미 세웠고,
    // press edge도 최초 1회로 끝난다(반복으로 핑이 연사되지 않는다).
    if (key.repeat) return;
    if (!TRACKED_CODES.has(key.code)) return;
    // press edge 키는 유지 상태를 만들지 않는다 — 요청 1개만 적립한다.
    if (EDGE_ONLY_CODES.has(key.code)) {
      this.activePingPending = true;
      return;
    }
    this.heldCodes.add(key.code);
  };

  private readonly onKeyUp = (event: Event): void => {
    this.heldCodes.delete((event as KeyboardEvent).code);
  };

  private readonly onFocusLost = (): void => {
    this.reset();
  };
}
