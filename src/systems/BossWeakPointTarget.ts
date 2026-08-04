/**
 * 보스 약점 판정 — 게임플레이 소유 (소회의 11 결의 5: 판정 = 게임플레이 /
 * 연출 = 그래픽스 / 단계 전환 AI = 리드).
 *
 * 경계 규칙:
 *  - 보스 AI 내부 상태를 직접 읽지 않는다 — 리드 AI가 공급하는
 *    `BossPhasePort`(단계·약점 개방 여부)만 소비한다. 정식 계약 승격은
 *    INT-GAME-008 제안 중.
 *  - 약점 개방 = '피격 판정 태그 전환' (회의 11 패턴 4): 개방 중 명중 =
 *    약점 피격(피해 증폭), 닫힘 중 명중 = 일반 선체 피격(피해 감쇠) —
 *    두 경우를 명시적으로 구분해 기록한다.
 *  - 그래픽스는 이 시스템의 읽기 전용 상태(weakPointOpen·lastHitKind·
 *    카운터)를 폴링하거나 onHit 콜백을 구독해 연출한다 — 정식
 *    `bossWeakPointHit` 이벤트는 계약 제안 중.
 *  - 명중 판정 경로는 기존 어뢰 단일 경로(TargetRegistry·CombatTarget) 재사용.
 */

import type { CombatTarget, FactionId } from './TargetRegistry';

/** 리드 보스 AI가 공급하는 단계·약점 상태 단면 (내부 상태 직접 접근 금지) */
export interface BossPhasePort {
  /** 현재 보스 단계 (1~3) — 전환 규칙은 리드 AI 소유 */
  readonly phase: number;
  /** 약점 개방 여부 (패턴 4 '약점 개방'이 켠다) */
  readonly weakPointOpen: boolean;
}

export type BossHitKind = 'weakPoint' | 'hull';

/** 약점 배치 — 월드·보스 배치 데이터 소유 (밸런스 수치가 아니다) */
export interface BossWeakPointPlacement {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * 약점 판정 수치 — **전부 공식 params 소유** (M2 3단계 이관).
 *
 * 현재 상태 (`params/boss.json` — dev에 존재):
 *  - 피해 배율 2종은 **이미 params가 소유**한다:
 *    `patterns.weakPointOpen.weakPointDamageMultiplier` ·
 *    `patterns.weakPointOpen.closedHullDamageMultiplier`.
 *  - **명중 판정 반경(`patterns.weakPointOpen.hitRadiusMeters`)은 아직
 *    공식 스키마·승인 수치가 없다.** 따라서 반경은 주입되지 않은 상태이며,
 *    `wired`가 false로 남아 **명중 자체가 성립하지 않는다**(반경 0).
 *  - 이전 `provisionalBossWeakPointConfig`(R7)의 임시 반경 6은 **공식 수치가
 *    아니다** — 코드·주석 어디에서도 확정값으로 사용하지 않는다. 반경 미주입
 *    상태는 unwired로 유지한다. 요청: INT-GAME-016.
 */
export interface BossWeakPointParams {
  /** 명중 판정 반경 (m, 통짜 캡슐 근사 — 회의 11 결의 5) */
  readonly hitRadiusMeters: number | null;
  /** 약점 개방 중 피해 배율 */
  readonly weakPointDamageMultiplier: number | null;
  /** 약점 닫힘 중(일반 선체) 피해 배율 */
  readonly closedHullDamageMultiplier: number | null;
}

export class BossWeakPointTarget implements CombatTarget {
  private posX: number;
  private posZ: number;
  private hullHitTotal = 0;
  private weakPointHitTotal = 0;
  private damageTotal = 0;
  private lastKind: BossHitKind | null = null;
  private readonly hitListeners = new Set<(kind: BossHitKind, appliedDamage: number) => void>();

  // 검증 러너(run.mjs) Node 타입 스트리핑 호환 — 매개변수 프로퍼티 미사용
  private readonly port: BossPhasePort;
  private readonly placement: BossWeakPointPlacement;
  private params: BossWeakPointParams | null;

  constructor(
    port: BossPhasePort,
    placement: BossWeakPointPlacement,
    params: BossWeakPointParams | null = null,
  ) {
    this.port = port;
    this.placement = placement;
    this.params = params;
    this.posX = placement.x;
    this.posZ = placement.z;
  }

  /** 공식 약점 판정 수치 주입 (조립부) — null이면 unwired 유지 */
  attachParams(params: BossWeakPointParams | null): void {
    this.params = params;
  }

  /**
   * 판정 수치가 전부 확정됐는가. false면 판정 반경 0 — 어뢰가 약점을
   * 맞히지 못하고 누적 피해도 오르지 않는다(격파 판정 입력이 0으로 남는다).
   */
  get wired(): boolean {
    const params = this.params;
    return (
      params !== null &&
      params.hitRadiusMeters !== null &&
      params.hitRadiusMeters > 0 &&
      params.weakPointDamageMultiplier !== null &&
      params.weakPointDamageMultiplier >= 0 &&
      params.closedHullDamageMultiplier !== null &&
      params.closedHullDamageMultiplier >= 0
    );
  }

  // ── CombatTarget (기존 어뢰 단일 판정 경로 재사용) ─────────────────────

  get id(): number {
    return this.placement.id;
  }

  get faction(): FactionId {
    return 'hostile';
  }

  get positionX(): number {
    return this.posX;
  }

  get positionY(): number {
    return this.placement.y;
  }

  get positionZ(): number {
    return this.posZ;
  }

  get velocityX(): number {
    return 0;
  }

  get velocityZ(): number {
    return 0;
  }

  /** 미주입이면 0 — 판정 반경을 발명하지 않는다(명중이 성립하지 않는다) */
  get hitRadius(): number {
    return this.wired ? (this.params?.hitRadiusMeters as number) : 0;
  }

  /** 보스 이동 반영 — 포즈 공급은 리드 AI가 담당 (판정 위치 동기화 전용) */
  setPosition(x: number, z: number): void {
    this.posX = x;
    this.posZ = z;
  }

  /**
   * 본체 추적 (INT-CORE-022 §3) — 게임플레이 update 경로가 매 프레임
   * `weakPoint.syncTo(boss.getPosition())`으로 호출한다.
   *
   * 약점 배치는 월드 절대 좌표이고 본체 상대 오프셋이 아니므로, 스폰 이후
   * 본체가 움직이면 판정 위치도 따라가야 한다. y는 배치가 소유하므로
   * 수평면만 옮긴다(기존 `setPosition` 경로 재사용 — 별도 정본 없음).
   */
  syncTo(position: { readonly x: number; readonly z: number }): void {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
    this.setPosition(position.x, position.z);
  }

  /**
   * 약점 피격/일반 피격 구분 판정 — 개방 여부는 포트(리드 계약)만 사용.
   *
   * **구분은 params 없이도 성립한다**(개방 여부는 포트가 소유하는 사실이다).
   * 확정되지 않은 것은 배율뿐이므로, unwired면 종류만 기록하고 피해를 0으로
   * 둔다 — 임의 배율을 만들지 않는다.
   */
  onTorpedoHit(_hitX: number, _hitZ: number, damage: number): void {
    const kind: BossHitKind = this.port.weakPointOpen ? 'weakPoint' : 'hull';
    const multiplier = !this.wired
      ? 0
      : kind === 'weakPoint'
        ? (this.params?.weakPointDamageMultiplier as number)
        : (this.params?.closedHullDamageMultiplier as number);
    const applied = damage * multiplier;

    if (kind === 'weakPoint') this.weakPointHitTotal += 1;
    else this.hullHitTotal += 1;
    this.damageTotal += applied;
    this.lastKind = kind;

    for (const listener of [...this.hitListeners]) listener(kind, applied);
  }

  // ── 그래픽스 구독용 명시적 상태 (연출은 그래픽스 소유) ─────────────────

  /** 약점 활성 여부 — 포트 값 그대로 노출 (렌더 발광·개방 연출 입력) */
  get weakPointOpen(): boolean {
    return this.port.weakPointOpen;
  }

  /** 현재 보스 단계 (포트 패스스루) */
  get phase(): number {
    return this.port.phase;
  }

  get weakPointHits(): number {
    return this.weakPointHitTotal;
  }

  get hullHits(): number {
    return this.hullHitTotal;
  }

  /** 배율 적용 누적 피해 — 보스 격파 판정(리드 AI)의 입력 */
  get accumulatedDamage(): number {
    return this.damageTotal;
  }

  /** 마지막 피격 종류 (null = 미피격) — 렌더 피격 연출 구분 입력 */
  get lastHitKind(): BossHitKind | null {
    return this.lastKind;
  }

  /** 피격 통지 구독 (그래픽스·사운드 연출용) — 정식 이벤트 계약 제안 중 */
  onHit(listener: (kind: BossHitKind, appliedDamage: number) => void): () => void {
    this.hitListeners.add(listener);
    return () => this.hitListeners.delete(listener);
  }

  /**
   * 새 출항 — 피격 누적을 비운다. 배치·params는 유지한다.
   * (17차 R-M3 비상 컷은 '패턴 노출 플래그 오프'이지 판정 제거가 아니므로
   * 이 클래스는 컷 상황에서도 그대로 살아 있어야 한다.)
   */
  resetForNewSortie(): void {
    this.hullHitTotal = 0;
    this.weakPointHitTotal = 0;
    this.damageTotal = 0;
    this.lastKind = null;
    this.posX = this.placement.x;
    this.posZ = this.placement.z;
  }
}
