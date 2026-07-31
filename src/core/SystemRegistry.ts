/**
 * 시스템 등록·실행 순서 관리 — core 소유.
 *
 * 실행 순서 규칙: **등록 순서 = update·render 호출 순서, dispose는 역순.**
 * 우선순위 숫자·의존성 그래프 같은 추가 개념은 두지 않는다 — 순서가 중요하면
 * 등록 지점(Game.composeSystems)에서 순서대로 등록하는 것으로 표현한다.
 *
 * 오류 처리: 시스템 안에서 던져진 예외는 삼키지 않고 그대로 전파한다
 * (상태 머신과 동일한 원칙 — 잘못된 상태를 조용히 지나치지 않는다).
 */

import type { GameSystem, SystemContext } from './GameSystem';

export class SystemRegistry {
  private readonly systems: GameSystem[] = [];
  private initialized = false;

  /** 등록된 시스템 id 목록 (통합 디버깅·상태 출력용) */
  get ids(): readonly string[] {
    return this.systems.map((s) => s.id);
  }

  /**
   * 시스템 등록. initializeAll 이후의 등록은 수명주기 보장(initialize 1회)이
   * 깨지므로 예외를 던진다 — 등록은 전부 루프 시작 전에 끝낸다.
   */
  register(system: GameSystem): void {
    if (this.initialized) {
      throw new Error(
        `[SystemRegistry] 초기화 이후 등록 불가: '${system.id}' — ` +
          '등록은 Game.composeSystems(루프 시작 전)에서만 한다.',
      );
    }
    if (this.systems.some((s) => s.id === system.id)) {
      throw new Error(`[SystemRegistry] 중복 시스템 id: '${system.id}'`);
    }
    this.systems.push(system);
  }

  /** 루프 시작 전 1회 — 등록 순서대로 initialize 호출 */
  initializeAll(context: SystemContext): void {
    if (this.initialized) {
      throw new Error('[SystemRegistry] initializeAll은 1회만 호출한다.');
    }
    this.initialized = true;
    for (const system of this.systems) {
      system.initialize(context);
    }
  }

  /** 매 프레임 — 등록 순서대로 시뮬레이션 갱신 */
  update(deltaSeconds: number): void {
    for (const system of this.systems) {
      system.update(deltaSeconds);
    }
  }

  /** 매 프레임, 3D 장면 렌더 후 — render를 구현한 시스템만 등록 순서대로 */
  render(): void {
    for (const system of this.systems) {
      system.render?.();
    }
  }

  /** 루프 정지 시 1회 — 등록 역순으로 정리 후 목록 비움 */
  disposeAll(): void {
    for (let i = this.systems.length - 1; i >= 0; i -= 1) {
      this.systems[i]?.dispose();
    }
    this.systems.length = 0;
    this.initialized = false;
  }
}
