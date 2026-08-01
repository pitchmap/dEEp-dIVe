/**
 * PvE 메타 루프·경제·업그레이드·보스 공통 계약 (INT-CORE-006).
 *
 * 근거: 6차 대회의(meetings/10 — PvE 보스 헌팅 전환·신 스코프 가드)와
 * 개발팀 소회의(meetings/11 — 2계층 상태 머신·params 불변 배율·보스 정의).
 *
 * 원칙:
 *  - 상위 메타 루프(기지→출항 준비→해역 세션→귀환 정산)와 하위 해역 세션의
 *    통신은 **3종으로 제한**한다: ① 세션 시작 ② 세션 결과 ③ 중도 귀환.
 *    상위가 하위 내부 상태를 직접 읽는 것 금지 (소회의 결의 2).
 *  - 여기 정의는 신 스코프 가드(해역 1·보스 1종·업그레이드 7항목·장비 4종)
 *    상한을 타입 수준에서 그대로 반영한다 — 상한 밖 확장은 계약 개정 사안.
 *
 * 이 파일은 공통 보호 파일이다 — 변경은 docs/INTEGRATION_NOTES.md 절차를 따른다.
 */

/** 세력 구분 — 클래스 분화가 아니라 개체 태그 (소회의 결의 2, 6차 결의 3·5).
 *  hostile = 파괴 시 드롭 / neutral = 공격 시 경비함 출현 단일 불이익 /
 *  patrol = 경비함(구축함 AI 재활용 개체) */
export type FactionId = 'hostile' | 'neutral' | 'patrol';

/** 드롭 발생원 (6차 결의 4 — MVP 동사 '부순다'·'줍는다' 2종의 출처) */
export type LootSource = 'cargoShip' | 'seabedCache' | 'wreckSalvage' | 'elite' | 'boss';

/** 재화 묶음 — 이원화 [확정 6차 결의 6]: 일반 크레딧 / 희귀 부품 */
export interface CurrencyBundle {
  readonly credits: number;
  readonly rareParts: number;
}

/* ── 메타 루프 (상위 상태 머신) ─────────────────────────────── */

/** 상위 메타 루프 상태 — 기지 → 출항 준비 → 해역 세션 → 귀환 정산 → 기지 */
export type MetaStateId = 'BASE' | 'SORTIE_PREP' | 'SORTIE' | 'DEBRIEF';

/** 해역 세션 종료 방식.
 *  returned = 정상 귀환 / aborted = 중도 귀환 / destroyed = 파괴 */
export type SortieOutcome = 'returned' | 'aborted' | 'destroyed';

/** ② 세션 결과 — 하위 세션이 상위에 보고하는 유일한 데이터.
 *  재화 집계는 메타 루프가 lootDropped 이벤트로 직접 수행하므로 여기 없다 */
export interface SortieReport {
  readonly outcome: SortieOutcome;
}

/**
 * 귀환 정산 [확정 6차 결의 7·9]:
 *  - returned/aborted: 손실 0, 이번 출항 크레딧 전액 반영
 *  - destroyed: 이번 출항 크레딧 일부 손실 (손실률은 튜닝값 — params 이관 대기)
 *  - 희귀 부품·영구 업그레이드·기구매 장비는 어떤 결과에도 보존
 */
export interface SortieSettlement {
  readonly outcome: SortieOutcome;
  /** 이번 출항에서 획득한 크레딧 (손실 적용 전) */
  readonly creditsEarned: number;
  /** 파괴 손실분 (returned/aborted = 0) */
  readonly creditsLost: number;
  /** 지갑 반영분 = earned − lost */
  readonly creditsNet: number;
  /** 이번 출항에서 획득 즉시 확정된 희귀 부품 (손실 없음) */
  readonly rarePartsSecured: number;
}

/**
 * 하위 해역 세션 포장 포트 — 상·하위 계층 통신 3종 중 상위→하위 방향.
 * 구현(어댑터)은 composition root(core/Game)가 제공하며, 기존 해역 세션
 * 코드를 무수정 포장한다. 상위는 이 포트 외의 하위 접근 금지.
 * (② 세션 결과는 하위→상위 방향 — MetaLoop.settleSortie 호출로 전달)
 */
export interface SortieSessionPort {
  /** ① 세션 시작 — 기존 전투 세션을 초기 상태로 재시작한다 */
  start(): void;
  /** ③ 중도 귀환 요청 — 세션이 정리를 마친 뒤 SortieReport(aborted)로 응답한다 */
  requestReturnToBase(): void;
}

/* ── 업그레이드 배율 레이어 (1층 영구 성장) ─────────────────── */

/**
 * 영구 업그레이드 7항목 [신 스코프 가드 상한 — 6차 결의 4·5].
 * 8항목 이상 추가는 계약 개정 + 가드 재심 사안이다.
 */
export type UpgradeStatId =
  | 'hullIntegrity'
  | 'maxSpeed'
  | 'turnRate'
  | 'maxDepth'
  | 'torpedoDamage'
  | 'reloadSpeed'
  | 'sonarRange';

/**
 * 합연산 보정 집합 [확정 소회의 결의 4]: statId → 보정 합.
 * 예: { maxSpeed: 0.2 } = 최고 속도 +20%.
 * 최종값 = 기준값 × (1 + 보정 합) — 곱연산 스택 금지, params 원본 불변.
 * 계산은 src/meta/upgradeMath.ts 순수 함수만 사용한다 (툴 시뮬레이터 동일).
 */
export type UpgradeModifiers = Partial<Record<UpgradeStatId, number>>;

/* ── 장비 (2층 교체 슬롯) ──────────────────────────────────── */

/** MVP 장비 4종 [신 스코프 가드 상한 — 6차 결의 5]. 상위호환 관계 금지 */
export type EquipmentId = 'standardTorpedo' | 'fastTorpedo' | 'heavyTorpedo' | 'decoy';

/** 장비 장착 상태 — 슬롯 제한이 있는 현재 장착 목록 (소유: 메타/기지) */
export interface EquipmentLoadout {
  readonly slotCapacity: number;
  readonly equipped: readonly EquipmentId[];
}

/* ── 보스 (3단계 × 약점) ───────────────────────────────────── */

/** 보스 단계 [확정 6차 결의 8 — 3단계 구조] */
export type BossPhase = 1 | 2 | 3;

/* ── 구매·장비 트랜잭션 (스프린트 A — 7차 결의 4·13차 결의 7) ── */

/**
 * 일반 구매·장비 변경 불가 사유 [확정 7차 결의 4 + INT-CORE-010 개정].
 *
 *  - 확정 5종(크레딧 부족/부품 부족/최대 단계/슬롯 부족/이미 장착) +
 *    `economyDataUnavailable`(공식 경제 params 미확정 — null 가격).
 *  - `slotFull`로 통일 — 구 `noFreeSlot`은 폐기 (게임플레이 purchaseTypes와
 *    이원화 해소, 매니페스트 §7-4).
 *  - `economyDataUnavailable`은 **어떤 상태 변경·저장도 일어나기 전에**
 *    반환된다: null을 0으로 바꾸지 않고, provisional 비용을 대입하지 않는다.
 *  - '선행 업그레이드 미충족' 등 미구현 기능의 사유는 코드·UI 어디에도 만들지
 *    않는다 (테크 트리 MVP 기각 — 스텁 금지 준용).
 *  - 저장 실패는 불가 사유가 아니라 트랜잭션 실패(saveFailedRolledBack)다.
 */
export type PurchaseDenialReason =
  | 'insufficientCredits'
  | 'insufficientRareParts'
  | 'maxLevelReached'
  | 'slotFull'
  | 'alreadyEquipped'
  | 'economyDataUnavailable';

/**
 * 트랜잭션 결과 — 성공 / 조건 불충족 / 저장 실패 롤백 [13차 결의 7].
 * 내부 예외 문자열을 담는 필드는 의도적으로 없다 — 오류 원인은 개발 로그로만
 * 남기고 UI에는 이 판별 결과만 전달한다.
 */
export type TransactionResult =
  | { readonly status: 'success' }
  | { readonly status: 'denied'; readonly reason: PurchaseDenialReason }
  | { readonly status: 'saveFailedRolledBack' };

/** 구매 비용 (판정 포트가 산출 — 가격 정의는 게임플레이·기획 소유) */
export interface PurchaseCost {
  readonly credits: number;
  readonly rareParts: number;
}

/**
 * 업그레이드 구매 판정 포트 — **내용은 게임플레이 소유** (틀=리드/내용=게임플레이
 * 경계, 14차 창 분할). 상태를 변경하지 않고 판정만 한다. throw 금지 —
 * 불가 사유 또는 null(가능)을 반환한다.
 */
export interface UpgradePurchaseJudgePort {
  evaluateUpgradePurchase(id: UpgradeStatId): {
    readonly denial: PurchaseDenialReason | null;
    readonly cost: PurchaseCost;
  };
}

/** 장비 변경 요청 — equip/replace(점유 슬롯 대상 equip)/unequip */
export type EquipmentChangeRequest =
  | {
      readonly kind: 'equip' | 'replace';
      readonly slotIndex: number;
      readonly equipmentId: EquipmentId;
    }
  | { readonly kind: 'unequip'; readonly slotIndex: number };

/**
 * 장비 변경 판정·적용 포트 [INT-CORE-010 개정] — 내용은 게임플레이
 * (EquipmentSystem) 소유.
 *
 *  - `applyEquipmentChange` = 판정+적용 결합: 불가 시 사유 반환·**무변경**,
 *    가능 시 적용 후 null. (실존 EquipmentSystem의 equip/replace/unequip
 *    형태와 1:1 — 무변경 사전 판정 API를 강요해 판정 로직을 복제하게 만들던
 *    구 evaluate/apply 분리를 폐기.)
 *  - **이 포트 구현은 저장하지 않는다** — 저장·롤백 순서는 리드
 *    EquipmentTransaction 소유 (저장 책임 표). EquipmentSystem의
 *    attachSavePort 내부 경로는 production에서 연결하지 않는다(이중 저장 금지).
 *  - snapshot/restore는 슬롯 위치를 보존하는 배열 형태 — 롤백 시 빈 슬롯
 *    위치까지 원복된다. 전부 throw 금지.
 */
export interface EquipmentChangeJudgePort {
  applyEquipmentChange(request: EquipmentChangeRequest): PurchaseDenialReason | null;
  snapshotSlots(): readonly (EquipmentId | null)[];
  restoreSlots(slots: readonly (EquipmentId | null)[]): void;
}

/** 지갑 트랜잭션 포트 — 구현은 MetaLoop(리드, 지갑 소유자) */
export interface WalletTransactionPort {
  snapshotWallet(): CurrencyBundle;
  /** 잔액 부족이면 false·무변경 (구매 가능 여부 재검증 겸용) */
  spendFromWallet(cost: PurchaseCost): boolean;
  restoreWallet(wallet: CurrencyBundle): void;
}

/** 업그레이드 단계 포트 — 구현은 UpgradeState(리드, 단계 보관자) */
export interface UpgradeLevelsPort {
  snapshotLevels(): Readonly<Record<string, number>>;
  /** 구매 확정 후보 적용 — 해당 항목 단계 +1 */
  applyPurchasedLevel(id: UpgradeStatId): void;
  restoreLevels(levels: Readonly<Record<string, number>>): void;
}

/**
 * 영속 저장 포트 — 구현(어댑터)은 빌드·툴 소유(SaveStore 경유).
 * 실패는 false 반환 — **throw 금지** (저장 실패가 게임 루프·부팅을 깨지 않는다).
 */
export interface SavePort {
  save(): boolean;
}

/* ── 기지 화면 포트 v2 (INT-CORE-010 — production UI의 유일한 진입점) ── */

/** 명령 결과 코드 — success / 판정 사유 6종 / 저장 실패 롤백 */
export type BaseCommandOutcome = 'success' | PurchaseDenialReason | 'saveFailedRolledBack';

/**
 * 출항 확정 결과 [INT-CORE-010].
 *  - departed: 출항 확정 직전 저장 성공 → 해역 전환
 *  - saveFailed: 저장 실패 — **해역 전환 없음** (기지 유지, 재시도 가능)
 *  - invalidState: 기지(BASE) 밖에서의 요청 — 무동작
 *  - economyDataUnavailable: 출항 전 필수 경제 검증 실패 시 예약 코드 —
 *    현 배선에서는 출항이 경제 데이터에 의존하지 않아 반환되지 않는다
 */
export type DepartureResult = 'departed' | 'saveFailed' | 'invalidState' | 'economyDataUnavailable';

/** 업그레이드 공식 카탈로그의 읽기 뷰 — 가격 미확정은 null (0 변환·발명 금지) */
export interface UpgradeCatalogItem {
  readonly id: UpgradeStatId;
  readonly label: string;
  readonly maxLevel: number;
  /** 현재 단계 기준 다음 단계 비용 — 최대 단계면 null(비용 없음), 미확정도 null.
   *  구분은 nextCostPending으로 한다 */
  readonly nextCost: PurchaseCost | null;
  /** true = 공식 경제 params 미확정(economyDataUnavailable 상태) — UI는 구매
   *  버튼을 비활성하고 '가격 데이터 대기'를 표시한다 */
  readonly nextCostPending: boolean;
}

/** 장비 공식 카탈로그의 읽기 뷰 */
export interface EquipmentCatalogItem {
  readonly id: EquipmentId;
  readonly label: string;
  /** 획득 비용 — 미확정 null (스프린트 A 장착·교체·해제는 비용 미적용) */
  readonly cost: PurchaseCost | null;
}

/** 마지막 명령 결과 — UI 결과 표시·검증용 (내부 예외 문자열 없음) */
export interface BaseScreenLastResult {
  readonly command: 'purchaseUpgrade' | 'equipItem' | 'replaceItem' | 'unequipItem' | 'confirmDeparture';
  readonly outcome: BaseCommandOutcome | DepartureResult;
}

/**
 * 기지 화면 소비 포트 v2 (스프린트 A production) — UI는 wallet·업그레이드
 * 상태·loadout·SaveStore를 **직접 수정하지 않고** 이 포트의 읽기 모델과
 * 명령만 사용한다. 구현은 composition root가 조립한다 (그래픽스 UI는 이
 * 계약 또는 그 구조적 부분집합만 소비).
 *
 * 저장 규칙: 명령 구현(트랜잭션·출항 command)이 SavePort를 직접 호출한다 —
 * **UI·이 포트가 별도 saveRequested 이벤트를 발행하지 않으며**, 동일 사용자
 * 명령으로 SavePort가 두 번 호출되지 않는다 (저장 책임 표 — INTERFACES).
 */
export interface BaseScreenPort {
  /** 실제 영구 지갑 (MetaLoop 실상태 — 사본·임시 지갑 아님) */
  readonly wallet: CurrencyBundle;
  /** 이번 출항에서 획득했지만 아직 정산되지 않은 크레딧 (파괴 시 손실 대상) */
  readonly sortieCreditsEarned: number;
  /** 이번 출항에서 획득한 희귀 부품 (획득 즉시 확정 — 표시 구분용) */
  readonly sortieRarePartsSecured: number;
  readonly upgradeCatalog: readonly UpgradeCatalogItem[];
  readonly upgradeLevels: Readonly<Record<string, number>>;
  readonly equipmentCatalog: readonly EquipmentCatalogItem[];
  readonly loadout: EquipmentLoadout;
  /** 기지(BASE) 상태에서만 true — 출항 명령 가능 여부 */
  readonly canLaunchSortie: boolean;
  readonly lastResult: BaseScreenLastResult | null;
  purchaseUpgrade(upgradeId: UpgradeStatId): BaseCommandOutcome;
  equipItem(equipmentId: EquipmentId, slotIndex: number): BaseCommandOutcome;
  replaceItem(equipmentId: EquipmentId, slotIndex: number): BaseCommandOutcome;
  unequipItem(slotIndex: number): BaseCommandOutcome;
  /** 출항 확정 — 확정 직전 저장(SavePort 1회) 성공 시에만 해역 전환 */
  confirmDeparture(): DepartureResult;
}
