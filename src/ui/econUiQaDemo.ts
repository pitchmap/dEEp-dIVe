/**
 * 경제·성장 UI QA 데모 (`?econdemo=1`) — **QA 전용, 실사용 경로 아님** (§11).
 *
 * 목적: 리드 구매 트랜잭션·공식 경제 params가 배선되기 전에 UI의 표시 규칙
 * (가격·단계·불가 사유 5종·저장 실패 문구·장비 3동작·출항 피드백)을 브라우저
 * 에서 검수한다. `?shipdemo`와 같은 QA 스냅샷 관례:
 *  - 이 파일의 수치는 **공식 가격이 아니다** — 화면에 'QA 데모' 배지로
 *    명시하고, URL 플래그 없이는 어떤 경로에서도 마운트되지 않는다.
 *  - 정식 포트(리드 트랜잭션·게임플레이 상태)가 배선된 실사용 UI는 이 데모를
 *    쓰지 않는다 — 데모 어댑터는 포트 계약의 형태 검증용 구현일 뿐이다.
 *  - `?econdemo=savefail`: 구매 결과가 항상 saveFailed — 저장 실패 취소
 *    문구(§8 지정 문구) 표시를 검수한다.
 */

import type { CurrencyBundle, EquipmentId, MetaStateId } from '../contracts/meta';
import { EconomyHud } from './EconomyHud';
import type {
  EquipmentUiPort,
  MetaCommandFailure,
  MetaCommandResult,
  UpgradeOfferView,
} from './metaEconomyPorts';
import { SortiePrepScreen } from './SortiePrepScreen';

/** QA 데모 지갑 초기값 — 부족 사유(크레딧·희귀 부품)가 화면에 드러나는 구성 */
const DEMO_WALLET = { credits: 340, rareParts: 1 };

/** QA 데모 카탈로그 — 이름·단계 구조 검수용. 가격·수치는 공식 데이터 아님 */
const DEMO_OFFERS: Array<{
  statId: string;
  displayName: string;
  level: number;
  maxLevel: number;
  nextEffectText: string;
  cost: CurrencyBundle;
}> = [
  { statId: 'hullIntegrity', displayName: '선체 내구', level: 1, maxLevel: 5, nextEffectText: '선체 내구 +10%', cost: { credits: 120, rareParts: 0 } },
  { statId: 'maxSpeed', displayName: '최고 속도', level: 0, maxLevel: 5, nextEffectText: '최고 속도 +10%', cost: { credits: 2000, rareParts: 0 } },
  { statId: 'torpedoDamage', displayName: '어뢰 위력', level: 2, maxLevel: 5, nextEffectText: '어뢰 위력 +10%', cost: { credits: 150, rareParts: 3 } },
  { statId: 'sonarRange', displayName: '소나 범위', level: 5, maxLevel: 5, nextEffectText: '소나 범위 +10%', cost: { credits: 90, rareParts: 0 } },
];

const FAILURE_INSPECTION: ReadonlyArray<{ code: MetaCommandFailure; label: string }> = [
  { code: 'insufficientCredits', label: '크레딧 부족' },
  { code: 'insufficientRareParts', label: '희귀 부품 부족' },
  { code: 'maxLevel', label: '최대 단계' },
  { code: 'slotFull', label: '슬롯 부족' },
  { code: 'alreadyEquipped', label: '이미 장착 중' },
];

export class EconomyUiQaDemo {
  private readonly hud: EconomyHud;
  private readonly screen: SortiePrepScreen;
  private readonly panel: HTMLDivElement;

  // 데모 내부 상태 — QA 하네스 전용 (실사용 UI는 실제 상태 소스를 소비한다)
  private readonly wallet = { ...DEMO_WALLET };
  private metaState: MetaStateId = 'BASE';
  private readonly levels = new Map(DEMO_OFFERS.map((o) => [o.statId, o.level]));
  private readonly slots: (EquipmentId | null)[] = ['standardTorpedo', null];

  constructor(host: HTMLElement, forceSaveFailure: boolean) {
    const walletSource = {
      demo: this,
      get metaState(): MetaStateId {
        return this.demo.metaState;
      },
      get wallet(): CurrencyBundle {
        return { credits: this.demo.wallet.credits, rareParts: this.demo.wallet.rareParts };
      },
    };

    this.hud = new EconomyHud(host);
    this.hud.attachWalletSource(walletSource);
    // 출항 중 집계 데모 값 — getter 배선 형태 검수용 (해역 상태에서 표시)
    this.hud.attachSortieEarningsSource({
      creditsEarnedThisSortie: 85,
      rarePartsSecuredThisSortie: 1,
    });

    this.screen = new SortiePrepScreen(host, 'QA 데모 — 임시 수치 (공식 가격·판정 아님)');
    this.screen.attachWalletSource(walletSource);
    this.screen.attachUpgradePort({
      listOffers: (): readonly UpgradeOfferView[] =>
        DEMO_OFFERS.map((o) => ({
          statId: o.statId,
          displayName: o.displayName,
          currentLevel: this.levels.get(o.statId) ?? 0,
          maxLevel: o.maxLevel,
          nextEffectText: o.nextEffectText,
          cost: o.cost,
        })),
      purchase: (statId): MetaCommandResult => {
        if (forceSaveFailure) return 'saveFailed'; // 저장 실패 취소 검수 경로
        const offer = DEMO_OFFERS.find((o) => o.statId === statId);
        const level = this.levels.get(statId) ?? 0;
        if (!offer || level >= offer.maxLevel) return 'maxLevel';
        if (this.wallet.credits < offer.cost.credits) return 'insufficientCredits';
        if (this.wallet.rareParts < offer.cost.rareParts) return 'insufficientRareParts';
        this.wallet.credits -= offer.cost.credits;
        this.wallet.rareParts -= offer.cost.rareParts;
        this.levels.set(statId, level + 1);
        return 'ok';
      },
    });
    this.screen.attachEquipmentPort(this.buildDemoEquipmentPort());
    this.screen.attachDeparturePort({
      confirmDeparture: (): MetaCommandResult => (forceSaveFailure ? 'saveFailed' : 'ok'),
    });

    this.panel = this.buildInspectionPanel(host);
  }

  /** 데모 장비 포트 — 실존 EquipmentSystem과 같은 거부 규칙(범위 밖·중복) */
  private buildDemoEquipmentPort(): EquipmentUiPort {
    const demo = this;
    return {
      get slots(): readonly (EquipmentId | null)[] {
        return demo.slots;
      },
      equip(slotIndex, id): MetaCommandResult {
        if (slotIndex < 0 || slotIndex >= demo.slots.length) return 'slotFull';
        if (demo.slots.includes(id)) return 'alreadyEquipped';
        demo.slots[slotIndex] = id;
        return 'ok';
      },
      unequip(slotIndex): MetaCommandResult {
        if (slotIndex >= 0 && slotIndex < demo.slots.length) demo.slots[slotIndex] = null;
        return 'ok';
      },
    };
  }

  /** 불가 사유 5종 표시 규칙 검수 버튼 + 기지/해역 전환 (QA 하네스 전용) */
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
        this.screen.announce(item.code, `검수(${item.label})`);
      });
      panel.appendChild(button);
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = '기지/해역 전환';
    toggle.style.cssText =
      'font:0.7rem system-ui;padding:0.2rem 0.4rem;border:1px solid #9cc4d4;background:transparent;color:#9cc4d4;border-radius:3px;cursor:pointer';
    toggle.addEventListener('click', () => {
      this.metaState = this.metaState === 'BASE' ? 'SORTIE' : 'BASE';
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
