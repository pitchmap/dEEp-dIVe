/**
 * 회수 완료 → 공식 `interactionCollected` 발행 어댑터 (INT-CORE-021).
 *
 * ## 무상태다 — 이게 이 파일의 핵심 제약
 *
 * 리드가 INT-CORE-021에서 못 박았다: **단서 원장·중복 방지·저장 복원·해금
 * 판정·보스 구역 게이트의 정본은 `meta/BossProgressStore` 하나**이고,
 * 게임플레이 어댑터는 **매핑·변환·발행만** 소유하는 무상태 계층이다.
 *
 * 그래서 이 파일에는 다음이 **없다**:
 *  - 수집한 단서 목록(원장) — 중복 방지는 두 곳이 한다: 대상 단위는
 *    `InteractionSystem.collected`, 단서 단위는 `BossProgressStore`
 *  - 저장·복원 — 저장 정본은 save v2 `progress` 블록
 *  - 해금·필요 개수 계산 — `BossProgressStore.unlocked`
 *
 * (이전 `progress/CluePickupProgress`가 이 셋을 들고 있었으나 중복 정본
 * 금지에 따라 **삭제**했다. 남은 것은 아래 매핑 데이터뿐이다.)
 *
 * ## 두 ID의 의미 분리
 *
 * ```
 * targetId = 월드 interactable 고유 ID (모든 kind 공통, 단서 ID 아님)
 * clueId   = canonical 단서 ID (params/boss.json unlock.clueIds)
 *            kind === 'clue' 에서만 존재 — 계약이 타입 수준으로 강제
 * ```
 *
 * `targetId`를 `clueId`로 재사용하거나 문자열 조작으로 추측하지 않는다.
 * 매핑은 **주입 데이터**이며, 매핑이 없는 단서 대상은 **발행하지 않는다**
 * (틀린 clueId를 만들어 내느니 발행 0이 옳다 — `unmappedClueCount`로 드러난다).
 *
 * ## kind 변환은 여기 한 곳뿐
 *
 * 게임플레이 내부 태그(`gold | salvage | clue | deepSurvey`)와 계약 정본
 * (`goldCache | salvage | clue | deepSite`)이 다르다. 변환표는 이 파일의
 * `CANONICAL_KIND` 하나이며 다른 곳에서 문자열을 다시 매핑하지 않는다.
 *
 * ## params/boss.json 직접 import 금지
 *
 * canonical 단서 ID의 출처는 `params/boss.json unlock.clueIds`지만, 이
 * 파일은 그 JSON을 읽지 않는다 — 조립부가 검증된 값으로 매핑을 주입한다.
 */

import type { InteractionCollectedEvent, InteractionTargetKind } from '../../contracts/meta';
import type { EventBus } from '../../core/EventBus';
import type { InteractableKind, InteractionCompletion } from './InteractionSystem';

/**
 * 내부 태그 → 계약 정본 kind. **변환은 이 표 하나뿐이다.**
 * 두 어휘가 다른 것은 사실이므로 감추지 않고 한 곳에서 명시적으로 옮긴다.
 */
const CANONICAL_KIND: Readonly<Record<InteractableKind, InteractionTargetKind>> = Object.freeze({
  gold: 'goldCache',
  salvage: 'salvage',
  clue: 'clue',
  deepSurvey: 'deepSite',
});

/** 계약 정본 kind로 변환 (읽기 전용 조회 — 부작용 없음) */
export function canonicalInteractionKind(kind: InteractableKind): InteractionTargetKind {
  return CANONICAL_KIND[kind];
}

/**
 * interactable → canonical 단서 ID 매핑 (기획·월드 소유 데이터).
 * 조립부가 `params/boss.json unlock.clueIds`에 실재하는 ID로만 채운다.
 * 미주입이면 단서 발행이 성립하지 않는다 — ID를 만들어 내지 않는다.
 */
export type ClueIdByInteractable = Readonly<Record<string, string>>;

/** 발행 결과 — '왜 발행되지 않았는지'를 구분할 수 있어야 한다 */
export type InteractionPublishOutcome =
  | { readonly status: 'published'; readonly event: InteractionCollectedEvent }
  /** kind가 clue인데 canonical 단서 ID 매핑이 없다 — 추측하지 않고 발행 0 */
  | { readonly status: 'unmappedClue'; readonly targetId: string };

export class InteractionEventAdapter {
  // 검증 러너(Node 타입 스트리핑) 호환 — 매개변수 프로퍼티 미사용
  private readonly bus: EventBus;
  private clueIds: ClueIdByInteractable;
  /** 관측용 카운터만 둔다 — 게임 판정에 쓰이지 않는 진단 값이다 */
  private publishedCount = 0;
  private unmappedClues = 0;

  constructor(bus: EventBus, clueIds: ClueIdByInteractable = {}) {
    this.bus = bus;
    this.clueIds = clueIds;
  }

  /** 단서 ID 매핑 주입 (조립부) — 미주입이면 단서 발행이 성립하지 않는다 */
  attachClueIds(clueIds: ClueIdByInteractable | null): void {
    this.clueIds = clueIds ?? {};
  }

  /** 단서 매핑이 하나라도 있는가 — false면 clue 회수가 발행되지 않는다 */
  get clueMappingWired(): boolean {
    return Object.keys(this.clueIds).length > 0;
  }

  get published(): number {
    return this.publishedCount;
  }

  /** 매핑이 없어 발행하지 못한 단서 회수 횟수 (진단 — 조용한 누락 방지) */
  get unmappedClueCount(): number {
    return this.unmappedClues;
  }

  /**
   * 완료 통지 1건 → 이벤트 1회.
   *
   * `InteractionSystem`이 대상 1개당 완료를 **정확히 1회**만 통지하고
   * 회수 이력으로 재회수를 막으므로, 이 어댑터는 자체 중복 원장을 두지
   * 않는다(정본 중복 금지). 진행 중·거리 이탈·대상 제거·입력 해제는
   * 애초에 완료 통지가 없으므로 발행도 0이다.
   */
  publish(entry: InteractionCompletion): InteractionPublishOutcome {
    const kind = canonicalInteractionKind(entry.kind);
    if (kind === 'clue') {
      const clueId = this.clueIds[entry.interactableId];
      if (typeof clueId !== 'string' || clueId.length === 0) {
        this.unmappedClues += 1;
        return { status: 'unmappedClue', targetId: entry.interactableId };
      }
      const event: InteractionCollectedEvent = {
        kind: 'clue',
        targetId: entry.interactableId,
        clueId,
        x: entry.positionX,
        z: entry.positionZ,
      };
      this.publishedCount += 1;
      this.bus.emit('interactionCollected', event);
      return { status: 'published', event };
    }

    // 비단서 kind는 `clueId`를 실을 수 없다 (계약이 타입 수준으로 금지).
    const event: InteractionCollectedEvent = {
      kind,
      targetId: entry.interactableId,
      x: entry.positionX,
      z: entry.positionZ,
    };
    this.publishedCount += 1;
    this.bus.emit('interactionCollected', event);
    return { status: 'published', event };
  }
}
