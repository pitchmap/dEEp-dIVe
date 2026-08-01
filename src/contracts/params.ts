/**
 * params/*.json 파라미터 타입 계약.
 *
 * 원칙 (마스터 플랜 §10.2, §11):
 *  - 모든 밸런스 값은 params/*.json에만 존재한다. 코드 하드코딩 금지.
 *  - JSON → 시스템 단방향 주입만 허용. 코드에서 JSON 역기록 금지.
 *  - JSON의 값은 확정 밸런스가 아니라 [초기 테스트값]이며,
 *    조정 범위(range)를 벗어난 값은 로드 시점에 거부된다 (config/validateParams.ts).
 *
 * 이 파일은 공통 보호 파일이다 — 변경은 docs/INTEGRATION_NOTES.md 절차를 따른다.
 */

import type { DepthLayerId } from './events';

/** 조정 범위가 합의된 튜닝 수치 (§11.2 튜닝표와 1:1 대응) */
export interface Tunable {
  /** 현재 초기 테스트값 */
  value: number;
  /** [최소, 최대] 허용 범위 — 벗어나면 로드 거부 */
  range: [number, number];
  unit: string;
  /** 사람용 설명 (판단 기준은 docs/templates/TUNING_LOG.md에서 관리) */
  note?: string;
}

/** 범위 합의가 없는 고정 수치 (타입·유한성 검증만 수행) */
export interface FixedNumber {
  value: number;
  unit: string;
  note?: string;
}

/** params/movement.json — 관성·선회·속력 (§5.1~5.2) */
export interface MovementParams {
  /** 정지 관성 1.5초 [0.5~2.0] */
  stopInertiaSeconds: Tunable;
  /** 90도 선회 2.0초 [1.0~3.0] */
  turn90Seconds: Tunable;
  /**
   * 최고 전진 속력 (m/s) — 임시 초기 테스트값 (INT-GAME-001 이관).
   * 조정 범위는 기획 튜닝표 행 추가 후 확정 — 근거 없는 범위를 만들지 않아
   * FixedNumber(양수·유한 검증만)로 둔다.
   */
  maxSpeedMetersPerSecond: FixedNumber;
  /** 정지→최고 속력 도달 시간 (초) — 임시 초기 테스트값 (INT-GAME-001 이관) */
  accelerationSeconds: FixedNumber;
  /**
   * 프로펠러 공회전 비율 (0~1, 최대 회전 속도 대비) — 정지 상태에서도
   * 이 비율만큼 회전한다. 기본 0.08 [D+5 리뷰 후속 소회의, INT-CORE-002].
   * 소비: core/conventions.ts propellerSpinRatio (렌더는 결과 비율만 사용)
   */
  propellerIdleSpinRatio: FixedNumber;
}

/** 심도 층별 탐지 보정값 — 낮을수록 탐지되기 어렵다 */
export type DepthDetectionModifiers = Record<DepthLayerId, number>;

/** params/detection.json — 탐지 게이지·심도 보정·침묵 항행 (§5.4~5.7) */
export interface DetectionParams {
  /** 잠망경 심도 기준 게이지 만충 8초 [5~15] */
  gaugeFillSecondsAtPeriscope: Tunable;
  /** 심도 3층 식별자와 기본 보정값 (잠망경=1.0 기준) */
  depthModifiers: DepthDetectionModifiers;
  /** 침묵 항행 시 기본 소음 배율 (0~1) */
  silentRunningNoiseMultiplier: Tunable;
}

/** params/combat.json — 어뢰·폭뢰 (§5.8, §5.12~5.13) */
export interface CombatParams {
  /** 어뢰 보유량 3발 (범위 합의 없음 — 고정 수치) */
  torpedoCapacity: FixedNumber;
  /** 어뢰 재장전 20초 [10~30] */
  torpedoReloadSeconds: Tunable;
  /** 폭뢰 신관 3.0초 [3.0~4.0 — 하한 고정, 인간 반응 사슬 근거] */
  depthChargeFuseSeconds: Tunable;
  /** 동시 폭뢰 4개 [2~6] — 난이도 조절의 주 변수 */
  simultaneousDepthCharges: Tunable;
  /** 근접 폭발 밀려남 8m [4~15] */
  nearMissPushbackMeters: Tunable;
}

/** 승무원 식별자 (§3.6 — 4명 고정) */
export type CrewMemberId = 'captain' | 'sonarOperator' | 'chiefEngineer' | 'torpedoOperator';

export interface CrewSkillParams {
  /** 스킬 쿨다운 초기값 [30~120] */
  cooldownSeconds: Tunable;
}

/** params/crew.json — 승무원 스킬 (§5.16) */
export interface CrewParams {
  members: Record<CrewMemberId, CrewSkillParams>;
  /** 어뢰수 스킬 사용 시 재장전 시간: 20초 → 8초 [5~12] */
  torpedoOperatorReloadSeconds: Tunable;
}

/**
 * params/aiming.json — 미세 조준각 (13차 결의 3·8·9, 스프린트 A).
 *
 * 규칙:
 *  - 상향·하향 제한값은 **모두 양의 크기**로 저장한다 — JSON에 음수 하향각
 *    금지. 하향 방향의 음수 적용은 계산(conventions.clampAimPitchRadians)
 *    에서만 한다 [13차 결의 8].
 *  - `aimReturnBehavior`는 존재하지 않는다 — 스프린트 A는 reset 단일 동작이며
 *    미구현 선택지는 스키마에도 넣지 않는다 [13차 결의 9].
 *  - json 파일·validator·GameParams 편입은 빌드·툴 창 범위(스프린트 A 창 4) —
 *    이 타입이 그 작업의 계약 원본이다. 초기값: yaw 15 [10~25] /
 *    pitchUp 10 [5~15] / pitchDown 15 [10~25] / 감도 0.5 [0.3~1.0].
 */
export interface AimingParams {
  /** 좌우 미세각 한계 (도, ± 대칭) — 큰 각은 A/D 선체 선회 담당 */
  aimYawLimitDegrees: Tunable;
  /** 상향 한계 크기 (도, 양수) */
  aimPitchUpLimitDegrees: Tunable;
  /** 하향 한계 크기 (도, 양수 — 계산에서만 음수 적용) */
  aimPitchDownLimitDegrees: Tunable;
  /** 조준 중 마우스 감도 (일반 카메라 대비 배율) */
  aimMouseSensitivity: Tunable;
}

/** 로드·검증 완료된 전체 파라미터 집합 */
export interface GameParams {
  movement: MovementParams;
  detection: DetectionParams;
  combat: CombatParams;
  crew: CrewParams;
}
