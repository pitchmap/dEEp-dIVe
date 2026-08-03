/**
 * 탐지·추적 계약 (INT-CORE-015 — 스프린트 C1·C2·C3).
 *
 * ## 소유 경계 [15차 결의 2 창 범위표]
 *
 *  - **탐지 게이지 정본 소유자 = 게임플레이 `DetectionSystem`**
 *    (contracts/systems.ts — ★허브, 기존 계약 유지: gauge·stage·reportNoise·
 *    reportTorpedoLaunch. 임시→본 구현 교체 시 인터페이스 불변).
 *    이 파일은 그 시스템이 **소비할 입력 포트**와 **내보낼 읽기 모델**을
 *    고정한다 — 게이지 계산식을 여기 두지 않는다.
 *  - **추적 상태 전이 소유자 = 리드 `DestroyerAIController`** (경비함·호위함·
 *    일반 적대 구축함 **공유** — 상태 어휘는 기존 `DestroyerAI['state']`
 *    patrol/alert/attack/lost 그대로, 새 상태명을 만들지 않는다).
 *  - 렌더·AI는 탐지 수치를 **자체 계산하지 않는다** — 렌더는
 *    `DetectionHudView`/`detectionChanged`만, AI는 `DetectionStageSource`만
 *    소비한다. 소음·거리·심도로 게이지를 재계산하는 코드는 계약 위반이다.
 *
 * ## 수치 출처
 *
 * 공식 params는 `params/detection.json` — `gaugeFillSecondsAtPeriscope`(8)·
 * `depthModifiers`(periscope 1.0 / cruise 0.6 / deep 0.3)·
 * `silentRunningNoiseMultiplier`(0.1)는 **확정값**이다. 반면 **거리 감쇠
 * 곡선·게이지 감소율은 공식 문서에 없다** — 아래 `DetectionTuningParams`
 * 에서 null로 두고, 미확정 상태에서는 시스템이 `unwired`로 남는다
 * (게이지 0·stage 'safe' 고정, 전이 없음 — 임의 증가율·감소율 발명 금지).
 *
 * ## 어뢰 캠 복귀 조건의 alert 발화 지점 [13차 결의 6]
 *
 * 별도 이벤트를 만들지 않는다 — 기존 `detectionChanged`의 stage 전이
 * (`safe→searching→detected`)가 발화 지점이다. 어뢰 캠 자체는 A~C 밖.
 */

import type { DepthLayerId, DetectionStage } from './events';
import type { DestroyerAI } from './systems';

/** 추적 상태 정본 어휘 — 기존 DestroyerAI 상태 그대로 (새 이름 금지) */
export type TrackingState = DestroyerAI['state'];

/* ── C2 입력 포트: 은신·심도 보정 ─────────────────────────── */

/**
 * 탐지 환경 입력 — 게임플레이가 공급한다 (판정측 소유 데이터의 단면).
 * DetectionSystem은 이 값만 읽고, 소스 시스템을 직접 import하지 않는다.
 */
export interface DetectionEnvironmentSource {
  /** 자기 소음 0~1 (noiseChanged와 동일 값 체계) */
  readonly noiseLevel: number;
  /** 현재 심도 층 — depthModifiers 보정 키 */
  readonly depthLayer: DepthLayerId;
  /** 침묵 항행 중인가 (silentRunningNoiseMultiplier 적용 조건) */
  readonly silentRunning: boolean;
}

/**
 * 탐지 공식 수치. 확정 3종은 `params/detection.json` 소유이며 여기 복제하지
 * 않는다 — 이 타입은 **미확정 2종**을 null 계약으로 고정한다.
 */
export interface DetectionTuningParams {
  /** 거리 감쇠 — 관측자 거리별 게이지 증가 배율 곡선. **공식 문서에 없음** */
  readonly distanceFalloff: null | {
    readonly fullEffectMeters: number;
    readonly zeroEffectMeters: number;
  };
  /** 게이지 감소율(초당) — 탐지권 이탈 시. **공식 문서에 없음** */
  readonly gaugeDecayPerSecond: number | null;
}

/* ── C1 읽기 모델 ─────────────────────────────────────────── */

/** HUD(눈 아이콘·게이지) 소비 모델 — 표시 전용, 문구·색 없음 */
export interface DetectionHudView {
  /** 0~1. unwired면 0 고정 */
  readonly gauge: number;
  readonly stage: DetectionStage;
  /** 미확정 수치로 게이지가 정지 상태인가 (UI가 '작동 중'으로 위장 금지) */
  readonly unwired: boolean;
}

/**
 * 적 AI 소비 모델 — 탐지 게이지는 단일화됐으므로(결의 4) 관측자별 게이지가
 * 아니라 **플레이어에 대한 전역 탐지 단계** 하나다. AI는 stage만 읽고
 * 게이지 수치·계산식에 접근하지 않는다.
 */
export interface DetectionStageSource {
  readonly stage: DetectionStage;
  /**
   * 마지막 노출 위치 (어뢰 발사 지점 무조건 노출 §5.10 + detected 전이
   * 시점의 플레이어 위치). 없으면 null. AI의
   * `notifyLastKnownPosition` 입력과 같은 좌표 체계다.
   */
  readonly lastExposedPosition: { readonly x: number; readonly z: number } | null;
}

/* ── C3 추적 상태 경계 ────────────────────────────────────── */

/**
 * 추적 전이 규칙 [정본 — 리드 소유, 경비함·호위함·적대 구축함 공유]:
 *
 *  - `patrol → alert`  : stage 'searching' 진입 또는 notifyLastKnownPosition
 *  - `alert → attack`  : stage 'detected' + 표적 위치 관측 가능
 *  - `attack → alert`  : 표적 관측 상실 (마지막 확인 위치로 접근)
 *  - `alert/attack → lost` : 마지막 확인 위치까지 상실
 *  - `lost → alert`    : 재노출 (notifyLastKnownPosition)
 *
 * 전이 판정 입력은 `DetectionStageSource`와 `SurfaceShipMotionPort`
 * (isTargetAlive·getTargetPosition)뿐이다 — AI가 소음·거리·심도로 탐지를
 * 재계산하지 않는다. 전이에 시간 임계값이 필요해지면 params 소유로
 * 추가한다(코드 상수 금지).
 *
 * 표적 생사는 `PlayerAliveSource`(contracts/survival.ts)가 정본이다 —
 * 파괴된 플레이어는 관측 불가로 취급하고 공격 요청을 만들지 않는다.
 */
export interface TrackingStateView {
  readonly entityId: number;
  readonly state: TrackingState;
  readonly lastKnownPosition: { readonly x: number; readonly z: number } | null;
}

/** 렌더·검증이 추적 상태를 폴링하는 읽기 전용 소스 */
export interface TrackingStateSource {
  readonly trackedShips: readonly TrackingStateView[];
}

/* ── reset 경계 ───────────────────────────────────────────── */

/**
 * 출항 경계 규칙: 탐지 게이지·stage·마지막 노출 위치·추적 상태는 전부
 * **출항 한정 상태**다 — 출항 시작(`resetSortieSession`)과 종료(정산) 시
 * 초기화되며 기지(BASE·DEBRIEF)에서는 게이지가 증가하지 않는다.
 * 구현체는 `SortieResettable`(contracts/survival.ts)을 함께 구현한다.
 */
