/**
 * 단서 interactable 시각 표식 — 배치 데이터의 **표현 전용** 시각화
 * (INT-CORE-022 인계표 §4: 시각 표식은 그래픽스 소유 — 판정 금지).
 *
 * 경계:
 *  - 위치는 `world/bossCluePlacements`(월드 데이터 정본)를 읽기만 한다 —
 *    렌더가 좌표를 만들지 않는다 (배치 파일 수정 금지).
 *  - 회수 판정·근접 판정·홀드 진행은 전혀 하지 않는다. 회수 완료 반영은
 *    공식 `interactionCollected` 이벤트(구독: 렌더 — 회수 연출)의 통지를
 *    받아 해당 표식을 제거하는 것뿐이다.
 *  - 어떤 단서인지(clueId)는 시각으로 구분하지 않는다 — targetId 단위
 *    존재/회수 표시만 한다 (매핑 해석은 렌더 소관이 아니다).
 *
 * 표현: 착저한 소형 기록 장치(회색 박스 계열) + 느린 점멸 표시등.
 * salvage 회색 박스와 톤을 구분하는 한색 계열 — 최종 아트 아님.
 */

import * as THREE from 'three';
import {
  BOSS_CLUE_PLACEMENTS,
  type BossCluePlacement,
} from '../world/bossCluePlacements';

/** 단서 표식 공통색 — salvage(황토색)와 구분되는 한색 (표현 전용) */
const CLUE_BODY_COLOR = 0x5a7d8a;
const CLUE_EMISSIVE = 0x0d2a33;
const CLUE_LAMP_COLOR = 0x8fd8e8;
/** 표시등 점멸 주기 (s) — 순수 연출값 */
const LAMP_PULSE_SECONDS = 2.4;

export class ClueMarkerVisuals {
  readonly root = new THREE.Group();

  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly lampMaterial: THREE.MeshBasicMaterial;
  /** interactableId → 표식 노드 (회수 통지 시 제거) */
  private readonly nodes = new Map<string, THREE.Group>();
  private elapsed = 0;

  constructor(placements: readonly BossCluePlacement[] = BOSS_CLUE_PLACEMENTS) {
    const bodyGeometry = new THREE.BoxGeometry(1.0, 0.8, 1.0);
    const antennaGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 5);
    const lampGeometry = new THREE.SphereGeometry(0.14, 8, 6);
    const bodyMaterial = new THREE.MeshLambertMaterial({
      color: CLUE_BODY_COLOR,
      emissive: CLUE_EMISSIVE,
      flatShading: true,
    });
    this.lampMaterial = new THREE.MeshBasicMaterial({
      color: CLUE_LAMP_COLOR,
      transparent: true,
      opacity: 0.9,
    });
    this.disposables.push(
      bodyGeometry, antennaGeometry, lampGeometry, bodyMaterial, this.lampMaterial,
    );

    for (const placement of placements) {
      const node = new THREE.Group();
      node.position.set(placement.x, placement.y, placement.z);
      node.add(new THREE.Mesh(bodyGeometry, bodyMaterial));
      const antenna = new THREE.Mesh(antennaGeometry, bodyMaterial);
      antenna.position.y = 0.9;
      node.add(antenna);
      const lamp = new THREE.Mesh(lampGeometry, this.lampMaterial);
      lamp.position.y = 1.5;
      node.add(lamp);
      this.root.add(node);
      this.nodes.set(placement.targetId, node);
    }
  }

  /**
   * 회수 완료 통지 — `interactionCollected`의 targetId를 그대로 받아 해당
   * 표식만 제거한다. 미지 targetId(다른 kind 대상 등)는 무시 (판정 없음).
   */
  markCollected(interactableId: string): void {
    const node = this.nodes.get(interactableId);
    if (!node) return;
    this.root.remove(node);
    this.nodes.delete(interactableId);
  }

  /** 표시등 점멸 — 순수 연출 (판정·시간 계산 무관) */
  update(deltaSeconds: number): void {
    if (this.nodes.size === 0) return;
    this.elapsed += deltaSeconds;
    const pulse = 0.5 + 0.5 * Math.sin((this.elapsed / LAMP_PULSE_SECONDS) * Math.PI * 2);
    this.lampMaterial.opacity = 0.35 + pulse * 0.55;
  }

  dispose(): void {
    for (const [, node] of this.nodes) this.root.remove(node);
    this.nodes.clear();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }
}
