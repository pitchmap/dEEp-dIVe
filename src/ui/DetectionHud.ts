/**
 * C1~C3 — 탐지 게이지·단계 + 추적 상태 HUD (스프린트 C 그래픽스).
 *
 * 경계 [SPRINT_C_HANDOFF — 그래픽스 창]:
 *  - `DetectionHudView`(게이지·stage·unwired)와 `TrackingStateSource`
 *    (patrol/alert/attack/lost)만 소비한다. 게이지를 보정·재계산하지 않고,
 *    새로운 상태명을 만들지 않으며, 전이를 자체 추론하지 않는다.
 *  - `unwired`(또는 소스 미주입)이면 **정상 플레이 게이지처럼 위장하지
 *    않는다** — '탐지 계기 미연결'을 명시하고 게이지를 빗금 처리한다.
 *  - 추적 목록은 read model의 개체별 상태를 그대로 나열한다 — 계약에 없는
 *    집계값(최고 경보 단계 등)을 만들지 않는다.
 *  - attack 상태 문구는 '공격 태세'다 — 폭뢰 투하 여부는 이 모델이 알려주지
 *    않으므로 '폭뢰 공격 중' 같은 단정 문구를 쓰지 않는다.
 *
 * 시각 언어 (작업 6 — faction 식별 태그와 분리):
 *  - 식별 태그는 ◇▲■◆ + 세력색(회색/주황/파랑)을 쓴다. 탐지·추적은
 *    **눈 기호 3단계(─ ◔ ◉)와 물결 없는 경고색 체계**를 쓴다 — 같은 기호·
 *    색을 공유하지 않아 색각 이상에서도 기호로 구분된다.
 */

import type { DetectionHudView, TrackingStateSource, TrackingState } from '../contracts/detection';

/** 탐지 소스 — 게임플레이 DetectionSystem 도착 시 조립부가 주입한다 */
export interface DetectionHudSource {
  hudView(): DetectionHudView;
}

/** 단계별 표기 — 계약 DetectionStage('safe'|'searching'|'detected') 그대로 */
const STAGE_APPEARANCE: Record<DetectionHudView['stage'], { icon: string; text: string; color: string }> = {
  safe: { icon: '─', text: '은신', color: '#9fd6c0' },
  searching: { icon: '◔', text: '수색', color: '#ffd9a0' },
  detected: { icon: '◉', text: '발각', color: '#ff9a7a' },
};

/** 추적 상태 표기 — 계약 TrackingState 4종 외의 상태를 만들지 않는다 */
const TRACKING_APPEARANCE: Record<TrackingState, { icon: string; text: string; color: string }> = {
  patrol: { icon: '○', text: '순찰', color: '#9fb6c0' },
  alert: { icon: '◍', text: '경계', color: '#ffd9a0' },
  // 폭뢰 투하 여부는 모델이 알려주지 않는다 — '공격 태세'까지만 서술
  attack: { icon: '●', text: '공격 태세', color: '#ff9a7a' },
  lost: { icon: '◌', text: '추적 상실', color: '#9fb6c0' },
};

export class DetectionHud {
  private readonly root: HTMLDivElement;
  private readonly stageLine: HTMLDivElement;
  private readonly gaugeTrack: HTMLDivElement;
  private readonly gaugeFill: HTMLDivElement;
  private readonly unwiredNote: HTMLDivElement;
  private readonly trackingRow: HTMLDivElement;

  private source: DetectionHudSource | null = null;
  private tracking: TrackingStateSource | null = null;
  private lastSignature = '';

  constructor(host: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.setAttribute('data-ui-detection-hud', '');
    this.root.style.cssText = [
      'position:absolute',
      'top:0.75rem',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:32', // 조준경 마스크(30) 위 — 조준 중에도 탐지 상태가 읽힌다
      'pointer-events:none',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'gap:0.25rem',
      'padding:0.4rem 0.65rem',
      'background:rgba(6,16,22,0.78)',
      'border:1px solid rgba(150,190,205,0.35)',
      'border-radius:6px',
      'color:#dcecf2',
      'font:0.74rem/1.35 system-ui,sans-serif',
      'max-width:min(60vw, 20rem)',
    ].join(';');

    this.stageLine = document.createElement('div');
    this.stageLine.style.cssText = 'display:flex;align-items:center;gap:0.35rem';
    this.root.appendChild(this.stageLine);

    this.gaugeTrack = document.createElement('div');
    this.gaugeTrack.style.cssText = [
      'width:10rem',
      'height:0.45rem',
      'border:1px solid rgba(150,190,205,0.45)',
      'border-radius:3px',
      'overflow:hidden',
      'background:rgba(10,24,32,0.9)',
    ].join(';');
    this.gaugeFill = document.createElement('div');
    this.gaugeFill.style.cssText =
      'height:100%;width:0%;background:#ffd9a0;transition:width 0.12s linear';
    this.gaugeTrack.appendChild(this.gaugeFill);
    this.root.appendChild(this.gaugeTrack);

    this.unwiredNote = document.createElement('div');
    this.unwiredNote.style.cssText = 'color:#7f97a3;font-size:0.68rem';
    this.root.appendChild(this.unwiredNote);

    this.trackingRow = document.createElement('div');
    this.trackingRow.style.cssText =
      'display:flex;flex-wrap:wrap;justify-content:center;gap:0.3rem;max-width:100%';
    this.root.appendChild(this.trackingRow);

    host.appendChild(this.root);
  }

  /** 탐지 read model 연결 — 게임플레이 DetectionSystem 도착 시 1회 주입 */
  attachDetectionSource(source: DetectionHudSource): void {
    this.source = source;
  }

  /** 추적 read model 연결 — 미주입이면 추적 줄을 그리지 않는다 */
  attachTrackingSource(source: TrackingStateSource): void {
    this.tracking = source;
  }

  /** 해역에서만 표시 (기지·정산 화면에는 없다) */
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none';
  }

  update(): void {
    if (this.root.style.display === 'none') return;

    // ① 탐지 게이지·단계 — 값 그대로 (보정·재계산 없음)
    const view = this.source?.hudView() ?? null;
    const unwired = view === null || view.unwired;
    const gauge = view?.gauge ?? 0;
    const stage = view?.stage ?? 'safe';

    const tracked = this.tracking?.trackedShips ?? [];
    const signature = [
      unwired,
      gauge.toFixed(3),
      stage,
      tracked.map((ship) => `${ship.entityId}:${ship.state}`).join('|'),
    ].join('#');
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    const appearance = STAGE_APPEARANCE[stage];
    if (unwired) {
      // 미연결 — 정상 게이지로 위장하지 않는다: 빗금 + 명시 문구, 단계 표기 없음
      this.stageLine.innerHTML = '';
      this.stageLine.append(this.chip('▦', '탐지 계기 미연결', '#7f97a3'));
      this.gaugeFill.style.width = '0%';
      this.gaugeTrack.style.background =
        'repeating-linear-gradient(45deg, rgba(127,151,163,0.25) 0 4px, rgba(10,24,32,0.9) 4px 8px)';
      this.unwiredNote.textContent = 'unwired — 게이지 정지 (판정 데이터 대기)';
    } else {
      this.stageLine.innerHTML = '';
      this.stageLine.append(this.chip(appearance.icon, `탐지: ${appearance.text}`, appearance.color));
      this.gaugeTrack.style.background = 'rgba(10,24,32,0.9)';
      this.gaugeFill.style.width = `${Math.round(gauge * 100)}%`;
      this.gaugeFill.style.background = appearance.color;
      this.unwiredNote.textContent = '';
    }

    // ② 추적 상태 — 개체별 그대로 나열 (집계값 발명 없음)
    this.trackingRow.replaceChildren();
    for (const ship of tracked) {
      const shipAppearance = TRACKING_APPEARANCE[ship.state];
      this.trackingRow.append(
        this.chip(shipAppearance.icon, shipAppearance.text, shipAppearance.color, ship.entityId),
      );
    }
  }

  private chip(icon: string, text: string, color: string, entityId?: number): HTMLSpanElement {
    const chip = document.createElement('span');
    if (entityId !== undefined) chip.setAttribute('data-tracking-chip', String(entityId));
    chip.style.cssText = `display:inline-flex;align-items:center;gap:0.25rem;color:${color}`;
    const iconEl = document.createElement('span');
    iconEl.textContent = icon;
    const textEl = document.createElement('span');
    textEl.textContent = text;
    chip.append(iconEl, textEl);
    return chip;
  }

  dispose(): void {
    this.root.remove();
  }
}
