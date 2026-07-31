/**
 * 협곡 레이아웃 계약 — 월드 렌더(CanyonScene)와 충돌·시작 구역 판정
 * (게임플레이)이 같은 배치를 각자 복제하지 않기 위한 단일 데이터 소스
 * 인터페이스 (INT-CORE-003).
 *
 * 범위: **인터페이스만 확정한다.** 레벨 시스템·로더·에디터가 아니다.
 *  - 데이터 인스턴스(모듈 1개)는 후속 커밋에서 이 계약을 구현해 만들고,
 *    composition root(core/Game)가 렌더·게임플레이 양쪽에 같은 인스턴스를
 *    주입한다. 렌더는 블록을 메시로, 게임플레이는 같은 블록을 충돌체로 해석한다.
 *  - 정식 블록아웃(레벨 디자인 D+5 산출물, 엄폐 3곳+) 수신 시 데이터 모듈의
 *    내용만 교체된다 — 이 계약과 소비 코드는 불변.
 *
 * 배치 규약:
 *  - 블록은 축 정렬 박스 + Y축 요 회전 1개. 블록 **바닥**이 floorY에 놓인다
 *    (현 CanyonScene addBlock 관례: 중심 Y = floorY + sizeY/2).
 *  - 축·방향 기준은 core/conventions.ts (월드 +Y = 위).
 *
 * 이 파일은 공통 보호 파일이다 — 변경은 docs/INTEGRATION_NOTES.md 절차를 따른다.
 */

/** 협곡 벽·기둥 블록 1개 — 렌더 메시와 충돌체가 공유하는 서술 */
export interface CanyonBlockDescriptor {
  /** 블록 중심 수평면 좌표 */
  readonly x: number;
  readonly z: number;
  /** 축 방향 크기 (회전 전 로컬 기준) */
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sizeZ: number;
  /** Y축(위) 요 회전 (라디안) */
  readonly rotationY: number;
}

/** 협곡 해역 레이아웃 — 렌더·충돌 공용 단일 소스 */
export interface CanyonLayout {
  /** 해저 바닥 높이 (월드 Y) — 블록 바닥의 기준면 */
  readonly floorY: number;
  /** 해수면 높이 (월드 Y) — 화물선 흘수선·수면 위/아래 표현 전환 기준 */
  readonly seaSurfaceY: number;
  /** 잠수함 시작 포즈 (출항 §4.1 안전 구간의 시작점) */
  readonly submarineSpawn: {
    readonly x: number;
    readonly z: number;
    readonly headingRadians: number;
  };
  /** 협곡 벽·엄폐 기둥 블록 목록 — 렌더 메시 = 충돌체 (동일 순회) */
  readonly blocks: readonly CanyonBlockDescriptor[];
}
