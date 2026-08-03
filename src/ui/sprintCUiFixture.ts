/**
 * 스프린트 C HUD **UI 단위 검증 fixture** (`?cdemo=1`).
 *
 * ⚠ production 경로가 아니다 — URL 플래그 없이는 생성되지 않고 'C fixture'
 * 배지를 띄운다. production 조립의 실제 read model(playerHull·debriefState)
 * 과는 별개의 컴포넌트 인스턴스에 계약 형태의 표본을 물린다.
 *
 * 목적: production combat params가 null이라(피해·침수 발생 불가) 그리고
 * 게임플레이 DetectionSystem이 아직 없어서 도달할 수 없는 HUD 상태를
 * 브라우저에서 검수한다 — 탐지 단계 3종·unwired·추적 상태 4종·선체 감소·
 * 침수 경고·피격 플래시·방향 지시자·실패/귀환 화면·저장 실패 재시도.
 * 이 경로의 통과는 **production 동작 통과가 아니라 표시 규칙 검증**이다.
 */

import type {
  DetectionHudView,
  TrackingState,
  TrackingStateView,
} from '../contracts/detection';
import type {
  DebriefReadModel,
  SortieFailureReport,
  SurvivalReadModel,
  SurvivalWarningId,
} from '../contracts/survival';
import { DetectionHud } from './DetectionHud';
import { SortieFailureScreen } from './SortieFailureScreen';
import { SortieReturnScreen } from './SortieReturnScreen';
import { SurvivalHud } from './SurvivalHud';

const BUTTON =
  'font:0.7rem system-ui;padding:0.2rem 0.4rem;border:1px solid #ffb347;background:transparent;color:#ffb347;border-radius:3px;cursor:pointer;pointer-events:auto';

export class SprintCUiFixture {
  private readonly detectionHud: DetectionHud;
  private readonly survivalHud: SurvivalHud;
  private readonly failureScreen: SortieFailureScreen;
  private readonly returnScreen: SortieReturnScreen;
  private readonly panel: HTMLDivElement;
  private readonly badge: HTMLDivElement;

  // fixture 내부 표본 상태 — 계약 형태만 충족 (실제 판정 아님)
  private detection: DetectionHudView = { gauge: 0, stage: 'safe', unwired: true };
  private tracked: TrackingStateView[] = [];
  private hull = { current: 100, max: 100, flooding: 0, flash: false };
  private warningIds: SurvivalWarningId[] = [];
  private hitDirection: { x: number; z: number } | null = null;
  private debrief: DebriefReadModel = {
    kind: 'none',
    settlement: null,
    failure: null,
    saveStatus: 'notAttempted',
    canRetrySave: false,
  };
  private metaState: 'SORTIE' | 'DEBRIEF' | 'BASE' = 'SORTIE';

  constructor(host: HTMLElement) {
    const fixture = this;

    this.detectionHud = new DetectionHud(host);
    this.detectionHud.attachDetectionSource({
      hudView: (): DetectionHudView => fixture.detection,
    });
    this.detectionHud.attachTrackingSource({
      get trackedShips(): readonly TrackingStateView[] {
        return fixture.tracked;
      },
    });

    this.survivalHud = new SurvivalHud(host);
    this.survivalHud.attachSource(
      {
        survivalReadModel: (): SurvivalReadModel => fixture.survivalModel(),
      },
      () => {
        fixture.hull.flash = false; // consumeDamageFlash 표본
      },
    );
    this.survivalHud.attachViewContext({
      headingRadians: 0,
      cameraForwardX: 0,
      cameraForwardZ: -1,
    });

    this.failureScreen = new SortieFailureScreen(host);
    this.failureScreen.attach(
      { readModel: () => fixture.debrief },
      () => {
        // 재시도 표본 — 성공으로 전환 (재정산 없음을 화면 규칙으로 검수)
        if (fixture.debrief.failure) {
          const saved: SortieFailureReport = { ...fixture.debrief.failure, saveStatus: 'saved' };
          fixture.debrief = { ...fixture.debrief, failure: saved, saveStatus: 'saved', canRetrySave: false };
        }
      },
    );
    this.returnScreen = new SortieReturnScreen(host);
    this.returnScreen.attach(
      { readModel: () => fixture.debrief },
      {
        get metaState() {
          return fixture.metaState;
        },
      },
      () => {
        fixture.metaState = 'BASE';
        fixture.debrief = { kind: 'none', settlement: null, failure: null, saveStatus: 'notAttempted', canRetrySave: false };
      },
    );

    this.badge = document.createElement('div');
    this.badge.setAttribute('data-render-c-fixture-badge', '');
    this.badge.textContent = 'C fixture — HUD 표시 규칙 검수용 (게임플레이 실제 상태 아님)';
    this.badge.style.cssText =
      'position:absolute;left:0.75rem;top:3rem;z-index:33;padding:0.25rem 0.5rem;border:1px dashed #ffb347;border-radius:4px;background:rgba(6,16,22,0.85);color:#ffb347;font:0.7rem system-ui,sans-serif';
    host.appendChild(this.badge);
    this.panel = this.buildPanel(host);
  }

  private survivalModel(): SurvivalReadModel {
    const wired = this.hull.max > 0;
    const state =
      this.hull.current <= 0
        ? 'destroyed'
        : this.warningIds.includes('hull.critical')
          ? 'critical'
          : this.warningIds.includes('hull.damaged')
            ? 'damaged'
            : 'stable';
    return {
      currentHull: this.hull.current,
      maxHull: this.hull.max,
      hullRatio: wired ? this.hull.current / this.hull.max : null,
      floodingLevel: this.hull.flooding,
      survivalState: state,
      lastHitDirection: this.hitDirection,
      damageFlashRequested: this.hull.flash,
      warningIds: this.warningIds,
      failureCountdown: null,
      isDestroyed: this.hull.current <= 0,
    };
  }

  private buildPanel(host: HTMLElement): HTMLDivElement {
    const panel = document.createElement('div');
    panel.setAttribute('data-ui-c-fixture-panel', '');
    panel.style.cssText =
      'position:absolute;right:0.75rem;bottom:4rem;z-index:33;display:flex;flex-direction:column;gap:0.25rem;max-width:15rem;padding:0.4rem;border:1px dashed #ffb347;border-radius:4px;background:rgba(6,16,22,0.9);font:0.7rem system-ui,sans-serif;color:#ffb347';
    panel.appendChild(document.createTextNode('C 검수:'));

    const add = (label: string, action: () => void): void => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = BUTTON;
      button.addEventListener('click', action);
      panel.appendChild(button);
    };

    add('탐지 unwired', () => {
      this.detection = { gauge: 0, stage: 'safe', unwired: true };
    });
    add('탐지 safe 0.2', () => {
      this.detection = { gauge: 0.2, stage: 'safe', unwired: false };
    });
    add('탐지 searching 0.6', () => {
      this.detection = { gauge: 0.6, stage: 'searching', unwired: false };
    });
    add('탐지 detected 1.0', () => {
      this.detection = { gauge: 1, stage: 'detected', unwired: false };
    });
    add('추적 4종', () => {
      const states: TrackingState[] = ['patrol', 'alert', 'attack', 'lost'];
      this.tracked = states.map((state, index) => ({
        entityId: 9200 + index,
        state,
        lastKnownPosition: null,
      }));
    });
    add('피격(우현)', () => {
      this.hull.current = Math.max(0, this.hull.current - 25);
      this.hull.flash = true;
      this.hitDirection = { x: 1, z: 0 };
      this.warningIds = this.hull.current <= 25 ? ['hull.critical'] : ['hull.damaged'];
    });
    add('침수 major', () => {
      this.hull.flooding = 0.55;
      this.warningIds = [...this.warningIds.filter((id) => !id.startsWith('flooding')), 'flooding.major'];
    });
    add('선체 unwired', () => {
      this.hull = { current: 0, max: 0, flooding: 0, flash: false };
      this.warningIds = [];
    });
    add('실패 화면(저장 실패)', () => {
      this.metaState = 'DEBRIEF';
      this.debrief = {
        kind: 'destroyed',
        settlement: null,
        failure: {
          failureId: 'fixture-1',
          reason: 'hullDestroyed',
          destroyedByEntityId: 9203,
          damageSource: 'enemyWeapon',
          pendingCredits: 180,
          securedRareParts: 1,
          appliedLoss: 90,
          finalCredits: 430,
          finalRareParts: 3,
          saveStatus: 'saveFailed',
          nextState: 'DEBRIEF',
        },
        saveStatus: 'saveFailed',
        canRetrySave: true,
      };
    });
    add('귀환 화면', () => {
      this.metaState = 'DEBRIEF';
      this.debrief = {
        kind: 'returned',
        settlement: {
          outcome: 'returned',
          creditsEarned: 245,
          creditsLost: 0,
          creditsNet: 245,
          rarePartsSecured: 1,
        },
        failure: null,
        saveStatus: 'saved',
        canRetrySave: false,
      };
    });

    host.appendChild(panel);
    return panel;
  }

  update(deltaSeconds: number): void {
    const inSortie = this.metaState === 'SORTIE';
    this.detectionHud.setVisible(inSortie);
    this.survivalHud.setVisible(inSortie);
    this.detectionHud.update();
    this.survivalHud.update(deltaSeconds);
    this.failureScreen.update();
    this.returnScreen.update();
  }

  dispose(): void {
    this.detectionHud.dispose();
    this.survivalHud.dispose();
    this.failureScreen.dispose();
    this.returnScreen.dispose();
    this.panel.remove();
    this.badge.remove();
  }
}

/** `?cdemo` 플래그 파서 — 플래그 없이는 fixture가 존재하지 않는다 */
export function parseSprintCFixtureFlag(search: string): boolean {
  return new URLSearchParams(search).get('cdemo') === '1';
}
