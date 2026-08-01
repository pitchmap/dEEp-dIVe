/**
 * 조작 안내 + Pointer Lock + 화면 조준·어뢰 발사 버튼 HUD (툴링·UI 소유).
 *
 * 전투 입력 단일화 (INT-CORE-002 [확정] — 별도 전투 시스템 금지):
 *  - 화면 버튼은 composition root(core/Game)에서 주입받은 **AimSystem 공용
 *    진입점**(beginAim/endAim/fireTorpedo)을 직접 호출한다 — 마우스 경로
 *    (게임플레이 MouseCombatInput)와 같은 인스턴스, 같은 메서드, 같은
 *    재장전·잔량 판정이다.
 *  - **캔버스 마우스 전투는 이 클래스가 처리하지 않는다.** 우클릭 홀드·좌클릭은
 *    window에 부착된 MouseCombatInput(게임플레이 소유)이 추적한다. 여기서
 *    aim을 또 호출하면 클릭 1회가 이중 발사되므로 금지.
 *  - 대신 이 클래스는 **게이트키퍼**다: Pointer Lock 진입용 클릭·진입 직후
 *    250ms 잔여 클릭·비잠금 상태 클릭을 stopPropagation으로 소비해
 *    MouseCombatInput(window, 버블링 단계)까지 도달하지 못하게 막는다.
 *    정상 전투 클릭(잠금 중·무시 구간 밖)만 통과시키고 계측만 남긴다.
 *  - 조준 버튼 활성 표시는 로컬 상태가 아니라 `aimModeChanged` 구독으로
 *    갱신한다 (잠망경 심도 아님 → beginAim 거부, 심도 이탈 자동 해제까지
 *    이벤트가 진실이다).
 *
 * 표시 규칙: params/ui.json (기본 투명도·존재감 축소 기준·표시 기본값).
 * 계측: InputTelemetry (마우스/버튼별 사용 횟수 — 버튼 사용률 판단 근거).
 */

import { CONTROL_BINDINGS, hudKeyCode } from './controlsConfig';
import { loadUiParams, onUiParamsReloaded, type UiParams } from './uiParams';
import { inputTelemetry } from '../tools/InputTelemetry';
import { KeyboardLockManager } from '../tools/KeyboardLockManager';
import type { AimSystem, TorpedoSystem } from '../contracts/systems';
import type { EventBus, Unsubscribe } from '../core/EventBus';

/**
 * composition root가 주입하는 전투 연결점 — 게임플레이 구현체 타입이 아니라
 * 계약(contracts/systems.ts)의 최소 단면만 본다.
 */
export interface CombatControls {
  /** 공용 조준 진입점 — 마우스(MouseCombatInput)와 반드시 같은 인스턴스 */
  aim: Pick<AimSystem, 'aiming' | 'beginAim' | 'endAim' | 'fireTorpedo'>;
  /** 발사 버튼 상태 표시용 읽기 전용 어뢰 상태 */
  torpedo: Pick<TorpedoSystem, 'remaining' | 'reloadRemainingSeconds'>;
}

export interface ControlsHudOptions {
  /** 일시정지 전환 — core/Game이 GameLoop start/stop으로 연결한다 */
  setPaused(paused: boolean): void;
  combat: CombatControls;
  /** aimModeChanged·torpedoFired 구독용 (표시 갱신 전용 — 발행하지 않음) */
  bus: EventBus;
}

/** Pointer Lock 진입 직후 캔버스 마우스 입력을 무시(소비)하는 구간 (ms) */
const SUPPRESS_AFTER_LOCK_MS = 250;
/** 발사 버튼 잔량·재장전 표시 폴링 주기 (ms) — 일시정지 중에도 표시 일관성 유지 */
const FIRE_BUTTON_POLL_MS = 200;

export class ControlsHud {
  private readonly guidePanel: HTMLDivElement;
  private readonly buttonsWrap: HTMLDivElement;
  private readonly aimButton: HTMLButtonElement;
  private readonly fireButton: HTMLButtonElement;
  private readonly resumeOverlay: HTMLDivElement;
  private readonly toggleCode = hudKeyCode('H');
  /** Keyboard Lock 요청·미지원 폴백·1회 안내 (5차 결의 4 — 브라우저 기능·안내만 담당) */
  private readonly keyboardLock = new KeyboardLockManager();
  private readonly unsubscribeParams: () => void;
  private readonly unsubscribeAimMode: Unsubscribe;
  private readonly unsubscribeTorpedoFired: Unsubscribe;
  private readonly firePollTimer: ReturnType<typeof setInterval>;

  private params: UiParams;
  /** 표시 상태 — 초기값은 params/ui.json, 이후에는 H 토글이 지배한다 */
  private guideVisible: boolean;
  private buttonsVisible: boolean;
  private paused = false;
  private locked = false;
  private suppressCanvasMouseUntilMs = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly options: ControlsHudOptions,
  ) {
    this.params = loadUiParams();
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
    this.updateFireButtonState();

    // 게임 중 우클릭 컨텍스트 메뉴 방지 (조준용 우클릭과 충돌)
    this.container.addEventListener('contextmenu', this.handleContextMenu);
    this.canvas.addEventListener('mousedown', this.handleCanvasMouseDown);
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);

    // 조준 버튼 활성 표시의 진실은 aimModeChanged (마우스·버튼·자동 해제 공통)
    this.unsubscribeAimMode = options.bus.on('aimModeChanged', ({ aiming }) => {
      this.aimButton.classList.toggle('hud-btn-active', aiming);
    });
    // 발사 직후 잔량·재장전 표시 즉시 갱신 (폴링 주기 보완)
    this.unsubscribeTorpedoFired = options.bus.on('torpedoFired', () => {
      this.updateFireButtonState();
    });
    this.firePollTimer = setInterval(() => this.updateFireButtonState(), FIRE_BUTTON_POLL_MS);

    this.unsubscribeParams = onUiParamsReloaded((next) => {
      this.params = next;
      this.applyParams();
    });
  }

  dispose(): void {
    clearInterval(this.firePollTimer);
    this.keyboardLock.dispose();
    this.unsubscribeParams();
    this.unsubscribeAimMode();
    this.unsubscribeTorpedoFired();
    this.container.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('mousedown', this.handleCanvasMouseDown);
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
    // 버튼 입력이 캔버스·window(MouseCombatInput) 경로로 새지 않게 전파를 끊는다.
    // 동작은 click 단일 경로 — pointerdown/up·mousedown/up은 소비만 한다.
    for (const type of ['pointerdown', 'mousedown'] as const) {
      button.addEventListener(type, (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
    }
    for (const type of ['pointerup', 'mouseup'] as const) {
      button.addEventListener(type, (e) => {
        e.stopPropagation();
      });
    }
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      onActivate();
    });
    return button;
  }

  /**
   * 일시정지 오버레이 — 입력 모드 선택 지점 [회의 목표: 두 방식 중 선택 가능].
   *  - '마우스 모드로 계속': 재개 + Pointer Lock 재진입 (우클릭 조준·좌클릭 발사)
   *  - '화면 버튼으로 계속': 재개만 — 잠금 없이 커서를 유지한 채 화면
   *    조준·발사 버튼으로 플레이 (게임 루프 실행, 강제 재잠금 없음)
   * 배경 클릭은 마우스 모드 재개와 동일하게 처리한다 (기존 동작 유지).
   */
  private buildResumeOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'resume-overlay hud-hidden';

    const title = document.createElement('div');
    title.className = 'resume-overlay-title';
    title.textContent = '일시정지';

    const choices = document.createElement('div');
    choices.className = 'resume-overlay-choices';
    const mouseResume = this.buildResumeChoice(
      'resume-mouse',
      '마우스 모드로 계속',
      '잠금 재진입 · 우클릭 조준 / 좌클릭 발사',
      () => this.resume(),
    );
    const buttonResume = this.buildResumeChoice(
      'resume-buttons',
      '화면 버튼으로 계속',
      '잠금 없음 · 화면 조준·발사 버튼 사용',
      () => this.resumeWithoutLock(),
    );
    choices.append(mouseResume, buttonResume);

    const hint = document.createElement('div');
    hint.className = 'resume-overlay-hint';
    hint.textContent = 'Esc: 마우스 잠금 해제 · 일시정지 (배경 클릭 = 마우스 모드)';
    overlay.append(title, choices, hint);

    // 재개 클릭이 window의 MouseCombatInput에 발사 클릭으로 쌓이지 않게 소비
    overlay.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resume();
    });
    return overlay;
  }

  private buildResumeChoice(
    className: string,
    label: string,
    description: string,
    onActivate: () => void,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `hud-btn resume-choice ${className}`;
    const strong = document.createElement('div');
    strong.textContent = label;
    const desc = document.createElement('div');
    desc.className = 'resume-choice-desc';
    desc.textContent = description;
    button.append(strong, desc);
    // 오버레이 배경(마우스 모드 재개)·window(MouseCombatInput)로 전파 차단
    for (const type of ['pointerdown', 'mousedown'] as const) {
      button.addEventListener(type, (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
    }
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      onActivate();
    });
    return button;
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
    // 첫 상승 키 입력 → Keyboard Lock·병행 키 1회 안내 (내부에서 중복 억제).
    // 현재 상승 바인딩은 Shift — 5차 결의(Ctrl 스왑·병행 키 E)의 판정 반영은
    // 게임플레이 작업 대기, 안내 트리거는 바인딩 교체 시 코드만 바꾼다.
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.keyboardLock.maybeShowNotice();
    }
    // Esc는 여기서 다루지 않는다 — Pointer Lock 해제는 브라우저 기본 동작이고
    // 그 결과(pointerlockchange)에서 일시정지한다. 조준 취소 전용 키 아님.
  };

  /**
   * 캔버스 mousedown 게이트키퍼.
   * 전투로 전달하면 안 되는 클릭만 stopPropagation으로 소비한다 —
   * window의 MouseCombatInput(게임플레이)은 버블링 단계라 여기서 끊긴다.
   * 정상 전투 클릭은 통과시키고 계측만 남긴다 (aim 호출은 게임플레이 소관).
   * mouseup은 절대 막지 않는다 — 우클릭 홀드 해제가 유실되면 조준이 고착된다.
   */
  private readonly handleCanvasMouseDown = (e: MouseEvent): void => {
    if (this.paused) {
      e.stopPropagation();
      return;
    }

    if (!this.locked) {
      // 비잠금 상태 캔버스 클릭은 Pointer Lock 진입 전용 — 전투 입력 아님
      e.stopPropagation();
      e.preventDefault();
      if (e.button === 0) this.requestLock();
      return;
    }

    if (performance.now() < this.suppressCanvasMouseUntilMs) {
      // 잠금 진입 직후 잔여 클릭 — 발사·조준으로 전달 금지
      e.stopPropagation();
      return;
    }

    // 정상 전투 입력 — MouseCombatInput → GameplaySystems → aim이 처리한다.
    if (e.button === 2) {
      inputTelemetry.recordAimStart('mouse');
      this.applyButtonPresence();
    } else if (e.button === 0) {
      inputTelemetry.recordFireRequest('mouse');
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
      // Esc 등으로 잠금 해제 → 조준 해제 후 일시정지 + 재진입 안내.
      // 루프가 멈추면 게임플레이 update가 돌지 않으므로 여기서 endAim을 보장한다.
      if (this.options.combat.aim.aiming) this.options.combat.aim.endAim();
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

  /**
   * 화면 버튼 모드로 재개 — Pointer Lock을 걸지 않는다 [회의 목표:
   * 입력 방식 선택]. 게임 루프는 실행 상태, 커서 유지, 화면 조준·발사
   * 버튼이 같은 AimSystem을 호출한다. 마우스 모드 복귀는 캔버스 클릭.
   */
  private resumeWithoutLock(): void {
    this.setPaused(false);
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.resumeOverlay.classList.toggle('hud-hidden', !paused);
    this.options.setPaused(paused);
  }

  /** 조준 버튼 — AimSystem 토글. 활성 표시는 aimModeChanged 구독이 갱신한다 */
  private toggleAimFromButton(): void {
    if (this.paused) return;
    const aim = this.options.combat.aim;
    if (aim.aiming) {
      aim.endAim();
    } else {
      inputTelemetry.recordAimStart('screenButton');
      // 잠망경 심도가 아니면 false — 버튼은 상태를 가장하지 않는다 (이벤트가 진실)
      aim.beginAim();
    }
  }

  /** 발사 버튼 — 마우스 좌클릭과 같은 fireTorpedo() 단일 경로 */
  private fireFromButton(): void {
    if (this.paused) return;
    inputTelemetry.recordFireRequest('screenButton');
    this.options.combat.aim.fireTorpedo();
    this.updateFireButtonState();
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

  /** 잔량 0 또는 재장전 중이면 발사 버튼 비활성 — 라벨에 상태 병기 */
  private updateFireButtonState(): void {
    const torpedo = this.options.combat.torpedo;
    const reloading = torpedo.reloadRemainingSeconds > 0;
    const empty = torpedo.remaining <= 0;
    this.fireButton.disabled = reloading || empty;
    if (empty) {
      this.fireButton.textContent = '어뢰 발사 (0발)';
    } else if (reloading) {
      this.fireButton.textContent = `어뢰 발사 · 재장전 ${Math.ceil(torpedo.reloadRemainingSeconds)}s`;
    } else {
      this.fireButton.textContent = `어뢰 발사 (${torpedo.remaining}발)`;
    }
  }
}
