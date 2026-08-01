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
 *  - 수치는 **공식 `params/cargo.json`**이 유일한 출처다 [INT-CORE-011].
 *    조립부가 `official.cargo`를 주입하며(생성자 또는 `applyCargoParams`),
 *    이 시스템은 JSON을 읽거나 툴링 로더를 호출하지 않는다. provisional
 *    모듈 소비는 제거됐다 — 이관된 값은 기존 런타임 값과 동일하다.
 *  - 미주입(unwired)이면 **임시 수치를 만들지 않는다**: 표적 미등록·항행
 *    정지 상태(`configured === false`)로 남고 조립 오류가 드러난다.
 *  - 격침 보상(어뢰 +1, §5.9)은 torpedoHit 이벤트가 진입점 — 보상 지급
 *    구현은 코어 전투 루프 잔여 작업(D6~D9)에서 별도 배선한다.
 */

import type { CargoShipStateSource, Updatable } from '../contracts/systems';
import type { EventBus } from '../core/EventBus';
import type { ShipHullBox } from './collision/shipHullBox';
import type { CargoRuntimeParams } from './economy/officialEconomyCatalog';
import type { CombatTarget, FactionId, TargetRegistry } from './TargetRegistry';

export interface CargoShipWaypoint {
  readonly x: number;
  readonly z: number;
}

/** 선체 박스 근사 치수 (5차 결의 1 — 어뢰 명중·잠수함 충돌 공유 데이터) */
export interface CargoHullDimensions {
  readonly halfLengthMeters: number;
  readonly halfBeamMeters: number;
  /** 판정용 흘수 (m) — 흘수선 아래로 잠기는 판정 깊이 */
  readonly judgmentDraftMeters: number;
  /** 흘수선 위 선체 높이 (m) */
  readonly freeboardMeters: number;
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
  readonly hullBox: CargoHullDimensions;
  /** 세력 태그 (소회의 11 결의 2 — 클래스 분화 금지, 태그 방식) */
  readonly faction: FactionId;
  /** 드롭 테이블 참조 — 경제 시스템이 해석 (적대 파괴 시 드롭) */
  readonly dropTableId?: string;
}

/**
 * 공식 화물선 params → 구성 [INT-CORE-011].
 * 해수면 높이만 레이아웃(월드 소유)에서 오고, 나머지는 전부 params 값이다.
 * 세력·드롭 테이블은 경제 계약의 고정 태그이며 밸런스 수치가 아니다.
 */
export function cargoShipConfigFromOfficial(
  cargo: CargoRuntimeParams,
  surfaceY: number,
): CargoShipConfig {
  return {
    id: cargo.targetId,
    waypointA: cargo.waypointA,
    waypointB: cargo.waypointB,
    surfaceY,
    speedMetersPerSecond: cargo.speedMetersPerSecond,
    hitRadius: cargo.hitRadiusMeters,
    sinkDurationSeconds: cargo.sinkDurationSeconds,
    hullBox: cargo.hullBox,
    faction: 'hostile', // 기본 화물선 = 적대 수송선 (파괴 시 크레딧 드롭)
    dropTableId: 'cargo-standard',
  };
}

/** 미주입 상태의 비활성 구성 — 수치를 만들지 않는다 (전부 무효과) */
const UNWIRED_CARGO_CONFIG: CargoShipConfig = Object.freeze({
  id: 0,
  waypointA: Object.freeze({ x: 0, z: 0 }),
  waypointB: Object.freeze({ x: 0, z: 0 }),
  surfaceY: 0,
  speedMetersPerSecond: 0,
  hitRadius: 0,
  sinkDurationSeconds: 0,
  hullBox: Object.freeze({
    halfLengthMeters: 0,
    halfBeamMeters: 0,
    judgmentDraftMeters: 0,
    freeboardMeters: 0,
  }),
  faction: 'hostile',
});

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
  private readonly targets: TargetRegistry;
  private config: CargoShipConfig;
  private configured: boolean;

  constructor(bus: EventBus, targets: TargetRegistry, config: CargoShipConfig | null = null) {
    this.bus = bus;
    this.targets = targets;
    this.configured = config !== null;
    this.config = config ?? UNWIRED_CARGO_CONFIG;
    this.x = this.config.waypointA.x;
    this.z = this.config.waypointA.z;
    this.faceCurrentWaypoint();
    // 미주입이면 표적으로 등록하지 않는다 — 치수·속력 0짜리 유령선 금지
    if (this.configured) this.unregisterFromTargets = targets.register(this);
  }

  /**
   * 공식 화물선 params 주입 (조립부 전용) — 시작 웨이포인트에서 새로 항행을
   * 시작한다. 조립 시점 1회 호출을 전제로 하며, 격침 상태는 초기화된다.
   */
  applyCargoParams(cargo: CargoRuntimeParams, surfaceY: number): void {
    this.config = cargoShipConfigFromOfficial(cargo, surfaceY);
    this.configured = true;
    this.resetForNewSortie(this.targets);
  }

  /** 공식 수치 배선 여부 — false면 표적·충돌·항행이 전부 비활성 */
  get cargoParamsWired(): boolean {
    return this.configured;
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

  // ── CombatTarget (어뢰 명중 판정 + 세력·충돌 공유 데이터) ──────────────

  get faction(): FactionId {
    return this.config.faction;
  }

  get dropTableId(): string | undefined {
    return this.config.dropTableId;
  }

  get hitRadius(): number {
    return this.config.hitRadius;
  }

  /**
   * 선체 박스 근사 — 어뢰 명중 판정과 잠수함-함선 충돌(통과 방지·밀어냄)이
   * **공유하는 단일 충돌체 데이터** (5차 결의 1)
   */
  get hullBox(): ShipHullBox {
    const hull = this.config.hullBox;
    return {
      halfBeamX: hull.halfBeamMeters,
      halfLengthZ: hull.halfLengthMeters,
      bottomY: this.config.surfaceY - hull.judgmentDraftMeters,
      topY: this.config.surfaceY + hull.freeboardMeters,
    };
  }

  /** 어뢰 명중 통지 — 첫 명중만 유효 (1발 격침 — 장비 피해량 무시). 즉시 표적 목록에서 빠져 중복 침몰 방지 */
  onTorpedoHit(hitX: number, hitZ: number, _damage: number): void {
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
    if (!this.configured || this.removedFlag) return;

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
  /**
   * 재출항 세션 초기화 — 시작 웨이포인트에서 미피격 상태로 되살린다.
   * 격침된 표적은 등록이 해제돼 있으므로 표적 등록도 다시 수행한다.
   */
  resetForNewSortie(targets: TargetRegistry): void {
    this.releaseTargetRegistration();
    this.x = this.config.waypointA.x;
    this.z = this.config.waypointA.z;
    this.movingTowardB = true;
    this.hitFlag = false;
    this.sinkElapsed = 0;
    this.removedFlag = false;
    this.velX = 0;
    this.velZ = 0;
    this.faceCurrentWaypoint();
    if (this.configured) this.unregisterFromTargets = targets.register(this);
  }

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
