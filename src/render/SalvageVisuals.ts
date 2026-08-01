/**
 * 해저 재화(salvage) 회색 박스 표현 — 배치된 파괴 대상의 시각화.
 *
 * 경계 (판정·보상 계산 금지):
 *  - 게임플레이 `EconomySystem.salvageObjects`의 읽기 전용 스냅샷만 소비한다
 *    (위치·kind·파괴 여부). 파괴 판정·드롭 생성·회수는 전부 게임플레이 소유.
 *  - **희귀 부품 포함 여부(rarePartId)를 시각으로 사전 노출하지 않는다** —
 *    스냅샷에 필드가 있어도 읽지 않는다. 어떤 것이 희귀 부품을 품었는지는
 *    부순 뒤에 알게 된다 (탐지 UI는 C 범위 — 여기서 만들지 않는다).
 *  - 회수 가능 범위 피드백은 **게임플레이가 이미 쓰는 회수 반경 값을 주입받아**
 *    링으로 그린다 — 렌더가 반경을 정의하지 않는다.
 *
 * 표현: kind별 회색 박스 3종(상자=육면체 / 컨테이너=납작한 직육면체 /
 * 광물=다면체 덩어리). 최종 아트가 아니며, '회수 가능한 물체'로 읽히도록
 * 공통 강조색 테두리와 바닥 접지 링을 공유한다.
 */

import * as THREE from 'three';

/** 게임플레이 salvage 스냅샷의 구조적 단면 (rarePartId는 의도적으로 제외) */
export interface SalvageVisualState {
  readonly id: number;
  readonly kind: 'chest' | 'container' | 'mineral';
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly destroyed: boolean;
}

export interface SalvageStateSource {
  readonly salvageObjects: readonly SalvageVisualState[];
}

/** 회수 가능 물체 공통 강조색 (환경 회색 박스와 구분되는 단일 톤) */
const SALVAGE_COLOR = 0xb9a06a;
const SALVAGE_EMISSIVE = 0x2a2410;
/** 접지·범위 링 색 — 회수 가능 범위 피드백 */
const RANGE_RING_COLOR = 0x9fd6c0;

export class SalvageVisuals {
  readonly root = new THREE.Group();

  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly material: THREE.MeshLambertMaterial;
  private readonly ringGeometry: THREE.RingGeometry;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  /** salvage id → 시각 노드 (배치·파괴에 따라 생성·제거) */
  private readonly nodes = new Map<number, THREE.Group>();

  private source: SalvageStateSource | null = null;
  /** 게임플레이 회수 반경 (주입) — 렌더가 정의하지 않는다 */
  private pickupRadiusMeters = 0;
  private elapsed = 0;

  constructor() {
    this.material = new THREE.MeshLambertMaterial({
      color: SALVAGE_COLOR,
      emissive: SALVAGE_EMISSIVE,
      flatShading: true,
    });
    // kind별 회색 박스 — 실루엣만 구분 (최종 아트 아님)
    this.geometries.set('chest', new THREE.BoxGeometry(1.8, 1.4, 1.3));
    this.geometries.set('container', new THREE.BoxGeometry(2.6, 1.1, 1.1));
    this.geometries.set('mineral', new THREE.DodecahedronGeometry(1.1, 0));

    this.ringGeometry = new THREE.RingGeometry(0.86, 1, 28);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: RANGE_RING_COLOR,
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }

  /** 게임플레이 상태 소스 연결 — composition root가 1회 주입 */
  attachSource(source: SalvageStateSource): void {
    this.source = source;
  }

  /**
   * 회수 가능 범위(m) 주입 — 게임플레이가 실제 판정에 쓰는 값 그대로.
   * 미주입(0 이하)이면 범위 링을 그리지 않는다 (렌더가 값을 지어내지 않음).
   */
  setPickupRadiusMeters(meters: number): void {
    this.pickupRadiusMeters = Number.isFinite(meters) && meters > 0 ? meters : 0;
  }

  update(deltaSeconds: number): void {
    const objects = this.source?.salvageObjects;
    if (!objects) return;
    this.elapsed += deltaSeconds;

    const alive = new Set<number>();
    for (const state of objects) {
      if (state.destroyed) continue; // 파괴된 것은 시각도 제거 (아래 정리)
      alive.add(state.id);
      let node = this.nodes.get(state.id);
      if (!node) {
        node = this.buildNode(state.kind);
        node.position.set(state.positionX, state.positionY, state.positionZ);
        this.root.add(node);
        this.nodes.set(state.id, node);
      }
      // 느린 자전 — '조사 가능한 물체'라는 시각 신호 (판정 무관)
      node.rotation.y += deltaSeconds * 0.25;
    }

    // 파괴·제거된 salvage의 시각 자원 정리
    for (const [id, node] of this.nodes) {
      if (alive.has(id)) continue;
      this.root.remove(node);
      this.nodes.delete(id);
    }
  }

  private buildNode(kind: SalvageVisualState['kind']): THREE.Group {
    const group = new THREE.Group();
    const geometry = this.geometries.get(kind) ?? this.geometries.get('chest');
    if (geometry) {
      group.add(new THREE.Mesh(geometry, this.material));
    }
    if (this.pickupRadiusMeters > 0) {
      // 회수 가능 범위 — 해저면에 눕힌 링 (게임플레이 반경 그대로 스케일)
      const ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -1.4; // 물체 아래 해저면 근처
      ring.scale.setScalar(this.pickupRadiusMeters);
      group.add(ring);
    }
    return group;
  }

  dispose(): void {
    for (const [, node] of this.nodes) this.root.remove(node);
    this.nodes.clear();
    for (const [, geometry] of this.geometries) geometry.dispose();
    this.geometries.clear();
    this.material.dispose();
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
  }
}
