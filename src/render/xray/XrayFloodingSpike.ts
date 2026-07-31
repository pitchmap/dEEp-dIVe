/**
 * X-ray 반투명 렌더 기술 스파이크 [1주차 최우선, R5 — 보호 목록 '침수 표시'].
 *
 * 검증 대상: "반투명 선체 너머로 구획별 수위 상승이 판독 가능한가" (§3.7·§5.17).
 * 기법: 추가 라이브러리·셰이더 프레임워크 없이 표준 Three.js 머티리얼만 사용 —
 *  - 선체: transparent + depthWrite:false + renderOrder 후순위 → 내부가 비쳐 보임
 *  - 구획: EdgesGeometry 윤곽선 + 수위 박스(scale.y = 침수 심각도)
 *
 * 분리 원칙 (구현 요구 10·11):
 *  - 이 모듈은 기본 게임 장면과 독립적이다. 장면 쪽에서 try/catch로 장착하며,
 *    이 모듈이 실패해도 기본 장면·빌드는 정상 작동한다.
 *  - 침수 심각도의 '판정'은 게임플레이 소유다 — 본 통합(D13~14) 시
 *    `floodingChanged` 이벤트(compartment, severity)를 구독해 setSeverity만
 *    호출한다. 스파이크 단계의 autoDemo 순환은 판정이 아니라 렌더 검증용
 *    시연 값이다.
 *
 * 판정 결과·대체안 필요 여부: docs/RENDER_SPIKE_XRAY.md 참조.
 */

import * as THREE from 'three';

/** 스파이크 시연용 구획 수 — 본 통합 시 floodingChanged의 compartment 키를 따른다 */
const COMPARTMENT_COUNT = 4;

/** 선체·구획 치수 — 잠수함 대체 오브젝트와 같은 회색 박스 스케일의 시각 상수 */
const HULL_RADIUS = 1.1;
const HULL_LENGTH = 5.0;
const COMPARTMENT_HEIGHT = 1.5;
const COMPARTMENT_WIDTH = 1.4;
const HULL_OPACITY = 0.28;
const WATER_OPACITY = 0.75;

/** 수위 변화 감쇠 계수 (시각 보간 — 타이밍 판정 아님) */
const LEVEL_DAMPING = 4;

interface CompartmentVisual {
  readonly waterMesh: THREE.Mesh;
  level: number;
  target: number;
}

export class XrayFloodingSpike {
  /** 장면에 add/remove 하는 진입점 */
  readonly root = new THREE.Group();

  private readonly compartments: CompartmentVisual[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];
  private demoElapsed = 0;

  constructor(private readonly autoDemo: boolean) {
    const segmentLength = (HULL_LENGTH * 0.9) / COMPARTMENT_COUNT;

    // 구획 윤곽선 + 수위 박스 (선체보다 먼저 그려져야 비쳐 보인다)
    const frameGeometry = new THREE.BoxGeometry(
      COMPARTMENT_WIDTH,
      COMPARTMENT_HEIGHT,
      segmentLength * 0.92,
    );
    const edges = new THREE.EdgesGeometry(frameGeometry);
    frameGeometry.dispose();
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x9fd8e8 });
    const waterGeometry = new THREE.BoxGeometry(
      COMPARTMENT_WIDTH * 0.94,
      COMPARTMENT_HEIGHT,
      segmentLength * 0.86,
    );
    // 수위는 scale.y로 표현 — 바닥 기준으로 차오르도록 지오메트리를 위로 절반 이동
    waterGeometry.translate(0, COMPARTMENT_HEIGHT / 2, 0);
    // X-ray는 장식이 아니라 게임 정보 [확정 §3.7] — 심해의 어두운 장면에서도
    // 수위가 판독되도록 약한 자발광을 더한다 (조명 수 증가 없음)
    const waterMaterial = new THREE.MeshLambertMaterial({
      color: 0x2f8fb5,
      emissive: 0x1a4f68,
      transparent: true,
      opacity: WATER_OPACITY,
      depthWrite: false,
    });
    this.disposables.push(edges, edgeMaterial, waterGeometry, waterMaterial);

    for (let i = 0; i < COMPARTMENT_COUNT; i += 1) {
      const centerZ = (i - (COMPARTMENT_COUNT - 1) / 2) * segmentLength;

      const frame = new THREE.LineSegments(edges, edgeMaterial);
      frame.position.set(0, 0, centerZ);
      frame.renderOrder = 0;
      this.root.add(frame);

      const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
      waterMesh.position.set(0, -COMPARTMENT_HEIGHT / 2, centerZ);
      waterMesh.scale.y = 0.0001;
      waterMesh.renderOrder = 1;
      this.root.add(waterMesh);

      this.compartments.push({ waterMesh, level: 0, target: 0 });
    }

    // 반투명 선체 — depthWrite를 끄고 마지막에 그려 내부를 가리지 않는다
    const hullGeometry = new THREE.CapsuleGeometry(HULL_RADIUS, HULL_LENGTH - HULL_RADIUS * 2, 3, 10);
    hullGeometry.rotateX(Math.PI / 2); // 캡슐 축(Y)을 전후 방향(Z)으로
    const hullMaterial = new THREE.MeshLambertMaterial({
      color: 0x7c8a92,
      emissive: 0x223038,
      flatShading: true,
      transparent: true,
      opacity: HULL_OPACITY,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.disposables.push(hullGeometry, hullMaterial);
    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    hull.renderOrder = 2;
    this.root.add(hull);
  }

  /**
   * 구획 침수 심각도 반영 (0 = 없음 ~ 1 = 만수).
   * 값의 출처는 게임플레이(`floodingChanged`)다 — 여기서는 시각화만 한다.
   */
  setSeverity(compartmentIndex: number, severity: number): void {
    const compartment = this.compartments[compartmentIndex];
    if (!compartment) return;
    compartment.target = THREE.MathUtils.clamp(severity, 0, 1);
  }

  update(deltaSeconds: number): void {
    if (this.autoDemo) {
      // 렌더 검증용 시연 순환 — 구획별 위상차를 둔 수위 변화
      this.demoElapsed += deltaSeconds;
      this.compartments.forEach((compartment, i) => {
        const phase = this.demoElapsed * 0.5 - i * 0.9;
        compartment.target = THREE.MathUtils.clamp(Math.sin(phase), 0, 1);
      });
    }

    const t = 1 - Math.exp(-LEVEL_DAMPING * deltaSeconds);
    for (const compartment of this.compartments) {
      compartment.level += (compartment.target - compartment.level) * t;
      compartment.waterMesh.scale.y = Math.max(compartment.level, 0.0001);
    }
  }

  dispose(): void {
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
    this.compartments.length = 0;
    this.root.removeFromParent();
    this.root.clear();
  }
}
