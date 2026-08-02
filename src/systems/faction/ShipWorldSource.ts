/**
 * 다중 선박 read source — 렌더가 소비하는 **읽기 전용 스냅샷** (B 렌더 배선).
 *
 * ## 왜 필요한가
 *
 * 기존 렌더 배선(`attachCargoShipSource`)은 적대 화물선 **1척**만 받는다.
 * B1(적대+중립)과 B5(경비함 스폰)로 월드에 선박이 3종류가 되므로, 세 종류를
 * 한 목록으로 넘기는 소스가 필요하다.
 *
 * ## 읽기 전용 보장
 *
 * 반환값은 **평면 스냅샷**이다 — 게임플레이 객체 참조를 넘기지 않으므로
 * 렌더가 위치·생존 상태를 바꿀 수 없다. 세력은 공식 `FactionId` 값으로
 * 전달되며, 렌더는 모델 이름·클래스명으로 세력을 추측하지 않는다.
 * 문구·색·메시는 계약에 없다 — `visualArchetype`은 원형 **키**다.
 */

import type { FactionId } from '../../contracts/faction';

/** 렌더 원형 키 — 표현은 그래픽스 소유 */
export type ShipVisualArchetype = 'ship.cargo' | 'ship.patrol';

/** 선박 1척의 읽기 전용 단면 */
export interface ShipWorldView {
  readonly entityId: number;
  readonly faction: FactionId;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly headingRadians: number;
  readonly alive: boolean;
  readonly targetable: boolean;
  readonly visualArchetype: string;
  /** 침몰 진행 0→1 (해당 없는 개체는 0) — 렌더 연출 매핑용 */
  readonly sinkProgress: number;
  /** 고가치 수송선인가 (B6 — 해당 없으면 false) */
  readonly highValue: boolean;
  /** 호위 중인 수송선 엔티티 id (B6 — 없으면 null) */
  readonly escortedTransportId: number | null;
}

/** 렌더·UI가 주입받는 소스 — composition root가 연결한다 */
export interface ShipWorldSource {
  readonly shipViews: readonly ShipWorldView[];
}

/** 화물선(적대·중립)의 최소 단면 — `CargoShipSystem`이 충족 */
export interface CargoShipWorldView {
  readonly id: number;
  readonly faction: FactionId;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly headingRadians: number;
  readonly hit: boolean;
  readonly removed: boolean;
  readonly sinkProgress: number;
}

/** 경비함의 최소 단면 — `PatrolShipEntity`가 충족 */
export interface PatrolShipWorldView {
  readonly entityId: number;
  readonly faction: FactionId;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly headingRadians: number;
  readonly alive: boolean;
  readonly targetable: boolean;
  readonly visualArchetype: string;
}

/** B6 부가 정보 조회 — 없으면 전부 false/null (핵심 경로는 이걸 모른다) */
export interface ShipEscortMetadataSource {
  isHighValue(entityId: number): boolean;
  escortedTransportIdOf(entityId: number): number | null;
}

/**
 * 세 종류 선박을 한 목록으로 합치는 소스.
 * 게임플레이 시스템을 직접 참조하지 않고 최소 단면만 받는다.
 */
export class CombinedShipWorldSource implements ShipWorldSource {
  private readonly cargoShips: () => readonly CargoShipWorldView[];
  private readonly patrolShips: () => readonly PatrolShipWorldView[];
  private escortMetadata: ShipEscortMetadataSource | null;

  constructor(
    cargoShips: () => readonly CargoShipWorldView[],
    patrolShips: () => readonly PatrolShipWorldView[],
    escortMetadata: ShipEscortMetadataSource | null = null,
  ) {
    this.cargoShips = cargoShips;
    this.patrolShips = patrolShips;
    this.escortMetadata = escortMetadata;
  }

  /** B6 부가 정보 연결 (선택) — 없으면 highValue/escort가 항상 비어 있다 */
  attachEscortMetadata(metadata: ShipEscortMetadataSource | null): void {
    this.escortMetadata = metadata;
  }

  get shipViews(): readonly ShipWorldView[] {
    const views: ShipWorldView[] = [];
    for (const ship of this.cargoShips()) {
      views.push({
        entityId: ship.id,
        faction: ship.faction,
        positionX: ship.positionX,
        positionY: ship.positionY,
        positionZ: ship.positionZ,
        headingRadians: ship.headingRadians,
        alive: !ship.removed && !ship.hit,
        targetable: !ship.removed && !ship.hit,
        visualArchetype: 'ship.cargo',
        sinkProgress: ship.sinkProgress,
        highValue: this.escortMetadata?.isHighValue(ship.id) ?? false,
        escortedTransportId: this.escortMetadata?.escortedTransportIdOf(ship.id) ?? null,
      });
    }
    for (const ship of this.patrolShips()) {
      views.push({
        entityId: ship.entityId,
        faction: ship.faction,
        positionX: ship.positionX,
        positionY: ship.positionY,
        positionZ: ship.positionZ,
        headingRadians: ship.headingRadians,
        alive: ship.alive,
        targetable: ship.targetable,
        visualArchetype: ship.visualArchetype,
        sinkProgress: 0, // 경비함 침몰 연출은 도입되지 않았다 (수치 발명 금지)
        highValue: this.escortMetadata?.isHighValue(ship.entityId) ?? false,
        escortedTransportId: this.escortMetadata?.escortedTransportIdOf(ship.entityId) ?? null,
      });
    }
    return views;
  }
}
