/**
 * 경제·성장 UI QA 데모 (`?econdemo=1`) — **QA 전용, production 경로 아님**.
 *
 * production 마운트(조립부가 조립한 실제 `BaseScreenPort`)와 완전히 분리된
 * 검수 하네스다: URL 플래그 없이는 생성되지 않고, 화면에 'QA 데모' 배지를
 * 표기하며, 여기의 수치는 **공식 가격이 아니다**. production UI는 조립부가
 * 주입한 공식 카탈로그(BaseScreenPort v2)만 소비한다.
 *
 * 목적: 공식 상태로는 재현하기 번거로운 UI 상태(부족 사유·저장 실패 롤백·
 * 경제 데이터 미확정 표기)를 브라우저에서 즉시 검수한다.
 *  - `?econdemo=savefail`: 모든 명령 결과가 saveFailedRolledBack.
 */

import type {
  BaseCommandOutcome,
  BaseScreenPort,
  CurrencyBundle,
  DepartureResult,
  EquipmentCatalogItem,
  EquipmentId,
  EquipmentLoadout,
  MetaStateId,
  UpgradeCatalogItem,
  UpgradeStatId,
} from '../contracts/meta';
import { EconomyHud } from './EconomyHud';
import { SortiePrepScreen } from './SortiePrepScreen';
import { commandOutcomeMessage, departureOutcomeMessage } from './metaEconomyPorts';

/** QA 데모 지갑 초기값 — 부족 사유(크레딧·희귀 부품)가 화면에 드러나는 구성 */
const DEMO_WALLET = { credits: 340, rareParts: 1 };

/**
 * QA 데모 카탈로그 — 표시 규칙 검수용 임시 수치(공식 가격 아님).
 * 마지막 항목은 `nextCostPending`으로 미확정 표기 경로를 검수한다.
 */
const DEMO_UPGRADES: Array<{
  id: UpgradeStatId;
  label: string;
  maxLevel: number;
  costs: Array<CurrencyBundle | null>;
}> = [
  { id: 'hullIntegrity', label: '선체 체력', maxLevel: 5, costs: [{ credits: 120, rareParts: 0 }, { credits: 240, rareParts: 0 }, { credits: 360, rareParts: 0 }, { credits: 480, rareParts: 1 }, { credits: 600, rareParts: 2 }] },
  { id: 'maxSpeed', label: '최고 속도', maxLevel: 5, costs: [{ credits: 2000, rareParts: 0 }, null, null, null, null] },
  { id: 'torpedoDamage', label: '어뢰 피해', maxLevel: 5, costs: [{ credits: 150, rareParts: 3 }, null, null, null, null] },
  { id: 'sonarRange', label: '소나 범위', maxLevel: 5, costs: [null, null, null, null, null] },
];

const DEMO_EQUIPMENT: readonly EquipmentCatalogItem[] = [
  { id: 'standardTorpedo', label: '기본 어뢰', cost: { credits: 0, rareParts: 0 } },
  { id: 'fastTorpedo', label: '고속 어뢰', cost: { credits: 260, rareParts: 0 } },
  { id: 'heavyTorpedo', label: '중어뢰', cost: { credits: 420, rareParts: 1 } },
  { id: 'decoy', label: '디코이', cost: { credits: 340, rareParts: 1 } },
];

const OUTCOME_INSPECTION: ReadonlyArray<{ outcome: BaseCommandOutcome; label: string }> = [
  { outcome: 'insufficientCredits', label: '크레딧 부족' },
  { outcome: 'insufficientRareParts', label: '희귀 부품 부족' },
  { outcome: 'maxLevelReached', label: '최대 단계' },
  { outcome: 'slotFull', label: '슬롯 부족' },
  { outcome: 'alreadyEquipped', label: '이미 장착 중' },
  { outcome: 'economyDataUnavailable', label: '경제 데이터 미확정' },
  { outcome: 'saveFailedRolledBack', label: '저장 실패 롤백' },
];

const DEMO_SLOT_CAPACITY = 2;

export class EconomyUiQaDemo {
  private readonly hud: EconomyHud;
  private readonly screen: SortiePrepScreen;
  private readonly panel: HTMLDivElement;

  // 데모 내부 상태 — QA 하네스 전용 (production UI는 실제 포트를 소비한다)
  private readonly wallet = { ...DEMO_WALLET };
  private atBase = true;
  private readonly levels: Record<string, number> = { hullIntegrity: 1, torpedoDamage: 2, sonarRange: 5 };
  private slots: (EquipmentId | null)[] = ['standardTorpedo', null];

  constructor(host: HTMLElement, forceSaveFailure: boolean) {
    const demo = this;

    const fakePort: BaseScreenPort = {
      get wallet(): CurrencyBundle {
        return { credits: demo.wallet.credits, rareParts: demo.wallet.rareParts };
      },
      sortieCreditsEarned: 85,
      sortieRarePartsSecured: 1,
      get upgradeCatalog(): readonly UpgradeCatalogItem[] {
        return DEMO_UPGRADES.map((entry) => {
          const level = demo.levels[entry.id] ?? 0;
          const cost = level >= entry.maxLevel ? null : (entry.costs[level] ?? null);
          return {
            id: entry.id,
            label: entry.label,
            maxLevel: entry.maxLevel,
            nextCost: cost,
            nextCostPending: level < entry.maxLevel && cost === null,
          };
        });
      },
      get upgradeLevels(): Readonly<Record<string, number>> {
        return { ...demo.levels };
      },
      equipmentCatalog: DEMO_EQUIPMENT,
      get loadout(): EquipmentLoadout {
        return {
          slotCapacity: DEMO_SLOT_CAPACITY,
          equipped: demo.slots.filter((slot): slot is EquipmentId => slot !== null),
        };
      },
      get canLaunchSortie(): boolean {
        return demo.atBase;
      },
      lastResult: null,
      purchaseUpgrade: (id: UpgradeStatId): BaseCommandOutcome => {
        if (forceSaveFailure) return 'saveFailedRolledBack';
        const entry = DEMO_UPGRADES.find((candidate) => candidate.id === id);
        const level = demo.levels[id] ?? 0;
        if (!entry || level >= entry.maxLevel) return 'maxLevelReached';
        const cost = entry.costs[level] ?? null;
        if (!cost) return 'economyDataUnavailable';
        if (demo.wallet.credits < cost.credits) return 'insufficientCredits';
        if (demo.wallet.rareParts < cost.rareParts) return 'insufficientRareParts';
        demo.wallet.credits -= cost.credits;
        demo.wallet.rareParts -= cost.rareParts;
        demo.levels[id] = level + 1;
        return 'success';
      },
      equipItem: (equipmentId, slotIndex) => demo.applySlotChange(equipmentId, slotIndex, forceSaveFailure),
      replaceItem: (equipmentId, slotIndex) => demo.applySlotChange(equipmentId, slotIndex, forceSaveFailure),
      unequipItem: (slotIndex): BaseCommandOutcome => {
        if (forceSaveFailure) return 'saveFailedRolledBack';
        if (slotIndex < 0 || slotIndex >= DEMO_SLOT_CAPACITY) return 'slotFull';
        demo.slots[slotIndex] = null;
        return 'success';
      },
      confirmDeparture: (): DepartureResult => {
        if (forceSaveFailure) return 'saveFailed';
        demo.atBase = false;
        return 'departed';
      },
    };

    this.hud = new EconomyHud(host);
    this.hud.attachBaseScreen(fakePort);
    this.hud.attachMetaState({
      get metaState(): MetaStateId {
        return demo.atBase ? 'BASE' : 'SORTIE';
      },
    });

    this.screen = new SortiePrepScreen(host, 'QA 데모 — 임시 수치 (공식 가격·판정 아님)');
    this.screen.attachBaseScreen(fakePort);
    this.screen.attachSlotPositions({
      get slots(): readonly (EquipmentId | null)[] {
        return demo.slots;
      },
    });

    this.panel = this.buildInspectionPanel(host);
  }

  private applySlotChange(
    equipmentId: EquipmentId,
    slotIndex: number,
    forceSaveFailure: boolean,
  ): BaseCommandOutcome {
    if (forceSaveFailure) return 'saveFailedRolledBack';
    if (slotIndex < 0 || slotIndex >= DEMO_SLOT_CAPACITY) return 'slotFull';
    if (this.slots.some((slot, index) => slot === equipmentId && index !== slotIndex)) {
      return 'alreadyEquipped';
    }
    this.slots[slotIndex] = equipmentId;
    return 'success';
  }

  /** 결과 표시 규칙 검수 버튼 + 기지/해역 전환 (QA 하네스 전용) */
  private buildInspectionPanel(host: HTMLElement): HTMLDivElement {
    const panel = document.createElement('div');
    panel.setAttribute('data-ui-econ-demo-panel', '');
    panel.style.cssText = [
      'position:absolute',
      'left:0.75rem',
      'bottom:0.75rem',
      'z-index:33',
      'display:flex',
      'flex-wrap:wrap',
      'gap:0.3rem',
      'max-width:40vw',
      'padding:0.4rem',
      'border:1px dashed #ffb347',
      'border-radius:4px',
      'background:rgba(6,16,22,0.85)',
      'font:0.7rem system-ui,sans-serif',
      'color:#ffb347',
    ].join(';');
    panel.appendChild(document.createTextNode('QA 피드백 검수:'));

    for (const item of OUTCOME_INSPECTION) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.style.cssText =
        'font:0.7rem system-ui;padding:0.2rem 0.4rem;border:1px solid #ffb347;background:transparent;color:#ffb347;border-radius:3px;cursor:pointer';
      button.addEventListener('click', () => {
        this.screen.announce(commandOutcomeMessage(item.outcome), `검수(${item.label})`);
      });
      panel.appendChild(button);
    }

    const departureButton = document.createElement('button');
    departureButton.type = 'button';
    departureButton.textContent = '출항 저장 실패';
    departureButton.style.cssText =
      'font:0.7rem system-ui;padding:0.2rem 0.4rem;border:1px solid #ffb347;background:transparent;color:#ffb347;border-radius:3px;cursor:pointer';
    departureButton.addEventListener('click', () => {
      this.screen.announce(departureOutcomeMessage('saveFailed'), '검수(출항 저장 실패)');
    });
    panel.appendChild(departureButton);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = '기지/해역 전환';
    toggle.style.cssText =
      'font:0.7rem system-ui;padding:0.2rem 0.4rem;border:1px solid #9cc4d4;background:transparent;color:#9cc4d4;border-radius:3px;cursor:pointer';
    toggle.addEventListener('click', () => {
      this.atBase = !this.atBase;
    });
    panel.appendChild(toggle);

    host.appendChild(panel);
    return panel;
  }

  update(): void {
    this.hud.update();
    this.screen.update();
  }

  dispose(): void {
    this.hud.dispose();
    this.screen.dispose();
    this.panel.remove();
  }
}

/** `?econdemo` 플래그 파서 — 마운트 여부와 저장 실패 강제 변형을 돌려준다 */
export function parseEconDemoFlag(search: string): { mount: boolean; forceSaveFailure: boolean } {
  const raw = new URLSearchParams(search).get('econdemo');
  if (raw === null) return { mount: false, forceSaveFailure: false };
  return { mount: true, forceSaveFailure: raw === 'savefail' };
}
