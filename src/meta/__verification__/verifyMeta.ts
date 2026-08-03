/**
 * 메타 루프·업그레이드 배율·정산 결정적 검증.
 *
 * 실행: node src/meta/__verification__/run.mjs (게임플레이 러너와 동일 방식).
 * 실제 EventBus·MetaLoop·순수 함수를 그대로 사용한다 — 난수·시간 의존 없음.
 */

import { validateCombatParams } from '../../tools/combatParams';
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
  GuardIncidentLedger,
  GuardSpawnBridge,
  GuardSpawnCoordinator,
  NeutralIncidentBoundary,
  SortieSalvageSpawner,
  composeSalvageSpawnPlan,
  createBaseScreenPort,
} from '../../core/PveIntegration';
import type { SalvagePlacementSource } from '../../contracts/officialParams';
import { GuardShipAdapter } from '../../core/GuardShipAdapter';
import type { GuardShipHandle } from '../../core/GuardShipAdapter';
import { DestroyerAIController } from '../../core/DestroyerAIController';
import { createProductionDestroyerAIFactory } from '../../core/destroyerAiFactory';
import { FACTION_RULES, rewardDropTableIdFor } from '../../contracts/faction';
import type { FactionId } from '../../contracts/faction';
import { PLAYER_ENTITY_ID } from '../../contracts/guard';
import type {
  DestroyerAIFactory,
  EscortBinding,
  GuardShipAdapterConfig,
  GuardShipRequestPayload,
  NeutralShipHitPayload,
  SurfaceShipMotionPort,
} from '../../contracts/guard';
import { PlayerHullSystem } from '../../core/PlayerHullSystem';
import { FloodingCore } from '../../core/FloodingCore';
import { SortieFailureCoordinator } from '../../core/SortieFailureCoordinator';
import {
  DebriefConfirmCommand,
  DebriefStateTracker,
  EnemyAttackPortBinding,
} from '../../core/PveIntegration';
import type { EnemyAttackPort, EnemyAttackRequest } from '../../contracts/survival';
import type {
  DamageRequest,
  FloodingParams,
  HullBaseParams,
  SortieFailureReport,
} from '../../contracts/survival';
import type {
  IdentificationLogSink,
  IdentificationOpportunityLog,
  ShipIdentificationSource,
  ShipIdentificationView,
} from '../../contracts/identification';
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
        // 결합 entry 전체 수신 — spawnId 유실 여부를 여기서 검사한다
        spawnSalvageFromPlan: (entry) => {
          spawned.push(entry.spawnId);
          return { status: 'spawned' };
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

      check(
        'salvage 스포너: spawnId 유실 없음 — 결합 entry가 그대로 전달된다',
        spawned.join(',') === 's-a,s-b',
        `spawnIds=${spawned.join(',')}`,
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
        // 결합 entry 전체 수신 — spawnId 유실 여부를 여기서 검사한다
        spawnSalvageFromPlan: (entry) => {
          spawned.push(entry.spawnId);
          return { status: 'spawned' };
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

  // ── 스프린트 B 선행개발: 세력·중립 사건·경비함 스폰 (INT-CORE-012) ──
  {
    // 세력 정본 — 중복 의미 없음
    {
      const ids = Object.keys(FACTION_RULES);
      const labels = ids.map((id) => FACTION_RULES[id as FactionId].displayLabelId);
      const incidentRaisers = ids.filter((id) => FACTION_RULES[id as FactionId].raisesNeutralIncident);
      check(
        'B 세력: FactionId 3종(hostile·neutral·patrol) — guard 별칭 없음·중복 의미 없음',
        ids.length === 3 &&
          ids.includes('hostile') &&
          ids.includes('neutral') &&
          ids.includes('patrol') &&
          !ids.includes('guard') &&
          new Set(labels).size === 3 &&
          incidentRaisers.length === 1 &&
          incidentRaisers[0] === 'neutral',
        `ids=${ids.join('/')}, 중립사건=${incidentRaisers.join('/')}`,
      );
    }
    // 보상 계약 — 중립 0·적대 공식 테이블·patrol 발명 금지
    {
      const hostile = rewardDropTableIdFor('hostile');
      const neutral = rewardDropTableIdFor('neutral');
      const patrol = rewardDropTableIdFor('patrol');
      check(
        'B 보상: hostile=공식 드롭 테이블 / neutral=null(크레딧 0) / patrol=null(수치 발명 없음)',
        hostile === 'cargo-standard' && neutral === null && patrol === null,
        `hostile=${hostile}, neutral=${neutral}, patrol=${patrol}`,
      );
    }
    // 직렬화 — 이벤트 payload 왕복
    {
      const payload: NeutralShipHitPayload = {
        targetEntityId: 7,
        attackerEntityId: PLAYER_ENTITY_ID,
        targetFaction: 'neutral',
        attackWorldPosition: { x: 3, z: -4 },
        damageAmount: 12,
        attackCorrelationId: 'atk-1',
        timestamp: 1000,
        firstValidNeutralHit: true,
      };
      const roundTrip = JSON.parse(JSON.stringify(payload)) as NeutralShipHitPayload;
      check(
        'B 직렬화: hostile/neutral 태그와 중립 피격 payload 왕복 보존',
        roundTrip.targetFaction === 'neutral' &&
          roundTrip.attackCorrelationId === 'atk-1' &&
          roundTrip.attackerEntityId === PLAYER_ENTITY_ID &&
          JSON.parse(JSON.stringify({ f: 'hostile' as FactionId })).f === 'hostile',
        JSON.stringify(roundTrip),
      );
    }

    const neutralHit = (
      overrides: Partial<NeutralShipHitPayload> = {},
    ): NeutralShipHitPayload => ({
      targetEntityId: 7,
      attackerEntityId: PLAYER_ENTITY_ID,
      targetFaction: 'neutral',
      attackWorldPosition: { x: 3, z: -4 },
      damageAmount: 12,
      attackCorrelationId: 'atk-1',
      timestamp: 1000,
      firstValidNeutralHit: true,
      ...overrides,
    });

    const buildGuardChain = (
      options: { withAi?: boolean; withLocation?: boolean } = {},
    ): {
      bus: EventBus;
      requests: GuardShipRequestPayload[];
      adapter: GuardShipAdapter;
      bridge: GuardSpawnBridge;
      createdAiConfigs: GuardShipAdapterConfig[];
      spawnedHandles: GuardShipHandle[];
    } => {
      const bus = new EventBus();
      const ledger = new GuardIncidentLedger();
      const createdAiConfigs: GuardShipAdapterConfig[] = [];
      const notifiedPositions: Array<{ x: number; z: number }> = [];
      const factory: DestroyerAIFactory = {
        create: (config) => {
          createdAiConfigs.push(config);
          // 기존 DestroyerAI 계약을 그대로 만족하는 대역 — 어댑터는 이
          // 인스턴스의 판단에 개입하지 않는다 (신규 AI 코어 없음).
          return {
            state: 'alert' as const,
            notifyLastKnownPosition: (x: number, z: number) => {
              notifiedPositions.push({ x, z });
            },
            update: () => {},
          };
        },
      };
      const adapter = new GuardShipAdapter(options.withAi === false ? null : factory);
      const spawnedHandles: GuardShipHandle[] = [];
      const coordinator = new GuardSpawnCoordinator(ledger, adapter, null);
      if (options.withLocation !== false) {
        coordinator.attachLocationStrategy({
          resolve: (request) => ({ x: request.incidentPosition.x + 20, z: request.incidentPosition.z }),
        });
      }
      coordinator.attachSpawnListener((handle) => spawnedHandles.push(handle));
      const bridge = new GuardSpawnBridge(coordinator);
      const boundary = new NeutralIncidentBoundary(ledger);
      boundary.initialize(verificationContext(bus));
      bridge.initialize(verificationContext(bus));
      const requests: GuardShipRequestPayload[] = [];
      bus.on('guardShipRequested', (payload) => requests.push(payload));
      return { bus, requests, adapter, bridge, createdAiConfigs, spawnedHandles };
    };

    {
      const { bus, requests } = buildGuardChain();
      bus.emit('neutralShipHit', neutralHit());
      bus.emit('neutralShipHit', neutralHit());
      check(
        'B 중복 방지: 동일 attackCorrelationId → 경비 요청 1회 (원장 단일 저장소)',
        requests.length === 1 && requests[0]?.correlationId === 'atk-1',
        `requests=${requests.length}`,
      );
    }
    {
      const { bus, requests } = buildGuardChain();
      bus.emit('neutralShipHit', neutralHit({ targetFaction: 'hostile', attackCorrelationId: 'atk-h' }));
      check(
        'B 세력 판정: 적대 선박 피격은 경비 요청 0회 (중립 사건 아님)',
        requests.length === 0,
        `requests=${requests.length}`,
      );
    }
    {
      const { bus, requests } = buildGuardChain();
      bus.emit('neutralShipHit', neutralHit({ firstValidNeutralHit: false, attackCorrelationId: 'atk-2' }));
      check(
        'B 중복 방지: 첫 유효 피격이 아니면 요청하지 않음 (파괴 후 추가 피격 포함)',
        requests.length === 0,
        `requests=${requests.length}`,
      );
    }
    {
      const { bus, requests, spawnedHandles, createdAiConfigs, adapter } = buildGuardChain();
      bus.emit('neutralShipHit', neutralHit());
      const handle = spawnedHandles[0];
      const config = createdAiConfigs[0];
      check(
        'B 스폰: 중립 유효 피격 1건 → 요청 1건 → 스폰 1척 (기존 구축함 AI 사용)',
        requests.length === 1 &&
          spawnedHandles.length === 1 &&
          createdAiConfigs.length === 1 &&
          adapter.spawnedShips.length === 1 &&
          handle?.ai !== undefined,
        `requests=${requests.length}, spawned=${spawnedHandles.length}`,
      );
      check(
        'B 스폰: 경비함 세력 = patrol · 초기 표적 = 공격자(플레이어)',
        handle?.faction === 'patrol' &&
          handle.initialTargetEntityId === PLAYER_ENTITY_ID &&
          config?.initialTargetPosition.x === 3 &&
          config.spawnPosition.x === 23,
        `faction=${handle?.faction}, target=${handle?.initialTargetEntityId}, spawn=${config?.spawnPosition.x}`,
      );
    }
    {
      const { bus, bridge, spawnedHandles } = buildGuardChain();
      const request: GuardShipRequestPayload = {
        requestId: 'req-1',
        sourceNeutralEntityId: 7,
        attackerEntityId: PLAYER_ENTITY_ID,
        incidentPosition: { x: 0, z: 0 },
        spawnReason: 'neutralAttack',
        requestedFaction: 'patrol',
        correlationId: 'atk-9',
      };
      bus.emit('guardShipRequested', request);
      const first = bridge.lastOutcome;
      bus.emit('guardShipRequested', request);
      check(
        'B 스폰 중복 방지: 동일 requestId 재요청 = duplicateRequest·스폰 1회',
        first === 'spawned' && bridge.lastOutcome === 'duplicateRequest' && spawnedHandles.length === 1,
        `first=${first}, second=${bridge.lastOutcome}, spawned=${spawnedHandles.length}`,
      );
    }
    {
      const { bus, bridge, spawnedHandles } = buildGuardChain({ withLocation: false });
      bus.emit('neutralShipHit', neutralHit({ attackCorrelationId: 'atk-3' }));
      check(
        'B 스폰: 위치 전략 미연결 = noSpawnLocation (임의 좌표 생성 없음)',
        bridge.lastOutcome === 'noSpawnLocation' && spawnedHandles.length === 0,
        `outcome=${bridge.lastOutcome}`,
      );
    }
    {
      const { bus, bridge, adapter, spawnedHandles } = buildGuardChain({ withAi: false });
      bus.emit('neutralShipHit', neutralHit({ attackCorrelationId: 'atk-4' }));
      check(
        'B 스폰: 구축함 AI 팩토리 미연결 = spawnFailed (대체 AI 생성 없음)',
        bridge.lastOutcome === 'spawnFailed' && spawnedHandles.length === 0 && !adapter.aiWired,
        `outcome=${bridge.lastOutcome}, aiWired=${adapter.aiWired}`,
      );
    }
    {
      const { bus, bridge } = buildGuardChain();
      bus.emit('guardShipRequested', {
        requestId: '',
        sourceNeutralEntityId: 7,
        attackerEntityId: PLAYER_ENTITY_ID,
        incidentPosition: { x: 0, z: 0 },
        spawnReason: 'neutralAttack',
        requestedFaction: 'patrol',
        correlationId: 'atk-5',
      });
      check(
        'B 스폰: 잘못된 요청(빈 requestId) = invalidRequest',
        bridge.lastOutcome === 'invalidRequest',
        `outcome=${bridge.lastOutcome}`,
      );
    }
    {
      const { bus, adapter } = buildGuardChain();
      bus.emit('neutralShipHit', neutralHit({ attackCorrelationId: 'atk-6' }));
      let updates = 0;
      const ship = adapter.spawnedShips[0];
      if (ship) {
        // 어댑터는 수명주기만 전달한다 — 판단 로직 없음
        const original = ship.ai.update;
        (ship.ai as { update: (dt: number) => void }).update = (dt: number) => {
          updates += 1;
          original.call(ship.ai, dt);
        };
      }
      adapter.update(0.016);
      check(
        'B 어댑터: 수명주기 전달만 수행 (기존 AI.update 호출, 자체 판단 없음)',
        updates === 1,
        `updates=${updates}`,
      );
    }
    {
      // B6 계약이 핵심 게이트 경로에 의존을 만들지 않는지 — 호위 데이터 없이
      // B4 흐름이 그대로 성립하는가로 확인한다.
      const { bus, requests, spawnedHandles } = buildGuardChain();
      const binding: EscortBinding = {
        escortEntityId: 11,
        escortedTransportId: 12,
        maximumEscortDistanceMeters: 40,
      };
      bus.emit('neutralShipHit', neutralHit({ attackCorrelationId: 'atk-7' }));
      check(
        'B6 분리: 호위 계약을 쓰지 않아도 B1~B5 경로(요청·스폰) 성립',
        requests.length === 1 && spawnedHandles.length === 1 && binding.escortEntityId === 11,
        `requests=${requests.length}, spawned=${spawnedHandles.length}`,
      );
    }
    {
      // B2 식별 read model 생성 가능 — 미식별 시 라벨 없음
      const unidentified: ShipIdentificationView = {
        entityId: 7,
        faction: 'neutral',
        identificationState: 'unidentified',
        displayLabelId: null,
        distanceMeters: 900,
        isTargetable: true,
        isAlive: true,
        worldPosition: { x: 0, y: 0, z: -900 },
        tagDisplayable: false,
      };
      const identified: ShipIdentificationView = {
        ...unidentified,
        identificationState: 'neutral',
        displayLabelId: FACTION_RULES.neutral.displayLabelId,
        distanceMeters: 120,
        tagDisplayable: true,
      };
      const source: ShipIdentificationSource = { identifications: [unidentified, identified] };
      check(
        'B2 식별 모델: UI 소비 모델 생성 가능 — 미식별은 라벨 null(세력 비노출)',
        source.identifications.length === 2 &&
          unidentified.displayLabelId === null &&
          !unidentified.tagDisplayable &&
          identified.displayLabelId === 'faction.neutral',
        `unidentified=${unidentified.displayLabelId}, identified=${identified.displayLabelId}`,
      );
    }
    {
      // B7 로깅 계약 — 8항목·결과 분류
      const log: IdentificationOpportunityLog = {
        anonymousTesterId: 'T-01',
        opportunityId: 'OP-1',
        actualFaction: 'neutral',
        identificationTagVisible: true,
        playerDecision: 'hostile',
        playerAction: 'attack',
        resultClassification: 'misidentification',
        timestamp: 1234,
        notes: '실루엣만 보고 판단',
      };
      const collected: IdentificationOpportunityLog[] = [];
      const sink: IdentificationLogSink = { record: (entry) => collected.push(entry) };
      sink.record(log);
    // ── B5 개정: 범용 production DestroyerAI (INT-CORE-013) ──
    {
      interface MotionLog {
        turns: Array<{ x: number; z: number }>;
        moves: number;
        surfaceCalls: number;
      }
      const buildMotion = (
        options: {
          targetAlive?: boolean;
          targetPosition?: { x: number; y: number; z: number } | null;
          withinBounds?: boolean;
        } = {},
      ): { port: SurfaceShipMotionPort; log: MotionLog } => {
        const log: MotionLog = { turns: [], moves: 0, surfaceCalls: 0 };
        const port: SurfaceShipMotionPort = {
          getPosition: () => ({ x: 0, y: 0, z: 0 }),
          getForward: () => ({ x: 0, z: -1 }),
          turnToward: (x, z) => log.turns.push({ x, z }),
          moveForward: () => {
            log.moves += 1;
          },
          maintainSurfaceHeight: () => {
            log.surfaceCalls += 1;
          },
          isWithinWorldBounds: () => options.withinBounds !== false,
          isTargetAlive: () => options.targetAlive !== false,
          getTargetPosition: () =>
            options.targetPosition === undefined ? { x: 50, y: -2, z: 60 } : options.targetPosition,
        };
        return { port, log };
      };

      {
        const { port, log } = buildMotion();
        const factory = createProductionDestroyerAIFactory({ create: () => port });
        const config: GuardShipAdapterConfig = {
          entityId: 8000,
          faction: 'patrol',
          spawnReason: 'neutralAttack',
          initialTargetEntityId: PLAYER_ENTITY_ID,
          initialTargetPosition: { x: 3, z: -4 },
          spawnPosition: { x: 23, z: -4 },
          displayLabelId: 'faction.patrol',
        };
        const ai = factory.create(config);
        const controller = ai as DestroyerAIController | null;
        check(
          'B5 factory: production 구현체(DestroyerAIController) 생성 · 세력·초기 표적·마지막 확인 위치 전달',
          controller instanceof DestroyerAIController &&
            controller.faction === 'patrol' &&
            controller.entityId === 8000 &&
            controller.currentTargetEntityId === PLAYER_ENTITY_ID &&
            controller.lastKnownPosition.x === 3 &&
            controller.lastKnownPosition.z === -4 &&
            controller.state === 'alert',
          `faction=${controller?.faction}, target=${controller?.currentTargetEntityId}, lastKnown=${JSON.stringify(controller?.lastKnownPosition)}`,
        );
        controller?.update(0.016);
        check(
          'B5 이동: update 시 표적 방향 선회·전진 명령 + 수면 고도 유지',
          log.turns.length === 1 &&
            log.turns[0]?.x === 50 &&
            log.turns[0].z === 60 &&
            log.moves === 1 &&
            log.surfaceCalls === 1 &&
            controller?.state === 'attack',
          `turns=${JSON.stringify(log.turns)}, moves=${log.moves}, surface=${log.surfaceCalls}`,
        );
      }
      {
        // 표적 무효 + 마지막 확인 위치 있음 → 그 지점으로 접근 (alert)
        const { port, log } = buildMotion({ targetAlive: false });
        const ai = createProductionDestroyerAIFactory({ create: () => port }).create({
          entityId: 8001,
          faction: 'patrol',
          spawnReason: 'neutralAttack',
          initialTargetEntityId: PLAYER_ENTITY_ID,
          initialTargetPosition: { x: 7, z: 8 },
          spawnPosition: { x: 0, z: 0 },
          displayLabelId: 'faction.patrol',
        }) as DestroyerAIController;
        ai.update(0.016);
        check(
          'B5 표적 무효: 마지막 확인 위치로 접근 (alert) — 폭주·예외 없음',
          ai.state === 'alert' && log.turns[0]?.x === 7 && log.moves === 1,
          `state=${ai.state}, turn=${JSON.stringify(log.turns[0])}`,
        );
        // 마지막 확인 위치까지 잃으면 안전한 정지(idle)
        ai.dispose();
        const disposedMoves = log.moves;
        ai.update(0.016);
        check(
          'B5 표적·마지막 위치 모두 무효: 안전한 정지 (lost·이동 명령 없음)',
          ai.state === 'lost' && log.moves === disposedMoves,
          `state=${ai.state}, moves=${log.moves}`,
        );
      }
      {
        // 월드 경계 밖으로 나가려 하면 전진하지 않는다 (선회·고도 유지는 계속)
        const { port, log } = buildMotion({ withinBounds: false });
        const ai = createProductionDestroyerAIFactory({ create: () => port }).create({
          entityId: 8002,
          faction: 'patrol',
          spawnReason: 'neutralAttack',
          initialTargetEntityId: PLAYER_ENTITY_ID,
          initialTargetPosition: { x: 1, z: 1 },
          spawnPosition: { x: 0, z: 0 },
          displayLabelId: 'faction.patrol',
        }) as DestroyerAIController;
        ai.update(0.016);
        check(
          'B5 경계: 월드 경계 이탈 예정이면 전진하지 않음 (수면 유지는 계속)',
          log.moves === 0 && log.surfaceCalls === 1 && log.turns.length === 1,
          `moves=${log.moves}, surface=${log.surfaceCalls}`,
        );
      }
      {
        // 이동 포트를 만들 수 없으면 factory는 null → 어댑터 스폰 실패
        const factory = createProductionDestroyerAIFactory({ create: () => null });
        const adapter = new GuardShipAdapter(factory);
        const handle = adapter.spawn('req-x', {
          entityId: 8003,
          faction: 'patrol',
          spawnReason: 'neutralAttack',
          initialTargetEntityId: PLAYER_ENTITY_ID,
          initialTargetPosition: { x: 0, z: 0 },
          spawnPosition: { x: 5, z: 5 },
          displayLabelId: 'faction.patrol',
        });
        check(
          'B5 factory: 이동 포트 미연결 = null 반환 → 스폰 없음 (가짜 이동 생성 금지)',
          handle === null && adapter.spawnedShips.length === 0,
          `handle=${handle === null ? 'null' : 'created'}`,
        );
      }
      {
        // production 체인: 경비함이 범용 AI로 생성되고 handle이 스폰 좌표를 보존
        const bus = new EventBus();
        const ledger = new GuardIncidentLedger();
        const { port } = buildMotion();
        const adapter = new GuardShipAdapter(
          createProductionDestroyerAIFactory({ create: () => port }),
        );
        const coordinator = new GuardSpawnCoordinator(ledger, adapter, {
          resolve: (request) => ({ x: request.incidentPosition.x + 20, z: request.incidentPosition.z }),
        });
        const handles: GuardShipHandle[] = [];
        coordinator.attachSpawnListener((handle) => handles.push(handle));
        const bridge = new GuardSpawnBridge(coordinator);
        new NeutralIncidentBoundary(ledger).initialize(verificationContext(bus));
        bridge.initialize(verificationContext(bus));

        bus.emit('neutralShipHit', neutralHit({ attackCorrelationId: 'atk-b5' }));
        bus.emit('neutralShipHit', neutralHit({ attackCorrelationId: 'atk-b5' }));
        const handle = handles[0];
        check(
          'B5 production 체인: 중립 피격 → 요청 → 범용 AI 경비함 1척 (동일 requestId 중복 생성 없음)',
          bridge.lastOutcome === 'spawned' &&
            handles.length === 1 &&
            handle?.ai instanceof DestroyerAIController &&
            handle.faction === 'patrol' &&
            handle.initialTargetEntityId === PLAYER_ENTITY_ID,
          `outcome=${bridge.lastOutcome}, spawned=${handles.length}, ai=${handle?.ai.constructor.name}`,
        );
        check(
          'B5 handle: entityId 부여 + 스폰 좌표 보존 (렌더 마커가 실재 위치를 받음)',
          handle?.entityId === 8000 &&
            handle.spawnPosition.x === 23 &&
            handle.spawnPosition.z === -4,
          `entityId=${handle?.entityId}, spawnPosition=${JSON.stringify(handle?.spawnPosition)}`,
        );
      }
    }

      check(
        'B7 로깅: 기록 8항목 + 결과 분류 계약 (집계·판정은 툴링)',
        collected.length === 1 &&
          collected[0]?.resultClassification === 'misidentification' &&
          Object.keys(log).length === 9,
        `필드수=${Object.keys(log).length}(notes 포함), 분류=${collected[0]?.resultClassification}`,
      );
    }
  }

  // ── 스프린트 C: 생존 루프 공용 코어 (INT-CORE-014) ──
  {
    // 픽스처 수치 — **공식 params가 아니다.** 공식 선체·침수 수치는 C9
    // [COMBAT] 이관 대기이며, 여기서는 코어 로직(중복·전이·결정성)만 본다.
    const hullParams: HullBaseParams = {
      baseMaxHull: 100,
      damagedRatioThreshold: 0.6,
      criticalRatioThreshold: 0.25,
    };
    const floodParams: FloodingParams = {
      minorThreshold: 0.2,
      majorThreshold: 0.5,
      catastrophicThreshold: 0.8,
      hullDamagePerSecondAtFull: 10,
      spreadPerSecond: 0.1,
    };
    const damage = (overrides: Partial<DamageRequest> = {}): DamageRequest => ({
      damageEventId: 'dmg-1',
      targetEntityId: PLAYER_ENTITY_ID,
      attackerEntityId: 8000,
      sourceType: 'enemyWeapon',
      rawDamage: 30,
      worldPosition: { x: 1, y: -2, z: 3 },
      occurredAt: 1000,
      correlationId: 'atk-1',
      causesFlooding: false,
      floodingContribution: 0,
      ...overrides,
    });
    const buildHull = (
      options: { wired?: boolean } = {},
    ): { hull: PlayerHullSystem; flooding: FloodingCore; bus: EventBus; destroyedCount: () => number } => {
      const bus = new EventBus();
      const flooding = new FloodingCore(options.wired === false ? null : floodParams);
      const hull = new PlayerHullSystem(
        PLAYER_ENTITY_ID,
        flooding,
        options.wired === false ? null : hullParams,
      );
      let destroyed = 0;
      bus.on('playerDestroyed', () => {
        destroyed += 1;
      });
      hull.initialize(verificationContext(bus));
      return { hull, flooding, bus, destroyedCount: () => destroyed };
    };

    {
      const { hull } = buildHull({ wired: false });
      const result = hull.applyDamage(damage());
      const snapshot = hull.snapshot();
      check(
        'C 미주입: 선체 기준값 없으면 unwired — 피해 미적용·상태 변경 0 (임시 수치 없음)',
        result.outcome === 'unwired' &&
          result.appliedDamage === 0 &&
          snapshot.unwired &&
          snapshot.hullRatio === null &&
          !snapshot.isDestroyed,
        `outcome=${result.outcome}, unwired=${snapshot.unwired}, ratio=${snapshot.hullRatio}`,
      );
    }
    {
      const { hull } = buildHull();
      const first = hull.applyDamage(damage());
      const dupEvent = hull.applyDamage(damage({ correlationId: 'atk-2' }));
      const dupCorrelation = hull.applyDamage(damage({ damageEventId: 'dmg-2' }));
      check(
        'C 중복 방지: 동일 damageEventId·correlationId 각각 1회만 적용',
        first.outcome === 'applied' &&
          first.appliedDamage === 30 &&
          dupEvent.outcome === 'ignoredDuplicate' &&
          dupCorrelation.outcome === 'ignoredDuplicate' &&
          hull.snapshot().currentHull === 70,
        `first=${first.outcome}, dupId=${dupEvent.outcome}, dupCorr=${dupCorrelation.outcome}, hull=${hull.snapshot().currentHull}`,
      );
    }
    {
      const { hull } = buildHull();
      const zero = hull.applyDamage(damage({ rawDamage: 0, damageEventId: 'z', correlationId: 'z' }));
      const negative = hull.applyDamage(damage({ rawDamage: -5, damageEventId: 'n', correlationId: 'n' }));
      const nan = hull.applyDamage(damage({ rawDamage: Number.NaN, damageEventId: 'a', correlationId: 'a' }));
      const infinity = hull.applyDamage(
        damage({ rawDamage: Number.POSITIVE_INFINITY, damageEventId: 'i', correlationId: 'i' }),
      );
      const wrongTarget = hull.applyDamage(
        damage({ targetEntityId: 999, damageEventId: 't', correlationId: 't' }),
      );
      check(
        'C 검증: 0·음수·NaN·Infinity 피해 거부 + 다른 표적 = targetNotFound (상태 변경 0)',
        zero.outcome === 'invalidDamage' &&
          negative.outcome === 'invalidDamage' &&
          nan.outcome === 'invalidDamage' &&
          infinity.outcome === 'invalidDamage' &&
          wrongTarget.outcome === 'targetNotFound' &&
          hull.snapshot().currentHull === 100,
        `zero=${zero.outcome}, neg=${negative.outcome}, nan=${nan.outcome}, inf=${infinity.outcome}, target=${wrongTarget.outcome}`,
      );
    }
    {
      const { hull, destroyedCount } = buildHull();
      const states: string[] = [hull.snapshot().survivalState];
      hull.applyDamage(damage({ rawDamage: 50, damageEventId: 'd1', correlationId: 'c1' }));
      states.push(hull.snapshot().survivalState);
      hull.applyDamage(damage({ rawDamage: 30, damageEventId: 'd2', correlationId: 'c2' }));
      states.push(hull.snapshot().survivalState);
      const lethal = hull.applyDamage(damage({ rawDamage: 100, damageEventId: 'd3', correlationId: 'c3' }));
      states.push(hull.snapshot().survivalState);
      const afterDeath = hull.applyDamage(damage({ rawDamage: 10, damageEventId: 'd4', correlationId: 'c4' }));
      check(
        'C 전이: stable→damaged→critical→destroyed · 파괴 이벤트 1회 · 파괴 후 피해 무시',
        states.join('>') === 'stable>damaged>critical>destroyed' &&
          lethal.outcome === 'destroyed' &&
          destroyedCount() === 1 &&
          afterDeath.outcome === 'ignoredDestroyed' &&
          hull.snapshot().currentHull === 0 &&
          !hull.isPlayerAlive,
        `states=${states.join('>')}, destroyedEvents=${destroyedCount()}, after=${afterDeath.outcome}`,
      );
    }
    {
      // 침수: 결정성 — dt를 쪼개도 결과가 같다
      const coarse = new FloodingCore(floodParams);
      const fine = new FloodingCore(floodParams);
      coarse.addContribution(0.3);
      fine.addContribution(0.3);
      coarse.update(1);
      fine.update(0.5);
      fine.update(0.5);
      check(
        'C 침수 결정성: dt 분할 누적 = 단일 누적 (프레임률 독립)',
        Math.abs(coarse.level - fine.level) < 1e-9 && coarse.level > 0.3,
        `coarse=${coarse.level}, fine=${fine.level}`,
      );
    }
    {
      const flooding = new FloodingCore(floodParams);
      const stages = [flooding.stage];
      flooding.addContribution(0.25);
      stages.push(flooding.stage);
      flooding.addContribution(0.3);
      stages.push(flooding.stage);
      flooding.addContribution(0.3);
      stages.push(flooding.stage);
      flooding.resetForNewSortie();
      stages.push(flooding.stage);
      check(
        'C 침수 전이: none→minor→major→catastrophic + 출항 초기화 (단계는 level 파생)',
        stages.join('>') === 'none>minor>major>catastrophic>none' && flooding.level === 0,
        `stages=${stages.join('>')}`,
      );
    }
    {
      const unwired = new FloodingCore(null);
      const added = unwired.addContribution(0.5);
      const damageFromFlood = unwired.update(1);
      check(
        'C 침수 미주입: 수치 없으면 침수 증가·피해 0 (임의 속도 생성 없음)',
        added === 0 && damageFromFlood === 0 && unwired.level === 0 && unwired.snapshot().unwired,
        `added=${added}, damage=${damageFromFlood}`,
      );
    }
    {
      const { hull } = buildHull();
      hull.applyDamage(damage({ rawDamage: 40, causesFlooding: true, floodingContribution: 0.5 }));
      hull.update(1); // 침수 지속 피해 = 10 × 0.6(확산 후) ≈ 6
      const afterFlood = hull.snapshot();
      hull.resetForNewSortie();
      const afterReset = hull.snapshot();
      check(
        'C 출항 초기화: 선체·침수·중복 원장·파괴 플래그 초기화 (지갑·업그레이드 무관)',
        afterFlood.currentHull < 60 &&
          afterFlood.floodingLevel > 0.5 &&
          afterReset.currentHull === 100 &&
          afterReset.floodingLevel === 0 &&
          !afterReset.isDestroyed &&
          hull.applyDamage(damage()).outcome === 'applied',
        `afterFlood=${afterFlood.currentHull}/${afterFlood.floodingLevel}, afterReset=${afterReset.currentHull}`,
      );
    }
    {
      const { hull } = buildHull();
      hull.applyHullIntegrityModifier(0.2);
      const boosted = hull.snapshot();
      hull.resetForNewSortie();
      const reset = hull.snapshot();
      check(
        'C hullIntegrity 소비: 최대치 = 기준값 × (1 + 보정 합) — upgradeMath 정본 사용',
        boosted.maxHull === 120 && reset.maxHull === 120 && reset.currentHull === 120,
        `maxHull=${boosted.maxHull}`,
      );
    }
    {
      const { hull } = buildHull();
      hull.applyDamage(damage({ rawDamage: 50 }));
      const model = hull.survivalReadModel();
      const before = hull.snapshot().currentHull;
      // UI 소비 모델은 값 복사본이며, 여기에 쓴다고 상태가 바뀌지 않는다.
      (model as { currentHull: number }).currentHull = 999;
      check(
        'C 읽기 모델: UI가 상태를 바꿀 수 없음 · 경고는 키만 제공',
        hull.snapshot().currentHull === before &&
          model.warningIds.includes('hull.damaged') &&
          model.failureCountdown === null &&
          model.damageFlashRequested,
        `hull=${hull.snapshot().currentHull}, warnings=${model.warningIds.join(',')}`,
      );
    }

    // 실패 정산 — 기존 MetaLoop 경로 재사용
    const buildFailure = (
      options: { saveOk?: boolean } = {},
    ): {
      bus: EventBus;
      loop: MetaLoop;
      hull: PlayerHullSystem;
      coordinator: SortieFailureCoordinator;
      saves: number;
      events: string[];
      failures: SortieFailureReport[];
      saveOk: { value: boolean };
    } => {
      const bus = new EventBus();
      const port = new RecordingSessionPort();
      const loop = new MetaLoop(bus, port, { creditLossOnDestroyedRatio: 0.5 });
      loop.initialize(verificationContext(bus));
      const events: string[] = [];
      let saves = 0;
      const saveOk = { value: options.saveOk !== false };
      bus.on('saveRequested', (p) => {
        saves += 1;
        events.push(`save:${p.cause}`);
      });
      bus.on('sortieEnded', (p) => events.push(`ended:${p.settlement.outcome}`));
      const flooding = new FloodingCore(floodParams);
      const hull = new PlayerHullSystem(PLAYER_ENTITY_ID, flooding, hullParams);
      hull.initialize(verificationContext(bus));
      const coordinator = new SortieFailureCoordinator(
        loop,
        { get lastSaveSucceeded() { return saveOk.value; } },
        () => hull.markFailureSettled(),
      );
      coordinator.initialize(verificationContext(bus));
      const failures: SortieFailureReport[] = [];
      bus.on('sortieFailed', (p) => failures.push(p.report));
      loop.beginSortiePrep();
      loop.launchSortie();
      return {
        bus,
        loop,
        hull,
        coordinator,
        get saves() { return saves; },
        events,
        failures,
        saveOk,
      } as never;
    };

    {
      const ctx = buildFailure();
      ctx.bus.emit('lootDropped', { source: 'cargoShip', credits: 100, rareParts: 1, x: 0, z: 0 });
      ctx.hull.applyDamage(damage({ rawDamage: 200 }));
      // 파괴 후 두 번째 보고는 무시돼야 한다
      const second = ctx.coordinator.reportDestroyed({
        failureId: 'again',
        reason: 'hullDestroyed',
        destroyedByEntityId: 8000,
        damageSource: 'enemyWeapon',
      });
      const report = ctx.coordinator.lastReport;
      const settlementSaves = ctx.events.filter((e) => e === 'save:settlement').length;
      const endedCount = ctx.events.filter((e) => e.startsWith('ended:')).length;
      check(
        'C 실패: 파괴 1회 → 실패 1회 → 정산 1회 → 저장 1회, DEBRIEF 유지 (자동 BASE 전환 0)',
        report !== null &&
          report.reason === 'hullDestroyed' &&
          report.pendingCredits === 100 &&
          report.appliedLoss === 50 &&
          report.finalCredits === 50 &&
          report.securedRareParts === 1 &&
          report.finalRareParts === 1 &&
          report.saveStatus === 'saved' &&
          report.nextState === 'DEBRIEF' &&
          ctx.loop.metaState === 'DEBRIEF' &&
          settlementSaves === 1 &&
          endedCount === 1 &&
          second === null &&
          ctx.failures.length === 1,
        `report=${JSON.stringify(report)}, saves=${settlementSaves}, ended=${endedCount}, state=${ctx.loop.metaState}`,
      );
      // 확인 command — 저장 성공 후에만, 확인 1회당 BASE 전환 1회
      const tracker = new DebriefStateTracker(ctx.coordinator, null, ctx.loop);
      tracker.initialize(verificationContext(ctx.bus));
      const confirmCommand = new DebriefConfirmCommand(ctx.loop, tracker);
      const first = confirmCommand.confirm();
      const duplicate = confirmCommand.confirm();
      check(
        'C 확인: confirm 후 BASE 전환 1회 · 중복 confirm 거부 (invalidState)',
        first === 'confirmed' && ctx.loop.metaState === 'BASE' && duplicate === 'invalidState',
        `first=${first}, dup=${duplicate}, state=${ctx.loop.metaState}`,
      );
    }
    {
      const ctx = buildFailure({ saveOk: false });
      ctx.bus.emit('lootDropped', { source: 'cargoShip', credits: 80, rareParts: 0, x: 0, z: 0 });
      ctx.hull.applyDamage(damage({ rawDamage: 200 }));
      const failed = ctx.coordinator.lastReport;
      const stateAfterFail = ctx.loop.metaState;
      const creditsAfterFail = ctx.loop.wallet.credits;
      const tracker = new DebriefStateTracker(ctx.coordinator, null, ctx.loop);
      tracker.initialize(verificationContext(ctx.bus));
      const confirmCommand = new DebriefConfirmCommand(ctx.loop, tracker);
      // 저장 미완료 상태의 confirm은 거부된다
      const rejectedConfirm = confirmCommand.confirm();
      ctx.saveOk.value = true;
      const retried = ctx.coordinator.retrySave(() => true);
      const stateAfterRetry = ctx.loop.metaState;
      const confirmed = confirmCommand.confirm();
      const settlementSaves = ctx.events.filter((e) => e === 'save:settlement').length;
      const endedCount = ctx.events.filter((e) => e.startsWith('ended:')).length;
      check(
        'C 저장 실패: 위장 없음 · confirm 거부(saveIncomplete) · retry 재정산 0 · retry 후에도 confirm 전 DEBRIEF · confirm 후 BASE',
        failed?.saveStatus === 'saveFailed' &&
          failed.nextState === 'DEBRIEF' &&
          stateAfterFail === 'DEBRIEF' &&
          rejectedConfirm === 'saveIncomplete' &&
          retried?.saveStatus === 'saved' &&
          retried.nextState === 'DEBRIEF' &&
          stateAfterRetry === 'DEBRIEF' &&
          confirmed === 'confirmed' &&
          ctx.loop.metaState === 'BASE' &&
          ctx.loop.wallet.credits === creditsAfterFail &&
          settlementSaves === 1 &&
          endedCount === 1,
        `failed=${failed?.saveStatus}, reject=${rejectedConfirm}, retried=${retried?.saveStatus}/${stateAfterRetry}, confirm=${confirmed}, saves=${settlementSaves}`,
      );
    }
    {
      // 다음 출항: 초기화 후 다시 실패를 처리할 수 있어야 한다
      const ctx = buildFailure();
      ctx.hull.applyDamage(damage({ rawDamage: 200 }));
      // 개정 정책: BASE 복귀는 확인 command 경유
      const nextTracker = new DebriefStateTracker(ctx.coordinator, null, ctx.loop);
      nextTracker.initialize(verificationContext(ctx.bus));
      new DebriefConfirmCommand(ctx.loop, nextTracker).confirm();
      ctx.hull.resetForNewSortie();
      ctx.coordinator.resetForNewSortie();
      ctx.loop.beginSortiePrep();
      ctx.loop.launchSortie();
      ctx.hull.applyDamage(damage({ damageEventId: 'dmg-next', correlationId: 'atk-next', rawDamage: 200 }));
      const endedCount = ctx.events.filter((e) => e.startsWith('ended:')).length;
      check(
        'C 다음 출항: reset 후 정상 상태로 재시작 · 두 번째 실패도 1회 정산 (confirm 전 DEBRIEF)',
        endedCount === 2 && ctx.failures.length === 2 && ctx.loop.metaState === 'DEBRIEF',
        `ended=${endedCount}, failures=${ctx.failures.length}, state=${ctx.loop.metaState}`,
      );
    }
    {
      // 침수 지속 피해도 단일 창구(applyDamage)를 통과한다 — 후속 tick이
      // 중복 원장에 막히지 않고, 지속 피해는 플래시를 만들지 않는다.
      const { hull } = buildHull();
      hull.applyDamage(damage({ rawDamage: 10, causesFlooding: true, floodingContribution: 0.5 }));
      hull.consumeDamageFlash();
      const afterFirstHit = hull.snapshot().currentHull;
      hull.update(0.5);
      const afterTick1 = hull.snapshot().currentHull;
      hull.update(0.5);
      const afterTick2 = hull.snapshot().currentHull;
      const model = hull.survivalReadModel();
      check(
        'C 침수 경로: tick별 고유 id로 단일 창구 통과 — 후속 tick 미차단·플래시 없음',
        afterTick1 < afterFirstHit &&
          afterTick2 < afterTick1 &&
          hull.snapshot().lastDamageSource === 'environment' &&
          !model.damageFlashRequested,
        `hull=${afterFirstHit}→${afterTick1}→${afterTick2}, flash=${model.damageFlashRequested}`,
      );
    }
    {
      // dt 분할과 단일 실행의 **총 피해** 동일 (수위 적분식 결정성)
      const single = buildHull().hull;
      const split = buildHull().hull;
      single.applyDamage(damage({ rawDamage: 10, causesFlooding: true, floodingContribution: 0.3 }));
      split.applyDamage(damage({ rawDamage: 10, causesFlooding: true, floodingContribution: 0.3 }));
      single.update(1);
      split.update(0.25);
      split.update(0.25);
      split.update(0.5);
      check(
        'C 침수 결정성(피해): dt 분할 총 피해 = 단일 실행 총 피해',
        Math.abs(single.snapshot().currentHull - split.snapshot().currentHull) < 1e-9 &&
          Math.abs(single.snapshot().floodingLevel - split.snapshot().floodingLevel) < 1e-9,
        `single=${single.snapshot().currentHull}, split=${split.snapshot().currentHull}`,
      );
    }
    {
      // 침수만으로 파괴 — 파괴 경로도 단일 창구를 지나 playerDestroyed 1회
      const { hull, destroyedCount } = buildHull();
      hull.applyDamage(damage({ rawDamage: 95, causesFlooding: true, floodingContribution: 1 }));
      for (let i = 0; i < 20 && !hull.snapshot().isDestroyed; i += 1) hull.update(1);
      check(
        'C 침수 파괴: 지속 피해 누적 → destroyed 1회 (environment 출처)',
        hull.snapshot().isDestroyed && destroyedCount() === 1,
        `destroyed=${hull.snapshot().isDestroyed}, events=${destroyedCount()}`,
      );
    }
    {
      // C9 v0.1.1 — 피격 근접도별 침수 기여 누적: direct 1회 + near 1회가
      // 각자의 기여만큼 정확히 더해진다 (값은 요청이 싣고 온 params 파생분).
      const { hull } = buildHull();
      hull.applyDamage(
        damage({ damageEventId: 'fd', correlationId: 'fd', rawDamage: 10, causesFlooding: true, floodingContribution: 0.35 }),
      );
      const afterDirect = hull.snapshot().floodingLevel;
      hull.applyDamage(
        damage({ damageEventId: 'fn', correlationId: 'fn', rawDamage: 5, causesFlooding: true, floodingContribution: 0.1 }),
      );
      const afterNear = hull.snapshot().floodingLevel;
      check(
        'C9 v0.1.1 침수 기여 누적: direct(0.35) + near(0.10) = 0.45 (정확 가산)',
        Math.abs(afterDirect - 0.35) < 1e-9 && Math.abs(afterNear - 0.45) < 1e-9,
        `direct후=${afterDirect}, near후=${afterNear}`,
      );
    }
    {
      // C9 v0.1.1 — 중복 DamageEvent는 선체 피해와 침수 기여 **모두** 1회만
      const { hull } = buildHull();
      const request = damage({ damageEventId: 'dup', correlationId: 'dup', rawDamage: 10, causesFlooding: true, floodingContribution: 0.35 });
      hull.applyDamage(request);
      const first = hull.snapshot();
      const second = hull.applyDamage(request);
      const after = hull.snapshot();
      check(
        'C9 v0.1.1 중복 event: 선체·침수 기여 둘 다 1회 (ignoredDuplicate)',
        second.outcome === 'ignoredDuplicate' &&
          after.currentHull === first.currentHull &&
          Math.abs(after.floodingLevel - 0.35) < 1e-9,
        `outcome=${second.outcome}, flood=${after.floodingLevel}`,
      );
    }
    {
      // C9 v0.1.1 — 누적 침수는 1에서 clamp (기여 합이 1을 넘어도)
      const { hull } = buildHull();
      for (let i = 0; i < 4; i += 1) {
        hull.applyDamage(
          damage({ damageEventId: `cl-${i}`, correlationId: `cl-${i}`, rawDamage: 1, causesFlooding: true, floodingContribution: 0.35 }),
        );
      }
      check(
        'C9 v0.1.1 침수 상한: 기여 합 1.4 → level 1.0 clamp',
        hull.snapshot().floodingLevel === 1,
        `level=${hull.snapshot().floodingLevel}`,
      );
    }
    {
      // DEBRIEF 읽기 모델 — 정상 귀환
      const ctx = buildFailure();
      const tracker = new DebriefStateTracker(
        ctx.coordinator,
        {
          get lastSaveSucceeded() {
            return ctx.saveOk.value;
          },
        },
        ctx.loop,
      );
      tracker.initialize(verificationContext(ctx.bus));
      const beforeEnd = tracker.readModel();
      ctx.loop.settleSortie({ outcome: 'returned' });
      const returned = tracker.readModel();
      // 정상 귀환도 동일 confirm 정책 — 자동 BASE 전환 없음
      const stateBeforeConfirm = ctx.loop.metaState;
      const confirmCommand = new DebriefConfirmCommand(ctx.loop, tracker);
      const confirmed = confirmCommand.confirm();
      check(
        'C DEBRIEF 모델: 정상 귀환도 동일 confirm 정책 — returned·canConfirm → confirm 후 BASE (자동 전환 0)',
        beforeEnd.kind === 'none' &&
          returned.kind === 'returned' &&
          returned.settlement !== null &&
          returned.failure === null &&
          returned.saveStatus === 'saved' &&
          !returned.canRetrySave &&
          returned.canConfirm &&
          stateBeforeConfirm === 'DEBRIEF' &&
          confirmed === 'confirmed' &&
          ctx.loop.metaState === 'BASE',
        `before=${beforeEnd.kind}, after=${returned.kind}/${returned.saveStatus}/${returned.canConfirm}, confirm=${confirmed}`,
      );
    }
    {
      // DEBRIEF 읽기 모델 — 파괴 + 저장 실패 → 재시도 → BASE (중복 정산·중복 전환 없음)
      const ctx = buildFailure({ saveOk: false });
      const tracker = new DebriefStateTracker(ctx.coordinator, {
        get lastSaveSucceeded() {
          return ctx.saveOk.value;
        },
      });
      tracker.initialize(verificationContext(ctx.bus));
      ctx.hull.applyDamage(damage({ rawDamage: 200 }));
      const failed = tracker.readModel();
      ctx.saveOk.value = true;
      ctx.coordinator.retrySave(() => true);
      const retried = tracker.readModel();
      // 같은 성공 이후 중복 재시도 — 정산·전환이 다시 일어나지 않는다
      const duplicate = ctx.coordinator.retrySave(() => true);
      const confirmCommand = new DebriefConfirmCommand(ctx.loop, tracker);
      const confirmed = confirmCommand.confirm();
      const settlementSaves = ctx.events.filter((e) => e === 'save:settlement').length;
      const endedCount = ctx.events.filter((e) => e.startsWith('ended:')).length;
      check(
        'C DEBRIEF 모델: 파괴+저장 실패 = canRetrySave·canConfirm=false → 재시도 후 canConfirm → confirm으로만 BASE',
        failed.kind === 'destroyed' &&
          failed.failure?.reason === 'hullDestroyed' &&
          failed.saveStatus === 'saveFailed' &&
          failed.canRetrySave &&
          !failed.canConfirm &&
          retried.saveStatus === 'saved' &&
          !retried.canRetrySave &&
          retried.canConfirm &&
          duplicate === null &&
          confirmed === 'confirmed' &&
          ctx.loop.metaState === 'BASE' &&
          settlementSaves === 1 &&
          endedCount === 1,
        `failed=${failed.saveStatus}/${failed.canConfirm}, retried=${retried.saveStatus}/${retried.canConfirm}, confirm=${confirmed}, saves=${settlementSaves}`,
      );
    }
    {
      // DEBRIEF 모델은 읽기 전용 — 필드를 바꿔도 다음 조회에 영향 없음
      const ctx = buildFailure();
      const tracker = new DebriefStateTracker(ctx.coordinator, null);
      tracker.initialize(verificationContext(ctx.bus));
      ctx.loop.settleSortie({ outcome: 'aborted' });
      const model = tracker.readModel();
      (model as { kind: string }).kind = 'destroyed';
      check(
        'C DEBRIEF 모델: 그래픽스가 값을 바꿀 수 없음 (스냅샷 — 다음 조회 불변)',
        tracker.readModel().kind === 'aborted',
        `after-write=${tracker.readModel().kind}`,
      );
    }
    {
      // ── INT-CORE-016: AI 공격 요청 생성 (C4) ──
      const buildAttackAi = (
        options: {
          targetAlive?: boolean;
          targetPosition?: { x: number; y: number; z: number } | null;
          port?: EnemyAttackPort | null;
        } = {},
      ): { ai: DestroyerAIController; requests: EnemyAttackRequest[] } => {
        const requests: EnemyAttackRequest[] = [];
        const recordingPort: EnemyAttackPort = {
          requestAttack: (request) => {
            requests.push(request);
            return 'delivered';
          },
        };
        const motion: SurfaceShipMotionPort = {
          getPosition: () => ({ x: 10, y: 0, z: 10 }),
          getForward: () => ({ x: 0, z: -1 }),
          turnToward: () => {},
          moveForward: () => {},
          maintainSurfaceHeight: () => {},
          isWithinWorldBounds: () => true,
          isTargetAlive: () => options.targetAlive !== false,
          getTargetPosition: () =>
            options.targetPosition === undefined ? { x: 50, y: -2, z: 60 } : options.targetPosition,
        };
        const ai = new DestroyerAIController({
          entityId: 8000,
          faction: 'patrol',
          initialTargetEntityId: PLAYER_ENTITY_ID,
          lastKnownPosition: { x: 3, z: -4 },
          motion,
          attackPort: options.port === undefined ? recordingPort : options.port,
          initialState: 'alert',
        });
        return { ai, requests };
      };

      {
        const { ai, requests } = buildAttackAi();
        ai.update(0.5);
        ai.update(0.5);
        const request = requests[0];
        check(
          'C4 AI 공격: attack 상태에서 EnemyAttackRequest 생성 — 요청만, id 단조·표적/좌표 관측값',
          ai.state === 'attack' &&
            requests.length === 2 &&
            request?.attackerEntityId === 8000 &&
            request.targetEntityId === PLAYER_ENTITY_ID &&
            request.targetPosition.x === 50 &&
            request.attackId === 'attack:8000:1' &&
            requests[1]?.attackId === 'attack:8000:2' &&
            requests[1].requestedAt > request.requestedAt,
          `state=${ai.state}, requests=${requests.length}, first=${request?.attackId}`,
        );
      }
      {
        // 표적 파괴(destroyed) → alert(마지막 확인 위치 접근) — 요청 0건
        const { ai, requests } = buildAttackAi({ targetAlive: false });
        ai.update(0.5);
        ai.update(0.5);
        check(
          'C4 AI 공격: 표적 destroyed = alert 접근·공격 요청 0건',
          ai.state === 'alert' && requests.length === 0,
          `state=${ai.state}, requests=${requests.length}`,
        );
      }
      {
        // 위치 미확인(탐지 게이트가 null) → alert — 요청 0건
        const { ai, requests } = buildAttackAi({ targetPosition: null });
        ai.update(0.5);
        check(
          'C4 AI 공격: target 위치 미확인 = 요청 0건 (탐지 게이트는 게임플레이 포트 소유)',
          ai.state === 'alert' && requests.length === 0,
          `state=${ai.state}, requests=${requests.length}`,
        );
      }
      {
        // lost 상태(마지막 위치까지 상실) — 요청 0건
        const { ai, requests } = buildAttackAi({ targetAlive: false });
        ai.dispose();
        ai.update(0.5);
        check(
          'C4 AI 공격: lost·dispose 후 공격 요청 0건',
          requests.length === 0,
          `requests=${requests.length}`,
        );
      }
      {
        // 포트 미연결 — attack 상태여도 요청 자체를 만들지 않는다 (즉시 피해 없음)
        const { ai, requests } = buildAttackAi({ port: null });
        ai.update(0.5);
        check(
          'C4 AI 공격: 포트 미연결 = attack이어도 요청 0건 (대체 피해 경로 없음)',
          ai.state === 'attack' && requests.length === 0,
          `state=${ai.state}, requests=${requests.length}`,
        );
      }
      {
        // 바인딩 미연결 = unwired — 폭뢰·피해 0건 보장 (composition 기본 상태)
        const binding = new EnemyAttackPortBinding();
        const outcome = binding.requestAttack({
          attackId: 'a-1',
          attackerEntityId: 8000,
          targetEntityId: PLAYER_ENTITY_ID,
          attackerPosition: { x: 0, y: 0, z: 0 },
          targetPosition: { x: 1, y: 0, z: 1 },
          correlationId: 'a-1',
          requestedAt: 1,
        });
        let delivered = 0;
        binding.attach({
          requestAttack: () => {
            delivered += 1;
            return 'delivered';
          },
        });
        const afterAttach = binding.requestAttack({
          attackId: 'a-2',
          attackerEntityId: 8000,
          targetEntityId: PLAYER_ENTITY_ID,
          attackerPosition: { x: 0, y: 0, z: 0 },
          targetPosition: { x: 1, y: 0, z: 1 },
          correlationId: 'a-2',
          requestedAt: 2,
        });
        check(
          'C4 바인딩: 미연결 = unwired(투하·피해 0) → attach 1줄 후 게임플레이 포트로 전달',
          outcome === 'unwired' && !new EnemyAttackPortBinding().wired && afterAttach === 'delivered' && delivered === 1,
          `before=${outcome}, after=${afterAttach}`,
        );
      }
      {
        // TrackingStateSource — 어댑터가 AI 상태·마지막 확인 위치 스냅샷 제공
        const { ai } = buildAttackAi();
        ai.update(0.5);
        const adapter = new GuardShipAdapter({ create: () => ai });
        adapter.spawn('req-t', {
          entityId: 8000,
          faction: 'patrol',
          spawnReason: 'neutralAttack',
          initialTargetEntityId: PLAYER_ENTITY_ID,
          initialTargetPosition: { x: 3, z: -4 },
          spawnPosition: { x: 23, z: -4 },
          displayLabelId: 'faction.patrol',
        });
        const tracked = adapter.trackedShips[0];
        check(
          'C3 추적 소스: 어댑터가 TrackingStateView 스냅샷 제공 (entityId·state·lastKnown)',
          adapter.trackedShips.length === 1 &&
            tracked?.entityId === 8000 &&
            tracked.state === 'attack' &&
            tracked.lastKnownPosition !== null,
          `tracked=${JSON.stringify(tracked)}`,
        );
      }
    }
    {
      // ── INT-CORE-017: combat params 정규화 (중첩 로더 → 평면 gameplay 입력) ──
      const wrap = (value: number | null): { value: number | null } => ({ value });
      const nested = {
        hull: {
          baseMaxHull: wrap(100),
          damagedRatioThreshold: wrap(0.6),
          criticalRatioThreshold: wrap(0.25),
        },
        depthCharge: {
          directRadiusMeters: wrap(3),
          nearRadiusMeters: wrap(9),
          directDamage: wrap(40),
          nearDamage: wrap(15),
          dropCooldownSeconds: wrap(6),
          directFloodingContribution: wrap(0.5),
          nearFloodingContribution: wrap(0.2),
        },
        flooding: {
          minorThreshold: wrap(0.2),
          majorThreshold: wrap(0.5),
          catastrophicThreshold: wrap(0.8),
          hullDamagePerSecondAtFull: wrap(4),
          spreadPerSecond: wrap(0.02),
        },
        detection: {
          distanceFalloff: { value: { fullEffectMeters: 30, zeroEffectMeters: 120 } },
          gaugeDecayPerSecond: wrap(0.08),
        },
        depthChargeOnPassiveScope: { value: false },
      };
      const result = validateCombatParams(nested);
      // 필드 교환·단위 변환 오류 검사 — 서로 다른 값이 정확한 자리에 도착한다
      check(
        'C9 정규화: 중첩 로더 결과가 정확한 평면 계약 블록으로 변환 (필드 교환 0)',
        result.hull?.baseMaxHull === 100 &&
          result.hull.damagedRatioThreshold === 0.6 &&
          result.hull.criticalRatioThreshold === 0.25 &&
          result.depthCharge?.directRadiusMeters === 3 &&
          result.depthCharge.nearRadiusMeters === 9 &&
          result.depthCharge.directDamage === 40 &&
          result.depthCharge.nearDamage === 15 &&
          result.depthCharge.dropCooldownSeconds === 6 &&
          result.depthCharge.directFloodingContribution === 0.5 &&
          result.depthCharge.nearFloodingContribution === 0.2 &&
          result.flooding?.spreadPerSecond === 0.02 &&
          result.flooding.hullDamagePerSecondAtFull === 4 &&
          result.detectionTuning?.distanceFalloff?.fullEffectMeters === 30 &&
          result.detectionTuning.distanceFalloff.zeroEffectMeters === 120 &&
          result.detectionTuning.gaugeDecayPerSecond === 0.08 &&
          result.pendingFields.length === 0,
        JSON.stringify(result.pendingFields),
      );
      // null 보존 + 미확정 목록
      const partial = validateCombatParams({
        ...nested,
        hull: {
          baseMaxHull: wrap(null),
          damagedRatioThreshold: wrap(0.6),
          criticalRatioThreshold: wrap(0.25),
        },
      });
      check(
        'C9 정규화: null은 null로 보존 — 부분 확정 시 hull 블록 미주입(unwired)·pending 보고',
        partial.hull === null && partial.pendingFields.includes('hull.baseMaxHull'),
        `hull=${partial.hull === null ? 'null' : 'set'}, pending=${partial.pendingFields.join(',')}`,
      );
      // NaN·음수 거부 — 필드명 포함 명시적 실패
      let nanMessage = '';
      try {
        validateCombatParams({
          ...nested,
          depthCharge: { ...nested.depthCharge, directDamage: wrap(Number.NaN) },
        });
      } catch (error) {
        nanMessage = error instanceof Error ? error.message : '';
      }
      let negativeMessage = '';
      try {
        validateCombatParams({
          ...nested,
          flooding: { ...nested.flooding, spreadPerSecond: wrap(-1) },
        });
      } catch (error) {
        negativeMessage = error instanceof Error ? error.message : '';
      }
      check(
        'C9 정규화: NaN·음수 = 필드명 포함 명시적 검증 실패 (조용한 보정 없음)',
        nanMessage.includes('directDamage') && negativeMessage.includes('spreadPerSecond'),
        `nan=${nanMessage.slice(0, 60)} / neg=${negativeMessage.slice(0, 60)}`,
      );
      // C9 v0.1.1 침수 기여 관계: 0 < near < direct ≤ 1 — 위반 3형 거부
      const rejects = (block: Record<string, unknown>): string => {
        try {
          validateCombatParams({ ...nested, depthCharge: { ...nested.depthCharge, ...block } });
          return '';
        } catch (error) {
          return error instanceof Error ? error.message : '';
        }
      };
      const overOne = rejects({ directFloodingContribution: wrap(1.5) });
      const zeroNear = rejects({ nearFloodingContribution: wrap(0) });
      const inverted = rejects({
        directFloodingContribution: wrap(0.2),
        nearFloodingContribution: wrap(0.5),
      });
      check(
        'C9 v0.1.1 침수 기여 관계 검증: 1 초과·0·near≥direct 전부 필드명 포함 거부',
        overOne.includes('directFloodingContribution') &&
          zeroNear.includes('nearFloodingContribution') &&
          inverted.includes('nearFloodingContribution'),
        `over=${overOne.slice(0, 50)} / zero=${zeroNear.slice(0, 50)} / inv=${inverted.slice(0, 60)}`,
      );
    }
    {
      // 해역 밖 파괴 보고는 무시 (기지에서 정산 금지)
      const bus = new EventBus();
      const port = new RecordingSessionPort();
      const loop = new MetaLoop(bus, port, { creditLossOnDestroyedRatio: 0.5 });
      loop.initialize(verificationContext(bus));
      const coordinator = new SortieFailureCoordinator(loop, null, null);
      coordinator.initialize(verificationContext(bus));
      const report = coordinator.reportDestroyed({
        failureId: 'base-failure',
        reason: 'hullDestroyed',
        destroyedByEntityId: null,
        damageSource: null,
      });
      check(
        'C 실패 경계: SORTIE 밖(기지) 파괴 보고는 무시 — 파괴 전 정산 없음',
        report === null && loop.metaState === 'BASE',
        `report=${report === null ? 'null' : 'created'}, state=${loop.metaState}`,
      );
    }
  }

  return results;
}
