/**
 * M1·M2 Runtime Closure 검증 (툴링 소유 — INT-CORE-022 / HANDOFF).
 *
 * ## 상태 모델 — 존재와 배선을 섞지 않는다
 *
 *  - `pass`              관측했고 규칙 충족
 *  - `fail`              관측했고 위반 — **CI 실패**
 *  - `implemented`       구현체는 있으나 production 배선은 별도 판정
 *  - `unwired`           배선 지점이 없음 (구현 유무와 무관)
 *  - `blocked`           선행 산출물(타 역할 파일)이 아직 없음
 *  - `blockedByNullParam` 필수 수치가 미확정이라 배선해도 동작하지 않음
 *  - `manual`            자동 관측 불가 — 사람이 브라우저에서 판정
 *
 * `blocked`·`unwired`를 `pass`로 올리지 않는다. 병렬 개발 중 타 역할
 * 산출물이 없는 것은 **정상 상태**이며 툴링 실패가 아니다 — 그래서 CI는
 * 이 둘로 실패하지 않고, verifier 자체 오류·계약 위반·잘못된 pass 승격만
 * 실패시킨다.
 */

import type { BossParams } from '../../contracts/params';
import type { InteractionParamsConfig } from '../interactionParams';
import type { SonarParamsConfig } from '../sonarParams';

export type ClosureStatus =
  | 'pass'
  | 'fail'
  | 'implemented'
  | 'unwired'
  | 'blocked'
  | 'blockedByNullParam'
  | 'manual';

export interface ClosureCheck {
  id: string;
  name: string;
  status: ClosureStatus;
  detail: string;
}

/** 러너가 정적 스캔·파일 로드로 주입하는 저장소 사실 */
export interface ClosureRunInput {
  interaction: InteractionParamsConfig;
  sonar: SonarParamsConfig;
  /** economy farming 블록 (미도입이면 null) */
  economyFarming: {
    readonly sectorCapRatioValue: number | null;
    readonly combatRewardAverageValue: number | null;
    readonly capComputable: boolean;
  } | null;
  /** 리드 공식 로더가 파싱한 boss params — 툴링이 재구현하지 않는다 */
  boss: BossParams;
  /** `src/world/bossCluePlacements.ts` 로드 결과. 파일 부재면 null */
  cluePlacements: CluePlacementModule | null;
  /** 파일 부재 사유 (진단용) */
  cluePlacementsAbsenceReason: string | null;
  /** boss.json unlock.clueIds */
  bossUnlockClueIds: readonly string[];
  /**
   * `[M1M2-INITIAL]` 사용자 승인 초기값 — 러너가 상수로 주입한다.
   * **검증기가 기대값을 들고 있어야** params가 조용히 바뀌었을 때 잡힌다.
   */
  approvedBossValues: {
    readonly moveSpeed: number;
    readonly turnRate: number;
    readonly ramContactDamage: number;
    readonly weakPointHitRadius: number;
  };
  /** `[M1M2-INITIAL]` 승인 초기값 — interaction·sonar·farming */
  approvedValues: {
    readonly holdSeconds: number;
    readonly interactRadiusMeters: number;
    readonly noiseContribution: number;
    readonly pingDisplaySeconds: number;
    readonly pingDetectionGaugeRise: number;
    readonly pingCooldownSeconds: number;
    readonly passiveBearingSpread: number;
    readonly sectorCapRatio: number;
    readonly combatRewardAverage: number;
    /** 파생 상한 = 평균 × 비율. 코드·params 어디에도 복제하지 않고 여기서만 대조 */
    readonly derivedSectorCapCredits: number;
  };
  /** 이벤트·계약 정적 관측 */
  contracts: {
    readonly bossHitKindUnion: readonly string[];
    readonly bossHitPayloadKeys: readonly string[];
    readonly sonarBlipKinds: readonly string[];
    /** `bossWeakPointChanged`를 발행하는 production 지점 */
    readonly weakPointProducerSites: readonly string[];
    /** `interactionCollected` payload 키 (discriminated union 전 분기 합집합) */
    readonly interactionCollectedKeys: readonly string[];
    /** 비-clue 분기가 `clueId?: never`로 clueId를 타입 수준에서 금지하는가 */
    readonly nonClueClueIdForbidden: boolean;
  };
  /** save v1→v2 마이그레이션 실행 결과 (러너가 실제 코드로 산출) */
  saveMigration: SaveMigrationObservation;
  /** KeyQ = 액티브 소나 핑 정합 관측 (#14·#16 보완 커밋 대기 중일 수 있다) */
  activePingKey: ActivePingKeyObservation;
  /** HANDOFF §5 16단계 배선 관측 (Game.ts 정적 스캔) */
  wiring: readonly WiringObservation[];
}

/** 그래픽스 정본 모듈의 형태 — 툴링은 이 모양만 알고 파일을 만들지 않는다 */
export interface CluePlacementModule {
  /** interactable targetId → clueId */
  readonly clueIdByInteractableId: Readonly<Record<string, string>>;
  /** 배치 목록 (targetId 필수) */
  readonly placements: readonly { readonly targetId: string; readonly kind?: string }[];
}

export interface SaveMigrationObservation {
  /** legacy count → 이관 결과 (count, 보존된 id 수, unlocked) */
  readonly cases: readonly {
    readonly label: string;
    readonly legacyCount: number | null;
    readonly legacyUnlocked: boolean;
    readonly resultCollected: readonly string[];
    readonly resultUnlocked: boolean;
    /** 재저장 후 다시 읽었을 때의 값 (정책 유지 확인) */
    readonly afterResaveCollected: readonly string[];
    readonly afterResaveUnlocked: boolean;
  }[];
  /** 미지 clue id 주입 시 동작 */
  readonly unknownClueHandled: boolean;
  readonly unknownClueDetail: string;
  /** 미래 버전(다운그레이드) 거부 여부 */
  readonly downgradeRejected: boolean;
}

/**
 * KeyQ = 액티브 소나 핑 계약 관측.
 *
 * 각 항목은 '없음'과 '잘못 구현'을 구분한다 — 파일·API 부재는 `blocked`,
 * 있는데 규칙 위반이면 `fail`이다. fixture에만 있으면 pass로 올리지 않는다.
 */
export interface ActivePingKeyObservation {
  /** 게임플레이 `consumeActivePingPressed()`(또는 최종 동등 API) 선언 지점 */
  readonly consumeApiSites: readonly string[];
  /** production에서 KeyQ를 액티브 핑에 묶는 지점 */
  readonly keyQBindingSites: readonly string[];
  /** KeyQ가 다른 production 명령에 이미 묶여 있는 지점 (충돌 후보) */
  readonly keyQConflictSites: readonly string[];
  /** controlsConfig에 Q 도움말이 있는가 */
  readonly controlsHelpSites: readonly string[];
  /** `requestActivePing()` 연결 대상(소나 시스템 API) 선언 지점 */
  readonly requestApiSites: readonly string[];
  /** repeat 입력이 추가 요청을 만들지 않음을 검증하는 테스트 지점 */
  readonly repeatGuardTestSites: readonly string[];
  /** 쿨다운 거부를 검증하는 테스트 지점 */
  readonly cooldownRejectTestSites: readonly string[];
  /** fixture·데모에만 존재하는 지점 (production 증거로 인정하지 않는다) */
  readonly fixtureOnlySites: readonly string[];
}

export interface WiringObservation {
  readonly step: number;
  readonly id: string;
  readonly label: string;
  /** 구현체가 저장소에 존재하는가 */
  readonly implementationPresent: boolean;
  /** Game.ts에 **실제 호출**이 있는가 (주석·타입 선언은 제외) */
  readonly productionCallSites: readonly string[];
  /** 이 단계가 특정 params 확정에 달려 있는가 */
  readonly blockedByNullParam?: boolean;
  /** fixture 경로에서만 attach되는가 (production 배선으로 인정하지 않는다) */
  readonly fixtureOnlySites?: readonly string[];
}

export interface ClosureStatusFlags {
  TOOLING_RUNTIME_CLOSURE_INFRA_COMPLETE: boolean;
  INTERACTION_PARAMS_LOADER_IMPLEMENTED: boolean;
  SONAR_PARAMS_LOADER_IMPLEMENTED: boolean;
  ECONOMY_FARMING_PARAMS_LOADER_IMPLEMENTED: boolean;
  CLUE_MAPPING_VERIFIER_IMPLEMENTED: boolean;
  COMPOSITION_WIRING_VERIFIER_IMPLEMENTED: boolean;
  RUNTIME_CLOSURE_BROWSER_HARNESS_IMPLEMENTED: boolean;
  CLUE_PROGRESS_INTEGRATED: boolean;
  BOSS_PRODUCTION_SPAWNED: boolean;
  BOSS_ATTACK_PORT_WIRED: boolean;
  BOSS_MOTION_PORT_WIRED: boolean;
  BOSS_PRODUCTION_WIRED: boolean;
  M1_EXIT_GATE_PASSED: boolean;
  M2_PROGRESS_GATE_PASSED: boolean;
  M1_M2_INTEGRATED_COMPLETE: boolean;
  M3_START_ALLOWED: boolean;
}

export interface ClosureRunOutput {
  checks: ClosureCheck[];
  flags: ClosureStatusFlags;
  blockers: string[];
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** canonical clue 종수 — boss.json unlock.clueIds와 대조되는 상수 */
export const CANONICAL_CLUE_COUNT = 3;

/**
 * clue mapping 규칙 검사 — **순수 함수**라 픽스처로도, production 파일로도
 * 같은 코드를 돌린다. 검증기가 실제로 위반을 잡는지 픽스처로 자체 테스트할
 * 수 있어야 파일 부재 기간에도 신뢰가 유지된다.
 * 위반 시 throw, 통과 시 요약 문자열을 돌려준다.
 */
export function assertClueMapping(
  mod: CluePlacementModule,
  expectedClueIds: readonly string[],
): string {
  const mapping = mod.clueIdByInteractableId;
  const mappedClues = Object.values(mapping);
  const uniqueClues = [...new Set(mappedClues)];

  assert(
    expectedClueIds.length === CANONICAL_CLUE_COUNT,
    `boss.json unlock.clueIds는 ${CANONICAL_CLUE_COUNT}종이어야 합니다 (실제 ${expectedClueIds.length})`,
  );
  assert(
    uniqueClues.length === CANONICAL_CLUE_COUNT,
    `canonical clue는 정확히 ${CANONICAL_CLUE_COUNT}종 (실제 ${uniqueClues.length}: ${uniqueClues.join(', ')})`,
  );
  const unknown = uniqueClues.filter((c) => !expectedClueIds.includes(c));
  assert(unknown.length === 0, `boss.json에 없는 미지 clueId: ${unknown.join(', ')}`);
  const missing = expectedClueIds.filter((c) => !uniqueClues.includes(c));
  assert(missing.length === 0, `매핑에 없는 필수 clueId: ${missing.join(', ')}`);

  const targetIds = Object.keys(mapping);
  assert(targetIds.length === new Set(targetIds).size, 'targetId 중복이 있습니다');

  // 배치 정합 — 매핑 target은 실제 배치에 존재해야 한다.
  const placementIds = new Set(mod.placements.map((p) => p.targetId));
  const orphan = targetIds.filter((id) => !placementIds.has(id));
  assert(orphan.length === 0, `배치에 없는 매핑 targetId: ${orphan.join(', ')}`);

  // non-clue 항목(빈 문자열·비문자열)이 매핑에 섞이면 안 된다.
  const bad = Object.entries(mapping).filter(
    ([, clue]) => typeof clue !== 'string' || clue.length === 0,
  );
  assert(bad.length === 0, `non-clue 매핑 항목: ${bad.map(([k]) => k).join(', ')}`);

  const multi = uniqueClues.filter((c) => mappedClues.filter((m) => m === c).length > 1);
  return `canonical ${uniqueClues.length}종 · target ${targetIds.length}개 · 중복 0 · 배치 정합 · 다중 target clue ${multi.length}건(정책상 허용, 진행은 clue 단위 1회)`;
}

export function runRuntimeClosureVerification(input: ClosureRunInput): ClosureRunOutput {
  const checks: ClosureCheck[] = [];
  const check = (id: string, name: string, fn: () => string): void => {
    try {
      checks.push({ id, name, status: 'pass', detail: fn() });
    } catch (error) {
      checks.push({ id, name, status: 'fail', detail: error instanceof Error ? error.message : String(error) });
    }
  };
  const note = (id: string, name: string, status: ClosureStatus, detail: string): void => {
    checks.push({ id, name, status, detail });
  };

  /* ── 작업 1·2·3: params 로더 ─────────────────────────────── */

  check('P1-interaction', 'interaction params — [M1M2-INITIAL] 승인 초기값 정확 일치', () => {
    const hold = input.interaction.hold;
    const a = input.approvedValues;
    assert(hold.holdSeconds.value === a.holdSeconds, `holdSeconds ${a.holdSeconds} 기대 (실제 ${hold.holdSeconds.value})`);
    assert(
      hold.interactRadiusMeters.value === a.interactRadiusMeters,
      `interactRadiusMeters ${a.interactRadiusMeters} 기대 (실제 ${hold.interactRadiusMeters.value})`,
    );
    assert(
      hold.noiseContribution.value === a.noiseContribution,
      `noiseContribution ${a.noiseContribution} 기대 (실제 ${hold.noiseContribution.value})`,
    );
    // null→0 변환이 일어났다면 0이 들어왔을 자리 — 승인값이 0이 아니므로
    // 이 단언이 그대로 변환 금지 회귀 검사가 된다.
    assert(hold.noiseContribution.value !== 0, "소음 기여가 0이면 '소음 없는 회수'가 됩니다 (null→0 변환 의심)");
    assert(hold.holdSeconds.unit === 'seconds' && hold.interactRadiusMeters.unit === 'meters', 'unit 유지');
    assert(input.interaction.pendingFields.length === 0, `미확정 잔존 ${input.interaction.pendingFields.join(', ')}`);
    return `holdSeconds=${hold.holdSeconds.value} · 반경=${hold.interactRadiusMeters.value} · 소음=${hold.noiseContribution.value} · 미확정 0`;
  });

  {
    const wired = input.interaction.productionWired;
    note(
      'P1-interactionWired',
      'interaction production 배선 가능 여부',
      wired ? 'pass' : 'blockedByNullParam',
      wired
        ? '필수 수치 전부 확정 — 배선 가능'
        : `**interaction production BLOCKED** — 미확정 ${input.interaction.pendingFields.join(', ')}. 반경 없이는 거리 판정이, 소음 기여 없이는 '소음 없는 회수'가 되어 회수 자체를 열 수 없다. null을 0으로 읽지 않았다`,
    );
  }

  check('P2-sonar', 'sonar params — [M1M2-INITIAL] 승인 초기값 정확 일치 · 입력 키 부재', () => {
    const sp = input.sonar;
    const a = input.approvedValues;
    assert(sp.activePing.displaySeconds.value === a.pingDisplaySeconds, `displaySeconds ${a.pingDisplaySeconds} 기대`);
    assert(
      sp.activePing.detectionGaugeRise.value === a.pingDetectionGaugeRise,
      `detectionGaugeRise ${a.pingDetectionGaugeRise} 기대 (실제 ${sp.activePing.detectionGaugeRise.value})`,
    );
    assert(sp.activePing.cooldownSeconds.value === a.pingCooldownSeconds, `cooldownSeconds ${a.pingCooldownSeconds} 기대`);
    assert(
      sp.passive.bearingSpreadRadiansAtMaxNoise.value === a.passiveBearingSpread,
      `bearingSpread ${a.passiveBearingSpread} 기대 (실제 ${sp.passive.bearingSpreadRadiansAtMaxNoise.value})`,
    );
    // 노출 대가·쿨다운이 0이면 '대가 없는 핑'이 된다 — null→0 회귀 검사.
    assert(sp.activePing.detectionGaugeRise.value !== 0, '게이지 상승 0 = 대가 없는 핑 (null→0 변환 의심)');
    assert(sp.activePing.cooldownSeconds.value !== 0, '쿨다운 0 = 연타 가능 (null→0 변환 의심)');
    assert(sp.pendingFields.length === 0, `미확정 잔존 ${sp.pendingFields.join(', ')}`);
    return `핑 ${sp.activePing.displaySeconds.value}s/${sp.activePing.detectionGaugeRise.value}/${sp.activePing.cooldownSeconds.value}s · 번짐 ${sp.passive.bearingSpreadRadiansAtMaxNoise.value}rad · 미확정 0`;
  });

  {
    const s = input.sonar;
    note(
      'P2-sonarActiveWired',
      'sonar 액티브 핑 축 배선 가능 여부',
      s.activePingWired ? 'pass' : 'blockedByNullParam',
      s.activePingWired
        ? '핑 3종 확정 — 배선 가능'
        : '**액티브 핑 축 production wiring 불가** — 표시·노출 대가·쿨다운 중 미확정이 있어 반쪽 상태를 만들지 않는다. pass·0으로 기록하지 않음',
    );
    note(
      'P2-sonarPassiveWired',
      'sonar 패시브 방위 축 배선 가능 여부',
      s.passiveBearingWired ? 'pass' : 'blockedByNullParam',
      s.passiveBearingWired
        ? '방위 번짐 확정 — 배선 가능'
        : "**패시브 방위 축 production wiring 불가** — 번짐 폭 미확정. 스코프는 '계기 미연결' 유지",
    );
  }

  check('P3-farming', 'economy farming — 승인 초기값 · 파생 상한 48 · clue 혼합 없음', () => {
    const f = input.economyFarming;
    const a = input.approvedValues;
    assert(f !== null, 'farming 블록이 economy.json에 있어야 합니다');
    assert(f!.sectorCapRatioValue === a.sectorCapRatio, `비율 ${a.sectorCapRatio} 기대 (실제 ${f!.sectorCapRatioValue})`);
    assert(
      f!.combatRewardAverageValue === a.combatRewardAverage,
      `평균 ${a.combatRewardAverage} 기대 (실제 ${f!.combatRewardAverageValue})`,
    );
    assert(f!.capComputable, '두 값이 확정됐으므로 상한 계산이 가능해야 합니다');
    // 파생 상한은 어디에도 저장하지 않는다 — 두 값에서 매번 계산해 대조한다.
    const derived = f!.combatRewardAverageValue! * f!.sectorCapRatioValue!;
    assert(
      Math.abs(derived - a.derivedSectorCapCredits) < 1e-9,
      `파생 상한 ${a.derivedSectorCapCredits} 기대 (실제 ${derived})`,
    );
    return `비율 ${f!.sectorCapRatioValue} × 평균 ${f!.combatRewardAverageValue} = **상한 ${derived} credits**`;
  });

  /* ── 작업 4: boss params (리드 로더 재사용) ───────────────── */

  check('B1-bossFields', 'boss params 4필드 존재 · null 보존 · range·unit·관계', () => {
    const move = input.boss.movement.moveSpeedMetersPerSecond;
    const turn = input.boss.movement.turnRateRadiansPerSecond;
    const ram = input.boss.patterns.ram.contactDamage;
    const weak = input.boss.patterns.weakPointOpen.hitRadiusMeters;
    const all = [
      ['movement.moveSpeedMetersPerSecond', move],
      ['movement.turnRateRadiansPerSecond', turn],
      ['patterns.ram.contactDamage', ram],
      ['patterns.weakPointOpen.hitRadiusMeters', weak],
    ] as const;

    for (const [path, t] of all) {
      assert(t !== undefined, `${path} 필드가 없습니다`);
      assert(Array.isArray(t.range) && t.range.length === 2, `${path}.range는 두 값이어야 합니다`);
      assert(t.range[0] <= t.range[1], `${path}.range 최소 ≤ 최대`);
      assert(typeof t.unit === 'string' && t.unit.length > 0, `${path}.unit 필수`);
      if (t.value !== null) {
        assert(
          t.value >= t.range[0] && t.value <= t.range[1],
          `${path}.value가 범위 밖입니다 (${t.value} ∉ [${t.range[0]}, ${t.range[1]}])`,
        );
        // 이동·선회·피해·반경은 0이면 의미가 없다 — 0 초과여야 한다.
        assert(t.value > 0, `${path}.value는 0 초과여야 합니다 (받은 값: ${t.value})`);
      }
    }

    // 평상시 이동 속도 ≤ 돌진 속도 — 양쪽이 확정일 때만 비교한다.
    const ramSpeed = input.boss.patterns.ram.speedMetersPerSecond;
    if (move.value !== null && ramSpeed && ramSpeed.value !== null) {
      assert(
        move.value <= ramSpeed.value,
        `평상시 이동(${move.value}) ≤ 돌진(${ramSpeed.value}) 이어야 합니다`,
      );
    }

    const pending = all.filter(([, t]) => t.value === null).map(([p]) => p);
    return `4필드 존재 · 미확정 ${pending.length}/4 [${pending.join(', ') || '없음'}] · range·unit 검증 통과`;
  });

  check('B2-approvedValues', 'boss 승인 초기값 정확 일치 · 임의 입력 0건', () => {
    // 승인 전에는 '전부 null'이 규칙이었다. 승인 후에는 **승인값과 정확히
    // 일치**하는지가 규칙이다 — 어느 쪽이든 임의 입력은 여기서 걸린다.
    const expected: readonly (readonly [string, number | null])[] = [
      ['movement.moveSpeedMetersPerSecond', input.approvedBossValues.moveSpeed],
      ['movement.turnRateRadiansPerSecond', input.approvedBossValues.turnRate],
      ['patterns.ram.contactDamage', input.approvedBossValues.ramContactDamage],
      ['patterns.weakPointOpen.hitRadiusMeters', input.approvedBossValues.weakPointHitRadius],
    ];
    const actual: readonly (readonly [string, number | null])[] = [
      ['movement.moveSpeedMetersPerSecond', input.boss.movement.moveSpeedMetersPerSecond.value],
      ['movement.turnRateRadiansPerSecond', input.boss.movement.turnRateRadiansPerSecond.value],
      ['patterns.ram.contactDamage', input.boss.patterns.ram.contactDamage.value],
      ['patterns.weakPointOpen.hitRadiusMeters', input.boss.patterns.weakPointOpen.hitRadiusMeters.value],
    ];
    const mismatch = actual.filter(([, value], i) => value !== expected[i]![1]);
    assert(
      mismatch.length === 0,
      `승인값과 불일치: ${mismatch
        .map(([p, v]) => `${p}=${v} (기대 ${expected.find((e) => e[0] === p)?.[1]})`)
        .join(', ')}`,
    );
    return `4필드 승인값 일치 — ${actual.map(([p, v]) => `${p.split('.').pop()}=${v}`).join(' · ')}`;
  });

  /* ── 작업 5: clue mapping ────────────────────────────────── */

  if (input.cluePlacements === null) {
    note(
      'C1-clueMapping',
      'clue mapping 정본 검증 (src/world/bossCluePlacements.ts)',
      'blocked',
      `정본 파일이 아직 없다 — ${input.cluePlacementsAbsenceReason ?? '파일 부재'}. **그래픽스 PR 산출물이며 툴링이 만들지 않는다.** 파일 도착 시 자동으로 pass/fail 판정으로 전환된다. 파일 없음을 pass로 처리하지 않았다`,
    );
  } else {
    check('C1-clueMapping', 'clue mapping 정본 검증 (production 파일)', () =>
      assertClueMapping(input.cluePlacements!, input.bossUnlockClueIds),
    );
  }

  /* ── 작업 6: save migration ──────────────────────────────── */

  check('S1-migration', 'save v1→v2 — legacy cap 없음 · id 보존 · 해금 단조', () => {
    const obs = input.saveMigration;
    assert(obs.cases.length > 0, '마이그레이션 관측 케이스가 없습니다');
    for (const c of obs.cases) {
      // legacy count > 3을 임의로 3으로 깎으면 안 된다.
      if (c.legacyCount !== null && c.legacyCount > CANONICAL_CLUE_COUNT) {
        assert(
          c.resultCollected.length >= CANONICAL_CLUE_COUNT,
          `${c.label}: legacy ${c.legacyCount}개가 ${c.resultCollected.length}개로 깎였습니다 — 임의 cap 금지`,
        );
      }
      // legacy 해금은 박탈하지 않는다 (0/3이어도 unlocked 유지).
      if (c.legacyUnlocked) {
        assert(c.resultUnlocked, `${c.label}: legacy 해금이 박탈됐습니다 — 단조성 위반`);
        assert(c.afterResaveUnlocked, `${c.label}: 재저장 후 해금이 사라졌습니다`);
      }
      // 재저장해도 정책이 유지돼야 한다.
      assert(
        c.afterResaveCollected.length === c.resultCollected.length,
        `${c.label}: 재저장 후 수집 수가 달라졌습니다 (${c.resultCollected.length} → ${c.afterResaveCollected.length})`,
      );
    }
    assert(obs.unknownClueHandled, `미지 clue id 처리 실패: ${obs.unknownClueDetail}`);
    assert(obs.downgradeRejected, '미래 버전(다운그레이드)이 거부되지 않았습니다');
    return `${obs.cases.length}개 케이스 · cap 없음 · 해금 단조 · 재저장 유지 · 미지 clue 처리 · 다운그레이드 거부`;
  });

  /* ── 작업 7: EventBus·contract ───────────────────────────── */

  check('E1-bossHit', 'bossHit kind 2종 · 피해량·위치·공격자 없음', () => {
    const kinds = [...input.contracts.bossHitKindUnion].sort();
    assert(
      kinds.length === 2 && kinds[0] === 'hull' && kinds[1] === 'weakPoint',
      `kind는 weakPoint|hull 2종이어야 합니다 (실제 ${kinds.join('|')})`,
    );
    const keys = input.contracts.bossHitPayloadKeys;
    assert(keys.length === 1 && keys[0] === 'kind', `payload는 kind 하나여야 합니다 (실제 ${keys.join(', ')})`);
    const forbidden = ['damage', 'amount', 'x', 'z', 'y', 'position', 'attacker', 'attackerEntityId'];
    const leaked = keys.filter((k) => forbidden.some((f) => k.toLowerCase().includes(f.toLowerCase())));
    assert(leaked.length === 0, `금지 필드가 payload에 있습니다: ${leaked.join(', ')}`);
    return 'kind 2종 · payload {kind}만 · 피해량·위치·공격자 0';
  });

  check('E2-weakPointProducer', 'bossWeakPointChanged 발행 정본 = BossController 단독', () => {
    const sites = input.contracts.weakPointProducerSites;
    assert(sites.length > 0, '발행 지점이 없습니다 — 정본이 사라졌습니다');
    const outside = sites.filter((s) => !s.includes('BossController'));
    assert(
      outside.length === 0,
      `BossController 밖 발행 ${outside.length}건: ${outside.join(', ')} — gameplay 중복 producer 금지`,
    );
    return `발행 지점 ${sites.length}건 전부 BossController: ${sites.join(', ')}`;
  });

  check('E3-interactionCollected', 'interactionCollected — targetId/clueId 분리 유지', () => {
    const keys = input.contracts.interactionCollectedKeys;
    assert(keys.includes('targetId'), 'targetId 키가 필요합니다');
    assert(keys.includes('clueId'), 'clueId 키가 필요합니다');
    // 하나로 합쳐 두면 '매핑 없는 clue 성공'을 구조적으로 막을 수 없다.
    assert(
      keys.indexOf('targetId') !== keys.indexOf('clueId'),
      'targetId와 clueId는 별도 필드여야 합니다',
    );
    // non-clue clueId 금지는 런타임 검사가 아니라 **타입 수준** 보장이다.
    assert(
      input.contracts.nonClueClueIdForbidden,
      "비-clue 분기의 `clueId?: never` 금지 장치가 사라졌습니다 — non-clue clueId가 통과할 수 있습니다",
    );
    return `분리 유지 · 비-clue clueId 타입 수준 금지 — payload 키: ${keys.join(', ')}`;
  });

  check('E4-sonarBlipKind', 'SonarBlipKind 7종 (전투 3 + 탐색 4)', () => {
    const kinds = input.contracts.sonarBlipKinds;
    assert(kinds.length === 7, `7종 기대 (실제 ${kinds.length}: ${kinds.join(', ')})`);
    for (const required of ['goldCache', 'salvage', 'clue', 'deepSite']) {
      assert(kinds.includes(required), `탐색 blip ${required} 누락`);
    }
    return `${kinds.length}종: ${kinds.join(', ')}`;
  });

  /* ── KeyQ = 액티브 소나 핑 정합 ──────────────────────────── */

  {
    const q = input.activePingKey;
    const required: readonly (readonly [string, readonly string[]])[] = [
      ['게임플레이 consume API', q.consumeApiSites],
      ['requestActivePing 연결 대상', q.requestApiSites],
      ['KeyQ 바인딩', q.keyQBindingSites],
      ['controlsConfig Q 도움말', q.controlsHelpSites],
      ['repeat 입력 가드 검증', q.repeatGuardTestSites],
      ['쿨다운 거부 검증', q.cooldownRejectTestSites],
    ];
    const absent = required.filter(([, sites]) => sites.length === 0).map(([label]) => label);

    if (q.keyQConflictSites.length > 0) {
      // 있는데 틀린 것 — 이건 blocked가 아니라 fail이다.
      note(
        'Q1-activePingKey',
        'KeyQ = 액티브 소나 핑 정합',
        'fail',
        `KeyQ가 기존 production 명령과 충돌합니다: ${q.keyQConflictSites.join(', ')}`,
      );
    } else if (absent.length === required.length && q.fixtureOnlySites.length > 0) {
      note(
        'Q1-activePingKey',
        'KeyQ = 액티브 소나 핑 정합',
        'blocked',
        `fixture·데모에만 존재하고 production API가 없습니다 (${q.fixtureOnlySites.join(', ')}) — **fixture만으로 pass로 올리지 않는다**`,
      );
    } else if (absent.length > 0) {
      note(
        'Q1-activePingKey',
        'KeyQ = 액티브 소나 핑 정합',
        'blocked',
        `미도착 ${absent.length}/${required.length}: ${absent.join(' · ')} — 게임플레이(#14)·그래픽스(#16) 보완 커밋 대기. 부재를 pass로 올리지 않는다`,
      );
    } else {
      note(
        'Q1-activePingKey',
        'KeyQ = 액티브 소나 핑 정합',
        'pass',
        `consume=${q.consumeApiSites.join(',')} · request=${q.requestApiSites.join(',')} · KeyQ=${q.keyQBindingSites.join(',')} · 도움말=${q.controlsHelpSites.join(',')} · repeat 가드·쿨다운 거부 검증 존재 · 충돌 0`,
      );
    }
  }

  /* ── 작업 8: composition wiring ──────────────────────────── */

  for (const w of input.wiring) {
    const realCalls = w.productionCallSites;
    const fixtureOnly = w.fixtureOnlySites ?? [];
    let status: ClosureStatus;
    let detail: string;

    if (realCalls.length > 0) {
      status = 'pass';
      detail = `production 호출 ${realCalls.join(', ')}`;
    } else if (fixtureOnly.length > 0) {
      // fixture attach는 production wiring이 아니다.
      status = 'unwired';
      detail = `fixture 경로에서만 attach됨 (${fixtureOnly.join(', ')}) — production 배선으로 인정하지 않는다`;
    } else if (w.blockedByNullParam) {
      status = 'blockedByNullParam';
      detail = '필수 params 미확정 — 배선해도 동작하지 않으므로 배선하지 않는다';
    } else if (!w.implementationPresent) {
      status = 'blocked';
      detail = '구현체 미도착 (타 역할 산출물) — 배선 대상이 아직 없다';
    } else {
      status = 'unwired';
      detail = '구현체는 있으나 Game.ts에 production 호출 없음 (주석만 있는 배선은 pass 아님)';
    }
    checks.push({ id: `W${w.step}-${w.id}`, name: `[배선 ${w.step}] ${w.label}`, status, detail });
  }

  /* ── 플래그 산출 ─────────────────────────────────────────── */

  const wiringById = new Map(input.wiring.map((w) => [w.id, w]));
  const wired = (id: string): boolean => (wiringById.get(id)?.productionCallSites.length ?? 0) > 0;

  const hasFail = checks.some((c) => c.status === 'fail');
  const blockers: string[] = [];
  for (const c of checks.filter((x) => x.status === 'fail')) blockers.push(`FAIL:${c.id}`);
  if (!input.interaction.productionWired) {
    blockers.push(`INTERACTION_BLOCKED_BY_NULL:${input.interaction.pendingFields.join('|')}`);
  }
  if (!input.sonar.activePingWired) blockers.push('SONAR_ACTIVE_PING_BLOCKED_BY_NULL');
  if (!input.sonar.passiveBearingWired) blockers.push('SONAR_PASSIVE_BEARING_BLOCKED_BY_NULL');
  if (!input.economyFarming?.capComputable) blockers.push('FARMING_CAP_BLOCKED_BY_NULL');
  if (input.cluePlacements === null) blockers.push('CLUE_MAPPING_SOURCE_ABSENT:src/world/bossCluePlacements.ts');
  for (const w of input.wiring) {
    if (w.productionCallSites.length === 0) blockers.push(`WIRING_${w.step}_NOT_WIRED:${w.id}`);
  }

  const flags: ClosureStatusFlags = {
    // 툴링 인프라는 '툴링이 고칠 수 있는 실패가 없는가'로만 판단한다.
    TOOLING_RUNTIME_CLOSURE_INFRA_COMPLETE: !hasFail,
    INTERACTION_PARAMS_LOADER_IMPLEMENTED: true,
    SONAR_PARAMS_LOADER_IMPLEMENTED: true,
    ECONOMY_FARMING_PARAMS_LOADER_IMPLEMENTED: input.economyFarming !== null,
    CLUE_MAPPING_VERIFIER_IMPLEMENTED: true,
    COMPOSITION_WIRING_VERIFIER_IMPLEMENTED: true,
    RUNTIME_CLOSURE_BROWSER_HARNESS_IMPLEMENTED: true,
    // 아래는 production 배선·브라우저 실측이 있어야 true가 된다.
    CLUE_PROGRESS_INTEGRATED: input.cluePlacements !== null && wired('clueIds'),
    BOSS_PRODUCTION_SPAWNED: wired('bossSpawn'),
    BOSS_ATTACK_PORT_WIRED: wired('bossAttackPort'),
    BOSS_MOTION_PORT_WIRED: wired('bossMotionPort'),
    BOSS_PRODUCTION_WIRED: wired('bossController') && wired('bossMotionPort') && wired('bossAttackPort'),
    // Exit gate는 브라우저 실측 산출물이며 정적 검증으로 올리지 않는다.
    M1_EXIT_GATE_PASSED: false,
    M2_PROGRESS_GATE_PASSED: false,
    M1_M2_INTEGRATED_COMPLETE: false,
    M3_START_ALLOWED: false,
  };

  return { checks, flags, blockers };
}
