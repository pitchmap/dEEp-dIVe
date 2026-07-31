/**
 * 잠수함 후미 프로펠러 — 순수 표현 계층 (판정·이동 계산 없음).
 *
 * 선수·선미 규약: 로컬 -Z = 선수, +Z = 선미. 프로펠러는 선미(+Z)에 1개.
 *
 * 회전 규칙:
 *  - 입력키가 아니라 **실제 전후 속도값**(게임플레이 상태에서 파생)을 사용한다.
 *    A/D 단독 입력(제자리 선회)은 전후 속도가 0이므로 회전에 영향을 주지 않는다.
 *  - 전진 → 정회전 / 후진 → 역회전 / 속도 비례 가감속(지수 감쇠로 자연 감속)
 *  - 실제 전후 속도 0이면 최대 회전의 idleSpinRatio(8%)로 공회전
 *  - 모든 수치는 외부 설정 renderVisualParams.json에서 읽는다 (하드코딩 금지)
 *
 * 이 오브젝트가 없어도 게임 로직은 영향받지 않는다 — 장면이 표현 계층에서만
 * 장착·갱신·해제한다.
 */

import * as THREE from 'three';
import visualParams from './renderVisualParams.json';

const PARAMS = visualParams.propeller;
const BLADE_COUNT = 4;

export class Propeller {
  /** 잠수함 그룹의 선미(+Z)에 add 하는 진입점 */
  readonly root = new THREE.Group();

  private readonly disposables: Array<{ dispose(): void }> = [];
  /** 현재 회전 각속도 (rad/s, 부호 = 회전 방향) */
  private spinRadiansPerSecond = 0;

  constructor() {
    const material = new THREE.MeshLambertMaterial({
      color: 0x6d7a82,
      flatShading: true,
    });

    // 허브 — 축은 전후 방향(Z)
    const hubGeometry = new THREE.CylinderGeometry(0.14, 0.1, 0.4, 8);
    hubGeometry.rotateX(Math.PI / 2);
    const bladeGeometry = new THREE.BoxGeometry(0.09, 0.95, 0.26);
    // 블레이드 피치 — 날이 비스듬히 보이도록 (형태 구분용, 물리 의미 없음)
    bladeGeometry.translate(0, 0.45, 0);
    this.disposables.push(material, hubGeometry, bladeGeometry);

    const hub = new THREE.Mesh(hubGeometry, material);
    this.root.add(hub);

    for (let i = 0; i < BLADE_COUNT; i += 1) {
      const blade = new THREE.Mesh(bladeGeometry, material);
      blade.rotation.y = 0.5; // 날 피치
      const arm = new THREE.Group();
      arm.rotation.z = (i / BLADE_COUNT) * Math.PI * 2;
      arm.add(blade);
      this.root.add(arm);
    }
  }

  /**
   * 매 프레임 갱신.
   * @param forwardSpeedMps 실제 전후 속도 (m/s, +전진 / -후진).
   *  게임플레이가 소유한 위치·방향 상태에서 파생된 값만 받는다 — 입력키 아님.
   */
  update(deltaSeconds: number, forwardSpeedMps: number): void {
    const normalized = THREE.MathUtils.clamp(
      Math.abs(forwardSpeedMps) / PARAMS.fullSpinAtSpeedMps,
      0,
      1,
    );
    // 정지 시에도 최대 회전의 idleSpinRatio(8%)로 공회전
    const magnitude =
      Math.max(normalized, PARAMS.idleSpinRatio) * PARAMS.maxSpinRadiansPerSecond;
    // 후진일 때만 역회전 — 정지(공회전)·전진은 정방향
    const direction = forwardSpeedMps < -PARAMS.reverseThresholdMps ? -1 : 1;
    const target = direction * magnitude;

    // 지수 감쇠 — 속도 변화 시 자연스러운 가감속 (프레임레이트 독립)
    const t = 1 - Math.exp(-PARAMS.spinResponseDamping * deltaSeconds);
    this.spinRadiansPerSecond += (target - this.spinRadiansPerSecond) * t;

    this.root.rotation.z += this.spinRadiansPerSecond * deltaSeconds;
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
