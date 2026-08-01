/**
 * 로컬 저장소 이중 슬롯 세이브 스토어 (툴링 소유 — 소회의(11) 결의 3).
 *
 * 구조:
 *  - current 슬롯: 최신 저장
 *  - backup 슬롯: **직전 정상 저장** — 새 저장을 쓰기 전에, 검증을 통과한
 *    기존 current만 backup으로 승격한다 (손상본은 승격하지 않음)
 *
 * 복구 정책 (선량한 유저의 세이브 보호 — 치트 방지 아님):
 *  1. current 파싱→마이그레이션→검증 성공 → 그대로 사용
 *  2. 실패 → backup으로 동일 절차 → 성공 시 backup 채택 + current 재기록(복구)
 *  3. backup도 실패 → 안전한 초기 상태(createDefaultSave)
 *  어떤 경우에도 load()는 던지지 않는다 — 저장 손상이 게임 부팅을 막지 않는다.
 *
 * 저장 시점 (6차 결의 7 — 호출 측 규칙): 기지 귀환 정산 확정 시 + 희귀 부품
 * 획득 즉시. 그 외 주기적 자동 저장 없음(귀환의 긴장 유지). 이 클래스는
 * 시점을 강제하지 않는다 — 메타 루프(리드)가 위 두 시점에 save()를 호출한다.
 */

import { createDefaultSave, validateSaveData, type SaveData } from './saveSchema';
import { migrateToCurrent, SAVE_MIGRATIONS, type SaveMigration } from './migrations';

/** localStorage 호환 최소 인터페이스 — 테스트에서 Map 기반 대체 주입 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY_CURRENT = 'deepDive.save.current';
export const SAVE_KEY_BACKUP = 'deepDive.save.backup';

export interface LoadResult {
  data: SaveData;
  /** 어떤 경로로 로드됐나 — 계측·디버그 표기용 */
  source: 'current' | 'backup' | 'fresh';
  /** backup 복구 또는 초기화가 일어났는가 */
  recovered: boolean;
}

/** localStorage 접근 불가 환경(프라이버시 모드 등)용 비영속 대체 저장소 */
class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function defaultStorage(): StorageLike {
  try {
    const storage = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (storage) {
      // 접근만으로 던지는 환경 방어 (일부 프라이버시 설정)
      storage.getItem(SAVE_KEY_CURRENT);
      return storage;
    }
  } catch {
    // 아래 메모리 대체로
  }
  console.warn('[SaveStore] localStorage 사용 불가 — 이 세션 동안만 유지되는 메모리 저장으로 대체합니다.');
  return new MemoryStorage();
}

export class SaveStore {
  private readonly storage: StorageLike;
  private readonly migrations: Record<number, SaveMigration>;

  constructor(storage?: StorageLike, migrations: Record<number, SaveMigration> = SAVE_MIGRATIONS) {
    this.storage = storage ?? defaultStorage();
    this.migrations = migrations;
  }

  /** 슬롯 하나를 파싱→마이그레이션→검증. 실패 시 throw */
  private readSlot(key: string): SaveData | null {
    const raw = this.storage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return validateSaveData(migrateToCurrent(parsed, this.migrations));
  }

  /** 복구 우선 로드 — 어떤 실패에도 던지지 않고 항상 플레이 가능한 상태를 돌려준다 */
  load(): LoadResult {
    try {
      const current = this.readSlot(SAVE_KEY_CURRENT);
      if (current) return { data: current, source: 'current', recovered: false };
    } catch (error) {
      console.warn('[SaveStore] current 슬롯 손상 — 백업 복구를 시도합니다.', error);
    }

    try {
      const backup = this.readSlot(SAVE_KEY_BACKUP);
      if (backup) {
        // 복구: 검증된 백업을 current로 되살린다
        try {
          this.storage.setItem(SAVE_KEY_CURRENT, JSON.stringify(backup));
        } catch {
          // 재기록 실패는 치명적이지 않다 — 다음 저장에서 재시도된다
        }
        console.warn('[SaveStore] 백업 슬롯에서 복구했습니다 (직전 정상 저장).');
        return { data: backup, source: 'backup', recovered: true };
      }
    } catch (error) {
      console.warn('[SaveStore] 백업 슬롯도 손상 — 초기 상태로 시작합니다.', error);
    }

    return { data: createDefaultSave(), source: 'fresh', recovered: true };
  }

  /**
   * 저장. 기존 current가 검증을 통과하는 경우에만 backup으로 승격한 뒤
   * 새 데이터를 current에 쓴다. 실패해도 던지지 않는다 (반환값으로 통지).
   */
  save(data: SaveData): boolean {
    try {
      // 쓰기 전에 유효성 확인 — 손상 데이터를 저장 경로에 넣지 않는다
      const validated = validateSaveData(data);

      try {
        const existing = this.readSlot(SAVE_KEY_CURRENT);
        if (existing) {
          this.storage.setItem(SAVE_KEY_BACKUP, JSON.stringify(existing));
        }
      } catch {
        // 기존 current가 손상이면 백업 승격 생략 — 정상 백업을 덮지 않는다
      }

      this.storage.setItem(SAVE_KEY_CURRENT, JSON.stringify(validated));
      return true;
    } catch (error) {
      console.error('[SaveStore] 저장 실패 — 게임은 계속 진행됩니다.', error);
      return false;
    }
  }
}

/**
 * 공용 기본 인스턴스 — 메타 루프(저장 시점 호출)와 UI(설정 플래그)가
 * 같은 슬롯을 본다. 테스트는 new SaveStore(주입 저장소)로 격리.
 */
export const defaultSaveStore = new SaveStore();
