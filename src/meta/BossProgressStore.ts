/**
 * M2 단서·보스 해금 진행 정본 (리드 소유 — 17차 결의 3 창 1).
 *
 * ## 규칙
 *
 *  - **정본 소유권 (INT-CORE-021)**: 단서 *진행*의 정본 — 원장(수집 id
 *    목록)·중복 방지·저장 복원·해금 판정·보스 구역 게이트 — 은 이 스토어
 *    하나다. 게임플레이 어댑터(후속 창)는 interactableId→canonical clueId
 *    매핑과 `interactionCollected` 이벤트 발행만 소유하는 **무상태** 변환
 *    계층이며, 진행 상태를 따로 들지 않는다. 게임플레이 쪽
 *    `CluePickupProgress`류의 영속·복원·중복 방지 로직은 병합 대상이
 *    아니다(중복 정본 금지).
 *  - 단서 *획득 판정* 자체는 게임플레이 `InteractionSystem`이 정본이다 —
 *    이 스토어는 `kind === 'clue'`의 canonical `clueId`만 **소비**하며 별도
 *    상호작용 판정을 만들지 않는다 (조립부가 구독을 잇는다. `targetId`는
 *    월드 interactable ID이므로 여기 전달하지 않는다).
 *  - **동일 단서 중복 반영 금지**: 반영 단위는 단서 id다. 재접속 후에도
 *    id 목록이 저장(`progress.bossCluesCollected`, 스키마 v2)에서 복원되므로
 *    같은 단서는 영구히 한 번만 세어진다.
 *  - 정본 단서 id는 `params/boss.json unlock.clueIds` — 목록 밖 id는
 *    `unknownClue`로 거부한다(획득 경로 버그가 해금을 앞당기지 못하게).
 *  - 해금은 단조 상태다: 수집 수 ≥ requiredClues 가 되는 순간 true가 되고,
 *    이후 어떤 경로로도 false로 되돌리지 않는다(저장 복원 포함).
 *  - 저장 자체는 기존 경로 재사용 — 이 스토어는 SaveStore를 직접 호출하지
 *    않고 `snapshot()`을 SaveBridge 스냅샷 소스에 제공할 뿐이다
 *    (저장 책임 표 A-12 유지).
 */

import type { BossClueOutcome, BossZoneEntryOutcome, BossZoneGatePort } from '../contracts/boss';
import type { EventBus } from '../core/EventBus';
import type { SaveData } from './save/saveSchema';

export interface BossProgressOptions {
  readonly requiredClues: number;
  /** 정본 단서 id 목록 (params/boss.json unlock.clueIds) */
  readonly clueIds: readonly string[];
}

export class BossProgressStore implements BossZoneGatePort {
  // 검증 러너(Node 타입 스트리핑) 호환 — 매개변수 프로퍼티 미사용
  private readonly bus: EventBus | null;
  private readonly required: number;
  private readonly canonicalClueIds: ReadonlySet<string>;

  private readonly collected = new Set<string>();
  private unlockedFlag = false;
  private defeatedFlag = false;

  constructor(options: BossProgressOptions, bus: EventBus | null = null) {
    this.bus = bus;
    this.required = Math.max(1, Math.floor(options.requiredClues));
    this.canonicalClueIds = new Set(options.clueIds);
  }

  /* ── 저장 복원·스냅샷 (기존 저장 시스템 재사용) ──────────────── */

  /**
   * 부팅 시 1회, 조립부에서만 호출 (지갑 복원과 동일 규약).
   * 구버전 합성 id(`legacy-clue-*`)도 목록에 보존한다 — 정본 id와 겹치지
   * 않으므로 같은 단서의 이중 반영은 없고, 해금 플래그는 단조 유지된다.
   */
  restore(progress: SaveData['progress']): void {
    this.collected.clear();
    for (const clueId of progress.bossCluesCollected) this.collected.add(clueId);
    this.unlockedFlag = progress.bossUnlocked || this.collected.size >= this.required;
    this.defeatedFlag = progress.bossDefeated;
  }

  /** SaveBridge 스냅샷 소스 제공용 — 저장 코드는 상태를 바꾸지 않는다 */
  snapshot(): SaveData['progress'] {
    return {
      bossCluesCollected: [...this.collected],
      bossUnlocked: this.unlockedFlag,
      bossDefeated: this.defeatedFlag,
    };
  }

  /* ── 단서 반영 (interactionCollected kind==='clue' 소비) ───────── */

  collectClue(clueId: string): BossClueOutcome {
    if (!this.canonicalClueIds.has(clueId)) return 'unknownClue';
    if (this.collected.has(clueId)) return 'duplicate';
    this.collected.add(clueId);
    if (this.collected.size >= this.required) this.unlockedFlag = true;
    this.bus?.emit('bossCluesChanged', {
      collected: this.collectedCanonicalCount,
      required: this.required,
      unlocked: this.unlockedFlag,
    });
    return 'collected';
  }

  /** 정본 단서 기준 수집 수 (legacy 합성 id 제외 — 0/3 표시용) */
  get collectedCanonicalCount(): number {
    let count = 0;
    for (const clueId of this.collected) {
      if (this.canonicalClueIds.has(clueId)) count += 1;
    }
    return count;
  }

  /* ── 격파 기록 (M2 — 데모 완료) ────────────────────────────── */

  /** 격파 기록 — 최초 1회만 true 반환 (보상·기록 저장 각 1회 보장의 키) */
  markDefeated(): boolean {
    if (this.defeatedFlag) return false;
    this.defeatedFlag = true;
    return true;
  }

  get defeated(): boolean {
    return this.defeatedFlag;
  }

  /* ── 계약 BossZoneGatePort ─────────────────────────────────── */

  get unlocked(): boolean {
    return this.unlockedFlag;
  }

  get requiredClues(): number {
    return this.required;
  }

  get collectedClueIds(): readonly string[] {
    return [...this.collected];
  }

  /** 보스 구역 진입 판정 — 3개 미만이면 거부 (구역 전환은 소비처 소유) */
  requestEntry(): BossZoneEntryOutcome {
    return this.unlockedFlag ? 'granted' : 'lockedMissingClues';
  }
}
