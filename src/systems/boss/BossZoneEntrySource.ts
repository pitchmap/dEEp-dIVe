/**
 * 보스 구역 진입 판정 — 게임플레이 소유 (INT-CORE-022 §3·§8).
 *
 * ## 이 파일이 하는 일은 하나다: "지금 플레이어가 구역 안인가"
 *
 * 구역 경계 좌표는 **월드 배치 모듈**(`src/world/bossPlacement.ts`의
 * `BOSS_ZONE` — 그래픽스 창 신설분)이 소유한다. 여기서는 그 값을 **주입받아
 * 읽기만** 하며 좌표를 만들지 않는다. 경계가 미주입이면 항상 '밖'이다.
 *
 * ## 해금·게이트를 복제하지 않는다
 *
 * 해금 여부(3/3)·진입 허가 판정은 리드 `BossProgressStore`
 * (`BossZoneGatePort.requestEntry()`) 하나가 소유한다. 이 파일에는 단서
 * 개수·해금 플래그·`requestEntry` 대체 로직이 **없다**. 조립부 순서는
 * 인계표 §3 그대로다:
 *
 * ```
 * (게임플레이) 구역 진입 edge 통지
 *   → (조립부) bossProgress.requestEntry()
 *     → 'granted' 면 gameplay.spawnBoss()
 *     → 'lockedMissingClues' 면 아무것도 하지 않음 (spawn 0)
 * ```
 *
 * ## edge — 머무는 동안 매 프레임 요청하지 않는다
 *
 * 구역 안에 서 있는 동안 매 프레임 `requestEntry()`가 불리면 잠금 상태에서
 * 초당 60회 거부가 쌓인다. 그래서 이 소스는 **밖→안 전이 1회만** 통지하고,
 * 다시 나갔다 들어오면 새 edge를 준다. 이미 스폰된 뒤에도 조립부가
 * 방어를 따로 만들 필요가 없도록 `BossEncounter.spawn()`이 재호출을 무시한다
 * (이중 정본 금지 — 인계표 §3).
 */

/** 보스 구역 경계 — 월드 배치 모듈 소유 (`BOSS_ZONE`) */
export interface BossZoneBounds {
  /** 구역 ID — 배치 모듈이 export하는 유일 문자열 (`boss-zone-abyss`) */
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** 관측 대상(플레이어) 위치 단면 */
export interface BossZoneActorView {
  readonly positionX: number;
  readonly positionZ: number;
}

export class BossZoneEntrySource {
  // 검증 러너(Node 타입 스트리핑) 호환 — 매개변수 프로퍼티 미사용
  private readonly actor: BossZoneActorView;
  private zone: BossZoneBounds | null;
  /** 직전 프레임에 구역 안이었는가 — edge 판정 상태 */
  private inside = false;
  private entryCount = 0;
  private readonly entryListeners = new Set<(zoneId: string) => void>();

  constructor(actor: BossZoneActorView, zone: BossZoneBounds | null = null) {
    this.actor = actor;
    this.zone = zone;
  }

  /**
   * 구역 경계 주입 (조립부 — 월드 배치 모듈에서 온 값).
   * 미주입이면 진입이 성립하지 않는다: 좌표를 발명하지 않는다.
   */
  attachZone(zone: BossZoneBounds | null): void {
    this.zone = zone;
    if (!zone) this.inside = false;
  }

  /** 경계가 주입됐는가 — false면 항상 '밖' */
  get wired(): boolean {
    return this.zone !== null;
  }

  get zoneId(): string | null {
    return this.zone?.id ?? null;
  }

  /** 지금 플레이어가 보스 구역 안인가 (경계 포함) */
  isPlayerInBossZone(): boolean {
    const zone = this.zone;
    if (!zone) return false;
    const { positionX: x, positionZ: z } = this.actor;
    return x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ;
  }

  /** 이번 출항에서 관측된 진입 edge 횟수 (진단·검증용) */
  get entryEdgeCount(): number {
    return this.entryCount;
  }

  /**
   * 진입 edge 구독 — **밖→안 전이 1회만** 통지한다.
   * 조립부가 이 통지를 받아 `requestEntry()`를 부른다(허가 판정은 리드 소유).
   */
  onZoneEntered(listener: (zoneId: string) => void): () => void {
    this.entryListeners.add(listener);
    return () => this.entryListeners.delete(listener);
  }

  /**
   * 매 프레임 갱신 — 상태 전이만 본다.
   * 구역 안에 머무는 동안에는 통지가 없다(중복 요청 0).
   */
  update(): void {
    const nowInside = this.isPlayerInBossZone();
    if (nowInside === this.inside) return;
    this.inside = nowInside;
    if (!nowInside) return;
    this.entryCount += 1;
    const zoneId = this.zone?.id;
    if (zoneId === undefined) return;
    for (const listener of [...this.entryListeners]) listener(zoneId);
  }

  /**
   * 새 출항 — edge 상태를 초기화한다. 경계는 유지한다(월드 데이터).
   * 재출항 직후 구역 안에서 시작하더라도 첫 `update()`가 새 edge를 준다.
   */
  resetForNewSortie(): void {
    this.inside = false;
    this.entryCount = 0;
  }

  dispose(): void {
    this.resetForNewSortie();
    this.entryListeners.clear();
  }
}
