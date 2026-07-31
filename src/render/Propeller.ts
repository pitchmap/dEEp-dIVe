/**
 * 잠수함 후미 프로펠러 — 순수 표현 계층 (판정·이동 계산 없음).
 *
 * 선수·선미 규약: `core/conventions.ts` [INT-CORE-002 확정] — 로컬 -Z = 선수,
 * +Z = 선미(LOCAL_STERN). 프로펠러는 선미에 1개.
 *
 * 회전 규칙 (규약 7·8항):
 *  - 입력키가 아니라 **정식 signed speed**(PlayerController.speed, 양수 = 전진)
 *    만 입력받는다. A/D 단독 선회는 속도값에 영향이 없으므로 회전에도 없다 —
 *    `conventions.propellerSpinRatio` 시그니처(속도만 입력)가 이를 강제한다.
 *  - 전진 → 정회전 / 후진 → 역회전 / 속도 비례. 지수 감쇠로 자연 가감속.
 *  - 공회전 비율의 유일한 소스는 `params/movement.json`의
 *    `propellerIdleSpinRatio`다 (기본 0.08) — 렌더 쪽 중복 설정 없음.
 *  - 최대 회전 각속도(rad/s)·감쇠는 렌더 연출 상수 [INT-CORE-002 리드 결정:
 *    밸런스가 아니므로 파라미터화하지 않음].
 *
 * 이 오브젝트가 없어도 게임 로직은 영향받지 않는다 — 장면이 표현 계층에서만
 * 장착·갱신·해제한다.
 */

import * as THREE from 'three';
import type { MovementParams } from '../contracts/params';
import { propellerSpinRatio } from '../core/conventions';

/** 최대 회전 각속도 (rad/s) — 렌더 연출 상수 (파라미터화하지 않음 [리드 결정]) */
const MAX_SPIN_RADIANS_PER_SECOND = 26;
/** 회전 가감속 감쇠 계수 — 프레임레이트 독립 지수 감쇠용 연출 상수 */
const SPIN_RESPONSE_DAMPING = 3;
/** 역회전 판정 임계 (m/s) — 0 부근 부호 떨림으로 방향이 깜빡이지 않게 하는 시각 상수 */
const REVERSE_THRESHOLD_MPS = 0.05;
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
   * @param signedSpeedMps 정식 signed speed (m/s, +전진 / -후진) —
   *  게임플레이 PlayerController의 읽기 전용 상태. 위치 변화 추정 금지.
   * @param movement 검증 완료된 이동 파라미터 (maxSpeed·공회전 비율의 소스)
   */
  update(
    deltaSeconds: number,
    signedSpeedMps: number,
    movement: MovementParams,
  ): void {
    // 회전 비율(0~1)은 공통 규약 함수가 단일 기준 — 정지 시 idle 비율 보장
    const ratio = propellerSpinRatio(
      signedSpeedMps,
      movement.maxSpeedMetersPerSecond.value,
      movement.propellerIdleSpinRatio.value,
    );
    // 후진일 때만 역회전 — 정지(공회전)·전진은 정방향
    const direction = signedSpeedMps < -REVERSE_THRESHOLD_MPS ? -1 : 1;
    const target = direction * ratio * MAX_SPIN_RADIANS_PER_SECOND;

    const t = 1 - Math.exp(-SPIN_RESPONSE_DAMPING * deltaSeconds);
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
