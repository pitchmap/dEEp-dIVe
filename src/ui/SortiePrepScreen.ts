/**
 * 출항 준비(기지) 화면 — 재화 현황 + 업그레이드 구매 + 장비 장착 + 출항 확정.
 * Production 배선판 (스프린트 A 마감 — A4·A5·A6 UI 항목).
 *
 * 경계 (지시 §3):
 *  - 명령·상태 진입점은 **공통 계약 `BaseScreenPort` 하나**다. 이 화면은
 *    지갑·단계·loadout·저장소·게임플레이 내부 객체를 직접 만지지 않는다 —
 *    포트의 읽기 상태를 표시하고 포트 명령의 결과를 문구로 바꿀 뿐이다.
 *  - 카탈로그(이름·단계·가격·효과)는 공식 params 검증 결과(economyMath)의
 *    읽기 전용 뷰 — **null(수치표 미도착)은 미확정으로 표기하고 구매를
 *    비활성한다. 0원 구매·임의 가격은 존재하지 않는다** (지시 §4).
 *    공식 params에 숫자가 채워지면 코드 변경 없이 그대로 활성화된다.
 *  - 출항은 포트 launchSortie 하나 — 실패(false) 시 화면 전환 없이 기지
 *    화면을 유지하고 사유를 표시한다 (지시 §6).
 *
 * 접근성 (§11): 구매 가능 여부는 색이 아니라 disabled 속성 + ✓/✕ 아이콘 +
 * 사유 문구로 전달한다. 모든 동작은 실제 <button>(키보드 포커스 가능)이며
 * 결과 피드백은 sticky 푸터(role=status)로 스크롤 위치와 무관하게 보인다.
 */

import type {
  BaseScreenPort,
  EquipmentChangeRequest,
  EquipmentId,
} from '../contracts/meta';
import type { EquipmentCatalog } from '../tools/economyMath';
import type { UiActionResult, UpgradeOfferView } from './metaEconomyPorts';
import { buildUpgradeOffers, uiResultMessage } from './metaEconomyPorts';
import type { UpgradeEntry } from '../tools/economyMath';

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

/** 출항 실패(포트 false) 표시 문구 — 기지 유지, 내부 원인 문자열 비노출 */
const DEPARTURE_FAILED_MESSAGE =
  '✕ 저장에 실패하여 출항이 취소되었습니다. 저장 공간 또는 브라우저 설정을 확인해주세요. (기지 화면 유지)';

export class SortiePrepScreen {
  private readonly root: HTMLDivElement;
  private readonly walletLine: HTMLDivElement;
  private readonly upgradeList: HTMLDivElement;
  private readonly equipmentList: HTMLDivElement;
  private readonly feedback: HTMLDivElement;
  private readonly departButton: HTMLButtonElement;

  private port: BaseScreenPort | null = null;
  private upgradeCatalog: (() => readonly UpgradeEntry[]) | null = null;
  private equipmentCatalog: EquipmentCatalog | null = null;

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

  /** 유일한 명령·상태 진입점 — 공통 계약 BaseScreenPort */
  attachBaseScreen(port: BaseScreenPort): void {
    this.port = port;
  }

  /** 공식 업그레이드 카탈로그 (economyMath 검증 결과 — 핫리로드 대응 provider) */
  attachUpgradeCatalog(provider: () => readonly UpgradeEntry[]): void {
    this.upgradeCatalog = provider;
  }

  /** 공식 장비 카탈로그 — 이름(label) 표기 소스 */
  attachEquipmentCatalog(catalog: EquipmentCatalog): void {
    this.equipmentCatalog = catalog;
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
    const levels = port.upgradeLevels;
    const loadout = port.loadout;
    return [
      `${wallet.credits}/${wallet.rareParts}`,
      Object.entries(levels)
        .map(([id, level]) => `${id}:${level}`)
        .sort()
        .join('|'),
      `${loadout.slotCapacity}:${loadout.equipped.join(',')}`,
    ].join('#');
  }

  /* ── 업그레이드 구매 (§8 / A5) ── */

  private rebuildUpgradeList(port: BaseScreenPort): void {
    this.upgradeList.replaceChildren();
    const catalog = this.upgradeCatalog?.();
    if (!catalog || catalog.length === 0) {
      this.upgradeList.appendChild(this.mutedNote('업그레이드 카탈로그가 비어 있습니다.'));
      return;
    }
    for (const offer of buildUpgradeOffers(catalog, port.upgradeLevels)) {
      this.upgradeList.appendChild(this.buildUpgradeRow(port, offer));
    }
  }

  private buildUpgradeRow(port: BaseScreenPort, offer: UpgradeOfferView): HTMLElement {
    const row = document.createElement('div');
    row.setAttribute('data-upgrade-row', offer.statId);
    row.style.cssText =
      'display:flex;flex-direction:column;gap:0.15rem;padding:0.4rem 0.5rem;background:rgba(14,30,40,0.8);border-radius:4px';

    const head = document.createElement('div');
    head.textContent = `${offer.label} — 단계 ${offer.currentLevel} / ${offer.maxLevel}`;
    row.appendChild(head);

    const effect = document.createElement('div');
    effect.textContent = offer.atMaxLevel
      ? '최대 단계 도달'
      : offer.nextEffectBonus !== null
        ? `다음 단계: ${offer.label} +${Math.round(offer.nextEffectBonus * 100)}%`
        : '다음 단계 효과: 수치표 대기 (미확정)';
    effect.style.cssText = 'color:#9cc4d4;font-size:0.76rem';
    row.appendChild(effect);

    const actionLine = document.createElement('div');
    actionLine.style.cssText =
      'display:flex;align-items:center;gap:0.5rem;margin-top:0.2rem;flex-wrap:wrap';

    const price = document.createElement('span');
    price.style.cssText = 'font-size:0.76rem;color:#ffd9a0';
    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = BUTTON_STYLE;

    if (offer.atMaxLevel) {
      price.textContent = '—';
      button.textContent = '✕ 최대 단계';
      button.disabled = true;
    } else if (!offer.cost) {
      // 공식 params가 null — 가격을 발명하지 않는다 (지시 §4).
      // params에 숫자가 채워지면 이 분기를 타지 않고 자동 활성화된다.
      price.textContent = '가격: 경제 데이터 미확정 (수치표 대기)';
      button.textContent = '구매 (경제 데이터 미확정)';
      button.disabled = true;
    } else {
      const cost = offer.cost;
      price.textContent = `가격: 크레딧 ${cost.credits}${cost.rareParts > 0 ? ` · 희귀 부품 ${cost.rareParts}` : ''}`;
      const wallet = port.wallet;
      const lackCredits = wallet.credits < cost.credits;
      const lackParts = wallet.rareParts < cost.rareParts;
      if (lackCredits || lackParts) {
        // 불가 상태를 색이 아니라 비활성 + 아이콘 + 사유로 표기 (§11)
        button.textContent = lackCredits ? '✕ 크레딧 부족' : '✕ 희귀 부품 부족';
        button.disabled = true;
      } else {
        button.textContent = `구매 — ${offer.label}`;
        button.addEventListener('click', () => this.onPurchase(port, offer));
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

  private onPurchase(port: BaseScreenPort, offer: UpgradeOfferView): void {
    // 가격 null 방어 — 트랜잭션 진입 전 차단: 0원 구매·단계/지갑 변경 없음
    if (!offer.cost) {
      this.announce({ status: 'economyDataUnavailable' }, `${offer.label} 구매`);
      return;
    }
    this.announce(port.purchaseUpgrade(offer.statId), `${offer.label} 구매`);
  }

  /* ── 장비 장착 (§9 / A6) ── */

  private equipmentLabel(id: EquipmentId): string {
    return (
      this.equipmentCatalog?.items.find((item) => item.id === id)?.label ?? id
    );
  }

  private rebuildEquipmentList(port: BaseScreenPort): void {
    this.equipmentList.replaceChildren();
    const loadout = port.loadout;

    // 슬롯 현황 — 장착 목록 + 남은 빈 슬롯. slotIndex는 표시(장착 목록)
    // 기준이며 실제 슬롯 배정은 포트 구현(조립부)이 해석한다.
    loadout.equipped.forEach((equipped, index) => {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.5rem;background:rgba(14,30,40,0.8);border-radius:4px';
      const label = document.createElement('span');
      label.textContent = `슬롯 ${index + 1}: ${this.equipmentLabel(equipped)}`;
      label.style.cssText = 'flex:1';
      row.appendChild(label);

      const unequipButton = document.createElement('button');
      unequipButton.type = 'button';
      unequipButton.textContent = '해제';
      unequipButton.style.cssText = BUTTON_STYLE;
      unequipButton.addEventListener('click', () => {
        this.request(port, { kind: 'unequip', slotIndex: index }, `슬롯 ${index + 1} 해제`);
      });
      row.appendChild(unequipButton);
      this.equipmentList.appendChild(row);
    });
    for (let i = loadout.equipped.length; i < loadout.slotCapacity; i += 1) {
      const row = document.createElement('div');
      row.textContent = `슬롯 ${i + 1}: (비어 있음)`;
      row.style.cssText =
        'padding:0.35rem 0.5rem;background:rgba(14,30,40,0.6);border-radius:4px;color:#7f97a3';
      this.equipmentList.appendChild(row);
    }

    // 장비 목록 — 공식 카탈로그 4종: 역할 설명 + 장착/교체 버튼
    const items = this.equipmentCatalog?.items ?? [];
    if (items.length === 0) {
      this.equipmentList.appendChild(this.mutedNote('장비 카탈로그가 비어 있습니다.'));
      return;
    }
    for (const item of items) {
      this.equipmentList.appendChild(this.buildEquipmentRow(port, item.id, item.label));
    }
  }

  private buildEquipmentRow(
    port: BaseScreenPort,
    id: EquipmentId,
    label: string,
  ): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;flex-direction:column;gap:0.15rem;padding:0.4rem 0.5rem;background:rgba(10,24,32,0.8);border-radius:4px';

    const head = document.createElement('div');
    head.textContent = label;
    row.appendChild(head);
    const role = document.createElement('div');
    role.textContent = EQUIPMENT_ROLE[id];
    role.style.cssText = 'color:#9cc4d4;font-size:0.76rem';
    row.appendChild(role);

    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = `${BUTTON_STYLE};align-self:flex-start;margin-top:0.2rem`;

    const loadout = port.loadout;
    const equippedIndex = loadout.equipped.indexOf(id);
    const hasFreeSlot = loadout.equipped.length < loadout.slotCapacity;
    if (equippedIndex >= 0) {
      button.textContent = `✓ 장착 중 (슬롯 ${equippedIndex + 1})`;
      button.disabled = true;
    } else if (hasFreeSlot) {
      button.textContent = '장착';
      button.addEventListener('click', () => {
        this.request(
          port,
          { kind: 'equip', slotIndex: loadout.equipped.length, equipmentId: id },
          `${label} 장착`,
        );
      });
    } else {
      // 빈 슬롯 없음 — 슬롯 1 대상 교체 (교체도 같은 changeEquipment 명령)
      button.textContent = '교체 (슬롯 1과 교체)';
      button.addEventListener('click', () => {
        this.request(
          port,
          { kind: 'replace', slotIndex: 0, equipmentId: id },
          `${label} 교체`,
        );
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

  private request(
    port: BaseScreenPort,
    request: EquipmentChangeRequest,
    actionLabel: string,
  ): void {
    this.announce(port.changeEquipment(request), actionLabel);
  }

  /* ── 출항 (§10 / §6 단일 진입점) ── */

  private onDepart(): void {
    const port = this.port;
    if (!port) return;
    // 성공 시 메타 상태가 SORTIE로 넘어가고 canLaunchSortie=false → 화면이
    // 스스로 숨는다. 실패(false) 시 상태 전환이 없으므로 기지 화면 유지 —
    // UI는 전환을 강행하지 않는다 (지시 §6).
    const launched = port.launchSortie();
    if (!launched) {
      this.feedback.textContent = `출항: ${DEPARTURE_FAILED_MESSAGE}`;
      this.renderedSignature = '';
    }
  }

  /* ── 공통 ── */

  /**
   * 명령 결과 통지 — 화면 내 버튼과 QA 검수 경로가 같은 표시 규칙을 쓴다.
   * 문구는 uiResultMessage 단일 소스 (불가 5종·저장 실패·경제 미확정 구분).
   */
  announce(result: UiActionResult, actionLabel: string): void {
    this.feedback.textContent = `${actionLabel}: ${uiResultMessage(result)}`;
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
