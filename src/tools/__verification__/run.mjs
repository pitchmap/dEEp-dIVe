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

let failures = 0;
for (const { name, passed, detail } of results) {
  if (!passed) failures += 1;
  console.log(`${passed ? '✔' : '✖'} ${name} — ${detail}`);
}

console.log(`\n${results.length - failures}/${results.length} 통과`);
process.exit(failures === 0 ? 0 : 1);
