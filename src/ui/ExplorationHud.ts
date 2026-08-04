/**
 * 탐사 안내 HUD — 단서 진행 · 탐색 안내 · 표식 범례 · 보스 구역 상태
 * (L-2·L-3 발견 가능성. **표시 전용** — 판정·수치를 만들지 않는다).
 *
 * ## 소비하는 정본만 표시한다
 *
 *  - 단서 진행 `N/M`: 리드 `BossProgressStore`의
 *    `collectedCanonicalCount`·`requiredClues` **하나뿐**. 월드 표식 개수·
 *    회수 이벤트 누적 같은 2차 집계를 만들지 않는다.
 *  - 보스 구역 잠금 여부: `requestEntry()`가 돌려준 결과 그대로.
 *    '단서 수 ≥ 필요 수' 같은 해금 조건을 HUD가 다시 쓰지 않는다.
 *  - 구역 위치: 조립부가 넘긴 `BOSS_ZONE` 경계값 그대로 —
 *    좌표를 여기서 만들지 않고 거리·방위도 계산하지 않는다.
 *  - 진입·교전 전이: 게임플레이 구역 진입 edge와 스폰 결과를 조립부가
 *    통지한다. 매 프레임 배너를 다시 띄우지 않는다(1회 노출 + 시간 감쇠).
 *
 * 안내 문구는 조작 안내와 같은 성격의 고정 텍스트다 — 좌표·수치를 문구에
 * 하드코딩하지 않는다(구역 경계만 주입값을 그대로 찍는다).
 */

import type { BossZoneEntryOutcome } from '../contracts/boss';
import type { BossZoneBounds } from '../world/bossPlacement';

/**
 * 단서 진행 읽기 단면 — 리드 `BossProgressStore`가 구조적으로 충족한다
 * (새 계약을 만들지 않는다).
 */
export interface ClueProgressSource {
  readonly collectedCanonicalCount: number;
  readonly requiredClues: number;
  readonly unlocked: boolean;
  requestEntry(): BossZoneEntryOutcome;
}

/** 배너 노출 시간 (초) — 표시 시간일 뿐 판정과 무관 */
const BANNER_SECONDS = 3.2;

export class ExplorationHud {
  private readonly root: HTMLDivElement;
  private readonly clueLine: HTMLDivElement;
  private readonly guideLine: HTMLDivElement;
  private readonly legendLine: HTMLDivElement;
  private readonly zoneLine: HTMLDivElement;
  private readonly bannerLine: HTMLDivElement;

  private progress: ClueProgressSource | null = null;
  private zone: BossZoneBounds | null = null;
  private encounterActive = false;
  private bannerRemainingSeconds = 0;
  private visible = false;
  private lastClueText = '';
  private lastGuideText = '';
  private lastZoneText = '';
  private lastBannerText = '';

  constructor(host: HTMLElement = document.body) {
    this.root = document.createElement('div');
    this.root.setAttribute('data-ui-exploration-hud', '');
    // 좌측 상단 소나 스코프(0.75rem + 18vh) 바로 아래 — 스코프 blip과
    // 같은 시선 안에 두되 겹치지 않는다. 좌측 중앙 조작 안내와도 분리.
    this.root.style.cssText = [
      'position:absolute',
      'left:0.75rem',
      'top:calc(0.75rem + 18vh + 0.75rem)',
      'z-index:32',
      'pointer-events:none',
      'display:none',
      'flex-direction:column',
      'gap:0.2rem',
      'padding:0.45rem 0.6rem',
      'max-width:min(40vw, 19rem)',
      'background:rgba(6,16,22,0.72)',
      'border:1px solid rgba(150,190,205,0.3)',
      'border-radius:6px',
      'color:#cfe8f5',
      'font:0.7rem/1.5 system-ui,sans-serif',
      'user-select:none',
    ].join(';');

    this.clueLine = document.createElement('div');
    this.clueLine.style.cssText = 'color:#ffd9a0;font-size:0.78rem';

    this.guideLine = document.createElement('div');
    this.guideLine.style.cssText = 'color:#a9c6d4';

    this.legendLine = document.createElement('div');
    this.legendLine.style.cssText = 'color:#8fa9b6;font-size:0.66rem';
    const clueLegend = document.createElement('div');
    clueLegend.textContent = '▲ 삼각 표식: 보스 단서 — 가까이 접근 후 F 홀드';
    const salvageLegend = document.createElement('div');
    salvageLegend.textContent = '○ 흰색 원: salvage 자동 회수 구역';
    this.legendLine.append(clueLegend, salvageLegend);

    this.zoneLine = document.createElement('div');
    this.zoneLine.style.cssText = 'color:#a9c6d4;border-top:1px solid rgba(150,190,205,0.22);padding-top:0.25rem';

    this.bannerLine = document.createElement('div');
    this.bannerLine.style.cssText = 'color:#f2a44a;display:none';

    this.root.append(
      this.clueLine,
      this.guideLine,
      this.legendLine,
      this.zoneLine,
      this.bannerLine,
    );
    host.appendChild(this.root);
  }

  /** 단서 진행·구역 게이트 정본 — composition root가 1회 주입 */
  attachProgress(progress: ClueProgressSource): void {
    this.progress = progress;
  }

  /** 보스 구역 경계 (world 정본 그대로) */
  attachBossZone(zone: BossZoneBounds): void {
    this.zone = zone;
  }

  setVisible(inSortie: boolean): void {
    if (this.visible === inSortie) return;
    this.visible = inSortie;
    this.root.style.display = inSortie ? 'flex' : 'none';
    if (!inSortie) this.clearBanner();
  }

  /**
   * 구역 진입 edge 통지 — 게임플레이 진입 판정 + 리드 게이트 결과를
   * 조립부가 그대로 넘긴다. HUD는 허가 여부를 다시 판단하지 않는다.
   */
  notifyZoneEntered(outcome: BossZoneEntryOutcome): void {
    this.showBanner(
      outcome === 'granted' ? '보스 구역 진입 — 교전 준비' : '보스 구역 잠김 — 단서가 더 필요합니다',
    );
  }

  /** 교전 시작/종료 — `spawnBoss()` 결과와 보스 런타임 폐기에 맞춰 조립부가 통지 */
  setEncounterActive(active: boolean): void {
    if (this.encounterActive === active) return;
    this.encounterActive = active;
    if (active) this.showBanner('보스 교전 시작');
  }

  /** 출항 리셋 — 배너·교전 표시를 접는다 (진행 수는 정본이 소유) */
  reset(): void {
    this.encounterActive = false;
    this.clearBanner();
  }

  update(deltaSeconds: number): void {
    if (!this.visible) return;
    if (this.bannerRemainingSeconds > 0) {
      this.bannerRemainingSeconds = Math.max(0, this.bannerRemainingSeconds - deltaSeconds);
      if (this.bannerRemainingSeconds === 0) this.clearBanner();
    }

    const progress = this.progress;
    const collected = progress?.collectedCanonicalCount ?? 0;
    const required = progress?.requiredClues ?? 0;
    const clueText = `보스 단서 ${collected}/${required}`;
    if (clueText !== this.lastClueText) {
      this.lastClueText = clueText;
      this.clueLine.textContent = clueText;
    }

    // 해금 여부는 정본 플래그 그대로 — 수집 수와 필요 수를 다시 비교하지 않는다.
    const unlocked = progress?.unlocked ?? false;
    const guideText = unlocked
      ? '단서를 모두 모았습니다 — 보스 구역으로 이동하세요'
      : 'Q로 단서 탐색 (액티브 핑) · 단서는 해저에 있습니다 — Shift로 잠항해 가까이 접근하세요';
    if (guideText !== this.lastGuideText) {
      this.lastGuideText = guideText;
      this.guideLine.textContent = guideText;
    }

    const zone = this.zone;
    let zoneText = '보스 구역 — 미주입';
    if (zone) {
      const bounds =
        `보스 구역 X ${format(zone.minX)}~${format(zone.maxX)} · ` +
        `Z ${format(zone.minZ)}~${format(zone.maxZ)}`;
      const status = this.encounterActive
        ? '교전 중'
        : progress === null
          ? '상태 미주입'
          : progress.requestEntry() === 'granted'
            ? '진입 가능'
            : '잠김';
      zoneText = `${bounds} — ${status}`;
    }
    if (zoneText !== this.lastZoneText) {
      this.lastZoneText = zoneText;
      this.zoneLine.textContent = zoneText;
    }
  }

  private showBanner(text: string): void {
    this.bannerRemainingSeconds = BANNER_SECONDS;
    if (text === this.lastBannerText && this.bannerLine.style.display === 'block') return;
    this.lastBannerText = text;
    this.bannerLine.textContent = text;
    this.bannerLine.style.display = 'block';
  }

  private clearBanner(): void {
    this.bannerRemainingSeconds = 0;
    this.lastBannerText = '';
    this.bannerLine.textContent = '';
    this.bannerLine.style.display = 'none';
  }

  dispose(): void {
    this.root.remove();
  }
}

/** 경계 좌표 표기 — 주입값을 그대로 찍는다 (반올림 표시만) */
function format(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}
