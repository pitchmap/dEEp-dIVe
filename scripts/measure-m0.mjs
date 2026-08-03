#!/usr/bin/env node
/**
 * M0 계측 러너 — 품질 단계 × 시나리오 FPS·로딩·콘솔 오류 (툴링 소유).
 *
 * ## 이 러너가 만드는 숫자의 한계를 먼저 밝힌다
 *
 * 실행 환경은 **헤드리스 리눅스 컨테이너의 Chromium**이다. M0 인수 조건인
 * '내장그래픽 노트북 2대'의 실측을 **대체하지 않는다** — GPU·드라이버·전력
 * 프로파일이 전부 다르므로 절대 FPS를 노트북 기준으로 읽으면 안 된다.
 *
 * 여기서 얻을 수 있는 것은 **상대 비교와 회귀 감지**다:
 *  - low/medium/high 사이의 상대 부하 차이가 설계대로 나는가
 *  - 콘솔·페이지 오류가 0인가
 *  - 로딩이 끝나고 루프가 실제로 도는가
 *
 * 하드웨어 실측은 그래픽스 창(또는 실제 노트북 보유자)이 채워야 하며,
 * 이 러너의 출력은 `docs/measurements/M0_gpu_baseline.md`의 '컨테이너 참조' 열에만 들어간다.
 */

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5399;
const BASE = `http://127.0.0.1:${PORT}/`;
const TIERS = ['low', 'medium', 'high'];
/** 측정 창 — 각 시나리오에서 프레임을 모으는 시간(ms) */
const SAMPLE_MS = 4000;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: projectRoot,
  stdio: 'ignore',
});
const shutdown = () => {
  try {
    server.kill('SIGTERM');
  } catch {
    /* 이미 종료 */
  }
};
process.on('exit', shutdown);

async function waitForServer(browser) {
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

/**
 * 시나리오 3종. **production 진입 경로만 쓴다** — 쿼리 플래그는 품질 단계
 * 선택(`?quality=`)뿐이고, 데모·픽스처 플래그는 붙이지 않는다.
 */
const SCENARIOS = [
  { id: 'idle-base', label: '기지 대기 (부팅 직후 화면)', prepare: async () => {} },
  {
    id: 'sortie-cruise',
    label: '출항 항행 (Pointer Lock + 전진)',
    prepare: async (page) => {
      await page.mouse.click(400, 300);
      await page.keyboard.down('KeyW');
    },
    cleanup: async (page) => {
      await page.keyboard.up('KeyW');
    },
  },
  {
    id: 'sortie-aim',
    label: '조준 유지 (조준경 + 전진)',
    prepare: async (page) => {
      await page.mouse.click(400, 300);
      await page.keyboard.down('KeyW');
      await page.mouse.down({ button: 'right' });
    },
    cleanup: async (page) => {
      await page.mouse.up({ button: 'right' });
      await page.keyboard.up('KeyW');
    },
  },
];

/** requestAnimationFrame 간격을 직접 재서 FPS를 낸다 (HUD 텍스트 파싱 아님) */
async function sampleFrames(page, ms) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const deltas = [];
        let last = performance.now();
        const started = last;
        const tick = (now) => {
          deltas.push(now - last);
          last = now;
          if (now - started < duration) requestAnimationFrame(tick);
          else resolve(deltas);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

function summarize(deltas) {
  const usable = deltas.filter((d) => d > 0);
  if (usable.length === 0) return { frames: 0, avgFps: null, p95FrameMs: null, worstFrameMs: null };
  const sorted = [...usable].sort((a, b) => a - b);
  const mean = usable.reduce((a, b) => a + b, 0) / usable.length;
  return {
    frames: usable.length,
    avgFps: Number((1000 / mean).toFixed(1)),
    p95FrameMs: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    worstFrameMs: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

// verify-hud.mjs와 같은 실행 파일 규약을 쓴다 (번들 headless shell 미설치).
const CHROMIUM = process.env.DEEP_DIVE_CHROMIUM ?? '/opt/pw-browsers/chromium';
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
await waitForServer(browser);

const rows = [];
const allErrors = [];

for (const tier of TIERS) {
  for (const scenario of SCENARIOS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console:${msg.text().slice(0, 200)}`);
    });
    page.on('pageerror', (err) => errors.push(`pageerror:${String(err).slice(0, 200)}`));

    const t0 = Date.now();
    await page.goto(`${BASE}?quality=${tier}`, { waitUntil: 'load' });
    // 첫 프레임이 실제로 그려질 때까지 = 체감 로딩 완료
    await page.waitForFunction(() => document.querySelector('canvas') !== null, { timeout: 20000 });
    const loadMs = Date.now() - t0;
    await page.waitForTimeout(800);

    await scenario.prepare?.(page);
    const deltas = await sampleFrames(page, SAMPLE_MS);
    await scenario.cleanup?.(page);

    const stats = summarize(deltas);
    rows.push({ tier, scenario: scenario.id, label: scenario.label, loadMs, ...stats, errors: errors.length });
    for (const e of errors) allErrors.push(`[${tier}/${scenario.id}] ${e}`);
    await page.close();
  }
}

await browser.close();
shutdown();

const report = {
  measuredIn: 'headless-linux-container-chromium (SwiftShader)',
  disclaimer:
    '내장그래픽 노트북 2대 실측의 대체가 아니다. 절대 FPS를 하드웨어 기준으로 읽지 말 것 — 상대 비교·회귀 감지용.',
  sampleMs: SAMPLE_MS,
  rows,
  consoleErrors: allErrors,
};
writeFileSync(path.join(projectRoot, 'docs', 'measurements', 'm0-measurement.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log('=== M0 계측 (컨테이너 Chromium — 노트북 실측 대체 아님) ===');
console.log('tier    scenario        loadMs  avgFps  p95ms  worstMs  err');
for (const r of rows) {
  console.log(
    `${r.tier.padEnd(7)} ${r.scenario.padEnd(15)} ${String(r.loadMs).padStart(6)} ${String(r.avgFps).padStart(7)} ${String(r.p95FrameMs).padStart(6)} ${String(r.worstFrameMs).padStart(8)} ${String(r.errors).padStart(4)}`,
  );
}
console.log(`\n콘솔·페이지 오류 총 ${allErrors.length}건`);
for (const e of allErrors.slice(0, 10)) console.log(`  ${e}`);
if (allErrors.length > 0) {
  console.error('\n✖ 오류가 관측됐습니다 — M0 기본 품질 조건 미충족.');
  process.exit(1);
}
console.log('\n✅ 전 조합 오류 0건.');
