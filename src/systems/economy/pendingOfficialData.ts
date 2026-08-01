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

/** 게임플레이 소유 영역에 남은 임시 데이터 (A8 미해소분) */
export const PENDING_OFFICIAL_DATA: readonly PendingOfficialDataEntry[] = Object.freeze([
  Object.freeze({
    module: 'src/systems/economy/provisionalEconomy.ts',
    contents: '드롭 테이블(크레딧량)·회수 반경·파괴 시 크레딧 손실률',
    officialTarget: 'params/economy.json (미생성)',
    blockedBy: '기획 경제 수치표 — PvE D+3 절대 마감 (스프린트 A 병목)',
  }),
  Object.freeze({
    module: 'src/systems/provisionalCargo.ts',
    contents: '화물선 항행 속력·왕복 경로·명중 판정 반경·침몰 시간·선체 박스',
    officialTarget: 'params/economy.json 또는 레벨 레이아웃 데이터',
    blockedBy: '기획 경제 수치표 + 레벨 블록아웃 (INT-GAME-007)',
  }),
  Object.freeze({
    module: 'src/systems/provisionalEquipment.ts',
    contents: '장비 4종 성능(속력·피해)·디코이 지속/쿨다운·구조 기본 슬롯 수',
    officialTarget: 'params/equipment.json은 가격·슬롯만 담당 — 성능은 이관 대상 미정',
    blockedBy:
      'INT-GAME-008 (공식 equipment.json 주석이 성능을 게임플레이 소유로 위임 중). 슬롯 수는 공식 slotCapacity 확정 시 자동 반영(applyCatalog)',
  }),
]);
