/**
 * 장비 시스템 — MVP 장비 정확히 4종 (6차 신 스코프 가드).
 *
 *   기본 어뢰 / 고속 어뢰(속력↑ 피해↓) / 중어뢰(속력↓ 피해↑) / 디코이
 *
 * 규칙:
 *  - 장비 간 상위호환 없음. **성능·가격·슬롯 전부 공식 `params/equipment.json`
 *    하나에서만** 온다 [INT-CORE-011]. 조립부가 `official.equipment`를 주입하며
 *    (`applyCatalog`), 이 시스템은 JSON을 읽지도 툴링 로더를 부르지도 않고
 *    내부에 성능 상수를 두지 않는다 — provisional 모듈 소비는 제거됐다.
 *  - **미주입(unwired)이면 성능값을 발명하지 않는다**: 어뢰 프로파일이 없어
 *    발사가 성립하지 않고(`activeTorpedoProfile() === null`), 디코이 재고도 0
 *    이다. `equipmentParamsWired`가 false로 조립 누락을 드러낸다.
 *  - **슬롯 제한**은 공식 `slotCapacity`에서 온다. 미확정(null)일 때만 구조
 *    기본값을 유지한다 — 슬롯은 전투 구동에 필요한 구조 값이라 게임을 멈추지
 *    않는다(임의 '경제' 수치 대입 아님).
 *  - 장착 변경은 계약 `EquipmentChangeJudgePort`(INT-CORE-010 개정 — 판정+적용
 *    결합형)로 판정·적용·복원만 한다 — **저장은 리드 `EquipmentTransaction`
 *    소유**이며 이 시스템은 저장소에 접근하지 않는다 (스프린트 A 정규화).
 *  - **시작 로드아웃 규칙**: 저장 데이터가 없을 때만 공식 `startingItem`
 *    (standardTorpedo)을 부여한다. 저장이 '전부 해제'를 명시했다면 그대로
 *    비워 둔다 — `restoreSavedLoadout(null)` vs `restoreSavedLoadout([])`.
 *  - 발사 경로는 기존 단일 진입점 유지 — TorpedoSystem.fire()가 이 시스템의
 *    `activeTorpedoProfile()`을 소비해 속력·피해를 정하고, 활성 장비가
 *    디코이면 `launchDecoy()`로 위임한다 (별도 발사 시스템 없음).
 *  - 디코이 = 가짜 음향 표적: 위치·잔여 시간을 읽기 전용으로 노출 —
 *    적 AI(리드 소유)가 교란 표적으로 소비한다. AI 로직 복제 없음.
 *  - **업그레이드 배율 (회의 11 결의 4)**: params 원본 불변, 최종값 =
 *    기준값 × (1 + 보정 합) **합연산**. 리드의 EffectiveParams 계약이 아직
 *    없어 동등한 주입 인터페이스(`UpgradeModifiers` + setUpgradeModifiers)를
 *    제공한다 — 계약 확정 시 소비 경로만 교체 (INT-GAME-008).
 */

import type {
  EquipmentChangeRequest,
  EquipmentLoadout,
  PurchaseDenialReason,
} from '../contracts/meta';
import type { Updatable } from '../contracts/systems';
import {
  OFFICIAL_EQUIPMENT_IDS,
  type EquipmentCatalog,
  type EquipmentCatalogEntry,
} from './economy/officialEconomyCatalog';

/** MVP 장비 식별자 — 정확히 4종, 확장 금지 (신 스코프 가드) */
export type EquipmentId = 'standardTorpedo' | 'fastTorpedo' | 'heavyTorpedo' | 'decoy';

/** 어뢰형 장비의 발사 프로파일 (업그레이드 배율 적용 전 기준값) */
export interface TorpedoProfile {
  readonly speedMetersPerSecond: number;
  readonly damage: number;
}

/**
 * 공식 `slotCapacity` 주입 전의 **구조 기본값**. 경제 밸런스 수치가 아니라
 * '전투가 성립하는 최소 슬롯 구조'이며, 공식 값이 오는 즉시 교체된다
 * (`applyCatalog` — production은 항상 공식 값으로 덮어쓴다).
 */
const STRUCTURAL_SLOT_FALLBACK = 2;

/** 장비 변경 결과 — 리드 어댑터(EquipmentSystemFacade)가 소비하는 구조 단면 */
export type EquipmentChangeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly category: 'condition'; readonly reason: PurchaseDenialReason };

/**
 * 업그레이드 합연산 보정 (리드 EffectiveParams 계약의 동등 인터페이스).
 * 값은 비율 합 — 예: +0.1 두 개 = +0.2 (곱연산 금지, 회의 11 결의 4).
 */
export interface UpgradeModifiers {
  readonly torpedoSpeedBonus: number;
  readonly torpedoDamageBonus: number;
}

const ZERO_MODIFIERS: UpgradeModifiers = { torpedoSpeedBonus: 0, torpedoDamageBonus: 0 };

/** 주행 중 디코이 (가짜 음향 표적) — AI·렌더 소비용 읽기 전용 상태 */
export interface DecoySnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly remainingSeconds: number;
}

interface ActiveDecoy {
  id: number;
  x: number;
  y: number;
  z: number;
  remainingSeconds: number;
}

export class EquipmentSystem implements Updatable {
  private slotList: Array<EquipmentId | null>;
  private activeIndex = 0;
  private modifiers: UpgradeModifiers = ZERO_MODIFIERS;

  private decoyStock = 0;
  private decoyCooldown = 0;
  private nextDecoyId = 1;
  private decoys: ActiveDecoy[] = [];

  /** 공식 장비 카탈로그 (성능·가격·슬롯) — 미주입 시 성능값 없음 */
  private catalog: EquipmentCatalog | null = null;
  /**
   * 로드아웃이 **명시적으로 정해졌는지** — 저장 복원·생성자 지정·기지 변경이
   * 있었다면 true. false일 때만 공식 시작 장비를 부여한다 (빈 로드아웃을
   * 저장한 플레이어에게 기본 어뢰를 되돌려 주지 않기 위한 구분).
   */
  private loadoutExplicit: boolean;

  constructor(initialSlots: readonly EquipmentId[] | null = ['standardTorpedo']) {
    this.slotList = new Array<EquipmentId | null>(STRUCTURAL_SLOT_FALLBACK).fill(null);
    this.loadoutExplicit = initialSlots !== null;
    (initialSlots ?? []).slice(0, STRUCTURAL_SLOT_FALLBACK).forEach((id, index) => {
      this.slotList[index] = id;
    });
  }

  /**
   * 공식 장비 카탈로그 적용 — 성능·가격·슬롯의 유일한 출처를 주입한다.
   *
   * 슬롯 수는 **확정된 경우에만** 반영한다. `slotCapacity`가 null(기획 수치표
   * 미도착)이면 현재 구조 기본값을 유지하며 임의의 경제 값을 만들지 않는다.
   * 축소 시 초과 슬롯의 장비는 해제된다.
   *
   * 로드아웃이 아직 명시되지 않았다면(저장 없음) 공식 `startingItem`을 부여한다
   * — 명시된 로드아웃(빈 것 포함)은 건드리지 않는다.
   */
  applyCatalog(catalog: EquipmentCatalog): void {
    this.catalog = catalog;
    const capacity = catalog.slotCapacity;
    if (capacity !== null && Number.isFinite(capacity) && capacity > 0) {
      const next = Math.floor(capacity);
      const resized = new Array<EquipmentId | null>(next).fill(null);
      for (let index = 0; index < Math.min(next, this.slotList.length); index += 1) {
        resized[index] = this.slotList[index] ?? null;
      }
      this.slotList = resized;
      if (this.activeIndex >= next) this.activeIndex = 0;
    }
    this.grantStartingLoadoutIfUnset();
    this.refillDecoyStock();
  }

  /** 공식 카탈로그 (읽기 전용) — 기지 UI가 장비 목록·가격을 그릴 때 소비 */
  get equipmentCatalog(): EquipmentCatalog | null {
    return this.catalog;
  }

  /** 공식 장비 params 배선 여부 — false면 어뢰 프로파일·디코이 재고가 없다 */
  get equipmentParamsWired(): boolean {
    return this.catalog !== null;
  }

  /**
   * 저장에서 복원한 장착 상태 주입 (조립부 부팅 1회).
   *
   *  - `null` = **저장 데이터 없음**(SaveStore source 'fresh') → 공식
   *    시작 장비(standardTorpedo)를 부여한다.
   *  - `[]` = 저장이 명시한 **전부 해제** → 그대로 비워 둔다. 기본 어뢰를
   *    되돌려 주지 않는다 (새로고침 때마다 장비가 되살아나던 문제의 원인).
   */
  restoreSavedLoadout(saved: readonly EquipmentId[] | null): void {
    if (saved === null) {
      this.loadoutExplicit = false;
      this.slotList = this.slotList.map(() => null);
      this.grantStartingLoadoutIfUnset();
      return;
    }
    this.loadoutExplicit = true;
    const next = this.slotList.map(() => null) as Array<EquipmentId | null>;
    saved.slice(0, next.length).forEach((id, index) => {
      if ((OFFICIAL_EQUIPMENT_IDS as readonly string[]).includes(id)) next[index] = id;
    });
    this.slotList = next;
    this.normalizeActiveIndex();
  }

  /** 공식 시작 장비 부여 — 로드아웃이 미지정이고 카탈로그가 있을 때만 */
  private grantStartingLoadoutIfUnset(): void {
    if (this.loadoutExplicit || this.catalog === null) return;
    if (this.slotList.some((slot) => slot !== null)) return;
    const starting = this.catalog.items.filter((entry) => entry.startingItem);
    starting.slice(0, this.slotList.length).forEach((entry, index) => {
      this.slotList[index] = entry.id;
    });
    this.normalizeActiveIndex();
  }

  /** 활성 장비의 공식 카탈로그 항목 (미주입·미장착이면 null) */
  private entryOf(id: EquipmentId | null): EquipmentCatalogEntry | null {
    if (id === null || this.catalog === null) return null;
    return this.catalog.items.find((entry) => entry.id === id) ?? null;
  }

  /** 공식 계약 형태의 장착 상태 (UI·저장 소비) */
  get loadout(): EquipmentLoadout {
    return {
      slotCapacity: this.slotList.length,
      equipped: this.slotList.filter((slot): slot is EquipmentId => slot !== null),
    };
  }

  /** 장착 슬롯 (읽기 전용 뷰) — 길이 = 슬롯 제한 */
  get slots(): readonly (EquipmentId | null)[] {
    return this.slotList;
  }

  get slotCount(): number {
    return this.slotList.length;
  }

  /**
   * 슬롯 지정 장착 (전투 조립·검증용 단순 경로) — 범위 밖·중복이면 false.
   * 기지 변경은 계약 경로(evaluate → apply)를 쓴다.
   */
  equip(slotIndex: number, id: EquipmentId): boolean {
    return this.applyEquipmentChange({ kind: 'equip', slotIndex, equipmentId: id }) === null;
  }

  /** 해제 (단순 경로) — 계약 경로의 얇은 래퍼 */
  unequip(slotIndex: number): void {
    this.applyEquipmentChange({ kind: 'unequip', slotIndex });
  }

  /* ── 리드 어댑터 단면 (`EquipmentSystemFacade`, PveIntegration) ────────
   * 판정 로직을 복제하지 않는다 — 아래 두 메서드는 계약 경로의 결과 표기만
   * 바꾼 얇은 래퍼다. 저장하지 않는다.
   */

  /** 장착·교체 (점유 슬롯 대상 equip = replace) */
  replaceItem(slotIndex: number, id: EquipmentId): EquipmentChangeResult {
    const denial = this.applyEquipmentChange({ kind: 'replace', slotIndex, equipmentId: id });
    return denial === null ? { ok: true } : { ok: false, category: 'condition', reason: denial };
  }

  /** 해제 */
  unequipItem(slotIndex: number): EquipmentChangeResult {
    const denial = this.applyEquipmentChange({ kind: 'unequip', slotIndex });
    return denial === null ? { ok: true } : { ok: false, category: 'condition', reason: denial };
  }

  /* ── 계약 `EquipmentChangeJudgePort` 구현 ──────────────────────────────
   * 판정(evaluate) → 적용(apply) → 스냅샷/복원(snapshot/restore).
   * **저장은 하지 않는다** — 저장·롤백 순서는 리드 `EquipmentTransaction`
   * 소유이며, 이 시스템은 그 틀이 지시하는 대로만 상태를 만진다. throw 금지.
   */

  /**
   * 장착 변경 판정 (무변경) — 불가 사유 5종 중 해당하는 것, 가능하면 null.
   * 공식 장비 4종 밖 id는 런타임에서 거부한다(5번째 금지).
   */
  evaluateEquipmentChange(request: EquipmentChangeRequest): PurchaseDenialReason | null {
    if (request.slotIndex < 0 || request.slotIndex >= this.slotList.length) {
      return 'slotFull';
    }
    if (request.kind === 'unequip') return null;

    if (!(OFFICIAL_EQUIPMENT_IDS as readonly string[]).includes(request.equipmentId)) {
      return 'slotFull'; // 공식 4종 밖 — 장착 대상 자체가 아님
    }
    // 다른 슬롯이 이미 같은 장비를 갖고 있으면 중복 장착
    if (
      this.slotList.some(
        (slot, index) => slot === request.equipmentId && index !== request.slotIndex,
      )
    ) {
      return 'alreadyEquipped';
    }
    // 계약상 `replace`는 '점유 슬롯 대상 equip'이다 — 두 kind는 같은 동작이며
    // 점유 여부로 거부하지 않는다(교체가 정상 경로). 같은 슬롯에 같은 장비를
    // 다시 넣는 것만 무의미하므로 거부한다.
    if (this.slotList[request.slotIndex] === request.equipmentId) return 'alreadyEquipped';
    return null;
  }

  /**
   * 계약 `EquipmentChangeJudgePort` [INT-CORE-010 개정] — **판정+적용 결합**.
   * 불가 시 사유 반환·무변경, 가능 시 적용 후 null. throw 금지, 저장 없음.
   */
  applyEquipmentChange(request: EquipmentChangeRequest): PurchaseDenialReason | null {
    const denial = this.evaluateEquipmentChange(request);
    if (denial !== null) return denial;

    const next = [...this.slotList];
    next[request.slotIndex] = request.kind === 'unequip' ? null : request.equipmentId;
    this.slotList = next;
    // 기지에서 한 번이라도 손대면 로드아웃은 '명시된' 것이다 — 이후 시작
    // 장비 자동 부여는 일어나지 않는다 (전부 해제 상태도 그대로 유지).
    this.loadoutExplicit = true;
    this.normalizeActiveIndex();
    return null;
  }

  /** 롤백용 전체 loadout 스냅샷 */
  snapshotLoadout(): EquipmentLoadout {
    return this.loadout;
  }

  /** 계약 `EquipmentChangeJudgePort` — 빈 슬롯 위치까지 보존하는 스냅샷 */
  snapshotSlots(): readonly (EquipmentId | null)[] {
    return [...this.slotList];
  }

  /** 계약 `EquipmentChangeJudgePort` — 슬롯 위치 그대로 복원 (롤백) */
  restoreSlots(slots: readonly (EquipmentId | null)[]): void {
    this.slotList = slots.map((slot) => slot);
    this.loadoutExplicit = true;
    this.normalizeActiveIndex();
  }

  /**
   * 롤백용 복원 — 스냅샷의 슬롯 수·장착 순서를 그대로 되돌린다.
   * 저장 실패 시 리드 트랜잭션이 호출한다 (이전 loadout 복원).
   */
  restoreLoadout(loadout: EquipmentLoadout): void {
    const capacity = Math.max(1, Math.floor(loadout.slotCapacity));
    const restored = new Array<EquipmentId | null>(capacity).fill(null);
    loadout.equipped.slice(0, capacity).forEach((id, index) => {
      restored[index] = id;
    });
    this.slotList = restored;
    this.loadoutExplicit = true;
    this.normalizeActiveIndex();
  }

  private normalizeActiveIndex(): void {
    if (this.slotList[this.activeIndex] === null) {
      const fallback = this.slotList.findIndex((slot) => slot !== null);
      this.activeIndex = fallback >= 0 ? fallback : 0;
    }
  }

  /** 활성 슬롯 선택 (빈 슬롯이면 false) */
  selectSlot(slotIndex: number): boolean {
    if (slotIndex < 0 || slotIndex >= this.slotList.length) return false;
    if (this.slotList[slotIndex] === null) return false;
    this.activeIndex = slotIndex;
    return true;
  }

  get activeSlotIndex(): number {
    return this.activeIndex;
  }

  get activeEquipment(): EquipmentId | null {
    return this.slotList[this.activeIndex] ?? null;
  }

  /**
   * 업그레이드 보정 주입 — 리드 EffectiveParams 계약의 동등 진입점.
   * 검증된 값만 주입한다 (params 원본은 불변).
   */
  setUpgradeModifiers(modifiers: UpgradeModifiers): void {
    this.modifiers = modifiers;
  }

  get upgradeModifiers(): UpgradeModifiers {
    return this.modifiers;
  }

  /**
   * 활성 어뢰 프로파일 (업그레이드 합연산 반영 최종값).
   * 활성 장비가 디코이·빈 슬롯이면 null — 어뢰 발사 불가 상태.
   */
  activeTorpedoProfile(): TorpedoProfile | null {
    const active = this.activeEquipment;
    if (active === null || active === 'decoy') return null;
    // 성능값은 공식 카탈로그에만 있다 — 미주입이면 발사가 성립하지 않는다
    // (기준값을 발명하지 않는다).
    const performance = this.entryOf(active)?.performance;
    const speed = performance?.['speedMetersPerSecond'];
    const damage = performance?.['damage'];
    if (speed === undefined || damage === undefined) return null;
    return {
      speedMetersPerSecond: speed * (1 + this.modifiers.torpedoSpeedBonus),
      damage: damage * (1 + this.modifiers.torpedoDamageBonus),
    };
  }

  /** 공식 디코이 성능 (미주입이면 null) */
  private get decoyPerformance(): {
    readonly stock: number;
    readonly lifetimeSeconds: number;
    readonly cooldownSeconds: number;
  } | null {
    const performance = this.catalog?.items.find((entry) => entry.id === 'decoy')?.performance;
    const stock = performance?.['stockPerSortie'];
    const lifetimeSeconds = performance?.['lifetimeSeconds'];
    const cooldownSeconds = performance?.['cooldownSeconds'];
    if (stock === undefined || lifetimeSeconds === undefined || cooldownSeconds === undefined) {
      return null;
    }
    return { stock, lifetimeSeconds, cooldownSeconds };
  }

  /** 출항당 디코이 보유 수 재설정 — 공식 카탈로그 주입·재출항 시 */
  refillDecoyStock(): void {
    this.decoyStock = this.decoyPerformance?.stock ?? 0;
    this.decoyCooldown = 0;
    this.decoys = [];
  }

  // ── 디코이 (가짜 음향 표적 — 교란 요청) ────────────────────────────────

  get decoysRemaining(): number {
    return this.decoyStock;
  }

  get decoyCooldownRemainingSeconds(): number {
    return this.decoyCooldown;
  }

  /** 주행 중 디코이 목록 — 적 AI(리드)가 교란 표적으로 소비 */
  get activeDecoys(): readonly DecoySnapshot[] {
    return this.decoys;
  }

  /** 디코이 사출 — 재고·쿨다운 판정. TorpedoSystem.fire()가 위임 호출한다 */
  launchDecoy(x: number, y: number, z: number): boolean {
    const performance = this.decoyPerformance;
    if (performance === null) return false; // 공식 성능 미주입 — 사출 불가
    if (this.decoyStock <= 0 || this.decoyCooldown > 0) return false;
    this.decoyStock -= 1;
    this.decoyCooldown = performance.cooldownSeconds;
    this.decoys.push({
      id: this.nextDecoyId,
      x,
      y,
      z,
      remainingSeconds: performance.lifetimeSeconds,
    });
    this.nextDecoyId += 1;
    return true;
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    if (this.decoyCooldown > 0) {
      this.decoyCooldown = Math.max(0, this.decoyCooldown - deltaSeconds);
    }
    if (this.decoys.length === 0) return;
    const survivors: ActiveDecoy[] = [];
    for (const decoy of this.decoys) {
      decoy.remainingSeconds -= deltaSeconds;
      if (decoy.remainingSeconds > 0) survivors.push(decoy);
    }
    this.decoys = survivors;
  }
}
