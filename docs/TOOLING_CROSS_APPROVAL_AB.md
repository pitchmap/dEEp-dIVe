# TOOLING_CROSS_APPROVAL_AB — A+B 통합 dev PR 툴링 공식 교차 승인

> 근거: 상설 규칙 3 (15차 결의 6) — **리드 창 병합은 빌드·툴 담당 교차 승인**.
> 이 문서는 빌드·툴 역할 브랜치의 기록이며, 통합 브랜치에는 아무것도
> 쓰지 않았다. 병합 여부는 통합 관리자가 결정한다.

## 검토 대상

| 항목 | 값 |
|---|---|
| 통합 브랜치 | `origin/claude/deep-dive-d5-gray-box-integration-tree5i` |
| 검토 커밋 | `3958ce4` |
| 검토 방식 | **읽기 전용** — 임시 worktree(detached `3958ce4`)에서 `npm ci` 후 전 검증 실행. 통합 브랜치에 커밋·수정 없음 |
| 승인자 | 빌드·툴 담당 (창 4) |
| 승인 시각 | 2026-08-01T16:17Z |

## 판정

```
툴링 공식 교차 승인 = 승인 (조건부 아님)
dev PR 게이트       = 생성 가능
치명적 blocker      = 0건
```

## 1. 경제 params 정합 — 전 항목 일치

통합 커밋의 `params/*.json`을 직접 파싱해 대조했다.

### Sprint A

| 항목 | 기대 | 실측 |
|---|---|---|
| 업그레이드 종수 | 7 | 7 ✅ |
| 단계별 가격 | `[100,160,240,340,460]` | 7항목 전부 일치 ✅ |
| 희귀 부품 | `[0,0,0,1,2]` | 7항목 전부 일치 ✅ |
| A군 누적 | 5/10/16/22/30% | `maxSpeed`·`turnRate`·`reloadSpeed`·`sonarRange` 4종 전부 ✅ |
| B군 누적 | 10/20/32/44/60% | `hullIntegrity`·`maxDepth`·`torpedoDamage` 3종 전부 ✅ |
| 장비 종수 / `slotCapacity` | 4 / 2 | 4 / 2 ✅ |
| `lossRate` | 0.5 | 0.5 ✅ |
| cargo 보상 | 120 | 120 ✅ |
| salvage 보상 | 60+40+25 | 60/40/25 = 125 ✅ |
| salvage 희귀 부품 | 1 | 1 (`rare-alloy-core`) ✅ |
| 최대 출항 수입 | 245 | 120+125 = 245 (참조값과 일치) ✅ |
| 공식 params null | 0 | upgrades·equipment·cargo·economy(A 범위) 전부 **0** ✅ |
| production provisional 경제 import | 0 | 경제 provisional 파일 **0개** · import **0건** ✅ |

### Sprint B

| 항목 | 기대 | 실측 |
|---|---|---|
| hostile drop table | `cargo-standard` | 계약 `FACTION_RULES.hostile` = `cargo-standard` ✅ |
| hostile 보상 | 120 | 120 (A 값 유지) ✅ |
| neutral drop table | null | 계약 null · policy `none` ✅ |
| neutral credits·rareParts·일반 drop | 0 | `credits 0` · `rareParts 0` · 결정적 검증에서 드롭 엔티티 0·지갑 전후 동일 ✅ |
| patrol policy | `pending` | `pending` ✅ |
| patrol 보상값 발명 | 없어야 함 | 수치 필드 **부재**(0조차 없음) · 계약 `dropTableId` null ✅ |
| highValue multiplier | null | null ✅ |
| escort distance | null | null ✅ |
| guard spawn tuning 공식값 | 없음 | 5항목 전부 null · `guardSpawnParamsUsable()` = false ✅ |
| 미확정값을 0으로 확정 | 없어야 함 | `pending`에 수치 삽입 시 로드 거부 규칙이 작동 중 ✅ |

**A 회귀:** B params 추가가 A 경제 곡선을 바꾸지 않았다. `verify:sprint-a`
자동 **30/30**, `B3-params`의 hostile 120 유지 단언도 통과.

## 2. 검증 결과 (통합 커밋 clean checkout)

| 명령 | 결과 |
|---|---|
| `npm ci` | ✅ 0 vulnerabilities |
| `typecheck` | ✅ |
| `build` | ✅ |
| `check:size` | ✅ 4.8% / 15MB |
| `check:scope` | ✅ 전 항목 상한 이내 |
| `verify:gameplay` | ✅ **213/213** |
| `verify:meta` | ✅ **88/88** |
| `verify:tooling` | ✅ **26/26** |
| `verify:hud` | ✅ **34/34** (페이지 오류 없음) |
| `verify:sprint-a` | ✅ 자동 **30/30** (수동 5건은 브라우저 실측으로 해소됨) |
| `verify:sprint-b` | ✅ 자동 **23/23** · 보류 1 · **차단 0** · 대기 4 |

## 3. 툴링 소유 파일에 대한 타 창 변경 — 검토 결과 승인

통합 창이 툴링 소유 파일 2곳을 수정했다. 둘 다 검토했고 **정직성 규율을
유지한다고 판단**한다.

### `93abe3e` — `verify:sprint-b` B4-port 정규화

`B4-port`가 관측 없이 `blocked`로 하드코딩돼 있던 것을 정적 관측으로 바꿨다.
승인 근거:

- `guardSpawnWiring` 입력이 **선택 필드**이고, 넘기지 않으면 이전처럼
  `blocked`로 남는다 — 관측 없이 통과로 바뀌는 경로가 없다.
- `attachLocationStrategy(null)`·`create: () => null` 더미를 **미연결로
  센다** — 자리만 있는 배선을 통과로 세지 않는다.
- 세 조건을 모두 충족해야 pass이며, "실제 개체 생성·이동은 브라우저 실측
  항목"임을 detail에 명시했다.

### `9bd6c52` — DEV 전용 디버그 핸들 (`src/core/Game.ts`)

- `import.meta.env.DEV` 가드 안에만 있고, **production 번들에
  `__deepDiveDebug` 문자열 0건**(빌드 후 `dist` grep으로 직접 확인).
- 목록을 getter로 노출해 스폰 이후 상태를 관측 가능하게 한 것은 타당하다.
- 읽기 전용 핸들이며 판정 경로에 개입하지 않는다.

## 4. pending·미완주 항목 판정

### B6 실기동 pending — B_CORE_COMPLETE 실패 아님

15차 결의 1·3에 따라 B6은 **병렬 최종 조건**이며 핵심 게이트(B1~B5)가 아니다.
`B6-independence`가 `highValueTransport` 블록을 통째로 제거해도 B1~B5 관련
스키마·정책이 성립함을 기계적으로 단언한다. 배율·이탈 거리는 공식 수치가
없어 null 유지가 정상이다 (제안: `docs/SPRINT_B_B6_PROPOSAL.md`).

### B7 empirical pending — B_CORE_COMPLETE 실패 아님

측정은 사람이 플레이해야 나온다. 인프라(스키마·수집기·집계·판정·export)는
전부 자동 검증 통과. 현재 실측 표본 = 테스터 0명 · 유효 기회 0회 →
`INSUFFICIENT_SAMPLE`. **비율을 판정에 쓰지 않는다.**

### patrol 보상 정책 pending — 정상

계약과 params가 **둘 다** 미결정이고 서로 일치한다. 검증기가 양방향 대조를
하므로 한쪽만 바꾸면 로드가 거부된다. 수치 발명 없음이 기계적으로 보장된다.

### salvage 125 credits + rarePart 1 브라우저 미완주 — known limitation으로 기록

**브라우저 통과로 위장하지 않는다.** 판단 근거:

1. 결정적 검증이 **같은 보상값**을 단언한다 —
   `verify:gameplay`: "salvage 총 보상 = 경제 params 파생 125 크레딧 +
   희귀 부품 1개 — credits=125/125, parts=rare-alloy-core".
   배치 3종·중복 방지·픽업 반경 6m·수송선 120도 같은 스위트가 덮는다.
2. **코드 경로가 production이다** — `Game.composeSystems`에서
   `SortieSalvageSpawner`가 `official.economy`와
   `STARTING_AREA_SALVAGE_PLACEMENTS`를 `spawnId`로 결합해
   `gameplay.spawnSalvageFromPlan`을 호출한다. 검증 경로와 브라우저 경로가
   같은 코드다.
3. 미완주 사유가 기록돼 있다 — 어뢰 재장전 20초 × 반복 접근으로 시간 초과.
   통합 문서가 "브라우저 실측 항목으로는 미확인으로 남긴다"고 명기했다.

→ **known limitation.** 자동 검증과 코드 경로가 정상이므로 PR blocker가
아니다. 다음 브라우저 회차의 잔여 항목으로 남긴다.

## 5. 비차단 관찰 (PR blocker 아님 — 후속 처리 권고)

### ① `SubmarineAimSystem`이 공식 aiming 로더 값을 받지 않는다

`Game.ts:260`이 `loadAimingParams()`를 호출해 `officialParams.aiming`을
만들지만, `GameplaySystems.ts:278`의 `new SubmarineAimSystem(bus, player,
torpedo)`는 params 인자를 넘기지 않아 기본값 `PROVISIONAL_AIMING_PARAMS`를
쓴다.

- **현재 값 차이는 없다** — 양쪽 다 15/10/15/0.5로 동일하다.
- **위험은 잠재적이다** — `params/aiming.json`을 수정해도 조준 시스템이
  따라오지 않고, HMR도 도달하지 않는다. 지금은 무해하지만 튜닝이 시작되면
  조용히 어긋난다.
- A8의 이관 범위는 **경제·장비**이므로 A8 판정에는 영향이 없다.
- 게임플레이가 `src/systems/economy/pendingOfficialData.ts`에 이미 미결
  항목으로 기록해 두었다 — 은폐가 아니라 추적 중인 항목이다.

→ 게임플레이 창 후속 항목. 인자 한 줄 주입으로 해소된다.

### ② 경비 스폰 위치 전략이 공식 params 없이 기존 값에서 파생한다

`CanyonPatrolSpawnLocation`은 `guardSpawn` params가 전부 null인 상태에서
**기존 공식 값에서만 파생**한다(어뢰 유효 사거리, cargo `hitRadius`,
`SUBMARINE_HULL_RADIUS`, `CanyonLayout.seaSurfaceY`, 충돌 월드 질의).
후보 개수 12·거리 배수 `[1, 0.75, 0.5]`는 밸런스 수치가 아니라 탐색
알고리즘 상수로 명시돼 있고, `attachGuardSpawnParams` 주입구가 준비돼 있다.

→ **수치 발명 없음** — 승인한다. 다만 공식 `guardSpawn` params가 도착하면
이 파생을 대체해야 하며, 그때까지 스폰 거리는 "정해진 값"이 아니라
"파생된 값"임을 기획이 인지해야 한다.

### ③ `docs/SPRINT_B_ACCEPTANCE.md`에 폐기된 판정이 남아 있다

같은 문서 안에 두 판정이 공존한다:

| 위치 | 내용 |
|---|---|
| §"현재 판정 (툴링 창 로컬)" | `차단 2` · `B5_BLOCKED_NO_DESTROYER_IMPLEMENTATION` · "B5 차단 — 상세" 절 |
| §"A+B 최종 기술 통합 판정" | `B_CORE_COMPLETE = true` · B5 실측 통과 |

앞의 것은 **내가 쓴 구 스냅샷**이고 제목에 "툴링 창 로컬 — 미병합"이라는
범위 한정이 있긴 하지만, 제목의 "**현재** 판정"이라는 표현과 `차단 2`가
남아 있어 읽는 순서에 따라 상반된 결론을 준다.
`SPRINT_A_ACCEPTANCE.md`에는 있는 우선순위 문장("이 표가 현행 판정이다 …
서로 어긋나면 이 표를 따른다")이 B 문서에는 없다.

→ **문서 결함이며 코드·판정 결함이 아니다.** dev PR이 제시할 인수 기록의
가독성 문제이므로, 통합 관리자가 자기 사본에서 ⓐ 구 절의 제목을 "구 회차
기록(폐기)"으로 바꾸거나 ⓑ A 문서와 같은 우선순위 문장을 추가하기를 권고한다.
툴링 창은 통합 브랜치를 수정하지 않으므로 여기서 고치지 않았다.

## 6. B5 규칙 개정에 대한 확인

B5의 원 조건은 12차 결의 3의 "경비함 = 기존 구축함 AI 재사용 (신규 AI 코드
0)"이었다. production `DestroyerAI` 구현체가 0개임이 확인되어, 리드가 15차
diff-only 절차로 규칙을 개정했다 (`DECISIONS.md` B-3 [개정 확정],
INTEGRATION_NOTES INT-CORE-013): **범용 production 구현 정확히 1개**를
신설하고 경비함·일반 적대 구축함이 같은 구현체를 소비한다.

툴링 검토 결과:

- `DestroyerAIController`는 경비 전용이 아니다 — 세력·초기 표적만 주입받는
  범용 구현이며, 탐지·폭뢰·내구도(C 범위)를 포함하지 않는다.
- 경비 전용 `GuardAI`·`GuardBehavior`·`GuardStateMachine`은 **계속 0건**
  (`B5-noNewAi` 정적 스캔).
- 검증 더블의 production 사용 0건.
- 개정의 취지(신규 AI를 하나로 묶어 복사·분화를 막는다)가 유지된다.

→ 개정 절차와 결과 모두 **승인**한다. 다만 이 개정은 상위 결의(12차)의
문구를 바꾼 것이므로, dev PR 본문에 개정 사실과 근거(INT-CORE-013)를
명시해 리뷰어가 원 조건과의 차이를 알 수 있게 할 것을 권고한다.

## 7. 결론

| 게이트 | 판정 |
|---|---|
| 툴링 공식 교차 승인 | ✅ **승인** |
| 경제 params 정합 | ✅ A·B 전 항목 일치 |
| A 회귀 | ✅ 무변경 (`verify:sprint-a` 30/30) |
| B1~B5 | ✅ 자동 23/23 · 차단 0 · 브라우저 실측 통과 |
| B6 pending | 허용 (병렬 최종 조건 — 핵심 게이트 아님) |
| B7 empirical pending | 허용 (인프라 완비 · 실측만 대기) |
| salvage 브라우저 미완주 | known limitation (결정적 검증이 같은 값을 덮고 코드 경로 동일) |
| 치명적 blocker | **0건** |
| **dev PR 게이트** | ✅ **생성 가능** |

남은 리스크는 전부 후속 항목이며 PR 생성을 막지 않는다:
aiming 로더 미주입(값 차이 없음·추적 중), guard spawn 파생값(공식 params
도착 시 대체), B 문서의 구 판정 잔존(가독성), B6·B7 pending(설계상 허용).
