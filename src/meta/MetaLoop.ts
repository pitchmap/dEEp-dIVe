/**
 * 상위 메타 루프 — 기지 → 출항 준비 → 해역 세션 → 귀환 정산 → 기지
 * (소회의 결의 2 — 2계층 상태 머신의 상위 계층, 리드 소유).
 *
 * 계층 경계 [확정]:
 *  - 하위 해역 세션(기존 core/GameStateMachine + 전투 시스템)은 무수정 포장.
 *    상위는 하위 내부 상태를 **직접 읽지 않는다.**
 *  - 통신은 3종뿐: ① 세션 시작(SortieSessionPort.start) ② 세션 결과
 *    (settleSortie 호출) ③ 중도 귀환(port.requestReturnToBase — 요청은
 *    returnToBaseRequested 이벤트로 수신).
 *
 * 정산·보존 [6차 결의 7·9]:
 *  - 출항 중 lootDropped를 집계한다. 희귀 부품은 획득 **즉시** 지갑 확정 +
 *    saveRequested('rarePart') 발행 (귀환길 파괴로도 잃지 않는다).
 *  - 세션 결과 수신 시 정산(computeSortieSettlement — 파괴는 크레딧 일부
 *    손실) 후 sortieEnded 발행, 확정 직후 saveRequested('settlement') 발행.
 *  - 영구 성장 데이터(지갑·업그레이드)는 이 계층이 보존한다. 그 외 자동
 *    저장 없음.
 *
 * 주의: 생성자 매개변수 프로퍼티 미사용 — 검증 러너(run.mjs)가 Node 타입
 * 스트리핑으로 직접 로드하므로 삭제 가능 문법만 쓴다 (src/systems와 동일 규칙).
 */

import type {
  CurrencyBundle,
  MetaStateId,
  SortieReport,
  PurchaseCost,
  SortieSessionPort,
  WalletTransactionPort,
} from '../contracts/meta';
import type { EventBus, Unsubscribe } from '../core/EventBus';
import type { GameSystem, SystemContext } from '../core/GameSystem';
import { META_TRANSITIONS } from './MetaState';
import { computeSortieSettlement } from './settlement';

export interface MetaLoopOptions {
  /** 파괴 시 크레딧 손실률 0~1 (임시: provisionalEconomy — params 이관 대기) */
  creditLossOnDestroyedRatio: number;
}

export class MetaLoop implements GameSystem, WalletTransactionPort {
  readonly id = 'metaLoop';

  private readonly bus: EventBus;
  private readonly session: SortieSessionPort;
  private readonly creditLossOnDestroyedRatio: number;

  private state: MetaStateId = 'BASE';
  private sortieCount = 0;
  /** 이번 출항 집계 (정산 전 크레딧은 파괴 시 손실 대상) */
  private tallyCredits = 0;
  private tallyRareParts = 0;
  /** 영구 지갑 — 저장 대상. 희귀 부품은 즉시 확정 반영 */
  private walletCredits = 0;
  private walletRareParts = 0;

  private readonly unsubscribes: Unsubscribe[] = [];

  constructor(bus: EventBus, session: SortieSessionPort, options: MetaLoopOptions) {
    this.bus = bus;
    this.session = session;
    this.creditLossOnDestroyedRatio = options.creditLossOnDestroyedRatio;
  }

  get metaState(): MetaStateId {
    return this.state;
  }

  get sortieNumber(): number {
    return this.sortieCount;
  }

  /** 영구 지갑 스냅숏 (저장 시스템·기지 UI 소비용 — 읽기 전용) */
  get wallet(): CurrencyBundle {
    return { credits: this.walletCredits, rareParts: this.walletRareParts };
  }

  initialize(_context: SystemContext): void {
    // 드롭 집계 — 발행은 게임플레이 economy, 집계·확정은 메타 계층 소유
    this.unsubscribes.push(
      this.bus.on('lootDropped', (payload) => this.collectLoot(payload.credits, payload.rareParts)),
    );
    // ③ 중도 귀환 요청 — SORTIE 밖 요청은 무시 (INTERFACES 계약)
    this.unsubscribes.push(
      this.bus.on('returnToBaseRequested', () => this.requestReturnToBase()),
    );
  }

  /** 이벤트 구동 계층 — 프레임 단위 시뮬레이션 없음 */
  update(_deltaSeconds: number): void {}

  dispose(): void {
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes.length = 0;
  }

  /**
   * 저장된 영구 지갑 복원 — 부팅 시 1회, BASE 상태에서만 허용한다.
   *
   * PvE 1차 통합 최소 보완: 지갑은 증가 경로(collectLoot·settleSortie)만
   * 있어 저장 데이터를 되돌릴 수 없었다. 저장 코드가 메타 상태 머신을
   * 직접 조작하지 않는다는 원칙을 지키기 위해, 복원은 이 명시적 API
   * 하나로만 들어온다 (상태 전이는 일으키지 않는다).
   * 출항 중 호출은 집계와 충돌하므로 거부한다.
   */
  restoreWallet(wallet: CurrencyBundle): void {
    if (this.state !== 'BASE') {
      throw new Error(
        `[MetaLoop] 지갑 복원은 BASE 상태에서만 가능합니다 (현재: ${this.state})`,
      );
    }
    if (!Number.isFinite(wallet.credits) || wallet.credits < 0) {
      throw new Error(`[MetaLoop] 복원 크레딧이 올바르지 않습니다: ${wallet.credits}`);
    }
    if (!Number.isFinite(wallet.rareParts) || wallet.rareParts < 0) {
      throw new Error(`[MetaLoop] 복원 희귀 부품 수가 올바르지 않습니다: ${wallet.rareParts}`);
    }
    this.walletCredits = Math.floor(wallet.credits);
    this.walletRareParts = Math.floor(wallet.rareParts);
  }

  /* ── WalletTransactionPort (구매 트랜잭션 전용 — 지갑 소유자로서 구현) ── */

  /** 트랜잭션 스냅샷용 — wallet getter와 동일한 복사본 */
  snapshotWallet(): CurrencyBundle {
    return this.wallet;
  }

  /**
   * 구매 비용 차감 — 잔액 부족·유효하지 않은 비용·기지 밖이면 false·무변경
   * (throw 금지 계약). 구매는 기지(BASE)에서만 일어난다 — 출항 중 차감은
   * 출항 집계·정산과 충돌하므로 거부한다.
   */
  spendFromWallet(cost: PurchaseCost): boolean {
    if (this.state !== 'BASE') return false;
    const credits = Math.floor(cost.credits);
    const rareParts = Math.floor(cost.rareParts);
    if (!Number.isFinite(credits) || !Number.isFinite(rareParts)) return false;
    if (credits < 0 || rareParts < 0) return false;
    if (this.walletCredits < credits || this.walletRareParts < rareParts) return false;
    this.walletCredits -= credits;
    this.walletRareParts -= rareParts;
    return true;
  }

  /** 기지 → 출항 준비 */
  beginSortiePrep(): void {
    this.transition('SORTIE_PREP');
  }

  /** 출항 준비 → 기지 (출항 취소) */
  cancelSortiePrep(): void {
    this.transition('BASE');
  }

  /**
   * 출항 — ① 세션 시작. 출항 집계를 리셋하고 하위 세션을 재시작한다.
   * 기지에서 출항하면 기존 전투 세션이 초기화되는 규칙의 진입점.
   */
  launchSortie(): void {
    // 출항 확정 직전 저장 [13차 결의 4 — 저장 시점 5종] — 아직 SORTIE_PREP
    // 상태에서 발행한다 (허용표 밖 상태면 발행 없이 아래 transition이 던진다)
    if (this.state === 'SORTIE_PREP') {
      this.bus.emit('saveRequested', { cause: 'sortieLaunch' });
    }
    this.transition('SORTIE');
    this.sortieCount += 1;
    this.tallyCredits = 0;
    this.tallyRareParts = 0;
    this.bus.emit('sortieStarted', { sortieNumber: this.sortieCount });
    this.session.start();
  }

  /** ③ 중도 귀환 — 하위 세션에 정리를 위임한다. SORTIE 밖에서는 무시 */
  requestReturnToBase(): void {
    if (this.state !== 'SORTIE') return;
    this.session.requestReturnToBase();
  }

  /**
   * ② 세션 결과 수신 — 하위→상위의 유일한 데이터 통로.
   * 정산 계산 → 지갑 반영 → sortieEnded → saveRequested('settlement').
   * 파괴 결과도 여기로 온다 (크레딧 일부 손실이 정산 데이터에 반영됨).
   */
  settleSortie(report: SortieReport): void {
    this.transition('DEBRIEF');
    const settlement = computeSortieSettlement({
      outcome: report.outcome,
      creditsEarned: this.tallyCredits,
      rarePartsSecured: this.tallyRareParts,
      creditLossOnDestroyedRatio: this.creditLossOnDestroyedRatio,
    });
    // 희귀 부품은 collectLoot 시점에 이미 지갑 확정 — 여기서는 크레딧만 반영
    this.walletCredits += settlement.creditsNet;
    this.bus.emit('sortieEnded', { sortieNumber: this.sortieCount, settlement });
    this.bus.emit('saveRequested', { cause: 'settlement' });
  }

  /** 정산 확인 → 기지 복귀 (정산 UI 도입 전에는 조립부·테스트가 호출) */
  completeDebrief(): void {
    this.transition('BASE');
  }

  private collectLoot(credits: number, rareParts: number): void {
    if (this.state !== 'SORTIE') return; // 세션 밖 드롭은 계약 위반 — 무시
    if (credits > 0) this.tallyCredits += credits;
    if (rareParts > 0) {
      this.tallyRareParts += rareParts;
      // 희귀 부품 즉시 확정 [6차 결의 9] — 지갑 반영 + 즉시 저장 요청
      this.walletRareParts += rareParts;
      this.bus.emit('saveRequested', { cause: 'rarePart' });
    }
  }

  private transition(next: MetaStateId): void {
    const allowed = META_TRANSITIONS[this.state];
    if (!allowed.includes(next)) {
      throw new Error(
        `[MetaLoop] 허용되지 않은 메타 상태 전환: ${this.state} → ${next} ` +
          `(허용: ${allowed.join(', ') || '없음'})`,
      );
    }
    const previous = this.state;
    this.state = next;
    this.bus.emit('metaStateChanged', { previous, next });
  }
}
