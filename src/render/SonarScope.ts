/**
 * 소나 스코프 — 좌측 상단 원형 다이제틱 계기 (2D 캔버스, 화면 높이 18% 이하).
 *
 * 경계 (판정 계산 금지 — 표시 매핑만):
 *  - 탐지 단계·게이지: 계약 `DetectionHudView`(hudView()) 소비만. unwired면
 *    빗금 + '계기 미연결'로 정지 상태를 그대로 노출한다 (작동 위장 금지).
 *  - 공격태세: 계약 `TrackingStateSource.trackedShips`의 state==='attack'
 *    존재 여부만 읽는다 — 렌더가 추적 단계를 재판정하지 않는다.
 *  - 패시브 소음원: `ShipWorldSource`의 실제 개체 위치 → 방위·개략 거리로
 *    **매핑**만 한다 (GuardDirectionIndicator와 같은 관례). 세력·식별
 *    정보는 표시하지 않는다 — 미식별 세력 조기 노출 금지(B2)와 합치.
 *  - 자기 소음: `noiseChanged` 이벤트 값(0~1)을 노이즈 그레인·링으로 표현.
 *    소음 정책·수치는 게임플레이 소유 — 여기서 재계산하지 않는다.
 *  - 액티브 핑: `SonarPingSource` 주입 시에만 대상 블립을 핑 표시 시간 동안
 *    그린다. **미주입 = 미표시** (게임플레이 핑 메커니즘 부재 시 기능을
 *    지어내지 않는다). 정식 계약 이관은 INT-RENDER-014.
 *
 * 성능: 캔버스 리드로우는 redrawHz로 상한 (기본 15Hz), WebGL 드로우 콜 0.
 * 수치는 전부 renderVisualParams.json artDirection.sonarScope 소유.
 */

import type { DetectionHudView, TrackingStateSource } from '../contracts/detection';
import type { ShipWorldSource } from '../systems/faction/ShipWorldSource';
import visualParams from './renderVisualParams.json';

const SCOPE = visualParams.sonarScope;

/** 탐지 뷰 소스 — DetectionHud와 동일 소비 형태 (호출마다 새 뷰) */
export interface SonarDetectionSource {
  hudView(): DetectionHudView;
}

/**
 * 액티브 핑 대상 소스 — 게임플레이가 핑 메커니즘을 구현하면 주입한다.
 * ageSeconds는 핑 발신 후 경과 시간(판정측 계산) — 렌더는 표시 시간만 관리.
 */
export interface SonarPingSource {
  readonly pings: readonly {
    readonly x: number;
    readonly z: number;
    readonly ageSeconds: number;
  }[];
}

export class SonarScope {
  private readonly rootElement: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;

  private detectionSource: SonarDetectionSource | null = null;
  private trackingSource: TrackingStateSource | null = null;
  private contactsSource: ShipWorldSource | null = null;
  private pingSource: SonarPingSource | null = null;

  private noiseLevel = 0;
  private elapsed = 0;
  private redrawAccumulator = 0;
  private visible = true;

  constructor(host: HTMLElement) {
    this.rootElement = document.createElement('div');
    this.rootElement.setAttribute('data-render-sonar-scope', '');
    // 좌측 상단 (16차 결의 — 함내 계기판 다이제틱, 화면 높이 18% 이하).
    // production에서 이 구석은 비어 있다 — 조작 안내(약 33vh~)와 겹치지 않고,
    // dev 전용 성능 오버레이·QA 배지와의 겹침은 개발 모드 한정이다.
    this.rootElement.style.cssText = [
      'position:absolute',
      'left:0.75rem',
      'top:0.75rem',
      // 화면 높이 18% 이하 (연출값 소유: sonarScope.sizeViewportHeightRatio)
      `width:${SCOPE.sizeViewportHeightRatio * 100}vh`,
      `height:${SCOPE.sizeViewportHeightRatio * 100}vh`,
      'pointer-events:none',
      'z-index:32', // 재화·탐지·생존 HUD와 같은 계기 층
    ].join(';');
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%';
    this.rootElement.appendChild(this.canvas);
    host.appendChild(this.rootElement);
    this.context = this.canvas.getContext('2d');
  }

  attachDetectionSource(source: SonarDetectionSource): void {
    this.detectionSource = source;
  }

  attachTrackingSource(source: TrackingStateSource): void {
    this.trackingSource = source;
  }

  attachContactsSource(source: ShipWorldSource): void {
    this.contactsSource = source;
  }

  attachPingSource(source: SonarPingSource): void {
    this.pingSource = source;
  }

  /** `noiseChanged` 이벤트 값 주입 — 조립부(CanyonScene 구독)가 전달 */
  setNoiseLevel(level: number): void {
    this.noiseLevel = Math.min(Math.max(level, 0), 1);
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.rootElement.style.display = visible ? 'block' : 'none';
  }

  /**
   * 매 프레임 — 리드로우는 redrawHz 상한. 방위는 선수 기준(위 = 선수).
   * @param headingRadians 계약 포즈의 선수 방위
   * @param selfX/selfZ 계약 포즈의 수평 위치 (방위·개략 거리 매핑용)
   */
  update(deltaSeconds: number, headingRadians: number, selfX: number, selfZ: number): void {
    if (!this.visible || !this.context) return;
    this.elapsed += deltaSeconds;
    this.redrawAccumulator += deltaSeconds;
    if (this.redrawAccumulator < 1 / SCOPE.redrawHz) return;
    this.redrawAccumulator = 0;

    // 캔버스 픽셀 크기 동기화 (뷰포트 변화 대응)
    const sizePx = Math.max(this.rootElement.clientHeight, 40);
    if (this.canvas.width !== sizePx) {
      this.canvas.width = sizePx;
      this.canvas.height = sizePx;
    }
    const ctx = this.context;
    const center = sizePx / 2;
    const radius = center - 3;

    const view = this.detectionSource?.hudView() ?? null;
    const attackPosture =
      this.trackingSource?.trackedShips.some((ship) => ship.state === 'attack') ?? false;

    ctx.clearRect(0, 0, sizePx, sizePx);
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.clip();

    // 배경 + 거리 링 2개
    ctx.fillStyle = 'rgba(4,14,19,0.82)';
    ctx.fillRect(0, 0, sizePx, sizePx);
    ctx.strokeStyle = 'rgba(110,160,165,0.18)';
    ctx.lineWidth = 1;
    for (const ringRatio of [0.42, 0.8]) {
      ctx.beginPath();
      ctx.arc(center, center, radius * ringRatio, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (view && view.unwired) {
      // 계기 미연결 — 빗금 + 문구 (게이지 작동 위장 금지 관례)
      ctx.strokeStyle = 'rgba(150,170,175,0.25)';
      for (let x = -sizePx; x < sizePx; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + sizePx, sizePx);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(200,215,220,0.8)';
      ctx.font = `${Math.max(9, sizePx * 0.07)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('계기 미연결', center, center + 4);
    } else {
      this.drawSweep(ctx, center, radius);
      this.drawContacts(ctx, center, radius, headingRadians, selfX, selfZ);
      this.drawPings(ctx, center, radius, headingRadians, selfX, selfZ);
      this.drawSelfNoise(ctx, center, radius);
    }
    ctx.restore();

    // 테두리 상태색 — 적색: 공격태세 / 황색: 탐지 중 / 청록: 미탐지
    const borderColor = attackPosture
      ? SCOPE.colorAttack
      : view && view.stage !== 'safe'
        ? SCOPE.colorWary
        : SCOPE.colorSafe;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** 회전 스윕 라인 — 패시브 스코프의 다이제틱 연출 */
  private drawSweep(ctx: CanvasRenderingContext2D, center: number, radius: number): void {
    const angle =
      ((this.elapsed % SCOPE.sweepSecondsPerRevolution) / SCOPE.sweepSecondsPerRevolution) *
      Math.PI * 2;
    const gradient = ctx.createLinearGradient(
      center, center,
      center + Math.sin(angle) * radius,
      center - Math.cos(angle) * radius,
    );
    gradient.addColorStop(0, 'rgba(90,200,190,0)');
    gradient.addColorStop(1, 'rgba(90,200,190,0.35)');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + Math.sin(angle) * radius, center - Math.cos(angle) * radius);
    ctx.stroke();
  }

  /** 월드 좌표 → 스코프 좌표 (위 = 선수). 개략 거리로 반경 클램프 */
  private toScope(
    center: number,
    radius: number,
    headingRadians: number,
    selfX: number,
    selfZ: number,
    x: number,
    z: number,
  ): { px: number; py: number; clamped: boolean } {
    const dx = x - selfX;
    const dz = z - selfZ;
    // 월드 방위(-Z=북 관례) → 선수 기준 상대각
    const bearing = Math.atan2(-dx, -dz) - headingRadians;
    const distance = Math.hypot(dx, dz);
    const ratio = Math.min(distance / SCOPE.rangeMeters, 0.92);
    return {
      px: center + -Math.sin(bearing) * ratio * radius,
      py: center - Math.cos(bearing) * ratio * radius,
      clamped: distance > SCOPE.rangeMeters,
    };
  }

  /** 패시브 소음원 — 방위 + 번짐 블롭 (세력·식별 미표시) */
  private drawContacts(
    ctx: CanvasRenderingContext2D,
    center: number,
    radius: number,
    headingRadians: number,
    selfX: number,
    selfZ: number,
  ): void {
    const views = this.contactsSource?.shipViews ?? [];
    for (const view of views) {
      if (!view.alive) continue;
      const point = this.toScope(
        center, radius, headingRadians, selfX, selfZ,
        view.positionX, view.positionZ,
      );
      const blur = radius * SCOPE.contactBlurRadians * (point.clamped ? 1.6 : 1);
      const gradient = ctx.createRadialGradient(
        point.px, point.py, 0, point.px, point.py, blur,
      );
      gradient.addColorStop(0, `${SCOPE.contactColor}cc`);
      gradient.addColorStop(1, `${SCOPE.contactColor}00`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(point.px, point.py, blur, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 액티브 핑 대상 — 소스 주입 시에만, 표시 시간 내 밝은 블립 + 페이드 */
  private drawPings(
    ctx: CanvasRenderingContext2D,
    center: number,
    radius: number,
    headingRadians: number,
    selfX: number,
    selfZ: number,
  ): void {
    const pings = this.pingSource?.pings ?? [];
    for (const ping of pings) {
      if (ping.ageSeconds > SCOPE.pingDisplaySeconds) continue;
      const fade = 1 - ping.ageSeconds / SCOPE.pingDisplaySeconds;
      const point = this.toScope(
        center, radius, headingRadians, selfX, selfZ, ping.x, ping.z,
      );
      ctx.strokeStyle = `rgba(120,230,220,${0.9 * fade})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.px, point.py, 3 + (1 - fade) * 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(170,245,238,${fade})`;
      ctx.beginPath();
      ctx.arc(point.px, point.py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 자기 소음 — 중심 링 + 그레인 (noiseChanged 값의 표현) */
  private drawSelfNoise(ctx: CanvasRenderingContext2D, center: number, radius: number): void {
    ctx.fillStyle = 'rgba(190,230,226,0.9)';
    ctx.beginPath();
    ctx.arc(center, center, 2, 0, Math.PI * 2);
    ctx.fill();
    if (this.noiseLevel <= 0.01) return;
    const pulse = (this.elapsed % 1.2) / 1.2;
    ctx.strokeStyle = `${SCOPE.noiseRingColor}${Math.round((1 - pulse) * this.noiseLevel * 160)
      .toString(16).padStart(2, '0')}`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(center, center, 3 + pulse * radius * 0.4 * this.noiseLevel, 0, Math.PI * 2);
    ctx.stroke();
    // 노이즈 그레인 — 결정적(시간 파생) 스펙클, 개수 ∝ noiseLevel
    const grains = Math.floor(this.noiseLevel * 26);
    ctx.fillStyle = 'rgba(140,200,195,0.3)';
    const seed = Math.floor(this.elapsed * SCOPE.redrawHz);
    for (let i = 0; i < grains; i += 1) {
      const h1 = fract(Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453);
      const h2 = fract(Math.sin(seed * 39.346 + i * 11.135) * 24634.6345);
      const grainRadius = Math.sqrt(h1) * radius * 0.9;
      const grainAngle = h2 * Math.PI * 2;
      ctx.fillRect(
        center + Math.cos(grainAngle) * grainRadius,
        center + Math.sin(grainAngle) * grainRadius,
        1.5, 1.5,
      );
    }
  }

  dispose(): void {
    this.rootElement.remove();
  }
}

function fract(value: number): number {
  return value - Math.floor(value);
}
