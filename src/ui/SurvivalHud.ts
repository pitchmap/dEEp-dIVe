/**
 * C5 — 생존 HUD·피격 피드백 (스프린트 C 그래픽스).
 *
 * 경계 [SPRINT_C_HANDOFF — 그래픽스 창]:
 *  - `SurvivalReadModel`만 소비한다 — 매 프레임 스냅샷을 다시 읽고, UI가
 *    스냅샷·코어 상태를 변경하지 않는다(전 필드 읽기 전용). UI 내부에
 *    별도 생존 상태를 저장하지 않는다(마지막 서명 문자열은 DOM 재구축
 *    판단용 표시 캐시일 뿐 상태 정본이 아니다).
 *  - `hullRatio === null` = unwired — **정상 선체로 위장하지 않는다**:
 *    '선체 계기 미연결'을 명시하고 바를 빗금 처리한다.
 *  - `warningIds`는 키 기반으로 문구·아이콘에 매핑만 한다 — 발생 조건을
 *    다시 계산하지 않고, 자체 임계값을 만들지 않는다.
 *  - `damageFlashRequested`는 읽기만 하고, 소비 통지는 계약이 정한
 *    `consumeDamageFlash`(주입된 콜백)로만 한다.
 *  - 피격 방향은 `lastHitDirection`(잠수함 로컬 XZ 단위 벡터)을 화면 방위로
 *    변환하는 표시 삼각법만 수행한다 — 판정·거리 계산 없음.
 *
 * 시각 언어 (작업 6): 생존 경고는 ⛨(선체)·≋(침수)·⚠(치명적) 기호 체계 —
 * faction 태그(◇▲■◆)·탐지(─◔◉)와 기호가 겹치지 않는다.
 */

import type { SurvivalReadModel, SurvivalWarningId } from '../contracts/survival';
import { meshYawRadians } from '../core/conventions';

/** 생존 read model 소스 — PlayerHullSystem.survivalReadModel()의 단면 */
export interface SurvivalHudSource {
  survivalReadModel(): SurvivalReadModel;
}

/** 피격 방향 변환용 표시 컨텍스트 (읽기 전용 — 판정 아님) */
export interface SurvivalViewContext {
  readonly headingRadians: number;
  /** 카메라 월드 전방 XZ (정규화 불필요 — 각도만 쓴다) */
  readonly cameraForwardX: number;
  readonly cameraForwardZ: number;
}

/** 경고 키 → 문구·아이콘 매핑 (조건 재계산 없음 — 키만 해석) */
const WARNING_APPEARANCE: Record<SurvivalWarningId, { icon: string; text: string; color: string }> = {
  'hull.damaged': { icon: '⛨', text: '선체 손상', color: '#ffd9a0' },
  'hull.critical': { icon: '⚠', text: '선체 치명적', color: '#ff9a7a' },
  'flooding.minor': { icon: '≋', text: '침수 — 경미', color: '#ffd9a0' },
  'flooding.major': { icon: '≋≋', text: '침수 — 심각', color: '#ffb08a' },
  'flooding.catastrophic': { icon: '≋≋≋', text: '침수 — 붕괴 위험', color: '#ff9a7a' },
  'depth.unsafe': { icon: '↓!', text: '위험 심도', color: '#ffd9a0' },
};

/** 생존 상태 표기 — 계약 SurvivalState 4종 그대로 */
const STATE_APPEARANCE: Record<SurvivalReadModel['survivalState'], { text: string; color: string }> = {
  stable: { text: '안정', color: '#9fd6c0' },
  damaged: { text: '손상', color: '#ffd9a0' },
  critical: { text: '치명적', color: '#ff9a7a' },
  destroyed: { text: '파괴됨', color: '#ff7a6a' },
};

/** 피격 플래시 지속 시간 (초) — 순수 연출값 */
const FLASH_DURATION_SECONDS = 0.45;
/** 방향 지시자 표시 시간 (초) — 순수 연출값 */
const HIT_DIRECTION_SECONDS = 1.6;

export class SurvivalHud {
  private readonly root: HTMLDivElement;
  private readonly hullLine: HTMLDivElement;
  private readonly hullTrack: HTMLDivElement;
  private readonly hullFill: HTMLDivElement;
  private readonly floodingLine: HTMLDivElement;
  private readonly warningsRow: HTMLDivElement;
  private readonly flash: HTMLDivElement;
  private readonly hitIndicator: HTMLDivElement;

  private source: SurvivalHudSource | null = null;
  private consumeFlash: (() => void) | null = null;
  private viewContext: SurvivalViewContext | null = null;

  private flashRemaining = 0;
  private hitIndicatorRemaining = 0;
  private lastSignature = '';

  constructor(host: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.setAttribute('data-ui-survival-hud', '');
    this.root.style.cssText = [
      'position:absolute',
      'bottom:0.75rem',
      'left:50%',
      'transform:translateX(-50%)',
      'z-index:32',
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
      'max-width:min(72vw, 22rem)',
    ].join(';');

    this.hullLine = document.createElement('div');
    this.hullLine.style.cssText = 'display:flex;align-items:center;gap:0.4rem';
    this.root.appendChild(this.hullLine);

    this.hullTrack = document.createElement('div');
    this.hullTrack.style.cssText = [
      'width:12rem',
      'height:0.5rem',
      'border:1px solid rgba(150,190,205,0.45)',
      'border-radius:3px',
      'overflow:hidden',
      'background:rgba(10,24,32,0.9)',
    ].join(';');
    this.hullFill = document.createElement('div');
    this.hullFill.style.cssText = 'height:100%;width:0%;background:#9fd6c0';
    this.hullTrack.appendChild(this.hullFill);
    this.root.appendChild(this.hullTrack);

    this.floodingLine = document.createElement('div');
    this.floodingLine.style.cssText = 'font-size:0.7rem';
    this.root.appendChild(this.floodingLine);

    this.warningsRow = document.createElement('div');
    this.warningsRow.setAttribute('data-survival-warnings', '');
    this.warningsRow.style.cssText =
      'display:flex;flex-wrap:wrap;justify-content:center;gap:0.35rem';
    this.root.appendChild(this.warningsRow);

    // 피격 플래시 — 전체 화면 붉은 비네트 (조준경 마스크(30) 아래 z-29:
    // 십자선·태그를 가리지 않으면서 화면 전체가 번쩍인다)
    this.flash = document.createElement('div');
    this.flash.setAttribute('data-survival-damage-flash', '');
    this.flash.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      'z-index:29',
      'background:radial-gradient(ellipse at center, rgba(255,80,50,0) 40%, rgba(255,80,50,0.4) 100%)',
      'opacity:0',
    ].join(';');
    host.appendChild(this.flash);

    // 방향성 피격 지시자 — 화면 중심 기준 방위각 위치의 쐐기 (형태로 방향 전달)
    this.hitIndicator = document.createElement('div');
    this.hitIndicator.setAttribute('data-survival-hit-direction', '');
    this.hitIndicator.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'pointer-events:none',
      'z-index:29',
      'opacity:0',
      'color:#ff9a7a',
      'font:1.4rem/1 system-ui,sans-serif',
      'text-shadow:0 0 6px rgba(255,80,50,0.8)',
    ].join(';');
    this.hitIndicator.textContent = '⟪';
    host.appendChild(this.hitIndicator);

    host.appendChild(this.root);
  }

  /** 생존 read model + 플래시 소비 통지 콜백 — composition root가 1회 주입 */
  attachSource(source: SurvivalHudSource, consumeFlash: () => void): void {
    this.source = source;
    this.consumeFlash = consumeFlash;
  }

  /** 피격 방향 → 화면 방위 변환용 컨텍스트 (읽기 전용) */
  attachViewContext(context: SurvivalViewContext): void {
    this.viewContext = context;
  }

  /** 해역에서만 표시 */
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none';
    if (!visible) {
      this.flash.style.opacity = '0';
      this.hitIndicator.style.opacity = '0';
    }
  }

  update(deltaSeconds: number): void {
    if (this.root.style.display === 'none') return;
    const model = this.source?.survivalReadModel() ?? null;
    if (!model) return;

    // ① 피격 플래시 — 요청 플래그를 읽고, 소비 통지는 계약 API로만
    if (model.damageFlashRequested) {
      this.flashRemaining = FLASH_DURATION_SECONDS;
      this.hitIndicatorRemaining = HIT_DIRECTION_SECONDS;
      this.consumeFlash?.();
    }
    if (this.flashRemaining > 0) {
      this.flashRemaining = Math.max(0, this.flashRemaining - deltaSeconds);
      this.flash.style.opacity = String(
        (this.flashRemaining / FLASH_DURATION_SECONDS) * 0.85,
      );
    }

    // ② 방향성 피격 지시자 — 로컬 벡터 → 화면 방위 (표시 삼각법만)
    if (this.hitIndicatorRemaining > 0 && model.lastHitDirection && this.viewContext) {
      this.hitIndicatorRemaining = Math.max(0, this.hitIndicatorRemaining - deltaSeconds);
      const direction = model.lastHitDirection;
      const context = this.viewContext;
      // 로컬 → 월드: 잠수함 메시와 같은 yaw 회전
      const yaw = meshYawRadians(context.headingRadians);
      const worldX = direction.x * Math.cos(yaw) + direction.z * Math.sin(yaw);
      const worldZ = -direction.x * Math.sin(yaw) + direction.z * Math.cos(yaw);
      // 카메라 전방 기준 상대 방위 — 화면 위쪽 = 카메라 전방
      const relative =
        Math.atan2(worldX, worldZ) -
        Math.atan2(context.cameraForwardX, context.cameraForwardZ);
      const radius = 130;
      const x = Math.sin(relative) * radius;
      const y = -Math.cos(relative) * radius;
      this.hitIndicator.style.transform = `translate(-50%,-50%) translate(${x}px, ${y}px) rotate(${relative + Math.PI / 2}rad)`;
      this.hitIndicator.style.opacity = String(
        Math.min(1, this.hitIndicatorRemaining / (HIT_DIRECTION_SECONDS * 0.5)),
      );
    } else if (this.hitIndicator.style.opacity !== '0') {
      this.hitIndicator.style.opacity = '0';
    }

    // ③ 본체 표시 — 값이 바뀐 프레임에만 DOM 갱신
    const signature = [
      model.hullRatio === null ? 'unwired' : model.hullRatio.toFixed(3),
      model.currentHull,
      model.maxHull,
      model.floodingLevel.toFixed(3),
      model.survivalState,
      model.warningIds.join(','),
    ].join('#');
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    const state = STATE_APPEARANCE[model.survivalState];
    this.hullLine.replaceChildren();
    if (model.hullRatio === null) {
      // unwired — 정상 선체로 위장하지 않는다
      this.hullLine.append(this.textSpan('▦ 선체 계기 미연결 (판정 데이터 대기)', '#7f97a3'));
      this.hullFill.style.width = '0%';
      this.hullTrack.style.background =
        'repeating-linear-gradient(45deg, rgba(127,151,163,0.25) 0 4px, rgba(10,24,32,0.9) 4px 8px)';
    } else {
      this.hullLine.append(
        this.textSpan(`⛨ 선체 ${Math.ceil(model.currentHull)} / ${model.maxHull}`, '#dcecf2'),
        this.textSpan(`· ${state.text}`, state.color),
      );
      this.hullTrack.style.background = 'rgba(10,24,32,0.9)';
      this.hullFill.style.width = `${Math.round(model.hullRatio * 100)}%`;
      this.hullFill.style.background = state.color;
    }

    this.floodingLine.replaceChildren(
      this.textSpan(
        `≋ 침수 ${Math.round(model.floodingLevel * 100)}%`,
        model.floodingLevel > 0 ? '#ffb08a' : '#7f97a3',
      ),
    );

    this.warningsRow.replaceChildren();
    for (const warningId of model.warningIds) {
      const appearance = WARNING_APPEARANCE[warningId];
      if (!appearance) continue; // 미지의 키 — 발명하지 않고 표시 생략
      const chip = document.createElement('span');
      chip.setAttribute('data-survival-warning', warningId);
      chip.style.cssText = `display:inline-flex;gap:0.25rem;color:${appearance.color}`;
      chip.textContent = `${appearance.icon} ${appearance.text}`;
      this.warningsRow.appendChild(chip);
    }
  }

  private textSpan(text: string, color: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.textContent = text;
    span.style.color = color;
    return span;
  }

  dispose(): void {
    this.root.remove();
    this.flash.remove();
    this.hitIndicator.remove();
  }
}
