/**
 * 프로펠러 기포·수류(wake) — 속도 연동 순수 연출 (판정·이동 계산 없음).
 *
 * 성능 규칙:
 *  - `InstancedMesh` 풀 1개 = **드로우 콜 1** (TorpedoVisuals 기포와 동일
 *    기법). 기포별 개별 메시·머티리얼 금지.
 *  - 풀 상한은 품질 단계가 결정(low 60 / medium 120 / high 170) — 상한
 *    도달 시 발생을 건너뛴다 (가장 오래된 것을 뺏지 않음 — 팝 방지).
 *  - 전체 화면 굴절·후처리 없음. wake는 프로펠러에 연결된 좁은 원뿔 흐름.
 *
 * 속도 연동 (스로틀 = 계약 forwardSpeedMetersPerSecond):
 *  - 발생률·후방 사출 속도·수명(=wake 길이)이 |속도| 비례로 함께 변한다.
 *  - 후진 시 사출 방향이 선수 쪽으로 뒤집힌다 (프로펠러 역회전과 합).
 *  - 정지 시에는 공회전 수준의 미세 발생만 남는다.
 */

import * as THREE from 'three';
import visualParams from './renderVisualParams.json';

const WAKE = visualParams.artDirection.wake;

interface BubbleSlot {
  age: number;
  life: number;
  size: number;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
}

const MATRIX = new THREE.Matrix4();
const QUAT = new THREE.Quaternion();
const SCALE = new THREE.Vector3();
const RADIAL = new THREE.Vector3();

export class PropellerWake {
  readonly mesh: THREE.InstancedMesh;

  private readonly slots: BubbleSlot[] = [];
  private readonly capacity: number;
  private readonly lifeScale: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  private spawnAccumulator = 0;
  /** 결정적 스폰 위상 — Math.random 미사용 (재현 가능) */
  private spawnPhase = 0;

  constructor(capacity: number, lifeScale: number) {
    this.capacity = Math.max(0, Math.floor(capacity));
    this.lifeScale = lifeScale;
    this.geometry = new THREE.SphereGeometry(1, 6, 5);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xcfe6ee,
      transparent: true,
      opacity: WAKE.opacity,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, Math.max(1, this.capacity));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.renderOrder = 3; // 반투명 서열: 수면·부유물과 같은 층
    this.mesh.frustumCulled = false;
  }

  /**
   * 매 프레임 — 스폰(속도 비례) + 수명 진행.
   * @param originWorld 프로펠러 원판 중심 월드 좌표
   * @param washDirWorld 사출 방향 (전진 시 선미 쪽, 후진 시 선수 쪽 — 단위 벡터)
   * @param speedRatio |속도| / 최고 속력 (0..1)
   */
  update(
    deltaSeconds: number,
    originWorld: THREE.Vector3,
    washDirWorld: THREE.Vector3,
    speedRatio: number,
  ): void {
    if (this.capacity === 0) return;
    const ratio = THREE.MathUtils.clamp(speedRatio, 0, 1);

    // ── 스폰 — 발생률 = 속도 비례 (정지 시 공회전 미세 발생) ──
    const rate = THREE.MathUtils.lerp(WAKE.rateMinPerSecond, WAKE.rateMaxPerSecond, ratio);
    this.spawnAccumulator += rate * deltaSeconds;
    while (this.spawnAccumulator >= 1) {
      this.spawnAccumulator -= 1;
      if (this.slots.length >= this.capacity) continue;
      this.spawnPhase = (this.spawnPhase + 0.61803398875) % 1; // 황금비 수열
      const angle = this.spawnPhase * Math.PI * 2;
      const radius = WAKE.discRadiusMeters * (0.35 + 0.65 * hash01(this.spawnPhase));
      RADIAL.set(Math.cos(angle), Math.sin(angle), 0);
      // 사출 축 기준 원판 오프셋 — washDir에 수직인 근사 기저
      const side = Math.abs(washDirWorld.y) > 0.9 ? RADIAL.set(1, 0, 0) : RADIAL;
      const offsetX = side.x * radius;
      const offsetY = Math.sin(angle) * radius;
      const back = THREE.MathUtils.lerp(
        WAKE.backSpeedMinMetersPerSecond,
        WAKE.backSpeedMaxMetersPerSecond,
        ratio,
      );
      const spread = WAKE.spreadRadians;
      const slot: BubbleSlot = {
        age: 0,
        life:
          THREE.MathUtils.lerp(WAKE.lifeMinSeconds, WAKE.lifeMaxSeconds, hash01(angle)) *
          this.lifeScale *
          (0.6 + 0.4 * ratio), // 저속 = 짧은 wake
        size: THREE.MathUtils.lerp(WAKE.sizeMinMeters, WAKE.sizeMaxMeters, hash01(angle * 3.7)),
        position: new THREE.Vector3(
          originWorld.x + offsetX,
          originWorld.y + offsetY,
          originWorld.z,
        ),
        velocity: new THREE.Vector3(
          washDirWorld.x * back + Math.cos(angle) * spread * back * 0.5,
          washDirWorld.y * back + Math.sin(angle) * spread * back * 0.5 + WAKE.riseMetersPerSecond,
          washDirWorld.z * back,
        ),
      };
      this.slots.push(slot);
    }

    // ── 수명 진행 + 인스턴스 행렬 갱신 ──
    QUAT.identity();
    let write = 0;
    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i]!;
      slot.age += deltaSeconds;
      if (slot.age >= slot.life) continue; // 소멸 — 풀에서 제거
      slot.position.addScaledVector(slot.velocity, deltaSeconds);
      slot.velocity.y += WAKE.riseMetersPerSecond * 0.4 * deltaSeconds; // 부력 가속
      const t = slot.age / slot.life;
      // 성장 후 축소 — 팝 없이 자연 소멸
      const scale = slot.size * (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8);
      SCALE.setScalar(Math.max(scale, 1e-4));
      MATRIX.compose(slot.position, QUAT, SCALE);
      this.mesh.setMatrixAt(write, MATRIX);
      this.slots[write] = slot;
      write += 1;
    }
    this.slots.length = write;
    this.mesh.count = write;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }
}

/** 결정적 0..1 해시 (스폰 파라미터 변주용) */
function hash01(x: number): number {
  const v = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}
