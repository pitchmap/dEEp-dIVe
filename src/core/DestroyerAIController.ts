/**
 * 범용 구축함 AI — `DestroyerAI` 계약의 **유일한 production 구현체**
 * (INT-CORE-013, B5 규칙 개정).
 *
 * ## 왜 신설했는가
 *
 * B5의 원 규칙은 '기존 구축함 AI 재사용 / 신규 AI 코드 0'이었으나, 저장소
 * 전체 조사 결과 production 구현체가 **0개**였다(계약·어댑터·검증 더블만
 * 존재). 재사용할 대상이 없으므로 15차 diff-only 변경으로 **범용 구현 1개**를
 * 신설한다. 경비함(patrol)과 일반 적대 구축함이 **같은 구현체**를 소비한다 —
 * 세력·초기 표적만 다르다.
 *
 * ## 이 파일의 경계
 *
 * 포함: 초기 표적 보관 · 마지막 확인 위치 보관 · 현재 pose 읽기 · 목표(또는
 * 마지막 확인 위치)를 향한 **이동 명령 생성** · 수면 고도 유지 · 월드 경계
 * 이탈 방지 · 수명주기 · 표적 무효 시 안전 동작.
 *
 * 미포함(스프린트 C 또는 다른 소유): 탐지 판정 · 시야/소나 게이지 · 폭뢰 ·
 * 무기 발사 · 선체 체력 · 침수 · 경비함 전용 상태 · 복잡한 전투 FSM.
 *
 * ## 수치를 갖지 않는다
 *
 * 선회 속도·속력·해수면 높이·월드 경계는 전부 `SurfaceShipMotionPort`
 * 구현(게임플레이·월드) 소유다. 이 파일에는 밸런스 수치가 없다 —
 * 상태 전이도 거리 임계값이 아니라 **표적 관측 가능 여부**로만 갈린다.
 */

import type { DestroyerAI } from '../contracts/systems';
import type { FactionId } from '../contracts/faction';
import type { SurfaceShipMotionPort } from '../contracts/guard';
import type { EnemyAttackOutcome, EnemyAttackPort } from '../contracts/survival';

export type DestroyerAIState = DestroyerAI['state'];

export interface DestroyerAIControllerOptions {
  readonly entityId: number;
  readonly faction: FactionId;
  /** 초기 표적 엔티티 (경비함이면 중립 선박을 공격한 플레이어) */
  readonly initialTargetEntityId: number;
  /** 사건 지점 = 최초의 '마지막 확인 위치' */
  readonly lastKnownPosition: { readonly x: number; readonly z: number };
  readonly motion: SurfaceShipMotionPort;
  /**
   * 공격 요청 포트 (게임플레이 EnemyAttackCoordinator — INT-GAME-014).
   * null이면 공격 요청을 만들지 않는다(이동·추적만). AI는 요청만 생성하며
   * 사거리·쿨다운·피해량·반경·신관은 전부 포트·params 소유다.
   */
  readonly attackPort?: EnemyAttackPort | null;
  /** 초기 태도 — 초기 표적을 알고 스폰되면 'alert' */
  readonly initialState?: DestroyerAIState;
}

export class DestroyerAIController implements DestroyerAI {
  readonly entityId: number;
  readonly faction: FactionId;

  private readonly motion: SurfaceShipMotionPort;
  private readonly attackPort: EnemyAttackPort | null;
  private targetEntityId: number;
  /** 공격 요청 id 채번 — 개체 내 단조 증가 (시계·난수 없음) */
  private attackSequence = 0;
  /** 결정적 경과 시간(초) — requestedAt 입력 (프레임 시계 대용) */
  private elapsedSeconds = 0;
  private lastAttackOutcomeValue: EnemyAttackOutcome | null = null;
  private lastKnownX: number;
  private lastKnownZ: number;
  private hasLastKnown = true;
  private currentState: DestroyerAIState;
  private disposed = false;

  // 검증 러너(Node 타입 스트리핑) 호환 — 매개변수 프로퍼티 미사용
  constructor(options: DestroyerAIControllerOptions) {
    this.entityId = options.entityId;
    this.faction = options.faction;
    this.motion = options.motion;
    this.attackPort = options.attackPort ?? null;
    this.targetEntityId = options.initialTargetEntityId;
    this.lastKnownX = options.lastKnownPosition.x;
    this.lastKnownZ = options.lastKnownPosition.z;
    this.currentState = options.initialState ?? 'alert';
  }

  get state(): DestroyerAIState {
    return this.currentState;
  }

  /** 마지막 확인 위치 (읽기 전용 — 검증·디버깅용) */
  get lastKnownPosition(): { readonly x: number; readonly z: number } {
    return { x: this.lastKnownX, z: this.lastKnownZ };
  }

  get currentTargetEntityId(): number {
    return this.targetEntityId;
  }

  /** 마지막 공격 요청 결과 (검증·디버깅용 읽기 전용 — AI는 결과로 판단하지 않는다) */
  get lastAttackOutcome(): EnemyAttackOutcome | null {
    return this.lastAttackOutcomeValue;
  }

  /**
   * 마지막 목격 위치 기록 (계약 진입점 — 어뢰 발사 노출·발각 시 호출).
   * 표적을 놓친 상태였다면 다시 접근 태세로 돌아간다.
   */
  notifyLastKnownPosition(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.lastKnownX = x;
    this.lastKnownZ = z;
    this.hasLastKnown = true;
    if (this.currentState === 'lost') this.currentState = 'alert';
  }

  initialize(): void {
    // 이동 포트는 생성 시 주입된다 — 여기서는 수면 고도만 맞춘다.
    this.motion.maintainSurfaceHeight();
  }

  update(deltaSeconds: number): void {
    if (this.disposed) return;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.elapsedSeconds += deltaSeconds;

    // 수상함은 항상 해수면 고도를 유지한다 (높이 값은 포트 구현 소유).
    this.motion.maintainSurfaceHeight();

    const goal = this.resolveGoal();
    if (!goal) {
      // 표적 무효 + 마지막 확인 위치 없음 = 안전한 정지(idle).
      // 무장 판정이 없으므로 제자리 유지가 가장 안전한 동작이다.
      this.currentState = 'lost';
      return;
    }

    this.motion.turnToward(goal.x, goal.z, deltaSeconds);

    // attack 상태에서만 공격 **요청**을 만든다 (INT-CORE-016, C4 경로).
    // attack은 resolveGoal에서 '표적 생존 + 위치 관측 가능'일 때만 성립하므로
    // 파괴된 표적·위치 미확인 상태에서는 여기 도달하지 않는다. 탐지 게이트는
    // 게임플레이 motion 포트(getTargetPosition = stage detected일 때만)가
    // 소유한다 — 컨트롤러가 stage를 재판정하지 않는다(이중 판정 금지).
    // 실제 투하·피해 여부는 포트(사거리·쿨다운·params)가 결정하며,
    // params null이면 결과는 unwired이고 폭뢰는 떨어지지 않는다.
    if (this.currentState === 'attack' && this.attackPort) {
      this.attackSequence += 1;
      const attackId = `attack:${this.entityId}:${this.attackSequence}`;
      const attackerPosition = this.motion.getPosition();
      this.lastAttackOutcomeValue = this.attackPort.requestAttack({
        attackId,
        attackerEntityId: this.entityId,
        targetEntityId: this.targetEntityId,
        attackerPosition,
        // 수평면 좌표만 관측한다 — 표적 심도·명중 판정은 게임플레이 소유.
        targetPosition: { x: goal.x, y: 0, z: goal.z },
        correlationId: attackId,
        requestedAt: this.elapsedSeconds,
      });
    }

    // 월드 경계 이탈 방지 — 이번 프레임 전진의 도착 예정 지점이 경계 밖이면
    // 전진하지 않는다(경계 좌표는 포트 구현 소유, AI는 수치를 모른다).
    const position = this.motion.getPosition();
    const forward = this.motion.getForward();
    const projectedX = position.x + forward.x;
    const projectedZ = position.z + forward.z;
    if (!this.motion.isWithinWorldBounds(projectedX, projectedZ)) return;

    this.motion.moveForward(deltaSeconds);
  }

  /**
   * 이번 프레임의 목표 지점.
   *  - 표적이 살아 있고 위치를 읽을 수 있으면 그 위치(= 'attack'),
   *    동시에 마지막 확인 위치를 갱신한다.
   *  - 아니면 마지막 확인 위치로 접근(= 'alert').
   *  - 둘 다 없으면 null(= 'lost' → 정지).
   */
  private resolveGoal(): { x: number; z: number } | null {
    if (this.motion.isTargetAlive(this.targetEntityId)) {
      const targetPosition = this.motion.getTargetPosition(this.targetEntityId);
      if (targetPosition) {
        this.lastKnownX = targetPosition.x;
        this.lastKnownZ = targetPosition.z;
        this.hasLastKnown = true;
        this.currentState = 'attack';
        return { x: targetPosition.x, z: targetPosition.z };
      }
    }
    if (this.hasLastKnown) {
      this.currentState = 'alert';
      return { x: this.lastKnownX, z: this.lastKnownZ };
    }
    return null;
  }

  dispose(): void {
    this.disposed = true;
    this.hasLastKnown = false;
    this.currentState = 'lost';
  }
}
