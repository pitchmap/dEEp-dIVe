/**
 * 탐지 게이지 **정본** — 계약 `DetectionSystem` production 구현 (C1).
 *
 * ## 단일 소유
 *
 * 게이지 수치와 계산식은 **이 시스템 하나**만 갖는다. HUD는
 * `DetectionHudView`, AI는 `DetectionStageSource`(stage만)를 읽으며 둘 다
 * 내부 mutable state에 접근하지 못한다 — 노출 API는 전부 값 복사본이다.
 * 소음·거리·심도로 게이지를 재계산하는 코드가 다른 곳에 생기면 계약 위반이다.
 *
 * ## 수치 출처와 unwired
 *
 * 확정 3종은 `params/detection.json`(주입): 잠망경 기준 만충 시간·심도
 * 보정·침묵 항행 배율. **거리 감쇠 곡선과 게이지 감소율은 공식 문서에
 * 없다** — `DetectionTuningParams`가 둘 중 하나라도 null이면 이 시스템은
 * `unwired`로 남아 **게이지 0·stage 'safe' 고정·전이 없음**이다.
 * 임의 증가율·감소율·거리 곡선을 만들지 않는다.
 *
 * stage 경계는 기존 계약 주석("0(안전)~1(만충=발각)")의 구조적 해석이다:
 * 0 = safe / 0~1 = searching / 1 = detected. 새 임계값을 도입하지 않는다.
 *
 * ## 출항 한정 상태
 *
 * 게이지·stage·마지막 노출 위치는 출항 시작·종료에서 초기화된다
 * (`SortieResettable`). 기지에서는 증가하지 않는다.
 *
 * ## 이 파일에 없는 것
 *
 * 추적 상태 머신(리드 `DestroyerAIController` 소유), 소나 FSM, 시야 차폐,
 * 피해·무기 판정. 새 추적 상태명을 만들지 않는다.
 */

import type {
  DetectionEnvironmentSource,
  DetectionHudView,
  DetectionStageSource,
  DetectionTuningParams,
} from '../../contracts/detection';
import type { DetectionStage } from '../../contracts/events';
import type { DetectionParams } from '../../contracts/params';
import type { SortieResettable } from '../../contracts/survival';
import type { DetectionSystem } from '../../contracts/systems';
import type { EventBus } from '../../core/EventBus';

/** 관측자(적 함선) 위치 단면 — 거리 감쇠 입력 */
export interface DetectionObserverView {
  readonly positionX: number;
  readonly positionZ: number;
}

/** 탐지 대상(플레이어) 위치 단면 */
export interface DetectionTargetView {
  readonly positionX: number;
  readonly positionZ: number;
}

export class SubmarineDetectionSystem
  implements DetectionSystem, DetectionStageSource, SortieResettable
{
  // 검증 러너(Node 타입 스트리핑) 호환 — 매개변수 프로퍼티 미사용
  private readonly bus: EventBus;
  private readonly environment: DetectionEnvironmentSource;
  private readonly target: DetectionTargetView;
  /** 관측자 목록 공급 — 일반 적대함·patrol 경비함·향후 호위함이 같은 계약 */
  private readonly observers: () => readonly DetectionObserverView[];
  private detectionParams: DetectionParams | null;
  private tuning: DetectionTuningParams | null;

  private gaugeValue = 0;
  private stageValue: DetectionStage = 'safe';
  private exposedX: number | null = null;
  private exposedZ: number | null = null;
  /** 이번 프레임 소음 입력 (외부 공급 — 미보고 시 환경 소스 값 사용) */
  private reportedNoise: number | null = null;

  constructor(
    bus: EventBus,
    environment: DetectionEnvironmentSource,
    target: DetectionTargetView,
    observers: () => readonly DetectionObserverView[],
    detectionParams: DetectionParams | null = null,
    tuning: DetectionTuningParams | null = null,
  ) {
    this.bus = bus;
    this.environment = environment;
    this.target = target;
    this.observers = observers;
    this.detectionParams = detectionParams;
    this.tuning = tuning;
  }

  /** 공식 탐지 params 주입 (조립부) — 확정 3종 */
  attachDetectionParams(params: DetectionParams | null): void {
    this.detectionParams = params;
  }

  /** 미확정 2종(거리 감쇠·감소율) 주입 — null이면 unwired 유지 */
  attachTuningParams(tuning: DetectionTuningParams | null): void {
    this.tuning = tuning;
    if (!this.wired) this.forceSafe();
  }

  /**
   * 게이지가 구동 가능한가. 확정 params와 미확정 2종이 **모두** 있어야
   * 한다 — 하나라도 없으면 게이지를 움직이지 않는다.
   */
  get wired(): boolean {
    return (
      this.detectionParams !== null &&
      this.tuning !== null &&
      this.tuning.distanceFalloff !== null &&
      this.tuning.gaugeDecayPerSecond !== null
    );
  }

  /* ── 계약 `DetectionSystem` ─────────────────────────────────────── */

  get gauge(): number {
    return this.gaugeValue;
  }

  get stage(): DetectionStage {
    return this.stageValue;
  }

  /** 소음 수준 입력 (0~1) — PlayerController·침묵 항행이 공급 */
  reportNoise(level: number): void {
    if (!Number.isFinite(level)) return;
    this.reportedNoise = Math.min(1, Math.max(0, level));
  }

  /**
   * 어뢰 발사 지점 **무조건 노출** (§5.10). 게이지 수치와 무관하게 위치가
   * 노출되며, 게이지가 구동 중이면 즉시 만충(발각)으로 올린다.
   * unwired여도 **노출 위치는 기록한다** — 위치 기록은 수치 발명이 아니다.
   */
  reportTorpedoLaunch(x: number, z: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    this.exposedX = x;
    this.exposedZ = z;
    if (!this.wired) return;
    this.setGauge(1);
  }

  /* ── 읽기 모델 ──────────────────────────────────────────────────── */

  /** HUD 소비 모델 — 값 복사본 (내부 상태 참조 없음) */
  hudView(): DetectionHudView {
    return { gauge: this.gaugeValue, stage: this.stageValue, unwired: !this.wired };
  }

  /** AI 소비 모델 — **stage와 마지막 노출 위치만** (게이지 비노출) */
  get stageSource(): DetectionStageSource {
    const self = this;
    return {
      get stage() {
        return self.stageValue;
      },
      get lastExposedPosition() {
        return self.lastExposedPosition;
      },
    };
  }

  get lastExposedPosition(): { readonly x: number; readonly z: number } | null {
    if (this.exposedX === null || this.exposedZ === null) return null;
    return { x: this.exposedX, z: this.exposedZ };
  }

  /* ── 시뮬레이션 ─────────────────────────────────────────────────── */

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    // 미확정 수치 상태에서는 게이지를 움직이지 않는다 (계약: 0 고정).
    if (!this.wired) {
      this.forceSafe();
      return;
    }

    const params = this.detectionParams as DetectionParams;
    const tuning = this.tuning as DetectionTuningParams;
    const fillSeconds = params.gaugeFillSecondsAtPeriscope.value;
    if (!(fillSeconds > 0)) {
      this.forceSafe();
      return;
    }

    const noise = this.effectiveNoise(params);
    const depthModifier = params.depthModifiers[this.environment.depthLayer] ?? 0;
    const proximity = this.nearestObserverFactor(tuning);
    // 만충 시간 기준 증가율 × 소음 × 심도 보정 × 거리 감쇠 (§5.6).
    const gain = (1 / fillSeconds) * noise * depthModifier * proximity;
    const decay = (tuning.gaugeDecayPerSecond as number);
    const delta = gain > 0 ? gain : -decay;
    this.setGauge(this.gaugeValue + delta * deltaSeconds);
  }

  /** 출항 시작·종료 초기화 — 게이지·stage·노출 위치 전부 (계약 reset 경계) */
  resetForNewSortie(): void {
    this.reportedNoise = null;
    this.exposedX = null;
    this.exposedZ = null;
    this.setGauge(0);
  }

  dispose(): void {
    this.resetForNewSortie();
  }

  /* ── 내부 ───────────────────────────────────────────────────────── */

  /** 침묵 항행 배율은 공식 확정값 — 여기서 만들지 않는다 */
  private effectiveNoise(params: DetectionParams): number {
    const base = this.reportedNoise ?? this.environment.noiseLevel;
    if (!Number.isFinite(base) || base <= 0) return 0;
    const clamped = Math.min(1, Math.max(0, base));
    return this.environment.silentRunning
      ? clamped * params.silentRunningNoiseMultiplier.value
      : clamped;
  }

  /**
   * 가장 가까운 관측자의 거리 감쇠 배율 (0~1).
   * `fullEffectMeters` 이내 = 1, `zeroEffectMeters` 이상 = 0, 사이는 선형.
   * 곡선 형태·경계는 전부 주입된 params 값이며 코드 상수가 아니다.
   * 관측자가 없으면 0 — 아무도 보고 있지 않으면 게이지가 오르지 않는다.
   */
  private nearestObserverFactor(tuning: DetectionTuningParams): number {
    const falloff = tuning.distanceFalloff;
    if (!falloff) return 0;
    let nearest = Number.POSITIVE_INFINITY;
    for (const observer of this.observers()) {
      const distance = Math.hypot(
        observer.positionX - this.target.positionX,
        observer.positionZ - this.target.positionZ,
      );
      if (distance < nearest) nearest = distance;
    }
    if (!Number.isFinite(nearest)) return 0;
    if (nearest <= falloff.fullEffectMeters) return 1;
    if (nearest >= falloff.zeroEffectMeters) return 0;
    const span = falloff.zeroEffectMeters - falloff.fullEffectMeters;
    return span > 0 ? 1 - (nearest - falloff.fullEffectMeters) / span : 0;
  }

  private forceSafe(): void {
    if (this.gaugeValue !== 0 || this.stageValue !== 'safe') this.setGauge(0);
  }

  /**
   * 게이지 갱신 + stage 파생 + 변경 시 `detectionChanged` 1회 발행.
   * **별도 alert 이벤트를 만들지 않는다** — 기존 이벤트가 유일한 전이 신호다.
   */
  private setGauge(next: number): void {
    const clamped = Math.min(1, Math.max(0, Number.isFinite(next) ? next : 0));
    const nextStage = stageOf(clamped);
    const changed = clamped !== this.gaugeValue || nextStage !== this.stageValue;
    // detected 진입 시점의 위치가 노출 위치다 (§5.10 어뢰 발사와 같은 체계).
    if (nextStage === 'detected' && this.stageValue !== 'detected') {
      this.exposedX = this.target.positionX;
      this.exposedZ = this.target.positionZ;
    }
    this.gaugeValue = clamped;
    this.stageValue = nextStage;
    if (changed) this.bus.emit('detectionChanged', { gauge: clamped, stage: nextStage });
  }
}

/**
 * stage 파생 — 기존 계약 주석의 구조적 해석이며 새 임계값이 아니다.
 * 0 = 안전 / 0 초과~미만 = 탐색 중 / 1(만충) = 발각.
 */
function stageOf(gauge: number): DetectionStage {
  if (gauge >= 1) return 'detected';
  if (gauge > 0) return 'searching';
  return 'safe';
}
