/**
 * 협곡 월드 수평 경계 — 공유 `CanyonLayout`에서 **파생**한다 (새 수치 없음).
 *
 * 계약 `CanyonLayout`에는 명시적 월드 경계 필드가 없다. 임의의 맵 크기를
 * 발명하는 대신, 이미 렌더·충돌이 공유하는 블록 배치의 외곽 AABB를 그대로
 * 경계로 쓴다 — 협곡 벽이 곧 월드의 가장자리이므로 별도 데이터가 필요 없다.
 *
 * 계산은 기존 `blockToColliderBounds`(회전 블록의 외접 근사)를 재사용한다.
 * 좌표 규약·회전 해석이 충돌체와 완전히 같아야 하기 때문이다 (규칙 복제 금지).
 *
 * 블록이 하나도 없으면 `null` — 경계를 만들어 내지 않는다. 소비측은 그때
 * '경계 판정 없음'으로 처리한다(0 크기 월드를 가정하지 않는다).
 */

import type { CanyonLayout } from '../../contracts/layout';
import { blockToColliderBounds } from './startingArea';

/** 수평면 월드 경계 (Y는 레이아웃의 floorY~seaSurfaceY가 이미 정의한다) */
export interface CanyonHorizontalBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * 블록 배치 외곽 AABB — 레이아웃당 결과가 고정이라 조립 시 1회 계산하면 된다.
 *
 * `includePoints`로 **공식 선박 항로 끝점**을 함께 넘긴다. 협곡 블록만으로
 * 경계를 잡으면 공식 화물선 항로(수면 위, 협곡 벽 바깥)가 경계 밖으로
 * 판정돼 실제 월드보다 좁아지기 때문이다. 두 소스 모두 이미 존재하는
 * 공식·공유 데이터이며 여기서 새 크기를 만들지 않는다.
 */
export function canyonHorizontalBounds(
  layout: CanyonLayout,
  includePoints: readonly { readonly x: number; readonly z: number }[] = [],
): CanyonHorizontalBounds | null {
  if (layout.blocks.length === 0 && includePoints.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const block of layout.blocks) {
    const bounds = blockToColliderBounds(block, layout.floorY);
    if (bounds.minX < minX) minX = bounds.minX;
    if (bounds.maxX > maxX) maxX = bounds.maxX;
    if (bounds.minZ < minZ) minZ = bounds.minZ;
    if (bounds.maxZ > maxZ) maxZ = bounds.maxZ;
  }
  for (const point of includePoints) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return null;
  return Object.freeze({ minX, maxX, minZ, maxZ });
}

/** 수평 경계 안인가 — 경계가 없으면(블록 0) 판정하지 않고 true */
export function isWithinCanyonBounds(
  bounds: CanyonHorizontalBounds | null,
  x: number,
  z: number,
): boolean {
  if (!bounds) return true;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}
