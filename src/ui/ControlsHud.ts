/**
 * 조작 안내 + Pointer Lock + 화면 조준·발사 버튼 HUD (툴링·UI 소유).
 *
 * 역할 경계:
 *  - 이 클래스는 입력을 "전투 의도(조준 시작/종료, 발사 요청)"로 바꿔
 *    CombatIntentSink에 전달할 뿐, 전투 판정(어뢰 잔량·재장전·명중)은
 *    구현하지 않는다 — 판정은 게임플레이 파트(TorpedoSystem 등) 소유.
 *  - 조준·발사 요청 이벤트의 계약(contracts/events.ts) 추가는 리드 승인
 *    대기 중(INTEGRATION_NOTES #004). 승인 전까지 기본 sink는 개발 모드
 *    콘솔 로그 + 계측 기록만 수행한다.
 *
 * 입력 모델:
 *  - Pointer Lock 상태: 우클릭 홀드 = 조준, 좌클릭 = 발사 (마우스 경로)
 *  - 비잠금 상태: 캔버스 좌클릭 = Pointer Lock 진입(발사 아님),
 *    화면 버튼 = 조준 토글·발사 (버튼 경로)
 *  - Esc → 브라우저가 Pointer Lock 해제 → 일시정지 + 재진입 안내 표시
 *
 * 중복 방지:
 *  - 버튼은 pointerdown/up/click 전파를 끊어 캔버스 입력과 분리
 *  - 마우스 발사는 mousedown 단일 경로, 버튼 발사는 click 단일 경로
 *  - Pointer Lock 진입 직후 SUPPRESS_AFTER_LOCK_MS 동안 캔버스 마우스 입력 무시
 *    (재진입 클릭이 발사로 처리되는 문제 방지)
 */

import { CONTROL_BINDINGS, hudKeyCode } from './controlsConfig';
import { loadUiParams, onUiParamsReloaded, type UiParams } from './uiParams';
import { inputTelemetry, type InputSource } from '../tools/InputTelemetry';

/** 전투 의도 수신처 — 게임플레이 연결 전까지는 기본(로그+계측) 구현 사용 */
export interface CombatIntentSink {
  requestAimStart(source: InputSource): void;
  requestAimEnd(source: InputSource): void;
  requestTorpedoFire(source: InputSource): void;
}

export interface ControlsHudOptions {
  /** 일시정지 전환 — core/Game이 GameLoop start/stop으로 연결한다 */
  setPaused(paused: boolean): void;
  /** 게임플레이 연결점 (미지정 시 개발 로그 + 계측만) */
  intents?: CombatIntentSink;
}

/** Pointer Lock 진입 직후 캔버스 마우스 입력을 무시하는 구간 (ms) */
const SUPPRESS_AFTER_LOCK_MS = 250;

const devLogSink: CombatIntentSink = {
  requestAimStart(source) {
    if (import.meta.env.DEV) console.debug(`[ControlsHud] 조준 시작 요청 (${source}) — 게임플레이 미연결`);
  },
  requestAimEnd(source) {
    if (import.meta.env.DEV) console.debug(`[ControlsHud] 조준 종료 요청 (${source}) — 게임플레이 미연결`);
  },
  requestTorpedoFire(source) {
    if (import.meta.env.DEV) console.debug(`[ControlsHud] 어뢰 발사 요청 (${source}) — 게임플레이 미연결`);
  },
};

export class ControlsHud {
  private readonly guidePanel: HTMLDivElement;
  private readonly buttonsWrap: HTMLDivElement;
  private readonly aimButton: HTMLButtonElement;
  private readonly fireButton: HTMLButtonElement;
  private readonly resumeOverlay: HTMLDivElement;
  private readonly intents: CombatIntentSink;
  private readonly toggleCode = hudKeyCode('H');
  private readonly unsubscribeParams: () => void;

  private params: UiParams;
  /** 표시 상태 — 초기값은 params/ui.json, 이후에는 H 토글이 지배한다 */
  private guideVisible: boolean;
  private buttonsVisible: boolean;
  private paused = false;
  private aiming = false;
  private aimSource: InputSource | null = null;
  private locked = false;
  private suppressCanvasMouseUntilMs = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly options: ControlsHudOptions,
  ) {
    this.params = loadUiParams();
    this.intents = options.intents ?? devLogSink;
    this.guideVisible = this.params.showControlsGuideByDefault.value;
    this.buttonsVisible = this.params.showScreenButtonsByDefault.value;

    this.guidePanel = this.buildGuidePanel();
    this.buttonsWrap = document.createElement('div');
    this.buttonsWrap.className = 'hud-buttons';
    this.aimButton = this.buildHudButton('조준', () => this.toggleAimFromButton());
    this.fireButton = this.buildHudButton('어뢰 발사', () => this.fireFromButton());
    this.buttonsWrap.append(this.aimButton, this.fireButton);
    this.resumeOverlay = this.buildResumeOverlay();

    container.append(this.guidePanel, this.buttonsWrap, this.resumeOverlay);

    this.applyParams();
    this.applyVisibility();

    // 게임 중 우클릭 컨텍스트 메뉴 방지 (조준용 우클릭과 충돌)
    this.container.addEventListener('contextmenu', this.handleContextMenu);
    this.canvas.addEventListener('mousedown', this.handleCanvasMouseDown);
    this.canvas.addEventListener('mouseup', this.handleCanvasMouseUp);
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);

    this.unsubscribeParams = onUiParamsReloaded((next) => {
      this.params = next;
      this.applyParams();
    });
  }

  dispose(): void {
    this.unsubscribeParams();
    this.container.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('mousedown', this.handleCanvasMouseDown);
    this.canvas.removeEventListener('mouseup', this.handleCanvasMouseUp);
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
    this.guidePanel.remove();
    this.buttonsWrap.remove();
    this.resumeOverlay.remove();
  }

  // ── DOM 구성 ──────────────────────────────────────────────

  private buildGuidePanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'controls-guide';

    const title = document.createElement('div');
    title.className = 'controls-guide-title';
    title.textContent = '조작 안내';
    panel.appendChild(title);

    // 안내 문구는 controlsConfig 단일 소스에서만 생성한다
    for (const binding of CONTROL_BINDINGS) {
      const row = document.createElement('div');
      row.className = 'controls-guide-row';
      const key = document.createElement('span');
      key.className = 'controls-guide-key';
      key.textContent = binding.label;
      const action = document.createElement('span');
      action.textContent = binding.action;
      row.append(key, action);
      panel.appendChild(row);
    }

    const footer = document.createElement('div');
    footer.className = 'controls-guide-footer';
    footer.textContent = '화면 클릭: 마우스 잠금(Pointer Lock) 시작';
    panel.appendChild(footer);
    return panel;
  }

  private buildHudButton(label: string, onActivate: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hud-btn';
    button.textContent = label;
    // 버튼 입력이 캔버스(카메라·조준·발사) 경로로 새지 않게 전파를 끊는다.
    // 동작은 click 단일 경로 — pointerdown/up은 소비만 한다.
    button.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    button.addEventListener('pointerup', (e) => {
      e.stopPropagation();
    });
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      onActivate();
    });
    return button;
  }

  private buildResumeOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'resume-overlay hud-hidden';

    const title = document.createElement('div');
    title.className = 'resume-overlay-title';
    title.textContent = '일시정지';
    const body = document.createElement('div');
    body.textContent = '클릭하면 게임으로 돌아갑니다 (마우스 잠금 재진입)';
    const hint = document.createElement('div');
    hint.className = 'resume-overlay-hint';
    hint.textContent = 'Esc: 마우스 잠금 해제 · 일시정지';
    overlay.append(title, body, hint);

    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resume();
    });
    return overlay;
  }

  // ── 입력 처리 ──────────────────────────────────────────────

  private readonly handleContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === this.toggleCode) {
      // 하나라도 보이면 전부 숨기고, 전부 숨겨져 있으면 전부 복원한다
      const anyVisible = this.guideVisible || this.buttonsVisible;
      this.guideVisible = !anyVisible;
      this.buttonsVisible = !anyVisible;
      this.applyVisibility();
    }
    // Esc는 여기서 다루지 않는다 — Pointer Lock 해제는 브라우저 기본 동작이고
    // 그 결과(pointerlockchange)에서 일시정지한다. 조준 취소 전용 키 아님.
  };

  private readonly handleCanvasMouseDown = (e: MouseEvent): void => {
    if (this.paused) return;

    if (!this.locked) {
      // 비잠금 상태의 캔버스 클릭은 Pointer Lock 진입 전용 — 발사로 처리하지 않는다
      if (e.button === 0) {
        e.preventDefault();
        this.requestLock();
      }
      return;
    }

    // Pointer Lock 진입 직후의 잔여 클릭 무시
    if (performance.now() < this.suppressCanvasMouseUntilMs) return;

    if (e.button === 2) {
      this.startAim('mouse');
    } else if (e.button === 0) {
      this.requestFire('mouse');
    }
  };

  private readonly handleCanvasMouseUp = (e: MouseEvent): void => {
    // 우클릭 홀드 조준만 mouseup으로 끝난다 — 버튼 토글 조준은 유지
    if (this.locked && e.button === 2 && this.aiming && this.aimSource === 'mouse') {
      this.endAim('mouse');
    }
  };

  private readonly handlePointerLockChange = (): void => {
    const nowLocked = document.pointerLockElement === this.canvas;
    if (nowLocked === this.locked) return;
    this.locked = nowLocked;

    if (nowLocked) {
      inputTelemetry.recordPointerLockEnter();
      this.suppressCanvasMouseUntilMs = performance.now() + SUPPRESS_AFTER_LOCK_MS;
      if (this.paused) this.setPaused(false);
    } else {
      inputTelemetry.recordPointerLockExit();
      // Esc 등으로 잠금 해제 → 조준 정리 후 일시정지 + 재진입 안내
      if (this.aiming && this.aimSource) this.endAim(this.aimSource);
      this.setPaused(true);
    }
  };

  private readonly handlePointerLockError = (): void => {
    console.warn('[ControlsHud] Pointer Lock 진입 실패 — 잠금 없이 계속합니다 (화면 버튼 사용 가능).');
  };

  // ── 상태 전이 ──────────────────────────────────────────────

  private requestLock(): void {
    this.canvas.requestPointerLock();
  }

  private resume(): void {
    this.setPaused(false);
    // 잠금 재진입 시도 — 실패해도 게임은 재개되고 화면 버튼 경로가 남는다
    this.requestLock();
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.resumeOverlay.classList.toggle('hud-hidden', !paused);
    this.options.setPaused(paused);
  }

  private toggleAimFromButton(): void {
    // 조준 버튼은 토글 — 클릭이 발사로 이어지지 않는다
    if (this.aiming) {
      this.endAim(this.aimSource ?? 'screenButton');
    } else {
      this.startAim('screenButton');
    }
  }

  private fireFromButton(): void {
    if (this.paused) return;
    this.requestFire('screenButton');
  }

  private startAim(source: InputSource): void {
    if (this.aiming) return;
    this.aiming = true;
    this.aimSource = source;
    this.aimButton.classList.add('hud-btn-active');
    inputTelemetry.recordAimStart(source);
    this.intents.requestAimStart(source);
    this.applyButtonPresence();
  }

  private endAim(source: InputSource): void {
    if (!this.aiming) return;
    this.aiming = false;
    this.aimSource = null;
    this.aimButton.classList.remove('hud-btn-active');
    this.intents.requestAimEnd(source);
  }

  private requestFire(source: InputSource): void {
    inputTelemetry.recordFireRequest(source);
    this.intents.requestTorpedoFire(source);
  }

  // ── 표시 상태 ──────────────────────────────────────────────

  private applyParams(): void {
    this.buttonsWrap.style.setProperty(
      '--hud-btn-opacity',
      String(this.params.screenButtonBaseOpacity.value),
    );
    this.buttonsWrap.style.setProperty(
      '--hud-btn-opacity-dim',
      String(this.params.screenButtonDimmedOpacity.value),
    );
    this.applyButtonPresence();
  }

  private applyVisibility(): void {
    this.guidePanel.classList.toggle('hud-hidden', !this.guideVisible);
    this.buttonsWrap.classList.toggle('hud-hidden', !this.buttonsVisible);
  }

  /** 마우스 조준 숙련 관측(파라미터 기준 횟수) 시 버튼 존재감 축소 */
  private applyButtonPresence(): void {
    const dim = inputTelemetry.mouseAimCount >= this.params.mouseAimCountToDimButtons.value;
    this.buttonsWrap.classList.toggle('hud-buttons-dimmed', dim);
  }
}
