#!/usr/bin/env node
/**
 * 신 스코프 가드 기계 검사 (6차 대회의 결의 2 · 소회의(11) 결의 4).
 *
 * MVP 상한: 영구 업그레이드 7항목 / 장비 4종 / 보스 1종 / 해역 1개.
 * 초과 제안은 자동 백로그 — "가드를 문서가 아니라 도구가 지키게" (리드 결의).
 *
 * 동작 모드:
 *  - 기본: 위반 시 ⚠ 경고 출력, 종료 코드 0 (소회의 결의 4 문언: '빌드 경고')
 *  - --strict (CI): 위반 시 종료 코드 1 — 경고냐 실패냐의 최종 정책은 리드
 *    결정 대기 (INTEGRATION_NOTES INT-TOOL-006). 완화하려면 CI에서 --strict 제거.
 *
 * 아직 정의 파일이 없는 축(장비·보스·해역)은 '0개 — 상한 이내'로 통과하며,
 * 해당 파일이 생기는 즉시 자동으로 검사 대상이 된다.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import process from 'node:process';

const STRICT = process.argv.includes('--strict');

/** 검사 축 정의 — 파일 경로·항목 추출·상한. 정의 위치가 확정되면 여기만 갱신 */
const CHECKS = [
  {
    name: '영구 업그레이드',
    limit: 7,
    file: 'params/upgrades.json',
    count: (json) => (Array.isArray(json.items) ? json.items.length : null),
  },
  {
    name: '장비 정의',
    limit: 4,
    file: 'params/equipment.json',
    count: (json) => (Array.isArray(json.items) ? json.items.length : null),
  },
  {
    name: 'MVP 보스 정의',
    limit: 1,
    file: 'params/boss.json',
    count: (json) => (Array.isArray(json.items) ? json.items.length : json.id ? 1 : null),
  },
  {
    name: 'MVP 해역 정의',
    limit: 1,
    file: 'params/sectors.json',
    count: (json) => (Array.isArray(json.items) ? json.items.length : null),
  },
];

async function main() {
  console.log(`── 신 스코프 가드 검사 (6차 결의 2)${STRICT ? ' [--strict]' : ''} ──`);
  const violations = [];

  for (const check of CHECKS) {
    if (!existsSync(check.file)) {
      console.log(`  ${check.name}: 정의 파일 없음 (${check.file}) — 0/${check.limit}, 통과`);
      continue;
    }
    let count;
    try {
      const json = JSON.parse(await readFile(check.file, 'utf8'));
      count = check.count(json);
    } catch (error) {
      violations.push(`${check.name}: ${check.file} 파싱 실패 — ${error.message}`);
      continue;
    }
    if (count === null) {
      violations.push(`${check.name}: ${check.file} 에서 항목 수를 읽을 수 없음 (items 배열 기대)`);
      continue;
    }
    if (count > check.limit) {
      violations.push(
        `${check.name}: ${count}개 — 상한 ${check.limit}개 초과. 초과분은 자동 백로그 (6차 결의 2)`,
      );
    } else {
      console.log(`  ${check.name}: ${count}/${check.limit} — 통과`);
    }
  }

  if (violations.length === 0) {
    console.log('✅ 신 스코프 가드 전 항목 상한 이내.');
    return;
  }

  for (const violation of violations) {
    console.error(`⚠ 스코프 가드 위반 — ${violation}`);
  }
  if (STRICT) {
    console.error('❌ --strict 모드: 위반으로 실패 처리합니다 (정책 완화는 리드 결정 — INT-TOOL-006).');
    process.exit(1);
  }
  console.warn('⚠ 경고 모드: 빌드는 계속되지만 초과분은 백로그로 이관해야 합니다.');
}

main().catch((error) => {
  console.error('❌ 스코프 가드 검사 중 오류:', error);
  process.exit(1);
});
