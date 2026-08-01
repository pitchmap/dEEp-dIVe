/**
 * 입력·버튼 사용 세션 카운터 (툴링 소유 계측).
 *
 * 목적: 마우스 조작 대비 화면 버튼 사용률 판단 근거 수집 —
 *  - 화면 버튼 사용률 30% 이상 → 버튼 확대 검토
 *  - 5% 미만 → 기본 흐림 강화 검토
 * 그리고 G3(첫 어뢰 발사 60초) 참고 지표인 첫 발사 요청 시각 기록.
 *
 * 개인정보·고유 사용자 식별자를 기록하지 않는다 — 세션 메모리 카운터뿐이며
 * 저장·전송 없음. 스냅샷은 게이트 기록 JSON(GateMetricRecorder)에 합류한다.
 */

export interface InputMetricsSnapshot {
  /** 마우스 우클릭 홀드로 조준을 시작한 횟수 */
  mouseAimCount: number;
  /** 화면 조준 버튼으로 조준을 시작한 횟수 */
  buttonAimCount: number;
  /** 마우스 좌클릭 발사 요청 횟수 */
  mouseFireRequestCount: number;
  /** 화면 발사 버튼 발사 요청 횟수 */
  buttonFireRequestCount: number;
  pointerLockEnterCount: number;
  pointerLockExitCount: number;
  /** 페이지 진입 → 첫 어뢰 발사 요청 (ms). 아직 없으면 null (G3 참고) */
  firstFireRequestMs: number | null;
}

export type InputSource = 'mouse' | 'screenButton';

class InputTelemetry {
  private mouseAim = 0;
  private buttonAim = 0;
  private mouseFire = 0;
  private buttonFire = 0;
  private lockEnter = 0;
  private lockExit = 0;
  private firstFireMs: number | null = null;

  recordAimStart(source: InputSource): void {
    if (source === 'mouse') this.mouseAim += 1;
    else this.buttonAim += 1;
  }

  recordFireRequest(source: InputSource): void {
    if (source === 'mouse') this.mouseFire += 1;
    else this.buttonFire += 1;
    if (this.firstFireMs === null) {
      // performance.now() = 페이지 진입(timeOrigin) 기준 경과 시간 (LoadingTimer와 동일 기준)
      this.firstFireMs = Math.round(performance.now());
    }
  }

  recordPointerLockEnter(): void {
    this.lockEnter += 1;
  }

  recordPointerLockExit(): void {
    this.lockExit += 1;
  }

  get mouseAimCount(): number {
    return this.mouseAim;
  }

  snapshot(): InputMetricsSnapshot {
    return {
      mouseAimCount: this.mouseAim,
      buttonAimCount: this.buttonAim,
      mouseFireRequestCount: this.mouseFire,
      buttonFireRequestCount: this.buttonFire,
      pointerLockEnterCount: this.lockEnter,
      pointerLockExitCount: this.lockExit,
      firstFireRequestMs: this.firstFireMs,
    };
  }
}

/** 세션 단위 싱글턴 — HUD가 기록하고 GateMetricRecorder가 읽는다 */
export const inputTelemetry = new InputTelemetry();

// 개발 모드 확인용: 콘솔에서 __deepDiveInput() 으로 현재 카운터를 조회한다.
if (import.meta.env.DEV) {
  (globalThis as unknown as Record<string, unknown>)['__deepDiveInput'] = () =>
    inputTelemetry.snapshot();
}
