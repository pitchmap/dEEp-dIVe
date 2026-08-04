/**
 * F 홀드 상호작용 프롬프트 HUD (L-2 발견 가능성 — 표시 전용).
 *
 * ## 이 HUD가 하지 않는 것
 *
 * 판정은 전부 게임플레이 `InteractionSystem` 소유다. 이 파일은
 * `InteractionReadModel`을 **그대로 표시**할 뿐이며 다음을 절대 계산하지
 * 않는다: 플레이어–대상 거리 · 상호작용 가능 여부 · 홀드 경과 시간 ·
 * 진행 속도 · 완료 여부 · 수집 여부. `holdSeconds`를 복제하지 않고 자체
 * 타이머(`Date.now()`·rAF 누적)도 두지 않는다 — 링은 오직 read model의
 * `progress`(0~1)만 그린다.
 *
 * ## 표시 조건
 *
 * 정본 read model이 `available`(회수 시작 가능)이고 아직 수집되지 않은
 * 단서 후보를 보고할 때만 뜬다. 후보 허용 목록(단서 targetId)은 조립부가
 * world 정본에서 주입한다 — 문자열을 여기서 만들지 않는다.
 *
 * ## 링 리셋
 *
 * 키를 떼거나(정본 progress=0) · 반경을 벗어나거나 · 후보가 바뀌거나 ·
 * 완료되거나 · 창 포커스를 잃거나(탭 숨김) · 출항이 끝나거나 ·
 * `unwired`이면 링은 0으로 돌아간다. 포커스 상실 시에는 프롬프트 자체를
 * 숨긴다 — 판정을 바꾸지 않고 표시만 접는다.
 */

import type { InteractionReadModel } from '../systems/interaction/InteractionSystem';

/** 읽기 모델 폴링 소스 (`detectionHudView()`와 같은 호출형 단면 관례) */
export interface InteractionPromptSource {
  interactionView(): InteractionReadModel;
}

/** 키캡·링 기하 (표시 전용 상수 — 밸런스 수치 아님) */
const KEYCAP_PX = 46;
const RING_VIEWBOX = 48;
const RING_RADIUS = 20;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** 완료 피드백 노출 시간 (초) — HUD 표시 시간일 뿐 판정과 무관 */
const COMPLETION_FEEDBACK_SECONDS = 1.8;

const SVG_NS = 'http://www.w3.org/2000/svg';

export class InteractionPromptHud {
  private readonly root: HTMLDivElement;
  private readonly ringProgress: SVGCircleElement;
  private readonly toast: HTMLDivElement;
  private readonly toastCount: HTMLDivElement;

  private source: InteractionPromptSource | null = null;
  private clueTargetIds: ReadonlySet<string> = new Set();
  private inSortie = false;
  private focused = true;
  private toastRemainingSeconds = 0;
  private lastRingRatio = -1;
  private lastPromptVisible: boolean | null = null;
  private lastToastVisible: boolean | null = null;

  constructor(host: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.setAttribute('data-ui-interaction-prompt', '');
    // 화면 중앙에서 아래로 — 조준 십자선(중앙)과 하단 생존 HUD 사이 빈 띠.
    this.root.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:calc(50% + 104px)',
      'transform:translateX(-50%)',
      'z-index:33',
      'pointer-events:none',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'gap:0.35rem',
      'color:#e6f2f7',
      'font:0.8rem/1.4 system-ui,sans-serif',
      'text-shadow:0 1px 3px rgba(0,0,0,0.85)',
      'user-select:none',
    ].join(';');

    const keycapWrap = document.createElement('div');
    keycapWrap.style.cssText = `position:relative;width:${KEYCAP_PX}px;height:${KEYCAP_PX}px`;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${RING_VIEWBOX} ${RING_VIEWBOX}`);
    svg.setAttribute('width', `${KEYCAP_PX}`);
    svg.setAttribute('height', `${KEYCAP_PX}`);
    svg.style.cssText = 'position:absolute;inset:0;display:block';

    const track = document.createElementNS(SVG_NS, 'circle');
    track.setAttribute('cx', `${RING_VIEWBOX / 2}`);
    track.setAttribute('cy', `${RING_VIEWBOX / 2}`);
    track.setAttribute('r', `${RING_RADIUS}`);
    track.setAttribute('fill', 'rgba(4,18,26,0.78)');
    track.setAttribute('stroke', 'rgba(150,190,205,0.45)');
    track.setAttribute('stroke-width', '3.5');
    svg.appendChild(track);

    this.ringProgress = document.createElementNS(SVG_NS, 'circle');
    this.ringProgress.setAttribute('cx', `${RING_VIEWBOX / 2}`);
    this.ringProgress.setAttribute('cy', `${RING_VIEWBOX / 2}`);
    this.ringProgress.setAttribute('r', `${RING_RADIUS}`);
    this.ringProgress.setAttribute('fill', 'none');
    this.ringProgress.setAttribute('stroke', '#8fc7d8');
    this.ringProgress.setAttribute('stroke-width', '3.5');
    this.ringProgress.setAttribute('stroke-linecap', 'round');
    this.ringProgress.setAttribute('stroke-dasharray', `${RING_CIRCUMFERENCE}`);
    this.ringProgress.setAttribute('stroke-dashoffset', `${RING_CIRCUMFERENCE}`);
    // 12시 방향에서 시작해 시계 방향으로 찬다 (SVG 원 기본 시작점은 3시).
    this.ringProgress.setAttribute(
      'transform',
      `rotate(-90 ${RING_VIEWBOX / 2} ${RING_VIEWBOX / 2})`,
    );
    svg.appendChild(this.ringProgress);
    keycapWrap.appendChild(svg);

    const keyLetter = document.createElement('div');
    keyLetter.textContent = 'F';
    keyLetter.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font:600 1.05rem/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'color:#e6f2f7',
    ].join(';');
    keycapWrap.appendChild(keyLetter);
    this.root.appendChild(keycapWrap);

    const label = document.createElement('div');
    label.textContent = '[F] 길게 눌러 단서 수집';
    this.root.appendChild(label);

    // 완료 피드백 — 프롬프트가 사라진 뒤에도 잠깐 남으므로 별도 요소다.
    this.toast = document.createElement('div');
    this.toast.setAttribute('data-ui-interaction-complete', '');
    this.toast.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:calc(50% + 56px)',
      'transform:translateX(-50%)',
      'z-index:33',
      'pointer-events:none',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'gap:0.15rem',
      'padding:0.4rem 0.75rem',
      'background:rgba(6,16,22,0.8)',
      'border:1px solid rgba(143,199,216,0.55)',
      'border-radius:6px',
      'color:#cfeaf5',
      'font:0.82rem/1.4 system-ui,sans-serif',
      'user-select:none',
    ].join(';');
    const toastTitle = document.createElement('div');
    toastTitle.textContent = '단서 수집 완료';
    this.toastCount = document.createElement('div');
    this.toastCount.style.cssText = 'color:#ffd9a0;font-size:0.75rem';
    this.toast.append(toastTitle, this.toastCount);

    host.append(this.root, this.toast);

    window.addEventListener('blur', this.handleFocusLost);
    window.addEventListener('focus', this.handleFocusGained);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  /** 유일한 상태 진입점 — composition root가 1회 주입 */
  attachSource(source: InteractionPromptSource): void {
    this.source = source;
  }

  /** 단서 대상 허용 목록 (world 정본 targetId — HUD가 문자열을 만들지 않는다) */
  attachClueTargets(targetIds: readonly string[]): void {
    this.clueTargetIds = new Set(targetIds);
  }

  /** 출항 중에만 표시 — 기지·정산 화면에서는 접는다 */
  setVisible(inSortie: boolean): void {
    if (this.inSortie === inSortie) return;
    this.inSortie = inSortie;
    if (!inSortie) this.reset();
  }

  /**
   * 완료 피드백 — 정본(BossProgressStore)이 실제로 반영한 값만 받는다.
   * HUD가 수집 수를 세거나 완료를 판정하지 않는다.
   */
  notifyClueCollected(collected: number, required: number): void {
    this.toastCount.textContent = `보스 단서 ${collected}/${required}`;
    this.toastRemainingSeconds = COMPLETION_FEEDBACK_SECONDS;
  }

  /** 출항 리셋 — 링·피드백을 모두 접는다 */
  reset(): void {
    this.toastRemainingSeconds = 0;
    this.applyRing(0);
    this.applyPromptVisible(false);
    this.applyToastVisible(false);
  }

  /** 매 프레임 — read model을 다시 읽어 표시만 갱신한다 */
  update(deltaSeconds: number): void {
    if (this.toastRemainingSeconds > 0) {
      this.toastRemainingSeconds = Math.max(0, this.toastRemainingSeconds - deltaSeconds);
    }
    this.applyToastVisible(this.inSortie && this.focused && this.toastRemainingSeconds > 0);

    const view = this.inSortie && this.focused ? (this.source?.interactionView() ?? null) : null;
    if (
      view === null ||
      view.unwired ||
      !view.available ||
      view.candidateCollected ||
      view.candidateId === null ||
      view.candidateKind !== 'clue' ||
      !this.clueTargetIds.has(view.candidateId)
    ) {
      this.applyRing(0);
      this.applyPromptVisible(false);
      return;
    }

    // 진행 링은 '지금 이 후보를 홀드 중'일 때만 찬다 — 다른 대상의 진행이
    // 이 후보의 링으로 새지 않게 한다(후보 교체 = 즉시 0).
    const ratio = view.activeId !== null && view.activeId === view.candidateId ? view.progress : 0;
    this.applyRing(ratio);
    this.applyPromptVisible(true);
  }

  private applyRing(ratio: number): void {
    const clamped = Math.min(Math.max(ratio, 0), 1);
    if (Math.abs(clamped - this.lastRingRatio) < 0.005 && this.lastRingRatio >= 0) return;
    this.lastRingRatio = clamped;
    this.ringProgress.setAttribute(
      'stroke-dashoffset',
      `${RING_CIRCUMFERENCE * (1 - clamped)}`,
    );
  }

  private applyPromptVisible(visible: boolean): void {
    if (this.lastPromptVisible === visible) return;
    this.lastPromptVisible = visible;
    this.root.style.display = visible ? 'flex' : 'none';
  }

  private applyToastVisible(visible: boolean): void {
    if (this.lastToastVisible === visible) return;
    this.lastToastVisible = visible;
    this.toast.style.display = visible ? 'flex' : 'none';
  }

  private readonly handleFocusLost = (): void => {
    this.focused = false;
    this.applyRing(0);
    this.applyPromptVisible(false);
    this.applyToastVisible(false);
  };

  private readonly handleFocusGained = (): void => {
    this.focused = true;
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) this.handleFocusLost();
    else this.handleFocusGained();
  };

  dispose(): void {
    window.removeEventListener('blur', this.handleFocusLost);
    window.removeEventListener('focus', this.handleFocusGained);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.root.remove();
    this.toast.remove();
  }
}
