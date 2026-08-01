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
import type { FactionId } from '../contracts/meta';
import type { CargoShipStateSource } from '../contracts/systems';
import { meshYawRadians } from '../core/conventions';
import { factionVisualVariant, type FactionVisualVariant } from './factionVisuals';
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

  /** 이 선박이 표현 중인 세력 변형 (게임플레이 faction 값으로만 선택된다) */
  private variant: FactionVisualVariant;
  /** 세력 변형 파츠(무장·마크·항해등) — faction 변경 시 통째로 교체 */
  private variantGroup: THREE.Group | null = null;
  private warningLight: THREE.Mesh | null = null;
  private elapsed = 0;

  private readonly disposables: Array<{ dispose(): void }> = [];
  private hullMaterial!: THREE.MeshLambertMaterial;
  private upperMaterial!: THREE.MeshLambertMaterial;
  private readonly explosion: THREE.Mesh;
  private readonly explosionMaterial: THREE.MeshBasicMaterial;
  private explosionStarted = false;
  private explosionElapsed = 0;
  private disposed = false;

  constructor(faction: FactionId | undefined = undefined) {
    this.variant = factionVisualVariant(faction);
    const hullMaterial = new THREE.MeshLambertMaterial({
      color: this.variant.hullColor,
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

    this.hullMaterial = hullMaterial;
    this.upperMaterial = upperMaterial;
    this.buildVariantParts();

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
    // 세력 변형은 **게임플레이 상태의 faction 값**으로만 바뀐다 (추측 없음)
    const nextVariant = factionVisualVariant(state.faction);
    if (nextVariant.faction !== this.variant.faction) {
      this.variant = nextVariant;
      this.hullMaterial.color.setHex(nextVariant.hullColor);
      this.buildVariantParts();
    }
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
   * 세력 변형 파츠 생성 — 무장 실루엣·식별 마크·항해등.
   * **색 이전에 형태로 구분한다** (§10): 실루엣 종류, 마크 기하 형태,
   * 경고등 유무가 각 세력마다 다르다. 저해상도·원거리에서는 색·마크가
   * 사라져도 상부 실루엣 차이가 남는다.
   */
  private buildVariantParts(): void {
    if (this.variantGroup) {
      this.root.remove(this.variantGroup);
      this.variantGroup = null;
      this.warningLight = null;
    }
    const group = new THREE.Group();
    const v = this.variant;
    const deckY = HULL_HEIGHT - DRAFT;

    // ① 무장 실루엣 — 적대 2기·경비 1기·중립 0기 (원거리 실루엣 1차 구분자)
    for (let i = 0; i < v.weaponMountCount; i += 1) {
      const mount = new THREE.Group();
      const baseGeometry = new THREE.BoxGeometry(1.6, 0.7, 1.6);
      const base = new THREE.Mesh(baseGeometry, this.upperMaterial);
      mount.add(base);
      // 포신 — 각진 실루엣을 만드는 돌출부
      const barrelGeometry = new THREE.BoxGeometry(0.3, 0.3, 3.2);
      const barrel = new THREE.Mesh(barrelGeometry, this.upperMaterial);
      barrel.position.set(0, 0.45, -1.6);
      mount.add(barrel);
      mount.position.set(0, deckY + 0.35, i === 0 ? -HULL_LENGTH / 4 : HULL_LENGTH / 5);
      group.add(mount);
      this.disposables.push(baseGeometry, barrelGeometry);
    }

    // ② 민간형 전용 — 매끈한 화물 적재 실루엣 (무장 대신 낮고 긴 덱 하우스)
    if (v.silhouette === 'civilianSmooth') {
      const cargoGeometry = new THREE.BoxGeometry(HULL_BEAM * 0.8, 1.6, HULL_LENGTH * 0.42);
      const cargo = new THREE.Mesh(cargoGeometry, this.upperMaterial);
      cargo.position.set(0, deckY + 0.8, -HULL_LENGTH * 0.12);
      group.add(cargo);
      this.disposables.push(cargoGeometry);
    }

    // ③ 저현 전투형(경비) — 상부를 낮추는 경사 갑판 블록
    if (v.silhouette === 'lowProfileCombat') {
      const deckGeometry = new THREE.BoxGeometry(HULL_BEAM * 0.72, 0.9, HULL_LENGTH * 0.55);
      const deck = new THREE.Mesh(deckGeometry, this.upperMaterial);
      deck.position.set(0, deckY + 0.45, 0);
      group.add(deck);
      this.disposables.push(deckGeometry);
    }

    // ④ 식별 마크 — **형태**로 구분(삼각/사각/마름모). 색은 보조 채널
    const markGeometry = this.buildMarkGeometry(v.markShape);
    const markMaterial = new THREE.MeshBasicMaterial({
      color: v.markColor,
      side: THREE.DoubleSide,
    });
    for (const side of [-1, 1]) {
      const mark = new THREE.Mesh(markGeometry, markMaterial);
      mark.position.set(side * (HULL_BEAM / 2 + 0.02), deckY - 1.1, -HULL_LENGTH * 0.28);
      mark.rotation.y = side * Math.PI / 2;
      group.add(mark);
    }
    this.disposables.push(markGeometry, markMaterial);

    // ⑤ 항해등 — 중립은 상시 백색, 적대·경비는 경고등 점멸(색+거동 구분)
    const lightGeometry = new THREE.SphereGeometry(0.28, 8, 6);
    const navMaterial = new THREE.MeshBasicMaterial({ color: 0xf2f6f8 });
    const navLight = new THREE.Mesh(lightGeometry, navMaterial);
    navLight.position.set(0, deckY + 4.6, HULL_LENGTH / 2 - 4);
    group.add(navLight);
    this.disposables.push(lightGeometry, navMaterial);

    if (v.hasWarningLight) {
      const warnMaterial = new THREE.MeshBasicMaterial({ color: v.markColor });
      const warningLight = new THREE.Mesh(lightGeometry, warnMaterial);
      warningLight.position.set(0, deckY + 5.2, -HULL_LENGTH * 0.1);
      group.add(warningLight);
      this.warningLight = warningLight;
      this.disposables.push(warnMaterial);
    }

    this.root.add(group);
    this.variantGroup = group;
  }

  /** 식별 마크 기하 — 색과 독립된 형태 구분자 (삼각·사각·마름모) */
  private buildMarkGeometry(shape: FactionVisualVariant['markShape']): THREE.BufferGeometry {
    if (shape === 'square') return new THREE.PlaneGeometry(1.5, 1.5);
    const triangle = new THREE.CircleGeometry(1.05, 3);
    if (shape === 'diamond') {
      const diamond = new THREE.CircleGeometry(1.05, 4);
      diamond.rotateZ(Math.PI / 4);
      triangle.dispose();
      return diamond;
    }
    return triangle;
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
    if (this.disposed) return;
    this.elapsed += deltaSeconds;
    // 항해등 거동 — 중립은 상시 점등, 적대·경비는 세력별 주기로 점멸
    if (this.warningLight) {
      const hz = this.variant.navLightBlinkHz;
      this.warningLight.visible = hz <= 0 || Math.sin(this.elapsed * hz * Math.PI * 2) > 0;
    }
    if (!this.explosion.visible) return;
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
