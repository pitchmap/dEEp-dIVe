/**
 * 출항 준비(기지) 화면 — 재화 현황 + 업그레이드 구매 + 장비 장착 + 출항 확정
 * (과제 §8~§10, 14차 창3).
 *
 * 경계:
 *  - 이 화면은 **상태 표시 + command 호출 + 결과 표시**만 한다. 구매 판정·
 *    재화 차감·loadout 변경·저장·rollback은 전부 포트 구현(게임플레이·리드·
 *    툴링) 소유다.
 *  - 표시 값은 매 프레임 소스에서 다시 읽는다 — UI 내부 임시 지갑·임시
 *    loadout 없음.
 *  - 공식 경제 데이터가 없는 항목은 가격을 표시하지 않고 구매 버튼을
 *    '가격 데이터 대기'로 비활성한다 — UI가 가격을 발명하지 않는다 (§8).
 *  - 출항 확정은 DeparturePort 결과가 ok일 때만 성립한다 — 실패(saveFailed)
 *    피드백을 표시할 뿐 화면·해역 전환을 UI가 강행하지 않는다 (§10).
 *
 * 접근성 (§11): 구매 가능 여부는 색이 아니라 disabled 속성 + ✓/✕ 아이콘 +
 * 사유 문구로 전달한다. 모든 동작은 실제 <button>(키보드 포커스 가능)이며
 * 마우스·키보드·화면 버튼이 같은 command를 호출한다. 작은 화면에서는 패널이
 * 세로 스크롤된다.
 */

import type { EquipmentId } from '../contracts/meta';
import type {
  DeparturePort,
  EquipmentUiPort,
  MetaCommandResult,
  MetaWalletSource,
  UpgradeOfferView,
  UpgradePurchasePort,
} from './metaEconomyPorts';
import { resultMessage } from './metaEconomyPorts';

/** 장비 4종 표기 — 이름·역할 설명(정성 서술만, 수치 복제 금지) */
const EQUIPMENT_INFO: Record<EquipmentId, { name: string; role: string }> = {
  standardTorpedo: { name: '표준 어뢰', role: '균형형 기본 어뢰 — 대부분의 표적에 무난하다.' },
  fastTorpedo: { name: '고속 어뢰', role: '빠른 주행·낮은 위력 — 리드샷 여유가 없는 표적용.' },
  heavyTorpedo: { name: '중어뢰', role: '느린 주행·높은 위력 — 대형 표적·보스 상대용.' },
  decoy: { name: '기만기', role: '음향 기만 — 적의 추적을 다른 곳으로 유인한다.' },
};

const EQUIPMENT_IDS: readonly EquipmentId[] = [
  'standardTorpedo',
  'fastTorpedo',
  'heavyTorpedo',
  'decoy',
];

const BUTTON_STYLE = [
  'font:0.78rem system-ui,sans-serif',
  'padding:0.3rem 0.6rem',
  'border-radius:4px',
  'border:1px solid rgba(150,190,205,0.5)',
  'background:rgba(28,52,64,0.9)',
  'color:#dcecf2',
  'cursor:pointer',
].join(';');

export class SortiePrepScreen {
  private readonly root: HTMLDivElement;
  private readonly walletLine: HTMLDivElement;
  private readonly upgradeList: HTMLDivElement;
  private readonly equipmentList: HTMLDivElement;
  private readonly feedback: HTMLDivElement;
  private readonly departButton: HTMLButtonElement;

  private walletSource: MetaWalletSource | null = null;
  private upgradePort: UpgradePurchasePort | null = null;
  private equipmentPort: EquipmentUiPort | null = null;
  private departurePort: DeparturePort | null = null;

  /** 목록 재구축 판단용 서명 — 상태가 바뀐 프레임에만 DOM을 다시 만든다 */
  private renderedSignature = '';
  private visible = false;

  constructor(host: HTMLElement = document.body, qaBadgeText?: string) {
    this.root = document.createElement('div');
    this.root.setAttribute('data-ui-sortie-prep', '');
    this.root.style.cssText = [
      'position:absolute',
      'top:0',
      'right:0',
      'height:100%',
      'width:min(92vw, 24rem)',
      'box-sizing:border-box',
      'z-index:25', // 조준경(30)·재화 HUD(32)와 겹침 없음 — 기지 상태 전용 화면
      'display:none',
      'flex-direction:column',
      'gap:0.6rem',
      'padding:0.9rem',
      'overflow-y:auto',
      'background:rgba(5,13,18,0.88)',
      'border-left:1px solid rgba(150,190,205,0.3)',
      'color:#dcecf2',
      'font:0.82rem/1.5 system-ui,sans-serif',
    ].join(';');

    const title = document.createElement('h2');
    title.textContent = '출항 준비';
    title.style.cssText = 'margin:0;font-size:1.05rem;color:#bfe3f2';
    this.root.appendChild(title);

    if (qaBadgeText) {
      // 디버그·QA 경로 구분 표기 (§11 — 실사용 UI와 혼동 금지)
      const badge = document.createElement('div');
      badge.textContent = qaBadgeText;
      badge.style.cssText =
        'padding:0.3rem 0.5rem;border:1px dashed #ffb347;color:#ffb347;border-radius:4px;font-size:0.72rem';
      this.root.appendChild(badge);
    }

    this.walletLine = document.createElement('div');
    this.walletLine.style.cssText = 'color:#ffd9a0';
    this.root.appendChild(this.walletLine);

    this.upgradeList = this.appendSection('영구 업그레이드');
    this.equipmentList = this.appendSection('장비 슬롯');

    // 고정 푸터 — 결과 피드백과 출항 버튼은 스크롤 위치와 무관하게 항상
    // 보인다. 하단 안쪽 여백은 전투·귀환 HUD 버튼 스트립(z-90, fixed
    // 우하단)과의 겹침을 피하는 값이다 (§11 z-index·레이아웃 충돌 방지).
    const footer = document.createElement('div');
    footer.style.cssText = [
      'position:sticky',
      'bottom:0',
      'margin-top:auto',
      'display:flex',
      'flex-direction:column',
      'gap:0.5rem',
      'padding:0.5rem 0 3.8rem',
      'background:rgba(5,13,18,0.96)',
    ].join(';');

    this.feedback = document.createElement('div');
    this.feedback.setAttribute('role', 'status'); // 스크린리더에 결과 통지
    this.feedback.style.cssText =
      'min-height:2.4em;padding:0.4rem 0.5rem;border-radius:4px;background:rgba(28,52,64,0.6)';
    footer.appendChild(this.feedback);

    this.departButton = document.createElement('button');
    this.departButton.type = 'button';
    this.departButton.textContent = '출항';
    this.departButton.style.cssText = `${BUTTON_STYLE};font-size:0.95rem;padding:0.55rem;background:rgba(40,84,64,0.95)`;
    this.departButton.addEventListener('click', () => this.onDepart());
    footer.appendChild(this.departButton);

    this.root.appendChild(footer);
    host.appendChild(this.root);
  }

  private appendSection(titleText: string): HTMLDivElement {
    const heading = document.createElement('h3');
    heading.textContent = titleText;
    heading.style.cssText =
      'margin:0.4rem 0 0;font-size:0.9rem;color:#9cc4d4;border-bottom:1px solid rgba(150,190,205,0.25);padding-bottom:0.25rem';
    this.root.appendChild(heading);
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:0.5rem';
    this.root.appendChild(list);
    return list;
  }

  /* ── 포트 연결 (composition root 1회 주입) ── */

  attachWalletSource(source: MetaWalletSource): void {
    this.walletSource = source;
  }

  attachUpgradePort(port: UpgradePurchasePort): void {
    this.upgradePort = port;
  }

  attachEquipmentPort(port: EquipmentUiPort): void {
    this.equipmentPort = port;
  }

  attachDeparturePort(port: DeparturePort): void {
    this.departurePort = port;
  }

  /* ── 프레임 갱신 ── */

  update(): void {
    const state = this.walletSource?.metaState;
    const shouldShow = state === 'BASE' || state === 'SORTIE_PREP';
    if (shouldShow !== this.visible) {
      this.visible = shouldShow;
      this.root.style.display = shouldShow ? 'flex' : 'none';
    }
    if (!shouldShow || !this.walletSource) return;

    const wallet = this.walletSource.wallet;
    const walletText = `보유 — 크레딧 ${Math.floor(wallet.credits)} · 희귀 부품 ${Math.floor(wallet.rareParts)} (확정 자산)`;
    if (this.walletLine.textContent !== walletText) {
      this.walletLine.textContent = walletText;
    }

    const signature = this.buildSignature();
    if (signature !== this.renderedSignature) {
      this.renderedSignature = signature;
      this.rebuildUpgradeList();
      this.rebuildEquipmentList();
    }
  }

  /** 목록에 영향을 주는 상태만 직렬화 — 값이 바뀐 프레임에만 재구축 */
  private buildSignature(): string {
    const wallet = this.walletSource?.wallet;
    const offers = this.upgradePort?.listOffers() ?? [];
    const slots = this.equipmentPort?.slots ?? [];
    return [
      wallet ? `${wallet.credits}/${wallet.rareParts}` : '',
      offers
        .map((o) => `${o.statId}:${o.currentLevel}/${o.maxLevel}:${o.cost ? `${o.cost.credits},${o.cost.rareParts}` : 'x'}`)
        .join('|'),
      slots.join(','),
    ].join('#');
  }

  /* ── 업그레이드 구매 (§8) ── */

  private rebuildUpgradeList(): void {
    this.upgradeList.replaceChildren();
    const port = this.upgradePort;
    if (!port) {
      this.upgradeList.appendChild(this.mutedNote('업그레이드 데이터 배선 대기 (리드 카탈로그 연결 후 표시).'));
      return;
    }
    for (const offer of port.listOffers()) {
      this.upgradeList.appendChild(this.buildUpgradeRow(port, offer));
    }
  }

  private buildUpgradeRow(port: UpgradePurchasePort, offer: UpgradeOfferView): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;flex-direction:column;gap:0.15rem;padding:0.4rem 0.5rem;background:rgba(14,30,40,0.8);border-radius:4px';

    const head = document.createElement('div');
    head.textContent = `${offer.displayName} — 단계 ${offer.currentLevel} / ${offer.maxLevel}`;
    row.appendChild(head);

    if (offer.nextEffectText) {
      const effect = document.createElement('div');
      effect.textContent = `다음 단계: ${offer.nextEffectText}`;
      effect.style.cssText = 'color:#9cc4d4;font-size:0.76rem';
      row.appendChild(effect);
    }

    const actionLine = document.createElement('div');
    actionLine.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-top:0.2rem;flex-wrap:wrap';

    const price = document.createElement('span');
    price.style.cssText = 'font-size:0.76rem;color:#ffd9a0';
    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = BUTTON_STYLE;

    const atMax = offer.currentLevel >= offer.maxLevel;
    if (atMax) {
      price.textContent = '최대 단계 도달';
      button.textContent = '✕ 최대 단계';
      button.disabled = true;
    } else if (!offer.cost) {
      // 공식 경제 데이터 부재 — 가격을 발명하지 않는다 (§8)
      price.textContent = '가격: 공식 데이터 대기';
      button.textContent = '구매 (가격 데이터 대기)';
      button.disabled = true;
    } else if (!port.purchase) {
      price.textContent = `가격: 크레딧 ${offer.cost.credits}${offer.cost.rareParts > 0 ? ` · 희귀 부품 ${offer.cost.rareParts}` : ''}`;
      button.textContent = '구매 (구매 처리 배선 대기)';
      button.disabled = true;
    } else {
      price.textContent = `가격: 크레딧 ${offer.cost.credits}${offer.cost.rareParts > 0 ? ` · 희귀 부품 ${offer.cost.rareParts}` : ''}`;
      const wallet = this.walletSource?.wallet;
      const lackCredits = !!wallet && wallet.credits < offer.cost.credits;
      const lackParts = !!wallet && wallet.rareParts < offer.cost.rareParts;
      if (lackCredits || lackParts) {
        // 불가 상태를 색이 아니라 비활성 + 아이콘 + 사유로 표기 (§11)
        button.textContent = lackCredits ? '✕ 크레딧 부족' : '✕ 희귀 부품 부족';
        button.disabled = true;
      } else {
        button.textContent = `구매 — ${offer.displayName}`;
        const purchase = port.purchase;
        button.addEventListener('click', () => {
          this.showResult(purchase(offer.statId), `${offer.displayName} 구매`);
        });
      }
    }
    if (button.disabled) {
      button.style.opacity = '0.55';
      button.style.cursor = 'not-allowed';
      button.setAttribute('aria-disabled', 'true');
    }

    actionLine.append(price, button);
    row.appendChild(actionLine);
    return row;
  }

  /* ── 장비 장착 (§9) ── */

  private rebuildEquipmentList(): void {
    this.equipmentList.replaceChildren();
    const port = this.equipmentPort;
    if (!port) {
      this.equipmentList.appendChild(this.mutedNote('장비 시스템 배선 대기.'));
      return;
    }

    // 슬롯 현황 — 각 슬롯의 현재 장비 + 해제 버튼
    port.slots.forEach((equipped, slotIndex) => {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.5rem;background:rgba(14,30,40,0.8);border-radius:4px';
      const label = document.createElement('span');
      label.textContent = `슬롯 ${slotIndex + 1}: ${equipped ? EQUIPMENT_INFO[equipped].name : '(비어 있음)'}`;
      label.style.cssText = 'flex:1';
      row.appendChild(label);
      if (equipped) {
        const unequipButton = document.createElement('button');
        unequipButton.type = 'button';
        unequipButton.textContent = '해제';
        unequipButton.style.cssText = BUTTON_STYLE;
        unequipButton.addEventListener('click', () => {
          this.showResult(port.unequip(slotIndex), `슬롯 ${slotIndex + 1} 해제`);
        });
        row.appendChild(unequipButton);
      }
      this.equipmentList.appendChild(row);
    });

    // 장비 목록 — 역할 설명 + 장착(빈 슬롯)/교체 안내
    for (const id of EQUIPMENT_IDS) {
      this.equipmentList.appendChild(this.buildEquipmentRow(port, id));
    }
  }

  private buildEquipmentRow(port: EquipmentUiPort, id: EquipmentId): HTMLElement {
    const info = EQUIPMENT_INFO[id];
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;flex-direction:column;gap:0.15rem;padding:0.4rem 0.5rem;background:rgba(10,24,32,0.8);border-radius:4px';

    const head = document.createElement('div');
    head.textContent = info.name;
    row.appendChild(head);
    const role = document.createElement('div');
    role.textContent = info.role;
    role.style.cssText = 'color:#9cc4d4;font-size:0.76rem';
    row.appendChild(role);

    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = `${BUTTON_STYLE};align-self:flex-start;margin-top:0.2rem`;

    const equippedIndex = port.slots.indexOf(id);
    const freeSlot = port.slots.indexOf(null);
    if (equippedIndex >= 0) {
      button.textContent = `✓ 장착 중 (슬롯 ${equippedIndex + 1})`;
      button.disabled = true;
    } else if (freeSlot >= 0) {
      button.textContent = `장착 (슬롯 ${freeSlot + 1})`;
      button.addEventListener('click', () => {
        this.showResult(port.equip(freeSlot, id), `${info.name} 장착`);
      });
    } else {
      // 빈 슬롯 없음 — 교체는 슬롯 1 기준 command (교체 = 같은 equip 진입점)
      button.textContent = '교체 (슬롯 1과 교체)';
      button.addEventListener('click', () => {
        this.showResult(port.equip(0, id), `${info.name} 교체`);
      });
    }
    if (button.disabled) {
      button.style.opacity = '0.55';
      button.style.cursor = 'not-allowed';
      button.setAttribute('aria-disabled', 'true');
    }
    row.appendChild(button);
    return row;
  }

  /* ── 출항 (§10) ── */

  private onDepart(): void {
    if (!this.departurePort) {
      this.feedback.textContent = '✕ 출항 처리(확정 직전 저장) 배선 대기.';
      return;
    }
    // 결과가 ok가 아니면 해역 전환은 일어나지 않는다 — 포트 구현이 보장하고
    // UI는 사유(저장 실패 등)를 표시할 뿐 전환을 강행하지 않는다.
    this.showResult(this.departurePort.confirmDeparture(), '출항');
  }

  /* ── 공통 ── */

  /**
   * command 결과 통지 — 화면 내 버튼과 외부 포트 콜백(비동기 rollback 통지,
   * QA 검수 경로)이 같은 표시 규칙을 쓴다. 문구는 resultMessage 단일 소스.
   */
  announce(result: MetaCommandResult, actionLabel: string): void {
    this.showResult(result, actionLabel);
  }

  private showResult(result: MetaCommandResult, actionLabel: string): void {
    this.feedback.textContent = `${actionLabel}: ${resultMessage(result)}`;
    // 상태가 바뀌었을 수 있으므로 다음 프레임 재구축을 강제한다
    this.renderedSignature = '';
  }

  private mutedNote(text: string): HTMLElement {
    const note = document.createElement('div');
    note.textContent = text;
    note.style.cssText = 'color:#7f97a3;font-size:0.76rem';
    return note;
  }

  dispose(): void {
    this.root.remove();
  }
}
