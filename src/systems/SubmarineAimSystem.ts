/**
 * 조준 — contracts/systems.ts `AimSystem` 구현 (INT-CORE-002 + 7차 대회의
 * 개정판·13차 소회의 규격).
 *
 * 확정 규칙:
 *  - **전 심도 조준** — 유효한 어떤 심도에서도 조준할 수 있다. 구 '잠망경
 *    심도 전용' 규칙은 **폐기**됐다(7차 개정판). 이 시스템은 심도·이동
 *    시스템을 참조조차 하지 않는다 — 조준 진입·해제가 잠수함 Y·속도·심도를
 *    건드릴 수 있는 경로가 구조적으로 존재하지 않는다(자동 부상 불가).
 *  - **우클릭 토글** [5차 결의 3] — 마우스 우클릭과 PC HUD 조준 버튼은 이
 *    인스턴스 하나의 toggleAim/beginAim/endAim/fireTorpedo를 호출한다
 *    (별도 전투 시스템 금지). 발사 성공 후에도 조준 상태를 유지한다.
 *  - **비조준 발사 금지** [5차 결의 2] — 조준 중이 아니면 발사되지 않고
 *    aimRequired 신호만 누적된다.
 *  - **미세 조준** [13차 결의 3·보완분 8·9] — 마우스 이동이 잠수함 로컬
 *    yaw·pitch 미세각을 만든다. 제한·부호는 aimGeometry의 단일 계산 함수만
 *    사용하고, 감도·한계는 주입된 AimingParams(→ params/aiming.json)에서
 *    읽는다. **조준 해제 시 yaw·pitch는 항상 0으로 초기화**(reset 전용,
 *    persist 미지원 — 스키마·분기 스텁 없음).
 *  - 조준 전방 벡터(`forward`)는 십자선 ray와 어뢰 초기 방향의 **단일
 *    출처**다 — 카메라(렌더)와 어뢰가 같은 값을 소비한다.
 */

import type { AimSystem, TorpedoSystem } from '../contracts/systems';
import type { EventBus } from '../core/EventBus';
import { aimForwardVector, clampAimAngles, type AimForward } from './aimGeometry';
import {
  BASE_CAMERA_RADIANS_PER_PIXEL,
  PROVISIONAL_AIMING_PARAMS,
  type AimingParams,
} from './provisionalAiming';

/** 조준각 산출에 필요한 선체 자세 (읽기 전용 — 쓰기 경로 없음) */
export interface AimPoseSource {
  readonly headingRadians: number;
}

export class SubmarineAimSystem implements AimSystem {
  private isAiming = false;
  private aimRequiredSignals = 0;
  private yaw = 0;
  private pitch = 0;

  // 생성자 매개변수 프로퍼티 미사용 — 검증 러너(run.mjs)의 Node 타입
  // 스트리핑 호환(삭제 가능 문법만)을 위해 명시적 필드로 둔다.
  private readonly bus: EventBus;
  private readonly pose: AimPoseSource;
  private readonly torpedo: TorpedoSystem;
  private params: AimingParams;

  constructor(
    bus: EventBus,
    pose: AimPoseSource,
    torpedo: TorpedoSystem,
    params: AimingParams = PROVISIONAL_AIMING_PARAMS,
  ) {
    this.bus = bus;
    this.pose = pose;
    this.torpedo = torpedo;
    this.params = params;
  }

  /** 검증 완료된 조준 파라미터 (재)적용 — params/aiming.json 핫리로드 대응 */
  applyAimingParams(params: AimingParams): void {
    this.params = params;
    const clamped = clampAimAngles(this.yaw, this.pitch, params);
    this.yaw = clamped.yawRadians;
    this.pitch = clamped.pitchRadians;
  }

  get aiming(): boolean {
    return this.isAiming;
  }

  /**
   * 비조준 상태 발사 시도 누적 횟수 (단조 증가) — HUD가 변화를 감지해
   * '조준이 필요합니다'를 띄운다. 정식 이벤트는 INT-GAME-008 제안 중.
   */
  get aimRequiredCount(): number {
    return this.aimRequiredSignals;
  }

  /** 현재 미세 조준각 (라디안, 잠수함 로컬 기준) */
  get yawRadians(): number {
    return this.yaw;
  }

  get pitchRadians(): number {
    return this.pitch;
  }

  /**
   * 공식 계약 `FineAimSource`(contracts/systems.ts) 필드 —
   * 리드 소켓 rig가 읽는 이름이다. 위 yawRadians/pitchRadians와 같은 값이며,
   * 계약 이름으로 노출해 rig가 게임플레이 구현을 직접 알지 않게 한다.
   * (스프린트 A 통합 — 소켓 단일 출처 정규화)
   */
  get aimYawRadians(): number {
    return this.yaw;
  }

  get aimPitchRadians(): number {
    return this.pitch;
  }

  /**
   * 조준 전방 단위 벡터 (월드) — 조준 카메라 시선과 어뢰 초기 진행 방향의
   * 단일 출처. 비조준 상태에서도 선수 정면 기준으로 유효하다.
   */
  get forward(): AimForward {
    return aimForwardVector(this.pose.headingRadians, {
      yawRadians: this.yaw,
      pitchRadians: this.pitch,
    });
  }

  /** 조준경 토글 [5차 결의 3] — 조준 중이면 해제, 아니면 진입 */
  toggleAim(): boolean {
    if (this.isAiming) {
      this.endAim();
      return false;
    }
    return this.beginAim();
  }

  /**
   * 조준 시작 — **모든 유효 심도에서 허용**. 잠수함 위치·속도·심도를
   * 변경하지 않는다(카메라 상태 전환일 뿐). 이미 조준 중이면 true.
   */
  beginAim(): boolean {
    if (this.isAiming) return true;
    this.isAiming = true;
    // 진입은 항상 선수 정면에서 시작한다 (해제 시 reset과 한 쌍)
    this.yaw = 0;
    this.pitch = 0;
    this.bus.emit('aimModeChanged', { aiming: true });
    return true;
  }

  /**
   * 조준 종료 — 미세각을 0으로 초기화한다 [보완분 결의 9: reset 전용].
   * 심도·위치·속도는 건드리지 않는다(조준 해제로 인한 심도 변화 없음).
   */
  endAim(): void {
    if (!this.isAiming) return;
    this.isAiming = false;
    this.yaw = 0;
    this.pitch = 0;
    this.bus.emit('aimModeChanged', { aiming: false });
  }

  /**
   * 마우스 이동 → 미세 조준각. 조준 중에만 반응하며 감도·한계는 params에서
   * 읽는다. dx 오른쪽(+) = 우현 조준(yaw 감소), dy 아래(+) = 하향(pitch 감소)
   * — 화면 좌표 관례를 따른다. 범위 밖은 clamp.
   */
  applyMouseDelta(dx: number, dy: number): void {
    if (!this.isAiming) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;

    // 픽셀 → 라디안: 일반 카메라 감도 × 조준 배율 (조준 중 감도 하향)
    const sensitivity = BASE_CAMERA_RADIANS_PER_PIXEL * this.params.aimMouseSensitivity;
    const clamped = clampAimAngles(
      this.yaw - dx * sensitivity,
      this.pitch - dy * sensitivity,
      this.params,
    );
    this.yaw = clamped.yawRadians;
    this.pitch = clamped.pitchRadians;
  }

  /**
   * 발사 요청 — 조준 중이 아니면 **절대 발사되지 않고** aimRequired 신호만
   * 누적 후 false. 성공 여부는 TorpedoSystem.fire() 단일 판정이며,
   * **발사 후에도 조준 상태를 유지**한다(연속 조준 사격).
   */
  fireTorpedo(): boolean {
    if (!this.isAiming) {
      this.aimRequiredSignals += 1;
      return false;
    }
    return this.torpedo.fire();
  }

  /**
   * 프레임 갱신 — 조준 유지에 심도 조건이 없으므로 상태 감시가 없다
   * (자동 해제·자동 부상 경로 없음). Updatable 계약 유지용.
   */
  update(_deltaSeconds: number): void {
    // 의도적 무동작: 조준은 심도와 무관하다 (전 심도 조준 확정).
  }
}
