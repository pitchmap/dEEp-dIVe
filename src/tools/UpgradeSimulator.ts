/**
 * 업그레이드 시뮬레이터 (툴링 소유 — 소회의(11) 결의 4, 공수 0.5일 항목).
 *
 * 목적: 기획(박태현)이 빌드 없이 업그레이드 조합의 최종 수치를 검증한다.
 * 튜닝표 v3 '테스트 결과' 열의 증빙 화면 (배석 디렉터 발언).
 *
 * 규칙:
 *  - 계산은 upgradeCalculator의 공용 순수 함수만 사용 — 수식 복제 금지.
 *  - params 원본을 절대 수정하지 않는다 (읽기 전용 + JSON 내보내기만).
 *  - 기준값: paramRef가 있으면 로드된 params에서 해석, 없으면(대상 시스템
 *    미도입) 입력란에 직접 넣어 미리 볼 수 있다.
 *  - upgrades.json 저장 시 핫리로드로 즉시 갱신.
 */

import { loadParams, onParamsReloaded } from '../config/ParamLoader';
import type { GameParams } from '../contracts/params';
import {
  applyUpgradeBonus,
  loadUpgradeCatalog,
  onUpgradeCatalogReloaded,
  sumUpgradeBonuses,
  type UpgradeDefinition,
} from './upgradeCalculator';

/** "movement.maxSpeedMetersPerSecond" 형태의 경로에서 기준값(value)을 해석 */
export function resolveParamBase(params: GameParams, ref: string): number | null {
  let node: unknown = params;
  for (const segment of ref.split('.')) {
    if (typeof node !== 'object' || node === null) return null;
    node = (node as Record<string, unknown>)[segment];
  }
  if (typeof node === 'object' && node !== null && 'value' in node) {
    const value = (node as { value: unknown }).value;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  return typeof node === 'number' && Number.isFinite(node) ? node : null;
}

interface RowState {
  def: UpgradeDefinition;
  level: number;
  /** paramRef 미보유 항목의 수동 기준값 (미입력 시 null) */
  manualBase: number | null;
}

export class UpgradeSimulator {
  private readonly root: HTMLDivElement;
  private readonly tableBody: HTMLDivElement;
  private readonly output: HTMLTextAreaElement;
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

    this.rebuildRows(loadUpgradeCatalog());
    this.unsubscribers.push(
      onUpgradeCatalogReloaded((catalog) => this.rebuildRows(catalog)),
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

  private rebuildRows(catalog: UpgradeDefinition[]): void {
    const previous = new Map(this.rows.map((row) => [row.def.id, row]));
    this.rows = catalog.map((def) => ({
      def,
      level: Math.min(previous.get(def.id)?.level ?? 0, def.maxLevel),
      manualBase: previous.get(def.id)?.manualBase ?? null,
    }));
    this.render();
  }

  private baseValueOf(row: RowState): number | null {
    if (row.def.paramRef) return resolveParamBase(loadParams(), row.def.paramRef);
    return row.manualBase;
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
      for (let level = 0; level <= row.def.maxLevel; level++) {
        const option = document.createElement('option');
        option.value = String(level);
        option.textContent = `${level} (+${Math.round(level * row.def.bonusPerLevel * 100)}%)`;
        if (level === row.level) option.selected = true;
        levelSelect.appendChild(option);
      }
      levelSelect.addEventListener('change', () => {
        row.level = Number(levelSelect.value);
        this.render();
      });

      const baseCell = document.createElement('span');
      const resolvedBase = this.baseValueOf(row);
      if (row.def.paramRef) {
        baseCell.textContent = resolvedBase !== null ? String(resolvedBase) : '(경로 해석 실패)';
        baseCell.title = row.def.paramRef;
      } else {
        const baseInput = document.createElement('input');
        baseInput.type = 'number';
        baseInput.placeholder = '기준값 입력';
        baseInput.title = row.def.note ?? '기준값 파라미터 미도입 — 수동 입력으로 미리보기';
        if (row.manualBase !== null) baseInput.value = String(row.manualBase);
        baseInput.addEventListener('input', () => {
          const parsed = Number(baseInput.value);
          row.manualBase = baseInput.value !== '' && Number.isFinite(parsed) ? parsed : null;
          this.renderOutputsOnly();
        });
        baseCell.appendChild(baseInput);
      }

      const bonusSum = sumUpgradeBonuses([row.def], { [row.def.id]: row.level });
      const bonusCell = document.createElement('span');
      bonusCell.className = 'upgrade-sim-bonus';
      bonusCell.textContent = `+${Math.round(bonusSum * 100)}%`;

      const finalCell = document.createElement('span');
      finalCell.className = 'upgrade-sim-final';
      finalCell.textContent =
        resolvedBase !== null ? formatNumber(applyUpgradeBonus(resolvedBase, bonusSum)) : '—';

      el.append(name, levelSelect, baseCell, bonusCell, finalCell);
      this.tableBody.appendChild(el);
    }

    this.renderOutputsOnly();
  }

  /** 수동 기준값 타이핑 중 전체 리렌더로 포커스를 뺏지 않도록 출력만 갱신 */
  private renderOutputsOnly(): void {
    this.output.value = JSON.stringify(this.snapshot(), null, 2);
  }

  /** 튜닝표 증빙용 결과 스냅샷 — params를 변경하지 않는 읽기 전용 산출물 */
  snapshot(): object {
    return {
      formula: '최종값 = 기준값 × (1 + 보정 합) [합연산]',
      items: this.rows.map((row) => {
        const base = this.baseValueOf(row);
        const bonusSum = sumUpgradeBonuses([row.def], { [row.def.id]: row.level });
        return {
          id: row.def.id,
          label: row.def.label,
          level: row.level,
          baseValue: base,
          baseSource: row.def.paramRef ?? (row.manualBase !== null ? '(수동 입력)' : '(미정)'),
          bonusSum,
          finalValue: base !== null ? applyUpgradeBonus(base, bonusSum) : null,
        };
      }),
      totalBonusSum: sumUpgradeBonuses(
        this.rows.map((row) => row.def),
        Object.fromEntries(this.rows.map((row) => [row.def.id, row.level])),
      ),
    };
  }

  private async copyOutput(): Promise<void> {
    this.renderOutputsOnly();
    try {
      await navigator.clipboard.writeText(this.output.value);
    } catch {
      // 클립보드 권한 없음 — textarea 선택으로 대체
      this.output.select();
    }
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
