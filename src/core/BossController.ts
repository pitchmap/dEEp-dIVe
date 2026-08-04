/**
 * M1 보스 코어 — 3단계 × 4패턴 상태 머신 (리드 소유, 17차 결의 3 창 1).
 *
 * ## DestroyerAIController 계보 재사용 (신규 범용 AI 알고리즘 0)
 *
 * 내비게이션(접근·추적·관측 게이트·경계 정지)은 기존
 * `DestroyerAIController`를 **합성**으로 그대로 재사용한다(attackPort:
 * null — 폭뢰 요청 없음). 이 파일이 추가하는 것은 보스 고유 레이어뿐이다:
 * 단계 전환(체력 임계 + 예고) · 패턴 스케줄 · 예고 상태 · 약점 개방 창 ·
 * 보스 체력 원장. 이동은 기존 `BossMotionPort`(= SurfaceShipMotionPort +
 * 속도 노브) 메서드만 호출하며 transform을 직접 조작하지 않는다.
 *
 * ## 패턴 4종 (16차 결의 1-3 봉인 — 소환·회전 근접 없음)
 *
 *  - 돌진(ram): 예고 → 관측 고정 목표 벡터로 params 속도 돌진(기존 이동
 *    코드 재사용). 접촉 피해 판정은 게임플레이 `BossAttackPort` 소유.
 *  - 투사체(projectile): 예고 → 요청 1건(기존 어뢰 경로 역방향 재사용은
 *    포트 구현 소유).
 *  - 약점 개방(weakPointOpen): 예고 → params 시간 동안 개방(피격 태그
 *    전환은 게임플레이 `BossWeakPointTarget`이 `BossPhasePort`로 소비).
 *  - 최종 가속(finalAcceleration): 3단계 진입 시 params 배율 적용
 *    (돌진 속도 × speedMultiplier, 패턴 간격 × intervalMultiplier).
 *
 * ## 불변 규칙
 *
 *  - **모든 공격 판정·개방·단계 전환보다 예고 상태가 먼저다** — 요청은
 *    예고가 끝나는 프레임에만 생성된다.
 *  - 단계는 1→2→3 순서로만, 한 번에 한 단계씩 전환한다(임계 2개를 동시에
 *    지나도 순차 예고·전환).
 *  - 플레이어 파괴(`PlayerAliveSource`) 또는 보스 격파 후 신규 예고·요청
 *    0건. 격파 이벤트는 정확히 1회.
 *  - 수치는 전부 주입된 `BossParams` — 이 파일에 밸런스 상수가 없다.
 */

import type {
  BossAttackPatternKind,
  BossAttackPort,
  BossAttackRequest,
  BossCoreView,
  BossDamageOutcome,
  BossDamageRequest,
  BossDamageSink,
  BossMotionPort,
  BossPhasePort,
  BossTelegraphKind,
} from '../contracts/boss';
import type { BossPhase } from '../contracts/meta';
import type { BossParams } from '../contracts/params';
import type { PlayerAliveSource } from '../contracts/survival';
import type { EventBus } from './EventBus';
import { DestroyerAIController } from './DestroyerAIController';

export interface BossControllerOptions {
  readonly entityId: number;
  readonly targetEntityId: number;
  readonly motion: BossMotionPort;
  readonly params: BossParams;
  /** 공격 실행 포트 (게임플레이) — null = unwired(이동·예고만, 요청 0) */
  readonly attackPort?: BossAttackPort | null;
  /** 플레이어 생사 정본 — 파괴 후 신규 공격 0의 근거 (C 계약 재사용) */
  readonly playerAlive?: PlayerAliveSource | null;
  readonly bus?: EventBus | null;
  readonly spawnPosition: { readonly x: number; readonly z: number };
}

/** 공격·개방 패턴의 스케줄 순서 (최종 가속은 스케줄 대상이 아닌 수정자) */
const SCHEDULED_PATTERNS = ['ram', 'projectile', 'weakPointOpen'] as const;
type ScheduledPattern = (typeof SCHEDULED_PATTERNS)[number];

type ExecutionState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'telegraph';
      readonly telegraph: BossTelegraphKind;
      remaining: number;
      readonly pattern: ScheduledPattern | null;
      readonly lockedTarget: { readonly x: number; readonly y: number; readonly z: number } | null;
    }
  | {
      readonly kind: 'ram';
      remaining: number;
      readonly lockedTarget: { readonly x: number; readonly y: number; readonly z: number };
    }
  | { readonly kind: 'weakPointOpen'; remaining: number };

export class BossController implements BossDamageSink {
  // 검증 러너(Node 타입 스트리핑) 호환 — 매개변수 프로퍼티 미사용
  readonly bossId: string;
  readonly entityId: number;

  private readonly motion: BossMotionPort;
  private readonly params: BossParams;
  private readonly attackPort: BossAttackPort | null;
  private readonly playerAlive: PlayerAliveSource | null;
  private readonly bus: EventBus | null;
  private readonly targetEntityId: number;
  /** 내비게이션 계보 — 기존 구축함 AI 재사용 (공격 요청 없음) */
  private readonly nav: DestroyerAIController;

  private currentPhase: BossPhase = 1;
  private hull: number;
  private execution: ExecutionState = { kind: 'idle' };
  private weakOpen = false;
  private defeatedFlag = false;
  private accelerationActive = false;
  private cooldownRemaining: number;
  private cycleIndex = 0;
  private attackSequence = 0;
  private elapsedSeconds = 0;
  private disposed = false;
  /** 적용한 피해 id 원장 — 중복 반영 금지 (C 단일 창구 규칙 재사용) */
  private readonly damageLedger = new Set<string>();

  constructor(options: BossControllerOptions) {
    this.bossId = options.params.id;
    this.entityId = options.entityId;
    this.motion = options.motion;
    this.params = options.params;
    this.attackPort = options.attackPort ?? null;
    this.playerAlive = options.playerAlive ?? null;
    this.bus = options.bus ?? null;
    this.targetEntityId = options.targetEntityId;
    this.hull = options.params.hull.maxHull.value;
    this.cooldownRemaining = options.params.patterns.intervalSeconds.value;
    this.nav = new DestroyerAIController({
      entityId: options.entityId,
      faction: 'hostile',
      initialTargetEntityId: options.targetEntityId,
      lastKnownPosition: options.spawnPosition,
      motion: options.motion,
      attackPort: null, // 보스는 폭뢰 요청을 만들지 않는다 — 이동·추적만 재사용
      initialState: 'alert',
    });
  }

  /* ── 수명주기 (DestroyerAI 계보와 동일) ────────────────────── */

  initialize(): void {
    this.nav.initialize();
  }

  update(deltaSeconds: number): void {
    if (this.disposed || this.defeatedFlag) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

    // 플레이어 파괴 후 신규 예고·요청 0 — 진행 중 동작도 즉시 중단 (C 규칙)
    if (this.playerAlive !== null && !this.playerAlive.isPlayerAlive) {
      this.cancelExecution();
      return;
    }

    this.elapsedSeconds += deltaSeconds;

    switch (this.execution.kind) {
      case 'telegraph':
        this.updateTelegraph(this.execution, deltaSeconds);
        return;
      case 'ram':
        this.updateRam(this.execution, deltaSeconds);
        return;
      case 'weakPointOpen':
        this.execution.remaining -= deltaSeconds;
        if (this.execution.remaining <= 0) {
          this.setWeakOpen(false);
          this.endPattern();
        }
        return;
      case 'idle':
        this.updateIdle(deltaSeconds);
        return;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancelExecution();
  }

  /* ── 단계·약점 노출 (게임플레이 약점 판정 소비 단면) ──────────── */

  get phasePort(): BossPhasePort {
    const self = this;
    return {
      get phase() {
        return self.currentPhase;
      },
      get weakPointOpen() {
        return self.weakOpen;
      },
    };
  }

  /** 읽기 모델 — 값 복사본 (HUD·렌더 소비, 원시 체력 비노출) */
  view(): BossCoreView {
    const maxHull = this.params.hull.maxHull.value;
    return {
      bossId: this.bossId,
      phase: this.currentPhase,
      hullRatio: maxHull > 0 ? this.hull / maxHull : 0,
      telegraph: this.execution.kind === 'telegraph' ? this.execution.telegraph : null,
      weakPointOpen: this.weakOpen,
      defeated: this.defeatedFlag,
    };
  }

  /** 어뢰 발사 노출 브리지 재사용용 (§5.10 — 조립부가 연결) */
  notifyLastKnownPosition(x: number, z: number): void {
    this.nav.notifyLastKnownPosition(x, z);
  }

  /** 3단계 가속 적용 후 유효 패턴 간격 (검증·튜닝 관측용 읽기 전용) */
  get effectivePatternIntervalSeconds(): number {
    return this.effectiveInterval();
  }

  /* ── 보스 피해 수신 (게임플레이 판정 결과 — 수치 비소유) ───────── */

  applyBossDamage(request: BossDamageRequest): BossDamageOutcome {
    if (
      typeof request.amount !== 'number' ||
      !Number.isFinite(request.amount) ||
      request.amount <= 0
    ) {
      return 'invalidDamage';
    }
    if (this.defeatedFlag) return 'ignoredDefeated';
    if (this.damageLedger.has(request.damageId)) return 'ignoredDuplicate';
    this.damageLedger.add(request.damageId);

    this.hull = Math.max(0, this.hull - request.amount);
    if (this.hull === 0) {
      this.handleDefeat();
      return 'defeated';
    }
    return 'applied';
  }

  /* ── 내부 — 단계 전환 (체력 임계 + 예고, 1→2→3 순차) ──────────── */

  private targetPhaseFromHull(): BossPhase {
    const ratio = this.hull / this.params.hull.maxHull.value;
    if (ratio <= this.params.hull.phase3AtHullRatio.value) return 3;
    if (ratio <= this.params.hull.phase2AtHullRatio.value) return 2;
    return 1;
  }

  private beginTelegraph(
    telegraph: BossTelegraphKind,
    pattern: ScheduledPattern | null,
    lockedTarget: { x: number; y: number; z: number } | null,
  ): void {
    this.execution = {
      kind: 'telegraph',
      telegraph,
      remaining: this.params.patterns.telegraphSeconds.value,
      pattern,
      lockedTarget,
    };
  }

  private updateTelegraph(
    state: Extract<ExecutionState, { kind: 'telegraph' }>,
    deltaSeconds: number,
  ): void {
    // 예고 중에는 제자리 유지 — 회피 판단의 근거가 되는 정지 신호
    this.motion.maintainSurfaceHeight();
    state.remaining -= deltaSeconds;
    if (state.remaining > 0) return;

    if (state.telegraph === 'phaseShift') {
      this.currentPhase = (this.currentPhase + 1) as BossPhase;
      this.bus?.emit('bossPhaseChanged', { phase: this.currentPhase });
      if (this.currentPhase === 3 && this.params.patterns.flags.finalAcceleration) {
        this.accelerationActive = true; // 최종 가속 — params 배율 활성 (패턴 4)
      }
      this.endPattern();
      return;
    }

    if (state.telegraph === 'weakPointOpen') {
      this.setWeakOpen(true);
      this.execution = {
        kind: 'weakPointOpen',
        remaining: this.params.patterns.weakPointOpen.openSeconds.value,
      };
      return;
    }

    // 공격 패턴 — 예고 완료 시점에만 요청 생성 (예고가 판정보다 먼저)
    if (state.pattern === 'ram' && state.lockedTarget) {
      this.emitAttackRequest('ram', state.lockedTarget);
      this.motion.setMoveSpeed(this.effectiveRamSpeed());
      this.execution = {
        kind: 'ram',
        remaining: this.params.patterns.ram.durationSeconds.value,
        lockedTarget: state.lockedTarget,
      };
      return;
    }
    if (state.pattern === 'projectile' && state.lockedTarget) {
      this.emitAttackRequest('projectile', state.lockedTarget);
    }
    this.endPattern();
  }

  private updateRam(state: Extract<ExecutionState, { kind: 'ram' }>, deltaSeconds: number): void {
    // 돌진 — 예고 시점에 고정된 목표 벡터로만 (재추적·유도 없음)
    this.motion.maintainSurfaceHeight();
    this.motion.turnToward(state.lockedTarget.x, state.lockedTarget.z, deltaSeconds);
    // 경계 이탈 방지 — 기존 계보와 동일 규칙 (경계 좌표는 포트 소유)
    const position = this.motion.getPosition();
    const forward = this.motion.getForward();
    if (this.motion.isWithinWorldBounds(position.x + forward.x, position.z + forward.z)) {
      this.motion.moveForward(deltaSeconds);
    } else {
      state.remaining = 0; // 경계에 닿으면 돌진 조기 종료
    }
    state.remaining -= deltaSeconds;
    if (state.remaining <= 0) {
      this.motion.setMoveSpeed(null);
      this.endPattern();
    }
  }

  private updateIdle(deltaSeconds: number): void {
    // 단계 전환 예고가 최우선 — 임계를 지났으면 다음 패턴보다 먼저 수행
    if (this.targetPhaseFromHull() > this.currentPhase) {
      this.beginTelegraph('phaseShift', null, null);
      return;
    }

    // 접근·추적은 기존 구축함 AI 계보 그대로 (관측 게이트 포함)
    this.nav.update(deltaSeconds);

    this.cooldownRemaining -= deltaSeconds;
    if (this.cooldownRemaining > 0) return;

    const pattern = this.nextEnabledPattern();
    if (pattern === null) return; // 노출 패턴 없음 (비상 컷 전면 오프 등)

    // 관측 게이트: 표적을 관측할 수 있을 때만 패턴 개시 (기존 attack 게이트)
    const observed = this.motion.getTargetPosition(this.targetEntityId);
    if (this.nav.state !== 'attack' || observed === null) return;

    this.advanceCycle();
    if (pattern === 'weakPointOpen') {
      this.beginTelegraph('weakPointOpen', 'weakPointOpen', null);
      return;
    }
    // 공격 패턴 — 표적 3D 위치를 예고 시작 시점에 고정
    this.beginTelegraph(pattern, pattern, { x: observed.x, y: observed.y, z: observed.z });
  }

  private nextEnabledPattern(): ScheduledPattern | null {
    const flags = this.params.patterns.flags;
    for (let step = 0; step < SCHEDULED_PATTERNS.length; step += 1) {
      const candidate = SCHEDULED_PATTERNS[(this.cycleIndex + step) % SCHEDULED_PATTERNS.length];
      if (candidate !== undefined && flags[candidate]) {
        this.cycleIndex = (this.cycleIndex + step) % SCHEDULED_PATTERNS.length;
        return candidate;
      }
    }
    return null;
  }

  private advanceCycle(): void {
    this.cycleIndex = (this.cycleIndex + 1) % SCHEDULED_PATTERNS.length;
  }

  private emitAttackRequest(
    patternKind: BossAttackPatternKind,
    lockedTarget: { x: number; y: number; z: number },
  ): void {
    if (this.attackPort === null) return; // unwired — 요청 0 (임시 피해 금지)
    this.attackSequence += 1;
    const attackId = `bossAttack:${this.entityId}:${this.attackSequence}`;
    const position = this.motion.getPosition();
    const request: BossAttackRequest = {
      attackId,
      bossEntityId: this.entityId,
      targetEntityId: this.targetEntityId,
      patternKind,
      attackerPosition: { x: position.x, y: position.y, z: position.z },
      targetPosition: lockedTarget,
      correlationId: attackId,
      requestedAt: this.elapsedSeconds,
    };
    this.attackPort.requestAttack(request);
  }

  private endPattern(): void {
    this.execution = { kind: 'idle' };
    this.cooldownRemaining = this.effectiveInterval();
  }

  private effectiveInterval(): number {
    const base = this.params.patterns.intervalSeconds.value;
    return this.accelerationActive
      ? base * this.params.patterns.finalPhase.intervalMultiplier.value
      : base;
  }

  private effectiveRamSpeed(): number {
    const base = this.params.patterns.ram.speedMetersPerSecond.value;
    return this.accelerationActive
      ? base * this.params.patterns.finalPhase.speedMultiplier.value
      : base;
  }

  private cancelExecution(): void {
    if (this.execution.kind === 'ram') this.motion.setMoveSpeed(null);
    if (this.execution.kind === 'weakPointOpen' || this.weakOpen) this.setWeakOpen(false);
    this.execution = { kind: 'idle' };
    this.cooldownRemaining = this.effectiveInterval();
  }

  /**
   * 약점 개방 상태 전이 단일 지점 — 전이 시에만 `bossWeakPointChanged` 1회
   * 발행 (INT-CORE-022: 상태 정본 = 이 코어 phasePort이므로 발행도 코어가
   * 한다. 명중 통지 `bossHit`은 게임플레이 발행 — 별개 이벤트).
   * 격파 경로에서는 cancelExecution이 먼저 불리므로 항상
   * bossWeakPointChanged(false) → bossDefeated 순서다.
   */
  private setWeakOpen(open: boolean): void {
    if (this.weakOpen === open) return;
    this.weakOpen = open;
    this.bus?.emit('bossWeakPointChanged', { active: open });
  }

  private handleDefeat(): void {
    if (this.defeatedFlag) return;
    this.defeatedFlag = true;
    this.cancelExecution();
    const position = this.motion.getPosition();
    // 격파 1회 = 이벤트 1회 — 보상·기록은 조립부 승리 브리지가 기존
    // lootDropped·저장 경로로 처리한다 (이 코어는 경제를 만지지 않는다).
    this.bus?.emit('bossDefeated', { bossId: this.bossId, x: position.x, z: position.z });
  }
}
