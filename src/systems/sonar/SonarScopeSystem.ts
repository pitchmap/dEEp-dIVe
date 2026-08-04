/**
 * 소나 스코프 판정 — 패시브 + 액티브 핑 (M2 5단계).
 *
 * 근거: 16차 결의 2-5(상단 텍스트 상태바 폐지 → 좌상단 다이제틱 스코프),
 * 17차 결의 4(입력 계약 = `noiseFactor` 단일 의존).
 *
 * ## 침묵 항행을 모른다 — 이게 이 파일의 핵심 제약이다
 *
 * 16차 규격은 "내 소음이 클수록 노이즈가 끼고 침묵 항행 시 가장 선명"이라고
 * 썼지만, 그걸 **불리언에 묶으면 침묵 항행 연결 시 밸런스를 두 번 잡게 된다**
 * (17차 안건 4). 그래서 이 시스템은 `silentRunning`을 **입력으로 받지
 * 않는다.** 오직 탐지 시스템이 이미 계산한 내 소음 계수 하나만 본다. 침묵
 * 항행이 연결되면 그 계수에 공식 배율이 곱해지고, 스코프는 **코드 변경 0**
 * 으로 자동으로 선명해진다.
 *
 * ## 패시브 / 액티브
 *
 * ```
 * 패시브(상시): 소음을 내는 접점만 · 방위만(거리 null) · 방위 번짐은
 *               내 소음 계수에 비례 → 청각 정보의 시각 '축약'
 * 액티브 핑:    모든 접점(보상·단서·지형·보스)을 정확히 표시(거리 포함)
 *               표시 시간 동안만 · 대가로 탐지 게이지 상승 · 쿨다운
 * ```
 *
 * 액티브 핑의 대가는 **기존 탐지 게이지 정본**에 적용된다 — 별도 노출 정본을
 * 만들지 않는다(`DetectionGaugeRisePort` → `SubmarineDetectionSystem`).
 *
 * ## 낙하 중 폭뢰
 *
 * 17차 결의 4: 패시브 스코프 표시 여부는 게임 룰이므로 `params`의 불리언이
 * 소유하고 **초기값은 false**(사운드 1차 정보 원칙의 보수적 해석)다.
 * 미주입(null)도 표시하지 않음으로 처리한다 — 두 경우 모두 '표시하지 않음'
 * 이므로 수치·정책을 발명하지 않는다.
 *
 * ## 이 파일에 없는 것
 *
 * 렌더(원형 스코프·테두리 색은 그래픽스·툴링 소유), 쿨다운·게이지 상승
 * **params 배관**(17차 창 4), 상단 상태바 제거(툴링), 문구·색.
 */

import type { DetectionStage } from '../../contracts/events';
import type { DetectionStageSource } from '../../contracts/detection';
import type { SonarBlip, SonarBlipKind, SonarScopeReadModel } from '../../contracts/sonar';
import { bowDirectionXZ } from '../../core/conventions';

/** 접점 분류 — 표시 분기용 태그 (판정은 `noiseEmitting`이 가른다) */
export type SonarContactKind = 'ship' | 'boss' | 'torpedo' | 'depthCharge';

/**
 * 공급 kind → 계약 정본 `SonarBlipKind`. 계약 어휘는 `ship | torpedo |
 * depthCharge` 셋뿐이므로(INT-RENDER-014) 보스는 **선박 접촉**으로 옮긴다.
 *
 * ⚠ 16차 결의 2-5의 액티브 핑 규격은 **보상·단서·지형**도 표시하라고 하지만
 * 계약에 해당 kind가 없다. 어휘를 임의로 늘리지 않고(계약 규칙: 확장은
 * INTEGRATION_NOTES 제안 → 리드 결정) 이 공급자는 표현 가능한 접촉만
 * 만든다 — 요청: INT-GAME-017.
 */
const CANONICAL_BLIP_KIND: Readonly<Record<SonarContactKind, SonarBlipKind>> = Object.freeze({
  ship: 'ship',
  boss: 'ship',
  torpedo: 'torpedo',
  depthCharge: 'depthCharge',
});

/** 접점 1개의 읽기 전용 단면 — 소유 시스템이 공급한다 */
export interface SonarContact {
  readonly contactId: string;
  readonly kind: SonarContactKind;
  readonly positionX: number;
  readonly positionZ: number;
  /**
   * 스스로 소음을 내는가 — **패시브 표시 자격**이다.
   * 금괴는 스크류음을 내지 않으므로 false이고, 그래서 액티브 핑이 필요하다
   * (16차 안건 2-5의 '소리 나는 것 / 소리 없는 것' 분리).
   */
  readonly noiseEmitting: boolean;
}

/** 관측자(잠수함) 위치·선수 방향 단면 */
export interface SonarObserverView {
  readonly positionX: number;
  readonly positionZ: number;
  readonly headingRadians: number;
}

/** 내 소음 계수 단면 — 탐지 시스템이 이미 계산한 값 하나 (17차 결의 4) */
export interface NoiseFactorSource {
  /** 0~1. 침묵 항행 배율이 이미 적용된 값이다 */
  readonly effectiveNoiseFactor: number;
}

/** 액티브 핑의 대가 — 기존 탐지 게이지 정본에 적용한다 */
export interface DetectionGaugeRisePort {
  raiseGauge(amount: number): void;
}

/** 스코프 수치 — 전부 공식 params 소유 (미확정이면 null) */
export interface SonarScopeParams {
  /** 액티브 핑 표시 지속 시간 (초) — 16차 결의 2-5 초기값 3.0 */
  readonly activePingDisplaySeconds: number | null;
  /** 액티브 핑 탐지 게이지 상승량 (0~1) — 16차 튜닝표 초기값 0.30 */
  readonly activePingDetectionGaugeRise: number | null;
  /** 액티브 핑 쿨다운 (초) — 16차 튜닝표 초기값 25 */
  readonly activePingCooldownSeconds: number | null;
  /** 내 소음 계수 1일 때의 방위 번짐 반폭 (rad) */
  readonly passiveBearingSpreadRadiansAtMaxNoise: number | null;
  /** 낙하 중 폭뢰를 패시브에 표시하는가 (17차 결의 4, 초기값 false) */
  readonly depthChargeOnPassiveScope: boolean | null;
}

/**
 * 표시 단면은 **공용 계약을 그대로 쓴다** — `contracts/sonar.ts`의
 * `SonarBlip`·`SonarScopeReadModel`(INT-RENDER-014). 게임플레이 로컬
 * 표시 모델을 따로 두지 않는다(정본 중복 금지). 계약이 요구하는 대로
 * blip에는 **월드 좌표를 싣지 않는다** — 방위·번짐·거리만 나간다.
 */

/** 핑 요청 결과 */
export type SonarPingOutcome =
  | { readonly status: 'pinged'; readonly gaugeRise: number }
  | { readonly status: 'cooldown'; readonly remainingSeconds: number }
  | { readonly status: 'unwired' };

export class SonarScopeSystem {
  // 검증 러너(run.mjs) Node 타입 스트리핑 호환 — 매개변수 프로퍼티 미사용
  private readonly observer: SonarObserverView;
  private readonly contacts: () => readonly SonarContact[];
  private noise: NoiseFactorSource | null;
  private gaugePort: DetectionGaugeRisePort | null;
  private params: SonarScopeParams | null;
  /** 테두리 상태 입력 — 기존 탐지 stage 정본 하나 (새 어휘 금지) */
  private stageSource: DetectionStageSource | null = null;

  private activeRemaining = 0;
  private cooldownRemaining = 0;
  /** 액티브 핑이 드러낸 접점 id — 핑 시점의 명단을 고정한다 */
  private revealed = new Set<string>();

  constructor(
    observer: SonarObserverView,
    contacts: () => readonly SonarContact[],
    params: SonarScopeParams | null = null,
    noise: NoiseFactorSource | null = null,
    gaugePort: DetectionGaugeRisePort | null = null,
  ) {
    this.observer = observer;
    this.contacts = contacts;
    this.params = params;
    this.noise = noise;
    this.gaugePort = gaugePort;
  }

  /** 공식 스코프 수치 주입 (조립부) — null이면 unwired 유지 */
  attachParams(params: SonarScopeParams | null): void {
    this.params = params;
    if (!this.wired) this.clearActive();
  }

  /** 내 소음 계수 공급 연결 — 탐지 시스템 하나가 유일한 출처다 */
  attachNoiseFactorSource(source: NoiseFactorSource | null): void {
    this.noise = source;
  }

  /** 액티브 핑 대가 적용처 연결 — 기존 탐지 게이지 정본 */
  attachDetectionGaugePort(port: DetectionGaugeRisePort | null): void {
    this.gaugePort = port;
  }

  /**
   * 테두리 상태 입력 연결 — 기존 `DetectionStageSource` 재사용.
   * 미연결이면 'safe'다(상태를 발명하지 않는다).
   */
  attachDetectionStageSource(source: DetectionStageSource | null): void {
    this.stageSource = source;
  }

  /** 액티브 핑 수치가 전부 확정됐는가 (패시브 번짐 폭 포함) */
  get wired(): boolean {
    const params = this.params;
    return (
      params !== null &&
      params.activePingDisplaySeconds !== null &&
      params.activePingDisplaySeconds > 0 &&
      params.activePingDetectionGaugeRise !== null &&
      params.activePingDetectionGaugeRise > 0 &&
      params.activePingCooldownSeconds !== null &&
      params.activePingCooldownSeconds >= 0 &&
      params.passiveBearingSpreadRadiansAtMaxNoise !== null &&
      params.passiveBearingSpreadRadiansAtMaxNoise >= 0
    );
  }

  /** 내 소음 계수 (0~1) — 미연결이면 0(가장 선명): 노이즈를 발명하지 않는다 */
  get noiseFactor(): number {
    const value = this.noise?.effectiveNoiseFactor;
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  get pingReady(): boolean {
    return this.wired && this.cooldownRemaining <= 0;
  }

  get activePingRemainingSeconds(): number {
    return this.activeRemaining;
  }

  get cooldownRemainingSeconds(): number {
    return this.cooldownRemaining;
  }

  /**
   * 액티브 핑 — '위치를 알 것인가, 위치를 알릴 것인가'(16차 결의 2-5).
   * 성공 시 그 순간의 접점 명단을 고정하고 **기존 탐지 게이지를 올린다**.
   */
  requestPing(): SonarPingOutcome {
    if (!this.wired) return { status: 'unwired' };
    if (this.cooldownRemaining > 0) {
      return { status: 'cooldown', remainingSeconds: this.cooldownRemaining };
    }
    const params = this.params as SonarScopeParams;
    this.activeRemaining = params.activePingDisplaySeconds as number;
    this.cooldownRemaining = params.activePingCooldownSeconds as number;
    this.revealed = new Set(this.contacts().map((contact) => contact.contactId));
    const gaugeRise = params.activePingDetectionGaugeRise as number;
    this.gaugePort?.raiseGauge(gaugeRise);
    return { status: 'pinged', gaugeRise };
  }

  update(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    if (this.activeRemaining > 0) {
      this.activeRemaining = Math.max(0, this.activeRemaining - deltaSeconds);
      if (this.activeRemaining === 0) this.revealed.clear();
    }
    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - deltaSeconds);
    }
  }

  /**
   * 공용 계약 `SonarScopeReadModel` 공급 (INT-RENDER-014).
   * unwired 자세는 계약이 명시한 그대로다 — blips 빈 배열 · pingReady false ·
   * 타이머 0 · noiseFactor 0 · ringState 'safe' 고정.
   */
  readModel(): SonarScopeReadModel {
    if (!this.wired) {
      return {
        unwired: true,
        noiseFactor: 0,
        blips: [],
        activePingRemainingSeconds: 0,
        cooldownRemainingSeconds: 0,
        pingReady: false,
        ringState: 'safe',
      };
    }
    return {
      unwired: false,
      noiseFactor: this.noiseFactor,
      blips: this.buildBlips(),
      activePingRemainingSeconds: this.activeRemaining,
      cooldownRemainingSeconds: this.cooldownRemaining,
      pingReady: this.pingReady,
      ringState: this.ringState,
    };
  }

  /**
   * 스코프 테두리 상태 — **기존 `DetectionStage`를 그대로 재사용**한다
   * (새 어휘 금지). 탐지 소스 미연결이면 'safe'.
   */
  get ringState(): DetectionStage {
    return this.stageSource?.stage ?? 'safe';
  }

  resetForNewSortie(): void {
    this.clearActive();
    this.cooldownRemaining = 0;
  }

  dispose(): void {
    this.resetForNewSortie();
  }

  /* ── 내부 ───────────────────────────────────────────────────────── */

  private clearActive(): void {
    this.activeRemaining = 0;
    this.revealed.clear();
  }

  private buildBlips(): readonly SonarBlip[] {
    // 미주입이면 표시하지 않는다 — 임의의 번짐·표시 규칙을 만들지 않는다.
    if (!this.wired) return [];
    const params = this.params as SonarScopeParams;
    const spread =
      (params.passiveBearingSpreadRadiansAtMaxNoise as number) * this.noiseFactor;
    const active = this.activeRemaining > 0;
    const blips: SonarBlip[] = [];

    for (const contact of this.contacts()) {
      const revealed = active && this.revealed.has(contact.contactId);
      if (!revealed && !this.passiveVisible(contact, params)) continue;
      const dx = contact.positionX - this.observer.positionX;
      const dz = contact.positionZ - this.observer.positionZ;
      // 계약 규칙: blip에 **월드 좌표를 싣지 않는다** — 방위·번짐·거리만.
      blips.push({
        targetId: contact.contactId,
        kind: CANONICAL_BLIP_KIND[contact.kind],
        bearingRadians: this.relativeBearing(dx, dz),
        // 액티브로 드러난 접점은 정확하다 — 번짐 0.
        bearingSpreadRadians: revealed ? 0 : spread,
        // 패시브는 거리를 주지 않는다(16차 규격: 거리는 부정확).
        distanceMeters: revealed ? Math.hypot(dx, dz) : null,
        fromActivePing: revealed,
      });
    }
    return blips;
  }

  /**
   * 패시브 표시 자격 — **소음을 내는 접점만**.
   * 낙하 중 폭뢰는 소음을 내더라도 정책 불리언이 명시적으로 true일 때만
   * 표시한다 (17차 결의 4, 초기값·미주입 전부 false = 표시 안 함).
   */
  private passiveVisible(contact: SonarContact, params: SonarScopeParams): boolean {
    if (!contact.noiseEmitting) return false;
    if (contact.kind === 'depthCharge') return params.depthChargeOnPassiveScope === true;
    return true;
  }

  /**
   * 잠수함 선수 기준 상대 방위 (rad, -π~π).
   * 선수 벡터는 축 규약 함수(`bowDirectionXZ`)에서만 얻는다 — 숫자·벡터를
   * 여기서 복제하지 않는다 (AGENTS.md §5).
   */
  private relativeBearing(dx: number, dz: number): number {
    const bow = bowDirectionXZ(this.observer.headingRadians);
    // 선수 기준 회전각: 외적(부호) / 내적(크기)
    const cross = bow.x * dz - bow.z * dx;
    const dot = bow.x * dx + bow.z * dz;
    return Math.atan2(cross, dot);
  }
}
