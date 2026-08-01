/**
 * 월드 드롭 필드 — 드롭 **생성**과 **픽업 판정**을 담당한다 (획득 반영은
 * RunEconomy 소유 — 생성/픽업/획득 3단 분리, 회의 11 안건 6).
 *
 * 픽업 = '줍는다' 동사: 플레이어가 회수 반경 안에 들어오면 자동 회수
 * (난파선 자동 회수·희귀 부품 픽업 공용 경로). 별도 상호작용 UI 없음.
 */

import type { LootSource } from '../../contracts/meta';
import type { RunEconomy } from './RunEconomy';

export type WorldDropKind = 'credits' | 'rarePart';

export interface WorldDrop {
  readonly id: number;
  readonly kind: WorldDropKind;
  /**
   * 드롭 출처 — 공식 계약 `LootSource`(contracts/meta.ts). 회수 시점의
   * `lootDropped` 이벤트 payload를 계약대로 채우기 위해 생성 시점에
   * 기록한다 (PvE 1차 통합 — 회수 후에는 출처를 되찾을 수 없다).
   */
  readonly source: LootSource;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** kind === 'credits'일 때 획득량 */
  readonly amount: number;
  /** kind === 'rarePart'일 때 부품 식별자 */
  readonly partId?: string;
}

export class CreditDropField {
  private nextId = 1;
  private items: WorldDrop[] = [];
  private collectListeners = new Set<(drop: WorldDrop) => void>();

  /**
   * 회수 통지 구독 — 조립점이 `lootDropped`(공식 계약 이벤트)를 발행하는
   * 연결점이다. 경제 시스템은 이벤트를 직접 발행하지 않는다(파트 경계 유지).
   * 반환값은 구독 해제 함수.
   */
  onCollected(listener: (drop: WorldDrop) => void): () => void {
    this.collectListeners.add(listener);
    return () => this.collectListeners.delete(listener);
  }

  /** 월드에 떠 있는 드롭 (렌더·미니맵 소비용 읽기 전용) */
  get drops(): readonly WorldDrop[] {
    return this.items;
  }

  spawnCredits(x: number, y: number, z: number, amount: number, source: LootSource): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.items.push({ id: this.nextId, kind: 'credits', source, x, y, z, amount });
    this.nextId += 1;
  }

  spawnRarePart(x: number, y: number, z: number, partId: string, source: LootSource): void {
    this.items.push({ id: this.nextId, kind: 'rarePart', source, x, y, z, amount: 0, partId });
    this.nextId += 1;
  }

  /**
   * 픽업 판정 — 플레이어 3D 거리 ≤ 회수 반경이면 회수하고 RunEconomy에
   * 반영한다. 반환 = 이번 프레임 회수 수 (등록 순서 고정 — 결정적).
   */
  collectNear(
    playerX: number,
    playerY: number,
    playerZ: number,
    pickupRadius: number,
    economy: RunEconomy,
  ): number {
    if (this.items.length === 0) return 0;

    let collected = 0;
    const remainder: WorldDrop[] = [];
    for (const drop of this.items) {
      const distance = Math.hypot(drop.x - playerX, drop.y - playerY, drop.z - playerZ);
      if (distance > pickupRadius) {
        remainder.push(drop);
        continue;
      }
      if (drop.kind === 'credits') economy.addCredits(drop.amount);
      else if (drop.partId) economy.acquireRarePart(drop.partId);
      collected += 1;
      for (const listener of [...this.collectListeners]) listener(drop);
    }
    this.items = remainder;
    return collected;
  }

  clear(): void {
    this.items = [];
  }

  /** 구독 정리 — 세션 종료·조립 해제 시 */
  disposeListeners(): void {
    this.collectListeners.clear();
  }
}
