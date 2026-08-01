/**
 * 선수 발사관 앵커 — **단일 진실 공급원** (7차 결의 1-①·② + 13차 결의 2).
 *
 *  torpedoTubeAnchor (이 파일)
 *   ├─ aimCameraSocket    앵커 정위치 · 동일 전방축
 *   └─ torpedoSpawnSocket 동일 전방축 + 아래 고정 안전 오프셋
 *
 * 규칙:
 *  - 조준 카메라와 어뢰 생성이 이 앵커의 동일 좌표계·동일 전방축(선수,
 *    conventions LOCAL_BOW)을 공유한다. **카메라 시스템·어뢰 시스템이 각자
 *    숫자 오프셋을 계산하는 것 금지** — 소켓(core/TorpedoTubeSocketRig)을
 *    읽기만 한다.
 *  - 안전 오프셋은 여기 **한 곳에만** 존재한다: 어뢰가 카메라 근접 평면을
 *    자르거나(화면 번쩍임) 자기 선체와 겹쳐 생성되는 것을 막는 고정 전방
 *    거리다. 렌더·게임플레이 어느 쪽도 이 값을 복제하지 않는다.
 *
 * 수치 정합 (기존 동작 보존 — 밸런스 수치 아님, 기하 상수):
 *  - localZ = -2.8: 선수 끝. 충돌 모델(collision/submarineHull
 *    SUBMARINE_HULL_HALF_LENGTH = 2.8)·렌더 대체 모델 반길이와 일치해야
 *    한다. 모델 교체(D+8 정식 모델) 시 이 값만 갱신한다.
 *  - 안전 오프셋 0.55 = 어뢰 충돌 반경 0.35 + 근접 여유 0.2 — 구
 *    StraightRunTorpedoSystem SPAWN_OFFSET_METERS(반길이+반경+여유)와 동일한
 *    최종 생성 거리(중심에서 3.35m)를 만든다. 게임플레이는 자체 오프셋
 *    상수를 삭제하고 torpedoSpawnSocket을 소비한다.
 *
 * 이 파일은 공용 데이터 모듈(src/world)로 공통 보호에 준한다 — 수정은 리드
 * 승인 경유, 로직 추가 금지.
 */

export const TORPEDO_TUBE_ANCHOR = Object.freeze({
  /** 잠수함 로컬 앵커 위치 — 선수 끝 (로컬 -Z = 선수, conventions 규약) */
  localX: 0,
  localY: 0,
  localZ: -2.8,
  /** 어뢰 생성 소켓의 고정 전방 안전 오프셋 (m) — 유일한 정의 지점 */
  spawnForwardSafetyOffsetMeters: 0.55,
});
