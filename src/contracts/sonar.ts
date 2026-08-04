/**
 * 소나 스코프 읽기 모델 계약 (INT-RENDER-014 — M1 통합 선행).
 *
 * ## 배경과 소유 경계
 *
 *  - **판정 정본 소유자 = 게임플레이 소나 시스템** (역할 브랜치 —
 *    아직 dev 미병합). 그래픽스의 기존 `SonarScope` 표시물은 이 판정과
 *    호환되지 않으므로, 양쪽이 **이 읽기 모델 하나로 수렴**한다.
 *    이 계약은 표시에 필요한 단면만 고정하며 판정 계산식을 두지 않는다.
 *  - **렌더는 이 모델만 소비한다** — 월드 좌표·엔티티 시스템을 직접 읽어
 *    방위·거리를 재계산하지 않는다. 탐지·소음·거리로 blip을 자체 생성하는
 *    코드는 계약 위반이다 (detection.ts와 같은 원칙).
 *  - ⚠ 이 계약의 정의는 **배선이 아니다** — dev에는 아직 이 모델의 공급자도
 *    소비자도 없다. 그래픽스 구현 완료로 표기하지 않는다.
 *
 * ## 침묵 항행 비인지 [17차 결의 4]
 *
 * 이 모델에 침묵 항행 boolean을 **두지 않는다**. 소나 표시는 자기 소음의
 * 결과값인 `noiseFactor` 하나에만 의존한다 — 침묵 항행·속도·회수 소음이
 * 어떻게 합산되는지는 게임플레이 소유이며, 표시가 원인을 구분해 다르게
 * 그리는 순간 판정이 이원화된다.
 *
 * ## depthChargeOnPassiveScope 필터 [게임플레이 소유]
 *
 * 패시브 스코프에 폭뢰 blip을 노출할지의 필터링은 **게임플레이가 blips
 * 배열을 만들 때 이미 적용**한다. 렌더는 받은 blips를 kind로 걸러내거나
 * 추가하지 않는다 — 모델에 있는 blip은 전부 그리고, 없는 blip은 그리지
 * 않는다.
 */

import type { DetectionStage } from './events';
import type { InteractionTargetKind } from './meta';

/**
 * 전투 접촉 blip — 소음원 기반 패시브 표시 자격이 있는 분류
 * (보스는 별도 kind가 아니라 `ship`으로 표현한다 — 보스 연출 정본은
 * `BossCoreView`이지 스코프가 아니다).
 */
export type SonarCombatBlipKind = 'ship' | 'torpedo' | 'depthCharge';

/**
 * 탐색 접촉 blip — M2 회수·탐사 대상 4종 (INT-GAME-017 승인,
 * INT-CORE-022). 어휘는 상호작용 계약 `InteractionTargetKind`
 * (goldCache | salvage | clue | deepSite)를 **그대로 재사용**한다 —
 * 같은 대상에 두 이름을 만들지 않는다.
 *
 * 공급 규칙 (게임플레이 공급자 준수 사항 — 렌더는 재추측 금지):
 *  - 탐색 접촉은 스스로 소음을 내지 않으므로 **패시브에 나타나지 않는다.**
 *    액티브 핑이 드러낸 동안(`fromActivePing: true`)에만 blip으로 나간다 —
 *    핑 없이 탐색 kind를 미리 노출하면 '위치를 알 것인가, 알릴 것인가'
 *    (16차 결의 2-5) 교환이 무너진다.
 *  - 지형은 blip이 아니다 — 렌더가 협곡 레이아웃 단일 소스
 *    (`world/startingCanyonLayout`)로 스코프 배경층에 직접 그린다
 *    (판정 아님·접점 아님).
 */
export type SonarExplorationBlipKind = InteractionTargetKind;

/**
 * blip 분류 정본 — 전투 3종 + 탐색 4종의 단일 union. 그래픽스는 이 kind를
 * 재추측·재분류하지 않고 받은 값으로만 표시를 분기한다. 추가 확장은
 * INTEGRATION_NOTES 제안 → 리드 결정 후에만 한다 (임의 추가 금지).
 */
export type SonarBlipKind = SonarCombatBlipKind | SonarExplorationBlipKind;

/**
 * 스코프 위 접촉 1건. **월드 좌표를 싣지 않는다** — 방위·거리 표현만으로
 * 스코프를 그릴 수 있어야 하고, 렌더가 월드 위치를 역산할 필요가 없어야
 * 한다.
 */
export interface SonarBlip {
  /** canonical 대상 ID — 엔티티 시스템의 대상 식별자와 동일 체계 */
  readonly targetId: string;
  readonly kind: SonarBlipKind;
  /** 플레이어 기준 방위(라디안) — 축·방향 규약은 core/conventions.ts */
  readonly bearingRadians: number;
  /**
   * 방위 불확실성 폭(라디안) — 패시브 접촉의 번짐 표현. 정확한 접촉은 0.
   * 번짐 계산은 게임플레이 소유 — 렌더는 받은 폭 그대로 그린다.
   */
  readonly bearingSpreadRadians: number;
  /** 거리(m). 패시브 청음처럼 거리 미상이면 null — 렌더는 링 없이 방위만 */
  readonly distanceMeters: number | null;
  /** 액티브 핑 반사로 얻은 접촉인가 (패시브 청음과 표시 구분용) */
  readonly fromActivePing: boolean;
}

/**
 * 소나 스코프 표시 단면 — 게임플레이가 공급하고 렌더·HUD가 폴링한다.
 *
 * unwired 자세(공급자의 params 미확정 시): `unwired: true` + blips 빈 배열 +
 * `pingReady: false` + 타이머 0 + `noiseFactor` 0 + ringState 'safe' 고정.
 * UI는 unwired를 '작동 중'으로 위장하지 않는다 (DetectionHudView와 동일
 * 원칙).
 */
export interface SonarScopeReadModel {
  /** 미확정 수치로 정지 상태인가 */
  readonly unwired: boolean;
  /**
   * 자기 소음 결과값 0~1 (noiseChanged와 동일 값 체계). 표시가 의존하는
   * 유일한 자기 상태 — 침묵 항행 여부 등 원인 정보는 싣지 않는다.
   */
  readonly noiseFactor: number;
  /** 표시할 접촉 전부 — 필터링(폭뢰 노출 여부 등)은 공급 시점에 완료됨 */
  readonly blips: readonly SonarBlip[];
  /** 액티브 핑 잔여 노출 시간(초). 핑 비활성이면 0 */
  readonly activePingRemainingSeconds: number;
  /** 핑 재사용 대기 잔여(초). 사용 가능하면 0 */
  readonly cooldownRemainingSeconds: number;
  /** 지금 핑을 쏠 수 있는가 (cooldown 0 && !unwired 의 공급자 판정) */
  readonly pingReady: boolean;
  /**
   * 스코프 테두리 상태 — 피탐지 3단계 공용 표현. 새 어휘를 만들지 않고
   * 기존 `DetectionStage`(safe/searching/detected)를 재사용한다.
   */
  readonly ringState: DetectionStage;
}
