/**
 * 전투 표적 등록소 — 게임플레이 소유.
 *
 * 어뢰 명중 판정과 리드샷 보조선(§5.8)이 **같은 표적 목록**을 읽는다:
 *  - 어뢰(StraightRunTorpedoSystem): 위치·hitRadius로 명중 판정
 *  - 리드샷 보조선(HUD·렌더): 위치·속도를 읽어 어뢰 속력 기준 리드 지점 계산
 *
 * 표적 구현체(화물선 시스템 — D6~D9, §5.9)는 살아 있는 상태 객체를 등록한다.
 * 자동 락온은 구현하지 않는다 [확정 — 수동 조준 + 보조선이 기본].
 */

/** 어뢰가 명중 가능한 수상 표적의 읽기 전용 상태 + 명중 통지 진입점 */
export interface CombatTarget {
  /** 식별자 (예: 'cargo-1') — 등록 중복·디버깅용 */
  readonly id: string;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  /** 수평 속도 (m/s) — 리드샷 보조선 계산 입력 */
  readonly velocityX: number;
  readonly velocityZ: number;
  /** 명중 판정 반경 (수평면) — 함선 크기 근사 */
  readonly hitRadius: number;
  /**
   * 어뢰 명중 통지 — 어뢰 1발당 정확히 1회만 호출된다 (중복 명중 없음).
   * 격침·피해 규칙(1발 격침 §5.9)은 표적 소유 시스템이 결정한다.
   */
  onTorpedoHit(hitX: number, hitZ: number): void;
}

export class TargetRegistry {
  private targets: CombatTarget[] = [];

  /** 읽기 전용 표적 목록 — 명중 판정·리드샷 보조선 공용 */
  get list(): readonly CombatTarget[] {
    return this.targets;
  }

  /** 표적 등록. 반환된 함수로 등록 해제한다 (격침·장면 정리 시) */
  register(target: CombatTarget): () => void {
    if (!this.targets.includes(target)) this.targets.push(target);
    return () => this.unregister(target);
  }

  unregister(target: CombatTarget): void {
    this.targets = this.targets.filter((existing) => existing !== target);
  }

  clear(): void {
    this.targets = [];
  }
}
