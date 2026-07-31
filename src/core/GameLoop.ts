/**
 * requestAnimationFrame 기반 게임 루프.
 *
 * 책임: delta time 계산과 update/render 호출 분리뿐이다.
 * 게임 규칙·렌더링 내용은 여기서 다루지 않는다.
 */

export interface LoopCallbacks {
  /** 시뮬레이션 갱신 (deltaSeconds: 이전 프레임과의 간격, 초) */
  update(deltaSeconds: number): void;
  /** 화면 그리기 — update와 분리 호출 */
  render(): void;
}

export class GameLoop {
  /** 탭 비활성 복귀 등으로 프레임 간격이 튀었을 때의 상한 (초) */
  private static readonly MAX_DELTA_SECONDS = 0.1;

  private rafId: number | null = null;
  private lastTimeMs = 0;

  constructor(private readonly callbacks: LoopCallbacks) {}

  get running(): boolean {
    return this.rafId !== null;
  }

  start(): void {
    if (this.running) return;
    this.lastTimeMs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private readonly tick = (nowMs: number): void => {
    const deltaSeconds = Math.min(
      (nowMs - this.lastTimeMs) / 1000,
      GameLoop.MAX_DELTA_SECONDS,
    );
    this.lastTimeMs = nowMs;

    this.callbacks.update(deltaSeconds);
    this.callbacks.render();

    this.rafId = requestAnimationFrame(this.tick);
  };
}
