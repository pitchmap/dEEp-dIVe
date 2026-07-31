/**
 * 협곡 레이아웃 → 충돌체 변환 — 공유 CanyonLayout 소비 (INT-CORE-004).
 *
 * 배치의 유일한 소스는 `src/world/startingCanyonLayout.ts`(리드 승인 공용
 * 데이터)다. 이 모듈은 **자체 좌표·높이 수식을 만들지 않는다** — 주입받은
 * `CanyonLayout.blocks`를 순회해 충돌체로 해석만 한다. 렌더(CanyonScene)는
 * 같은 blocks를 메시로 해석하므로 렌더-충돌 배치가 항상 일치한다
 * (구 미러 중복과 '보이지 않는 벽' 문제 소멸).
 *
 * 근사 규칙 (소비측 소유 — 리드 결정):
 *  - 블록은 Y축 요 회전 1개를 가진 박스다. 충돌은 회전 박스를 수평
 *    외접 AABB로 보수적으로 감싼다 — 시각보다 약간 두꺼운 충돌은 회색 박스
 *    검증에서 허용 오차다 (계약 layout.ts 배치 규약 참조).
 *  - 블록 바닥은 layout.floorY에 놓인다 (계약 규약: 중심 Y = floorY + sizeY/2).
 *  - 해저 바닥·수면은 충돌체가 아니라 수직 한계(provisionalWorld.ts —
 *    공유 레이아웃에서 파생)로 처리한다.
 */

import type { CanyonBlockDescriptor, CanyonLayout } from '../../contracts/layout';
import type { CollisionWorld } from './CollisionWorld';

/** 회전된 사각 단면(반치수 hx·hz, 요 회전 rot)의 수평 외접 AABB 반치수 */
function rotatedHalfExtents(
  block: CanyonBlockDescriptor,
): { hx: number; hz: number } {
  const hx = block.sizeX / 2;
  const hz = block.sizeZ / 2;
  const cos = Math.abs(Math.cos(block.rotationY));
  const sin = Math.abs(Math.sin(block.rotationY));
  return { hx: hx * cos + hz * sin, hz: hz * cos + hx * sin };
}

/**
 * 공유 레이아웃의 블록 전체를 정적 충돌체로 등록한다.
 * 블록 1개 = 충돌체(AABB) 1개 — 순서·개수 1:1 (검증 대상).
 */
export function registerStartingAreaColliders(world: CollisionWorld, layout: CanyonLayout): void {
  for (const block of layout.blocks) {
    const half = rotatedHalfExtents(block);
    world.addBox(
      block.x - half.hx,
      layout.floorY,
      block.z - half.hz,
      block.x + half.hx,
      layout.floorY + block.sizeY,
      block.z + half.hz,
    );
  }
}

/** 블록 1개가 만드는 충돌 AABB (검증·디버깅용 — 등록 로직과 동일 규칙) */
export function blockToColliderBounds(
  block: CanyonBlockDescriptor,
  floorY: number,
): { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } {
  const half = rotatedHalfExtents(block);
  return {
    minX: block.x - half.hx,
    minY: floorY,
    minZ: block.z - half.hz,
    maxX: block.x + half.hx,
    maxY: floorY + block.sizeY,
    maxZ: block.z + half.hz,
  };
}
