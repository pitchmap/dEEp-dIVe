/**
 * 공식 런타임 params 소비 계약 (INT-CORE-011 — 스프린트 A 공식 경제 연결).
 *
 * ## OfficialRuntimeParams — 로드 1회·주입 전용
 *
 * production composition(`Game.composeSystems`)이 툴링 공식 로더를
 * **한 번만** 호출해 이 번들을 만들고, 필요한 시스템에 주입한다.
 *
 *  - 로더 정본: `src/tools/economyParams.loadEconomyParams()`(upgrades·
 *    equipment·economy·cargo 4파일 검증 묶음) + `src/tools/aimingParams.
 *    loadAimingParams()`. 타입도 툴링 검증기의 것을 그대로 쓴다 —
 *    여기서 타입을 재정의(복제)하지 않는다.
 *  - **금지**: 시스템·UI가 params JSON을 직접 import하거나 툴링 로더를
 *    직접 호출하는 것. 소비는 항상 composition root가 주입한 값으로만
 *    한다 (CLAUDE.md 규칙 6 — JSON → 시스템 단방향 주입).
 *  - 남은 provisional 파일(`provisionalEconomy`·`provisionalCargo` 등)은
 *    이 번들이 대체 공급원이다 — 각 소유 역할이 주입 경로로 교체한 뒤
 *    provisional 파일을 삭제한다.
 *
 * ## SalvagePlacementSource — 경제 params와 월드 좌표의 소유 분리
 *
 * 해저 재화(salvage) 배치는 두 데이터의 결합이다. 소유가 다르므로
 * 한쪽이 다른 쪽 값을 정의하지 않는다:
 *
 *  - **경제 params 소유** (`params/economy.json` → `economy.salvageSpawns`):
 *    spawnId·kind·dropTableId(→credits)·rarePartId(→rarePartCount).
 *  - **월드·그래픽스 소유** (이 파일의 `SalvagePlacementSource`):
 *    spawnId·worldPosition·(필요 시) orientation.
 *  - production composition이 동일한 `spawnId`로 양쪽을 결합한다
 *    (`composeSalvageSpawnPlan` — src/core/PveIntegration.ts).
 *
 * **금지**:
 *  - EconomySystem 내부에서 월드 좌표 하드코딩
 *  - 그래픽스가 credits·rareParts 값을 정의
 *  - Game.ts(조립부)가 임의 좌표 생성 — 그래픽스 배치가 없으면 임시
 *    좌표를 만들지 말고 **명확한 미연결(unwired) 상태**로 둔다
 *  - 존재하지 않는 spawnId 무시 — 한쪽에만 있는 spawnId는 **거부**한다
 *  - 같은 spawnId 중복 배치 — 어느 쪽이든 중복이면 **거부**한다
 *
 * ## Production spawn 규칙
 *
 *  - 출항 월드 초기화 시 salvage를 `economy.salvageSpawns` 전체
 *    (MVP: 3개 확정 배치)로 생성한다 — 확률 없음.
 *  - 같은 출항에서 중복 생성 금지 — 파괴(회수)된 salvage도 같은 출항
 *    중에는 다시 생성하지 않는다 (스포너의 출항당 1회 가드).
 *  - 새 출항 시 재생성 — 현행 MVP 루프 규칙(`resetSortieSession`이 드롭·
 *    salvage를 비우고 세션을 새로 시작)과 일치.
 *  - 보상(credits·rarePart)은 economy params에서만 파생, 좌표는
 *    SalvagePlacementSource에서만 파생.
 */

import type {
  CargoParams,
  EconomyParams,
  EquipmentCatalog,
  UpgradeEntry,
} from '../tools/economyMath';
import type { AimingParams as OfficialAimingParams } from '../tools/aimingMath';

/** composition root가 공식 로더 1회 호출로 만들어 주입하는 번들 */
export interface OfficialRuntimeParams {
  readonly upgrades: readonly UpgradeEntry[];
  readonly equipment: EquipmentCatalog;
  readonly economy: EconomyParams;
  readonly cargo: CargoParams;
  readonly aiming: OfficialAimingParams;
}

/** 월드 좌표 (월드·그래픽스 소유 — 경제 params에 좌표를 두지 않는다) */
export interface SalvageWorldPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** salvage 1개의 배치 — spawnId가 경제 params와의 결합 키다 */
export interface SalvagePlacement {
  readonly spawnId: string;
  readonly worldPosition: SalvageWorldPosition;
  /** 필요 시 시각 배치 방향 (Y축 요, 라디안) — 판정에는 쓰지 않는다 */
  readonly orientationYawRadians?: number;
}

/**
 * 월드·그래픽스가 제공하는 salvage 배치 소스.
 * `economy.salvageSpawns`의 모든 spawnId를 정확히 1개씩 커버해야 한다 —
 * 누락·중복·미지 spawnId는 결합 시 거부된다.
 */
export interface SalvagePlacementSource {
  readonly placements: readonly SalvagePlacement[];
}

/**
 * spawnId 결합 결과 1건 — 보상은 economy params에서, 좌표는 placement에서
 * 파생된 값이다. composition은 이 plan만 게임플레이 spawn 어댑터에 넘긴다.
 */
export interface SalvageSpawnPlanEntry {
  readonly spawnId: string;
  /** 게임플레이 SalvageKind와 동일 문자열 — 결합 시 검증된다 */
  readonly kind: 'chest' | 'container' | 'mineral';
  readonly dropTableId: string;
  /** economy.dropTables[dropTableId]에서 파생 */
  readonly credits: number;
  readonly rarePartId: string | null;
  /** rarePartId 지정 시 1 (MVP 확정 배치 — 확률·수량 스키마 없음) */
  readonly rarePartCount: number;
  readonly worldPosition: SalvageWorldPosition;
  readonly orientationYawRadians?: number;
}
