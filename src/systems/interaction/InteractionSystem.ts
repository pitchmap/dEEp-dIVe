/**
 * 상호작용(회수) — **모든 대상 타입이 공유하는 단일 시스템** (M2 1단계 선행).
 *
 * ## 왜 하나인가
 *
 * 금괴·난파선 salvage·단서·심층 탐사 지점은 "가까이 가서 E를 홀드해 회수"
 * 라는 **같은 절차**를 쓴다. 대상 타입별 시스템을 만들면 홀드·취소·중복
 * 방지 규칙이 네 벌로 갈라진다 — 그래서 이 파일 하나가 절차를 소유하고,
 * 대상은 `InteractableTarget` 목록으로만 들어온다. 타입은 `kind` 태그일 뿐
 * 분기 로직이 아니다.
 *
 * ## 절차
 *
 * ```
 * 근접(interactRadius 이내) → E 홀드 시작 → 진행률 0→1 (holdSeconds)
 *   → 홀드 중 소음원 추가(기존 attachNoiseSource 경로)
 *   → 완료: 대상 1개당 완료 통지 **정확히 1회** · 이후 같은 대상 재회수 불가
 * 취소: 거리 이탈 / 대상 제거·비활성 / 입력 해제
 * ```
 *
 * ## 수치는 전부 params
 *
 * 홀드 시간·근접 반경·회수 중 소음 기여량은 **주입**받는다. 미주입이면
 * `unwired`로 남아 상호작용이 성립하지 않는다 — 임의의 2초·반경·소음값을
 * 코드에 만들지 않는다 (`params` 요청: INTEGRATION_NOTES INT-GAME-015).
 *
 * ## 이 파일에 없는 것
 *
 * 보상 지급·단서 진행 상태·저장. 완료 통지만 내보내고 그 소비는 각 소유
 * 시스템(경제·진행 상태)이 한다 — 별도 저장 정본을 만들지 않는다.
 * 대상 배치·콘텐츠 정의도 여기 없다(월드·기획 소유).
 */

/** 대상 분류 — 표시·소비측 분기용 태그이며 이 시스템의 절차는 동일하다 */
export type InteractableKind = 'gold' | 'salvage' | 'clue' | 'deepSurvey';

/** 회수 대상 1개의 읽기 전용 단면 (소유 시스템이 제공) */
export interface InteractableTarget {
  /** 대상 고유 id — 중복 회수 방지 키 */
  readonly interactableId: string;
  readonly kind: InteractableKind;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  /** 월드에 존재하고 회수 가능한 상태인가 (제거·소멸 시 false) */
  readonly available: boolean;
}

/** 회수 절차 수치 — 전부 공식 params 소유 (미확정이면 null) */
export interface InteractionParams {
  /** 홀드 완료까지 걸리는 시간 (초) */
  readonly holdSeconds: number | null;
  /** 회수 가능 근접 반경 (m) */
  readonly interactRadiusMeters: number | null;
  /** 회수 중 추가되는 소음 기여량 (0~1) */
  readonly noiseContribution: number | null;
}

/** 홀드 입력 단면 — 입력 어댑터가 충족 (키 바인딩은 조립부 소유) */
export interface InteractionInputSource {
  readonly interactHold: boolean;
}

/** 관측자(잠수함) 위치 단면 */
export interface InteractionActorView {
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
}

/** 완료 통지 1건 — 보상·진행 상태 소비측이 읽는다 */
export interface InteractionCompletion {
  readonly interactableId: string;
  readonly kind: InteractableKind;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  /** 완료 시각 (누적 초) — 결정적 값 */
  readonly completedAt: number;
}

/** 진행 취소 사유 — UI 안내·검증용 */
export type InteractionCancelReason = 'outOfRange' | 'targetLost' | 'inputReleased';

/** UI 소비 read model — 접근 가능 여부와 진행률만 (문구·색 없음) */
export interface InteractionReadModel {
  /** 지금 회수를 시작할 수 있는 대상이 있는가 */
  readonly available: boolean;
  /** 근접 대상 id (없으면 null) */
  readonly candidateId: string | null;
  readonly candidateKind: InteractableKind | null;
  /** 진행 중인 대상 id (없으면 null) */
  readonly activeId: string | null;
  /** 0~1. 진행 중이 아니면 0 */
  readonly progress: number;
  /** 이미 회수해 다시 할 수 없는 대상인가 */
  readonly candidateCollected: boolean;
  /** 공식 수치 미주입 — UI가 '작동 중'으로 위장하지 않게 한다 */
  readonly unwired: boolean;
}

export class InteractionSystem {
  // 검증 러너(Node 타입 스트리핑) 호환 — 매개변수 프로퍼티 미사용
  private readonly actor: InteractionActorView;
  private readonly targets: () => readonly InteractableTarget[];
  private input: InteractionInputSource | null;
  private params: InteractionParams | null;

  /** 회수 완료 id — 같은 대상 중복 회수 차단 (출항 한정) */
  private readonly collected = new Set<string>();
  private activeTargetId: string | null = null;
  private heldSeconds = 0;
  private elapsedSeconds = 0;
  private lastCancelReasonValue: InteractionCancelReason | null = null;
  private readonly completionListeners = new Set<(entry: InteractionCompletion) => void>();

  constructor(
    actor: InteractionActorView,
    targets: () => readonly InteractableTarget[],
    params: InteractionParams | null = null,
    input: InteractionInputSource | null = null,
  ) {
    this.actor = actor;
    this.targets = targets;
    this.params = params;
    this.input = input;
  }

  /** 공식 회수 수치 주입 (조립부) — null이면 unwired 유지 */
  attachParams(params: InteractionParams | null): void {
    this.params = params;
    if (!this.wired) this.cancel('targetLost');
  }

  /** 홀드 입력 연결 (조립부) — 키 바인딩은 입력 어댑터 소유 */
  attachInput(input: InteractionInputSource | null): void {
    this.input = input;
  }

  /** 수치가 전부 확정됐는가 — false면 회수가 성립하지 않는다 */
  get wired(): boolean {
    const params = this.params;
    return (
      params !== null &&
      params.holdSeconds !== null &&
      params.holdSeconds > 0 &&
      params.interactRadiusMeters !== null &&
      params.interactRadiusMeters > 0 &&
      params.noiseContribution !== null
    );
  }

  /**
   * 회수 중 소음 기여량 — **기존 `attachNoiseSource` 경로에 더해지는 값**이다.
   * 별도 소음 정본을 만들지 않는다: 조립부가 이 시스템을 소음 기여자로
   * 등록하면 탐지 환경 어댑터가 기본 소음(속도 정책)에 합산한다.
   * 회수 중이 아니면 0, 미주입이면 0.
   */
  get noiseLevel(): number {
    if (this.activeTargetId === null || !this.wired) return 0;
    return this.params?.noiseContribution ?? 0;
  }

  /** 완료 통지 구독 — 보상·진행 상태 소유 시스템이 소비한다 */
  onCompleted(listener: (entry: InteractionCompletion) => void): () => void {
    this.completionListeners.add(listener);
    return () => this.completionListeners.delete(listener);
  }

  /** 이미 회수한 대상 id (읽기 전용 — 복원·검증용) */
  get collectedIds(): readonly string[] {
    return [...this.collected];
  }

  /**
   * 회수 상태 복원 (재출항·세이브 복원 시 조립부가 호출).
   * 이 시스템은 저장하지 않는다 — 저장 정본은 기존 저장 경로 소유다.
   */
  restoreCollected(ids: readonly string[]): void {
    this.collected.clear();
    for (const id of ids) this.collected.add(id);
  }

  get lastCancelReason(): InteractionCancelReason | null {
    return this.lastCancelReasonValue;
  }

  /** UI read model — 접근 가능 여부·진행률 (내부 상태 참조 없음) */
  readModel(): InteractionReadModel {
    // 회수 가능한 후보가 우선이고, 없으면 회수된 대상이라도 보고한다
    // (UI가 '이미 회수함'을 표시할 수 있게).
    const candidate = this.nearestCandidate() ?? this.nearestCandidate(true);
    const holdSeconds = this.params?.holdSeconds ?? 0;
    return {
      available: candidate !== null && !this.collected.has(candidate.interactableId),
      candidateId: candidate?.interactableId ?? null,
      candidateKind: candidate?.kind ?? null,
      activeId: this.activeTargetId,
      progress:
        this.activeTargetId !== null && holdSeconds > 0
          ? Math.min(1, this.heldSeconds / holdSeconds)
          : 0,
      candidateCollected:
        candidate !== null && this.collected.has(candidate.interactableId),
      unwired: !this.wired,
    };
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.elapsedSeconds += deltaSeconds;
    // 수치 미주입이면 아무 절차도 진행하지 않는다 (임의 홀드 시간 금지).
    if (!this.wired) return;

    const holding = this.input?.interactHold === true;
    if (!holding) {
      if (this.activeTargetId !== null) this.cancel('inputReleased');
      return;
    }

    const active = this.activeTargetId;
    if (active === null) {
      // 이미 회수한 대상은 후보에서 빠진다 — 같은 자리에 겹쳐 있어도
      // 아직 회수하지 않은 대상을 가리지 않는다.
      const candidate = this.nearestCandidate();
      if (!candidate) return;
      this.activeTargetId = candidate.interactableId;
      this.heldSeconds = 0;
      this.lastCancelReasonValue = null;
      return;
    }

    const target = this.targets().find((entry) => entry.interactableId === active);
    // 대상 제거·비활성 → 취소
    if (!target || !target.available) {
      this.cancel('targetLost');
      return;
    }
    // 거리 이탈 → 취소
    if (this.distanceTo(target) > (this.params?.interactRadiusMeters ?? 0)) {
      this.cancel('outOfRange');
      return;
    }

    this.heldSeconds += deltaSeconds;
    const holdSeconds = this.params?.holdSeconds ?? 0;
    if (this.heldSeconds < holdSeconds) return;

    // 완료 — 대상 1개당 통지 정확히 1회, 이후 재회수 불가.
    this.collected.add(target.interactableId);
    this.activeTargetId = null;
    this.heldSeconds = 0;
    const completion: InteractionCompletion = {
      interactableId: target.interactableId,
      kind: target.kind,
      positionX: target.positionX,
      positionY: target.positionY,
      positionZ: target.positionZ,
      completedAt: this.elapsedSeconds,
    };
    for (const listener of [...this.completionListeners]) listener(completion);
  }

  /** 새 출항 초기화 — 진행 중 홀드만 정리한다. 회수 이력은 복원이 소유 */
  resetForNewSortie(): void {
    this.activeTargetId = null;
    this.heldSeconds = 0;
    this.elapsedSeconds = 0;
    this.lastCancelReasonValue = null;
  }

  dispose(): void {
    this.resetForNewSortie();
    this.completionListeners.clear();
  }

  private cancel(reason: InteractionCancelReason): void {
    if (this.activeTargetId === null) return;
    this.activeTargetId = null;
    this.heldSeconds = 0;
    this.lastCancelReasonValue = reason;
  }

  /**
   * 근접 반경 안에서 가장 가까운 대상 (없으면 null).
   * 기본은 **아직 회수하지 않은** 대상만 본다 — 회수된 대상이 같은 자리의
   * 다른 대상을 가리지 않게 한다. `includeCollected`는 read model 표시용.
   */
  private nearestCandidate(includeCollected = false): InteractableTarget | null {
    const radius = this.params?.interactRadiusMeters;
    if (radius === null || radius === undefined || !(radius > 0)) return null;
    let best: InteractableTarget | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const target of this.targets()) {
      if (!target.available) continue;
      if (!includeCollected && this.collected.has(target.interactableId)) continue;
      const distance = this.distanceTo(target);
      if (distance > radius) continue;
      if (distance < bestDistance) {
        best = target;
        bestDistance = distance;
      }
    }
    return best;
  }

  private distanceTo(target: InteractableTarget): number {
    return Math.hypot(
      target.positionX - this.actor.positionX,
      target.positionY - this.actor.positionY,
      target.positionZ - this.actor.positionZ,
    );
  }
}
