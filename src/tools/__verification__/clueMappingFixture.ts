/**
 * clue mapping verifier 자체 테스트용 픽스처 (툴링 소유 — **테스트 전용**).
 *
 * 정본은 그래픽스가 만들 `src/world/bossCluePlacements.ts`이며 툴링은 그
 * 파일을 만들지 않는다. 다만 정본이 도착하기 전에도 **검증기가 제대로
 * 동작하는지**는 확인해야 하므로, 순수 데이터로 정상/위반 케이스를 만든다.
 *
 * 여기의 id·좌표는 합성값이고 production에 복사되지 않는다 —
 * `verify:runtime-closure`가 production import 0건을 함께 검사한다.
 */

import type { CluePlacementModule } from './verifyRuntimeClosure';

/** boss.json unlock.clueIds와 같은 3종 (픽스처가 정본을 흉내 낸다) */
export const FIXTURE_CANONICAL_CLUE_IDS = [
  'clue-wreck-salvage',
  'clue-deep-survey',
  'clue-guard-log',
] as const;

/** 정상 — canonical 3종, target 3개, 배치 정합 */
export function validClueFixture(): CluePlacementModule {
  return {
    clueIdByInteractableId: {
      'interactable-wreck-01': 'clue-wreck-salvage',
      'interactable-deep-01': 'clue-deep-survey',
      'interactable-guard-01': 'clue-guard-log',
    },
    placements: [
      { targetId: 'interactable-wreck-01', kind: 'clue' },
      { targetId: 'interactable-deep-01', kind: 'clue' },
      { targetId: 'interactable-guard-01', kind: 'clue' },
      // 단서가 아닌 배치가 섞여 있어도 매핑에 없으면 정상이다.
      { targetId: 'interactable-gold-01', kind: 'goldCache' },
    ],
  };
}

/** 같은 clueId를 두 target이 가리키는 경우 — 정책상 허용 */
export function multiTargetClueFixture(): CluePlacementModule {
  const base = validClueFixture();
  return {
    clueIdByInteractableId: {
      ...base.clueIdByInteractableId,
      'interactable-wreck-02': 'clue-wreck-salvage',
    },
    placements: [...base.placements, { targetId: 'interactable-wreck-02', kind: 'clue' }],
  };
}

/** 위반 — boss.json에 없는 미지 clueId */
export function unknownClueFixture(): CluePlacementModule {
  const base = validClueFixture();
  return {
    clueIdByInteractableId: { ...base.clueIdByInteractableId, 'interactable-x': 'clue-not-in-boss-json' },
    placements: [...base.placements, { targetId: 'interactable-x', kind: 'clue' }],
  };
}

/** 위반 — 필수 clueId 누락 (2종만 매핑) */
export function missingClueFixture(): CluePlacementModule {
  return {
    clueIdByInteractableId: {
      'interactable-wreck-01': 'clue-wreck-salvage',
      'interactable-deep-01': 'clue-deep-survey',
    },
    placements: [
      { targetId: 'interactable-wreck-01', kind: 'clue' },
      { targetId: 'interactable-deep-01', kind: 'clue' },
    ],
  };
}

/** 위반 — 매핑 target이 배치에 없다 (정합 깨짐) */
export function orphanMappingFixture(): CluePlacementModule {
  const base = validClueFixture();
  return {
    clueIdByInteractableId: base.clueIdByInteractableId,
    placements: base.placements.filter((p) => p.targetId !== 'interactable-guard-01'),
  };
}

/** 위반 — non-clue 값(빈 문자열)이 매핑에 섞임 */
export function nonClueEntryFixture(): CluePlacementModule {
  const base = validClueFixture();
  return {
    clueIdByInteractableId: { ...base.clueIdByInteractableId, 'interactable-bad': '' },
    placements: [...base.placements, { targetId: 'interactable-bad', kind: 'clue' }],
  };
}
