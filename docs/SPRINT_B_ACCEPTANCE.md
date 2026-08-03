# SPRINT_B_ACCEPTANCE — 스프린트 B 인수 기준과 현재 상태

> 근거: 7차 대회의(`meetings/12`) 결의 3 종료 조건표 / 개발 소회의(`meetings/13`)
> 결의 10 / B·C 실행 체제(`meetings/15`) 결의 1~3 / 리드 계약 INT-CORE-012.
> 실행: `npm run verify:sprint-b`.

## B는 아직 발효되지 않았다

15차 결의 1: **B 범위표 발효 조건 = A 통합 PR 병합.** 이 문서와 러너는
발효 전 **선행개발**의 상태 기록이다. 러너가 전부 초록이어도 B 완료 선언이
되지 않으며, dev·main 병합의 근거도 되지 않는다.

발효 시에는 서면 발효 확인(각 창 주인이 변경 필요 여부 제출)을 거치고,
'있음'일 때만 diff 한정 소회의를 연다.

## 종료 조건 B1~B7 [12차 결의 3]

| ID | 조건 |
|---|---|
| B1 | 적대·중립 선박이 실제 월드에 동시 배치 |
| B2 | 조준경 식별 태그로 적대·중립 구분 가능 |
| B3 | 중립 선박 격침 시 크레딧 **미지급** 검증 |
| B4 | 중립 공격 시 경비함 실제 스폰 |
| B5 | 경비함 = 기존 구축함 AI 재사용 확인 (신규 AI 코드 0) |
| B6 | 고가치 수송선 격침 보상 > 일반 수송선 (배율은 튜닝표) |
| B7 | 테스트 세션에서 적대·중립 오인 사격률 측정 기록 존재 |

B1~B5가 핵심 게이트(= C 착수 방아쇠), B6·B7이 병렬 최종 조건이다.

## 판정 상태 5종

러너는 상태를 다섯으로 나눈다. **빈 코드를 가짜 pass로 만들지 않기 위한
구분**이며, 특히 `manual`과 `blocked`를 섞지 않는다.

| 상태 | 뜻 | 종료 코드 |
|---|---|---|
| `pass` | 실제 코드·데이터를 관측해 통과 | 0 |
| `fail` | 관측했고 규칙 위반 — **툴링이 고쳐야 하는 실패** | 1 |
| `manual` | 타 창 산출물 미병합 → 판정 보류 ('오면 통과할 것') | 0 |
| `blocked` | 선행 구현 자체가 없음 → 통과 불가 ('아무도 아직 안 만들었다') | 0 |
| `pending` | 공식 수치·실측 데이터 대기 | 0 |

## 현재 판정 (툴링 창 로컬 — 게임플레이·그래픽스 미병합)

자동 **17/17 통과** · 보류 5 · 차단 2 · 대기 4.

| 항목 | 상태 | 근거 |
|---|---|---|
| B1 세력 계약 (정본·guard 별칭·object 분리) | ✅ 자동 | 세력 3종, `guard` 별칭 없음, `object`는 `CombatTargetClass`로 분리 |
| B1 적대·중립 동시 배치 | ◻ 보류 | production에 `hostile`만 2지점(`CargoShipSystem`). 중립 선박 정의·배치는 **게임플레이 창** 소유 |
| B2 식별 상태·라벨 키 규격 | ✅ 자동 | 미식별 시 세력·라벨 비노출 규칙 고정 |
| B2 `ShipIdentificationSource` 구현 | ◻ 보류 | 계약만 병합됨. 판정측 = 게임플레이, 태그 UI = 그래픽스 |
| B2 세력 추측 금지 | ✅ 자동 | 렌더·UI의 세력 문자열 직접 분기 **0건** (정적 스캔) |
| B3 계약 보상 규칙 | ✅ 자동 | hostile=`cargo-standard` / neutral=null(지갑 불변) / patrol=null(미결정) |
| B3 params 정책 일치·null과 0 구분 | ✅ 자동 | hostile=dropTable(120 유지) · neutral=none(확정 0) · patrol=pending(값 없음) |
| B3 검증기 거부 규칙 | ✅ 자동 | 11종 (미존재 테이블·음수·계약 불일치·미정을 0으로 위장 등) |
| B4 `neutralShipHit` 발행 | ◻ 보류 | production 발행 0건 — 유효 피해 판정은 **게임플레이 창** |
| B4 중복 방지 | ◻ 보류 | 원장·경계는 **리드 소유**, `verify:meta` 77항목이 결정적 검증. 중복 검증하지 않음 |
| B4 실제 guard entity 생성 | ⛔ 차단 | 위치 전략 미연결(`noSpawnLocation`) + AI 팩토리 미연결(`spawnFailed`) |
| B5 구축함 AI 구현 존재 | ⛔ **차단** | `B5_BLOCKED_NO_DESTROYER_IMPLEMENTATION` |
| B5 어댑터 형태 | ✅ 자동 | 초기 태도 `alert` · 세력 `patrol` · 판단 로직은 기존 AI 소유 |
| B5 신규 경비 AI 0 | ✅ 자동 | 전용 상태 머신·공격 루틴·복사본 **0건** (정적 스캔) |
| B6 배율 소비 | ⏳ 대기 | 공식 수치 없음 — `docs/SPRINT_B_B6_PROPOSAL.md` |
| B6 호위 이탈 거리 | ⏳ 대기 | 공식 수치 없음 — null 유지 |
| B6 독립성 | ✅ 자동 | B6 블록 제거해도 B1~B5 스키마·정책 무영향 |
| B7 로깅 스키마 | ✅ 자동 | 8항목 + 분류 정합성 + 개인정보 거부 11종 |
| B7 조작 실수 인정 | ✅ 자동 | 근거 2종 인정 / 1종 거부 / 중복 위장 거부 |
| B7 계산식 | ✅ 자동 | 유효 60 · 오인 6 → 10.0%, 제외 9건이 분모에서 빠짐 |
| B7 판정 임계 | ✅ 자동 | 25%→`REINFORCE_VISUALS`, 2%→`RELAXATION_CANDIDATE` |
| B7 표본 미달 처리 | ✅ 자동 | 3명/12회 → `INSUFFICIENT_SAMPLE` (참고값 25.0%는 판정 미사용) |
| B7 수집기 | ✅ 자동 | 저장·복원·거부 보존·재심사 대체 |
| B7 내보내기 | ✅ 자동 | CSV 70행 · JSON `schemaVersion` 1 (집계 동봉) |
| B7 실측 기록 | ⏳ **empirical pending** | 테스터 0명 · 유효 기회 0회 |

## B5 차단 — 상세

**`B5_BLOCKED_NO_DESTROYER_IMPLEMENTATION`**

저장소에 `DestroyerAI` **계약은 있으나 production 구현체가 없다**
(`implements DestroyerAI` 정적 스캔 0건. `verifyMeta.ts`의 것은 어댑터
검증용 테스트 대역이며 재사용 원본이 아니다).

B5의 조건은 '경비함 = 기존 구축함 AI 재사용'이다. 재사용할 원본이 없으면
조건이 성립할 수 없다. 어댑터(`GuardShipAdapter`)는 리드가 이미 만들었고
팩토리 한 줄로 연결되도록 돼 있지만, **비어 있는 어댑터를 통과로 만들지
않는다** — 그렇게 하면 B5의 존재 이유(신규 AI 코드 0을 구조로 보장)가
사라진다.

구축함 AI 구현은 리드 소유이며, 계약 `guard.ts` 주석에 따르면 스프린트 C
탐지·추적과 함께 오는 항목이다. **B5는 그 구현이 도착해야 판정 가능하다.**

## B7 — empirical pending

측정은 사람이 플레이해야 나온다. 이 창에서 준비한 것과 남은 것:

| 준비 완료 (툴링) | 남은 것 |
|---|---|
| 로깅 스키마·검증기 | 실제 측정 세션 (기획 주관 — 테스터 섭외·인터뷰) |
| 세션 수집기(저장·복원·재심사) | 최종 A+B 통합 브라우저 빌드 |
| 집계·계산식·제외 규칙 | B2 태그 UI 병합 (태그가 없으면 유효 기회가 성립하지 않는다) |
| 판정 임계·표본 미달 처리 | |
| CSV·JSON 내보내기 | |

15차 결의 3에 따라 B7은 C 기간 중 **빌드·툴 창의 병렬 슬롯**(주당 20% 상한,
몰아 쓰기 허용)에서 운영한다. 세션 일정은 기획이 병렬 슬롯 데이에 맞춘다.

현재 실측 표본 = 테스터 0명 · 유효 기회 0회 → `INSUFFICIENT_SAMPLE`.
비율을 계산해 보고하는 것 자체가 금지는 아니지만, **합격·실패 판정에는
쓰지 않는다.**

## 범위 밖 (이 스프린트에서 다루지 않음)

C params(탐지·폭뢰·내구도·침수) / 보스 경제 / 평판·도덕성 페널티 /
추적 상태 머신 확장. C9 `[COMBAT]` 파이프라인은 C 발효 후 항목이다.

---

## A+B 최종 기술 통합 판정 (통합 관리자 창 — 실제 병합·브라우저 실측 후)

> 판정은 통합 브랜치 실제 빌드에서만 한다 (상설 규칙 4).
> 절차·충돌·배선은 `docs/SPRINT_A_INTEGRATION_MANIFEST.md` §AB.
> **B는 여전히 공식 발효 전이다** — 발효 조건은 A 통합 PR 병합(15차 결의 1)이며
> 이 회차는 그 PR을 만들 수 있는지 판정하는 단계다.

### 병합된 역할 tip (원격 실측 = 보고값 일치)

| 역할 | tip | 병합 커밋 |
|---|---|---|
| 개발 리드 | `5b443d5` (B5 계약 `b8ade9e` · production DestroyerAI `c4026f1` 포함) | `c738316` |
| 게임플레이 | `a48dce5` | `480a99f` |
| 그래픽스 | `cc09fb9` | `4ca4f03` |
| 빌드·툴 | `2757a48` | `63a2549` |

### 자동 검증 (A+B 통합 빌드)

| 검사 | 결과 |
|---|---|
| `npm ci` / `typecheck` / `build` | ✅ / ✅ / ✅ |
| `check:size` / `check:scope` | ✅ 4.8% / ✅ |
| `verify:gameplay` | ✅ **213/213** |
| `verify:meta` | ✅ **88/88** |
| `verify:tooling` | ✅ **26/26** |
| `verify:hud` | ✅ **34/34** |
| `verify:sprint-a` | ✅ 자동 전 항목 |
| `verify:sprint-b` | ✅ **자동 23/23** · 보류 1 · 차단 **0** · 대기 4 |

`B4-port`는 관측 없이 `blocked`로 하드코딩돼 있던 항목이다. 조립 배선이
실제로 생겼으므로 **정적 관측 항목으로 정규화**했다 — 관측 결과가 없으면
여전히 `blocked`이며, 실제 개체 생성·이동은 아래 브라우저 실측이 판정한다.

### B1~B5 — production 브라우저 실측

> 실행 URL `http://localhost:5173/` · 쿼리 플래그 없음 · `?bdemo` fixture 미장착
> (`scene.sprintBFixture === null` 확인). 조작은 production 입력만:
> 캔버스 클릭(Pointer Lock) → WASD 항법 → Ctrl/Shift 심도 → 우클릭 조준 →
> 좌클릭 발사. 관측은 읽기 전용 디버그 핸들(실제 인스턴스).

**B1 적대·중립 동시 배치 — ✅ 통과**

| 항목 | 실측 |
|---|---|
| 같은 출항의 선박 | `id=1 hostile (x −29.4, y 12, z −40)` · `id=2 neutral (x −29.4, y 12, z −20)` |
| 사건 전 patrol | **0척** |
| 세력 값 | 공식 `FactionId` (`hostile`/`neutral`) |
| 렌더 변형 = 실제 faction | `id=1 → hostile 변형(삼각 마크·포탑 2)` · `id=2 → neutral 변형(사각 마크·포탑 0)` |
| 세력 추측 경로 | 없음 — 변형 선택은 `ShipWorldView.faction` 값만 소비 |

**B2 식별 태그 — ✅ 통과**

| 항목 | 실측 |
|---|---|
| 조준 전 | 두 표적 모두 `identificationState='unidentified'` · `displayLabelId=null` (세력 문자열 미노출) |
| 조준 후 적대 | `state='hostile'` · `label='faction.hostile'` · 41m |
| 조준 후 중립 | `state='neutral'` · `label='faction.neutral'` · 23m |
| 경비함 | `state='patrol'` (스폰 후) |
| 화면 태그 실제 렌더 | `"▲ \| 적대 · 적대 함선 \| 41m · ◎ 조준 가능"` · `"■ \| 중립 · 민간 선박 \| 23m · ◎ 조준 가능"` |
| 색 외 구분 | 기호(▲/■/◆) + 문구 + 거리 — **색에 의존하지 않는다** |
| 파괴된 표적 | 격침 후 `state='unidentified'`·`isAlive=false`로 태그 제거 |

**B3 faction-aware 보상 — ✅ 통과**

| 세력 | 실측 |
|---|---|
| hostile 격침 | 출항 재화 `0 → 120` · `lootDropped {source:'cargoShip', credits:120, rareParts:0}` |
| neutral 격침 | 지갑 `1900 → 1900` · 출항 재화 `0 → 0` · 드롭 엔티티 `0 → 0` · `lootDropped` **0건** |
| patrol | 공식 정책 `pending` — 보상 지급 경로 없음, 임의 값 미부여 |

**B4 중립 공격 → 경비 요청 — ✅ 통과**

| 항목 | 실측 |
|---|---|
| 조준만으로 발행 | `neutralShipHit` **0건** |
| 유효 피해 시 발행 | **1건** · `damageAmount=1` · `targetFaction='neutral'` |
| 상관 id | `attackCorrelationId="torpedo:1"` (실제 어뢰 id) |
| `guardShipRequested` | **1건** · `requestId="torpedo:1"`(동일) · `requestedFaction='patrol'` |
| 원장 | 요청 1 · 스폰 1 |
| 중복 | 동일 requestId 재처리 → `duplicateRequest`, 경비함 1척 유지 |

경로 확인: `neutralShipHit` → `GuardIncidentLedger` → `guardShipRequested`
→ `GuardSpawnLocationStrategy` → `GuardShipAdapter` → 실제 개체.

**B5 실제 경비함 생성·이동 — ✅ 통과**

| 항목 | 실측 |
|---|---|
| 스폰 결과 | `spawned` (noSpawnLocation·spawnFailed 아님) · 경비함 **1척** |
| 세력 | `patrol` · `entityId=8000` |
| 초기 표적 | `initialTargetEntityId=-1` = `PLAYER_ENTITY_ID` · AI `currentTargetEntityId=-1` |
| spawnPosition 보존 | `{x 28.29, z −39.99, heading 2.094}` — 핸들 값 그대로 |
| 수면 유지 | `y=12` (해수면), 6초 후에도 `y=12` |
| 이동 | 플레이어와의 수평 거리 `30.00 → 5.80` (Δ **−24.20 m**) · AI state `attack` |
| 월드 bounds | 이탈 없음 |
| 렌더 source 등록 | `shipWorldSource`에 `patrol` 포함 |
| 식별 소스 등록 | `patrol` 태그 표시 |
| 방향 마커 | 노드 1개 · `"➤ 경비함 접근 47m"` — **실제 spawnPosition 기준** |
| 같은 공격에서 | 경비함 **1척만** |

정적 확인: production `DestroyerAI` 구현체 **정확히 1개**
(`src/core/DestroyerAIController.ts`) · Guard 전용 AI 코어 **0개** ·
검증 더블 production import **0건** · `CargoShipSystem` 위장 없음 ·
C(탐지·폭뢰·내구도·침수) 참조 **0건** — `verify:meta` 88/88에 포함.

### 출항 경계 reset — ✅ 통과

새 출항에서 경비함 0척 · 원장 요청 0/스폰 0 · salvage 3개 재생성 ·
선박 2척 생존 복구. 과거 requestId가 새 출항의 정상 사건을 막지 않는다.

### B6 — 구조 준비 / 실기동 보류

| 항목 | 상태 |
|---|---|
| `highValueTransport` archetype · `EscortBinding` · 렌더 배지·결속선 · engagement adapter | ✅ **구조 존재** |
| 공식 `rewardMultiplier` | ⏳ **null** — 승인 수치 없음 |
| 공식 `escortMaximumDistanceMeters` | ⏳ **null** |
| 실제 호위 기동 | ⛔ **미완료** |
| production 강제 생성 | 하지 않음 — 공식 params가 없으므로 목록이 비어 있고 배지·결속선도 표시되지 않는다 |

**B6 최종 완료 = false.** 툴링 제안의 배율(`docs/SPRINT_B_B6_PROPOSAL.md`)은
승인된 공식 수치가 아니므로 `params/economy.json`에 입력하지 않았다.

### B7 — 도구 완비 / 실측 pending

| 항목 | 상태 |
|---|---|
| 로깅 스키마 8항목 + 분류 정합성 + 개인정보 거부 11종 | ✅ |
| `anonymousTesterId` 외 개인정보 필드 없음 (이메일·전화·이름 형태 거부) | ✅ |
| `opportunityId` 중복 처리 | ✅ |
| `inputMistake` 근거 2종 이상일 때만 인정 | ✅ |
| `intentionalNeutralAttack`·`invalidOpportunity`·태그 노출 전 발사 분모 제외 | ✅ |
| 분자 = `misidentification` / 분모 = `correct + misidentification` | ✅ |
| 최소 테스터 5명 · 유효 기회 50회 미만 → `INSUFFICIENT_SAMPLE` | ✅ |
| CSV·JSON export | ✅ (CSV 70행 · JSON `schemaVersion` 1) |
| **실제 표본** | ⏳ 테스터 **0명** · 유효 기회 **0회** |

```
B7 empirical status = pending
B7 final pass/fail   = not evaluated
```

합성 fixture는 집계 알고리즘 검증용이며 **실측 결과로 쓰지 않았다.**

**`IdentificationExposureSink` production 미주입 — 의도된 결정.**
기록 1건에는 `anonymousTesterId`·`playerDecision`·`resultClassification`
(사람의 판단·인터뷰 결과)이 **필수**다. 노출 신호만 수집해서는 측정이
성립하지 않으므로, 일반 플레이에서 수집만 켜는 배선을 하지 않았다
(불필요한 로그 수집 금지). 측정 세션은 15차 결의 3에 따라 C 기간 중
빌드·툴 창 병렬 슬롯에서 기획 주관으로 운영한다.

### A 스프린트 회귀 (A+B 통합 빌드)

| 항목 | 실측 |
|---|---|
| BASE에서 시작 | ✅ `metaState='BASE'`, 자동 출항 없음 |
| EconomyHud | ✅ `"확정 자산 — 크레딧 0 · 희귀 부품 0"` |
| Upgrade UI 7종 / Equipment UI 4종 | ✅ / ✅ |
| 공식 가격 표시 | ✅ 1단계 `{credits:100, rareParts:0}` |
| 출항 버튼 | ✅ 1개 (기지 화면) |
| 구매 | ✅ `success` · 2000→1900 · 단계 1 · **저장 1회** |
| 장비 장착·교체·해제·재장착 | ✅ 전부 `success` · 슬롯1 `fastTorpedo→heavyTorpedo→null→fastTorpedo` |
| 저장 실패 rollback | ✅ `saveFailedRolledBack` · 크레딧·단계 무변경 |
| 출항 저장 실패 → 기지 유지 | ✅ `saveFailed` · `metaState='BASE'` |
| 새로고침 복원 | ✅ 단계 1 유지 · 슬롯 `["standardTorpedo","fastTorpedo"]` 유지 |
| 명시적 빈 loadout 유지 | ✅ `[null,null]` → 새로고침 후 `[null,null]` |
| salvage 3종 배치 | ✅ `salvage-1/2/3` · 중복 생성 없음 |
| hostile cargo 보상 | ✅ 120 |

**salvage 회수 보상(총 125 크레딧 + 희귀 부품 1) 실측 — 미실시.** 배치·중복
방지·보상 파생은 브라우저에서 확인했으나, 3종을 실제로 파괴·회수하는
브라우저 시나리오는 어뢰 재장전 20초 × 반복 접근으로 시간이 과도해 이번
회차에서 완주하지 못했다. 해당 수치는 `verify:gameplay`의 결정적 검증
('salvage 총 보상 = 경제 params 파생 125 크레딧 + 희귀 부품 1개')이 덮고 있으며,
`A8-income`의 출항 최대 수입 245(=120+125) 전제도 같은 경로로 확인된다.
**브라우저 실측 항목으로는 미확인으로 남긴다.**

### 판정

```
B_CORE_COMPLETE   = true    (B1·B2·B3·B4·B5 전부 production 실측 통과)
B_FINAL_COMPLETE  = false   (B6 실기동 미완 · B7 실측 pending)
C 기술 선행개발    = 가능    (15차 결의 1: C 발효 조건 = B1~B5 통과)
C 공식 발효        = 불가    (A 통합 PR 미병합)
B 공식 발효        = 불가    (발효 조건 = A 통합 PR 병합 — 아직 없음)
```

B6·B7 pending은 B1~B5 실패가 아니다 (15차 결의 1·3: 병렬 최종 조건).

### 브라우저 증거 (스크린샷 — `docs/screenshots/`)

| 파일 | 내용 |
|---|---|
| `sprintAB_base_ui.png` | 기지 화면 — EconomyHud·업그레이드 7·장비 4·출항 버튼 |
| `sprintAB_upgrade_purchase.png` | 업그레이드 구매 직후 |
| `sprintAB_equipment.png` | 장비 장착·교체·해제 |
| `sprintAB_hostile_neutral.png` | 적대·중립 동시 배치 |
| `sprintAB_tag_hostile.png` · `sprintAB_tag_neutral.png` | 식별 태그 (적대/중립) |
| `sprintAB_neutral_hit.png` | 중립 유효 피격 |
| `sprintAB_neutral_no_reward.png` | 중립 격침 — 보상 0 |
| `sprintAB_guard_spawn.png` | 경비함 실제 스폰 |
| `sprintAB_guard_direction.png` | 등장 방향 마커 |
| `sprintAB_tag_patrol.png` | 경비함 식별 태그 |
| `sprintAB_guard_moving.png` | 경비함 접근 이동 |
| `sprintAB_hostile_reward.png` | 적대 격침 — 120 |
| `sprintAB_aim_surface.png` · `sprintAB_aim_cruise.png` · `sprintAB_aim_deep.png` | 3심도 조준 회귀 |

`sprintAB_salvage_rewards.png`는 위 사유(회수 시나리오 미완주)로 없다.
