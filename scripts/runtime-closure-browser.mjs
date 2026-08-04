#!/usr/bin/env node
/**
 * M1·M2 Exit Criteria 19항목 production 브라우저 관측 (툴링 소유).
 *
 * ## fixture는 증거가 아니다
 *
 * `?sonardemo=1`·`?bossSpike=1` 등 demo fixture URL은 **production 완료
 * 판정에서 제외**한다 (HANDOFF §6). 이 하네스는 쿼리 플래그 없는 진입만
 * 쓰고, 부팅 직후 fixture가 장착되지 않았음을 먼저 확인한다.
 *
 * ## 자동화하기 어려운 항목을 0·pass로 적지 않는다
 *
 * 19항목 중 일부는 보스 스폰·3단계 전환·예고 표시처럼 **production 배선이
 * 끝나야** 관측할 수 있다. 배선이 없으면 `blocked`/`unwired`로 남기고,
 * 사람 눈이 필요한 시각 구분은 `manual`로 남긴다. 관측하지 못한 것을
 * 0이나 pass로 기록하면 게이트가 거짓이 된다.
 *
 * 결과 JSON에는 개인정보·기기 고유 식별자를 넣지 않는다 (브라우저 종류와
 * 렌더러 문자열까지만 — B7 계측 규칙과 동일).
 */

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5401;
const BASE = `http://127.0.0.1:${PORT}/`;
const CHROMIUM = process.env.DEEP_DIVE_CHROMIUM ?? '/opt/pw-browsers/chromium';

/** Exit Criteria 19항목 (HANDOFF §6) — id·설명·관측 방법 */
const CRITERIA = [
  { id: 'EC1', label: 'F hold로 canonical clue 3개 회수', auto: 'wiring' },
  { id: 'EC2', label: '같은 clue 중복 진행 0 (다른 targetId 포함)', auto: 'wiring' },
  { id: 'EC3', label: 'save 후 재접속에도 3/3 유지', auto: 'wiring' },
  { id: 'EC4', label: '3/3 이전 보스 구역 진입 차단 (spawn 0)', auto: 'wiring' },
  { id: 'EC5', label: '3/3 이후 보스 정확히 1회 spawn', auto: 'wiring' },
  { id: 'EC6', label: 'BossController ↔ 이동·공격 포트 실연결 (이동·선회 관측)', auto: 'wiring' },
  { id: 'EC7', label: '기존 어뢰 경로로 본체·약점 타격 성립', auto: 'wiring' },
  { id: 'EC8', label: '약점 배율 정확히 1회 적용 (피해 원장 대조)', auto: 'wiring' },
  { id: 'EC9', label: '보스 단계 1→2→3 순차 전환', auto: 'wiring' },
  { id: 'EC10', label: '모든 공격 전 예고 표시 (telegraph 4종)', auto: 'manual' },
  { id: 'EC11', label: '일반 피격·약점 피격 시각 구분 (bossHit 경로)', auto: 'manual' },
  { id: 'EC12', label: '플레이어 패배 시 기존 sortieFailed 경로', auto: 'wiring' },
  { id: 'EC13', label: '보스 승리 시 보상·저장 정확히 1회', auto: 'wiring' },
  { id: 'EC14', label: 'production 소나 provider 표시 (계기 미연결 아님)', auto: 'probe' },
  { id: 'EC15', label: 'exploration blip 4종 (액티브 핑 노출 중에만)', auto: 'wiring' },
  { id: 'EC16', label: 'provider 연결·확인 후 DetectionHud 정리', auto: 'manual' },
  { id: 'EC17', label: 'reset·재출항 후 중복 spawn·보상·이벤트 0', auto: 'wiring' },
  { id: 'EC18', label: '콘솔 오류 0', auto: 'probe' },
  { id: 'EC19', label: '페이지 오류 0', auto: 'probe' },
];

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: projectRoot,
  stdio: 'ignore',
});
process.on('exit', () => {
  try {
    server.kill('SIGTERM');
  } catch {
    /* 이미 종료 */
  }
});

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

async function waitForServer() {
  const page = await browser.newPage();
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await page.goto(BASE, { timeout: 2000 });
      if (res && res.ok()) {
        await page.close();
        return;
      }
    } catch {
      /* 재시도 */
    }
    await page.waitForTimeout(500);
  }
  await page.close();
  throw new Error('preview 서버가 뜨지 않았습니다');
}
await waitForServer();

const consoleErrors = [];
const pageErrors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

// production 진입 — 쿼리 플래그 없음
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('canvas') !== null, { timeout: 20000 });
await page.waitForTimeout(1200);

/** 부팅 상태 관측 — 읽기 전용 디버그 핸들만 사용 */
const probe = await page.evaluate(() => {
  const dbg = window.__deepDiveDebug ?? null;
  if (!dbg) return { debugHandleAvailable: false };
  const scene = dbg.scene ?? null;
  const gameplay = dbg.gameplay ?? null;
  return {
    debugHandleAvailable: true,
    // fixture가 장착되지 않았음을 먼저 확인한다 — production 판정의 전제.
    sprintBFixture: scene?.sprintBFixture ?? null,
    sonarFixture: scene?.sonarFixture ?? null,
    sonarScopeReadModel:
      typeof gameplay?.sonarScopeReadModel === 'function' ? gameplay.sonarScopeReadModel() : null,
    bossControllerPresent: Boolean(dbg.bossController),
    interactablesCount: Array.isArray(gameplay?.interactables) ? gameplay.interactables.length : null,
    cluesCollected: dbg.meta?.progress?.bossCluesCollected ?? null,
  };
});

await page.close();
await browser.close();
try {
  server.kill('SIGTERM');
} catch {
  /* 이미 종료 */
}

// ── 상태 판정 ─────────────────────────────────────────────────
// 배선이 없으면 관측 자체가 불가능하다. 그것을 pass·0으로 적지 않는다.
const scopeWired =
  probe.sonarScopeReadModel !== null && probe.sonarScopeReadModel?.unwired === false;
const fixtureLoaded = probe.sprintBFixture !== null || probe.sonarFixture !== null;

const results = CRITERIA.map((c) => {
  if (c.id === 'EC18') {
    return {
      ...c,
      status: consoleErrors.length === 0 ? 'pass' : 'fail',
      detail: consoleErrors.length === 0 ? '콘솔 오류 0건' : `${consoleErrors.length}건: ${consoleErrors.slice(0, 3).join(' | ')}`,
    };
  }
  if (c.id === 'EC19') {
    return {
      ...c,
      status: pageErrors.length === 0 ? 'pass' : 'fail',
      detail: pageErrors.length === 0 ? '페이지 오류 0건' : `${pageErrors.length}건: ${pageErrors.slice(0, 3).join(' | ')}`,
    };
  }
  if (c.id === 'EC14') {
    return {
      ...c,
      status: scopeWired ? 'pass' : 'unwired',
      detail: scopeWired
        ? 'sonarScopeReadModel().unwired === false — provider 연결됨'
        : `스코프 read model이 미연결('계기 미연결') — ${probe.sonarScopeReadModel === null ? 'read model 자체 없음' : 'unwired=true'}. pass로 올리지 않음`,
    };
  }
  if (c.auto === 'manual') {
    return {
      ...c,
      status: 'manual',
      detail: '시각 구분·정리 순서 판정 — 사람 눈이 필요하다. 자동 0·pass로 기록하지 않음',
    };
  }
  return {
    ...c,
    status: 'blocked',
    detail:
      'production 배선 미완 — 보스 spawn·clue 회수 경로가 Game.ts에 연결되어야 관측 가능. verify:runtime-closure의 배선 상태 참조',
  };
});

const summary = {
  schemaVersion: 1,
  // 기기 고유 식별자·개인정보 없음 — 브라우저 종류만.
  environment: { browser: 'chromium (headless container)', viewport: '1280x720' },
  productionEntry: { queryFlags: 'none', fixtureLoaded },
  note: fixtureLoaded
    ? '⚠ fixture가 장착됐다 — 이 회차는 production 완료 판정에 쓸 수 없다'
    : 'fixture 미장착 — production 진입 경로 확인',
  debugHandleAvailable: probe.debugHandleAvailable,
  results,
};

const outDir = path.join(projectRoot, 'docs', 'measurements');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, 'runtime-closure-browser.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
);

const MARK = { pass: '✔', fail: '✖', manual: '◻', blocked: '⛔', unwired: '○' };
console.log('=== M1·M2 Exit Criteria — production 브라우저 관측 ===');
console.log(`fixture 장착: ${fixtureLoaded ? '예 (판정 불가)' : '아니오'} · 디버그 핸들: ${probe.debugHandleAvailable}\n`);
for (const r of results) console.log(`${MARK[r.status]} [${r.status}] ${r.id} ${r.label}\n    → ${r.detail}`);

const counts = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
console.log('\n=== 요약 ===');
for (const [k, v] of Object.entries(counts)) console.log(`${k.padEnd(10)} ${v}`);
console.log('\nM1_EXIT_GATE_PASSED=false  (19항목 전부 pass일 때만 통합 관리자가 올린다)');

// 실제 오류가 관측된 경우에만 실패 — blocked·manual은 배선 대기이지 실패가 아니다.
const failures = results.filter((r) => r.status === 'fail');
if (failures.length > 0) {
  console.error(`\n✖ 실패 ${failures.length}건`);
  process.exit(1);
}
console.log('\n✅ 관측된 오류 0건. blocked·manual은 배선·사람 판정 대기입니다.');
