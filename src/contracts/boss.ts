/**
 * M1 보스 코어 계약 (리드 소유 — 17차 소회의 결의 3 창 1 범위).
 *
 * ## 규격 출처
 *
 *  - 11차 결의 5: 3단계 상태 머신 × 패턴 풀, 충돌 캡슐 1개, 단계 전환 AI = 리드 /
 *    판정 = 게임플레이 / 연출 = 그래픽스.
 *  - 16차 결의 1-3: **MVP 4패턴 봉인 — 돌진·투사체·약점 개방·최종 단계 가속.**
 *    소환·회전 근접은 부활 후보 1·2순위로만 기록하며, 이 계약에 타입·스텁·
 *    플래그를 만들지 않는다 (3차 대회의 스텁 금지 원칙 준용).
 *  - 17차 결의 3: `DestroyerAIController` 계보 재사용(신규 범용 AI 알고리즘 0),
 *    돌진 = 기존 이동 코드 + 목표 벡터 / 투사체 = 기존 어뢰 경로 역방향 /
 *    약점 개방 = 피격 태그 전환 / 최종 가속 = params 배율.
 *  - 17차 결의 5(R-M3): D10 비상 컷은 **패턴 노출 플래그 오프**로 수행 —
 *    약점 '판정' 코드는 유지하고 '패턴' 노출만 끈다 (params `patterns.flags`).
 *
 * ## 소유 경계
 *
 *  - 보스 단계·패턴 스케줄·예고·약점 개방 상태·보스 체력 풀 = 리드
 *    (`core/BossController`).
 *  - 명중 판정·피해 배율 적용 = 게임플레이 (`BossWeakPointTarget` — 기존
 *    어뢰 단일 명중 경로 재사용). 판정 결과만 `BossDamageSink`로 전달한다.
 *  - 보스 공격의 비행·접촉 판정·플레이어 피해 = 게임플레이 (`BossAttackPort`
 *    구현). 피해는 반드시 기존 `DamageReceiverPort.applyDamage` 단일 창구를
 *    통과한다 — 보스 전용 피해 정본을 만들지 않는다 (17차 공통 규칙).
 *  - 수치는 전부 `params/boss.json` (`config/bossParams.loadBossParams`) —
 *    AI·계약은 수치를 소유하지 않는다.
 */

import type { BossPhase } from './meta';

/* ── 패턴 정본 (16차 결의 1-3 — 정확히 4종) ─────────────────── */

/**
 * MVP 패턴 등록부 — **이 4종이 전부다.** 항목 추가는 대회의 의결(부활
 * 절차) 없이 금지된다. `finalAcceleration`은 공격 패턴이 아니라 3단계
 * 진입 시 적용되는 배율 수정자다(params `finalPhase.*`).
 */
export const BOSS_PATTERN_KINDS = [
  'ram',
  'projectile',
  'weakPointOpen',
  'finalAcceleration',
] as const;

export type BossPatternKind = (typeof BOSS_PATTERN_KINDS)[number];

/** 공격 요청을 만드는 패턴 부분집합 (약점 개방·최종 가속은 요청을 만들지 않는다) */
export type BossAttackPatternKind = 'ram' | 'projectile';

/* ── 예고 (공격 판정보다 예고가 먼저 — 17차 창 1 규격) ─────────── */

/**
 * 예고 상태 — 모든 공격·개방·단계 전환은 예고 상태를 먼저 거친다.
 * 지속 시간은 params `patterns.telegraphSeconds`. 예고 중 피격·플레이어
 * 파괴 시 해당 패턴은 실행 없이 취소될 수 있다(요청 0).
 */
export type BossTelegraphKind = 'ram' | 'projectile' | 'weakPointOpen' | 'phaseShift';

/* ── 보스 공격 요청 (AI는 요청만 — C4 경로 원칙 재사용) ────────── */

/**
 * 보스 공격 요청 1건. 리드 보스 코어가 예고 완료 시점에 생성하며,
 * 관측된 표적 3D 위치를 **요청에 고정**한다(INT-CORE-019 원칙 재사용 —
 * 임의 y 채움·발사 후 재추적 금지). 피해량·속도·판정 반경은 요청에
 * 싣지 않는다 — 게임플레이 포트 구현이 params에서 직접 받는다.
 */
export interface BossAttackRequest {
  /** 요청 고유 id (보스 개체 내 단조 증가 — 중복 방지 1차 키) */
  readonly attackId: string;
  readonly bossEntityId: number;
  readonly targetEntityId: number;
  readonly patternKind: BossAttackPatternKind;
  readonly attackerPosition: { readonly x: number; readonly y: number; readonly z: number };
  /** 예고 시작 시점에 관측·고정된 표적 3D 위치 */
  readonly targetPosition: { readonly x: number; readonly y: number; readonly z: number };
  /** 같은 패턴 실행 1회를 묶는 상관 id (피해 중복 방지 2차 키) */
  readonly correlationId: string;
  /** 보스 코어의 결정적 경과 시간(초) */
  readonly requestedAt: number;
}

export type BossAttackOutcome = 'delivered' | 'unwired' | 'duplicate' | 'targetUnavailable';

/**
 * 보스 공격 실행 포트 (게임플레이 구현).
 *
 *  - `ram`: 접촉 판정 — 돌진 이동 자체는 리드 코어가 기존 이동 포트로
 *    수행하고, 접촉 시 플레이어 피해는 이 포트 구현이
 *    `DamageReceiverPort.applyDamage`로 보낸다.
 *  - `projectile`: 기존 어뢰 직진 경로 코드를 역방향(보스 → 플레이어 고정
 *    좌표)으로 재사용해 비행·명중 판정을 수행한다.
 *  - 미연결(null) = unwired — 보스는 이동·예고만 하고 피해가 없다.
 *    임시 피해·즉시 피해를 만들지 않는다.
 */
export interface BossAttackPort {
  requestAttack(request: BossAttackRequest): BossAttackOutcome;
}

/* ── 이동 포트 (기존 이동 코드 재사용 + 돌진 속도 노브) ─────────── */

import type { SurfaceShipMotionPort } from './guard';

/**
 * 보스 이동 포트 — 기존 `SurfaceShipMotionPort`(게임플레이 소유 이동 코드)
 * 를 그대로 재사용하고, 돌진·최종 가속을 위한 속도 노브 하나만 더한다.
 * 속도 값 자체는 params(`patterns.ram.speedMetersPerSecond` × 3단계 배율)
 * 에서 오며, null = 포트 기본 속도 복귀.
 * 높이(수중 심도)는 포트 구현 소유 — 코어는 y를 직접 조작하지 않는다.
 */
export interface BossMotionPort extends SurfaceShipMotionPort {
  setMoveSpeed(speedMetersPerSecond: number | null): void;
}

/* ── 단계·약점 노출 단면 (게임플레이 약점 판정 소비 — INT-GAME-008 승격) ── */

/**
 * 게임플레이 `BossWeakPointTarget`이 소비하는 단계·약점 단면의 **정본**.
 * (기존 게임플레이 로컬 선언과 구조 동일 — 구조적 타이핑으로 즉시 호환)
 */
export interface BossPhasePort {
  readonly phase: BossPhase;
  readonly weakPointOpen: boolean;
}

/* ── 보스 피해 수신 (판정 결과만 — 수치 비소유) ─────────────────── */

/**
 * 게임플레이 명중 판정(약점/일반 선체 배율 적용 완료)이 최종 피해량을
 * 전달하는 창구. 리드 코어가 구현하며 중복 원장·파괴 1회를 보장한다.
 * 이 창구는 **보스 체력 전용**이다 — 플레이어 선체는 기존
 * `DamageReceiverPort` 단일 창구를 그대로 쓴다(별도 정본 아님).
 */
export interface BossDamageRequest {
  /** 명중 1건의 고유 id (게임플레이 명중 판정이 부여 — 중복 방지 키) */
  readonly damageId: string;
  /** 배율 적용 **후** 최종 피해량 (수치 출처는 params·어뢰 프로파일) */
  readonly amount: number;
  /** 판정 분류 (기록·연출용 — 코어는 재배율하지 않는다) */
  readonly kind: 'weakPoint' | 'hull';
}

export type BossDamageOutcome =
  | 'applied'
  /** 이 피해로 보스가 격파됨 — applied의 종결형(격파 전이는 1회만) */
  | 'defeated'
  | 'ignoredDuplicate'
  | 'ignoredDefeated'
  | 'invalidDamage';

export interface BossDamageSink {
  applyBossDamage(request: BossDamageRequest): BossDamageOutcome;
}

/* ── 읽기 모델 (HUD·렌더 소비 — 값 복사본) ─────────────────────── */

/**
 * 보스 코어 읽기 모델 — 기존 read model 문법(값 복사본·문구/색 없음)을
 * 따른다. 보스 전용 HUD 정본을 만들지 않는다 — 소비처는 기존 HUD 계층.
 */
export interface BossCoreView {
  readonly bossId: string;
  readonly phase: BossPhase;
  /** 0~1 표시용 비율 (원시 체력 값은 비노출 — 수치 발명 방지) */
  readonly hullRatio: number;
  /** 진행 중 예고 (없으면 null) — 연출·회피 신호 */
  readonly telegraph: BossTelegraphKind | null;
  readonly weakPointOpen: boolean;
  readonly defeated: boolean;
}

/* ── M2 단서·보스 구역 해금 (16차 결의 1-5·2-4) ────────────────── */

/** 단서 반영 결과 — 동일 단서 중복 반영 금지(16차 M2 규격) */
export type BossClueOutcome = 'collected' | 'duplicate' | 'unknownClue';

export type BossZoneEntryOutcome = 'granted' | 'lockedMissingClues';

/**
 * 보스 구역 진입 게이트 — 판정만 한다(구역 전환·연출은 소비처 소유).
 * 해금 정본은 리드 `meta/BossProgressStore`이며 기존 저장 시스템
 * (`progress` 블록)으로 영속된다 — 재접속 후 유지.
 */
export interface BossZoneGatePort {
  readonly unlocked: boolean;
  readonly requiredClues: number;
  /** 수집된 단서 id (중복 없음, 표시용 복사본) */
  readonly collectedClueIds: readonly string[];
  requestEntry(): BossZoneEntryOutcome;
}
