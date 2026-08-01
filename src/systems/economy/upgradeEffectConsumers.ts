/**
 * 업그레이드 7항목의 **실제 효과 소비자** 조사 결과 (스프린트 A 마감 조사).
 *
 * 목적: "가격은 공식인데 효과는 아무 데도 안 붙어 있다"를 코드로 드러낸다.
 * 각 항목이 어떤 기준값 파라미터(paramRef)를 어떤 시스템에서 소비하는지
 * 한 곳에 적고, 소비자가 없는 항목은 `deferred consumer`로 **정확히** 표기한다.
 *
 * 금지 사항 (작업 지시):
 *  - 기준값 발명 금지 — 소비자가 없는 항목에 기준값을 만들어 붙이지 않는다.
 *  - 스프린트 A에서 체력 시스템 개발 금지, C 내구도 선구현 금지.
 *  따라서 `deferred consumer` 3종은 **배율만 확정된 상태로 남긴다** — 스텁
 *  파일·빈 인터페이스도 만들지 않는다 (CLAUDE.md 규칙 4).
 *
 * 적용 규칙은 리드 `src/meta/upgradeMath.ts` 한 곳뿐이다 (계산 복제 금지):
 * 클수록 좋은 값 = `effectiveValue`, 시간형 = `effectiveDurationSeconds`.
 */

import type { UpgradeStatId } from '../../contracts/meta';

export type UpgradeEffectStatus =
  /** 실제 소비 시스템에 연결돼 런타임 동작이 바뀐다 */
  | 'wired'
  /** 기준값 파라미터·소비 시스템이 아직 없다 — 배율만 확정 */
  | 'deferred consumer';

export interface UpgradeEffectConsumer {
  readonly id: UpgradeStatId;
  /** params/upgrades.json의 paramRef (없으면 null = 기준값 파라미터 미존재) */
  readonly paramRef: string | null;
  readonly status: UpgradeEffectStatus;
  /** 소비 지점 (deferred면 도입 예정 시스템) */
  readonly consumer: string;
  readonly note: string;
}

/** 공식 7항목 전수 — 목록 길이는 스코프 가드(7항목 상한)와 같아야 한다 */
export const UPGRADE_EFFECT_CONSUMERS: readonly UpgradeEffectConsumer[] = Object.freeze([
  {
    id: 'maxSpeed',
    paramRef: 'movement.maxSpeedMetersPerSecond',
    status: 'wired',
    consumer: 'SubmarinePlayerController.applyMovementParams',
    note: '조립부 deriveEffectiveParams가 effectiveValue로 파생한 유효 params를 주입한다',
  },
  {
    id: 'turnRate',
    paramRef: 'movement.turn90Seconds',
    status: 'wired',
    consumer: 'SubmarinePlayerController.applyMovementParams',
    note: '시간형 — effectiveDurationSeconds로 90도 선회 시간이 단축된다',
  },
  {
    id: 'reloadSpeed',
    paramRef: 'combat.torpedoReloadSeconds',
    status: 'wired',
    consumer: 'StraightRunTorpedoSystem.applyCombatParams',
    note: '시간형 — 재장전 시간이 단축된다',
  },
  {
    id: 'torpedoDamage',
    paramRef: null,
    status: 'wired',
    consumer: 'EquipmentSystem.setUpgradeModifiers → activeTorpedoProfile',
    note: '기준값은 params/equipment.json performance.damage — 합연산 보정이 발사 프로파일에 반영된다',
  },
  {
    id: 'hullIntegrity',
    paramRef: null,
    status: 'deferred consumer',
    consumer: '내구도 시스템 (C9 [COMBAT]) — 미도입',
    note: '체력·내구도 기준값 파라미터가 없다. 스프린트 A에서 체력 시스템을 만들지 않는다',
  },
  {
    id: 'maxDepth',
    paramRef: null,
    status: 'deferred consumer',
    consumer: '심도 한계 (CanyonLayout 수직 한계) — 업그레이드 소비 경로 미정',
    note: '현재 하한은 레이아웃(월드 소유) 값이며 업그레이드로 넓히는 규칙이 확정되지 않았다',
  },
  {
    id: 'sonarRange',
    paramRef: null,
    status: 'deferred consumer',
    consumer: '탐지 시스템 (C9 [COMBAT]) — 미도입',
    note: 'params/detection.json에 소나 거리 기준값이 없다',
  },
]);

/** 소비자가 없는 항목 id — 보고·검증이 그대로 인용한다 */
export const DEFERRED_UPGRADE_CONSUMERS: readonly UpgradeStatId[] = Object.freeze(
  UPGRADE_EFFECT_CONSUMERS.filter((entry) => entry.status === 'deferred consumer').map(
    (entry) => entry.id,
  ),
);
