#!/usr/bin/env node
/**
 * HUD·Pointer Lock·AimSystem 연결 브라우저 검증 33항목 러너 (npm run verify:hud).
 *
 * 기존에 세션 스크래치패드에만 있던 검증을 저장소로 반입한 것 — 재현 조건:
 *  - Chromium 실행 파일: env DEEP_DIVE_CHROMIUM (기본 /opt/pw-browsers/chromium)
 *  - 개발 서버: 스스로 5199 포트에 띄운다 (env DEEP_DIVE_DEV_URL 지정 시 재사용)
 *  - playwright-core(devDependency) 사용 — 브라우저 다운로드 없음
 *
 * 주의: 실제 게임 상태를 조작한다(어뢰 2발 소모, 재장전 대기 ~21초 포함) —
 * 전체 실행 약 60~90초. CI 기본 단계에는 넣지 않는다 (Chromium 필요).
 * Esc 키의 네이티브 Pointer Lock 해제는 헤드리스가 시뮬레이션하지 못해
 * exitPointerLock()으로 동일 경로를 검증한다 (실기기 수동 확인 항목).
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';

const CHROMIUM = process.env.DEEP_DIVE_CHROMIUM ?? '/opt/pw-browsers/chromium';
const PORT = 5199;
const baseUrl = process.env.DEEP_DIVE_DEV_URL ?? `http://localhost:${PORT}/`;

if (!existsSync(CHROMIUM)) {
  console.error(
    `❌ Chromium 실행 파일이 없습니다: ${CHROMIUM}\n` +
      '   env DEEP_DIVE_CHROMIUM 으로 크로미움 경로를 지정하세요.',
  );
  process.exit(1);
}

const { chromium } = await import('playwright-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 개발 서버 준비 ──────────────────────────────────────────────
let devServer = null;
async function ensureDevServer() {
  if (process.env.DEEP_DIVE_DEV_URL) return;
  devServer = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    detached: false,
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok) return;
    } catch {
      // 아직 기동 중
    }
    await sleep(500);
  }
  throw new Error('개발 서버가 30초 내에 응답하지 않았습니다.');
}

await ensureDevServer();

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(baseUrl, { waitUntil: 'load' });
await sleep(1500);

// 스프린트 A 마감: 자동 출항 제거 — 게임은 기지(BASE)에서 시작한다.
// 전투 HUD 검증은 해역(SORTIE) 상태 전제이므로, 기지 화면(SortiePrepScreen)의
// 출항 버튼(단일 진입점 — BaseScreenPort.launchSortie)으로 먼저 출항한다.
await page.evaluate(() => {
  const prep = document.querySelector('[data-ui-sortie-prep]');
  const depart = [...(prep?.querySelectorAll('button') ?? [])].find(
    (b) => b.textContent.trim() === '출항',
  );
  depart?.click();
});
await sleep(800);

const q = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? { hidden: el.classList.contains('hud-hidden'), text: el.textContent } : null;
  }, sel);
const metrics = () => page.evaluate(() => window.__deepDiveInput());
const aimActive = () =>
  page.evaluate(() =>
    document.querySelector('.hud-buttons .hud-btn')?.classList.contains('hud-btn-active'),
  );
const fireState = () =>
  page.evaluate(() => {
    const fire = [...document.querySelectorAll('.hud-buttons .hud-btn')].find((b) =>
      b.textContent.includes('어뢰 발사'),
    );
    return fire ? { label: fire.textContent, disabled: fire.disabled } : null;
  });
const results = {};
const aimBtn = page.locator('.hud-buttons .hud-btn', { hasText: '조준' });
const fireBtn = page.locator('.hud-buttons .hud-btn', { hasText: '어뢰 발사' });

// ── 1) 초기 표시
results['조작 안내 초기 표시'] = (await q('.controls-guide'))?.hidden === false;
results['화면 버튼 초기 표시'] = (await q('.hud-buttons'))?.hidden === false;
results['일시정지 오버레이 초기 숨김'] = (await q('.resume-overlay'))?.hidden === true;
const guideText = (await q('.controls-guide'))?.text ?? '';
results['안내에 8개 조작 포함'] = ['W / S', 'A / D', 'Ctrl / E · Shift', 'Space', '우클릭', '좌클릭', 'H', 'Esc'].every(
  (k) => guideText.includes(k),
);
results['발사 버튼 잔량 표시 (3발)'] = (await fireState())?.label.includes('3발');

// ── 2) H 토글
await page.keyboard.press('KeyH');
results['H로 안내+버튼 숨김'] =
  (await q('.controls-guide'))?.hidden === true && (await q('.hud-buttons'))?.hidden === true;
await page.keyboard.press('KeyH');
results['H로 복원'] =
  (await q('.controls-guide'))?.hidden === false && (await q('.hud-buttons'))?.hidden === false;

// ── 3) 컨텍스트 메뉴 방지
results['contextmenu 기본 동작 차단'] = await page.evaluate(() => {
  const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  document.getElementById('game-canvas').dispatchEvent(e);
  return e.defaultPrevented;
});

// ── 4) 순항 심도(시작 y=0): **전 심도 조준 가능** (A1 — 구 '잠망경 심도
//      전용' 규칙은 7차 결의 1로 폐기, 재도입 금지). 비조준 발사는 불발.
let m0 = await metrics();
let fs0 = await fireState();
results['조준 전 발사 → 불발(잔량 3발 유지)'] = fs0.label.includes('3발') && !fs0.disabled;
await aimBtn.click();
let m = await metrics();
results['A1 전 심도 조준 — 순항 심도에서도 조준 진입 가능'] =
  (await aimActive()) === true && m.buttonAimCount === 1;
await aimBtn.click(); // 원상 복귀(해제)
results['조준 버튼 재클릭 → 해제(비활성)'] = (await aimActive()) === false;
await fireBtn.click();
m = await metrics();
let fs = await fireState();
results['발사 버튼 1클릭 → 요청 1회 (마우스 경로 0)'] =
  m.buttonFireRequestCount === 1 && m.mouseFireRequestCount === 0;
results['첫 발사 요청 시각 기록'] = typeof m.firstFireRequestMs === 'number' && m.firstFireRequestMs > 0;
void m0;

// ── 5) 상승 후에도 조준 가능 (심도와 무관 — A1). Ctrl = 상승 / Shift = 하강.
await page.keyboard.down('Control');
await sleep(1500);
await page.keyboard.up('Control');
await sleep(200);
await aimBtn.click();
const aimed = await aimActive();
results['A1 심도 변경 후에도 조준 진입 가능 (aimModeChanged)'] = aimed === true;
await aimBtn.click();
results['조준 해제(비활성) — 심도 변경 후'] = (await aimActive()) === false;

// ── 6) 버튼 실발사 → 재장전·잔량
await aimBtn.click();
results['조준 재개'] = (await aimActive()) === true;
await fireBtn.click();
await sleep(300);
fs = await fireState();
const fireTime = Date.now();
results['발사 버튼 → 실발사(재장전 표시 + 비활성)'] = fs.disabled === true && fs.label.includes('재장전');
await fireBtn.click({ force: true }).catch(() => {});
m = await metrics();
const buttonFireAfterDisabled = m.buttonFireRequestCount;

// ── 7) Pointer Lock
await page.mouse.click(640, 360);
let locked = null;
for (let i = 0; i < 20 && locked !== 'game-canvas'; i++) {
  await sleep(25);
  locked = await page.evaluate(() => document.pointerLockElement?.id ?? null);
}
m = await metrics();
results['캔버스 클릭 → Pointer Lock 진입'] = locked === 'game-canvas' && m.pointerLockEnterCount === 1;
results['진입 클릭이 발사로 처리되지 않음'] = m.mouseFireRequestCount === 0;

if (locked === 'game-canvas') {
  await page.mouse.down();
  await page.mouse.up();
  m = await metrics();
  results['잠금 직후 클릭 1회 무시'] = m.mouseFireRequestCount === 0;
  await sleep(350);

  await page.mouse.down();
  await page.mouse.up();
  m = await metrics();
  results['잠금 중 좌클릭 → 마우스 발사 요청 1회'] = m.mouseFireRequestCount === 1;

  let sawActiveDuringHold = false;
  for (let i = 0; i < 3; i++) {
    await page.mouse.down({ button: 'right' });
    await sleep(120);
    if (await aimActive()) sawActiveDuringHold = true;
    await page.mouse.up({ button: 'right' });
    await sleep(120);
  }
  m = await metrics();
  results['우클릭 홀드 조준 3회 기록'] = m.mouseAimCount === 3;
  results['마우스 조준도 버튼 활성 표시 공유(aimModeChanged)'] = sawActiveDuringHold === true;
  results['우클릭 해제 → 조준 해제'] = (await aimActive()) === false;
  results['조준 3회 후 버튼 존재감 축소'] = await page.evaluate(() =>
    document.querySelector('.hud-buttons')?.classList.contains('hud-buttons-dimmed'),
  );

  // ── 8) 재장전 완료 대기 — 정확히 1발만 소모.
  // 고정 대기(발사 후 21초)가 아니라 **완료 폴링**이다: 소프트웨어 렌더 등
  // 저속 환경에서는 프레임 델타 상한(GameLoop 0.1s) 때문에 게임 시간이
  // 벽시계보다 느리게 흘러 재장전 완료가 21초를 넘길 수 있다. 판정 의도는
  // 그대로 유지된다 — 중복 발사(잔량 1발)면 마감까지 절대 '2발'이 되지
  // 않으므로 통과할 수 없다.
  const reloadDeadline = fireTime + 60000;
  fs = await fireState();
  while (!(fs.label.includes('2발') && !fs.disabled) && Date.now() < reloadDeadline) {
    await sleep(500);
    fs = await fireState();
  }
  results['재장전 완료 → 잔량 2발 (중복 발사 없음)'] = fs.label.includes('2발') && !fs.disabled;
  results['비활성 중 클릭은 발사 요청도 없음'] =
    (await metrics()).buttonFireRequestCount === buttonFireAfterDisabled;

  // ── 9) 마우스 실발사
  await page.mouse.down({ button: 'right' });
  await sleep(250);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(300);
  fs = await fireState();
  results['마우스 좌클릭 → 실발사(재장전 표시 — 버튼과 동일 판정)'] = fs.label.includes('재장전');
  await page.mouse.up({ button: 'right' });

  // ── 10) 잠금 해제 → 일시정지
  await page.evaluate(() => document.exitPointerLock());
  await sleep(400);
  locked = await page.evaluate(() => document.pointerLockElement?.id ?? null);
  m = await metrics();
  results['잠금 해제 → 해제 카운트 기록'] = locked === null && m.pointerLockExitCount === 1;
  results['해제 시 일시정지 오버레이 표시'] = (await q('.resume-overlay'))?.hidden === false;
  results['해제 시 조준 자동 해제'] = (await aimActive()) === false;
  const fpsBefore = await page.evaluate(() => document.querySelector('.perf-overlay')?.textContent);
  await sleep(1500);
  const fpsAfter = await page.evaluate(() => document.querySelector('.perf-overlay')?.textContent);
  results['일시정지 중 루프 정지(오버레이 갱신 없음)'] = fpsBefore === fpsAfter;

  // ── 11) 재개 ('마우스 모드로 계속')
  const fireCountBeforeResume = (await metrics()).mouseFireRequestCount;
  await page.locator('.resume-mouse').click();
  await sleep(500);
  locked = await page.evaluate(() => document.pointerLockElement?.id ?? null);
  m = await metrics();
  results['오버레이 클릭 → 재개·잠금 재진입'] =
    (await q('.resume-overlay'))?.hidden === true &&
    locked === 'game-canvas' &&
    m.pointerLockEnterCount === 2;
  results['재진입 클릭이 발사로 처리되지 않음'] = m.mouseFireRequestCount === fireCountBeforeResume;
}

console.log('=== HUD ↔ AimSystem 연결 검증 (33항목) ===');
let pass = 0;
let fail = 0;
for (const [name, ok] of Object.entries(results)) {
  console.log(`${ok ? '✅' : '❌'} ${name}`);
  ok ? pass++ : fail++;
}
console.log(`통과 ${pass} / 실패 ${fail}`);
console.log('페이지 오류:', errors.length ? errors : '없음');

await browser.close();
devServer?.kill();
process.exit(fail === 0 ? 0 : 1);
