/**
 * 스프린트 B 렌더 표시 규칙 **UI 단위 검증 fixture** (`?bdemo=1`).
 *
 * ⚠ production 경로가 아니다. URL 플래그 없이는 생성되지 않으며, 화면에
 * 'B fixture' 배지를 띄운다. 여기 데이터는 **게임플레이 실제 상태가 아니라**
 * 계약 형태만 충족하는 검수용 표본이다 — 이 경로의 통과는 production 동작
 * 통과가 아니라 **표시 규칙 검증**으로만 보고한다 (작업 지시 §12).
 *
 * 목적: 게임플레이의 B 판정 구현(식별 상태 산출·중립 사건·경비 스폰)이
 * 아직 없어 production에서 도달할 수 없는 태그 상태 4종·죽은 표적 제거·
 * 경비 방향 마커·호위 결속선을 브라우저에서 검수한다.
 *
 * **경비함 3D 개체를 만들지 않는다** — 방향 마커의 좌표 표시 규칙만
 * 검수하며, 가짜 경비함을 장면에 띄우지 않는다 (§6).
 */

import type { EscortBinding, HighValueTransportView } from '../contracts/guard';
import type {
  ShipIdentificationSource,
  ShipIdentificationView,
} from '../contracts/identification';
import type { ConvoySource } from './ConvoyVisuals';
import type { GuardSightingSource, GuardSightingView } from './GuardDirectionIndicator';

/** fixture 표본 — 계약 형태만 충족하는 검수용 값 (실제 판정 결과 아님) */
export interface SprintBFixture {
  readonly identification: ShipIdentificationSource;
  readonly convoy: ConvoySource;
  readonly guard: GuardSightingSource;
  /** 죽은 표적 전환 등 검수 조작 */
  killTarget(entityId: number): void;
  /** 화면 안/밖 전환 검수 — 경비 표시를 카메라 근처로 옮긴다 */
  moveGuardOnScreen(x: number, y: number, z: number): void;
}

interface MutableView {
  entityId: number;
  faction: ShipIdentificationView['faction'];
  identificationState: ShipIdentificationView['identificationState'];
  displayLabelId: ShipIdentificationView['displayLabelId'];
  distanceMeters: number;
  isTargetable: boolean;
  isAlive: boolean;
  worldPosition: { x: number; y: number; z: number };
  tagDisplayable: boolean;
}

/**
 * 표본 4종 — 태그 상태별 검수용.
 * 미식별 표본은 실제 세력이 hostile이지만 `identificationState`가
 * unidentified이므로 **화면에 세력이 노출되면 안 된다**(회귀 검사 지점).
 */
function buildViews(surfaceY: number): MutableView[] {
  return [
    {
      entityId: 9101,
      faction: 'hostile',
      identificationState: 'unidentified',
      displayLabelId: null,
      distanceMeters: 320,
      isTargetable: true,
      isAlive: true,
      worldPosition: { x: -26, y: surfaceY, z: -46 },
      tagDisplayable: true,
    },
    {
      entityId: 9102,
      faction: 'neutral',
      identificationState: 'neutral',
      displayLabelId: 'faction.neutral',
      distanceMeters: 180,
      isTargetable: true,
      isAlive: true,
      worldPosition: { x: -8, y: surfaceY, z: -44 },
      tagDisplayable: true,
    },
    {
      entityId: 9103,
      faction: 'hostile',
      identificationState: 'hostile',
      displayLabelId: 'faction.hostile',
      distanceMeters: 240,
      isTargetable: true,
      isAlive: true,
      worldPosition: { x: 10, y: surfaceY, z: -48 },
      tagDisplayable: true,
    },
    {
      entityId: 9104,
      faction: 'patrol',
      identificationState: 'patrol',
      displayLabelId: 'faction.patrol',
      distanceMeters: 400,
      isTargetable: false, // 조준 불가 표시 검수
      isAlive: true,
      worldPosition: { x: 28, y: surfaceY, z: -50 },
      tagDisplayable: true,
    },
  ];
}

const FIXTURE_TRANSPORT: HighValueTransportView = {
  entityId: 9102,
  archetypeId: 'highValueTransport',
  // 참조 키만 — 배율 값은 params 소유이며 화면에 숫자를 노출하지 않는다
  rewardMultiplierRef: 'transport.highValue',
};

const FIXTURE_ESCORT: EscortBinding = {
  escortEntityId: 9104,
  escortedTransportId: 9102,
  maximumEscortDistanceMeters: 120,
};

export function createSprintBFixture(surfaceY: number): SprintBFixture {
  const views = buildViews(surfaceY);
  const guardSightings: GuardSightingView[] = [
    {
      requestId: 'fixture-guard-1',
      // 화면 밖(후방) 방향 검수용 좌표 — fixture 전용 값
      worldPosition: { x: 42, y: surfaceY, z: 40 },
    },
  ];

  return {
    identification: {
      get identifications(): readonly ShipIdentificationView[] {
        return views;
      },
    },
    convoy: {
      highValueTransports: [FIXTURE_TRANSPORT],
      escortBindings: [FIXTURE_ESCORT],
    },
    guard: {
      get sightings(): readonly GuardSightingView[] {
        return guardSightings;
      },
    },
    killTarget(entityId: number): void {
      const target = views.find((view) => view.entityId === entityId);
      if (target) target.isAlive = false;
    },
    moveGuardOnScreen(x: number, y: number, z: number): void {
      const first = guardSightings[0];
      if (first) guardSightings[0] = { requestId: first.requestId, worldPosition: { x, y, z } };
    },
  };
}

/** `?bdemo` 플래그 파서 — 이 플래그 없이는 fixture가 존재하지 않는다 */
export function parseSprintBFixtureFlag(search: string): boolean {
  return new URLSearchParams(search).get('bdemo') === '1';
}
