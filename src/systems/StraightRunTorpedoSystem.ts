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
import { sphereIntersectsShipBox } from './collision/shipHullBox';
import { SUBMARINE_HULL_HALF_LENGTH } from './collision/submarineHull';
import type { EquipmentId, TorpedoProfile } from './EquipmentSystem';
import {
  PROVISIONAL_TORPEDO_MAX_RANGE_METERS,
  PROVISIONAL_TORPEDO_SPEED_MPS,
} from './provisionalCombat';
import type { CombatTarget, TargetRegistry } from './TargetRegistry';

/**
 * 무장 공급 포트 — EquipmentSystem이 충족한다 (장비 4종 단일 소스).
 * 발사 경로는 fire() 하나를 유지하고, 어뢰 속력·피해·디코이 위임만
 * 이 포트에서 읽는다 (별도 발사 시스템 금지).
 */
export interface ArmamentPort {
  readonly activeEquipment: EquipmentId | null;
  activeTorpedoProfile(): TorpedoProfile | null;
  launchDecoy(x: number, y: number, z: number): boolean;
}

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
  /** 발사 시점 장비 프로파일 (m/s) — 렌더 항적 보간용 */
  readonly speedMetersPerSecond: number;
}

interface ActiveTorpedo {
  id: number;
  x: number;
  y: number;
  z: number;
  directionX: number;
  directionZ: number;
  traveledMeters: number;
  speedMetersPerSecond: number;
  damage: number;
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
  private readonly armament: ArmamentPort;

  constructor(
    bus: EventBus,
    combat: CombatParams,
    pose: TorpedoLaunchPose,
    environment: CollisionWorld,
    targets: TargetRegistry,
    armament: ArmamentPort,
  ) {
    this.bus = bus;
    this.pose = pose;
    this.environment = environment;
    this.targets = targets;
    this.armament = armament;
    this.ammo = combat.torpedoCapacity.value;
    this.reloadSeconds = combat.torpedoReloadSeconds.value;
  }

  /** 검증 완료된 전투 파라미터 재적용 (개발 모드 핫리로드 전용) */
  /**
   * 재출항 세션 초기화 — 잔량을 정원으로 되돌리고, 재장전 타이머와
   * 주행 중 어뢰를 비운다. 파라미터(정원·재장전 시간)는 유지한다.
   */
  resetForNewSortie(capacity: number): void {
    this.ammo = Math.max(0, Math.floor(capacity));
    this.reloadTimer = 0;
    this.active = [];
  }

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

  /** 활성 장비 어뢰 속력 (m/s) — 리드샷 보조선의 리드 지점 계산 입력 */
  get torpedoSpeedMetersPerSecond(): number {
    return this.armament.activeTorpedoProfile()?.speedMetersPerSecond ?? PROVISIONAL_TORPEDO_SPEED_MPS;
  }

  /**
   * 발사 — 유일한 발사 로직 (모든 입력 소스가 이 경로 하나로 수렴).
   * 한 번 호출 = 최대 1발. 활성 장비가 디코이면 디코이 사출로 위임한다
   * (재고·쿨다운 판정은 EquipmentSystem — 어뢰 잔량·재장전과 무관).
   * 어뢰 성공 시 torpedoFired 발행.
   */
  fire(): boolean {
    const direction = bowDirectionXZ(this.pose.headingRadians);
    const bowX = this.pose.positionX + direction.x * SPAWN_OFFSET_METERS;
    const bowZ = this.pose.positionZ + direction.z * SPAWN_OFFSET_METERS;

    if (this.armament.activeEquipment === 'decoy') {
      return this.armament.launchDecoy(bowX, this.pose.positionY, bowZ);
    }

    const profile = this.armament.activeTorpedoProfile();
    if (!profile) return false; // 빈 슬롯 — 발사 불가
    if (this.ammo <= 0 || this.reloadTimer > 0) return false;

    this.ammo -= 1;
    if (this.ammo > 0) this.reloadTimer = this.reloadSeconds;

    const torpedo: ActiveTorpedo = {
      id: this.nextTorpedoId,
      x: bowX,
      y: this.pose.positionY,
      z: bowZ,
      directionX: direction.x,
      directionZ: direction.z,
      traveledMeters: 0,
      speedMetersPerSecond: profile.speedMetersPerSecond,
      damage: profile.damage,
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

    const survivors: ActiveTorpedo[] = [];
    for (const torpedo of this.active) {
      const step = torpedo.speedMetersPerSecond * deltaSeconds;
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

  /**
   * 표적 명중 판정 — hullBox(박스 근사, 함선 — 잠수함 충돌과 동일 데이터
   * 공유, 5차 결의 1)가 있으면 박스로, 없으면 수평면 원(hitRadius)으로
   * 판정한다. 명중 시 장비 피해량과 함께 1회 통지 후 true.
   */
  private tryHitTarget(torpedo: ActiveTorpedo): boolean {
    for (const target of this.targets.list) {
      if (this.overlapsTarget(torpedo, target)) {
        target.onTorpedoHit(torpedo.x, torpedo.z, torpedo.damage);
        return true;
      }
    }
    return false;
  }

  private overlapsTarget(torpedo: ActiveTorpedo, target: CombatTarget): boolean {
    if (target.hullBox && target.headingRadians !== undefined) {
      return sphereIntersectsShipBox(
        target.hullBox,
        {
          positionX: target.positionX,
          positionZ: target.positionZ,
          headingRadians: target.headingRadians,
        },
        torpedo.x,
        torpedo.y,
        torpedo.z,
        TORPEDO_COLLISION_RADIUS,
      );
    }
    const dx = torpedo.x - target.positionX;
    const dz = torpedo.z - target.positionZ;
    return Math.hypot(dx, dz) <= target.hitRadius + TORPEDO_COLLISION_RADIUS;
  }
}
