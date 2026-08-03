/**
 * C7 — 정상 귀환(정산) 화면 (스프린트 C 그래픽스).
 *
 * 분리 기준 [SPRINT_C_HANDOFF C7]: 실패 화면(`SortieFailureScreen.ts`)과
 * **데이터 소스·화면 컴포넌트가 모두 분리**돼 있다 — 이 파일은
 * `DebriefReadModel.kind === 'returned' | 'aborted'`(settlement 스냅샷)만
 * 다루며, 파괴 손실·실패 사유·저장 재시도 문구와 버튼이 **없다**.
 *
 * 화면의 '확인'은 조립부가 제공한 completeDebrief command만 부른다 —
 * 정산·저장을 직접 수행하지 않는다. (Game.ts의 구 자동 completeDebrief를
 * 이 버튼이 대체한다 — 리드 주석의 예정된 대체.)
 */

import type { MetaStateId } from '../contracts/meta';
import type { DebriefModelSource } from './SortieFailureScreen';

/** 메타 상태 읽기 단면 — 표시 게이트 전용 (상태 전이는 UI가 하지 않는다) */
export interface DebriefMetaStateView {
  readonly metaState: MetaStateId;
}

export class SortieReturnScreen {
  private readonly root: HTMLDivElement;
  private readonly outcomeLine: HTMLDivElement;
  private readonly settlementBlock: HTMLDivElement;
  private readonly confirmButton: HTMLButtonElement;

  private model: DebriefModelSource | null = null;
  private metaState: DebriefMetaStateView | null = null;
  private completeCommand: (() => void) | null = null;
  private lastSignature = '';

  constructor(host: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.setAttribute('data-ui-sortie-return', '');
    this.root.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'transform:translate(-50%,-50%)',
      'z-index:40',
      'display:none',
      'flex-direction:column',
      'gap:0.6rem',
      'min-width:min(88vw, 26rem)',
      'max-width:min(92vw, 30rem)',
      'padding:1rem 1.2rem',
      'background:rgba(6,20,24,0.94)',
      'border:2px solid #9fd6c0',
      'border-radius:8px',
      'color:#dcecf2',
      'font:0.85rem/1.5 system-ui,sans-serif',
    ].join(';');

    const title = document.createElement('h2');
    title.textContent = '✓ 귀환 보고';
    title.style.cssText = 'margin:0;font-size:1.15rem;color:#9fd6c0';
    this.root.appendChild(title);

    this.outcomeLine = document.createElement('div');
    this.root.appendChild(this.outcomeLine);

    this.settlementBlock = document.createElement('div');
    this.settlementBlock.style.cssText =
      'display:flex;flex-direction:column;gap:0.2rem;padding:0.5rem 0.6rem;background:rgba(14,30,40,0.85);border-radius:5px;font-size:0.78rem';
    this.root.appendChild(this.settlementBlock);

    this.confirmButton = document.createElement('button');
    this.confirmButton.type = 'button';
    this.confirmButton.textContent = '확인 (기지로)';
    this.confirmButton.style.cssText =
      'font:0.9rem system-ui;padding:0.5rem 1rem;border-radius:4px;border:1px solid #9fd6c0;background:rgba(24,56,52,0.95);color:#dcecf2;cursor:pointer;align-self:flex-start';
    this.confirmButton.addEventListener('click', () => this.completeCommand?.());
    this.root.appendChild(this.confirmButton);

    host.appendChild(this.root);
  }

  /** read model + 메타 상태 뷰 + completeDebrief command 주입 */
  attach(
    model: DebriefModelSource,
    metaState: DebriefMetaStateView,
    completeCommand: () => void,
  ): void {
    this.model = model;
    this.metaState = metaState;
    this.completeCommand = completeCommand;
  }

  update(): void {
    const view = this.model?.readModel() ?? null;
    // 이 화면의 유일한 진입 조건 — kind가 정상·중도 귀환이고 DEBRIEF 국면일 때.
    // 파괴(destroyed)는 이 컴포넌트가 다루지 않는다 (완전 분리).
    const isReturnKind =
      view !== null && (view.kind === 'returned' || view.kind === 'aborted');
    const inDebrief = this.metaState?.metaState === 'DEBRIEF';
    if (!isReturnKind || !inDebrief || !view?.settlement) {
      this.root.style.display = 'none';
      this.lastSignature = '';
      return;
    }

    this.root.style.display = 'flex';
    const settlement = view.settlement;
    const signature = `${view.kind}#${settlement.creditsNet}#${settlement.rarePartsSecured}#${view.saveStatus}`;
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    this.outcomeLine.textContent =
      view.kind === 'returned'
        ? '정상 귀환 — 출항을 무사히 마쳤습니다.'
        : '중도 귀환 — 출항을 마치고 복귀했습니다.';

    // 정산 결과 — MetaLoop 정산 정본 값 그대로 (재계산 없음).
    // 정상·중도 귀환은 손실 0이 정산 규칙이므로 파괴 손실 문구는 없다.
    this.settlementBlock.replaceChildren(
      this.line(`이번 출항 획득 크레딧: +${settlement.creditsEarned}`),
      this.line(`지갑 반영: +${settlement.creditsNet}`),
      this.line(`획득 희귀 부품: ${settlement.rarePartsSecured}`),
    );
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
