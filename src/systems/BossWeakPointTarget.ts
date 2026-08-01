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

export interface BossWeakPointConfig {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 명중 판정 반경 (통짜 캡슐 근사 — 회의 11 결의 5) */
  readonly hitRadius: number;
  /** 약점 개방 중 피해 배율 (임시값 — INT-GAME-008 이관 대기) */
  readonly weakPointDamageMultiplier: number;
  /** 약점 닫힘 중(일반 선체) 피해 배율 (임시값) */
  readonly closedHullDamageMultiplier: number;
}

/** 임시 기본 판정 수치 (R7 — params 이관 대기, INT-GAME-008) */
export function provisionalBossWeakPointConfig(id: number, x: number, y: number, z: number): BossWeakPointConfig {
  return {
    id,
    x,
    y,
    z,
    hitRadius: 6,
    weakPointDamageMultiplier: 2.0,
    closedHullDamageMultiplier: 0.25,
  };
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
  private readonly config: BossWeakPointConfig;

  constructor(port: BossPhasePort, config: BossWeakPointConfig) {
    this.port = port;
    this.config = config;
    this.posX = config.x;
    this.posZ = config.z;
  }

  // ── CombatTarget (기존 어뢰 단일 판정 경로 재사용) ─────────────────────

  get id(): number {
    return this.config.id;
  }

  get faction(): FactionId {
    return 'hostile';
  }

  get positionX(): number {
    return this.posX;
  }

  get positionY(): number {
    return this.config.y;
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

  get hitRadius(): number {
    return this.config.hitRadius;
  }

  /** 보스 이동 반영 — 포즈 공급은 리드 AI가 담당 (판정 위치 동기화 전용) */
  setPosition(x: number, z: number): void {
    this.posX = x;
    this.posZ = z;
  }

  /** 약점 피격/일반 피격 구분 판정 — 개방 여부는 포트(리드 계약)만 사용 */
  onTorpedoHit(_hitX: number, _hitZ: number, damage: number): void {
    const kind: BossHitKind = this.port.weakPointOpen ? 'weakPoint' : 'hull';
    const multiplier =
      kind === 'weakPoint'
        ? this.config.weakPointDamageMultiplier
        : this.config.closedHullDamageMultiplier;
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
}
