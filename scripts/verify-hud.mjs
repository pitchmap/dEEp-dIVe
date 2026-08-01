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

// ── 4) 순항 심도(시작 y=0): 조준 거부·발사 불발
await aimBtn.click();
let m = await metrics();
results['조준 버튼 — 잠망경 심도 아님 → 거부(비활성 유지)'] =
  (await aimActive()) === false && m.buttonAimCount === 1;
await fireBtn.click();
m = await metrics();
let fs = await fireState();
results['발사 버튼 1클릭 → 요청 1회 (마우스 경로 0)'] =
  m.buttonFireRequestCount === 1 && m.mouseFireRequestCount === 0;
results['조준 없이 발사 → 불발(잔량 3발 유지)'] = fs.label.includes('3발') && !fs.disabled;
results['첫 발사 요청 시각 기록'] = typeof m.firstFireRequestMs === 'number' && m.firstFireRequestMs > 0;

// ── 5) Ctrl 상승 → 잠망경 도달 → 조준 토글
// 입력 규칙 확정(PvE 1차 통합): Ctrl = 상승 / Shift = 하강 / E = 상승 병행 키.
// 이 스크립트는 구 규칙(Shift 상승)으로 작성돼 있어 잠망경 심도에 도달하지
// 못했다 — 검증 의도(심도 게이트 후 조준 토글)는 그대로 두고 키만 교정한다.
await page.keyboard.down('Control');
let aimed = false;
for (let i = 0; i < 30 && !aimed; i++) {
  await sleep(500);
  await aimBtn.click();
  aimed = await aimActive();
}
await page.keyboard.up('Control');
results['잠망경 심도 도달 → 조준 버튼 활성(aimModeChanged)'] = aimed === true;
await aimBtn.click();
results['조준 버튼 재클릭 → 해제(비활성)'] = (await aimActive()) === false;

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

  // ── 8) 재장전 완료 대기 — 정확히 1발만 소모
  const remainingReload = Math.max(0, 21000 - (Date.now() - fireTime));
  await sleep(remainingReload);
  fs = await fireState();
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
