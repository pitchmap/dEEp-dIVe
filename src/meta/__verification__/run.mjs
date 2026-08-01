/**
 * 메타 루프 검증 러너.
 *
 * 사용법: node src/meta/__verification__/run.mjs
 * (게임플레이 러너 src/systems/__verification__/run.mjs와 동일 방식 —
 *  Node 타입 스트리핑으로 .ts 직접 로드, resolve 훅으로 확장자 보충.)
 */

import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
});

const { runMetaVerification } = await import('./verifyMeta.ts');

let results;
try {
  results = runMetaVerification();
} catch (error) {
  console.error('✖ 검증 실행 자체가 실패했습니다:', error);
  process.exit(1);
}

// QA 데모 분리 정적 검사 (§6) — production composition(Game·PveIntegration)이
// QA 데모 객체(econUiQaDemo)를 import하지 않아야 한다. QA 데모는
// ?econdemo 플래그 경로(CanyonScene) 전용이다.
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const compositionFiles = ['src/core/Game.ts', 'src/core/PveIntegration.ts'];
  const importPattern = /from\s+['"][^'"]*econUiQaDemo['"]/;
  const offenders = compositionFiles.filter((file) =>
    importPattern.test(readFileSync(path.join(root, file), 'utf8')),
  );
  results.push({
    name: 'production composition에 QA 데모 미포함 (Game·PveIntegration에 econUiQaDemo import 없음)',
    passed: offenders.length === 0,
    detail: offenders.length === 0 ? '정적 검사 통과' : `위반: ${offenders.join(', ')}`,
  });
}

// 공식 params 소비 검사 (INT-CORE-011).
{
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const read = (file) => readFileSync(path.join(root, file), 'utf8');

  // ① 실제 economy.json → 검증 → 가짜 배치와 결합: 보상값이 economy params
  //    에서만 파생되는지 실파일로 확인한다 (픽스처 아님 — 60/40/25+희귀 1).
  {
    const { validateEconomyParams } = await import('../../tools/economyMath.ts');
    const { composeSalvageSpawnPlan } = await import('../../core/PveIntegration.ts');
    const economy = validateEconomyParams(JSON.parse(read('params/economy.json')));
    const placements = {
      placements: economy.salvageSpawns.map((spawn, index) => ({
        spawnId: spawn.spawnId,
        worldPosition: { x: index * 10, y: -3, z: -20 },
      })),
    };
    const plan = composeSalvageSpawnPlan(economy, placements);
    const credits = plan.map((entry) => entry.credits);
    const rare = plan.filter((entry) => entry.rarePartCount === 1);
    const passed =
      plan.length === 3 &&
      credits.join(',') === '60,40,25' &&
      rare.length === 1 &&
      rare[0].rarePartId === 'rare-alloy-core' &&
      plan.every((entry, index) => entry.worldPosition.x === index * 10);
    results.push({
      name: '공식 economy.json 결합: 보상 60/40/25 + 희귀 1 (economy 파생)·좌표는 placement 파생',
      passed,
      detail: passed ? `plan=${plan.map((e) => `${e.spawnId}:${e.credits}`).join(' ')}` : JSON.stringify(plan),
    });
  }

  // ② Game.ts 정적 검사: provisionalEconomy import 0건, 공식 로더는
  //    composition root에서 각 1회, 구 카탈로그 로더 미사용.
  {
    const game = read('src/core/Game.ts');
    const count = (pattern) => (game.match(pattern) ?? []).length;
    const noProvisional = !game.includes('provisionalEconomy');
    const economyLoaderOnce = count(/loadEconomyParams\(/g) === 1;
    const aimingLoaderOnce = count(/loadAimingParams\(/g) === 1;
    const noLegacyCatalogLoader =
      !game.includes('loadUpgradeCatalog') && !game.includes('loadEquipmentCatalog');
    const passed = noProvisional && economyLoaderOnce && aimingLoaderOnce && noLegacyCatalogLoader;
    results.push({
      name: 'Game.ts 정적 검사: provisionalEconomy 0건·공식 로더 각 1회·구 카탈로그 로더 미사용',
      passed,
      detail: passed
        ? '통과'
        : `provisional=${!noProvisional}, econLoader=${count(/loadEconomyParams\(/g)}, aimLoader=${count(/loadAimingParams\(/g)}, legacy=${!noLegacyCatalogLoader}`,
    });
  }

  // ③ UI 정적 검사: 그래픽스 UI(src/ui)가 공식 경제·조준 로더나 해당 JSON을
  //    직접 호출·import하지 않음 — UI는 주입된 포트·값만 소비한다.
  //    (params/ui.json 로더 uiParams.ts는 툴링 소유 HUD 전용 로더로 허용 —
  //     INT-CORE-011 대상은 upgrades·equipment·economy·cargo·aiming 5종이다.)
  {
    const { readdirSync } = await import('node:fs');
    const uiDir = path.join(root, 'src', 'ui');
    const loaderPattern =
      /loadEconomyParams|loadAimingParams|loadUpgradeCatalog|loadEquipmentCatalog|loadParams\(|params\/(upgrades|equipment|economy|cargo|aiming)\.json/;
    const offenders = readdirSync(uiDir)
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => loaderPattern.test(read(path.join('src', 'ui', file))));
    results.push({
      name: 'UI 정적 검사: src/ui가 params 로더·JSON을 직접 호출하지 않음',
      passed: offenders.length === 0,
      detail: offenders.length === 0 ? '통과' : `위반: ${offenders.join(', ')}`,
    });
  }
}

// 스프린트 B 선행개발 정적 검사 (INT-CORE-012).
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const read = (file) => readFileSync(path.join(root, file), 'utf8');
  const walk = (dir) => {
    const out = [];
    for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...walk(rel));
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(rel);
    }
    return out;
  };
  const sourceFiles = walk('src').filter((file) => !file.includes('__verification__'));

  // ① 신규 경비함 AI 코어 파일 0개 — 경비 관련 파일은 어댑터·계약·경계뿐이고
  //    AI 판단 로직(추적 상태 머신·공격 루틴)을 새로 만들지 않았다.
  {
    const allowed = new Set([
      'src/core/GuardShipAdapter.ts', // 어댑터 (주입·수명주기만)
      'src/contracts/guard.ts', // 계약
      // 렌더 오버레이 — 스폰 결과 read model을 화면 방향으로만 매핑한다.
      // AI·판정·스폰 실행 없음(아래 AI 어휘 검사에도 함께 걸린다).
      // [그래픽스 추가 — INT-RENDER-011 리드 확인 요청]
      'src/render/GuardDirectionIndicator.ts',
    ]);
    const guardFiles = sourceFiles.filter((file) => /guard/i.test(path.basename(file)));
    const unexpected = guardFiles.filter((file) => !allowed.has(file));
    // 어댑터·렌더 오버레이 안에 AI 판단 어휘가 없어야 한다 (기존 AI 위임만).
    const adapter =
      read('src/core/GuardShipAdapter.ts') + read('src/render/GuardDirectionIndicator.ts');
    const aiLogicMarkers = ['pursue', 'chase', 'searchPattern', 'attackRun', 'depthCharge', 'detectionGauge'];
    const leaked = aiLogicMarkers.filter((marker) => adapter.includes(marker));
    results.push({
      name: 'B5 신규 경비함 AI 코어 파일 0개 (어댑터·계약만 — 판단 로직 없음)',
      passed: unexpected.length === 0 && leaked.length === 0,
      detail:
        unexpected.length === 0 && leaked.length === 0
          ? `guard 파일 ${guardFiles.length}개 = 어댑터·계약`
          : `예상 밖 파일: ${unexpected.join(', ') || '없음'} / AI 어휘: ${leaked.join(', ') || '없음'}`,
    });
  }

  // ② 스프린트 C 범위(탐지 게이지·소나 상태 머신·폭뢰·선체 체력·침수) 구현
  //    파일이 B 선행개발에서 생기지 않았는지 — 계약 파일의 예약 정의는 A 이전
  //    부터 존재하므로 구현 파일(시스템)만 검사한다.
  {
    const cScopeFiles = sourceFiles.filter((file) =>
      /(DetectionSystem|SonarSystem|DepthCharge|HullSystem|Flooding)\.ts$/.test(path.basename(file)),
    );
    results.push({
      name: 'B 범위 밖(C) 구현 파일 없음 — 탐지·소나·폭뢰·내구도·침수 시스템 미생성',
      passed: cScopeFiles.length === 0,
      detail: cScopeFiles.length === 0 ? '통과' : `발견: ${cScopeFiles.join(', ')}`,
    });
  }
}

let failures = 0;
for (const { name, passed, detail } of results) {
  if (!passed) failures += 1;
  console.log(`${passed ? '✔' : '✖'} ${name} — ${detail}`);
}

console.log(`\n${results.length - failures}/${results.length} 통과`);
process.exit(failures === 0 ? 0 : 1);
