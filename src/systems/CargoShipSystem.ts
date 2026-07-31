/**
 * 화물선 — 계약 `CargoShipStateSource`(INT-CORE-003) 구현 (§5.9).
 *
 * 규칙:
 *  - VS는 화물선 1척 [확정 §12.2] — 단일 상태. 회피 AI·유체 물리 없음,
 *    **직선 왕복 항행만** (경로 끝점 도달 시 반전, 잔여 이동량 이월 —
 *    프레임 속도와 무관하게 동일 궤적).
 *  - 해수면 흘수선 높이(positionY)를 항상 유지한다 — 침몰 연출의 시각 변위는
 *    렌더가 sinkProgress를 매핑한다 (계약 명세: 판정 위치는 수면 기준 고정).
 *  - 어뢰 명중은 **한 번만** 처리한다: 첫 명중에서 hit=true 고정,
 *    `torpedoHit { targetId, x, z }` 1회 발행, TargetRegistry에서 즉시 제거 —
 *    이후 어뢰는 이 배를 표적으로 보지 않으므로 중복 침몰이 시작되지 않는다.
 *  - 침몰 시간축은 게임플레이 소유 (INT-CORE-003 결정): sinkProgress 0→1을
 *    이 시스템이 진행하고, 완료 시 removed=true — 렌더(CargoShipVisual)는
 *    이 신호로 시각 자원을 정리한다. 렌더 직접 참조 없음 (상태 주입은
 *    composition root 소관).
 *  - 수치는 params·레벨 산출물 부재로 임시값(provisionalCargo.ts — R7,
 *    이관 요청 INT-GAME-007).
 *  - 격침 보상(어뢰 +1, §5.9)은 torpedoHit 이벤트가 진입점 — 보상 지급
 *    구현은 코어 전투 루프 잔여 작업(D6~D9)에서 별도 배선한다.
 */

import type { CargoShipStateSource, Updatable } from '../contracts/systems';
import type { EventBus } from '../core/EventBus';
import {
  PROVISIONAL_CARGO_HIT_RADIUS,
  PROVISIONAL_CARGO_ID,
  PROVISIONAL_CARGO_SINK_DURATION_SECONDS,
  PROVISIONAL_CARGO_SPEED_MPS,
  PROVISIONAL_CARGO_WAYPOINT_A,
  PROVISIONAL_CARGO_WAYPOINT_B,
} from './provisionalCargo';
import { PROVISIONAL_SEA_SURFACE_Y } from './provisionalWorld';
import type { CombatTarget, TargetRegistry } from './TargetRegistry';

export interface CargoShipWaypoint {
  readonly x: number;
  readonly z: number;
}

export interface CargoShipConfig {
  readonly id: number;
  readonly waypointA: CargoShipWaypoint;
  readonly waypointB: CargoShipWaypoint;
  /** 흘수선 높이 (월드 Y) — 해수면 */
  readonly surfaceY: number;
  readonly speedMetersPerSecond: number;
  readonly hitRadius: number;
  readonly sinkDurationSeconds: number;
}

/** 임시 기본 구성 (provisionalCargo.ts — 정식 params/레이아웃 이관 시 교체) */
export function defaultCargoShipConfig(): CargoShipConfig {
  return {
    id: PROVISIONAL_CARGO_ID,
    waypointA: PROVISIONAL_CARGO_WAYPOINT_A,
    waypointB: PROVISIONAL_CARGO_WAYPOINT_B,
    surfaceY: PROVISIONAL_SEA_SURFACE_Y,
    speedMetersPerSecond: PROVISIONAL_CARGO_SPEED_MPS,
    hitRadius: PROVISIONAL_CARGO_HIT_RADIUS,
    sinkDurationSeconds: PROVISIONAL_CARGO_SINK_DURATION_SECONDS,
  };
}

export class CargoShipSystem implements Updatable, CargoShipStateSource, CombatTarget {
  private x: number;
  private z: number;
  private heading = 0;
  private velX = 0;
  private velZ = 0;
  private movingTowardB = true;
  private hitFlag = false;
  private sinkElapsed = 0;
  private removedFlag = false;
  private unregisterFromTargets: (() => void) | null = null;

  // 생성자 매개변수 프로퍼티 미사용 — 검증 러너(run.mjs)의 Node 타입
  // 스트리핑 호환(삭제 가능 문법만)을 위해 명시적 필드로 둔다.
  private readonly bus: EventBus;
  private readonly config: CargoShipConfig;

  constructor(bus: EventBus, targets: TargetRegistry, config: CargoShipConfig = defaultCargoShipConfig()) {
    this.bus = bus;
    this.config = config;
    this.x = config.waypointA.x;
    this.z = config.waypointA.z;
    this.faceCurrentWaypoint();
    this.unregisterFromTargets = targets.register(this);
  }

  // ── CargoShipStateSource (계약 — 렌더·UI 소비) ─────────────────────────

  get id(): number {
    return this.config.id;
  }

  get positionX(): number {
    return this.x;
  }

  /** 수면 흘수선 기준 판정 위치 — 침몰 시각 변위는 렌더가 sinkProgress로 매핑 */
  get positionY(): number {
    return this.config.surfaceY;
  }

  get positionZ(): number {
    return this.z;
  }

  get headingRadians(): number {
    return this.heading;
  }

  get velocityX(): number {
    return this.velX;
  }

  get velocityZ(): number {
    return this.velZ;
  }

  get hit(): boolean {
    return this.hitFlag;
  }

  get sinkProgress(): number {
    if (!this.hitFlag) return 0;
    return Math.min(1, this.sinkElapsed / this.config.sinkDurationSeconds);
  }

  get removed(): boolean {
    return this.removedFlag;
  }

  // ── CombatTarget (어뢰 명중 판정) ──────────────────────────────────────

  get hitRadius(): number {
    return this.config.hitRadius;
  }

  /** 어뢰 명중 통지 — 첫 명중만 유효. 즉시 표적 목록에서 빠져 중복 침몰 방지 */
  onTorpedoHit(hitX: number, hitZ: number): void {
    if (this.hitFlag || this.removedFlag) return;

    this.hitFlag = true;
    this.velX = 0;
    this.velZ = 0;
    this.releaseTargetRegistration();
    this.bus.emit('torpedoHit', { targetId: this.config.id, x: hitX, z: hitZ });
  }

  // ── 시뮬레이션 ─────────────────────────────────────────────────────────

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    if (this.removedFlag) return;

    if (this.hitFlag) {
      this.sinkElapsed += deltaSeconds;
      if (this.sinkElapsed >= this.config.sinkDurationSeconds) {
        this.removedFlag = true;
        this.releaseTargetRegistration(); // 이미 해제됨 — 멱등 정리
      }
      return;
    }

    // 직선 왕복 — 끝점 도달 시 잔여 이동량을 반대 방향으로 이월 (dt 불변)
    let remaining = this.config.speedMetersPerSecond * deltaSeconds;
    for (let bounce = 0; bounce < 2 && remaining > 0; bounce += 1) {
      const target = this.movingTowardB ? this.config.waypointB : this.config.waypointA;
      const dx = target.x - this.x;
      const dz = target.z - this.z;
      const distance = Math.hypot(dx, dz);

      if (remaining < distance) {
        const scale = remaining / distance;
        this.x += dx * scale;
        this.z += dz * scale;
        remaining = 0;
      } else {
        this.x = target.x;
        this.z = target.z;
        remaining -= distance;
        this.movingTowardB = !this.movingTowardB;
      }
    }
    this.faceCurrentWaypoint();
  }

  /** 제거·정리 — 등록 해제 및 상태 종결 (조립 해제 시 GameplaySystems가 호출) */
  dispose(): void {
    this.releaseTargetRegistration();
    this.removedFlag = true;
    this.velX = 0;
    this.velZ = 0;
  }

  /** 현재 진행 방향으로 속도·선수각 갱신 — 선수 = 로컬 -Z 규약(conventions) */
  private faceCurrentWaypoint(): void {
    const target = this.movingTowardB ? this.config.waypointB : this.config.waypointA;
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-9) {
      this.velX = 0;
      this.velZ = 0;
      return;
    }
    const dirX = dx / distance;
    const dirZ = dz / distance;
    this.velX = dirX * this.config.speedMetersPerSecond;
    this.velZ = dirZ * this.config.speedMetersPerSecond;
    // 선수 벡터 (-sin h, -cos h) = 진행 방향 → h = atan2(-dirX, -dirZ)
    this.heading = Math.atan2(-dirX, -dirZ);
  }

  private releaseTargetRegistration(): void {
    this.unregisterFromTargets?.();
    this.unregisterFromTargets = null;
  }
}
