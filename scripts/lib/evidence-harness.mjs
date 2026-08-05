/**
 * M1·M2 Closure production evidence 러너 공용 하네스.
 *
 * 규칙(§4)을 한 곳에 모아 러너마다 다시 구현하지 않는다:
 *  - persistent context의 초기 `about:blank`를 쓰지 않고 항상 `ctx.newPage()`
 *  - 초기 blank page는 닫는다
 *  - production URL에 쿼리 파라미터 0개
 *  - fixtureLoaded 확인
 *  - 실제 canvas 클릭으로 pointer lock 획득
 *  - 실제 keyboard/mouse/UI 입력만 사용 — 내부 상태 주입 없음
 *  - 내부 핸들(`__deepDiveDebug`)은 **읽기 전용 관측**에만 쓴다
 *
 * 오류는 console.error · pageerror · unhandledrejection · pointerlockerror ·
 * WebGL error · save error를 모두 모은다.
 */

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CHROMIUM = process.env.DEEP_DIVE_CHROMIUM ?? '/opt/pw-browsers/chromium';
const PORT = Number(process.env.DEEP_DIVE_EVIDENCE_PORT ?? 5211);
const BASE_URL = process.env.DEEP_DIVE_DEV_URL ?? `http://localhost:${PORT}/`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function gitSha(rev) {
  try {
    return execFileSync('git', ['rev-parse', rev], { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch {
    return '(unknown)';
  }
}

/** 개발 서버 — `__deepDiveDebug` 읽기 전용 핸들이 DEV 빌드에만 있어 dev 서버를 쓴다 */
let devServer = null;
async function ensureDevServer() {
  if (process.env.DEEP_DIVE_DEV_URL) return;
  devServer = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
    cwd: projectRoot,
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(BASE_URL);
      if (res.ok) return;
    } catch {
      /* 기동 중 */
    }
    await sleep(500);
  }
  throw new Error('개발 서버가 40초 내에 응답하지 않았습니다.');
}

function stopDevServer() {
  if (devServer && !devServer.killed) devServer.kill('SIGTERM');
}

/**
 * production 진입 세션을 연다. 쿼리 파라미터를 붙이지 않고, 초기 blank page를
 * 닫은 뒤 **새 page**에서 시작한다.
 */
export async function openSession({ viewport = { width: 1600, height: 900 } } = {}) {
  if (!existsSync(CHROMIUM)) {
    throw new Error(`Chromium 실행 파일이 없습니다: ${CHROMIUM} (env DEEP_DIVE_CHROMIUM)`);
  }
  await ensureDevServer();

  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--use-gl=swiftshader'],
  });
  const ctx = await browser.newContext({ viewport });

  // 초기 about:blank를 쓰지 않는다 — 항상 새 page를 열고 blank는 닫는다.
  const preexisting = ctx.pages();
  const page = await ctx.newPage();
  for (const p of preexisting) {
    if (p !== page) await p.close().catch(() => {});
  }

  const consoleErrors = [];
  const pageErrors = [];
  const pointerLockErrors = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    consoleErrors.push(text);
  });
  page.on('pageerror', (err) => pageErrors.push(String(err?.message ?? err)));

  // unhandledrejection · pointerlockerror · WebGL · save 오류를 페이지 안에서 모은다.
  await page.addInitScript(() => {
    const sink = [];
    Object.defineProperty(window, '__evidenceErrors', { value: sink, writable: false });
    window.addEventListener('unhandledrejection', (e) =>
      sink.push(`unhandledrejection: ${String(e.reason)}`),
    );
    document.addEventListener('pointerlockerror', () => sink.push('pointerlockerror'));
    window.addEventListener('error', (e) => {
      const m = String(e.message ?? '');
      if (/webgl|context lost/i.test(m)) sink.push(`webgl: ${m}`);
    });
  });

  // 쿼리 파라미터 0개로 진입한다.
  const urlQuery = new URL(BASE_URL).search;
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#game-canvas', { timeout: 30_000 });
  await sleep(1500);

  const browserVersion = browser.version();

  return {
    browser,
    ctx,
    page,
    urlQuery,
    browserVersion,
    viewport,
    consoleErrors,
    pageErrors,
    pointerLockErrors,
    async drainPageErrors() {
      const found = await page.evaluate(() => {
        const s = window.__evidenceErrors ?? [];
        return s.splice(0, s.length);
      });
      for (const entry of found) {
        if (entry === 'pointerlockerror') pointerLockErrors.push(entry);
        else pageErrors.push(entry);
      }
    },
    async close() {
      await ctx.close().catch(() => {});
      await browser.close().catch(() => {});
      stopDevServer();
    },
  };
}

/** fixture 장착 여부 — production 증거 판정의 전제 */
export async function readFixtureLoaded(page) {
  return page.evaluate(() => {
    const g = globalThis;
    // fixture 패널이 DOM에 있으면 장착된 것으로 본다 (production 진입에는 없다).
    if (document.querySelector('[data-ui-c-fixture-panel],[data-ui-econ-demo-panel]')) return true;
    const dbg = g.__deepDiveDebug;
    if (dbg && (dbg.sprintBFixture != null || dbg.sonarFixture != null)) return true;
    return false;
  });
}

/** 읽기 전용 관측 핸들이 살아 있는지 */
export async function hasDebugHandle(page) {
  return page.evaluate(() => Boolean(globalThis.__deepDiveDebug));
}

/**
 * 실제 canvas 클릭으로 pointer lock을 얻는다. 합성 이벤트가 아니라 실제
 * 마우스 클릭이며, `requestPointerLock()`을 직접 호출하지 않는다.
 */
export async function acquirePointerLock(page) {
  const box = await page.locator('#game-canvas').boundingBox();
  if (!box) throw new Error('#game-canvas 를 찾지 못했습니다');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(400);
  return page.evaluate(() => document.pointerLockElement?.id ?? null);
}

export async function pointerLockId(page) {
  return page.evaluate(() => document.pointerLockElement?.id ?? null);
}

/**
 * 게임 내 시계(dt 누적)로 경과를 잰다. 벽시계 단일 환산을 쓰지 않는다 —
 * 헤드리스 소프트웨어 렌더링에서는 벽시계와 게임 dt가 크게 어긋난다.
 */
export async function readGameClock(page) {
  return page.evaluate(() => {
    const dbg = globalThis.__deepDiveDebug;
    const meta = dbg?.meta;
    // 읽기 전용 관측만 — 어떤 값도 쓰지 않는다.
    return {
      metaState: meta?.state ?? meta?.metaState ?? null,
      available: Boolean(dbg),
    };
  });
}

/** 결과 봉투를 만들고 스키마로 검증한 뒤 scratchpad에 쓴다 */
export async function writeEnvelope({ session, runner, items, startedAt, outFile }) {
  await session.drainPageErrors();
  const fixtureLoaded = await readFixtureLoaded(session.page);

  const envelope = {
    runner,
    baseSha: gitSha('origin/dev'),
    headSha: gitSha('HEAD'),
    fixtureLoaded,
    urlQuery: session.urlQuery,
    browserVersion: session.browserVersion,
    viewport: session.viewport,
    startedAt,
    finishedAt: new Date().toISOString(),
    consoleErrors: session.consoleErrors,
    pageErrors: session.pageErrors,
    pointerLockErrors: session.pointerLockErrors,
    items,
  };

  const { validateEnvelope, summarize } = await import('../../src/tools/evidenceSchema.ts');
  validateEnvelope(envelope);
  const summary = summarize(envelope);

  if (outFile) {
    mkdirSync(path.dirname(outFile), { recursive: true });
    writeFileSync(outFile, `${JSON.stringify({ ...envelope, summary }, null, 2)}\n`, 'utf8');
  }
  return { envelope, summary };
}

const STATUS_MARK = {
  pass: '✔',
  fail: '✖',
  blocked: '⛔',
  harness: '🔧',
  notRun: '·',
  manual: '◻',
};

export function printReport({ envelope, summary }, outFile) {
  console.log(`\n── ${envelope.runner} ──`);
  console.log(
    `base=${envelope.baseSha.slice(0, 7)} head=${envelope.headSha.slice(0, 7)} ` +
      `fixtureLoaded=${envelope.fixtureLoaded} urlQuery=${JSON.stringify(envelope.urlQuery)}`,
  );
  for (const item of envelope.items) {
    console.log(`${STATUS_MARK[item.status]} [${item.status}] ${item.id} ${item.label}`);
    console.log(`    → ${item.detail}`);
  }
  console.log('\n=== 요약 ===');
  for (const [k, v] of Object.entries(summary.counts)) if (v > 0) console.log(`  ${k.padEnd(8)} ${v}`);
  console.log(`  오류 ${summary.errorCount}건`);
  console.log(`  production 증거: ${summary.productionEvidence} — ${summary.productionEvidenceReason}`);
  if (summary.unsatisfied.length > 0) {
    console.log(`  미충족: ${summary.unsatisfied.join(' · ')}`);
  }
  if (outFile) console.log(`\n결과: ${path.relative(projectRoot, outFile)}`);
}
