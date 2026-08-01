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
  /** 현재 속력 크기 (m/s, 비부호 = |forwardSpeedMetersPerSecond|). 소음 산출의 입력값 */
  readonly speed: number;
}

/**
 * 잠수함 포즈 — 표현 계층(렌더 장면·카메라·프로펠러·블롭 섀도)이 소비하는
 * 읽기 전용 상태의 **정식 계약** (INT-CORE-003).
 *
 * 규칙:
 *  - 소유는 게임플레이 — PlayerController 구현체가 이 계약을 함께 구현해
 *    poseSource로 노출하고, composition root(core/Game)가 렌더에 1회 주입한다.
 *  - 렌더는 소비만 한다 — 위치 변화(전 프레임 차분)로 속도를 **재계산하지
 *    않는다.** 프로펠러의 속도 입력은 forwardSpeedMetersPerSecond 하나다.
 *  - 축·부호 기준은 core/conventions.ts (로컬 -Z = 선수).
 */
export interface SubmarinePoseSource {
  readonly positionX: number;
  /** 월드 Y — 심도 층 전환 보간 포함. 렌더는 상수 높이 대신 이 값을 사용한다 */
  readonly positionY: number;
  readonly positionZ: number;
  /** Y축(위) 기준 요 각 — mesh.rotation.y에 그대로 대입 (conventions 규약) */
  readonly headingRadians: number;
  /**
   * 부호 있는 전후 속도 (m/s): + = 선수 방향(전진) / − = 선미 방향(후진).
   * 프로펠러 회전은 반드시 이 값과 conventions.propellerSpinRatio()로 계산한다.
   */
  readonly forwardSpeedMetersPerSecond: number;
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
 * 조준 — 마우스와 PC 화면(HUD) 조준·발사 버튼의 **공용 진입점**.
 *
 * 확정 규칙 (INT-CORE-002 + 7차 대회의 결의 1 개정):
 *  - 별도 전투 시스템을 만들지 않는다 — 입력 소스(마우스 우클릭 토글·HUD 버튼)가
 *    무엇이든 전부 이 하나의 AimSystem 메서드를 호출한다.
 *  - 입력 어댑터와 이 시스템의 연결은 composition root(core/Game.composeSystems)
 *    에서만 잇는다 — UI·입력 코드가 게임플레이 구현체를 직접 import하지 않는다.
 *  - **조준은 전 심도에서 가능하며, 조준이 잠수함의 심도·위치를 바꾸지 않는다**
 *    [7차 결의 1 — 구 '잠망경 심도 전용·자동 부상' 규칙은 폐기, 재도입 금지].
 *  - 조준 뷰 카메라(선수 발사관 시점)는 렌더가 aimModeChanged 구독 +
 *    TorpedoTubeSocketSource 소비로 처리한다.
 * 구현은 게임플레이 소유. 수동 조준 + 리드샷 보조선이 기본 [확정].
 */
export interface AimSystem extends Updatable {
  /** 조준 뷰 활성 여부 (읽기 전용 상태) */
  readonly aiming: boolean;
  /** 조준 시작 — 심도 조건 없음(전 심도 허용). 이미 조준 중이면 true */
  beginAim(): boolean;
  /** 조준 종료 — 발사 없이 해제 포함. 해제 시 미세 조준각은 0으로 초기화한다
   *  [13차 결의 9 — reset 단일 동작, persist·aimReturnBehavior 없음] */
  endAim(): void;
  /**
   * 발사 요청. 조준 중이 아니거나 TorpedoSystem이 거부(잔량 0·재장전 중)하면
   * false. 성공 시 torpedoFired 이벤트 발행은 TorpedoSystem 책임이다.
   */
  fireTorpedo(): boolean;
}

/**
 * 미세 조준각 읽기 전용 소스 (13차 결의 3·8·9) — AimSystem 구현체(게임플레이)가
 * 함께 구현한다. TorpedoTubeSocketRig가 소비해 소켓 전방축을 만든다.
 *
 *  - **잠수함 로컬 좌표 기준** 상대각 — 선체가 A/D로 돌면 조준선도 함께 돈다.
 *  - 부호: yaw + = 좌(선체 heading과 동일 규약) / pitch + = 상향(+Y).
 *  - 클램프는 conventions.clampAimYawRadians/clampAimPitchRadians **동일 함수**
 *    사용 — 카메라·조준·테스트가 각자 제한 계산을 만들지 않는다.
 *  - 비조준 상태·조준 해제 직후에는 둘 다 0 (reset 계약).
 */
export interface FineAimSource {
  readonly aimYawRadians: number;
  readonly aimPitchRadians: number;
}

/**
 * 발사관 소켓 포즈 — 프레임 갱신 후 유효한 월드 기준 위치 + 전방 단위 벡터.
 * Three.js 객체를 노출하지 않는다 — 렌더는 이 값으로 자체 벡터를 구성한다.
 */
export interface SocketPose {
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  /** 전방 단위 벡터 (조준 미세각 반영) */
  readonly forwardX: number;
  readonly forwardY: number;
  readonly forwardZ: number;
}

/**
 * 선수 발사관 소켓 — 단일 진실 공급원 (7차 결의 1-①·② + 13차 결의 2).
 *
 *  torpedoTubeAnchor (모델 정의 단일 소스 — src/world/torpedoTubeAnchor.ts)
 *   ├─ aimCameraSocket    앵커 정위치 · 동일 전방축
 *   └─ torpedoSpawnSocket 동일 전방축 + 고정 전방 안전 오프셋
 *
 * 규칙 [확정 — 금지 조항 포함]:
 *  - 두 소켓은 동일한 잠수함 로컬 좌표계·동일 전방축(선수, conventions
 *    LOCAL_BOW 규약)을 공유한다. **어뢰 초기 진행 방향 = 조준 카메라 시선
 *    방향** (십자선 = 탄도).
 *  - 근접 클리핑·자기 충돌 방지용 안전 오프셋은 **torpedoSpawnSocket 정의
 *    한 곳에만** 존재한다. 카메라 시스템·어뢰 시스템이 각자 숫자 오프셋을
 *    계산하는 것 금지 — 소켓을 읽기만 한다.
 *  - 그래픽스(조준 카메라)와 게임플레이(어뢰 생성)가 같은 읽기 전용
 *    인스턴스를 composition root에서 주입받아 소비한다.
 */
export interface TorpedoTubeSocketSource {
  readonly aimCameraSocket: SocketPose;
  readonly torpedoSpawnSocket: SocketPose;
}

/** 어뢰 — 수동 조준 + 리드샷 보조선이 기본 (§5.8). 수치는 params/combat.json */
export interface TorpedoSystem extends Updatable {
  readonly remaining: number;
  /** 재장전 중이 아니면 0 */
  readonly reloadRemainingSeconds: number;
  /** 발사 성공 여부 반환 (잔량 0 또는 재장전 중이면 false) */
  fire(): boolean;
}

/**
 * 화물선 상태 — 게임플레이(판정 소유)가 공급하고 렌더(CargoShipVisual)·
 * 표적 관리(TargetRegistry)·UI가 소비하는 읽기 전용 **정식 계약** (INT-CORE-003).
 *
 * 규칙:
 *  - VS는 화물선 1척 [확정 §12.2 동시 적 상한] — 컬렉션이 아닌 단일 상태.
 *  - 명중 판정·침몰 시간축의 주인은 게임플레이다 ('판정이 타이밍의 주인' 원칙).
 *    렌더는 sinkProgress를 소비해 기울기·하강·폭발을 **매핑만** 하고
 *    자체 침몰 타이머를 돌리지 않는다.
 *  - 연결은 composition root에서 1회 주입 (렌더가 게임플레이를 import 금지).
 */
export interface CargoShipStateSource {
  /** 표적 식별자 — torpedoHit 이벤트의 targetId와 동일 체계 */
  readonly id: number;
  /**
   * 세력 태그 (contracts/meta.ts FactionId — 6차 결의 3 적대/중립 구분).
   * 미지정은 hostile로 간주한다(현 MVP 화물선의 과도기 호환) —
   * 게임플레이 Faction 태그 작업 완료 시 필수 필드로 승격 예정 (INT-CORE-006).
   */
  readonly faction?: import('./meta').FactionId;
  readonly positionX: number;
  /** 수면 흘수선 기준 판정 위치 — 침몰 연출 변위(하강)는 렌더가 sinkProgress로 매핑 */
  readonly positionY: number;
  readonly positionZ: number;
  /** 선수·선미 축 규약은 잠수함과 동일 (로컬 -Z = 선수, conventions) */
  readonly headingRadians: number;
  /** 월드 XZ 속도 (m/s) — 리드샷 보조선(§5.8)의 입력값 */
  readonly velocityX: number;
  readonly velocityZ: number;
  /** 명중 통지 — torpedoHit 이벤트 발행과 동시에 true, 이후 불변 (1발 격침 §5.9) */
  readonly hit: boolean;
  /** 침몰 진행 0(미침몰)~1(완료) — 시간축 소유는 게임플레이 */
  readonly sinkProgress: number;
  /** 시뮬레이션에서 제거됨 — 렌더는 이 신호로 시각 자원을 정리한다 */
  readonly removed: boolean;
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
