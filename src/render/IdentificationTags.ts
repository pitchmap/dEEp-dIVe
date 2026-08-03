/**
 * B2 — 조준경 식별 태그 (스프린트 B 선행개발, INT-CORE-012).
 *
 * 경계:
 *  - **계약 `ShipIdentificationSource`만 소비한다.** 게임플레이 시스템·엔티티
 *    객체를 직접 읽지 않고, 모델·메시·클래스 이름으로 세력을 추측하지 않는다.
 *  - 식별 성립 여부·거리·표시 가능 판정은 전부 판정측(게임플레이) 결론이다 —
 *    이 파일은 `identificationState`·`tagDisplayable`·`isAlive`·`isTargetable`
 *    을 그대로 따르며 자체 판정을 만들지 않는다.
 *  - `view.faction`은 미식별 동안 **읽지 않는다** (계약 주석의 금지 사항).
 *    표시 근거는 `identificationState`와 `displayLabelId`뿐이다.
 *
 * 접근성 [§10]:
 *  - 색만으로 구분하지 않는다 — 상태 기호(◇ 미식별 / ▲ 적대 / ■ 중립 /
 *    ◆ 경비)와 한국어 문구를 함께 쓴다. 회색조에서도 기호·문구가 남는다.
 *  - 태그는 십자선 중심을 가리지 않도록 표적 화면 좌표에서 **위쪽으로 오프셋**
 *    되며, 중앙 보호 반경 안으로 들어오면 아래쪽으로 뒤집는다.
 *  - 작은 화면 대응: 태그 폭 상한 + 겹칠 때 세로 간격 확보.
 *
 * 조준경 마스크·십자선·거리 눈금은 건드리지 않는다 — 이 오버레이는 별도
 * 레이어(z-index 31: 마스크 30 위, 재화 HUD 32 아래)로 얹힌다.
 */

import * as THREE from 'three';
import type {
  IdentificationState,
  ShipIdentificationSource,
  ShipIdentificationView,
} from '../contracts/identification';
import { applyMarkMask, cssMaskSupported } from './factionMarks';
import type { FactionMarkShape } from './factionVisuals';
import visualParams from './renderVisualParams.json';

/** 태그 마크가 단색 실루엣으로 전환되는 거리 (작은 표시 크기 가독 규칙) */
const MARK_SOLID_BEYOND_METERS = visualParams.artDirection.factionMarks.solidBeyondMeters;

/** 상태별 표시 규격 — 기호·문구는 그래픽스 소유 표현 (계약에 없음) */
interface StateAppearance {
  readonly symbol: string;
  readonly text: string;
  readonly color: string;
  /**
   * 세력 마크 형태(시안 형태 언어) — 식별 상태에만 존재한다. 미식별은
   * null: 세력 마크를 조기 노출하지 않는다(기존 ◇ 규칙 유지).
   */
  readonly markShape: FactionMarkShape | null;
}

/**
 * 미식별은 세력을 노출하지 않는다 — 문구·기호·색 전부 '미식별' 하나뿐이다.
 * 식별 상태의 라벨은 계약 `displayLabelId` 키에서 온다(LABEL_TEXT).
 */
const STATE_APPEARANCE: Readonly<Record<IdentificationState, StateAppearance>> = {
  unidentified: { symbol: '◇', text: '미식별', color: '#c8d4da', markShape: null },
  hostile: { symbol: '▲', text: '적대', color: '#ff9a7a', markShape: 'triangle' },
  neutral: { symbol: '■', text: '중립', color: '#dfe6ea', markShape: 'square' },
  patrol: { symbol: '◆', text: '경비', color: '#8fd2f0', markShape: 'diamond' },
};

/** 계약 라벨 키 → 표시 문구 (문구·색은 계약이 아니라 그래픽스 소유) */
const LABEL_TEXT: Readonly<Record<string, string>> = {
  'faction.hostile': '적대 함선',
  'faction.neutral': '민간 선박',
  'faction.patrol': '경비함',
};

/** 십자선 중심 보호 반경(px) — 이 안에는 태그를 놓지 않는다 (§10) */
const CROSSHAIR_CLEAR_RADIUS_PX = 64;
/** 표적 화면 좌표 기준 기본 세로 오프셋(px) */
const TAG_VERTICAL_OFFSET_PX = 52;
/** 태그가 세로로 겹칠 때 확보하는 최소 간격(px) */
const TAG_MIN_SPACING_PX = 34;

/**
 * B7 로그 연계 신호 — 그래픽스는 '태그가 실제로 노출됐는가'만 알린다.
 * 결과 분류·오인 사격 판정은 툴링 소유다 (여기서 하지 않는다).
 */
export interface IdentificationTagExposure {
  readonly entityId: number;
  /** 태그가 실제로 화면에 그려졌는가 */
  readonly identificationTagVisible: boolean;
  /** 플레이어에게 세력 정보가 실제로 노출됐는가 (미식별 태그는 false) */
  readonly factionRevealed: boolean;
  /** 이 표적에 대해 태그가 **처음** 표시된 시각 (performance.now 기준 ms) */
  readonly firstShownAtMs: number;
}

/** 노출 신호 싱크 — 툴링 수집기가 구현한다 (미주입이면 신호를 버린다) */
export interface IdentificationExposureSink {
  onTagExposure(exposure: IdentificationTagExposure): void;
}

interface TagNode {
  readonly root: HTMLDivElement;
  readonly symbol: HTMLSpanElement;
  readonly label: HTMLSpanElement;
  readonly detail: HTMLSpanElement;
  lastSignature: string;
  firstShownAtMs: number;
  factionRevealed: boolean;
}

export class IdentificationTags {
  private readonly overlay: HTMLDivElement;
  private readonly nodes = new Map<number, TagNode>();
  private readonly projected = new THREE.Vector3();

  private source: ShipIdentificationSource | null = null;
  private sink: IdentificationExposureSink | null = null;
  private active = false;

  constructor(host: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.setAttribute('data-render-identification-tags', '');
    this.overlay.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      'display:none',
      // 조준경 마스크(30) 위, 재화 HUD(32) 아래 — 기존 z 서열 유지
      'z-index:31',
      'overflow:hidden',
    ].join(';');
    host.appendChild(this.overlay);
  }

  /** 계약 소스 연결 — composition root가 1회 주입 (미주입 = 태그 없음) */
  attachSource(source: ShipIdentificationSource): void {
    this.source = source;
  }

  /** B7 노출 신호 싱크 연결 (툴링) */
  attachExposureSink(sink: IdentificationExposureSink): void {
    this.sink = sink;
  }

  /** 조준 상태 — 조준 중에만 태그를 그린다 (조준경 표현의 일부) */
  setAiming(aiming: boolean): void {
    if (this.active === aiming) return;
    this.active = aiming;
    this.overlay.style.display = aiming ? 'block' : 'none';
    if (!aiming) this.clearNodes();
  }

  /** 매 프레임 — 계약 스냅샷을 화면 좌표에 매핑한다 (판정 없음) */
  update(camera: THREE.PerspectiveCamera): void {
    if (!this.active) return;
    const views = this.source?.identifications;
    if (!views || views.length === 0) {
      this.clearNodes();
      return;
    }

    const width = this.overlay.clientWidth;
    const height = this.overlay.clientHeight;
    if (width === 0 || height === 0) return;

    const alive = new Set<number>();
    const placed: Array<{ x: number; y: number }> = [];

    for (const view of views) {
      // 계약 규칙 — 판정측 결론을 그대로 따른다 (렌더 자체 판정 없음)
      if (!view.isAlive) continue; // 죽은 표적: 태그 제거
      if (!view.tagDisplayable) continue; // 표시 불가: 태그 숨김

      const screen = this.projectToScreen(view, camera, width, height);
      if (!screen) continue; // 카메라 뒤 — 표시하지 않는다

      alive.add(view.entityId);
      this.renderTag(view, screen, width, height, placed);
    }

    for (const [entityId, node] of this.nodes) {
      if (alive.has(entityId)) continue;
      node.root.remove();
      this.nodes.delete(entityId);
    }
  }

  /** 월드 좌표 → 화면 좌표. 카메라 뒤면 null */
  private projectToScreen(
    view: ShipIdentificationView,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
  ): { x: number; y: number } | null {
    this.projected.set(
      view.worldPosition.x,
      view.worldPosition.y,
      view.worldPosition.z,
    );
    this.projected.project(camera);
    if (this.projected.z > 1) return null; // 카메라 뒤쪽
    return {
      x: (this.projected.x * 0.5 + 0.5) * width,
      y: (-this.projected.y * 0.5 + 0.5) * height,
    };
  }

  private renderTag(
    view: ShipIdentificationView,
    screen: { x: number; y: number },
    width: number,
    height: number,
    placed: Array<{ x: number; y: number }>,
  ): void {
    const node = this.ensureNode(view.entityId);
    const state = view.identificationState;
    const appearance = STATE_APPEARANCE[state];

    // 미식별이면 세력 라벨을 만들지 않는다 — displayLabelId도 null이다
    const labelText =
      state === 'unidentified' || !view.displayLabelId
        ? '미확인 접촉'
        : (LABEL_TEXT[view.displayLabelId] ?? '접촉');

    // 공격 가능 표시는 targetable일 때만 (§3)
    const targetMark = view.isTargetable ? '◎ 조준 가능' : '― 조준 불가';
    const distance = `${Math.round(view.distanceMeters)}m`;
    // 원거리(작은 표시 크기)는 내부 디테일을 제거한 단색 실루엣 마크
    const solidMark = view.distanceMeters > MARK_SOLID_BEYOND_METERS;
    const signature = `${state}|${labelText}|${distance}|${targetMark}|${solidMark}`;
    if (node.lastSignature !== signature) {
      node.lastSignature = signature;
      // 식별 상태 + CSS mask 지원 → 시안 형태 언어의 SVG 마크.
      // 미식별(markShape null) 또는 mask 미지원 → 기존 텍스트 기호 유지(fallback).
      if (appearance.markShape && cssMaskSupported()) {
        node.symbol.textContent = '';
        applyMarkMask(node.symbol, appearance.markShape, solidMark);
        node.symbol.style.width = '0.85rem';
        node.symbol.style.height = '0.85rem';
      } else {
        node.symbol.style.backgroundColor = 'transparent';
        node.symbol.style.removeProperty('mask-image');
        node.symbol.style.removeProperty('-webkit-mask-image');
        node.symbol.style.width = '';
        node.symbol.style.height = '';
        node.symbol.textContent = appearance.symbol;
      }
      node.label.textContent = `${appearance.text} · ${labelText}`;
      node.detail.textContent = `${distance} · ${targetMark}`;
      node.root.style.color = appearance.color;
      node.root.style.borderColor = appearance.color;
    }

    // 십자선 중심을 가리지 않도록 위로 띄우고, 중심에 겹치면 아래로 뒤집는다
    const centerX = width / 2;
    const centerY = height / 2;
    let x = screen.x;
    let y = screen.y - TAG_VERTICAL_OFFSET_PX;
    if (Math.hypot(x - centerX, y - centerY) < CROSSHAIR_CLEAR_RADIUS_PX) {
      y = screen.y + TAG_VERTICAL_OFFSET_PX;
    }
    // 작은 화면 겹침 완화 — 이미 놓인 태그와 가까우면 세로로 밀어낸다
    for (const other of placed) {
      if (Math.abs(other.x - x) < 120 && Math.abs(other.y - y) < TAG_MIN_SPACING_PX) {
        y = other.y + TAG_MIN_SPACING_PX;
      }
    }
    placed.push({ x, y });

    node.root.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;

    // B7 신호 — 최초 표시 시각 기록 + 세력 노출 여부 (분류·판정은 툴링)
    const factionRevealed = state !== 'unidentified';
    if (node.firstShownAtMs === 0 || node.factionRevealed !== factionRevealed) {
      if (node.firstShownAtMs === 0) node.firstShownAtMs = performance.now();
      node.factionRevealed = factionRevealed;
      this.sink?.onTagExposure({
        entityId: view.entityId,
        identificationTagVisible: true,
        factionRevealed,
        firstShownAtMs: node.firstShownAtMs,
      });
    }
  }

  private ensureNode(entityId: number): TagNode {
    const existing = this.nodes.get(entityId);
    if (existing) return existing;

    const root = document.createElement('div');
    root.setAttribute('data-identification-tag', String(entityId));
    root.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'display:flex',
      'align-items:center',
      'gap:0.35rem',
      'padding:0.15rem 0.4rem',
      'max-width:min(46vw, 14rem)',
      'border:1px solid currentColor',
      'border-radius:3px',
      'background:rgba(4,12,17,0.72)',
      'font:0.72rem/1.3 system-ui,sans-serif',
      'white-space:nowrap',
    ].join(';');

    const symbol = document.createElement('span');
    symbol.style.cssText = 'font-size:0.9rem;line-height:1;display:inline-block;flex:none';
    const texts = document.createElement('span');
    texts.style.cssText = 'display:flex;flex-direction:column';
    const label = document.createElement('span');
    const detail = document.createElement('span');
    detail.style.cssText = 'opacity:0.82;font-size:0.66rem';
    texts.append(label, detail);
    root.append(symbol, texts);
    this.overlay.appendChild(root);

    const node: TagNode = {
      root,
      symbol,
      label,
      detail,
      lastSignature: '',
      firstShownAtMs: 0,
      factionRevealed: false,
    };
    this.nodes.set(entityId, node);
    return node;
  }

  private clearNodes(): void {
    for (const [, node] of this.nodes) node.root.remove();
    this.nodes.clear();
  }

  dispose(): void {
    this.clearNodes();
    this.overlay.remove();
  }
}
