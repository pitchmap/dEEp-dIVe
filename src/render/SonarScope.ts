/**
 * 소나 스코프 — 좌측 상단 원형 다이제틱 계기 (2D 캔버스, 화면 높이 18% 이하).
 *
 * 정본 계약: `src/contracts/sonar.ts`의 `SonarScopeReadModel` **하나만 소비**한다.
 *  - blip은 bearing·spread·distance·kind 형태 그대로 그린다 — 월드 좌표·
 *    엔티티 시스템을 직접 읽어 방위·거리를 재계산하지 않는다.
 *  - 자기 소음은 `noiseFactor` 하나 — 침묵 항행 등 원인 정보는 받지도
 *    그리지도 않는다 [17차 결의 4].
 *  - 폭뢰 blip 노출 필터(depthChargeOnPassiveScope)는 **공급 시점에 완료**돼
 *    있다 — 렌더는 받은 blips를 kind로 걸러내거나 추가하지 않는다.
 *  - 액티브 핑은 read model의 실제 상태(activePingRemainingSeconds·
 *    fromActivePing)가 있을 때만 표시한다 — 가짜 핑 없음.
 *  - 테두리는 `ringState`(DetectionStage 재사용): safe 청록 / searching 황 /
 *    detected 적.
 *  - unwired(또는 공급자 미주입) = 빗금 + '계기 미연결' — 작동 위장 금지.
 *
 * 성능: 캔버스 리드로우 redrawHz 상한(기본 15Hz), WebGL 드로우 콜 0.
 * 수치는 renderVisualParams.json artDirection.sonarScope 소유.
 */

import type { SonarBlipKind, SonarScopeReadModel } from '../contracts/sonar';
import visualParams from './renderVisualParams.json';

const SCOPE = visualParams.sonarScope;

/**
 * kind별 색 — 받은 kind로만 분기한다 (재추측·재분류 금지, INT-CORE-022).
 * 탐색 4종은 계약상 액티브 핑 노출 중에만 공급된다 — 여기서 필터링하지
 * 않는다(공급 규칙은 게임플레이 소유).
 */
const BLIP_COLORS: Readonly<Record<SonarBlipKind, string>> = Object.freeze({
  ship: SCOPE.contactColor,
  torpedo: SCOPE.blipTorpedoColor,
  depthCharge: SCOPE.blipDepthChargeColor,
  goldCache: SCOPE.blipGoldCacheColor,
  salvage: SCOPE.blipSalvageColor,
  clue: SCOPE.blipClueColor,
  deepSite: SCOPE.blipDeepSiteColor,
});

/**
 * 거리 미상 방위 호의 kind별 대시 패턴 — 저품질·색약 환경에서도 색 외
 * 채널로 구분되게 한다 (빈 배열 = 실선).
 */
const ARC_DASH: Readonly<Record<SonarBlipKind, readonly number[]>> = Object.freeze({
  ship: [],
  torpedo: [6, 3],
  depthCharge: [2, 3],
  goldCache: [4, 2],
  salvage: [4, 2],
  clue: [4, 2],
  deepSite: [4, 2],
});

/**
 * 읽기 모델 폴링 소스 — 게임플레이 공급자를 composition root가 주입한다
 * (`detectionHudView()`와 같은 호출형 단면 관례). 미주입 = 계기 미연결 표시.
 */
export interface SonarScopeSource {
  scopeView(): SonarScopeReadModel;
}

export class SonarScope {
  private readonly rootElement: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D | null;

  private source: SonarScopeSource | null = null;
  private elapsed = 0;
  private redrawAccumulator = 0;
  private visible = true;

  constructor(host: HTMLElement) {
    this.rootElement = document.createElement('div');
    this.rootElement.setAttribute('data-render-sonar-scope', '');
    // 좌측 상단 (16차 결의 — 함내 계기판 다이제틱, 화면 높이 18% 이하).
    // production에서 이 구석은 비어 있다 — dev 전용 성능 오버레이·QA 배지와의
    // 겹침은 개발 모드 한정이다.
    this.rootElement.style.cssText = [
      'position:absolute',
      'left:0.75rem',
      'top:0.75rem',
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

  /** 공급자 주입 — composition root 1회. 미주입 동안은 '계기 미연결' */
  attachSource(source: SonarScopeSource): void {
    this.source = source;
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.rootElement.style.display = visible ? 'block' : 'none';
  }

  /** 매 프레임 — 리드로우는 redrawHz 상한. 방위 기준(위 = 선수)은 공급값 그대로 */
  update(deltaSeconds: number): void {
    if (!this.visible || !this.context) return;
    this.elapsed += deltaSeconds;
    this.redrawAccumulator += deltaSeconds;
    if (this.redrawAccumulator < 1 / SCOPE.redrawHz) return;
    this.redrawAccumulator = 0;

    const sizePx = Math.max(this.rootElement.clientHeight, 40);
    if (this.canvas.width !== sizePx) {
      this.canvas.width = sizePx;
      this.canvas.height = sizePx;
    }
    const ctx = this.context;
    const center = sizePx / 2;
    const radius = center - 3;

    const view = this.source?.scopeView() ?? null;

    ctx.clearRect(0, 0, sizePx, sizePx);
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = 'rgba(4,14,19,0.82)';
    ctx.fillRect(0, 0, sizePx, sizePx);
    ctx.strokeStyle = 'rgba(110,160,165,0.18)';
    ctx.lineWidth = 1;
    for (const ringRatio of [0.42, 0.8]) {
      ctx.beginPath();
      ctx.arc(center, center, radius * ringRatio, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (!view || view.unwired) {
      // 공급자 미주입 또는 params 미확정 — 빗금 + 문구 (작동 위장 금지)
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
      ctx.restore();
      this.strokeBorder(ctx, center, radius, SCOPE.colorSafe);
      return;
    }

    this.drawSweep(ctx, center, radius);
    this.drawBlips(ctx, center, radius, view);
    this.drawSelfNoise(ctx, center, radius, view.noiseFactor);
    this.drawPingStatus(ctx, center, radius, view);
    ctx.restore();

    // 테두리 상태색 — ringState(DetectionStage) 그대로 매핑
    const borderColor =
      view.ringState === 'detected'
        ? SCOPE.colorAttack
        : view.ringState === 'searching'
          ? SCOPE.colorWary
          : SCOPE.colorSafe;
    this.strokeBorder(ctx, center, radius, borderColor);
  }

  private strokeBorder(
    ctx: CanvasRenderingContext2D,
    center: number,
    radius: number,
    color: string,
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** 회전 스윕 라인 — 패시브 스코프의 다이제틱 연출 (판정 무관) */
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

  /**
   * blip — 공급된 bearing·spread·distance·kind 그대로 그린다 (7종 정본
   * `SonarBlipKind` — 받은 kind로만 분기, 필터링·추가·재분류 없음).
   *  - distance null(패시브 청음): 외곽 링 위 방위 호(번짐 폭 = spread,
   *    kind별 대시 패턴 — 색 외 채널).
   *  - distance 있음: 해당 반경 위치에 kind별 도형. 모든 품질 단계에서
   *    동일한 2D 도형이라 low에서도 색 외(도형·패턴·펄스)로 구분된다.
   *  - fromActivePing: 또렷한 밝은 윤곽 추가 (핑 반사 구분 — 탐색 4종은
   *    계약상 핑 노출 중에만 온다).
   */
  private drawBlips(
    ctx: CanvasRenderingContext2D,
    center: number,
    radius: number,
    view: SonarScopeReadModel,
  ): void {
    for (const blip of view.blips) {
      const color = BLIP_COLORS[blip.kind] ?? SCOPE.contactColor;
      // 화면 각: 위 = 선수 기준 방위 (공급값 그대로 — 재계산 없음)
      const sin = Math.sin(blip.bearingRadians);
      const cos = Math.cos(blip.bearingRadians);

      if (blip.distanceMeters === null) {
        // 거리 미상 — 외곽 링 위 방위 호 (폭 = 번짐, kind별 대시)
        const arcHalf = Math.max(blip.bearingSpreadRadians / 2, 0.04);
        // 캔버스 호 각도(0 = +x축): 화면 점 (sin, -cos) 방향
        const screenAngle = Math.atan2(-cos, sin);
        ctx.strokeStyle = `${color}bb`;
        ctx.lineWidth = 4;
        ctx.setLineDash([...(ARC_DASH[blip.kind] ?? [])]);
        ctx.beginPath();
        ctx.arc(center, center, radius * 0.86, screenAngle - arcHalf, screenAngle + arcHalf);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }

      const ratio = Math.min(blip.distanceMeters / SCOPE.rangeMeters, 0.92);
      const px = center + sin * ratio * radius;
      const py = center - cos * ratio * radius;
      this.drawBlipShape(ctx, radius, blip.kind, px, py, sin, cos, color);
      if (blip.fromActivePing) {
        // 핑 반사 — 밝은 윤곽 (도형과 병행되는 공통 구분 채널)
        ctx.strokeStyle = 'rgba(190,245,238,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, radius * 0.055, 0, Math.PI * 2);
        ctx.stroke();
      } else if (blip.kind === 'ship') {
        // 패시브 선박 청음 — 기존 번짐 블롭 (spread 비례)
        const blur = Math.max(
          radius * 0.035,
          radius * blip.bearingSpreadRadians * ratio * 0.5,
        );
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, blur);
        gradient.addColorStop(0, `${color}cc`);
        gradient.addColorStop(1, `${color}00`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, blur, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * kind별 도형 — 7종 전부 서로 다른 실루엣 (색 외 구분 채널, 가짜 문자·
   * 네온 없음). 전투 3종: 원점 / 방위 정렬 대시 / X 표. 탐색 4종:
   * 마름모(금괴) / 정사각(salvage) / 삼각+펄스(단서) / 이중 원(심층 지점).
   */
  private drawBlipShape(
    ctx: CanvasRenderingContext2D,
    radius: number,
    kind: SonarBlipKind,
    px: number,
    py: number,
    sin: number,
    cos: number,
    color: string,
  ): void {
    const s = radius * 0.042;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    switch (kind) {
      case 'torpedo': {
        // 방위 방향으로 정렬된 대시 — 이동 위협 실루엣
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(px - sin * s * 1.6, py + cos * s * 1.6);
        ctx.lineTo(px + sin * s * 1.6, py - cos * s * 1.6);
        ctx.stroke();
        return;
      }
      case 'depthCharge': {
        // X 표 + 점멸 — 낙하 위험물
        const blink = (this.elapsed % 0.8) < 0.4 ? 1 : 0.45;
        ctx.globalAlpha = blink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - s, py - s);
        ctx.lineTo(px + s, py + s);
        ctx.moveTo(px - s, py + s);
        ctx.lineTo(px + s, py - s);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }
      case 'goldCache': {
        // 마름모 (45° 회전 정사각)
        ctx.beginPath();
        ctx.moveTo(px, py - s * 1.3);
        ctx.lineTo(px + s * 1.3, py);
        ctx.lineTo(px, py + s * 1.3);
        ctx.lineTo(px - s * 1.3, py);
        ctx.closePath();
        ctx.fill();
        return;
      }
      case 'salvage': {
        // 축 정렬 정사각
        ctx.fillRect(px - s, py - s, s * 2, s * 2);
        return;
      }
      case 'clue': {
        // 삼각 + 느린 확장 펄스 링 (목표 지점 신호)
        ctx.beginPath();
        ctx.moveTo(px, py - s * 1.4);
        ctx.lineTo(px + s * 1.2, py + s);
        ctx.lineTo(px - s * 1.2, py + s);
        ctx.closePath();
        ctx.fill();
        const pulse =
          (this.elapsed % SCOPE.explorationPulseSeconds) / SCOPE.explorationPulseSeconds;
        ctx.globalAlpha = (1 - pulse) * 0.7;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(px, py, s * (1.4 + pulse * 2.2), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }
      case 'deepSite': {
        // 이중 원 (외곽 링 + 중심점) — 탐사 지점
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, s * 1.3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, s * 0.4, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      case 'ship':
      default: {
        // 원점 — 핑 반사 시 또렷한 점 (패시브 번짐은 호출부에서 병행)
        ctx.beginPath();
        ctx.arc(px, py, radius * 0.03, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
    }
  }

  /** 자기 소음 — noiseFactor 하나만 소비 (원인 정보 없음) */
  private drawSelfNoise(
    ctx: CanvasRenderingContext2D,
    center: number,
    radius: number,
    noiseFactor: number,
  ): void {
    const noise = Math.min(Math.max(noiseFactor, 0), 1);
    ctx.fillStyle = 'rgba(190,230,226,0.9)';
    ctx.beginPath();
    ctx.arc(center, center, 2, 0, Math.PI * 2);
    ctx.fill();
    if (noise <= 0.01) return;
    const pulse = (this.elapsed % 1.2) / 1.2;
    ctx.strokeStyle = `${SCOPE.noiseRingColor}${Math.round((1 - pulse) * noise * 160)
      .toString(16).padStart(2, '0')}`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(center, center, 3 + pulse * radius * 0.4 * noise, 0, Math.PI * 2);
    ctx.stroke();
    // 노이즈 그레인 — 결정적(시간 파생) 스펙클, 개수 ∝ noiseFactor
    const grains = Math.floor(noise * 26);
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

  /**
   * 액티브 핑 상태 — read model의 실제 상태만 표시 (가짜 핑 없음):
   *  - activePingRemainingSeconds > 0: 확장 링 (잔여 시간 비례 페이드)
   *  - pingReady: 하단 밝은 점 / cooldown: 잔여 비율 호
   */
  private drawPingStatus(
    ctx: CanvasRenderingContext2D,
    center: number,
    radius: number,
    view: SonarScopeReadModel,
  ): void {
    if (view.activePingRemainingSeconds > 0) {
      const t = 1 - Math.min(view.activePingRemainingSeconds / SCOPE.pingDisplaySeconds, 1);
      ctx.strokeStyle = `rgba(120,230,220,${0.55 * (1 - t)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(center, center, Math.max(radius * t, 4), 0, Math.PI * 2);
      ctx.stroke();
    }
    const indicatorY = center + radius * 0.68;
    if (view.pingReady) {
      ctx.fillStyle = 'rgba(150,235,225,0.95)';
      ctx.beginPath();
      ctx.arc(center, indicatorY, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (view.cooldownRemainingSeconds > 0) {
      // 쿨다운 잔여 — 남은 비율만큼 호를 감아 보여준다 (잔여/표시 상한 비)
      const fraction = Math.min(
        view.cooldownRemainingSeconds / Math.max(SCOPE.pingCooldownDisplayCapSeconds, 0.01),
        1,
      );
      ctx.strokeStyle = 'rgba(150,200,195,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(center, indicatorY, 4, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
      ctx.stroke();
    }
  }

  dispose(): void {
    this.rootElement.remove();
  }
}

function fract(value: number): number {
  return value - Math.floor(value);
}
