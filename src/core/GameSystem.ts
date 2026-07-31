/**
 * 시스템 수명주기 계약 — core 소유 (마스터 플랜 §7.2, docs/ARCHITECTURE.md).
 *
 * 각 파트(게임플레이·그래픽스·툴링)가 만든 구현체는 이 인터페이스를 구현해
 * SystemRegistry에 등록된다. 게임플레이와 렌더링·오디오·UI는 서로를 직접
 * import하지 않는다 — 통신은 EventBus(contracts/events.ts 계약)로만 한다.
 *
 * 수명주기 호출 규약 (core/Game이 보장):
 *  initialize → (update → render)* → dispose
 *  - initialize: 루프 시작 전 등록 순서대로 1회. 이벤트 구독·초기 상태 구성 지점
 *  - update:     매 프레임 등록 순서대로. 시뮬레이션 갱신만 — 그리기 금지
 *  - render:     매 프레임, SceneManager의 3D 장면 렌더 **후** 등록 순서대로.
 *                화면 표현이 있는 시스템(UI 등)만 구현한다 (선택)
 *  - dispose:    루프 정지 시 등록 **역순**으로 1회. 구독 해제·DOM·GPU 자원 정리
 */

import type { GameParams } from '../contracts/params';
import type { Updatable } from '../contracts/systems';
import type { EventBus } from './EventBus';
import type { GameStateMachine } from './GameStateMachine';

/**
 * initialize 시점에 core가 공급하는 공용 의존성.
 * 여기 없는 의존성(렌더러, 캔버스 등 파트 내부 객체)은 등록 지점
 * (Game.composeSystems)에서 생성자 주입한다 — 컨텍스트를 만능 가방으로
 * 키우지 않는다.
 */
export interface SystemContext {
  /** 파트 간 유일한 통신 경로 */
  readonly bus: EventBus;
  /** 검증 완료된 밸런스 파라미터 (params/*.json → 단방향 주입) */
  readonly params: GameParams;
  /** 국면 전환 요청·조회. 장면 전환과는 무관하다 (ARCHITECTURE.md 분리 원칙) */
  readonly stateMachine: GameStateMachine;
}

export interface GameSystem extends Updatable {
  /** 등록 중복 검사·오류 메시지에 쓰이는 고유 식별자 (예: 'player', 'depth') */
  readonly id: string;
  initialize(context: SystemContext): void;
  /** update(deltaSeconds)는 Updatable(contracts/systems.ts) 상속 */
  render?(): void;
  dispose(): void;
}
