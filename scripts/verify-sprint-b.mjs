#!/usr/bin/env node
/**
 * 스프린트 B 종료 조건 검증 러너 (npm run verify:sprint-b).
 *
 * B는 **선행개발**이다 (15차 결의 1 — B 범위표 발효 조건 = A 통합 PR 병합).
 * 이 러너가 전부 초록이어도 B 완료 선언이 되지 않는다.
 *
 * 상태를 5종으로 나눠 출력한다:
 *   pass / fail  — 자동 판정 (종료 코드에 반영)
 *   manual       — 타 창(게임플레이·그래픽스) 미병합 → 판정 보류
 *   blocked      — 선행 구현 자체가 없음 → 통과 불가
 *   pending      — 공식 수치·실측 데이터 대기
 *
 * 종료 코드: fail이 하나라도 있으면 1. manual·blocked·pending은 0을 유지하되
 * **반드시 목록으로 출력**한다 — 숨기지 않으면서 '툴링이 고칠 수 있는 실패'와
 * '남의 영역에서 오는 대기'를 분리하기 위한 규칙이다.
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

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.github']);

/** production 소스만 스캔한다 — 검증 러너·계약 자체는 관측 대상이 아니다 */
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

/** 파일별로 (줄번호, 줄) 순회 */
function scan(predicate) {
  const hits = [];
  for (const { rel, lines } of SOURCES) {
    lines.forEach((line, index) => {
      if (predicate(line, rel)) hits.push({ rel, line: index + 1, text: line.trim() });
    });
  }
  return hits;
}

// ── B1: 세력 태그를 가진 production 선박 정의 지점 ──────────────
// `faction: 'hostile'` 같은 리터럴 배정만 센다. 타입 선언(`faction: FactionId`)은
// 정의가 아니므로 제외된다.
function factionEntitySites() {
  const pattern = /faction:\s*'(hostile|neutral|patrol)'/;
  return scan((line) => pattern.test(line)).map((hit) => ({
    location: `${hit.rel}:${hit.line}`,
    faction: pattern.exec(hit.text)[1],
  }));
}

// ── B2: 식별 read model 구현·소비 ──────────────────────────────
function identificationSourceImpls() {
  const hits = scan((line) => /implements\s+ShipIdentificationSource|:\s*ShipIdentificationSource\b/.test(line));
  return [...new Set(hits.map((h) => `${h.rel}:${h.line}`))];
}

function identificationConsumers() {
  const hits = scan(
    (line, rel) => rel.startsWith(path.join('src', 'render')) && /identificationState|identifications\b/.test(line),
  );
  return [...new Set(hits.map((h) => `${h.rel}:${h.line}`))];
}

/**
 * B2 위반 후보 — 렌더·UI가 세력 문자열로 직접 분기하는 지점.
 * `identificationState`를 근거로 쓰는 줄은 정상이므로 제외한다.
 */
function factionGuessSites() {
  const hits = scan((line, rel) => {
    if (!rel.startsWith(path.join('src', 'render')) && !rel.startsWith(path.join('src', 'ui'))) return false;
    if (/identificationState/.test(line)) return false;
    return /faction\s*===\s*'(hostile|neutral|patrol)'/.test(line);
  });
  return hits.map((h) => `${h.rel}:${h.line}`);
}

// ── B4: neutralShipHit 발행 지점 (구독 제외) ────────────────────
function neutralHitEmitters() {
  const hits = scan((line) => /\.emit\(\s*'neutralShipHit'/.test(line));
  return hits.map((h) => `${h.rel}:${h.line}`);
}

// ── B5: 구축함 AI 구현 / 신규 경비 AI 의심 지점 ─────────────────
function destroyerAiImpls() {
  const hits = scan((line) => /implements\s+DestroyerAI\b/.test(line));
  return hits.map((h) => `${h.rel}:${h.line}`);
}

/**
 * 신규 경비 전용 AI 의심 지점.
 * 어댑터(GuardShipAdapter)는 재사용 경로이므로 제외한다 — 금지 대상은
 * 'Guard' + AI/Behavior/StateMachine 조합의 **새 클래스**다.
 */
function newGuardAiSites() {
  const hits = scan((line, rel) => {
    if (rel.endsWith(path.join('core', 'GuardShipAdapter.ts'))) return false;
    return /class\s+\w*Guard\w*(Ai|AI|Behavior|StateMachine|Brain)\b/.test(line);
  });
  return hits.map((h) => `${h.rel}:${h.line}`);
}

// ── B6: 고가치 배율 소비 지점 ───────────────────────────────────
function highValueConsumers() {
  const hits = scan((line) => /rewardMultiplier|highValueTransport/.test(line));
  return hits.map((h) => `${h.rel}:${h.line}`);
}

const { runSprintBVerification } = await import('../src/tools/__verification__/verifySprintB.ts');

let results;
try {
  results = runSprintBVerification({
    economyJson: readJson('params/economy.json'),
    factionEntitySites: factionEntitySites(),
    identificationSourceImpls: identificationSourceImpls(),
    identificationConsumers: identificationConsumers(),
    factionGuessSites: factionGuessSites(),
    neutralHitEmitters: neutralHitEmitters(),
    destroyerAiImpls: destroyerAiImpls(),
    newGuardAiSites: newGuardAiSites(),
    highValueConsumers: highValueConsumers(),
  });
} catch (error) {
  console.error('✖ 스프린트 B 검증 실행 자체가 실패했습니다:', error);
  process.exit(1);
}

const auto = results.filter((r) => r.status === 'pass' || r.status === 'fail');
const manual = results.filter((r) => r.status === 'manual');
const blocked = results.filter((r) => r.status === 'blocked');
const pending = results.filter((r) => r.status === 'pending');

console.log('=== 스프린트 B 자동 검증 (B는 선행개발 — 이 결과로 B 완료 선언 불가) ===');
let failures = 0;
for (const { id, name, status, detail } of auto) {
  if (status === 'fail') failures += 1;
  console.log(`${status === 'pass' ? '✔' : '✖'} [${id}] ${name} — ${detail}`);
}
console.log(`\n자동 항목: ${auto.length - failures}/${auto.length} 통과`);

const section = (title, rows, mark) => {
  console.log(`\n=== ${title} (${rows.length}건 — 종료 코드 미반영) ===`);
  for (const { id, name, detail } of rows) {
    console.log(`${mark} [${id}] ${name}\n    → ${detail}`);
  }
};

section('타 창 미병합 — 판정 보류', manual, '◻');
section('구현 차단 — 통과 불가', blocked, '⛔');
section('공식 수치·실측 대기', pending, '⏳');

console.log(
  `\n요약: 자동 ${auto.length - failures}/${auto.length} · 보류 ${manual.length} · 차단 ${blocked.length} · 대기 ${pending.length}`,
);

if (failures > 0) {
  console.error(`\n✖ 스프린트 B 자동 검증 실패 ${failures}건 — 툴링 소유 영역의 실패입니다.`);
  process.exit(1);
}
console.log('\n✅ 자동 검증 전 항목 통과. 보류·차단·대기 항목은 위 목록대로 남아 있습니다.');
