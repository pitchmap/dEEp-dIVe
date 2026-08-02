# ECONOMY_PARAMS_SCHEMA — `params/economy.json` 스키마

> 검증기 정본: `src/tools/economyMath.ts` (`validateEconomyParams`).
> 로더 정본: `src/tools/economyParams.ts` (`loadEconomyParams`).
> **시스템·UI는 JSON을 직접 import하지 않는다** — composition root가 주입한
> 값만 소비한다 (CLAUDE.md 규칙 6, 계약 `contracts/officialParams.ts`).

## 소유

| 영역 | 소유 |
|---|---|
| 수치 | 기획 (`params/` — `[Gx]`/`[ECON]` 태그 필수) |
| 스키마·검증기 | 빌드·툴 |
| 세력→드롭 테이블 **매핑** | 계약 `src/contracts/faction.ts` (`FACTION_RULES`) |
| salvage **좌표** | 월드·그래픽스 (`SalvagePlacementSource`) |

## null과 0의 구분 — 이 스키마의 핵심 규칙

| 표기 | 뜻 |
|---|---|
| 값 | 확정된 수치 |
| `0` | **확정된 0.** 그렇게 정했다 |
| `null` | **미확정.** 아직 모른다 — 0으로 확정하는 것도 결정이므로 하지 않는다 |

검증기는 이 구분을 강제한다. `pending` 정책에 `0`을 적으면 **로드를
거부**한다 — 미정이 무보상 확정으로 위장되는 것을 막는다.

## A 스프린트 블록 (승인 완료 — 미확정 0)

| 키 | 형태 | 설명 |
|---|---|---|
| `creditLossOnDestroyedRatio` | `{ value, range, unit, note }` | 파괴 시 손실률. 0~1 |
| `pickupRadiusMeters` | `{ value, unit, note }` | 드롭 자동 회수 반경 |
| `dropTables` | `{ [id]: { credits, rareParts } }` | 음수 거부, `rareParts` 정수 |
| `salvageSpawns` | `[{ spawnId, kind, dropTableId, rarePartId }]` | `spawnId` 중복·미존재 `dropTableId` 거부 |
| `sortieIncomeReference` | `{ cargoCredits, salvageCredits, totalCredits, rareParts }` | 회귀 방지용 기대값 |
| `bossReadinessReference` | `{ upgradeIds, upgradeLevel, equipmentIds, expectedSortieRange }` | 곡선 판정 입력 |

## B 스프린트 블록 (선행개발 — 15차 결의 1 발효 전)

### `factionRewards` — 세력별 보상 정책 [B3]

**매핑을 복제하지 않는다.** 세력→드롭 테이블 매핑의 정본은 계약이고,
이 블록은 **정책 상태**만 갖는다. 검증기가 둘의 일치를 기계적으로 대조하며,
어긋나면 로드를 거부한다.

```json
"factionRewards": {
  "hostile": { "policy": "dropTable" },
  "neutral": { "policy": "none", "credits": 0, "rareParts": 0 },
  "patrol":  { "policy": "pending" }
}
```

| policy | 계약 `dropTableId` | 수치 필드 | 뜻 |
|---|---|---|---|
| `dropTable` | non-null, `dropTables`에 실재 | **금지** (값은 `dropTables` 소유) | 공식 테이블로 보상 |
| `none` | `null` | `credits: 0`·`rareParts: 0` **필수** | 확정된 무보상 |
| `pending` | `null` | **금지** | 공식 결정 없음 |

거부 규칙:
- 계약과 정책 불일치 (양방향)
- `none`에 0이 아닌 값
- `pending`에 수치 필드 존재
- 계약(`meta.ts FactionId`)에 없는 세력 키 — 오타로 규칙이 조용히 무시되는 것을 막는다
- 세력 3종 중 누락

### `highValueTransport` — 고가치 수송선 [B6]

```json
"highValueTransport": {
  "archetypeId": "highValueTransport",
  "baseDropTableId": "cargo-standard",
  "rewardMultiplier": null,
  "rewardMultiplierRange": null,
  "escortMaximumDistanceMeters": null
}
```

| 키 | 규칙 |
|---|---|
| `baseDropTableId` | `dropTables`에 실재해야 함 |
| `rewardMultiplier` | `null` 또는 **1 초과**. 하한 1은 12차 B6 종료 조건 '고가치 보상 > 일반 수송선'에서 파생된 구조 조건이며 발명한 수치가 아니다 |
| `rewardMultiplierRange` | `null` 또는 `[최소, 최대]` (최소 ≤ 최대). 존재하면 `rewardMultiplier`가 범위 안이어야 함 |
| `escortMaximumDistanceMeters` | `null` 또는 비음수 |

**상한을 지어내지 않는다** — 범위가 함께 도착할 때만 검사한다.
현재 전 수치 `null` (제안: `docs/SPRINT_B_B6_PROPOSAL.md`).

블록 전체를 생략해도 로드된다(`null`) — B6 미확정이 B1~B5를 막지 않는다는
것을 스키마 수준에서 보장하며, `verify:sprint-b`의 `B6-independence`가
이를 단언한다.

### `guardSpawn` — 경비함 스폰 위치 [B4]

```json
"guardSpawn": {
  "minDistanceFromPlayerMeters": null,
  "maxDistanceFromIncidentMeters": null,
  "candidateCount": null,
  "worldBoundsPaddingMeters": null,
  "spawnRetryCount": null
}
```

전 항목 `null` 가능. 값이 있으면:

- 비음수. `candidateCount`·`spawnRetryCount`는 정수
- `minDistanceFromPlayerMeters > maxDistanceFromIncidentMeters` 거부
  (스폰 가능 영역이 공집합)

**현재 전 항목 미확정.** 저장소·회의록 어디에도 공식 수치가 없고, 승계할
기존 수상함 스폰 규칙도 없다. `guardSpawnParamsUsable()`이 전 항목 확정
전에는 `false`를 반환하므로, 위치 전략을 params만으로 구성했다고 보고하지
않는다 — 리드 결정 B-3(위치 전략 미연결 = `noSpawnLocation`, 임의 좌표
생성 금지)과 같은 태도다.

## 미확정 보고

```ts
pendingSprintBFields(economy)  // 미확정 필드 목록
guardSpawnParamsUsable(economy) // 스폰 params 사용 가능 여부
```

`verify:sprint-b`의 `B-pending`이 이 목록을 매 실행 출력한다 —
'수치를 발명하지 않았다'의 기계적 증거다.

## 확장 절차

1. 스키마 변경 제안을 `docs/INTEGRATION_NOTES.md`에 기록
2. 검증기(`economyMath.ts`)에 규칙 추가 — **거부 규칙을 먼저 쓴다**
3. `verify:sprint-a`/`verify:sprint-b`의 거부 규칙 테스트에 항목 추가
4. 수치 입력은 기획 승인 후, `[ECON]` 태그 커밋
