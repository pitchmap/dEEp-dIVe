/**
 * 조준 — contracts/systems.ts `AimSystem` 구현 (§5.8, INT-CORE-002).
 *
 * 확정 규칙:
 *  - 마우스(우클릭 홀드·좌클릭)와 PC 화면 HUD 버튼은 **이 인스턴스 하나**의
 *    beginAim/endAim/fireTorpedo를 호출한다 — 별도 전투 시스템 금지.
 *    입력 소스가 달라도 발사 결과·재장전 판정은 완전히 동일하다
 *    (발사는 TorpedoSystem.fire() 단일 경로).
 *  - 조준은 잠망경 심도에서만 가능 [확정 §3.4] — 아니면 beginAim이 false.
 *    조준 중 잠망경 심도를 벗어나면 자동 해제된다 (update에서 판정).
 *  - 조준 상태 전이 시 `aimModeChanged { aiming }` 발행 — 렌더(조준 카메라
 *    고정 §3.2)·UI(중앙 조준선 표시)가 구독한다. 중복 발행 없음.
 *  - 수동 조준이 기본 — 자동 락온은 구현하지 않는다 [확정].
 *    조준선: 어뢰는 선수 방향 직선 주행이므로 중앙 조준선은 `aiming` 상태 +
 *    잠수함 포즈(heading)로 그린다. 리드샷 보조선 데이터는 TargetRegistry
 *    (표적 위치·속도) + TorpedoSystem 어뢰 속력이 연결점이다.
 */

import type { AimSystem, DepthSystem, TorpedoSystem } from '../contracts/systems';
import type { EventBus } from '../core/EventBus';

export class PeriscopeAimSystem implements AimSystem {
  private isAiming = false;
  /** 비조준 발사 시도 누적 — '조준이 필요합니다' 안내(결의 2)의 폴링 신호 */
  private aimRequiredSignals = 0;

  // 생성자 매개변수 프로퍼티 미사용 — 검증 러너(run.mjs)의 Node 타입
  // 스트리핑 호환(삭제 가능 문법만)을 위해 명시적 필드로 둔다.
  private readonly bus: EventBus;
  private readonly depth: DepthSystem;
  private readonly torpedo: TorpedoSystem;

  constructor(bus: EventBus, depth: DepthSystem, torpedo: TorpedoSystem) {
    this.bus = bus;
    this.depth = depth;
    this.torpedo = torpedo;
  }

  get aiming(): boolean {
    return this.isAiming;
  }

  /**
   * 비조준 상태 발사 시도 누적 횟수 (단조 증가) — HUD가 변화를 감지해
   * '조준이 필요합니다' 안내를 띄운다 (5차 결의 2). 정식 `aimRequired`
   * 이벤트 계약은 INTEGRATION_NOTES INT-GAME-008 제안 중 — 승인 시 이벤트
   * 발행으로 교체하고 이 카운터는 유지(폴링 겸용)한다.
   */
  get aimRequiredCount(): number {
    return this.aimRequiredSignals;
  }

  /**
   * 조준경 토글 (5차 결의 3 — 우클릭 토글): 조준 중이면 해제, 아니면 진입
   * 시도. 반환값 = 토글 후 조준 여부. 마우스 우클릭과 HUD 조준 버튼이
   * 같은 이 경로를 쓴다 (진입 가능 여부 판정은 beginAim 단일 규칙).
   */
  toggleAim(): boolean {
    if (this.isAiming) {
      this.endAim();
      return false;
    }
    return this.beginAim();
  }

  /** 조준 시작 — 잠망경 심도가 아니면 거부(false). 이미 조준 중이면 true */
  beginAim(): boolean {
    if (this.isAiming) return true;
    if (this.depth.currentLayer !== 'periscope') return false;

    this.isAiming = true;
    this.bus.emit('aimModeChanged', { aiming: true });
    return true;
  }

  /** 조준 종료 — 발사 없이 해제하는 경우 포함. 조준 중이 아니면 무시 */
  endAim(): void {
    if (!this.isAiming) return;
    this.isAiming = false;
    this.bus.emit('aimModeChanged', { aiming: false });
  }

  /**
   * 발사 요청 — 조준 중이 아니면 **절대 발사되지 않고** aimRequired 신호만
   * 누적 후 false (결의 2: 비조준 발사 시도 = 안내). 성공 여부는
   * TorpedoSystem.fire() 단일 판정.
   */
  fireTorpedo(): boolean {
    if (!this.isAiming) {
      this.aimRequiredSignals += 1;
      return false;
    }
    return this.torpedo.fire();
  }

  /** 조준 유지 조건 감시 — 잠망경 심도를 벗어나면 자동 해제 */
  update(_deltaSeconds: number): void {
    if (this.isAiming && this.depth.currentLayer !== 'periscope') {
      this.endAim();
    }
  }
}
