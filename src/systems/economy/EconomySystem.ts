/**
 * 경제 시스템 — 드롭 생성 / 월드 픽업 / 획득 반영 / 세력 반응 / 출항 정산
 * (게임플레이 소유, 회의 11 결의 2·6 — D+4 재화 획득 빌드의 본체).
 *
 * 분리 원칙:
 *  - 드롭 **생성**: 이 시스템이 표적 상태 전이(격침·파괴)를 보고 수행
 *  - 월드 **픽업**: CreditDropField (접근 자동 회수 — '줍는다')
 *  - 획득 **반영**: RunEconomy (크레딧·희귀 부품·정산)
 *
 * 세력별 보상 (Faction 태그 — 클래스 복제 없음. 판단 근거는 계약 규칙표
 * `rewardDropTableIdFor` 하나뿐이며 시스템 내부 세력 분기가 없다 — B3):
 *  - hostile 파괴 → 공식 적대 드롭 테이블의 크레딧 드롭 생성
 *  - neutral 파괴 → **보상 0** (드롭 엔티티 0·크레딧 0·희귀 0, 지갑 불변)
 *  - patrol(경비) 파괴 → 공식 params가 없으므로 보상 0 (수치 발명 금지)
 *  - object(해저 재화) 파괴 → 드롭 테이블 크레딧 + (배치된 경우) 희귀 부품
 *
 * 중립 사건(경비함 요청)은 이 시스템의 책임이 아니다 — 유효 피해 지점에서
 * 발행되는 `neutralShipHit`가 정본이다 (B4). 레거시 큐는 비어 있다.
 *
 * **정산은 이 시스템의 책임이 아니다** [스프린트 C]: 출항 정산 정본은
 * `MetaLoop.settleSortie` 하나이며, 병행 경로였던 `settleDefeat`·
 * `settleReturn`(그리고 `RunEconomy.settleSortie`)은 **삭제**됐다.
 * 이 시스템은 드롭 생성·회수까지만 하고 지갑 확정에 관여하지 않는다.
 *
 * 통지 계약: guardSpawnRequested·creditsChanged·rarePartAcquired 정식 이벤트는
 * INT-GAME-008 제안 중 — 그 전까지 읽기 전용 상태·consume API·콜백이 연결점.
 *
 * 경제 수치 [INT-CORE-011 — 공식 params production 소비]:
 *  - 드롭 테이블·픽업 반경·손실률은 **주입**받는다 (`attachEconomyParams`).
 *    이 시스템은 JSON을 읽지 않고 툴링 로더를 호출하지 않으며, 내부에
 *    경제 상수를 두지 않는다. provisional 모듈 소비는 제거됐다.
 *  - 미주입(unwired) 상태에서는 **임시 수치를 만들지 않는다**: 드롭 테이블이
 *    비어 드롭이 생성되지 않고, 픽업 반경 0, 손실률 0(손실을 발명하지 않음)
 *    으로 동작하며 `economyParamsWired`가 false로 드러난다.
 */

import { rewardDropTableIdFor } from '../../contracts/faction';
import type { SalvageSpawnPlanEntry } from '../../contracts/officialParams';
import type { Updatable } from '../../contracts/systems';
import { CreditDropField } from './CreditDropField';
import type { EconomyRuntimeParams } from './officialEconomyCatalog';
import { RunEconomy } from './RunEconomy';
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

/**
 * 해저 재화 spawn 요청 결과 — production spawn 규칙(INT-CORE-011)의
 * 게임플레이 측 판정. 거부 시 **아무것도 생성하지 않는다**.
 */
export type SalvageSpawnOutcome =
  | { readonly status: 'spawned'; readonly object: SalvageObject }
  /** 같은 출항에서 이미 처리된 spawnId — 파괴·회수분 재생성도 여기에 걸린다 */
  | { readonly status: 'duplicateSpawnId'; readonly spawnId: string }
  /** 경제 params 미주입 — 보상을 발명하지 않는다 */
  | { readonly status: 'unwired' };

interface SalvageRecord {
  readonly object: SalvageObject;
  readonly unregister: () => void;
  /** 결합 plan이 준 확정 보상 (경제 params 파생). null = 드롭 테이블 조회 */
  readonly credits: number | null;
}

export class EconomySystem implements Updatable {
  readonly wallet = new RunEconomy();
  readonly dropField = new CreditDropField();

  private readonly targets: TargetRegistry;
  private readonly player: PlayerPositionView;
  private readonly ships: () => readonly ShipEconomyView[];

  private readonly processedTargetIds = new Set<number>();
  private guardRequests: GuardSpawnRequest[] = [];
  private salvages: SalvageRecord[] = [];
  private nextSalvageId = 9000;

  /** 공식 경제 수치 — 조립부 주입 전에는 null (임시값 생성 없음) */
  private params: EconomyRuntimeParams | null = null;
  /** 이번 출항에서 이미 처리한 spawnId — 새 출항에서만 비워진다 */
  private readonly spawnedSpawnIds = new Set<string>();

  constructor(
    targets: TargetRegistry,
    player: PlayerPositionView,
    ships: () => readonly ShipEconomyView[],
    /** 공식 경제 수치 (INT-CORE-011) — 조립부가 `official.economy`를 넘긴다 */
    params: EconomyRuntimeParams | null = null,
  ) {
    this.targets = targets;
    this.player = player;
    this.ships = ships;
    this.params = params;
  }

  /**
   * 공식 경제 수치 주입 (조립부 전용 — params 핫리로드 시 재호출 가능).
   * 주입 객체는 읽기만 한다 (역기록 없음).
   */
  attachEconomyParams(params: EconomyRuntimeParams): void {
    this.params = params;
  }

  /** 공식 경제 수치 배선 여부 — false면 드롭·픽업·손실이 전부 무효과 */
  get economyParamsWired(): boolean {
    return this.params !== null;
  }

  /**
   * 주입된 드롭 자동 회수 반경 (m, 미주입 = 0 — 회수 없음).
   * 이 시스템이 실제 판정에 쓰는 값이며, 렌더의 회수 범위 피드백도 같은
   * getter를 소비한다 — 렌더가 반경을 자체 정의하지 않는다 (INT-RENDER-010 §5).
   * 값의 출처는 공식 `params/economy.json` 하나뿐이다 (INT-CORE-011).
   */
  get pickupRadiusMeters(): number {
    return this.params?.pickupRadiusMeters ?? 0;
  }

  /** 주입된 파괴 손실률 (미주입 = 0 — 손실을 발명하지 않는다) */
  get creditLossOnDestroyedRatio(): number {
    return this.params?.creditLossOnDestroyedRatio ?? 0;
  }

  /**
   * 대기 중 경비함 출현 요청 (읽기 전용). B4 이행 후 **항상 빈 배열**이다 —
   * 아래 `consumeGuardSpawnRequests` 주석 참조.
   */
  get guardSpawnRequests(): readonly GuardSpawnRequest[] {
    return this.guardRequests;
  }

  /**
   * 경비함 출현 요청 소비 (레거시 큐 — **B4 이행 후 항상 비어 있다**).
   *
   * 중립 사건의 정본 경로는 유효 피해 지점의 `neutralShipHit` → composition
   * 중복 방지 경계(`GuardIncidentLedger`) → `guardShipRequested`다. 이
   * 큐에 요청을 넣는 코드는 제거됐으므로 `legacy:<targetId>` 상관 id는
   * production에서 만들어지지 않는다 — 같은 사건이 두 경로로 처리되는 일이
   * 없다. 메서드 자체는 리드 `SortieEconomyPort` 계약이 요구하므로 남긴다
   * (제거 요청: INTEGRATION_NOTES INT-GAME-012).
   */
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
    return this.createSalvage(kind, x, y, z, rarePartId, null);
  }

  /**
   * production 결합 plan 기반 배치 [INT-CORE-011] — **spawnId가 키**다.
   *
   * 보상(credits·rarePartId)은 경제 params에서, 좌표는 SalvagePlacementSource
   * 에서 온 값이며 이 시스템은 둘 다 만들지 않는다. 규칙:
   *  - 같은 출항에서 같은 spawnId 두 번째 요청은 **거부**(`duplicateSpawnId`)
   *    — 파괴·회수된 salvage의 재생성도 같은 경로로 막힌다.
   *  - 경제 params 미주입이면 `unwired` (보상 발명 금지).
   *  - 새 출항 리셋(`resetForNewSortie`)에서만 spawnId 기록이 비워진다 —
   *    그때 전체 배치가 다시 1회 생성된다.
   */
  spawnSalvageFromPlan(entry: SalvageSpawnPlanEntry): SalvageSpawnOutcome {
    if (this.params === null) return { status: 'unwired' };
    if (this.spawnedSpawnIds.has(entry.spawnId)) {
      return { status: 'duplicateSpawnId', spawnId: entry.spawnId };
    }
    this.spawnedSpawnIds.add(entry.spawnId);
    const object = this.createSalvage(
      entry.kind,
      entry.worldPosition.x,
      entry.worldPosition.y,
      entry.worldPosition.z,
      entry.rarePartId,
      entry.credits,
    );
    return { status: 'spawned', object };
  }

  /** 이번 출항에서 이미 배치된 spawnId 목록 (읽기 전용 — 검증·디버깅용) */
  get spawnedSalvageIds(): readonly string[] {
    return [...this.spawnedSpawnIds];
  }

  private createSalvage(
    kind: SalvageKind,
    x: number,
    y: number,
    z: number,
    rarePartId: string | null,
    credits: number | null,
  ): SalvageObject {
    const object = new SalvageObject(this.nextSalvageId, kind, x, y, z, rarePartId);
    this.nextSalvageId += 1;
    const unregister = this.targets.register(object);
    this.salvages.push({ object, unregister, credits });
    return object;
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

    this.reactToShipHits();
    this.reactToSalvageDestruction();
    if (this.params === null) return; // 픽업 반경 미주입 — 회수 판정 없음
    this.dropField.collectNear(
      this.player.positionX,
      this.player.positionY,
      this.player.positionZ,
      this.params.pickupRadiusMeters,
      this.wallet,
    );
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
    // 새 출항에서만 spawnId 기록을 비운다 — 같은 출항 중 재생성 금지 규칙의
    // 유일한 해제 지점 (INT-CORE-011 production spawn 규칙).
    this.spawnedSpawnIds.clear();
    this.wallet.discardUnsettledSortieCredits();
  }

  dispose(): void {
    for (const entry of this.salvages) entry.unregister();
    this.salvages = [];
    this.guardRequests = [];
    this.dropField.clear();
    this.dropField.disposeListeners();
  }

  /**
   * 함선 피격 상태 전이 감시 — **세력별 보상 결정** (1표적 1회, B3).
   *
   * 보상 여부의 판단 근거는 계약 규칙표 `rewardDropTableIdFor` 하나다
   * (문자열 세력 비교·시스템 내부 분기 없음):
   *  - hostile → 공식 적대 드롭 테이블 → 주입된 dropTables에서 크레딧 조회
   *  - neutral → `null` → **드롭 엔티티 0·크레딧 0·희귀 0** (지갑 불변)
   *  - patrol  → `null` → 공식 params가 없으므로 보상 없음 (발명 금지)
   *
   * 지갑은 여기서 직접 건드리지 않는다 — 드롭을 만들고, 회수(픽업)만이
   * 지갑을 바꾼다. 중립 파괴는 드롭 자체가 생기지 않으므로 회수도 없다.
   * 평판·도덕성·벌금은 스프린트 B 범위 밖이며 도입하지 않는다.
   *
   * 중립 사건(경비함 요청)은 **여기서 만들지 않는다** — 유효 피해 지점에서
   * 발행되는 `neutralShipHit`가 정본 경로다 (B4 이행 완료). 이 시스템은
   * 파괴 상태만 보므로 '유효 피해'를 판정할 수 없다.
   */
  private reactToShipHits(): void {
    for (const ship of this.ships()) {
      if (!ship.hit || this.processedTargetIds.has(ship.id)) continue;
      this.processedTargetIds.add(ship.id);

      const rewardTableId = rewardDropTableIdFor(ship.faction);
      if (rewardTableId === null) continue; // 중립·경비 — 보상 없음
      const table = this.params?.dropTables[rewardTableId];
      if (!table) continue; // 공식 표에 없는 참조 — 수치를 만들지 않는다

      this.dropField.spawnCredits(
        ship.positionX,
        ship.positionY,
        ship.positionZ,
        table.credits,
        'cargoShip',
      );
    }
  }

  /** 해저 재화 파괴 감시 — 드롭 생성 후 표적 등록 해제 */
  private reactToSalvageDestruction(): void {
    if (this.salvages.length === 0) return;
    const survivors: SalvageRecord[] = [];
    for (const entry of this.salvages) {
      if (!entry.object.destroyed) {
        survivors.push(entry);
        continue;
      }
      entry.unregister();
      // 해저 재화(chest/container/mineral)의 공식 출처 태그 — 난파선 인양은
      // 별도 배치가 도입될 때 'wreckSalvage'로 구분한다 (계약 LootSource).
      const salvageSource = 'seabedCache' as const;
      // 결합 plan으로 배치된 것은 plan의 확정 보상을, 그 외에는 주입된
      // 드롭 테이블을 쓴다. 어느 쪽이든 출처는 경제 params 하나뿐이다.
      const credits =
        entry.credits ?? this.params?.dropTables[entry.object.dropTableId]?.credits ?? null;
      if (credits !== null) {
        this.dropField.spawnCredits(
          entry.object.positionX,
          entry.object.positionY,
          entry.object.positionZ,
          credits,
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
