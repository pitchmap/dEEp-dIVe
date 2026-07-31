#!/usr/bin/env node
/**
 * 프로젝트 상태 요약 출력 — 병렬 작업 창이 작업 시작 전 현황을 빠르게 파악하는 용도.
 *
 * 출력: 현재 브랜치·최근 커밋, dist 존재 여부·크기, docs/CURRENT_STATUS.md 내용.
 */

import { execSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const ROOT = new URL('..', import.meta.url).pathname;

function git(command) {
  try {
    return execSync(`git ${command}`, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '(git 정보 없음)';
  }
}

async function dirSize(dir) {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else if (entry.isFile()) total += (await stat(full)).size;
  }
  return total;
}

async function main() {
  console.log('══ 딥 다이브 프로젝트 상태 ══');
  console.log('');
  console.log(`브랜치     : ${git('rev-parse --abbrev-ref HEAD')}`);
  console.log(`최근 커밋  : ${git('log -1 --oneline') || '(커밋 없음)'}`);
  console.log('');

  try {
    const size = await dirSize(join(ROOT, 'dist'));
    console.log(`dist       : 존재 (${(size / (1024 * 1024)).toFixed(2)} MB) — 상세는 npm run check:size`);
  } catch {
    console.log('dist       : 없음 (npm run build 미실행)');
  }
  console.log('');

  try {
    const status = await readFile(join(ROOT, 'docs', 'CURRENT_STATUS.md'), 'utf8');
    console.log('── docs/CURRENT_STATUS.md ──');
    console.log(status);
  } catch {
    console.log('⚠ docs/CURRENT_STATUS.md 를 읽을 수 없습니다.');
  }
}

main().catch((error) => {
  console.error('상태 출력 중 오류:', error);
  process.exit(1);
});
