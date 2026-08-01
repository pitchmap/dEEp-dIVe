/**
 * 해저 재화(salvage) 월드 배치 — **월드·그래픽스 소유** (INT-CORE-011).
 *
 * 소유 분리 [확정]:
 *  - 이 파일은 `spawnId`·`worldPosition`·`orientationYawRadians`만 정의한다.
 *  - 보상(credits·rareParts·dropTableId·kind)은 `params/economy.json`
 *    (경제 params 소유)에만 있다 — **여기에 보상 수치를 두지 않는다.**
 *  - 결합은 composition root(`composeSalvageSpawnPlan`)가 spawnId로 수행한다.
 *    한쪽에만 있는 spawnId·중복 spawnId는 결합 단계에서 거부된다.
 *
 * 배치 근거 (현 해역 `STARTING_CANYON_LAYOUT` 실측 — 좌표를 눈대중으로
 * 만들지 않았다):
 *  - 수로 중심선 `centerAt(z) = sin(z*0.045) * 7`을 기준으로 오프셋을 잡아
 *    세 지점 모두 협곡 벽·엄폐 기둥에서 **수평 여유 8m 이상**을 확보했다
 *    (잠수함 반경 1.0 + salvage 판정 반경 1.5 = 2.5m 필요).
 *  - 수직: 바닥면이 해저(`floorY`)에 닿도록 `floorY + SALVAGE_SEATED_HEIGHT`.
 *    상단이 -3m라 해수면(+12m)으로 떠오르지 않고, 잠수함 하한(y=-5)에서
 *    자동 회수 반경(6m) 안에 들어온다.
 *  - 플레이어 최초 스폰(0,0,0)에서 17.5m / 30.6m / 42.3m — 스폰 지점과
 *    겹치지 않으면서 현 잠항 조작(하강 + 전진)만으로 도달 가능하다.
 *  - 상호 거리 26m 이상 — 한 지점에 뭉치지 않는다.
 *  - 화물선 왕복 항로(z=-40 해수면)와 최단 3D 거리 19.7m — 항로 위 배치 없음.
 *  - 보스·B·C 구역을 새로 만들지 않는다 — 전부 현 협곡 수로 안이다.
 *
 * 좌표 수치는 레벨 블록아웃 성격이라 정식 레벨 산출물 수신 시 이 파일만
 * 교체된다 (경제 params·시스템 코드는 무변경).
 */

import type {
  SalvagePlacement,
  SalvagePlacementSource,
} from '../contracts/officialParams';
import { STARTING_CANYON_LAYOUT } from './startingCanyonLayout';

/**
 * 해저에 놓인 salvage 중심의 바닥 대비 높이 (m) — 판정 반경(1.5)과 같아
 * 물체 바닥이 해저면에 닿는다. 시각 배치 상수이며 밸런스 수치가 아니다.
 */
const SALVAGE_SEATED_HEIGHT = 1.5;

/** 수로 중심선 — 레이아웃과 동일 정의 (S자 곡선, 결정적) */
function channelCenterX(z: number): number {
  return Math.sin(z * 0.045) * 7;
}

const SEABED_Y = STARTING_CANYON_LAYOUT.floorY + SALVAGE_SEATED_HEIGHT;

/**
 * spawnId는 `params/economy.json`의 salvageSpawns와 1:1로 대응해야 한다 —
 * 누락·중복·미지 id는 결합 시 거부된다(임의 좌표 생성 금지).
 */
const PLACEMENTS: readonly SalvagePlacement[] = Object.freeze([
  {
    // 남쪽 수로 — 스폰에서 후방(-Z)으로 하강 접근. 화물선 항로(z=-40)보다 앞
    spawnId: 'salvage-1',
    worldPosition: { x: channelCenterX(-30) + 3, y: SEABED_Y, z: -30 },
    orientationYawRadians: 0.6,
  },
  {
    // 중앙 수로 — 스폰에서 가장 가까운 첫 접촉 지점(엄폐 기둥 z=24 이전)
    spawnId: 'salvage-2',
    worldPosition: { x: channelCenterX(16) + 1, y: SEABED_Y, z: 16 },
    orientationYawRadians: -0.35,
  },
  {
    // 북쪽 수로 안쪽 — 가장 깊숙한 지점(왕복 동선 유도)
    spawnId: 'salvage-3',
    worldPosition: { x: channelCenterX(42) - 4, y: SEABED_Y, z: 42 },
    orientationYawRadians: 1.1,
  },
]);

/** composition root가 소비하는 배치 소스 (좌표 전용 — 보상 없음) */
export const STARTING_AREA_SALVAGE_PLACEMENTS: SalvagePlacementSource =
  Object.freeze({ placements: PLACEMENTS });
