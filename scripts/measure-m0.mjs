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
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
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

/**
 * 실측 환경을 기록한다. **모르는 값은 null로 남긴다** — 0으로 적으면
 * '측정했는데 0'과 '측정 못 함'이 구분되지 않는다.
 */
async function collectEnvironment() {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  const gpu = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { vendor: null, renderer: null, glVersion: null, unmaskedAvailable: false };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      glVersion: gl.getParameter(gl.VERSION),
      unmaskedAvailable: Boolean(dbg),
    };
  });
  const userAgent = await page.evaluate(() => navigator.userAgent);
  const deviceMemory = await page.evaluate(() => navigator.deviceMemory ?? null);
  await page.close();

  let chromiumVersion = null;
  try {
    chromiumVersion = execFileSync(CHROMIUM, ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    chromiumVersion = null; // 실행 못 하면 모른다 — 빈 문자열·0으로 적지 않는다
  }

  // SwiftShader·llvmpipe·SwANGLE 등은 **소프트웨어 래스터라이저**다.
  // 실제 GPU 증적으로 인정하지 않는다.
  const haystack = `${gpu.vendor ?? ''} ${gpu.renderer ?? ''}`.toLowerCase();
  const softwarePatterns = ['swiftshader', 'llvmpipe', 'softpipe', 'swangle', 'software', 'mesa offscreen'];
  const matched = softwarePatterns.filter((p) => haystack.includes(p));
  const isSoftware = matched.length > 0;

  return {
    os: { platform: os.platform(), release: os.release(), arch: os.arch() },
    cpu: { model: os.cpus()[0]?.model ?? null, cores: os.cpus().length },
    totalMemoryBytes: os.totalmem(),
    deviceMemoryGb: deviceMemory,
    browser: { userAgent, chromiumVersion, executablePath: CHROMIUM },
    gpu,
    softwareRenderer: {
      detected: isSoftware,
      matchedPatterns: matched,
      // 이 플래그가 true면 어떤 FPS도 실제 GPU 증적이 되지 못한다.
      realGpuEvidence: !isSoftware,
    },
  };
}

const environment = await collectEnvironment();

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
  schemaVersion: 2,
  // 측정 시각은 호출자가 채운다 — 러너가 Date를 박으면 결과 비교가 어려워진다.
  environment,
  disclaimer: environment.softwareRenderer.detected
    ? '소프트웨어 래스터라이저(' +
      environment.softwareRenderer.matchedPatterns.join(', ') +
      ')로 측정됐다. **실제 GPU 증적이 아니다** — 내장그래픽 노트북 실측을 대체하지 않으며 절대 FPS·tier 비교에 사용 금지.'
    : '실제 GPU로 측정됐다. 그래도 기기 1대 결과이므로 M0 인수(노트북 2대)를 단독으로 충족하지 않는다.',
  sampleMs: SAMPLE_MS,
  // 기본 품질은 여기서 정하지 않는다 — 통합 관리자·그래픽스 판정 항목.
  defaultQualityDecision: null,
  rows,
  consoleErrors: allErrors,
};
writeFileSync(path.join(projectRoot, 'docs', 'measurements', 'm0-measurement.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log('=== M0 계측 ===');
console.log(`OS       : ${environment.os.platform} ${environment.os.release} (${environment.os.arch})`);
console.log(`CPU      : ${environment.cpu.model ?? '(미상)'} × ${environment.cpu.cores}`);
console.log(`Browser  : ${environment.browser.chromiumVersion ?? '(버전 미상)'}`);
console.log(`GPU      : ${environment.gpu.renderer ?? '(미상)'} / vendor=${environment.gpu.vendor ?? '(미상)'}`);
console.log(`GL       : ${environment.gpu.glVersion ?? '(미상)'}`);
if (environment.softwareRenderer.detected) {
  console.log(
    `⚠ 소프트웨어 래스터라이저 감지 (${environment.softwareRenderer.matchedPatterns.join(', ')}) — 실제 GPU 증적 아님`,
  );
}
console.log('');
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
console.log('');
console.log(`M0_REAL_GPU_EVIDENCE_COMPLETE=${environment.softwareRenderer.realGpuEvidence}`);
console.log('M0_DEFAULT_QUALITY_DECIDED=false  (기본 품질 자동 확정 금지 — 판정은 통합 관리자)');
