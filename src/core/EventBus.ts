/**
 * 타입 안전 이벤트 버스.
 *
 * 게임플레이·렌더링·사운드·UI 간의 유일한 통신 경로.
 * 이벤트 이름·페이로드는 src/contracts/events.ts 계약을 따른다.
 */

import type { GameEventName, GameEvents } from '../contracts/events';

export type EventHandler<K extends GameEventName> = (payload: GameEvents[K]) => void;

/** 구독 해제 함수 */
export type Unsubscribe = () => void;

export class EventBus {
  private readonly handlers = new Map<GameEventName, Set<(payload: never) => void>>();

  on<K extends GameEventName>(event: K, handler: EventHandler<K>): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: never) => void);
    return () => this.off(event, handler);
  }

  off<K extends GameEventName>(event: K, handler: EventHandler<K>): void {
    this.handlers.get(event)?.delete(handler as (payload: never) => void);
  }

  emit<K extends GameEventName>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      (handler as EventHandler<K>)(payload);
    }
  }

  /** 테스트·씬 전환 시 정리용 */
  clear(): void {
    this.handlers.clear();
  }
}
