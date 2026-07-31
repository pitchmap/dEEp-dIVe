/**
 * 심도 시스템 — contracts/systems.ts `DepthSystem` 구현 (§3.4, §5.3 +
 * D+5 리뷰 스프린트 '이동·충돌' 개편).
 *
 * 개편 내용: 이동은 연속 높이(Shift/Ctrl 유지 입력 — PlayerController 소유)로
 * 바뀌었고, 이 시스템은 **현재 높이를 3구간으로 판정**해 계약 상태
 * (`currentLayer`)와 `depthChanged` 이벤트를 제공한다.
 * 구간은 정확히 3개(잠망경/순항/심해) — 4구간 이상 확장 금지 [확정].
 * 구간 경계는 provisionalWorld.ts 임시값 (이관 요청 INT-GAME-004).
 *
 * 계약 유지:
 *  - `requestAscend`/`requestDescend`(층 단위 이동)는 인접 구간의 기준 높이로
 *    이동시키는 프로그래매틱 경로로 유지한다. 최상/최하 구간 초과 요청은
 *    무시하며 이벤트도 없다 (docs/INTERFACES.md 오류 처리 규칙).
 *    ※ 키보드 Shift/Ctrl은 더 이상 이 경로를 쓰지 않는다 (연속 이동).
 *  - 구간 변경 완료 시에만 `depthChanged` 발행 — 렌더(포그)·탐지·UI 구독.
 */

import type { DepthLayerId } from '../contracts/events';
import type { DepthSystem } from '../contracts/systems';
import type { EventBus } from '../core/EventBus';
import {
  PROVISIONAL_CRUISE_MIN_Y,
  PROVISIONAL_PERISCOPE_MIN_Y,
  PROVISIONAL_SUBMARINE_MAX_Y,
  PROVISIONAL_SUBMARINE_MIN_Y,
} from './provisionalWorld';

/** 얕은 구간 → 깊은 구간 순서. 길이 3 고정 (DepthLayerId와 1:1) */
const LAYERS_TOP_TO_BOTTOM: readonly DepthLayerId[] = ['periscope', 'cruise', 'deep'];

/** 잠수함 수직 상태 연결점 — PlayerController 구현체가 충족한다 */
export interface DepthMotionPort {
  readonly positionY: number;
  /** 층 단위 이동 요청 전용 — 수직 관성을 초기화하고 높이를 설정한다 */
  setPositionY(y: number): void;
}

/** 구간 경계 (y 기준). 검증 코드가 임시값 대신 주입할 수 있다 */
export interface DepthZoneConfig {
  /** 이 높이 이상 = 잠망경 */
  periscopeMinY: number;
  /** 이 높이 이상(잠망경 미만) = 순항. 미만 = 심해 */
  cruiseMinY: number;
  /** 수직 이동 상한 (수면 쪽) */
  maxY: number;
  /** 수직 이동 하한 (해저 쪽) */
  minY: number;
}

const PROVISIONAL_ZONES: DepthZoneConfig = {
  periscopeMinY: PROVISIONAL_PERISCOPE_MIN_Y,
  cruiseMinY: PROVISIONAL_CRUISE_MIN_Y,
  maxY: PROVISIONAL_SUBMARINE_MAX_Y,
  minY: PROVISIONAL_SUBMARINE_MIN_Y,
};

export class LayeredDepthSystem implements DepthSystem {
  private layer: DepthLayerId;
  // 생성자 매개변수 프로퍼티 미사용 — 검증 러너(run.mjs)의 Node 타입
  // 스트리핑 호환(삭제 가능 문법만)을 위해 명시적 필드로 둔다.
  private readonly bus: EventBus;
  private readonly motion: DepthMotionPort;
  private readonly zones: DepthZoneConfig;

  constructor(bus: EventBus, motion: DepthMotionPort, zones: DepthZoneConfig = PROVISIONAL_ZONES) {
    this.bus = bus;
    this.motion = motion;
    this.zones = zones;
    // 초기 구간은 이벤트 없이 판정만 한다 — 초기값은 currentLayer로 읽을 것
    this.layer = this.classify(motion.positionY);
  }

  get currentLayer(): DepthLayerId {
    return this.layer;
  }

  /** 한 구간 부상 (프로그래매틱 층 단위 경로). 최상 구간이면 무시 */
  requestAscend(): void {
    this.jumpLayer(-1);
  }

  /** 한 구간 잠항 (프로그래매틱 층 단위 경로). 최하 구간이면 무시 */
  requestDescend(): void {
    this.jumpLayer(+1);
  }

  /** 매 프레임 — 현재 높이로 구간을 재판정하고 변경 시 이벤트 발행 */
  update(_deltaSeconds: number): void {
    this.refreshLayer();
  }

  /** 높이 → 구간 판정 (정확히 3구간) */
  private classify(y: number): DepthLayerId {
    if (y >= this.zones.periscopeMinY) return 'periscope';
    if (y >= this.zones.cruiseMinY) return 'cruise';
    return 'deep';
  }

  /** 구간의 기준 높이 (층 단위 이동 요청의 목적 높이 — 구간 중앙) */
  private anchorY(layer: DepthLayerId): number {
    switch (layer) {
      case 'periscope':
        return (this.zones.periscopeMinY + this.zones.maxY) / 2;
      case 'cruise':
        return (this.zones.cruiseMinY + this.zones.periscopeMinY) / 2;
      case 'deep':
        return (this.zones.minY + this.zones.cruiseMinY) / 2;
    }
  }

  private jumpLayer(delta: -1 | 1): void {
    const currentIndex = LAYERS_TOP_TO_BOTTOM.indexOf(this.layer);
    const next = LAYERS_TOP_TO_BOTTOM[currentIndex + delta];
    if (!next) return; // 범위 밖 — 무시, 이벤트 없음

    this.motion.setPositionY(this.anchorY(next));
    this.refreshLayer();
  }

  private refreshLayer(): void {
    const next = this.classify(this.motion.positionY);
    if (next === this.layer) return;
    this.layer = next;
    this.bus.emit('depthChanged', { layer: next });
  }
}
