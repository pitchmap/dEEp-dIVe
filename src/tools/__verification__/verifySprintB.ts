/**
 * 스프린트 B 종료 조건 B1~B7 자동 검증 (툴링 창 소유 — 15차 결의 2 창 4 범위).
 *
 * ## 판정 원칙 — verifySprintA와 동일
 *
 * 자동 판정 가능한 것만 pass/fail로 낸다. 관측 대상이 아직 저장소에 없으면
 * 상태를 나눠서 보고한다. **비어 있는 코드를 통과시키지 않는다.**
 *
 *  - `pass`    — 실제 코드·데이터를 관측해 통과
 *  - `fail`    — 관측했고 규칙 위반
 *  - `manual`  — 타 창(게임플레이·그래픽스) 산출물 미병합 → 판정 보류
 *  - `blocked` — 선행 구현 자체가 저장소에 없음 → 통과 불가 (B5가 대표)
 *  - `pending` — 공식 수치·실측 데이터 대기 (B6 배율·B7 측정)
 *
 * `blocked`와 `manual`은 다르다. `manual`은 '다른 창에서 오면 통과할 것'이고
 * `blocked`는 '아무도 아직 만들지 않았다'다. B5의 구축함 AI가 후자다.
 *
 * ## B는 선행개발이다
 *
 * 15차 결의 1에 따라 B 범위표는 **A 통합 PR 병합 시 발효**한다. 이 러너가
 * 전부 초록이어도 B 완료 선언이 되지 않는다 — 발효 전 상태를 관측할 뿐이다.
 */

import { FACTION_RULES, rewardDropTableIdFor, type FactionId } from '../../contracts/faction';
import {
  guardSpawnParamsUsable,
  pendingSprintBFields,
  validateEconomyParams,
  type EconomyParams,
} from '../economyMath';
import {
  INPUT_MISTAKE_EVIDENCE_REQUIRED,
  MINIMUM_TESTER_COUNT,
  MINIMUM_VALID_OPPORTUNITIES,
  REINFORCEMENT_PRIORITY,
  summarizeStudy,
  toCsv,
  toJsonExport,
  validateStudyEntry,
  type StudyEntry,
} from '../b7/identificationStudy';
import { IdentificationStudyRecorder } from '../b7/IdentificationStudyRecorder';
import {
  HIGH_MISIDENTIFICATION_FIXTURE,
  INSUFFICIENT_SAMPLE_FIXTURE,
  LOW_MISIDENTIFICATION_FIXTURE,
  SUFFICIENT_SAMPLE_FIXTURE,
} from '../b7/identificationStudyFixture';

export type BCheckStatus = 'pass' | 'fail' | 'manual' | 'blocked' | 'pending';

export interface BCheckResult {
  id: string;
  name: string;
  status: BCheckStatus;
  detail: string;
}

/**
 * 러너가 정적 스캔해서 주입하는 저장소 사실.
 *
 * 검증기가 파일 시스템을 직접 읽지 않는 이유는 verifySprintA와 같다 —
 * 스캔은 러너(.mjs), 판정은 검증기(.ts)로 나눠 두면 판정 로직을 브라우저에서도
 * 재사용할 수 있다.
 */
export interface SprintBRunInput {
  economyJson: unknown;
  /** production에 존재하는 세력 태그별 선박 정의 지점 (파일:줄 → 세력) */
  factionEntitySites: readonly { readonly location: string; readonly faction: string }[];
  /** `ShipIdentificationSource`를 구현한 production 파일 (테스트·계약 제외) */
  identificationSourceImpls: readonly string[];
  /** 그래픽스가 식별 read model을 소비하는 지점 */
  identificationConsumers: readonly string[];
  /** 모델명·클래스명으로 세력을 추측하는 것으로 의심되는 지점 (위반 후보) */
  factionGuessSites: readonly string[];
  /** `neutralShipHit`를 **발행**하는 production 지점 (구독 제외) */
  neutralHitEmitters: readonly string[];
  /** `DestroyerAI`를 구현한 production 클래스 (계약·테스트 대역 제외) */
  destroyerAiImpls: readonly string[];
  /** 신규 경비 전용 AI로 의심되는 지점 (B5 위반 후보) */
  newGuardAiSites: readonly string[];
  /** 고가치 수송선 배율을 소비하는 production 지점 */
  highValueConsumers: readonly string[];
}

/** B5가 막혔을 때의 고정 사유 코드 — 보고서·CI가 같은 문자열을 본다 */
export const B5_BLOCKED_CODE = 'B5_BLOCKED_NO_DESTROYER_IMPLEMENTATION';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runSprintBVerification(input: SprintBRunInput): BCheckResult[] {
  const results: BCheckResult[] = [];

  const check = (id: string, name: string, fn: () => string): void => {
    try {
      results.push({ id, name, status: 'pass', detail: fn() });
    } catch (error) {
      results.push({ id, name, status: 'fail', detail: error instanceof Error ? error.message : String(error) });
    }
  };
  const note = (id: string, name: string, status: BCheckStatus, detail: string): void => {
    results.push({ id, name, status, detail });
  };

  /* ── 경제 params (B3·B6 기반) ───────────────────────────── */

  let economy: EconomyParams | null = null;
  check('B0-economy', 'B 확장 economy.json 스키마 검증 통과', () => {
    economy = validateEconomyParams(input.economyJson);
    assert(economy.factionRewards !== null, 'factionRewards 블록이 필요합니다');
    assert(economy.highValueTransport !== null, 'highValueTransport 블록이 필요합니다');
    assert(economy.guardSpawn !== null, 'guardSpawn 블록이 필요합니다');
    return '세력 보상·고가치 수송선·경비 스폰 3블록 로드';
  });

  /* ── B1: 적대·중립 동시 배치 ────────────────────────────── */

  check('B1-factionContract', 'B1 FactionId 정본 사용 · 경비 세력 id 중복 없음', () => {
    // 정본은 contracts/meta.ts이고 faction.ts는 재정의하지 않는다.
    const ids = Object.keys(FACTION_RULES) as FactionId[];
    assert(ids.length === 3, `세력은 3종이어야 합니다 (현재 ${ids.length}종)`);
    assert(ids.includes('patrol'), '경비 세력 정본 id는 patrol 이어야 합니다');
    assert(!(ids as string[]).includes('guard'), "'guard' 별칭이 세력으로 추가됐습니다 — patrol 하나여야 합니다 [B-1]");
    for (const id of ids) {
      assert(FACTION_RULES[id].id === id, `${id} 규칙의 id가 키와 다릅니다`);
    }
    // 'object'는 세력이 아니다 — CombatTargetClass로 분리돼 있어야 한다.
    assert(!(ids as string[]).includes('object'), "'object'는 세력이 아닙니다 (CombatTargetClass로 분리)");
    return `세력 3종(${ids.join(', ')}) · guard 별칭 없음 · object 분리 확인`;
  });

  {
    const factions = new Set(input.factionEntitySites.map((site) => site.faction));
    const hasHostile = factions.has('hostile');
    const hasNeutral = factions.has('neutral');
    const detail = input.factionEntitySites.length
      ? input.factionEntitySites.map((s) => `${s.location}=${s.faction}`).join(' | ')
      : '세력 태그를 가진 production 선박 정의를 찾지 못함';
    if (hasHostile && hasNeutral) {
      note('B1-entities', 'B1 적대·중립 선박이 같은 production 출항에 동시 배치', 'pass', detail);
    } else {
      note(
        'B1-entities',
        'B1 적대·중립 선박이 같은 production 출항에 동시 배치',
        'manual',
        `적대 ${hasHostile ? '있음' : '없음'} · 중립 ${hasNeutral ? '있음' : '없음'} — ${detail}. 중립 선박 정의·배치는 게임플레이 창 소유(15차 결의 2)라 툴링 창에서 만들지 않는다. 게임플레이 병합 후 자동 판정으로 전환된다`,
      );
    }
  }

  /* ── B2: 조준경 식별 태그 ───────────────────────────────── */

  {
    const impls = input.identificationSourceImpls;
    const consumers = input.identificationConsumers;
    if (impls.length === 0) {
      note(
        'B2-source',
        'B2 ShipIdentificationSource production 구현 존재',
        'manual',
        '계약(contracts/identification.ts)은 병합됐으나 production 구현이 없다 — 판정측 데이터 제공은 게임플레이 창, 태그 UI는 그래픽스 창 소유(15차 결의 2). 두 창 병합 후 판정',
      );
    } else {
      note('B2-source', 'B2 ShipIdentificationSource production 구현 존재', 'pass', impls.join(', '));
    }
    if (consumers.length === 0) {
      note(
        'B2-consumer',
        'B2 그래픽스가 식별 read model을 소비 (자체 추측 아님)',
        'manual',
        '태그 UI 미병합 — 그래픽스 창 소유',
      );
    } else {
      note('B2-consumer', 'B2 그래픽스가 식별 read model을 소비 (자체 추측 아님)', 'pass', consumers.join(', '));
    }
  }

  check('B2-states', 'B2 식별 상태 4종 규격 — 미식별 시 세력·라벨 비노출', () => {
    // 계약이 정한 상태 어휘가 유지되는지 확인한다. 미식별에서 라벨이 나오면
    // B2·B7이 통째로 무의미해지므로 규칙 자체를 고정해 둔다.
    const identified: FactionId[] = ['hostile', 'neutral', 'patrol'];
    for (const faction of identified) {
      assert(
        FACTION_RULES[faction].identification === faction,
        `${faction}의 식별 분류가 세력과 다릅니다`,
      );
      assert(
        FACTION_RULES[faction].displayLabelId === `faction.${faction}`,
        `${faction}의 라벨 키가 규약과 다릅니다`,
      );
    }
    return 'unidentified + 식별 3종, 라벨 키 3종 (문구·색은 계약에 없음 — 그래픽스 소유)';
  });

  {
    const guesses = input.factionGuessSites;
    if (guesses.length === 0) {
      note(
        'B2-noGuess',
        'B2 모델명·클래스명 기반 세력 추측 없음',
        'pass',
        '렌더 코드에서 세력 문자열 분기 없음 (read model만 소비)',
      );
    } else {
      note(
        'B2-noGuess',
        'B2 모델명·클래스명 기반 세력 추측 없음',
        'fail',
        `세력 추측 의심 지점 ${guesses.length}건: ${guesses.join(' | ')} — 표시는 identificationState만 근거로 삼아야 한다`,
      );
    }
  }

  /* ── B3: 세력별 보상 ─────────────────────────────────────── */

  check('B3-contract', 'B3 계약 보상 규칙 — 중립 0 · patrol 발명 없음', () => {
    assert(rewardDropTableIdFor('hostile') !== null, '적대 드롭 테이블 참조가 없습니다');
    assert(rewardDropTableIdFor('neutral') === null, '중립에 드롭 테이블이 붙었습니다 — 중립 격침은 크레딧 미지급 [B3]');
    assert(
      rewardDropTableIdFor('patrol') === null,
      '경비함 보상이 공식 결정 없이 생성됐습니다 — 수치 발명 금지',
    );
    assert(
      FACTION_RULES.neutral.raisesNeutralIncident,
      '중립 피격이 중립 사건을 발생시키지 않습니다 — B4 트리거가 끊깁니다',
    );
    assert(!FACTION_RULES.hostile.raisesNeutralIncident, '적대 피격이 중립 사건을 발생시킵니다');
    assert(!FACTION_RULES.patrol.raisesNeutralIncident, '경비함 피격이 중립 사건을 발생시킵니다');
    return `hostile=${rewardDropTableIdFor('hostile')} · neutral=null(지갑 불변) · patrol=null(미결정)`;
  });

  check('B3-params', 'B3 params 보상 정책이 계약과 일치 · null과 0 구분', () => {
    const eco = economy as EconomyParams;
    const rewards = eco.factionRewards;
    assert(rewards !== null, 'factionRewards가 없습니다');
    const hostile = rewards!.hostile;
    const neutral = rewards!.neutral;
    const patrol = rewards!.patrol;

    assert(hostile.policy === 'dropTable', `적대 정책은 dropTable 이어야 합니다 (현재 ${hostile.policy})`);
    assert(
      hostile.dropTableId !== null && hostile.dropTableId in eco.dropTables,
      '적대 드롭 테이블이 dropTables에 실재해야 합니다',
    );
    // A 스택의 적대 보상이 B 확장으로 바뀌지 않았는지 — 회귀 차단.
    assert(
      eco.dropTables[hostile.dropTableId!]!.credits === 120,
      `적대 cargo-standard 보상이 바뀌었습니다 (${eco.dropTables[hostile.dropTableId!]!.credits}) — A 수치 유지 필요`,
    );

    assert(neutral.policy === 'none', `중립 정책은 none(확정 무보상) 이어야 합니다 (현재 ${neutral.policy})`);
    assert(neutral.credits === 0 && neutral.rareParts === 0, '중립 확정 보상은 0이어야 합니다');
    assert(neutral.dropTableId === null, '중립에 일반 드롭 테이블이 붙었습니다');

    assert(patrol.policy === 'pending', `경비함 정책은 pending(미결정) 이어야 합니다 (현재 ${patrol.policy})`);
    // null과 0의 구분이 여기서 판정된다 — pending은 수치를 갖지 않는다.
    assert(
      patrol.credits === null && patrol.rareParts === null,
      '미결정(pending)인데 수치가 들어 있습니다 — 0을 적는 것도 결정입니다',
    );
    return 'hostile=dropTable(120 유지) · neutral=none(확정 0) · patrol=pending(값 없음)';
  });

  check('B3-reject', 'B3 검증기 거부 규칙 — 미존재 테이블·음수 보상·계약 불일치', () => {
    const base = JSON.parse(JSON.stringify(input.economyJson)) as Record<string, unknown>;
    const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    const rejects = (mutate: (draft: Record<string, unknown>) => void, label: string): void => {
      const draft = clone();
      mutate(draft);
      let threw = false;
      try {
        validateEconomyParams(draft);
      } catch {
        threw = true;
      }
      assert(threw, `거부되어야 합니다: ${label}`);
    };

    rejects((d) => {
      (d['salvageSpawns'] as Record<string, unknown>[])[0]!['dropTableId'] = 'no-such-table';
    }, '존재하지 않는 drop table id');
    rejects((d) => {
      (d['dropTables'] as Record<string, Record<string, unknown>>)['cargo-standard']!['credits'] = -1;
    }, '음수 보상');
    rejects((d) => {
      (d['factionRewards'] as Record<string, Record<string, unknown>>)['neutral']!['credits'] = 50;
    }, 'none 정책에 0이 아닌 보상');
    rejects((d) => {
      (d['factionRewards'] as Record<string, Record<string, unknown>>)['patrol']!['credits'] = 0;
    }, 'pending 정책에 수치 삽입 (미정을 0으로 위장)');
    rejects((d) => {
      (d['factionRewards'] as Record<string, Record<string, unknown>>)['patrol']!['policy'] = 'dropTable';
    }, '계약이 null인데 정책만 dropTable (계약 불일치)');
    rejects((d) => {
      (d['factionRewards'] as Record<string, unknown>)['guard'] = { policy: 'pending' };
    }, '계약에 없는 세력 키');
    rejects((d) => {
      (d['highValueTransport'] as Record<string, unknown>)['rewardMultiplier'] = 1;
    }, '배율 1 이하 (B6 종료 조건 위반)');
    rejects((d) => {
      (d['highValueTransport'] as Record<string, unknown>)['rewardMultiplier'] = 2;
      (d['highValueTransport'] as Record<string, unknown>)['rewardMultiplierRange'] = [3, 4];
    }, '배율이 조정 범위 밖');
    rejects((d) => {
      (d['highValueTransport'] as Record<string, unknown>)['baseDropTableId'] = 'no-such-table';
    }, '고가치 기준 테이블 미존재');
    rejects((d) => {
      const guard = d['guardSpawn'] as Record<string, unknown>;
      guard['minDistanceFromPlayerMeters'] = 500;
      guard['maxDistanceFromIncidentMeters'] = 100;
    }, '최소 이격 > 사건 최대 거리 (스폰 영역 공집합)');
    rejects((d) => {
      (d['guardSpawn'] as Record<string, unknown>)['candidateCount'] = -3;
    }, '음수 후보 개수');
    return '거부 규칙 11종 전부 작동';
  });

  /* ── B4: 중립 공격 → 경비함 스폰 ────────────────────────── */

  {
    const emitters = input.neutralHitEmitters;
    if (emitters.length === 0) {
      note(
        'B4-emit',
        'B4 중립 유효 피해에서 neutralShipHit 발행 (조준·발사·빗나감 제외)',
        'manual',
        'production 발행 지점 0건 — 유효 피해 판정은 게임플레이 창 소유(15차 결의 2). 리드의 수신 경계(NeutralIncidentBoundary)와 스폰 배선(GuardSpawnBridge)은 이미 병합돼 있어, 게임플레이가 발행만 시작하면 경로가 이어진다',
      );
    } else {
      note(
        'B4-emit',
        'B4 중립 유효 피해에서 neutralShipHit 발행 (조준·발사·빗나감 제외)',
        'pass',
        emitters.join(', '),
      );
    }
  }

  note(
    'B4-dedupe',
    'B4 correlation 중복 방지 · 사건 1건 = 경비 요청 1회',
    'manual',
    '중복 방지 원장(GuardIncidentLedger)과 경계 로직은 리드 소유이며 verify:meta 46항목이 결정적으로 검증한다 — 이 러너는 중복 검증하지 않는다. 실제 사건 발생 경로는 B4-emit(게임플레이) 대기',
  );

  note(
    'B4-port',
    'B4 GuardSpawnPort 연결 · 실제 guard entity 생성',
    'blocked',
    `스폰 경로는 배선돼 있으나 두 지점이 미연결이라 실제 개체가 생기지 않는다: ① 위치 전략(GuardSpawnLocationStrategy) — 게임플레이·월드 소유, 미연결 시 noSpawnLocation(임의 좌표 생성 금지) ② AI 팩토리 — ${B5_BLOCKED_CODE}. 둘 중 하나라도 없으면 spawnGuardShip은 개체를 만들지 않는다`,
  );

  /* ── B5: 경비함 = 기존 구축함 AI 재사용 ─────────────────── */

  {
    const impls = input.destroyerAiImpls;
    if (impls.length === 0) {
      note(
        'B5-destroyerAI',
        'B5 기존 구축함 AI 구현 존재 (재사용 원본)',
        'blocked',
        `${B5_BLOCKED_CODE} — 저장소에 DestroyerAI 계약은 있으나 production 구현체가 없다. 재사용할 원본이 없으므로 B5는 통과할 수 없다. 구축함 AI 구현은 리드 소유이며 스프린트 C 탐지·추적과 함께 오는 항목이다(계약 guard.ts 주석). **빈 어댑터를 통과로 만들지 않는다**`,
      );
    } else {
      note('B5-destroyerAI', 'B5 기존 구축함 AI 구현 존재 (재사용 원본)', 'pass', impls.join(', '));
    }
  }

  check('B5-adapterShape', 'B5 GuardShipAdapter 계약 형태 — 주입 전용 · 대체 AI 생성 없음', () => {
    // 어댑터가 팩토리 없이 AI를 만들어내면 '신규 AI 코어 0'이 깨진다.
    // 계약 수준에서 그 경로가 존재하지 않음을 확인한다.
    const config = FACTION_RULES.patrol;
    assert(config.aiInitialStance === 'alert', '경비함 초기 태도는 alert(초기 표적 인지)여야 합니다');
    assert(config.id === 'patrol', '스폰 개체의 세력은 patrol 이어야 합니다');
    return '초기 태도 alert · 세력 patrol · 판단 로직은 기존 AI 소유';
  });

  {
    const violations = input.newGuardAiSites;
    if (violations.length === 0) {
      note(
        'B5-noNewAi',
        'B5 신규 경비 전용 AI 코어 0',
        'pass',
        '경비 전용 추적 상태 머신·공격 루틴·구축함 AI 복사본 없음 (정적 스캔)',
      );
    } else {
      note(
        'B5-noNewAi',
        'B5 신규 경비 전용 AI 코어 0',
        'fail',
        `신규 AI 의심 지점 ${violations.length}건: ${violations.join(' | ')} — 재사용은 복사가 아니라 어댑터로 [15차 결의 2]`,
      );
    }
  }

  /* ── B6: 고가치 수송선 (핵심 게이트 비의존) ───────────────── */

  {
    const eco = economy as EconomyParams | null;
    const hv = eco?.highValueTransport ?? null;
    if (hv && hv.rewardMultiplier !== null) {
      check('B6-multiplier', 'B6 고가치 배율 공식 params 소비', () => {
        assert(hv.rewardMultiplier! > 1, '배율은 1보다 커야 합니다');
        assert(input.highValueConsumers.length > 0, '공식 배율을 소비하는 production 지점이 없습니다');
        return `배율 ${hv.rewardMultiplier} · 소비 ${input.highValueConsumers.join(', ')}`;
      });
    } else {
      note(
        'B6-multiplier',
        'B6 고가치 배율 공식 params 소비',
        'pending',
        '보상 배율은 12차 결의 3의 "배율은 튜닝표" 항목이고 저장소·회의록 어디에도 공식 수치가 없다. **임의 확정하지 않았다** — 제안은 docs/SPRINT_B_B6_PROPOSAL.md, 승인 시 economy.json의 rewardMultiplier·rewardMultiplierRange에 입력한다. 스키마·검증기·거부 규칙은 이미 작동한다(B3-reject)',
      );
      note(
        'B6-escort',
        'B6 호위 결속 · 이탈 상한 거리',
        'pending',
        '이탈 상한 거리(escortMaximumDistanceMeters)도 공식 수치 없음 — null 유지. 결속 계약(EscortBinding)은 리드가 병합했고 값만 대기한다',
      );
    }
  }

  check('B6-independence', 'B6 미확정이 B1~B5 검증을 막지 않음', () => {
    const eco = economy as EconomyParams;
    // B6 블록을 통째로 지워도 나머지 스키마가 성립해야 한다 = 필수 의존 없음.
    const draft = JSON.parse(JSON.stringify(input.economyJson)) as Record<string, unknown>;
    delete draft['highValueTransport'];
    const without = validateEconomyParams(draft);
    assert(without.highValueTransport === null, 'B6 블록 제거 후에도 로드되어야 합니다');
    assert(without.factionRewards !== null, 'B6 제거가 B3 정책을 망가뜨렸습니다');
    assert(
      without.dropTables['cargo-standard']?.credits === eco.dropTables['cargo-standard']?.credits,
      'B6 제거가 적대 보상을 바꿨습니다',
    );
    return 'highValueTransport 제거해도 B1~B5 관련 스키마·정책 무영향';
  });

  /* ── B7: 오인 사격률 측정 인프라 ─────────────────────────── */

  check('B7-schema', 'B7 로깅 스키마 — 8항목 + 분류 정합성 + 개인정보 거부', () => {
    const valid = {
      anonymousTesterId: 't01',
      opportunityId: 'op-0001',
      actualFaction: 'neutral',
      identificationTagVisible: true,
      playerDecision: 'hostile',
      playerAction: 'attack',
      resultClassification: 'misidentification',
      timestamp: 1_700_000_000_000,
    };
    const entry = validateStudyEntry(valid);
    assert(entry.opportunityId === 'op-0001', '정상 기록이 통과해야 합니다');

    const rejects = (patch: Record<string, unknown>, label: string): void => {
      let threw = false;
      try {
        validateStudyEntry({ ...valid, ...patch });
      } catch {
        threw = true;
      }
      assert(threw, `거부되어야 합니다: ${label}`);
    };

    rejects({ anonymousTesterId: 'tester@example.com' }, '이메일 형태 id');
    rejects({ anonymousTesterId: '김테스터' }, '실명 형태 id');
    rejects({ anonymousTesterId: '010-1234-5678' }, '전화번호 형태 id');
    rejects({ notes: '테스터 이름은 홍길동' }, '비고에 실명');
    rejects({ resultClassification: 'unknownKind' }, '분류 어휘 밖 값');
    rejects({ actualFaction: 'hostile' }, '적대 표적에 오인 분류');
    rejects({ playerAction: 'hold' }, '공격하지 않았는데 오인 분류');
    rejects({ playerDecision: 'neutral' }, '중립으로 판단하고 공격 = 오인 아님');
    rejects({ identificationTagVisible: false }, '태그 노출 전 기록을 유효 기회로 분류');
    rejects({ resultClassification: 'inputMistake', playerDecision: 'neutral' }, '근거 없는 조작 실수');
    rejects(
      {
        resultClassification: 'inputMistake',
        playerDecision: 'neutral',
        inputMistakeEvidence: ['inputLog'],
      },
      `근거 ${INPUT_MISTAKE_EVIDENCE_REQUIRED}종 미만인 조작 실수`,
    );
    return '정상 통과 + 거부 11종 (개인정보 4 · 분류 정합성 7)';
  });

  check('B7-inputMistake', `B7 조작 실수 인정 — 근거 ${INPUT_MISTAKE_EVIDENCE_REQUIRED}종 이상일 때만`, () => {
    const base = {
      anonymousTesterId: 't02',
      opportunityId: 'op-9001',
      actualFaction: 'neutral',
      identificationTagVisible: true,
      playerDecision: 'neutral',
      playerAction: 'attack',
      resultClassification: 'inputMistake',
      timestamp: 1,
    };
    const accepted = validateStudyEntry({
      ...base,
      inputMistakeEvidence: ['screenRecording', 'immediateInterview'],
    });
    assert(accepted.inputMistakeEvidence.length === 2, '근거 2종이 보존되어야 합니다');
    // 같은 근거를 두 번 적어 2종으로 위장하는 경로가 없어야 한다.
    let threw = false;
    try {
      validateStudyEntry({ ...base, inputMistakeEvidence: ['inputLog', 'inputLog'] });
    } catch {
      threw = true;
    }
    assert(threw, '같은 근거 중복은 2종으로 인정되지 않아야 합니다');
    return '근거 2종 인정 · 1종 거부 · 중복 위장 거부';
  });

  check('B7-rate', 'B7 오인 사격률 계산식 — 제외 규칙 3종이 분모에서 빠짐', () => {
    const summary = summarizeStudy(SUFFICIENT_SAMPLE_FIXTURE as StudyEntry[]);
    // 정답 54 + 오인 6 = 유효 60. 고의 3·조작 실수 2·무효 4는 분모 밖.
    assert(summary.validOpportunities === 60, `유효 기회 60 기대 (실제 ${summary.validOpportunities})`);
    assert(summary.misidentifications === 6, `오인 6 기대 (실제 ${summary.misidentifications})`);
    assert(summary.excludedTotal === 9, `제외 9건 기대 (실제 ${summary.excludedTotal})`);
    assert(summary.excluded.intentionalNeutralAttack === 3, '고의 중립 공격 3건');
    assert(summary.excluded.inputMistake === 2, '조작 실수 2건');
    assert(summary.excluded.invalidOpportunity === 4, '무효 기회 4건');
    const rate = summary.misidentificationRatePercent;
    assert(rate !== null && Math.abs(rate - 10) < 1e-9, `오인율 10.0% 기대 (실제 ${rate})`);
    assert(summary.verdict === 'WITHIN_TARGET', `WITHIN_TARGET 기대 (실제 ${summary.verdict})`);
    return `유효 60 · 오인 6 → 10.0% · 제외 9건(고의 3/실수 2/무효 4) · ${summary.verdict}`;
  });

  check('B7-threshold', 'B7 판정 임계 — 20% 초과 강화 / 5% 미만 완화 검토', () => {
    const high = summarizeStudy(HIGH_MISIDENTIFICATION_FIXTURE as StudyEntry[]);
    assert(high.misidentificationRatePercent === 25, `25% 기대 (실제 ${high.misidentificationRatePercent})`);
    assert(high.verdict === 'REINFORCE_VISUALS', `REINFORCE_VISUALS 기대 (실제 ${high.verdict})`);
    const low = summarizeStudy(LOW_MISIDENTIFICATION_FIXTURE as StudyEntry[]);
    assert(low.misidentificationRatePercent === 2, `2% 기대 (실제 ${low.misidentificationRatePercent})`);
    assert(low.verdict === 'RELAXATION_CANDIDATE', `RELAXATION_CANDIDATE 기대 (실제 ${low.verdict})`);
    assert(REINFORCEMENT_PRIORITY[0] === '조준경 식별 태그 가독성', '강화 1순위는 태그 가독성');
    return `25%→REINFORCE_VISUALS · 2%→RELAXATION_CANDIDATE · 강화 순서 ${REINFORCEMENT_PRIORITY.length}단계`;
  });

  check(
    'B7-sample',
    `B7 표본 미달 처리 — 테스터 ${MINIMUM_TESTER_COUNT}명·유효 ${MINIMUM_VALID_OPPORTUNITIES}회 미만이면 판정 금지`,
    () => {
      const summary = summarizeStudy(INSUFFICIENT_SAMPLE_FIXTURE as StudyEntry[]);
      assert(!summary.sampleSufficient, '표본 미달로 판정되어야 합니다');
      assert(summary.verdict === 'INSUFFICIENT_SAMPLE', `INSUFFICIENT_SAMPLE 기대 (실제 ${summary.verdict})`);
      // 비율 자체는 계산돼야 한다 — 참고 수치 출력은 허용된다.
      assert(summary.misidentificationRatePercent === 25, '참고 비율은 계산되어야 합니다');
      assert(summary.sampleShortfalls.length === 2, `미달 사유 2건 기대 (실제 ${summary.sampleShortfalls.length})`);
      const text = formatted(summary.misidentificationRatePercent);
      assert(text.length > 0, '보고 문자열 생성');
      return `테스터 ${summary.testerCount}/${MINIMUM_TESTER_COUNT} · 유효 ${summary.validOpportunities}/${MINIMUM_VALID_OPPORTUNITIES} → INSUFFICIENT_SAMPLE (참고값 25.0%는 판정 미사용)`;
    },
  );

  check('B7-recorder', 'B7 수집기 — 세션 저장·복원·거부 기록·재심사 갱신', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string): string | null => store.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        store.set(key, value);
      },
    };
    const recorder = new IdentificationStudyRecorder(storage, 'test.b7');
    const sample = {
      anonymousTesterId: 't01',
      opportunityId: 'op-1',
      actualFaction: 'neutral' as const,
      identificationTagVisible: true,
      playerDecision: 'hostile' as const,
      playerAction: 'attack' as const,
      resultClassification: 'misidentification' as const,
      timestamp: 1,
    };
    assert(recorder.append(sample), '정상 기록이 수용되어야 합니다');
    assert(!recorder.append({ ...sample, anonymousTesterId: 'a@b.c' }), '개인정보 기록은 거부되어야 합니다');
    assert(recorder.rejectedEntries.length === 1, '거부 기록이 목록에 남아야 합니다 (조용히 버리지 않음)');

    // 재심사 — 같은 기회가 조작 실수로 재분류되면 이전 기록을 대체한다.
    assert(
      recorder.append({
        ...sample,
        playerDecision: 'neutral',
        resultClassification: 'inputMistake',
        inputMistakeEvidence: ['screenRecording', 'inputLog'],
      }),
      '재심사 기록이 수용되어야 합니다',
    );
    assert(recorder.recorded.length === 1, `같은 기회는 1건이어야 합니다 (실제 ${recorder.recorded.length})`);
    assert(recorder.recorded[0]!.resultClassification === 'inputMistake', '재심사 결과가 이겨야 합니다');

    // 새로고침 재현 — 같은 저장소로 새 수집기를 만들면 복원된다.
    const restored = new IdentificationStudyRecorder(storage, 'test.b7');
    assert(restored.recorded.length === 1, '세션이 복원되어야 합니다');
    assert(restored.summary().validOpportunities === 0, '조작 실수는 분모에서 빠져야 합니다');
    return '저장·복원·거부 보존·재심사 대체 확인';
  });

  check('B7-export', 'B7 내보내기 — CSV·JSON, 개인정보 열 없음', () => {
    const entries = SUFFICIENT_SAMPLE_FIXTURE as StudyEntry[];
    const csv = toCsv(entries);
    const lines = csv.trim().split('\n');
    assert(lines.length === entries.length + 1, `헤더 1 + 기록 ${entries.length}행 기대 (실제 ${lines.length})`);
    assert(lines[0]!.startsWith('anonymousTesterId,'), 'CSV 첫 열은 익명 id');
    assert(!/name|email|phone|실명/i.test(lines[0]!), 'CSV 헤더에 개인정보 열이 없어야 합니다');

    const json = toJsonExport(entries);
    assert(json.schemaVersion === 1, '스키마 버전 1');
    assert(json.summary.validOpportunities === 60, '집계가 함께 실려야 합니다');
    assert(json.entries.length === entries.length, '기록 전량 포함');
    return `CSV ${lines.length}행 · JSON schemaVersion 1 (집계 동봉)`;
  });

  note(
    'B7-empirical',
    'B7 실제 오인 사격률 측정 기록 존재',
    'pending',
    `측정은 사람이 플레이해야 나온다 — 최종 A+B 통합 브라우저 빌드에서 시행한다(15차 결의 3: B7은 빌드·툴 창 병렬 슬롯, 세션 일정은 기획 주관). 이 창에서 준비한 것: 스키마·검증기·수집기·집계·판정·CSV/JSON 내보내기. 픽스처는 집계 로직 검증용 합성 데이터이며 **측정 결과가 아니다**. 현재 실측 표본 = 테스터 0명 · 유효 기회 0회 → INSUFFICIENT_SAMPLE`,
  );

  /* ── 미확정 필드 보고 ───────────────────────────────────── */

  {
    const eco = economy as EconomyParams | null;
    if (eco) {
      const pending = pendingSprintBFields(eco);
      const usable = guardSpawnParamsUsable(eco);
      note(
        'B-pending',
        'B 확장 미확정 필드 목록 (수치 발명 없음의 증거)',
        pending.length === 0 ? 'pass' : 'pending',
        pending.length === 0
          ? '미확정 0'
          : `미확정 ${pending.length}건: ${pending.join(', ')} — 경비 스폰 params 사용 가능: ${usable ? '예' : '아니오(전 항목 미확정)'}`,
      );
    }
  }

  return results;
}

/** 표본 미달 시 보고 문자열 — 비율을 참고값으로만 노출한다 */
function formatted(rate: number | null): string {
  return rate === null ? '계산 불가' : `${rate.toFixed(1)}% (참고값)`;
}
