/**
 * 출항 준비(기지) 화면 — 재화 현황 + 업그레이드 구매 + 장비 장착 + 출항 확정.
 * **BaseScreenPort v2 전용 소비판** (INT-CORE-010).
 *
 * 경계:
 *  - 상태·명령 진입점은 포트 하나다: wallet·sortieCreditsEarned·
 *    sortieRarePartsSecured·upgradeCatalog·upgradeLevels·equipmentCatalog·
 *    loadout·canLaunchSortie·lastResult / purchaseUpgrade·equipItem·
 *    replaceItem·unequipItem·confirmDeparture.
 *  - 지갑·단계·loadout·저장소를 UI가 직접 만지지 않는다. 게임플레이 로컬
 *    결과 타입도 읽지 않는다 — 결과는 계약 문자열 코드뿐이다.
 *  - 가격·효과는 포트가 준 공식 카탈로그 값만 표시한다. `nextCostPending`
 *    (공식 params 미확정)이면 구매 버튼을 비활성하고 미확정으로 표기한다 —
 *    0원 구매·임의 가격은 만들지 않는다.
 *  - 출항은 `confirmDeparture()` 하나 — 실패 시 화면 전환 없이 기지를
 *    유지하고 사유를 표시한다 (UI가 전환을 강행하지 않는다).
 *
 * 접근성 (§11): 가능 여부는 색이 아니라 disabled + ✓/✕ 아이콘 + 사유 문구로
 * 전달한다. 모든 동작은 실제 <button>(키보드 포커스 가능)이며 결과 피드백은
 * sticky 푸터(role=status)로 스크롤 위치와 무관하게 보인다.
 */

import type {
  BaseScreenPort,
  EquipmentId,
  UpgradeCatalogItem,
  UpgradeStatId,
} from '../contracts/meta';
import {
  commandOutcomeMessage,
  departureOutcomeMessage,
  upgradePriceText,
} from './metaEconomyPorts';

/** 장비 4종 역할 설명 (정성 서술만 — 수치 복제 금지). 이름은 공식 카탈로그 label */
const EQUIPMENT_ROLE: Record<EquipmentId, string> = {
  standardTorpedo: '균형형 기본 어뢰 — 대부분의 표적에 무난하다.',
  fastTorpedo: '빠른 주행·낮은 위력 — 리드샷 여유가 없는 표적용.',
  heavyTorpedo: '느린 주행·높은 위력 — 대형 표적·보스 상대용.',
  decoy: '음향 기만 — 적의 추적을 다른 곳으로 유인한다.',
};

const BUTTON_STYLE = [
  'font:0.78rem system-ui,sans-serif',
  'padding:0.3rem 0.6rem',
  'border-radius:4px',
  'border:1px solid rgba(150,190,205,0.5)',
  'background:rgba(28,52,64,0.9)',
  'color:#dcecf2',
  'cursor:pointer',
].join(';');

/**
 * 슬롯 위치 읽기 뷰 — v2 `loadout.equipped`는 빈 슬롯이 압축된 목록이라
 * **실제 슬롯 인덱스를 복원할 수 없다**. 슬롯 지정 명령(equipItem·
 * replaceItem·unequipItem)은 실제 인덱스를 받으므로, 중간 슬롯 해제 이후
 * 잘못된 슬롯을 조작하지 않으려면 위치 정보가 필요하다.
 * 계약 편입(BaseScreenPort에 slotPositions 추가)은 INT-RENDER-010 요청 중 —
 * 미주입 시에는 좌측 정렬 가정으로 동작한다(빈 구멍이 없는 동안 정확).
 */
export interface EquipmentSlotPositionView {
  readonly slots: readonly (EquipmentId | null)[];
}

export class SortiePrepScreen {
  private readonly root: HTMLDivElement;
  private readonly walletLine: HTMLDivElement;
  private readonly upgradeList: HTMLDivElement;
  private readonly equipmentList: HTMLDivElement;
  private readonly feedback: HTMLDivElement;
  private readonly departButton: HTMLButtonElement;

  private port: BaseScreenPort | null = null;
  private slotView: EquipmentSlotPositionView | null = null;

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
      'z-index:25', // 조준경(30)·재화 HUD(32)·HUD 버튼(90)과 겹침 없음 — 기지 전용
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

  /* ── 연결 (composition root 1회 주입) ── */

  /** 유일한 상태·명령 진입점 — BaseScreenPort v2 */
  attachBaseScreen(port: BaseScreenPort): void {
    this.port = port;
  }

  /** 슬롯 위치 뷰 (v2 계약 편입 요청 중 — INT-RENDER-010) */
  attachSlotPositions(view: EquipmentSlotPositionView): void {
    this.slotView = view;
  }

  /* ── 프레임 갱신 ── */

  update(): void {
    const port = this.port;
    const shouldShow = port?.canLaunchSortie === true;
    if (shouldShow !== this.visible) {
      this.visible = shouldShow;
      this.root.style.display = shouldShow ? 'flex' : 'none';
      if (!shouldShow) this.renderedSignature = '';
    }
    if (!shouldShow || !port) return;

    const wallet = port.wallet;
    const walletText = `보유 — 크레딧 ${Math.floor(wallet.credits)} · 희귀 부품 ${Math.floor(wallet.rareParts)} (확정 자산)`;
    if (this.walletLine.textContent !== walletText) {
      this.walletLine.textContent = walletText;
    }

    const signature = this.buildSignature(port);
    if (signature !== this.renderedSignature) {
      this.renderedSignature = signature;
      this.rebuildUpgradeList(port);
      this.rebuildEquipmentList(port);
    }
  }

  /** 목록에 영향을 주는 포트 상태만 직렬화 — 값이 바뀐 프레임에만 재구축 */
  private buildSignature(port: BaseScreenPort): string {
    const wallet = port.wallet;
    return [
      `${wallet.credits}/${wallet.rareParts}`,
      port.upgradeCatalog
        .map((item) => {
          const cost = item.nextCost;
          return `${item.id}:${port.upgradeLevels[item.id] ?? 0}:${
            item.nextCostPending ? 'pending' : cost ? `${cost.credits},${cost.rareParts}` : 'max'
          }`;
        })
        .join('|'),
      this.realSlots(port).join(','),
    ].join('#');
  }

  /**
   * 실제 슬롯 배열 — 위치 뷰가 있으면 그대로, 없으면 압축된 loadout을
   * 좌측 정렬로 복원한다 (빈 구멍이 없는 동안 정확).
   */
  private realSlots(port: BaseScreenPort): readonly (EquipmentId | null)[] {
    if (this.slotView) return this.slotView.slots;
    const loadout = port.loadout;
    return Array.from({ length: loadout.slotCapacity }, (_, i) => loadout.equipped[i] ?? null);
  }

  /* ── 업그레이드 구매 (A5) ── */

  private rebuildUpgradeList(port: BaseScreenPort): void {
    this.upgradeList.replaceChildren();
    if (port.upgradeCatalog.length === 0) {
      this.upgradeList.appendChild(this.mutedNote('업그레이드 카탈로그가 비어 있습니다.'));
      return;
    }
    for (const item of port.upgradeCatalog) {
      this.upgradeList.appendChild(this.buildUpgradeRow(port, item));
    }
  }

  private buildUpgradeRow(port: BaseScreenPort, item: UpgradeCatalogItem): HTMLElement {
    const currentLevel = port.upgradeLevels[item.id] ?? 0;
    const atMaxLevel = currentLevel >= item.maxLevel;

    const row = document.createElement('div');
    row.setAttribute('data-upgrade-row', item.id);
    row.style.cssText =
      'display:flex;flex-direction:column;gap:0.15rem;padding:0.4rem 0.5rem;background:rgba(14,30,40,0.8);border-radius:4px';

    const head = document.createElement('div');
    head.textContent = `${item.label} — 단계 ${currentLevel} / ${item.maxLevel}`;
    row.appendChild(head);

    const actionLine = document.createElement('div');
    actionLine.style.cssText =
      'display:flex;align-items:center;gap:0.5rem;margin-top:0.2rem;flex-wrap:wrap';

    const price = document.createElement('span');
    price.style.cssText = 'font-size:0.76rem;color:#ffd9a0';
    price.textContent = upgradePriceText(item, atMaxLevel);

    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = BUTTON_STYLE;

    if (atMaxLevel) {
      button.textContent = '✕ 최대 단계';
      button.disabled = true;
    } else if (item.nextCostPending || !item.nextCost) {
      // 공식 params 미확정 — 트랜잭션 진입 없이 비활성 (0원 구매 금지)
      button.textContent = '구매 (경제 데이터 미확정)';
      button.disabled = true;
    } else {
      const cost = item.nextCost;
      const wallet = port.wallet;
      const lackCredits = wallet.credits < cost.credits;
      const lackParts = wallet.rareParts < cost.rareParts;
      if (lackCredits || lackParts) {
        // 불가 상태를 색이 아니라 비활성 + 아이콘 + 사유로 표기 (§11)
        button.textContent = lackCredits ? '✕ 크레딧 부족' : '✕ 희귀 부품 부족';
        button.disabled = true;
      } else {
        button.textContent = `구매 — ${item.label}`;
        button.addEventListener('click', () => {
          this.announce(
            commandOutcomeMessage(port.purchaseUpgrade(item.id as UpgradeStatId)),
            `${item.label} 구매`,
          );
        });
      }
    }
    if (button.disabled) this.markDisabled(button);

    actionLine.append(price, button);
    row.appendChild(actionLine);
    return row;
  }

  /* ── 장비 장착 (A6) ── */

  private rebuildEquipmentList(port: BaseScreenPort): void {
    this.equipmentList.replaceChildren();
    const slots = this.realSlots(port);
    const catalog = port.equipmentCatalog;
    const labelOf = (id: EquipmentId): string =>
      catalog.find((item) => item.id === id)?.label ?? id;

    // 슬롯 현황 — 실제 슬롯 인덱스 기준 (명령의 slotIndex와 동일 축)
    slots.forEach((equipped, slotIndex) => {
      const row = document.createElement('div');
      row.setAttribute('data-equipment-slot', String(slotIndex));
      row.style.cssText =
        'display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.5rem;background:rgba(14,30,40,0.8);border-radius:4px';
      const label = document.createElement('span');
      label.textContent = `슬롯 ${slotIndex + 1}: ${equipped ? labelOf(equipped) : '(비어 있음)'}`;
      label.style.cssText = 'flex:1';
      row.appendChild(label);
      if (equipped) {
        const unequipButton = document.createElement('button');
        unequipButton.type = 'button';
        unequipButton.textContent = '해제';
        unequipButton.style.cssText = BUTTON_STYLE;
        unequipButton.addEventListener('click', () => {
          this.announce(
            commandOutcomeMessage(port.unequipItem(slotIndex)),
            `슬롯 ${slotIndex + 1} 해제`,
          );
        });
        row.appendChild(unequipButton);
      }
      this.equipmentList.appendChild(row);
    });

    // 장비 목록 — 공식 카탈로그 4종: 이름·가격·역할 설명 + 장착/교체
    if (catalog.length === 0) {
      this.equipmentList.appendChild(this.mutedNote('장비 카탈로그가 비어 있습니다.'));
      return;
    }
    for (const item of catalog) {
      this.equipmentList.appendChild(
        this.buildEquipmentRow(port, item.id, item.label, item.cost, slots),
      );
    }
  }

  private buildEquipmentRow(
    port: BaseScreenPort,
    id: EquipmentId,
    label: string,
    cost: { readonly credits: number; readonly rareParts: number } | null,
    slots: readonly (EquipmentId | null)[],
  ): HTMLElement {
    const row = document.createElement('div');
    row.setAttribute('data-equipment-row', id);
    row.style.cssText =
      'display:flex;flex-direction:column;gap:0.15rem;padding:0.4rem 0.5rem;background:rgba(10,24,32,0.8);border-radius:4px';

    const head = document.createElement('div');
    head.textContent = label;
    row.appendChild(head);

    const priceLine = document.createElement('div');
    priceLine.style.cssText = 'font-size:0.76rem;color:#ffd9a0';
    if (!cost) {
      priceLine.textContent = '가격: 경제 데이터 미확정 (수치표 대기)';
    } else if (cost.credits === 0 && cost.rareParts === 0) {
      // 공식 가격 0 = 시작 보유 장비 (params의 startingItem — 계약 뷰 편입은
      // INT-RENDER-010 요청 중. 여기서 수치를 만들지 않고 0을 해석만 한다)
      priceLine.textContent = '시작 보유 (구매 비용 없음)';
    } else {
      priceLine.textContent = `가격: 크레딧 ${cost.credits}${cost.rareParts > 0 ? ` · 희귀 부품 ${cost.rareParts}` : ''}`;
    }
    row.appendChild(priceLine);

    const role = document.createElement('div');
    role.textContent = EQUIPMENT_ROLE[id];
    role.style.cssText = 'color:#9cc4d4;font-size:0.76rem';
    row.appendChild(role);

    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = `${BUTTON_STYLE};align-self:flex-start;margin-top:0.2rem`;

    const equippedIndex = slots.indexOf(id);
    const freeIndex = slots.indexOf(null);
    if (equippedIndex >= 0) {
      button.textContent = `✓ 장착 중 (슬롯 ${equippedIndex + 1})`;
      button.disabled = true;
      this.markDisabled(button);
    } else if (freeIndex >= 0) {
      button.textContent = `장착 (슬롯 ${freeIndex + 1})`;
      button.addEventListener('click', () => {
        this.announce(commandOutcomeMessage(port.equipItem(id, freeIndex)), `${label} 장착`);
      });
    } else {
      // 빈 슬롯 없음 — 슬롯 1 대상 교체 (교체도 같은 슬롯 지정 명령)
      button.textContent = '교체 (슬롯 1과 교체)';
      button.addEventListener('click', () => {
        this.announce(commandOutcomeMessage(port.replaceItem(id, 0)), `${label} 교체`);
      });
    }
    row.appendChild(button);
    return row;
  }

  /* ── 출항 (단일 진입점) ── */

  private onDepart(): void {
    const port = this.port;
    if (!port) return;
    // 성공(departed) 시 메타 상태가 SORTIE로 넘어가 canLaunchSortie=false가
    // 되고 화면이 스스로 숨는다. 실패 시 상태 전환이 없으므로 기지 화면이
    // 유지된다 — UI는 전환을 강행하지 않는다.
    this.announce(departureOutcomeMessage(port.confirmDeparture()), '출항');
  }

  /* ── 공통 ── */

  /** 명령 결과 통지 — 화면 버튼과 QA 검수 경로가 같은 표시 규칙을 쓴다 */
  announce(message: string, actionLabel: string): void {
    this.feedback.textContent = `${actionLabel}: ${message}`;
    // 상태가 바뀌었을 수 있으므로 다음 프레임 재구축을 강제한다
    this.renderedSignature = '';
  }

  private markDisabled(button: HTMLButtonElement): void {
    button.style.opacity = '0.55';
    button.style.cursor = 'not-allowed';
    button.setAttribute('aria-disabled', 'true');
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
