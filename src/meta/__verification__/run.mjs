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

  // ① B5 개정 판정 (INT-CORE-013) — 검사 기준이 바뀌었다:
  //    '신규 AI 0'이 아니라 **범용 production 구현 정확히 1개 + Guard 전용 0개**.
  //    파일 이름이 아니라 `implements DestroyerAI` 내용으로 판정한다
  //    (이름을 바꿔 검사를 피할 수 없다).
  const CANONICAL_DESTROYER_AI = 'src/core/DestroyerAIController.ts';
  {
    const implementers = sourceFiles.filter((file) => /implements\s+DestroyerAI\b/.test(read(file)));
    const canonicalOnly =
      implementers.length === 1 && implementers[0] === CANONICAL_DESTROYER_AI;
    results.push({
      name: 'B5 범용 production DestroyerAI 구현체 정확히 1개 (정본 경로)',
      passed: canonicalOnly,
      detail: canonicalOnly ? CANONICAL_DESTROYER_AI : `구현체: ${implementers.join(', ') || '0개'}`,
    });
  }
  {
    // Guard 전용 AI 코어 금지 — 이름이 Guard*(AI|Behavior|StateMachine|Brain)이거나
    // guard 이름 파일이 DestroyerAI를 직접 구현하면 위반이다.
    // 렌더·UI 오버레이(src/render, src/ui)는 표시 계층이므로 허용하되,
    // 같은 내용 검사(AI 구현·판단 어휘)를 동일하게 적용한다.
    const guardNamed = sourceFiles.filter((file) => /guard/i.test(path.basename(file)));
    const dedicatedAiNames = guardNamed.filter((file) =>
      /guard.*(ai|behavior|statemachine|brain)/i.test(path.basename(file)),
    );
    const guardImplementers = guardNamed.filter((file) =>
      /implements\s+DestroyerAI\b/.test(read(file)),
    );
    const aiLogicMarkers = ['pursue(', 'chase(', 'searchPattern', 'attackRun', 'depthCharge', 'detectionGauge'];
    const leaked = guardNamed.filter((file) => {
      const source = read(file);
      return aiLogicMarkers.some((marker) => source.includes(marker));
    });
    const passed =
      dedicatedAiNames.length === 0 && guardImplementers.length === 0 && leaked.length === 0;
    results.push({
      name: 'B5 Guard 전용 AI 코어 0개 (오버레이·어댑터·계약만 — 판단 로직 없음)',
      passed,
      detail: passed
        ? `guard 이름 파일 ${guardNamed.length}개 검사 통과`
        : `전용 AI 이름: ${dedicatedAiNames.join(', ') || '없음'} / DestroyerAI 구현: ${guardImplementers.join(', ') || '없음'} / AI 어휘: ${leaked.join(', ') || '없음'}`,
    });
  }
  {
    // 어댑터가 범용 factory 경로를 쓰는가 + 위장·더블 금지
    const adapter = read('src/core/GuardShipAdapter.ts');
    const factory = read('src/core/destroyerAiFactory.ts');
    const cargo = read('src/systems/CargoShipSystem.ts');
    const usesFactory =
      /DestroyerAIFactory/.test(adapter) && /DestroyerAIController/.test(factory);
    const cargoDisguised = /implements\s+DestroyerAI\b/.test(cargo) || /DestroyerAI/.test(cargo);
    // production 코드가 검증 더블을 import하지 않는다.
    const doubleUsers = sourceFiles.filter((file) => /from '.*__verification__/.test(read(file)));
    const passed = usesFactory && !cargoDisguised && doubleUsers.length === 0;
    results.push({
      name: 'B5 어댑터가 범용 DestroyerAI factory 사용 · CargoShipSystem 위장 없음 · 검증 더블 production 미사용',
      passed,
      detail: passed
        ? '통과'
        : `factory=${usesFactory}, cargo위장=${cargoDisguised}, 더블사용=${doubleUsers.join(', ') || '없음'}`,
    });
  }
  {
    // 범용 AI에 C 범위(탐지·폭뢰·내구도·침수) 참조가 없어야 한다.
    const ai = read(CANONICAL_DESTROYER_AI);
    const cMarkers = ['detection', 'sonar', 'depthCharge', 'hullIntegrity', 'flooding', 'fireTorpedo'];
    const found = cMarkers.filter((marker) => new RegExp(marker, 'i').test(ai));
    results.push({
      name: 'B5 범용 AI에 C 기능(탐지·소나·폭뢰·내구도·침수·발사) 참조 0건',
      passed: found.length === 0,
      detail: found.length === 0 ? '통과' : `발견: ${found.join(', ')}`,
    });
  }

  // ② C 소유 경계 (INT-CORE-014 — C 공식 착수 후 개정).
  //    C1~C9는 전 항목 공식 범위지만 **창별 소유가 다르다**: 탐지 게이지·
  //    소나·폭뢰 판정은 게임플레이 창 소유이며 리드가 만들지 않는다.
  //    리드 소유는 생존 공용 코어(선체·침수·실패 정산)뿐이다.
  {
    const leadFiles = sourceFiles.filter((file) => file.startsWith('src/core/'));
    const forbiddenInLead = leadFiles.filter((file) =>
      /(DetectionSystem|SonarSystem|DepthCharge|Repair)\.ts$/.test(path.basename(file)),
    );
    // 생존 공용 코어는 정확히 이 3개 — 이름을 바꿔 늘리지 않는다.
    const survivalCore = leadFiles.filter((file) =>
      /(PlayerHullSystem|FloodingCore|SortieFailureCoordinator)\.ts$/.test(path.basename(file)),
    );
    const passed = forbiddenInLead.length === 0 && survivalCore.length === 3;
    results.push({
      name: 'C 소유 경계: 리드는 탐지·소나·폭뢰·수리를 만들지 않음 (생존 공용 코어 3개만)',
      passed,
      detail: passed
        ? '생존 코어 3개 · 게임플레이 소유 시스템 0개'
        : `금지 파일: ${forbiddenInLead.join(', ') || '없음'} / 생존 코어 ${survivalCore.length}개`,
    });
  }

  // ③-0 이중 정산 방지 (INT-CORE-015 §병행 정산 경로): 정산 정본은
  //    MetaLoop.settleSortie 하나다. EconomySystem.settleDefeat/settleReturn·
  //    RunEconomy.settleSortie는 production 호출자가 없어야 하며(삭제는
  //    게임플레이 소유 — INT-GAME 처리 대기), composition·core는 이 병행
  //    경로를 호출하지 않는다.
  {
    const parallelCallers = sourceFiles.filter((file) => {
      if (file === 'src/systems/economy/EconomySystem.ts') return false; // 정의 파일
      if (file === 'src/systems/economy/RunEconomy.ts') return false; // 정의 파일
      const body = read(file);
      return /\.settleDefeat\(|\.settleReturn\(/.test(body);
    });
    const canonicalCallers = sourceFiles.filter((file) => {
      if (file === 'src/meta/MetaLoop.ts') return false; // 정의 파일
      return /\.settleSortie\(\{/.test(read(file));
    });
    const allowedCanonical = new Set(['src/core/Game.ts', 'src/core/SortieFailureCoordinator.ts']);
    const unexpectedCanonical = canonicalCallers.filter((file) => !allowedCanonical.has(file));
    const passed = parallelCallers.length === 0 && unexpectedCanonical.length === 0;
    results.push({
      name: 'C 이중 정산 방지: 병행 정산 호출 0건 · MetaLoop.settleSortie 호출자는 조립부·실패 조정자뿐',
      passed,
      detail: passed
        ? '통과'
        : `병행 호출: ${parallelCallers.join(', ') || '없음'} / 예상 밖 정산 호출: ${unexpectedCanonical.join(', ') || '없음'}`,
    });
  }

  // ③-1 AI 소유 경계 (INT-CORE-016): AI는 공격 **요청만** 생성한다 —
  //     피해량·반경·사거리·쿨다운·신관·직접 피해 호출을 소유하지 않는다.
  {
    const ai = read('src/core/DestroyerAIController.ts');
    const forbidden = [
      'applyDamage',
      'DamageReceiverPort',
      'DepthChargeRunSystem',
      'directDamage',
      'nearDamage',
      'RadiusMeters',
      'cooldown',
      'Cooldown',
      'fuse',
    ];
    const leaked = forbidden.filter((marker) => ai.includes(marker));
    results.push({
      name: 'C4 AI 소유 경계: DestroyerAIController에 피해·반경·쿨다운·신관·직접 피해 호출 0건',
      passed: leaked.length === 0,
      detail: leaked.length === 0 ? '통과 (요청 생성만)' : `발견: ${leaked.join(', ')}`,
    });
  }

  // ③-2 combat params 정규화 단일 소유 (INT-CORE-017): 구 평면 리더
  //     (이중 정규화) 0건 + combat.json import는 공인 로더 안에서만 +
  //     Game.ts의 raw combat import 0건.
  {
    // 호출·선언 형태(`이름(`)만 잡는다 — 제거 사유를 남긴 주석 속 이름은 위반이 아니다.
    const duplicateReaders = sourceFiles.filter((file) =>
      /read(?:DetectionTuning|DepthChargeDamage)Params\s*\(/.test(read(file)),
    );
    // 공인 로더 2곳만 허용: combatParamsLoader(C9 중첩 스키마 정본),
    // ParamLoader(A 시절 확정 5필드 combat 로더 — validateGameParams 경유 정규화 소유).
    const combatJsonAllowlist = new Set([
      'src/tools/combatParamsLoader.ts',
      'src/config/ParamLoader.ts',
    ]);
    const combatJsonImporters = sourceFiles.filter(
      (file) =>
        /from\s+['"][^'"]*params\/combat\.json['"]/.test(read(file)) &&
        !combatJsonAllowlist.has(file),
    );
    const passed = duplicateReaders.length === 0 && combatJsonImporters.length === 0;
    results.push({
      name: 'C9 정규화 단일 소유: 평면 리더(이중 정규화) 0건 · combat.json import는 공인 로더뿐',
      passed,
      detail: passed
        ? '통과'
        : `평면 리더: ${duplicateReaders.join(', ') || '없음'} / raw import: ${combatJsonImporters.join(', ') || '없음'}`,
    });
  }

  // ③-3 실패 화면 confirm 구조 (INT-CORE-017): 확인 버튼이 guarded confirm
  //     command를 경유해야 하며, UI가 completeDebrief를 직접 호출하지 않는다.
  {
    const screen = read('src/ui/SortieFailureScreen.ts');
    const returnScreen = read('src/ui/SortieReturnScreen.ts');
    const game = read('src/core/Game.ts');
    const usesConfirm = screen.includes('confirmCommand');
    // 직접 호출 형태(`.completeDebrief(`)만 금지 — 정책을 설명하는 주석 속
    // 이름과 조립부 command 래퍼 경유(주입받은 콜백 호출)는 위반이 아니다.
    const directCall = /\.completeDebrief\s*\(/;
    const noDirectComplete = !directCall.test(screen) && !directCall.test(returnScreen);
    const gameWiresGuarded = /debriefConfirm\?\.confirm\(\)/.test(game);
    const passed = usesConfirm && noDirectComplete && gameWiresGuarded;
    results.push({
      name: 'C 실패 화면 confirm: guarded command 경유 · UI의 completeDebrief 직접 호출 0건',
      passed,
      detail: passed
        ? '통과'
        : `confirmCommand=${usesConfirm}, directComplete=${!noDirectComplete}, gameGuarded=${gameWiresGuarded}`,
    });
  }

  // ③ C 수치 발명 금지 — 생존 코어에 밸런스 상수 리터럴이 없어야 한다.
  //    (선체 기준값·피해량·침수 속도·압력은 C9 [COMBAT] params 이관 대상)
  {
    const coreFiles = [
      'src/core/PlayerHullSystem.ts',
      'src/core/FloodingCore.ts',
      'src/core/SortieFailureCoordinator.ts',
    ];
    // 0·1은 경계값, 2는 사다리꼴 적분(평균)의 수학 상수 — 밸런스 수치가 아니다.
    const numericLiteral = /(?:^|[^\w.])(?!0\b|1\b|2\b)\d+(?:\.\d+)?\s*(?:;|,|\)|\})/;
    const offenders = [];
    for (const file of coreFiles) {
      const body = read(file)
        .split('\n')
        .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
        .join('\n');
      if (numericLiteral.test(body)) offenders.push(file);
    }
    results.push({
      name: 'C 수치 발명 금지: 생존 코어에 밸런스 상수 없음 (0·1 경계값 제외)',
      passed: offenders.length === 0,
      detail: offenders.length === 0 ? '통과' : `숫자 리터럴 발견: ${offenders.join(', ')}`,
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
