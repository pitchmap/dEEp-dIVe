/**
 * 전투 표적 등록소 — 게임플레이 소유.
 *
 * 어뢰 명중 판정과 리드샷 보조선(§5.8)이 **같은 표적 목록**을 읽는다:
 *  - 어뢰(StraightRunTorpedoSystem): 위치·hullBox(박스 근사) 또는
 *    hitRadius(원 근사)로 명중 판정
 *  - 리드샷 보조선(HUD·렌더): 위치·속도를 읽어 어뢰 속력 기준 리드 지점 계산
 *
 * PvE 전환 (소회의 11 결의 2 — 클래스 분화 금지):
 *  - 세력은 **Faction 태그 + 드롭 테이블 참조** 두 필드로만 구분한다.
 *    적대(hostile)/중립(neutral)/경비(patrol) 3세력 + 무세력 오브젝트(object —
 *    해저 보물 등). 세력별 클래스 복제 없음.
 *  - 함선 표적은 어뢰·잠수함 충돌이 공유하는 박스 근사(hullBox)를 제공한다
 *    (5차 결의 1). hullBox가 없으면 hitRadius 원 근사로 판정(소형 오브젝트).
 *
 * 자동 락온은 구현하지 않는다 [확정 — 수동 조준 + 보조선이 기본].
 */

import type { ShipHullBox } from './collision/shipHullBox';

/**
 * 세력 태그 — 소회의 11 결의 2 (최소 3세력, 태그 방식).
 *
 * 공식 계약(`contracts/meta.ts`, INT-CORE-006)을 재수출한다. 경비 세력의
 * 공식 명칭은 `patrol`이다 — PvE 1차 통합에서 게임플레이의 `guard`와
 * 리드 계약의 `patrol` 이름 충돌을 공식 계약 쪽으로 통일했다
 * (INTEGRATION_NOTES '계약 이름 통합 결정' #1). 태그 방식·3세력 구조는
 * 그대로이며 판정 로직은 변경되지 않았다.
 */
export type { FactionId } from '../contracts/meta';
import type { FactionId } from '../contracts/meta';

/** 어뢰가 명중 가능한 표적의 읽기 전용 상태 + 명중 통지 진입점 */
export interface CombatTarget {
  /** 식별자 — `torpedoHit.targetId`·`CargoShipStateSource.id`와 동일 체계 (INT-CORE-003) */
  readonly id: number;
  /** 세력 태그. 'object' = 무세력 파괴물(해저 보물 등 — 경비 반응 없음) */
  readonly faction: FactionId | 'object';
  /** 드롭 테이블 참조 (경제 시스템이 해석 — 없으면 드롭 없음) */
  readonly dropTableId?: string;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  /** 수평 속도 (m/s) — 리드샷 보조선 계산 입력 */
  readonly velocityX: number;
  readonly velocityZ: number;
  /** 원 근사 명중 반경 (수평면) — hullBox가 없을 때의 판정 기준 */
  readonly hitRadius: number;
  /** 선수각 — hullBox 판정 시 필요 (함선 표적) */
  readonly headingRadians?: number;
  /** 박스 근사 선체 — 있으면 어뢰 명중·잠수함 충돌이 이 데이터를 공유(결의 1) */
  readonly hullBox?: ShipHullBox;
  /**
   * 어뢰 명중 통지 — 어뢰 1발당 정확히 1회만 호출된다 (중복 명중 없음).
   * damage = 장비·업그레이드 반영 피해량 (1발 격침 함선은 무시 가능).
   */
  onTorpedoHit(hitX: number, hitZ: number, damage: number): void;
}

export class TargetRegistry {
  private targets: CombatTarget[] = [];

  /** 읽기 전용 표적 목록 — 명중 판정·리드샷 보조선 공용 */
  get list(): readonly CombatTarget[] {
    return this.targets;
  }

  /** 표적 등록. 반환된 함수로 등록 해제한다 (격침·장면 정리 시) */
  register(target: CombatTarget): () => void {
    if (!this.targets.includes(target)) this.targets.push(target);
    return () => this.unregister(target);
  }

  unregister(target: CombatTarget): void {
    this.targets = this.targets.filter((existing) => existing !== target);
  }

  clear(): void {
    this.targets = [];
  }
}
