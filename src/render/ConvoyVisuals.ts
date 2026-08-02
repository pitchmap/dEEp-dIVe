/**
 * B6 — 고가치 수송선·호위 시각 표현 (스프린트 B 선행개발).
 *
 * 경계:
 *  - 계약 `HighValueTransportView`·`EscortBinding`만 소비한다. **거리만 보고
 *    호위 관계를 추측하지 않는다** — 그룹 관계의 근거는 EscortBinding뿐이다.
 *  - 화면 위치는 식별 read model(`ShipIdentificationView.worldPosition`)의
 *    entityId 조인으로만 얻는다 — 렌더가 위치를 만들지 않는다.
 *  - **보상 수치를 노출하지 않는다**: `rewardMultiplierRef`는 참조 키이며
 *    값이 아니다. 화면에는 '고가치'라는 성격만 표시하고 배율·크레딧을
 *    쓰지 않는다.
 *  - B6는 핵심 게이트(B1~B5) 경로에 의존을 만들지 않는다 — 소스가 없으면
 *    아무것도 그리지 않는다. 추적·탐지 상태 머신(C 범위)은 만들지 않는다.
 *
 * 접근성 [§10]: 색 외에 기호(◈ 고가치 / ⚔ 호위)와 문구, 그리고 호위 결속을
 * 나타내는 **연결선 형태**를 함께 사용한다.
 */

import * as THREE from 'three';
import type { EscortBinding, HighValueTransportView } from '../contracts/guard';
import type { ShipIdentificationView } from '../contracts/identification';

/** B6 read model 소스 — composition root가 게임플레이 구현을 주입한다 */
export interface ConvoySource {
  readonly highValueTransports: readonly HighValueTransportView[];
  readonly escortBindings: readonly EscortBinding[];
}

/** 위치 조인용 — 식별 소스의 entityId·worldPosition 단면 */
export interface ConvoyPositionSource {
  readonly identifications: readonly ShipIdentificationView[];
}

interface BadgeNode {
  readonly root: HTMLDivElement;
  lastText: string;
}

export class ConvoyVisuals {
  private readonly overlay: HTMLDivElement;
  private readonly link: SVGSVGElement;
  private readonly badges = new Map<number, BadgeNode>();
  private readonly lines = new Map<string, SVGLineElement>();
  private readonly projected = new THREE.Vector3();

  private source: ConvoySource | null = null;
  private positions: ConvoyPositionSource | null = null;
  private active = false;

  constructor(host: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.setAttribute('data-render-convoy', '');
    this.overlay.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      'display:none',
      'z-index:31', // 식별 태그와 같은 층 (마스크 30 위 · 재화 HUD 32 아래)
      'overflow:hidden',
    ].join(';');

    // 호위 결속선 — 색이 아니라 '선으로 이어져 있음'이 그룹 신호다
    this.link = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.link.setAttribute('data-render-escort-links', '');
    this.link.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    this.overlay.appendChild(this.link);
    host.appendChild(this.overlay);
  }

  /** B6 계약 소스 (미주입이면 아무것도 그리지 않는다) */
  attachSource(source: ConvoySource): void {
    this.source = source;
  }

  /** 위치 조인 소스 — 식별 read model */
  attachPositionSource(source: ConvoyPositionSource): void {
    this.positions = source;
  }

  /** 조준 중에만 표시 (조준경 표현의 일부) */
  setAiming(aiming: boolean): void {
    if (this.active === aiming) return;
    this.active = aiming;
    this.overlay.style.display = aiming ? 'block' : 'none';
    if (!aiming) this.clear();
  }

  update(camera: THREE.PerspectiveCamera): void {
    if (!this.active) return;
    const source = this.source;
    const views = this.positions?.identifications;
    if (!source || !views || views.length === 0) {
      this.clear();
      return;
    }
    const width = this.overlay.clientWidth;
    const height = this.overlay.clientHeight;
    if (width === 0 || height === 0) return;

    // entityId → 화면 좌표 (살아 있고 표시 가능한 개체만)
    const screenOf = new Map<number, { x: number; y: number }>();
    for (const view of views) {
      if (!view.isAlive) continue;
      const screen = this.project(view, camera, width, height);
      if (screen) screenOf.set(view.entityId, screen);
    }

    const aliveBadges = new Set<number>();

    // ① 고가치 수송선 — 보상 수치 없이 성격만 표시
    for (const transport of source.highValueTransports) {
      const screen = screenOf.get(transport.entityId);
      if (!screen) continue;
      aliveBadges.add(transport.entityId);
      this.placeBadge(transport.entityId, '◈ 고가치 수송선', '#ffd9a0', screen);
    }

    // ② 호위함 — EscortBinding에 등장하는 개체만 (거리 추측 금지)
    for (const binding of source.escortBindings) {
      const screen = screenOf.get(binding.escortEntityId);
      if (!screen) continue;
      aliveBadges.add(binding.escortEntityId);
      this.placeBadge(binding.escortEntityId, '⚔ 호위', '#8fd2f0', screen);
    }

    // ③ 호위 결속선 — 양쪽이 모두 화면에 있을 때만 그룹 관계를 잇는다
    const aliveLines = new Set<string>();
    for (const binding of source.escortBindings) {
      const from = screenOf.get(binding.escortEntityId);
      const to = screenOf.get(binding.escortedTransportId);
      if (!from || !to) continue;
      const key = `${binding.escortEntityId}->${binding.escortedTransportId}`;
      aliveLines.add(key);
      this.placeLine(key, from, to);
    }

    this.prune(aliveBadges, aliveLines);
  }

  private project(
    view: ShipIdentificationView,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
  ): { x: number; y: number } | null {
    this.projected.set(view.worldPosition.x, view.worldPosition.y, view.worldPosition.z);
    this.projected.project(camera);
    if (this.projected.z > 1) return null;
    return {
      x: (this.projected.x * 0.5 + 0.5) * width,
      y: (-this.projected.y * 0.5 + 0.5) * height,
    };
  }

  private placeBadge(
    entityId: number,
    text: string,
    color: string,
    screen: { x: number; y: number },
  ): void {
    let node = this.badges.get(entityId);
    if (!node) {
      const root = document.createElement('div');
      root.setAttribute('data-convoy-badge', String(entityId));
      root.style.cssText = [
        'position:absolute',
        'left:0',
        'top:0',
        'padding:0.1rem 0.35rem',
        'border:1px solid currentColor',
        'border-radius:3px',
        'background:rgba(4,12,17,0.72)',
        'font:0.66rem/1.2 system-ui,sans-serif',
        'white-space:nowrap',
      ].join(';');
      this.overlay.appendChild(root);
      node = { root, lastText: '' };
      this.badges.set(entityId, node);
    }
    if (node.lastText !== text) {
      node.lastText = text;
      node.root.textContent = text;
      node.root.style.color = color;
    }
    // 식별 태그(위쪽 오프셋)와 겹치지 않도록 아래쪽에 배치
    node.root.style.transform = `translate(-50%, -50%) translate(${screen.x}px, ${screen.y + 30}px)`;
  }

  private placeLine(
    key: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): void {
    let line = this.lines.get(key);
    if (!line) {
      line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', '#8fd2f0');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '4 3'); // 점선 = 결속 관계
      line.setAttribute('opacity', '0.7');
      this.link.appendChild(line);
      this.lines.set(key, line);
    }
    line.setAttribute('x1', String(from.x));
    line.setAttribute('y1', String(from.y));
    line.setAttribute('x2', String(to.x));
    line.setAttribute('y2', String(to.y));
  }

  private prune(aliveBadges: Set<number>, aliveLines: Set<string>): void {
    for (const [entityId, node] of this.badges) {
      if (aliveBadges.has(entityId)) continue;
      node.root.remove();
      this.badges.delete(entityId);
    }
    for (const [key, line] of this.lines) {
      if (aliveLines.has(key)) continue;
      line.remove();
      this.lines.delete(key);
    }
  }

  private clear(): void {
    for (const [, node] of this.badges) node.root.remove();
    this.badges.clear();
    for (const [, line] of this.lines) line.remove();
    this.lines.clear();
  }

  dispose(): void {
    this.clear();
    this.overlay.remove();
  }
}
