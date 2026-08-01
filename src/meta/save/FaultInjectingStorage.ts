/**
 * 저장 실패 주입 어댑터 — **테스트 전용** (툴링 소유, A5-T3~T6 재현 도구).
 *
 * 목적: 실제 localStorage를 손상시키지 않고 저장 실패를 **결정적으로** 재현한다.
 * SaveStore가 이미 주입 가능한 `StorageLike`를 받으므로, 프로덕션 기본 경로
 * (`defaultSaveStore` = 실제 localStorage)는 이 파일을 전혀 거치지 않는다 —
 * 여기서 무엇을 하든 배포 빌드의 저장 경로는 불변이다.
 *
 * 재현 가능한 실패 4종 (작업 지시 §5):
 *  - write: 현재 슬롯 쓰기 실패
 *  - backupWrite: 백업 슬롯 쓰기만 실패 (현재 슬롯은 성공)
 *  - quota: quota 유사 실패 (QuotaExceededError 이름을 가진 DOMException 형태)
 *  - serialize: 직렬화 실패 (JSON.stringify 단계에서 throw)
 */

import { SAVE_KEY_BACKUP, SAVE_KEY_CURRENT, type StorageLike } from './SaveStore';

export type SaveFaultMode = 'none' | 'write' | 'backupWrite' | 'quota' | 'serialize';

/** quota 유사 오류 — 브라우저 DOMException(QuotaExceededError)의 형태만 모사 */
export class QuotaExceededLikeError extends Error {
  constructor() {
    super('The quota has been exceeded.');
    this.name = 'QuotaExceededError';
  }
}

/** 직렬화 실패 재현용 — toJSON에서 던지는 값 (JSON.stringify 단계 실패) */
export function unserializableValue(): unknown {
  return {
    toJSON(): never {
      throw new Error('직렬화 실패 (테스트 주입)');
    },
  };
}

export class FaultInjectingStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  private mode: SaveFaultMode = 'none';
  /** 실패 주입 횟수 제한 — null이면 무제한 */
  private remainingFailures: number | null = null;

  /** 실패 모드 설정. count를 주면 그 횟수만큼만 실패하고 이후 정상 동작 */
  setFault(mode: SaveFaultMode, count: number | null = null): void {
    this.mode = mode;
    this.remainingFailures = count;
  }

  clearFault(): void {
    this.mode = 'none';
    this.remainingFailures = null;
  }

  get faultMode(): SaveFaultMode {
    return this.mode;
  }

  /** 검증 편의 — 저장된 원시 문자열 조회 (새로고침 재현 시 새 SaveStore에 재사용) */
  snapshotEntries(): Map<string, string> {
    return new Map(this.map);
  }

  /** 새로고침 재현 — 같은 저장 매체를 유지한 채 새 SaveStore를 만들 때 사용 */
  cloneWithoutFault(): FaultInjectingStorage {
    const clone = new FaultInjectingStorage();
    for (const [key, value] of this.map) clone.map.set(key, value);
    return clone;
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.shouldFail(key)) {
      this.consumeFailure();
      throw this.mode === 'quota' ? new QuotaExceededLikeError() : new Error('저장 쓰기 실패 (테스트 주입)');
    }
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  private shouldFail(key: string): boolean {
    if (this.mode === 'none' || this.mode === 'serialize') return false;
    if (this.remainingFailures !== null && this.remainingFailures <= 0) return false;
    if (this.mode === 'backupWrite') return key === SAVE_KEY_BACKUP;
    // write·quota는 현재 슬롯 쓰기에서 실패시킨다 (백업 승격은 그대로 통과)
    return key === SAVE_KEY_CURRENT;
  }

  private consumeFailure(): void {
    if (this.remainingFailures !== null) this.remainingFailures -= 1;
  }
}
