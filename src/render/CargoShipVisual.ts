/**
 * 화물선 시각 오브젝트 — 로우폴리 임시 모델 (최종 모델 D+8 임포트 시 교체).
 *
 * 정식 계약 소비 (INT-CORE-003):
 *  - 이동·명중·침몰 시간축의 주인은 게임플레이(CargoShipSystem)다. 이 클래스는
 *    계약 `CargoShipStateSource`(contracts/systems.ts)의 상태를 `applyState`로
 *    받아 **매핑만** 한다 — 자체 이동·왕복 경로·침몰 타이머를 만들지 않는다.
 *  - `sinkProgress`(0~1)를 기울기·하강 변위로 매핑한다. 매핑 상수(깊이·기울기)는
 *    renderVisualParams.json의 순수 연출값이다.
 *  - 폭발은 `torpedoHit` 이벤트(또는 상태 `hit`)로 시작되는 1회성 연출이다 —
 *    `startHitExplosion()`은 멱등이라 이벤트·상태 경로가 겹쳐도 1회만 발동한다.
 *  - `removed` 신호는 장면이 보고 `removeAndDispose()`를 호출한다.
 *
 * 선수·선미 규약은 잠수함과 동일: 로컬 -Z = 선수 (core/conventions).
 * 수중 실루엣: 흘수(약 2.2m) 아래 선체가 수면 밑에 잠겨, 수중에서 위를 보면
 * 밝은 해수면을 배경으로 발견된다.
 */

import * as THREE from 'three';
import type { CargoShipStateSource } from '../contracts/systems';
import { meshYawRadians } from '../core/conventions';
import visualParams from './renderVisualParams.json';

const PARAMS = visualParams.cargoShip;

/** 임시 모델 치수 — 시각 상수 (밸런스 수치 아님) */
const HULL_LENGTH = 20;
const HULL_HEIGHT = 4;
const HULL_BEAM = 5;
/** 흘수 — 수면 아래로 잠기는 깊이 (실루엣 발견용) */
const DRAFT = 2.2;
/** 폭발 시작 스케일 — 선체 안에 가려지지 않는 최소 크기 (시각 상수) */
const EXPLOSION_START_SCALE = 3;
/** 침몰 기울기가 최대에 도달하는 진행률 지점 (연출 매핑 상수) */
const TILT_FULL_AT_PROGRESS = 0.625;

export class CargoShipVisual {
  readonly root = new THREE.Group();

  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly explosion: THREE.Mesh;
  private readonly explosionMaterial: THREE.MeshBasicMaterial;
  private explosionStarted = false;
  private explosionElapsed = 0;
  private disposed = false;

  constructor() {
    const hullMaterial = new THREE.MeshLambertMaterial({
      color: 0x2a3940,
      flatShading: true,
    });
    const upperMaterial = new THREE.MeshLambertMaterial({
      color: 0x5f6e76,
      flatShading: true,
    });

    // 선체 — 그룹 원점이 흘수선(계약 positionY)에 오도록 배치
    const hullGeometry = new THREE.BoxGeometry(HULL_BEAM, HULL_HEIGHT, HULL_LENGTH);
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    hull.position.y = HULL_HEIGHT / 2 - DRAFT;
    this.root.add(hull);

    // 선수(-Z) 쐐기 — 앞뒤 구분용
    const bowGeometry = new THREE.BoxGeometry(HULL_BEAM * 0.7, HULL_HEIGHT, 3.5);
    const bow = new THREE.Mesh(bowGeometry, hullMaterial);
    bow.position.set(0, HULL_HEIGHT / 2 - DRAFT, -(HULL_LENGTH / 2 + 1.2));
    bow.rotation.y = Math.PI / 4;
    this.root.add(bow);

    // 선미(+Z) 상부 구조물 + 연돌
    const superGeometry = new THREE.BoxGeometry(3.4, 3, 4.5);
    const superstructure = new THREE.Mesh(superGeometry, upperMaterial);
    superstructure.position.set(0, HULL_HEIGHT - DRAFT + 1.5, HULL_LENGTH / 2 - 4);
    this.root.add(superstructure);

    const funnelGeometry = new THREE.CylinderGeometry(0.7, 0.9, 2.2, 8);
    const funnel = new THREE.Mesh(funnelGeometry, upperMaterial);
    funnel.position.set(0, HULL_HEIGHT - DRAFT + 4, HULL_LENGTH / 2 - 4);
    this.root.add(funnel);

    // 명중 폭발 — 자발광 구체 1개 (조명 추가 없음, 예산 §12 유지)
    const explosionGeometry = new THREE.SphereGeometry(1, 10, 8);
    this.explosionMaterial = new THREE.MeshBasicMaterial({
      color: 0xffa432,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.explosion = new THREE.Mesh(explosionGeometry, this.explosionMaterial);
    this.explosion.position.y = HULL_HEIGHT / 2 - DRAFT;
    this.explosion.visible = false;
    this.explosion.renderOrder = 4;
    this.root.add(this.explosion);

    this.disposables.push(
      hullMaterial,
      upperMaterial,
      hullGeometry,
      bowGeometry,
      superGeometry,
      funnelGeometry,
      explosionGeometry,
      this.explosionMaterial,
    );
  }

  /**
   * 계약 상태 → 시각 매핑 (매 프레임).
   * 위치·방향은 게임플레이 값 그대로, 침몰 변위·기울기는 sinkProgress 매핑.
   */
  applyState(state: CargoShipStateSource): void {
    if (this.disposed) return;
    const progress = THREE.MathUtils.clamp(state.sinkProgress, 0, 1);
    const eased = progress * progress; // 천천히 시작해 가속 (시각 이징만)

    this.root.position.set(
      state.positionX,
      state.positionY - PARAMS.sinkDepthMeters * eased,
      state.positionZ,
    );
    this.root.rotation.y = meshYawRadians(state.headingRadians);
    this.root.rotation.x =
      -PARAMS.sinkTiltRadians * Math.min(progress / TILT_FULL_AT_PROGRESS, 1);
  }

  /**
   * 명중 폭발 시작 — torpedoHit 이벤트(1차) 또는 상태 hit(보조)가 호출.
   * 멱등: 두 경로가 겹치거나 이벤트가 중복 와도 폭발은 1회만 시작된다.
   */
  startHitExplosion(): void {
    if (this.disposed || this.explosionStarted) return;
    this.explosionStarted = true;
    this.explosionElapsed = 0;
    this.explosion.visible = true;
  }

  /** 매 프레임 — 폭발 잔광(1회성 연출)만 진행. 침몰은 applyState가 매핑한다 */
  update(deltaSeconds: number): void {
    if (this.disposed || !this.explosion.visible) return;
    this.explosionElapsed += deltaSeconds;
    const progress = Math.min(
      this.explosionElapsed / PARAMS.explosionDurationSeconds,
      1,
    );
    if (progress < 1) {
      const scale =
        EXPLOSION_START_SCALE +
        (PARAMS.explosionMaxScale - EXPLOSION_START_SCALE) * progress;
      this.explosion.scale.setScalar(scale);
      this.explosionMaterial.opacity = 1 - progress;
    } else {
      this.explosion.visible = false;
    }
  }

  /** 시각 자원 정리 — 상태 removed=true 또는 장면 dispose 시 호출 */
  removeAndDispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
    this.root.removeFromParent();
    this.root.clear();
  }
}
