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

// ── EC12 locked-path 판정 자체 테스트 (§7) ──────────────────────
{
  const { judgeEc12LockedPath } = await import('../evidenceSchema.ts');
  const PASSING = {
    urlQuery: '', fixtureLoaded: false, lockAfterCanvasClick: 'game-canvas',
    hullDamagedCount: 7, playerDestroyed: 1, sortieFailed: 1,
    lockBeforeLethal: 'game-canvas', lockAfterDebrief: null,
    resumeOverlayVisible: false, aiming: false,
    confirmClickTrusted: true, confirmClickTarget: 'BUTTON',
    reachedBase: true, settlementCount: 1, saveRequestedCount: 1, errorCount: 0,
  };
  results.push({
    name: 'EC12 판정: Phase C 전체 조건 충족 시 PASS',
    passed: judgeEc12LockedPath(PASSING).status === 'pass',
    detail: '14개 조건 전부 충족',
  });
  const notPass = (label, mutate, wanted) => {
    const v = judgeEc12LockedPath({ ...PASSING, ...mutate });
    results.push({
      name: `EC12 판정: ${label}`,
      passed: v.status === wanted && v.status !== 'pass',
      detail: `status=${v.status} (${wanted} 기대) · 미충족=${v.unmet.length}건`,
    });
  };
  // boss 미생성 = 선행조건 blocked (EC12_FAILED로 적지 않는다)
  notPass('boss 미생성·피해 0 → precondition blocked',
    { hullDamagedCount: 0, playerDestroyed: 0, sortieFailed: 0, lockAfterDebrief: 'game-canvas', reachedBase: false, settlementCount: 0, saveRequestedCount: 0 },
    'blocked');
  notPass('실제 DEBRIEF 미도달 → PASS 아님', { reachedBase: false }, 'fail');
  notPass('Pointer Lock null만으로는 PASS 아님 (피해 0)',
    { hullDamagedCount: 0, playerDestroyed: 0 }, 'blocked');
  notPass('trusted 아닌 클릭 → PASS 아님', { confirmClickTrusted: false }, 'fail');
  notPass('클릭 대상이 BUTTON이 아니면 PASS 아님', { confirmClickTarget: 'CANVAS' }, 'fail');
  notPass('settlement 2회 → PASS 아님', { settlementCount: 2 }, 'fail');
  notPass('save 0회 → PASS 아님', { saveRequestedCount: 0 }, 'fail');
  notPass('오류 1건이라도 있으면 PASS 아님', { errorCount: 1 }, 'fail');
  notPass('치명 피해 직전 잠금이 canvas가 아니면 PASS 아님', { lockBeforeLethal: null }, 'fail');
  notPass('DEBRIEF 후 잠금 잔류 → PASS 아님', { lockAfterDebrief: 'game-canvas' }, 'fail');
  notPass('resume overlay 표시 → PASS 아님', { resumeOverlayVisible: true }, 'fail');
  notPass('쿼리 진입 → PASS 아님', { urlQuery: '?x=1' }, 'fail');
  notPass('fixture 장착 → PASS 아님', { fixtureLoaded: true }, 'fail');
}

// ── 러너가 존재하지 않는 이벤트 이름을 쓰지 않는가 ──────────────
{
  const { readFileSync } = await import('node:fs');
  const contract = readFileSync(new URL('../../contracts/events.ts', import.meta.url), 'utf8');
  const declared = new Set(
    [...contract.matchAll(/^\s{2}([a-z][A-Za-z0-9]*)\??:/gm)].map((m) => m[1]),
  );
  const runners = [
    'evidence-ec12-locked-terminal.mjs',
    'evidence-ec12-debrief.mjs',
    'evidence-boss-closure.mjs',
  ];
  const bogus = [];
  for (const file of runners) {
    const src = readFileSync(new URL(`../../../scripts/${file}`, import.meta.url), 'utf8');
    // `bus.on('name'` 형태의 구독만 검사한다.
    for (const m of src.matchAll(/bus\.on\(\s*'([A-Za-z0-9]+)'/g)) {
      if (!declared.has(m[1])) bogus.push(`${file}:${m[1]}`);
    }
    // 배열로 나열한 구독 목록도 검사한다 — 단 **루프 본문이 bus.on을 부를 때만**.
    // DOM addEventListener('mousedown'…) 같은 배열까지 계약 대조하면 거짓 실패가 난다.
    for (const list of src.matchAll(/for \(const \w+ of \[([^\]]+)\]\)\s*\{([\s\S]{0,400}?)\n\s*\}/g)) {
      if (!/bus\.on\(/.test(list[2])) continue;
      for (const lit of list[1].matchAll(/'([A-Za-z0-9]+)'/g)) {
        if (!declared.has(lit[1])) bogus.push(`${file}:${lit[1]}`);
      }
    }
  }
  results.push({
    name: '러너가 계약에 없는 이벤트 이름을 구독하지 않음 (playerDamaged 등)',
    passed: bogus.length === 0,
    detail: bogus.length === 0
      ? `구독 이름 전부 src/contracts/events.ts에 실재 (계약 ${declared.size}종 대조)`
      : `계약에 없는 이름: ${bogus.join(', ')}`,
  });
  results.push({
    name: "러너에 'playerDamaged' 사용 0건",
    passed: !runners.some((f) =>
      readFileSync(new URL(`../../../scripts/${f}`, import.meta.url), 'utf8').includes('playerDamaged')),
    detail: 'playerDamaged는 production 이벤트 계약에 존재하지 않는다',
  });
}

// ── Phase C 교정 회귀 테스트 (§10) ─────────────────────────────
{
  const { judgeEc12LockedPath, classifyHullDamage, EC12_CONDITION_COUNT } =
    await import('../evidenceSchema.ts');
  const { readFileSync } = await import('node:fs');
  const runnerSrc = readFileSync(
    new URL('../../../scripts/evidence-ec12-locked-terminal.mjs', import.meta.url), 'utf8');

  const PASSING = {
    urlQuery: '', fixtureLoaded: false, lockAfterCanvasClick: 'game-canvas',
    hullDamagedCount: 7, playerDestroyed: 1, sortieFailed: 1,
    lockBeforeLethal: 'game-canvas', lockAfterDebrief: null,
    resumeOverlayVisible: false, aiming: false,
    confirmClickTrusted: true, confirmClickTarget: 'BUTTON',
    reachedBase: true, settlementCount: 1, saveRequestedCount: 1, errorCount: 0,
  };

  results.push({
    name: '러너가 judgeEc12LockedPath를 실제로 호출함',
    passed: /judgeEc12LockedPath\(observation\)/.test(runnerSrc),
    detail: '판정식을 복제하지 않고 순수 모듈을 호출한다',
  });
  results.push({
    name: 'EC12B-4 단독으로 candidate를 계산하는 코드 0건',
    passed: !/EC12B-4'\)\?\.status/.test(runnerSrc) && /verdict\.status === 'pass'/.test(runnerSrc),
    detail: 'candidate는 전체 verdict만 사용한다',
  });
  results.push({
    name: '러너에 판정식 복제(자체 classifyDamage) 0건',
    passed: !/function classifyDamage\(/.test(runnerSrc),
    detail: '분류는 공유 classifyHullDamage 한 벌만 쓴다',
  });

  // B-4가 pass여도 다른 조건이 깨지면 candidate=false
  const b4ok = { ...PASSING, lockAfterDebrief: null };
  for (const [label, mut] of [
    ['BASE 미복귀', { reachedBase: false }],
    ['trusted click 미확인', { confirmClickTrusted: undefined }],
    ['settlement=0', { settlementCount: 0 }],
  ]) {
    results.push({
      name: `B-4 pass여도 ${label}이면 candidate=false`,
      passed: judgeEc12LockedPath({ ...b4ok, ...mut }).status !== 'pass',
      detail: 'lock null 하나로 PASS가 되지 않는다',
    });
  }

  // lethal clamp — 비율을 절대값처럼 쓰지 않는다
  results.push({
    name: 'hullRemaining=0.10·amount=12를 절대 hullBefore로 비교하지 않음',
    passed: classifyHullDamage({
      amount: 12, currentHullAfter: 0, currentHullBefore: 12, maxHull: 120, lastDamageSource: 'direct',
    }) === 'LETHAL_ENEMY_WEAPON_DAMAGE_CLAMPED_TO_REMAINING_HULL'
      && classifyHullDamage({
        amount: 12, currentHullAfter: null, currentHullBefore: 0.10, maxHull: null, lastDamageSource: null,
      }) !== 'LETHAL_ENEMY_WEAPON_DAMAGE_CLAMPED_TO_REMAINING_HULL',
    detail: '절대 선체(12)로만 clamp 판정 · 비율(0.10)은 성립하지 않는다',
  });
  results.push({
    name: 'currentHullBefore=30·after=0·amount=30도 lethal clamp (raw ram 확정 금지)',
    passed: classifyHullDamage({
      amount: 30, currentHullAfter: 0, currentHullBefore: 30, maxHull: 120, lastDamageSource: 'direct',
    }) === 'LETHAL_ENEMY_WEAPON_DAMAGE_CLAMPED_TO_REMAINING_HULL',
    detail: 'clamp가 INFERRED_RAM보다 우선한다 — raw 공격 종류를 확정하지 않는다',
  });
  results.push({
    name: '비치명 18·30은 INFERRED_ 추론 분류 유지',
    passed: classifyHullDamage({ amount: 18, currentHullAfter: 42, currentHullBefore: 60, maxHull: 120, lastDamageSource: 'direct' })
        === 'INFERRED_PROJECTILE_FROM_DAMAGE_18'
      && classifyHullDamage({ amount: 30, currentHullAfter: 30, currentHullBefore: 60, maxHull: 120, lastDamageSource: 'direct' })
        === 'INFERRED_RAM_FROM_DAMAGE_30',
    detail: '공격 종류 이벤트가 없으므로 추론임을 이름에 박는다',
  });

  results.push({
    name: '치명 hullDamaged 시 lockAtLethalDamage를 기록함',
    passed: /lockAtLethalDamage/.test(runnerSrc)
      && /lockBeforeLethal: endSnap\.lockAtLethalDamage/.test(runnerSrc),
    detail: 'DEBRIEF 이후 잠금과 섞지 않고 치명 시점을 따로 잡는다',
  });
  results.push({
    name: 'confirm click target·isTrusted 미관측이면 PASS 불가',
    passed: judgeEc12LockedPath({ ...PASSING, confirmClickTrusted: undefined }).status !== 'pass'
      && judgeEc12LockedPath({ ...PASSING, confirmClickTarget: 'NOT_OBSERVED' }).status !== 'pass',
    detail: '미관측을 성공값으로 기본 설정하지 않는다',
  });
  results.push({
    name: '미관측 lock을 null(정상)로 자동 처리하지 않음',
    passed: judgeEc12LockedPath({ ...PASSING, lockBeforeLethal: undefined }).status !== 'pass'
      && judgeEc12LockedPath({ ...PASSING, lockAfterDebrief: undefined }).status !== 'pass',
    detail: 'undefined는 명확한 불충족으로 변환된다',
  });
  results.push({
    name: `실제 조건 수(${EC12_CONDITION_COUNT})와 문서 조건 수 일치`,
    passed: EC12_CONDITION_COUNT === 16
      && readFileSync(new URL('../../../docs/M1_M2_EVIDENCE_RUNNERS.md', import.meta.url), 'utf8')
        .includes(`${EC12_CONDITION_COUNT}개 조건`),
    detail: `술어 목록 길이 ${EC12_CONDITION_COUNT}에서 생성 — 하드코딩 불일치 방지`,
  });
  results.push({
    name: '기본 hunt 전략이 1200초·정지 기반임',
    passed: /DEEP_DIVE_EC12_HUNT_SECONDS \?\? 1200/.test(runnerSrc)
      && /IDLE_NUDGE_SECONDS/.test(runnerSrc)
      && !/await page\.keyboard\.down\('KeyW'\);\n  for /.test(runnerSrc),
    detail: '지속 KeyW·지속 마우스 이동 제거, 무피해 시에만 보정',
  });
  results.push({
    name: '보스 미생성은 precondition blocked (EC12_FAILED 아님)',
    passed: judgeEc12LockedPath({
      ...PASSING, hullDamagedCount: 0, playerDestroyed: 0, sortieFailed: 0,
      lockAfterDebrief: 'game-canvas', reachedBase: false, settlementCount: 0, saveRequestedCount: 0,
    }).status === 'blocked',
    detail: 'BLOCKED_RUNNER_PRECONDITION_NOT_REACHED',
  });
}

// ── Phase C Profile Handoff 테스트 (§13) ───────────────────────
// 실제 production 프로필은 저장소 테스트 데이터로 넣지 않는다 —
// 임시 디렉터리의 **가짜** Playwright storageState만 쓴다.
{
  const { mkdtempSync, writeFileSync: wf, mkdirSync: md, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const nodePath = (await import('node:path')).default;
  const { createHash } = await import('node:crypto');
  const { resolveEvidenceStorageState, HarnessStorageStateError } =
    await import('../../../scripts/lib/evidence-harness.mjs');
  const { validateEnvelope, isProductionEvidence, EMPTY_EVIDENCE_PROFILE } =
    await import('../evidenceSchema.ts');

  const dir = mkdtempSync(nodePath.join(tmpdir(), 'dd-storage-'));
  const BASE = 'http://localhost:5211/';
  const goodState = {
    cookies: [],
    origins: [{ origin: 'http://localhost:5211', localStorage: [{ name: 'deepDiveSave', value: '{"fake":1}' }] }],
  };
  const write = (name, body) => {
    const f = nodePath.join(dir, name);
    wf(f, typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
    return f;
  };
  const good = write('good.json', goodState);
  const PROV = { DEEP_DIVE_EVIDENCE_PROFILE_PROVENANCE: 'production-f-hold-clues-3of3-unedited' };
  const call = (env) => resolveEvidenceStorageState(BASE, env);
  const throws = (label, env, code) => {
    let got = null;
    try { call(env); } catch (e) { got = e instanceof HarnessStorageStateError ? e.code : `OTHER:${e.message}`; }
    results.push({
      name: `storageState: ${label}`,
      passed: got === code,
      detail: got === code ? `${code}로 중단` : `기대 ${code}, 실제 ${got ?? '통과돼 버림'}`,
    });
  };

  try {
    // 1. env 없음 → 빈 context
    const none = call({});
    results.push({
      name: 'storageState: env 없음 → 빈 context 옵션',
      passed: none.storageStateLoaded === false && none.path === null && none.sha256 === null,
      detail: 'default CI 동작 불변',
    });
    // 15. default CI가 프로필 파일을 요구하지 않음
    results.push({
      name: 'storageState: default CI에서 프로필 파일을 요구하지 않음',
      passed: (() => { try { call({}); return true; } catch { return false; } })(),
      detail: 'env 미설정에서 예외 없음',
    });
    // 2. 유효 → 경로 연결 + 9. SHA-256
    const ok = call({ DEEP_DIVE_EVIDENCE_STORAGE_STATE: good, ...PROV });
    const expectSha = createHash('sha256').update(JSON.stringify(goodState)).digest('hex');
    results.push({
      name: 'storageState: 유효 파일 → context 옵션 경로 연결',
      passed: ok.storageStateLoaded === true && ok.path === good && ok.originCount === 1,
      detail: `originCount=${ok.originCount}`,
    });
    results.push({
      name: 'storageState: profile SHA-256 계산',
      passed: ok.sha256 === expectSha && /^[0-9a-f]{64}$/.test(ok.sha256),
      detail: `sha256=${ok.sha256.slice(0, 12)}…`,
    });
    // 3~8 오류들
    throws('파일 없음 → 명확한 오류',
      { DEEP_DIVE_EVIDENCE_STORAGE_STATE: nodePath.join(dir, 'nope.json'), ...PROV }, 'HARNESS_STORAGE_STATE_INVALID');
    throws('JSON 오류 → 명확한 오류',
      { DEEP_DIVE_EVIDENCE_STORAGE_STATE: write('bad.json', '{oops'), ...PROV }, 'HARNESS_STORAGE_STATE_INVALID');
    throws('cookies 배열 아님 → 오류',
      { DEEP_DIVE_EVIDENCE_STORAGE_STATE: write('c.json', { cookies: {}, origins: [] }), ...PROV }, 'HARNESS_STORAGE_STATE_INVALID');
    throws('origins 배열 아님 → 오류',
      { DEEP_DIVE_EVIDENCE_STORAGE_STATE: write('o.json', { cookies: [], origins: 'x' }), ...PROV }, 'HARNESS_STORAGE_STATE_INVALID');
    throws('실행 origin 불일치 → 오류',
      { DEEP_DIVE_EVIDENCE_STORAGE_STATE: write('m.json', {
        cookies: [], origins: [{ origin: 'http://localhost:5173', localStorage: [] }],
      }), ...PROV }, 'HARNESS_STORAGE_STATE_INVALID');
    throws('provenance 누락 → 오류',
      { DEEP_DIVE_EVIDENCE_STORAGE_STATE: good }, 'HARNESS_STORAGE_STATE_PROVENANCE_MISSING');
    // 디렉터리는 일반 파일이 아니다
    md(nodePath.join(dir, 'adir'), { recursive: true });
    throws('일반 파일 아님 → 오류',
      { DEEP_DIVE_EVIDENCE_STORAGE_STATE: nodePath.join(dir, 'adir'), ...PROV }, 'HARNESS_STORAGE_STATE_INVALID');

    // 10~12. envelope metadata
    const baseEnv = {
      runner: 'p', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40),
      fixtureLoaded: false, urlQuery: '', browserVersion: 'C/1',
      viewport: { width: 1, height: 1 },
      startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:01.000Z',
      consoleErrors: [], pageErrors: [], pointerLockErrors: [],
      items: [{ id: 'X', label: 'x', status: 'pass', detail: 'd' }],
    };
    const withProfile = {
      ...baseEnv,
      profile: {
        storageStateLoaded: true, storageStateSha256: expectSha,
        storageStateFileName: 'good.json', storageStateOriginCount: 1,
        provenance: PROV.DEEP_DIVE_EVIDENCE_PROFILE_PROVENANCE,
      },
    };
    results.push({
      name: 'storageState: 빈 context profile metadata 형태',
      passed: (() => {
        try { validateEnvelope({ ...baseEnv, profile: EMPTY_EVIDENCE_PROFILE }); return true; } catch { return false; }
      })(),
      detail: 'loaded=false·sha=null·originCount=0',
    });
    results.push({
      name: 'storageState: profile 사용 metadata 형태',
      passed: (() => { try { validateEnvelope(withProfile); return true; } catch { return false; } })(),
      detail: 'sha256 64자리 · provenance 필수',
    });
    const rejectsProfile = (label, profile) => {
      let threw = false;
      try { validateEnvelope({ ...baseEnv, profile }); } catch { threw = true; }
      results.push({ name: `storageState: ${label}`, passed: threw, detail: threw ? '거부됨' : '통과돼 버림' });
    };
    rejectsProfile('raw cookies가 envelope에 포함되면 거부',
      { ...withProfile.profile, cookies: [{ name: 'x' }] });
    rejectsProfile('raw localStorage가 envelope에 포함되면 거부',
      { ...withProfile.profile, origins: [{ origin: 'x', localStorage: [] }] });
    rejectsProfile('전체 경로가 envelope에 포함되면 거부',
      { ...withProfile.profile, path: '/abs/secret/path.json' });
    rejectsProfile('profile 사용인데 provenance 없음 → 거부',
      { ...withProfile.profile, provenance: null });
    rejectsProfile('profile 사용인데 sha 형식 불량 → 거부',
      { ...withProfile.profile, storageStateSha256: 'short' });

    // 14. storageState 사용이 fixture로 자동 분류되지 않음
    results.push({
      name: 'storageState 사용이 fixtureLoaded=true로 자동 분류되지 않음',
      passed: isProductionEvidence(withProfile).ok === true
        && withProfile.fixtureLoaded === false
        && !isProductionEvidence({ ...withProfile, fixtureLoaded: true }).ok,
      detail: 'production 플레이 결과 재사용은 fixture가 아니다',
    });

    // 13. storageStateLoaded=true지만 clues 미달 → PASS 불가
    const runnerSrc = (await import('node:fs')).readFileSync(
      new URL('../../../scripts/evidence-ec12-locked-terminal.mjs', import.meta.url), 'utf8');
    results.push({
      name: 'storageStateLoaded=true지만 clues 미달 → PROFILE_STATE_DOES_NOT_MATCH_PROVENANCE',
      passed: /PROFILE_STATE_DOES_NOT_MATCH_PROVENANCE/.test(runnerSrc)
        && /BLOCKED_RUNNER_PRECONDITION_NOT_REACHED/.test(runnerSrc)
        && /cluesComplete \? 'pass' : 'blocked'/.test(runnerSrc),
      detail: '로드됐다는 이유만으로 3/3을 가정하지 않고 두 실패를 구분한다',
    });
    results.push({
      name: '러너가 localStorage를 직접 쓰지 않음 (page.evaluate 주입 0)',
      passed: !/localStorage\.setItem|localStorage\[/.test(runnerSrc),
      detail: 'storageState 공식 입력만 사용한다',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Phase C Final Runner Path Correction 테스트 (§16) ──────────
{
  const { readFileSync } = await import('node:fs');
  const { mkdtempSync, writeFileSync: wf, mkdirSync: md, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const nodePath = (await import('node:path')).default;
  const { chooseNavigationInput, hasNewDamage, horizontalDistance } =
    await import('../../../scripts/lib/evidence-navigation.mjs');
  const { resolveEvidenceStorageState, HarnessStorageStateError, projectRoot } =
    await import('../../../scripts/lib/evidence-harness.mjs');
  const runnerSrc = readFileSync(
    new URL('../../../scripts/evidence-ec12-locked-terminal.mjs', import.meta.url), 'utf8');

  // 1~3. 프로필 미달 조기 종료 · combat timer 시작 순서
  results.push({
    name: 'nav: clues 미달 시 출항·잠금·대기 없이 즉시 종료',
    passed: /if \(!cluesComplete\) \{/.test(runnerSrc)
      && /프로필 선행조건 미달로 실행하지 않았다/.test(runnerSrc),
    detail: 'blocked 항목을 채우고 envelope만 쓰고 끝낸다',
  });
  results.push({
    name: 'nav: profile mismatch 시 20분 loop 진입 0',
    passed: /PROFILE_STATE_DOES_NOT_MATCH_PROVENANCE/.test(runnerSrc)
      && runnerSrc.indexOf('if (!cluesComplete)') < runnerSrc.indexOf('HUNT_SECONDS)'),
    detail: '미달 분기가 combat loop보다 앞에 있다',
  });
  results.push({
    name: 'nav: bossSpawned 전에는 combat timer를 시작하지 않음',
    passed: /if \(bossReached\) \{\n    const combatBegan = Date\.now\(\);/.test(runnerSrc)
      && /보스 생성 전 대기 시간은 1200초에 포함하지 않는다/.test(runnerSrc),
    detail: 'combat timer가 bossReached 안에서만 시작',
  });
  results.push({
    name: 'nav: navigation 성공 후 combat timer 시작',
    passed: /bossReached = true; break;/.test(runnerSrc)
      && runnerSrc.indexOf('EC12B-NAV') < runnerSrc.indexOf('const combatBegan'),
    detail: 'NAV → bossReached → combat 순서',
  });
  results.push({
    name: 'nav: timeout → BLOCKED_RUNNER_NAVIGATION_DID_NOT_REACH_BOSS_ZONE',
    passed: /BLOCKED_RUNNER_NAVIGATION_DID_NOT_REACH_BOSS_ZONE/.test(runnerSrc)
      && /HEADLESS_UNSUPPORTED·BOSS_SPAWN_BROKEN·EC12_FAILED로 일반화하지 않는다/.test(runnerSrc),
    detail: 'nav 실패를 production 결함으로 일반화하지 않는다',
  });
  results.push({
    name: 'nav: NAV_SECONDS 기본 300초 · combat과 분리',
    passed: /DEEP_DIVE_EC12_NAV_SECONDS \?\? 300/.test(runnerSrc)
      && /DEEP_DIVE_EC12_HUNT_SECONDS \?\? 1200/.test(runnerSrc),
    detail: 'nav 300 / combat 1200',
  });
  results.push({
    name: 'nav: bossSpawned=true에서 모든 이동 키 해제',
    passed: /const MOVE_KEYS = \['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ControlLeft'\]/.test(runnerSrc)
      && /if \(bossReached\) \{\n    for \(const k of MOVE_KEYS\) await page\.keyboard\.up\(k\)/.test(runnerSrc),
    detail: '정지 전략 — 회피 기동 없음',
  });

  // 7~10. 신규 피해 count 추적
  results.push({
    name: 'damage: 누적 수가 0보다 큰지만 보는 방식 제거',
    passed: !/const damaged = \(last\.counts\.hullDamaged \?\? 0\) > 0/.test(runnerSrc)
      && /hasNewDamage\(previousDamageCount, currentDamageCount\)/.test(runnerSrc),
    detail: '증가분으로만 판단한다',
  });
  results.push({
    name: 'damage: 첫 피해 이후 count 변화 없으면 lastDamageAt 갱신 안 함',
    passed: hasNewDamage(3, 3) === false && hasNewDamage(3, 2) === false,
    detail: '동일·감소는 신규 피해가 아니다',
  });
  results.push({
    name: 'damage: count 증가 시에만 신규 피해로 판정',
    passed: hasNewDamage(3, 4) === true && hasNewDamage(0, 1) === true,
    detail: '증가분 감지',
  });
  results.push({
    name: 'damage: 연속 polling에서 nudge timer가 영구 차단되지 않음',
    passed: (() => {
      // 첫 피해 후 count가 고정된 채 폴링이 반복돼도 갱신이 일어나지 않아야
      // idle 시간이 실제로 누적된다.
      let prev = 1, refreshed = 0;
      for (let i = 0; i < 50; i++) {
        const cur = 1; // 신규 피해 없음
        if (hasNewDamage(prev, cur)) { prev = cur; refreshed += 1; }
      }
      return refreshed === 0;
    })(),
    detail: '50회 폴링 동안 갱신 0회 → idle 타이머가 실제로 흐른다',
  });
  results.push({
    name: 'damage: max nudge 안전장치',
    passed: /DEEP_DIVE_EC12_MAX_NUDGES \?\? 10/.test(runnerSrc)
      && /nudges < MAX_NUDGES/.test(runnerSrc),
    detail: '무한 보정 방지',
  });
  results.push({
    name: 'damage: nudge 기록에 sequence·pose·거리·키·피해 여부 포함',
    passed: ['sequence', 'startPose', 'endPose', 'bossPose', 'distance', 'keys',
      'idleSecondsBefore', 'damagedWithinObservationWindow'].every((k) => runnerSrc.includes(`${k}:`)),
    detail: 'nudge마다 진단을 남긴다',
  });

  // 12~14. hull snapshot · cause 분리
  results.push({
    name: 'hull: snapshot()/readModel() 형태 지원',
    passed: /typeof hullSrc\.snapshot === 'function'/.test(runnerSrc)
      && /typeof hullSrc\.readModel === 'function'/.test(runnerSrc),
    detail: '직접 속성만 읽지 않는다',
  });
  results.push({
    name: 'hull: cause와 lastDamageSource 분리',
    passed: /damageCause: p\?\.cause/.test(runnerSrc)
      && /lastDamageSource: typeof hullState\?\.lastDamageSource === 'string'/.test(runnerSrc)
      && !/lastDamageSource: p\?\.cause/.test(runnerSrc),
    detail: "direct/near를 enemyWeapon으로 쓰지 않는다",
  });

  // 15. tracked 절대 경로 우회 방지
  {
    const dir = mkdtempSync(nodePath.join(tmpdir(), 'dd-nav-'));
    const state = { cookies: [], origins: [{ origin: 'http://localhost:5211', localStorage: [] }] };
    const PROV = { DEEP_DIVE_EVIDENCE_PROFILE_PROVENANCE: 'p' };
    try {
      // 저장소 밖 일반 파일 → 허용
      const outside = nodePath.join(dir, 's.json');
      wf(outside, JSON.stringify(state), 'utf8');
      const okOutside = resolveEvidenceStorageState('http://localhost:5211/',
        { DEEP_DIVE_EVIDENCE_STORAGE_STATE: outside, ...PROV });
      // 저장소 내부 tracked 파일(절대 경로) → 거부
      const trackedAbs = nodePath.join(projectRoot, 'package.json');
      let trackedRejected = false;
      try {
        resolveEvidenceStorageState('http://localhost:5211/',
          { DEEP_DIVE_EVIDENCE_STORAGE_STATE: trackedAbs, ...PROV });
      } catch (e) { trackedRejected = e instanceof HarnessStorageStateError; }
      // 저장소 내부 gitignored scratchpad → 허용
      const scratch = nodePath.join(projectRoot, 'scratchpad', 'nav-test');
      md(scratch, { recursive: true });
      const ignored = nodePath.join(scratch, 's.json');
      wf(ignored, JSON.stringify(state), 'utf8');
      const okIgnored = resolveEvidenceStorageState('http://localhost:5211/',
        { DEEP_DIVE_EVIDENCE_STORAGE_STATE: ignored, ...PROV });
      rmSync(scratch, { recursive: true, force: true });

      results.push({
        name: 'storageState: 저장소 내부 tracked 파일을 절대 경로로 줘도 거부',
        passed: trackedRejected,
        detail: '상대 경로로 ls-files 조회',
      });
      results.push({
        name: 'storageState: gitignored scratchpad·저장소 밖 파일은 허용',
        passed: okIgnored.storageStateLoaded === true && okOutside.storageStateLoaded === true,
        detail: 'untracked는 정상 경로',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // 16~17. navigation이 좌표를 쓰지 않음 · boss 미생성 candidate=false
  results.push({
    name: 'nav: navigation 입력이 좌표를 쓰지 않음',
    passed: !/pose\.x\s*=|position\.x\s*=|\.setPosition\(|teleport/i.test(runnerSrc)
      && /chooseNavigationInput\(/.test(runnerSrc),
    detail: 'read-only pose로 누를 키만 고른다',
  });
  results.push({
    name: 'nav: chooseNavigationInput은 키 선택만 반환 (상태 변경 없음)',
    passed: (() => {
      const r = chooseNavigationInput({
        player: { x: 0, y: 0, z: 0 }, target: { x: 0, y: -10, z: 50 }, headingRadians: 0,
      });
      const near = chooseNavigationInput({
        player: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 6 }, headingRadians: 0,
      });
      return Array.isArray(r.keys) && r.keys.includes('KeyW') && r.keys.includes('ControlLeft')
        && near.arrived === true && near.keys.length === 0
        && horizontalDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }) === 5;
    })(),
    detail: '거리·깊이에 따라 키만 고르고 목표 반경 안에서는 정지',
  });
}

// ── Final Static Correctness Closure 테스트 (§9) ───────────────
{
  const { readFileSync } = await import('node:fs');
  const { readCollectionCount, inferHeadingFromMovement, chooseNavigationInput } =
    await import('../../../scripts/lib/evidence-navigation.mjs');
  const runnerSrc = readFileSync(
    new URL('../../../scripts/evidence-ec12-locked-terminal.mjs', import.meta.url), 'utf8');

  // 1~4. Set 형태 clue count
  results.push({
    name: 'clue count: Set size 3 → 3 · Set size 0 → 0',
    passed: readCollectionCount(new Set(['a', 'b', 'c'])) === 3
      && readCollectionCount(new Set()) === 0,
    detail: '실제 bossProgress.collected는 Set이다',
  });
  results.push({
    name: 'clue count: number·array·Map 지원',
    passed: readCollectionCount(3) === 3
      && readCollectionCount(['a', 'b', 'c']) === 3
      && readCollectionCount(new Map([['a', 1], ['b', 2], ['c', 3]])) === 3,
    detail: '세 형태 모두 3',
  });
  results.push({
    name: 'clue count: 일반 객체·문자열·NaN/음수 size 거부',
    passed: readCollectionCount({ a: 1 }) === null
      && readCollectionCount('abc') === null
      && readCollectionCount({ size: Number.NaN }) === null
      && readCollectionCount({ size: -1 }) === null
      && readCollectionCount(null) === null,
    detail: '문자열 length·임의 객체를 개수로 오인하지 않는다',
  });
  results.push({
    name: 'clue count: Set 3/3 + unlockedFlag=true → profile pass 조건 성립',
    passed: (() => {
      const collected = readCollectionCount(new Set(['c1', 'c2', 'c3']));
      const required = 3;
      const unlocked = true;
      return collected !== null && required !== null && collected >= required && unlocked === true;
    })(),
    detail: '거짓 PROFILE_STATE_DOES_NOT_MATCH_PROVENANCE 방지',
  });
  results.push({
    name: 'clue count: 러너가 helper 한 벌만 사용 (Array.isArray 분기 제거)',
    passed: /globalThis\.__readCollectionCount/.test(runnerSrc)
      && !/const count = \(v\) => \(Array\.isArray\(v\) \? v\.length : num\(v\)\)/.test(runnerSrc),
    detail: '판정식 복제 없이 순수 helper 주입',
  });

  // 6~8. heading 관측·추정
  results.push({
    name: 'heading: pose가 headingRadians/yaw를 보존함',
    passed: /headingRadians: num\(v\.headingRadians \?\? v\.heading \?\? v\.yaw \?\? v\.rotationY\)/.test(runnerSrc)
      && !/pose\?\.heading \?\? d\?\.camera\?\.rotation\?\.y/.test(runnerSrc),
    detail: 'x/y/z만 남겨 heading이 사라지던 경로 제거',
  });
  results.push({
    name: 'heading: forward vector로 heading 계산',
    passed: /Math\.atan2\(pose\.forwardX, pose\.forwardZ\)/.test(runnerSrc)
      && /forwardX: num\(fwd\?\.x\)/.test(runnerSrc),
    detail: '명시 heading 없으면 forward로 계산',
  });
  results.push({
    name: 'heading: 이동 벡터 +Z → 0 근처 · -Z → π 근처',
    passed: (() => {
      const fwd = inferHeadingFromMovement({ x: 0, z: 0 }, { x: 0, z: 5 });
      const back = inferHeadingFromMovement({ x: 0, z: 0 }, { x: 0, z: -5 });
      const still = inferHeadingFromMovement({ x: 0, z: 0 }, { x: 0, z: 0.01 });
      return Math.abs(fwd) < 1e-6 && Math.abs(Math.abs(back) - Math.PI) < 1e-6 && still === null;
    })(),
    detail: '미세 이동은 null (추정하지 않는다)',
  });

  // 9~10. unknown heading sweep · 반대 방향 회귀
  results.push({
    name: 'heading null → mouseDx가 0이 아니고 KeyW만 반복하지 않음',
    passed: (() => {
      const r0 = chooseNavigationInput({
        player: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 43 }, headingRadians: null, scanStep: 0,
      });
      const r1 = chooseNavigationInput({
        player: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 43 }, headingRadians: null, scanStep: 1,
      });
      return r0.mouseDx !== 0 && r1.mouseDx !== 0 && Math.sign(r0.mouseDx) !== Math.sign(r1.mouseDx)
        && r0.keys.length === 0 && r1.keys.length === 0;
    })(),
    detail: '실제 마우스 sweep으로 방향 탐색',
  });
  results.push({
    name: '회귀: 목표 z=+43인데 반대(-z)로 향하면 KeyW 반복 대신 회전',
    passed: (() => {
      // 실측 재현 — 목표는 +z인데 heading이 -z(π)를 향한 상태.
      const r = chooseNavigationInput({
        player: { x: 0, y: 0, z: -12 }, target: { x: 0, y: 0, z: 43 }, headingRadians: Math.PI,
      });
      // 전진하지 않고 먼저 돌아서야 한다.
      return !r.keys.includes('KeyW') && r.mouseDx !== 0;
    })(),
    detail: '목표가 후방(±90° 밖)이면 전진 전에 회전',
  });
  results.push({
    name: '회귀: 목표가 전방이면 정상 전진',
    passed: (() => {
      const r = chooseNavigationInput({
        player: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 43 }, headingRadians: 0,
      });
      return r.keys.includes('KeyW');
    })(),
    detail: '회전 규칙이 정상 전진을 막지 않는다',
  });

  // 11. nudge 관측창 명칭
  results.push({
    name: 'nudge: 관측창 필드명이 실제 대기 시간과 일치',
    passed: /observationWindowMs: OBSERVATION_WINDOW_MS/.test(runnerSrc)
      && /damagedWithinObservationWindow/.test(runnerSrc)
      && !/damagedWithin30s/.test(runnerSrc),
    detail: '3초 대기에 30s라고 적던 이름 제거',
  });

  // 12. 외부 candidate와 corrected-runner reproduced 분리
  {
    const doc = readFileSync(
      new URL('../../../docs/M1_M2_EVIDENCE_RUNNERS.md', import.meta.url), 'utf8');
    results.push({
      name: '증적 분리: 외부 EC12 candidate와 corrected runner 재현 상태가 별개로 기록됨',
      passed: /EC12_POINTER_LOCKED_PATH_VERIFIED_CANDIDATE=true/.test(doc)
        && /CORRECTED_RUNNER_PRODUCTION_REPRODUCED=false/.test(doc)
        && /BLOCKED_PROFILE_HANDOFF_NOT_AVAILABLE/.test(doc),
      detail: '러너 미재현이 외부 production PASS를 뒤집지 않는다',
    });
  }
}

let failures = 0;
for (const { name, passed, detail } of results) {
  if (!passed) failures += 1;
  console.log(`${passed ? '✔' : '✖'} ${name} — ${detail}`);
}

console.log(`\n${results.length - failures}/${results.length} 통과`);
process.exit(failures === 0 ? 0 : 1);
