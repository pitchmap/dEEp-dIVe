/**
 * 게임플레이 시스템 조립점 — D3~D5 회색 박스 범위.
 *
 * core/Game(리드 소유)이 이 클래스 하나만 생성·update 호출하면 되도록
 * 입력 → 조작 → 심도의 배선을 캡슐화한다 (통합 요청: INTEGRATION_NOTES #003).
 *
 * 통신 규칙: 렌더·오디오·UI 모듈을 직접 참조하지 않는다.
 *  - 심도 변화 → `depthChanged` 이벤트 (EventBus)
 *  - 위치·방향·속도·심도 → 읽기 전용 상태 (player / depth 프로퍼티)
 */

import type { GameParams } from '../contracts/params';
import type { DepthSystem, PlayerController, Updatable } from '../contracts/systems';
import type { EventBus } from '../core/EventBus';
import { KeyboardInput, type KeyEventSource, type VisibilitySource } from './KeyboardInput';
import { LayeredDepthSystem } from './LayeredDepthSystem';
import { SubmarinePlayerController } from './SubmarinePlayerController';

export class GameplaySystems implements Updatable {
  /** 키 입력 어댑터 — attachInput()으로 window/document에 연결한다 */
  readonly input: KeyboardInput;
  /** 위치·방향·속도 읽기 전용 상태 (탐지·렌더링·카메라 파트 소비용) */
  readonly player: PlayerController;
  /** 현재 심도 층 읽기 전용 상태 + depthChanged 이벤트 발행 */
  readonly depth: DepthSystem;

  constructor(bus: EventBus, params: GameParams) {
    this.input = new KeyboardInput();
    this.player = new SubmarinePlayerController(params.movement, this.input);
    this.depth = new LayeredDepthSystem(bus);
  }

  /** 실제 게임에서는 attachInput(window, document) — 통합 측(core)이 호출 */
  attachInput(keySource: KeyEventSource, visibilitySource?: VisibilitySource): void {
    this.input.attach(keySource, visibilitySource);
  }

  detachInput(): void {
    this.input.detach();
  }

  update(deltaSeconds: number): void {
    // 심도 요청은 에지(누른 횟수) 단위 — 프레임당 여러 입력도 순서대로 반영
    const ascents = this.input.consumeAscendRequests();
    for (let i = 0; i < ascents; i += 1) this.depth.requestAscend();
    const descents = this.input.consumeDescendRequests();
    for (let i = 0; i < descents; i += 1) this.depth.requestDescend();

    this.player.update(deltaSeconds);
    this.depth.update(deltaSeconds);
  }
}
