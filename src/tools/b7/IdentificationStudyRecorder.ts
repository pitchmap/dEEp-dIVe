/**
 * B7 측정 세션 수집기 — 계약 `IdentificationLogSink` 구현 (툴링 소유).
 *
 * 측정 세션은 브라우저에서 여러 번에 나눠 진행되고, 그 사이에 새로고침·
 * 재접속이 일어난다. 그래서 이 수집기는 **메모리 누적 + 세션 저장소 append**
 * 두 가지를 같이 한다. 저장 실패는 측정을 중단시키지 않는다 — 기록이
 * 목적이지 저장이 목적이 아니므로, 실패해도 메모리 누적은 계속되고 개발
 * 콘솔로만 알린다 (SaveStore와 같은 태도).
 *
 * ## 이 파일이 하지 않는 것
 *
 * 판정하지 않는다. 비율 계산·최소 표본 확인은 `identificationStudy.ts`가
 * 한다. 여기서는 검증을 통과한 기록을 모으고 내보내기만 한다.
 *
 * ## 개인정보
 *
 * `validateStudyEntry`가 익명 id 외의 값을 거부하므로, 이 수집기를 거친
 * 데이터에는 실명·이메일·전화번호가 남지 않는다. 거부된 기록은 **버리지 않고**
 * 거부 사유와 함께 별도 목록에 남긴다 — 조용히 사라지면 표본 수가 왜곡된다.
 */

import type { IdentificationLogSink, IdentificationOpportunityLog } from '../../contracts/identification';
import {
  formatSummary,
  summarizeStudy,
  toCsv,
  toJsonExport,
  validateStudyEntry,
  type StudyEntry,
  type StudyExport,
  type StudySummary,
} from './identificationStudy';

/** 세션 저장 매체 — 브라우저 localStorage와 테스트 대역이 같은 모양을 쓴다 */
export interface StudyStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface RejectedEntry {
  readonly reason: string;
  readonly raw: unknown;
}

export const STUDY_STORAGE_KEY = 'deepdive.b7.identificationStudy.v1';

/**
 * 측정 세션 수집기.
 *
 * 필드 선언이 생성자 파라미터 프로퍼티가 아닌 이유: 검증 러너가 이 `.ts`를
 * Node 타입 스트리핑으로 직접 로드하므로 파라미터 프로퍼티 문법을 쓸 수 없다.
 */
export class IdentificationStudyRecorder implements IdentificationLogSink {
  private readonly entries: StudyEntry[] = [];
  private readonly rejected: RejectedEntry[] = [];
  private readonly storage: StudyStorageLike | null;
  private readonly storageKey: string;

  constructor(storage: StudyStorageLike | null = null, storageKey: string = STUDY_STORAGE_KEY) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.restore();
  }

  /** 계약 진입점 — 검증을 통과한 기록만 누적된다 */
  record(entry: IdentificationOpportunityLog): void {
    this.append(entry);
  }

  /**
   * 기록 1건 추가. 검증 실패는 예외로 던지지 않고 거부 목록에 남긴다 —
   * 측정 세션 도중 예외로 게임이 멈추면 그 세션 전체를 잃는다.
   */
  append(raw: unknown): boolean {
    let validated: StudyEntry;
    try {
      validated = validateStudyEntry(raw);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.rejected.push({ reason, raw });
      console.warn('[B7] 기록 거부 —', reason);
      return false;
    }
    // 같은 기회의 재심사 결과는 이전 기록을 대체한다 (심사가 나중에 온다).
    const existing = this.entries.findIndex((e) => e.opportunityId === validated.opportunityId);
    if (existing >= 0) this.entries[existing] = validated;
    else this.entries.push(validated);
    this.persist();
    return true;
  }

  get recorded(): readonly StudyEntry[] {
    return this.entries;
  }

  get rejectedEntries(): readonly RejectedEntry[] {
    return this.rejected;
  }

  summary(): StudySummary {
    return summarizeStudy(this.entries);
  }

  report(): string {
    return formatSummary(this.summary());
  }

  exportJson(): StudyExport {
    return toJsonExport(this.entries);
  }

  exportCsv(): string {
    return toCsv(this.entries);
  }

  /** 세션 종료 후 정리 — 저장 매체까지 비운다 */
  clear(): void {
    this.entries.length = 0;
    this.rejected.length = 0;
    this.persist();
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.entries));
    } catch (error) {
      // 저장 실패는 측정을 막지 않는다 — 메모리 누적은 그대로 유지된다.
      console.warn('[B7] 세션 저장 실패 — 측정은 계속됩니다.', error);
    }
  }

  private restore(): void {
    if (!this.storage) return;
    let text: string | null;
    try {
      text = this.storage.getItem(this.storageKey);
    } catch (error) {
      console.warn('[B7] 세션 복원 실패 — 빈 세션으로 시작합니다.', error);
      return;
    }
    if (!text) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.warn('[B7] 저장된 세션이 손상됐습니다 — 빈 세션으로 시작합니다.', error);
      return;
    }
    if (!Array.isArray(parsed)) return;
    // 복원분도 같은 검증을 거친다 — 손상된 1건 때문에 세션 전체를 버리지 않는다.
    for (const item of parsed) {
      try {
        this.entries.push(validateStudyEntry(item));
      } catch (error) {
        this.rejected.push({ reason: error instanceof Error ? error.message : String(error), raw: item });
      }
    }
  }
}
