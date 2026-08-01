/**
 * 툴링 파트 결정적 검증 — 세이브·업그레이드 계산·Keyboard Lock 폴백·오디오 라우팅.
 *
 * 실행: node src/tools/__verification__/run.mjs (게임플레이 러너와 동일 방식).
 * 브라우저 없이 결정적으로 돈다 — 저장소는 Map 주입, 브라우저 API는 가짜 env.
 */

import {
  CURRENT_SCHEMA_VERSION,
  createDefaultSave,
  type SaveData,
} from '../../meta/save/saveSchema';
import { migrateToCurrent, type SaveMigration } from '../../meta/save/migrations';
import {
  SAVE_KEY_BACKUP,
  SAVE_KEY_CURRENT,
  SaveStore,
  type StorageLike,
} from '../../meta/save/SaveStore';
import { effectiveDurationSeconds, effectiveValue } from '../../meta/upgradeMath';
import { validateUpgradeCatalog } from '../economyMath';
import { detectKeyboardLockSupport, KeyboardLockManager } from '../KeyboardLockManager';
import { AudioCueRouter, type AudioCueId } from '../../audio/AudioCueRouter';
import { WebAudioSystem } from '../../audio/WebAudioSystem';
import { EventBus } from '../../core/EventBus';

export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

class MapStorage implements StorageLike {
  readonly map = new Map<string, string>();
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

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('storage unavailable');
  }
  setItem(): void {
    throw new Error('storage unavailable');
  }
  removeItem(): void {
    throw new Error('storage unavailable');
  }
}

function sampleSave(credits: number): SaveData {
  const data = createDefaultSave();
  data.credits = credits;
  data.rareParts = 2;
  data.upgradeLevels = { maxSpeed: 3 };
  data.equippedGear = ['standardTorpedo'];
  return data;
}

export function runToolingVerification(): CheckResult[] {
  const results: CheckResult[] = [];
  const check = (name: string, fn: () => string): void => {
    try {
      results.push({ name, passed: true, detail: fn() });
    } catch (error) {
      results.push({ name, passed: false, detail: String(error) });
    }
  };
  const assert = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
  };

  // ── 세이브: 저장·로드·백업·복구 ─────────────────────────────

  check('세이브: 정상 저장·로드 왕복', () => {
    const store = new SaveStore(new MapStorage());
    assert(store.save(sampleSave(100)), '저장 실패');
    const loaded = store.load();
    assert(loaded.source === 'current' && !loaded.recovered, 'current에서 로드되어야 함');
    assert(loaded.data.credits === 100 && loaded.data.upgradeLevels['maxSpeed'] === 3, '값 보존 실패');
    return 'credits·업그레이드 단계 왕복 보존';
  });

  check('세이브: 재저장 시 직전 정상 저장이 백업 슬롯으로 승격', () => {
    const storage = new MapStorage();
    const store = new SaveStore(storage);
    store.save(sampleSave(100));
    store.save(sampleSave(250));
    const backup = JSON.parse(storage.map.get(SAVE_KEY_BACKUP) ?? 'null');
    const current = JSON.parse(storage.map.get(SAVE_KEY_CURRENT) ?? 'null');
    assert(backup?.credits === 100 && current?.credits === 250, '백업=직전, current=최신 이어야 함');
    return 'backup=100 / current=250';
  });

  check('세이브: current JSON 손상 → 백업 복구 + current 재기록', () => {
    const storage = new MapStorage();
    const store = new SaveStore(storage);
    store.save(sampleSave(100));
    store.save(sampleSave(250));
    storage.setItem(SAVE_KEY_CURRENT, '{손상된 JSON');
    const loaded = store.load();
    assert(loaded.source === 'backup' && loaded.recovered, '백업 경로여야 함');
    assert(loaded.data.credits === 100, '직전 정상 저장(100)이어야 함');
    const repaired = JSON.parse(storage.map.get(SAVE_KEY_CURRENT) ?? 'null');
    assert(repaired?.credits === 100, 'current가 백업으로 재기록되어야 함');
    return '백업(100) 복구·current 수리';
  });

  check('세이브: current 구조 손상(검증 실패) → 백업 복구', () => {
    const storage = new MapStorage();
    const store = new SaveStore(storage);
    store.save(sampleSave(100));
    store.save(sampleSave(250));
    storage.setItem(
      SAVE_KEY_CURRENT,
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, credits: -5 }),
    );
    const loaded = store.load();
    assert(loaded.source === 'backup' && loaded.data.credits === 100, '백업 복구여야 함');
    return '음수 크레딧 구조 거부 → 백업 채택';
  });

  check('세이브: 버전 마이그레이션 (주입 v0→v1)', () => {
    const storage = new MapStorage();
    const migrations: Record<number, SaveMigration> = {
      0: (old) => ({ ...createDefaultSave(), credits: old['gold'] ?? 0, schemaVersion: 1 }),
    };
    storage.setItem(SAVE_KEY_CURRENT, JSON.stringify({ schemaVersion: 0, gold: 77 }));
    const store = new SaveStore(storage, migrations);
    const loaded = store.load();
    assert(loaded.source === 'current' && loaded.data.credits === 77, 'v0 gold → v1 credits 이관');
    return 'v0{gold:77} → v1{credits:77}';
  });

  check('세이브: 마이그레이션 함수 부재·미래 버전 → 복구 경로', () => {
    const storage = new MapStorage();
    storage.setItem(SAVE_KEY_CURRENT, JSON.stringify({ schemaVersion: 0 }));
    const store = new SaveStore(storage, {});
    const loaded = store.load();
    assert(loaded.source === 'fresh' && loaded.recovered, '함수 부재 → 초기 상태');
    let threw = false;
    try {
      migrateToCurrent({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    } catch {
      threw = true;
    }
    assert(threw, '미래 버전은 거부되어야 함');
    return '부재 → fresh / 미래 버전 → 거부';
  });

  check('세이브: 양쪽 슬롯 손상 → 안전한 초기 상태 (부팅 불차단)', () => {
    const storage = new MapStorage();
    storage.setItem(SAVE_KEY_CURRENT, '###');
    storage.setItem(SAVE_KEY_BACKUP, '{"schemaVersion":"bad"}');
    const loaded = new SaveStore(storage).load();
    assert(loaded.source === 'fresh' && loaded.data.credits === 0, '초기 상태여야 함');
    return 'fresh 기본값 — 예외 없음';
  });

  check('세이브: 저장소 자체 불능 → load 무예외·save false', () => {
    const store = new SaveStore(new ThrowingStorage());
    const loaded = store.load();
    assert(loaded.source === 'fresh', '초기 상태로 부팅');
    assert(store.save(sampleSave(1)) === false, 'save는 false 반환(throw 금지)');
    return '전 경로 무예외';
  });

  check('세이브: 손상 데이터 저장 시도 거부 (슬롯 불변)', () => {
    const storage = new MapStorage();
    const store = new SaveStore(storage);
    store.save(sampleSave(100));
    const bad = sampleSave(1);
    (bad as { credits: unknown }).credits = 'lots';
    assert(store.save(bad) === false, '검증 실패 데이터는 저장 거부');
    const current = JSON.parse(storage.map.get(SAVE_KEY_CURRENT) ?? 'null');
    assert(current?.credits === 100, '기존 저장이 보존되어야 함');
    return '거부 + 기존 저장 보존';
  });

  check('세이브: 손상 current는 백업으로 승격되지 않음', () => {
    const storage = new MapStorage();
    const store = new SaveStore(storage);
    store.save(sampleSave(100));
    store.save(sampleSave(250)); // backup=100
    storage.setItem(SAVE_KEY_CURRENT, '{깨짐');
    store.save(sampleSave(300)); // 손상 current를 백업으로 올리면 안 됨
    const backup = JSON.parse(storage.map.get(SAVE_KEY_BACKUP) ?? 'null');
    assert(backup?.credits === 100, '정상 백업(100)이 유지되어야 함');
    return '정상 백업 보존 (손상본 승격 차단)';
  });

  // ── 업그레이드 계산 (리드 정본 src/meta/upgradeMath 사용 — 복제 금지) ──

  check('업그레이드: 합연산 공식 (곱연산 스택 아님)', () => {
    // 보정 합 0.3 = 0.1 × 3단계. 곱연산이면 13.31이 나온다
    const final = effectiveValue(10, 0.3);
    assert(Math.abs(final - 13) < 1e-9, `합연산 13 기대, 실제 ${final}`);
    return '10 × (1 + 0.3) = 13';
  });

  check('업그레이드: 시간형은 단축 적용 (업그레이드가 페널티가 되지 않음)', () => {
    const seconds = effectiveDurationSeconds(20, 0.25);
    assert(Math.abs(seconds - 16) < 1e-9, `20 ÷ 1.25 = 16 기대, 실제 ${seconds}`);
    return '재장전 20s → 16s';
  });

  check('업그레이드: 공식 카탈로그(7항목·단계 배열) 검증 통과', () => {
    const seven = {
      items: Array.from({ length: 7 }, (_, i) => ({
        id: [
          'hullIntegrity',
          'maxSpeed',
          'turnRate',
          'maxDepth',
          'torpedoDamage',
          'reloadSpeed',
          'sonarRange',
        ][i],
        label: `U${i}`,
        maxLevel: 2,
        costCredits: [10, 20],
        costRareParts: [0, 1],
        effectBonus: [0.1, 0.2],
      })),
    };
    assert(validateUpgradeCatalog(seven).length === 7, '7개 통과');
    return '7/7 허용 (공식 ID·단계 배열)';
  });

  check('업그레이드: 8항목 → 신 스코프 가드 거부', () => {
    const item = {
      id: 'maxSpeed',
      label: 'U',
      maxLevel: 1,
      costCredits: [1],
      costRareParts: [0],
      effectBonus: [0.1],
    };
    let threw = false;
    try {
      validateUpgradeCatalog({ items: Array.from({ length: 8 }, () => item) });
    } catch {
      threw = true;
    }
    assert(threw, '8개는 거부되어야 함');
    return '로더 차원 가드 작동';
  });

  check('업그레이드: 계약 밖 id 거부', () => {
    let threw = false;
    try {
      validateUpgradeCatalog({
        items: [
          {
            id: 'luckyCharm',
            label: 'X',
            maxLevel: 1,
            costCredits: [1],
            costRareParts: [0],
            effectBonus: [0.1],
          },
        ],
      });
    } catch {
      threw = true;
    }
    assert(threw, '계약(UpgradeStatId) 밖 id는 거부되어야 함');
    return '미지 id 차단';
  });

  // ── Keyboard Lock 폴백 ──────────────────────────────────────

  const fakeDoc = (fullscreen: boolean) => ({
    fullscreenElement: fullscreen ? ({} as Element) : null,
    addEventListener: () => {},
    removeEventListener: () => {},
  });

  check('KeyboardLock: 미지원 환경(파이어폭스형) — 감지·생성·해제 무예외', () => {
    assert(detectKeyboardLockSupport(null) === null, 'null nav → 미지원');
    assert(detectKeyboardLockSupport({}) === null, 'keyboard 없음 → 미지원');
    assert(detectKeyboardLockSupport({ keyboard: {} }) === null, 'lock/unlock 없음 → 미지원');
    const manager = new KeyboardLockManager({
      nav: {},
      doc: fakeDoc(true),
      showNotice: () => {},
      saveStore: new SaveStore(new MapStorage()),
    });
    assert(manager.supported === false, 'supported=false 여야 함');
    manager.dispose();
    return '감지 3경로 미지원 판정·생성·해제 무예외';
  });

  return results;
}

/** 비동기 검증(잠금 요청·안내 1회)은 러너에서 await로 이어 붙인다 */
export async function runToolingVerificationAsync(): Promise<CheckResult[]> {
  const results = runToolingVerification();
  const check = async (name: string, fn: () => Promise<string>): Promise<void> => {
    try {
      results.push({ name, passed: true, detail: await fn() });
    } catch (error) {
      results.push({ name, passed: false, detail: String(error) });
    }
  };
  const assert = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
  };

  const fakeDoc = (fullscreen: boolean) => ({
    fullscreenElement: fullscreen ? ({} as Element) : null,
    addEventListener: () => {},
    removeEventListener: () => {},
  });

  await check('KeyboardLock: 미지원 환경에서 applyForFullscreen → false·무예외', async () => {
    const manager = new KeyboardLockManager({
      nav: {},
      doc: fakeDoc(true),
      showNotice: () => {},
      saveStore: new SaveStore(new MapStorage()),
    });
    const locked = await manager.applyForFullscreen();
    manager.dispose();
    assert(locked === false, '미지원 → false');
    return 'false 반환, throw 없음';
  });

  await check('KeyboardLock: 지원 환경 전체화면 → lock 호출·활성', async () => {
    const lockedCodes: string[][] = [];
    const manager = new KeyboardLockManager({
      nav: {
        keyboard: {
          lock: (codes?: string[]) => {
            lockedCodes.push(codes ?? []);
            return Promise.resolve();
          },
          unlock: () => {},
        },
      },
      doc: fakeDoc(true),
      showNotice: () => {},
      saveStore: new SaveStore(new MapStorage()),
    });
    const locked = await manager.applyForFullscreen();
    assert(locked === true && manager.locked, '잠금 활성이어야 함');
    assert((lockedCodes[0] ?? []).includes('KeyW'), 'Ctrl+W 대상 키가 포함되어야 함');
    manager.dispose();
    return `lock(${lockedCodes[0]?.length}키) 요청 확인`;
  });

  await check('KeyboardLock: lock 거부(정책) → false·무예외 폴백', async () => {
    const manager = new KeyboardLockManager({
      nav: {
        keyboard: {
          lock: () => Promise.reject(new Error('permission denied')),
          unlock: () => {},
        },
      },
      doc: fakeDoc(true),
      showNotice: () => {},
      saveStore: new SaveStore(new MapStorage()),
    });
    const locked = await manager.applyForFullscreen();
    manager.dispose();
    assert(locked === false, '거부 → false');
    return '거부를 폴백으로 흡수';
  });

  await check('KeyboardLock: 안내는 1회만 (세션 내 중복 억제)', async () => {
    const shown: string[] = [];
    const store = new SaveStore(new MapStorage());
    const manager = new KeyboardLockManager({
      nav: {},
      doc: fakeDoc(false),
      showNotice: (msg) => shown.push(msg),
      saveStore: store,
    });
    manager.maybeShowNotice();
    manager.maybeShowNotice();
    manager.dispose();
    assert(shown.length === 1, `1회 기대, 실제 ${shown.length}`);
    assert(shown[0]?.includes('E') === true, '병행 키 E 안내 포함');
    return '1회 표시 + E 병행 키 문구';
  });

  await check('KeyboardLock: 안내 표시 여부가 세이브에 영속 (세션 넘어 1회)', async () => {
    const storage = new MapStorage();
    const store = new SaveStore(storage);
    const shownA: string[] = [];
    const managerA = new KeyboardLockManager({
      nav: {},
      doc: fakeDoc(false),
      showNotice: (msg) => shownA.push(msg),
      saveStore: store,
    });
    managerA.maybeShowNotice();
    managerA.dispose();

    const shownB: string[] = [];
    const managerB = new KeyboardLockManager({
      nav: {},
      doc: fakeDoc(false),
      showNotice: (msg) => shownB.push(msg),
      saveStore: new SaveStore(storage),
    });
    managerB.maybeShowNotice();
    managerB.dispose();
    assert(shownA.length === 1 && shownB.length === 0, '두 번째 세션은 표시 없음');
    return '설정 플래그 영속 확인';
  });

  await check('오디오: aimModeChanged → 조준경 진입·해제 큐 라우팅', async () => {
    const bus = new EventBus();
    const cues: AudioCueId[] = [];
    const router = new AudioCueRouter(new WebAudioSystem(), bus, (cue) => cues.push(cue));
    bus.emit('aimModeChanged', { aiming: true });
    bus.emit('aimModeChanged', { aiming: false });
    router.trigger('creditsGained');
    router.trigger('rarePartAcquired');
    router.dispose();
    assert(
      cues.join(',') === 'aimEnter,aimExit,creditsGained,rarePartAcquired',
      `라우팅 순서 불일치: ${cues.join(',')}`,
    );
    return '진입·해제·경제 큐 4종 라우팅';
  });

  await check('오디오: 버퍼 미등록 큐 trigger — 무음·무예외', async () => {
    const bus = new EventBus();
    const router = new AudioCueRouter(new WebAudioSystem(), bus);
    router.trigger('baseEnter');
    router.trigger('baseDepart');
    router.dispose();
    return '무등록 큐 재생 요청이 던지지 않음';
  });

  return results;
}
