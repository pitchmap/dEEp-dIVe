/**
 * 경제 시스템 — 드롭 생성 / 월드 픽업 / 획득 반영 / 세력 반응 / 출항 정산
 * (게임플레이 소유, 회의 11 결의 2·6 — D+4 재화 획득 빌드의 본체).
 *
 * 분리 원칙:
 *  - 드롭 **생성**: 이 시스템이 표적 상태 전이(격침·파괴)를 보고 수행
 *  - 월드 **픽업**: CreditDropField (접근 자동 회수 — '줍는다')
 *  - 획득 **반영**: RunEconomy (크레딧·희귀 부품·정산)
 *
 * 세력 반응 (Faction 태그 — 클래스 복제 없음):
 *  - hostile 파괴 → dropTableId의 크레딧 드롭 생성
 *  - neutral 공격 → 크레딧 없음 + **경비함 출현 요청** 생성 — 경비함 AI는
 *    기존 구축함 AI 재사용(리드 소유), 이 시스템은 요청 데이터만 쌓는다
 *  - patrol(경비) 파괴 → 드롭 없음
 *  - object(해저 재화) 파괴 → 드롭 테이블 크레딧 + (배치된 경우) 희귀 부품
 *
 * 통지 계약: guardSpawnRequested·creditsChanged·rarePartAcquired 정식 이벤트는
 * INT-GAME-008 제안 중 — 그 전까지 읽기 전용 상태·consume API·콜백이 연결점.
 */

import type { Updatable } from '../../contracts/systems';
import { CreditDropField } from './CreditDropField';
import {
  PROVISIONAL_DEFEAT_CREDIT_LOSS_RATIO,
  PROVISIONAL_DROP_TABLES,
  PROVISIONAL_PICKUP_RADIUS_METERS,
} from './provisionalEconomy';
import { RunEconomy, type SortieSettlement } from './RunEconomy';
import { SalvageObject, type SalvageKind } from './SalvageObject';
import type { FactionId, TargetRegistry } from '../TargetRegistry';

/** 경제가 관찰하는 함선 상태의 최소 단면 (CargoShipSystem이 충족) */
export interface ShipEconomyView {
  readonly id: number;
  /** 공식 계약 세력 태그 (contracts/meta.ts) — 경비 세력은 `patrol` */
  readonly faction: FactionId;
  readonly dropTableId?: string;
  readonly hit: boolean;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
}

/** 플레이어 위치 단면 (SubmarinePlayerController가 충족) */
export interface PlayerPositionView {
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
}

/** 경비함 출현 요청 — 구축함 AI(리드)가 소비한다. AI 로직 복제 없음 */
export interface GuardSpawnRequest {
  readonly provokedByTargetId: number;
  readonly x: number;
  readonly z: number;
}

export class EconomySystem implements Updatable {
  readonly wallet = new RunEconomy();
  readonly dropField = new CreditDropField();

  private readonly targets: TargetRegistry;
  private readonly player: PlayerPositionView;
  private readonly ships: () => readonly ShipEconomyView[];

  private readonly processedTargetIds = new Set<number>();
  private guardRequests: GuardSpawnRequest[] = [];
  private salvages: Array<{ object: SalvageObject; unregister: () => void }> = [];
  private nextSalvageId = 9000;

  constructor(
    targets: TargetRegistry,
    player: PlayerPositionView,
    ships: () => readonly ShipEconomyView[],
  ) {
    this.targets = targets;
    this.player = player;
    this.ships = ships;
  }

  /** 대기 중 경비함 출현 요청 (읽기 전용) — AI 파트가 폴링·소비 */
  get guardSpawnRequests(): readonly GuardSpawnRequest[] {
    return this.guardRequests;
  }

  /** 경비함 출현 요청 소비 (AI 파트 전용) — 반환 후 큐가 비워진다 */
  consumeGuardSpawnRequests(): readonly GuardSpawnRequest[] {
    const drained = this.guardRequests;
    this.guardRequests = [];
    return drained;
  }

  /** 배치된 해저 재화 (읽기 전용 — 렌더·레벨 확인용) */
  get salvageObjects(): readonly SalvageObject[] {
    return this.salvages.map((entry) => entry.object);
  }

  /**
   * 해저 재화 배치 ('부순다' 대상) — 어뢰 표적으로 등록된다.
   * rarePartId를 지정하면 파괴 시 희귀 부품 드롭이 함께 생성된다 (결정적).
   */
  spawnSalvage(
    kind: SalvageKind,
    x: number,
    y: number,
    z: number,
    rarePartId: string | null = null,
  ): SalvageObject {
    const object = new SalvageObject(this.nextSalvageId, kind, x, y, z, rarePartId);
    this.nextSalvageId += 1;
    const unregister = this.targets.register(object);
    this.salvages.push({ object, unregister });
    return object;
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

    this.reactToShipHits();
    this.reactToSalvageDestruction();
    this.dropField.collectNear(
      this.player.positionX,
      this.player.positionY,
      this.player.positionZ,
      PROVISIONAL_PICKUP_RADIUS_METERS,
      this.wallet,
    );
  }

  /** 플레이어 파괴 정산 — 손실률은 파라미터(임시값, INT-GAME-008 이관 대기) */
  settleDefeat(): SortieSettlement {
    return this.wallet.settleSortie('defeat', PROVISIONAL_DEFEAT_CREDIT_LOSS_RATIO);
  }

  /** 기지 귀환 정산 — 전액 확정 (저장은 툴링이 이 데이터를 받아 수행) */
  settleReturn(): SortieSettlement {
    return this.wallet.settleSortie('return', 0);
  }

  /**
   * 재출항 세션 초기화 — 월드에 남은 드롭·해저 재화·경비 요청과 표적
   * 처리 이력을 비운다. 지갑(RunEconomy)의 **확정 크레딧·희귀 부품은
   * 영구분이므로 건드리지 않는다** — 미정산 출항 적립분만 정리한다.
   * 회수 통지 구독(조립부 브리지)은 유지한다.
   */
  resetForNewSortie(): void {
    for (const entry of this.salvages) entry.unregister();
    this.salvages = [];
    this.guardRequests = [];
    this.dropField.clear();
    this.processedTargetIds.clear();
    this.wallet.discardUnsettledSortieCredits();
  }

  dispose(): void {
    for (const entry of this.salvages) entry.unregister();
    this.salvages = [];
    this.guardRequests = [];
    this.dropField.clear();
    this.dropField.disposeListeners();
  }

  /** 함선 피격 상태 전이 감시 — 세력별 반응 (1표적 1회) */
  private reactToShipHits(): void {
    for (const ship of this.ships()) {
      if (!ship.hit || this.processedTargetIds.has(ship.id)) continue;
      this.processedTargetIds.add(ship.id);

      if (ship.faction === 'hostile') {
        const table = ship.dropTableId ? PROVISIONAL_DROP_TABLES[ship.dropTableId] : undefined;
        if (table) {
          this.dropField.spawnCredits(
            ship.positionX,
            ship.positionY,
            ship.positionZ,
            table.credits,
            'cargoShip',
          );
        }
      } else if (ship.faction === 'neutral') {
        // 중립 공격 — 크레딧 없음, 경비함 출현 요청 (구축함 AI 재사용은 리드 소유)
        this.guardRequests.push({
          provokedByTargetId: ship.id,
          x: ship.positionX,
          z: ship.positionZ,
        });
      }
      // guard 파괴 — 드롭·반응 없음
    }
  }

  /** 해저 재화 파괴 감시 — 드롭 생성 후 표적 등록 해제 */
  private reactToSalvageDestruction(): void {
    if (this.salvages.length === 0) return;
    const survivors: Array<{ object: SalvageObject; unregister: () => void }> = [];
    for (const entry of this.salvages) {
      if (!entry.object.destroyed) {
        survivors.push(entry);
        continue;
      }
      entry.unregister();
      // 해저 재화(chest/container/mineral)의 공식 출처 태그 — 난파선 인양은
      // 별도 배치가 도입될 때 'wreckSalvage'로 구분한다 (계약 LootSource).
      const salvageSource = 'seabedCache' as const;
      const table = PROVISIONAL_DROP_TABLES[entry.object.dropTableId];
      if (table) {
        this.dropField.spawnCredits(
          entry.object.positionX,
          entry.object.positionY,
          entry.object.positionZ,
          table.credits,
          salvageSource,
        );
      }
      if (entry.object.rarePartId) {
        this.dropField.spawnRarePart(
          entry.object.positionX,
          entry.object.positionY,
          entry.object.positionZ,
          entry.object.rarePartId,
          salvageSource,
        );
      }
    }
    this.salvages = survivors;
  }
}
