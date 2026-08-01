/**
 * 공식 경제 데이터 대기 목록 — **감사(audit)용 단일 지점**.
 *
 * 스프린트 A A8("임시 경제·장비 수치 전량 공식 params 이관")은 기획 경제
 * 수치표가 도착해야 닫힌다. 그때까지 남는 임시 소스를 코드 한 곳에 모아
 * 열거해, 검증기·통합 창이 "무엇이 왜 남아 있는지"를 추측이 아니라
 * 데이터로 확인할 수 있게 한다.
 *
 * 규칙:
 *  - 이 목록에 **가격 데이터는 없다.** 업그레이드·장비 가격의 임시 경로
 *    (`provisionalUpgradeCost`)는 **삭제**됐고, 구매 판정은 공식
 *    `params/upgrades.json`·`params/equipment.json`만 읽는다. 공식 값이
 *    null이면 구매 불가로 판정된다(임의 값 대입 금지).
 *  - 남은 항목은 전부 **전투·월드 구동에 필요한 값**이며, 공식 파일이
 *    아직 존재하지 않거나(경제 드롭·화물선) 공식 파일이 스스로 게임플레이
 *    소유로 위임한 것(장비 성능)이다.
 *  - 새 임시 수치를 추가하지 않는다 — 이 목록은 줄어들기만 해야 한다.
 */

export interface PendingOfficialDataEntry {
  /** 임시 소스 모듈 경로 */
  readonly module: string;
  /** 무엇이 임시인가 */
  readonly contents: string;
  /** 공식 소스가 도착해야 할 곳 */
  readonly officialTarget: string;
  /** 해소 조건 */
  readonly blockedBy: string;
}

/**
 * 게임플레이 소유 영역에 남은 임시 데이터.
 *
 * 경제·화물선·장비 3종은 [INT-CORE-011]에서 **해소**됐다 —
 * `provisionalEconomy`·`provisionalCargo`·`provisionalEquipment` 파일은
 * 삭제됐고, 소비는 전부 공식 `params/{economy,cargo,equipment}.json` 주입
 * 경로로 바뀌었다. 아래는 아직 공식 파일이 없는 전투 구동 수치뿐이다.
 */
export const PENDING_OFFICIAL_DATA: readonly PendingOfficialDataEntry[] = Object.freeze([
  Object.freeze({
    module: 'src/systems/provisionalCombat.ts',
    contents: '어뢰 직선 주행 속력 기준값·최대 사거리',
    officialTarget: 'params/combat.json (사거리·주행 속력 항목 미도입)',
    blockedBy: 'INT-GAME-006 — 장비별 속력은 이미 공식 equipment.json 소비로 전환됨',
  }),
  Object.freeze({
    module: 'src/systems/provisionalAiming.ts',
    contents: '조준 카메라 기준 감도·미세 조준 한계의 게임플레이 측 기본값',
    officialTarget: 'params/aiming.json (툴링 aimingParams 로더 존재)',
    blockedBy: '조립부가 loadAimingParams 값을 주입하는 배선 — 삭제 시점은 게임플레이 결정',
  }),
]);
