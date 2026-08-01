/**
 * 재화 HUD — 기지·해역 양쪽에서 현재 크레딧·희귀 부품을 표시한다 (§7 / A4).
 *
 *  - 값은 매 프레임 실제 상태 소스(EconomyHudSource — 메타 루프 읽기 전용
 *    단면, composition root 조립)에서 다시 읽는다. UI 내부에 지갑·집계
 *    사본을 만들지 않는다.
 *  - 확정 자산(영구 지갑)과 '이번 출항 획득'(정산 전 미확정)을 구분
 *    표기한다: 출항 중 크레딧은 파괴 시 일부 손실 대상이다 [6차 결의 7·9].
 *  - z-index는 조준경 마스크(30)보다 위(32) — 조준 중에도 재화가 읽히고
 *    조준경 중앙 시야(십자선·눈금)는 가리지 않는 우상단 모서리 배치 (§11).
 */

import type { EconomyHudSource } from './metaEconomyPorts';

export class EconomyHud {
  private readonly root: HTMLDivElement;
  private readonly permanentLine: HTMLDivElement;
  private readonly sortieLine: HTMLDivElement;
  private source: EconomyHudSource | null = null;
  private lastText = '';
  private lastSortieText = '';

  constructor(host: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.setAttribute('data-ui-economy-hud', '');
    this.root.style.cssText = [
      'position:absolute',
      'top:0.75rem',
      'right:0.75rem',
      'z-index:32',
      'pointer-events:none',
      'display:none',
      'padding:0.5rem 0.7rem',
      'background:rgba(6,16,22,0.78)',
      'border:1px solid rgba(150,190,205,0.35)',
      'border-radius:6px',
      'color:#dcecf2',
      'font:0.8rem/1.45 system-ui,sans-serif',
      'text-align:right',
      'max-width:min(46vw, 16rem)',
    ].join(';');

    this.permanentLine = document.createElement('div');
    this.sortieLine = document.createElement('div');
    this.sortieLine.style.cssText = 'color:#ffd9a0';
    this.root.append(this.permanentLine, this.sortieLine);
    host.appendChild(this.root);
  }

  /** 메타 루프 실상태 단면 연결 — composition root가 1회 주입 */
  attachSource(source: EconomyHudSource): void {
    this.source = source;
  }

  /** 매 프레임 — 소스를 다시 읽어 변경 시에만 DOM 갱신 */
  update(): void {
    const source = this.source;
    if (!source) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = 'block';

    const wallet = source.wallet;
    const text = `확정 자산 — 크레딧 ${Math.floor(wallet.credits)} · 희귀 부품 ${Math.floor(wallet.rareParts)}`;
    if (text !== this.lastText) {
      this.lastText = text;
      this.permanentLine.textContent = text;
    }

    // 출항 중에만 미확정 획득분 줄 표시 — 확정 자산과 시각적으로 구분
    let sortieText = '';
    if (source.metaState === 'SORTIE') {
      const earnings = source.sortieEarnings;
      sortieText = `이번 출항 획득(미확정) — 크레딧 ${Math.floor(earnings.credits)} · 희귀 부품 ${Math.floor(earnings.rareParts)}`;
    }
    if (sortieText !== this.lastSortieText) {
      this.lastSortieText = sortieText;
      this.sortieLine.textContent = sortieText;
      this.sortieLine.style.display = sortieText ? 'block' : 'none';
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
