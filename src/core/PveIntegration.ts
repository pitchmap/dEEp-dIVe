/**
 * PvE 통합 어댑터 — 통합 담당(composition root) 소유.
 *
 * 각 파트가 **자기 경계 안에서** 만든 구현을 공식 계약(contracts/meta.ts,
 * contracts/events.ts)으로 잇는 얇은 어댑터만 둔다. 여기에는 게임 규칙·
 * 밸런스 판정·연출이 없다. 파트 코드끼리 직접 import 하지 않게 하려고
 * 존재하는 층이다 (docs/FILE_OWNERSHIP.md, ARCHITECTURE '조립 계약').
 *
 * 담는 것:
 *  ① SortieEconomyBridge — 게임플레이 경제 → `lootDropped`·`guardShipRequested`
 *     공식 이벤트 발행 (경제 시스템은 이벤트를 직접 발행하지 않는다)
 *  ② SaveBridge — 리드 `saveRequested` → 툴링 `SaveStore` 기록/복원.
 *     저장 코드가 메타 상태 머신을 조작하지 않는다 (읽기 스냅샷만).
 *  ③ UpgradeState — 저장된 단계 → 공식 `UpgradeModifiers` → 유효 파라미터.
 *     계산은 리드 `meta/upgradeMath`, 카탈로그는 툴링 `tools/economyMath`.
 */

import type {
  BaseCommandOutcome,
  BaseScreenLastResult,
  BaseScreenPort,
  CurrencyBundle,
  DepartureResult,
  EquipmentCatalogItem,
  EquipmentChangeJudgePort,
  EquipmentChangeRequest,
  EquipmentId,
  EquipmentLoadout,
  MetaStateId,
  PurchaseCost,
  PurchaseDenialReason,
  SavePort,
  TransactionResult,
  UpgradeCatalogItem,
  UpgradeLevelsPort,
  UpgradeModifiers,
  UpgradeStatId,
} from '../contracts/meta';
import type { GameParams } from '../contracts/params';
import { effectiveDurationSeconds, effectiveValue, modifierSumFor } from '../meta/upgradeMath';
import type { SaveData } from '../meta/save/saveSchema';
import { createDefaultSave } from '../meta/save/saveSchema';
import type { SaveStore } from '../meta/save/SaveStore';
import type { EconomyParams, EquipmentCatalog, UpgradeEntry } from '../tools/economyMath';
import type {
  SalvagePlacementSource,
  SalvageSpawnPlanEntry,
} from '../contracts/officialParams';
import type { SalvageKind } from '../systems/economy/SalvageObject';
import type { WorldDrop } from '../systems/economy/CreditDropField';
import type { EventBus, Unsubscribe } from './EventBus';
import type { GameSystem, SystemContext } from './GameSystem';

/* ─────────────────────────────────────────────────────────────
   ① 경제 → 공식 이벤트 브리지
   ───────────────────────────────────────────────────────────── */

/** 브리지가 소비하는 게임플레이 경제의 최소 단면 (구현체 직접 참조 금지) */
export interface SortieEconomyPort {
  readonly dropField: {
    onCollected(listener: (drop: WorldDrop) => void): () => void;
  };
  consumeGuardSpawnRequests(): readonly {
    readonly provokedByTargetId: number;
    readonly x: number;
    readonly z: number;
  }[];
}

/**
 * 게임플레이 경제 상태 → 공식 계약 이벤트.
 *
 *  - 드롭 회수 → `lootDropped { source, credits, rareParts, x, z }`
 *    (메타 루프가 구독해 출항 재화로 집계한다)
 *  - 중립 공격 경비 요청 → `guardShipRequested { x, z }`
 *    공식 이름은 `guardShipRequested`(리드 계약)이며, 게임플레이가 쓰던
 *    `guardSpawnRequested`는 채택하지 않는다. 유발 표적 id는 공식 payload에
 *    없어 전달되지 않는다 — 필요해지면 계약 보완 절차를 따른다.
 */
export class SortieEconomyBridge implements GameSystem {
  readonly id = 'sortieEconomyBridge';

  private readonly economy: SortieEconomyPort;
  private bus: EventBus | null = null;
  private unsubscribeCollected: (() => void) | null = null;

  constructor(economy: SortieEconomyPort) {
    this.economy = economy;
  }

  initialize(context: SystemContext): void {
    this.bus = context.bus;
    this.unsubscribeCollected = this.economy.dropField.onCollected((drop) => {
      this.bus?.emit('lootDropped', {
        source: drop.source,
        credits: drop.kind === 'credits' ? drop.amount : 0,
        rareParts: drop.kind === 'rarePart' ? 1 : 0,
        x: drop.x,
        z: drop.z,
      });
    });
  }

  update(_deltaSeconds: number): void {
    // 경비 요청은 큐 방식 — 매 프레임 비우고 공식 이벤트로 흘린다.
    // 소비자(구축함 AI)는 아직 없다: 이벤트는 발행되지만 스폰은 일어나지
    // 않는다 (보스 AI와 함께 후속 단계 — docs/PVE_MVP_ACCEPTANCE.md).
    const requests = this.economy.consumeGuardSpawnRequests();
    for (const request of requests) {
      this.bus?.emit('guardShipRequested', { x: request.x, z: request.z });
    }
  }

  dispose(): void {
    this.unsubscribeCollected?.();
    this.unsubscribeCollected = null;
    this.bus = null;
  }
}

/* ─────────────────────────────────────────────────────────────
   ①-b 오디오 큐 어댑터
   ───────────────────────────────────────────────────────────── */

/**
 * 오디오 배관 등록 어댑터 — 툴링 소유 `WebAudioSystem`/`AudioCueRouter`는
 * `GameSystem`이 아니어서 레지스트리에 직접 등록할 수 없다. 여기서
 * 수명주기만 입혀 준다 (사운드 에셋·타이밍 판정은 이 층에 없다).
 *
 * `aimModeChanged`는 라우터가 직접 구독하고, 계약이 갖춰진 경제·기지 큐는
 * 이 어댑터가 이벤트에서 라우터의 `trigger`로 넘긴다. 실제 버퍼가 등록되기
 * 전(사운드 세트 D+10 이후)에는 무음이며 오류를 내지 않는다.
 */
export class AudioSystemAdapter implements GameSystem {
  readonly id = 'audio';

  private readonly audio: { update(dt: number): void; dispose(): void };
  private readonly router: { trigger(cue: AudioCueName): void; dispose(): void };
  private readonly unsubscribes: Unsubscribe[] = [];

  constructor(
    audio: { update(dt: number): void; dispose(): void },
    router: { trigger(cue: AudioCueName): void; dispose(): void },
  ) {
    this.audio = audio;
    this.router = router;
  }

  initialize(context: SystemContext): void {
    this.unsubscribes.push(
      context.bus.on('lootDropped', (payload) => {
        this.router.trigger(payload.rareParts > 0 ? 'rarePartAcquired' : 'creditsGained');
      }),
      context.bus.on('metaStateChanged', ({ next }) => {
        if (next === 'BASE') this.router.trigger('baseEnter');
        else if (next === 'SORTIE') this.router.trigger('baseDepart');
      }),
    );
  }

  update(deltaSeconds: number): void {
    this.audio.update(deltaSeconds);
  }

  dispose(): void {
    for (const off of this.unsubscribes) off();
    this.unsubscribes.length = 0;
    this.router.dispose();
    this.audio.dispose();
  }
}

/** 라우터가 받는 큐 이름 (툴링 AudioCueId와 구조적으로 일치) */
export type AudioCueName =
  | 'aimEnter'
  | 'aimExit'
  | 'creditsGained'
  | 'rarePartAcquired'
  | 'baseEnter'
  | 'baseDepart';

/* ─────────────────────────────────────────────────────────────
   ② 저장 브리지
   ───────────────────────────────────────────────────────────── */

/** 저장 시점에 읽어갈 메타 스냅샷 (저장 코드는 상태를 바꾸지 않는다) */
export interface SaveSnapshotSource {
  readonly wallet: CurrencyBundle;
  readonly upgradeLevels: Readonly<Record<string, number>>;
  readonly equippedGear: readonly string[];
}

/**
 * `saveRequested`(리드 발행) → `SaveStore`(툴링) 기록.
 *
 * 구독만 하고 메타 루프를 조작하지 않는다 — 복원은 부팅 시 조립부가
 * `MetaLoop.restoreWallet`으로 한 번만 수행한다 (역방향 결합 금지).
 */
export class SaveBridge implements GameSystem {
  readonly id = 'saveBridge';

  private readonly store: SaveStore;
  private readonly snapshot: SaveSnapshotSource;
  private readonly base: SaveData;
  private readonly unsubscribes: Unsubscribe[] = [];
  /** 마지막 저장 결과 (검증·디버깅용 읽기 전용) */
  private lastSaveOk = true;

  constructor(store: SaveStore, snapshot: SaveSnapshotSource, base: SaveData = createDefaultSave()) {
    this.store = store;
    this.snapshot = snapshot;
    this.base = base;
  }

  get lastSaveSucceeded(): boolean {
    return this.lastSaveOk;
  }

  initialize(context: SystemContext): void {
    // 정산 확정·희귀 부품 획득 두 시점만 저장한다 [6차 결의 9].
    // 주기적 자동 저장은 도입하지 않는다.
    this.unsubscribes.push(
      context.bus.on('saveRequested', () => {
        this.writeSnapshot();
      }),
    );
  }

  /** 현재 메타 스냅샷을 저장한다 (호출 시점 = saveRequested 수신 시) */
  writeSnapshot(): void {
    const wallet = this.snapshot.wallet;
    this.lastSaveOk = this.store.save({
      ...this.base,
      credits: Math.floor(wallet.credits),
      rareParts: Math.floor(wallet.rareParts),
      upgradeLevels: { ...this.snapshot.upgradeLevels },
      equippedGear: [...this.snapshot.equippedGear],
    });
  }

  update(_deltaSeconds: number): void {
    // 이벤트 구동 — 프레임 작업 없음 (주기 저장 금지)
  }

  dispose(): void {
    for (const off of this.unsubscribes) off();
    this.unsubscribes.length = 0;
  }
}

/* ─────────────────────────────────────────────────────────────
   ③ 업그레이드 상태 → 유효 파라미터
   ───────────────────────────────────────────────────────────── */

/** 카탈로그 항목 id → 공식 UpgradeStatId 매핑 (이름 통일 결과) */
const STAT_IDS: readonly UpgradeStatId[] = [
  'hullIntegrity',
  'maxSpeed',
  'turnRate',
  'maxDepth',
  'torpedoDamage',
  'reloadSpeed',
  'sonarRange',
];

function isUpgradeStatId(id: string): id is UpgradeStatId {
  return (STAT_IDS as readonly string[]).includes(id);
}

/**
 * 영구 업그레이드 단계 보관 + 공식 보정 집합 산출.
 *
 * 계산식은 리드 `meta/upgradeMath`(단일 구현), 카탈로그 정의·상한은 툴링
 * `tools/economyMath`가 소유한다. 이 클래스는 둘을 잇기만 한다.
 * `params/*.json` 원본은 절대 수정하지 않는다 — 유효값은 파생 복사본이다.
 */
export class UpgradeState implements UpgradeLevelsPort {
  private readonly catalog: readonly UpgradeEntry[];
  private levels: Record<string, number> = {};

  constructor(catalog: readonly UpgradeEntry[], levels: Readonly<Record<string, number>> = {}) {
    this.catalog = catalog;
    this.setLevels(levels);
  }

  get currentLevels(): Readonly<Record<string, number>> {
    return this.levels;
  }

  /** 저장 데이터 등 외부 단계 적용 — 카탈로그 상한으로 클램프한다 */
  setLevels(levels: Readonly<Record<string, number>>): void {
    const next: Record<string, number> = {};
    for (const def of this.catalog) {
      const raw = levels[def.id] ?? 0;
      const level = Number.isFinite(raw) ? Math.floor(raw) : 0;
      next[def.id] = Math.min(Math.max(level, 0), def.maxLevel);
    }
    this.levels = next;
  }

  /* ── UpgradeLevelsPort (구매 트랜잭션 전용 — 단계 보관자로서 구현) ── */

  /** 트랜잭션 스냅샷 — 내부 참조가 아닌 복사본을 돌려준다 */
  snapshotLevels(): Readonly<Record<string, number>> {
    return { ...this.levels };
  }

  /**
   * 구매 확정 후보 적용 — 해당 항목 단계 +1 (카탈로그 상한으로 클램프).
   * 상한 도달 여부 판정은 게임플레이 판정 포트 몫이며, 여기의 클램프는
   * 계약 위반 방어일 뿐이다.
   */
  applyPurchasedLevel(id: UpgradeStatId): void {
    const def = this.catalog.find((entry) => entry.id === id);
    if (!def) return; // 카탈로그 밖 id — 무시 (판정 포트가 걸렀어야 함)
    const current = this.levels[id] ?? 0;
    this.levels = { ...this.levels, [id]: Math.min(current + 1, def.maxLevel) };
  }

  /** 트랜잭션 롤백 — 스냅샷 전체 복원 (setLevels와 동일 클램프 경로) */
  restoreLevels(levels: Readonly<Record<string, number>>): void {
    this.setLevels(levels);
  }

  /** 공식 계약 보정 집합 — 항목 id가 곧 UpgradeStatId다 (이름 통일 완료) */
  get modifiers(): UpgradeModifiers {
    const modifiers: Record<string, number> = {};
    for (const def of this.catalog) {
      if (!isUpgradeStatId(def.id)) continue; // 계약 외 id는 무시 (상한 밖 실험 항목)
      const level = this.levels[def.id] ?? 0;
      // 공식 카탈로그는 단계별 누적 배율(effectBonus[level-1])을 갖는다.
      // **미확정(null)이면 보정을 만들지 않는다** — 임의 숫자로 채우지 않으며
      // 해당 항목은 가격도 null이라 구매 자체가 불가하다 (A8 미완 상태).
      const bonus = level > 0 ? def.effectBonus[level - 1] : null;
      if (typeof bonus === 'number') modifiers[def.id] = bonus;
    }
    return modifiers as UpgradeModifiers;
  }

  /**
   * 외형 단계(1~3) — 성장 가시화용. 순수 파생값이며 렌더에는 이 숫자만
   * 전달한다 (렌더가 업그레이드 수치·저장 데이터를 읽지 않는다, INT-RENDER-007).
   * 선체 = hullIntegrity·maxDepth 합, 무장 = torpedoDamage·reloadSpeed 합 기준.
   */
  get visualTiers(): { hull: number; weapon: number } {
    const level = (id: string): number => this.levels[id] ?? 0;
    const hullLevels = level('hullIntegrity') + level('maxDepth');
    const weaponLevels = level('torpedoDamage') + level('reloadSpeed');
    return { hull: tierFromLevels(hullLevels), weapon: tierFromLevels(weaponLevels) };
  }
}

/** 누적 단계 → 외형 3단계. 임계값은 연출 구간이며 밸런스 수치가 아니다 */
function tierFromLevels(totalLevels: number): number {
  if (totalLevels >= 6) return 3;
  if (totalLevels >= 2) return 2;
  return 1;
}

/**
 * 검증된 params 원본 + 공식 보정 → **유효 파라미터 복사본**.
 * 원본 객체는 변형하지 않는다 (JSON 역기록 금지 원칙의 런타임 대응).
 * 시간형 값(재장전·선회 소요 시간)은 `effectiveDurationSeconds`로 단축한다.
 */
export function deriveEffectiveParams(
  params: GameParams,
  modifiers: UpgradeModifiers,
): GameParams {
  const speedSum = modifierSumFor(modifiers, 'maxSpeed');
  const turnSum = modifierSumFor(modifiers, 'turnRate');
  const reloadSum = modifierSumFor(modifiers, 'reloadSpeed');

  return {
    ...params,
    movement: {
      ...params.movement,
      maxSpeedMetersPerSecond: {
        ...params.movement.maxSpeedMetersPerSecond,
        value: effectiveValue(params.movement.maxSpeedMetersPerSecond.value, speedSum),
      },
      turn90Seconds: {
        ...params.movement.turn90Seconds,
        value: effectiveDurationSeconds(params.movement.turn90Seconds.value, turnSum),
      },
    },
    combat: {
      ...params.combat,
      torpedoReloadSeconds: {
        ...params.combat.torpedoReloadSeconds,
        value: effectiveDurationSeconds(params.combat.torpedoReloadSeconds.value, reloadSum),
      },
    },
  };
}

/* ─────────────────────────────────────────────────────────────
   ④ 스프린트 A production 기지 경제 조립 (INT-CORE-010)
   — 저장 책임 단일화·경제 미확정 처리·BaseScreenPort v2 구현.
   여기에는 판정·가격·UI DOM이 없다: 게임플레이 판정과 그래픽스 UI를
   공식 계약으로 잇는 얇은 어댑터와 명령 순서만 있다.
   ───────────────────────────────────────────────────────────── */

/**
 * 계측 가능한 SavePort — 명령당 저장 호출 횟수를 검증·디버깅에서 셀 수
 * 있게 한다 (저장 책임 표: 한 사용자 명령 = SavePort 최대 1회).
 * production 기본 경로에도 그대로 쓰인다 (계측 오버헤드 = 카운터 1개).
 */
export class CountingSavePort implements SavePort {
  private readonly inner: SavePort;
  private count = 0;

  constructor(inner: SavePort) {
    this.inner = inner;
  }

  get callCount(): number {
    return this.count;
  }

  save(): boolean {
    this.count += 1;
    return this.inner.save();
  }
}

/** 장비 판정 어댑터가 소비하는 게임플레이 EquipmentSystem의 구조 단면 */
export interface EquipmentSystemFacade {
  readonly slots: readonly (EquipmentId | null)[];
  replaceItem(slotIndex: number, id: EquipmentId): GameplayTransactionResult;
  unequipItem(slotIndex: number): GameplayTransactionResult;
}

/**
 * 게임플레이 `EquipmentSystem.EquipmentChangeResult`의 구조 단면
 * (구현체 직접 import 대신 — 구 `systems/economy/purchaseTypes`는 삭제됨).
 */
export type GameplayTransactionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly category: 'condition' | 'save'; readonly reason: string };

/**
 * `EquipmentChangeJudgePort` 구현 — 게임플레이 EquipmentSystem 위임.
 * 판정 로직을 복제하지 않는다: equip/replace는 replaceItem(범위·중복 검사
 * 포함), unequip은 unequipItem 그대로. **이 어댑터·시스템은 저장하지
 * 않는다** — production에서는 EquipmentSystem.attachSavePort를 연결하지
 * 않아(내부 저장 경로 비활성) 저장은 리드 EquipmentTransaction 한 곳뿐이다.
 */
export class EquipmentJudgeAdapter implements EquipmentChangeJudgePort {
  private readonly system: EquipmentSystemFacade;

  constructor(system: EquipmentSystemFacade) {
    this.system = system;
  }

  applyEquipmentChange(request: EquipmentChangeRequest): PurchaseDenialReason | null {
    const result =
      request.kind === 'unequip'
        ? this.system.unequipItem(request.slotIndex)
        : this.system.replaceItem(request.slotIndex, request.equipmentId);
    if (result.ok) return null;
    if (result.category === 'save') {
      // 계약 위반 방어 — production에서는 시스템에 저장 포트가 없어야 한다.
      // 트랜잭션 catch 경로로 넘겨 안전 결과(saveFailedRolledBack)로 수렴시킨다.
      throw new Error('[EquipmentJudgeAdapter] 판정 포트에서 저장이 발생했습니다 (이중 저장 금지 위반)');
    }
    return toDenialReason(result.reason);
  }

  snapshotSlots(): readonly (EquipmentId | null)[] {
    return [...this.system.slots];
  }

  restoreSlots(slots: readonly (EquipmentId | null)[]): void {
    // 중복 검사와 충돌하지 않도록 전부 비운 뒤 원래 슬롯 위치로 되돌린다
    for (let i = 0; i < this.system.slots.length; i += 1) {
      this.system.unequipItem(i);
    }
    slots.forEach((id, index) => {
      if (id !== null) this.system.replaceItem(index, id);
    });
  }
}

/** 게임플레이 사유 문자열 → 공식 계약 사유 (동일 표기 — 방어적 매핑) */
function toDenialReason(reason: string): PurchaseDenialReason {
  switch (reason) {
    case 'insufficientCredits':
    case 'insufficientRareParts':
    case 'maxLevelReached':
    case 'slotFull':
    case 'alreadyEquipped':
      return reason;
    default:
      console.error(`[PveIntegration] 알 수 없는 판정 사유: ${reason} — slotFull로 표기`);
      return 'slotFull';
  }
}

/**
 * 출항 확정 command — 출항 확정 직전 저장의 **유일한** 소유자 (저장 책임 표).
 * 저장 성공 시에만 메타 루프 전환(해역 진입)을 진행한다. 실패 시 전환 없음 —
 * 기지 상태 유지, 재시도 가능. 예외를 밖으로 던지지 않는다.
 */
export class DepartureCommand {
  private readonly meta: {
    readonly metaState: MetaStateId;
    beginSortiePrep(): void;
    launchSortie(): void;
  };
  private readonly savePort: SavePort;

  constructor(
    meta: { readonly metaState: MetaStateId; beginSortiePrep(): void; launchSortie(): void },
    savePort: SavePort,
  ) {
    this.meta = meta;
    this.savePort = savePort;
  }

  confirmDeparture(): DepartureResult {
    if (this.meta.metaState !== 'BASE') return 'invalidState';
    let saved = false;
    try {
      saved = this.savePort.save();
    } catch (error) {
      console.error('[DepartureCommand] 출항 저장 중 예외:', error);
      saved = false;
    }
    if (!saved) return 'saveFailed'; // 해역 전환 없음 — 기지 유지
    try {
      this.meta.beginSortiePrep();
      this.meta.launchSortie();
      return 'departed';
    } catch (error) {
      // 저장은 성공했으나 전환 실패(허용표 위반 등) — 부팅·루프를 깨지 않는다
      console.error('[DepartureCommand] 출항 전환 중 예외:', error);
      return 'invalidState';
    }
  }
}

/** 공식 카탈로그에서 다음 단계 비용·미확정 여부 산출 (null → 발명 금지) */
export function officialNextCost(
  entry: UpgradeEntry,
  currentLevel: number,
): { cost: PurchaseCost | null; pending: boolean } {
  const nextLevel = currentLevel + 1;
  if (nextLevel > entry.maxLevel) return { cost: null, pending: false }; // 최대 단계
  const credits = entry.costCredits[nextLevel - 1] ?? null;
  const rareParts = entry.costRareParts[nextLevel - 1] ?? null;
  const effect = entry.effectBonus[nextLevel - 1] ?? null;
  if (credits === null || rareParts === null || effect === null) {
    return { cost: null, pending: true }; // 공식 수치 미확정 — economyDataUnavailable
  }
  return { cost: { credits, rareParts }, pending: false };
}

/** BaseScreenPort v2 production 구현이 조립부에서 받는 의존성 묶음 */
export interface BaseScreenDeps {
  readonly meta: {
    readonly metaState: MetaStateId;
    readonly wallet: CurrencyBundle;
    readonly sortieCreditsEarned: number;
    readonly sortieRarePartsSecured: number;
  };
  readonly upgradeCatalog: readonly UpgradeEntry[];
  readonly equipmentCatalog: EquipmentCatalog;
  /** 확정 단계 스냅샷 (단일 저장소 = 게임플레이 판정 시스템) */
  readonly levelsOf: () => Readonly<Record<string, number>>;
  readonly loadoutOf: () => EquipmentLoadout;
  readonly purchaseTx: { run(id: UpgradeStatId): TransactionResult };
  readonly equipmentTx: { run(request: EquipmentChangeRequest): TransactionResult };
  readonly departure: DepartureCommand;
  /** 구매 확정 후 파생 상태(유효 파라미터·외형 단계·장비 배율) 갱신 훅 */
  readonly onPurchaseCommitted: () => void;
}

function toOutcome(result: TransactionResult): BaseCommandOutcome {
  if (result.status === 'success') return 'success';
  if (result.status === 'denied') return result.reason;
  return 'saveFailedRolledBack';
}

/**
 * production BaseScreenPort — UI가 소비하는 유일한 진입점 구현.
 * 실제 지갑·단계·loadout을 매 접근마다 소스에서 읽는다(사본 없음).
 * 경제 데이터 미확정(null) 항목의 구매는 **트랜잭션 진입 전에** 차단한다:
 * 상태·저장 호출 0회, provisional 대입 없음.
 */
export function createBaseScreenPort(deps: BaseScreenDeps): BaseScreenPort & {
  readonly lastResult: BaseScreenLastResult | null;
} {
  let lastResult: BaseScreenLastResult | null = null;

  const record = (
    command: BaseScreenLastResult['command'],
    outcome: BaseScreenLastResult['outcome'],
  ): typeof outcome => {
    lastResult = { command, outcome };
    return outcome;
  };

  const runEquipment = (
    command: 'equipItem' | 'replaceItem' | 'unequipItem',
    request: EquipmentChangeRequest,
  ): BaseCommandOutcome =>
    record(command, toOutcome(deps.equipmentTx.run(request))) as BaseCommandOutcome;

  return {
    get wallet(): CurrencyBundle {
      return deps.meta.wallet;
    },
    get sortieCreditsEarned(): number {
      return deps.meta.sortieCreditsEarned;
    },
    get sortieRarePartsSecured(): number {
      return deps.meta.sortieRarePartsSecured;
    },
    get upgradeCatalog(): readonly UpgradeCatalogItem[] {
      const levels = deps.levelsOf();
      return deps.upgradeCatalog.map((entry) => {
        const { cost, pending } = officialNextCost(entry, levels[entry.id] ?? 0);
        return {
          id: entry.id,
          label: entry.label,
          maxLevel: entry.maxLevel,
          nextCost: cost,
          nextCostPending: pending,
        };
      });
    },
    get upgradeLevels(): Readonly<Record<string, number>> {
      return deps.levelsOf();
    },
    get equipmentCatalog(): readonly EquipmentCatalogItem[] {
      return deps.equipmentCatalog.items.map((item) => {
        const credits = item.costCredits;
        const rareParts = item.costRareParts;
        return {
          id: item.id,
          label: item.label,
          cost: credits === null || rareParts === null ? null : { credits, rareParts },
        };
      });
    },
    get loadout(): EquipmentLoadout {
      return deps.loadoutOf();
    },
    get canLaunchSortie(): boolean {
      return deps.meta.metaState === 'BASE';
    },
    get lastResult(): BaseScreenLastResult | null {
      return lastResult;
    },

    purchaseUpgrade(upgradeId: UpgradeStatId): BaseCommandOutcome {
      const entry = deps.upgradeCatalog.find((candidate) => candidate.id === upgradeId);
      if (entry) {
        const level = deps.levelsOf()[upgradeId] ?? 0;
        const { pending } = officialNextCost(entry, level);
        if (pending) {
          // 공식 경제 params 미확정 — 트랜잭션 진입 전 차단 (상태·저장 0회)
          return record('purchaseUpgrade', 'economyDataUnavailable') as BaseCommandOutcome;
        }
      }
      const outcome = toOutcome(deps.purchaseTx.run(upgradeId));
      if (outcome === 'success') deps.onPurchaseCommitted();
      return record('purchaseUpgrade', outcome) as BaseCommandOutcome;
    },
    equipItem(equipmentId: EquipmentId, slotIndex: number): BaseCommandOutcome {
      return runEquipment('equipItem', { kind: 'equip', slotIndex, equipmentId });
    },
    replaceItem(equipmentId: EquipmentId, slotIndex: number): BaseCommandOutcome {
      return runEquipment('replaceItem', { kind: 'replace', slotIndex, equipmentId });
    },
    unequipItem(slotIndex: number): BaseCommandOutcome {
      return runEquipment('unequipItem', { kind: 'unequip', slotIndex });
    },
    confirmDeparture(): DepartureResult {
      return record('confirmDeparture', this.canLaunchSortie ? deps.departure.confirmDeparture() : 'invalidState') as DepartureResult;
    },
  };
}

/* ─────────────────────────────────────────────────────────────
   ⑤ production UI 수명주기 어댑터
   — UI(EconomyHud·SortiePrepScreen)는 BaseScreenPort v2를 **직접** 소비한다.
   구계약 변환 어댑터(createMetaUiPorts·toUiCommandResult)는 UI v2 동기화로
   불필요해져 제거됐다 (INT-RENDER-010 §2). QA 데모(econUiQaDemo)는 여기와
   무관하며 production composition에 포함되지 않는다 (?econdemo 플래그 전용).
   ───────────────────────────────────────────────────────────── */

/**
 * 경제 UI 수명주기 어댑터 — 그래픽스 UI 컴포넌트(EconomyHud·SortiePrepScreen)
 * 는 GameSystem이 아니므로 여기서 프레임 갱신·정리만 입힌다.
 * 표시 값은 각 컴포넌트가 매 프레임 소스에서 다시 읽는다.
 */
export class MetaUiAdapter implements GameSystem {
  readonly id = 'metaBaseUi';

  private readonly parts: readonly { update(): void; dispose(): void }[];

  constructor(parts: readonly { update(): void; dispose(): void }[]) {
    this.parts = parts;
  }

  initialize(_context: SystemContext): void {}

  update(_deltaSeconds: number): void {}

  /** DOM 표시 갱신은 render 단계 (3D 장면 렌더 후) */
  render(): void {
    for (const part of this.parts) part.update();
  }

  dispose(): void {
    for (const part of this.parts) part.dispose();
  }
}

/* ─────────────────────────────────────────────────────────────
   ⑤ 해저 재화(salvage) 결합·스폰 (INT-CORE-011)
   — 보상은 economy params에서, 좌표는 SalvagePlacementSource에서만
   파생한다. 여기에는 드롭·회수 런타임이 없다 (게임플레이 소유).
   ───────────────────────────────────────────────────────────── */

/** 게임플레이 SalvageKind와의 정합 검증용 — 값 발명이 아니라 타입 가드다 */
const SALVAGE_KINDS: readonly SalvageKind[] = ['chest', 'container', 'mineral'];

function isSalvageKind(value: string): value is SalvageKind {
  return (SALVAGE_KINDS as readonly string[]).includes(value);
}

/**
 * 경제 params의 salvageSpawns와 월드·그래픽스의 배치를 spawnId로 결합한다.
 *
 * 거부(예외) 조건 — 존재하지 않는 spawnId를 무시하지 않는다:
 *  - 경제 spawnId·배치 spawnId 중복
 *  - 경제에만 있는 spawnId (배치 누락) / 배치에만 있는 spawnId (경제 미지)
 *  - economy.dropTables에 없는 dropTableId
 *  - 게임플레이 SalvageKind 밖의 kind
 */
export function composeSalvageSpawnPlan(
  economy: Pick<EconomyParams, 'dropTables' | 'salvageSpawns'>,
  placements: SalvagePlacementSource,
): SalvageSpawnPlanEntry[] {
  const placementById = new Map<string, SalvagePlacementSource['placements'][number]>();
  for (const placement of placements.placements) {
    if (placementById.has(placement.spawnId)) {
      throw new Error(`[salvage] 배치 spawnId 중복: ${placement.spawnId}`);
    }
    placementById.set(placement.spawnId, placement);
  }

  const seenEconomyIds = new Set<string>();
  const plan: SalvageSpawnPlanEntry[] = [];
  for (const spawn of economy.salvageSpawns) {
    if (seenEconomyIds.has(spawn.spawnId)) {
      throw new Error(`[salvage] 경제 spawnId 중복: ${spawn.spawnId}`);
    }
    seenEconomyIds.add(spawn.spawnId);

    const placement = placementById.get(spawn.spawnId);
    if (!placement) {
      throw new Error(`[salvage] 배치 누락 spawnId: ${spawn.spawnId} (경제에만 존재 — 무시 금지)`);
    }
    placementById.delete(spawn.spawnId);

    if (!isSalvageKind(spawn.kind)) {
      throw new Error(`[salvage] 미지 kind: ${spawn.kind} (spawnId ${spawn.spawnId})`);
    }
    const table = economy.dropTables[spawn.dropTableId];
    if (!table) {
      throw new Error(`[salvage] 미지 dropTableId: ${spawn.dropTableId} (spawnId ${spawn.spawnId})`);
    }

    plan.push({
      spawnId: spawn.spawnId,
      kind: spawn.kind,
      dropTableId: spawn.dropTableId,
      credits: table.credits,
      rarePartId: spawn.rarePartId,
      rarePartCount: spawn.rarePartId === null ? 0 : 1,
      worldPosition: placement.worldPosition,
      ...(placement.orientationYawRadians !== undefined
        ? { orientationYawRadians: placement.orientationYawRadians }
        : {}),
    });
  }

  if (placementById.size > 0) {
    const unknown = [...placementById.keys()].join(', ');
    throw new Error(`[salvage] 경제에 없는 배치 spawnId: ${unknown} (무시 금지)`);
  }
  return plan;
}

/**
 * 게임플레이 스폰 진입점의 최소 단면 — `GameplaySystems.spawnSalvageFromPlan`
 * (내부적으로 `EconomySystem.spawnSalvageFromPlan`)이 충족한다.
 *
 * **결합 entry를 통째로** 넘긴다. 좌표만 넘기던 구 시그니처
 * (`spawnSalvage(kind, x, y, z, rarePartId)`)는 `spawnId`와 확정 보상
 * (`credits`)을 잃어, 게임플레이 측의 spawnId 기반 중복·회수 후 재생성
 * 거부가 아예 작동하지 못했다. 스포너의 출항당 1회 가드는 그대로 두고
 * 게임플레이 가드와 **이중 방어**가 된다 (INT-GAME-011 ③).
 */
export interface SalvageSpawnAdapter {
  spawnSalvageFromPlan(entry: SalvageSpawnPlanEntry): { readonly status: string };
}

export type SalvageSpawnReport =
  | { readonly status: 'spawned'; readonly count: number }
  | { readonly status: 'alreadySpawned' }
  | { readonly status: 'unwired' }
  | { readonly status: 'rejected'; readonly message: string };

/**
 * 출항당 1회 salvage 스포너 (production spawn 규칙).
 *
 *  - `beginSortie()` — 세션 시작(월드 초기화 직후, `resetSortieSession` 다음)
 *    에 조립부가 호출한다. 새 출항 가드를 리셋한 뒤 전체 plan을 1회 생성.
 *  - `spawnForSortie()` — 같은 출항에서 두 번째 호출은 `alreadySpawned`
 *    (파괴·회수된 salvage도 같은 출항 중 재생성하지 않는다 — 월드 잔존
 *    개수가 아니라 출항당 플래그로 가드).
 *  - 배치 소스 미연결이면 `unwired` — **임시 좌표를 만들지 않는다.**
 *  - 결합 거부(누락·중복·미지 spawnId 등)는 `rejected` — 아무것도 생성하지
 *    않는다 (부분 생성 없음: plan 결합이 생성보다 먼저 전부 수행된다).
 */
export class SortieSalvageSpawner {
  private readonly economy: Pick<EconomyParams, 'dropTables' | 'salvageSpawns'>;
  private readonly adapter: SalvageSpawnAdapter;
  private placements: SalvagePlacementSource | null = null;
  private spawnedThisSortie = false;

  constructor(
    economy: Pick<EconomyParams, 'dropTables' | 'salvageSpawns'>,
    adapter: SalvageSpawnAdapter,
  ) {
    this.economy = economy;
    this.adapter = adapter;
  }

  /** 월드·그래픽스 배치 도착 시 조립부가 연결한다 (null = 명시적 미연결) */
  attachPlacementSource(source: SalvagePlacementSource | null): void {
    this.placements = source;
  }

  get placementWired(): boolean {
    return this.placements !== null;
  }

  /** 새 출항 시작 — 가드 리셋 후 1회 생성 */
  beginSortie(): SalvageSpawnReport {
    this.spawnedThisSortie = false;
    return this.spawnForSortie();
  }

  spawnForSortie(): SalvageSpawnReport {
    if (this.spawnedThisSortie) return { status: 'alreadySpawned' };
    if (!this.placements) return { status: 'unwired' };

    let plan: SalvageSpawnPlanEntry[];
    try {
      plan = composeSalvageSpawnPlan(this.economy, this.placements);
    } catch (error) {
      return { status: 'rejected', message: error instanceof Error ? error.message : String(error) };
    }

    // 결합 entry 전체를 그대로 전달한다 — spawnId·확정 보상이 유실되면
    // 게임플레이 측 중복 거부가 성립하지 않는다.
    let spawnedCount = 0;
    for (const entry of plan) {
      if (this.adapter.spawnSalvageFromPlan(entry).status === 'spawned') spawnedCount += 1;
    }
    this.spawnedThisSortie = true;
    return { status: 'spawned', count: spawnedCount };
  }
}
