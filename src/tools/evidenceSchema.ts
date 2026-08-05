/**
 * M1·M2 Closure production evidence — 결과 봉투(envelope)와 판정 어휘.
 *
 * 브라우저 러너(`scripts/evidence-*.mjs`)가 산출하는 JSON의 **순수 검증부**다.
 * 러너와 분리해 둬야 하는 이유:
 *  - 러너를 돌리지 않고도 `verify:tooling`이 스키마·판정 규칙을 자체 테스트한다
 *  - "실행하지 않은 항목을 빈 PASS로 만들지 않는다"를 **코드가** 강제한다
 *
 * 어휘 (Runtime Closure 7상태와 같은 태도):
 *  - `pass`      실제 production 경로를 완주해 기대와 일치
 *  - `fail`      완주했는데 기대와 다르다 (production 결함)
 *  - `blocked`   production 경로가 아직 없어 관측 자체가 불가
 *  - `harness`   production은 판정 불가이고 **하네스 한계**로 못 본 것
 *  - `notRun`    아직 돌리지 않음 — pass도 fail도 아니다
 *  - `manual`    사람 눈이 필요해 자동 판정하지 않는다
 *
 * `harness`와 `blocked`를 나누는 이유가 이 파일의 핵심이다. 하네스가 못 본
 * 것을 production 결함으로 적으면 없는 버그를 만들고, 반대로 production
 * 결함을 하네스 한계로 적으면 있는 버그를 덮는다. 둘 다 금지다.
 */

export type EvidenceStatus = 'pass' | 'fail' | 'blocked' | 'harness' | 'notRun' | 'manual';

/** 자동 판정으로 "충족됨"을 주장할 수 있는 상태는 pass 하나뿐이다 */
export const SATISFYING_STATUSES: readonly EvidenceStatus[] = ['pass'];

export interface EvidenceItem {
  readonly id: string;
  readonly label: string;
  readonly status: EvidenceStatus;
  /** 무엇을 관측했는가 — 상태의 근거. 비어 있으면 스키마 위반 */
  readonly detail: string;
  /** 관측한 실제 값 (기대와 대조 가능해야 한다) */
  readonly observed?: Readonly<Record<string, unknown>>;
  readonly expected?: Readonly<Record<string, unknown>>;
}

/** 모든 러너 결과에 반드시 실리는 실행 맥락 */
export interface EvidenceEnvelope {
  readonly runner: string;
  readonly baseSha: string;
  readonly headSha: string;
  /** production 진입에 fixture가 장착됐는가 — true면 production 증거가 아니다 */
  readonly fixtureLoaded: boolean;
  /** 진입 URL의 쿼리 문자열. production 경로는 반드시 빈 문자열 */
  readonly urlQuery: string;
  readonly browserVersion: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly pointerLockErrors: readonly string[];
  /**
   * opt-in production 프로필(Playwright storageState) 메타데이터.
   * **raw cookies·localStorage 값과 전체 경로는 싣지 않는다** — 재현에 필요한
   * 최소 식별 정보(해시·파일명·origin 수·출처)만 남긴다.
   * 기존 결과와의 호환을 위해 optional이며, 없으면 빈 context로 본다.
   */
  readonly profile?: EvidenceProfile;
  readonly items: readonly EvidenceItem[];
}

export interface EvidenceProfile {
  readonly storageStateLoaded: boolean;
  readonly storageStateSha256: string | null;
  readonly storageStateFileName: string | null;
  readonly storageStateOriginCount: number;
  readonly provenance: string | null;
}

/** 빈 context(프로필 미사용) 기본값 */
export const EMPTY_EVIDENCE_PROFILE: EvidenceProfile = {
  storageStateLoaded: false,
  storageStateSha256: null,
  storageStateFileName: null,
  storageStateOriginCount: 0,
  provenance: null,
};

export class EvidenceSchemaError extends Error {}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new EvidenceSchemaError(`${field}: 비어 있지 않은 문자열이어야 합니다 (받은 값: ${JSON.stringify(value)})`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new EvidenceSchemaError(`${field}: 문자열 배열이어야 합니다`);
  }
  return value as string[];
}

const STATUSES: readonly string[] = ['pass', 'fail', 'blocked', 'harness', 'notRun', 'manual'];

/**
 * 봉투 검증 — 맥락 필드가 하나라도 빠지면 거부한다.
 * 맥락 없는 결과는 "어느 커밋에서 무엇을 어떻게 봤는지" 알 수 없어 증거가 아니다.
 */
export function validateEnvelope(raw: unknown): EvidenceEnvelope {
  if (typeof raw !== 'object' || raw === null) {
    throw new EvidenceSchemaError('결과는 객체여야 합니다');
  }
  const o = raw as Record<string, unknown>;

  requireString(o['runner'], 'runner');
  requireString(o['baseSha'], 'baseSha');
  requireString(o['headSha'], 'headSha');
  requireString(o['browserVersion'], 'browserVersion');

  for (const field of ['startedAt', 'finishedAt']) {
    const v = requireString(o[field], field);
    if (!ISO.test(v)) throw new EvidenceSchemaError(`${field}: ISO-8601 타임스탬프여야 합니다`);
  }

  if (typeof o['fixtureLoaded'] !== 'boolean') {
    throw new EvidenceSchemaError('fixtureLoaded: boolean이어야 합니다 (미관측을 false로 적지 않는다)');
  }
  if (typeof o['urlQuery'] !== 'string') {
    throw new EvidenceSchemaError('urlQuery: 문자열이어야 합니다 (쿼리 없음은 빈 문자열)');
  }

  const vp = o['viewport'] as Record<string, unknown> | undefined;
  if (!vp || typeof vp['width'] !== 'number' || typeof vp['height'] !== 'number') {
    throw new EvidenceSchemaError('viewport: {width, height} 숫자여야 합니다');
  }

  requireStringArray(o['consoleErrors'], 'consoleErrors');
  requireStringArray(o['pageErrors'], 'pageErrors');
  requireStringArray(o['pointerLockErrors'], 'pointerLockErrors');

  // profile은 optional이지만, 있으면 형태를 강제하고 **raw 값이 섞이지
  // 않았는지** 확인한다 — cookies·localStorage는 증적에 실리면 안 된다.
  const profile = o['profile'];
  if (profile !== undefined) {
    if (typeof profile !== 'object' || profile === null) {
      throw new EvidenceSchemaError('profile: 객체여야 합니다');
    }
    const p = profile as Record<string, unknown>;
    if (typeof p['storageStateLoaded'] !== 'boolean') {
      throw new EvidenceSchemaError('profile.storageStateLoaded: boolean이어야 합니다');
    }
    if (typeof p['storageStateOriginCount'] !== 'number') {
      throw new EvidenceSchemaError('profile.storageStateOriginCount: 숫자여야 합니다');
    }
    for (const key of ['cookies', 'origins', 'localStorage', 'path']) {
      if (key in p) {
        throw new EvidenceSchemaError(`profile.${key}: raw storage 값·전체 경로는 증적에 싣지 않는다`);
      }
    }
    if (p['storageStateLoaded'] === true) {
      const sha = p['storageStateSha256'];
      if (typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha)) {
        throw new EvidenceSchemaError('profile.storageStateSha256: 프로필 사용 시 64자리 SHA-256이어야 합니다');
      }
      if (typeof p['provenance'] !== 'string' || p['provenance'].trim() === '') {
        throw new EvidenceSchemaError('profile.provenance: 프로필 사용 시 출처가 필요합니다');
      }
      if (typeof p['storageStateFileName'] !== 'string') {
        throw new EvidenceSchemaError('profile.storageStateFileName: 프로필 사용 시 basename이 필요합니다');
      }
    }
  }

  const items = o['items'];
  if (!Array.isArray(items) || items.length === 0) {
    throw new EvidenceSchemaError('items: 최소 1건이어야 합니다 (빈 결과를 증거로 두지 않는다)');
  }
  const seen = new Set<string>();
  for (const item of items as Record<string, unknown>[]) {
    const id = requireString(item['id'], 'items[].id');
    if (seen.has(id)) throw new EvidenceSchemaError(`items[].id 중복: ${id}`);
    seen.add(id);
    requireString(item['label'], `items[${id}].label`);
    const status = item['status'];
    if (typeof status !== 'string' || !STATUSES.includes(status)) {
      throw new EvidenceSchemaError(`items[${id}].status: ${STATUSES.join('|')} 중 하나여야 합니다 (받은 값: ${String(status)})`);
    }
    requireString(item['detail'], `items[${id}].detail`);
  }

  return raw as EvidenceEnvelope;
}

/**
 * production 증거로 인정 가능한 봉투인가.
 * fixture가 장착됐거나 쿼리 플래그로 진입했으면 **production 증거가 아니다** —
 * 개별 항목이 pass여도 전체를 증거로 승격하지 않는다.
 */
export function isProductionEvidence(env: EvidenceEnvelope): { ok: boolean; reason: string } {
  if (env.fixtureLoaded) {
    return { ok: false, reason: 'fixture가 장착된 실행 — production 증거로 쓰지 않는다' };
  }
  if (env.urlQuery !== '') {
    return { ok: false, reason: `진입 URL에 쿼리 파라미터가 있다(${env.urlQuery}) — production 경로가 아니다` };
  }
  // storageState 사용은 **fixture가 아니다** — 실제 production 플레이로 만든
  // browser save를 재사용한 것이므로 fixtureLoaded와 별개로 다룬다.
  const pf = env.profile;
  if (pf?.storageStateLoaded) {
    return {
      ok: true,
      reason:
        `fixture 미장착 · 쿼리 없는 production 진입 · production 프로필 재사용` +
        `(${pf.storageStateFileName} sha256=${pf.storageStateSha256?.slice(0, 12)}… ` +
        `provenance=${pf.provenance}) — 프로필 로드만으로 clues 3/3을 가정하지 않는다`,
    };
  }
  return { ok: true, reason: 'fixture 미장착 · 쿼리 없는 production 진입' };
}

/**
 * 항목이 "충족됨"을 주장하는가. `notRun`·`blocked`·`harness`는 절대 충족이
 * 아니다 — 이 함수가 빈 PASS를 막는 마지막 관문이다.
 */
export function isSatisfied(item: EvidenceItem): boolean {
  return SATISFYING_STATUSES.includes(item.status);
}

export interface EvidenceSummary {
  readonly counts: Readonly<Record<EvidenceStatus, number>>;
  /** production 증거로 인정되는가 */
  readonly productionEvidence: boolean;
  readonly productionEvidenceReason: string;
  /** 관측된 오류 총합 */
  readonly errorCount: number;
  /** 모든 항목이 pass이고 오류 0이며 production 진입일 때만 true */
  readonly allSatisfied: boolean;
  readonly unsatisfied: readonly string[];
}

export function summarize(env: EvidenceEnvelope): EvidenceSummary {
  const counts = { pass: 0, fail: 0, blocked: 0, harness: 0, notRun: 0, manual: 0 };
  for (const item of env.items) counts[item.status] += 1;

  const prod = isProductionEvidence(env);
  const errorCount =
    env.consoleErrors.length + env.pageErrors.length + env.pointerLockErrors.length;
  const unsatisfied = env.items.filter((i) => !isSatisfied(i)).map((i) => `${i.id}(${i.status})`);

  return {
    counts,
    productionEvidence: prod.ok,
    productionEvidenceReason: prod.reason,
    errorCount,
    allSatisfied: prod.ok && errorCount === 0 && unsatisfied.length === 0,
    unsatisfied,
  };
}

/* ═══ EC12 locked-path PASS 판정 ═══════════════════════════════ */

/**
 * EC12 locked terminal transition 관측치. **14개 조건 전부**를 충족할 때만
 * PASS다 — Pointer Lock이 null이라는 사실 하나로는 PASS가 아니고, DEBRIEF에
 * 도달하지 못한 실행도 PASS가 아니다.
 */
export interface Ec12LockedObservation {
  readonly urlQuery: string;
  readonly fixtureLoaded: boolean;
  /** 실제 canvas 클릭으로 얻은 잠금 대상 id */
  readonly lockAfterCanvasClick: string | null;
  /** 실제 production 적 피해 건수 (hullDamaged) */
  readonly hullDamagedCount: number;
  readonly playerDestroyed: number;
  readonly sortieFailed: number;
  /** 치명 피해 직전의 잠금 대상 */
  readonly lockBeforeLethal: string | null | undefined;
  /** DEBRIEF 이후의 잠금 대상 */
  readonly lockAfterDebrief: string | null | undefined;
  readonly resumeOverlayVisible: boolean;
  readonly aiming: boolean;
  /** 실제 신뢰 입력으로 BUTTON을 눌렀는가 */
  readonly confirmClickTrusted: boolean | undefined;
  readonly confirmClickTarget: string;
  readonly reachedBase: boolean;
  readonly settlementCount: number;
  readonly saveRequestedCount: number;
  readonly errorCount: number;
}

export interface Ec12Verdict {
  readonly status: EvidenceStatus;
  /** 충족하지 못한 조건 목록 — 비어야 PASS */
  readonly unmet: readonly string[];
  readonly detail: string;
}

/**
 * `blocked`·`harness`·`manual`·`notRun`·`fail`은 충족 상태가 아니다.
 * 조건을 하나라도 못 채우면 PASS를 내지 않는다.
 */
/**
 * EC12 조건 술어 목록 — **개수를 하드코딩하지 않기 위해** 배열로 둔다.
 * 문서·콘솔·테스트는 전부 `EC12_CONDITIONS.length`를 읽는다.
 */
export const EC12_CONDITIONS: readonly {
  readonly id: string;
  readonly unmet: (o: Ec12LockedObservation) => string | null;
}[] = [
  { id: 'urlQuery', unmet: (o) => (o.urlQuery === '' ? null : `urlQuery 비어 있지 않음(${o.urlQuery})`) },
  { id: 'fixture', unmet: (o) => (o.fixtureLoaded ? 'fixtureLoaded=true' : null) },
  { id: 'canvasLock', unmet: (o) => (o.lockAfterCanvasClick === 'game-canvas' ? null : '실제 canvas 클릭 잠금 미획득') },
  { id: 'damage', unmet: (o) => (o.hullDamagedCount > 0 ? null : '실제 production 적 피해 0건') },
  { id: 'destroyed', unmet: (o) => (o.playerDestroyed === 1 ? null : `playerDestroyed=${o.playerDestroyed} (1이어야 함)`) },
  { id: 'sortieFailed', unmet: (o) => (o.sortieFailed === 1 ? null : `sortieFailed=${o.sortieFailed} (1이어야 함)`) },
  {
    id: 'lockBeforeLethal',
    // 미관측(undefined)을 정상으로 넘기지 않는다 — 명확한 불충족으로 바꾼다.
    unmet: (o) =>
      o.lockBeforeLethal === 'game-canvas'
        ? null
        : `치명 피해 직전 잠금이 canvas가 아님(${o.lockBeforeLethal === undefined ? '미관측' : String(o.lockBeforeLethal)})`,
  },
  {
    id: 'lockAfterDebrief',
    unmet: (o) =>
      o.lockAfterDebrief === null
        ? null
        : `DEBRIEF 이후 잠금이 남음(${o.lockAfterDebrief === undefined ? '미관측' : String(o.lockAfterDebrief)})`,
  },
  { id: 'overlay', unmet: (o) => (o.resumeOverlayVisible ? 'resume overlay 표시됨' : null) },
  { id: 'aiming', unmet: (o) => (o.aiming ? 'aiming 잔류' : null) },
  { id: 'trustedClick', unmet: (o) => (o.confirmClickTrusted === true ? null : '확인 클릭이 trusted 입력으로 관측되지 않음') },
  { id: 'clickTarget', unmet: (o) => (o.confirmClickTarget === 'BUTTON' ? null : `확인 클릭 대상이 BUTTON이 아님(${o.confirmClickTarget})`) },
  { id: 'base', unmet: (o) => (o.reachedBase ? null : 'BASE 미복귀') },
  { id: 'settlement', unmet: (o) => (o.settlementCount === 1 ? null : `settlement=${o.settlementCount} (1이어야 함)`) },
  { id: 'save', unmet: (o) => (o.saveRequestedCount === 1 ? null : `saveRequested=${o.saveRequestedCount} (1이어야 함)`) },
  { id: 'errors', unmet: (o) => (o.errorCount === 0 ? null : `오류 ${o.errorCount}건`) },
];

/** 조건 개수 — 문서·콘솔이 이 값을 읽어 코드와 어긋나지 않게 한다 */
export const EC12_CONDITION_COUNT = EC12_CONDITIONS.length;

/**
 * `blocked`·`harness`·`manual`·`notRun`·`fail`은 충족 상태가 아니다.
 * 조건을 하나라도 못 채우면 PASS를 내지 않는다.
 */
export function judgeEc12LockedPath(o: Ec12LockedObservation): Ec12Verdict {
  const unmet = EC12_CONDITIONS.map((c) => c.unmet(o)).filter((u): u is string => u !== null);

  if (unmet.length > 0) {
    // 보스 미생성처럼 경로 자체에 도달하지 못한 경우는 러너 커버리지 문제다.
    const precondition = o.hullDamagedCount === 0 && o.playerDestroyed === 0;
    return {
      status: precondition ? 'blocked' : 'fail',
      unmet,
      detail: precondition
        ? `BLOCKED_RUNNER_PRECONDITION_NOT_REACHED — ${EC12_CONDITION_COUNT}개 조건 중 미충족 ${unmet.length}건: ${unmet.join(' · ')}`
        : `${EC12_CONDITION_COUNT}개 조건 중 미충족 ${unmet.length}건: ${unmet.join(' · ')}`,
    };
  }
  return {
    status: 'pass',
    unmet: [],
    detail:
      `EC12 locked terminal transition ${EC12_CONDITION_COUNT}개 조건 전부 충족 — ` +
      `hullDamaged ${o.hullDamagedCount}회 · lock game-canvas → null · trusted BUTTON click · ` +
      'BASE · settlement/save 각 1 · 오류 0',
  };
}

/* ═══ 치명 피해 clamp 분류 ═══════════════════════════════════════ */

/** hullDamaged 1건의 **절대** 선체 관측 (비율이 아니다) */
export interface HullDamageSample {
  readonly amount: number;
  /** 피해 적용 **후**의 절대 선체 */
  readonly currentHullAfter: number | null;
  /** 피해 적용 **전**의 절대 선체 (after + amount로 복원 가능) */
  readonly currentHullBefore: number | null;
  readonly maxHull: number | null;
  readonly lastDamageSource: string | null;
}

/**
 * 피해량 분류. **절대 선체로만 판단한다** — `hullRemaining`은 0~1 비율이라
 * `amount`(절대값)와 직접 비교하면 성립하지 않는다(12 vs 0.10).
 *
 * 치명타에서 적용량이 직전 절대 선체와 같으면 `applyDamage()`의 clamp
 * (`appliedDamage = min(rawDamage, currentHull)`) 결과이므로 **raw 공격 종류를
 * 확정하지 않는다** — amount 12를 폭뢰 near 12로 분류하지 않는다.
 * 18·30도 직접 이벤트가 없어 추론이므로 `INFERRED_` 접두사를 붙인다.
 */
export function classifyHullDamage(s: HullDamageSample): string {
  const before = s.currentHullBefore ?? (s.currentHullAfter !== null ? s.currentHullAfter + s.amount : null);
  if (s.currentHullAfter === 0 && before !== null && s.amount === before) {
    return 'LETHAL_ENEMY_WEAPON_DAMAGE_CLAMPED_TO_REMAINING_HULL';
  }
  if (s.amount === 18) return 'INFERRED_PROJECTILE_FROM_DAMAGE_18';
  if (s.amount === 30) return 'INFERRED_RAM_FROM_DAMAGE_30';
  return `INFERRED_UNKNOWN_FROM_DAMAGE_${s.amount}`;
}
