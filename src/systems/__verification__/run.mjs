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
import { readFileSync } from 'node:fs';
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
  });
} catch (error) {
  console.error('✖ 검증 실행 자체가 실패했습니다:', error);
  process.exit(1);
}

let failures = 0;
for (const { name, passed, detail } of results) {
  if (!passed) failures += 1;
  console.log(`${passed ? '✔' : '✖'} ${name} — ${detail}`);
}

console.log(`\n${results.length - failures}/${results.length} 통과`);
process.exit(failures === 0 ? 0 : 1);
