/**
 * 선박 식별 read model 제공 — 계약 `ShipIdentificationSource` 구현 (B2).
 *
 * ## 판정은 여기, 표현은 그래픽스
 *
 * 이 시스템은 **세력이 확정됐는지**와 **태그를 그릴 수 있는 상태인지**만
 * 판정한다. 문구·색·아이콘·실루엣은 계약에도 여기에도 없다 —
 * `displayLabelId`는 라벨 **키**이며 그래픽스가 문구를 정한다.
 *
 * 미식별 동안 `displayLabelId`는 `null`이다. 그래픽스가 모델명·클래스명으로
 * 세력을 추측할 필요가 없도록, 세력 판정 결과를 이 모델 하나로만 넘긴다.
 *
 * ## 식별 조건 — 새 수치를 만들지 않는다
 *
 * 공식 params에 **식별 거리·식별 시간 항목이 없다**(`params/detection.json`은
 * 탐지 게이지·심도 보정·침묵 항행뿐이고, `aiming.json`은 각도·감도뿐이다).
 * 임의의 식별 거리를 발명하는 대신 **이미 존재하는 판정 범위**를 재사용한다:
 *
 *  - 거리 조건 = 어뢰 **유효 사거리 이내** (`TorpedoRangeSource` 주입).
 *    "공격 판정이 성립하는 거리 = 식별 판단이 필요한 거리"라는 기존 경계를
 *    그대로 쓴다. 새 상수를 만들지 않으며, 값의 출처는 어뢰 시스템 하나다.
 *  - 조준 조건 = 조준경 진입 상태 (`AimStateSource` 주입). 스프린트 A에서
 *    조준은 **전 심도**에서 가능하므로 심도 조건은 없다 (폐기 규칙 미부활).
 *
 * 공식 식별 params(거리·소요 시간 등)가 도착하면 `attachIdentificationParams`
 * 로 교체한다 — 소비 코드는 바뀌지 않는다. 요청: INT-GAME-012.
 *
 * ## 하지 않는 것
 *
 * 탐지 게이지·추적 상태 머신·식별 진행도 누적(스프린트 C 범위)을 만들지
 * 않는다. 식별은 **조건 충족 여부**의 즉시 판정이다.
 */

import { factionRule } from '../../contracts/faction';
import type {
  IdentificationState,
  ShipIdentificationSource,
  ShipIdentificationView,
} from '../../contracts/identification';
import type { FactionId } from '../TargetRegistry';

/** 식별 대상 선박의 최소 단면 (CargoShipSystem이 그대로 충족) */
export interface IdentifiableShipView {
  readonly id: number;
  readonly faction: FactionId;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  /** 피격됨 — 격침 진행 중 */
  readonly hit: boolean;
  /** 월드에서 제거됨 */
  readonly removed: boolean;
}

/** 관측자(잠수함) 위치 단면 */
export interface ObserverPositionView {
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
}

/** 조준 상태 단면 — `SubmarineAimSystem`이 충족 */
export interface AimStateSource {
  readonly aiming: boolean;
}

/** 유효 사거리 공급 단면 — 어뢰 시스템이 충족 (여기서 거리를 정의하지 않는다) */
export interface TorpedoRangeSource {
  readonly maxRangeMeters: number;
}

/**
 * 공식 식별 params가 도착하면 주입될 자리 (현재 공식 값 없음 — null 유지).
 * `null`인 동안에는 위 '기존 판정 범위 재사용' 규칙이 적용된다.
 */
export interface IdentificationParams {
  /** 세력이 확정되는 최대 거리 (m) */
  readonly identificationRangeMeters: number;
  /** 태그를 그릴 수 있는 최대 거리 (m) */
  readonly tagDisplayRangeMeters: number;
}

export class ShipIdentificationSystem implements ShipIdentificationSource {
  // 검증 러너(run.mjs) Node 타입 스트리핑 호환 — 매개변수 프로퍼티 미사용
  private readonly ships: () => readonly IdentifiableShipView[];
  private readonly observer: ObserverPositionView;
  private readonly aim: AimStateSource;
  private readonly range: TorpedoRangeSource;
  private params: IdentificationParams | null = null;

  constructor(
    ships: () => readonly IdentifiableShipView[],
    observer: ObserverPositionView,
    aim: AimStateSource,
    range: TorpedoRangeSource,
  ) {
    this.ships = ships;
    this.observer = observer;
    this.aim = aim;
    this.range = range;
  }

  /** 공식 식별 params 주입 (도착 시 조립부가 연결 — 없으면 기존 범위 재사용) */
  attachIdentificationParams(params: IdentificationParams | null): void {
    this.params = params;
  }

  /** 공식 식별 params 배선 여부 — false면 어뢰 유효 사거리를 쓴다 */
  get identificationParamsWired(): boolean {
    return this.params !== null;
  }

  /** 세력 확정 거리 (m) — 공식 값이 없으면 어뢰 유효 사거리 */
  get identificationRangeMeters(): number {
    return this.params?.identificationRangeMeters ?? this.range.maxRangeMeters;
  }

  /** 태그 표시 거리 (m) — 공식 값이 없으면 어뢰 유효 사거리 */
  get tagDisplayRangeMeters(): number {
    return this.params?.tagDisplayRangeMeters ?? this.range.maxRangeMeters;
  }

  /** 계약 `ShipIdentificationSource` — 매 호출 시 현재 상태에서 생성 */
  get identifications(): readonly ShipIdentificationView[] {
    return this.ships().map((ship) => this.viewOf(ship));
  }

  private viewOf(ship: IdentifiableShipView): ShipIdentificationView {
    const distanceMeters = this.distanceTo(ship);
    const isAlive = !ship.removed && !ship.hit;
    const isTargetable = isAlive;
    // 식별 성립: 조준경 진입 + 세력 확정 거리 이내. 죽은 표적은 식별하지 않는다.
    const identified =
      isAlive && this.aim.aiming && distanceMeters <= this.identificationRangeMeters;
    const identificationState: IdentificationState = identified
      ? factionRule(ship.faction).identification
      : 'unidentified';

    return {
      entityId: ship.id,
      faction: ship.faction,
      identificationState,
      // 미식별 동안 라벨은 null — 세력을 노출하지 않는다.
      displayLabelId: identified ? factionRule(ship.faction).displayLabelId : null,
      distanceMeters,
      isTargetable,
      isAlive,
      worldPosition: { x: ship.positionX, y: ship.positionY, z: ship.positionZ },
      // 죽은 표적에는 태그를 그리지 않는다 (파괴된 선박의 잔존 태그 방지).
      tagDisplayable: isAlive && distanceMeters <= this.tagDisplayRangeMeters,
    };
  }

  private distanceTo(ship: IdentifiableShipView): number {
    return Math.hypot(
      ship.positionX - this.observer.positionX,
      ship.positionY - this.observer.positionY,
      ship.positionZ - this.observer.positionZ,
    );
  }
}
