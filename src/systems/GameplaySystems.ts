/**
 * 게임플레이 시스템 조립점 — D3~D5 회색 박스 범위.
 *
 * core/Game(리드 소유)이 이 클래스 하나를 SystemRegistry에 등록하면 되도록
 * 입력 → 조작 → 심도의 배선을 캡슐화한다 (INTEGRATION_NOTES INT-GAME-002 반영).
 * core의 GameSystem 수명주기(initialize → update* → dispose)를 구현한다.
 *
 * 통신 규칙: 렌더·오디오·UI 모듈을 직접 참조하지 않는다.
 *  - 심도 변화 → `depthChanged` 이벤트 (EventBus)
 *  - 위치·방향·속도·심도 → 읽기 전용 상태 (player / depth 프로퍼티)
 *
 * 파라미터 규칙: 검증 완료된 params는 생성 시 1회 주입받고, 개발 모드
 * 핫리로드는 구독 함수(subscribeToParamsReload — 승인된 파라미터 로더의
 * onParamsReloaded를 composition root가 주입)로 유효한 새 값이 올 때만
 * 내부 참조를 교체한다. update()마다 loadParams()를 호출하지 않는다.
 */

import type { GameParams } from '../contracts/params';
import type { DepthSystem, PlayerController } from '../contracts/systems';
import type { EventBus } from '../core/EventBus';
import type { GameSystem, SystemContext } from '../core/GameSystem';
import { KeyboardInput, type KeyEventSource, type VisibilitySource } from './KeyboardInput';
import { LayeredDepthSystem } from './LayeredDepthSystem';
import { SubmarinePlayerController } from './SubmarinePlayerController';

/** 승인된 파라미터 로더의 onParamsReloaded 시그니처 (config/ParamLoader.ts) */
export type ParamsReloadSubscribe = (
  listener: (params: GameParams) => void,
) => () => void;

export class GameplaySystems implements GameSystem {
  readonly id = 'gameplay';

  /** 키 입력 어댑터 — attachInput()으로 window/document에 연결한다 */
  readonly input: KeyboardInput;
  /** 위치·방향·속도 읽기 전용 상태 (탐지·렌더링·카메라 파트 소비용) */
  readonly player: SubmarinePlayerController;
  /** 현재 심도 층 읽기 전용 상태 + depthChanged 이벤트 발행 */
  readonly depth: DepthSystem;

  private readonly subscribeToParamsReload: ParamsReloadSubscribe | null;
  private unsubscribeParamsReload: (() => void) | null = null;

  constructor(
    bus: EventBus,
    params: GameParams,
    subscribeToParamsReload?: ParamsReloadSubscribe,
  ) {
    this.input = new KeyboardInput();
    this.player = new SubmarinePlayerController(params.movement, this.input);
    this.depth = new LayeredDepthSystem(bus);
    this.subscribeToParamsReload = subscribeToParamsReload ?? null;
  }

  /** 읽기 전용 포즈 소스 (렌더 장면 주입용 — composition root에서만 연결) */
  get poseSource(): PlayerController {
    return this.player;
  }

  initialize(_context: SystemContext): void {
    this.attachInput(window, document);
    // 개발 모드 params 핫리로드 — 검증을 통과한 값만 통지되므로 그대로 교체
    this.unsubscribeParamsReload =
      this.subscribeToParamsReload?.((next) => this.applyParams(next)) ?? null;
  }

  /** 유효(검증 통과)한 새 파라미터로 내부 참조 교체 */
  applyParams(params: GameParams): void {
    this.player.applyMovementParams(params.movement);
  }

  /** 실제 게임에서는 attachInput(window, document) — initialize가 호출 */
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

  dispose(): void {
    this.unsubscribeParamsReload?.();
    this.unsubscribeParamsReload = null;
    this.detachInput();
  }
}
