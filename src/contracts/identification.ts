/**
 * 선박 식별 read model + B7 측정 로깅 계약 (INT-CORE-012, 스프린트 B).
 *
 * ## B2 — 조준경 식별 태그
 *
 * 그래픽스는 **이 읽기 전용 모델만** 소비한다. 엔티티 이름·모델 종류·
 * 메시 이름으로 세력을 추측하는 코드는 계약 위반이다 (판정은 게임플레이,
 * 표시는 그래픽스). 색·문구·아이콘은 계약에 없다 — `displayLabelId`는
 * 라벨 키이며 실제 표현은 그래픽스 소유다.
 *
 * 판정측 데이터 제공(거리·식별 성립 조건)은 게임플레이 소유이며, 이
 * 파일은 그 결과가 담길 형태와 소스 포트만 고정한다.
 *
 * ## B7 — 오인 사격률 측정 로깅
 *
 * 13차 보완분 결의 10의 기록 8항목을 타입으로 고정한다. **판정(20% 초과
 * 시각 강화 등)은 툴링 담당**이며 리드는 계약만 제공한다 — 이 파일에
 * 임계값·집계 로직을 두지 않는다.
 */

import type { FactionId, FactionLabelId, IdentifiedFactionState } from './faction';

/* ── B2 식별 read model ───────────────────────────────────── */

/**
 * 식별 상태. `unidentified`는 '아직 식별 정보가 성립하지 않음'이며
 * 세력을 숨기는 값이다 — 그래픽스는 이 값에서 세력을 추측하지 않는다.
 */
export type IdentificationState = 'unidentified' | IdentifiedFactionState;

export interface IdentificationWorldPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 선박 1척의 식별 표시용 단면 (읽기 전용 — 렌더·UI 소비) */
export interface ShipIdentificationView {
  readonly entityId: number;
  /**
   * 실제 세력. `identificationState === 'unidentified'`인 동안에는
   * **표시에 사용하지 않는다** — 태그·색·라벨은 identificationState만
   * 근거로 삼는다 (미식별 상태에서 세력을 노출하면 B2·B7이 무의미해진다).
   * B7 로깅(정답 대조)과 판정측 소비를 위해 모델에는 포함한다.
   */
  readonly faction: FactionId;
  readonly identificationState: IdentificationState;
  /** 미식별 동안에는 null — 표시할 라벨이 없다 */
  readonly displayLabelId: FactionLabelId | null;
  readonly distanceMeters: number;
  /** 표적으로 삼을 수 있는가 (파괴됨·제거됨·비표적 개체 제외) */
  readonly isTargetable: boolean;
  readonly isAlive: boolean;
  readonly worldPosition: IdentificationWorldPosition;
  /** 화면 태그를 그릴 수 있는 상태인가 (거리·조준 상태 등 판정측 결론) */
  readonly tagDisplayable: boolean;
}

/**
 * 식별 모델 소스 — 게임플레이가 구현하고 composition root가 렌더에 주입한다.
 * 렌더가 게임플레이 시스템을 직접 import하지 않게 하는 경계다.
 */
export interface ShipIdentificationSource {
  readonly identifications: readonly ShipIdentificationView[];
}

/* ── B7 측정 로깅 계약 ─────────────────────────────────────── */

/** 플레이어의 판단 (자기 보고 — 태그 노출 여부와 무관) */
export type IdentificationDecision = 'hostile' | 'neutral' | 'unknown';

/** 플레이어의 행동 */
export type IdentificationAction = 'attack' | 'hold' | 'disengage';

/**
 * 결과 분류 [13차 보완분 결의 10].
 *  - correct: 정답
 *  - misidentification: 오인 (분자)
 *  - intentionalNeutralAttack: 중립임을 알고 공격 — 분자에서 제외·별도 기록
 *  - inputMistake: 조작 실수 — 제외 (근거 2개 이상 일치 시에만 인정)
 *  - invalidOpportunity: 태그 표시 전 발사 등 유효 기회 아님 — 분모에서 제외
 */
export type IdentificationResultClassification =
  | 'correct'
  | 'misidentification'
  | 'intentionalNeutralAttack'
  | 'inputMistake'
  | 'invalidOpportunity';

/** 측정 기록 1건 — 8항목 (툴링이 수집·집계, 리드는 형태만 제공) */
export interface IdentificationOpportunityLog {
  /** 익명 식별자 — 개인 식별 정보를 넣지 않는다 */
  readonly anonymousTesterId: string;
  readonly opportunityId: string;
  /** 정답 대조용 실제 세력 */
  readonly actualFaction: FactionId;
  readonly identificationTagVisible: boolean;
  readonly playerDecision: IdentificationDecision;
  readonly playerAction: IdentificationAction;
  readonly resultClassification: IdentificationResultClassification;
  /** 기록 시각 (epoch ms) 또는 프레임 번호 — 수집기가 정한다 */
  readonly timestamp: number;
  /** 판단 근거·인터뷰 요약 등 자유 기술 */
  readonly notes?: string;
}

/**
 * 로그 수집 싱크 — 툴링이 구현한다. 리드·게임플레이는 기록을 넘기기만 하고
 * 집계·판정(오인 사격률 계산, 최소 표본 5명·50회 충족 여부)은 하지 않는다.
 */
export interface IdentificationLogSink {
  record(entry: IdentificationOpportunityLog): void;
}
