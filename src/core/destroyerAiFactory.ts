/**
 * production `DestroyerAIFactory` (INT-CORE-013).
 *
 * 경비함 스폰이 실제 개체를 만들려면 두 조각이 필요하다:
 *  ① **범용 AI 판단** — `DestroyerAIController` (리드 소유, 이 저장소의 유일
 *     production `DestroyerAI` 구현체)
 *  ② **실제 이동** — `SurfaceShipMotionPort` (게임플레이 소유, 선박 transform의
 *     주인). 리드는 계약만 제공하고 구현하지 않는다.
 *
 * 이 팩토리는 ②를 만들어 주는 게임플레이 측 팩토리를 받아 ①에 주입한다.
 * 이동 포트를 만들 수 없으면 `null`을 반환하고, 호출측(GuardShipAdapter →
 * GuardSpawnPort)이 `spawnFailed`로 보고한다 — 대체 AI·가짜 이동을 만들지
 * 않는다.
 *
 * 검증 더블(테스트용 AI/포트)은 이 경로에 들어오지 않는다: production
 * 조립은 이 파일의 팩토리만 쓰고, 테스트는 각자의 더블을 직접 만든다.
 */

import type {
  DestroyerAIFactory,
  GuardShipAdapterConfig,
  SurfaceShipMotionPortFactory,
} from '../contracts/guard';
import type { DestroyerAI } from '../contracts/systems';
import { DestroyerAIController } from './DestroyerAIController';

/**
 * 범용 구축함 AI 팩토리 생성.
 *
 * 경비함(patrol)·일반 적대 구축함(hostile) 모두 이 팩토리를 쓴다 —
 * 세력·초기 표적·스폰 위치만 다르고 판단 구현은 같다.
 */
export function createProductionDestroyerAIFactory(
  motionPorts: SurfaceShipMotionPortFactory,
): DestroyerAIFactory {
  return {
    create(config: GuardShipAdapterConfig): DestroyerAI | null {
      const motion = motionPorts.create(config);
      if (!motion) return null;
      return new DestroyerAIController({
        entityId: config.entityId,
        faction: config.faction,
        initialTargetEntityId: config.initialTargetEntityId,
        // 사건 지점 = 최초의 마지막 확인 위치 (경비함이면 중립 피격 지점)
        lastKnownPosition: config.initialTargetPosition,
        motion,
        // 초기 표적을 알고 스폰되므로 경계 태세로 시작한다.
        initialState: 'alert',
      });
    },
  };
}
