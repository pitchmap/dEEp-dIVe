/**
 * 장비 시스템 — MVP 장비 정확히 4종 (6차 신 스코프 가드).
 *
 *   기본 어뢰 / 고속 어뢰(속력↑ 피해↓) / 중어뢰(속력↓ 피해↑) / 디코이
 *
 * 규칙:
 *  - 장비 간 상위호환 없음. **성능 수치(속력·피해·디코이 지속)는 게임플레이
 *    소유 R7 선진행분**(provisionalEquipment)이다 — 공식 `params/equipment.json`
 *    이 스스로 "성능은 게임플레이 소유, 이 파일은 가격·슬롯만" 이라고 명시한다.
 *    **가격·슬롯 규칙은 공식 카탈로그에서만** 온다(officialEconomyCatalog).
 *  - **슬롯 제한**: 공식 `slotCapacity`가 확정되면 그 값을 쓰고, 미확정(null)
 *    이면 현재 구조 기본값을 유지한다 — 가격과 달리 슬롯은 전투 구동에 필요한
 *    구조 값이므로 게임을 멈추지 않는다(임의 '경제' 수치 대입 아님).
 *  - 장착 변경은 계약 `EquipmentChangeJudgePort`로 판정·적용·복원만 한다 —
 *    **저장은 리드 `EquipmentTransaction` 소유**이며 이 시스템은 저장소에
 *    접근하지 않는다 (스프린트 A 정규화).
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
import { OFFICIAL_EQUIPMENT_IDS, type EquipmentCatalog } from './economy/officialEconomyCatalog';
import {
  PROVISIONAL_DECOY,
  PROVISIONAL_EQUIPMENT_SLOTS,
  PROVISIONAL_FAST_TORPEDO,
  PROVISIONAL_HEAVY_TORPEDO,
  PROVISIONAL_STANDARD_TORPEDO,
} from './provisionalEquipment';

/** MVP 장비 식별자 — 정확히 4종, 확장 금지 (신 스코프 가드) */
export type EquipmentId = 'standardTorpedo' | 'fastTorpedo' | 'heavyTorpedo' | 'decoy';

/** 어뢰형 장비의 발사 프로파일 (업그레이드 배율 적용 전 기준값) */
export interface TorpedoProfile {
  readonly speedMetersPerSecond: number;
  readonly damage: number;
}

/**
 * 업그레이드 합연산 보정 (리드 EffectiveParams 계약의 동등 인터페이스).
 * 값은 비율 합 — 예: +0.1 두 개 = +0.2 (곱연산 금지, 회의 11 결의 4).
 */
export interface UpgradeModifiers {
  readonly torpedoSpeedBonus: number;
  readonly torpedoDamageBonus: number;
}

const ZERO_MODIFIERS: UpgradeModifiers = { torpedoSpeedBonus: 0, torpedoDamageBonus: 0 };

const TORPEDO_PROFILES: Record<Exclude<EquipmentId, 'decoy'>, TorpedoProfile> = {
  standardTorpedo: {
    speedMetersPerSecond: PROVISIONAL_STANDARD_TORPEDO.speedMetersPerSecond,
    damage: PROVISIONAL_STANDARD_TORPEDO.damage,
  },
  fastTorpedo: {
    speedMetersPerSecond: PROVISIONAL_FAST_TORPEDO.speedMetersPerSecond,
    damage: PROVISIONAL_FAST_TORPEDO.damage,
  },
  heavyTorpedo: {
    speedMetersPerSecond: PROVISIONAL_HEAVY_TORPEDO.speedMetersPerSecond,
    damage: PROVISIONAL_HEAVY_TORPEDO.damage,
  },
};

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

  private decoyStock = PROVISIONAL_DECOY.stock;
  private decoyCooldown = 0;
  private nextDecoyId = 1;
  private decoys: ActiveDecoy[] = [];

  /** 공식 장비 카탈로그 (가격·슬롯) — 미주입 시 구조 기본값으로 동작 */
  private catalog: EquipmentCatalog | null = null;

  constructor(initialSlots: readonly EquipmentId[] = ['standardTorpedo']) {
    this.slotList = new Array<EquipmentId | null>(PROVISIONAL_EQUIPMENT_SLOTS).fill(null);
    initialSlots.slice(0, PROVISIONAL_EQUIPMENT_SLOTS).forEach((id, index) => {
      this.slotList[index] = id;
    });
  }

  /**
   * 공식 장비 카탈로그 적용 — 슬롯 수가 **확정된 경우에만** 반영한다.
   * `slotCapacity`가 null(기획 수치표 미도착)이면 현재 구조 기본값을 유지하며,
   * 임의의 경제 값을 만들지 않는다. 축소 시 초과 슬롯의 장비는 해제된다.
   */
  applyCatalog(catalog: EquipmentCatalog): void {
    this.catalog = catalog;
    const capacity = catalog.slotCapacity;
    if (capacity === null || !Number.isFinite(capacity) || capacity <= 0) return;

    const next = Math.floor(capacity);
    const resized = new Array<EquipmentId | null>(next).fill(null);
    for (let index = 0; index < Math.min(next, this.slotList.length); index += 1) {
      resized[index] = this.slotList[index] ?? null;
    }
    this.slotList = resized;
    if (this.activeIndex >= next) this.activeIndex = 0;
  }

  /** 공식 카탈로그 (읽기 전용) — 기지 UI가 장비 목록·가격을 그릴 때 소비 */
  get equipmentCatalog(): EquipmentCatalog | null {
    return this.catalog;
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
    const request: EquipmentChangeRequest = { kind: 'equip', slotIndex, equipmentId: id };
    if (this.evaluateEquipmentChange(request) !== null) return false;
    this.applyEquipmentChange(request);
    return true;
  }

  /** 해제 (단순 경로) — 계약 경로의 얇은 래퍼 */
  unequip(slotIndex: number): void {
    this.applyEquipmentChange({ kind: 'unequip', slotIndex });
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
      return 'noFreeSlot';
    }
    if (request.kind === 'unequip') return null;

    if (!(OFFICIAL_EQUIPMENT_IDS as readonly string[]).includes(request.equipmentId)) {
      return 'noFreeSlot'; // 공식 4종 밖 — 장착 대상 자체가 아님
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

  /** 판정을 통과한 변경 적용 (리드 트랜잭션만 호출) */
  applyEquipmentChange(request: EquipmentChangeRequest): void {
    if (request.slotIndex < 0 || request.slotIndex >= this.slotList.length) return;
    const next = [...this.slotList];
    next[request.slotIndex] = request.kind === 'unequip' ? null : request.equipmentId;
    this.slotList = next;
    if (this.slotList[this.activeIndex] === null) {
      const fallback = this.slotList.findIndex((slot) => slot !== null);
      this.activeIndex = fallback >= 0 ? fallback : 0;
    }
  }

  /** 롤백용 전체 loadout 스냅샷 */
  snapshotLoadout(): EquipmentLoadout {
    return this.loadout;
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
    const base = TORPEDO_PROFILES[active];
    return {
      speedMetersPerSecond:
        base.speedMetersPerSecond * (1 + this.modifiers.torpedoSpeedBonus),
      damage: base.damage * (1 + this.modifiers.torpedoDamageBonus),
    };
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
    if (this.decoyStock <= 0 || this.decoyCooldown > 0) return false;
    this.decoyStock -= 1;
    this.decoyCooldown = PROVISIONAL_DECOY.cooldownSeconds;
    this.decoys.push({
      id: this.nextDecoyId,
      x,
      y,
      z,
      remainingSeconds: PROVISIONAL_DECOY.lifetimeSeconds,
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
