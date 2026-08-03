/**
 * 경비함 함대 — `SurfaceShipMotionPortFactory` production 구현 (B5 런타임 연결).
 *
 * ## 흐름에서의 자리
 *
 * ```
 * GuardShipAdapter → createProductionDestroyerAIFactory(리드)
 *   → SurfaceShipMotionPortFactory  ← **이 파일**
 *   → PatrolShipEntity 생성(월드 등록) → SurfaceShipMotionPort 반환
 *   → DestroyerAIController(리드) 생성 → 어댑터가 수명주기 전달
 * ```
 *
 * ## 정본·격리 규칙
 *
 *  - **스폰 1건 = 엔티티 1개 = 포트 1개.** 포트는 자기 엔티티만 움직인다.
 *    모든 경비함이 하나의 pose를 공유하는 일이 없다.
 *  - 플레이어 pose를 경비함 pose로 재사용하지 않는다 — 플레이어는 표적
 *    조회(`getTargetPosition`)의 대상일 뿐이다.
 *  - 렌더 객체를 직접 조작하지 않는다 — 렌더는 읽기 전용 스냅샷만 본다.
 *  - AI 안에 transform 저장소를 만들지 않는다 — pose 정본은 `PatrolShipEntity`.
 *
 * ## 이 파일에 없는 것
 *
 * AI 판단·탐지·소나·폭뢰·무기 발사·선체 체력·침수. 경비함 전용 상태 머신을
 * 만들지 않는다 (범용 `DestroyerAIController` 재사용 — INT-CORE-013).
 */

import type {
  GuardShipAdapterConfig,
  SurfaceShipMotionPort,
  SurfaceShipMotionPortFactory,
} from '../../contracts/guard';
import { PLAYER_ENTITY_ID } from '../../contracts/guard';
import type { DetectionStageSource } from '../../contracts/detection';
import type { PlayerAliveSource } from '../../contracts/survival';
import { isWithinCanyonBounds, type CanyonHorizontalBounds } from '../collision/canyonBounds';
import type { TargetRegistry } from '../TargetRegistry';
import {
  PatrolShipEntity,
  type PatrolShipMotionProfile,
  type PatrolShipSpawnState,
} from './PatrolShipEntity';

/** 표적 위치 조회 단면 — 플레이어(잠수함)가 충족. y = 실제 심도(월드 Y) */
export interface PatrolTargetPositionView {
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
}

/** 경비함 렌더 원형 키 — 표현(메시·색)은 그래픽스 소유, 여기서는 식별자만 */
export const PATROL_VISUAL_ARCHETYPE = 'ship.patrol';

/** 월드에 등록된 경비함 1척 (내부 보관 — registry 해제 함수를 함께 든다) */
interface PatrolShipRecord {
  readonly entity: PatrolShipEntity;
  readonly unregister: () => void;
}

export class PatrolShipFleet implements SurfaceShipMotionPortFactory {
  private readonly targets: TargetRegistry;
  private readonly player: PatrolTargetPositionView;
  /** 운동 수치 — 공식 params 미주입이면 null (수치를 만들지 않는다) */
  private readonly profile: PatrolShipMotionProfile | null;
  private readonly bounds: CanyonHorizontalBounds | null;
  private records: PatrolShipRecord[] = [];
  /**
   * [C3] 탐지 단계 소스 — AI는 이 **stage만** 읽는다. 미연결이면 관측
   * 가능 여부를 탐지로 제한하지 않는다(B5 이전 동작 유지).
   */
  private detectionStage: DetectionStageSource | null = null;
  /** [C4] 플레이어 생사 정본 — 미연결이면 생존으로 본다 */
  private aliveSource: PlayerAliveSource | null = null;

  constructor(
    targets: TargetRegistry,
    player: PatrolTargetPositionView,
    profile: PatrolShipMotionProfile | null,
    /** 월드 수평 경계 — 조립점이 계산한 **단일 인스턴스**를 주입받는다
     *  (스폰 위치 전략과 같은 경계를 써야 스폰이 자기 경계에서 거부되지 않는다) */
    bounds: CanyonHorizontalBounds | null,
  ) {
    this.targets = targets;
    this.player = player;
    this.profile = profile;
    this.bounds = bounds;
  }

  /** 스폰된 경비함 목록 (읽기 전용 — 렌더·식별·검증) */
  get ships(): readonly PatrolShipEntity[] {
    return this.records.map((record) => record.entity);
  }

  /** 살아 있는 경비함만 */
  get aliveShips(): readonly PatrolShipEntity[] {
    return this.ships.filter((ship) => ship.alive);
  }

  get worldBounds(): CanyonHorizontalBounds | null {
    return this.bounds;
  }

  /** 소비 중인 운동 프로파일 (읽기 전용 — 출처 감사용). null = 미배선 */
  get motionProfile(): PatrolShipMotionProfile | null {
    return this.profile;
  }

  /** 공식 수치 배선 여부 — false면 스폰이 성립하지 않는다(spawnFailed) */
  get motionParamsWired(): boolean {
    return this.profile !== null;
  }

  /**
   * 계약 `SurfaceShipMotionPortFactory` — 스폰 1건마다 엔티티와 포트를 만든다.
   *
   * 같은 `entityId`가 다시 오면 **추가 엔티티를 만들지 않고** null을 반환한다
   * (호출측이 `spawnFailed`로 보고). 중복 방지의 정본은 리드
   * `GuardIncidentLedger`이며, 여기 검사는 그 경계를 넘어온 재진입을 막는
   * 마지막 방어선이지 별도 중복 표가 아니다.
   */
  create(config: GuardShipAdapterConfig): SurfaceShipMotionPort | null {
    // 운동 수치가 없으면 만들지 않는다 — 가짜 이동을 지어내지 않는다.
    const profile = this.profile;
    if (!profile) return null;
    if (!Number.isFinite(config.entityId)) return null;
    if (this.records.some((record) => record.entity.entityId === config.entityId)) return null;

    const spawn = config.spawnPosition;
    if (!Number.isFinite(spawn.x) || !Number.isFinite(spawn.z)) return null;
    // 스폰 위치가 월드 밖이면 만들지 않는다 — 좌표를 보정해 만들어 내지 않는다.
    if (!isWithinCanyonBounds(this.bounds, spawn.x, spawn.z)) return null;

    const state: PatrolShipSpawnState = {
      entityId: config.entityId,
      faction: config.faction,
      spawnReason: config.spawnReason,
      initialTargetEntityId: config.initialTargetEntityId,
      incidentPosition: config.initialTargetPosition,
      spawnX: spawn.x,
      spawnZ: spawn.z,
      // 선수각이 없으면 사건 지점을 향한다 (규약: 선수 = (−sin h, −cos h)).
      spawnHeadingRadians:
        spawn.headingRadians ??
        Math.atan2(
          -(config.initialTargetPosition.x - spawn.x),
          -(config.initialTargetPosition.z - spawn.z),
        ),
      visualArchetype: PATROL_VISUAL_ARCHETYPE,
    };
    const entity = new PatrolShipEntity(state, profile);
    // 월드 등록 — 기존 표적 경로를 그대로 쓴다 (별도 registry 신설 없음).
    const unregister = this.targets.register(entity);
    this.records.push({ entity, unregister });
    return this.createPort(entity);
  }

  /** 이 엔티티 하나만 움직이는 포트 — 다른 경비함과 상태를 공유하지 않는다 */
  private createPort(entity: PatrolShipEntity): SurfaceShipMotionPort {
    const fleet = this;
    return {
      getPosition() {
        return { x: entity.positionX, y: entity.positionY, z: entity.positionZ };
      },
      getForward() {
        return { x: entity.forwardX, z: entity.forwardZ };
      },
      turnToward(x: number, z: number, deltaSeconds: number) {
        entity.turnToward(x, z, deltaSeconds);
      },
      moveForward(deltaSeconds: number) {
        entity.moveForward(deltaSeconds);
      },
      maintainSurfaceHeight() {
        // 수상함 고도는 엔티티가 항상 해수면으로 노출한다(주입된 seaSurfaceY).
        // 별도 보정 상태가 없으므로 이 호출은 불변식 확인 지점이다.
      },
      isWithinWorldBounds(x: number, z: number) {
        return isWithinCanyonBounds(fleet.bounds, x, z);
      },
      isTargetAlive(targetEntityId: number) {
        return fleet.isTargetAlive(targetEntityId);
      },
      getTargetPosition(targetEntityId: number) {
        return fleet.getTargetPosition(targetEntityId);
      },
    };
  }

  /**
   * [C3] 탐지 단계 소스 연결 (조립부). AI는 stage만 읽으며 탐지 수치·거리
   * 감쇠·감소율을 계산하지 않는다. 별도 상태 머신을 만들지 않는다 —
   * 전이는 전적으로 `DestroyerAIController`가 이 입력으로 수행한다.
   */
  attachDetectionStageSource(source: DetectionStageSource | null): void {
    this.detectionStage = source;
  }

  get detectionStageWired(): boolean {
    return this.detectionStage !== null;
  }

  /**
   * [C4] 플레이어 생사 정본 연결 (조립부 `attachPlayerAliveSource`).
   * 연결되면 `isTargetAlive(PLAYER_ENTITY_ID)`의 항상 true 경로가 사라진다.
   */
  attachPlayerAliveSource(source: PlayerAliveSource | null): void {
    this.aliveSource = source;
  }

  get playerAliveWired(): boolean {
    return this.aliveSource !== null;
  }

  /**
   * 표적 생존 여부. 플레이어는 **`PlayerAliveSource` 정본**을 읽는다 —
   * 별도 체력 상태를 두지 않으며, 미연결일 때만 생존으로 본다(배선 전 동작
   * 유지). 그 외 id는 표적 등록소에서 찾고, 없으면 소멸한 것으로 본다.
   */
  private isTargetAlive(targetEntityId: number): boolean {
    if (targetEntityId === PLAYER_ENTITY_ID) {
      return this.aliveSource === null || this.aliveSource.isPlayerAlive;
    }
    return this.targets.list.some((target) => target.id === targetEntityId);
  }

  /**
   * 표적 위치 — **탐지 결과의 소비 지점**이다(자체 탐지 계산 없음).
   *
   * 플레이어는 탐지 단계가 `detected`일 때만 관측 가능하다 — 계약의
   * `alert → attack: stage 'detected' + 표적 위치 관측 가능` 규칙을 입력으로
   * 만족시킨다. 관측 불가면 null을 주고, AI가 스스로 마지막 확인 위치로
   * 접근(alert)하거나 상실(lost)로 간다 — 전이 로직은 복제하지 않는다.
   * 파괴된 플레이어는 관측 불가다.
   */
  private getTargetPosition(
    targetEntityId: number,
  ): { readonly x: number; readonly y: number; readonly z: number } | null {
    if (targetEntityId === PLAYER_ENTITY_ID) {
      if (!this.isTargetAlive(targetEntityId)) return null;
      if (this.detectionStage !== null && this.detectionStage.stage !== 'detected') return null;
      // y = 관측 순간의 실제 심도 — 폭뢰 목표 심도의 원천 (INT-CORE-019).
      return { x: this.player.positionX, y: this.player.positionY, z: this.player.positionZ };
    }
    const target = this.targets.list.find((candidate) => candidate.id === targetEntityId);
    if (!target) return null;
    return { x: target.positionX, y: target.positionY, z: target.positionZ };
  }

  /** 파괴된 경비함 정리 — 표적 등록 해제 (렌더 소스에서도 사라진다) */
  update(_deltaSeconds: number): void {
    if (this.records.length === 0) return;
    const survivors: PatrolShipRecord[] = [];
    for (const record of this.records) {
      if (record.entity.alive) {
        survivors.push(record);
        continue;
      }
      record.unregister();
    }
    this.records = survivors;
  }

  /** 새 출항 초기화 — 이전 출항의 경비함은 월드에 남지 않는다 */
  resetForNewSortie(): void {
    this.dispose();
  }

  dispose(): void {
    for (const record of this.records) {
      record.unregister();
      record.entity.markRemoved();
    }
    this.records = [];
  }
}
