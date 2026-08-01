/**
 * 원자적 업그레이드 구매 트랜잭션 — 틀(순서·스냅샷·commit·rollback)은 리드
 * 소유, 내용(가격·가능 판정)은 게임플레이 판정 포트 소유 (13차 결의 7,
 * 14차 창 분할 경계).
 *
 * 흐름 [확정]:
 *   구매 전 상태 스냅샷 → 구매 가능 여부 재검증 → 크레딧 차감 →
 *   업그레이드 적용 → 저장 → 저장 성공 시 확정 / 실패 시 지갑·업그레이드
 *   모두 롤백 (부분 성공 상태 금지)
 *
 * 오류 규칙:
 *  - 저장 실패는 일반 구매 불가 사유가 아니라 `saveFailedRolledBack`이다.
 *  - 어떤 경로에서도 예외를 밖으로 던지지 않는다 — 저장·포트 예외가 게임
 *    루프·부팅을 깨지 않는다. 원인은 개발 로그로만 남기고 내부 예외
 *    문자열을 결과(UI 전달값)에 싣지 않는다.
 *  - 실패(거부·롤백) 후 상태는 구매 전과 동일하므로 재시도가 가능하다.
 *
 * 생성자 매개변수 프로퍼티 미사용 — 검증 러너 타입 스트리핑 규칙.
 */

import type {
  CurrencyBundle,
  PurchaseCost,
  PurchaseDenialReason,
  SavePort,
  TransactionResult,
  UpgradeLevelsPort,
  UpgradePurchaseJudgePort,
  UpgradeStatId,
  WalletTransactionPort,
} from '../contracts/meta';

/** 차감 실패(판정-지갑 불일치 방어) 시 부족 사유 판별 — 산술 비교뿐, 판정 아님 */
function insufficientReason(wallet: CurrencyBundle, cost: PurchaseCost): PurchaseDenialReason {
  if (wallet.credits < cost.credits) return 'insufficientCredits';
  return 'insufficientRareParts';
}

export class PurchaseTransaction {
  private readonly judge: UpgradePurchaseJudgePort;
  private readonly wallet: WalletTransactionPort;
  private readonly levels: UpgradeLevelsPort;
  private readonly savePort: SavePort;

  constructor(
    judge: UpgradePurchaseJudgePort,
    wallet: WalletTransactionPort,
    levels: UpgradeLevelsPort,
    savePort: SavePort,
  ) {
    this.judge = judge;
    this.wallet = wallet;
    this.levels = levels;
    this.savePort = savePort;
  }

  run(id: UpgradeStatId): TransactionResult {
    // ① 구매 전 상태 스냅샷 (지갑 + 업그레이드 단계 — 부분 복원 금지)
    const walletSnapshot = this.wallet.snapshotWallet();
    const levelsSnapshot = this.levels.snapshotLevels();

    const rollback = (): void => {
      try {
        this.wallet.restoreWallet(walletSnapshot);
        this.levels.restoreLevels(levelsSnapshot);
      } catch (restoreError) {
        // 복원 실패는 계약 위반 수준의 사고 — 로그만 남긴다 (throw 금지)
        console.error('[PurchaseTransaction] 롤백 중 오류:', restoreError);
      }
    };

    try {
      // ② 구매 가능 여부 재검증 (내용 = 게임플레이 판정 포트)
      const verdict = this.judge.evaluateUpgradePurchase(id);
      if (verdict.denial !== null) {
        return { status: 'denied', reason: verdict.denial };
      }

      // ③ 크레딧 차감 — 지갑 측 재검증 겸용 (부족 시 무변경 false)
      if (!this.wallet.spendFromWallet(verdict.cost)) {
        return { status: 'denied', reason: insufficientReason(walletSnapshot, verdict.cost) };
      }

      // ④ 업그레이드 적용 (확정 후보 상태)
      this.levels.applyPurchasedLevel(id);

      // ⑤ 저장 — 실패는 false (SavePort 계약: throw 금지)
      if (!this.savePort.save()) {
        rollback();
        return { status: 'saveFailedRolledBack' };
      }

      // ⑥ 저장 성공 = 구매 확정
      return { status: 'success' };
    } catch (error) {
      // 포트는 계약상 throw 금지 — 위반 시 방어적 전체 복구 후 안전 결과 반환
      console.error('[PurchaseTransaction] 트랜잭션 중 예외 — 롤백:', error);
      rollback();
      return { status: 'saveFailedRolledBack' };
    }
  }
}
