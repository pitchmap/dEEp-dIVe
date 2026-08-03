/**
 * 단서 회수 진행 상태 — M2 2단계 (16차 결의 1-5 / 17차 결의 3 창 2).
 *
 * ## 경계 (중요)
 *
 * 이 파일은 **획득만** 소유한다. 17차 창 범위표에서 "단서 3개 → 보스 구역
 * 개방 게이트 로직"은 **창 1(리드)** 소유이고, "획득 자체는 창 2의
 * `InteractionSystem` 소비"다. 따라서 여기에는
 *
 *  - 보스 구역 개방 판정이 없다 (리드가 `progressSource`를 읽고 판정한다)
 *  - 저장이 없다 (저장 정본은 기존 저장 경로 소유 — 복원만 받는다)
 *  - 회수 절차가 없다 (절차 정본은 `InteractionSystem` 하나)
 *
 * ## 획득원 3종은 기존 콘텐츠 재사용이다
 *
 * 16차 결의 1-5 "단서 3개 획득원 = 기존 콘텐츠 재사용" — 난파선 salvage /
 * 적대 고가치 수송선 / 경비 심층 탐사 지점. 이 시스템은 그 콘텐츠를
 * **만들지 않는다**: 어떤 회수 대상이 어떤 단서를 주는지는 기획·월드가
 * 소유하는 `ClueDefinition` 목록으로 주입된다. 목록이 없으면 `unwired`이며
 * 단서가 하나도 성립하지 않는다 — 단서 id를 코드에서 발명하지 않는다.
 *
 * 필요 개수도 상수로 두지 않는다. 주입된 정의 개수가 곧 필요 개수다
 * ("단서 3개"는 정의 3건으로 표현되며, 코드에 3이 없다).
 */

import type { InteractionCompletion } from '../interaction/InteractionSystem';

/** 단서 획득원 분류 — 표시·검증용 태그이며 절차 분기가 아니다 */
export type ClueSourceKind = 'wreckSalvage' | 'highValueTransport' | 'deepSurvey';

/** 단서 1건의 정의 — 기획·월드 소유 데이터 (게임플레이가 만들지 않는다) */
export interface ClueDefinition {
  /** 단서 고유 id — 중복 획득 차단 키 */
  readonly clueId: string;
  readonly sourceKind: ClueSourceKind;
  /** 이 단서를 주는 회수 대상 id (`InteractableTarget.interactableId`) */
  readonly interactableId: string;
}

/**
 * 리드(창 1) 보스 구역 개방 게이트가 소비하는 읽기 전용 단면.
 * 게이트 **판정은 여기 없다** — 개방 조건은 리드가 소유한다.
 */
export interface ClueProgressSource {
  readonly collectedCount: number;
  readonly requiredCount: number;
  /** 정의된 단서를 모두 회수했는가 (개방 판정 자체는 리드 소유) */
  readonly allCollected: boolean;
  readonly collectedClueIds: readonly string[];
}

/** UI 소비 read model — 문구·색 없음 */
export interface ClueProgressReadModel extends ClueProgressSource {
  readonly pendingClueIds: readonly string[];
  /** 단서 정의 미주입 — UI가 '진행 중'으로 위장하지 않게 한다 */
  readonly unwired: boolean;
}

/** 획득 1건 통지 */
export interface ClueCollectedEntry {
  readonly clueId: string;
  readonly sourceKind: ClueSourceKind;
  readonly interactableId: string;
  /** 회수 완료 시각 (누적 초) — `InteractionCompletion`이 준 값 그대로 */
  readonly completedAt: number;
}

export class CluePickupProgress {
  /** interactableId → 정의 (주입 전에는 비어 있다) */
  private definitions = new Map<string, ClueDefinition>();
  /** 획득한 단서 id — 출항을 넘어 유지된다 (복원으로만 초기화) */
  private readonly collected = new Set<string>();
  private readonly listeners = new Set<(entry: ClueCollectedEntry) => void>();

  /**
   * 단서 정의 주입 (조립부) — null이면 unwired.
   * 같은 `interactableId`가 두 번 오면 뒤엣것이 이긴다(정의는 데이터 소유).
   */
  attachDefinitions(definitions: readonly ClueDefinition[] | null): void {
    this.definitions = new Map();
    for (const definition of definitions ?? []) {
      this.definitions.set(definition.interactableId, definition);
    }
  }

  /** 단서가 성립하는가 — false면 회수해도 진행이 오르지 않는다 */
  get wired(): boolean {
    return this.definitions.size > 0;
  }

  /**
   * 회수 완료 1건 소비 — `InteractionSystem.onCompleted`에 연결한다.
   * 단서가 아닌 대상(금괴·일반 salvage)은 조용히 무시한다: 대상 타입별
   * 시스템을 만들지 않기 위해 완료 통지는 하나의 흐름으로 오고, 소비측이
   * 자기 몫만 집는다.
   *
   * 같은 단서를 두 번 회수할 수는 없다 — `InteractionSystem`이 대상 단위로
   * 이미 막지만, 단서 id 단위로도 막는다(서로 다른 대상이 같은 단서를
   * 가리키도록 정의될 수 있으므로).
   */
  handleCompletion(entry: InteractionCompletion): boolean {
    const definition = this.definitions.get(entry.interactableId);
    if (!definition) return false;
    if (this.collected.has(definition.clueId)) return false;
    this.collected.add(definition.clueId);
    const collected: ClueCollectedEntry = {
      clueId: definition.clueId,
      sourceKind: definition.sourceKind,
      interactableId: definition.interactableId,
      completedAt: entry.completedAt,
    };
    for (const listener of [...this.listeners]) listener(collected);
    return true;
  }

  /** 획득 통지 구독 (리드 게이트·UI·사운드) */
  onClueCollected(listener: (entry: ClueCollectedEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 리드 게이트가 읽는 단면 — 살아 있는 참조(폴링 가능) */
  get progressSource(): ClueProgressSource {
    const self = this;
    return {
      get collectedCount() {
        return self.collectedClueIds.length;
      },
      get requiredCount() {
        return self.definitions.size;
      },
      get allCollected() {
        return self.wired && self.collectedClueIds.length >= self.definitions.size;
      },
      get collectedClueIds() {
        return self.collectedClueIds;
      },
    };
  }

  /** 정의된 단서 중 회수한 것 (정의 밖 잔여 id는 세지 않는다) */
  get collectedClueIds(): readonly string[] {
    const defined = new Set([...this.definitions.values()].map((entry) => entry.clueId));
    return [...this.collected].filter((clueId) => defined.has(clueId));
  }

  readModel(): ClueProgressReadModel {
    const collectedIds = this.collectedClueIds;
    const collectedSet = new Set(collectedIds);
    return {
      collectedCount: collectedIds.length,
      requiredCount: this.definitions.size,
      allCollected: this.wired && collectedIds.length >= this.definitions.size,
      collectedClueIds: collectedIds,
      pendingClueIds: [...this.definitions.values()]
        .map((entry) => entry.clueId)
        .filter((clueId) => !collectedSet.has(clueId)),
      unwired: !this.wired,
    };
  }

  /** 저장된 획득 이력 복원 (조립부) — 이 시스템은 저장하지 않는다 */
  restoreCollected(clueIds: readonly string[]): void {
    this.collected.clear();
    for (const clueId of clueIds) this.collected.add(clueId);
  }

  /**
   * 새 출항 — **단서 획득 이력을 지우지 않는다.** 단서는 출항을 가로질러
   * 누적되어야 보스 구역이 열린다(16차 결의 1-5). 재출항 후 복원 요구는
   * `restoreCollected`가 충족한다.
   */
  resetForNewSortie(): void {
    /* 유지 상태만 있으므로 초기화할 출항 한정 상태가 없다 */
  }

  dispose(): void {
    this.listeners.clear();
  }
}
