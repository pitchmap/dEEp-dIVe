/**
 * 정적 충돌 월드 — 게임플레이 소유 (D+5 리뷰 스프린트 '이동·충돌').
 *
 * 범위: 통과 방지 + 밀어내기(위치 보정)까지만. 충돌 피해·이벤트는 이번
 * 범위에서 구현하지 않는다 (지시 사항 — 내구도 연동은 D6 이후 별도 결정).
 *
 * 형태: 정적 충돌체는 구(sphere)와 축 정렬 박스(AABB) 조합만 허용한다 —
 * 자체 간이 물리 원칙 [확정 §7.1: 풀 물리엔진 불필요].
 *
 * 공유 구조: `colliders`는 읽기 전용으로 노출한다 — 이후 은신 시야 차폐
 * (DetectionSystem, D10~12)가 **같은 충돌체 집합**을 시선 차단 판정에
 * 재사용한다 (별도 집합을 만들지 않는다).
 *
 * 결정성: 등록 순서·해석 순서가 고정이라 같은 입력이면 같은 결과다.
 */

export interface SphereCollider {
  kind: 'sphere';
  x: number;
  y: number;
  z: number;
  radius: number;
}

/** 축 정렬 박스 (AABB). 회전 지형은 보수적으로 감싼 AABB로 등록한다 */
export interface BoxCollider {
  kind: 'box';
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export type StaticCollider = SphereCollider | BoxCollider;

/** 잠수함 선체 근사 구 (submarineHull.ts가 생성) */
export interface HullSphere {
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface PushOffset {
  x: number;
  y: number;
  z: number;
}

/**
 * 다중 충돌체 사이 끼임을 풀기 위한 반복 해석 횟수 상한.
 * 물리 수치가 아니라 알고리즘 수렴 상수다 (밸런스 값 아님).
 */
const MAX_RESOLVE_PASSES = 4;

/** 겹침 해소 후 남기는 미세 간격 — 부동소수 재침투로 인한 떨림 방지 */
const SEPARATION_EPSILON = 1e-3;

export class CollisionWorld {
  private readonly staticColliders: StaticCollider[] = [];

  /** 읽기 전용 충돌체 집합 — 은신 시야 차폐(D10~12)가 이 집합을 재사용한다 */
  get colliders(): readonly StaticCollider[] {
    return this.staticColliders;
  }

  addSphere(x: number, y: number, z: number, radius: number): void {
    this.staticColliders.push({ kind: 'sphere', x, y, z, radius });
  }

  addBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
    this.staticColliders.push({ kind: 'box', minX, minY, minZ, maxX, maxY, maxZ });
  }

  /** 레벨 교체(정식 블록아웃 수신) 시 전체 재등록용 */
  clear(): void {
    this.staticColliders.length = 0;
  }

  /** 구가 정적 충돌체와 겹치는가 — 어뢰 등 발사체의 환경 명중 질의 */
  intersectsSphere(x: number, y: number, z: number, radius: number): boolean {
    for (const collider of this.staticColliders) {
      if (computePush(collider, x, y, z, radius)) return true;
    }
    return false;
  }

  /**
   * 선체(구 집합, 강체)를 정적 충돌체 밖으로 밀어내는 보정 오프셋을 구한다.
   * 겹침이 없으면 null. 보정은 선체 전체에 동일하게 적용된다 (강체 이동).
   */
  resolveHull(hull: readonly HullSphere[]): PushOffset | null {
    let dx = 0;
    let dy = 0;
    let dz = 0;
    let corrected = false;

    for (let pass = 0; pass < MAX_RESOLVE_PASSES; pass += 1) {
      let pushedThisPass = false;

      for (const collider of this.staticColliders) {
        for (const sphere of hull) {
          const push = computePush(collider, sphere.x + dx, sphere.y + dy, sphere.z + dz, sphere.radius);
          if (!push) continue;
          dx += push.x;
          dy += push.y;
          dz += push.z;
          pushedThisPass = true;
          corrected = true;
        }
      }

      if (!pushedThisPass) break;
    }

    return corrected ? { x: dx, y: dy, z: dz } : null;
  }
}

/** 충돌체 하나에 대한 구의 침투 해소 벡터. 겹침 없으면 null */
function computePush(
  collider: StaticCollider,
  x: number,
  y: number,
  z: number,
  radius: number,
): PushOffset | null {
  return collider.kind === 'sphere'
    ? pushFromSphere(collider, x, y, z, radius)
    : pushFromBox(collider, x, y, z, radius);
}

function pushFromSphere(
  collider: SphereCollider,
  x: number,
  y: number,
  z: number,
  radius: number,
): PushOffset | null {
  const dx = x - collider.x;
  const dy = y - collider.y;
  const dz = z - collider.z;
  const distance = Math.hypot(dx, dy, dz);
  const minDistance = collider.radius + radius;
  if (distance >= minDistance) return null;

  if (distance < 1e-9) {
    // 중심 일치(극단 케이스) — 결정적 기본 방향(+X)으로 밀어낸다
    return { x: minDistance + SEPARATION_EPSILON, y: 0, z: 0 };
  }
  const scale = (minDistance - distance + SEPARATION_EPSILON) / distance;
  return { x: dx * scale, y: dy * scale, z: dz * scale };
}

function pushFromBox(
  collider: BoxCollider,
  x: number,
  y: number,
  z: number,
  radius: number,
): PushOffset | null {
  const closestX = Math.min(Math.max(x, collider.minX), collider.maxX);
  const closestY = Math.min(Math.max(y, collider.minY), collider.maxY);
  const closestZ = Math.min(Math.max(z, collider.minZ), collider.maxZ);

  const dx = x - closestX;
  const dy = y - closestY;
  const dz = z - closestZ;
  const distance = Math.hypot(dx, dy, dz);

  if (distance > 1e-9) {
    // 중심이 박스 밖 — 표면 최근접점 기준 침투량만큼 법선 방향으로 밀어낸다
    if (distance >= radius) return null;
    const scale = (radius - distance + SEPARATION_EPSILON) / distance;
    return { x: dx * scale, y: dy * scale, z: dz * scale };
  }

  // 중심이 박스 안 — 고속 통과·끼임 케이스. 가장 얕은 면으로 탈출시켜
  // 반대편 관통과 내부 고착을 막는다 (결정적: 축 검사 순서 고정)
  const exits: Array<{ depth: number; x: number; y: number; z: number }> = [
    { depth: x - collider.minX, x: -1, y: 0, z: 0 },
    { depth: collider.maxX - x, x: 1, y: 0, z: 0 },
    { depth: y - collider.minY, x: 0, y: -1, z: 0 },
    { depth: collider.maxY - y, x: 0, y: 1, z: 0 },
    { depth: z - collider.minZ, x: 0, y: 0, z: -1 },
    { depth: collider.maxZ - z, x: 0, y: 0, z: 1 },
  ];
  let best = exits[0] as { depth: number; x: number; y: number; z: number };
  for (const exit of exits) {
    if (exit.depth < best.depth) best = exit;
  }
  const magnitude = best.depth + radius + SEPARATION_EPSILON;
  return { x: best.x * magnitude, y: best.y * magnitude, z: best.z * magnitude };
}
