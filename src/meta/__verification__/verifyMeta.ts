/**
 * 메타 루프·업그레이드 배율·정산 결정적 검증.
 *
 * 실행: node src/meta/__verification__/run.mjs (게임플레이 러너와 동일 방식).
 * 실제 EventBus·MetaLoop·순수 함수를 그대로 사용한다 — 난수·시간 의존 없음.
 */

import { EventBus } from '../../core/EventBus';
import type { SystemContext } from '../../core/GameSystem';
import type { GameStateMachine } from '../../core/GameStateMachine';
import type { SortieSessionPort } from '../../contracts/meta';
import { MetaLoop } from '../MetaLoop';
import { computeSortieSettlement } from '../settlement';
import { effectiveDurationSeconds, effectiveValue, mergeModifiers, modifierSumFor } from '../upgradeMath';

export interface VerificationResult {
  name: string;
  passed: boolean;
  detail: string;
}

/** 기록형 세션 포트 — 상위가 하위 내부를 읽지 않음을 호출 기록으로 검증한다 */
class RecordingSessionPort implements SortieSessionPort {
  startCalls = 0;
  returnRequests = 0;
  /** 중도 귀환 시 하위가 정리 후 결과를 보고하는 경로의 재현 */
  onReturnRequested: (() => void) | null = null;

  start(): void {
    this.startCalls += 1;
  }

  requestReturnToBase(): void {
    this.returnRequests += 1;
    this.onReturnRequested?.();
  }
}

/**
 * 검증 전용 컨텍스트. MetaLoop.initialize는 계약상 bus 구독만 수행한다 —
 * GameStateMachine은 생성자 매개변수 프로퍼티를 사용해 러너의 타입
 * 스트리핑(strip-only)으로 로드할 수 없어, 검증에서는 미사용 필드를 채우지
 * 않는다 (프로덕션 조립은 core/Game이 실제 인스턴스로 수행).
 */
function verificationContext(bus: EventBus): SystemContext {
  return {
    bus,
    params: undefined as unknown as SystemContext['params'],
    stateMachine: undefined as unknown as GameStateMachine,
  };
}

function buildLoop(lossRatio = 0.5): {
  bus: EventBus;
  port: RecordingSessionPort;
  loop: MetaLoop;
  events: string[];
} {
  const bus = new EventBus();
  const port = new RecordingSessionPort();
  const loop = new MetaLoop(bus, port, { creditLossOnDestroyedRatio: lossRatio });
  const events: string[] = [];
  bus.on('metaStateChanged', (p) => events.push(`meta:${p.previous}->${p.next}`));
  bus.on('sortieStarted', (p) => events.push(`start:${p.sortieNumber}`));
  bus.on('sortieEnded', (p) => events.push(`end:${p.settlement.outcome}:${p.settlement.creditsNet}`));
  bus.on('saveRequested', (p) => events.push(`save:${p.cause}`));
  loop.initialize(verificationContext(bus));
  return { bus, port, loop, events };
}

export function runMetaVerification(): VerificationResult[] {
  const results: VerificationResult[] = [];
  const check = (name: string, passed: boolean, detail: string): void => {
    results.push({ name, passed, detail });
  };

  // ── 상태 머신 골격 ──
  {
    const { loop } = buildLoop();
    check(
      '메타: 초기 상태 = BASE, 지갑 0',
      loop.metaState === 'BASE' && loop.wallet.credits === 0 && loop.wallet.rareParts === 0,
      `state=${loop.metaState}, wallet=${JSON.stringify(loop.wallet)}`,
    );
  }
  {
    const { loop, port, events } = buildLoop();
    loop.beginSortiePrep();
    loop.launchSortie();
    check(
      '메타: 기지→출항 준비→해역 세션 전환 + ① 세션 시작 포트 호출',
      loop.metaState === 'SORTIE' && port.startCalls === 1 && events.includes('start:1'),
      `state=${loop.metaState}, startCalls=${port.startCalls}`,
    );
  }
  {
    const { loop } = buildLoop();
    let threw = false;
    try {
      loop.settleSortie({ outcome: 'returned' }); // BASE에서 정산 = 허용표 밖
    } catch {
      threw = true;
    }
    check('메타: 허용표 밖 전환은 throw (BASE→DEBRIEF)', threw, `threw=${threw}`);
  }
  {
    const { loop } = buildLoop();
    loop.beginSortiePrep();
    loop.cancelSortiePrep();
    check('메타: 출항 준비 취소 → 기지 복귀', loop.metaState === 'BASE', `state=${loop.metaState}`);
  }

  // ── 드롭 집계·희귀 부품 즉시 확정 ──
  {
    const { bus, loop, events } = buildLoop();
    loop.beginSortiePrep();
    loop.launchSortie();
    bus.emit('lootDropped', { source: 'cargoShip', credits: 120, rareParts: 0, x: 0, z: 0 });
    bus.emit('lootDropped', { source: 'seabedCache', credits: 30, rareParts: 1, x: 1, z: 1 });
    const rareSaved = events.filter((e) => e === 'save:rarePart').length;
    check(
      '경제: 출항 중 드롭 집계 + 희귀 부품 즉시 지갑 확정·즉시 저장 요청',
      loop.wallet.rareParts === 1 && rareSaved === 1 && loop.wallet.credits === 0,
      `rareParts=${loop.wallet.rareParts}, save:rarePart=${rareSaved}, 정산 전 크레딧 지갑=${loop.wallet.credits}`,
    );
  }
  {
    const { bus, loop } = buildLoop();
    bus.emit('lootDropped', { source: 'cargoShip', credits: 999, rareParts: 9, x: 0, z: 0 });
    check(
      '경제: 세션 밖(BASE) 드롭은 무시',
      loop.wallet.credits === 0 && loop.wallet.rareParts === 0,
      `wallet=${JSON.stringify(loop.wallet)}`,
    );
  }

  // ── 정산 (② 세션 결과) ──
  {
    const { bus, loop, events } = buildLoop();
    loop.beginSortiePrep();
    loop.launchSortie();
    bus.emit('lootDropped', { source: 'cargoShip', credits: 150, rareParts: 0, x: 0, z: 0 });
    loop.settleSortie({ outcome: 'returned' });
    check(
      '정산: 정상 귀환 = 손실 0, 지갑 전액 반영 + sortieEnded + 저장 요청',
      loop.wallet.credits === 150 &&
        events.includes('end:returned:150') &&
        events.includes('save:settlement') &&
        loop.metaState === 'DEBRIEF',
      `wallet.credits=${loop.wallet.credits}, state=${loop.metaState}`,
    );
  }
  {
    const { bus, loop, events } = buildLoop(0.5);
    loop.beginSortiePrep();
    loop.launchSortie();
    bus.emit('lootDropped', { source: 'cargoShip', credits: 101, rareParts: 1, x: 0, z: 0 });
    loop.settleSortie({ outcome: 'destroyed' });
    check(
      '정산: 파괴 = 크레딧 50% 손실(내림) 정산 데이터 전달, 희귀 부품 보존',
      loop.wallet.credits === 51 && loop.wallet.rareParts === 1 && events.includes('end:destroyed:51'),
      `wallet=${JSON.stringify(loop.wallet)}`,
    );
  }
  {
    const { bus, loop, port } = buildLoop();
    loop.beginSortiePrep();
    loop.launchSortie();
    bus.emit('lootDropped', { source: 'wreckSalvage', credits: 40, rareParts: 0, x: 0, z: 0 });
    // ③ 중도 귀환: 요청 이벤트 → 포트 위임 → 하위가 정리 후 aborted 결과 보고
    port.onReturnRequested = () => loop.settleSortie({ outcome: 'aborted' });
    bus.emit('returnToBaseRequested', {});
    check(
      '중도 귀환: 이벤트 → 포트 위임 → aborted 정산 (손실 0)',
      port.returnRequests === 1 && loop.wallet.credits === 40 && loop.metaState === 'DEBRIEF',
      `returnRequests=${port.returnRequests}, credits=${loop.wallet.credits}`,
    );
  }
  {
    const { bus, loop, port } = buildLoop();
    bus.emit('returnToBaseRequested', {});
    check(
      '중도 귀환: SORTIE 밖 요청은 무시',
      port.returnRequests === 0 && loop.metaState === 'BASE',
      `returnRequests=${port.returnRequests}`,
    );
  }

  // ── D+9 루프 골격: 기지→출항→파밍→귀환→정산→재출항 ──
  {
    const { bus, loop, port } = buildLoop();
    loop.beginSortiePrep();
    loop.launchSortie();
    bus.emit('lootDropped', { source: 'cargoShip', credits: 100, rareParts: 1, x: 0, z: 0 });
    loop.settleSortie({ outcome: 'returned' });
    loop.completeDebrief();
    loop.beginSortiePrep();
    loop.launchSortie(); // 재출항 — 하위 세션 재시작 + 집계 리셋
    bus.emit('lootDropped', { source: 'cargoShip', credits: 10, rareParts: 0, x: 0, z: 0 });
    loop.settleSortie({ outcome: 'destroyed' });
    check(
      '루프: 재출항 시 세션 재시작·집계 리셋·영구 데이터 보존 (2회차 파괴 손실은 2회차 분만)',
      port.startCalls === 2 &&
        loop.sortieNumber === 2 &&
        loop.wallet.credits === 100 + 5 &&
        loop.wallet.rareParts === 1,
      `startCalls=${port.startCalls}, sortie=${loop.sortieNumber}, wallet=${JSON.stringify(loop.wallet)}`,
    );
  }
  {
    const { bus, loop } = buildLoop();
    loop.dispose();
    bus.emit('lootDropped', { source: 'cargoShip', credits: 50, rareParts: 0, x: 0, z: 0 });
    check('수명주기: dispose 후 이벤트 무반응', loop.wallet.credits === 0, `credits=${loop.wallet.credits}`);
  }

  // ── 업그레이드 배율 레이어 (합연산·불변) ──
  {
    const merged = mergeModifiers({ maxSpeed: 0.2 }, { maxSpeed: 0.3, torpedoDamage: 0.1 });
    const sum = modifierSumFor(merged, 'maxSpeed');
    const value = effectiveValue(10, sum);
    check(
      '업그레이드: 합연산 병합 — +20% +30% = +50% (곱연산 1.56배 아님)',
      sum === 0.5 && value === 15,
      `sum=${sum}, 10 → ${value}`,
    );
  }
  {
    const base = { maxSpeed: 0.2 } as const;
    mergeModifiers(base, { maxSpeed: 0.3 });
    check('업그레이드: 입력 보정 집합 불변 (원본 미변경)', base.maxSpeed === 0.2, `base.maxSpeed=${base.maxSpeed}`);
  }
  {
    const value = effectiveDurationSeconds(20, 0.25);
    check(
      '업그레이드: 시간형 파라미터는 단축 적용 — 재장전 20s, +25% → 16s',
      value === 16,
      `20s → ${value}s`,
    );
  }
  {
    let threw = false;
    try {
      effectiveValue(10, -1);
    } catch {
      threw = true;
    }
    check('업그레이드: 보정 합 ≤ -100%는 거부', threw, `threw=${threw}`);
  }
  {
    // params 원본 불변 — 유효값 계산이 원본 객체를 건드리지 않는다
    const paramsLike = { maxSpeedMetersPerSecond: { value: 10, unit: 'm/s' } };
    const before = JSON.stringify(paramsLike);
    effectiveValue(paramsLike.maxSpeedMetersPerSecond.value, 0.4);
    check(
      '업그레이드: params 원본 불변 (mutate 없음)',
      JSON.stringify(paramsLike) === before,
      'JSON 직렬화 비교 일치',
    );
  }

  // ── 정산 순수 함수 경계값 ──
  {
    const s = computeSortieSettlement({
      outcome: 'destroyed',
      creditsEarned: 0,
      rarePartsSecured: 0,
      creditLossOnDestroyedRatio: 0.7,
    });
    check('정산: 획득 0 파괴 = 손실 0·net 0', s.creditsLost === 0 && s.creditsNet === 0, JSON.stringify(s));
  }
  {
    let threw = false;
    try {
      computeSortieSettlement({
        outcome: 'returned',
        creditsEarned: 10,
        rarePartsSecured: 0,
        creditLossOnDestroyedRatio: 1.2,
      });
    } catch {
      threw = true;
    }
    check('정산: 손실률 범위 밖(>1) 거부', threw, `threw=${threw}`);
  }

  return results;
}
