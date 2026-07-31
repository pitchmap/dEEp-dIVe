/**
 * 심도 3층 시스템 — contracts/systems.ts `DepthSystem` 구현 (§3.4, §5.3).
 *
 * 규칙:
 *  - 층은 정확히 3개: 잠망경(periscope) / 순항(cruise) / 심해(deep).
 *    4층 이상 확장 금지 [확정] — 층 목록은 contracts/events.ts DepthLayerId가
 *    원천이며 여기서는 순서만 정의한다.
 *  - Shift = 한 층 부상, Ctrl = 한 층 잠항. 층 단위 이동 (연속 심도 금지).
 *  - 최상/최하층 초과 요청은 무시하며 이벤트도 발생시키지 않는다
 *    (docs/INTERFACES.md 오류 처리 규칙).
 *  - 층 이동 완료 시 `depthChanged` 이벤트 발행 — 렌더(포그)·탐지·UI가 구독.
 */

import type { DepthLayerId } from '../contracts/events';
import type { DepthSystem } from '../contracts/systems';
import type { EventBus } from '../core/EventBus';

/** 얕은 층 → 깊은 층 순서. 길이 3 고정 (DepthLayerId와 1:1) */
const LAYERS_TOP_TO_BOTTOM: readonly DepthLayerId[] = ['periscope', 'cruise', 'deep'];

export class LayeredDepthSystem implements DepthSystem {
  private layer: DepthLayerId;
  // 생성자 매개변수 프로퍼티 미사용 — 검증 러너(run.mjs)의 Node 타입
  // 스트리핑 호환(삭제 가능 문법만)을 위해 명시적 필드로 둔다.
  private readonly bus: EventBus;

  constructor(
    bus: EventBus,
    /** 시작 층 — 출항은 표준 이동 층인 순항 심도에서 시작한다 (§3.4) */
    initialLayer: DepthLayerId = 'cruise',
  ) {
    this.bus = bus;
    this.layer = initialLayer;
  }

  get currentLayer(): DepthLayerId {
    return this.layer;
  }

  /** Shift = 한 층 부상. 최상층(잠망경)이면 무시 */
  requestAscend(): void {
    this.shiftLayer(-1);
  }

  /** Ctrl = 한 층 잠항. 최하층(심해)이면 무시 */
  requestDescend(): void {
    this.shiftLayer(+1);
  }

  update(_deltaSeconds: number): void {
    // 층 단위 즉시 전환이라 프레임 작업이 없다.
    // Updatable 계약 유지 — 전환 연출 시간이 도입되면 여기서 진행한다.
  }

  private shiftLayer(delta: -1 | 1): void {
    const currentIndex = LAYERS_TOP_TO_BOTTOM.indexOf(this.layer);
    const next = LAYERS_TOP_TO_BOTTOM[currentIndex + delta];
    if (!next) return; // 범위 밖 — 무시, 이벤트 없음

    this.layer = next;
    this.bus.emit('depthChanged', { layer: next });
  }
}
