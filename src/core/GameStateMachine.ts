/**
 * 게임 상태 머신 — 기본 전환 구조만 제공한다.
 *
 * 전환 조건 판정(언제 APPROACH→ATTACK으로 갈지 등)은 게임 규칙이며
 * 여기서 구현하지 않는다. 시스템들은 transition()을 호출하고,
 * 나머지 모듈은 gameStateChanged 이벤트를 구독한다.
 */

import type { GameStateId } from '../contracts/events';
import type { EventBus } from './EventBus';
import { STATE_TRANSITIONS } from './GameState';

export class GameStateMachine {
  private current: GameStateId = 'BOOT';

  constructor(private readonly bus: EventBus) {}

  get state(): GameStateId {
    return this.current;
  }

  canTransition(next: GameStateId): boolean {
    return STATE_TRANSITIONS[this.current].includes(next);
  }

  /**
   * 상태 전환. 허용표(GameState.ts)에 없는 전환은 예외를 던진다 —
   * 잘못된 국면 전이를 조용히 통과시키지 않기 위함이다.
   */
  transition(next: GameStateId): void {
    if (!this.canTransition(next)) {
      throw new Error(
        `[GameStateMachine] 허용되지 않은 상태 전환: ${this.current} → ${next} ` +
          `(허용: ${STATE_TRANSITIONS[this.current].join(', ') || '없음'})`,
      );
    }
    const previous = this.current;
    this.current = next;
    this.bus.emit('gameStateChanged', { previous, next });
  }
}
