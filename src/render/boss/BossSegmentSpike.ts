/**
 * 보스 분절 애니메이션 기술 스파이크 (11차 결의 5 — 1주차 판정).
 *
 * 판정 질문:
 *  ① 거대 생물처럼 위협적으로 보이는가
 *  ② 우스꽝스러운 분절 움직임으로 보이지 않는가
 *
 * 기술 제약 [확정]:
 *  - 시각 = **강체 5분절**(머리·턱·몸통·꼬리기부·꼬리지느러미 + 가슴지느러미
 *    한 쌍)의 계층 트랜스폼 + 사인파 회전만. 스켈레탈·스키닝·관절 물리 금지.
 *  - 물리 충돌체는 게임플레이 소유의 **단일 캡슐** 전제 유지 — 이 모듈은
 *    시각 전용이며 판정·AI·체력 임계값을 계산하지 않는다.
 *  - 실행 경로: `?bossSpike=1` (기본 장면과 격리, 실패해도 빌드 무영향).
 *    B안(BossMotionFallback)은 `?bossSpike=1&bossMotion=b` — 기본 비활성.
 *
 * 약점·단계 연출 (안건 D — 판정은 게임플레이 소유):
 *  - setWeakpointActive(bool): 배 아래 약점 플레이트 발광·점멸 + 턱 개방.
 *  - setPhase(1|3): 단계별 색·발광 전환. 파티클·카메라 연출은
 *    onPhaseTransition 콜백 시임(seam)으로 연결 지점만 노출 — 본구현 D17~20.
 *  - 스파이크 단독 실행 시 autoDemo가 약점·단계를 주기 순환(QA 시연 값).
 */

import * as THREE from 'three';
import visualParams from '../renderVisualParams.json';
import type { BossMotionStyle } from './BossMotionStyle';

const PARAMS = visualParams.bossSpike;

/** 단계별 체색·발광 (연출값 — 임계값 판정은 게임플레이 소유) */
const PHASE_TINTS: ReadonlyArray<{ color: number; emissive: number }> = [
  { color: 0x4a5a52, emissive: 0x000000 },
  { color: 0x5a5040, emissive: 0x1a0e00 },
  { color: 0x5c3a34, emissive: 0x2a0800 },
];

export type BossPhase = 1 | 2 | 3;

export class BossSegmentSpike {
  readonly root = new THREE.Group();
  /** 단계 전환 연출 연결 지점 — 파티클·카메라 흔들림 본구현(D17~20)이 구독 */
  onPhaseTransition: ((phase: BossPhase) => void) | null = null;

  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly bodyMaterial: THREE.MeshLambertMaterial;
  private readonly weakpointMaterial: THREE.MeshLambertMaterial;

  // 분절 계층 (강체 5분절 + 지느러미)
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly jaw = new THREE.Group();
  private readonly tailBase = new THREE.Group();
  private readonly tailFin = new THREE.Group();
  private readonly pectoralFins: THREE.Group[] = [];

  private readonly motion: BossMotionStyle;
  private readonly autoDemo: boolean;
  private elapsed = 0;
  private weakpointActive = false;
  private phase: BossPhase = 1;

  constructor(motion: BossMotionStyle, autoDemo: boolean) {
    this.motion = motion;
    this.autoDemo = autoDemo;

    this.bodyMaterial = new THREE.MeshLambertMaterial({
      color: PHASE_TINTS[0]?.color ?? 0x4a5a52,
      flatShading: true,
    });
    const bellyMaterial = new THREE.MeshLambertMaterial({
      color: 0x39463f,
      flatShading: true,
    });
    this.weakpointMaterial = new THREE.MeshLambertMaterial({
      color: 0x7a4a3a,
      emissive: 0x000000,
      flatShading: true,
    });
    this.disposables.push(this.bodyMaterial, bellyMaterial, this.weakpointMaterial);

    // ── 몸통 (중심 강체, 길이 ~14m) ──
    const torsoGeometry = new THREE.CapsuleGeometry(2.6, 9, 3, 8);
    torsoGeometry.rotateX(Math.PI / 2);
    this.disposables.push(torsoGeometry);
    this.body.add(new THREE.Mesh(torsoGeometry, this.bodyMaterial));

    // 등지느러미(몸통 강체에 고정 — 분절 아님)
    const dorsalGeometry = new THREE.ConeGeometry(1.1, 2.6, 4);
    this.disposables.push(dorsalGeometry);
    const dorsal = new THREE.Mesh(dorsalGeometry, this.bodyMaterial);
    dorsal.position.set(0, 3.0, 0.5);
    dorsal.rotation.x = -0.4;
    this.body.add(dorsal);

    // ── 머리 (몸통 자식, 선수 -Z 쪽) — 피벗은 목 관절 ──
    this.head.position.set(0, 0, -6.5);
    const skullGeometry = new THREE.ConeGeometry(2.3, 5.5, 6);
    skullGeometry.rotateX(-Math.PI / 2); // 뾰족한 쪽이 -Z(전방)
    this.disposables.push(skullGeometry);
    const skull = new THREE.Mesh(skullGeometry, this.bodyMaterial);
    skull.position.z = -2.2;
    this.head.add(skull);
    this.body.add(this.head);

    // ── 턱 (머리 자식) — 피벗은 턱 관절(머리 하단 뒤) ──
    this.jaw.position.set(0, -0.9, -1.2);
    const jawGeometry = new THREE.BoxGeometry(2.6, 0.7, 4.2);
    this.disposables.push(jawGeometry);
    const jawMesh = new THREE.Mesh(jawGeometry, bellyMaterial);
    jawMesh.position.z = -2.0;
    this.jaw.add(jawMesh);
    this.head.add(this.jaw);

    // ── 꼬리기부 (몸통 자식, +Z) → 꼬리지느러미 (꼬리기부 자식) ──
    this.tailBase.position.set(0, 0, 6.2);
    const tailGeometry = new THREE.CapsuleGeometry(1.5, 4.4, 2, 7);
    tailGeometry.rotateX(Math.PI / 2);
    this.disposables.push(tailGeometry);
    const tail = new THREE.Mesh(tailGeometry, this.bodyMaterial);
    tail.position.z = 2.6;
    this.tailBase.add(tail);
    this.body.add(this.tailBase);

    this.tailFin.position.set(0, 0, 5.4);
    const tailFinGeometry = new THREE.BoxGeometry(0.5, 4.6, 2.4);
    this.disposables.push(tailFinGeometry);
    const tailFinMesh = new THREE.Mesh(tailFinGeometry, this.bodyMaterial);
    tailFinMesh.position.z = 1.0;
    this.tailFin.add(tailFinMesh);
    this.tailBase.add(this.tailFin);

    // ── 가슴지느러미 한 쌍 (몸통 자식) ──
    const finGeometry = new THREE.BoxGeometry(3.4, 0.4, 1.8);
    this.disposables.push(finGeometry);
    for (const side of [-1, 1]) {
      const fin = new THREE.Group();
      fin.position.set(side * 2.3, -0.8, -2.5);
      const finMesh = new THREE.Mesh(finGeometry, this.bodyMaterial);
      finMesh.position.x = side * 1.6;
      finMesh.rotation.z = side * -0.25;
      fin.add(finMesh);
      this.pectoralFins.push(fin);
      this.body.add(fin);
    }

    // ── 약점 플레이트 (몸통 배 아래 — 연출 전용) ──
    const weakpointGeometry = new THREE.BoxGeometry(1.6, 0.5, 2.6);
    this.disposables.push(weakpointGeometry);
    const weakpoint = new THREE.Mesh(weakpointGeometry, this.weakpointMaterial);
    weakpoint.position.set(0, -2.5, -1.0);
    this.body.add(weakpoint);

    this.root.add(this.body);
  }

  /** 약점 활성 — 게임플레이 판정 결과의 통지만 받는다 (렌더 계산 금지) */
  setWeakpointActive(active: boolean): void {
    this.weakpointActive = active;
  }

  /** 단계 전환 — 게임플레이(보스 AI)가 결정한 단계를 표현만 한다 */
  setPhase(phase: BossPhase): void {
    if (phase === this.phase) return;
    this.phase = phase;
    const tint = PHASE_TINTS[phase - 1];
    if (tint) {
      this.bodyMaterial.color.set(tint.color);
      this.bodyMaterial.emissive.set(tint.emissive);
    }
    this.onPhaseTransition?.(phase);
  }

  update(deltaSeconds: number): void {
    this.elapsed += deltaSeconds;
    const t = this.elapsed;
    const omega = (Math.PI * 2) / PARAMS.swimCycleSeconds;

    // 이동은 모션 스타일(A: 유영 순찰 / B: 대시 곡선)이 root를 움직인다
    this.motion.update(deltaSeconds, this.root);

    // ── 분절 사인파 — 위상차로 파도가 몸을 타고 흐르게 한다 ──
    const swing = Math.sin(t * omega);
    const lagged = Math.sin(t * omega - PARAMS.tailLagRadians);
    const lagged2 = Math.sin(t * omega - PARAMS.tailLagRadians * 1.8);

    this.body.rotation.y = swing * 0.06;
    this.body.rotation.z = Math.sin(t * omega * 0.5) * PARAMS.bodyRollRadians;
    this.head.rotation.y = -swing * 0.1; // 머리는 몸통 반대 위상 — 시선 유지
    this.tailBase.rotation.y = lagged * PARAMS.tailSwingRadians;
    this.tailFin.rotation.y = (lagged2 - lagged) * PARAMS.tailSwingRadians * 1.2;

    // 턱 — 평시 미세 개폐, 약점 활성 시 크게 벌림 (개방 연출)
    const jawIdle = (Math.sin(t * 0.9) + 1) * 0.06;
    const jawTarget = this.weakpointActive ? PARAMS.jawOpenRadians : jawIdle;
    this.jaw.rotation.x += (jawTarget - this.jaw.rotation.x) * Math.min(deltaSeconds * 5, 1);

    // 가슴지느러미 — 교대 플랩
    this.pectoralFins.forEach((fin, i) => {
      const side = i === 0 ? -1 : 1;
      fin.rotation.z = side * Math.sin(t * omega * 0.8 + i * Math.PI) * PARAMS.finFlapRadians;
    });

    // 약점 발광 점멸 — 활성 상태의 표현 (활성 여부는 주입값)
    if (this.weakpointActive) {
      const pulse =
        0.5 + 0.5 * Math.sin(t * Math.PI * 2 * PARAMS.weakpointPulseHz);
      this.weakpointMaterial.emissive.setRGB(0.9 * pulse, 0.25 * pulse, 0.05 * pulse);
    } else {
      this.weakpointMaterial.emissive.setRGB(0, 0, 0);
    }

    // QA 자동 시연 — 스파이크 단독 실행에서만 약점·단계 순환
    if (this.autoDemo) {
      const cycle = Math.floor(t / 6) % 3;
      this.setPhase((cycle + 1) as BossPhase);
      this.setWeakpointActive(Math.floor(t / 3) % 2 === 1);
    }
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
