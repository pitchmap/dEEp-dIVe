/**
 * 선수 발사관 소켓 — 조준 카메라와 어뢰 생성이 공유하는 **단일 기하 출처**.
 *
 * 13차 소회의 결의 2 규격:
 * ```
 * torpedoTubeAnchor        (모델 정의, 단일 진실 공급원)
 *  ├─ aimCameraSocket      (앵커 정위치·동일 전방축)
 *  └─ torpedoSpawnSocket   (동일 전방축 + 고정 전방 안전 오프셋)
 * ```
 * - 두 소켓은 같은 앵커·같은 전방축(= 조준 전방 벡터)을 공유한다.
 * - **안전 오프셋은 이 소켓 정의 한 곳에만 존재한다** — 카메라 시스템도
 *   어뢰 시스템도 자기 오프셋을 계산하지 않고 읽기만 한다(시스템별 개별
 *   계산 금지). 오프셋 0은 근접 클리핑·자기 충돌 사고를 부르므로 금지.
 *
 * ⚠ 소유권 주의: 앵커·소켓의 **공식 계약은 개발 리드 창(창 1) 산출물**이며
 * 아직 저장소에 없다. 이 모듈은 리드 계약이 도착하기 전까지의 소비 지점이자
 * 단일 정의 지점이며, 새 수치를 만들지 않고 기존 공유 선체 기하
 * (`submarineHull`)에서 **파생**한다. 리드의 `torpedoSpawnSocket`이 오면
 * 이 파일은 그 계약을 읽어 반환하는 어댑터로 축소되거나 삭제된다
 * (요청: INTEGRATION_NOTES INT-GAME-009).
 */

import type { AimForward } from '../aimGeometry';
import { SUBMARINE_HULL_HALF_LENGTH, SUBMARINE_HULL_RADIUS } from './submarineHull';

/** 어뢰 충돌 반경 (m) — 구조 상수 (선체 근사와 동급, 밸런스 수치 아님) */
export const TORPEDO_COLLISION_RADIUS = 0.35;

/**
 * 발사관 앵커의 축 방향 위치 — 선체 중심에서 선수 쪽으로 반길이만큼.
 * (모델 앵커가 도착하면 이 파생값을 앵커 좌표로 교체한다)
 */
const ANCHOR_AXIAL_OFFSET = SUBMARINE_HULL_HALF_LENGTH;

/**
 * 고정 전방 안전 오프셋 — **단일 정의 지점**.
 * 앵커(선수 표면)에서 이만큼 더 나간 곳에서 어뢰가 생성된다:
 * 선체 근사 구 반경 + 어뢰 반경 + 여유. 이 합이 자기 충돌·근접 클리핑을
 * 동시에 막는다(어뢰 표면과 선체 표면 사이에 여유가 남는다).
 */
export const TORPEDO_SPAWN_SAFETY_OFFSET =
  SUBMARINE_HULL_RADIUS + TORPEDO_COLLISION_RADIUS + 0.2;

/** 소켓이 요구하는 최소 포즈 (읽기 전용) */
export interface TubeAnchorPose {
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
}

export interface SocketPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * `torpedoTubeAnchor` — 선수 발사관 앵커 위치.
 * 조준 전방축을 따라 선체 중심에서 선수 표면까지 이동한 지점.
 */
export function torpedoTubeAnchor(pose: TubeAnchorPose, forward: AimForward): SocketPoint {
  return {
    x: pose.positionX + forward.x * ANCHOR_AXIAL_OFFSET,
    y: pose.positionY + forward.y * ANCHOR_AXIAL_OFFSET,
    z: pose.positionZ + forward.z * ANCHOR_AXIAL_OFFSET,
  };
}

/**
 * `aimCameraSocket` — 조준 카메라 위치. 앵커 정위치(오프셋 없음)이며
 * 전방축은 조준 전방 벡터와 동일하다. 렌더 카메라는 이 값을 읽기만 한다.
 */
export function aimCameraSocket(pose: TubeAnchorPose, forward: AimForward): SocketPoint {
  return torpedoTubeAnchor(pose, forward);
}

/**
 * `torpedoSpawnSocket` — 어뢰 생성 위치. 앵커 + **고정 안전 오프셋**(전방).
 * TorpedoSystem은 이 함수만 호출하고 자체 오프셋 숫자를 갖지 않는다.
 */
export function torpedoSpawnSocket(pose: TubeAnchorPose, forward: AimForward): SocketPoint {
  const anchor = torpedoTubeAnchor(pose, forward);
  return {
    x: anchor.x + forward.x * TORPEDO_SPAWN_SAFETY_OFFSET,
    y: anchor.y + forward.y * TORPEDO_SPAWN_SAFETY_OFFSET,
    z: anchor.z + forward.z * TORPEDO_SPAWN_SAFETY_OFFSET,
  };
}
