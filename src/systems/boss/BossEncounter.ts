/**
 * 보스 조우 — 게임플레이 소유 포트 구현 + 스폰 (M1, 17차 결의 3 창 2).
 *
 * ## 무엇을 소유하는가
 *
 * 리드 `core/BossController`가 **단계·패턴 스케줄·예고·약점 개방·보스 체력**을
 * 소유한다. 이 파일은 그 컨트롤러가 요구하는 **게임플레이 쪽 두 포트**와
 * 보스 개체의 포즈만 소유한다.
 *
 * ```
 * BossMotionPort  — 보스 포즈·선회·전진 (기존 SurfaceShipMotionPort 규약 재사용)
 * BossAttackPort  — 돌진 접촉 / 투사체 비행·명중 → 기존 DamageReceiverPort 1창구
 * ```
 *
 * ## 신규 AI 알고리즘 0
 *
 * 추적·판단은 전부 리드 컨트롤러(`DestroyerAIController` 계보) 안에 있다.
 * 이 파일에는 상태 머신·목표 선택·패턴 결정이 **없다** — 요청을 받아
 * 실행하고 포즈를 옮길 뿐이다. 소환·회전 근접·다섯 번째 패턴에 해당하는
 * 타입·플래그·빈 자리를 만들지 않는다.
 *
 * ## 수치 비소유
 *
 * 단계·피해·속도 수치를 이 파일에 두지 않는다. 전부 `params/boss.json`에서
 * 온 값이 주입된다(조립부가 `loadBossParams()` 결과를 넘긴다). 이 파일은
 * `params/boss.json`을 직접 import하지 않는다.
 *
 * ## 판정은 렌더가 하지 않는다
 *
 * 접촉·명중·피해는 전부 여기서 계산하고 렌더는 결과 상태만 읽는다.
 * 그래픽스 파일을 참조하지 않는다.
 */

import type {
  BossAttackOutcome,
  BossAttackPort,
  BossAttackRequest,
  BossMotionPort,
} from '../../contracts/boss';
import type {
  DamageReceiverPort,
  DamageRequest,
  PlayerAliveSource,
} from '../../contracts/survival';
import { bowDirectionXZ } from '../../core/conventions';
import { computeHullSpheres } from '../collision/submarineHull';
import type { CanyonHorizontalBounds } from '../collision/canyonBounds';

/** 보스 배치 — 월드 데이터 소유 (밸런스 수치가 아니다) */
export interface BossPlacement {
  readonly entityId: number;
  readonly spawnX: number;
  readonly spawnY: number;
  readonly spawnZ: number;
  readonly headingRadians: number;
}

/**
 * 이동·공격 실행 수치 — 전부 `params/boss.json` 소유.
 * 조립부가 검증된 `BossParams`에서 꺼내 넘긴다(여기서 JSON을 읽지 않는다).
 */
export interface BossEncounterParams {
  /** 기본 이동 속력 (m/s) — 돌진 속도는 `setMoveSpeed`가 덮어쓴다 */
  readonly moveSpeedMetersPerSecond: number | null;
  /** 선회 속도 (rad/s) */
  readonly turnRateRadiansPerSecond: number | null;
  /** 투사체 속력 (m/s) */
  readonly projectileSpeedMetersPerSecond: number | null;
  /** 투사체 명중 시 플레이어 선체 피해 */
  readonly projectileDamage: number | null;
  /**
   * 돌진 접촉 피해 — **`params/boss.json`에 없다.** null이면 돌진은
   * 이동·예고만 하고 피해가 0이다(임시 피해를 만들지 않는다).
   */
  readonly ramContactDamage: number | null;
}

/** 플레이어 포즈 단면 — 접촉·명중 판정 입력 */
export interface BossPlayerPoseView {
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly headingRadians: number;
}

/** 비행 중인 보스 투사체 (렌더 폴링용 읽기 전용 스냅샷) */
export interface BossProjectileView {
  readonly projectileId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface FlyingProjectile {
  readonly projectileId: string;
  readonly correlationId: string;
  readonly attackId: string;
  readonly targetEntityId: number;
  x: number;
  y: number;
  z: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly dirZ: number;
  /** 고정 목표까지 남은 거리 — 도달하면 명중 판정 후 소멸 */
  remainingDistance: number;
}

export class BossEncounter implements BossMotionPort, BossAttackPort {
  // 검증 러너(Node 타입 스트리핑) 호환 — 매개변수 프로퍼티 미사용
  private readonly placement: BossPlacement;
  private readonly player: BossPlayerPoseView;
  private readonly bounds: CanyonHorizontalBounds | null;
  private params: BossEncounterParams | null;
  private receiver: DamageReceiverPort | null;
  private aliveSource: PlayerAliveSource | null;

  private posX: number;
  private posY: number;
  private posZ: number;
  private heading: number;
  /** 돌진 등으로 덮어쓴 속력 (null = 기본 속력 복귀) */
  private speedOverride: number | null = null;
  private spawnedFlag = false;
  private removedFlag = false;
  private elapsedSeconds = 0;
  private projectileSequence = 0;

  private readonly projectiles: FlyingProjectile[] = [];
  /** 처리한 공격 요청 id — 중복 실행 차단 (C4 규칙 재사용) */
  private readonly handledAttackIds = new Set<string>();
  /** 피해를 이미 적용한 상관 id — 같은 실행의 중복 피해 차단 */
  private readonly damagedCorrelations = new Set<string>();

  constructor(
    placement: BossPlacement,
    player: BossPlayerPoseView,
    params: BossEncounterParams | null = null,
    bounds: CanyonHorizontalBounds | null = null,
    receiver: DamageReceiverPort | null = null,
    aliveSource: PlayerAliveSource | null = null,
  ) {
    this.placement = placement;
    this.player = player;
    this.params = params;
    this.bounds = bounds;
    this.receiver = receiver;
    this.aliveSource = aliveSource;
    this.posX = placement.spawnX;
    this.posY = placement.spawnY;
    this.posZ = placement.spawnZ;
    this.heading = placement.headingRadians;
  }

  /* ── 조립부 주입 ─────────────────────────────────────────────── */

  attachParams(params: BossEncounterParams | null): void {
    this.params = params;
  }

  /** 기존 피해 창구 연결 — 보스 전용 피해 정본을 만들지 않는다 */
  attachDamageReceiver(receiver: DamageReceiverPort | null): void {
    this.receiver = receiver;
  }

  /** 기존 생사 정본 재사용 — 파괴 후 신규 공격 0의 근거 */
  attachPlayerAliveSource(source: PlayerAliveSource | null): void {
    this.aliveSource = source;
  }

  /** 이동이 성립하는가 (속력·선회 확정) */
  get motionWired(): boolean {
    const params = this.params;
    return (
      params !== null &&
      params.moveSpeedMetersPerSecond !== null &&
      params.moveSpeedMetersPerSecond > 0 &&
      params.turnRateRadiansPerSecond !== null &&
      params.turnRateRadiansPerSecond > 0
    );
  }

  /** 투사체 공격이 성립하는가 (속력·피해·피해 창구) */
  get projectileWired(): boolean {
    const params = this.params;
    return (
      this.receiver !== null &&
      params !== null &&
      params.projectileSpeedMetersPerSecond !== null &&
      params.projectileSpeedMetersPerSecond > 0 &&
      params.projectileDamage !== null &&
      params.projectileDamage > 0
    );
  }

  /**
   * 돌진 접촉 피해가 성립하는가. `params/boss.json patterns.ram`은 속력·지속
   * 시간만 갖고 **피해가 없다** — 확정 전까지 돌진은 이동만 하고 피해 0이다.
   */
  get ramWired(): boolean {
    const params = this.params;
    return this.receiver !== null && params !== null && params.ramContactDamage !== null && params.ramContactDamage > 0;
  }

  /* ── 스폰 (보스 1종, 출항당 1회) ─────────────────────────────── */

  get spawned(): boolean {
    return this.spawnedFlag;
  }

  get removed(): boolean {
    return this.removedFlag;
  }

  /** 진입 게이트를 통과한 조립부가 호출한다 — 두 번 불러도 1회만 성립한다 */
  spawn(): boolean {
    if (this.spawnedFlag) return false;
    this.spawnedFlag = true;
    this.posX = this.placement.spawnX;
    this.posY = this.placement.spawnY;
    this.posZ = this.placement.spawnZ;
    this.heading = this.placement.headingRadians;
    return true;
  }

  /** 격파·출항 종료 시 제거 (포즈 공급 중단) */
  markRemoved(): void {
    this.removedFlag = true;
    this.projectiles.length = 0;
  }

  /* ── 계약 `BossMotionPort`(= SurfaceShipMotionPort + 속도 노브) ── */

  getPosition(): { readonly x: number; readonly y: number; readonly z: number } {
    return { x: this.posX, y: this.posY, z: this.posZ };
  }

  getForward(): { readonly x: number; readonly z: number } {
    return bowDirectionXZ(this.heading);
  }

  /** 돌진·최종 가속 속도 노브 — 값은 params 소유, null이면 기본 복귀 */
  setMoveSpeed(speedMetersPerSecond: number | null): void {
    this.speedOverride =
      typeof speedMetersPerSecond === 'number' && Number.isFinite(speedMetersPerSecond) && speedMetersPerSecond > 0
        ? speedMetersPerSecond
        : null;
  }

  turnToward(x: number, z: number, deltaSeconds: number): void {
    if (!this.motionWired || this.removedFlag) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const desired = Math.atan2(-(x - this.posX), -(z - this.posZ));
    let delta = desired - this.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxStep = (this.params?.turnRateRadiansPerSecond as number) * deltaSeconds;
    this.heading += Math.max(-maxStep, Math.min(maxStep, delta));
  }

  moveForward(deltaSeconds: number): void {
    if (!this.motionWired || this.removedFlag) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const speed = this.speedOverride ?? (this.params?.moveSpeedMetersPerSecond as number);
    const forward = bowDirectionXZ(this.heading);
    const nextX = this.posX + forward.x * speed * deltaSeconds;
    const nextZ = this.posZ + forward.z * speed * deltaSeconds;
    if (!this.isWithinWorldBounds(nextX, nextZ)) return;
    this.posX = nextX;
    this.posZ = nextZ;
  }

  /**
   * 보스는 수중 개체다 — 해수면 고정을 하지 않는다. 스폰 심도를 유지한다
   * (심도 조작은 리드 코어가 하지 않는다는 계약 주석대로 포트 소유).
   */
  maintainSurfaceHeight(): void {
    this.posY = this.placement.spawnY;
  }

  isWithinWorldBounds(x: number, z: number): boolean {
    if (!this.bounds) return true;
    return x >= this.bounds.minX && x <= this.bounds.maxX && z >= this.bounds.minZ && z <= this.bounds.maxZ;
  }

  isTargetAlive(_targetEntityId: number): boolean {
    return this.aliveSource?.isPlayerAlive === true;
  }

  getTargetPosition(
    targetEntityId: number,
  ): { readonly x: number; readonly y: number; readonly z: number } | null {
    if (!this.isTargetAlive(targetEntityId)) return null;
    return { x: this.player.positionX, y: this.player.positionY, z: this.player.positionZ };
  }

  /* ── 계약 `BossAttackPort` ───────────────────────────────────── */

  /**
   * 공격 요청 실행. 요청은 리드 코어가 예고 완료 시점에 만들고 표적 3D
   * 위치를 고정해 보낸다 — 여기서 재추적하지 않는다(INT-CORE-019 계보).
   */
  requestAttack(request: BossAttackRequest): BossAttackOutcome {
    if (this.handledAttackIds.has(request.attackId)) return 'duplicate';
    // 파괴된 플레이어에게는 신규 공격을 만들지 않는다.
    if (this.aliveSource !== null && !this.aliveSource.isPlayerAlive) return 'targetUnavailable';
    if (this.removedFlag) return 'targetUnavailable';

    if (request.patternKind === 'projectile') {
      if (!this.projectileWired) return 'unwired';
      this.handledAttackIds.add(request.attackId);
      this.launchProjectile(request);
      return 'delivered';
    }

    // ram — 접촉 판정. 피해 수치가 params에 없으면 unwired(피해 발명 금지).
    if (!this.ramWired) return 'unwired';
    this.handledAttackIds.add(request.attackId);
    if (!this.contactsPlayer(request.attackerPosition)) return 'delivered';
    this.applyPlayerDamage(
      request.correlationId,
      `boss-ram-${request.attackId}`,
      request.bossEntityId,
      request.targetEntityId,
      this.params?.ramContactDamage as number,
      request.attackerPosition,
    );
    return 'delivered';
  }

  /* ── 시뮬레이션 (투사체 비행) ────────────────────────────────── */

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.elapsedSeconds += deltaSeconds;
    if (this.projectiles.length === 0) return;

    const speed = this.params?.projectileSpeedMetersPerSecond ?? 0;
    if (!(speed > 0)) return;
    const step = speed * deltaSeconds;
    const survivors: FlyingProjectile[] = [];

    for (const projectile of this.projectiles) {
      projectile.x += projectile.dirX * step;
      projectile.y += projectile.dirY * step;
      projectile.z += projectile.dirZ * step;
      projectile.remainingDistance -= step;

      // 비행 중 선체에 닿으면 그 자리에서 명중 — 고정 목표 도달 전이라도.
      if (this.contactsPlayer(projectile)) {
        this.applyPlayerDamage(
          projectile.correlationId,
          `boss-projectile-${projectile.projectileId}`,
          this.placement.entityId,
          projectile.targetEntityId,
          this.params?.projectileDamage as number,
          projectile,
        );
        continue;
      }
      // 고정 목표 지점을 지나치면 빗나감으로 소멸한다 (재추적 없음).
      if (projectile.remainingDistance <= 0) continue;
      survivors.push(projectile);
    }
    this.projectiles.length = 0;
    this.projectiles.push(...survivors);
  }

  /** 비행 중 투사체 (렌더 폴링 — 값 복사본) */
  get flyingProjectiles(): readonly BossProjectileView[] {
    return this.projectiles.map((projectile) => ({
      projectileId: projectile.projectileId,
      x: projectile.x,
      y: projectile.y,
      z: projectile.z,
    }));
  }

  /** 출항 한정 상태 — 비행 투사체·중복 원장·스폰 플래그 초기화 */
  resetForNewSortie(): void {
    this.projectiles.length = 0;
    this.handledAttackIds.clear();
    this.damagedCorrelations.clear();
    this.spawnedFlag = false;
    this.removedFlag = false;
    this.speedOverride = null;
    this.elapsedSeconds = 0;
    this.posX = this.placement.spawnX;
    this.posY = this.placement.spawnY;
    this.posZ = this.placement.spawnZ;
    this.heading = this.placement.headingRadians;
  }

  dispose(): void {
    this.resetForNewSortie();
  }

  /* ── 내부 ────────────────────────────────────────────────────── */

  private launchProjectile(request: BossAttackRequest): void {
    const from = request.attackerPosition;
    const to = request.targetPosition;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const distance = Math.hypot(dx, dy, dz);
    // 발사 지점과 목표가 같으면 방향이 정의되지 않는다 — 비행체를 만들지 않는다.
    if (!(distance > 0)) return;
    this.projectileSequence += 1;
    this.projectiles.push({
      projectileId: `${request.attackId}#${this.projectileSequence}`,
      correlationId: request.correlationId,
      attackId: request.attackId,
      targetEntityId: request.targetEntityId,
      x: from.x,
      y: from.y,
      z: from.z,
      dirX: dx / distance,
      dirY: dy / distance,
      dirZ: dz / distance,
      remainingDistance: distance,
    });
  }

  /**
   * 플레이어 선체 접촉 판정 — **기존 선체 근사 구 3개를 그대로 쓴다**
   * (`collision/submarineHull`). 보스 전용 명중 반경을 발명하지 않는다:
   * 판정 형상은 이미 충돌·어뢰가 공유하는 구조 데이터다.
   */
  private contactsPlayer(point: { readonly x: number; readonly y: number; readonly z: number }): boolean {
    const spheres = computeHullSpheres(
      this.player.positionX,
      this.player.positionY,
      this.player.positionZ,
      this.player.headingRadians,
    );
    for (const sphere of spheres) {
      if (Math.hypot(point.x - sphere.x, point.y - sphere.y, point.z - sphere.z) <= sphere.radius) {
        return true;
      }
    }
    return false;
  }

  /** 피해는 반드시 기존 단일 창구를 통과한다 — 보스 전용 피해 정본 0 */
  private applyPlayerDamage(
    correlationId: string,
    damageEventId: string,
    attackerEntityId: number,
    targetEntityId: number,
    amount: number,
    at: { readonly x: number; readonly y: number; readonly z: number },
  ): void {
    if (this.damagedCorrelations.has(correlationId)) return;
    this.damagedCorrelations.add(correlationId);
    const request: DamageRequest = {
      damageEventId,
      targetEntityId,
      attackerEntityId,
      sourceType: 'enemyWeapon',
      rawDamage: amount,
      worldPosition: { x: at.x, y: at.y, z: at.z },
      occurredAt: this.elapsedSeconds,
      correlationId,
      causesFlooding: false,
      floodingContribution: 0,
    };
    this.receiver?.applyDamage(request);
  }
}
