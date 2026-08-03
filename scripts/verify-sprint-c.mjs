#!/usr/bin/env node
/**
 * 스프린트 C 인수 검증 러너 (npm run verify:sprint-c).
 *
 * 기준: `docs/SPRINT_C_HANDOFF.md`의 C 인수 manifest (리드 요구 조건).
 *
 * 종료 코드는 **툴링이 고칠 수 있는 실패**에만 반응한다:
 *   fail    → exit 1 (필수 계약·스키마·단일 경로 위반)
 *   manual  → exit 0 (게임플레이·그래픽스 미병합 — 남의 창 사정)
 *   pending → exit 0 (공식 수치·브라우저 실측 대기)
 *
 * 마지막에 상태 플래그와 blockers 배열을 출력한다. **unwired 상태를
 * C 최종 완료로 만들지 않는다** — C_FINAL_COMPLETE는 runtime 배선과
 * 브라우저 실측이 둘 다 참일 때만 true가 된다.
 */

import { registerHooks } from 'node:module';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.github']);

/** production 소스만 — 검증 코드·계약 자체는 관측 도구이지 관측 대상이 아니다 */
function productionSources() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (path.extname(entry.name) === '.ts') {
        files.push(full);
      }
    }
  };
  const src = path.join(projectRoot, 'src');
  if (!statSync(src, { throwIfNoEntry: false })) return files;
  walk(src);
  return files.filter((file) => {
    const rel = path.relative(projectRoot, file);
    return !rel.includes('__verification__') && !rel.startsWith(path.join('src', 'contracts'));
  });
}

const SOURCES = productionSources().map((file) => ({
  rel: path.relative(projectRoot, file),
  lines: readFileSync(file, 'utf8').split('\n'),
}));

/** 주석 줄은 관측에서 뺀다 — 설명문이 위반으로 잡히면 신뢰를 잃는다 */
const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);

function scan(predicate) {
  const hits = [];
  for (const { rel, lines } of SOURCES) {
    lines.forEach((line, index) => {
      if (isComment(line)) return;
      if (predicate(line, rel)) hits.push({ rel, line: index + 1, text: line.trim() });
    });
  }
  return hits;
}

const at = (hits) => hits.map((h) => `${h.rel}:${h.line}`);

// ── 계약 존재 ──────────────────────────────────────────────────
const CONTRACT_FILES = ['src/contracts/detection.ts', 'src/contracts/survival.ts'];
const CONTRACT_SYMBOLS = [
  ['DetectionHudView', 'src/contracts/detection.ts'],
  ['DetectionStageSource', 'src/contracts/detection.ts'],
  ['TrackingStateSource', 'src/contracts/detection.ts'],
  ['EnemyAttackRequest', 'src/contracts/survival.ts'],
  ['EnemyAttackPort', 'src/contracts/survival.ts'],
  ['DepthChargeDamageParams', 'src/contracts/survival.ts'],
  ['DebriefReadModel', 'src/contracts/survival.ts'],
];

function contractFiles() {
  return Object.fromEntries(CONTRACT_FILES.map((rel) => [rel, readText(rel) !== null]));
}

function contractSymbols() {
  const cache = new Map();
  return CONTRACT_SYMBOLS.map(([symbol, file]) => {
    if (!cache.has(file)) cache.set(file, readText(file) ?? '');
    const body = cache.get(file);
    const present = new RegExp(`export\\s+(interface|type|class|const)\\s+${symbol}\\b`).test(body);
    return { symbol, file, present };
  });
}

// ── 단일 피해 경로 ─────────────────────────────────────────────
/**
 * 플레이어 피해를 applyDamage 밖에서 주는 지점.
 * 플레이어 체력을 직접 깎는 표현(`playerHull.currentHull -=` 등)을 찾는다.
 */
function damageBypassSites() {
  return at(
    scan((line, rel) => {
      if (rel === path.join('src', 'core', 'PlayerHullSystem.ts')) return false;
      return /(playerHull|hull)\s*\.\s*currentHull\s*(=[^=]|[-+]=)/.test(line);
    }),
  );
}

/** PlayerHullSystem 밖에서 currentHull에 쓰는 지점 (FloodingCore·DepthChargeSystem 포함) */
function hullMutationSites() {
  return at(
    scan((line, rel) => {
      if (rel === path.join('src', 'core', 'PlayerHullSystem.ts')) return false;
      return /currentHull\w*\s*(=[^=]|\+\+|--|[-+]=)/.test(line);
    }),
  );
}

/** AI controller가 피해량·폭발 반경·쿨다운을 소유하는 것으로 의심되는 지점 */
function aiDamageOwnershipSites() {
  return at(
    scan((line, rel) => {
      if (!/AI|Ai\b/.test(path.basename(rel))) return false;
      return /(damage|Damage)\s*[:=]\s*-?\d|applyDamage\(/.test(line);
    }),
  );
}

// ── 정산 ───────────────────────────────────────────────────────
function settleSortieCallSites() {
  // MetaLoop 정산 호출만 — RunEconomy 자체 메서드 정의·내부 호출은 제외한다.
  return at(scan((line) => /\.settleSortie\(/.test(line) && !/this\.wallet\.settleSortie/.test(line)));
}

function parallelSettlementCallSites() {
  return at(scan((line) => /\.(settleDefeat|settleReturn)\s*\(/.test(line)));
}

/** retrySave 경로 안에서 정산을 다시 부르는 지점 */
function retrySaveResettleSites() {
  const hits = [];
  for (const { rel, lines } of SOURCES) {
    let inRetry = false;
    let depth = 0;
    lines.forEach((line, index) => {
      if (!inRetry && /\bretrySave\s*\(/.test(line) && /\{/.test(line)) {
        inRetry = true;
        depth = 0;
      }
      if (!inRetry) return;
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      if (!isComment(line) && /settleSortie\(|settleDefeat\(|settleReturn\(/.test(line)) {
        hits.push(`${rel}:${index + 1}`);
      }
      if (depth <= 0 && index > 0) inRetry = false;
    });
  }
  return hits;
}

// ── composition ────────────────────────────────────────────────
const GAME_TS = readText('src/core/Game.ts') ?? '';

function composition() {
  const registered = (name) => new RegExp(`registry\\.register\\(\\s*${name}`).test(GAME_TS);
  // 렌더 소비 위치는 `src/render/`와 `src/ui/` **둘 다**다 —
  // FILE_OWNERSHIP: 게임 UI(눈 아이콘·선체 계기 등)는 `src/ui/`에 둔다.
  // 스캔이 `src/render/`만 보면 실제 소비를 놓쳐 미병합으로 오판한다.
  const isRenderSurface = (rel) =>
    rel.startsWith(path.join('src', 'render')) || rel.startsWith(path.join('src', 'ui'));
  const survival = at(
    scan((line, rel) => isRenderSurface(rel) && /survivalReadModel|SurvivalReadModel/.test(line)),
  );
  const debrief = at(
    scan((line, rel) => isRenderSurface(rel) && /DebriefReadModel|debriefReadModel/.test(line)),
  );
  // 실제 attach '호출'만 센다 — 주석·타입 선언은 경계이지 호출이 아니다.
  const attachCalls = at(scan((line) => /\battachPlayerAliveSource\s*\(\s*[A-Za-z_$]/.test(line)));
  return {
    playerHullRegistered: registered('playerHull'),
    floodingCoreConnected: /new PlayerHullSystem\([^)]*floodingCore/s.test(GAME_TS),
    debriefStateRegistered: registered('debriefState'),
    saveBridgeObserved: registered('saveBridge') && /new SortieFailureCoordinator\([^)]*saveBridge/s.test(GAME_TS),
    playerAliveBoundaryPresent: /attachPlayerAliveSource/.test(GAME_TS),
    playerAliveAttachCallSites: attachCalls,
    survivalReadModelConsumers: survival,
    debriefReadModelConsumers: debrief,
  };
}

// ── params 단일 출처·픽스처 격리·상수 ──────────────────────────
const LOADER_REL = path.join('src', 'tools', 'combatParamsLoader.ts');
const SCHEMA_REL = path.join('src', 'tools', 'combatParams.ts');
/** A 시절 CombatParams 로더 — 공통 보호 파일, C9 블록은 읽지 않는다 */
const LEGACY_PARAM_LOADER_REL = path.join('src', 'config', 'ParamLoader.ts');
const C9_OWNERS = new Set([LOADER_REL, SCHEMA_REL]);

function combatJsonDirectImportSites() {
  return at(
    scan((line, rel) => {
      if (rel === LOADER_REL || rel === LEGACY_PARAM_LOADER_REL) return false;
      return /from\s+['"][^'"]*params\/combat\.json['"]/.test(line);
    }),
  );
}

/**
 * C9 필드를 **JSON에서 읽는** 두 번째 경로가 생겼는지 관측한다.
 *
 * 주의해서 볼 것 — C9 필드명이 코드에 등장하는 것 자체는 위반이 아니다.
 * `FloodingCore`·`PlayerHullSystem`은 주입받은 계약 객체
 * (`FloodingParams`·`HullBaseParams`)의 필드를 읽는 **정상 소비자**다.
 * 위반은 '주입 없이 JSON에서 직접 꺼내는 것'이므로, 스캔 범위를 A 시절
 * params 파이프라인(`src/config/**` + `contracts/params.ts`)으로 한정한다.
 * 그쪽이 C9까지 읽기 시작하면 출처가 둘로 갈라진다 — 그게 이 검사의 표적이다.
 */
function c9FieldLeakSites() {
  const pattern = new RegExp(`\\b(${C9_FIELD_NAMES.join('|')}|distanceFalloff)\\b`);
  const hits = at(
    scan((line, rel) => rel.startsWith(path.join('src', 'config')) && pattern.test(line)),
  );
  // 계약 파일은 SOURCES에서 빠져 있으므로 CombatParams 정의를 따로 본다.
  const paramsContract = readText('src/contracts/params.ts') ?? '';
  paramsContract.split('\n').forEach((line, index) => {
    if (!isComment(line) && pattern.test(line)) hits.push(`src/contracts/params.ts:${index + 1}`);
  });
  return hits;
}

function combatLoaderConsumerSites() {
  return at(scan((line, rel) => rel !== LOADER_REL && /from\s+['"][^'"]*combatParamsLoader['"]/.test(line)));
}

function fixtureImportSites() {
  return at(scan((line) => /from\s+['"][^'"]*combatParamsFixture['"]/.test(line)));
}

/**
 * C 수치를 코드 상수로 들고 있는 지점 (C9 '코드 상수 0' 조건).
 * 계약 필드명에 숫자를 직접 대입하는 표현만 본다 — 로더가 채워 넣는
 * 경로가 생기면 여기 걸린다.
 */
const C9_FIELD_NAMES = [
  'baseMaxHull',
  'damagedRatioThreshold',
  'criticalRatioThreshold',
  'directRadiusMeters',
  'nearRadiusMeters',
  'directDamage',
  'nearDamage',
  'dropCooldownSeconds',
  'directFloodingContribution',
  'nearFloodingContribution',
  'minorThreshold',
  'majorThreshold',
  'catastrophicThreshold',
  'hullDamagePerSecondAtFull',
  'spreadPerSecond',
  'gaugeDecayPerSecond',
];

function combatConstantSites() {
  const pattern = new RegExp(`\\b(${C9_FIELD_NAMES.join('|')})\\s*[:=]\\s*-?\\d`);
  return at(scan((line) => pattern.test(line)));
}

// ── 회귀 ───────────────────────────────────────────────────────
function sprintBRegression() {
  const faction = readText('src/contracts/faction.ts') ?? '';
  const guard = readText('src/contracts/guard.ts') ?? '';
  return {
    factionRulesPresent: /export const FACTION_RULES/.test(faction),
    guardContractPresent: /export interface GuardSpawnPort/.test(guard),
  };
}

function aimingProvisionalSites() {
  return at(scan((line) => /from\s+['"][^'"]*provisionalAiming['"]/.test(line)));
}

/** A 회귀는 기존 러너를 그대로 재사용한다 — 판정을 복제하지 않는다 */
function sprintARegressionOk() {
  try {
    const { execFileSync } = require('node:child_process');
    execFileSync(process.execPath, [path.join(projectRoot, 'scripts', 'verify-sprint-a.mjs')], {
      cwd: projectRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { runSprintCVerification } = await import('../src/tools/__verification__/verifySprintC.ts');

let output;
try {
  output = runSprintCVerification({
    combatJson: readJson('params/combat.json'),
    contractFiles: contractFiles(),
    contractSymbols: contractSymbols(),
    damageBypassSites: damageBypassSites(),
    hullMutationSites: hullMutationSites(),
    aiDamageOwnershipSites: aiDamageOwnershipSites(),
    settleSortieCallSites: settleSortieCallSites(),
    parallelSettlementCallSites: parallelSettlementCallSites(),
    retrySaveResettleSites: retrySaveResettleSites(),
    composition: composition(),
    combatJsonDirectImportSites: combatJsonDirectImportSites(),
    combatLoaderConsumerSites: combatLoaderConsumerSites(),
    c9FieldLeakSites: c9FieldLeakSites(),
    fixtureImportSites: fixtureImportSites(),
    combatConstantSites: combatConstantSites(),
    sprintARegressionOk: sprintARegressionOk(),
    sprintBRegression: sprintBRegression(),
    aimingProvisionalSites: aimingProvisionalSites(),
  });
} catch (error) {
  console.error('✖ 스프린트 C 검증 실행 자체가 실패했습니다:', error);
  process.exit(1);
}

const { results, status } = output;
const auto = results.filter((r) => r.status === 'pass' || r.status === 'fail');
const manual = results.filter((r) => r.status === 'manual');
const pending = results.filter((r) => r.status === 'pending');

console.log('=== 스프린트 C 자동 검증 (C9 params·단일 경로·정산·composition) ===');
let failures = 0;
for (const { id, name, status: s, detail } of auto) {
  if (s === 'fail') failures += 1;
  console.log(`${s === 'pass' ? '✔' : '✖'} [${id}] ${name} — ${detail}`);
}
console.log(`\n자동 항목: ${auto.length - failures}/${auto.length} 통과`);

const section = (title, rows, mark) => {
  console.log(`\n=== ${title} (${rows.length}건 — 종료 코드 미반영) ===`);
  for (const { id, name, detail } of rows) {
    console.log(`${mark} [${id}] ${name}\n    → ${detail}`);
  }
};
section('타 역할 미병합 — 판정 보류 (툴링 실패 아님)', manual, '◻');
section('공식 수치·브라우저 실측 대기', pending, '⏳');

console.log('\n=== C 상태 ===');
for (const key of [
  'C_CONTRACT_COMPLETE',
  'C_GAMEPLAY_COMPOSITION_PRESENT',
  'C_GRAPHICS_COMPOSITION_PRESENT',
  'C_COMBAT_PARAMS_DEFINED',
  'C_RUNTIME_WIRED',
  'C_BROWSER_EMPIRICAL_COMPLETE',
  'C_FINAL_COMPLETE',
  'C_TOOLING_READY',
]) {
  console.log(`${key.padEnd(34)} = ${status[key]}`);
}
console.log('blockers = [');
for (const blocker of status.blockers) console.log(`  ${blocker}`);
console.log(']');

if (failures > 0) {
  console.error(`\n✖ 툴링 소유 영역 실패 ${failures}건 — 필수 계약·스키마 문제입니다.`);
  process.exit(1);
}
console.log('\n✅ 툴링 소유 영역 전 항목 통과. 위 보류·대기 항목은 C 통합 미완료이며 툴링 실패가 아닙니다.');
