/**
 * Faction 정본 — 세력 규칙표 (INT-CORE-012, 스프린트 B 선행개발).
 *
 * ## 정본 위치
 *
 * `FactionId`(hostile | neutral | patrol)의 **정의 정본은
 * `contracts/meta.ts`** 이며 여기서 재정의하지 않는다. 이 파일은 그 id에
 * 붙는 **규칙 메타데이터**(공격 허용·중립 사건 발생·드롭 참조·식별 분류·
 * 표시 라벨 id·AI 초기 태도)를 한 표로 모은 것이다.
 *
 * ## guard vs patrol
 *
 * 경비 세력의 공식 이름은 **`patrol`** 이다 (통합 창 계약 이름 통일 #1 —
 * 게임플레이가 쓰던 `guard`는 이미 `patrol`로 흡수됨). 같은 의미의 `guard`
 * 를 다시 추가하지 않는다. 코드에 남은 'guard' 표기는 **경비함 스폰 절차**
 * (guardShipRequested·GuardSpawnPort·GuardShipAdapter)의 이름일 뿐이며,
 * 스폰되는 개체의 세력 태그는 언제나 `patrol`이다.
 *
 * ## 'object'는 세력이 아니다
 *
 * 해저 재화(SalvageObject)는 무세력 파괴물이다. `TargetRegistry.CombatTarget`
 * 이 쓰던 인라인 유니언 `FactionId | 'object'`를 이름 있는 타입
 * `CombatTargetClass`로 승격해 두되, **`FactionId`에는 넣지 않는다** —
 * 세력 규칙표(공격 허용·경비 반응·보상)가 적용되는 대상은 선박뿐이다.
 *
 * ## 색·문구는 계약에 없다
 *
 * `displayLabelId`는 **표시 문자열이 아니라 라벨 키**다. 실제 문구·색·
 * 실루엣은 그래픽스 소유이며 계약에 넣지 않는다 (판정과 표현의 분리).
 */

import type { FactionId } from './meta';

export type { FactionId } from './meta';

/** 표적 분류 = 세력(선박) + 무세력 파괴물. TargetRegistry의 인라인 유니언 승격 */
export type CombatTargetClass = FactionId | 'object';

/** 표시 라벨 키 — 실제 문구·색은 그래픽스 소유 (계약에 문자열 없음) */
export type FactionLabelId = 'faction.hostile' | 'faction.neutral' | 'faction.patrol';

/** 경비함 AI의 초기 태도 — 기존 DestroyerAI 상태 어휘와 같은 의미 체계를 쓴다 */
export type AiInitialStance =
  /** 초기 표적 없이 순찰 시작 */
  | 'patrol'
  /** 초기 표적을 알고 경계 시작 (경비함 스폰 기본값) */
  | 'alert';

/** 세력 1종의 규칙 — 판정·보상·식별·AI가 참조하는 단일 표 */
export interface FactionRule {
  readonly id: FactionId;
  /** 플레이어 공격이 '정상 행위'인가 (false여도 물리적으로 막지는 않는다) */
  readonly playerAttackSanctioned: boolean;
  /** 유효 피격 시 중립 사건(경비함 요청)을 발생시키는가 */
  readonly raisesNeutralIncident: boolean;
  /**
   * 격침 보상 드롭 테이블 참조. `null` = 보상 없음(중립),
   * `undefined` 없음 — 공식 params에 표가 없으면 보상은 발생하지 않는다
   * (수치 발명 금지). 실제 크레딧 값은 `params/economy.json`이 소유한다.
   */
  readonly dropTableId: string | null;
  /** 조준경 식별에서 이 세력이 확정됐을 때의 분류값 */
  readonly identification: IdentifiedFactionState;
  readonly displayLabelId: FactionLabelId;
  readonly aiInitialStance: AiInitialStance;
}

/** 식별이 끝난 상태값 (미식별 unidentified는 별도 — identification.ts) */
export type IdentifiedFactionState = 'hostile' | 'neutral' | 'patrol';

/**
 * 세력 규칙 정본표.
 *
 * - hostile: 공격 정상 · 중립 사건 없음 · 공식 적대 드롭 테이블
 * - neutral: 공격 비정상 · **중립 사건 발생** · 보상 없음(크레딧 0)
 * - patrol : 공격 정상(교전 중 반격 대상) · 중립 사건 없음 ·
 *            **보상 미정 — 공식 params 없이 발명하지 않는다** → dropTableId null
 */
export const FACTION_RULES: Readonly<Record<FactionId, FactionRule>> = {
  hostile: {
    id: 'hostile',
    playerAttackSanctioned: true,
    raisesNeutralIncident: false,
    dropTableId: 'cargo-standard',
    identification: 'hostile',
    displayLabelId: 'faction.hostile',
    aiInitialStance: 'patrol',
  },
  neutral: {
    id: 'neutral',
    playerAttackSanctioned: false,
    raisesNeutralIncident: true,
    dropTableId: null,
    identification: 'neutral',
    displayLabelId: 'faction.neutral',
    aiInitialStance: 'patrol',
  },
  patrol: {
    id: 'patrol',
    playerAttackSanctioned: true,
    raisesNeutralIncident: false,
    // 경비함 격침 보상은 공식 수치표에 없다 — 표가 생기기 전에는 보상 없음.
    dropTableId: null,
    identification: 'patrol',
    displayLabelId: 'faction.patrol',
    aiInitialStance: 'alert',
  },
};

export function factionRule(faction: FactionId): FactionRule {
  return FACTION_RULES[faction];
}

/**
 * 격침 보상 결정 (B3) — 세력별 드롭 테이블 참조만 반환한다.
 *
 * 규칙:
 *  - hostile → 공식 적대 드롭 테이블 id
 *  - neutral → `null` (크레딧 0 · 일반 전투 보상 0 — 지갑 불변)
 *  - patrol  → `null` (공식 params 없이 보상 발명 금지)
 *
 * 실제 크레딧 수치는 `params/economy.json`의 dropTables가 소유하며 이
 * 함수는 어떤 숫자도 만들지 않는다. 평판·도덕성 같은 추가 페널티는
 * 스프린트 B 범위 밖이다 (도입 금지).
 */
export function rewardDropTableIdFor(faction: FactionId): string | null {
  return FACTION_RULES[faction].dropTableId;
}
