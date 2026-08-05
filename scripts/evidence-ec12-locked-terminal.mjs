#!/usr/bin/env node
/**
 * EC12 locked terminal transition production evidence 러너 (Phase B).
 *
 * Phase A에서 확인한 제약:
 *   Pointer Lock 유지 중에는 실제 마우스 클릭이 전부 canvas로 라우팅되므로
 *   `locked SORTIE → 귀환 버튼 클릭 → DEBRIEF` 경로는 **성립하지 않는다**.
 *   PR #23은 DEBRIEF 진입 후 lock을 푸는 수정이지, 잠금 중 버튼을 누를 수
 *   있게 만드는 수정이 아니다 — EC12-3a를 억지로 pass로 만들지 않는다.
 *
 * 따라서 잠금 상태 DEBRIEF의 실제 진입 경로는 둘뿐이다:
 *   A. 실제 적·보스 공격으로 플레이어 파괴   ← 이 러너
 *   B. 실제 보스 격파로 승리 DEBRIEF 자동 진입 (evidence-boss-closure)
 *
 * 강제 피해·강제 격파·체력 직접 변경을 쓰지 않는다. 피격이 성립하지 않으면
 * §8-3 진단(플레이 시간·위치·거리·phase·공격 횟수·hull 변화)을 기록하고
 * `blocked`로 남긴다.
 *
 * 내부 상태 쓰기 0. `__deepDiveDebug`는 읽기 전용 관측과 **실제 입력 방향
 * 결정**에만 쓴다 — 좌표를 주입하지 않고 W/A/S/D·마우스로만 조작한다.
 * `exitPointerLock()` 직접 호출·confirm command 직접 호출·dispatchEvent 클릭
 * 위장은 하지 않는다.
 */

import path from 'node:path';
import process from 'node:process';
import {
  openSession, acquirePointerLock, pointerLockId, hasDebugHandle,
  writeEnvelope, printReport, projectRoot, sleep,
} from './lib/evidence-harness.mjs';

// 판정식은 **한 벌만** 둔다 — 러너 안에 복제하지 않고 순수 모듈을 그대로 쓴다.
// Node 22 type stripping으로 .ts를 직접 import한다(하네스도 같은 방식).
const { judgeEc12LockedPath, classifyHullDamage, EC12_CONDITION_COUNT } =
  await import('../src/tools/evidenceSchema.ts');

const OUT = process.env.DEEP_DIVE_EVIDENCE_OUT
  ? path.resolve(process.env.DEEP_DIVE_EVIDENCE_OUT)
  : path.join(projectRoot, 'scratchpad', 'm1-m2-final-evidence', 'phase-b-ec12-defeat.json');
/**
 * 실제 피격을 기다리는 최대 관측 시간(초). Phase C 실측이 629초였으므로
 * 기본값을 20분으로 둔다 — default CI에서는 실행하지 않는 opt-in 러너다.
 */
const HUNT_SECONDS = Number(process.env.DEEP_DIVE_EC12_HUNT_SECONDS ?? 1200);
/** 무피해가 이 시간을 넘을 때만 실제 입력으로 위치를 보정한다 */
const IDLE_NUDGE_SECONDS = Number(process.env.DEEP_DIVE_EC12_IDLE_NUDGE_SECONDS ?? 90);

const startedAt = new Date().toISOString();
const items = [];
const add = (id, label, status, detail, extra = {}) =>
  items.push({ id, label, status, detail, ...extra });

const session = await openSession();
const { page } = session;

async function attachObservers() {
  return page.evaluate(() => {
    const dbg = globalThis.__deepDiveDebug;
    if (!dbg?.bus) return false;
    const counts = {};
    const order = [];
    const lockChanges = [];
    const hullEvents = [];
    globalThis.__ec12 = { counts, order, lockChanges, hullEvents };
    const bump = (n) => (counts[n] = (counts[n] ?? 0) + 1);

    // **계약(src/contracts/events.ts)에 실재하는 이름만 구독한다.**
    // 존재하지 않는 이름을 구독하면 영원히 0건이 나오고, 그 0을 '피격이
    // 성립하지 않는다'는 결론으로 오독하게 된다 — Phase B가 정확히 그랬다.
    for (const n of ['metaStateChanged', 'sortieEnded', 'saveRequested',
                     'sortieFailed', 'playerDestroyed', 'bossDefeated', 'lootDropped']) {
      dbg.bus.on(n, (p) => { bump(n); order.push(n === 'metaStateChanged' ? `meta:${p?.next}` : n); });
    }

    // hullDamaged — 실제 피해 정본. 매 건의 맥락을 함께 남긴다.
    const readPose = (src) => {
      try {
        const v = typeof src === 'function' ? src() : (typeof src?.pose === 'function' ? src.pose() : src);
        return v && typeof v.x === 'number' ? { x: v.x, y: v.y ?? null, z: v.z } : null;
      } catch { return null; }
    };
    globalThis.__ec12.lockAtLethalDamage = undefined;
    dbg.bus.on('hullDamaged', (p) => {
      bump('hullDamaged');
      // **절대 선체 snapshot** — hullRemaining은 0~1 비율이라 amount와 직접
      // 비교할 수 없다. 읽기 전용으로 현재/최대 절대값을 함께 남긴다.
      const hullSrc = dbg.playerHull;
      const readNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      const currentHullAfter = readNum(hullSrc?.currentHull ?? hullSrc?.current);
      const maxHull = readNum(hullSrc?.maxHull ?? hullSrc?.max);
      const amount = p?.amount ?? null;
      const currentHullBefore =
        currentHullAfter !== null && amount !== null ? currentHullAfter + amount : null;
      const player = readPose(dbg.pose);
      const bossView = (() => { try { return dbg.runtimeClosure?.bossView ?? null; } catch { return null; } })();
      const bossPos = bossView && typeof bossView.x === 'number' ? { x: bossView.x, z: bossView.z } : null;
      const dist = player && bossPos
        ? Math.hypot(player.x - bossPos.x, player.z - bossPos.z) : null;
      hullEvents.push({
        amount: p?.amount ?? null,
        hullRemaining: p?.hullRemaining ?? null,
        cause: p?.cause ?? null,
        player,
        bossPos,
        distance: dist,
        bossPhase: bossView?.phase ?? null,
        pointerLockElement: document.pointerLockElement?.id ?? null,
        metaState: dbg.meta?.state ?? dbg.meta?.metaState ?? null,
        currentHullAfter,
        currentHullBefore,
        maxHull,
        lastDamageSource: p?.cause ?? null,
        lastDamageAmount: amount,
        isDestroyed: currentHullAfter === 0 || p?.hullRemaining === 0,
      });
      // 치명 이벤트 시점의 잠금 — hullDamaged가 playerDestroyed보다 먼저
      // 발행되므로 여기서 잡아야 DEBRIEF 이후 잠금과 섞이지 않는다.
      if ((currentHullAfter === 0 || p?.hullRemaining === 0)
          && globalThis.__ec12.lockAtLethalDamage === undefined) {
        globalThis.__ec12.lockAtLethalDamage = document.pointerLockElement?.id ?? null;
      }
    });

    // pointerlockchange는 **구독만** 한다 — 잠금을 걸거나 풀지 않는다.
    document.addEventListener('pointerlockchange', () => {
      lockChanges.push({ el: document.pointerLockElement?.id ?? null });
    });
    return true;
  });
}

/** 읽기 전용 관측 — 어떤 필드에도 쓰지 않는다 */
const probe = () =>
  page.evaluate(() => {
    const d = globalThis.__deepDiveDebug;
    const ev = globalThis.__ec12 ?? { counts: {}, order: [], lockChanges: [], hullEvents: [] };
    // 관측 API 형태가 역할별로 달라 방어적으로 읽는다 — 어떤 경로로도 쓰지 않는다.
    const readPose = (src) => {
      if (!src) return null;
      try {
        const v = typeof src === 'function' ? src() : (typeof src.pose === 'function' ? src.pose() : src);
        return v && typeof v.x === 'number' ? { x: v.x, y: v.y ?? null, z: v.z } : null;
      } catch { return null; }
    };
    const pose = readPose(d?.pose);
    const hullSrc = d?.playerHull;
    return {
      metaState: d?.meta?.state ?? d?.meta?.metaState ?? null,
      lock: document.pointerLockElement?.id ?? null,
      hull: (() => {
        try {
          if (!hullSrc) return null;
          if (typeof hullSrc.hullRatio === 'function') return hullSrc.hullRatio();
          if (typeof hullSrc.readModel === 'function') return hullSrc.readModel();
          return hullSrc.ratio ?? hullSrc.current ?? null;
        } catch { return null; }
      })(),
      aiming: (() => { try { return d?.aim?.aiming ?? null; } catch { return null; } })(),
      player: pose,
      bossView: d?.runtimeClosure?.bossView ?? null,
      bossSpawned: d?.runtimeClosure?.bossSpawned ?? null,
      counts: { ...ev.counts },
      order: [...ev.order],
      lockChanges: [...ev.lockChanges],
      hullEvents: [...(ev.hullEvents ?? [])],
      lockAtLethalDamage: ev.lockAtLethalDamage,
    };
  });

try {
  const dbgOk = (await hasDebugHandle(page)) ? await attachObservers() : false;
  add('EC12B-0', '읽기 전용 관측 준비 (구독만, 발행 없음)', dbgOk ? 'pass' : 'blocked',
    dbgOk ? '__deepDiveDebug.bus 및 pointerlockchange 구독' : 'DEV 관측 핸들 없음');

  // ── 실제 출항 ───────────────────────────────────────────────
  await page.locator('[data-ui-sortie-prep] button', { hasText: '출항' }).first()
    .click({ timeout: 8000 }).catch(() => {});
  await sleep(2500);
  const afterDepart = await probe();
  add('EC12B-1', '실제 출항 버튼 클릭 → SORTIE', afterDepart.metaState === 'SORTIE' ? 'pass' : 'blocked',
    `metaState=${afterDepart.metaState}`, { observed: { metaState: afterDepart.metaState } });

  // ── 실제 canvas 클릭으로 Pointer Lock 획득 ──────────────────
  const lockId = await acquirePointerLock(page);
  const locked = lockId === 'game-canvas';
  add('EC12B-2', '실제 canvas 클릭으로 Pointer Lock 획득 (requestPointerLock 직접 호출 없음)',
    locked ? 'pass' : 'harness',
    locked ? 'document.pointerLockElement === #game-canvas'
           : `잠금 미획득(pointerLockElement=${String(lockId)}) — 헤드리스 한계. production 정상으로 처리하지 않는다`,
    { observed: { pointerLockElement: lockId } });

  // ── 실제 플레이 입력을 유지하며 피격을 기다린다 ─────────────
  //   강제 피해 없음. W/A/S/D 실제 키 입력만 쓰고 좌표를 주입하지 않는다.
  const start = await probe();
  const hullStart = start.hull;
  let last = start;
  let reachedDebrief = false;
  let lockAtDebrief = 'NOT_OBSERVED';
  const ticks = Math.max(1, Math.round(HUNT_SECONDS / 2));

  // ── 정지 전략 (Phase C 성공 경로) ───────────────────────────
  //   보스 생성 후에는 **회피하지 않고 정지**한다. 지속 KeyW·지속 마우스
  //   이동은 공격 범위를 벗어나게 만들어 Phase B가 피격에 실패한 원인이었다.
  //   Esc를 쓰지 않는다.
  let lastDamageAt = Date.now();
  let nudges = 0;
  for (let i = 0; i < Math.max(1, Math.round(HUNT_SECONDS / 2)); i++) {
    await sleep(2000);
    last = await probe();
    if (last.metaState === 'DEBRIEF') {
      lockAtDebrief = last.lock;
      reachedDebrief = true;
      break;
    }
    const damaged = (last.counts.hullDamaged ?? 0) > 0;
    if (damaged && last.hullEvents.length > 0) lastDamageAt = Date.now();

    // 무피해가 길어질 때만 실제 입력으로 위치를 보정하고 곧바로 전부 해제한다.
    if ((Date.now() - lastDamageAt) / 1000 > IDLE_NUDGE_SECONDS) {
      nudges += 1;
      await page.keyboard.down('KeyW');
      await page.mouse.move(30, 0);
      await sleep(1500);
      await page.keyboard.up('KeyW').catch(() => {});
      await page.mouse.move(0, 0);
      lastDamageAt = Date.now();
    }
  }

  const hullEnd = last.hull;
  const destroyed = (last.counts.playerDestroyed ?? last.counts.destroyed ?? 0) > 0;
  const failed = (last.counts.sortieFailed ?? 0) > 0;

  // ── 선행조건 판정 (§3-4) ────────────────────────────────────
  //   보스가 생성되지 않았다면 이 실행은 **러너 커버리지 부족**이다.
  //   'headless에서 피해가 불가능하다'는 결론으로 일반화하지 않는다.
  const bossReady = last.bossSpawned === true;
  const hullEvents = last.hullEvents ?? [];
  if (!bossReady && !reachedDebrief) {
    add('EC12B-PRE', '러너 선행조건 — 단서 3/3 · boss spawn', 'blocked',
      'BLOCKED_RUNNER_PRECONDITION_NOT_REACHED — bossSpawned=false. ' +
      '이 실행은 단서 수집·보스 구역 항해를 수행하지 않아 플레이어가 시작 지점에 남았다. ' +
      'production의 헤드리스 한계가 아니라 **러너 커버리지의 한계**다 — ' +
      'HEADLESS_DAMAGE_UNSUPPORTED·EC12_FAILED·POINTER_LOCK_FIX_FAILED로 적지 않는다. ' +
      `player=${JSON.stringify(last.player)} · hullDamaged=${hullEvents.length}건`,
      { observed: { bossSpawned: last.bossSpawned, player: last.player, hullDamagedCount: hullEvents.length } });
  } else {
    add('EC12B-PRE', '러너 선행조건 — 단서 3/3 · boss spawn', 'pass',
      `bossSpawned=${String(last.bossSpawned)} — 실제 production 프로필로 보스 구역 도달`,
      { observed: { bossSpawned: last.bossSpawned } });
  }

  // ── 실제 피해·파괴 (§3-2 상세 기록) ─────────────────────────
  // 절대 선체 기반 분류 — 순수 모듈 한 벌만 쓴다.
  const damageDetail = hullEvents.map((e) => ({ ...e, classification: classifyHullDamage(e) }));
  if (!reachedDebrief) {
    add('EC12B-3', '실제 적 공격에 의한 파괴 → DEBRIEF 자동 진입',
      bossReady ? 'blocked' : 'blocked',
      (bossReady
        ? `보스 구역에는 도달했으나 ${HUNT_SECONDS}초 안에 파괴에 이르지 못했다`
        : 'BLOCKED_RUNNER_PRECONDITION_NOT_REACHED — 보스 미생성으로 피해 경로에 도달하지 못했다') +
      ` (강제 피해를 쓰지 않는다). hullDamaged ${hullEvents.length}회 · ` +
      `hull ${JSON.stringify(hullStart)} → ${JSON.stringify(hullEnd)} · ` +
      `player=${JSON.stringify(last.player)} · bossSpawned=${String(last.bossSpawned)} · ` +
      `playerDestroyed=${last.counts.playerDestroyed ?? 0} · sortieFailed=${last.counts.sortieFailed ?? 0} · ` +
      `분류=${JSON.stringify(damageDetail.map((c) => c.classification))} · 이벤트=[${last.order.join(' → ')}]`,
      { observed: { hullEvents: damageDetail, counts: last.counts, player: last.player } });
  } else {
    const destroyedOnce = (last.counts.playerDestroyed ?? 0) === 1;
    const failedOnce = (last.counts.sortieFailed ?? 0) === 1;
    add('EC12B-3', '실제 적 공격에 의한 파괴 → DEBRIEF 자동 진입',
      destroyedOnce && failedOnce && hullEvents.length > 0 ? 'pass' : 'fail',
      `hullDamaged ${hullEvents.length}회 ${JSON.stringify(damageDetail.map((c) => c.amount))} · ` +
      `playerDestroyed=${last.counts.playerDestroyed ?? 0} · sortieFailed=${last.counts.sortieFailed ?? 0} · ` +
      `분류=${JSON.stringify(damageDetail.map((c) => c.classification))} · 이벤트=[${last.order.join(' → ')}]`,
      { observed: { hullEvents: damageDetail, counts: last.counts } });
  }

  // ── **핵심** DEBRIEF 관측 시점의 pointerLockElement ─────────
  if (!locked) {
    add('EC12B-4', 'locked → DEBRIEF 진입 시 pointerLockElement null', 'harness',
      '잠금을 얻지 못해 판정 불가 — harness limitation이며 production 정상으로 처리하지 않는다');
  } else if (!reachedDebrief) {
    add('EC12B-4', 'locked → DEBRIEF 진입 시 pointerLockElement null', 'blocked',
      'DEBRIEF에 도달하지 못해 판정하지 않는다 — 도달 실패를 pass로도 fail로도 적지 않는다');
  } else {
    const nowLock = await pointerLockId(page);
    const released = lockAtDebrief === null || nowLock === null;
    add('EC12B-4', 'locked → DEBRIEF 진입 시 pointerLockElement null',
      released ? 'pass' : 'fail',
      released
        ? `DEBRIEF 관측 시점 lock=${String(lockAtDebrief)} · 직후 lock=${String(nowLock)} — ` +
          'PR #23 종료 메타 자동 해제 확인 (exitPointerLock 직접 호출 없이 관측)'
        : `production issue: DEBRIEF인데 pointerLockElement=${String(nowLock)} (자동 해제 부재)`,
      { observed: { lockAtDebrief, lockAfter: nowLock }, expected: { pointerLockElement: null } });
  }

  // ── programmatic unlock 이후 pause·overlay·aim 잔류 ─────────
  if (reachedDebrief) {
    const ui = await page.evaluate(() => {
      const el = document.querySelector('.resume-overlay');
      const visible = el && !el.classList.contains('hud-hidden')
        && getComputedStyle(el).display !== 'none';
      return { overlayVisible: Boolean(visible), aiming: globalThis.__deepDiveDebug?.aim?.aiming ?? null };
    });
    add('EC12B-5', 'terminal unlock 이후 resume overlay 미표시 · aim 잔류 0',
      !ui.overlayVisible && ui.aiming !== true ? 'pass' : 'fail',
      `resume overlay=${ui.overlayVisible} · aiming=${String(ui.aiming)} — ` +
      '종료 메타 해제가 사용자 Esc로 오인되면 오버레이가 결과 화면을 덮는다',
      { observed: ui });
  } else {
    add('EC12B-5', 'terminal unlock 이후 resume overlay 미표시 · aim 잔류 0', 'blocked',
      'DEBRIEF 미도달로 판정하지 않는다');
  }

  // ── 실제 확인 버튼 클릭 → BASE (trusted 실측) ───────────────
  let clickObs = { trusted: undefined, target: 'NOT_OBSERVED', clicked: false };
  let endSnap = last;
  if (reachedDebrief) {
    // 클릭 **전에** 읽기 전용 리스너를 설치해 실제 이벤트를 관측한다.
    await page.evaluate(() => {
      const rec = { events: [] };
      globalThis.__clickObs = rec;
      for (const type of ['mousedown', 'mouseup', 'click']) {
        document.addEventListener(type, (e) => {
          rec.events.push({ type, tag: e.target?.tagName ?? null, isTrusted: e.isTrusted });
        }, true);
      }
    });

    const confirm = page.locator('[data-ui-sortie-failure] button, [data-ui-sortie-return] button')
      .filter({ hasText: '확인' }).first();
    const box = await confirm.boundingBox().catch(() => null);
    if (box) {
      // 실제 입력만 사용한다 — DOM click()·dispatchEvent를 쓰지 않는다.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.up();
      clickObs.clicked = true;
    }
    await sleep(1800);

    const raw = await page.evaluate(() => (globalThis.__clickObs?.events ?? []));
    const clickEv = [...raw].reverse().find((e) => e.type === 'click');
    clickObs.trusted = clickEv ? clickEv.isTrusted === true : undefined;
    clickObs.target = clickEv ? String(clickEv.tag) : 'NOT_OBSERVED';
    endSnap = await probe();

    add('EC12B-6', '실제 마우스로 확인 버튼 클릭 → BASE',
      clickObs.clicked && clickObs.trusted === true && clickObs.target === 'BUTTON'
        && endSnap.metaState === 'BASE' ? 'pass' : 'fail',
      `click target=${clickObs.target} · isTrusted=${String(clickObs.trusted)} · ` +
      `metaState=${endSnap.metaState} · 관측 이벤트=${JSON.stringify(raw.slice(-3))} ` +
      '(DOM click()·dispatchEvent·confirm command 직접 호출 0)',
      { observed: { ...clickObs, metaState: endSnap.metaState }, expected: { target: 'BUTTON', isTrusted: true, metaState: 'BASE' } });

    const settle = endSnap.counts.sortieEnded ?? 0;
    const save = endSnap.counts.saveRequested ?? 0;
    const debriefs = endSnap.order.filter((o) => o === 'meta:DEBRIEF').length;
    add('EC12B-7', 'settlement 1회 · saveRequested 1회 · 중복 전이 0',
      settle === 1 && save === 1 && debriefs === 1 ? 'pass' : 'fail',
      `sortieEnded=${settle} · saveRequested=${save} · DEBRIEF 전이=${debriefs} · ` +
      `pointerlockchange=${endSnap.lockChanges.length}회 · 전이=[${endSnap.order.join(' → ')}]`,
      { observed: { settle, save, debriefs, lockChanges: endSnap.lockChanges } });
  } else {
    add('EC12B-6', '실제 마우스로 확인 버튼 클릭 → BASE', 'blocked', 'DEBRIEF 미도달로 판정하지 않는다');
    add('EC12B-7', 'settlement 1회 · saveRequested 1회 · 중복 전이 0', 'blocked',
      'DEBRIEF 미도달 — 정산 0회를 실패로도 통과로도 적지 않는다');
  }

  await session.drainPageErrors();
  const errs = session.consoleErrors.length + session.pageErrors.length + session.pointerLockErrors.length;
  add('EC12B-8', 'console·page·pointerlock 오류 0', errs === 0 ? 'pass' : 'fail',
    errs === 0 ? '오류 0건'
      : `오류 ${errs}건: ${[...session.consoleErrors, ...session.pageErrors, ...session.pointerLockErrors].slice(0, 4).join(' | ')}`,
    { observed: { errorCount: errs } });

  // ── 최종 verdict — **전체 조건**만 사용한다 ──────────────────
  //   EC12B-4(잠금 null) 하나만 보고 candidate를 정하면, 피해 0·정산 중복·
  //   trusted click 미확인 상태에서도 yes가 나온다. 판정식은 순수 모듈
  //   judgeEc12LockedPath() 한 벌뿐이고 여기서 복제하지 않는다.
  const fixtureLoadedNow = await (await import('./lib/evidence-harness.mjs')).readFixtureLoaded(page);
  const errCount =
    session.consoleErrors.length + session.pageErrors.length + session.pointerLockErrors.length;
  const overlayNow = reachedDebrief
    ? await page.evaluate(() => {
        const el = document.querySelector('.resume-overlay');
        return Boolean(el && !el.classList.contains('hud-hidden')
          && getComputedStyle(el).display !== 'none');
      })
    : true; // 미관측을 '숨김'으로 위장하지 않는다 — 불충족으로 둔다.

  const observation = {
    urlQuery: session.urlQuery,
    fixtureLoaded: fixtureLoadedNow,
    lockAfterCanvasClick: lockId,
    hullDamagedCount: endSnap.counts.hullDamaged ?? 0,
    playerDestroyed: endSnap.counts.playerDestroyed ?? 0,
    sortieFailed: endSnap.counts.sortieFailed ?? 0,
    // 미관측은 undefined 그대로 넘긴다 — null(정상)로 자동 변환하지 않는다.
    lockBeforeLethal: endSnap.lockAtLethalDamage,
    lockAfterDebrief: reachedDebrief ? lockAtDebrief : undefined,
    resumeOverlayVisible: overlayNow,
    aiming: endSnap.aiming === true,
    confirmClickTrusted: clickObs.trusted,
    confirmClickTarget: clickObs.target,
    reachedBase: endSnap.metaState === 'BASE',
    settlementCount: endSnap.counts.sortieEnded ?? 0,
    saveRequestedCount: endSnap.counts.saveRequested ?? 0,
    errorCount: errCount,
  };
  const verdict = judgeEc12LockedPath(observation);
  add('EC12B-VERDICT', `EC12 locked terminal transition 종합 판정 (${EC12_CONDITION_COUNT}개 조건)`,
    verdict.status, verdict.detail, { observed: { ...observation, unmet: verdict.unmet } });

  // 치명 피해 분류는 **절대 선체**로만 한다 (hullRemaining 비율 아님).
  const classified = (endSnap.hullEvents ?? []).map((e) => ({
    ...e, classification: classifyHullDamage(e),
  }));
  if (classified.length > 0) {
    add('EC12B-DAMAGE', 'hullDamaged 절대 선체 기록 · 치명 clamp 분류', 'pass',
      `${classified.length}건: ${JSON.stringify(classified.map((c) => `${c.amount}→${c.classification}`))} · ` +
      `정지 전략 보정 ${nudges}회`,
      { observed: { hullEvents: classified } });
  }

  const result = await writeEnvelope({
    session, runner: 'evidence-ec12-locked-terminal', items, startedAt, outFile: OUT,
  });
  printReport(result, OUT);

  const verified = verdict.status === 'pass';
  console.log(
    `\nEC12_POINTER_LOCKED_PATH_VERIFIED 후보: ` +
    (verified
      ? `yes — verdict.status=pass (${EC12_CONDITION_COUNT}개 조건 전부 충족)`
      : `no — verdict.status=${verdict.status}, unmet=${verdict.unmet.join(' · ') || '없음'}`) +
    '\n  ※ 정본 플래그는 이 역할이 직접 바꾸지 않는다 — candidate로만 보고한다.',
  );
  process.exitCode = 0;
} finally {
  await session.close();
}
