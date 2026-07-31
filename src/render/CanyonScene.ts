/**
 * 회색 박스 수중 장면 (D+5 통합 + INT-CORE-003·004 정식 계약 소비).
 *
 * 포함: 공유 CanyonLayout 기반 협곡 블록아웃 / 잠수함 대체 오브젝트
 * (캡슐+함교+선미 프로펠러) / 카메라 추적·리센터(CameraRig) / 기본 수중
 * 포그·배경(수면 위/아래 전환) / 해수면 / 블롭 섀도 / 화물선(계약 상태 매핑) /
 * X-ray 스파이크 장착점(?xray, 실패 격리).
 *
 * 성능 예산 (§12 [확정]): 실시간 조명 2개 이내(방향광 1 + 보조 환경광),
 * 실시간 그림자 미사용(블롭 섀도만), 반사·굴절 미사용.
 *
 * 경계 (prompts/GRAPHICS.md — 판정·이동 계산 금지):
 *  - 잠수함 포즈: 계약 `SubmarinePoseSource`(contracts/systems.ts)를
 *    attachPoseSource로 주입받아 소비만 한다. 속도는
 *    forwardSpeedMetersPerSecond 하나 — 위치 차분 재계산 금지 [INT-CORE-003].
 *  - 화물선: 계약 `CargoShipStateSource`를 attachCargoShipSource로 주입받아
 *    상태를 매핑만 한다. 이동·왕복·침몰 타이머를 렌더에서 만들지 않는다.
 *  - 협곡 배치: 공유 CanyonLayout(기본: src/world/startingCanyonLayout —
 *    충돌과 동일 데이터)만 사용한다. 렌더 자체 수식·블록 배열 금지
 *    [INT-CORE-004].
 */

import * as THREE from 'three';
import { loadParams, onParamsReloaded } from '../config/ParamLoader';
import type { GameEvents } from '../contracts/events';
import type { CanyonLayout } from '../contracts/layout';
import type { MovementParams } from '../contracts/params';
import type {
  CargoShipStateSource,
  SubmarinePoseSource,
} from '../contracts/systems';
import { meshYawRadians } from '../core/conventions';
import type { EventBus, Unsubscribe } from '../core/EventBus';
import type { ManagedScene } from '../core/SceneManager';
import { STARTING_CANYON_LAYOUT } from '../world/startingCanyonLayout';
import type { Renderer } from './Renderer';
import { BlobShadow } from './BlobShadow';
import { CameraRig } from './CameraRig';
import { CargoShipVisual } from './CargoShipVisual';
import { Propeller } from './Propeller';
import { SeaSurface } from './SeaSurface';
import { XrayFloodingSpike } from './xray/XrayFloodingSpike';

/** 수중 배경·포그 톤 — 임시 색상. 심도별 그라데이션·아트 색은 D13 이후 (§3.1) */
const WATER_COLOR = 0x0e3140;
const FOG_NEAR = 12;
const FOG_FAR = 95;

/** 수면 위 배경·포그 — '밝음(수면)→어둠(심해)' 공식 문법의 수면 위 끝단 (§3.1) */
const SKY_COLOR = 0x9cc4d4;
const ABOVE_FOG_NEAR = 60;
const ABOVE_FOG_FAR = 280;

/** 회색 박스 팔레트 (최종 아트 아님) */
const FLOOR_COLOR = 0x3d474d;
const WALL_COLOR = 0x59646c;
const SUBMARINE_COLOR = 0x8a949b;

/** 포즈 미주입 시 기본 수직 위치 — 스폰 관례(y=0, 순항 구간)와 동일 */
const DEFAULT_SUBMARINE_Y = 0;
/** 잠수함 선체 반長 — 프로펠러 선미(+Z) 장착 위치 계산용 (시각 상수) */
const SUBMARINE_HALF_LENGTH = 2.8;

export class CanyonScene implements ManagedScene {
  private readonly scene = new THREE.Scene();
  private readonly layout: CanyonLayout;
  private readonly rig: CameraRig;
  private readonly blobShadow: BlobShadow;
  private readonly submarine = new THREE.Group();
  private readonly propeller = new Propeller();
  private readonly seaSurface: SeaSurface;
  private readonly disposables: Array<{ dispose(): void }> = [];

  private poseSource: SubmarinePoseSource | null = null;
  private cargoShipSource: CargoShipStateSource | null = null;
  private cargoShip: CargoShipVisual | null = null;
  private xraySpike: XrayFloodingSpike | null = null;

  // 검증 완료된 이동 파라미터 — 프로펠러(공회전 비율·최고 속력)의 소스.
  // 핫리로드 통지로 유효한 새 값만 교체된다 (JSON 역기록 없음).
  private movementParams: MovementParams;
  private unsubscribeParamsReload: (() => void) | null = null;

  // torpedoHit 구독 (폭발 연출 시작 신호 — 침몰 시간축은 상태 소스 소유)
  private unsubscribeTorpedoHit: Unsubscribe | null = null;

  // 수면 위/아래 포그 전환 상태
  private cameraAboveSurface = false;

  // ?shipdemo — 순수 렌더 QA용 '고정 상태 스냅샷' (이동·타이머·판정 없음).
  // 실제 게임 상태 소스가 주입되면 스냅샷은 무시된다.
  private readonly shipDemoSnapshot: CargoShipStateSource | null;

  constructor(
    private readonly renderer: Renderer,
    layout: CanyonLayout = STARTING_CANYON_LAYOUT,
  ) {
    this.layout = layout;

    // 검증 완료 파라미터 소비 (Game.start에서 이미 로드·검증됨 — 캐시 반환).
    // JSON → 렌더 단방향. 개발 모드 핫리로드는 유효 값 교체 통지만 받는다.
    this.movementParams = loadParams().movement;
    this.unsubscribeParamsReload = onParamsReloaded((params) => {
      this.movementParams = params.movement;
    });

    this.scene.background = new THREE.Color(WATER_COLOR);
    this.scene.fog = new THREE.Fog(WATER_COLOR, FOG_NEAR, FOG_FAR);

    // 조명 예산 [확정 §12.2]: 실시간 조명 최대 2개 — 태양 방향광 1개만 사용.
    // 남은 1개는 서치라이트/폭발 겸용으로 비워 둔다. 환경광은 보조 베이스.
    const sun = new THREE.DirectionalLight(0xbfe3f2, 2.0);
    sun.position.set(4, 12, 3);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x1d3a47, 1.4));

    this.buildCanyonFromLayout();
    this.buildSubmarinePlaceholder();

    this.blobShadow = new BlobShadow(this.layout.floorY);
    this.scene.add(this.blobShadow.mesh);

    this.seaSurface = new SeaSurface(this.layout.seaSurfaceY);
    this.scene.add(this.seaSurface.mesh);

    this.rig = new CameraRig(this.renderer.camera);
    // 렌더 검증용: ?lookup 플래그 시 카메라를 아래로 내려 해수면·실루엣 확인
    if (new URLSearchParams(window.location.search).has('lookup')) {
      this.rig.rotate(0, -0.62); // 잠수함 아래에서 올려다보는 앙각
    }

    this.shipDemoSnapshot = this.parseShipDemoSnapshot();
    this.mountXraySpikeIfRequested();
  }

  /** 게임플레이 포즈 상태(계약 SubmarinePoseSource) 연결점 — 렌더는 소비만 한다 */
  attachPoseSource(source: SubmarinePoseSource): void {
    this.poseSource = source;
  }

  /** 화물선 상태(계약 CargoShipStateSource) 연결점 — composition root가 1회 주입 */
  attachCargoShipSource(source: CargoShipStateSource): void {
    this.cargoShipSource = source;
  }

  /**
   * EventBus 연결점 — torpedoHit(명중 폭발 시작 신호) 구독용.
   * composition root가 1회 주입한다. 중복 주입 시 기존 구독을 해제해
   * 한 명중에 폭발이 여러 번 시작되지 않게 한다.
   */
  attachEventBus(bus: EventBus): void {
    this.unsubscribeTorpedoHit?.();
    this.unsubscribeTorpedoHit = bus.on('torpedoHit', (payload) =>
      this.onTorpedoHit(payload),
    );
  }

  /** 카메라 입력 어댑터(CameraInputAdapter) 연결용 */
  get cameraRig(): CameraRig {
    return this.rig;
  }

  update(deltaSeconds: number): void {
    const spawn = this.layout.submarineSpawn;
    const x = this.poseSource?.positionX ?? spawn.x;
    const y = this.poseSource?.positionY ?? DEFAULT_SUBMARINE_Y;
    const z = this.poseSource?.positionZ ?? spawn.z;
    const heading = this.poseSource?.headingRadians ?? spawn.headingRadians;

    this.submarine.position.set(x, y, z);
    this.submarine.rotation.y = meshYawRadians(heading);
    this.blobShadow.follow(x, z); // 블롭 섀도는 해저 투영 — 수직 이동과 무관
    this.rig.update(deltaSeconds, x, y, z, heading);

    // 프로펠러: 계약 forwardSpeedMetersPerSecond(+선수/−선미)만 사용 —
    // 위치 차분 재계산 금지. A/D 단독 선회는 이 값에 영향이 없다.
    this.propeller.update(
      deltaSeconds,
      this.poseSource?.forwardSpeedMetersPerSecond ?? 0,
      this.movementParams,
    );

    this.seaSurface.update(deltaSeconds);
    this.updateCargoShip(deltaSeconds);
    this.updateFogByCameraDepth();
    this.xraySpike?.update(deltaSeconds);
  }

  /** 수면 위/아래에 따른 배경·포그 전환 (반사·굴절 없음 — 색·포그 차이만) */
  private updateFogByCameraDepth(): void {
    const above = this.renderer.camera.position.y > this.layout.seaSurfaceY;
    if (above === this.cameraAboveSurface) return;
    this.cameraAboveSurface = above;

    const fog = this.scene.fog as THREE.Fog;
    if (above) {
      (this.scene.background as THREE.Color).set(SKY_COLOR);
      fog.color.set(SKY_COLOR);
      fog.near = ABOVE_FOG_NEAR;
      fog.far = ABOVE_FOG_FAR;
    } else {
      (this.scene.background as THREE.Color).set(WATER_COLOR);
      fog.color.set(WATER_COLOR);
      fog.near = FOG_NEAR;
      fog.far = FOG_FAR;
    }
  }

  render(): void {
    this.renderer.render(this.scene);
  }

  resize(_width: number, _height: number): void {
    // 카메라 종횡비·렌더러 크기는 Renderer.resize가 갱신한다 (core/Game 경유).
  }

  dispose(): void {
    this.unsubscribeParamsReload?.();
    this.unsubscribeParamsReload = null;
    this.unsubscribeTorpedoHit?.();
    this.unsubscribeTorpedoHit = null;
    this.xraySpike?.dispose();
    this.xraySpike = null;
    this.cargoShip?.removeAndDispose();
    this.cargoShip = null;
    this.propeller.dispose();
    this.seaSurface.dispose();
    this.blobShadow.dispose();
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
    this.scene.clear();
  }

  /**
   * 협곡 메시 생성 — 공유 CanyonLayout.blocks가 유일한 배치 소스다
   * [INT-CORE-004]. 같은 blocks를 게임플레이가 충돌체로 소비하므로
   * 렌더 메시와 충돌 위치가 정의상 일치한다. 렌더 자체 수식 없음.
   */
  private buildCanyonFromLayout(): void {
    const floorGeometry = new THREE.BoxGeometry(240, 1, 240);
    const floorMaterial = new THREE.MeshLambertMaterial({
      color: FLOOR_COLOR,
      flatShading: true,
    });
    this.disposables.push(floorGeometry, floorMaterial);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = this.layout.floorY - 0.5;
    this.scene.add(floor);

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const wallMaterial = new THREE.MeshLambertMaterial({
      color: WALL_COLOR,
      flatShading: true,
    });
    this.disposables.push(unitBox, wallMaterial);

    for (const block of this.layout.blocks) {
      const mesh = new THREE.Mesh(unitBox, wallMaterial);
      mesh.scale.set(block.sizeX, block.sizeY, block.sizeZ);
      // 계약 규약: 블록 바닥이 floorY — 중심 Y = floorY + sizeY/2
      mesh.position.set(block.x, this.layout.floorY + block.sizeY / 2, block.z);
      mesh.rotation.y = block.rotationY;
      this.scene.add(mesh);
    }
  }

  /**
   * 잠수함 대체 오브젝트 — 캡슐 선체 + 함교 박스 + 선미 프로펠러
   * (최종 모델은 D+8 임포트). 선수·선미 규약: 로컬 -Z = 선수, +Z = 선미.
   */
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

    // 함교는 선수(-Z) 쪽으로 치우쳐 앞뒤 구분을 돕는다
    const sail = new THREE.Mesh(sailGeometry, material);
    sail.position.set(0, 1.2, -0.5);
    this.submarine.add(sail);

    // 프로펠러 — 선미(+Z, conventions.LOCAL_STERN) 중앙 1개. 표현 계층 전용
    this.propeller.root.position.set(0, 0, SUBMARINE_HALF_LENGTH + 0.15);
    this.submarine.add(this.propeller.root);

    this.submarine.position.y = DEFAULT_SUBMARINE_Y;
    this.scene.add(this.submarine);
  }

  /** torpedoHit — 현재 화물선 id와 일치할 때만 폭발 시작 (멱등 처리) */
  private onTorpedoHit(payload: GameEvents['torpedoHit']): void {
    const source = this.cargoShipSource ?? this.shipDemoSnapshot;
    if (!source || payload.targetId !== source.id) return;
    this.cargoShip?.startHitExplosion();
  }

  /**
   * 화물선 상태 소비 — 정식 소스(attachCargoShipSource) 우선, 없으면
   * ?shipdemo 고정 스냅샷(렌더 QA). 둘 다 없으면 표현할 상태가 없으므로
   * 화물선을 그리지 않는다 (렌더가 상태를 지어내지 않는다).
   */
  private updateCargoShip(deltaSeconds: number): void {
    const source = this.cargoShipSource ?? this.shipDemoSnapshot;
    if (!source) return;

    if (source.removed) {
      // 시뮬레이션에서 제거됨 — 시각 자원 정리 (1회)
      this.cargoShip?.removeAndDispose();
      this.cargoShip = null;
      return;
    }

    if (!this.cargoShip) {
      this.cargoShip = new CargoShipVisual();
      this.scene.add(this.cargoShip.root);
    }

    this.cargoShip.applyState(source);
    if (source.hit) {
      // 상태 경로 보조 신호 — torpedoHit 이벤트와 겹쳐도 멱등이라 1회만 시작
      this.cargoShip.startHitExplosion();
    }
    this.cargoShip.update(deltaSeconds);
  }

  /**
   * ?shipdemo=<0~1> — 순수 렌더 QA용 고정 상태 스냅샷 (계약 타입 준수).
   * 이동·자동 격침·타이머 없음: sinkProgress를 URL 값으로 고정해 침몰
   * 매핑·폭발(값>0 시 hit=true)을 정지 화면으로 검수한다.
   * 실제 게임 상태를 속이지 않는다 — 정식 소스 주입 시 무시된다.
   */
  private parseShipDemoSnapshot(): CargoShipStateSource | null {
    const raw = new URLSearchParams(window.location.search).get('shipdemo');
    if (raw === null) return null;
    const progress = THREE.MathUtils.clamp(Number.parseFloat(raw) || 0, 0, 1);
    const spawn = this.layout.submarineSpawn;
    return Object.freeze({
      id: -1, // 실제 표적 id와 충돌하지 않는 QA 전용 값
      positionX: spawn.x - 7,
      positionY: this.layout.seaSurfaceY,
      positionZ: spawn.z - 30,
      headingRadians: -Math.PI / 2,
      velocityX: 0,
      velocityZ: 0,
      hit: progress > 0,
      sinkProgress: progress,
      removed: false,
    });
  }

  /**
   * X-ray 스파이크 장착 — `?xray` URL 플래그가 있을 때만.
   * 분리 모듈이 실패해도 기본 장면은 정상 작동해야 한다 —
   * 생성 실패는 격리하고 경고만 남긴다.
   */
  private mountXraySpikeIfRequested(): void {
    if (!new URLSearchParams(window.location.search).has('xray')) return;
    try {
      this.xraySpike = new XrayFloodingSpike(true);
      this.xraySpike.root.position.set(4.5, DEFAULT_SUBMARINE_Y + 1, -4);
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
