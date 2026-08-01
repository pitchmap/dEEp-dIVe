/**
 * 경비함(patrol) 월드 엔티티 — **pose 정본 한 곳** (B5 런타임 연결).
 *
 * ## 정본 규칙
 *
 * 스폰된 경비함 1척의 위치·선수각·생존 여부는 **이 객체 하나**가 갖는다.
 * AI(`DestroyerAIController`, 리드 소유)는 transform을 저장하지 않고
 * `SurfaceShipMotionPort`를 통해 이 상태를 읽고 명령만 낸다. 렌더는
 * 읽기 전용 스냅샷만 본다 — 렌더 객체를 직접 조작하지 않는다.
 *
 * ## 이 파일에 없는 것
 *
 * AI 판단이 없다. 목표 선택·상태 전이·추적 로직은 전부 범용
 * `DestroyerAIController` 안에 있다. 여기 있는 것은 "얼마나 도는지·얼마나
 * 가는지"를 실행하는 **운동학**과 상태 보관뿐이다. 탐지·소나·폭뢰·무기
 * 발사·선체 체력·침수는 만들지 않는다 (스프린트 C 범위).
 *
 * ## 수치는 전부 주입 — 경비함 전용 공식 튜닝값은 아직 없다
 *
 * 속력·선회 속도·해수면 높이·명중 반경은 생성자로 주입받으며 이 파일에
 * 리터럴이 없다. 주입되는 값의 출처와 성격(임시 상속값)은
 * `patrolShipMotionProfile()`(shipPlacements.ts)에 한 곳으로 적어 둔다.
 */

import type { FactionId } from '../../contracts/faction';
import type { GuardSpawnReason, IncidentPosition } from '../../contracts/guard';
import type { ShipHullBox } from '../collision/shipHullBox';
import type { CargoHullDimensions } from '../CargoShipSystem';
import type { CombatTarget, TorpedoAttackContext } from '../TargetRegistry';

/**
 * 경비함 운동 프로파일 — **전부 기존 공식·검증 값에서 상속**한 임시값이다.
 * 경비함 전용 공식 튜닝표가 도착하면 이 묶음만 교체된다.
 */
export interface PatrolShipMotionProfile {
  /** 전진 속력 (m/s) */
  readonly speedMetersPerSecond: number;
  /** 선회 속도 (rad/s) */
  readonly turnRateRadiansPerSecond: number;
  /** 해수면 높이 (월드 Y) — 수상함 고도 */
  readonly surfaceY: number;
  /** 원 근사 명중 반경 (수평면) */
  readonly hitRadius: number;
  /** 선체 박스 근사 — 어뢰 명중·잠수함 충돌 공유 데이터 */
  readonly hullBox: CargoHullDimensions;
}

/** 스폰 1건이 만들어 내는 엔티티의 초기 상태 */
export interface PatrolShipSpawnState {
  readonly entityId: number;
  readonly faction: FactionId;
  readonly spawnReason: GuardSpawnReason;
  readonly initialTargetEntityId: number;
  /** 사건(중립 피격) 지점 — 최초의 마지막 확인 위치이기도 하다 */
  readonly incidentPosition: IncidentPosition;
  readonly spawnX: number;
  readonly spawnZ: number;
  readonly spawnHeadingRadians: number;
  /** 렌더 원형 키 — 문구·색이 아니라 식별자다 (표현은 그래픽스 소유) */
  readonly visualArchetype: string;
}

export class PatrolShipEntity implements CombatTarget {
  readonly entityId: number;
  readonly faction: FactionId;
  readonly spawnReason: GuardSpawnReason;
  readonly initialTargetEntityId: number;
  readonly incidentPosition: IncidentPosition;
  readonly visualArchetype: string;
  /** 스폰 위치 원본 — 그래픽스 등장 연출이 추정 좌표를 만들지 않게 보존 */
  readonly spawnPosition: { readonly x: number; readonly z: number };

  private x: number;
  private z: number;
  private headingValue: number;
  private aliveFlag = true;
  private readonly profile: PatrolShipMotionProfile;

  constructor(state: PatrolShipSpawnState, profile: PatrolShipMotionProfile) {
    this.entityId = state.entityId;
    this.faction = state.faction;
    this.spawnReason = state.spawnReason;
    this.initialTargetEntityId = state.initialTargetEntityId;
    this.incidentPosition = state.incidentPosition;
    this.visualArchetype = state.visualArchetype;
    this.profile = profile;
    // 스폰 위치를 **그대로** 초기 위치로 쓴다 (보정·재계산 없음).
    this.x = state.spawnX;
    this.z = state.spawnZ;
    this.headingValue = state.spawnHeadingRadians;
    this.spawnPosition = Object.freeze({ x: state.spawnX, z: state.spawnZ });
  }

  /* ── CombatTarget (어뢰 명중 판정 — 기존 표적 경로 재사용) ────────── */

  /** 표적 식별자 = 엔티티 id (렌더·식별·표적이 같은 키를 쓴다) */
  get id(): number {
    return this.entityId;
  }

  get positionX(): number {
    return this.x;
  }

  /** 수상함이므로 항상 해수면 고도 */
  get positionY(): number {
    return this.profile.surfaceY;
  }

  get positionZ(): number {
    return this.z;
  }

  /** 선수각 (라디안) — 계약 `CombatTarget.headingRadians`(hullBox 판정 입력) */
  get headingRadians(): number {
    return this.headingValue;
  }

  /** 선수 벡터 (XZ, 정규화) — 규약: 선수 = (−sin h, −cos h) */
  get forwardX(): number {
    return -Math.sin(this.headingValue);
  }

  get forwardZ(): number {
    return -Math.cos(this.headingValue);
  }

  get velocityX(): number {
    return this.aliveFlag ? this.forwardX * this.profile.speedMetersPerSecond : 0;
  }

  get velocityZ(): number {
    return this.aliveFlag ? this.forwardZ * this.profile.speedMetersPerSecond : 0;
  }

  get hitRadius(): number {
    return this.profile.hitRadius;
  }

  get hullBox(): ShipHullBox {
    const hull = this.profile.hullBox;
    return {
      halfBeamX: hull.halfBeamMeters,
      halfLengthZ: hull.halfLengthMeters,
      bottomY: this.profile.surfaceY - hull.judgmentDraftMeters,
      topY: this.profile.surfaceY + hull.freeboardMeters,
    };
  }

  get alive(): boolean {
    return this.aliveFlag;
  }

  /** 표적으로 삼을 수 있는가 — 파괴된 경비함은 제외 */
  get targetable(): boolean {
    return this.aliveFlag;
  }

  /**
   * 어뢰 명중 — 유효 피해면 격침 처리한다 (화물선과 같은 1발 규칙).
   * 경비함은 중립이 아니므로 중립 사건을 발생시키지 않는다(세력 규칙표).
   * 보상은 경제 시스템이 세력 규칙표로 판정한다 — patrol은 공식 수치표가
   * 없어 보상 0이다 (여기서 보상을 만들지 않는다).
   */
  onTorpedoHit(_hitX: number, _hitZ: number, damage: number, _attack?: TorpedoAttackContext): void {
    if (!this.aliveFlag) return;
    if (!Number.isFinite(damage) || damage <= 0) return;
    this.aliveFlag = false;
  }

  /* ── 운동학 (AI가 포트를 통해 호출 — 판단 없음) ──────────────────── */

  /** 지정 지점을 향해 이번 프레임 선회량만큼 회전 */
  turnToward(targetX: number, targetZ: number, deltaSeconds: number): void {
    if (!this.aliveFlag) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const dx = targetX - this.x;
    const dz = targetZ - this.z;
    if (Math.hypot(dx, dz) < 1e-9) return;

    // 목표 방향의 선수각 — 선수 벡터 (−sin h, −cos h) = 진행 방향
    const desired = Math.atan2(-dx, -dz);
    const step = this.profile.turnRateRadiansPerSecond * deltaSeconds;
    const delta = normalizeAngle(desired - this.headingValue);
    this.headingValue = normalizeAngle(
      this.headingValue + Math.max(-step, Math.min(step, delta)),
    );
  }

  /** 현재 선수 방향으로 전진 */
  moveForward(deltaSeconds: number): void {
    if (!this.aliveFlag) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const distance = this.profile.speedMetersPerSecond * deltaSeconds;
    this.x += this.forwardX * distance;
    this.z += this.forwardZ * distance;
  }

  /** 파괴·정리 — 표적·렌더에서 제외된다 */
  markRemoved(): void {
    this.aliveFlag = false;
  }
}

/** 각도를 (−π, π]로 정규화 — 최단 회전 방향 판정용 */
function normalizeAngle(radians: number): number {
  let value = radians;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value <= -Math.PI) value += Math.PI * 2;
  return value;
}
