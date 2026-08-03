/**
 * 침수 결정적 코어 (INT-CORE-014, C5).
 *
 * 책임(공용 코어): 피해가 더한 침수량 적용 · **프레임률 독립** 누적 ·
 * 단계 전이 계산 · 출항 초기화 · 스냅샷 제공.
 *
 * 여기에 없는 것:
 *  - 침수로 인한 이동 성능 저하·조작 불능 — **공식 결정이 없어 만들지 않는다**
 *  - 수리·배수 미니게임 (C 범위 밖)
 *  - 시각 표현(X-ray 침수 연출은 그래픽스 소유)
 *  - 수치 — 단계 경계·확산율·선체 피해율은 전부 `FloodingParams`(C9 [COMBAT]
 *    이관 대상, **현재 params에 없음**)로 주입된다. 미주입이면 `unwired`이며
 *    침수는 증가하지 않는다(임시 수치 생성 금지).
 *
 * 결정성: 누적은 `level += rate × dt`로만 하고 프레임 수에 의존하지 않는다.
 * dt를 반으로 나눠 두 번 호출한 결과와 한 번 호출한 결과가 같다.
 */

import type { FloodingParams, FloodingSnapshot, FloodingStage } from '../contracts/survival';

export class FloodingCore {
  private params: FloodingParams | null;
  private levelValue = 0;

  constructor(params: FloodingParams | null = null) {
    this.params = params;
  }

  /** 공식 침수 수치 주입 (C9 [COMBAT] 이관 후) */
  attachParams(params: FloodingParams | null): void {
    this.params = params;
  }

  get wired(): boolean {
    return this.params !== null;
  }

  get level(): number {
    return this.levelValue;
  }

  get stage(): FloodingStage {
    return this.stageOf(this.levelValue);
  }

  /** 현재 확산율(초당) — 침수가 시작된 뒤에만 흐른다 */
  get ratePerSecond(): number {
    if (!this.params || this.levelValue <= 0 || this.levelValue >= 1) return 0;
    return this.params.spreadPerSecond;
  }

  snapshot(): FloodingSnapshot {
    return {
      level: this.levelValue,
      stage: this.stage,
      ratePerSecond: this.ratePerSecond,
      unwired: this.params === null,
    };
  }

  /**
   * 피해가 유발한 침수량 추가.
   * 반환값은 실제로 더해진 양 (미연결·비정상 입력이면 0).
   */
  addContribution(amount: number): number {
    if (!this.params) return 0;
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const before = this.levelValue;
    this.levelValue = Math.min(1, this.levelValue + amount);
    return this.levelValue - before;
  }

  /**
   * 시간 경과 누적. 반환값은 이번 구간에 침수가 유발한 **선체 피해량** —
   * 호출측(PlayerHullSystem)이 이 값으로 DamageRequest를 만들어 단일 창구
   * (`DamageReceiverPort.applyDamage`)를 통과시킨다. 여기서 선체를 직접
   * 수정하지 않는다.
   *
   * 결정성: 피해 = rate × ∫level(t)dt 의 **닫힌 적분식**(수위는 구간 안에서
   * 선형 증가·1.0 클램프)이므로, dt를 어떻게 분할해도 총 피해가 같다 —
   * update(a+b) = update(a)+update(b) (부동소수 오차 범위 내).
   */
  update(deltaSeconds: number): number {
    const params = this.params;
    if (!params) return 0;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
    if (this.levelValue <= 0) return 0;

    const levelBefore = this.levelValue;
    const spread = params.spreadPerSecond;
    let levelAfter: number;
    let levelIntegral: number;
    if (spread <= 0) {
      levelAfter = levelBefore;
      levelIntegral = levelBefore * deltaSeconds;
    } else {
      const unclamped = levelBefore + spread * deltaSeconds;
      if (unclamped <= 1) {
        levelAfter = unclamped;
        levelIntegral = ((levelBefore + levelAfter) / 2) * deltaSeconds;
      } else {
        // 구간 중간에 1.0 도달 — 도달 시점까지 사다리꼴 + 이후 상수 구간
        const timeToFull = (1 - levelBefore) / spread;
        levelAfter = 1;
        levelIntegral = ((levelBefore + 1) / 2) * timeToFull + (deltaSeconds - timeToFull);
      }
    }
    this.levelValue = levelAfter;
    return params.hullDamagePerSecondAtFull * levelIntegral;
  }

  /** 출항 한정 상태 — 새 출항마다 초기화된다 (기지에서는 침수 없음) */
  resetForNewSortie(): void {
    this.levelValue = 0;
  }

  private stageOf(level: number): FloodingStage {
    const params = this.params;
    if (!params || level <= 0) return 'none';
    if (level >= params.catastrophicThreshold) return 'catastrophic';
    if (level >= params.majorThreshold) return 'major';
    if (level >= params.minorThreshold) return 'minor';
    return 'none';
  }
}
