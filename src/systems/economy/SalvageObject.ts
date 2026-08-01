/**
 * 해저 재화 — '부순다' 대상 (보물 상자 / 컨테이너 / 광물).
 *
 * MVP 상호작용 동사는 두 가지뿐이다 (6차 결의): 부순다(어뢰 명중으로 파괴)
 * / 줍는다(파괴 후 나온 드롭을 접근 자동 회수 — CreditDropField).
 * 유적 퍼즐·별도 조사 UI·동굴 상호작용은 만들지 않는다.
 *
 * 구현: 기존 어뢰 명중 판정(TargetRegistry·CombatTarget)을 그대로 재사용
 * 하는 정적 무세력('object') 표적이다 — 별도 판정 시스템 없음. 파괴 시
 * 드롭 생성은 EconomySystem이 상태 전이를 보고 수행한다 (생성 분리).
 */

import type { CombatTarget } from '../TargetRegistry';

export type SalvageKind = 'chest' | 'container' | 'mineral';

/** 파괴물 판정 반경 (m) — 구조 상수 (소형 오브젝트 원 근사) */
const SALVAGE_HIT_RADIUS = 1.5;

export class SalvageObject implements CombatTarget {
  private destroyedFlag = false;

  // 검증 러너(run.mjs) Node 타입 스트리핑 호환 — 매개변수 프로퍼티 미사용
  readonly id: number;
  readonly kind: SalvageKind;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  /** 파괴 시 함께 드롭되는 희귀 부품 (배치 데이터가 지정 — 결정적, 확률 없음) */
  readonly rarePartId: string | null;

  constructor(
    id: number,
    kind: SalvageKind,
    x: number,
    y: number,
    z: number,
    rarePartId: string | null = null,
  ) {
    this.id = id;
    this.kind = kind;
    this.positionX = x;
    this.positionY = y;
    this.positionZ = z;
    this.rarePartId = rarePartId;
  }

  /** 무세력 파괴물 — 공격해도 경비 반응 없음 */
  get faction(): 'object' {
    return 'object';
  }

  /** 드롭 테이블 참조 — 공식 `params/economy.json`의 dropTables 키 (kind별) */
  get dropTableId(): string {
    return `salvage-${this.kind}`;
  }

  get velocityX(): number {
    return 0;
  }

  get velocityZ(): number {
    return 0;
  }

  get hitRadius(): number {
    return SALVAGE_HIT_RADIUS;
  }

  get destroyed(): boolean {
    return this.destroyedFlag;
  }

  /** '부순다' — 어뢰 1발로 파괴 (피해량 무관, 중복 무시) */
  onTorpedoHit(_hitX: number, _hitZ: number, _damage: number): void {
    this.destroyedFlag = true;
  }
}
