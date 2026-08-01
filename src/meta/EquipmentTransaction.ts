/**
 * 장비 변경(장착·교체·해제) 트랜잭션 — 변경 직후 저장, 저장 실패 시 이전
 * loadout 복원 (13차 결의 4·7 준용, 틀=리드/판정·적용=게임플레이 포트).
 *
 * 흐름: loadout 스냅샷 → 변경 판정 → 적용 → 저장 → 성공 확정 /
 *       실패 시 이전 loadout 복원.
 * 오류 규칙은 PurchaseTransaction과 동일 — 예외 무전파, 내부 문자열 비노출,
 * 실패 후 재시도 가능. 생성자 매개변수 프로퍼티 미사용(러너 규칙).
 */

import type {
  EquipmentChangeJudgePort,
  EquipmentChangeRequest,
  SavePort,
  TransactionResult,
} from '../contracts/meta';

export class EquipmentTransaction {
  private readonly judge: EquipmentChangeJudgePort;
  private readonly savePort: SavePort;

  constructor(judge: EquipmentChangeJudgePort, savePort: SavePort) {
    this.judge = judge;
    this.savePort = savePort;
  }

  run(request: EquipmentChangeRequest): TransactionResult {
    // ① 변경 전 슬롯 스냅샷 (빈 슬롯 위치 포함 — 롤백 시 완전 원복)
    const snapshot = this.judge.snapshotSlots();

    const rollback = (): void => {
      try {
        this.judge.restoreSlots(snapshot);
      } catch (restoreError) {
        console.error('[EquipmentTransaction] 롤백 중 오류:', restoreError);
      }
    };

    try {
      // ② 판정+적용 (게임플레이 판정 — 불가 시 사유 반환·무변경, INT-CORE-010)
      const denial = this.judge.applyEquipmentChange(request);
      if (denial !== null) {
        return { status: 'denied', reason: denial };
      }

      // ③ 저장 (장착·교체·해제 직후 저장 [13차 결의 4] — 이 트랜잭션이
      //    유일한 저장 지점. 판정 포트·UI는 저장하지 않는다)
      if (!this.savePort.save()) {
        rollback();
        return { status: 'saveFailedRolledBack' };
      }

      return { status: 'success' };
    } catch (error) {
      console.error('[EquipmentTransaction] 트랜잭션 중 예외 — 롤백:', error);
      rollback();
      return { status: 'saveFailedRolledBack' };
    }
  }
}
