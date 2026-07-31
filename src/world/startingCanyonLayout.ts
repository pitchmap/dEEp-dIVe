/**
 * 시작 협곡 레이아웃 데이터 — `contracts/layout.ts` CanyonLayout 계약의
 * 단일 구현 인스턴스 (INT-CORE-004).
 *
 * 이 모듈이 협곡 배치의 **유일한 소스**다:
 *  - 렌더(CanyonScene)는 blocks를 메시로, 게임플레이(collision)는 같은
 *    blocks를 충돌체로 해석한다 — 양쪽의 자체 수식 복제(구 CanyonScene
 *    buildCanyonBlockout ↔ collision/startingArea.ts 미러)를 이 데이터로
 *    교체한다. 연결은 composition root(core/Game)가 같은 인스턴스를 주입한다.
 *  - 레벨 시스템·로더·에디터가 아니다 — 결정적 상수 데이터 1벌이며, 정식
 *    블록아웃(레벨 디자인 산출물) 수신 시 이 파일의 내용만 교체된다.
 *
 * 배치는 D+5 회색 박스의 S자 수로 + 엄폐 기둥 3개를 그대로 옮긴 것이다
 * (재설계 아님 — 수식·상수는 렌더 구현과 1:1).
 *
 * 벽 높이 확정 (INT-CORE-004 리드 결정):
 *  - 좌안 11±2·sin / 우안 12∓2·sin — **그래픽 하향값을 최종 채택**한다.
 *    벽 상단 최대 = floorY(-6) + 13 = 7 로 해수면(12)보다 5m 낮다:
 *    수중에서 위를 볼 때 해수면·화물선 실루엣이 능선에 가리지 않는다 (§3.1
 *    '밝음→어둠' 문법·발견 연출). 충돌도 같은 blocks를 쓰므로 구 충돌 미러
 *    (15/16±3·sin)가 만들던 '보이지 않는 약 4m 벽'은 소멸한다.
 *  - 결과: 벽 상단(≤7)과 해수면(12) 사이에 개방 수역이 존재한다 — 회색
 *    박스 단계 허용. 상층 이탈 제약이 필요해지면 레벨 블록아웃 교체 시
 *    데이터로 해결한다 (코드 변경 없음).
 *
 * 이 파일은 공용 데이터 모듈로 공통 보호에 준한다 — 내용 교체는 리드 승인
 * (레벨 산출물 반영 커밋) 경유. 로직·시스템 코드를 추가하지 않는다.
 */

import type { CanyonBlockDescriptor, CanyonLayout } from '../contracts/layout';

const FLOOR_Y = -6;
const SEA_SURFACE_Y = 12;
const CANYON_HALF_WIDTH = 11;
const WALL_SEGMENT_LENGTH = 11;
const WALL_SEGMENT_COUNT = 11;

/** 수로 중심선: 완만한 S자 곡선 (결정적 — 난수 미사용) */
function centerAt(z: number): number {
  return Math.sin(z * 0.045) * 7;
}

function buildBlocks(): readonly CanyonBlockDescriptor[] {
  const blocks: CanyonBlockDescriptor[] = [];
  const halfSpan = (WALL_SEGMENT_COUNT - 1) / 2;

  for (let i = 0; i < WALL_SEGMENT_COUNT; i += 1) {
    const z = (i - halfSpan) * WALL_SEGMENT_LENGTH;
    const center = centerAt(z);
    const heightVariation = 2 * Math.sin(i * 2.7);
    const widthVariation = 1.5 * Math.sin(i * 1.9 + 1);
    const tilt = 0.12 * Math.sin(i * 3.3);

    // 좌안 벽
    blocks.push({
      x: center - CANYON_HALF_WIDTH - 4 + widthVariation,
      z,
      sizeX: 9 + widthVariation,
      sizeY: 11 + heightVariation,
      sizeZ: WALL_SEGMENT_LENGTH + 1.5,
      rotationY: tilt,
    });
    // 우안 벽
    blocks.push({
      x: center + CANYON_HALF_WIDTH + 4 - widthVariation,
      z,
      sizeX: 9 - widthVariation,
      sizeY: 12 - heightVariation,
      sizeZ: WALL_SEGMENT_LENGTH + 1.5,
      rotationY: -tilt,
    });
  }

  // 수로 안쪽 엄폐 기둥 3개 — 시각 차단 검증용 임시 배치 (정식 3곳+는
  // 레벨 블록아웃 교체 시 데이터 갱신)
  blocks.push({ x: centerAt(-18) + 4, z: -18, sizeX: 3.5, sizeY: 10, sizeZ: 3.5, rotationY: 0.4 });
  blocks.push({ x: centerAt(2) - 5, z: 2, sizeX: 4, sizeY: 12, sizeZ: 4, rotationY: -0.25 });
  blocks.push({ x: centerAt(24) + 6, z: 24, sizeX: 3, sizeY: 9, sizeZ: 5, rotationY: 0.7 });

  return blocks;
}

/** 시작 협곡 레이아웃 — 렌더·충돌 공용 단일 인스턴스 */
export const STARTING_CANYON_LAYOUT: CanyonLayout = Object.freeze({
  floorY: FLOOR_Y,
  seaSurfaceY: SEA_SURFACE_Y,
  submarineSpawn: Object.freeze({ x: 0, z: 0, headingRadians: 0 }),
  blocks: Object.freeze(buildBlocks()),
});
