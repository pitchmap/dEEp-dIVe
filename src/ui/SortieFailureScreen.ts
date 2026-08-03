/**
 * C6 — 출항 실패(파괴) 화면 (스프린트 C 그래픽스).
 *
 * 분리 기준 [SPRINT_C_HANDOFF C7]: 정상 귀환 화면(`SortieReturnScreen.ts`)과
 * **데이터 소스·화면 컴포넌트가 모두 분리**돼 있다 — 이 파일은
 * `DebriefReadModel.kind === 'destroyed'`(failure 스냅샷)만 다루며, 정상
 * 귀환 문구·데이터 경로가 없다. `SurvivalReadModel.isDestroyed`로 화면을
 * 추측하지 않는다.
 *
 * 저장 규칙 [저장 책임 표 A-12 + INT-CORE-015]:
 *  - 이 화면은 정산·저장을 직접 수행하지 않는다 — 재시도 버튼은 조립부가
 *    제공한 command(리드 SortieFailureCoordinator.retrySave 래퍼)만 부른다.
 *  - `saveStatus === 'saveFailed'`인 동안 기지 이동이 불가함을 명시하고
 *    (DEBRIEF 유지), 닫기(확인) 버튼을 노출하지 않는다.
 *  - `canRetrySave === false`면 재시도 버튼을 노출하지 않는다.
 */

import type { DebriefReadModel, SortieFailureReason } from '../contracts/survival';

/** DEBRIEF read model 제공자 — DebriefStateTracker.readModel()의 단면 */
export interface DebriefModelSource {
  readModel(): DebriefReadModel;
}

/** 실패 사유 키 → 문구 (문구는 그래픽스 소유 — 계약에 문자열 없음) */
const FAILURE_REASON_TEXT: Record<SortieFailureReason, string> = {
  hullDestroyed: '선체 파괴 — 내구도가 모두 소진되었습니다.',
  pressureCollapse: '압괴 — 선체가 수압을 견디지 못했습니다.',
  environmental: '환경 요인으로 잠수함을 잃었습니다.',
  abandonedSortie: '출항을 포기했습니다.',
};

export class SortieFailureScreen {
  private readonly root: HTMLDivElement;
  private readonly reasonLine: HTMLDivElement;
  private readonly settlementBlock: HTMLDivElement;
  private readonly saveLine: HTMLDivElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly dismissButton: HTMLButtonElement;

  private model: DebriefModelSource | null = null;
  private retryCommand: (() => void) | null = null;
  /** 확인 command — 리드 guarded command 래퍼. true = confirm 성공(BASE 전환) */
  private confirmCommand: (() => boolean) | null = null;
  /** 표시 전용 로컬 닫힘 플래그 — 저장 성공 후 사용자가 화면을 닫은 상태.
   *  (생존·정산 상태 정본이 아니다 — read model이 초기화되면 함께 풀린다) */
  private dismissed = false;
  private lastSignature = '';

  constructor(host: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.setAttribute('data-ui-sortie-failure', '');
    this.root.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'transform:translate(-50%,-50%)',
      'z-index:40', // 조준경·HUD 전부 위 — 정산 국면 전용 모달
      'display:none',
      'flex-direction:column',
      'gap:0.6rem',
      'min-width:min(88vw, 26rem)',
      'max-width:min(92vw, 30rem)',
      'padding:1rem 1.2rem',
      'background:rgba(24,8,8,0.94)',
      'border:2px solid #ff7a6a',
      'border-radius:8px',
      'color:#ffe4dc',
      'font:0.85rem/1.5 system-ui,sans-serif',
    ].join(';');

    const title = document.createElement('h2');
    title.textContent = '✕ 출항 실패';
    title.style.cssText = 'margin:0;font-size:1.15rem;color:#ff9a7a';
    this.root.appendChild(title);

    this.reasonLine = document.createElement('div');
    this.reasonLine.setAttribute('data-failure-reason', '');
    this.root.appendChild(this.reasonLine);

    this.settlementBlock = document.createElement('div');
    this.settlementBlock.style.cssText =
      'display:flex;flex-direction:column;gap:0.2rem;padding:0.5rem 0.6rem;background:rgba(40,16,14,0.8);border-radius:5px;font-size:0.78rem';
    this.root.appendChild(this.settlementBlock);

    this.saveLine = document.createElement('div');
    this.saveLine.setAttribute('role', 'status');
    this.saveLine.style.cssText = 'font-size:0.78rem';
    this.root.appendChild(this.saveLine);

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display:flex;gap:0.5rem';

    this.retryButton = document.createElement('button');
    this.retryButton.type = 'button';
    this.retryButton.textContent = '저장 재시도';
    this.retryButton.style.cssText =
      'font:0.85rem system-ui;padding:0.45rem 0.9rem;border-radius:4px;border:1px solid #ff9a7a;background:rgba(70,24,20,0.95);color:#ffe4dc;cursor:pointer';
    this.retryButton.addEventListener('click', () => this.retryCommand?.());
    buttonRow.appendChild(this.retryButton);

    this.dismissButton = document.createElement('button');
    this.dismissButton.type = 'button';
    this.dismissButton.textContent = '확인 (기지로)';
    this.dismissButton.style.cssText =
      'font:0.85rem system-ui;padding:0.45rem 0.9rem;border-radius:4px;border:1px solid rgba(150,190,205,0.5);background:rgba(28,52,64,0.9);color:#dcecf2;cursor:pointer';
    this.dismissButton.addEventListener('click', () => {
      // [INT-CORE-017] 확인 = 공식 DEBRIEF confirm command 호출 — DOM 숨김이
      // 아니다. confirm이 성공(BASE 전환)했을 때만 화면을 닫는다. 저장
      // 미완료·상태 밖이면 command가 거부하고 화면은 유지된다.
      const confirmed = this.confirmCommand?.() ?? false;
      if (!confirmed) return;
      this.dismissed = true;
      this.root.style.display = 'none';
    });
    buttonRow.appendChild(this.dismissButton);

    this.root.appendChild(buttonRow);
    host.appendChild(this.root);
  }

  /**
   * read model + command 2종 주입 (command는 조립부 소유 래퍼).
   * confirmCommand는 리드 `DebriefConfirmCommand.confirm()` 경유 — UI가
   * `completeDebrief()`를 직접 호출하지 않는다. 정상 귀환 화면과 동일 정책.
   */
  attach(
    model: DebriefModelSource,
    retryCommand: () => void,
    confirmCommand: () => boolean,
  ): void {
    this.model = model;
    this.retryCommand = retryCommand;
    this.confirmCommand = confirmCommand;
  }

  update(): void {
    const view = this.model?.readModel() ?? null;
    // 이 화면의 유일한 진입 조건 — kind가 'destroyed'일 때뿐이다.
    // (isDestroyed 추측 분기 금지: SurvivalReadModel은 여기서 읽지 않는다.)
    if (!view || view.kind !== 'destroyed' || !view.failure) {
      this.dismissed = false; // 다음 실패를 위해 로컬 표시 플래그 초기화
      this.root.style.display = 'none';
      this.lastSignature = '';
      return;
    }
    if (this.dismissed) return; // 저장 완료 후 사용자가 닫음 (표시 전용)

    this.root.style.display = 'flex';
    const failure = view.failure;
    const signature = `${failure.failureId}#${view.saveStatus}#${view.canRetrySave}#${view.canConfirm}`;
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.reasonLine.textContent =
      FAILURE_REASON_TEXT[failure.reason] ?? '출항에 실패했습니다.';

    // 정산 결과 — 실패 스냅샷 값 그대로 (재계산 없음)
    this.settlementBlock.replaceChildren(
      this.line(`이번 출항 적립 크레딧: ${failure.pendingCredits}`),
      this.line(`파괴 손실: −${failure.appliedLoss}`),
      this.line(`정산 후 크레딧: ${failure.finalCredits}`),
      this.line(`보존된 희귀 부품: ${failure.securedRareParts} (손실 없음)`),
      this.line('영구 업그레이드·장비는 보존되었습니다.'),
    );

    if (view.saveStatus === 'saveFailed') {
      this.saveLine.textContent =
        '✕ 저장 실패 — 기지로 이동할 수 없습니다. 저장 공간 또는 브라우저 설정을 확인한 뒤 재시도해주세요. (정산은 다시 수행되지 않습니다)';
      this.saveLine.style.color = '#ff9a7a';
      this.retryButton.style.display = view.canRetrySave ? 'inline-block' : 'none';
      this.dismissButton.style.display = 'none'; // 저장 성공 전 기지 이동 불가
    } else if (view.saveStatus === 'saved') {
      this.saveLine.textContent = '✓ 정산이 저장되었습니다.';
      this.saveLine.style.color = '#9fd6c0';
      this.retryButton.style.display = 'none';
      // 확인 버튼 노출 근거는 read model의 canConfirm 하나다 (saved + DEBRIEF).
      this.dismissButton.style.display = view.canConfirm ? 'inline-block' : 'none';
    } else {
      this.saveLine.textContent = '저장 대기 중…';
      this.saveLine.style.color = '#ffd9a0';
      this.retryButton.style.display = 'none';
      this.dismissButton.style.display = 'none';
    }
  }

  private line(text: string): HTMLDivElement {
    const div = document.createElement('div');
    div.textContent = text;
    return div;
  }

  dispose(): void {
    this.root.remove();
  }
}
