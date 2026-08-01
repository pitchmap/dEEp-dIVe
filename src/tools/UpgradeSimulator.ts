/**
 * 업그레이드 시뮬레이터 (툴링 소유 — 소회의(11) 결의 4, 7차 결의 8).
 *
 * 목적: 기획이 빌드 없이 업그레이드 조합의 최종 수치와 **총비용 곡선**을
 * 검증한다. 7차 결의 8의 판정 기준 '보스 도전 최소 사양까지 출항 4~6회'를
 * 이 화면에서 사전 확인한다.
 *
 * 규칙:
 *  - 계산은 `src/meta/upgradeMath.ts`(리드 정본) 함수만 사용 — 복제 금지.
 *  - params 원본을 절대 수정하지 않는다 (읽기 전용 + JSON 내보내기만).
 *  - 미확정(null) 값은 '미확정'으로 표시하고 계산을 보류한다 — 임의 값 대입 금지.
 */

import { loadParams, onParamsReloaded } from '../config/ParamLoader';
import { effectiveDurationSeconds, effectiveValue } from '../meta/upgradeMath';
import {
  estimatedSortiesToAfford,
  loadEquipmentCatalog,
  loadUpgradeCatalog,
  onCatalogReloaded,
  pendingFields,
  resolveParamRef,
  totalUpgradeCost,
  type OfficialUpgradeId,
  type UpgradeEntry,
} from './upgradeCalculator';

/** 시간형(작을수록 좋은) 기준값 — 단축 적용 대상 */
const DURATION_STATS: readonly OfficialUpgradeId[] = ['turnRate', 'reloadSpeed'];

/** 보스 도전 최소 사양 가정 — 전 항목 1단계 (7차 결의 8 곡선 확인용 기본값) */
const DEFAULT_TARGET_LEVEL = 1;

interface RowState {
  def: UpgradeEntry;
  level: number;
}

export class UpgradeSimulator {
  private readonly root: HTMLDivElement;
  private readonly tableBody: HTMLDivElement;
  private readonly summary: HTMLDivElement;
  private readonly output: HTMLTextAreaElement;
  private readonly creditsPerSortieInput: HTMLInputElement;
  private readonly unsubscribers: Array<() => void> = [];
  private rows: RowState[] = [];

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'upgrade-sim hud-hidden';

    const title = document.createElement('div');
    title.className = 'upgrade-sim-title';
    title.textContent = '업그레이드 시뮬레이터 — 최종값 = 기준값 × (1 + 보정 합) [합연산]';
    this.root.appendChild(title);

    this.tableBody = document.createElement('div');
    this.root.appendChild(this.tableBody);

    this.summary = document.createElement('div');
    this.summary.className = 'upgrade-sim-summary';
    this.root.appendChild(this.summary);

    const sortieRow = document.createElement('div');
    sortieRow.className = 'upgrade-sim-actions';
    const label = document.createElement('span');
    label.textContent = '출항당 평균 크레딧: ';
    this.creditsPerSortieInput = document.createElement('input');
    this.creditsPerSortieInput.type = 'number';
    this.creditsPerSortieInput.placeholder = '미확정';
    this.creditsPerSortieInput.addEventListener('input', () => this.renderSummary());
    sortieRow.append(label, this.creditsPerSortieInput);
    this.root.appendChild(sortieRow);

    const actions = document.createElement('div');
    actions.className = 'upgrade-sim-actions';
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.textContent = '결과 JSON 복사';
    copyButton.addEventListener('click', () => {
      void this.copyOutput();
    });
    actions.appendChild(copyButton);
    this.root.appendChild(actions);

    this.output = document.createElement('textarea');
    this.output.className = 'upgrade-sim-output';
    this.output.readOnly = true;
    this.output.rows = 6;
    this.root.appendChild(this.output);

    container.appendChild(this.root);

    this.rebuildRows();
    this.unsubscribers.push(
      onCatalogReloaded(() => this.rebuildRows()),
      onParamsReloaded(() => this.render()),
    );
  }

  toggle(): void {
    this.root.classList.toggle('hud-hidden');
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.root.remove();
  }

  private rebuildRows(): void {
    const previous = new Map(this.rows.map((row) => [row.def.id, row.level]));
    this.rows = loadUpgradeCatalog().map((def) => ({
      def,
      level: Math.min(previous.get(def.id) ?? DEFAULT_TARGET_LEVEL, def.maxLevel),
    }));
    this.render();
  }

  /** 단계까지의 누적 보정 합 — 미확정 단계가 하나라도 있으면 null */
  private bonusSumAt(def: UpgradeEntry, level: number): number | null {
    if (level <= 0) return 0;
    const value = def.effectBonus[level - 1];
    return value === null || value === undefined ? null : value;
  }

  private baseValueOf(def: UpgradeEntry): number | null {
    return def.paramRef ? resolveParamRef(loadParams(), def.paramRef) : null;
  }

  private finalValueOf(def: UpgradeEntry, level: number): number | null {
    const base = this.baseValueOf(def);
    const bonus = this.bonusSumAt(def, level);
    if (base === null || bonus === null) return null;
    return DURATION_STATS.includes(def.id)
      ? effectiveDurationSeconds(base, bonus)
      : effectiveValue(base, bonus);
  }

  private render(): void {
    this.tableBody.textContent = '';

    const header = document.createElement('div');
    header.className = 'upgrade-sim-row upgrade-sim-header';
    for (const text of ['항목', '단계', '기준값', '보정 합', '최종값']) {
      const cell = document.createElement('span');
      cell.textContent = text;
      header.appendChild(cell);
    }
    this.tableBody.appendChild(header);

    for (const row of this.rows) {
      const el = document.createElement('div');
      el.className = 'upgrade-sim-row';

      const name = document.createElement('span');
      name.textContent = row.def.label;
      name.title = row.def.note ?? row.def.paramRef ?? '';

      const levelSelect = document.createElement('select');
      for (let level = 0; level <= row.def.maxLevel; level += 1) {
        const option = document.createElement('option');
        option.value = String(level);
        const bonus = this.bonusSumAt(row.def, level);
        option.textContent = bonus === null ? `${level} (미확정)` : `${level} (+${Math.round(bonus * 100)}%)`;
        if (level === row.level) option.selected = true;
        levelSelect.appendChild(option);
      }
      levelSelect.addEventListener('change', () => {
        row.level = Number(levelSelect.value);
        this.render();
      });

      const base = this.baseValueOf(row.def);
      const baseCell = document.createElement('span');
      baseCell.textContent = base !== null ? String(base) : '미확정';
      baseCell.title = row.def.paramRef ?? '기준값 파라미터 미도입';

      const bonus = this.bonusSumAt(row.def, row.level);
      const bonusCell = document.createElement('span');
      bonusCell.className = 'upgrade-sim-bonus';
      bonusCell.textContent = bonus === null ? '미확정' : `+${Math.round(bonus * 100)}%`;

      const final = this.finalValueOf(row.def, row.level);
      const finalCell = document.createElement('span');
      finalCell.className = 'upgrade-sim-final';
      finalCell.textContent = final !== null ? formatNumber(final) : '—';

      el.append(name, levelSelect, baseCell, bonusCell, finalCell);
      this.tableBody.appendChild(el);
    }

    this.renderSummary();
  }

  /** 총비용·예상 출항 횟수 (7차 결의 8 판정 기준 4~6회) */
  private renderSummary(): void {
    const levels: Partial<Record<OfficialUpgradeId, number>> = {};
    for (const row of this.rows) levels[row.def.id] = row.level;

    const total = totalUpgradeCost(this.rows.map((r) => r.def), levels);
    const perSortieRaw = Number(this.creditsPerSortieInput.value);
    const perSortie =
      this.creditsPerSortieInput.value !== '' && Number.isFinite(perSortieRaw) ? perSortieRaw : null;
    const sorties = estimatedSortiesToAfford(total?.credits ?? null, perSortie);

    const pending = pendingFields(this.rows.map((r) => r.def), safeEquipmentCatalog());
    const lines: string[] = [];
    lines.push(
      total
        ? `총비용: 크레딧 ${total.credits} / 희귀 부품 ${total.rareParts}`
        : '총비용: 미확정 (기획 경제 수치표 대기 — 임의 값 대입 없음)',
    );
    if (sorties === null) {
      lines.push('예상 출항 횟수: 판정 보류 (총비용 또는 출항당 수익 미확정)');
    } else {
      const ok = sorties >= 4 && sorties <= 6;
      lines.push(`예상 출항 횟수: ${sorties.toFixed(1)}회 — 기준 4~6회 ${ok ? '충족' : '이탈(가격 재조정 필요)'}`);
    }
    lines.push(`미확정 필드: ${pending.length}개`);
    this.summary.textContent = lines.join('\n');

    this.output.value = JSON.stringify(this.snapshot(), null, 2);
  }

  /** 튜닝표 증빙용 결과 스냅샷 — params를 변경하지 않는 읽기 전용 산출물 */
  snapshot(): object {
    const levels: Partial<Record<OfficialUpgradeId, number>> = {};
    for (const row of this.rows) levels[row.def.id] = row.level;
    const total = totalUpgradeCost(this.rows.map((r) => r.def), levels);
    const perSortieRaw = Number(this.creditsPerSortieInput.value);
    const perSortie =
      this.creditsPerSortieInput.value !== '' && Number.isFinite(perSortieRaw) ? perSortieRaw : null;

    return {
      formula: '최종값 = 기준값 × (1 + 보정 합) [합연산, src/meta/upgradeMath.ts]',
      items: this.rows.map((row) => ({
        id: row.def.id,
        label: row.def.label,
        level: row.level,
        baseValue: this.baseValueOf(row.def),
        baseSource: row.def.paramRef ?? '(파라미터 미도입)',
        bonusSum: this.bonusSumAt(row.def, row.level),
        finalValue: this.finalValueOf(row.def, row.level),
        isDurationStat: DURATION_STATS.includes(row.def.id),
      })),
      totalCost: total,
      creditsPerSortie: perSortie,
      estimatedSorties: estimatedSortiesToAfford(total?.credits ?? null, perSortie),
      sortieTargetRange: [4, 6],
      pendingFields: pendingFields(this.rows.map((r) => r.def), safeEquipmentCatalog()),
    };
  }

  private async copyOutput(): Promise<void> {
    this.renderSummary();
    try {
      await navigator.clipboard.writeText(this.output.value);
    } catch {
      this.output.select();
    }
  }
}

function safeEquipmentCatalog(): ReturnType<typeof loadEquipmentCatalog> | null {
  try {
    return loadEquipmentCatalog();
  } catch {
    return null;
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
