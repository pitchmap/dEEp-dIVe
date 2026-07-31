/**
 * 어뢰 — contracts/systems.ts `TorpedoSystem` 구현 (§5.8~5.10).
 *
 * 규칙:
 *  - 발사 지점: 선수(-Z, conventions.bowDirectionXZ) 앞 — 프로펠러(선미)의
 *    반대편. 발사 순간의 잠수함 높이에서 수평 직선 주행한다.
 *  - fire()가 유일한 발사 로직이다 — 입력 소스(마우스·HUD 버튼)와 무관하게
 *    AimSystem.fireTorpedo()가 이 메서드 하나를 호출한다 (INT-CORE-002:
 *    별도 전투 시스템 금지). 잔량 0·재장전 중이면 false (throw 금지 — 계약).
 *  - 발사 성공 시 `torpedoFired { originX, originZ }` 발행 — 발사 지점
 *    무조건 노출 규칙(§5.10)의 입력. 탐지 시스템(D10~12)이 구독한다.
 *  - 명중: ① 표적(TargetRegistry — 수상함 가정, 수평면 XZ 판정): 어뢰 1발당
 *    정확히 1회 onTorpedoHit 통지 후 즉시 제거 (중복 명중 없음)
 *    ② 환경(CollisionWorld 공유 집합, 3D 판정): 즉시 제거
 *  - 최대 사거리 초과 시 제거 (빗나간 어뢰 정리). 수치는 임시값
 *    (provisionalCombat.ts — 이관 요청 INT-GAME-006).
 *  - 재장전·보유량은 params/combat.json (torpedoReloadSeconds·torpedoCapacity).
 *  - delta time 기반 — dt≤0·비유한값 무시.
 */

import type { CombatParams } from '../contracts/params';
import type { TorpedoSystem } from '../contracts/systems';
import type { EventBus } from '../core/EventBus';
import { bowDirectionXZ } from '../core/conventions';
import type { CollisionWorld } from './collision/CollisionWorld';
import { SUBMARINE_HULL_HALF_LENGTH } from './collision/submarineHull';
import {
  PROVISIONAL_TORPEDO_MAX_RANGE_METERS,
  PROVISIONAL_TORPEDO_SPEED_MPS,
} from './provisionalCombat';
import type { TargetRegistry } from './TargetRegistry';

/** 어뢰 충돌 반경 (m) — 구조 상수 (선체 근사와 동급, 밸런스 수치 아님) */
const TORPEDO_COLLISION_RADIUS = 0.35;

/** 선수 표면과 어뢰 생성점 사이 여유 — 자함 선체와 즉시 겹치지 않게 */
const BOW_CLEARANCE = 0.2;

/** 발사 지점 오프셋: 선체 반길이 + 어뢰 반경 + 여유 (선수 방향) */
const SPAWN_OFFSET_METERS =
  SUBMARINE_HULL_HALF_LENGTH + TORPEDO_COLLISION_RADIUS + BOW_CLEARANCE;

/** 발사 시점 포즈 읽기 전용 원천 — SubmarinePlayerController가 충족 */
export interface TorpedoLaunchPose {
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly headingRadians: number;
}

/** 주행 중 어뢰의 읽기 전용 상태 — 렌더(항적·모델)·검증이 소비 */
export interface TorpedoSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly directionX: number;
  readonly directionZ: number;
  readonly traveledMeters: number;
}

interface ActiveTorpedo {
  id: number;
  x: number;
  y: number;
  z: number;
  directionX: number;
  directionZ: number;
  traveledMeters: number;
}

export class StraightRunTorpedoSystem implements TorpedoSystem {
  private ammo: number;
  private reloadSeconds: number;
  private reloadTimer = 0;
  private nextTorpedoId = 1;
  private active: ActiveTorpedo[] = [];

  // 생성자 매개변수 프로퍼티 미사용 — 검증 러너(run.mjs)의 Node 타입
  // 스트리핑 호환(삭제 가능 문법만)을 위해 명시적 필드로 둔다.
  private readonly bus: EventBus;
  private readonly pose: TorpedoLaunchPose;
  private readonly environment: CollisionWorld;
  private readonly targets: TargetRegistry;

  constructor(
    bus: EventBus,
    combat: CombatParams,
    pose: TorpedoLaunchPose,
    environment: CollisionWorld,
    targets: TargetRegistry,
  ) {
    this.bus = bus;
    this.pose = pose;
    this.environment = environment;
    this.targets = targets;
    this.ammo = combat.torpedoCapacity.value;
    this.reloadSeconds = combat.torpedoReloadSeconds.value;
  }

  /** 검증 완료된 전투 파라미터 재적용 (개발 모드 핫리로드 전용) */
  applyCombatParams(combat: CombatParams): void {
    this.reloadSeconds = combat.torpedoReloadSeconds.value;
    this.reloadTimer = Math.min(this.reloadTimer, this.reloadSeconds);
  }

  get remaining(): number {
    return this.ammo;
  }

  get reloadRemainingSeconds(): number {
    return this.reloadTimer;
  }

  /** 주행 중 어뢰 읽기 전용 목록 (렌더 항적·검증용) */
  get torpedoes(): readonly TorpedoSnapshot[] {
    return this.active;
  }

  /** 어뢰 속력 (m/s) — 리드샷 보조선의 리드 지점 계산 입력 */
  get torpedoSpeedMetersPerSecond(): number {
    return PROVISIONAL_TORPEDO_SPEED_MPS;
  }

  /**
   * 발사 — 유일한 발사 로직 (모든 입력 소스가 이 경로 하나로 수렴).
   * 한 번 호출 = 최대 1발. 성공 시 torpedoFired 발행.
   */
  fire(): boolean {
    if (this.ammo <= 0 || this.reloadTimer > 0) return false;

    this.ammo -= 1;
    if (this.ammo > 0) this.reloadTimer = this.reloadSeconds;

    const direction = bowDirectionXZ(this.pose.headingRadians);
    const torpedo: ActiveTorpedo = {
      id: this.nextTorpedoId,
      x: this.pose.positionX + direction.x * SPAWN_OFFSET_METERS,
      y: this.pose.positionY,
      z: this.pose.positionZ + direction.z * SPAWN_OFFSET_METERS,
      directionX: direction.x,
      directionZ: direction.z,
      traveledMeters: 0,
    };
    this.nextTorpedoId += 1;
    this.active.push(torpedo);

    this.bus.emit('torpedoFired', { originX: torpedo.x, originZ: torpedo.z });
    return true;
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - deltaSeconds);
    }
    if (this.active.length === 0) return;

    const step = PROVISIONAL_TORPEDO_SPEED_MPS * deltaSeconds;
    const survivors: ActiveTorpedo[] = [];
    for (const torpedo of this.active) {
      torpedo.x += torpedo.directionX * step;
      torpedo.z += torpedo.directionZ * step;
      torpedo.traveledMeters += step;

      // 명중·소멸 판정 — 각 어뢰는 아래 중 정확히 하나로만 소비된다
      if (this.tryHitTarget(torpedo)) continue; // 함선 명중 (1회 통지 후 제거)
      if (
        this.environment.intersectsSphere(
          torpedo.x,
          torpedo.y,
          torpedo.z,
          TORPEDO_COLLISION_RADIUS,
        )
      ) {
        continue; // 환경(지형) 명중 — 제거
      }
      if (torpedo.traveledMeters >= PROVISIONAL_TORPEDO_MAX_RANGE_METERS) {
        continue; // 최대 사거리 초과 — 빗나간 어뢰 제거
      }
      survivors.push(torpedo);
    }
    this.active = survivors;
  }

  /** 수상 표적 명중 판정 (수평면 XZ). 명중 시 1회 통지 후 true */
  private tryHitTarget(torpedo: ActiveTorpedo): boolean {
    for (const target of this.targets.list) {
      const dx = torpedo.x - target.positionX;
      const dz = torpedo.z - target.positionZ;
      if (Math.hypot(dx, dz) <= target.hitRadius + TORPEDO_COLLISION_RADIUS) {
        target.onTorpedoHit(torpedo.x, torpedo.z);
        return true;
      }
    }
    return false;
  }
}
