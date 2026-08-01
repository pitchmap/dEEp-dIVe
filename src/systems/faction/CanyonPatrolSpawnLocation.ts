/**
 * 경비 스폰 위치 전략 — 계약 `GuardSpawnLocationStrategy` 구현 (B4).
 *
 * 파일·클래스 이름이 `Patrol`인 이유: 'guard'는 **스폰 절차**의 이름이고
 * 스폰되는 개체의 세력은 언제나 `patrol`이다 (contracts/faction.ts 정본).
 * 이 파일은 그 개체가 **어디에 들어올지**만 고르며 AI 판단 로직은 없다.
 *
 * ## 규칙 (작업 지시 그대로)
 *
 *  - 플레이어 선체 내부 스폰 금지
 *  - 중립 사건 위치 바로 위 중첩 금지
 *  - 지형 내부 스폰 금지 (정적 충돌 월드 질의)
 *  - 플레이어가 볼 수 있는 월드 범위 안
 *  - 가능하면 화면 밖 또는 적절한 거리에서 진입
 *  - 후보를 찾지 못하면 **null** → 호출측이 `noSpawnLocation`으로 보고한다.
 *    원점·플레이어 위치를 무조건 반환하지 않는다.
 *
 * ## 수치를 만들지 않는다
 *
 * 경비함 전용 거리 params가 **아직 없다**(`params/`에 guard 항목 없음).
 * 임의의 안전거리를 발명하는 대신 **이미 존재하는 판정 값에서만** 파생한다:
 *
 *  | 파생 값 | 출처 (기존) |
 *  |---|---|
 *  | 가시 범위 상한 | 어뢰 유효 사거리 (`TorpedoRangeSource`) |
 *  | 최소 진입 거리 | 같은 사거리의 절반 — 사거리 안이되 즉시 교전 거리는 아닌 지점 |
 *  | 사건 지점 회피 반경 | 선박 명중 판정 반경 (`hitRadius` — 공식 cargo params) |
 *  | 플레이어 회피 반경 | 잠수함 선체 반경 (`SUBMARINE_HULL_RADIUS` — 충돌 정본) |
 *  | 지형 판정 | `CollisionWorld.intersectsSphere` (기존 어뢰 환경 명중 질의) |
 *  | 수면 높이 | 공유 `CanyonLayout.seaSurfaceY` |
 *
 * 절반(0.5)·후보 개수는 **밸런스 수치가 아니라 탐색 알고리즘 상수**이며,
 * 공식 params가 오면 `attachGuardSpawnParams`로 전부 대체된다 (INT-GAME-012).
 *
 * ## 하지 않는 것
 *
 * 경비함 AI·추적·탐지 수치를 만들지 않는다. 이 파일은 **좌표 하나**를
 * 고르는 순수 탐색이며 상태를 갖지 않는다 (결정적 — 같은 입력 = 같은 결과).
 */

import type {
  GuardShipRequestPayload,
  GuardSpawnLocation,
  GuardSpawnLocationStrategy,
} from '../../contracts/guard';
import type { CanyonLayout } from '../../contracts/layout';
import { isWithinCanyonBounds, type CanyonHorizontalBounds } from '../collision/canyonBounds';
import type { CollisionWorld } from '../collision/CollisionWorld';
import { SUBMARINE_HULL_RADIUS } from '../collision/submarineHull';

/**
 * 후보 방위 개수 — 사건 지점 둘레를 균등 분할해 훑는다.
 * 탐색 해상도이며 밸런스 수치가 아니다 (결정성·비용의 절충).
 */
const CANDIDATE_BEARINGS = 12;

/** 진입 거리 후보 배수 — 가시 범위 상한에 곱해 먼 쪽부터 시도한다 */
const DISTANCE_FRACTIONS = [1, 0.75, 0.5] as const;

/** 공식 경비 스폰 params가 도착하면 주입될 자리 (현재 공식 값 없음) */
export interface GuardSpawnParams {
  /** 플레이어·사건 지점에서 유지할 최소 거리 (m) */
  readonly minimumSafeDistanceMeters: number;
  /** 스폰 가능한 최대 거리 (m) — 플레이어가 볼 수 있는 범위 상한 */
  readonly maximumSpawnDistanceMeters: number;
}

/** 유효 사거리 공급 단면 — 어뢰 시스템이 충족 (거리를 여기서 정의하지 않는다) */
export interface GuardRangeSource {
  readonly maxRangeMeters: number;
}

/** 관측자(플레이어) 위치 단면 */
export interface GuardObserverView {
  readonly positionX: number;
  readonly positionZ: number;
}

/** 사건 지점 회피 반경 공급 — 공식 cargo params의 명중 반경을 재사용 */
export interface IncidentClearanceSource {
  readonly hitRadius: number;
}

export class CanyonPatrolSpawnLocation implements GuardSpawnLocationStrategy {
  private readonly observer: GuardObserverView;
  private readonly collision: CollisionWorld;
  private readonly layout: CanyonLayout;
  private readonly range: GuardRangeSource;
  private readonly clearance: IncidentClearanceSource;
  /** 월드 수평 경계 — 함대와 **같은 인스턴스**를 주입받는다 */
  private readonly bounds: CanyonHorizontalBounds | null;
  private params: GuardSpawnParams | null = null;

  constructor(
    observer: GuardObserverView,
    collision: CollisionWorld,
    layout: CanyonLayout,
    range: GuardRangeSource,
    clearance: IncidentClearanceSource,
    bounds: CanyonHorizontalBounds | null = null,
  ) {
    this.observer = observer;
    this.collision = collision;
    this.layout = layout;
    this.range = range;
    this.clearance = clearance;
    this.bounds = bounds;
  }

  /** 공식 경비 스폰 params 주입 (도착 시 조립부가 연결) */
  attachGuardSpawnParams(params: GuardSpawnParams | null): void {
    this.params = params;
  }

  get guardSpawnParamsWired(): boolean {
    return this.params !== null;
  }

  /** 스폰 가능 최대 거리 — 공식 값이 없으면 어뢰 유효 사거리(가시 범위 대용) */
  get maximumSpawnDistanceMeters(): number {
    return this.params?.maximumSpawnDistanceMeters ?? this.range.maxRangeMeters;
  }

  /**
   * 최소 안전거리 — 공식 값이 없으면 가시 범위 상한의 절반.
   * 사거리 안(플레이어가 볼 수 있는 범위)이되 즉시 교전 거리는 아니다.
   */
  get minimumSafeDistanceMeters(): number {
    return this.params?.minimumSafeDistanceMeters ?? this.maximumSpawnDistanceMeters * 0.5;
  }

  /**
   * 사건 지점 둘레에서 조건을 만족하는 첫 후보를 반환한다.
   * 조건을 만족하는 후보가 없으면 `null` — 임의 좌표를 만들지 않는다.
   */
  resolve(request: GuardShipRequestPayload): GuardSpawnLocation | null {
    const incident = request.incidentPosition;
    if (!Number.isFinite(incident.x) || !Number.isFinite(incident.z)) return null;

    const maxDistance = this.maximumSpawnDistanceMeters;
    const minDistance = this.minimumSafeDistanceMeters;
    if (!(maxDistance > 0) || minDistance > maxDistance) return null;

    // 경비함은 수면 함정이다 — 지형 판정 높이는 공유 레이아웃의 해수면.
    const surfaceY = this.layout.seaSurfaceY;
    // 사건 지점 바로 위 중첩 금지 — 선박 명중 반경만큼은 떨어진다.
    const incidentClearance = Math.max(this.clearance.hitRadius, 0);
    // 플레이어 선체 내부 금지 — 선체 반경 + 사건 회피 반경만큼 떨어진다.
    const playerClearance = SUBMARINE_HULL_RADIUS + incidentClearance;

    for (const fraction of DISTANCE_FRACTIONS) {
      const distance = maxDistance * fraction;
      if (distance < minDistance) continue;
      for (let index = 0; index < CANDIDATE_BEARINGS; index += 1) {
        const bearing = (index / CANDIDATE_BEARINGS) * Math.PI * 2;
        const x = incident.x + Math.cos(bearing) * distance;
        const z = incident.z + Math.sin(bearing) * distance;

        // 월드 범위 밖은 후보가 아니다 — 경계는 조립점이 준 단일 인스턴스다.
        if (!isWithinCanyonBounds(this.bounds, x, z)) continue;
        if (horizontalDistance(x, z, incident.x, incident.z) < incidentClearance) continue;
        if (
          horizontalDistance(x, z, this.observer.positionX, this.observer.positionZ) <
          playerClearance
        ) {
          continue;
        }
        // 플레이어가 볼 수 있는 범위 안 — 가시 범위 상한 초과 금지.
        if (
          horizontalDistance(x, z, this.observer.positionX, this.observer.positionZ) > maxDistance
        ) {
          continue;
        }
        // 지형 내부 금지 — 어뢰 환경 명중과 같은 정적 충돌 질의를 쓴다.
        if (this.collision.intersectsSphere(x, surfaceY, z, incidentClearance)) continue;

        return {
          x,
          z,
          // 선수는 사건 지점을 향한다 — 선수 벡터 (-sin h, -cos h) 규약.
          headingRadians: Math.atan2(-(incident.x - x), -(incident.z - z)),
        };
      }
    }
    return null;
  }
}

function horizontalDistance(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}
