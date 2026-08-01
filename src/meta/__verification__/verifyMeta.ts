/**
 * 메타 루프·업그레이드 배율·정산 결정적 검증.
 *
 * 실행: node src/meta/__verification__/run.mjs (게임플레이 러너와 동일 방식).
 * 실제 EventBus·MetaLoop·순수 함수를 그대로 사용한다 — 난수·시간 의존 없음.
 */

import { EventBus } from '../../core/EventBus';
import type { SystemContext } from '../../core/GameSystem';
import type { GameStateMachine } from '../../core/GameStateMachine';
import type {
  CurrencyBundle,
  EquipmentChangeJudgePort,
  EquipmentChangeRequest,
  EquipmentId,
  PurchaseCost,
  PurchaseDenialReason,
  SavePort,
  SortieSessionPort,
  UpgradeLevelsPort,
  UpgradePurchaseJudgePort,
  UpgradeStatId,
  WalletTransactionPort,
} from '../../contracts/meta';
import type { FineAimSource, SubmarinePoseSource } from '../../contracts/systems';
import {
  bowDirectionXZ,
  clampAimPitchRadians,
  clampAimYawRadians,
} from '../../core/conventions';
import { TorpedoTubeSocketRig } from '../../core/TorpedoTubeSocketRig';
import { TORPEDO_TUBE_ANCHOR } from '../../world/torpedoTubeAnchor';
import {
  CountingSavePort,
  DepartureCommand,
  EquipmentJudgeAdapter,
  SortieSalvageSpawner,
  composeSalvageSpawnPlan,
  createBaseScreenPort,
} from '../../core/PveIntegration';
import type { SalvagePlacementSource } from '../../contracts/officialParams';
import { UpgradePurchaseSystem } from '../../systems/economy/UpgradePurchaseSystem';
import { EquipmentSystem } from '../../systems/EquipmentSystem';
import type { EquipmentCatalog, UpgradeEntry } from '../../tools/economyMath';
import { MetaLoop } from '../MetaLoop';
import { EquipmentTransaction } from '../EquipmentTransaction';
import { PurchaseTransaction } from '../PurchaseTransaction';
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

  // ── 스프린트 A: 원자적 구매 트랜잭션 (13차 결의 7, A5-T1~T4 대응) ──
  const makeWallet = (credits: number, rareParts = 0): WalletTransactionPort & { current: CurrencyBundle } => {
    const state = { current: { credits, rareParts } as CurrencyBundle };
    return {
      get current() {
        return state.current;
      },
      snapshotWallet: () => ({ ...state.current }),
      spendFromWallet: (cost: PurchaseCost) => {
        if (state.current.credits < cost.credits || state.current.rareParts < cost.rareParts) {
          return false;
        }
        state.current = {
          credits: state.current.credits - cost.credits,
          rareParts: state.current.rareParts - cost.rareParts,
        };
        return true;
      },
      restoreWallet: (wallet: CurrencyBundle) => {
        state.current = { ...wallet };
      },
    };
  };
  const makeLevels = (initial: Record<string, number> = {}): UpgradeLevelsPort & { current: Record<string, number> } => {
    const state = { current: { ...initial } };
    return {
      get current() {
        return state.current;
      },
      snapshotLevels: () => ({ ...state.current }),
      applyPurchasedLevel: (id: UpgradeStatId) => {
        state.current = { ...state.current, [id]: (state.current[id] ?? 0) + 1 };
      },
      restoreLevels: (levels: Readonly<Record<string, number>>) => {
        state.current = { ...levels };
      },
    };
  };
  const judgeAllow = (cost: PurchaseCost): UpgradePurchaseJudgePort => ({
    evaluateUpgradePurchase: () => ({ denial: null, cost }),
  });
  const judgeDeny = (reason: PurchaseDenialReason): UpgradePurchaseJudgePort => ({
    evaluateUpgradePurchase: () => ({ denial: reason, cost: { credits: 0, rareParts: 0 } }),
  });
  /** 저장 실패를 n회 강제한 뒤 성공하는 테스트 SavePort */
  const flakySave = (failures: number): SavePort & { calls: number } => {
    const state = { failures, calls: 0 };
    return {
      get calls() {
        return state.calls;
      },
      save: () => {
        state.calls += 1;
        if (state.failures > 0) {
          state.failures -= 1;
          return false;
        }
        return true;
      },
    };
  };

  {
    const wallet = makeWallet(200);
    const levels = makeLevels();
    const save = flakySave(0);
    const tx = new PurchaseTransaction(judgeAllow({ credits: 120, rareParts: 0 }), wallet, levels, save);
    const result = tx.run('maxSpeed');
    check(
      '구매: 성공 시 commit — 차감·단계 +1·저장 1회 (A5-T1)',
      result.status === 'success' && wallet.current.credits === 80 && levels.current['maxSpeed'] === 1 && save.calls === 1,
      `result=${result.status}, credits=${wallet.current.credits}, level=${levels.current['maxSpeed']}`,
    );
  }
  {
    const wallet = makeWallet(50);
    const levels = makeLevels({ maxSpeed: 3 });
    const save = flakySave(0);
    const tx = new PurchaseTransaction(judgeDeny('maxLevelReached'), wallet, levels, save);
    const result = tx.run('maxSpeed');
    check(
      '구매: 판정 거부 시 상태 무변경·저장 미호출 (A5-T2)',
      result.status === 'denied' &&
        result.reason === 'maxLevelReached' &&
        wallet.current.credits === 50 &&
        levels.current['maxSpeed'] === 3 &&
        save.calls === 0,
      `result=${JSON.stringify(result)}, credits=${wallet.current.credits}`,
    );
  }
  {
    const wallet = makeWallet(200, 1);
    const levels = makeLevels({ torpedoDamage: 1 });
    const save = flakySave(1);
    const tx = new PurchaseTransaction(judgeAllow({ credits: 150, rareParts: 1 }), wallet, levels, save);
    const result = tx.run('torpedoDamage');
    check(
      '구매: 저장 실패 시 크레딧·희귀 부품 롤백 (A5-T3)',
      result.status === 'saveFailedRolledBack' && wallet.current.credits === 200 && wallet.current.rareParts === 1,
      `result=${result.status}, wallet=${JSON.stringify(wallet.current)}`,
    );
    check(
      '구매: 저장 실패 시 업그레이드 단계 롤백 (A5-T4)',
      levels.current['torpedoDamage'] === 1,
      `level=${levels.current['torpedoDamage']}`,
    );
    // 실패 후 재시도 — 상태가 구매 전과 동일하므로 같은 요청이 성공해야 한다
    const retry = tx.run('torpedoDamage');
    check(
      '구매: 트랜잭션 실패 후 재시도 가능 — 다음 저장 성공 시 확정',
      retry.status === 'success' && wallet.current.credits === 50 && levels.current['torpedoDamage'] === 2,
      `retry=${retry.status}, credits=${wallet.current.credits}, level=${levels.current['torpedoDamage']}`,
    );
  }
  {
    // SavePort가 계약을 어기고 throw해도 트랜잭션은 던지지 않고 롤백한다
    const wallet = makeWallet(100);
    const levels = makeLevels();
    const throwingSave: SavePort = {
      save: () => {
        throw new Error('storage exploded');
      },
    };
    const tx = new PurchaseTransaction(judgeAllow({ credits: 10, rareParts: 0 }), wallet, levels, throwingSave);
    let threw = false;
    let result;
    try {
      result = tx.run('sonarRange');
    } catch {
      threw = true;
    }
    check(
      '구매: 저장 예외를 루프 밖으로 전파하지 않고 안전 결과 + 전체 롤백',
      !threw && result?.status === 'saveFailedRolledBack' && wallet.current.credits === 100 && (levels.current['sonarRange'] ?? 0) === 0,
      `threw=${threw}, result=${result?.status}, credits=${wallet.current.credits}`,
    );
  }

  // ── 스프린트 A: 장비 변경 트랜잭션 ──
  const makeLoadoutJudge = (
    initial: readonly ('standardTorpedo' | 'fastTorpedo' | 'heavyTorpedo' | 'decoy' | null)[],
    denial: PurchaseDenialReason | null = null,
  ): EquipmentChangeJudgePort & { current: readonly (EquipmentId | null)[] } => {
    const state = { slots: [...initial] as (EquipmentId | null)[] };
    return {
      get current(): readonly (EquipmentId | null)[] {
        return state.slots;
      },
      // 판정+적용 결합 (INT-CORE-010) — 불가 시 사유 반환·무변경
      applyEquipmentChange: (request: EquipmentChangeRequest) => {
        if (denial) return denial;
        if (request.kind === 'unequip') state.slots[request.slotIndex] = null;
        else state.slots[request.slotIndex] = request.equipmentId;
        return null;
      },
      snapshotSlots: (): readonly (EquipmentId | null)[] => [...state.slots],
      restoreSlots: (slots: readonly (EquipmentId | null)[]) => {
        state.slots = [...slots];
      },
    };
  };
  {
    const judge = makeLoadoutJudge(['standardTorpedo', null]);
    const save = flakySave(1);
    const tx = new EquipmentTransaction(judge, save);
    const result = tx.run({ kind: 'replace', slotIndex: 0, equipmentId: 'heavyTorpedo' });
    check(
      '장비: 저장 실패 시 이전 loadout 복원 (빈 슬롯 위치 포함)',
      result.status === 'saveFailedRolledBack' && judge.current[0] === 'standardTorpedo' && judge.current[1] === null,
      `result=${result.status}, slots=${JSON.stringify(judge.current)}`,
    );
    const retry = tx.run({ kind: 'replace', slotIndex: 0, equipmentId: 'heavyTorpedo' });
    check(
      '장비: 실패 후 재시도 — 저장 성공 시 교체 확정',
      retry.status === 'success' && judge.current[0] === 'heavyTorpedo',
      `retry=${retry.status}, slots=${JSON.stringify(judge.current)}`,
    );
  }
  {
    const judge = makeLoadoutJudge(['standardTorpedo', 'decoy'], 'alreadyEquipped');
    const save = flakySave(0);
    const tx = new EquipmentTransaction(judge, save);
    const result = tx.run({ kind: 'equip', slotIndex: 1, equipmentId: 'decoy' });
    check(
      '장비: 판정 거부(이미 장착) 시 무변경·저장 0회',
      result.status === 'denied' && result.reason === 'alreadyEquipped' && save.calls === 0 && judge.current[1] === 'decoy',
      `result=${JSON.stringify(result)}`,
    );
  }

  // ── 스프린트 A: 발사관 소켓 (7차 결의 1·13차 결의 2, A3 대응) ──
  const posedAt = (
    x: number,
    y: number,
    z: number,
    heading: number,
  ): SubmarinePoseSource => ({
    positionX: x,
    positionY: y,
    positionZ: z,
    headingRadians: heading,
    forwardSpeedMetersPerSecond: 0,
  });
  {
    const fineAim: FineAimSource = { aimYawRadians: 0.1, aimPitchRadians: -0.15 };
    const rig = new TorpedoTubeSocketRig(posedAt(3, -2, 7, 0.7), fineAim);
    const cam = rig.aimCameraSocket;
    const spawn = rig.torpedoSpawnSocket;
    const sameForward =
      Math.abs(cam.forwardX - spawn.forwardX) < 1e-12 &&
      Math.abs(cam.forwardY - spawn.forwardY) < 1e-12 &&
      Math.abs(cam.forwardZ - spawn.forwardZ) < 1e-12;
    check(
      '소켓: 조준 카메라와 어뢰 spawn의 전방축 완전 일치 (십자선 = 탄도)',
      sameForward,
      `cam=(${cam.forwardX.toFixed(4)},${cam.forwardY.toFixed(4)},${cam.forwardZ.toFixed(4)})`,
    );
    const offset = TORPEDO_TUBE_ANCHOR.spawnForwardSafetyOffsetMeters;
    const offsetOk =
      Math.abs(spawn.positionX - (cam.positionX + cam.forwardX * offset)) < 1e-12 &&
      Math.abs(spawn.positionY - (cam.positionY + cam.forwardY * offset)) < 1e-12 &&
      Math.abs(spawn.positionZ - (cam.positionZ + cam.forwardZ * offset)) < 1e-12;
    check(
      '소켓: spawn = 카메라 + 전방 × 안전 오프셋 — 오프셋 정의는 앵커 한 곳뿐',
      offsetOk,
      `offset=${offset}`,
    );
  }
  {
    // 미세 조준 미연결(= 조준 해제 reset 기준 상태): 전방 수평 성분 = 선수 방향
    const heading = -1.2;
    const rig = new TorpedoTubeSocketRig(posedAt(0, 0, 0, heading));
    const cam = rig.aimCameraSocket;
    const bow = bowDirectionXZ(heading);
    check(
      '소켓: 미세각 0(해제 reset 기준) — 전방 = 선수 방향, 피치 0',
      Math.abs(cam.forwardX - bow.x) < 1e-12 && Math.abs(cam.forwardZ - bow.z) < 1e-12 && cam.forwardY === 0,
      `forward=(${cam.forwardX.toFixed(4)},${cam.forwardY},${cam.forwardZ.toFixed(4)})`,
    );
  }
  {
    // 하향 제한 부호 규칙: 설정값은 양의 크기, 계산에서만 음수 적용 (13차 결의 8)
    const clampedDown = clampAimPitchRadians(-1.0, 10, 15);
    const clampedUp = clampAimPitchRadians(1.0, 10, 15);
    const downOk = Math.abs(clampedDown - -(15 * Math.PI) / 180) < 1e-12;
    const upOk = Math.abs(clampedUp - (10 * Math.PI) / 180) < 1e-12;
    const yawOk =
      Math.abs(clampAimYawRadians(9, 15) - (15 * Math.PI) / 180) < 1e-12 &&
      Math.abs(clampAimYawRadians(-9, 15) + (15 * Math.PI) / 180) < 1e-12;
    check(
      '조준각: 양수 크기 한계 → 하향에만 음수 적용, yaw ± 대칭 (공용 클램프 함수)',
      downOk && upOk && yawOk,
      `down=${clampedDown.toFixed(4)}, up=${clampedUp.toFixed(4)}`,
    );
  }

  // ── 스프린트 A: MetaLoop 지갑 포트·출항 직전 저장 ──
  {
    const { loop, events } = buildLoop();
    loop.restoreWallet({ credits: 100, rareParts: 2 });
    const spent = loop.spendFromWallet({ credits: 40, rareParts: 1 });
    const insufficient = loop.spendFromWallet({ credits: 1000, rareParts: 0 });
    check(
      '지갑 포트: BASE에서 차감 성공 / 부족 시 false·무변경',
      spent && !insufficient && loop.wallet.credits === 60 && loop.wallet.rareParts === 1,
      `wallet=${JSON.stringify(loop.wallet)}`,
    );
    loop.beginSortiePrep();
    loop.launchSortie();
    const spentAtSea = loop.spendFromWallet({ credits: 1, rareParts: 0 });
    check(
      '지갑 포트: 출항 중 차감 거부 (구매는 기지 전용)',
      !spentAtSea && loop.wallet.credits === 60,
      `spentAtSea=${spentAtSea}`,
    );
    check(
      '저장 책임: launchSortie는 saveRequested를 발행하지 않음 (출항 저장은 Departure command 소유 — INT-CORE-010)',
      !events.some((e) => e.startsWith('save:')),
      `save events=${events.filter((e) => e.startsWith('save')).join(',') || '없음'}`,
    );
  }

  // ── 스프린트 A production 조립 검증 (§6 — 저장 횟수·롤백·미확정 처리) ──
  /** 공식 카탈로그 모양의 테스트 항목 (수치는 검증 전용 — 밸런스 값 아님) */
  const testEntry = (
    id: UpgradeEntry['id'],
    costs: readonly (number | null)[],
  ): UpgradeEntry => ({
    id,
    label: `${id} 테스트`,
    maxLevel: costs.length,
    costCredits: costs,
    costRareParts: costs.map((value) => (value === null ? null : 0)),
    effectBonus: costs.map((value) => (value === null ? null : 0.1)),
  });
  const emptyEquipmentCatalog: EquipmentCatalog = { slotCapacity: 2, items: [] };

  /** production과 동일한 조립(실제 MetaLoop·판정 시스템·트랜잭션·계측 포트) */
  const buildProduction = (options?: {
    catalog?: readonly UpgradeEntry[];
    saveFailures?: number;
    wallet?: { credits: number; rareParts: number };
  }): {
    loop: MetaLoop;
    purchase: UpgradePurchaseSystem;
    savePort: CountingSavePort;
    screen: ReturnType<typeof createBaseScreenPort>;
    equipment: EquipmentSystem;
    committed: { count: number };
  } => {
    const { loop } = buildLoop();
    loop.restoreWallet(options?.wallet ?? { credits: 500, rareParts: 2 });
    const catalog = options?.catalog ?? [testEntry('maxSpeed', [100, 200])];
    const inner = flakySave(options?.saveFailures ?? 0);
    const savePort = new CountingSavePort(inner);
    const purchase = new UpgradePurchaseSystem(
      catalog.map((entry) => ({ id: entry.id, maxLevel: entry.maxLevel, bonusPerLevel: 0.1 })),
      {
        get credits() {
          return loop.wallet.credits;
        },
        get rareParts() {
          return loop.wallet.rareParts;
        },
        applyDelta: () => {},
      },
      (statId, nextLevel) => {
        const entry = catalog.find((candidate) => candidate.id === statId);
        const credits = entry?.costCredits[nextLevel - 1] ?? null;
        const rareParts = entry?.costRareParts[nextLevel - 1] ?? null;
        if (credits === null || rareParts === null) {
          return { credits: Number.POSITIVE_INFINITY, rareParts: Number.POSITIVE_INFINITY };
        }
        return { credits, rareParts };
      },
    );
    const equipment = new EquipmentSystem(['standardTorpedo']);
    const committed = { count: 0 };
    const screen = createBaseScreenPort({
      meta: loop,
      upgradeCatalog: catalog,
      equipmentCatalog: emptyEquipmentCatalog,
      levelsOf: () => purchase.levelSnapshot,
      loadoutOf: () => equipment.loadout,
      purchaseTx: new PurchaseTransaction(purchase, loop, purchase, savePort),
      equipmentTx: new EquipmentTransaction(new EquipmentJudgeAdapter(equipment), savePort),
      departure: new DepartureCommand(loop, savePort),
      onPurchaseCommitted: () => {
        committed.count += 1;
      },
    });
    return { loop, purchase, savePort, screen, equipment, committed };
  };

  {
    const { loop, purchase, savePort, screen, committed } = buildProduction();
    const outcome = screen.purchaseUpgrade('maxSpeed');
    check(
      'production 구매: 성공 시 저장 정확히 1회 + 실지갑 차감·단계 확정·파생 갱신 훅 1회',
      outcome === 'success' &&
        savePort.callCount === 1 &&
        loop.wallet.credits === 400 &&
        purchase.levelSnapshot['maxSpeed'] === 1 &&
        committed.count === 1,
      `outcome=${outcome}, saves=${savePort.callCount}, credits=${loop.wallet.credits}`,
    );
  }
  {
    const { loop, purchase, savePort, screen } = buildProduction({ wallet: { credits: 50, rareParts: 0 } });
    const outcome = screen.purchaseUpgrade('maxSpeed');
    check(
      'production 구매: 불가(크레딧 부족) 시 저장 0회·상태 무변경',
      outcome === 'insufficientCredits' &&
        savePort.callCount === 0 &&
        loop.wallet.credits === 50 &&
        (purchase.levelSnapshot['maxSpeed'] ?? 0) === 0,
      `outcome=${outcome}, saves=${savePort.callCount}`,
    );
  }
  {
    const { loop, purchase, savePort, screen } = buildProduction({ saveFailures: 1 });
    const outcome = screen.purchaseUpgrade('maxSpeed');
    const retry = screen.purchaseUpgrade('maxSpeed');
    check(
      'production 구매: 저장 실패 시 저장 시도 1회 + 크레딧·단계 롤백, 재시도 성공',
      outcome === 'saveFailedRolledBack' &&
        retry === 'success' &&
        savePort.callCount === 2 &&
        loop.wallet.credits === 400 &&
        purchase.levelSnapshot['maxSpeed'] === 1,
      `outcome=${outcome}, retry=${retry}, saves=${savePort.callCount}, credits=${loop.wallet.credits}`,
    );
  }
  {
    const { savePort, screen, equipment } = buildProduction();
    const equip = screen.equipItem('decoy', 1);
    const replace = screen.replaceItem('heavyTorpedo', 0);
    const unequip = screen.unequipItem(1);
    check(
      'production 장비: 장착·교체·해제 성공 시 각각 저장 1회 (총 3회)',
      equip === 'success' &&
        replace === 'success' &&
        unequip === 'success' &&
        savePort.callCount === 3 &&
        equipment.slots[0] === 'heavyTorpedo' &&
        equipment.slots[1] === null,
      `results=${equip}/${replace}/${unequip}, saves=${savePort.callCount}`,
    );
  }
  {
    const { savePort, screen, equipment } = buildProduction();
    const outcome = screen.replaceItem('standardTorpedo', 1); // 이미 슬롯0에 장착됨
    check(
      'production 장비: 실패(이미 장착) 시 저장 0회·loadout 무변경',
      outcome === 'alreadyEquipped' && savePort.callCount === 0 && equipment.slots[1] === null,
      `outcome=${outcome}, saves=${savePort.callCount}`,
    );
  }
  {
    const { loop, savePort, screen } = buildProduction();
    const result = screen.confirmDeparture();
    check(
      'production 출항: 성공 시 저장 1회 후 해역 전환 (departed)',
      result === 'departed' && savePort.callCount === 1 && loop.metaState === 'SORTIE',
      `result=${result}, saves=${savePort.callCount}, state=${loop.metaState}`,
    );
  }
  {
    const { loop, savePort, screen } = buildProduction({ saveFailures: 1 });
    const result = screen.confirmDeparture();
    check(
      'production 출항: 저장 실패 시 전환 없음 (기지 유지·재시도 가능)',
      result === 'saveFailed' && savePort.callCount === 1 && loop.metaState === 'BASE',
      `result=${result}, state=${loop.metaState}`,
    );
    const retry = screen.confirmDeparture();
    check(
      'production 출항: 실패 후 재시도 — 저장 성공 시 출항',
      retry === 'departed' && loop.metaState === 'SORTIE',
      `retry=${retry}, state=${loop.metaState}`,
    );
  }
  {
    const { loop, purchase, savePort, screen } = buildProduction({
      catalog: [testEntry('sonarRange', [null, null])], // 공식 수치 미확정
    });
    const outcome = screen.purchaseUpgrade('sonarRange');
    const item = screen.upgradeCatalog.find((candidate) => candidate.id === 'sonarRange');
    check(
      'production 경제 미확정: economyDataUnavailable — 상태 변경 0·저장 0·null 비변환·버튼 비활성 신호',
      outcome === 'economyDataUnavailable' &&
        savePort.callCount === 0 &&
        loop.wallet.credits === 500 &&
        (purchase.levelSnapshot['sonarRange'] ?? 0) === 0 &&
        item?.nextCost === null &&
        item?.nextCostPending === true,
      `outcome=${outcome}, saves=${savePort.callCount}, pending=${item?.nextCostPending}`,
    );
  }
  {
    const { loop, screen } = buildProduction({ wallet: { credits: 123, rareParts: 4 } });
    const sameAsMeta =
      screen.wallet.credits === loop.wallet.credits &&
      screen.wallet.rareParts === loop.wallet.rareParts &&
      screen.wallet.credits === 123;
    check(
      'production BaseScreenPort: 실제 MetaLoop 지갑을 반환 (사본·임시 지갑 아님)',
      sameAsMeta && screen.lastResult === null,
      `wallet=${JSON.stringify(screen.wallet)}`,
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

  // ── salvage 결합·스폰 (INT-CORE-011 — 로직 검증은 픽스처, 실제
  //    economy.json 값 검증은 run.mjs 실파일 검사에서 수행) ──
  {
    const fixtureEconomy = {
      dropTables: {
        'salvage-chest': { credits: 7, rareParts: 0 },
        'salvage-mineral': { credits: 3, rareParts: 0 },
      },
      salvageSpawns: [
        { spawnId: 's-a', kind: 'chest', dropTableId: 'salvage-chest', rarePartId: null },
        { spawnId: 's-b', kind: 'mineral', dropTableId: 'salvage-mineral', rarePartId: 'rare-x' },
      ],
    } as const;
    const fixturePlacements: SalvagePlacementSource = {
      placements: [
        { spawnId: 's-a', worldPosition: { x: 1, y: -2, z: 3 } },
        { spawnId: 's-b', worldPosition: { x: -4, y: -5, z: 6 }, orientationYawRadians: 0.5 },
      ],
    };

    {
      const plan = composeSalvageSpawnPlan(fixtureEconomy, fixturePlacements);
      const a = plan.find((entry) => entry.spawnId === 's-a');
      const b = plan.find((entry) => entry.spawnId === 's-b');
      check(
        'salvage 결합: 동일 spawnId 결합 성공 — 보상=economy·좌표=placement 파생',
        plan.length === 2 &&
          a?.credits === 7 &&
          a.rarePartCount === 0 &&
          a.worldPosition.x === 1 &&
          b?.credits === 3 &&
          b.rarePartId === 'rare-x' &&
          b.rarePartCount === 1 &&
          b.worldPosition.z === 6 &&
          b.orientationYawRadians === 0.5,
        JSON.stringify(plan),
      );
    }
    {
      let threw = false;
      try {
        composeSalvageSpawnPlan(fixtureEconomy, { placements: [fixturePlacements.placements[0]!] });
      } catch {
        threw = true;
      }
      check('salvage 결합: 배치 누락 spawnId 거부 (무시 금지)', threw, `threw=${threw}`);
    }
    {
      let threw = false;
      try {
        composeSalvageSpawnPlan(fixtureEconomy, {
          placements: [
            ...fixturePlacements.placements,
            { spawnId: 's-ghost', worldPosition: { x: 0, y: 0, z: 0 } },
          ],
        });
      } catch {
        threw = true;
      }
      check('salvage 결합: 경제에 없는 배치 spawnId 거부', threw, `threw=${threw}`);
    }
    {
      let threw = false;
      try {
        composeSalvageSpawnPlan(fixtureEconomy, {
          placements: [...fixturePlacements.placements, fixturePlacements.placements[0]!],
        });
      } catch {
        threw = true;
      }
      check('salvage 결합: 중복 spawnId 거부', threw, `threw=${threw}`);
    }
    {
      let threw = false;
      try {
        composeSalvageSpawnPlan(
          {
            dropTables: fixtureEconomy.dropTables,
            salvageSpawns: [
              { spawnId: 's-a', kind: 'chest', dropTableId: 'no-such-table', rarePartId: null },
            ],
          },
          { placements: [fixturePlacements.placements[0]!] },
        );
      } catch {
        threw = true;
      }
      check('salvage 결합: 미지 dropTableId 거부', threw, `threw=${threw}`);
    }

    {
      const spawned: string[] = [];
      const spawner = new SortieSalvageSpawner(fixtureEconomy, {
        spawnSalvage: (kind) => {
          spawned.push(kind);
          return null;
        },
      });
      const unwired = spawner.beginSortie();
      check(
        'salvage 스포너: 배치 미연결 = unwired — 임시 좌표·생성 없음',
        unwired.status === 'unwired' && spawned.length === 0 && !spawner.placementWired,
        `status=${unwired.status}, spawned=${spawned.length}`,
      );

      spawner.attachPlacementSource(fixturePlacements);
      const first = spawner.beginSortie();
      const again = spawner.spawnForSortie();
      check(
        'salvage 스포너: 출항당 1회 — 재호출은 alreadySpawned (파괴분 재생성 금지)',
        first.status === 'spawned' &&
          first.count === 2 &&
          spawned.length === 2 &&
          again.status === 'alreadySpawned',
        `first=${JSON.stringify(first)}, again=${again.status}, spawned=${spawned.length}`,
      );

      const nextSortie = spawner.beginSortie();
      check(
        'salvage 스포너: 새 출항 = 재생성 (MVP 루프 규칙)',
        nextSortie.status === 'spawned' && spawned.length === 4,
        `next=${JSON.stringify(nextSortie)}, spawned=${spawned.length}`,
      );
    }
    {
      const spawned: string[] = [];
      const spawner = new SortieSalvageSpawner(fixtureEconomy, {
        spawnSalvage: (kind) => {
          spawned.push(kind);
          return null;
        },
      });
      spawner.attachPlacementSource({ placements: [fixturePlacements.placements[0]!] });
      const rejected = spawner.beginSortie();
      check(
        'salvage 스포너: 결합 거부 시 부분 생성 없음 (rejected·0건)',
        rejected.status === 'rejected' && spawned.length === 0,
        `status=${rejected.status}, spawned=${spawned.length}`,
      );
    }
  }

  return results;
}
