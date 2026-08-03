/**
 * 경비함 어댑터 — **기존 구축함 AI 재사용** (INT-CORE-012, B5).
 *
 * ## 이 파일에 없는 것
 *
 * AI 판단 로직이 하나도 없다. 추적 상태 머신·경비 전용 공격 루틴·탐지·
 * 폭뢰는 여기에도, 다른 어디에도 새로 만들지 않는다 (B5 = 신규 AI 코어 0,
 * 탐지·폭뢰는 스프린트 C 범위). 어댑터가 하는 일은 **주입과 수명주기**뿐:
 *
 *  - 세력(`patrol`) 주입
 *  - 초기 표적(공격자) 주입 — 기존 `DestroyerAI.notifyLastKnownPosition`
 *  - 스폰 이유·표시용 identity 보관 (판정에 쓰지 않는 메타데이터)
 *  - 스폰된 AI들에게 프레임 `update(dt)` 전달, dispose 정리
 *
 * ## AI 구현체가 없을 때
 *
 * A 스택에는 `DestroyerAI` **계약만 있고 구현체가 없다.** 팩토리가
 * 연결되지 않으면 `spawn()`은 `null`을 반환하고, 호출측(GuardSpawnPort
 * 구현)이 `spawnFailed`로 보고한다 — 어댑터가 대체 AI를 만들지 않는다.
 * 구축함 AI 구현이 도착하면 `attachFactory()` 한 줄로 연결된다.
 */

import type { DestroyerAI } from '../contracts/systems';
import type {
  DestroyerAIFactory,
  GuardShipAdapterConfig,
  GuardSpawnLocation,
  GuardSpawnReason,
} from '../contracts/guard';
import type { FactionId } from '../contracts/faction';
import type { TrackingStateSource, TrackingStateView } from '../contracts/detection';
import type { GameSystem, SystemContext } from './GameSystem';

/** 스폰된 경비함 1척 — AI는 기존 구현, 나머지는 주입된 메타데이터다 */
export interface GuardShipHandle {
  readonly requestId: string;
  /** 스폰된 개체의 엔티티 id — 월드 등록·렌더 매칭의 키 */
  readonly entityId: number;
  readonly faction: FactionId;
  readonly spawnReason: GuardSpawnReason;
  readonly initialTargetEntityId: number;
  readonly displayLabelId: string;
  /**
   * 실제 스폰 위치 — 위치 전략이 결정한 값 그대로 (계약 타입 재사용).
   * 렌더의 등장 방향 표시가 **실재하는 경비함**을 가리키기 위해 필요하다
   * (추정 좌표 금지 — INT-RENDER-011 요청 승인).
   */
  readonly spawnPosition: GuardSpawnLocation;
  /** 범용 구축함 AI 인스턴스 — 어댑터는 이 객체의 판단에 개입하지 않는다 */
  readonly ai: DestroyerAI;
}

/**
 * 경비함 어댑터 겸 수명주기 컨테이너.
 *
 * `GameSystem`으로 등록되며 `update(dt)`를 스폰된 기존 AI들에게 그대로
 * 전달한다 (SystemRegistry 규약 유지 — 실행 순서 = 등록 순서, dispose 역순).
 */
export class GuardShipAdapter implements GameSystem, TrackingStateSource {
  readonly id = 'guardShipAdapter';

  private factory: DestroyerAIFactory | null;
  private readonly ships: GuardShipHandle[] = [];

  constructor(factory: DestroyerAIFactory | null = null) {
    this.factory = factory;
  }

  /** 구축함 AI 구현 도착 시 조립부가 연결한다 (미연결 = 스폰 실패, 대체 없음) */
  attachFactory(factory: DestroyerAIFactory | null): void {
    this.factory = factory;
  }

  get aiWired(): boolean {
    return this.factory !== null;
  }

  /** 스폰된 경비함 목록 (읽기 전용 — 렌더·검증용) */
  get spawnedShips(): readonly GuardShipHandle[] {
    return this.ships;
  }

  /**
   * 추적 상태 읽기 소스 (contracts/detection.ts `TrackingStateSource`) —
   * 그래픽스 추적 표시가 소비한다. AI 내부 객체를 넘기지 않는 값 스냅샷.
   */
  get trackedShips(): readonly TrackingStateView[] {
    return this.ships.map((ship) => ({
      entityId: ship.entityId,
      state: ship.ai.state,
      lastKnownPosition:
        'lastKnownPosition' in ship.ai
          ? { ...(ship.ai as { lastKnownPosition: { x: number; z: number } }).lastKnownPosition }
          : null,
    }));
  }

  /**
   * 기존 AI 인스턴스를 만들고 초기 설정을 주입한다.
   * 반환 `null` = AI 팩토리 미연결 또는 생성 실패 (호출측이 결과 코드로 변환).
   */
  spawn(requestId: string, config: GuardShipAdapterConfig): GuardShipHandle | null {
    if (!this.factory) return null;

    let ai: DestroyerAI | null;
    try {
      ai = this.factory.create(config);
    } catch (error) {
      // 내부 예외 문자열은 밖으로 흘리지 않는다 — 개발 로그에만 남긴다.
      console.error('[GuardShipAdapter] 범용 구축함 AI 생성 실패 — 스폰 취소', error);
      return null;
    }
    // 이동 포트 미연결 등으로 팩토리가 만들지 못하면 스폰하지 않는다.
    if (!ai) return null;

    // 초기 표적 주입: 기존 AI의 공식 진입점만 사용한다 (전용 추적 상태 없음).
    try {
      ai.notifyLastKnownPosition(
        config.initialTargetPosition.x,
        config.initialTargetPosition.z,
      );
    } catch (error) {
      console.error('[GuardShipAdapter] 초기 표적 주입 실패 — 스폰 취소', error);
      return null;
    }

    const handle: GuardShipHandle = {
      requestId,
      entityId: config.entityId,
      faction: config.faction,
      spawnReason: config.spawnReason,
      initialTargetEntityId: config.initialTargetEntityId,
      displayLabelId: config.displayLabelId,
      spawnPosition: config.spawnPosition,
      ai,
    };
    this.ships.push(handle);
    return handle;
  }

  initialize(_context: SystemContext): void {}

  /** 수명주기 전달만 — 판단은 전부 기존 AI 안에서 일어난다 */
  update(deltaSeconds: number): void {
    for (const ship of this.ships) ship.ai.update(deltaSeconds);
  }

  dispose(): void {
    this.ships.length = 0;
  }
}
