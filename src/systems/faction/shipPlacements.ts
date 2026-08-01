/**
 * 선박 배치 원형 — B1(적대·중립 동시 배치)의 데이터 경계 (스프린트 B 선행개발).
 *
 * ## 무엇이 여기 있고, 무엇이 없는가
 *
 * 이 모듈에는 **수치 리터럴이 하나도 없다.** 모든 좌표·속력·치수는 주입받은
 * 공식 `params/cargo.json`(`CargoRuntimeParams`)에서 파생되며, 파생 규칙은
 * 아래 한 곳에만 있다. 세력 태그는 공식 `FactionId`이고, 드롭 테이블 참조는
 * 계약 규칙표(`rewardDropTableIdFor`)가 결정한다 — 이 파일이 보상을 정하지
 * 않는다.
 *
 * ## 왜 파생인가 (정직한 상태 기록)
 *
 * 공식 params에는 **선박이 1척(화물선)뿐**이다 — 중립 선박의 항로를 담은
 * 공식 표가 아직 없다. B1은 적대·중립이 같은 월드에 동시에 존재할 것을
 * 요구하므로, 임의의 숫자를 발명하는 대신 **이미 승인된 공식 값에서만**
 * 두 번째 항로를 파생한다:
 *
 *  - 항로 방향·길이·속력·선체 치수·침몰 시간: 공식 화물선 값 **그대로**
 *  - 중립 항로의 위치: 공식 항로를 **공식 선체 길이(2 × halfLengthMeters)**
 *    만큼 평행 이동 — 두 항로가 겹치지 않을 최소 간격이며, 새 크기를
 *    도입하지 않는다
 *
 * 공식 배치표(`params`의 ships 항목 등)가 도착하면 `shipPlacementsFrom...`
 * 대신 그 목록을 주입하면 된다 — 소비 시스템은 `ShipPlacement[]`만 안다.
 * 이관 요청은 INTEGRATION_NOTES INT-GAME-012.
 *
 * ## 하지 않는 것
 *
 * 세력별 클래스 분화 없음(태그 방식 유지 — 6차 결의 2), 신규 선박 AI 없음,
 * 탐지·추적 상태 머신 없음(스프린트 C 범위). 중립 선박은 **먼저 공격하지
 * 않는다** — 애초에 공격 행위 자체가 어떤 선박에도 구현돼 있지 않다.
 */

import { rewardDropTableIdFor, type FactionId } from '../../contracts/faction';
import type { CargoShipConfig } from '../CargoShipSystem';
import { cargoShipConfigFromOfficial } from '../CargoShipSystem';
import type { CargoRuntimeParams } from '../economy/officialEconomyCatalog';
import type { PatrolShipMotionProfile } from './PatrolShipEntity';

/** 선박 1척의 배치 — 세력 + 구성. 좌표·수치는 전부 공식 params 파생 */
export interface ShipPlacement {
  readonly faction: FactionId;
  readonly config: CargoShipConfig;
}

/**
 * 표적 id 규칙 — 공식 `cargo.targetId`가 기준(적대 선박)이고, 추가 선박은
 * 그 다음 번호를 쓴다. 밸런스 값이 아니라 식별자 채번 규칙이다.
 */
function nextTargetId(base: number, index: number): number {
  return base + index;
}

/**
 * 공식 화물선 params → 적대 1척 + 중립 1척 배치 (B1 최소 production 배치).
 *
 * 두 선박 모두 같은 원형(화물선)을 재사용한다 — 세력은 태그로만 구분되며
 * 새 선박 시스템·AI를 만들지 않는다.
 */
export function shipPlacementsFromOfficialCargo(
  cargo: CargoRuntimeParams,
  surfaceY: number,
): readonly ShipPlacement[] {
  const hostileConfig = cargoShipConfigFromOfficial(cargo, surfaceY);
  // 중립 항로 = 공식 항로를 공식 선체 길이만큼 평행 이동(겹침 방지 최소 간격).
  // 새 크기를 만들지 않는다 — 2 × halfLengthMeters는 공식 선체 치수다.
  const laneOffsetZ = cargo.hullBox.halfLengthMeters * 2;
  const neutralConfig: CargoShipConfig = {
    ...hostileConfig,
    id: nextTargetId(cargo.targetId, 1),
    faction: 'neutral',
    // 중립 격침 보상은 없다 — 계약 규칙표가 null을 준다(수치 발명 금지).
    ...dropTableFieldFor('neutral'),
    waypointA: { x: hostileConfig.waypointA.x, z: hostileConfig.waypointA.z + laneOffsetZ },
    waypointB: { x: hostileConfig.waypointB.x, z: hostileConfig.waypointB.z + laneOffsetZ },
  };

  return Object.freeze([
    Object.freeze({
      faction: 'hostile' as const,
      config: { ...hostileConfig, ...dropTableFieldFor('hostile') },
    }),
    Object.freeze({ faction: 'neutral' as const, config: neutralConfig }),
  ]);
}

/**
 * 경비함 운동 프로파일 — **전부 임시 상속값이다** (경비함 전용 공식 튜닝값 아님).
 *
 * 공식 guard·destroyer 튜닝 항목이 `params/`에 아직 없다. 새 수치를 만들지
 * 않고 아래 우선순위대로 **이미 검증된 기존 값**만 상속한다:
 *
 * | 값 | 출처 | 성격 |
 * |---|---|---|
 * | 전진 속력 | 공식 `params/cargo.json` `speedMetersPerSecond` | 공식 수상함 이동값 |
 * | 명중 반경·선체 박스 | 공식 `params/cargo.json` `hitRadiusMeters`·`hullBox` | 공식 수상함 치수 |
 * | 해수면 높이 | 공유 `CanyonLayout.seaSurfaceY` | 월드 정본 |
 * | 선회 속도 | `params/movement.json` `turn90Seconds` (90도 소요 시간) | **잠수함 이동 어댑터의 검증값 상속** — 수상함 선회 공식값이 없다 |
 *
 * 화물선은 웨이포인트 도달 시 선수각을 즉시 맞추는 방식이라 '선회 속도'
 * 개념이 없다. 그래서 저장소에 존재하는 유일한 검증된 선회값(잠수함
 * 90도 소요 시간)을 상속한다. 경비함 공식 튜닝표가 도착하면 이 함수만
 * 교체된다 (INT-GAME-013).
 */
export function patrolShipMotionProfile(
  cargo: CargoRuntimeParams,
  surfaceY: number,
  turn90Seconds: number,
): PatrolShipMotionProfile {
  return {
    speedMetersPerSecond: cargo.speedMetersPerSecond,
    // 90도(=π/2) 소요 시간 → rad/s. 파생식이며 새 수치가 아니다.
    turnRateRadiansPerSecond: turn90Seconds > 0 ? Math.PI / 2 / turn90Seconds : 0,
    surfaceY,
    hitRadius: cargo.hitRadiusMeters,
    hullBox: cargo.hullBox,
  };
}

/**
 * 세력 규칙표가 정한 드롭 테이블 참조를 config 필드로 옮긴다.
 * `null`(중립·경비)이면 필드 자체를 두지 않는다 — 경제 시스템이 조회할
 * 테이블이 없다는 뜻이며, 이 파일이 보상을 만들지 않는다.
 */
function dropTableFieldFor(faction: FactionId): { dropTableId?: string } {
  const dropTableId = rewardDropTableIdFor(faction);
  return dropTableId === null ? {} : { dropTableId };
}
