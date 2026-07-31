/**
 * 초기 로딩 시간 측정 — 페이지 진입(performance.timeOrigin)부터
 * 첫 렌더 완료까지. G2(접속 3초) 게이트의 측정 도구.
 */

export class LoadingTimer {
  private firstRenderAtMs: number | null = null;

  /** 첫 렌더 완료 시점에 1회 호출 (core/Game). 이후 호출은 무시된다. */
  markFirstRender(): void {
    if (this.firstRenderAtMs === null) {
      // performance.now()는 페이지 진입 시점(timeOrigin) 기준 경과 시간이다.
      this.firstRenderAtMs = performance.now();
    }
  }

  /** 첫 렌더까지 걸린 시간(ms). 아직 측정 전이면 null */
  get firstRenderMs(): number | null {
    return this.firstRenderAtMs;
  }
}
