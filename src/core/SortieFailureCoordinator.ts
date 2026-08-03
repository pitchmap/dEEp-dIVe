/**
 * 출항 실패 조정자 (INT-CORE-014, C6·C7·C8).
 *
 * 파괴 1회 → 실패 1회 → 정산 1회. 기존 코드를 **복제하지 않는다**:
 *  - 손실 계산·지갑·상태 전이 = `MetaLoop.settleSortie({outcome:'destroyed'})`
 *    (손실률은 `params/economy.json creditLossOnDestroyedRatio`)
 *  - 저장 = MetaLoop이 발행하는 기존 `saveRequested('settlement')` → SaveBridge.
 *    **코디네이터는 SavePort를 직접 호출하지 않는다**(저장 책임 표 A-12 유지).
 *  - 기지 복귀 = **사용자 확인 command**(`DebriefConfirmCommand`) 경유의
 *    `MetaLoop.completeDebrief()` [INT-CORE-016 개정 — 저장 성공이 BASE
 *    전환을 자동으로 일으키지 않는다. 이 코디네이터는 전환하지 않는다]
 *
 * 상태 규약: `MetaState`를 확장하지 않는다 — 파괴 사실은
 * `PlayerHullState.isDestroyed`가 소유하고 메타는 `DEBRIEF`를 쓴다.
 *
 * 저장 실패 정책:
 *  - 정산은 이미 지갑에 반영됐으므로 **재정산하지 않는다**(중복 정산 금지)
 *  - `DEBRIEF`에 머문다 — 기지로 넘어가지 않는다
 *  - `retrySave()`로 저장만 재시도하고, 성공 시 확인 command가 활성화된다
 *  - 저장 실패를 성공으로 보고하지 않는다
 */

import type {
  DamageSourceType,
  FailureSaveStatus,
  SortieFailurePort,
  SortieFailureReason,
  SortieFailureReport,
  SortieResettable,
} from '../contracts/survival';
import type { EventBus } from './EventBus';
import type { GameSystem, SystemContext } from './GameSystem';

/** 코디네이터가 소비하는 메타 루프 단면 (구현체 직접 참조 금지) */
export interface FailureMetaPort {
  readonly metaState: string;
  readonly wallet: { readonly credits: number; readonly rareParts: number };
  readonly sortieCreditsEarned: number;
  readonly sortieRarePartsSecured: number;
  settleSortie(report: { outcome: 'destroyed' }): void;
  completeDebrief(): void;
}

/** 저장 결과 관측 단면 — SaveBridge가 충족(직접 저장 호출 아님) */
export interface FailureSaveObserver {
  readonly lastSaveSucceeded: boolean;
}

export class SortieFailureCoordinator implements GameSystem, SortieFailurePort, SortieResettable {
  readonly id = 'sortieFailure';

  private readonly meta: FailureMetaPort;
  private readonly saveObserver: FailureSaveObserver | null;
  private readonly onSettled: (() => void) | null;

  private bus: EventBus | null = null;
  private unsubscribe: (() => void) | null = null;
  /** 이번 출항에서 이미 실패를 처리했는가 (중복 실패·중복 정산 방지) */
  private handledFailureId: string | null = null;
  private lastReportValue: SortieFailureReport | null = null;

  constructor(
    meta: FailureMetaPort,
    saveObserver: FailureSaveObserver | null = null,
    onSettled: (() => void) | null = null,
  ) {
    this.meta = meta;
    this.saveObserver = saveObserver;
    this.onSettled = onSettled;
  }

  get lastReport(): SortieFailureReport | null {
    return this.lastReportValue;
  }

  initialize(context: SystemContext): void {
    this.bus = context.bus;
    // 파괴 통지는 선체 상태 하나에서만 온다 (판정 복제 없음).
    this.unsubscribe = context.bus.on('playerDestroyed', (payload) => {
      this.reportDestroyed({
        failureId: `failure:${payload.reason}:${payload.destroyedByEntityId ?? 'none'}`,
        reason: payload.reason,
        destroyedByEntityId: payload.destroyedByEntityId,
        damageSource: payload.damageSource,
      });
    });
  }

  /**
   * 파괴 보고 → 실패 정산 1회.
   * 이미 처리된 출항이면 `null`(중복 정산 없음).
   */
  reportDestroyed(input: {
    readonly failureId: string;
    readonly reason: SortieFailureReason;
    readonly destroyedByEntityId: number | null;
    readonly damageSource: DamageSourceType | null;
  }): SortieFailureReport | null {
    if (this.handledFailureId !== null) return null;
    // 파괴는 해역 세션에서만 유효하다 — 기지·정산 중 보고는 무시한다.
    if (this.meta.metaState !== 'SORTIE') return null;

    const pendingCredits = this.meta.sortieCreditsEarned;
    const securedRareParts = this.meta.sortieRarePartsSecured;
    const creditsBefore = this.meta.wallet.credits;

    this.handledFailureId = input.failureId;
    // 정산·손실률·지갑·저장 요청은 전부 기존 경로가 수행한다.
    this.meta.settleSortie({ outcome: 'destroyed' });

    const creditsAfter = this.meta.wallet.credits;
    const gained = creditsAfter - creditsBefore;
    const appliedLoss = Math.max(0, pendingCredits - gained);
    const saveStatus = this.currentSaveStatus();

    const report: SortieFailureReport = {
      failureId: input.failureId,
      reason: input.reason,
      destroyedByEntityId: input.destroyedByEntityId,
      damageSource: input.damageSource,
      pendingCredits,
      securedRareParts,
      appliedLoss,
      finalCredits: creditsAfter,
      finalRareParts: this.meta.wallet.rareParts,
      saveStatus,
      nextState: 'DEBRIEF',
    };

    // [INT-CORE-016] 저장 성공이어도 자동 전환하지 않는다 — nextState는
    // DEBRIEF로 남고, BASE 복귀는 확인 command(DebriefConfirmCommand) 소유.
    this.lastReportValue = report;
    this.onSettled?.();
    this.bus?.emit('sortieFailed', { report });
    return report;
  }

  /**
   * 저장 실패 후 재시도 — **재정산하지 않는다.**
   * 저장 성공 시에만 기지로 전환한다. 처리할 실패가 없으면 null.
   */
  retrySave(retrySave: () => boolean): SortieFailureReport | null {
    const previous = this.lastReportValue;
    if (!previous || previous.saveStatus === 'saved') return null;

    const succeeded = retrySave();
    // 재정산 없음 · 자동 전환 없음 — 성공 시 확인 command가 활성화된다.
    const report: SortieFailureReport = {
      ...previous,
      saveStatus: succeeded ? 'saved' : 'saveFailed',
    };
    this.lastReportValue = report;
    return report;
  }

  update(_deltaSeconds: number): void {}

  /** 출항 한정 상태 — 새 출항에서 다시 실패를 처리할 수 있어야 한다 */
  resetForNewSortie(): void {
    this.handledFailureId = null;
    this.lastReportValue = null;
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.bus = null;
  }

  private currentSaveStatus(): FailureSaveStatus {
    if (!this.saveObserver) return 'notAttempted';
    return this.saveObserver.lastSaveSucceeded ? 'saved' : 'saveFailed';
  }
}
