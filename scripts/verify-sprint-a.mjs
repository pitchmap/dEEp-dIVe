#!/usr/bin/env node
/**
 * 스프린트 A 인수 검증 러너 (npm run verify:sprint-a).
 *
 * 하나의 명령으로 자동 검증 가능한 A1~A8 항목 + 문서 회귀 검사(§8)를 돌리고,
 * **브라우저·타 창 병합 후에만 판정 가능한 항목은 '수동 확인 필요' 구역으로
 * 분리 출력**한다 (회의 14 결의 3: 판정은 dev 통합 빌드에서, 가짜 초록불 금지).
 *
 * 종료 코드: 자동 항목에 실패가 하나라도 있으면 1, 없으면 0.
 * (manual 항목은 종료 코드에 영향을 주지 않지만 목록으로 반드시 출력한다.)
 */

import { registerHooks } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
const readJson = (relative) => JSON.parse(readFileSync(path.join(projectRoot, relative), 'utf8'));

// ── §8 문서 회귀 검사 — 회의록 원문은 역사 기록으로 별도 분류 ──────
const FORBIDDEN_PHRASES = [
  '잠망경 심도 전용',
  '잠망경 심도에서만',
  '조준 시 자동 부상',
  '조준 진입 시 수면으로',
  'periscope depth only',
  'aim only at periscope depth',
];
/** 역사 기록 — 수정 대상이 아님 (회의록 원문·마스터 플랜은 게이트 전 수정 금지) */
const HISTORICAL_PREFIXES = ['docs/meetings/', 'docs/deep_dive_master_plan.md'];
/** 검사기 자신의 금지어 목록 — 자기 참조는 위반이 아니다 */
const SELF_REFERENCE_FILES = [
  'scripts/verify-sprint-a.mjs',
  'src/tools/__verification__/verifySprintA.ts',
];
const SCAN_EXTENSIONS = new Set(['.md', '.ts', '.tsx', '.mjs', '.js', '.json', '.css', '.html']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.github']);

function scanFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      scanFiles(full, acc);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      acc.push(full);
    }
  }
  return acc;
}

function docRegressionScan() {
  const offenders = [];
  const historical = [];
  for (const file of scanFiles(projectRoot)) {
    const relative = path.relative(projectRoot, file);
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      for (const phrase of FORBIDDEN_PHRASES) {
        if (!line.includes(phrase)) continue;
        const record = `${relative}:${index + 1} "${phrase}"`;
        if (SELF_REFERENCE_FILES.includes(relative)) continue;
        if (HISTORICAL_PREFIXES.some((prefix) => relative.startsWith(prefix))) historical.push(record);
        else offenders.push(record);
      }
    });
  }
  return { offenders, historical };
}

// ── 남은 provisional 경제·장비 파일 목록 (A8) ────────────────────
/** 경제·장비·화물·업그레이드 범위만 A8 대상 — 전투 임시값은 C9([COMBAT]) 소속 */
const A8_PROVISIONAL_SCOPE = /econom|equip|cargo|upgrade/i;

function provisionalEconomyFiles() {
  const found = [];
  const srcDir = path.join(projectRoot, 'src');
  if (!statSync(srcDir, { throwIfNoEntry: false })) return found;
  for (const file of scanFiles(srcDir)) {
    const relative = path.relative(projectRoot, file);
    const base = path.basename(file).toLowerCase();
    if (!base.startsWith('provisional')) continue;
    if (A8_PROVISIONAL_SCOPE.test(base)) found.push(relative);
  }
  return found;
}

/**
 * production 코드가 아직 provisional 경제 모듈을 import하는 지점 정적 스캔 (A8).
 *
 * 제외: provisional 파일 자기들끼리의 import(이미 파일 목록으로 집계됨),
 * `__verification__` 하위(테스트 코드는 production 소비 경로가 아님).
 */
function provisionalEconomyImports() {
  const found = [];
  const srcDir = path.join(projectRoot, 'src');
  if (!statSync(srcDir, { throwIfNoEntry: false })) return found;
  const importPattern = /from\s+['"]([^'"]*provisional[^'"]*)['"]/gi;
  for (const file of scanFiles(srcDir)) {
    const relative = path.relative(projectRoot, file);
    if (path.extname(file) !== '.ts') continue;
    if (path.basename(file).toLowerCase().startsWith('provisional')) continue;
    if (relative.includes('__verification__')) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(importPattern)) {
        const specifier = match[1];
        if (!A8_PROVISIONAL_SCOPE.test(path.basename(specifier))) continue;
        found.push(`${relative}:${index + 1} → ${specifier}`);
      }
    });
  }
  return found;
}

const { runSprintAVerification } = await import('../src/tools/__verification__/verifySprintA.ts');

let results;
try {
  results = runSprintAVerification({
    aimingJson: readJson('params/aiming.json'),
    upgradesJson: readJson('params/upgrades.json'),
    equipmentJson: readJson('params/equipment.json'),
    economyJson: readJson('params/economy.json'),
    cargoJson: readJson('params/cargo.json'),
    paramsRoot: {
      movement: readJson('params/movement.json'),
      detection: readJson('params/detection.json'),
      combat: readJson('params/combat.json'),
      crew: readJson('params/crew.json'),
      economy: readJson('params/economy.json'),
      cargo: readJson('params/cargo.json'),
    },
    docRegression: docRegressionScan(),
    provisionalFiles: provisionalEconomyFiles(),
    provisionalImports: provisionalEconomyImports(),
  });
} catch (error) {
  console.error('✖ 스프린트 A 검증 실행 자체가 실패했습니다:', error);
  process.exit(1);
}

const auto = results.filter((r) => r.status !== 'manual');
const manual = results.filter((r) => r.status === 'manual');

console.log('=== 스프린트 A 자동 검증 ===');
let failures = 0;
for (const { id, name, status, detail } of auto) {
  if (status === 'fail') failures += 1;
  console.log(`${status === 'pass' ? '✔' : '✖'} [${id}] ${name} — ${detail}`);
}
console.log(`\n자동 항목: ${auto.length - failures}/${auto.length} 통과`);

console.log('\n=== 수동·후속 확인 필요 (자동 판정 불가 — 종료 코드 미반영) ===');
for (const { id, name, detail } of manual) {
  console.log(`◻ [${id}] ${name}\n    → ${detail}`);
}
console.log(`\n수동 항목: ${manual.length}건`);

if (failures > 0) {
  console.error(`\n✖ 스프린트 A 자동 검증 실패 ${failures}건 — A 통과 판정 불가.`);
  process.exit(1);
}
console.log('\n✅ 자동 검증 전 항목 통과. 수동 항목은 dev 통합 빌드에서 판정하세요.');
