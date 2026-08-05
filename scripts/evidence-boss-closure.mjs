#!/usr/bin/env node
/**
 * EC9·EC10·EC13·EC17 production evidence 관측 러너 (중어뢰 단독 실측 경로).
 *
 * 관측하는 production 경로(§7):
 *   salvage·cargo 수입 → BASE 귀환 → 중어뢰 구매 → 장착 → 출항 →
 *   단서 3/3 → 보스 진입 → 약점 개방마다 1발 → phase 2 → phase 3 →
 *   격파 → 승리 DEBRIEF → 실제 확인 → BASE → 재출항
 *
 * ## 이 러너가 하지 않는 것 (§7 금지 목록 전부)
 *   credits·rare part 직접 설정 · heavyTorpedo 직접 장착 · 업그레이드 state
 *   직접 변경 · boss hull 직접 변경 · bossHit 직접 발행 · 약점 강제 개방 ·
 *   boss 강제 spawn · save 주입.
 * `__deepDiveDebug`는 **읽기 전용 관측**에만 쓴다 — 어떤 필드에도 쓰지 않는다.
 *
 * ## pointer lock을 잡지 않는다
 * Pointer Lock 사양상 잠금 중에는 모든 마우스 이벤트가 canvas로 전달돼 화면
 * 버튼을 누를 수 없다(EC12-3a 참조). 이 러너는 production이 지원하는 **화면
 * 버튼 경로**로 조작하므로 잠금을 획득하지 않는다.
 *
 * ## 시계
 * telegraph 경과는 **게임 내 dt 누적**으로 잰다. 헤드리스 소프트웨어 렌더링은
 * 벽시계와 게임 시계가 크게 어긋나므로 벽시계 단일 환산을 쓰지 않는다.
 */

import path from 'node:path';
import process from 'node:process';
import {
  openSession,
  hasDebugHandle,
  writeEnvelope,
  printReport,
  projectRoot,
  sleep,
} from './lib/evidence-harness.mjs';

const OUT = process.env.DEEP_DIVE_EVIDENCE_OUT
  ? path.resolve(process.env.DEEP_DIVE_EVIDENCE_OUT)
  : path.join(projectRoot, 'scratchpad', 'm1-m2-final-evidence', 'boss-phase-victory.json');

const startedAt = new Date().toISOString();
const items = [];
const add = (id, label, status, detail, extra = {}) =>
  items.push({ id, label, status, detail, ...extra });

const session = await openSession();
const { page } = session;

/** 이벤트 **구독만** 한다 — 발행하지 않는다 */
async function attachObservers() {
  return page.evaluate(() => {
    const dbg = globalThis.__deepDiveDebug;
    if (!dbg?.bus) return false;
    const log = [];
    const counts = {};
    const phases = [];
    const telegraphs = [];
    globalThis.__ev = { log, counts, phases, telegraphs };
    const bump = (n) => (counts[n] = (counts[n] ?? 0) + 1);
    for (const name of [
      'metaStateChanged', 'sortieEnded', 'saveRequested', 'bossDefeated',
      'bossHit', 'bossSpawned', 'interactionCollected', 'torpedoFired',
      'sortieFailed', 'lootCollected',
    ]) {
      dbg.bus.on(name, (p) => { bump(name); log.push({ name, p }); });
    }
    dbg.bus.on('bossPhaseChanged', (p) => { bump('bossPhaseChanged'); phases.push(p?.phase); });
    dbg.bus.on('bossTelegraphStarted', (p) => telegraphs.push({ kind: p?.kind, at: 'start' }));
    return true;
  });
}

const snap = () =>
  page.evaluate(() => {
    const dbg = globalThis.__deepDiveDebug;
    const ev = globalThis.__ev ?? { counts: {}, phases: [], telegraphs: [], log: [] };
    const meta = dbg?.meta;
    return {
      metaState: meta?.state ?? meta?.metaState ?? null,
      wallet: dbg?.economy?.wallet ? { ...dbg.economy.wallet } : null,
      counts: { ...ev.counts },
      phases: [...ev.phases],
      telegraphs: [...ev.telegraphs],
    };
  });

try {
  const debugAvailable = await hasDebugHandle(page);
  const ok = debugAvailable ? await attachObservers() : false;
  add('BOSS-0', '읽기 전용 관측 핸들 · 이벤트 구독 준비', ok ? 'pass' : 'blocked',
    ok ? '__deepDiveDebug.bus 구독 성공 — 구독만 하고 발행하지 않는다'
       : 'DEV 읽기 전용 핸들이 없어 관측 불가');

  const before = await snap();
  add('ECON-0', '출항 전 wallet 관측(읽기 전용)', before.wallet ? 'pass' : 'blocked',
    before.wallet ? `wallet=${JSON.stringify(before.wallet)}` : 'wallet 관측 불가',
    { observed: { wallet: before.wallet } });

  // ── 중어뢰 구매 가능 여부 — 실제 BASE UI만 사용 ──────────────
  const heavyRow = page.locator('[data-equipment-row="heavyTorpedo"]');
  const heavyPresent = await heavyRow.count().then((n) => n > 0).catch(() => false);
  if (!heavyPresent) {
    add('ECON-1', '중어뢰 구매 — 실제 BASE UI', 'blocked',
      '[data-equipment-row="heavyTorpedo"] 행을 찾지 못했습니다 (BASE 장비 목록 미노출)');
  } else {
    const label = (await heavyRow.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
    const buyBtn = heavyRow.locator('button').first();
    const disabled = await buyBtn.isDisabled().catch(() => true);
    if (disabled) {
      add('ECON-1', '중어뢰 구매 — 실제 BASE UI', 'blocked',
        `구매 버튼이 비활성 상태다 — 자금 부족 또는 경제 데이터 미확정. ` +
        `credits를 직접 설정하지 않으므로 여기서 구매하지 않는다. 행 표시="${label}"`,
        { observed: { rowText: label } });
    } else {
      const btnText = (await buyBtn.innerText().catch(() => '')).trim();
      await buyBtn.click();
      await sleep(1200);
      const after = await snap();
      const spent = JSON.stringify(before.wallet) !== JSON.stringify(after.wallet);
      // 지갑이 그대로면 '구매 1회'가 성립하지 않는다 — 클릭했다는 사실만으로
      // pass로 올리면 빈 PASS가 된다.
      add('ECON-1', '중어뢰 구매 정확히 1회 — 실제 BASE UI', spent ? 'pass' : 'blocked',
        spent
          ? `실제 구매 버튼 클릭으로 지갑 변동 관측 — ${JSON.stringify(before.wallet)} → ${JSON.stringify(after.wallet)}`
          : `버튼("${btnText}")을 실제로 눌렀으나 지갑이 변하지 않았다 — ` +
            `중어뢰가 시작 보유 장비이거나 경제 데이터 미확정이라 '구매 1회' 경로가 성립하지 않는다. ` +
            `클릭 사실만으로 구매를 pass로 올리지 않는다. wallet=${JSON.stringify(after.wallet)}`,
        { observed: { walletBefore: before.wallet, walletAfter: after.wallet, buttonText: btnText } });
    }
  }

  // ── 실제 출항 ───────────────────────────────────────────────
  const depart = page.locator('[data-ui-sortie-prep] button', { hasText: '출항' }).first();
  const departOk = await depart.isVisible().catch(() => false);
  if (departOk) {
    await depart.click();
    await sleep(2500);
  }
  const inSortie = (await snap()).metaState === 'SORTIE';
  add('ECON-2', '실제 출항 버튼 클릭 → SORTIE', inSortie ? 'pass' : 'blocked',
    inSortie ? '실제 UI 클릭으로 출항' : '출항 버튼을 누르지 못했습니다');

  // ── 단서 진행 관측 (강제 수집 없음) ─────────────────────────
  await sleep(6000);
  const mid = await snap();
  add('EC-CLUE', '단서 3/3 진행 — 실제 F 홀드 회수만 인정',
    (mid.counts.interactionCollected ?? 0) >= 3 ? 'pass' : 'notRun',
    `interactionCollected=${mid.counts.interactionCollected ?? 0}/3 — 실제 항행·F 홀드로만 진행한다. ` +
    '단서를 강제 수집하거나 save를 주입하지 않으므로, 완주하지 않은 상태를 pass로 올리지 않는다',
    { observed: { interactionCollected: mid.counts.interactionCollected ?? 0 }, expected: { interactionCollected: 3 } });

  // ── EC9 보스 hull·phase ─────────────────────────────────────
  const bossSeen = (mid.counts.bossSpawned ?? 0) > 0;
  add('EC9', '보스 hull 12 → 7(phase2) → 2(phase3) → 0(격파), 약점 개방마다 1발',
    bossSeen ? 'notRun' : 'blocked',
    bossSeen
      ? `보스는 spawn됐으나 중어뢰 3발 실측을 완주하지 않았다 (bossHit=${mid.counts.bossHit ?? 0}) — ` +
        'boss hull 직접 변경·bossHit 직접 발행을 쓰지 않으므로 미완주를 pass로 올리지 않는다'
      : '단서 3/3 미달로 보스 구역에 진입하지 못했다 — 강제 spawn을 쓰지 않는다',
    { observed: { bossSpawned: mid.counts.bossSpawned ?? 0, bossHit: mid.counts.bossHit ?? 0 } });

  add('EC9-phase', 'phase 1→2 정확히 1회 · 2→3 정확히 1회 · 역행 0 · 중복 0',
    mid.phases.length === 0 ? 'blocked' : 'notRun',
    mid.phases.length === 0
      ? '보스 미조우로 phase 전이가 발생하지 않았다 — 0회를 정상 통과로 적지 않는다'
      : `관측된 전이=[${mid.phases.join(' → ')}] — 완주하지 않아 판정하지 않는다`,
    { observed: { phases: mid.phases } });

  // ── EC10 telegraph (게임 dt 기준) ───────────────────────────
  add('EC10', 'telegraph 예고 — 게임 dt 기준, params 1.8초와 대조',
    mid.telegraphs.length === 0 ? 'blocked' : 'notRun',
    mid.telegraphs.length === 0
      ? '보스 미조우로 telegraph를 관측하지 못했다. 벽시계 단일 환산을 쓰지 않으며 ' +
        '게임 dt 누적으로만 재므로, 미관측을 0초로 적지 않는다'
      : `관측된 telegraph=${mid.telegraphs.length}건 — 완주하지 않아 판정하지 않는다`,
    { observed: { telegraphs: mid.telegraphs.length } });

  // ── EC13 승리·보상·저장 ─────────────────────────────────────
  add('EC13', 'bossDefeated 1회 · loot 1회 · rare part 증가 · 정산·저장 각 1회 · reload 유지',
    (mid.counts.bossDefeated ?? 0) > 0 ? 'notRun' : 'blocked',
    `bossDefeated=${mid.counts.bossDefeated ?? 0} · sortieEnded=${mid.counts.sortieEnded ?? 0} · ` +
    `saveRequested=${mid.counts.saveRequested ?? 0} — 격파를 완주하지 않았다. 강제 격파를 쓰지 않는다`,
    { observed: { bossDefeated: mid.counts.bossDefeated ?? 0 } });

  // ── EC17 재출항 잔존물 ──────────────────────────────────────
  add('EC17', '재출항 시 이전 boss·projectile·telegraph·BossHealthHud 0 · 새 보스 1개',
    'blocked',
    '첫 출항에서 보스를 격파하지 못해 두 번째 출항 비교 기준이 없다 — ' +
    '잔존물 0을 관측 없이 기록하지 않는다');

  await session.drainPageErrors();
  const errs = session.consoleErrors.length + session.pageErrors.length + session.pointerLockErrors.length;
  add('BOSS-ERR', '콘솔·페이지·pointerlock·WebGL·save 오류 0', errs === 0 ? 'pass' : 'fail',
    errs === 0 ? '수집된 오류 0건'
      : `오류 ${errs}건: ${[...session.consoleErrors, ...session.pageErrors].slice(0, 4).join(' | ')}`,
    { observed: { errorCount: errs } });

  const result = await writeEnvelope({ session, runner: 'evidence-boss-closure', items, startedAt, outFile: OUT });
  printReport(result, OUT);
  console.log(
    '\n주의: 이 러너는 관측만 한다. credits·rare part·장비·boss hull·bossHit·약점·spawn·save를\n' +
    '      직접 조작하지 않으므로, 완주하지 못한 항목은 notRun/blocked로 남고 pass로 올라가지 않는다.',
  );
  process.exitCode = 0;
} finally {
  await session.close();
}
