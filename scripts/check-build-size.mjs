#!/usr/bin/env node
/**
 * dist 빌드 용량 검사 (G2 게이트: 초기 다운로드 15MB 이하).
 *
 * - dist 전체 파일 크기 합계 계산
 * - 총 원본 크기가 상한(15MB)을 넘으면 실패 코드(1)로 종료
 * - 원본 크기와 gzip 추정치를 함께 출력
 * - 큰 파일 순서대로 상위 목록 표시
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import process from 'node:process';

const DIST_DIR = new URL('../dist', import.meta.url).pathname;
const LIMIT_BYTES = 15 * 1024 * 1024; // 15MB (마스터 플랜 §12.1)
const TOP_FILES = 10;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  let distStat;
  try {
    distStat = await stat(DIST_DIR);
  } catch {
    console.error('❌ dist 디렉터리가 없습니다. 먼저 `npm run build`를 실행하세요.');
    process.exit(1);
  }
  if (!distStat.isDirectory()) {
    console.error('❌ dist가 디렉터리가 아닙니다.');
    process.exit(1);
  }

  const files = await collectFiles(DIST_DIR);
  if (files.length === 0) {
    console.error('❌ dist가 비어 있습니다. 빌드가 정상 완료되었는지 확인하세요.');
    process.exit(1);
  }

  const rows = [];
  let totalRaw = 0;
  let totalGzip = 0;

  for (const file of files) {
    const content = await readFile(file);
    const raw = content.byteLength;
    let gzip = null;
    try {
      gzip = gzipSync(content, { level: 9 }).byteLength;
    } catch {
      // gzip 추정 실패는 치명적이지 않다 — 원본 크기만 집계
    }
    totalRaw += raw;
    if (gzip !== null) totalGzip += gzip;
    rows.push({ path: relative(DIST_DIR, file), raw, gzip });
  }

  rows.sort((a, b) => b.raw - a.raw);

  console.log('── dist 빌드 용량 검사 (G2: 15MB 이하) ──');
  console.log(`파일 수: ${rows.length}`);
  console.log(`총 원본 크기: ${formatBytes(totalRaw)}`);
  console.log(`총 gzip 추정: ${formatBytes(totalGzip)}`);
  console.log('');
  console.log(`큰 파일 상위 ${Math.min(TOP_FILES, rows.length)}개:`);
  for (const row of rows.slice(0, TOP_FILES)) {
    const gzipText = row.gzip !== null ? ` (gzip ${formatBytes(row.gzip)})` : '';
    console.log(`  ${formatBytes(row.raw).padStart(10)}  ${row.path}${gzipText}`);
  }
  console.log('');

  if (totalRaw > LIMIT_BYTES) {
    console.error(
      `❌ 실패: 총 크기 ${formatBytes(totalRaw)} 가 상한 ${formatBytes(LIMIT_BYTES)} 를 초과했습니다.`,
    );
    console.error('   대응: 사운드 스트리밍 분리 확대, 텍스처 재압축, 트리 셰이킹 점검 (R4).');
    process.exit(1);
  }

  const usage = ((totalRaw / LIMIT_BYTES) * 100).toFixed(1);
  console.log(`✅ 통과: 상한 대비 ${usage}% 사용 중.`);
}

main().catch((error) => {
  console.error('❌ 검사 중 오류:', error);
  process.exit(1);
});
