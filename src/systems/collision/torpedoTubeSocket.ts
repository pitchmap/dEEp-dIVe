/**
 * 어뢰 충돌 반경 — 게임플레이 충돌 판정 상수.
 *
 * ⚠ **소켓 정의는 여기 없다.** 스프린트 A 통합에서 발사관 앵커·안전
 * 오프셋·전방축의 공식 정본이 리드 창 산출물로 확정되었고, 이 파일이 갖고
 * 있던 자체 정의(`torpedoTubeAnchor` / `aimCameraSocket` /
 * `torpedoSpawnSocket` / `TORPEDO_SPAWN_SAFETY_OFFSET`)는 **삭제**됐다:
 *
 * ```
 * src/world/torpedoTubeAnchor.ts   TORPEDO_TUBE_ANCHOR (앵커·안전 오프셋 — 유일)
 * src/core/TorpedoTubeSocketRig.ts aimCameraSocket / torpedoSpawnSocket (rig)
 * ```
 *
 * 삭제 근거: 두 정의가 서로 다른 생성 거리를 만들고 있었다 — 정본은 선체
 * 중심에서 3.35m(앵커 2.8 + 안전 0.55), 구 게임플레이 정의는 4.35m
 * (2.8 + 선체 반경 1.0 + 어뢰 반경 0.35 + 여유 0.2). 조준 카메라와 어뢰가
 * 서로 다른 소켓을 쓰면 십자선과 탄도가 어긋난다(A3 위반).
 * 게임플레이·그래픽스 모두 composition root가 주입하는 **같은 rig 인스턴스**
 * 하나만 소비한다 (INTEGRATION_NOTES: 스프린트 A 소켓 정규화).
 *
 * 남은 상수는 소켓 기하가 아니라 **어뢰 자체의 충돌 크기**이므로 게임플레이
 * 소유가 맞다. 정본 앵커 주석이 안전 오프셋 산출 근거로 이 값을 인용한다.
 */

/** 어뢰 충돌 반경 (m) — 구조 상수 (선체 근사와 동급, 밸런스 수치 아님) */
export const TORPEDO_COLLISION_RADIUS = 0.35;
