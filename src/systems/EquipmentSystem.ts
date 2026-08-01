/**
 * 장비 시스템 — MVP 장비 정확히 4종 (6차 신 스코프 가드).
 *
 *   기본 어뢰 / 고속 어뢰(속력↑ 피해↓) / 중어뢰(속력↓ 피해↑) / 디코이
 *
 * 규칙:
 *  - 장비 간 상위호환 없음 — 수치는 provisionalEquipment.ts (params 이관 대기).
 *  - **슬롯 제한**: 출항 장착은 슬롯 수(임시 2) 이내. 같은 장비 중복 장착 금지.
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

import type { Updatable } from '../contracts/systems';
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
  private readonly slotList: Array<EquipmentId | null>;
  private activeIndex = 0;
  private modifiers: UpgradeModifiers = ZERO_MODIFIERS;

  private decoyStock = PROVISIONAL_DECOY.stock;
  private decoyCooldown = 0;
  private nextDecoyId = 1;
  private decoys: ActiveDecoy[] = [];

  constructor(initialSlots: readonly EquipmentId[] = ['standardTorpedo']) {
    this.slotList = new Array<EquipmentId | null>(PROVISIONAL_EQUIPMENT_SLOTS).fill(null);
    initialSlots.slice(0, PROVISIONAL_EQUIPMENT_SLOTS).forEach((id, index) => {
      this.slotList[index] = id;
    });
  }

  /** 장착 슬롯 (읽기 전용 뷰) — 길이 = 슬롯 제한 */
  get slots(): readonly (EquipmentId | null)[] {
    return this.slotList;
  }

  get slotCount(): number {
    return this.slotList.length;
  }

  /** 슬롯에 장비 장착. 범위 밖·중복 장착이면 false (슬롯 제한 강제) */
  equip(slotIndex: number, id: EquipmentId): boolean {
    if (slotIndex < 0 || slotIndex >= this.slotList.length) return false;
    if (this.slotList.some((slot, index) => slot === id && index !== slotIndex)) return false;
    this.slotList[slotIndex] = id;
    return true;
  }

  unequip(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= this.slotList.length) return;
    this.slotList[slotIndex] = null;
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
