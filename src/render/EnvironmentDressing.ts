/**
 * 환경 배치 — 부활 1호 이행 (5차 결의 5·11차 결의 1).
 *
 * 범위·제약:
 *  - 산호 군집 3종을 재배치로 15~20개소, **인스턴싱 어군 2종**, 침몰선 잔해
 *    1개(화물선 실루엣 재활용) — 전부 연안(수로 상·중층) 한정.
 *  - 밀도 캡: renderVisualParams.environment 값이 상한 기록 — 60fps 위협 시
 *    즉시 재컷 대상. **보스 전장 엄폐물은 신규 추가가 아니라 이 예산에서
 *    재배분한다** (11차 결의 1 — 이동·재배분 원칙).
 *  - 배치는 공유 CanyonLayout.blocks에서 파생(결정적, 난수·수식 복제 없음) —
 *    벽 안쪽 기슭을 따라 배치한다. 잔해·산호가 '맥락'을 이룬다(6차 결의 4).
 *  - 어군은 장식(게임 상태 없음) — 이동은 순수 시각 루프이며 판정·탐지와
 *    무관하다. 어군-경고 연동은 백로그(구현 금지).
 *  - 맵 체감 확장: 기존 벽 블록의 원경 실루엣 1겹(인스턴싱 1드로우, 시각
 *    전용 — 충돌·레이아웃 데이터 무변경, 2차 결의 4 '다층 재배치' 이행).
 *  - 드로우 수 증가: 산호 3 + 어군 2 + 잔해 4 + 원경 1 = **+10** (예산 기록).
 */

import * as THREE from 'three';
import type { CanyonLayout } from '../contracts/layout';
import visualParams from './renderVisualParams.json';

const PARAMS = visualParams.environment;

/** 어군 유영 궤도·잔해 배치 — 시각 상수 (밸런스 아님) */
const FISH_ORBIT_RADIUS = 9;
const FISH_ORBIT_SECONDS = 26;
const FISH_MID_WATER_Y = 4;
const WRECK_Z = 34;

export class EnvironmentDressing {
  readonly root = new THREE.Group();

  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly fishSchools: Array<{
    mesh: THREE.InstancedMesh;
    offsets: Array<{ x: number; y: number; z: number; phase: number }>;
    centerX: number;
    centerZ: number;
    y: number;
    phase: number;
    direction: 1 | -1;
  }> = [];
  private readonly workMatrix = new THREE.Matrix4();
  private readonly workPosition = new THREE.Vector3();
  private readonly workQuaternion = new THREE.Quaternion();
  private readonly workEuler = new THREE.Euler();
  private readonly workScale = new THREE.Vector3();
  private elapsed = 0;

  constructor(layout: CanyonLayout) {
    this.buildCorals(layout);
    this.buildFishSchools(layout);
    this.buildShipwreck(layout);
    this.buildBackgroundSilhouettes(layout);
  }

  /** 산호 3종 — 타입별 InstancedMesh 1드로우, 벽 기슭 결정적 배치 */
  private buildCorals(layout: CanyonLayout): void {
    const coralTypes = [
      { geometry: new THREE.ConeGeometry(0.8, 2.2, 5), color: 0x7a5a6e },
      { geometry: new THREE.CylinderGeometry(0.18, 0.3, 2.6, 5), color: 0x5a7a6a },
      { geometry: new THREE.BoxGeometry(1.6, 1.8, 0.3), color: 0x6e6a52 },
    ];

    // 벽 블록(큰 sizeZ)만 골라 안쪽 기슭 좌표 산출 — 좌/우안은 배치 순서(짝/홀)
    const walls = layout.blocks.filter((block) => block.sizeZ > 8);
    const placements: Array<{ x: number; z: number; index: number }> = [];
    for (let i = 0; i < walls.length; i += 1) {
      if (placements.length >= PARAMS.coralClusterTarget) break;
      if (i % 4 === 3) continue; // 간격 유지 — 상한 준수
      const wall = walls[i];
      if (!wall) continue;
      const towardChannel = i % 2 === 0 ? 1 : -1; // 짝수=좌안(수로는 +x 쪽)
      placements.push({
        x: wall.x + towardChannel * (wall.sizeX / 2 + 1.6),
        z: wall.z + Math.sin(i * 3.1) * 3.5,
        index: i,
      });
    }

    coralTypes.forEach((type, typeIndex) => {
      const material = new THREE.MeshLambertMaterial({
        color: type.color,
        flatShading: true,
      });
      this.disposables.push(type.geometry, material);
      const slots = placements.filter((_, i) => i % 3 === typeIndex);
      const mesh = new THREE.InstancedMesh(
        type.geometry,
        material,
        Math.max(slots.length, 1),
      );
      slots.forEach((slot, i) => {
        const scale = 0.8 + 0.5 * Math.abs(Math.sin(slot.index * 1.7));
        this.workEuler.set(0, slot.index * 1.3, 0);
        this.workQuaternion.setFromEuler(this.workEuler);
        this.workScale.setScalar(scale);
        this.workPosition.set(slot.x, layout.floorY + 1.0 * scale, slot.z);
        this.workMatrix.compose(this.workPosition, this.workQuaternion, this.workScale);
        mesh.setMatrixAt(i, this.workMatrix);
      });
      mesh.count = slots.length;
      mesh.instanceMatrix.needsUpdate = true;
      this.disposables.push(mesh);
      this.root.add(mesh);
    });
  }

  /** 어군 2종 — 종당 InstancedMesh 1드로우, 수로 중층 완만한 궤도 유영(장식) */
  private buildFishSchools(layout: CanyonLayout): void {
    const fishTypes: Array<{ geometry: THREE.BufferGeometry; color: number; y: number }> = [
      { geometry: new THREE.ConeGeometry(0.12, 0.55, 4), color: 0x9fb8c4, y: FISH_MID_WATER_Y },
      { geometry: new THREE.ConeGeometry(0.2, 0.85, 4), color: 0x6f8a96, y: FISH_MID_WATER_Y - 3 },
    ];
    // 궤도 중심 — 수로 위 기둥(작은 블록) 주변에 배치해 '맥락' 유지
    const pillars = layout.blocks.filter((block) => block.sizeZ <= 8);

    fishTypes.forEach((type, typeIndex) => {
      // 물고기 축(원뿔 Y축)을 진행 방향(-Z)으로 눕힌다
      type.geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshLambertMaterial({
        color: type.color,
        flatShading: true,
      });
      this.disposables.push(type.geometry, material);

      const mesh = new THREE.InstancedMesh(type.geometry, material, PARAMS.fishPerSchool);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;

      const offsets: Array<{ x: number; y: number; z: number; phase: number }> = [];
      for (let i = 0; i < PARAMS.fishPerSchool; i += 1) {
        offsets.push({
          x: Math.sin(i * 2.39) * 2.2,
          y: Math.cos(i * 1.71) * 1.1,
          z: Math.sin(i * 3.07) * 2.2,
          phase: i * 0.61,
        });
      }

      const anchor = pillars[typeIndex % Math.max(pillars.length, 1)];
      this.fishSchools.push({
        mesh,
        offsets,
        centerX: anchor ? anchor.x : 0,
        centerZ: anchor ? anchor.z : 0,
        y: type.y,
        phase: typeIndex * Math.PI,
        direction: typeIndex % 2 === 0 ? 1 : -1,
      });
      this.disposables.push(mesh);
      this.root.add(mesh);
    });
  }

  /** 침몰선 잔해 1개 — 화물선 실루엣 재활용(신규 모델 없음), 해저 반매몰 */
  private buildShipwreck(layout: CanyonLayout): void {
    const hullMaterial = new THREE.MeshLambertMaterial({
      color: 0x2f3d44,
      flatShading: true,
    });
    const hullGeometry = new THREE.BoxGeometry(5, 4, 20);
    const bowGeometry = new THREE.BoxGeometry(3.5, 4, 3.5);
    const superGeometry = new THREE.BoxGeometry(3.4, 3, 4.5);
    this.disposables.push(hullMaterial, hullGeometry, bowGeometry, superGeometry);

    const wreck = new THREE.Group();
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    wreck.add(hull);
    const bow = new THREE.Mesh(bowGeometry, hullMaterial);
    bow.position.set(0, 0, -11);
    bow.rotation.y = Math.PI / 4;
    wreck.add(bow);
    const superstructure = new THREE.Mesh(superGeometry, hullMaterial);
    superstructure.position.set(0, 3, 6);
    wreck.add(superstructure);

    // 수로 중앙 부근, 좌안 쪽 바닥에 기울여 반매몰
    wreck.position.set(-6, layout.floorY + 0.6, WRECK_Z);
    wreck.rotation.set(0.12, 0.9, 0.5);
    this.root.add(wreck);
  }

  /**
   * 원경 실루엣 1겹 — 기존 벽 블록을 바깥쪽·대형으로 비춘 시각 전용 배경
   * (인스턴싱 1드로우). 레이아웃 데이터·충돌 무변경 — 맵 체감 확장만 담당.
   */
  private buildBackgroundSilhouettes(layout: CanyonLayout): void {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({
      color: 0x1c2b33,
      flatShading: true,
    });
    this.disposables.push(geometry, material);

    const walls = layout.blocks.filter((block) => block.sizeZ > 8);
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(walls.length, 1));
    walls.forEach((wall, i) => {
      const outward = wall.x >= 0 ? 1 : -1;
      const scaleX = wall.sizeX * 1.8;
      const scaleY = wall.sizeY * 1.5;
      const scaleZ = wall.sizeZ * 2.2;
      this.workEuler.set(0, wall.rotationY * 0.5, 0);
      this.workQuaternion.setFromEuler(this.workEuler);
      this.workScale.set(scaleX, scaleY, scaleZ);
      this.workPosition.set(
        wall.x + outward * (wall.sizeX + 24),
        layout.floorY + scaleY / 2 - 2,
        wall.z * 1.15,
      );
      this.workMatrix.compose(this.workPosition, this.workQuaternion, this.workScale);
      mesh.setMatrixAt(i, this.workMatrix);
    });
    mesh.count = walls.length;
    mesh.instanceMatrix.needsUpdate = true;
    this.disposables.push(mesh);
    this.root.add(mesh);
  }

  /** 어군 유영 갱신 — 순수 시각 루프 (판정·탐지 무관) */
  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;
    const orbitOmega = (Math.PI * 2) / FISH_ORBIT_SECONDS;

    for (const school of this.fishSchools) {
      const angle = school.phase + this.elapsed * orbitOmega * school.direction;
      const centerX = school.centerX + Math.cos(angle) * FISH_ORBIT_RADIUS;
      const centerZ = school.centerZ + Math.sin(angle) * FISH_ORBIT_RADIUS;
      // 진행 방향(접선) 요 각 — 물고기 로컬 -Z가 진행 방향
      const tangentX = -Math.sin(angle) * school.direction;
      const tangentZ = Math.cos(angle) * school.direction;
      const yaw = Math.atan2(-tangentX, -tangentZ);

      school.offsets.forEach((offset, i) => {
        const wobble = Math.sin(this.elapsed * 2.2 + offset.phase) * 0.4;
        this.workEuler.set(0, yaw + Math.sin(offset.phase + this.elapsed) * 0.2, 0);
        this.workQuaternion.setFromEuler(this.workEuler);
        this.workScale.setScalar(1);
        this.workPosition.set(
          centerX + offset.x + wobble * 0.4,
          school.y + offset.y + wobble,
          centerZ + offset.z,
        );
        this.workMatrix.compose(this.workPosition, this.workQuaternion, this.workScale);
        school.mesh.setMatrixAt(i, this.workMatrix);
      });
      school.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
    this.fishSchools.length = 0;
    this.root.removeFromParent();
    this.root.clear();
  }
}
