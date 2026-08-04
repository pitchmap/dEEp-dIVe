/**
 * 단서 interactable 월드 배치 + canonical 단서 매핑 — **월드 데이터 정본**
 * (INT-CORE-022, M1·M2 Runtime Closure 인계표 §4. 신설 승인: 그래픽스 창).
 *
 * "배치를 만드는 쪽이 매핑을 만든다" — 단서 interactable 3개의 좌표·
 * targetId와 `ClueIdByInteractableId` 매핑을 **같은 파일에서** export 한다.
 *
 * 계약 준수 (contracts/meta.ts · 인계표 §4):
 *  - canonical clueId는 `params/boss.json unlock.clueIds` 3종 **전부·그것만**:
 *    `clue-wreck-salvage` · `clue-deep-survey` · `clue-guard-log`.
 *    4번째 단서·미지 clueId 없음 (검증: 툴링 검증기 / 조립부 대조 /
 *    `BossProgressStore.unknownClue` 거부 — 3중 방어).
 *  - targetId는 월드 interactable 고유 ID이며 clueId가 **아니다** —
 *    문자열 조작으로 clueId를 파생하는 코드는 계약 위반(매핑 조회만 허용).
 *  - 이 파일은 순수 데이터다: 회수 판정(게임플레이 `InteractionSystem`)·
 *    진행 원장(리드 `BossProgressStore`)·보상(economy)·시각 표식(렌더)을
 *    두지 않는다.
 *
 * 배치 근거 (`STARTING_CANYON_LAYOUT` 실측, 16차 결의 1-5 '기존 콘텐츠
 * 재사용' 획득원 주제와 일치 — 눈대중 좌표 없음):
 *  - 수직: 전부 해저 착저 `floorY(-20) + 1.2 = -18.8` — 플레이어 잠항
 *    하한(-19.1) 위라 접근 가능하고, 회수 반경 계약 범위([2,12]m) 안에서
 *    호버링으로 닿는다.
 *  - 수평: 수로 중심선 `centerAt(z)=sin(z*0.045)*7` ± 3 이내 오프셋 —
 *    협곡 벽·엄폐 기둥에서 8m 이상 여유(salvage 배치와 동일 기준),
 *    기존 경로를 막지 않는다.
 *  - wreck-datacore (→ clue-wreck-salvage): 남쪽 수로 z=-38 — 난파선
 *    회수 지점 salvage-1(z=-30)에서 8.1m 곁, '난파선 salvage 회수' 획득원.
 *  - survey-probe (→ clue-deep-survey): 중앙 수로 해저 z=4 — 심층 탐사
 *    지점 주제. 스폰(0,0)에서 3D 거리 ≈19.7m로 회수 반경 상한(12m) 밖
 *    (스폰 즉시 프롬프트 없음). 엄폐 기둥(z=2)에서 8.9m.
 *  - patrol-blackbox (→ clue-guard-log): 최남단 수로 z=-52 — 화물
 *    항로(z=-40)·경비함 대응 구역 남쪽 해저, '경비함 관련 기존 경로' 주제.
 *  - 밀집 없음: 단서 상호 최소 거리 14.1m(1↔3) — 회수 반경 계약 상한
 *    12m보다 크다. 1↔2 ≈ 43m, 2↔3 ≈ 56m. 보스 구역(z≥44)과 무관.
 */

import type { ClueIdByInteractableId } from '../contracts/meta';
import { STARTING_CANYON_LAYOUT } from './startingCanyonLayout';

/** 해저 착저 높이 (m) — 시각·배치 상수이며 밸런스 수치가 아니다 */
const CLUE_SEATED_HEIGHT = 1.2;

/** 수로 중심선 — 레이아웃과 동일 정의 (S자 곡선, 결정적) */
function channelCenterX(z: number): number {
  return Math.sin(z * 0.045) * 7;
}

const SEABED_Y = STARTING_CANYON_LAYOUT.floorY + CLUE_SEATED_HEIGHT;

/** 단서 interactable 배치 1건 — 좌표·targetId 순수 데이터 */
export interface BossCluePlacement {
  /** 월드 interactable 고유 ID — clueId가 아니다 (매핑으로만 연결) */
  readonly interactableId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 단서 interactable 3개 — 정확히 3개 (4번째 금지, 인계표 §4) */
export const BOSS_CLUE_PLACEMENTS: readonly BossCluePlacement[] = Object.freeze([
  {
    // 남쪽 수로 — 난파선 회수 지점(salvage-1, z=-30) 곁의 데이터코어
    interactableId: 'wreck-datacore',
    x: channelCenterX(-38) + 2,
    y: SEABED_Y,
    z: -38,
  },
  {
    // 중앙 수로 해저 — 심층 탐사 프로브
    interactableId: 'survey-probe',
    x: channelCenterX(4) + 3,
    y: SEABED_Y,
    z: 4,
  },
  {
    // 최남단 수로 해저 — 경비 순찰 기록 블랙박스 (화물 항로 남쪽)
    interactableId: 'patrol-blackbox',
    x: channelCenterX(-52) + 2,
    y: SEABED_Y,
    z: -52,
  },
]);

/**
 * interactableId → canonical clueId 매핑 정본 (기획 승인 대상).
 * 값은 `params/boss.json unlock.clueIds` 3종 전부를 정확히 1회씩 커버한다.
 */
export const CLUE_ID_BY_INTERACTABLE: ClueIdByInteractableId = Object.freeze({
  'wreck-datacore': 'clue-wreck-salvage',
  'survey-probe': 'clue-deep-survey',
  'patrol-blackbox': 'clue-guard-log',
});
