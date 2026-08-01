/**
 * 경제·성장 UI QA 데모 (`?econdemo=1`) — **QA 전용, production 경로 아님** (§11).
 *
 * production 마운트(조립부 — 실제 BaseScreenPort)와 완전히 분리된 검수
 * 하네스다: URL 플래그 없이는 생성되지 않고, 화면에 'QA 데모' 배지를
 * 표기하며, 여기의 수치는 공식 가격이 아니다 (?shipdemo 관례).
 *
 * 목적: 공식 경제 params가 null인 동안 도달할 수 없는 UI 상태(활성 가격·
 * 부족 사유·저장 실패 롤백 문구)를 브라우저에서 검수한다.
 *  - `?econdemo=savefail`: 모든 명령 결과가 saveFailedRolledBack — 지정
 *    저장 실패 문구 표시를 검수한다.
 */

import type {
  BaseScreenPort,
  CurrencyBundle,
  EquipmentChangeRequest,
  EquipmentId,
  TransactionResult,
  UpgradeStatId,
} from '../contracts/meta';
import type { EquipmentCatalog, UpgradeEntry } from '../tools/economyMath';
import { EconomyHud } from './EconomyHud';
import { SortiePrepScreen } from './SortiePrepScreen';
import type { UiActionResult } from './metaEconomyPorts';

/** QA 데모 지갑 초기값 — 부족 사유(크레딧·희귀 부품)가 화면에 드러나는 구성 */
const DEMO_WALLET = { credits: 340, rareParts: 1 };

/** QA 데모 카탈로그 — 표시 규칙 검수용. 가격·수치는 공식 데이터 아님 */
const DEMO_CATALOG: UpgradeEntry[] = [
  { id: 'hullIntegrity', label: '선체 체력', maxLevel: 5, costCredits: [120, 240, 360, 480, 600], costRareParts: [0, 0, 0, 1, 1], effectBonus: [0.1, 0.1, 0.1, 0.1, 0.1] },
  { id: 'maxSpeed', label: '최고 속도', maxLevel: 5, costCredits: [2000, 2400, 2800, 3200, 3600], costRareParts: [0, 0, 0, 0, 0], effectBonus: [0.1, 0.1, 0.1, 0.1, 0.1] },
  { id: 'torpedoDamage', label: '어뢰 피해', maxLevel: 5, costCredits: [150, 300, 450, 600, 750], costRareParts: [3, 3, 3, 3, 3], effectBonus: [0.1, 0.1, 0.1, 0.1, 0.1] },
  { id: 'sonarRange', label: '소나 범위', maxLevel: 5, costCredits: [90, 180, 270, 360, 450], costRareParts: [0, 0, 0, 0, 0], effectBonus: [0.1, 0.1, 0.1, 0.1, 0.1] },
  // 미확정(null) 표시 규칙 검수용 — production과 동일한 '경제 데이터 미확정' 경로
  { id: 'turnRate', label: '선회 속도', maxLevel: 5, costCredits: [null, null, null, null, null], costRareParts: [null, null, null, null, null], effectBonus: [null, null, null, null, null] },
];

const DEMO_EQUIPMENT: EquipmentCatalog = {
  slotCapacity: 2,
  items: [
    { id: 'standardTorpedo', label: '기본 어뢰', costCredits: null, costRareParts: null },
    { id: 'fastTorpedo', label: '고속 어뢰', costCredits: null, costRareParts: null },
    { id: 'heavyTorpedo', label: '중어뢰', costCredits: null, costRareParts: null },
    { id: 'decoy', label: '디코이', costCredits: null, costRareParts: null },
  ],
};

const FAILURE_INSPECTION: ReadonlyArray<{ result: UiActionResult; label: string }> = [
  { result: { status: 'denied', reason: 'insufficientCredits' }, label: '크레딧 부족' },
  { result: { status: 'denied', reason: 'insufficientRareParts' }, label: '희귀 부품 부족' },
  { result: { status: 'denied', reason: 'maxLevelReached' }, label: '최대 단계' },
  { result: { status: 'denied', reason: 'noFreeSlot' }, label: '슬롯 부족' },
  { result: { status: 'denied', reason: 'alreadyEquipped' }, label: '이미 장착 중' },
  { result: { status: 'saveFailedRolledBack' }, label: '저장 실패 롤백' },
  { result: { status: 'economyDataUnavailable' }, label: '경제 데이터 미확정' },
];

export class EconomyUiQaDemo {
  private readonly hud: EconomyHud;
  private readonly screen: SortiePrepScreen;
  private readonly panel: HTMLDivElement;

  // 데모 내부 상태 — QA 하네스 전용 (production UI는 실제 포트를 소비한다)
  private readonly wallet = { ...DEMO_WALLET };
  private atBase = true;
  private readonly levels: Record<string, number> = { hullIntegrity: 1, torpedoDamage: 2, sonarRange: 5 };
  private equipped: EquipmentId[] = ['standardTorpedo'];

  constructor(host: HTMLElement, forceSaveFailure: boolean) {
    const demo = this;

    const fakePort: BaseScreenPort = {
      get wallet(): CurrencyBundle {
        return { credits: demo.wallet.credits, rareParts: demo.wallet.rareParts };
      },
      get upgradeLevels() {
        return { ...demo.levels };
      },
      get loadout() {
        return { slotCapacity: 2, equipped: [...demo.equipped] };
      },
      get canLaunchSortie() {
        return demo.atBase;
      },
      launchSortie: (): boolean => {
        if (forceSaveFailure) return false; // 저장 실패 → 기지 유지 검수
        demo.atBase = false;
        return true;
      },
      purchaseUpgrade: (id: UpgradeStatId): TransactionResult => {
        if (forceSaveFailure) return { status: 'saveFailedRolledBack' };
        const entry = DEMO_CATALOG.find((e) => e.id === id);
        const level = demo.levels[id] ?? 0;
        if (!entry || level >= entry.maxLevel) {
          return { status: 'denied', reason: 'maxLevelReached' };
        }
        const credits = entry.costCredits[level] ?? null;
        const rareParts = entry.costRareParts[level] ?? null;
        if (credits === null || demo.wallet.credits < credits) {
          return { status: 'denied', reason: 'insufficientCredits' };
        }
        if (rareParts === null || demo.wallet.rareParts < rareParts) {
          return { status: 'denied', reason: 'insufficientRareParts' };
        }
        demo.wallet.credits -= credits;
        demo.wallet.rareParts -= rareParts;
        demo.levels[id] = level + 1;
        return { status: 'success' };
      },
      changeEquipment: (request: EquipmentChangeRequest): TransactionResult => {
        if (forceSaveFailure) return { status: 'saveFailedRolledBack' };
        if (request.kind === 'unequip') {
          demo.equipped = demo.equipped.filter((_, i) => i !== request.slotIndex);
          return { status: 'success' };
        }
        if (demo.equipped.includes(request.equipmentId)) {
          return { status: 'denied', reason: 'alreadyEquipped' };
        }
        if (request.kind === 'replace') {
          demo.equipped = demo.equipped.map((id, i) =>
            i === request.slotIndex ? request.equipmentId : id,
          );
          return { status: 'success' };
        }
        if (demo.equipped.length >= 2) return { status: 'denied', reason: 'noFreeSlot' };
        demo.equipped = [...demo.equipped, request.equipmentId];
        return { status: 'success' };
      },
    };

    this.hud = new EconomyHud(host);
    this.hud.attachSource({
      get metaState() {
        return demo.atBase ? 'BASE' : 'SORTIE';
      },
      get wallet(): CurrencyBundle {
        return { credits: demo.wallet.credits, rareParts: demo.wallet.rareParts };
      },
      // 출항 중 집계 데모 값 — 미확정 줄 표시 형식 검수용
      sortieEarnings: { credits: 85, rareParts: 1 },
    });

    this.screen = new SortiePrepScreen(host, 'QA 데모 — 임시 수치 (공식 가격·판정 아님)');
    this.screen.attachBaseScreen(fakePort);
    this.screen.attachUpgradeCatalog(() => DEMO_CATALOG);
    this.screen.attachEquipmentCatalog(DEMO_EQUIPMENT);

    this.panel = this.buildInspectionPanel(host);
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

    for (const item of FAILURE_INSPECTION) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.style.cssText =
        'font:0.7rem system-ui;padding:0.2rem 0.4rem;border:1px solid #ffb347;background:transparent;color:#ffb347;border-radius:3px;cursor:pointer';
      button.addEventListener('click', () => {
        this.screen.announce(item.result, `검수(${item.label})`);
      });
      panel.appendChild(button);
    }

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
