/**
 * 기지 화면 배경 장면 — PvE 성장 루프의 '기지' 시각 (11차 결의 6, 단계 2).
 *
 * 규칙:
 *  - 경량 3D 장면: 정박 독(부두 슬래브·격벽·크레인 실루엣·수면 스트립) +
 *    전시 잠수함. 조명 2개 이내, 그림자·반사 없음 — 인게임과 동일 예산.
 *  - 상점 가격·구매 판정·저장 판정은 구현하지 않는다 — 이 장면은 리드의
 *    메타 루프가 제공하는 **메타 시각 상태(applyMetaVisualState)만 소비**한다.
 *  - 외형 단계는 SubmarineVisual의 visualTier 주입으로만 표현 (수치 계산 금지).
 *  - 정식 활성화는 메타 루프 상태 머신(리드 신규, PvE 단계 1)이 SceneManager
 *    로 전환할 때다 — 그 전까지 렌더 QA 경로(?base=1, CanyonScene 위임)로만
 *    확인한다 (INTEGRATION_NOTES INT-RENDER-007).
 */

import * as THREE from 'three';
import type { ManagedScene } from '../core/SceneManager';
import type { Renderer } from './Renderer';
import { initSceneTextures, onSceneTexture } from './sceneTextures';
import { SubmarineVisual } from './SubmarineVisual';

/** 리드 메타 루프가 제공할 시각 상태의 렌더 소비 형태 (판정·수치 없음) */
export interface BaseMetaVisualState {
  readonly hullVisualTier: number;
  readonly weaponVisualTier: number;
}

const BASE_BACKGROUND = 0x0a1620;
const DOCK_COLOR = 0x3a4148;
const WALL_COLOR = 0x242e36;
const WATER_COLOR = 0x14323e;

export class BaseSceneView implements ManagedScene {
  private readonly scene = new THREE.Scene();
  private readonly submarine = new SubmarineVisual();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private elapsed = 0;

  constructor(private readonly renderer: Renderer) {
    // 협곡 장면 없이 단독 생성돼도 텍스처 로딩이 시작되게 한다 (멱등)
    initSceneTextures(this.renderer.webgl.capabilities.getMaxAnisotropy());
    this.scene.background = new THREE.Color(BASE_BACKGROUND);
    this.scene.fog = new THREE.Fog(BASE_BACKGROUND, 18, 70);

    // 조명 예산: 따뜻한 작업등(방향광 1) + 차가운 환경광
    const workLight = new THREE.DirectionalLight(0xffd9a0, 1.8);
    workLight.position.set(6, 10, 4);
    this.scene.add(workLight);
    this.scene.add(new THREE.AmbientLight(0x2a3d4a, 1.2));

    this.buildDock();

    // 전시 잠수함 — 정박 위치, 느린 부유
    this.submarine.root.position.set(0, 0.4, 0);
    this.submarine.root.rotation.y = 0.6;
    this.scene.add(this.submarine.root);

    // 고정 3/4 시점 — 기지에서는 카메라 입력 없음
    const camera = this.renderer.camera;
    camera.position.set(7.5, 3.4, 9);
    camera.lookAt(0, 0.6, 0);
  }

  /** 메타 시각 상태 소비 — 리드 메타 루프(또는 QA 플래그)가 주입 */
  applyMetaVisualState(state: BaseMetaVisualState): void {
    this.submarine.setVisualTiers(state.hullVisualTier, state.weaponVisualTier);
  }

  private buildDock(): void {
    const dockMaterial = new THREE.MeshLambertMaterial({
      color: DOCK_COLOR,
      flatShading: true,
    });
    const wallMaterial = new THREE.MeshLambertMaterial({
      color: WALL_COLOR,
      flatShading: true,
    });
    const waterMaterial = new THREE.MeshLambertMaterial({
      color: WATER_COLOR,
      emissive: 0x0d2530,
      flatShading: true,
    });
    this.disposables.push(dockMaterial, wallMaterial, waterMaterial);
    // 기지 구조물 = 산업 금속 공통 텍스처 재사용 (잠수함·선박과 GPU 1장 공유).
    // 기지 박스는 0..1 UV 그대로라 대형 슬래브에서는 완만한 명암 변화로만
    // 읽힌다 (금속 텍스처가 평활해 늘어남이 드러나지 않음 — 의도된 트레이드오프)
    onSceneTexture('metal', (texture) => {
      dockMaterial.map = texture;
      dockMaterial.needsUpdate = true;
      wallMaterial.map = texture;
      wallMaterial.needsUpdate = true;
    });

    // 정박 수면 스트립 + 양측 부두 슬래브
    const waterGeometry = new THREE.BoxGeometry(10, 0.2, 40);
    const slabGeometry = new THREE.BoxGeometry(8, 1.6, 40);
    this.disposables.push(waterGeometry, slabGeometry);
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.position.set(0, -1.2, 0);
    this.scene.add(water);
    for (const side of [-1, 1]) {
      const slab = new THREE.Mesh(slabGeometry, dockMaterial);
      slab.position.set(side * 9, -0.6, 0);
      this.scene.add(slab);
    }

    // 후면 격벽 + 지붕 보 + 기둥
    const backWallGeometry = new THREE.BoxGeometry(30, 14, 1);
    const beamGeometry = new THREE.BoxGeometry(30, 0.8, 1.2);
    const pillarGeometry = new THREE.BoxGeometry(1.2, 14, 1.2);
    this.disposables.push(backWallGeometry, beamGeometry, pillarGeometry);
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial);
    backWall.position.set(0, 5, -16);
    this.scene.add(backWall);
    for (const z of [-10, 0, 10]) {
      const beam = new THREE.Mesh(beamGeometry, wallMaterial);
      beam.position.set(0, 10.5, z);
      this.scene.add(beam);
    }
    for (const side of [-1, 1]) {
      for (const z of [-12, 12]) {
        const pillar = new THREE.Mesh(pillarGeometry, wallMaterial);
        pillar.position.set(side * 13, 5, z);
        this.scene.add(pillar);
      }
    }

    // 크레인 실루엣 — 기둥 + 지브 + 케이블 (박스 3개)
    const craneMastGeometry = new THREE.BoxGeometry(0.9, 11, 0.9);
    const craneJibGeometry = new THREE.BoxGeometry(0.6, 0.6, 12);
    const craneCableGeometry = new THREE.BoxGeometry(0.08, 4, 0.08);
    this.disposables.push(craneMastGeometry, craneJibGeometry, craneCableGeometry);
    const mast = new THREE.Mesh(craneMastGeometry, wallMaterial);
    mast.position.set(-11, 4.5, -6);
    this.scene.add(mast);
    const jib = new THREE.Mesh(craneJibGeometry, wallMaterial);
    jib.position.set(-11, 9.6, -1);
    jib.rotation.x = -0.08;
    this.scene.add(jib);
    const cable = new THREE.Mesh(craneCableGeometry, wallMaterial);
    cable.position.set(-11, 7.4, 3.6);
    this.scene.add(cable);
  }

  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;
    // 정박 부유 — 순수 연출 (게임 상태 아님)
    this.submarine.root.position.y = 0.4 + Math.sin(this.elapsed * 0.7) * 0.12;
    this.submarine.root.rotation.z = Math.sin(this.elapsed * 0.5) * 0.015;
  }

  render(): void {
    this.renderer.render(this.scene);
  }

  resize(_width: number, _height: number): void {
    // 카메라 종횡비·렌더러 크기는 Renderer.resize가 갱신한다.
  }

  dispose(): void {
    this.submarine.dispose();
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
    this.scene.clear();
  }
}
