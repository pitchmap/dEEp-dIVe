/**
 * 툴링 검증 러너 — 세이브·업그레이드 계산·스코프 가드·Keyboard Lock 폴백·오디오 라우팅.
 *
 * 사용법: node src/tools/__verification__/run.mjs  (npm run verify:tooling)
 * 게임플레이 러너(src/systems/__verification__/run.mjs)와 같은 방식:
 * Node 22 타입 스트리핑 + resolve 훅으로 .ts 직접 로드. 브라우저 불필요.
 * 스코프 가드 스크립트는 픽스처 디렉터리에서 자식 프로세스로 실검사한다.
 */

import { registerHooks } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const { runToolingVerificationAsync } = await import('./verifyTooling.ts');

let results;
try {
  results = await runToolingVerificationAsync();
} catch (error) {
  console.error('✖ 검증 실행 자체가 실패했습니다:', error);
  process.exit(1);
}

// ── 스코프 가드 스크립트 실검사 (자식 프로세스 + 픽스처) ──────────

const guardScript = path.join(projectRoot, 'scripts', 'check-scope-guard.mjs');
const runGuard = (cwd, args = []) =>
  spawnSync(process.execPath, [guardScript, ...args], { cwd, encoding: 'utf8' });

{
  const real = runGuard(projectRoot);
  results.push({
    name: '스코프 가드: 현 저장소 상한 이내 (기본 모드 exit 0)',
    passed: real.status === 0 && real.stdout.includes('영구 업그레이드'),
    detail: `exit=${real.status}`,
  });

  const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'deepdive-scope-'));
  try {
    mkdirSync(path.join(fixtureRoot, 'params'), { recursive: true });
    const eightItems = {
      items: Array.from({ length: 8 }, (_, i) => ({
        id: `u${i}`,
        label: `U${i}`,
        bonusPerLevel: 0.1,
        maxLevel: 5,
      })),
    };
    writeFileSync(
      path.join(fixtureRoot, 'params', 'upgrades.json'),
      JSON.stringify(eightItems),
    );
    writeFileSync(
      path.join(fixtureRoot, 'params', 'equipment.json'),
      JSON.stringify({ items: [1, 2, 3, 4, 5].map((n) => ({ id: `g${n}` })) }),
    );

    const warn = runGuard(fixtureRoot);
    results.push({
      name: '스코프 가드: 위반(업그레이드 8·장비 5) 기본 모드 — 경고·exit 0',
      passed:
        warn.status === 0 &&
        warn.stderr.includes('영구 업그레이드') &&
        warn.stderr.includes('장비 정의'),
      detail: `exit=${warn.status}, 경고 2건=${warn.stderr.includes('장비 정의')}`,
    });

    const strict = runGuard(fixtureRoot, ['--strict']);
    results.push({
      name: '스코프 가드: 동일 위반 --strict(CI) — exit 1',
      passed: strict.status === 1,
      detail: `exit=${strict.status}`,
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

let failures = 0;
for (const { name, passed, detail } of results) {
  if (!passed) failures += 1;
  console.log(`${passed ? '✔' : '✖'} ${name} — ${detail}`);
}

console.log(`\n${results.length - failures}/${results.length} 통과`);
process.exit(failures === 0 ? 0 : 1);
