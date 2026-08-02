/**
 * 세력별 시각 변형 정의 (B1 — 스프린트 B 선행개발).
 *
 * 경계 [INT-CORE-012]:
 *  - **세력 판정은 게임플레이 소유**다. 이 파일은 계약 `FactionId`(게임플레이
 *    데이터)를 받아 대응하는 **시각 변형만** 고른다. 모델 이름·메시 이름·
 *    엔티티 클래스명으로 세력을 추측하는 경로는 없다.
 *  - 색·실루엣·마킹은 그래픽스 소유 표현이며 계약에 없다
 *    (`displayLabelId`는 라벨 키일 뿐 문구·색이 아니다).
 *
 * 접근성 [§10]: **색만으로 구분하지 않는다.** 세 세력은 색 이전에
 *  ① 실루엣(각진 무장형 / 매끈한 민간형 / 저현 전투형)
 *  ② 식별 마크의 **형태**(삼각 / 사각 / 마름모)
 *  ③ 항해등 배치 규칙(경고등 유무·점멸)
 * 로 구분된다 — 회색조·색각 이상에서도 세 종이 서로 다른 형태로 읽힌다.
 * 저해상도·원거리에서는 색과 마크가 사라져도 실루엣 차이가 남는다.
 */

import type { FactionId } from '../contracts/meta';

/** 식별 마크의 기하 형태 — 색과 독립된 1차 구분자 */
export type FactionMarkShape = 'triangle' | 'square' | 'diamond';

/** 세력 1종의 시각 변형 규격 (회색 박스 수준 최소 표현) */
export interface FactionVisualVariant {
  readonly faction: FactionId;
  /** 상부 구조 실루엣 성격 — 각진 무장형인가 매끈한 민간형인가 */
  readonly silhouette: 'armedAngular' | 'civilianSmooth' | 'lowProfileCombat';
  /** 선체 톤 (보조 구분자 — 단독 사용 금지) */
  readonly hullColor: number;
  readonly markColor: number;
  readonly markShape: FactionMarkShape;
  /** 무장 실루엣(포탑·마스트) 개수 — 0이면 민간형 */
  readonly weaponMountCount: number;
  /** 경고등(적색 점멸) 사용 여부 — 없으면 일반 항해등만 */
  readonly hasWarningLight: boolean;
  /** 항해등 점멸 주기(Hz). 0 = 상시 점등 */
  readonly navLightBlinkHz: number;
}

/**
 * 세력 → 시각 변형 표.
 *  - hostile: 각진 무장 상부구조 + 포탑 2 + 삼각 마크 + 적색 경고등 점멸
 *  - neutral: 매끈한 민간 화물 상부구조 + 무장 0 + 사각 마크 + 상시 백색등
 *  - patrol : 저현 전투 실루엣 + 포탑 1 + 마름모 마크 + 청색 경고등 점멸
 */
export const FACTION_VISUAL_VARIANTS: Readonly<Record<FactionId, FactionVisualVariant>> = {
  hostile: {
    faction: 'hostile',
    silhouette: 'armedAngular',
    hullColor: 0x3a2f2c,
    markColor: 0xd4593f,
    markShape: 'triangle',
    weaponMountCount: 2,
    hasWarningLight: true,
    navLightBlinkHz: 1.6,
  },
  neutral: {
    faction: 'neutral',
    silhouette: 'civilianSmooth',
    hullColor: 0x2a3940,
    markColor: 0xdfe6ea,
    markShape: 'square',
    weaponMountCount: 0,
    hasWarningLight: false,
    navLightBlinkHz: 0,
  },
  patrol: {
    faction: 'patrol',
    silhouette: 'lowProfileCombat',
    hullColor: 0x28343a,
    markColor: 0x7fc8e8,
    markShape: 'diamond',
    weaponMountCount: 1,
    hasWarningLight: true,
    navLightBlinkHz: 2.4,
  },
};

/**
 * 세력 → 변형 선택. **게임플레이가 준 faction 값만** 입력으로 받는다.
 * 미지정(과도기 화물선 계약의 optional faction)은 계약 주석의 기존 규약대로
 * hostile로 간주한다 — 렌더가 새 기본값을 발명하지 않는다.
 */
export function factionVisualVariant(faction: FactionId | undefined): FactionVisualVariant {
  return FACTION_VISUAL_VARIANTS[faction ?? 'hostile'];
}
