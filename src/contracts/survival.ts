/**
 * 생존 루프 계약 — 피해·선체·침수·압력·실패 정산 (INT-CORE-014, 스프린트 C).
 *
 * ## 공식 C 범위 [12차 결의 3 · 15차 결의 2]
 *
 * C1 탐지 게이지 / C2 은신·심도 보정 / C3 추적 상태 / C4 폭뢰 투하·피격 /
 * C5 내구도 감소와 X-ray 침수 / C6 파괴 시 실패 화면 / C7 귀환·실패 정산
 * 데이터·화면 분리 / C8 실패 후 영구 성장·희귀 부품 보존 / C9 전투 임시값
 * 전량 params 이관. **전 항목 핵심 게이트.**
 *
 * 이 파일이 덮는 범위: C4의 피해 수신 경계, C5(선체·침수 상태), C6·C7의
 * 실패 판정·정산 전이, C8 보존 규칙. 탐지 게이지(C1·C2)와 추적 상태 머신
 * (C3)은 별도 계약이며 여기 두지 않는다.
 *
 * ## 수치는 여기에 없다
 *
 * 선체 기준값·피해량·침수 속도·압력 피해는 **공식 params가 아직 없다**
 * (upgrades.json의 hullIntegrity·maxDepth는 배율만 승인됐고 `paramRef`가
 * null이다 — "기준값 파라미터·소비자 미존재"). C9 [COMBAT] 이관 대상이며,
 * 도착 전까지 시스템은 **명시적 unwired**로 남고 임시 수치를 만들지 않는다.
 *
 * ## 기존 계약 재사용
 *
 * `HullSystem`(contracts/systems.ts)·`hullDamaged`·`floodingChanged` 이벤트는
 * 이미 존재한다 — 대체하지 않고 소비·발행 규칙을 여기서 확정한다.
 * `DamageCause`('direct' | 'near')는 **폭뢰 근접도 분류**이며 아래
 * `DamageSourceType`(피해 출처)과 의미가 다르다 — 중복 저장이 아니다.
 */

import type { DamageCause } from './events';

/* ── 4-1. 선체 상태 (읽기 모델 정본) ─────────────────────── */

/**
 * 생존 상태 4단계. 경계값(어느 비율에서 damaged/critical인지)은 **params
 * 소유**이며 계약에 두지 않는다.
 */
export type SurvivalState = 'stable' | 'damaged' | 'critical' | 'destroyed';

/**
 * 침수 단계. `floodingLevel`(0~1 연속값)의 구간 분류이며 **파생값**이다 —
 * 같은 의미를 두 곳에 저장하지 않는다(단계는 항상 level에서 계산).
 */
export type FloodingStage = 'none' | 'minor' | 'major' | 'catastrophic';

/** 피해 출처 분류 (폭뢰 근접도 `DamageCause`와 직교) */
export type DamageSourceType =
  | 'enemyWeapon'
  | 'pressure'
  | 'collision'
  | 'environment'
  | 'scripted';

/**
 * 플레이어 선체 상태 — **단일 정본 읽기 모델**.
 * UI·렌더는 이 스냅샷만 읽고 어떤 필드도 쓰지 않는다.
 */
export interface PlayerHullState {
  readonly currentHull: number;
  readonly maxHull: number;
  /** currentHull / maxHull (0~1). maxHull이 미확정이면 null */
  readonly hullRatio: number | null;
  /** 0~1 연속값. 단계는 이 값에서 파생한다 */
  readonly floodingLevel: number;
  /** 초당 침수 증가율 (params 소유 수치의 현재 합) */
  readonly floodingRate: number;
  readonly survivalState: SurvivalState;
  readonly isDestroyed: boolean;
  readonly lastDamageSource: DamageSourceType | null;
  readonly lastDamageAmount: number;
  /** 마지막 피해 시각(epoch ms 또는 프레임) — 없으면 null */
  readonly lastDamageAt: number | null;
  /**
   * 이번 출항에서 회복 가능한 상태인가(파괴 전). 수리 시스템은 C 범위로
   * 확정되지 않았다 — 이 필드는 '아직 파괴되지 않음'의 의미로만 쓴다.
   */
  readonly recoverable: boolean;
  /** 파괴 판정 후 실패 정산이 아직 완료되지 않았다 */
  readonly sortieFailurePending: boolean;
  /**
   * 공식 기준값(선체 최대치)이 주입되지 않은 상태.
   * true면 피해를 적용하지 않고 UI에 정상 선체로 위장하지도 않는다.
   */
  readonly unwired: boolean;
}

/* ── 4-2. 피해 이벤트 ─────────────────────────────────────── */

export interface DamageWorldPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 피해 발생의 정본 페이로드.
 *
 * 금지: UI가 피해량 결정 / 렌더 이펙트가 이 이벤트 생성 / 같은
 * `correlationId`로 중복 적용 / 파괴된 대상에 반복 적용 / 음수·NaN·Infinity.
 */
export interface DamageEvent {
  /** 이 피해 적용 1건의 고유 id (중복 방지 1차 키) */
  readonly damageEventId: string;
  readonly targetEntityId: number;
  /** 공격자 — 환경·압력 피해는 null */
  readonly attackerEntityId: number | null;
  readonly sourceType: DamageSourceType;
  /** 감쇠·배율 적용 **전** 값 */
  readonly rawDamage: number;
  /** 실제 적용된 값 (수신측이 확정) */
  readonly appliedDamage: number;
  readonly worldPosition: DamageWorldPosition;
  /** 발생 시각(epoch ms) 또는 프레임 번호 — 발행측이 정한다 */
  readonly occurredAt: number;
  /** 한 번의 공격·폭발을 묶는 상관 id (중복 방지 2차 키) */
  readonly correlationId: string;
  readonly lethal: boolean;
  readonly causesFlooding: boolean;
  /** 이 피해가 더하는 침수량 (0~1). 수치 출처는 params */
  readonly floodingContribution: number;
  /** 폭뢰 근접도 분류 — 폭뢰 피해에만 존재 (기존 계약 재사용) */
  readonly proximity?: DamageCause;
}

/** 수신측에 넘기는 요청 (appliedDamage·lethal은 수신측이 확정한다) */
export type DamageRequest = Omit<DamageEvent, 'appliedDamage' | 'lethal'>;

/* ── 4-3. 피해 적용 포트 ──────────────────────────────────── */

export type DamageApplyOutcome =
  | 'applied'
  | 'ignoredDuplicate'
  | 'ignoredDestroyed'
  | 'invalidDamage'
  | 'targetNotFound'
  /** 적용 결과가 파괴 — applied의 종결형(파괴 전이는 1회만) */
  | 'destroyed'
  /** 공식 기준값 미주입 — 상태 변경 0 (임시 수치 생성 금지) */
  | 'unwired';

export interface DamageApplyResult {
  readonly outcome: DamageApplyOutcome;
  /** 실제로 깎인 양 (거부 시 0) */
  readonly appliedDamage: number;
  readonly hull: PlayerHullState;
}

/**
 * 피해 적용 포트. **적용·선체 변경·파괴 판정은 한 트랜잭션 경계 안에서**
 * 일어나며 예외를 밖으로 던지지 않는다. UI·렌더는 읽기만 한다.
 */
export interface DamageReceiverPort {
  applyDamage(request: DamageRequest): DamageApplyResult;
}

/* ── 4-4. 선체 기준값·업그레이드 연결 ─────────────────────── */

/**
 * 선체 공식 수치 (C9 [COMBAT] 이관 대상 — **현재 params에 없음**).
 * 주입되지 않으면 `PlayerHullState.unwired = true`로 남는다.
 */
export interface HullBaseParams {
  /** 업그레이드 적용 **전** 최대 내구도 */
  readonly baseMaxHull: number;
  /** survivalState 경계 (0~1 비율, damaged > critical) */
  readonly damagedRatioThreshold: number;
  readonly criticalRatioThreshold: number;
}

/**
 * 업그레이드 소비 경계 — `hullIntegrity` 보정 합을 최대 내구도에 적용한다.
 * 공식 배율은 `params/upgrades.json`(승인 완료), 합연산 공식은
 * `meta/upgradeMath.effectiveValue`가 정본이다.
 *
 * **구매 직후 현재 선체 처리 정책은 미결정** — 후보 3안(증가분만큼 현재치
 * 증가 / 비율 유지 / 현재치 유지) 중 회의 근거가 없어 리드가 임의 확정하지
 * 않는다. 구매는 기지(BASE)에서만 가능하고 출항 시작 시 선체가 최대치로
 * 초기화되므로 **C 핵심 게이트에 영향이 없다**(결정 요청 상태로 둔다).
 */
export interface HullUpgradeConsumer {
  /** 보정 합(0.1 = +10%)을 받아 최대 내구도를 재계산한다 */
  applyHullIntegrityModifier(modifierSum: number): void;
}

/* ── 4-5. 심도·압력 ───────────────────────────────────────── */

/**
 * 심도 압력 계약.
 *
 * **좌표 규약**: 월드 Y는 위가 +다(`conventions.WORLD_UP`). 잠수함이 깊이
 * 내려갈수록 Y는 작아진다. 아래 필드는 전부 **월드 Y 좌표**이며 '깊이
 * 절댓값'이 아니다 — 부호 해석을 뒤집지 않는다.
 *
 * **압력 피해는 C 공식 종료 조건 목록(C1~C9)에 없다.** 따라서 이 계약은
 * `maxDepth` 소비 경계만 정의하고 **구현은 pending**이다. 도입이 결정되면
 * 매 프레임 중복 피해가 아니라 아래 tick 규칙을 따른다.
 */
export interface DepthPressureParams {
  /** 안전 잠항 한계 Y — 이 아래로 내려가면 경고 (업그레이드 적용 후 값) */
  readonly safeDepthY: number;
  /** 압력 피해 시작 Y — safeDepthY 이하 */
  readonly pressureDamageStartY: number;
  /** 결정적 피해 tick 간격(초) — 프레임률 독립 */
  readonly damageTickSeconds: number;
  /** tick 1회당 피해량 */
  readonly damagePerTick: number;
  /** 즉시 파괴 심도 도입 여부 — 미결정이면 null */
  readonly instantCrushY: number | null;
}

/**
 * `maxDepth` 업그레이드 소비 경계.
 *
 * 구분: **물리적 이동 제한**(기존 심도 3층·레이아웃 파생 — 변경하지 않는다)
 * / **안전 잠항 한계**(경고 기준) / **압력 피해 시작 깊이** / **즉시 파괴
 * 깊이**(도입 미결정). 기존 심도 3단계 이동 규칙을 깨지 않는다.
 *
 * 기준값이 없으면(현재 상태) 구현하지 않는다 — 임의 수치 금지.
 */
export interface DepthPressurePort {
  /** BASE·DEBRIEF·일시정지 상태에서는 호출되지 않는다 (압력 피해 없음) */
  updatePressure(deltaSeconds: number, currentY: number): void;
  applyMaxDepthModifier(modifierSum: number): void;
}

/* ── 4-6. 침수 ────────────────────────────────────────────── */

/**
 * 침수 공식 수치 (C9 [COMBAT] 이관 대상 — **현재 params에 없음**).
 * 침수로 인한 이동 성능 저하·조작 불능은 공식 결정이 없어 계약에 없다.
 */
export interface FloodingParams {
  /** 단계 경계 (0~1, minor < major < catastrophic) */
  readonly minorThreshold: number;
  readonly majorThreshold: number;
  readonly catastrophicThreshold: number;
  /** 침수 1.0당 초당 선체 피해 (0이면 선체 피해 없음) */
  readonly hullDamagePerSecondAtFull: number;
  /** 자연 증가율(초당) — 피해로 시작된 침수의 지속 확산 */
  readonly spreadPerSecond: number;
}

export interface FloodingSnapshot {
  readonly level: number;
  readonly stage: FloodingStage;
  readonly ratePerSecond: number;
  readonly unwired: boolean;
}

/* ── 4-7. 적 공격 → 피해 경계 ─────────────────────────────── */

/**
 * 적 공격 1회의 서술 — `DestroyerAIController`(리드)는 이 요청을 만들 뿐
 * **선체 수치·피해 계산을 갖지 않는다.** 실제 피해량·사거리·쿨다운은
 * params(미확정)와 게임플레이 판정 소유다.
 */
export interface EnemyAttackRequest {
  readonly attackId: string;
  readonly attackerEntityId: number;
  readonly targetEntityId: number;
  readonly attackerPosition: DamageWorldPosition;
  readonly targetPosition: DamageWorldPosition;
  readonly correlationId: string;
  readonly requestedAt: number;
}

export type EnemyAttackOutcome =
  | 'delivered'
  | 'outOfRange'
  | 'onCooldown'
  | 'duplicate'
  | 'unwired';

/**
 * 적 공격 → 피해 전달 경계. 구현은 **공식 무기·사거리·쿨다운 params가
 * 도착한 뒤** 게임플레이가 판정을 채운다 — 그 전까지 `unwired`를 반환하고
 * 거리와 무관한 자동 피해·테스트 통과용 즉시 피해를 만들지 않는다.
 * 폭뢰(C4)는 공식 범위지만 투하·신관·피해 판정은 게임플레이 소유다.
 */
export interface EnemyAttackPort {
  requestAttack(request: EnemyAttackRequest): EnemyAttackOutcome;
}

/**
 * C4 폭뢰 공격의 정본 runtime 경로 [INT-CORE-015]:
 *
 * ```
 * DetectionStageSource (탐지·추적 상태 — contracts/detection.ts)
 *   → DestroyerAIController: attack 상태에서 EnemyAttackRequest 생성만
 *   → EnemyAttackPort (게임플레이 구현 — 쿨다운·사거리 판정)
 *   → DepthChargeSystem (기존 계약, 게임플레이): 투하 → 신관(3.0s 하한 고정,
 *     combat.json depthChargeFuseSeconds) → 폭발
 *   → 거리·근접 판정: DamageCause 'direct' | 'near' (판정 = 게임플레이)
 *   → DamageRequest { sourceType: 'enemyWeapon', proximity } 생성
 *   → DamageReceiverPort.applyDamage — **모든 선체 피해의 단일 창구**
 * ```
 *
 * 원칙:
 *  - AI는 공격 **요청만** 만든다 — 피해량·폭발 반경·쿨다운을 소유하지 않는다.
 *  - 즉시 피해·거리 무관 피해·AI 내부 직접 체력 차감 금지.
 *  - 투하 패턴(동시 개수)은 combat.json `simultaneousDepthCharges`(확정 4)
 *    상한을 따르고, direct/near **피해량은 미확정** — 아래 params가 null이면
 *    폭발해도 피해는 `unwired`다 (연출만 있고 피해 없는 상태를 UI에
 *    정상 피해로 위장하지 않는다).
 */
export interface DepthChargeDamageParams {
  /** 직격 판정 반경(m) — 미확정이면 null */
  readonly directRadiusMeters: number | null;
  /** 근접 판정 반경(m) — 미확정이면 null */
  readonly nearRadiusMeters: number | null;
  /** 직격 피해량 — 미확정이면 null */
  readonly directDamage: number | null;
  /** 근접 피해량 — 미확정이면 null */
  readonly nearDamage: number | null;
  /** 투하 쿨다운(초) — 미확정이면 null */
  readonly dropCooldownSeconds: number | null;
}

/* ── 4-8. 생존 HUD 읽기 모델 ──────────────────────────────── */

/** 경고 키 — 문구·색·이펙트는 그래픽스 소유(계약에 문자열 없음) */
export type SurvivalWarningId =
  | 'hull.damaged'
  | 'hull.critical'
  | 'flooding.minor'
  | 'flooding.major'
  | 'flooding.catastrophic'
  | 'depth.unsafe';

export interface SurvivalReadModel {
  readonly currentHull: number;
  readonly maxHull: number;
  readonly hullRatio: number | null;
  readonly floodingLevel: number;
  readonly survivalState: SurvivalState;
  /** 마지막 피격 방향 (잠수함 기준 XZ 단위 벡터) — 없으면 null */
  readonly lastHitDirection: { readonly x: number; readonly z: number } | null;
  /** 피격 플래시 요청 (렌더가 소비 후 스스로 해제) */
  readonly damageFlashRequested: boolean;
  readonly warningIds: readonly SurvivalWarningId[];
  /** 실패 확정까지 남은 시간(초) — 카운트다운 미도입이면 null */
  readonly failureCountdown: number | null;
  readonly isDestroyed: boolean;
}

/* ── 4-9. 출항 실패 ───────────────────────────────────────── */

export type SortieFailureReason =
  | 'hullDestroyed'
  | 'pressureCollapse'
  | 'environmental'
  | 'abandonedSortie';

export type FailureSaveStatus = 'saved' | 'saveFailed' | 'notAttempted';

/**
 * 실패 스냅샷. 정산 수치는 **기존 MetaLoop 정산 경로**(`settleSortie`
 * + `economy.creditLossOnDestroyedRatio`)에서 나온 값을 담기만 한다 —
 * 여기서 손실을 다시 계산하지 않는다(별도 지갑·UI 계산 금지).
 */
export interface SortieFailureReport {
  readonly failureId: string;
  readonly reason: SortieFailureReason;
  readonly destroyedByEntityId: number | null;
  readonly damageSource: DamageSourceType | null;
  /** 정산 전 이번 출항 적립 크레딧 */
  readonly pendingCredits: number;
  /** 이번 출항에서 확정된 희귀 부품 (손실 대상 아님) */
  readonly securedRareParts: number;
  readonly appliedLoss: number;
  readonly finalCredits: number;
  readonly finalRareParts: number;
  readonly saveStatus: FailureSaveStatus;
  /** 정산 후 메타 상태 */
  readonly nextState: 'DEBRIEF' | 'BASE' | 'SORTIE';
}

/**
 * 파괴 → 실패 정산 조정자 포트.
 *
 * 규칙 [기존 계약 우선]:
 *  - 파괴 1회 = 실패 1회 = 정산 1회 (중복 실패·중복 정산 금지)
 *  - 정산은 **파괴 판정 이후에만** — 미리 정산하지 않는다
 *  - 손실률·지갑은 MetaLoop 소유(C에서 별도 지갑 구현 금지)
 *  - 저장은 기존 `saveRequested('settlement')` 경로 — 실패 코디네이터가
 *    SavePort를 직접 호출하지 않는다(저장 책임 표 A-12 유지)
 *  - 저장 실패를 성공으로 처리하지 않으며, 실패해도 세션 상태를 잃지 않는다
 */
export interface SortieFailurePort {
  reportDestroyed(input: {
    readonly failureId: string;
    readonly reason: SortieFailureReason;
    readonly destroyedByEntityId: number | null;
    readonly damageSource: DamageSourceType | null;
  }): SortieFailureReport | null;
}

/* ── 4-10. 파괴 후 상태 전환 [결정 확정] ──────────────────── */

/**
 * 정본 흐름:
 * `SORTIE` → (PlayerHullState.isDestroyed = true) → `MetaLoop.settleSortie
 * ({outcome:'destroyed'})` → `DEBRIEF` → `saveRequested('settlement')` →
 * 저장 성공 → `completeDebrief()` → `BASE`.
 *
 * **`MetaState`를 확장하지 않는다.** 파괴 여부는 `PlayerHullState.isDestroyed`
 * 하나가 소유하고, 메타 상태는 기존 `DEBRIEF`를 쓴다 — 같은 사실을 두 상태에
 * 저장하지 않기 위함이다(허용 전환표 `SORTIE → DEBRIEF → BASE`도 그대로).
 *
 * **저장 실패 정책** [기존 저장 책임 표 A-12 우선]:
 *  - 정산은 이미 지갑에 반영됐으므로 **재정산하지 않는다**(중복 정산 금지).
 *  - 상태는 `DEBRIEF`에 머문다 — 기지로 넘어가지 않는다.
 *  - 저장만 재시도할 수 있고, 재시도 성공 시 `BASE`로 전환한다.
 *  - 저장 실패를 성공으로 보고하지 않는다(`saveStatus: 'saveFailed'`).
 */

/** 플레이어 생사 소스 — 적 AI·표적 판정이 소비한다(중복 상태 금지) */
export interface PlayerAliveSource {
  readonly isPlayerAlive: boolean;
}

/* ── 4-12. DEBRIEF 읽기 모델 (C6·C7 화면 분리) ────────────── */

/** 정산 국면의 종류 — 'none'은 정산 중이 아님 */
export type DebriefKind = 'none' | 'returned' | 'aborted' | 'destroyed';

/**
 * DEBRIEF 전용 읽기 모델 — 그래픽스가 `isDestroyed`를 추측해 화면을
 * 고르지 않게 하는 명시적 계약이다. `MetaState`는 확장하지 않는다.
 *
 *  - 정상 귀환·중도 귀환 화면: `kind: 'returned' | 'aborted'` + `settlement`
 *  - 파괴 실패 화면: `kind: 'destroyed'` + `failure`(failureReason 포함)
 *  - 저장 상태: `saveStatus` + `canRetrySave` (실패 시 재시도 UI 노출 근거)
 *
 * 그래픽스는 이 모델을 **읽기만** 한다 — 어떤 필드도 쓰지 않으며,
 * 재시도 명령은 조립부가 제공하는 command 경유다.
 */
export interface DebriefReadModel {
  readonly kind: DebriefKind;
  /** 정산 결과 스냅샷 (MetaLoop 정산 정본의 값) — 정산 전이면 null */
  readonly settlement: import('./meta').SortieSettlement | null;
  /** 파괴 실패 스냅샷 — 파괴가 아니면 null */
  readonly failure: SortieFailureReport | null;
  readonly saveStatus: FailureSaveStatus;
  /** 저장 실패 상태라 재시도가 가능한가 */
  readonly canRetrySave: boolean;
}

/* ── 4-11. 출항 초기화 ────────────────────────────────────── */

/**
 * 새 출항에서 초기화되는 상태 (출항 한정) —
 * currentHull · flooding · lastDamage · destroyed flag · 중복 피해 원장 ·
 * 적 공격 상태 · 실패 코디네이터 · 경비 사건 원장 · salvage 출항 상태.
 *
 * **영구 보존**: 지갑(크레딧·희귀 부품) · 업그레이드 단계 · 장비 loadout.
 *
 * 선체 손상을 기지까지 **영구 유지할지 여부는 기존 설계에 근거가 없다** —
 * 현재 규칙은 '출항 시작 시 최대치로 초기화'이며, 영구 손상 도입은 결정
 * 요청 상태다(임의 확정 금지).
 */
export interface SortieResettable {
  resetForNewSortie(): void;
}
