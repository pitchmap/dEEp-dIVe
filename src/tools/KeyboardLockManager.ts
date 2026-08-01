/**
 * Keyboard Lock 관리 + 입력 환경 1회 안내 (툴링 소유 — 5차 대회의 결의 4,
 * 소회의(11) 결의 1 판정: 크로미움 전체화면 Ctrl+W 가로채기 성공 / 파이어폭스
 * 미지원 → 이중 대응(병행 키 E + 1회 안내) 유지).
 *
 * 책임 경계:
 *  - 이 클래스는 **브라우저 기능 요청과 안내만** 담당한다. 상승 키 판정
 *    (Shift/Ctrl 스왑·병행 키 E 바인딩)은 게임플레이 소유 — 5차 결의 반영은
 *    게임플레이 작업 대기 (INTEGRATION_NOTES 참조).
 *  - Ctrl+W 차단은 전체화면 + Keyboard Lock 지원 브라우저에서만 성립한다 —
 *    항상 막을 수 있다고 가정하지 않는다. 창 모드·미지원 브라우저에서는
 *    병행 키 E 안내가 대응책이다.
 *  - 미지원 환경(파이어폭스 등)에서 오류를 내지 않는다 — 전 경로 안전 폴백.
 *
 * 1회 안내: 첫 전체화면 진입 또는 첫 상승 키 입력 시 한 번만. 표시 여부는
 * 세이브 settings(keyboardLockNoticeShown)로 영속 — 세션을 넘어 1회.
 */

import { defaultSaveStore, type SaveStore } from '../meta/save/SaveStore';

/** navigator.keyboard 최소 형태 (표준 타입 미포함 — 크로미움 전용 API) */
interface KeyboardLockApi {
  lock(keyCodes?: string[]): Promise<void>;
  unlock(): void;
}

/** 전체화면 중 게임이 유지하고 싶은 시스템 조합 키 (Esc는 잠그지 않는다 — Pointer Lock·일시정지 규약 유지) */
const LOCK_KEY_CODES = ['ControlLeft', 'ControlRight', 'KeyW', 'ShiftLeft', 'ShiftRight'];

/** 미지원·창 모드 환경 안내 (5차 결의 4 이중 대응) */
export const FALLBACK_NOTICE_TEXT =
  '창 모드/미지원 브라우저: Ctrl 조합(Ctrl+W 등)은 브라우저가 가로챌 수 있습니다 — ' +
  '병행 키 E(상승)를 사용하세요. 전체화면(크로미움)에서는 키 잠금이 자동 활성됩니다.';
export const LOCKED_NOTICE_TEXT =
  '전체화면 키 잠금 활성 — Ctrl 조합이 게임으로 전달됩니다 (Esc: 마우스 잠금 해제).';

export function detectKeyboardLockSupport(nav: unknown): KeyboardLockApi | null {
  if (typeof nav !== 'object' || nav === null) return null;
  const keyboard = (nav as { keyboard?: unknown }).keyboard;
  if (typeof keyboard !== 'object' || keyboard === null) return null;
  const api = keyboard as Partial<KeyboardLockApi>;
  return typeof api.lock === 'function' && typeof api.unlock === 'function'
    ? (api as KeyboardLockApi)
    : null;
}

export interface KeyboardLockEnv {
  nav: unknown;
  doc: Pick<Document, 'addEventListener' | 'removeEventListener'> & {
    fullscreenElement: Element | null;
  };
  /** 안내 표시 콜백 — 기본은 화면 토스트 (테스트에서 대체 주입) */
  showNotice?: (message: string) => void;
  saveStore?: SaveStore;
}

export class KeyboardLockManager {
  private readonly api: KeyboardLockApi | null;
  private readonly env: KeyboardLockEnv;
  private readonly saveStore: SaveStore;
  private noticeShownThisSession = false;
  private lockActive = false;
  private disposed = false;

  constructor(env?: Partial<KeyboardLockEnv>) {
    this.env = {
      nav: env?.nav ?? (typeof navigator !== 'undefined' ? navigator : null),
      doc: env?.doc ?? document,
      ...(env?.showNotice ? { showNotice: env.showNotice } : {}),
      ...(env?.saveStore ? { saveStore: env.saveStore } : {}),
    };
    this.api = detectKeyboardLockSupport(this.env.nav);
    this.saveStore = this.env.saveStore ?? defaultSaveStore;

    this.env.doc.addEventListener('fullscreenchange', this.handleFullscreenChange);
  }

  get supported(): boolean {
    return this.api !== null;
  }

  get locked(): boolean {
    return this.lockActive;
  }

  dispose(): void {
    this.disposed = true;
    this.env.doc.removeEventListener('fullscreenchange', this.handleFullscreenChange);
    this.releaseLock();
  }

  /**
   * 전체화면 상태에 맞춰 잠금을 요청·해제한다. 실패해도 던지지 않는다.
   * @returns 잠금이 실제로 활성됐는가
   */
  async applyForFullscreen(): Promise<boolean> {
    if (this.disposed) return false;
    const inFullscreen = this.env.doc.fullscreenElement !== null;
    if (!inFullscreen || !this.api) {
      this.releaseLock();
      return false;
    }
    try {
      await this.api.lock(LOCK_KEY_CODES);
      this.lockActive = true;
      return true;
    } catch (error) {
      // 권한·정책 거부 — 폴백(병행 키 안내)으로 정상 진행
      console.warn('[KeyboardLockManager] Keyboard Lock 요청 실패 — 병행 키 폴백으로 진행합니다.', error);
      this.lockActive = false;
      return false;
    }
  }

  /**
   * 1회 안내 트리거 — 첫 전체화면 진입 또는 첫 상승 키 입력 시 호출된다.
   * 세이브 설정에 기록해 세션을 넘어서도 1회만 표시한다.
   */
  maybeShowNotice(): void {
    if (this.noticeShownThisSession) return;
    const loaded = this.saveStore.load();
    if (loaded.data.settings.keyboardLockNoticeShown) {
      this.noticeShownThisSession = true;
      return;
    }
    const message = this.lockActive ? LOCKED_NOTICE_TEXT : FALLBACK_NOTICE_TEXT;
    (this.env.showNotice ?? showToast)(message);
    this.noticeShownThisSession = true;
    // 설정 플래그만 갱신 — 다른 저장 값은 손대지 않는다
    loaded.data.settings.keyboardLockNoticeShown = true;
    this.saveStore.save(loaded.data);
  }

  private releaseLock(): void {
    if (this.lockActive && this.api) {
      try {
        this.api.unlock();
      } catch {
        // 해제 실패는 무해 — 전체화면 종료 시 브라우저가 스스로 푼다
      }
    }
    this.lockActive = false;
  }

  private readonly handleFullscreenChange = (): void => {
    void this.applyForFullscreen().then(() => {
      if (this.env.doc.fullscreenElement !== null) this.maybeShowNotice();
    });
  };
}

/** 기본 안내 표시 — 화면 하단 토스트, 8초 후 제거 */
function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'kb-lock-notice';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}
