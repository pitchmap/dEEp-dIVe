/**
 * 원자적 상태 변경 + 즉시 저장 (툴링 소유 — 소회의(13) 결의 4·보완분 결의 7).
 *
 * 책임 경계:
 *  - 이 모듈은 **저장 쪽 절반**만 소유한다: 스냅샷 → 변경 적용 → 저장 →
 *    실패 시 롤백 → 실패 종류 구분. 구매 **가능 여부 판정**(불가 사유 5종:
 *    크레딧 부족·희귀 부품 부족·최대 단계·슬롯 부족·이미 장착 중)은
 *    게임플레이 소유이며, 여기서는 호출 측이 넘긴 거절 사유를 그대로 전달만 한다.
 *  - 트랜잭션 '틀'의 최종 계약은 리드 창 산출물이다 — 본 모듈은 그 틀에
 *    끼워질 저장 단계 구현이며, 계약 확정 시 시그니처만 맞추면 된다.
 *
 * 확정 규칙 (보완분 결의 7):
 *  - 크레딧 차감·업그레이드 단계 변경·저장은 하나의 트랜잭션이다.
 *    저장까지 성공해야 확정, 실패하면 **전부** 구매 전 상태로 되돌린다.
 *  - 부분 성공 상태를 허용하지 않는다.
 *  - 저장 실패는 일반 구매 불가 사유와 **구분**해서 표시한다.
 *  - 실패 원인은 개발 로그에만 남기고, 사용자 화면에는 브라우저 내부 예외
 *    문자열을 노출하지 않는다.
 *
 * 저장 시점 5종 [소회의(13) 결의 4] — 호출 측이 이 헬퍼를 쓰는 지점:
 *  ① 귀환 정산 확정 ② 희귀 부품 획득 즉시 ③ 업그레이드 구매 성공 직후
 *  ④ 장비 장착·교체·해제 직후 ⑤ 출항 확정 직전. 해역 내 자동 저장 없음.
 */

import type { SaveData } from './saveSchema';
import type { SaveStore } from './SaveStore';

/** 저장 실패 시 사용자에게 보여줄 고정 문구 [보완분 결의 7 — 내부 예외 문자열 금지] */
export const SAVE_FAILURE_MESSAGE =
  '저장에 실패하여 구매가 취소되었습니다. 저장 공간 또는 브라우저 설정을 확인해주세요.';

/** 결과 종류 — 저장 실패와 일반 불가 사유를 타입 수준에서 분리 (T6) */
export type CommitResult<TRejection extends string> =
  | { readonly ok: true; readonly data: SaveData }
  | { readonly ok: false; readonly kind: 'rejected'; readonly reason: TRejection }
  | { readonly ok: false; readonly kind: 'saveFailed'; readonly message: string };

/** 깊은 복사 스냅샷 — 롤백이 참조 공유로 새지 않도록 값 복사 */
export function snapshotSave(data: SaveData): SaveData {
  return {
    ...data,
    upgradeLevels: { ...data.upgradeLevels },
    equippedGear: [...data.equippedGear],
    progress: { ...data.progress },
    settings: { ...data.settings },
  };
}

export interface CommitOptions<TRejection extends string> {
  store: SaveStore;
  /** 변경 전 상태 (호출 측이 보유한 현재 상태) */
  current: SaveData;
  /**
   * 판정 + 변경. 거절 사유를 반환하면 상태를 건드리지 않고 종료한다
   * (구매 불가 5종 — 게임플레이 판정 결과를 그대로 전달).
   * 성공 시 **새 객체**를 반환해야 한다 (입력을 수정하지 않는다).
   */
  apply: (snapshot: SaveData) => { ok: true; next: SaveData } | { ok: false; reason: TRejection };
}

/**
 * 변경 → 저장 → (실패 시) 롤백을 하나의 단위로 수행한다.
 * 반환된 data만이 확정 상태다 — 호출 측은 성공 시에만 자기 상태를 교체한다.
 */
export function commitWithSave<TRejection extends string>(
  options: CommitOptions<TRejection>,
): CommitResult<TRejection> {
  const { store, current, apply } = options;
  const before = snapshotSave(current);

  const applied = apply(snapshotSave(before));
  if (!applied.ok) {
    // 판정 거절 — 저장을 시도하지 않으므로 상태는 애초에 변하지 않는다 (T2)
    return { ok: false, kind: 'rejected', reason: applied.reason };
  }

  const saved = store.save(applied.next);
  if (!saved) {
    // 저장 실패 → 메모리 상태도 변경 전으로 되돌린다 (T3·T4, 부분 성공 금지).
    // 상세 원인은 SaveStore가 개발 로그에 남겼다 — 사용자 문구는 고정값.
    return { ok: false, kind: 'saveFailed', message: SAVE_FAILURE_MESSAGE };
  }

  return { ok: true, data: applied.next };
}

/** 롤백 결과 확인용 — 실패 시 호출 측이 유지해야 할 상태 (= 변경 전 스냅샷) */
export function rolledBackState(current: SaveData): SaveData {
  return snapshotSave(current);
}
