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
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// ── 빌드 스크립트 경로 해석 (Windows 드라이브 문자·공백 경로) ────
//
// `new URL(...).pathname`을 쓰면 Windows에서 `/C:/…`가 되어 빌드가 성공해도
// dist를 못 찾고, 퍼센트 인코딩(`%20`)이 풀리지 않아 공백이 든 경로가
// 플랫폼 무관하게 깨진다. Windows에서 직접 돌리지 않고도 회귀를 잡을 수 있는
// 지점이 여기다 — 스크립트 소스와 URL 변환 규칙을 직접 본다.

{
  const targets = ['scripts/check-build-size.mjs', 'scripts/print-project-status.mjs'];
  const offenders = [];
  const missingHelper = [];
  const hardcodedDrive = [];
  for (const rel of targets) {
    const source = readFileSync(path.join(projectRoot, rel), 'utf8');
    source.split('\n').forEach((line, index) => {
      if (/^\s*(\/\/|\*)/.test(line)) return; // 설명 주석은 위반이 아니다
      if (/import\.meta\.url\s*\)\s*\.pathname/.test(line)) offenders.push(`${rel}:${index + 1}`);
      if (/['"][A-Za-z]:[\\/]/.test(line)) hardcodedDrive.push(`${rel}:${index + 1}`);
    });
    if (!/fileURLToPath/.test(source)) missingHelper.push(rel);
  }
  const clean = offenders.length === 0 && missingHelper.length === 0 && hardcodedDrive.length === 0;
  results.push({
    name: '빌드 스크립트: 파일 URL을 fileURLToPath로 해석 (pathname 직접 사용 금지)',
    passed: clean,
    detail: clean
      ? `${targets.length}개 스크립트 fileURLToPath 사용 · pathname 직접 사용 0 · 드라이브 하드코딩 0`
      : `pathname [${offenders.join(', ')}] / helper 미사용 [${missingHelper.join(', ')}] / 드라이브 하드코딩 [${hardcodedDrive.join(', ')}]`,
  });

  // 변환 규칙 자체 — 공백 해제는 리눅스에서도 그대로 재현된다.
  const spaced = fileURLToPath(new URL('../dist', 'file:///home/user/My%20Project/scripts/x.mjs'));
  const raw = new URL('../dist', 'file:///home/user/My%20Project/scripts/x.mjs').pathname;
  results.push({
    name: '빌드 스크립트: fileURLToPath가 퍼센트 인코딩을 해제 (pathname은 남긴다)',
    passed: spaced.includes('My Project') && !spaced.includes('%20') && raw.includes('%20'),
    detail: `pathname='${raw}' → fileURLToPath='${spaced}'`,
  });
}

{
  // dist 부재 시 실패 유지 / 존재 시 통과 — 실제 스크립트를 자식으로 돌린다.
  const sizeScript = path.join(projectRoot, 'scripts', 'check-build-size.mjs');
  const emptyRoot = mkdtempSync(path.join(tmpdir(), 'deepdive-dist-'));
  try {
    mkdirSync(path.join(emptyRoot, 'scripts'), { recursive: true });
    copyFileSync(sizeScript, path.join(emptyRoot, 'scripts', 'check-build-size.mjs'));
    const missing = spawnSync(process.execPath, [path.join(emptyRoot, 'scripts', 'check-build-size.mjs')], {
      cwd: emptyRoot,
      encoding: 'utf8',
    });
    results.push({
      name: '빌드 스크립트: dist 부재 시 실패 유지 (build 전 통과 금지)',
      passed: missing.status === 1 && /dist/.test(missing.stderr + missing.stdout),
      detail: `exit=${missing.status}`,
    });
  } finally {
    rmSync(emptyRoot, { recursive: true, force: true });
  }
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

// ── evidence 결과 스키마 자체 테스트 ────────────────────────────
// "실행하지 않은 항목을 빈 PASS로 만들지 않는다"를 코드가 강제하는지 확인한다.
{
  const {
    validateEnvelope, isProductionEvidence, isSatisfied, summarize,
  } = await import('../evidenceSchema.ts');

  const base = {
    runner: 'self-test', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40),
    fixtureLoaded: false, urlQuery: '', browserVersion: 'Chromium/1',
    viewport: { width: 100, height: 100 },
    startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:01.000Z',
    consoleErrors: [], pageErrors: [], pointerLockErrors: [],
    items: [{ id: 'X1', label: 'x', status: 'pass', detail: 'ok' }],
  };
  const rejects = (label, mutate) => {
    let threw = false;
    try { validateEnvelope(mutate(structuredClone(base))); } catch { threw = true; }
    results.push({ name: `evidence 스키마: ${label}`, passed: threw, detail: threw ? '거부됨' : '통과돼 버림' });
  };

  results.push({
    name: 'evidence 스키마: 정상 봉투 통과',
    passed: (() => { try { validateEnvelope(structuredClone(base)); return true; } catch { return false; } })(),
    detail: '맥락 필드 완비',
  });
  rejects('items 0건 거부', (e) => { e.items = []; return e; });
  rejects('알 수 없는 status 거부', (e) => { e.items[0].status = 'ok'; return e; });
  rejects('detail 누락 거부', (e) => { e.items[0].detail = ''; return e; });
  rejects('id 중복 거부', (e) => { e.items.push({ ...e.items[0] }); return e; });
  rejects('fixtureLoaded 미기재 거부', (e) => { delete e.fixtureLoaded; return e; });
  rejects('baseSha 누락 거부', (e) => { e.baseSha = ''; return e; });

  // notRun·blocked·harness는 절대 충족이 아니다 — 빈 PASS 방지의 핵심
  const nonSatisfying = ['notRun', 'blocked', 'harness', 'manual', 'fail'];
  results.push({
    name: 'evidence 판정: notRun·blocked·harness·manual·fail 은 충족 아님',
    passed: nonSatisfying.every((status) => !isSatisfied({ id: 'i', label: 'l', status, detail: 'd' })),
    detail: `pass 외 ${nonSatisfying.length}종 전부 미충족`,
  });

  // fixture 장착·쿼리 진입은 production 증거가 아니다
  const fx = { ...structuredClone(base), fixtureLoaded: true };
  const qs = { ...structuredClone(base), urlQuery: '?fixture=1' };
  results.push({
    name: 'evidence 판정: fixture 장착·쿼리 진입은 production 증거 아님',
    passed: !isProductionEvidence(fx).ok && !isProductionEvidence(qs).ok && isProductionEvidence(base).ok,
    detail: 'fixtureLoaded=true 거부 · urlQuery 비어 있지 않으면 거부',
  });

  // notRun이 하나라도 있으면 allSatisfied가 서지 않는다
  const withNotRun = structuredClone(base);
  withNotRun.items.push({ id: 'X2', label: 'y', status: 'notRun', detail: '미실행' });
  const withError = structuredClone(base);
  withError.consoleErrors = ['boom'];
  results.push({
    name: 'evidence 요약: notRun 포함·오류 존재 시 allSatisfied=false',
    passed: summarize(base).allSatisfied === true
      && summarize(withNotRun).allSatisfied === false
      && summarize(withError).allSatisfied === false,
    detail: 'notRun 1건 또는 오류 1건이면 충족으로 올라가지 않는다',
  });
}

let failures = 0;
for (const { name, passed, detail } of results) {
  if (!passed) failures += 1;
  console.log(`${passed ? '✔' : '✖'} ${name} — ${detail}`);
}

console.log(`\n${results.length - failures}/${results.length} 통과`);
process.exit(failures === 0 ? 0 : 1);
