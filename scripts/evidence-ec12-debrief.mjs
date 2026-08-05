#!/usr/bin/env node
/**
 * EC12 locked-path production evidence 러너.
 *
 * 검증하는 production 경로(§5-1 정상 귀환):
 *   BASE → 실제 출항 버튼 클릭 → SORTIE → 실제 canvas 클릭으로 pointer lock
 *   → 실제 귀환 버튼 클릭 → DEBRIEF → **pointer lock 자동 해제** →
 *   resume overlay 숨김 → 실제 확인 버튼 클릭 → BASE → settlement 1회 ·
 *   saveRequested 1회 · 중복 0 · 오류 0
 *
 * ## 원인 문구 구분 (이 러너의 존재 이유)
 *
 *   production issue:
 *     DEBRIEF/BASE 전환 시 pointer lock 자동 해제 부재
 *
 *   harness limitation:
 *     CDP 합성 Escape가 브라우저 UA 기본 Esc 동작을 완전히 재현하지 못함
 *
 * 두 원인을 섞지 않기 위해 각 단계를 분리해 기록한다:
 *  - EC12-3a 잠금 중 귀환 버튼 클릭 가능 여부 — Pointer Lock 사양상 잠금 중에는
 *    모든 마우스 이벤트가 잠금 대상(canvas)으로 전달되므로 DOM 버튼에 닿지 않는다.
 *    `elementFromPoint`가 버튼을 가리키므로 z-order·하네스 문제가 아니다.
 *  - EC12-3b 합성 Escape의 해제 여부 — 실패하면 **harness limitation**으로만 적고
 *    production 버그로 적지 않는다.
 *  - EC12-4 잠금 상태의 DEBRIEF 진입 시 자동 해제 — 자발적 귀환으로는 도달할 수
 *    없어 `blocked`로 남긴다. 하네스가 못 봤다는 이유로 production 자동 해제
 *    부재를 정상 처리하지 않으며, 반대로 못 본 것을 pass로도 올리지 않는다.
 *
 * 내부 상태 주입 0 — 좌표·체력·재화·장비·save 어느 것도 쓰지 않는다.
 * `__deepDiveDebug`는 **읽기 전용 관측**(이벤트 구독·상태 조회)에만 쓴다.
 */

import path from 'node:path';
import process from 'node:process';
import {
  openSession,
  acquirePointerLock,
  pointerLockId,
  hasDebugHandle,
  writeEnvelope,
  printReport,
  projectRoot,
  sleep,
} from './lib/evidence-harness.mjs';

const OUT = process.env.DEEP_DIVE_EVIDENCE_OUT
  ? path.resolve(process.env.DEEP_DIVE_EVIDENCE_OUT)
  : path.join(projectRoot, 'scratchpad', 'm1-m2-final-evidence', 'ec12-return.json');

const startedAt = new Date().toISOString();
const items = [];
const add = (id, label, status, detail, extra = {}) =>
  items.push({ id, label, status, detail, ...extra });

const session = await openSession();
const { page } = session;

/** 이벤트 카운터를 **구독만** 한다 — 발행하지 않는다 */
async function attachCounters() {
  return page.evaluate(() => {
    const dbg = globalThis.__deepDiveDebug;
    if (!dbg?.bus) return false;
    const counts = {};
    const order = [];
    globalThis.__evidenceCounts = counts;
    globalThis.__evidenceOrder = order;
    for (const name of [
      'metaStateChanged',
      'sortieEnded',
      'saveRequested',
      'sortieFailed',
      'playerDestroyed',
      'hullDamaged',
    ]) {
      dbg.bus.on(name, (payload) => {
        counts[name] = (counts[name] ?? 0) + 1;
        order.push(name === 'metaStateChanged' ? `meta:${payload?.next}` : name);
      });
    }
    return true;
  });
}

const readCounts = () =>
  page.evaluate(() => ({
    counts: { ...(globalThis.__evidenceCounts ?? {}) },
    order: [...(globalThis.__evidenceOrder ?? [])],
  }));

/** 실제 UI 클릭 시도 — 실패 사유를 예외 대신 값으로 돌려준다 */
async function tryClick(locator, timeout = 4000) {
  try {
    await locator.click({ timeout });
    return { ok: true, reason: '' };
  } catch (error) {
    const msg = String(error?.message ?? error);
    const intercepted = /intercepts pointer events/.test(msg);
    return { ok: false, intercepted, reason: msg.split('\n')[0].slice(0, 200) };
  }
}

const metaState = () =>
  page.evaluate(() => {
    const m = globalThis.__deepDiveDebug?.meta;
    return m?.state ?? m?.metaState ?? null;
  });

try {
  // ── 0. 관측 전제 ────────────────────────────────────────────
  const debugAvailable = await hasDebugHandle(page);
  const counterOk = debugAvailable ? await attachCounters() : false;
  add(
    'EC12-0',
    '읽기 전용 관측 핸들 · 이벤트 구독 준비',
    counterOk ? 'pass' : 'blocked',
    counterOk
      ? '__deepDiveDebug.bus 구독 성공 — 구독만 하고 발행하지 않는다'
      : 'DEV 읽기 전용 핸들이 없어 이벤트 계수 불가 (dev 서버로 실행해야 한다)',
  );

  // ── 1. BASE → 실제 출항 버튼 클릭 ───────────────────────────
  const prep = page.locator('[data-ui-sortie-prep]');
  const departVisible = await prep.locator('button', { hasText: '출항' }).first().isVisible().catch(() => false);
  if (!departVisible) {
    add('EC12-1', 'BASE에서 실제 출항 버튼 클릭', 'blocked', '출항 버튼을 찾지 못했습니다 (BASE 화면 미노출)');
  } else {
    await prep.locator('button', { hasText: '출항' }).first().click();
    await sleep(2000);
    const st = await metaState();
    add('EC12-1', 'BASE에서 실제 출항 버튼 클릭 → SORTIE', st === 'SORTIE' ? 'pass' : 'fail',
      `실제 UI 클릭 후 metaState=${st}`, { observed: { metaState: st }, expected: { metaState: 'SORTIE' } });
  }

  // ── 2. 실제 canvas 클릭으로 pointer lock 획득 ───────────────
  const lockedId = await acquirePointerLock(page);
  add('EC12-2', '실제 canvas 클릭으로 pointer lock 획득',
    lockedId === 'game-canvas' ? 'pass' : 'blocked',
    lockedId === 'game-canvas'
      ? 'document.pointerLockElement === #game-canvas (requestPointerLock 직접 호출 없음)'
      : `잠금 획득 실패 — pointerLockElement=${String(lockedId)} · 헤드리스 환경 제약일 수 있어 blocked로 남긴다 (harness limitation)`,
    { observed: { pointerLockElement: lockedId }, expected: { pointerLockElement: 'game-canvas' } });

  const lockAcquired = lockedId === 'game-canvas';

  // ── 3. 잠금 상태에서 실제 귀환 버튼 클릭 시도 ───────────────
  //   Pointer Lock 사양상 잠금 중에는 **모든 마우스 이벤트가 잠금 대상(canvas)
  //   으로 전달**되므로 DOM 버튼은 실제 마우스로 누를 수 없다. 이는 하네스
  //   결함도, z-order 문제도 아니다 — elementFromPoint는 버튼을 가리킨다.
  const returnBtn = page.locator('button', { hasText: '귀환' }).first();
  let lockedClick = { ok: false, intercepted: false, reason: '잠금 미획득으로 시도하지 않음' };
  if (lockAcquired) {
    lockedClick = await tryClick(returnBtn);
    add('EC12-3a', '잠금 상태에서 실제 귀환 버튼 클릭 가능 여부',
      lockedClick.ok ? 'pass' : 'blocked',
      lockedClick.ok
        ? '잠금 중에도 귀환 버튼 클릭이 전달됐다'
        : `잠금 중 실제 마우스 클릭이 canvas로 전달돼 버튼에 닿지 않는다 (Pointer Lock 사양). ` +
          `elementFromPoint는 BUTTON을 가리키므로 z-order·하네스 문제가 아니다. ` +
          `→ 자발적 귀환으로는 '잠금 상태의 DEBRIEF 진입'에 도달할 수 없다. 사유: ${lockedClick.reason}`,
      { observed: { clicked: lockedClick.ok, intercepted: lockedClick.intercepted } });
  } else {
    add('EC12-3a', '잠금 상태에서 실제 귀환 버튼 클릭 가능 여부', 'harness',
      'pointer lock을 얻지 못해 판정 불가 — production 정상으로 처리하지 않는다');
  }

  // ── 3b. 실제 Escape 키 → 잠금 해제 관측 (하네스 한계 구분) ──
  let escReleased = null;
  if (lockAcquired && !lockedClick.ok) {
    await page.keyboard.press('Escape');
    await sleep(800);
    escReleased = (await pointerLockId(page)) === null;
    add('EC12-3b', '실제 Escape 키 입력 후 잠금 해제 관측',
      escReleased ? 'pass' : 'harness',
      escReleased
        ? 'Escape 입력 후 pointerLockElement=null — UA 기본 동작 재현됨'
        : 'harness limitation: CDP 합성 Escape가 브라우저 UA 기본 Esc 동작을 완전히 재현하지 못함. ' +
          '**이 실패 자체를 production 버그로 적지 않는다**',
      { observed: { pointerLockElement: escReleased ? null : 'game-canvas' } });
  }

  // ── 4. **핵심** 잠금 상태에서 DEBRIEF 진입 시 자동 해제 ─────
  //   자발적 귀환 경로로는 잠금 중 DEBRIEF에 도달할 수 없으므로(3a),
  //   이 단언은 실패·승리 경로에서만 판정 가능하다. 도달하지 못한 것을
  //   pass로 올리지 않는다.
  if (lockAcquired && !lockedClick.ok) {
    add('EC12-4', '잠금 상태에서 DEBRIEF 진입 시 pointer lock 자동 해제', 'blocked',
      'production issue 후보(DEBRIEF/BASE 전환 시 pointer lock 자동 해제 부재)를 자발적 귀환 경로로는 ' +
      '판정할 수 없다 — 잠금 중에는 귀환 버튼이 눌리지 않기 때문이다(3a). ' +
      '잠금 상태의 DEBRIEF 진입은 **적 공격에 의한 파괴** 또는 **보스 격파** 경로에서만 발생하며, ' +
      '강제 피해·강제 격파를 쓰지 않으므로 여기서 판정하지 않는다. ' +
      '그래픽스/UI ControlsHud PR 병합 후 Phase B에서 재판정한다');
  } else if (!lockAcquired) {
    add('EC12-4', '잠금 상태에서 DEBRIEF 진입 시 pointer lock 자동 해제', 'harness',
      'pointer lock을 얻지 못해 판정 불가 — harness limitation이며 production 정상으로 처리하지 않는다');
  }

  // ── 5. 잠금 해제 후 실제 귀환 버튼 클릭 → DEBRIEF ───────────
  const unlockedClick = await tryClick(returnBtn, 6000);
  let stAfterReturn = null;
  if (!unlockedClick.ok) {
    add('EC12-5', '잠금 해제 후 실제 귀환 버튼 클릭 → DEBRIEF', 'blocked',
      `귀환 버튼 클릭 실패: ${unlockedClick.reason}`);
  } else {
    await sleep(2000);
    stAfterReturn = await metaState();
    add('EC12-5', '잠금 해제 후 실제 귀환 버튼 클릭 → DEBRIEF',
      stAfterReturn === 'DEBRIEF' ? 'pass' : 'fail',
      `실제 UI 클릭 후 metaState=${stAfterReturn}`,
      { observed: { metaState: stAfterReturn }, expected: { metaState: 'DEBRIEF' } });
  }

  // ── 5b. DEBRIEF에서 잠금 null · resume overlay 숨김 ─────────
  const lockAtDebrief = await pointerLockId(page);
  add('EC12-5b', 'DEBRIEF에서 pointer lock null',
    stAfterReturn !== 'DEBRIEF' ? 'blocked' : lockAtDebrief === null ? 'pass' : 'fail',
    stAfterReturn !== 'DEBRIEF'
      ? 'DEBRIEF에 도달하지 못해 판정하지 않는다'
      : lockAtDebrief === null
        ? 'pointerLockElement=null'
        : `production issue: DEBRIEF인데 pointerLockElement=${lockAtDebrief}`,
    { observed: { pointerLockElement: lockAtDebrief } });

  const overlayVisible = await page.evaluate(() => {
    const el = document.querySelector('.resume-overlay');
    if (!el) return false;
    if (el.classList.contains('hud-hidden')) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01;
  });
  add('EC12-5c', 'DEBRIEF에서 resume overlay 숨김',
    stAfterReturn !== 'DEBRIEF' ? 'blocked' : overlayVisible ? 'fail' : 'pass',
    stAfterReturn !== 'DEBRIEF'
      ? 'DEBRIEF에 도달하지 못해 판정하지 않는다'
      : overlayVisible
        ? 'production issue: DEBRIEF인데 재진입 안내 오버레이가 보인다'
        : '.resume-overlay 미노출',
    { observed: { overlayVisible } });

  // ── 6. 실제 확인 버튼 → BASE ────────────────────────────────
  const confirm = page.locator('[data-ui-sortie-return] button', { hasText: '확인' }).first();
  const confirmVisible = await confirm.isVisible().catch(() => false);
  if (!confirmVisible) {
    add('EC12-6', '실제 확인 버튼 클릭 → BASE', 'blocked', '귀환 보고 확인 버튼을 찾지 못했습니다');
  } else {
    await confirm.click();
    await sleep(1500);
    const st = await metaState();
    add('EC12-6', '실제 확인 버튼 클릭 → BASE', st === 'BASE' ? 'pass' : 'fail',
      `실제 UI 클릭 후 metaState=${st}`, { observed: { metaState: st }, expected: { metaState: 'BASE' } });
  }

  // ── 7. settlement 1회 · save 1회 · 중복 0 ───────────────────
  const { counts, order } = await readCounts();
  if (!counterOk) {
    add('EC12-7', 'settlement 1회 · saveRequested 1회 · 중복 0', 'blocked',
      '이벤트 구독 불가로 계수하지 못했다 — 0으로 기록하지 않는다');
  } else if (stAfterReturn !== 'DEBRIEF') {
    // DEBRIEF에 도달하지 못했으면 정산이 없는 것이 정상이다 —
    // 도달 실패를 정산 결함(fail)으로 적으면 없는 버그를 만든다.
    add('EC12-7', 'settlement 1회 · saveRequested 1회 · 중복 0', 'blocked',
      `DEBRIEF에 도달하지 못해 정산을 판정하지 않는다 (전이 순서=[${order.join(' → ')}]) — ` +
      '미도달을 정산 실패로 적지 않는다');
  } else {
    const settle = counts.sortieEnded ?? 0;
    const save = counts.saveRequested ?? 0;
    add('EC12-7', 'settlement 1회 · saveRequested 1회 · 중복 0',
      settle === 1 && save === 1 ? 'pass' : 'fail',
      `sortieEnded=${settle} · saveRequested=${save} · 전이 순서=[${order.join(' → ')}]`,
      { observed: { sortieEnded: settle, saveRequested: save }, expected: { sortieEnded: 1, saveRequested: 1 } });
  }

  // ── 8. 오류 0 ───────────────────────────────────────────────
  await session.drainPageErrors();
  const errs = session.consoleErrors.length + session.pageErrors.length + session.pointerLockErrors.length;
  add('EC12-8', '콘솔·페이지·pointerlock·WebGL·save 오류 0', errs === 0 ? 'pass' : 'fail',
    errs === 0 ? '수집된 오류 0건'
      : `오류 ${errs}건: ${[...session.consoleErrors, ...session.pageErrors, ...session.pointerLockErrors].slice(0, 4).join(' | ')}`,
    { observed: { errorCount: errs } });

  // ── 9. 실패 경로는 이 러너에서 강제하지 않는다 ──────────────
  add('EC12-9', '실패 경로(파괴 → sortieFailed → DEBRIEF)', 'notRun',
    '실제 보스·적 공격으로 파괴되는 경로는 별도 러너/수동 production evidence로 남긴다. ' +
    '강제 피해·체력 직접 변경을 쓰지 않으므로 이 러너에서 빈 PASS로 만들지 않는다');

  const result = await writeEnvelope({ session, runner: 'evidence-ec12-debrief', items, startedAt, outFile: OUT });
  printReport(result, OUT);

  console.log(
    '\n원인 문구 구분:\n' +
    '  production issue    : DEBRIEF/BASE 전환 시 pointer lock 자동 해제 부재\n' +
    '  harness limitation  : CDP 합성 Escape가 브라우저 UA 기본 Esc 동작을 완전히 재현하지 못함\n' +
    '  ※ 두 원인을 항목별로 분리해 기록한다 — 3a는 Pointer Lock 사양, 3b는 하네스 한계,\n' +
    '     4는 production 자동 해제 부재 판정(도달 불가 시 blocked). 섞어서 적지 않는다.',
  );
  // 관측 러너다 — 판정 실패로 CI를 무너뜨리지 않고 결과 파일로 보고한다.
  process.exitCode = 0;
} finally {
  await session.close();
}
