/**
 * 화물선 시각 오브젝트 — 로우폴리 임시 모델 (최종 모델 D+8 임포트 시 교체).
 *
 * 경계 (prompts/GRAPHICS.md — 판정 계산 금지):
 *  - 이동·피격·격침 '판정'은 게임플레이 소유다. 이 클래스는 게임플레이가
 *    제공하는 상태(위치·방향·격침 여부)를 setPose()/triggerSink()로 받아
 *    표현만 한다. 여기서 명중 여부·피해량을 계산하지 않는다.
 *  - 선수·선미 규약은 잠수함과 동일: 로컬 -Z = 선수, +Z = 선미.
 *
 * 명중·침몰 연출 (최소 구현 [확정 — 정밀 유체 침몰 제외]):
 *  - triggerSink() 1회 호출 → 간단한 폭발(자발광 구체 확장·소멸, 조명 추가 없음)
 *    → 선체가 기울며 가라앉음 → 완료 시 isFinished = true.
 *  - 장면이 isFinished를 보고 removeAndDispose()로 시각 리소스를 정리한다.
 *  - 연출 수치는 renderVisualParams.json(렌더 소유 외부 설정)에서 읽는다.
 *
 * 수중 실루엣: 흘수(약 2.2m) 아래 선체가 어두운 색으로 수면 밑에 잠겨 있어,
 * 수중에서 위를 보면 밝은 해수면을 배경으로 발견된다.
 */

import * as THREE from 'three';
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

export class CargoShipVisual {
  readonly root = new THREE.Group();

  /** 침몰 연출 종료 여부 — 장면이 이 값을 보고 정리한다 */
  isFinished = false;

  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly explosion: THREE.Mesh;
  private readonly explosionMaterial: THREE.MeshBasicMaterial;
  private sinkElapsed = -1; // 음수 = 침몰 미시작
  private baseY: number;
  private disposed = false;

  constructor(waterlineY: number) {
    this.baseY = waterlineY;

    const hullMaterial = new THREE.MeshLambertMaterial({
      color: 0x2a3940,
      flatShading: true,
    });
    const upperMaterial = new THREE.MeshLambertMaterial({
      color: 0x5f6e76,
      flatShading: true,
    });

    // 선체 — 중심이 수면에 오도록 배치해 흘수(DRAFT)만큼 수면 아래로 잠긴다
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

    this.root.position.y = waterlineY;
  }

  /** 게임플레이 제공 상태 반영 — 침몰 시작 후에는 연출이 위치 Y·기울기를 소유 */
  setPose(x: number, z: number, headingRadians: number): void {
    this.root.position.x = x;
    this.root.position.z = z;
    if (this.sinkElapsed < 0) {
      this.root.rotation.y = headingRadians;
    }
  }

  /** 격침 통지(판정은 게임플레이 소유) — 최초 1회만 연출 시작 */
  triggerSink(): void {
    if (this.sinkElapsed >= 0) return;
    this.sinkElapsed = 0;
    this.explosion.visible = true;
  }

  update(deltaSeconds: number): void {
    if (this.disposed || this.sinkElapsed < 0) return;
    this.sinkElapsed += deltaSeconds;

    // 폭발: 확장 + 페이드아웃
    const explosionProgress = Math.min(
      this.sinkElapsed / PARAMS.explosionDurationSeconds,
      1,
    );
    if (explosionProgress < 1) {
      // 시작 스케일을 선체 단면(폭 5×높이 4)보다 크게 잡아 발화 즉시 보이게 한다
      const scale =
        EXPLOSION_START_SCALE +
        (PARAMS.explosionMaxScale - EXPLOSION_START_SCALE) * explosionProgress;
      this.explosion.scale.setScalar(scale);
      this.explosionMaterial.opacity = 1 - explosionProgress;
    } else if (this.explosion.visible) {
      this.explosion.visible = false;
    }

    // 침몰: 기울며 가라앉음 (정밀 유체 없음 — 이징 보간만)
    const sinkProgress = Math.min(this.sinkElapsed / PARAMS.sinkDurationSeconds, 1);
    const eased = sinkProgress * sinkProgress; // 천천히 시작해 가속
    this.root.rotation.x = -PARAMS.sinkTiltRadians * Math.min(sinkProgress * 1.6, 1);
    this.root.position.y = this.baseY - PARAMS.sinkDepthMeters * eased;

    if (sinkProgress >= 1) {
      this.isFinished = true;
    }
  }

  /** 시각 오브젝트 정리 — 장면 dispose 또는 침몰 완료 시 호출 */
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
