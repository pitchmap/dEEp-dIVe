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
 *     계산은 리드 `meta/upgradeMath`, 카탈로그는 툴링 `tools/upgradeMath`.
 */

import type { CurrencyBundle, UpgradeModifiers, UpgradeStatId } from '../contracts/meta';
import type { GameParams } from '../contracts/params';
import { effectiveDurationSeconds, effectiveValue, modifierSumFor } from '../meta/upgradeMath';
import type { SaveData } from '../meta/save/saveSchema';
import { createDefaultSave } from '../meta/save/saveSchema';
import type { SaveStore } from '../meta/save/SaveStore';
import type { UpgradeDefinition } from '../tools/upgradeMath';
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
 * `tools/upgradeMath`가 소유한다. 이 클래스는 둘을 잇기만 한다.
 * `params/*.json` 원본은 절대 수정하지 않는다 — 유효값은 파생 복사본이다.
 */
export class UpgradeState {
  private readonly catalog: readonly UpgradeDefinition[];
  private levels: Record<string, number> = {};

  constructor(catalog: readonly UpgradeDefinition[], levels: Readonly<Record<string, number>> = {}) {
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

  /** 공식 계약 보정 집합 — 항목 id가 곧 UpgradeStatId다 (이름 통일 완료) */
  get modifiers(): UpgradeModifiers {
    const modifiers: Record<string, number> = {};
    for (const def of this.catalog) {
      if (!isUpgradeStatId(def.id)) continue; // 계약 외 id는 무시 (상한 밖 실험 항목)
      const level = this.levels[def.id] ?? 0;
      if (level > 0) modifiers[def.id] = level * def.bonusPerLevel;
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
