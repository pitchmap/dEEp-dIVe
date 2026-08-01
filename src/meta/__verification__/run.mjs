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

let failures = 0;
for (const { name, passed, detail } of results) {
  if (!passed) failures += 1;
  console.log(`${passed ? '✔' : '✖'} ${name} — ${detail}`);
}

console.log(`\n${results.length - failures}/${results.length} 통과`);
process.exit(failures === 0 ? 0 : 1);
