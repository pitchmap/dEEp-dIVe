/**
 * 보스·약점·보스 구역 월드 배치 — **월드 데이터 정본** (INT-CORE-022,
 * M1·M2 Runtime Closure 인계표 §3. 신설 승인: 그래픽스 창 —
 * SalvagePlacementSource 전례 INT-CORE-011).
 *
 * 이 파일은 좌표·방향·경계 **순수 데이터만** 둔다:
 *  - 판정 로직·타이머·상태 저장 없음 (진입 판정은 게임플레이,
 *    게이트는 리드 `BossProgressStore`, 시각은 렌더가 각자 소비).
 *  - 밸런스 수치 없음 (전부 `params/boss.json` — 여기 복제 금지).
 *  - 보스·구역은 **각 1개** — 두 번째 추가는 스코프 가드 재심 사안.
 *
 * ID 규칙 (인계표 §3 — 새 ID 발명 금지):
 *  - canonical boss spawn ID = `boss-abyss-01` (= `params/boss.json` id·
 *    스코프 가드 개체 수 키와 동일 문자열). 이 파일은 숫자 entityId만
 *    소유하고 문자열 보스 ID는 params가 정본이다.
 *  - 보스 구역 ID = `boss-zone-abyss` — 진입 게이트·연출·검증이 공유하는
 *    유일 문자열은 이 파일의 `BOSS_ZONE.id` export다.
 *
 * entityId 대역: 화물선(소수)·플레이어(-1)·경비함(8000+)·salvage(9000+)와
 * 겹치지 않는 7000대를 보스 전용으로 쓴다. 약점 `id`는 기존 CombatTarget
 * 등록소 규약의 숫자 id (인계표 §3).
 *
 * 좌표 근거 (`STARTING_CANYON_LAYOUT` 실측 — 눈대중 좌표 없음):
 *  - 보스 구역 = 협곡 **최북단 수로 구간 z 44~60**. 벽 세그먼트는
 *    z=-55~55(각 ±6.25m 연장 — 마지막 세그먼트가 z≈61.25까지 덮는다)이므로
 *    구역 전체가 협곡 내부다. x 경계는 해당 구간 수로 중심선
 *    `centerAt(z)=sin(z*0.045)*7` 범위(z 44→60에서 6.34→3.30)에
 *    수로 반폭 11m를 더해 덮는다(벽 안쪽 판정 여백 포함 — 구역 상자가
 *    벽과 일부 겹쳐도 플레이어가 그 위치에 있을 수 없으므로 무해).
 *  - 기존 경로를 막지 않는다: 구역은 기하가 아니라 판정 경계다. 기존
 *    콘텐츠 최북단은 salvage-3(z=42)로 구역 밖(z≥44 미진입)이라 3/3
 *    이전의 일반 파밍 동선이 진입 게이트를 건드리지 않는다.
 *  - 스폰 = 구역 중앙부 수로 중심선 위 (x=centerAt(52)≈5.03, z=52).
 *    수직은 중층 y=-4 — 해저(-20)와 해수면(+12)의 중간대로, 보스 몸통
 *    반경(~2.6m)+지느러미 여유를 두고도 상하 15m 이상 여유. 플레이어
 *    잠항 가능 범위(-19.1~11.1) 안이라 접근·조준 가능.
 *  - heading 0 = 선수 -Z(`bowDirectionXZ` 규약) — 남쪽 진입로에서
 *    올라오는 플레이어를 정면으로 마주본다.
 *  - 약점 초기 좌표는 본체 스폰의 배 아래(월드 절대 y-2.5, 선수 쪽
 *    z-1) — 스폰 후에는 게임플레이 기존 `syncTo(boss.getPosition())`
 *    경로가 본체와 함께 이동시킨다 (인계표 §3, 이 파일은 초기값만).
 */

import type { BossPlacement } from '../systems/boss/BossEncounter';
import type { BossWeakPointPlacement } from '../systems/BossWeakPointTarget';

/** 수로 중심선 — 레이아웃과 동일 정의 (S자 곡선, 결정적) */
function channelCenterX(z: number): number {
  return Math.sin(z * 0.045) * 7;
}

/** 보스 구역 경계 — 진입 판정 입력 (판정 자체는 게임플레이 소유) */
export interface BossZoneBounds {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** 보스 본체 스폰 배치 (entityId 대역 7000 — 보스 전용) */
export const BOSS_PLACEMENT: BossPlacement = Object.freeze({
  entityId: 7000,
  spawnX: channelCenterX(52),
  spawnY: -4,
  spawnZ: 52,
  headingRadians: 0,
});

/**
 * 약점 초기 배치 — 월드 절대 좌표 (본체 상대 아님).
 * 스폰 후 이동 추종은 기존 `BossWeakPointTarget.syncTo` 경로.
 */
export const BOSS_WEAK_POINT_PLACEMENT: BossWeakPointPlacement = Object.freeze({
  id: 7001,
  x: BOSS_PLACEMENT.spawnX,
  y: BOSS_PLACEMENT.spawnY - 2.5,
  z: BOSS_PLACEMENT.spawnZ - 1,
});

/** 보스 구역 — 협곡 최북단 수로 구간. 진입 게이트·연출·검증 공유 정본 */
export const BOSS_ZONE: BossZoneBounds = Object.freeze({
  id: 'boss-zone-abyss',
  minX: -8,
  maxX: 17,
  minZ: 44,
  maxZ: 60,
});
