/**
 * 잠수함 시각 오브젝트 + 외형 단계 어댑터 (PvE 성장 외형 — 6차·11차 결의).
 *
 * 규칙:
 *  - 외형 단계는 **명시적 visualTier(1~3)를 주입**받아 표현만 한다 —
 *    업그레이드 수치·저장 데이터를 읽거나 계산하지 않는다 (판정·경제는
 *    게임플레이·메타 소유).
 *  - 선체(hull)·주무장(weapon) 단계를 각각 최대 3단계 표현.
 *  - 임시 로우폴리 차이 구현 — **최종 에셋 교체 지점은 buildHullTierParts /
 *    buildWeaponTierParts 두 함수로 격리**되어 있다 (아트 산출물 도착 시
 *    이 두 함수 내부만 교체, setVisualTiers API·부착 규약은 불변).
 *  - 선수·선미 규약: 로컬 -Z = 선수, +Z = 선미 (core/conventions).
 *    프로펠러 장착점은 sternMountZ로 노출한다.
 *
 * 단계 부품은 생성 시 전부 만들어 visible 토글로 전환한다 — 런타임 재생성
 * 없음, dispose 1회 일괄.
 */

import * as THREE from 'three';

const HULL_COLOR = 0x8a949b;
const TIER_ACCENT_COLOR = 0x6d7a82;
/** 선체 반長 — 프로펠러(선미 +Z) 장착 위치 (시각 상수) */
const SUBMARINE_HALF_LENGTH = 2.8;

/**
 * 어뢰관 앵커 — 모델이 정의하는 단일 지점 (13차 결의 2: 앵커는 모델 정의,
 * 파생 소켓은 앵커에서만 파생). 로컬 -Z = 선수 규약(core/conventions).
 * 선수 하부 어뢰관 군의 중앙 — 최종 에셋 교체 시 이 값만 갱신한다.
 */
const TORPEDO_TUBE_ANCHOR_LOCAL = Object.freeze({ x: 0, y: -0.5, z: -2.6 });

export type VisualTier = 1 | 2 | 3;

function clampTier(value: number): VisualTier {
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  return 1;
}

export class SubmarineVisual {
  readonly root = new THREE.Group();
  /** 프로펠러 장착 Z (선미) */
  readonly sternMountZ = SUBMARINE_HALF_LENGTH + 0.15;
  /** 어뢰관 앵커 로컬 좌표 — 계약 이관(INT-RENDER-008) 시 참조용 공개 값 */
  readonly torpedoTubeAnchorLocal = TORPEDO_TUBE_ANCHOR_LOCAL;
  /**
   * 조준 카메라 소켓 (13차 결의 2) — 어뢰관 앵커 **정위치**, 전방축은 모델
   * 전방(-Z)과 동일. 별도 오프셋 없음 — 소비 측(조준 카메라)은 이 소켓의
   * 월드 위치·방향을 그대로 사용해야 하며 독자 오프셋 계산 금지.
   */
  readonly aimCameraSocket = new THREE.Object3D();

  private readonly disposables: Array<{ dispose(): void }> = [];
  /** 단계별 부품 그룹 — [0]=2단계 추가분, [1]=3단계 추가분 (1단계 = 기본형) */
  private readonly hullTierParts: THREE.Group[] = [];
  private readonly weaponTierParts: THREE.Group[] = [];

  constructor() {
    const material = new THREE.MeshLambertMaterial({
      color: HULL_COLOR,
      flatShading: true,
    });
    const accentMaterial = new THREE.MeshLambertMaterial({
      color: TIER_ACCENT_COLOR,
      flatShading: true,
    });
    this.disposables.push(material, accentMaterial);

    // ── 기본형(1단계) — 캡슐 선체 + 함교 (선수 쪽) ──
    const hullGeometry = new THREE.CapsuleGeometry(0.9, 3.8, 3, 10);
    hullGeometry.rotateX(Math.PI / 2); // 캡슐 축(Y)을 전후 방향(Z)으로
    const sailGeometry = new THREE.BoxGeometry(0.7, 1.1, 2.0);
    this.disposables.push(hullGeometry, sailGeometry);

    const hull = new THREE.Mesh(hullGeometry, material);
    this.root.add(hull);
    const sail = new THREE.Mesh(sailGeometry, material);
    sail.position.set(0, 1.2, -0.5);
    this.root.add(sail);

    this.aimCameraSocket.position.set(
      TORPEDO_TUBE_ANCHOR_LOCAL.x,
      TORPEDO_TUBE_ANCHOR_LOCAL.y,
      TORPEDO_TUBE_ANCHOR_LOCAL.z,
    );
    this.root.add(this.aimCameraSocket);

    this.buildHullTierParts(material, accentMaterial);
    this.buildWeaponTierParts(accentMaterial);
    this.setVisualTiers(1, 1);
  }

  /**
   * 외형 단계 적용 — 메타 상태(리드 제공 visualTier)를 주입받는 유일한 API.
   * 렌더는 단계 값을 계산하지 않는다.
   */
  setVisualTiers(hullTier: number, weaponTier: number): void {
    const hull = clampTier(hullTier);
    const weapon = clampTier(weaponTier);
    this.hullTierParts.forEach((part, index) => {
      part.visible = hull >= index + 2;
    });
    this.weaponTierParts.forEach((part, index) => {
      part.visible = weapon >= index + 2;
    });
  }

  /**
   * [최종 에셋 교체 지점 ①] 선체 외형 단계 임시 로우폴리 —
   * 2단계: 측면 새들 탱크 / 3단계: 선수 보강판 + 상부 장갑 능선.
   */
  private buildHullTierParts(
    material: THREE.Material,
    accentMaterial: THREE.Material,
  ): void {
    const tier2 = new THREE.Group();
    const saddleGeometry = new THREE.CapsuleGeometry(0.28, 2.4, 2, 6);
    saddleGeometry.rotateX(Math.PI / 2);
    this.disposables.push(saddleGeometry);
    for (const side of [-1, 1]) {
      const saddle = new THREE.Mesh(saddleGeometry, material);
      saddle.position.set(side * 0.95, -0.15, 0.2);
      tier2.add(saddle);
    }

    const tier3 = new THREE.Group();
    const bowPlateGeometry = new THREE.BoxGeometry(1.0, 0.7, 0.9);
    const ridgeGeometry = new THREE.BoxGeometry(0.25, 0.3, 2.6);
    this.disposables.push(bowPlateGeometry, ridgeGeometry);
    const bowPlate = new THREE.Mesh(bowPlateGeometry, accentMaterial);
    bowPlate.position.set(0, 0.1, -2.3);
    bowPlate.rotation.x = 0.25;
    tier3.add(bowPlate);
    const ridge = new THREE.Mesh(ridgeGeometry, accentMaterial);
    ridge.position.set(0, 0.85, 0.9);
    tier3.add(ridge);

    this.hullTierParts.push(tier2, tier3);
    this.root.add(tier2, tier3);
  }

  /**
   * [최종 에셋 교체 지점 ②] 주무장 외형 단계 임시 로우폴리 —
   * 2단계: 선수 하부 쌍발 어뢰관 / 3단계: 외장 어뢰 랙 + 관 증설.
   */
  private buildWeaponTierParts(accentMaterial: THREE.Material): void {
    const tubeGeometry = new THREE.CylinderGeometry(0.14, 0.14, 1.1, 8);
    tubeGeometry.rotateX(Math.PI / 2);
    const rackGeometry = new THREE.BoxGeometry(0.5, 0.24, 1.6);
    this.disposables.push(tubeGeometry, rackGeometry);

    const tier2 = new THREE.Group();
    for (const side of [-1, 1]) {
      const tube = new THREE.Mesh(tubeGeometry, accentMaterial);
      tube.position.set(side * 0.38, -0.5, -2.15);
      tier2.add(tube);
    }

    const tier3 = new THREE.Group();
    for (const side of [-1, 1]) {
      const rack = new THREE.Mesh(rackGeometry, accentMaterial);
      rack.position.set(side * 1.0, 0.35, -0.6);
      tier3.add(rack);
      const tube = new THREE.Mesh(tubeGeometry, accentMaterial);
      tube.position.set(side * 0.7, -0.55, -2.0);
      tier3.add(tube);
    }

    this.weaponTierParts.push(tier2, tier3);
    this.root.add(tier2, tier3);
  }

  dispose(): void {
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
    this.root.removeFromParent();
    this.root.clear();
  }
}
