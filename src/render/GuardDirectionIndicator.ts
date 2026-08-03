/**
 * 경비함 등장 방향 표시 (스프린트 B 선행개발 §5).
 *
 * 규칙:
 *  - **실제 스폰된 경비함의 위치**만 가리킨다. 존재하지 않는 경비함을
 *    가리키지 않는다 — 스폰 결과 read model이 비어 있으면 마커는 없다
 *    (요청 이벤트만으로 마커를 띄우지 않는다: 사건 지점 ≠ 경비함 위치).
 *  - 시간 정지·컷신·탐지 게이지·경보 시스템 없음 (C 범위 선행 금지).
 *  - 화면 안에 이미 보이면 방향 마커를 그리지 않는다(과도한 표시 생략).
 *    화면 밖이면 화면 가장자리에 방향을 표시한다.
 *  - 표시 수명: 스폰 직후 짧게. 경비함이 화면에 들어오거나 표시 시간이
 *    지나면 제거한다.
 *  - 기지(BASE) 화면에서는 표시하지 않는다 (§10 — 해역 전용 표시).
 *
 * 접근성 [§10]: 색 외에 **화살표 형태 + 거리 문구**를 함께 제공한다.
 */

import * as THREE from 'three';
import { applyMarkMask, cssMaskSupported } from './factionMarks';

/** 스폰된 경비함 1척의 표시용 단면 — 위치는 실제 스폰 결과에서만 온다 */
export interface GuardSightingView {
  /** 스폰 요청 id — 중복 표시 방지 키 (경비 원장의 requestId와 동일) */
  readonly requestId: string;
  readonly worldPosition: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * 스폰 결과 소스 — composition root가 실제 스폰 결과로 채운다.
 * 게임플레이 스폰이 차단돼 있으면 **비어 있어야 한다**(가짜 경비함 금지).
 */
export interface GuardSightingSource {
  readonly sightings: readonly GuardSightingView[];
}

/** 마커 표시 지속 시간 (초) — 짧은 등장 안내 (연출값) */
const MARKER_LIFETIME_SECONDS = 6;
/** 화면 가장자리 여백 (px) */
const EDGE_MARGIN_PX = 44;
/**
 * '화면에 들어왔다'로 인정하기까지 필요한 연속 노출 시간(초).
 * 장면 전환(기지→해역) 직후의 한 프레임짜리 오투영으로 마커가 영구
 * 소멸하지 않도록 하는 최소 체류 조건이다.
 */
const ON_SCREEN_DWELL_SECONDS = 0.25;

interface MarkerNode {
  readonly root: HTMLDivElement;
  readonly arrow: HTMLSpanElement;
  readonly text: HTMLSpanElement;
  remainingSeconds: number;
}

export class GuardDirectionIndicator {
  private readonly overlay: HTMLDivElement;
  private readonly markers = new Map<string, MarkerNode>();
  private readonly projected = new THREE.Vector3();
  /** 이미 수명이 끝났거나 화면에 들어온 적 있는 요청 — 재표시 금지 */
  private readonly retired = new Set<string>();
  /** 요청별 연속 화면 내 노출 시간 — 전환 프레임 오판 방지용 */
  private readonly onScreenSeconds = new Map<string, number>();

  private source: GuardSightingSource | null = null;
  private suppressed = false;

  constructor(host: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.setAttribute('data-render-guard-direction', '');
    this.overlay.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      // 조준경 마스크(30) 위, 재화 HUD(32) 아래 — 기지 UI(25)와 무관
      'z-index:31',
      'overflow:hidden',
    ].join(';');
    host.appendChild(this.overlay);
  }

  /** 실제 스폰 결과 소스 연결 — 미주입이면 마커 없음 */
  attachSource(source: GuardSightingSource): void {
    this.source = source;
  }

  /**
   * 표시 억제 — 기지(BASE) 화면 등 해역이 아닌 상태에서 호출한다.
   * 억제 중에는 마커를 그리지 않고 기존 마커를 지운다 (§10).
   */
  setSuppressed(suppressed: boolean): void {
    if (this.suppressed === suppressed) return;
    this.suppressed = suppressed;
    this.overlay.style.display = suppressed ? 'none' : 'block';
    if (suppressed) this.clear();
  }

  update(deltaSeconds: number, camera: THREE.PerspectiveCamera): void {
    if (this.suppressed) return;
    const sightings = this.source?.sightings ?? [];
    const width = this.overlay.clientWidth;
    const height = this.overlay.clientHeight;
    if (width === 0 || height === 0) return;

    const alive = new Set<string>();
    for (const sighting of sightings) {
      if (this.retired.has(sighting.requestId)) continue;

      const onScreen = this.projectSighting(sighting, camera, width, height);
      if (onScreen.visible) {
        // 화면 안 — 일정 시간 연속으로 보여야 '들어왔다'로 인정한다.
        // (전환 직후 한 프레임 오투영으로 마커가 사라지지 않게 한다.)
        const dwell = (this.onScreenSeconds.get(sighting.requestId) ?? 0) + deltaSeconds;
        this.onScreenSeconds.set(sighting.requestId, dwell);
        if (dwell >= ON_SCREEN_DWELL_SECONDS) {
          this.retired.add(sighting.requestId); // 마커 역할 종료
          continue;
        }
        // 아직 체류 조건 미달 — 이번 프레임은 마커를 유지한다
      } else {
        this.onScreenSeconds.set(sighting.requestId, 0);
      }

      alive.add(sighting.requestId);
      const marker = this.ensureMarker(sighting.requestId);
      marker.remainingSeconds -= deltaSeconds;
      if (marker.remainingSeconds <= 0) {
        this.retired.add(sighting.requestId);
        alive.delete(sighting.requestId);
        continue;
      }
      this.placeMarker(marker, onScreen, width, height);
    }

    for (const [requestId, marker] of this.markers) {
      if (alive.has(requestId)) continue;
      marker.root.remove();
      this.markers.delete(requestId);
    }
  }

  /** 화면 좌표 투영 — 화면 밖이면 방향 벡터를 함께 돌려준다 */
  private projectSighting(
    sighting: GuardSightingView,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
  ): { visible: boolean; x: number; y: number; distanceMeters: number } {
    const position = sighting.worldPosition;
    this.projected.set(position.x, position.y, position.z);
    const distanceMeters = this.projected.distanceTo(camera.position);
    this.projected.project(camera);

    const behind = this.projected.z > 1;
    const x = (this.projected.x * 0.5 + 0.5) * width;
    const y = (-this.projected.y * 0.5 + 0.5) * height;
    const inside =
      !behind && x >= 0 && x <= width && y >= 0 && y <= height;
    // 카메라 뒤면 화면 좌표 부호가 뒤집히므로 반전해 방향을 유지한다
    return {
      visible: inside,
      x: behind ? width - x : x,
      y: behind ? height - y : y,
      distanceMeters,
    };
  }

  private placeMarker(
    marker: MarkerNode,
    screen: { x: number; y: number; distanceMeters: number },
    width: number,
    height: number,
  ): void {
    const centerX = width / 2;
    const centerY = height / 2;
    const dx = screen.x - centerX;
    const dy = screen.y - centerY;
    const angle = Math.atan2(dy, dx);

    // 화면 가장자리(여백 안쪽)로 클램프 — 방향은 실제 스폰 위치 기준
    const halfW = Math.max(width / 2 - EDGE_MARGIN_PX, 1);
    const halfH = Math.max(height / 2 - EDGE_MARGIN_PX, 1);
    const scale = Math.min(
      halfW / Math.max(Math.abs(Math.cos(angle)) * halfW, 1e-3),
      halfH / Math.max(Math.abs(Math.sin(angle)) * halfH, 1e-3),
    );
    const edgeX = centerX + Math.cos(angle) * halfW * Math.min(scale, 1);
    const edgeY = centerY + Math.sin(angle) * halfH * Math.min(scale, 1);

    marker.root.style.transform = `translate(-50%, -50%) translate(${edgeX}px, ${edgeY}px)`;
    // 화살표는 회전으로 방향을 표현 — 색이 아니라 형태가 1차 신호 (§10)
    marker.arrow.style.transform = `rotate(${angle + Math.PI / 2}rad)`;
    marker.text.textContent = `경비함 접근 ${Math.round(screen.distanceMeters)}m`;
  }

  private ensureMarker(requestId: string): MarkerNode {
    const existing = this.markers.get(requestId);
    if (existing) return existing;

    const root = document.createElement('div');
    root.setAttribute('data-guard-direction-marker', requestId);
    root.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:0.1rem',
      'padding:0.2rem 0.35rem',
      'border:1px solid #8fd2f0',
      'border-radius:3px',
      'background:rgba(4,12,17,0.78)',
      'color:#8fd2f0',
      'font:0.68rem/1.2 system-ui,sans-serif',
      'white-space:nowrap',
    ].join(';');

    const arrow = document.createElement('span');
    arrow.textContent = '➤';
    arrow.style.cssText = 'font-size:0.95rem;line-height:1';
    const text = document.createElement('span');
    // 경비(patrol) 마름모 실루엣 — 방향 마커용 소형 단색 버전 (시안 형태 언어).
    // CSS mask 미지원이면 생략 — 화살표+문구가 기존 그대로 남는다 (fallback).
    if (cssMaskSupported()) {
      const mark = document.createElement('span');
      mark.style.cssText = 'width:0.7rem;height:0.7rem;display:inline-block';
      applyMarkMask(mark, 'diamond', true);
      root.append(mark);
    }
    root.append(arrow, text);
    this.overlay.appendChild(root);

    const marker: MarkerNode = {
      root,
      arrow,
      text,
      remainingSeconds: MARKER_LIFETIME_SECONDS,
    };
    this.markers.set(requestId, marker);
    return marker;
  }

  private clear(): void {
    for (const [, marker] of this.markers) marker.root.remove();
    this.markers.clear();
    this.onScreenSeconds.clear();
  }

  dispose(): void {
    this.clear();
    this.retired.clear();
    this.overlay.remove();
  }
}
