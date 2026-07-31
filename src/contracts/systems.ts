/**
 * 시스템 인터페이스 계약.
 *
 * 구현 클래스는 아직 존재하지 않는다 — D3 이후 각 파트가 자기 소유 영역에서
 * 구현한다 (게임플레이: src/systems, 그래픽스: src/render, 툴링: src/audio 배관).
 *
 * 원칙:
 *  - 각 인터페이스는 꼭 필요한 최소 메서드와 읽기 전용 상태만 갖는다.
 *  - 미래 확장을 예상한 메서드를 미리 넣지 않는다 (스텁 금지 §6.4).
 *  - 제외 범위 기능(구축함 격침, 자동 조준, 강화 카드 등 §6.3)의
 *    인터페이스는 정의하지 않는다.
 *
 * 이 파일은 공통 보호 파일이다 — 변경은 docs/INTEGRATION_NOTES.md 절차를 따른다.
 */

import type { DamageCause, DepthLayerId, DetectionStage } from './events';

/** 매 프레임 갱신되는 시스템의 공통 형태 */
export interface Updatable {
  /** deltaSeconds: 이전 프레임과의 간격(초) — core/GameLoop가 공급 */
  update(deltaSeconds: number): void;
}

/** 잠수함 조작 — WASD 수평면 기동 + 관성 (§5.1~5.2). 수치는 params/movement.json */
export interface PlayerController extends Updatable {
  /** 수평면 위치 (심도는 DepthSystem 소관) */
  readonly positionX: number;
  readonly positionZ: number;
  /** 잠수함 기준 선회 — 카메라 기준이 아님 [확정] */
  readonly headingRadians: number;
  /** 현재 속력 (m/s). 소음 산출의 입력값 */
  readonly speed: number;
}

/** 심도 3층 전환 — 층 단위 이동, 연속 심도 금지 (§3.4, §5.3) */
export interface DepthSystem extends Updatable {
  readonly currentLayer: DepthLayerId;
  /** Shift = 한 층 부상. 최상층이면 무시 */
  requestAscend(): void;
  /** Ctrl = 한 층 잠항. 최하층이면 무시 */
  requestDescend(): void;
}

/**
 * 탐지 시스템 — 시스템 허브 (§7.2).
 * 소음×거리×심도 보정으로 단일 탐지 게이지를 산출하고
 * AI 상태 전이와 눈 아이콘 UI를 구동한다.
 * D6~D9 임시 구현 → D10~D12 본 구현 교체 시 이 인터페이스는 유지된다 [확정].
 */
export interface DetectionSystem extends Updatable {
  /** 0(안전)~1(만충=발각) */
  readonly gauge: number;
  readonly stage: DetectionStage;
  /** 소음 수준 입력 (0~1). PlayerController·침묵 항행이 공급 */
  reportNoise(level: number): void;
  /** 어뢰 발사 지점 무조건 노출 규칙의 진입점 (§5.10) */
  reportTorpedoLaunch(x: number, z: number): void;
}

/**
 * 조준 — 마우스와 PC 화면(HUD) 조준·발사 버튼의 **공용 진입점** (§5.8).
 *
 * 확정 규칙 (D+5 리뷰 후속 소회의, INT-CORE-002):
 *  - 별도 전투 시스템을 만들지 않는다 — 입력 소스(마우스 우클릭·HUD 버튼)가
 *    무엇이든 전부 이 하나의 AimSystem 메서드를 호출한다.
 *  - 입력 어댑터와 이 시스템의 연결은 composition root(core/Game.composeSystems)
 *    에서만 잇는다 — UI·입력 코드가 게임플레이 구현체를 직접 import하지 않는다.
 *  - 조준 뷰 카메라 고정(§3.2)은 렌더가 aimModeChanged 이벤트 구독으로 처리한다.
 * 구현은 게임플레이 소유(D6 이후). 수동 조준 + 리드샷 보조선이 기본 [확정].
 */
export interface AimSystem extends Updatable {
  /** 조준 뷰 활성 여부 (읽기 전용 상태) */
  readonly aiming: boolean;
  /** 조준 시작. 잠망경 심도가 아니면 거부하고 false (§3.4 — 조준은 잠망경 심도만) */
  beginAim(): boolean;
  /** 조준 종료 — 발사 없이 해제하는 경우 포함 */
  endAim(): void;
  /**
   * 발사 요청. 조준 중이 아니거나 TorpedoSystem이 거부(잔량 0·재장전 중)하면
   * false. 성공 시 torpedoFired 이벤트 발행은 TorpedoSystem 책임이다.
   */
  fireTorpedo(): boolean;
}

/** 어뢰 — 수동 조준 + 리드샷 보조선이 기본 (§5.8). 수치는 params/combat.json */
export interface TorpedoSystem extends Updatable {
  readonly remaining: number;
  /** 재장전 중이 아니면 0 */
  readonly reloadRemainingSeconds: number;
  /** 발사 성공 여부 반환 (잔량 0 또는 재장전 중이면 false) */
  fire(): boolean;
}

/** 폭뢰 — 입수→신관(3.0초 하한 고정)→폭발 판정의 주인 (§5.12~5.13) */
export interface DepthChargeSystem extends Updatable {
  /** 현재 수중에 있는 폭뢰 수 (동시 상한은 params/combat.json) */
  readonly activeCount: number;
}

/** 구축함 AI — 상태 기계. VS는 경계·공격 2상태 우선 구현 [확정] (§5.11) */
export interface DestroyerAI extends Updatable {
  readonly state: 'patrol' | 'alert' | 'attack' | 'lost';
  /** 마지막 목격 위치 기록 (어뢰 발사 노출·발각 시 호출) */
  notifyLastKnownPosition(x: number, z: number): void;
}

/** 내구도·침수 — 실패 조건은 내구도 0 단일 [확정] (§5.14) */
export interface HullSystem extends Updatable {
  /** 0~1. 0 = 패배 */
  readonly integrity: number;
  /** 침수 진행 중 여부 (X-ray 자동 발동 조건) */
  readonly isFlooding: boolean;
  applyDamage(amount: number, cause: DamageCause): void;
}

/**
 * 오디오 — Web Audio API 배관 (툴링 소유).
 * 판정 타이밍의 주인은 게임플레이 시스템이며 오디오는 동기화만 한다 (§7.2).
 */
export interface AudioSystem extends Updatable {
  /** 브라우저 자동재생 정책 — 사용자 제스처 후 unlock 필요 */
  readonly unlocked: boolean;
  unlock(): Promise<void>;
}

/** UI — 3계층 표시 우선순위 (§5.18). VS는 상시 계층 + 폭뢰 경고 우선 */
export interface UISystem extends Updatable {
  /** 침묵 항행 등 연출을 위한 최소화 모드 */
  setMinimalMode(enabled: boolean): void;
}
