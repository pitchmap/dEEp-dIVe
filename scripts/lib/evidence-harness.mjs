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
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CHROMIUM = process.env.DEEP_DIVE_CHROMIUM ?? '/opt/pw-browsers/chromium';
const PORT = Number(process.env.DEEP_DIVE_EVIDENCE_PORT ?? 5211);
const BASE_URL = process.env.DEEP_DIVE_DEV_URL ?? `http://localhost:${PORT}/`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** storageState 입력이 잘못됐을 때 **빈 context로 조용히 fallback하지 않는다** */
export class HarnessStorageStateError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

/**
 * opt-in production 프로필(Playwright storageState) 해석.
 *
 * worktree와 browser storage는 별개다 — `browser.newContext()`는 매번 빈
 * localStorage·IndexedDB·cookies로 시작하므로, 다른 worktree에 실제 clues 3/3
 * 프로필이 있어도 자동으로 승계되지 않는다. 그래서 **공식 `storageState`
 * 입력**으로만 기존 production 플레이 결과를 재사용한다.
 *
 * 이것은 상태를 새로 주입하거나 조작하는 것이 아니다 — `page.evaluate()`로
 * localStorage를 쓰거나 save API를 부르거나 clue 값을 만들지 않는다.
 *
 * env 미설정이면 `{ storageStateLoaded: false }`를 돌려주고 기존과 동일하게
 * 빈 context로 실행한다(default CI 동작 불변).
 */
export function resolveEvidenceStorageState(baseUrl, env = process.env) {
  const raw = env.DEEP_DIVE_EVIDENCE_STORAGE_STATE;
  if (!raw || raw.trim() === '') {
    return {
      storageStateLoaded: false, path: null, sha256: null,
      fileName: null, originCount: 0, provenance: null,
    };
  }
  const file = path.resolve(raw);

  if (!existsSync(file)) {
    throw new HarnessStorageStateError('HARNESS_STORAGE_STATE_INVALID', `파일이 없습니다: ${path.basename(file)}`);
  }
  if (!statSync(file).isFile()) {
    throw new HarnessStorageStateError('HARNESS_STORAGE_STATE_INVALID', `일반 파일이 아닙니다: ${path.basename(file)}`);
  }

  // 저장소 tracked 파일을 프로필로 쓰지 않는다 — production 프로필은
  // scratchpad 전용이며 git에 들어가면 안 된다.
  //
  // 절대 경로를 그대로 넘기면 tracked 파일을 놓칠 수 있어, 저장소 **내부**
  // 파일만 상대 경로로 조회한다. 저장소 밖 파일은 애초에 이 저장소의 tracked
  // 파일일 수 없으므로 검사를 건너뛴다.
  const relative = path.relative(projectRoot, file);
  const insideRepository =
    relative !== '' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  if (insideRepository) {
    let tracked = false;
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', '--', relative],
        { cwd: projectRoot, stdio: 'ignore' });
      tracked = true;
    } catch {
      tracked = false; // untracked(예: gitignored scratchpad) — 정상 경로다.
    }
    if (tracked) {
      throw new HarnessStorageStateError('HARNESS_STORAGE_STATE_INVALID',
        'storageState가 저장소 tracked 파일입니다 — production 프로필은 scratchpad에 두고 git에 넣지 않는다');
    }
  }

  const text = readFileSync(file, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HarnessStorageStateError('HARNESS_STORAGE_STATE_INVALID', '유효한 JSON이 아닙니다');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HarnessStorageStateError('HARNESS_STORAGE_STATE_INVALID', '최상위가 객체가 아닙니다');
  }
  if (!Array.isArray(parsed.cookies)) {
    throw new HarnessStorageStateError('HARNESS_STORAGE_STATE_INVALID', 'cookies가 배열이 아닙니다');
  }
  if (!Array.isArray(parsed.origins)) {
    throw new HarnessStorageStateError('HARNESS_STORAGE_STATE_INVALID', 'origins가 배열이 아닙니다');
  }
  for (const o of parsed.origins) {
    if (typeof o?.origin !== 'string' || !Array.isArray(o?.localStorage)) {
      throw new HarnessStorageStateError('HARNESS_STORAGE_STATE_INVALID',
        '각 origin에 origin 문자열과 localStorage 배열이 있어야 합니다');
    }
  }

  // origin이 다르면 localStorage가 적용되지 않는다 — 조용히 넘어가면
  // clues 0/3 blocked가 나오고 원인을 오해하게 된다.
  const runOrigin = new URL(baseUrl).origin;
  if (!parsed.origins.some((o) => o.origin === runOrigin)) {
    throw new HarnessStorageStateError('HARNESS_STORAGE_STATE_INVALID',
      `실행 origin(${runOrigin})과 일치하는 상태가 없습니다 — ` +
      `프로필 origin: ${parsed.origins.map((o) => o.origin).join(', ') || '없음'}. ` +
      'origin 문자열을 고치지 말고 DEEP_DIVE_DEV_URL을 프로필 생성 URL과 맞추거나 동일 origin에서 다시 export하세요');
  }

  const provenance = env.DEEP_DIVE_EVIDENCE_PROFILE_PROVENANCE;
  if (!provenance || provenance.trim() === '') {
    throw new HarnessStorageStateError('HARNESS_STORAGE_STATE_PROVENANCE_MISSING',
      'storageState를 쓰는 production evidence에는 DEEP_DIVE_EVIDENCE_PROFILE_PROVENANCE가 필요합니다');
  }

  return {
    storageStateLoaded: true,
    path: file,
    sha256: createHash('sha256').update(text).digest('hex'),
    // 전체 경로·raw 내용은 결과·로그에 싣지 않는다.
    fileName: path.basename(file),
    originCount: parsed.origins.length,
    provenance: provenance.trim(),
  };
}

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
  // env가 잘못됐으면 여기서 즉시 던진다 (dev 서버·브라우저 기동 전).
  const profile = resolveEvidenceStorageState(BASE_URL);

  await ensureDevServer();

  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--use-gl=swiftshader'],
  });
  // 프로필은 브라우저 기동 **전에** 검증한다 — 잘못된 입력으로 빈 context를
  // 돌려 clues 0/3 blocked를 만들지 않는다.
  const contextOptions = { viewport };
  if (profile.storageStateLoaded) contextOptions.storageState = profile.path;
  const ctx = await browser.newContext(contextOptions);

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
    // raw cookies·localStorage 값은 싣지 않는다 — 안전한 메타데이터만.
    profile: {
      storageStateLoaded: profile.storageStateLoaded,
      storageStateSha256: profile.sha256,
      storageStateFileName: profile.fileName,
      storageStateOriginCount: profile.originCount,
      provenance: profile.provenance,
    },
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
    profile: session.profile ?? {
      storageStateLoaded: false, storageStateSha256: null,
      storageStateFileName: null, storageStateOriginCount: 0, provenance: null,
    },
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
  const pf = envelope.profile;
  console.log(
    `profile: storageStateLoaded=${pf.storageStateLoaded}` +
      (pf.storageStateLoaded
        ? ` file=${pf.storageStateFileName} sha256=${pf.storageStateSha256?.slice(0, 12)}… ` +
          `origins=${pf.storageStateOriginCount} provenance=${pf.provenance}`
        : ' (빈 context — 기존 프로필을 승계하지 않는다)'),
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
