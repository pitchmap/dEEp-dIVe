/**
 * ⚠ 시작 지역 임시 충돌 레이아웃 — 렌더 회색 박스 배치의 미러 (단일 소스 아님).
 *
 * 현재 협곡 배치는 렌더 파트의 `src/render/CanyonScene.ts`
 * (buildCanyonBlockout)에 시각 상수로 존재한다. 게임플레이는 렌더를 직접
 * import할 수 없으므로(EventBus 외 참조 금지) 같은 결정식(S자 수로 + 기둥
 * 3개)을 여기서 재현해 충돌체를 만든다.
 *
 * 이 중복은 임시 상태다 — 정식 레벨 블록아웃(레벨 디자인 D+5 산출물) 수신
 * 시 렌더·충돌·시야 차폐가 **하나의 레이아웃 데이터**를 소비하도록 교체를
 * INTEGRATION_NOTES INT-GAME-005로 제안해 두었다. 그 전까지 렌더 배치가
 * 바뀌면 이 파일도 함께 갱신해야 한다 (아래 수식은 CanyonScene과 1:1).
 *
 * 근사 규칙:
 *  - 벽·기둥의 미세 기울임(rotation.y ≤ 0.7rad)은 AABB로 보수적으로 감싼다
 *    (회전 박스의 수평 외접 반치수 + 여유 마진) — 시각보다 약간 두꺼운
 *    충돌은 회색 박스 검증에서 허용 오차다.
 *  - 해저 바닥은 충돌체가 아니라 수직 하한(provisionalWorld.ts)으로 처리한다.
 */

import type { CollisionWorld } from './CollisionWorld';

/* CanyonScene.buildCanyonBlockout과 동일한 결정식 상수 (시각 구도 상수) */
const FLOOR_Y = -6;
const CANYON_HALF_WIDTH = 11;
const WALL_SEGMENT_LENGTH = 11;
const WALL_SEGMENT_COUNT = 11;

/** 기울임(≤0.12rad) 무시에 대한 보수 마진 (m) */
const WALL_TILT_MARGIN = 0.3;

/** 수로 중심선: 완만한 S자 곡선 (CanyonScene.centerAt과 동일) */
function centerAt(z: number): number {
  return Math.sin(z * 0.045) * 7;
}

/** 회전된 사각 단면(반치수 hx·hz, 회전각 rot)의 수평 외접 AABB 반치수 */
function rotatedHalfExtents(hx: number, hz: number, rot: number): { hx: number; hz: number } {
  const cos = Math.abs(Math.cos(rot));
  const sin = Math.abs(Math.sin(rot));
  return { hx: hx * cos + hz * sin, hz: hz * cos + hx * sin };
}

/** 시작 지역(회색 박스 협곡)의 정적 충돌체를 등록한다 */
export function registerStartingAreaColliders(world: CollisionWorld): void {
  const halfSpan = (WALL_SEGMENT_COUNT - 1) / 2;
  const wallHalfZ = (WALL_SEGMENT_LENGTH + 1.5) / 2 + WALL_TILT_MARGIN;

  for (let i = 0; i < WALL_SEGMENT_COUNT; i += 1) {
    const z = (i - halfSpan) * WALL_SEGMENT_LENGTH;
    const center = centerAt(z);
    const heightVariation = 3 * Math.sin(i * 2.7);
    const widthVariation = 1.5 * Math.sin(i * 1.9 + 1);

    // 좌안 벽 (CanyonScene addBlock 1:1 — x중심, 폭, 높이)
    const leftWidth = 9 + widthVariation;
    const leftCenterX = center - CANYON_HALF_WIDTH - 4 + widthVariation;
    world.addBox(
      leftCenterX - leftWidth / 2 - WALL_TILT_MARGIN,
      FLOOR_Y,
      z - wallHalfZ,
      leftCenterX + leftWidth / 2 + WALL_TILT_MARGIN,
      FLOOR_Y + 15 + heightVariation,
      z + wallHalfZ,
    );

    // 우안 벽
    const rightWidth = 9 - widthVariation;
    const rightCenterX = center + CANYON_HALF_WIDTH + 4 - widthVariation;
    world.addBox(
      rightCenterX - rightWidth / 2 - WALL_TILT_MARGIN,
      FLOOR_Y,
      z - wallHalfZ,
      rightCenterX + rightWidth / 2 + WALL_TILT_MARGIN,
      FLOOR_Y + 16 - heightVariation,
      z + wallHalfZ,
    );
  }

  // 수로 안쪽 기둥 3개 — CanyonScene의 (위치, 단면, 회전) 1:1 대응.
  // 회전이 커서(≤0.7rad) 외접 AABB로 감싼다.
  const pillars: Array<{
    x: number;
    z: number;
    sizeX: number;
    sizeZ: number;
    height: number;
    rotation: number;
  }> = [
    { x: centerAt(-18) + 4, z: -18, sizeX: 3.5, sizeZ: 3.5, height: 10, rotation: 0.4 },
    { x: centerAt(2) - 5, z: 2, sizeX: 4, sizeZ: 4, height: 12, rotation: -0.25 },
    { x: centerAt(24) + 6, z: 24, sizeX: 3, sizeZ: 5, height: 9, rotation: 0.7 },
  ];
  for (const pillar of pillars) {
    const half = rotatedHalfExtents(pillar.sizeX / 2, pillar.sizeZ / 2, pillar.rotation);
    world.addBox(
      pillar.x - half.hx,
      FLOOR_Y,
      pillar.z - half.hz,
      pillar.x + half.hx,
      FLOOR_Y + pillar.height,
      pillar.z + half.hz,
    );
  }
}
