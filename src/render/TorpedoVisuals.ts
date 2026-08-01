/**
 * 어뢰 가시화 — 로우폴리 어뢰 모델 + 기포 항적 (5차 결의 2).
 *
 * 규칙:
 *  - 게임플레이 `StraightRunTorpedoSystem.torpedoes`(읽기 전용 스냅샷)를
 *    주입받아 표현만 한다 — 어뢰 이동·명중·사거리 판정은 게임플레이 소유.
 *  - 기포 궤적은 리드샷 학습 피드백(P1 승격 근거) — '내 어뢰가 지금 어디로
 *    가는가'가 읽히도록 명확하되, **풀링 + 인스턴싱 1드로우**로 저사양
 *    예산을 지킨다 (어뢰 본체도 보유량 상한만큼 풀링).
 *  - 시각 수치는 renderVisualParams.json(순수 연출값)만 사용.
 */

import * as THREE from 'three';
import visualParams from './renderVisualParams.json';

const PARAMS = visualParams.torpedoTrail;

/** 어뢰 본체 풀 크기 — 보유량(3) + 여유 1 (시각 상수, 판정과 무관) */
const TORPEDO_POOL_SIZE = 4;

/** 게임플레이 어뢰 스냅샷의 렌더 소비 형태 (구조적 일치 — systems 직접 import 금지) */
export interface TorpedoRenderSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly directionX: number;
  readonly directionZ: number;
}

/** 어뢰 상태 소스 — composition root가 gameplay.torpedo를 주입한다 */
export interface TorpedoStateSource {
  readonly torpedoes: readonly TorpedoRenderSnapshot[];
  /** 리드샷 보조선 계산 입력 (판정 아님 — 조준 보조 표시용) */
  readonly torpedoSpeedMetersPerSecond: number;
}

interface BubbleSlot {
  age: number;
  x: number;
  y: number;
  z: number;
}

export class TorpedoVisuals {
  readonly root = new THREE.Group();

  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly torpedoPool: THREE.Group[] = [];
  private readonly bubbles: THREE.InstancedMesh;
  private readonly bubbleSlots: BubbleSlot[] = [];
  private nextBubbleIndex = 0;
  /** 어뢰별 기포 방출 누적 거리 (id → 잔여 미터) */
  private readonly emitAccumulators = new Map<number, number>();
  private readonly workMatrix = new THREE.Matrix4();
  private readonly workPosition = new THREE.Vector3();
  private readonly workQuaternion = new THREE.Quaternion();
  private readonly workScale = new THREE.Vector3();

  constructor() {
    // ── 어뢰 본체 풀 (로우폴리: 몸통 캡슐 + 십자 꼬리날개) ──
    const bodyMaterial = new THREE.MeshLambertMaterial({
      color: 0x3a4750,
      flatShading: true,
    });
    const bodyGeometry = new THREE.CapsuleGeometry(0.14, 0.9, 2, 6);
    bodyGeometry.rotateX(Math.PI / 2); // 축을 전후(Z)로 — 로컬 -Z = 진행 방향
    const finGeometry = new THREE.BoxGeometry(0.5, 0.05, 0.22);
    this.disposables.push(bodyMaterial, bodyGeometry, finGeometry);

    for (let i = 0; i < TORPEDO_POOL_SIZE; i += 1) {
      const unit = new THREE.Group();
      unit.add(new THREE.Mesh(bodyGeometry, bodyMaterial));
      const finH = new THREE.Mesh(finGeometry, bodyMaterial);
      finH.position.z = 0.55;
      unit.add(finH);
      const finV = new THREE.Mesh(finGeometry, bodyMaterial);
      finV.position.z = 0.55;
      finV.rotation.z = Math.PI / 2;
      unit.add(finV);
      unit.visible = false;
      this.torpedoPool.push(unit);
      this.root.add(unit);
    }

    // ── 기포 항적 — 인스턴싱 1드로우 링 버퍼 ──
    const bubbleGeometry = new THREE.SphereGeometry(1, 6, 5);
    const bubbleMaterial = new THREE.MeshBasicMaterial({
      color: 0xcfe9f2,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.disposables.push(bubbleGeometry, bubbleMaterial);
    this.bubbles = new THREE.InstancedMesh(
      bubbleGeometry,
      bubbleMaterial,
      PARAMS.bubblePoolSize,
    );
    this.bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bubbles.renderOrder = 3;
    this.bubbles.frustumCulled = false; // 궤적이 화면 경계에 걸쳐도 유지
    for (let i = 0; i < PARAMS.bubblePoolSize; i += 1) {
      this.bubbleSlots.push({ age: Number.POSITIVE_INFINITY, x: 0, y: 0, z: 0 });
    }
    this.root.add(this.bubbles);
  }

  update(deltaSeconds: number, source: TorpedoStateSource | null): void {
    const torpedoes = source?.torpedoes ?? [];

    // 본체 풀 동기화 — 진행 방향(-Z 선수 규약)으로 정렬
    const seenIds = new Set<number>();
    for (let i = 0; i < this.torpedoPool.length; i += 1) {
      const unit = this.torpedoPool[i];
      const snapshot = torpedoes[i];
      if (!unit) continue;
      if (!snapshot) {
        unit.visible = false;
        continue;
      }
      seenIds.add(snapshot.id);
      unit.visible = true;
      unit.position.set(snapshot.x, snapshot.y, snapshot.z);
      unit.rotation.y = Math.atan2(-snapshot.directionX, -snapshot.directionZ);
      this.emitBubbles(deltaSeconds, snapshot, source);
    }
    for (const id of this.emitAccumulators.keys()) {
      if (!seenIds.has(id)) this.emitAccumulators.delete(id);
    }

    this.updateBubbles(deltaSeconds);
  }

  /** 주행 거리 비례로 기포 슬롯을 링 버퍼에 기록 (풀 재사용 — 할당 없음) */
  private emitBubbles(
    deltaSeconds: number,
    snapshot: TorpedoRenderSnapshot,
    source: TorpedoStateSource | null,
  ): void {
    const speed = source?.torpedoSpeedMetersPerSecond ?? 0;
    if (speed <= 0) return;
    const spacing = 1 / Math.max(PARAMS.bubblesPerMeter, 0.01);
    let budget =
      (this.emitAccumulators.get(snapshot.id) ?? 0) + speed * deltaSeconds;
    while (budget >= spacing) {
      budget -= spacing;
      const slot = this.bubbleSlots[this.nextBubbleIndex];
      if (slot) {
        // 꼬리(+Z, 진행 반대) 뒤에서 방출 + 결정적 지터
        const jitter = Math.sin(this.nextBubbleIndex * 12.9898) * 0.12;
        slot.age = 0;
        slot.x = snapshot.x - snapshot.directionX * 0.7 + jitter;
        slot.y = snapshot.y + Math.cos(this.nextBubbleIndex * 7.3) * 0.1;
        slot.z = snapshot.z - snapshot.directionZ * 0.7;
      }
      this.nextBubbleIndex = (this.nextBubbleIndex + 1) % this.bubbleSlots.length;
    }
    this.emitAccumulators.set(snapshot.id, budget);
  }

  private updateBubbles(deltaSeconds: number): void {
    for (let i = 0; i < this.bubbleSlots.length; i += 1) {
      const slot = this.bubbleSlots[i];
      if (!slot) continue;
      slot.age += deltaSeconds;
      const life = Math.min(slot.age / PARAMS.bubbleLifeSeconds, 1);
      // 수명 종료 슬롯은 스케일 0으로 화면에서 제거 (인스턴스 수 고정)
      const scale =
        life >= 1 ? 0 : PARAMS.bubbleStartScale * (1 - life * 0.6);
      slot.y += PARAMS.bubbleRiseMetersPerSecond * deltaSeconds;
      this.workScale.setScalar(Math.max(scale, 0.0001));
      this.workPosition.set(slot.x, slot.y, slot.z);
      this.workMatrix.compose(this.workPosition, this.workQuaternion, this.workScale);
      this.bubbles.setMatrixAt(i, this.workMatrix);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.bubbles.dispose();
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
    this.emitAccumulators.clear();
    this.root.removeFromParent();
    this.root.clear();
  }
}
