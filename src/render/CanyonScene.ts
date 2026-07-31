/**
 * D3~D5 회색 박스 수중 장면 (단계 1 산출물).
 *
 * 포함: 회색 협곡 블록아웃 / 잠수함 대체 오브젝트(캡슐+함교 박스) /
 * 카메라 추적·리센터 구조(CameraRig) / 기본 수중 포그·배경 / 블롭 섀도 /
 * X-ray 스파이크 장착점(?xray URL 플래그, 실패 격리).
 *
 * 성능 예산 (§12 [확정]): 실시간 조명 2개 이내(방향광 1 + 보조 환경광),
 * 실시간 그림자 미사용(블롭 섀도만), 반사·굴절 미사용.
 *
 * 경계 (prompts/GRAPHICS.md):
 *  - 게임 판정·이동 계산을 하지 않는다. 잠수함 위치·방향은 게임플레이의
 *    읽기 전용 상태(PlayerController 계약 부분집합)를 attachPoseSource로
 *    주입받아 소비만 한다. 미주입 시 원점 정지 상태로 렌더한다.
 *  - 협곡 배치는 파이프라인 검증용 임시 레이아웃이다 — 정식 블록아웃(엄폐
 *    지점 포함)은 레벨 디자인 산출물(D+5) 수신 후 교체한다.
 */

import * as THREE from 'three';
import type { ManagedScene } from '../core/SceneManager';
import type { PlayerController } from '../contracts/systems';
import type { Renderer } from './Renderer';
import { BlobShadow } from './BlobShadow';
import { CameraRig } from './CameraRig';
import { XrayFloodingSpike } from './xray/XrayFloodingSpike';

/** 게임플레이가 소유한 포즈 상태의 읽기 전용 부분집합 (contracts/systems.ts) */
export type SubmarinePoseSource = Pick<
  PlayerController,
  'positionX' | 'positionZ' | 'headingRadians'
>;

/** 수중 배경·포그 톤 — 임시 색상. 심도별 그라데이션·아트 색은 D13 이후 (§3.1) */
const WATER_COLOR = 0x0e3140;
const FOG_NEAR = 12;
const FOG_FAR = 95;

/** 회색 박스 팔레트 (최종 아트 아님) */
const FLOOR_COLOR = 0x3d474d;
const WALL_COLOR = 0x59646c;
const SUBMARINE_COLOR = 0x8a949b;

/** 장면 치수 — 시각 구도 상수 (밸런스 수치 아님) */
const FLOOR_Y = -6;
const SUBMARINE_Y = 0;
const CANYON_HALF_WIDTH = 11;
const WALL_SEGMENT_LENGTH = 11;
const WALL_SEGMENT_COUNT = 11;

export class CanyonScene implements ManagedScene {
  private readonly scene = new THREE.Scene();
  private readonly rig: CameraRig;
  private readonly blobShadow: BlobShadow;
  private readonly submarine = new THREE.Group();
  private readonly disposables: Array<{ dispose(): void }> = [];
  private poseSource: SubmarinePoseSource | null = null;
  private xraySpike: XrayFloodingSpike | null = null;

  constructor(private readonly renderer: Renderer) {
    this.scene.background = new THREE.Color(WATER_COLOR);
    this.scene.fog = new THREE.Fog(WATER_COLOR, FOG_NEAR, FOG_FAR);

    // 조명 예산 [확정 §12.2]: 실시간 조명 최대 2개 — 태양 방향광 1개만 사용.
    // 남은 1개는 서치라이트/폭발 겸용으로 비워 둔다. 환경광은 보조 베이스.
    const sun = new THREE.DirectionalLight(0xbfe3f2, 2.0);
    sun.position.set(4, 12, 3);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x1d3a47, 1.4));

    this.buildCanyonBlockout();
    this.buildSubmarinePlaceholder();

    this.blobShadow = new BlobShadow(FLOOR_Y);
    this.scene.add(this.blobShadow.mesh);

    this.rig = new CameraRig(this.renderer.camera);

    this.mountXraySpikeIfRequested();
  }

  /** 게임플레이 시스템(PlayerController 구현체) 연결점 — 렌더는 소비만 한다 */
  attachPoseSource(source: SubmarinePoseSource): void {
    this.poseSource = source;
  }

  /** 카메라 입력(마우스 회전·Space 리센터) 바인딩용 — 게임플레이 측이 사용 */
  get cameraRig(): CameraRig {
    return this.rig;
  }

  update(deltaSeconds: number): void {
    const x = this.poseSource?.positionX ?? 0;
    const z = this.poseSource?.positionZ ?? 0;
    const heading = this.poseSource?.headingRadians ?? 0;

    this.submarine.position.set(x, SUBMARINE_Y, z);
    this.submarine.rotation.y = heading;
    this.blobShadow.follow(x, z);
    this.rig.update(deltaSeconds, x, SUBMARINE_Y, z, heading);
    this.xraySpike?.update(deltaSeconds);
  }

  render(): void {
    this.renderer.render(this.scene);
  }

  resize(_width: number, _height: number): void {
    // 카메라 종횡비·렌더러 크기는 Renderer.resize가 갱신한다 (core/Game 경유).
  }

  dispose(): void {
    this.xraySpike?.dispose();
    this.xraySpike = null;
    this.blobShadow.dispose();
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
    this.scene.clear();
  }

  /**
   * 회색 협곡 블록아웃 — 단일 단위 박스 지오메트리를 스케일 재사용해
   * S자 수로 양안(兩岸) 벽 + 엄폐 검증용 기둥을 배치한다.
   */
  private buildCanyonBlockout(): void {
    const floorGeometry = new THREE.BoxGeometry(240, 1, 240);
    const floorMaterial = new THREE.MeshLambertMaterial({
      color: FLOOR_COLOR,
      flatShading: true,
    });
    this.disposables.push(floorGeometry, floorMaterial);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = FLOOR_Y - 0.5;
    this.scene.add(floor);

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const wallMaterial = new THREE.MeshLambertMaterial({
      color: WALL_COLOR,
      flatShading: true,
    });
    this.disposables.push(unitBox, wallMaterial);

    const addBlock = (
      x: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      rotationY: number,
    ): void => {
      const block = new THREE.Mesh(unitBox, wallMaterial);
      block.scale.set(sx, sy, sz);
      block.position.set(x, FLOOR_Y + sy / 2, z);
      block.rotation.y = rotationY;
      this.scene.add(block);
    };

    // 수로 중심선: 완만한 S자 곡선 (결정적 배치 — 난수 미사용)
    const centerAt = (z: number): number => Math.sin(z * 0.045) * 7;

    const halfSpan = (WALL_SEGMENT_COUNT - 1) / 2;
    for (let i = 0; i < WALL_SEGMENT_COUNT; i += 1) {
      const z = (i - halfSpan) * WALL_SEGMENT_LENGTH;
      const center = centerAt(z);
      const heightVariation = 3 * Math.sin(i * 2.7);
      const widthVariation = 1.5 * Math.sin(i * 1.9 + 1);
      const tilt = 0.12 * Math.sin(i * 3.3);

      addBlock(
        center - CANYON_HALF_WIDTH - 4 + widthVariation,
        z,
        9 + widthVariation,
        15 + heightVariation,
        WALL_SEGMENT_LENGTH + 1.5,
        tilt,
      );
      addBlock(
        center + CANYON_HALF_WIDTH + 4 - widthVariation,
        z,
        9 - widthVariation,
        16 - heightVariation,
        WALL_SEGMENT_LENGTH + 1.5,
        -tilt,
      );
    }

    // 수로 안쪽 기둥 — 시각 차단(엄폐) 파이프라인 검증용 임시 배치.
    // 정식 엄폐 지점 3곳+ 배치는 레벨 블록아웃(D+5) 수신 후 교체.
    addBlock(centerAt(-18) + 4, -18, 3.5, 10, 3.5, 0.4);
    addBlock(centerAt(2) - 5, 2, 4, 12, 4, -0.25);
    addBlock(centerAt(24) + 6, 24, 3, 9, 5, 0.7);
  }

  /** 잠수함 대체 오브젝트 — 캡슐 선체 + 함교 박스 (최종 모델은 D+8 임포트) */
  private buildSubmarinePlaceholder(): void {
    const material = new THREE.MeshLambertMaterial({
      color: SUBMARINE_COLOR,
      flatShading: true,
    });
    const hullGeometry = new THREE.CapsuleGeometry(0.9, 3.8, 3, 10);
    hullGeometry.rotateX(Math.PI / 2); // 캡슐 축(Y)을 전후 방향(Z)으로
    const sailGeometry = new THREE.BoxGeometry(0.7, 1.1, 2.0);
    this.disposables.push(material, hullGeometry, sailGeometry);

    const hull = new THREE.Mesh(hullGeometry, material);
    this.submarine.add(hull);

    const sail = new THREE.Mesh(sailGeometry, material);
    sail.position.set(0, 1.2, 0.4);
    this.submarine.add(sail);

    this.submarine.position.y = SUBMARINE_Y;
    this.scene.add(this.submarine);
  }

  /**
   * X-ray 스파이크 장착 — `?xray` URL 플래그가 있을 때만.
   * 분리 모듈이 실패해도 기본 장면은 정상 작동해야 한다 (요구 11) —
   * 생성 실패는 격리하고 경고만 남긴다.
   */
  private mountXraySpikeIfRequested(): void {
    if (!new URLSearchParams(window.location.search).has('xray')) return;
    try {
      this.xraySpike = new XrayFloodingSpike(true);
      this.xraySpike.root.position.set(4.5, SUBMARINE_Y + 1, -4);
      this.xraySpike.root.rotation.y = 0.55; // 선체 길이 방향이 보이도록 비스듬히
      this.scene.add(this.xraySpike.root);
      console.info('[CanyonScene] X-ray 스파이크 장착 (?xray 플래그).');
    } catch (error) {
      this.xraySpike = null;
      console.warn(
        '[CanyonScene] X-ray 스파이크 초기화 실패 — 기본 장면은 계속 작동합니다.',
        error,
      );
    }
  }
}
