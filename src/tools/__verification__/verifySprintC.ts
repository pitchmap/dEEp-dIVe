/**
 * 스프린트 C 인수 검증 C1~C9 (툴링 창 소유 — `docs/SPRINT_C_HANDOFF.md` manifest).
 *
 * ## 두 종류의 실패를 섞지 않는다
 *
 * 이 러너의 종료 코드는 **툴링이 고칠 수 있는 실패**에만 반응한다.
 *
 *  - `fail`    — 필수 계약·스키마·단일 경로 규칙 위반. **명령을 실패시킨다.**
 *  - `manual`  — 게임플레이·그래픽스 산출물 미병합. 툴링 실패가 아니다.
 *  - `pending` — 공식 수치 미확정(전 필드 null) 또는 브라우저 실측 대기.
 *
 * 역할 브랜치에서는 타 창 구현이 없는 것이 정상이므로, 그 항목이 false인
 * 것과 '툴링이 잘못 만든 것'을 구분해서 출력한다. 다만 계약이 사라지거나
 * 스키마가 깨지면 **즉시 실패**한다 — 그건 남의 창 사정이 아니다.
 *
 * ## C 완료로 오인하지 않는다
 *
 * 전 필드가 null이고 runtime이 미배선인 현재 상태에서
 * `C_CONTRACT_COMPLETE`·`C_TOOLING_READY`는 true가 될 수 있지만
 * `C_RUNTIME_WIRED`·`C_FINAL_COMPLETE`는 **false로 고정**된다.
 * 이 러너는 어떤 경우에도 unwired 상태를 C 최종 완료로 만들지 않는다.
 */

import {
  combatParamsFullyDefined,
  validateCombatParams,
  DEPTH_CHARGE_FIELDS,
  DETECTION_TUNING_FIELDS,
  EXCLUDED_PRESSURE_FIELDS,
  FLOODING_FIELDS,
  HULL_FIELDS,
  type CombatParamsResult,
} from '../combatParams';
import {
  allNullCombatFixture,
  fullyDefinedCombatFixture,
  withCombatFieldRemoved,
  withCombatOverride,
} from './combatParamsFixture';

export type CCheckStatus = 'pass' | 'fail' | 'manual' | 'pending';

export interface CCheckResult {
  id: string;
  name: string;
  status: CCheckStatus;
  detail: string;
}

/** 계약 심볼 1건의 존재 관측 (러너가 정적 스캔해 주입) */
export interface ContractSymbolPresence {
  readonly symbol: string;
  readonly file: string;
  readonly present: boolean;
}

export interface SprintCRunInput {
  /** production `params/combat.json` 원문 */
  combatJson: unknown;
  /** 계약 파일 존재 여부 (경로 → 존재) */
  contractFiles: Readonly<Record<string, boolean>>;
  /** 계약 심볼 존재 관측 */
  contractSymbols: readonly ContractSymbolPresence[];
  /** `applyDamage`(DamageReceiverPort)를 우회해 플레이어 피해를 주는 production 지점 */
  damageBypassSites: readonly string[];
  /** `PlayerHullSystem` 밖에서 `currentHull`을 쓰는 production 지점 */
  hullMutationSites: readonly string[];
  /** AI controller가 피해량을 소유하는 것으로 의심되는 지점 */
  aiDamageOwnershipSites: readonly string[];
  /** `MetaLoop.settleSortie` production 호출 지점 */
  settleSortieCallSites: readonly string[];
  /** 병행 정산(`settleDefeat`/`settleReturn`) production 호출 지점 */
  parallelSettlementCallSites: readonly string[];
  /** `retrySave` 경로에서 재정산을 호출하는 지점 */
  retrySaveResettleSites: readonly string[];
  /** composition 관측 — 등록·연결 지점 */
  composition: {
    readonly playerHullRegistered: boolean;
    readonly floodingCoreConnected: boolean;
    readonly debriefStateRegistered: boolean;
    readonly saveBridgeObserved: boolean;
    /** `attachPlayerAliveSource` 경계(주석·API 선언 포함)가 존재하는가 */
    readonly playerAliveBoundaryPresent: boolean;
    /** 실제 attach **호출**이 존재하는가 (게임플레이 병합 후 true) */
    readonly playerAliveAttachCallSites: readonly string[];
    /** 렌더가 `SurvivalReadModel`을 소비하는 지점 */
    readonly survivalReadModelConsumers: readonly string[];
    /** 렌더가 `DebriefReadModel`을 소비하는 지점 */
    readonly debriefReadModelConsumers: readonly string[];
  };
  /**
   * `params/combat.json`을 직접 import하는 production 지점 중
   * **공인 로더 2개를 제외한** 것.
   *
   * 공인 로더는 필드 집합이 서로 겹치지 않는다:
   *  - `src/config/ParamLoader.ts` — A 시절 `CombatParams`(어뢰 수·재장전·
   *    신관·동시 폭뢰 수·밀려남). 공통 보호 파일이라 툴링이 수정하지 않는다.
   *  - `src/tools/combatParamsLoader.ts` — C9 블록(선체·폭뢰 피해·침수·탐지 튜닝).
   */
  combatJsonDirectImportSites: readonly string[];
  /** 툴링 combat 로더를 소비하는 production 지점 */
  combatLoaderConsumerSites: readonly string[];
  /**
   * C9 **필드명**이 툴링 스키마·로더 밖의 production 코드에 등장하는 지점.
   *
   * 파일 단위 화이트리스트만으로는 '기존 로더가 C9까지 읽기 시작했다'를
   * 잡지 못한다. 필드 유출을 직접 관측해야 C9 블록의 단일 출처가 보장된다.
   */
  c9FieldLeakSites: readonly string[];
  /** 검증 픽스처를 import하는 production 지점 (0이어야 함) */
  fixtureImportSites: readonly string[];
  /** C 수치를 코드 상수로 들고 있는 것으로 의심되는 지점 (C9 발명 금지) */
  combatConstantSites: readonly string[];
  /** A 회귀 — 경제 검증 통과 여부 (러너가 주입) */
  sprintARegressionOk: boolean;
  /** B 회귀 — faction/guard 계약 관측 */
  sprintBRegression: {
    readonly factionRulesPresent: boolean;
    readonly guardContractPresent: boolean;
  };
  /** 기존 aiming provisional 잔존 지점 (C 완료와 무관함을 명시) */
  aimingProvisionalSites: readonly string[];
}

/** 최종 출력 상태 플래그 */
export interface SprintCStatus {
  C_CONTRACT_COMPLETE: boolean;
  C_GAMEPLAY_COMPOSITION_PRESENT: boolean;
  C_GRAPHICS_COMPOSITION_PRESENT: boolean;
  C_COMBAT_PARAMS_DEFINED: boolean;
  C_RUNTIME_WIRED: boolean;
  C_BROWSER_EMPIRICAL_COMPLETE: boolean;
  C_FINAL_COMPLETE: boolean;
  C_TOOLING_READY: boolean;
  blockers: string[];
}

export interface SprintCRunOutput {
  results: CCheckResult[];
  status: SprintCStatus;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runSprintCVerification(input: SprintCRunInput): SprintCRunOutput {
  const results: CCheckResult[] = [];

  const check = (id: string, name: string, fn: () => string): void => {
    try {
      results.push({ id, name, status: 'pass', detail: fn() });
    } catch (error) {
      results.push({ id, name, status: 'fail', detail: error instanceof Error ? error.message : String(error) });
    }
  };
  const note = (id: string, name: string, status: CCheckStatus, detail: string): void => {
    results.push({ id, name, status, detail });
  };

  /* ── 계약 존재 ─────────────────────────────────────────── */

  check('C-contractFiles', '계약 파일 존재 — detection.ts · survival.ts', () => {
    for (const [file, present] of Object.entries(input.contractFiles)) {
      assert(present, `계약 파일이 없습니다: ${file}`);
    }
    return Object.keys(input.contractFiles).join(', ');
  });

  check('C-contractSymbols', '계약 심볼 존재 — 읽기 모델·포트·params 7종', () => {
    const missing = input.contractSymbols.filter((entry) => !entry.present);
    assert(
      missing.length === 0,
      `계약 심볼 누락 ${missing.length}건: ${missing.map((m) => `${m.symbol}(${m.file})`).join(', ')}`,
    );
    return input.contractSymbols.map((s) => s.symbol).join(', ');
  });

  /* ── 단일 피해 경로 ─────────────────────────────────────── */

  check('C-damageSinglePath', '플레이어 피해가 DamageReceiverPort를 우회하지 않음', () => {
    assert(
      input.damageBypassSites.length === 0,
      `우회 지점 ${input.damageBypassSites.length}건: ${input.damageBypassSites.join(' | ')} — 전 피해는 applyDamage 단일 창구를 통과해야 합니다`,
    );
    return '우회 0건';
  });

  check('C-hullMutation', 'PlayerHullSystem 밖에서 currentHull 직접 변경 없음', () => {
    assert(
      input.hullMutationSites.length === 0,
      `직접 변경 ${input.hullMutationSites.length}건: ${input.hullMutationSites.join(' | ')} — FloodingCore·DepthChargeSystem은 applyDamage를 통해야 합니다`,
    );
    return 'FloodingCore·DepthChargeSystem 포함 외부 쓰기 0건';
  });

  check('C-aiDamageOwnership', 'AI controller가 피해량을 소유하지 않음', () => {
    assert(
      input.aiDamageOwnershipSites.length === 0,
      `피해량 소유 의심 ${input.aiDamageOwnershipSites.length}건: ${input.aiDamageOwnershipSites.join(' | ')} — AI는 공격 **요청**만 만듭니다`,
    );
    return 'AI는 EnemyAttackRequest만 생성 (피해량·반경·쿨다운 미소유)';
  });

  /* ── 정산 ──────────────────────────────────────────────── */

  check('C-settleWhitelist', 'MetaLoop.settleSortie production 호출자 화이트리스트 준수', () => {
    // 정산 진입점은 두 곳뿐이다: 파괴(코디네이터) · 중도 귀환(조립부).
    const allowed = ['src/core/SortieFailureCoordinator.ts', 'src/core/Game.ts'];
    const violations = input.settleSortieCallSites.filter(
      (site) => !allowed.some((prefix) => site.startsWith(prefix)),
    );
    assert(
      violations.length === 0,
      `화이트리스트 밖 호출 ${violations.length}건: ${violations.join(' | ')} — 허용: ${allowed.join(', ')}`,
    );
    assert(input.settleSortieCallSites.length > 0, '정산 호출 지점이 하나도 없습니다 (경로 소실)');
    return `${input.settleSortieCallSites.length}건 전부 화이트리스트 안: ${input.settleSortieCallSites.join(', ')}`;
  });

  check('C-noParallelSettlement', '병행 settleDefeat/settleReturn production 호출 0건', () => {
    assert(
      input.parallelSettlementCallSites.length === 0,
      `병행 정산 호출 ${input.parallelSettlementCallSites.length}건: ${input.parallelSettlementCallSites.join(' | ')} — 정산 경로는 MetaLoop 하나여야 합니다`,
    );
    return 'production 호출 0건 (정의 잔존 여부는 게임플레이 정리 항목)';
  });

  check('C-retrySaveNoResettle', 'retrySave에서 재정산 호출 0건', () => {
    assert(
      input.retrySaveResettleSites.length === 0,
      `재정산 ${input.retrySaveResettleSites.length}건: ${input.retrySaveResettleSites.join(' | ')} — 재시도는 저장만 다시 합니다`,
    );
    return '실패 1회 = 정산 1회, 재시도는 저장만';
  });

  /* ── composition ───────────────────────────────────────── */

  const comp = input.composition;

  check('C-compositionCore', 'composition 등록 — PlayerHullSystem · FloodingCore · DebriefStateTracker · SaveBridge', () => {
    assert(comp.playerHullRegistered, 'PlayerHullSystem이 registry에 등록되지 않았습니다');
    assert(comp.floodingCoreConnected, 'FloodingCore가 PlayerHullSystem에 연결되지 않았습니다');
    assert(comp.debriefStateRegistered, 'DebriefStateTracker가 등록되지 않았습니다');
    assert(comp.saveBridgeObserved, 'SaveBridge 결과 관측이 연결되지 않았습니다');
    return 'PlayerHullSystem·FloodingCore·DebriefStateTracker·SaveBridge 4종 확인';
  });

  check('C-playerAliveBoundary', 'PlayerAliveSource attach 경계 존재', () => {
    assert(comp.playerAliveBoundaryPresent, 'attachPlayerAliveSource 경계가 조립부에 없습니다');
    return '조립부에 attach 지점 준비됨';
  });

  if (comp.playerAliveAttachCallSites.length > 0) {
    note(
      'C-playerAliveAttach',
      'PlayerAliveSource 실제 attach 호출 존재',
      'pass',
      comp.playerAliveAttachCallSites.join(', '),
    );
  } else {
    note(
      'C-playerAliveAttach',
      'PlayerAliveSource 실제 attach 호출 존재',
      'manual',
      '실제 호출 0건 — 게임플레이가 `attachPlayerAliveSource(source)` API를 노출해야 조립부가 1줄로 연결한다(인계표 게임플레이 창). 경계는 준비돼 있으므로 API 도착 즉시 연결된다',
    );
  }

  if (comp.survivalReadModelConsumers.length > 0) {
    note('C-survivalRender', 'SurvivalReadModel 렌더 소비 경계', 'pass', comp.survivalReadModelConsumers.join(', '));
  } else {
    note(
      'C-survivalRender',
      'SurvivalReadModel 렌더 소비 경계',
      'manual',
      '렌더 소비 0건 — 생존 HUD는 그래픽스 창 소유(인계표). unwired를 정상 선체로 위장하지 않는 표시가 요구사항이다',
    );
  }

  if (comp.debriefReadModelConsumers.length > 0) {
    note('C-debriefRender', 'DebriefReadModel 렌더 소비 경계', 'pass', comp.debriefReadModelConsumers.join(', '));
  } else {
    note(
      'C-debriefRender',
      'DebriefReadModel 렌더 소비 경계',
      'manual',
      '렌더 소비 0건 — 실패/귀환 화면 분리(C7)는 그래픽스 창 소유. `isDestroyed` 추측 분기 금지가 요구사항이다',
    );
  }

  /* ── params ────────────────────────────────────────────── */

  let combat: CombatParamsResult | null = null;

  check('C9-schema', 'combat.json C9 공식 필드 존재 — 계약 필드명 1:1 (17종 — v0.1.1 침수 기여 2종 포함)', () => {
    combat = validateCombatParams(input.combatJson);
    const expected = HULL_FIELDS.length + DEPTH_CHARGE_FIELDS.length + FLOODING_FIELDS.length + DETECTION_TUNING_FIELDS.length;
    assert(expected === 17, `필드 17종 기대 — v0.1.1 침수 기여 2종 포함 (계약 정본 합계 ${expected})`);
    return `선체 ${HULL_FIELDS.length} · 폭뢰 ${DEPTH_CHARGE_FIELDS.length} · 침수 ${FLOODING_FIELDS.length} · 탐지 ${DETECTION_TUNING_FIELDS.length} = ${expected}종`;
  });

  check('C9-nullAllowed', '현재 값이 null임을 허용 — 미확정을 0으로 확정하지 않음', () => {
    const eco = combat as CombatParamsResult;
    // null이 통과하되, 블록은 주입되지 않아야 한다(0으로 치환 금지).
    assert(eco.pendingFields.length > 0 || combatParamsFullyDefined(eco), '미확정 목록 산출 실패');
    if (!combatParamsFullyDefined(eco)) {
      assert(eco.hull === null, '미확정인데 hull 블록이 주입됐습니다 (기본값 삽입 의심)');
      assert(eco.flooding === null, '미확정인데 flooding 블록이 주입됐습니다');
      assert(eco.detectionTuning === null, '미확정인데 detection 튜닝이 주입됐습니다');
      assert(eco.depthCharge === null, '미확정인데 폭뢰 params가 주입됐습니다');
    }
    // 전 null 픽스처도 같은 결과여야 한다.
    const fromFixture = validateCombatParams(allNullCombatFixture());
    assert(fromFixture.hull === null && fromFixture.pendingFields.length === 17, '전 null 픽스처 결과 불일치');
    return `미확정 ${eco.pendingFields.length}/17 · 블록 주입 0개 (0 치환 없음)`;
  });

  check('C9-reject', '스키마 거부 규칙 — NaN·Infinity·문자열 숫자·음수·누락·관계 위반', () => {
    const full = fullyDefinedCombatFixture();
    // 정상값은 통과해야 한다 (거부만 하는 검증기는 쓸모없다).
    const ok = validateCombatParams(full);
    assert(ok.hull !== null && ok.flooding !== null, '정상 확정값이 주입되어야 합니다');
    assert(ok.pendingFields.length === 0, '전 확정 시 미확정 0이어야 합니다');

    const rejects = (draft: Record<string, unknown>, label: string): void => {
      let threw = false;
      try {
        validateCombatParams(draft);
      } catch {
        threw = true;
      }
      assert(threw, `거부되어야 합니다: ${label}`);
    };

    rejects(withCombatOverride(full, 'hull', 'baseMaxHull', Number.NaN), 'NaN');
    rejects(withCombatOverride(full, 'hull', 'baseMaxHull', Number.POSITIVE_INFINITY), 'Infinity');
    rejects(withCombatOverride(full, 'hull', 'baseMaxHull', '100'), '문자열 숫자');
    rejects(withCombatOverride(full, 'hull', 'baseMaxHull', -1), '음수');
    rejects(withCombatOverride(full, 'hull', 'baseMaxHull', true), 'boolean');
    rejects(withCombatFieldRemoved(full, 'hull', 'baseMaxHull'), '필드 누락 (null 명시와 구분)');
    rejects(withCombatOverride(full, 'hull', 'damagedRatioThreshold', 0.1), '경계 역전 (damaged <= critical)');
    rejects(withCombatOverride(full, 'hull', 'damagedRatioThreshold', 1.5), '비율 1 초과');
    rejects(withCombatOverride(full, 'depthCharge', 'directRadiusMeters', 20), 'direct 반경 >= near 반경');
    rejects(withCombatOverride(full, 'flooding', 'majorThreshold', 0.05), '침수 경계 역전 (minor >= major)');
    rejects(
      withCombatOverride(full, 'detection', 'distanceFalloff', { fullEffectMeters: 90, zeroEffectMeters: 10 }),
      '감쇠 곡선 역전 (full >= zero)',
    );
    rejects(withCombatOverride(full, 'detection', 'distanceFalloff', { fullEffectMeters: 10 }), '감쇠 곡선 필드 누락');
    return '정상 통과 + 거부 12종';
  });

  check('C9-relationsOnlyWhenPresent', '경계 관계는 값이 모두 존재할 때만 검증', () => {
    const full = fullyDefinedCombatFixture();
    // 한쪽만 null이면 비교 대상이 없으므로 통과해야 한다.
    const partial = withCombatOverride(full, 'hull', 'criticalRatioThreshold', null);
    const parsed = validateCombatParams(partial);
    assert(parsed.hull === null, '부분 확정 hull은 주입되지 않아야 합니다');
    assert(parsed.pendingFields.includes('hull.criticalRatioThreshold'), '미확정 목록에 실려야 합니다');
    // 폭뢰는 계약이 필드별 null을 허용하므로 부분 확정이 전달된다.
    const dcPartial = withCombatOverride(full, 'depthCharge', 'nearRadiusMeters', null);
    const dcParsed = validateCombatParams(dcPartial);
    assert(dcParsed.depthCharge !== null, '폭뢰는 부분 확정을 전달해야 합니다 (계약 타입이 필드별 null 허용)');
    assert(dcParsed.depthCharge!.nearRadiusMeters === null, 'null 필드가 보존되어야 합니다');
    return '한쪽 null이면 관계 검사 생략 · hull/flooding은 전량 확정 시에만 주입 · 폭뢰는 부분 확정 전달';
  });

  check('C9-pressureExcluded', '압력 관련 값이 C 필수 범위에 없음 (DECISIONS C-8)', () => {
    const eco = combat as CombatParamsResult;
    for (const field of EXCLUDED_PRESSURE_FIELDS) {
      assert(
        !eco.pendingFields.some((path) => path.endsWith(`.${field}`)),
        `압력 필드가 C9 필수 목록에 있습니다: ${field}`,
      );
    }
    // 스키마 차원에서도 유입이 막혀 있는지 확인한다.
    const withPressure = withCombatOverride(fullyDefinedCombatFixture(), 'hull', 'safeDepthY', 30);
    let threw = false;
    try {
      validateCombatParams(withPressure);
    } catch {
      threw = true;
    }
    assert(threw, '압력 필드 유입이 거부되어야 합니다');
    return `압력 ${EXCLUDED_PRESSURE_FIELDS.length}종 전부 C9 필수 범위 밖 · 유입 시 거부`;
  });

  check('C9-loaderSingleSource', 'C9 블록 production 소비는 툴링 로더 단일 출처', () => {
    // ① 공인 로더 2개 밖에서 combat.json을 직접 읽는 곳이 없어야 한다.
    assert(
      input.combatJsonDirectImportSites.length === 0,
      `공인 로더 밖 combat.json 직접 import ${input.combatJsonDirectImportSites.length}건: ${input.combatJsonDirectImportSites.join(' | ')}`,
    );
    // ② 파일 화이트리스트만으로는 '기존 A 로더가 C9까지 읽기 시작했다'를
    //    잡지 못한다. C9 필드명 자체의 유출을 관측해 단일 출처를 보장한다.
    assert(
      input.c9FieldLeakSites.length === 0,
      `C9 필드가 툴링 스키마 밖에 등장 ${input.c9FieldLeakSites.length}건: ${input.c9FieldLeakSites.join(' | ')} — C9 블록은 combatParams/combatParamsLoader만 읽습니다`,
    );
    return `공인 로더 밖 직접 import 0건 · C9 필드 유출 0건 · 로더 소비 ${input.combatLoaderConsumerSites.length}건`;
  });

  check('C9-fixtureIsolation', '검증 픽스처가 production에 import되지 않음', () => {
    assert(
      input.fixtureImportSites.length === 0,
      `픽스처 import ${input.fixtureImportSites.length}건: ${input.fixtureImportSites.join(' | ')} — 테스트 숫자가 production 경로에 들어가면 미확정이 확정으로 위장됩니다`,
    );
    return 'production import 0건 (확정 숫자는 픽스처 파일에만 존재)';
  });

  check('C9-noProvisionalFallback', 'provisional fallback·임의 상수 0건', () => {
    assert(
      input.combatConstantSites.length === 0,
      `C 수치 상수 의심 ${input.combatConstantSites.length}건: ${input.combatConstantSites.join(' | ')} — C9는 코드 상수 0이 조건입니다`,
    );
    return 'C 수치 코드 상수 0건 · 로더에 기본값 삽입 경로 없음';
  });

  /* ── 회귀 ──────────────────────────────────────────────── */

  check('C-regressionA', 'Sprint A 경제 계약 유지', () => {
    assert(input.sprintARegressionOk, 'A 경제 검증이 실패했습니다 — C 작업이 A를 깨뜨렸습니다');
    return 'verify:sprint-a 통과 (경제 params·이관 상태 무변경)';
  });

  check('C-regressionB', 'Sprint B faction/guard 계약 유지', () => {
    assert(input.sprintBRegression.factionRulesPresent, 'FACTION_RULES가 사라졌습니다');
    assert(input.sprintBRegression.guardContractPresent, 'guard 계약이 사라졌습니다');
    return 'FACTION_RULES · guard 계약 유지';
  });

  note(
    'C-aimingProvisionalNotC',
    '기존 aiming provisional을 C 완료로 오인하지 않음',
    input.aimingProvisionalSites.length === 0 ? 'pass' : 'manual',
    input.aimingProvisionalSites.length === 0
      ? 'aiming provisional 잔존 0건'
      : `aiming provisional 잔존 ${input.aimingProvisionalSites.length}건: ${input.aimingProvisionalSites.join(', ')} — **A 스프린트 조준 항목이며 C9 이관 범위(탐지·폭뢰·내구도·침수)가 아니다.** C 완료 판정에 넣지 않고, 게임플레이 후속 항목으로 남긴다`,
  );

  /* ── 브라우저 실측 ─────────────────────────────────────── */

  note(
    'C-browserSurvival',
    'browser survival loop 완주 (피격→침수→파괴→실패 화면→저장→기지→재출항)',
    'pending',
    '브라우저 실측은 통합 빌드 항목이다(상설 규칙 4). 현재 combat params가 전 항목 미확정이고 생존 HUD·DEBRIEF 화면이 미병합이라 시나리오 자체가 성립하지 않는다 — 실측 0회',
  );

  /* ── 상태 플래그 ───────────────────────────────────────── */

  const combatResult = combat as CombatParamsResult | null;
  const hasFail = results.some((r) => r.status === 'fail');

  const contractComplete = !results.some(
    (r) => r.status === 'fail' && (r.id === 'C-contractFiles' || r.id === 'C-contractSymbols'),
  );
  const gameplayPresent = comp.playerAliveAttachCallSites.length > 0;
  const graphicsPresent =
    comp.survivalReadModelConsumers.length > 0 && comp.debriefReadModelConsumers.length > 0;
  const paramsDefined = combatResult !== null && combatParamsFullyDefined(combatResult);

  // runtime 배선은 셋이 **전부** 있어야 참이다. 하나라도 없으면 false.
  const runtimeWired = gameplayPresent && graphicsPresent && paramsDefined;
  const browserComplete = false; // 실측 기록이 없으면 언제나 false
  // 툴링 준비도는 '툴링이 고칠 수 있는 실패가 없는가'로만 판단한다.
  const toolingReady = !hasFail;

  const blockers: string[] = [];
  if (hasFail) {
    for (const r of results.filter((x) => x.status === 'fail')) blockers.push(`TOOLING_FAIL:${r.id}`);
  }
  if (!paramsDefined) {
    blockers.push(
      `C9_PARAMS_PENDING:${combatResult ? combatResult.pendingFields.length : '?'}/17 (공식 수치 미도착 — 발명 금지)`,
    );
  }
  if (!gameplayPresent) blockers.push('GAMEPLAY_NOT_MERGED:PlayerAliveSource attach 호출 0건');
  if (!graphicsPresent) blockers.push('GRAPHICS_NOT_MERGED:SurvivalReadModel·DebriefReadModel 렌더 소비 0건');
  if (!browserComplete) blockers.push('BROWSER_EMPIRICAL_PENDING:생존 루프 실측 0회');

  const status: SprintCStatus = {
    C_CONTRACT_COMPLETE: contractComplete,
    C_GAMEPLAY_COMPOSITION_PRESENT: gameplayPresent,
    C_GRAPHICS_COMPOSITION_PRESENT: graphicsPresent,
    C_COMBAT_PARAMS_DEFINED: paramsDefined,
    C_RUNTIME_WIRED: runtimeWired,
    C_BROWSER_EMPIRICAL_COMPLETE: browserComplete,
    // 최종 완료는 runtime 배선과 브라우저 실측이 **둘 다** 참일 때만.
    C_FINAL_COMPLETE: runtimeWired && browserComplete && contractComplete && !hasFail,
    C_TOOLING_READY: toolingReady,
    blockers,
  };

  return { results, status };
}
