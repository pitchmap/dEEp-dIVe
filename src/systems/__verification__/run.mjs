/**
 * 게임플레이 검증 러너.
 *
 * 사용법: node src/systems/__verification__/run.mjs
 * (Node 22.18+ — 기본 타입 스트리핑으로 .ts를 직접 로드한다.
 *  프로젝트 소스는 확장자 없는 상대 import를 쓰므로(bundler 해석),
 *  여기서 resolve 훅으로 `.ts`를 보충한다. 프로덕션 코드와 무관한 개발용 러너.)
 *
 * params/*.json은 여기(비타입체크 영역)에서 읽어 검증 모듈에 주입한다 —
 * src 쪽 타입체크 코드에 node:fs 의존을 넣지 않기 위한 분리다.
 */

import { registerHooks } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readJson = (relative) =>
  JSON.parse(readFileSync(path.join(projectRoot, relative), 'utf8'));

const { runGameplayVerification } = await import('./verifyGameplay.ts');

let results;
try {
  results = runGameplayVerification({
    movement: readJson('params/movement.json'),
    detection: readJson('params/detection.json'),
    combat: readJson('params/combat.json'),
    crew: readJson('params/crew.json'),
    upgrades: readJson('params/upgrades.json'),
    equipment: readJson('params/equipment.json'),
    economy: readJson('params/economy.json'),
    cargo: readJson('params/cargo.json'),
  });
} catch (error) {
  console.error('✖ 검증 실행 자체가 실패했습니다:', error);
  process.exit(1);
}

/* ── production 정적 검사 ────────────────────────────────────────────────
 * src/systems의 **production 소스만** 훑는다 — `__verification__`(테스트
 * 픽스처)과 문서는 대상이 아니다. 소스 텍스트 검사이므로 여기(러너)에서
 * 수행한다: 타입체크 영역에 node:fs 의존을 넣지 않는다.
 */
const productionSources = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__verification__') continue;
      walk(full);
    } else if (entry.name.endsWith('.ts')) {
      productionSources.push(full);
    }
  }
};
walk(path.join(projectRoot, 'src', 'systems'));

const importsOf = (source) =>
  [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);

const removedProvisional = ['provisionalEconomy', 'provisionalCargo', 'provisionalEquipment'];
const provisionalOffenders = [];
const saveOffenders = [];
for (const file of productionSources) {
  const source = readFileSync(file, 'utf8');
  const relative = path.relative(projectRoot, file);
  for (const specifier of importsOf(source)) {
    if (removedProvisional.some((name) => specifier.includes(name))) {
      provisionalOffenders.push(`${relative} → ${specifier}`);
    }
    // 툴링 로더·params JSON 직접 소비 금지 (INT-CORE-011)
    if (/params\/.*\.json$/.test(specifier) || /tools\/(economyParams|aimingParams)/.test(specifier)) {
      provisionalOffenders.push(`${relative} → ${specifier} (로더·JSON 직접 소비)`);
    }
  }
  // 저장 직접 호출 금지 (저장 책임 표 — 구매·장비·출항 저장은 리드 소유).
  // 주석은 제외한다 — '저장은 리드 소유'라는 설명 자체가 위반은 아니다.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const savesDirectly =
    /\.save\s*\(/.test(code) ||
    /\blocalStorage\b/.test(code) ||
    importsOf(code).some((specifier) => /save/i.test(specifier));
  if (savesDirectly) saveOffenders.push(relative);
}

results.push({
  name: 'production provisional 소비 0건 (economy/cargo/equipment 이관 완료·JSON·로더 직접 접근 없음)',
  passed: provisionalOffenders.length === 0,
  detail:
    provisionalOffenders.length === 0
      ? `src/systems production 파일 ${productionSources.length}개 검사`
      : provisionalOffenders.join(' | '),
});
results.push({
  name: '게임플레이 SavePort 직접 호출 0건 (저장은 리드 트랜잭션·Departure 소유)',
  passed: saveOffenders.length === 0,
  detail: saveOffenders.length === 0 ? '저장소 접근 없음' : saveOffenders.join(' | '),
});

let failures = 0;
for (const { name, passed, detail } of results) {
  if (!passed) failures += 1;
  console.log(`${passed ? '✔' : '✖'} ${name} — ${detail}`);
}

console.log(`\n${results.length - failures}/${results.length} 통과`);
process.exit(failures === 0 ? 0 : 1);
