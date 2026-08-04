/**
 * 보스 체력 HUD — 화면 상단 중앙 (표시 전용).
 *
 * ## 정본
 *
 * 체력의 유일한 정본은 리드 `BossController.view().hullRatio`다. 이 HUD는
 * `BossCoreView`가 이미 제공하는 값(bossId·phase·hullRatio·telegraph·
 * weakPointOpen·defeated)만 읽고, **새 체력 상태를 만들지 않는다**:
 * 피해량을 계산하지 않고, hullRatio를 스스로 깎지 않으며, 실제 체력 수치
 * (currentHull/maxHull)는 read model에 없으므로 표시하지 않는다.
 *
 * 피격 강조는 공식 `bossHit` 이벤트만 소비한다 — 이벤트가 온 사실만 쓰고
 * 피해량·위치는 받지도 쓰지도 않는다. 강조가 끝나도 표시되는 체력은 항상
 * 다음 `coreView()` 폴링의 실제 `hullRatio`다(HUD 보간 상태 없음).
 *
 * ## 표시 조건
 *
 * `coreView()`가 비-null이고 `defeated=false`일 때만 뜬다. 조립부가 스폰
 * 성공 이후에만 비-null 뷰를 주므로 단서 수집 단계·스폰 전·구역 잠금·
 * reset·출항 종료·격파 후·다음 출항의 스폰 전에는 자동으로 숨는다.
 *
 * ## 배치
 *
 * 상단 중앙은 탐지 HUD가 먼저 쓰는 자리다. 고정 좌표를 쓰지 않고 탐지 HUD의
 * **실제 하단 + 간격**을 측정해 그 아래에 붙는다(탐지 HUD는 추적 칩 줄이
 * 늘어 높이가 변한다). 조준경 중앙 시야는 건드리지 않는다.
 */

import type { BossCoreView } from '../contracts/boss';

/** 읽기 모델 폴링 소스 — 렌더 공급 단면과 같은 관례 */
export interface BossCoreViewSource {
  coreView(): BossCoreView | null;
}

/** 탐지 HUD 하단과의 간격 / 탐지 HUD가 없을 때의 상단 여백 (px) */
const GAP_BELOW_DETECTION_PX = 12;
const TOP_MARGIN_PX = 12;
/** 피격 강조 노출 시간 (초) — 표시 시간일 뿐 판정과 무관 */
const HIT_FLASH_SECONDS = 0.35;
const WEAK_POINT_LABEL_SECONDS = 0.8;

export class BossHealthHud {
  private readonly root: HTMLDivElement;
  private readonly titleLine: HTMLDivElement;
  private readonly barTrack: HTMLDivElement;
  private readonly barFill: HTMLDivElement;
  private readonly percentLabel: HTMLDivElement;
  private readonly noteLine: HTMLDivElement;

  private source: BossCoreViewSource | null = null;
  private detectionHud: HTMLElement | null = null;
  private readonly detectionResize: ResizeObserver | null;
  private visible = false;
  private hitFlashRemaining = 0;
  private weakPointHitRemaining = 0;
  private lastTitle = '';
  private lastPercent = -1;
  private lastNote = '';
  private lastTopValue = '';
  private lastFlashOn: boolean | null = null;

  constructor(host: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.setAttribute('data-ui-boss-health-hud', '');
    this.root.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:12px',
      'transform:translateX(-50%)',
      'z-index:32',
      'pointer-events:none',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'gap:0.2rem',
      'padding:0.35rem 0.6rem',
      'background:rgba(6,16,22,0.78)',
      'border:1px solid rgba(150,190,205,0.35)',
      'border-radius:6px',
      'color:#e6f2f7',
      'font:0.78rem/1.35 system-ui,sans-serif',
      'user-select:none',
      'transition:border-color 120ms ease',
    ].join(';');

    this.titleLine = document.createElement('div');
    this.titleLine.style.cssText = 'letter-spacing:0.03em';

    const barRow = document.createElement('div');
    barRow.style.cssText = 'display:flex;align-items:center;gap:0.45rem';

    this.barTrack = document.createElement('div');
    this.barTrack.style.cssText = [
      'width:clamp(360px, 26vw, 520px)',
      'height:clamp(14px, 1.4vh, 22px)',
      'background:rgba(10,24,30,0.9)',
      'border:1px solid rgba(150,190,205,0.4)',
      'border-radius:3px',
      'overflow:hidden',
    ].join(';');
    this.barFill = document.createElement('div');
    // 전환은 짧게 — 피해 반영을 늦추는 보간 상태를 만들지 않는다.
    this.barFill.style.cssText = 'height:100%;width:100%;background:#e05545;transition:width 150ms linear';
    this.barTrack.appendChild(this.barFill);

    this.percentLabel = document.createElement('div');
    this.percentLabel.style.cssText = 'min-width:3.2rem;text-align:right;font-variant-numeric:tabular-nums';

    barRow.append(this.barTrack, this.percentLabel);

    this.noteLine = document.createElement('div');
    this.noteLine.style.cssText = 'color:#f2a44a;font-size:0.7rem;min-height:0.95rem';

    this.root.append(this.titleLine, barRow, this.noteLine);
    host.appendChild(this.root);

    this.detectionResize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.syncLayout());
    window.addEventListener('resize', this.syncLayout);
    this.syncLayout();
  }

  /** 유일한 상태 진입점 — composition root가 1회 주입 */
  attachSource(source: BossCoreViewSource): void {
    this.source = source;
  }

  /**
   * 피격 강조 — 공식 `bossHit`의 kind만 받는다. 체력은 건드리지 않는다
   * (다음 폴링의 실제 hullRatio가 표시된다).
   */
  notifyHit(kind: 'weakPoint' | 'hull'): void {
    this.hitFlashRemaining = HIT_FLASH_SECONDS;
    if (kind === 'weakPoint') this.weakPointHitRemaining = WEAK_POINT_LABEL_SECONDS;
  }

  /** 출항 리셋 — 표시·강조를 즉시 접는다 (체력은 정본이 소유) */
  reset(): void {
    this.hitFlashRemaining = 0;
    this.weakPointHitRemaining = 0;
    this.applyVisible(false);
  }

  update(deltaSeconds: number): void {
    if (this.hitFlashRemaining > 0) {
      this.hitFlashRemaining = Math.max(0, this.hitFlashRemaining - deltaSeconds);
    }
    if (this.weakPointHitRemaining > 0) {
      this.weakPointHitRemaining = Math.max(0, this.weakPointHitRemaining - deltaSeconds);
    }

    const view = this.source?.coreView() ?? null;
    if (view === null || view.defeated) {
      this.applyVisible(false);
      return;
    }
    this.applyVisible(true);
    this.syncLayout();

    // 이름은 발명하지 않는다 — 공식 표시 이름이 없으므로 '보스' 고정.
    const title = `보스 · PHASE ${view.phase}`;
    if (title !== this.lastTitle) {
      this.lastTitle = title;
      this.titleLine.textContent = title;
    }

    // clamp는 표시 안전 처리 — 정본 값을 바꾸지 않는다.
    const ratio = Math.min(Math.max(view.hullRatio, 0), 1);
    const percent = Math.round(ratio * 100);
    if (percent !== this.lastPercent) {
      this.lastPercent = percent;
      this.barFill.style.width = `${ratio * 100}%`;
      this.percentLabel.textContent = `${percent}%`;
    }

    const note = this.weakPointHitRemaining > 0
      ? '약점 명중'
      : view.weakPointOpen
        ? '약점 노출'
        : '';
    if (note !== this.lastNote) {
      this.lastNote = note;
      this.noteLine.textContent = note;
    }

    const flashOn = this.hitFlashRemaining > 0;
    if (flashOn !== this.lastFlashOn) {
      this.lastFlashOn = flashOn;
      this.root.style.borderColor = flashOn
        ? (this.weakPointHitRemaining > 0 ? '#f2a44a' : 'rgba(224,85,69,0.95)')
        : 'rgba(150,190,205,0.35)';
    }
  }

  /** 탐지 HUD 실제 하단 + 간격에 붙인다 (고정 좌표 사용 안 함) */
  private readonly syncLayout = (): void => {
    if (!this.detectionHud) {
      const found = document.querySelector<HTMLElement>('[data-ui-detection-hud]');
      if (found) {
        this.detectionHud = found;
        this.detectionResize?.observe(found);
      }
    }
    const rect = this.detectionHud?.getBoundingClientRect() ?? null;
    const top = rect && rect.height > 0 ? rect.bottom + GAP_BELOW_DETECTION_PX : TOP_MARGIN_PX;
    const next = `${Math.round(top)}px`;
    if (next === this.lastTopValue) return;
    this.lastTopValue = next;
    this.root.style.top = next;
  };

  private applyVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.root.style.display = visible ? 'flex' : 'none';
  }

  dispose(): void {
    window.removeEventListener('resize', this.syncLayout);
    this.detectionResize?.disconnect();
    this.detectionHud = null;
    this.root.remove();
  }
}
