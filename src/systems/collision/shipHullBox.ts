/**
 * 함선 선체 박스 근사 — 어뢰 명중 판정과 잠수함-함선 충돌이 **공유하는
 * 단일 충돌체 데이터** (5차 대회의 결의 1).
 *
 * 규칙:
 *  - 함선(화물선·경비함 등)은 요 회전(heading) 1개를 가진 박스로 근사한다.
 *    로컬 -Z = 선수 규약(conventions)과 동일 — halfLengthZ가 선수·선미 방향.
 *  - 같은 서술(ShipHullBox) + 같은 판정 함수를 어뢰(교차 질의)와
 *    잠수함(밀어냄 벡터)이 함께 소비한다 — 판정 이중화 금지.
 *  - 잠수함-함선 충돌은 통과 방지·밀어냄까지만 (피해 없음 — 결의 1).
 */

import type { PushOffset } from './CollisionWorld';

/** 함선 1척의 선체 박스 치수 (함선 로컬 기준, 포즈와 분리) */
export interface ShipHullBox {
  /** 좌우 반폭 (로컬 X) */
  readonly halfBeamX: number;
  /** 선수·선미 반길이 (로컬 Z) */
  readonly halfLengthZ: number;
  /** 선체 하단 월드 Y (흘수선 − 흘수) */
  readonly bottomY: number;
  /** 선체 상단 월드 Y */
  readonly topY: number;
}

/** 함선 포즈 (수평면 위치 + 요 각) — CargoShipStateSource 부분집합 */
export interface ShipPose {
  readonly positionX: number;
  readonly positionZ: number;
  readonly headingRadians: number;
}

/** 겹침 해소 후 남기는 미세 간격 (CollisionWorld와 동일 원칙 — 떨림 방지) */
const SEPARATION_EPSILON = 1e-3;

/** 월드 XZ 오프셋을 함선 로컬 XZ로 회전 (요 h의 역회전) */
function worldToLocalXZ(
  dx: number,
  dz: number,
  headingRadians: number,
): { x: number; z: number } {
  const cos = Math.cos(headingRadians);
  const sin = Math.sin(headingRadians);
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

/** 함선 로컬 XZ 벡터를 월드 XZ로 회전 */
function localToWorldXZ(
  lx: number,
  lz: number,
  headingRadians: number,
): { x: number; z: number } {
  const cos = Math.cos(headingRadians);
  const sin = Math.sin(headingRadians);
  return { x: lx * cos + lz * sin, z: -lx * sin + lz * cos };
}

/**
 * 구(어뢰·잠수함 선체 근사)가 함선 박스와 겹치는가 — 어뢰 명중 질의.
 * 판정 기준은 push 계산과 동일 (공유 데이터·공유 규칙).
 */
export function sphereIntersectsShipBox(
  box: ShipHullBox,
  pose: ShipPose,
  x: number,
  y: number,
  z: number,
  radius: number,
): boolean {
  return computeShipBoxPush(box, pose, x, y, z, radius) !== null;
}

/**
 * 구를 함선 박스 밖으로 밀어내는 보정 벡터. 겹침 없으면 null.
 * 잠수함-함선 충돌(통과 방지·밀어냄)의 판정 본체 — 함선은 밀리지 않는다.
 */
export function computeShipBoxPush(
  box: ShipHullBox,
  pose: ShipPose,
  x: number,
  y: number,
  z: number,
  radius: number,
): PushOffset | null {
  const local = worldToLocalXZ(x - pose.positionX, z - pose.positionZ, pose.headingRadians);

  const closestX = Math.min(Math.max(local.x, -box.halfBeamX), box.halfBeamX);
  const closestY = Math.min(Math.max(y, box.bottomY), box.topY);
  const closestZ = Math.min(Math.max(local.z, -box.halfLengthZ), box.halfLengthZ);

  const dx = local.x - closestX;
  const dy = y - closestY;
  const dz = local.z - closestZ;
  const distance = Math.hypot(dx, dy, dz);

  if (distance > 1e-9) {
    // 중심이 박스 밖 — 최근접점 법선 방향으로 밀어낸다
    if (distance >= radius) return null;
    const scale = (radius - distance + SEPARATION_EPSILON) / distance;
    const world = localToWorldXZ(dx * scale, dz * scale, pose.headingRadians);
    return { x: world.x, y: dy * scale, z: world.z };
  }

  // 중심이 박스 안 — 가장 얕은 면으로 탈출 (관통·끼임 방지, 축 순서 고정)
  const exits: Array<{ depth: number; lx: number; ly: number; lz: number }> = [
    { depth: local.x + box.halfBeamX, lx: -1, ly: 0, lz: 0 },
    { depth: box.halfBeamX - local.x, lx: 1, ly: 0, lz: 0 },
    { depth: y - box.bottomY, lx: 0, ly: -1, lz: 0 },
    { depth: box.topY - y, lx: 0, ly: 1, lz: 0 },
    { depth: local.z + box.halfLengthZ, lx: 0, ly: 0, lz: -1 },
    { depth: box.halfLengthZ - local.z, lx: 0, ly: 0, lz: 1 },
  ];
  let best = exits[0] as { depth: number; lx: number; ly: number; lz: number };
  for (const exit of exits) {
    if (exit.depth < best.depth) best = exit;
  }
  const magnitude = best.depth + radius + SEPARATION_EPSILON;
  const world = localToWorldXZ(best.lx * magnitude, best.lz * magnitude, pose.headingRadians);
  return { x: world.x, y: best.ly * magnitude, z: world.z };
}
