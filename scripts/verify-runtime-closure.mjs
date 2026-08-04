#!/usr/bin/env node
/**
 * M1·M2 Runtime Closure 검증 러너 (npm run verify:runtime-closure).
 *
 * 기준: `docs/M1_M2_RUNTIME_CLOSURE_HANDOFF.md` / INT-CORE-022.
 *
 * ## CI 실패 규칙
 *
 * `fail`만 종료 코드 1이다. `blocked`·`unwired`·`blockedByNullParam`은
 * **병렬 개발 중 정상 상태**이므로 CI를 실패시키지 않는다 — 그래픽스 world
 * 파일과 Game.ts production 배선이 아직 없는 것은 툴링 잘못이 아니다.
 * 대신 상태 JSON에 남겨 통합 단계에서 게이트가 읽는다.
 *
 * production Exit gate는 최종 통합에서만 강제한다.
 */

import { registerHooks, createRequire } from 'node:module';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(readFileSync(path.join(projectRoot, rel), 'utf8'));
const readText = (rel) => {
  const full = path.join(projectRoot, rel);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
};

const GAME_TS = readText('src/core/Game.ts') ?? '';
/** 주석 줄을 제거한 Game.ts — "주석만 있는 배선"을 pass로 세지 않기 위해서다 */
const GAME_TS_CODE = GAME_TS.split('\n')
  .map((line, index) => ({ line, index }))
  .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line));

/** production 호출 지점 탐색 — 주석 제외, 파일 전체 이어붙여 멀티라인 대응 */
function callSites(pattern) {
  const hits = [];
  const body = GAME_TS_CODE.map(({ line }) => line).join('\n');
  const lineIndex = GAME_TS_CODE.map(({ index }) => index);
  const re = new RegExp(pattern, 'g');
  let m;
  while ((m = re.exec(body)) !== null) {
    const lineNo = body.slice(0, m.index).split('\n').length - 1;
    hits.push(`src/core/Game.ts:${(lineIndex[lineNo] ?? 0) + 1}`);
  }
  return hits;
}

const fileExists = (rel) => existsSync(path.join(projectRoot, rel));

// ── params 로더 (툴링 공식) ────────────────────────────────────
const { validateInteractionParams } = await import('../src/tools/interactionParams.ts');
const { validateSonarParams } = await import('../src/tools/sonarParams.ts');
const { validateEconomyParams } = await import('../src/tools/economyMath.ts');
// 보스는 **리드 공식 로더를 재사용**한다 — 툴링이 재구현하지 않는다.
const { validateBossParams } = await import('../src/config/bossParams.ts');
const { runRuntimeClosureVerification, assertClueMapping } = await import(
  '../src/tools/__verification__/verifyRuntimeClosure.ts'
);
const clueFixtures = await import('../src/tools/__verification__/clueMappingFixture.ts');

const interaction = validateInteractionParams(readJson('params/interaction.json'));
const sonar = validateSonarParams(readJson('params/sonar.json'));
const economy = validateEconomyParams(readJson('params/economy.json'));
const bossJson = readJson('params/boss.json');
const boss = validateBossParams(bossJson);

// ── clue mapping 정본 (그래픽스 산출물 — 없을 수 있다) ─────────
const CLUE_MODULE_REL = 'src/world/bossCluePlacements.ts';
let cluePlacements = null;
let cluePlacementsAbsenceReason = null;
if (!fileExists(CLUE_MODULE_REL)) {
  cluePlacementsAbsenceReason = `${CLUE_MODULE_REL} 미존재 (그래픽스 PR 대기)`;
} else {
  try {
    const mod = await import(`../${CLUE_MODULE_REL}`);
    // 공식 정본 export 이름은 `CLUE_ID_BY_INTERACTABLE` 하나다 (INT-CORE-022 / PR #16).
    // 이전 구현이 `..._ID` 접미사와 camelCase를 찾고 있어 정본이 도착해도
    // '매핑을 찾지 못함'으로 빠질 수 있었다 — 정본 이름으로 정정한다.
    const mapping = mod.CLUE_ID_BY_INTERACTABLE ?? null;
    const placements = mod.BOSS_CLUE_PLACEMENTS ?? null;
    if (!mapping || !placements) {
      cluePlacementsAbsenceReason =
        `${CLUE_MODULE_REL}는 있으나 정본 export를 찾지 못함 — ` +
        `CLUE_ID_BY_INTERACTABLE=${mapping ? '있음' : '없음'}, BOSS_CLUE_PLACEMENTS=${placements ? '있음' : '없음'} ` +
        `(실제 export: ${Object.keys(mod).join(', ') || '없음'})`;
    } else {
      cluePlacements = { clueIdByInteractableId: mapping, placements };
    }
  } catch (error) {
    cluePlacementsAbsenceReason = `${CLUE_MODULE_REL} 로드 실패: ${String(error).slice(0, 160)}`;
  }
}

// ── 계약 정적 관측 ────────────────────────────────────────────
const eventsSrc = readText('src/contracts/events.ts') ?? '';
const sonarSrc = readText('src/contracts/sonar.ts') ?? '';
const metaSrc = readText('src/contracts/meta.ts') ?? '';

/**
 * 문자열 리터럴 union을 해석한다. **별칭을 한 단계 따라간다** — 계약이
 * `type A = B` 형태로 다른 파일의 union을 재사용하는 경우가 있어(예:
 * SonarExplorationBlipKind = InteractionTargetKind), 인라인 리터럴만 보면
 * 실제 계약이 멀쩡한데도 거짓 실패가 난다.
 */
function resolveUnion(name, sources) {
  for (const src of sources) {
    const m = new RegExp(`type\\s+${name}\\s*=([^;]+);`).exec(src);
    if (!m) continue;
    const body = m[1];
    const literals = [...body.matchAll(/'([^']+)'/g)].map((x) => x[1]);
    if (literals.length > 0) return literals;
    // 별칭 — 참조된 이름을 한 번 더 해석한다.
    const aliases = [...body.matchAll(/\b([A-Z]\w+)\b/g)].map((x) => x[1]);
    const out = [];
    for (const alias of aliases) {
      if (alias === name) continue;
      out.push(...resolveUnion(alias, sources));
    }
    if (out.length > 0) return out;
  }
  return [];
}

function bossHitObservation() {
  const m = /bossHit:\s*\{([^}]*)\}/.exec(eventsSrc);
  if (!m) return { kinds: [], keys: [] };
  const bodyText = m[1];
  const keys = [...bodyText.matchAll(/(\w+)\s*:/g)].map((x) => x[1]);
  const kindDecl = /kind\s*:\s*([^;]+)/.exec(bodyText);
  const kinds = kindDecl ? [...kindDecl[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  return { kinds, keys };
}

function sonarBlipKinds() {
  const sources = [sonarSrc, metaSrc];
  const kinds = new Set();
  for (const name of ['SonarCombatBlipKind', 'SonarExplorationBlipKind']) {
    for (const k of resolveUnion(name, sources)) kinds.add(k);
  }
  return [...kinds];
}

/**
 * `interactionCollected` payload 키. 이벤트 맵이 인라인 객체가 아니라
 * 명명 타입(`InteractionCollectedEvent`, contracts/meta.ts)을 가리키고,
 * 그 타입은 다시 **discriminated union**(clue 분기 / 비-clue 분기)이다.
 * 인라인만 보거나 첫 분기만 읽으면 계약이 멀쩡한데 거짓 실패한다 —
 * 전 분기의 키를 합쳐서 읽는다.
 */
function interactionCollectedKeys() {
  const inline = /interactionCollected:\s*\{([^}]*)\}/.exec(eventsSrc);
  if (inline) return [...inline[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]);
  const named = /interactionCollected:\s*([A-Z]\w+)\s*;/.exec(eventsSrc);
  if (!named) return [];
  const body = unionBody(named[1]);
  if (!body) return [];
  return [...new Set([...body.matchAll(/readonly\s+(\w+)\s*[?:]/g)].map((x) => x[1]))];
}

/** 명명 타입의 본문 전체 (union 분기 포함)를 잘라 온다 */
function unionBody(typeName) {
  const m = new RegExp(`export\\s+(?:type|interface)\\s+${typeName}\\s*=?([\\s\\S]*?)\\n\\n`).exec(metaSrc);
  return m ? m[1] : null;
}

/**
 * 비-clue 분기가 `clueId?: never`로 clueId를 **타입 수준에서** 금지하는지.
 * 런타임 검사보다 강한 보장이라 이 문구가 사라지면 회귀로 본다.
 */
function nonClueClueIdForbidden() {
  const named = /interactionCollected:\s*([A-Z]\w+)\s*;/.exec(eventsSrc);
  if (!named) return false;
  const body = unionBody(named[1]) ?? '';
  return /clueId\?:\s*never/.test(body);
}

/** bossWeakPointChanged를 **발행**하는 production 지점 (구독 제외) */
function weakPointProducerSites() {
  const hits = [];
  const walk = (dir) => {
    for (const entry of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'dist'].includes(entry.name)) continue;
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        const rel = path.relative(projectRoot, full);
        if (rel.includes('__verification__') || rel.startsWith(path.join('src', 'contracts'))) continue;
        readFileSync(full, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (/^\s*(\/\/|\*)/.test(line)) return;
            if (/\.emit\(\s*'bossWeakPointChanged'/.test(line)) hits.push(`${rel}:${i + 1}`);
          });
      }
    }
  };
  walk(path.join(projectRoot, 'src'));
  return hits;
}

// ── save migration 실측 (실제 코드 실행) ──────────────────────
const { SAVE_MIGRATIONS, migrateToCurrent } = await import('../src/meta/save/migrations.ts');
const { validateSaveData, CURRENT_SCHEMA_VERSION } = await import('../src/meta/save/saveSchema.ts');

function v1Save(cluesFound, unlocked) {
  return {
    schemaVersion: 1,
    credits: 0,
    rareParts: 0,
    upgradeLevels: {},
    equippedGear: [],
    progress: { bossCluesFound: cluesFound, bossUnlocked: unlocked, bossDefeated: false },
    settings: { keyboardLockNoticeShown: false },
  };
}

function migrationCase(label, cluesFound, unlocked) {
  const migrated = migrateToCurrent(v1Save(cluesFound, unlocked));
  // 재저장 = 검증을 다시 통과시켜 정책이 유지되는지 본다.
  const revalidated = validateSaveData(JSON.parse(JSON.stringify(migrated)));
  return {
    label,
    legacyCount: cluesFound,
    legacyUnlocked: unlocked,
    resultCollected: migrated.progress.bossCluesCollected,
    resultUnlocked: migrated.progress.bossUnlocked,
    afterResaveCollected: revalidated.progress.bossCluesCollected,
    afterResaveUnlocked: revalidated.progress.bossUnlocked,
  };
}

let unknownClueHandled = false;
let unknownClueDetail = '';
try {
  const withUnknown = migrateToCurrent(v1Save(1, false));
  withUnknown.progress.bossCluesCollected = ['clue-does-not-exist'];
  const revalidated = validateSaveData(JSON.parse(JSON.stringify(withUnknown)));
  // 스키마는 문자열 id를 받아들이고, 미지 id 차단은 최종 방어(스토어) 몫이다.
  unknownClueHandled = Array.isArray(revalidated.progress.bossCluesCollected);
  unknownClueDetail = `스키마 통과 후 스토어 unknownClue 방어에 위임 (수집=${revalidated.progress.bossCluesCollected.join(',')})`;
} catch (error) {
  unknownClueHandled = true;
  unknownClueDetail = `스키마 단계에서 거부: ${String(error).slice(0, 120)}`;
}

let downgradeRejected = false;
try {
  migrateToCurrent({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
} catch {
  downgradeRejected = true;
}

const saveMigration = {
  cases: [
    migrationCase('legacy 0 · 미해금', 0, false),
    migrationCase('legacy 3 · 미해금', 3, false),
    migrationCase('legacy 5 (>3) · 미해금', 5, false),
    migrationCase('legacy 0 · **해금됨** (단조성)', 0, true),
    migrationCase('legacy 7 · 해금됨', 7, true),
  ],
  unknownClueHandled,
  unknownClueDetail,
  downgradeRejected,
};

// ── KeyQ = 액티브 소나 핑 정합 관측 ──────────────────────────
/** src/ 전체를 훑되 production/fixture를 구분한다 */
function scanSources(predicate, { includeVerification = false } = {}) {
  const hits = [];
  const walk = (dir) => {
    for (const entry of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'dist'].includes(entry.name)) continue;
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        const rel = path.relative(projectRoot, full);
        const isVerification = rel.includes('__verification__');
        if (isVerification && !includeVerification) continue;
        readFileSync(full, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (/^\s*(\/\/|\*)/.test(line)) return;
            if (predicate(line, rel)) hits.push(`${rel}:${i + 1}`);
          });
      }
    }
  };
  walk(path.join(projectRoot, 'src'));
  return hits;
}

const isFixturePath = (rel) => /[Ff]ixture|[Dd]emo/.test(rel);

function activePingKeyObservation() {
  const consumeAll = scanSources((l) => /consumeActivePingPressed\s*\(/.test(l));
  const requestAll = scanSources((l) => /requestActivePing\s*\(/.test(l));
  const keyQAll = scanSources((l) => /'KeyQ'|"KeyQ"/.test(l));
  const helpAll = scanSources((l, rel) => rel.endsWith(path.join('ui', 'controlsConfig.ts')) && /KeyQ|\bQ\b/.test(l));
  // 충돌: KeyQ가 액티브 핑이 아닌 다른 명령에 묶인 지점
  const conflicts = keyQAll.filter((site) => {
    const [rel, lineNo] = site.split(':');
    const line = readFileSync(path.join(projectRoot, rel), 'utf8').split('\n')[Number(lineNo) - 1] ?? '';
    return !/ping|Ping|sonar|Sonar/.test(line);
  });
  return {
    consumeApiSites: consumeAll.filter((s) => !isFixturePath(s)),
    requestApiSites: requestAll.filter((s) => !isFixturePath(s)),
    keyQBindingSites: keyQAll.filter((s) => !isFixturePath(s) && !conflicts.includes(s)),
    keyQConflictSites: conflicts.filter((s) => !isFixturePath(s)),
    controlsHelpSites: helpAll,
    repeatGuardTestSites: scanSources(
      (l) => /repeat/i.test(l) && /ping/i.test(l),
      { includeVerification: true },
    ),
    cooldownRejectTestSites: scanSources(
      (l) => /cooldown/i.test(l) && /(reject|거부|불가)/i.test(l),
      { includeVerification: true },
    ),
    fixtureOnlySites: [...consumeAll, ...requestAll, ...keyQAll].filter(isFixturePath),
  };
}

// ── HANDOFF §5 16단계 배선 관측 ───────────────────────────────
const WIRING = [
  { step: 1, id: 'officialParams', label: '공식 params loader 결과 생성', impl: true, pattern: 'loadBossParams\\(' },
  { step: 2, id: 'toolingLoaders', label: '툴링 params 로더(interaction·sonar·farming) 호출', impl: true, pattern: 'loadInteractionParams\\(|loadSonarParams\\(' },
  { step: 3, id: 'clueSource', label: 'world clue placement 소비', impl: fileExists(CLUE_MODULE_REL), pattern: 'bossCluePlacements|BOSS_CLUE_PLACEMENTS' },
  { step: 4, id: 'clueIds', label: 'clue mapping source 주입 (attachClueIds)', impl: fileExists(CLUE_MODULE_REL), pattern: 'attachClueIds\\(' },
  { step: 5, id: 'bossPlacement', label: 'world boss placement 소비', impl: fileExists('src/world/bossPlacement.ts'), pattern: 'bossPlacement|BOSS_PLACEMENT' },
  { step: 6, id: 'bossEncounter', label: 'BossEncounter 연결 (createBoss)', impl: fileExists('src/systems/boss/BossEncounter.ts'), pattern: '\\.createBoss\\(' },
  { step: 7, id: 'bossController', label: 'BossController 생성', impl: fileExists('src/core/BossController.ts'), pattern: 'new BossController\\(' },
  { step: 8, id: 'bossMotionPort', label: 'BossMotionPort 연결', impl: true, pattern: 'bossMotionPort' },
  { step: 9, id: 'bossAttackPort', label: 'BossAttackPort 연결', impl: true, pattern: 'bossAttackPort' },
  { step: 10, id: 'bossDamageSink', label: 'BossDamageSink 연결', impl: true, pattern: 'attachBossDamageSink\\(' },
  { step: 11, id: 'weakPointTarget', label: 'BossWeakPointTarget 등록', impl: fileExists('src/systems/BossWeakPointTarget.ts'), pattern: 'BossWeakPointTarget|weakPointPlacement' },
  { step: 12, id: 'interactables', label: 'interactable source 연결', impl: fileExists('src/systems/interaction/InteractionSystem.ts'), pattern: 'attachInteractables\\(' },
  { step: 13, id: 'sonarProvider', label: 'SonarScope provider 연결 (contacts·params)', impl: fileExists('src/systems/sonar/SonarScopeSystem.ts'), pattern: 'attachSonarContacts\\(|attachSonarScopeParams\\(', nullParam: true },
  { step: 14, id: 'sonarRender', label: 'SonarScope render consumer 연결', impl: fileExists('src/render/SonarScope.ts'), pattern: 'attachSonarScopeSource\\(' },
  { step: 15, id: 'bossView', label: 'BossCoreView render consumer 연결', impl: fileExists('src/core/BossController.ts'), pattern: 'attachBossViewSource\\(' },
  { step: 16, id: 'bossSpawn', label: 'boss spawn·victory·sortieFailed·reset 사슬', impl: true, pattern: '\\.spawnBoss\\(' },
];

const wiring = WIRING.map((w) => ({
  step: w.step,
  id: w.id,
  label: w.label,
  implementationPresent: w.impl,
  productionCallSites: callSites(w.pattern),
  ...(w.nullParam ? { blockedByNullParam: !sonar.activePingWired && !sonar.passiveBearingWired } : {}),
}));

// ── 실행 ──────────────────────────────────────────────────────
let output;
try {
  output = runRuntimeClosureVerification({
    interaction,
    sonar,
    economyFarming: economy.farming
      ? {
          sectorCapRatioValue: economy.farming.sectorCapRatioOfCombatAverage.value,
          combatRewardAverageValue: economy.farming.combatRewardAverageCredits.value,
          capComputable: economy.farming.capComputable,
        }
      : null,
    boss,
    cluePlacements,
    cluePlacementsAbsenceReason,
    bossUnlockClueIds: bossJson.unlock?.clueIds ?? [],
    // [M1M2-INITIAL] 사용자 승인 초기값 — 검증기가 기대값을 들고 대조한다.
    approvedBossValues: {
      moveSpeed: 7.0,
      turnRate: 0.6,
      ramContactDamage: 30,
      weakPointHitRadius: 6.0,
    },
    approvedValues: {
      holdSeconds: 2.0,
      interactRadiusMeters: 6.0,
      noiseContribution: 0.15,
      pingDisplaySeconds: 3.0,
      pingDetectionGaugeRise: 0.3,
      pingCooldownSeconds: 25,
      passiveBearingSpread: 0.45,
      sectorCapRatio: 0.4,
      combatRewardAverage: 120,
      derivedSectorCapCredits: 48,
    },
    contracts: {
      bossHitKindUnion: bossHitObservation().kinds,
      bossHitPayloadKeys: bossHitObservation().keys,
      sonarBlipKinds: sonarBlipKinds(),
      weakPointProducerSites: weakPointProducerSites(),
      interactionCollectedKeys: interactionCollectedKeys(),
      nonClueClueIdForbidden: nonClueClueIdForbidden(),
    },
    saveMigration,
    activePingKey: activePingKeyObservation(),
    wiring,
  });
} catch (error) {
  console.error('✖ Runtime Closure 검증 실행 자체가 실패했습니다:', error);
  process.exit(1);
}

// ── verifier 자체 테스트 (픽스처) ─────────────────────────────
// 정본 파일이 없는 기간에도 '검증기가 실제로 위반을 잡는가'를 확인해야
// blocked 상태의 신뢰가 유지된다. 통과 케이스 + 위반 5종.
{
  const expected = [...clueFixtures.FIXTURE_CANONICAL_CLUE_IDS];
  const selfTests = [];
  const shouldPass = (label, mod) => {
    try {
      assertClueMapping(mod, expected);
      selfTests.push(`✔ ${label}`);
    } catch (error) {
      selfTests.push(`✖ ${label} — 통과해야 하는데 실패: ${String(error).slice(0, 120)}`);
    }
  };
  const shouldFail = (label, mod) => {
    try {
      assertClueMapping(mod, expected);
      selfTests.push(`✖ ${label} — 위반인데 통과됨`);
    } catch {
      selfTests.push(`✔ ${label}`);
    }
  };
  shouldPass('정상 매핑', clueFixtures.validClueFixture());
  shouldPass('같은 clue 다중 target (정책상 허용)', clueFixtures.multiTargetClueFixture());
  shouldFail('미지 clueId 거부', clueFixtures.unknownClueFixture());
  shouldFail('필수 clueId 누락 거부', clueFixtures.missingClueFixture());
  shouldFail('배치 정합 깨짐 거부', clueFixtures.orphanMappingFixture());
  shouldFail('non-clue 항목 거부', clueFixtures.nonClueEntryFixture());

  const failed = selfTests.filter((t) => t.startsWith('✖'));
  output.checks.push({
    id: 'C0-clueVerifierSelfTest',
    name: 'clue mapping verifier 자체 테스트 (픽스처 — 정본 부재와 무관)',
    status: failed.length === 0 ? 'pass' : 'fail',
    detail: failed.length === 0 ? `${selfTests.length}종 전부 기대대로: ${selfTests.join(' / ')}` : failed.join(' / '),
  });
  if (failed.length > 0) output.blockers.push('FAIL:C0-clueVerifierSelfTest');
}

const { checks, flags, blockers } = output;
const byStatus = (s) => checks.filter((c) => c.status === s);
const failures = byStatus('fail');

const MARK = {
  pass: '✔',
  fail: '✖',
  implemented: '◐',
  unwired: '○',
  blocked: '⛔',
  blockedByNullParam: '⏳',
  manual: '◻',
};

console.log('=== M1·M2 Runtime Closure 검증 (INT-CORE-022) ===\n');
for (const c of checks) {
  console.log(`${MARK[c.status]} [${c.status}] ${c.id} ${c.name}\n    → ${c.detail}`);
}

console.log('\n=== 상태 요약 ===');
for (const s of ['pass', 'fail', 'blockedByNullParam', 'blocked', 'unwired', 'manual']) {
  const n = byStatus(s).length;
  if (n > 0) console.log(`${s.padEnd(20)} ${n}`);
}

console.log('\n=== 플래그 ===');
for (const [k, v] of Object.entries(flags)) console.log(`${k.padEnd(44)} = ${v}`);

console.log('\n=== blockers ===');
for (const b of blockers) console.log(`  ${b}`);

// 상태 JSON — 통합 게이트가 읽는다. 개인정보·기기 식별자 없음.
const outDir = path.join(projectRoot, 'docs', 'measurements');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, 'runtime-closure-status.json'),
  `${JSON.stringify({ schemaVersion: 1, checks, flags, blockers }, null, 2)}\n`,
);

// ── 최종 Exit 강제 모드 ───────────────────────────────────────
//
// 기본(병렬 개발) CI는 blocked·unwired를 허용한다. 통합 관리자가
// production composition을 끝낸 뒤 `--enforce-exit`(또는 환경변수)로
// 실행하면 그 관용이 사라진다 — 남은 blocked·unwired·미확정 params·
// fixture 오염·미기록 manual 증거·Exit 미완료가 전부 실패다.
const ENFORCE =
  process.argv.includes('--enforce-exit') || process.env.DEEP_DIVE_ENFORCE_EXIT === '1';

if (ENFORCE) {
  const violations = [];
  for (const c of checks) {
    if (c.status === 'blocked') violations.push(`BLOCKED:${c.id}`);
    if (c.status === 'unwired') violations.push(`UNWIRED:${c.id}`);
    if (c.status === 'blockedByNullParam') violations.push(`NULL_PARAM:${c.id}`);
  }

  // 브라우저 하네스 결과를 함께 강제한다 — 정적 검증만으로 Exit를 열지 않는다.
  const browserPath = path.join(projectRoot, 'docs', 'measurements', 'runtime-closure-browser.json');
  if (!existsSync(browserPath)) {
    violations.push('BROWSER_HARNESS_NOT_RUN:runtime-closure-browser.json 없음');
  } else {
    const browser = JSON.parse(readFileSync(browserPath, 'utf8'));
    const fixtureState = browser.productionEntry?.fixtureState;
    const sensitive = new Set(browser.productionEntry?.fixtureSensitiveCriteria ?? []);
    if (fixtureState === true) violations.push('FIXTURE_LOADED:production 판정에 fixture가 섞였다');
    for (const r of browser.results ?? []) {
      if (fixtureState === 'unknown' && sensitive.has(r.id)) {
        violations.push(`FIXTURE_STATE_UNKNOWN:${r.id} — fixture 판정이 필요한 항목`);
      }
      // manual 항목은 증거 기록(evidence)이 있어야 인정한다.
      if (r.status === 'manual' && !r.evidence) violations.push(`MANUAL_EVIDENCE_MISSING:${r.id}`);
      if (r.status !== 'pass' && r.status !== 'manual') violations.push(`EXIT_INCOMPLETE:${r.id}(${r.status})`);
    }
  }

  console.log('\n=== 최종 Exit 강제 모드 (--enforce-exit) ===');
  if (violations.length === 0) {
    console.log('✅ 강제 조건 전부 충족 — Exit gate 통과 가능.');
  } else {
    console.error(`✖ 강제 모드 위반 ${violations.length}건:`);
    for (const v of violations) console.error(`  ${v}`);
    console.error('\n최종 Exit 게이트 미통과.');
    process.exit(1);
  }
}

if (failures.length > 0) {
  console.error(`\n✖ 실패 ${failures.length}건 — 계약 위반·잘못된 pass 승격·verifier 오류입니다.`);
  process.exit(1);
}
console.log(
  '\n✅ fail 0건. blocked·unwired·blockedByNullParam은 병렬 개발 중 정상 상태이며 CI를 실패시키지 않습니다.',
);
if (!ENFORCE) {
  console.log(
    '   최종 통합용 강제 모드: `npm run verify:runtime-closure -- --enforce-exit` (또는 DEEP_DIVE_ENFORCE_EXIT=1)',
  );
}
