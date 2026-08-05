# DECISIONS — 현재 유효한 핵심 결정

> 이 문서는 리드만 갱신한다. 근거·상세: `docs/deep_dive_master_plan.md`(버티컬
> 슬라이스 트랙 — D+21 게이트 4문 통과로 완료) + 회의록 10·11(PvE 정식 제작
> 트랙 — 현재 트랙). 충돌 시 최신 PvE 결의가 우선하며, 아래 표의 [PvE 개정]
> 표기가 그 반영이다.

## PvE 정식 제작 결정 (6차 대회의 `meetings/10` · 개발팀 소회의 `meetings/11`)

| # | 결정 | 성격 |
|---|---|---|
| P1 | 장르 = **싱글 PvE 잠수함 액션 (탐사·성장·보스 헌팅)**. PvP·전용 서버·매치메이킹 제외, 오프라인 플레이 가능(정적 배포 유지) | [확정 — 1차 결의 1 개정] |
| P2 | **영구 성장 도입** + **신 스코프 가드** 동시 발효: 해역 1 · 보스 1종 · 영구 업그레이드 7항목 이하 · 장비 4종 이하. 초과 제안은 자동 백로그 | [확정 — 1차 결의 4 개정, 구 스코프 가드 대체] |
| P3 | 핵심 루프: 출항 → 탐사·전투 → 재화 획득 → 기지 귀환 → 강화 → 보스 추적 → 보스 전투 → 해역 개방 | [확정] |
| P4 | 화물선 적대/중립 구분(Faction 태그 — 클래스 분화 금지). 중립 공격 불이익 = **경비함 출현 단일**(구축함 AI 재활용). 평판 시스템 백로그 | [확정] |
| P5 | 재화 이원화: **일반 크레딧 / 희귀 부품**. 해저 재화 MVP 동사는 '부순다'·'줍는다' 2종. 상자 단독 배치 금지(맥락 배치) | [확정] |
| P6 | 업그레이드 2층: 1층 영구 성장(파라미터 배율) / 2층 장비 교체(슬롯·상위호환 금지). MVP 장비 4종 = 기본·고속·중어뢰·디코이(음향 기만) | [확정] |
| P7 | 귀환 시 저장 확정, 파괴 시 일반 크레딧 일부 손실(초기 50% [30~70] 튜닝표), 영구 요소·기구매 장비·**희귀 부품(획득 즉시 확정)** 보존 | [확정] |
| P8 | 첫 보스 = 군함 잔해 갑각의 장갑형 융합 생물 — **통짜 강체**(촉수·부위파괴·대량 소환 금지). 6패턴·3단계·정면 감쇄·측후방 약점·예고 동작·엄폐 지형 | [확정] |
| P9 | 기지 출항형 해역 스테이지 구조 (오픈월드 기각). MVP = 1구역 단일 해역(기지·개방 수역·암초·난파선·보스 구역) | [확정] |
| P10 | 상태 머신 **2계층 분리** — 상위 메타 루프 신규 / 하위 해역 세션 무수정 포장 / 통신 3종(시작·결과·중도 귀환) 제한. 전면 재작성 기각 | [확정 — 소회의] |
| P11 | 저장 = 로컬 + 스키마 버전 + 이중 슬롯. 체크섬·암호화 기각(세이브 조작 = 유저 자유). 스키마 변경 커밋은 마이그레이션 함수 동반 필수 | [확정 — 소회의] |
| P12 | 업그레이드 = params 원본 불변 + 런타임 **합연산** 배율 레이어. 시뮬레이터 툴 공용 함수. 7항목 가드 기계 강제 | [확정 — 소회의] |
| P13 | 보스 렌더 = 스켈레탈 기각, **강체 4~5분절 계층 트랜스폼 애니**(1주차 스파이크 판정, 실패 시 이동 곡선·카메라 연출 B안). 약점 = 판정(게임플레이)/연출(렌더) 경계 | [확정 — 소회의] |
| P14 | PvE 일정 4단계 20일: 이월·개조(D1~4) → 성장 루프(D5~9) → PvE 콘텐츠(D10~16) → 연출·봉인(D17~20). 병목 = 경제 수치표 D+3 절대 마감 | [확정 — 소회의] |
| P15 | 비상 컷 R-P3: D+16 보스전 미완 시 패턴 6종 → **4종(돌진·투사체·약점·최종 가속)** 축소, 소환·회전 근접 컷. 발동 권한 리드 단독 | [확정 — 소회의] |
| P16 | 디렉터리 `/src/meta`(메타 — save는 툴링)·`/src/systems/economy` 신설, `params/upgrades.json`·`params/economy.json` 기획 직접 커밋 확장, 커밋 태그 [LOOP][BOSS][ECON] 추가 | [확정 — 소회의] |

## PvE MVP 1차 통합 — 계약 이름 확정 (통합 담당, 2026-08-01)

> 동일 의미의 이벤트·타입을 여럿 두지 않는다. 아래 이름이 **유일한 공식
> 이름**이며, 폐기된 대안은 구현 근거로 쓸 수 없다.
> 근거·보완 사유: `docs/INTEGRATION_NOTES.md` '계약 이름 통합 결정'.

| # | 영역 | 공식 이름 | 폐기된 대안 |
|---|---|---|---|
| I1 | 세력 태그 | `patrol` (경비) | `guard` |
| I2 | 업그레이드 수식 | `meta/upgradeMath.effectiveValue` 단일 구현 | 툴링 자체 수식(위임 래퍼로 전환) |
| I3 | 업그레이드 항목 id | `maxDepth` | `diveDepth` |
| I4 | 경비 출현 요청 | `guardShipRequested` | `guardSpawnRequested` |
| I5 | 재화 획득 통지 | `lootDropped` | `creditsChanged`·`creditsGained` |
| I6 | 저장 트리거 | `saveRequested { cause }` | `rarePartAcquired` 별도 이벤트 |
| I7 | 메타 상태 통지 | `metaStateChanged` | `baseStateChanged` |
| I8 | 입력 규칙 | 우클릭=조준경 토글 / 조준 중 좌클릭=발사 / 비조준 좌클릭=카메라 / **Ctrl·E=상승** / **Shift=하강** | 우클릭 홀드 조준, Shift=상승 |

## 스프린트 A 규격 (7차 대회의 `meetings/12` [개정판] · 13차 `meetings/13`+보완 · 14차 `meetings/14`)

| # | 결정 | 성격 |
|---|---|---|
| A-1 | **전 심도 조준, 자동 부상 제거** — 조준 전후 잠수함 심도·위치 불변. 구 '전 심도 조준(구 심도 전용 규칙 폐기) 조준'은 결의된 적 없는 사양으로 폐기, 재도입 금지 | [확정 — 7차 결의 1, 문서 회귀 방지 원칙 포함] |
| A-2 | 선수 조준 카메라 규격: `torpedoTubeAnchor` 단일 앵커 → aimCameraSocket(정위치)·torpedoSpawnSocket(+고정 안전 오프셋, 정의 단일 지점) 2소켓. 동일 좌표계·동일 전방축, **십자선 = 탄도**, 시스템별 오프셋 계산 금지 | [확정 — 7차 결의 2·13차 결의 2] |
| A-3 | 조준 중 자기 선체 렌더 제외는 **조준 카메라 레이어 마스크 한정**(객체 전역 숨김 금지) + 2D 발사관 튜브 프레임 UI. 마스크·비네트·FOV·덕킹 = 조준경 불가침 요소, 명칭 '어뢰 조준경'(관측 잠망경은 백로그) | [확정] |
| A-4 | 미세 조준각: yaw ±15°[10~25]·상향 10°[5~15]·하향 15°[10~25]·감도 0.5[0.3~1.0] (`params/aiming.json`). **제한값은 전부 양수 크기** — 음수는 계산에서만. 잠수함 로컬 기준, 해제 시 reset(0). `aimReturnBehavior`·persist 스키마 포함 금지 | [확정 — 13차 결의 3·8·9] |
| A-5 | 조준 중 기동 허용(A/D 선체 선회 + 마우스 미세각), 발사 후 조준경 유지(해제는 우클릭) | [확정 — 7차 결의 1-⑤·⑥] |
| A-6 | 구매 불가 사유 **정확히 5종**(크레딧 부족/부품 부족/최대 단계/슬롯 부족/이미 장착). 테크 트리 MVP 기각 — 미구현 기능 사유 문구·스텁 금지 | [확정 — 7차 결의 4] |
| A-7 | **원자적 구매 트랜잭션**: 스냅샷→재검증→차감→적용→저장→성공 확정/실패 시 전체 롤백(부분 성공 금지). 저장 실패는 불가 사유와 구분 표시, 내부 예외 문자열 UI 비노출. A5 판정은 A5-T1~T6 포함 | [확정 — 13차 결의 7] |
| A-8 | 저장 시점 5종: 정산 확정·희귀 부품 획득·구매 성공 직후·장비 변경 직후·출항 확정 직전. 해역 내 자동 저장 없음 | [확정 — 13차 결의 4] |
| A-9 | 스프린트 순차 게이트 A→B→C (착수도 순차 — 병렬 기각), 5작업 창 체제·범위 고정, 병합 순서 리드→게임플레이→그래픽스→툴링, 판정은 dev 통합 빌드 A1~A8. **A 통합 PR 병합 전 B 병합 금지** | [확정 — 14차 결의 1~3] |
| A-10 | 어뢰 캠: F 홀드+화면 버튼(동일 진입점), 복귀 조건 3종(피격/탐지 alert/어뢰 종료), 최후 발사 어뢰 추적·자동 승계 없음. **착수는 A~C 완료 후 잔여 시간** — 스프린트 A 범위 아님 | [확정 — 7차 결의 2·13차 결의 6] |
| A-11 | 코드-문서 동시 갱신 원칙: 결의로 사양 변경 시 코드·상태 문서를 같은 작업 단위에서 갱신. 문서 미갱신 = 작업 미완료 | [확정 — 7차 결의 1-⑦, 회의체 운영 원칙 승격] |
| A-12 | **저장 책임 단일화**: 한 사용자 명령 = SavePort 최대 1회. 구매=PurchaseTransaction / 장비=EquipmentTransaction / 출항 확정 직전=Departure command(실패 시 전환 없음) / 정산·희귀=saveRequested 이벤트 유지. UI의 저장·saveRequested 발행 금지, 구 sortieLaunch cause 폐기 | [확정 — INT-CORE-010, INTERFACES §2d] |
| A-13 | 경제 데이터 미확정(공식 params null) = `economyDataUnavailable`: 구매 버튼 비활성·상태/저장 변경 0·null→0 변환 금지·provisional 비용 금지. 불가 사유는 확정 5종 + 이 코드(`slotFull`로 통일 — 구 noFreeSlot 폐기) | [확정 — INT-CORE-010, 7차 결의 4 데이터→UI 순서] |
| A-14 | **공식 런타임 params 소비**: 공식 로더(`loadEconomyParams`+`loadAimingParams`)는 composition root에서 각 1회 — 시스템·UI의 JSON·로더 직접 호출 금지. salvage는 소유 분리(보상=economy params / 좌표=SalvagePlacementSource·월드·그래픽스)로 spawnId 결합, 누락·중복·미지 spawnId 거부(무시 금지), 출항당 1회 생성·파괴분 재생성 금지, 배치 미도착 = 명시적 unwired(임시 좌표 금지) | [확정 — INT-CORE-011, contracts/officialParams.ts] |
| B-1 | **Faction 정본**: `FactionId`(hostile·neutral·**patrol**) 정의 정본은 `contracts/meta.ts` — 경비 세력 별칭 `guard` 추가 금지(코드의 guard 표기는 스폰 절차 이름). `'object'`는 세력이 아니라 표적 분류(`CombatTargetClass`). 규칙(공격 허용·중립 사건·드롭 참조·식별 분류·라벨 id·AI 초기 태도)은 `FACTION_RULES` 단일표 | [확정 — INT-CORE-012, 선행개발] |
| B-2 | **중립 사건 1건 = 경비 요청 1건 = 스폰 1척**: 중복 방지 저장소는 `GuardIncidentLedger` **1곳**(상관 id·요청 id 공용, 출항 경계 리셋). `neutralShipHit`은 유효 피해 적용 후 1회 — 조준·발사·빗나감·중복·파괴 후 발행 금지. `guardShipRequested`는 기존 이벤트 재사용(payload v2) | [확정 — INT-CORE-012] |
| B-3 | **경비함 = 범용 구축함 AI 재사용** [개정]: production `DestroyerAI` 구현체가 0개였음이 확인되어 '기존 구현체 재사용/신규 AI 0'을 폐기하고, **범용 production 구현 정확히 1개**(`core/DestroyerAIController`)를 신설한다. 경비함·일반 적대 구축함이 같은 구현체를 소비하며 `GuardShipAdapter`는 주입(세력 patrol·초기 표적=공격자·스폰 이유·identity)과 수명주기 전달만 한다. 경비 전용 GuardAI·GuardBehavior·GuardStateMachine은 **계속 금지**. 이동은 게임플레이 `SurfaceShipMotionPort`(리드가 선박 transform 직접 조작 금지), 탐지·폭뢰·내구도는 미포함(C). 팩토리·이동 포트 미연결 = `spawnFailed`, 위치 전략 미연결 = `noSpawnLocation`, 검증 더블의 production 사용 금지 | [개정 확정 — INT-CORE-013, 15차 diff-only 변경. 구 규칙(INT-CORE-012 B5)은 전제 오류로 폐기] |
| B-4 | **세력별 보상**: hostile = 공식 적대 드롭 테이블 / neutral = 보상 없음(크레딧 0·지갑 불변) / patrol = 공식 params 도착 전까지 없음(수치 발명 금지). 평판·도덕성 시스템은 스프린트 B 범위 밖 | [확정 — INT-CORE-012, B3] |
| C-1 | **피해 수신 단일 창구**: 플레이어 피해는 `DamageReceiverPort`(리드 `PlayerHullSystem`) 한 곳으로만 들어오며 검증→중복 방지→차감→전이→파괴 판정이 한 트랜잭션이다. 같은 `damageEventId`·`correlationId` 재적용 금지, 파괴 후 피해 무시, 0·음수·NaN·Infinity 거부. 게임플레이는 자체 체력 상태를 두지 않는다 | [확정 — INT-CORE-014, C5] |
| C-2 | **파괴 사실은 한 곳이 소유**: `PlayerHullState.isDestroyed`. `MetaState`를 확장하지 않고 기존 `SORTIE→DEBRIEF→BASE`를 쓴다. 파괴 1회 = `playerDestroyed` 1회 = 실패 1회 = 정산 1회 | [확정 — INT-CORE-014, C6] |
| C-3 | **실패 정산은 기존 경로 재사용**: 손실률·지갑·상태 전이는 `MetaLoop.settleSortie({outcome:'destroyed'})`, 저장은 기존 `saveRequested('settlement')`. 실패 코디네이터는 SavePort를 직접 호출하지 않는다(A-12 유지). 저장 실패 시 DEBRIEF 유지·재정산 없이 저장만 재시도, 성공 시 BASE. C에서 별도 지갑 구현 금지 | [확정 — INT-CORE-014, C7·C8] |
| C-4 | **전투 수치 발명 금지**: 선체 기준값·피해량·침수 속도·압력은 C9 [COMBAT] params 이관 대상이며 도착 전까지 시스템은 `unwired`(피해 미적용·UI 위장 금지). 침수 누적은 프레임률 독립(dt 비례), 침수 단계는 level에서 파생(이중 저장 금지) | [확정 — INT-CORE-014, C5·C9] |
| C-5 | **압력 피해·수리 미도입**: 압력 피해는 공식 종료 조건 C1~C9에 없고 기준값도 없어 `DepthPressurePort` 계약과 `maxDepth` 소비 경계만 둔다. 수리 미니게임·침수로 인한 조작 불능도 근거 없음 → 구현 금지. 선체 영구 손상 여부·구매 직후 현재 선체 처리도 **결정 요청** 상태 | [확정(경계) — INT-CORE-014, 결정 대기 3건] |
| C-6 | **선체 손상·침수 = 출항 단위 상태**: 새 출항 시작 시 업그레이드 반영 maxHull 재계산 + currentHull=maxHull 초기화. 기지까지 이어지는 영구 손상·수리비·수리 시간은 후속 스프린트 이관 | [확정 — INT-CORE-015] |
| C-7 | **구매 순간 회복 없음**: 선체 업그레이드 구매 시 진행 중 출항의 currentHull을 회복시키지 않는다 — 최대치만 갱신, 효과는 다음 출항 초기화에서 적용 (C-5의 결정 요청 1건 해소) | [확정 — INT-CORE-015] |
| C-8 | **압력 피해 = C 핵심 범위 제외**: DepthPressure 계약·maxDepth 소비 경계는 확장 지점으로 유지하되 production runtime은 unwired. 압력 수치를 C9 필수 combat params·verify:sprint-c 게이트·C 완료 조건에 포함하지 않는다 (C-5의 결정 요청 1건 해소). 침수 지속 피해 포함 **모든 선체 피해는 applyDamage 단일 창구 경유** — tick별 고유 id, dt 분할 무관 총 피해 동일(닫힌 적분) | [확정 — INT-CORE-015] |
| C-9 | **DEBRIEF 종료 정책 개정**: 저장 성공이 BASE 전환을 자동으로 일으키지 않는다 — `DebriefReadModel.canConfirm`(saved+DEBRIEF) → 사용자 확인(`DebriefConfirmCommand.confirm()`) → `completeDebrief()` → BASE. 정상 귀환·실패 양쪽 동일 정책. 저장 미완료 confirm 거부, 중복 confirm 거부(전환 1회), retrySave는 재정산 없이 저장만. C-3의 '저장 성공 시 BASE' 문구는 본 결정으로 개정 | [개정 확정 — INT-CORE-016, 그래픽스 INT-RENDER-012 요청 승인] |
| C-10 | **combat params 정규화 소유 단일화**: `params/combat.json` 중첩 스키마의 해석·검증은 공인 로더(`tools/combatParams.validateCombatParams`) **한 곳**만 수행한다. 게임플레이 구 평면 리더(이중 정규화)는 제거됐고 재도입 금지, `attachCombatParams`는 계약 타입 단면(`NormalizedCombatParams`)만 받는다. 공인 로더 밖 combat.json import 금지(허용 2곳: `combatParamsLoader`·A 시절 `ParamLoader`), null 블록·필드는 그대로 전달(unwired 유지 — null→0·fallback·부분 wired 금지) — 정적 검사 강제 | [확정 — INT-CORE-017] |
| C-11 | **실패 화면 종료도 confirm command 경유**: `SortieFailureScreen`의 '확인 (기지로)'는 `DebriefConfirmCommand.confirm()` guarded command를 호출하며 성공(BASE 전환)했을 때만 화면을 닫는다. DOM 숨김 전용 종료 금지, 버튼 노출 근거는 `canConfirm` 하나. C-9 정책의 실패 화면 측 완결 — UI의 `completeDebrief` 직접 호출 0건(정적 검사 강제) | [확정 — INT-CORE-017] |
| C-12 | **C9 수치 상태 구분**: C9 15필드 결정표는 **PROPOSED**(리드 제안 — 코드 수식·플레이 목표 기반)이며 기획 승인 전까지 APPROVED가 아니다. production 코드·`params/combat.json`에 숫자 미입력(전량 null 유지), 승인 후에만 툴링 경로로 입력한다. 구조 배선 완료(wired 경로 존재) ≠ 수치 확정 ≠ 실측 완료 ≠ C 최종 완료 — 네 상태를 문서·보고에서 항상 구분한다 | [확정 — INT-CORE-017. C-13으로 승인 완료] |
| C-13 | **C9 초기 공식 밸런스 v0.1 = APPROVED**: C-12의 결정표가 기획 승인됨 — hull 120/0.7/0.3 · depthCharge 4m/18m/45/12/6s · flooding 0.15/0.45/0.8/2.4/0.02 · detection {60,240}/0.125. `params/combat.json`에 공인 스키마 그대로 입력(커밋 `c943d35`), 공인 로더 pending 0건·관계 검사 전부 통과. 이 값들은 '초기 테스트값' 지위 — 조정은 실측·튜닝 로그(G 태그) 절차를 따른다 | [승인 확정 — C9 v0.1] |
| C-14 | **탐지 production 기준 배선 2건**: ① `torpedoFired` → `reportTorpedoLaunch` 조립부 이벤트 브리지(§5.10 '발사 지점 무조건 노출' 확정 규칙의 배선 — 호출자 0건이던 계약 구현 연결) ② 출항 시작 시 소음 **기준 입력** `reportNoise(1)` — 공식 만충 시간(잠망경 8s) 정의의 기준 조건(정상 항행)이자 배율 항등원이며 새 밸런스 수치가 아니다. 속도 의존 소음 곡선·침묵 항행 토글은 공식 규칙 도착 시 게임플레이 구현이 이 입력을 대체한다 | [①은 유지 확정 — INT-CORE-018. ②의 고정 1은 C-16으로 폐기·대체] |
| C-15 | **C9 v0.1.1 침수 기여 승인**: `depthCharge.directFloodingContribution = 0.35` · `nearFloodingContribution = 0.10` (정규화 flooding level ratio, 관계 0 < near < direct ≤ 1 — 공인 로더 강제). 폭뢰 시스템이 outcome별 피해량·침수 기여를 함께 결정(direct 0.35·near 0.10·miss 0), 적용은 `applyDamage` 단일 창구·기존 typed `floodingContribution` 경유, 중복 event는 선체·침수 모두 1회, 누적은 1.0 clamp, 침수 지속 피해는 기존 tick 경로 유지. 기여 null = 침수만 unwired(boolean으로 양 추측 금지) | [승인 확정 — C9 v0.1.1, INT-CORE-019] |
| C-16 | **공식 production 소음 정책**: `noiseLevel = clamp(\|현재 속력\| / 공인 최고 속력, 0, 1) × (침묵 항행 ? 0.1 : 1)`. 속력 = 게임플레이 `PlayerController.speed`(계약 지정 소음 입력), 최고 속력 = 업그레이드 반영 유효 movement params(조립부 수치 하드코딩 금지). 정지 = 0 · 전속 = 1 · 침묵 배율은 공식 0.1(탐지 시스템 적용). **구 고정 `reportNoise(1)`은 수치 fallback으로 최종 승인하지 않아 폐기.** 대화형 침묵 조작 미구현 동안 침묵 입력 경계는 공식 중립값 false(임의 토글 금지 — C_SILENT_RUNNING_INTERACTIVE=false). 어뢰 발사 무조건 노출은 소음 계산과 별개 유지 | [확정 — INT-CORE-019] |
| M-1 | **M1 보스 = 3단계 × 4패턴 봉인 구현**: `BOSS_PATTERN_KINDS` = 돌진·투사체·약점 개방·최종 가속 정확히 4종(16차 결의 1-3). 소환·회전 근접은 타입·스텁·플래그 어느 형태로도 두지 않으며 params 로더가 미지 패턴 키를 거부한다. 보스 코어(`core/BossController`)는 `DestroyerAIController` **합성** 재사용(신규 범용 AI 0, B5 단일 구현 판정 보존). 모든 공격·개방·단계 전환보다 예고 상태 선행, 단계는 체력 임계 + 예고로 1→2→3 순차만. D10 비상 컷 = `params/boss.json patterns.flags`의 weakPointOpen·finalAcceleration **오프**(약점 판정 코드 유지 — 17차 결의 5 R-M3, 발동 권한 리드 단독) | [확정 — 17차 결의 3·5, INT-CORE-020] |
| M-2 | **M2 단서·해금 = 저장 스키마 v2**: `progress.bossCluesFound`(개수) → `bossCluesCollected`(단서 **id 목록**) — 동일 단서 중복 반영 금지를 재접속 후에도 보장하는 유일한 영속 근거. 개수는 length 파생(이중 저장 금지). v1→v2 마이그레이션 동반(개수 → `legacy-clue-N` 합성 id·플래그 이관 — 기존 저장 안전). 해금은 단조(한 번 true면 유지), 정본 단서 id는 `params/boss.json unlock.clueIds`·미지 id 거부. 단서 획득은 게임플레이 `InteractionSystem`의 `interactionCollected` 이벤트 소비 — 별도 상호작용 시스템 금지(16차 결의 2-4) | [확정 — INT-CORE-020, 저장 스키마 변경은 소회의 11 결의 7 마이그레이션 동반 규칙 이행] |
| M-3 | **보스 격파 보상·기록 = 기존 경로 재사용**: `bossDefeated`(격파 1회당 1회) → 조립부 `BossVictoryBridge` → 진행 기록 `markDefeated` 1회 → **기존** `lootDropped(source 'boss')` → MetaLoop 희귀 부품 즉시 확정 + `saveRequested('rarePart')` 1회 — 그 저장 스냅샷에 데모 완료 기록이 동승해 **승리 보상과 완료 기록 저장이 각각 정확히 1회**. 보상 수치는 `params/boss.json reward.*`(기획 튜닝표). 보스 전용 피해·저장·HUD 정본 신설 금지 | [확정 — INT-CORE-020] |
| M-4 | **interactionCollected 두 ID 의미 분리**: payload는 `InteractionCollectedEvent`(contracts/meta.ts) discriminated union — **`targetId` = 월드 interactable 고유 ID**(모든 kind 공통, 단서 ID로 해석 금지) / **`clueId` = canonical 단서 ID**(`params/boss.json unlock.clueIds`)로 `kind==='clue'` arm에서만 필수, 비clue arm은 `clueId?: never` 타입 수준 금지. kind 정본 = `goldCache\|salvage\|clue\|deepSite` 4종 — 게임플레이 내부 태그(`gold`·`deepSurvey`)와의 변환은 게임플레이 조립 어댑터 소유. 진행 소비는 `clueId`만(조립부 `collectClue(payload.clueId)`) | [확정 — INT-CORE-021] |
| M-5 | **단서 진행 정본 = BossProgressStore 단일**: 원장(수집 id 목록)·중복 방지·저장 복원·해금 판정·보스 구역 게이트는 `BossProgressStore` 하나가 소유한다. 게임플레이 어댑터는 interactableId→clueId 매핑·kind 변환·이벤트 발행만 담당하는 **무상태** 계층 — `CluePickupProgress`류의 영속·복원·중복 방지 로직은 병합 대상이 아니다(중복 정본 금지) | [확정 — INT-CORE-021] |
| M-6 | **소나 스코프 표시 계약 = `SonarScopeReadModel`**(contracts/sonar.ts): 렌더는 이 모델만 소비 — 월드 좌표 역산·판정 재계산 금지(blip은 방위·번짐·거리\|null·fromActivePing만). 침묵 항행 boolean 금지 — `noiseFactor` 단일 의존(17차 결의 4). `depthChargeOnPassiveScope` 필터는 게임플레이가 blips 공급 시점에 적용. ringState는 기존 `DetectionStage` 재사용(새 어휘 금지). 계약 정의 ≠ 배선(공급자·소비자 dev 부재) | [확정 — INT-RENDER-014] |
| M-7 | **보스 승인 대기 params 4필드 = NullableTunable**: `movement.moveSpeedMetersPerSecond`·`movement.turnRateRadiansPerSecond`·`patterns.ram.contactDamage`·`patterns.weakPointOpen.hitRadiusMeters` — 허용 범위·단위는 계약으로 선고정, value는 근거 없는 숫자 발명 금지로 **null**(해당 축 unwired). null→0 변환·fallback·키 누락 허용 전부 금지(로더 강제), 관계 제약 평상시 속도 ≤ 돌진 속도. 구 임시값 6(약점 반경)은 후보일 뿐 승격 아님. 승인 시 툴링 경로로 value만 입력 | [확정 — INT-CORE-022. 수치는 기획 승인 대기] |
| M-8 | **보스·약점 월드 배치 = `src/world/bossPlacement.ts` 신설(그래픽스 창, 승인 INT-CORE-022)**: spawn ID = `boss-abyss-01`(boss.json id와 동일 문자열), 구역 ID `boss-zone-abyss`, `BOSS_PLACEMENT`·`BOSS_WEAK_POINT_PLACEMENT`·`BOSS_ZONE` export. 진입 순서 = 구역 경계 판정(게임플레이) → `requestEntry()` granted → `spawnBoss()` 1회. 격파 시 `markRemoved`+컨트롤러 dispose, reset은 기존 사슬. 렌더는 배치·판정 비소유 | [확정 — INT-CORE-022] |
| M-9 | **clue 매핑 정본 = `src/world/bossCluePlacements.ts`(배치와 같은 모듈이 `ClueIdByInteractableId` export)**: 작성 그래픽스+기획 승인 / 검증 툴링(clueIds 대조) / 주입 조립부 / 최종 방어 스토어 unknownClue — 3중 방어. targetId 문자열 조작·매핑 없는 clue 성공 처리 금지 | [확정 — INT-CORE-022] |
| M-10 | **M2 params 경로**: `params/interaction.json` 신설(holdSeconds 2.0 확정 + 반경·소음 null) / `params/sonar.json` 신설(핑 3종 16차 튜닝표 3.0·0.30·25 — 기획 확인 후 입력 + 번짐 null) / `params/economy.json` farming 확장(비율 0.40 튜닝표 + 평균 크레딧 산식 기획). 시각 전용 값은 renderVisualParams 분리 유지, 경제 보상과 clue 진행 혼합 금지 | [확정 — INT-CORE-022. 파일·로더는 툴링] |
| M-11 | **입력 최종: E = 상승 유지 / F hold = 회수**: 9차 결의 4 키맵 무변경 + 17차 결의 2 F 미배정 반환 활용. 변경은 `interactHold` getter 1줄(게임플레이)+문구(그래픽스). 저장 영향 0 | [확정 — INT-CORE-022] |
| M-12 | **SonarBlipKind = 전투 3종 + 탐색 4종(InteractionTargetKind 재사용)**: 탐색 kind는 액티브 핑 노출 중에만 공급(패시브 비노출 — 미식별 선노출 금지), 지형은 blip 아님(렌더가 레이아웃 단일 소스로 배경층 묘화), distance null 의미·runtime read model 지위 유지 | [확정 — INT-CORE-022] |
| M-13 | **보스 피격·개방 통지**: `bossHit {kind}` 신설 — 발행 게임플레이(onHit, 배율 적용 후·재배율 금지·명중 1건당 1회·피해량 비탑재), bossHit→bossDefeated 순서. `bossWeakPointChanged` 발행 정본은 **리드 코어**로 개정(상태 전이 시 1회, 격파 시 false→bossDefeated — meta 검증 고정). `BossCoreView`는 정식 공유 read model로 확정(승격 절차 불요 — PR #10부터 정본) | [확정 — INT-CORE-022] |
| M-14 | **DetectionHud 제거 = M3 공식 이관 (정보 비동등)**: production SonarScope provider 연결·wired 표시 확인·중복 검토는 **완료**됐으나, SonarScope가 대체하지 못하는 정보 2건이 확인됐다 — ① **`DetectionHudView.gauge`**(0~1 연속 피탐지 누적): `ringState`는 3단계 이산값이라 진행률 표현 불가, `noiseFactor`는 플레이어 **자신의 소음**이라 대체 불가 ② **`TrackingStateSource.trackedShips`**(entity별 patrol/alert/attack/lost): `SonarBlip`에 추적 상태 필드 없음. 따라서 **M1·M2에서 제거하지 않고 DetectionHud를 유지**하며, 제거되지 않은 상태를 제거 완료로 표기하지 않는다. M3(은신·탐지·적 AI 통합)에서 ⓐ SonarScope 계약 확장 수용 / ⓑ 별도 탐지 UI 유지 + HUD 구조 재설계 / ⓒ 역할 분리 후 둘 다 유지 **중 하나를 결정**한다 — 이 단계에서 방식 결정·선행 구현 금지. **동반 필수 조치(ⓐ·ⓑ 공통)**: `src/ui/BossHealthHud.ts`가 `[data-ui-detection-hud]` 요소의 **실제 하단 + 12px**를 레이아웃 앵커로 쓰고 앵커 부재 시 **상단 12px로 폴백**하므로, DetectionHud 제거·통합 시 보스 체력 HUD가 **예외 없이 조용히 이동**한다(무증상 레이아웃 회귀). 같은 작업 단위에서 상단 중앙 배치를 유지할 **대체 앵커를 함께 결정**하고 **production 레이아웃 회귀를 실측 검증**해야 한다 (상세: 인계표 §7-2-1). 상태: `DETECTION_HUD_INFORMATION_PARITY=false` · `DETECTION_HUD_REMOVED=false` · `DETECTION_HUD_REMOVAL_DEFERRED_TO_M3=true` | [확정 — INT-CORE-023, 인계표 §7-1. M-6·INT-RENDER-014의 소나 계약은 무변경] |
| M-15 | **보스전 목표 = A2(성장 후 클리어) · 전투 수치 변경 0건**: 어뢰 탄약은 **출항당 3발 고정**이다(`torpedoCapacity` 3, `torpedoReloadSeconds` 20은 **발사 간격**이지 재보급이 아님 — `StraightRunTorpedoSystem.ammo`는 출항 중 보충되지 않는다). 따라서 기본 어뢰(약점 2.0/발)로는 3발 전탄 명중해도 6.0 < maxHull 12로 **격파가 수학적으로 불가**하고, 중어뢰(5.0/발)는 3발 전탄, 중어뢰+`torpedoDamage` L2(6.0/발)는 2발이면 격파된다. 관측된 보스 hullRatio 최저 0.8333(= 약점 정확히 1발)은 이 예산과 일치하므로 **코드 결함이 아니라 설계대로의 결과**다. 목표 상태는 이미 [승인]된 `params/economy.json bossReadinessReference`(핵심 3종 L2 + 중어뢰, 출항 4~6회)를 정본으로 채택한다 — 필요 재화 1200cr + 희귀부품 1 vs 출항 수입 245cr + 희귀부품 1(salvage-3 확정) ≈ 4.9회로 승인 범위와 일치. **A1(기본 잠수함 클리어)은 채택하지 않는다** — 승인 경제·보스 수치를 전면 재설계해야 하고 핵심 루프(탐색·파밍 → 재화 → 업그레이드 → 보스전)를 무의미하게 만든다. `boss.json`·`combat.json`·`equipment.json`·`upgrades.json` **수치 변경 0건 승인**. ⚠ **공식 준비 사양(3종 L2 + 중어뢰 · 4~6회)과 EC 실측 최소 경로(중어뢰 단독 · 전투 업그레이드 0)를 문서·보고에서 분리한다** — 후자는 evidence 수집 편의를 위한 최소 사양이지 공식 난이도 기준이 아니며, 명칭은 `production salvage·cargo 수입을 이용한 중어뢰 단독 확보 경로`로 쓴다(`파밍 N회` 표현 금지). 성공 출항 2회(490cr + 희귀부품 ≥1)로 중어뢰 확보 가능하나 수입 누락·파괴 손실 시 3회 이상일 수 있다(조건부) | [확정 — INT-CORE-024 §5·§5-1] |
| M-16 | **파밍(SectorFarmingRewards) 배선 = M1·M2 종료 조건에서 제외**: 성장 재화 경로는 **이미 production 배선 완료**다 — salvage 자동 회수(`EconomySystem.dropField.collectNear`, 반경 6m) + 화물 격침 드롭 = 출항당 245cr이며 이것이 `bossReadinessReference` 4~6회 산정의 입력이다. `SectorFarmingRewards`는 **F 홀드 회수 전용 상한 계층**이고 production 대상이 0개인데, 실재하는 farming ID(`salvage-1/2/3`)는 이미 자동 회수로 지급 중이라 연결하면 **이중 지급**이 되고 `goldCache` interactable 신설은 신규 콘텐츠다. Exit Criteria 19항목에도 파밍 항목이 없다. ⇒ `FARMING_REWARD_DATA_WIRED=false`·`FARMING_CAP_PRODUCTION_VERIFIED=false`를 **유지하되 M1·M2 blocker에서 제외**하고 M3/경제 확장으로 이관한다. 임의 target ID 생성 금지, salvage의 F 홀드 전환도 M1·M2 범위 밖 | [확정 — INT-CORE-024 §6] |
| M-17 | **EC12(DEBRIEF→BASE) 원인 = production pointer lock 미해제**: 저장소 전체에 `exitPointerLock` 호출이 **0건**이고 `requestPointerLock`은 `src/ui/ControlsHud.ts` 한 곳뿐이라, 출항 종료 모달이 떠도 포인터가 캔버스에 잠겨 **확인 버튼 클릭이 도달하지 않는다**(사용자가 Esc를 눌러야 함). **하네스 사용 문제가 아니라 production UX 결함**으로 분류하며, 최소 수정은 DEBRIEF 진입 시 pointer lock 해제다(소유: lock 요청자인 그래픽스/HUD, 배선 승인: 리드). 이 항목은 성장 사이클(구매·업그레이드)과 EC13·EC17 관측 전체의 **선행 차단 요인**이다. **상태를 두 경로로 구분한다**: `EC12_CORE_FLOW_VERIFIED=true`(무잠금 production 경로에서 DOM·handler·실제 클릭 → BASE·정산/save 중복 0 확인 — 이 증거는 폐기하지 않는다) / `EC12_POINTER_LOCKED_PATH_VERIFIED=false`(정상 플레이는 lock을 획득하므로 Esc 없이 클릭되는 경로가 미확인). 최종 완료 조건 7항목은 INT-CORE-024 §7-1. 최소 변경 범위 = `ControlsHud`가 `metaStateChanged`의 DEBRIEF·BASE 진입에서 lock element가 game canvas일 때만 `exitPointerLock()` 호출(aim 종료·pause/resume 무모순), `Game.ts` 변경은 그것으로 해결되지 않을 때만 별도 리드 승인. **후속 조치**: `params/upgrades.json`의 `torpedoDamage`·`hullIntegrity` note가 최신 composition보다 오래됐다(`UPGRADE_PARAM_COMMENT_SYNC_REQUIRED=true`) — production 조립이 정본이므로 미배선으로 오판 금지, 수치는 정상, 주석 정리는 후속 최소 변경 | [확정 — INT-CORE-024 §7·§7-1·§7-2] |
| C-17 | **폭뢰 목표 심도 기폭**: 공격 요청 생성 시 마지막 유효 관측된 표적의 **3D 위치를 고정**하고(`SurfaceShipMotionPort.getTargetPosition` 3D 계약 — 임의 y=0 채움 금지), 폭뢰는 투하 시작 y(공격자 수면)에서 그 목표 심도까지 신관 시간 동안 낙하(파생 보간 — 새 낙하 속도 상수 없음), 최소 신관 3초 후 **목표 심도에서 기폭**한다. 투하 후 현재 플레이어 위치 재추적·유도 금지. direct/near/miss는 기폭 위치와 기폭 순간 플레이어 위치의 실제 3D 거리로 판정 — 세 심도 모두에서 세 판정이 성립하며 특정 심도가 수직 offset만으로 항상 안전·위험하지 않다. **구 y=0 고정 기폭은 최종 승인하지 않아 폐기** | [확정 — INT-CORE-019] |

## 버티컬 슬라이스 트랙 유효 결정 (구현 기준 — PvE에서 이월·재편)

| # | 결정 | 성격 |
|---|---|---|
| 1 | 로우폴리 + 플랫 셰이딩 **풀 3D**, 자유 카메라(±60도, Space 리센터) | [확정 — **번복 금지 조항 발효**] |
| 2 | 수평면 기동 + **심도 3층**(잠망경/순항/심해) 층 단위 이동. 풀 6자유도 금지 | [확정] |
| 3 | WASD + 관성(정지 1.5초·선회 2.0초는 초기 테스트값), 선회는 잠수함 기준 | [확정 + 튜닝] |
| 4 | 탐지 게이지 단일화(소음×거리×심도), 눈 아이콘 3단계 UI | [확정] |
| 5 | **어뢰 발사 지점 무조건 노출** (마지막 목격 위치 기록) — 2막 스킵 방지 | [확정] |
| 6 | **수동 조준 + 리드샷 보조선이 기본.** 자동 락온은 G3 위험 시에만 투입하는 보험 (스텁 금지) | [확정 — 우선순위 역전] |
| 7 | 폭뢰 '풍덩→3초→폭발'. **신관 하한 3.0초 고정**, 난이도는 동시 폭뢰 수로 조절 | [확정] |
| 8 | 실패 조건 = **내구도 0 단일.** 산소는 심해 층 압박 요소일 뿐 | [확정] |
| 9 | 승무원 4명 = 스킬 버튼(1~4키). 부상 없음 | [부분 개정 — '영구 성장 없음'은 P2로 대체. 승무원 스킬의 PvE 재편은 미결(기획)] |
| 10 | X-ray 침수 표시는 장식이 아니라 **게임 정보** (자동 발동). 승무원 모션은 아이콘 점멸 대체 | [확정 — 보호 목록] |
| 11 | 소음은 숫자 UI 금지 — **월드 파문 이펙트** (엔진음과 동기화) | [확정 — 보호 목록] |
| 12 | 사운드 = 1차 정보, 시각 = 축약된 2차 정보. 패닝 기준은 항상 카메라. 모노 생존 정보 이중화 | [확정] |
| 13 | 격침 보상 = 어뢰 +1 고정 지급 (강화 카드의 대체) | [확정] |
| 14 | 구축함 AI는 VS에서 경계·공격 2상태 우선, 예측 이동 없음, 구축함 무적 | [확정 — 구현 깎기] |
| 15 | 성능 예산: 적 2·폭뢰 6·조명 2·그림자 블롭만·15MB. 희생 순서 ①파티클 ②어군 ③카메라 흔들림 ④포그 | [확정] |
| 16 | **보호 목록 (제거 금지):** 60fps / 폭뢰 사운드 동기화 / X-ray 침수 / 소음 파문 | [최상위] |
| 17 | 게이트 등급제: 필수(G1·G3) / 핵심(G2·G4·G6~G8) / 참고(G5·G9) | [확정] |
| 18 | 기술 스택: Three.js+Vite+TS+자체 간이 물리+Web Audio+JSON 파라미터+정적 호스팅+단일 리포 | [확정] |
| 19 | 스텁 금지. 유일한 예외: 인스턴싱 렌더 경로(파문용 공용 기술) | [확정] |
| 20 | 비상 컷 R-D3(D9 코어 미완 시 은신 축소)은 개발 리드 단독 권한 | [확정] |

## 폐기된 결정 — ⛔ 구현 금지

> 아래 항목은 회의에서 명시적으로 폐기·컷되었다. **구현 근거로 사용할 수 없고,
> 코드·스텁·인터페이스도 만들지 않는다.** (마스터 플랜 부록 B·C, §6.3~6.4)

| 폐기 항목 | 폐기 사유 | 재론 조건 |
|---|---|---|
| 2D 사이드뷰 단면 / 2.5D 사이드스크롤 | 3D 지형의 깊이를 죽임 | **번복 금지 — 재론 불가** |
| 화면 하단 상시 단면 패널 | 화면 양분, 스타일 충돌 | 재론 없음 |
| 풀 6자유도 수중 이동 | 멀미·60초 게이트 붕괴 | 재론 없음 |
| 자동 락온 우선·3단계 페이드아웃 조준 | 코어(수동 리드샷) 검증 우선 | G3 위험 시 보험으로만 |
| 3택 1 강화 카드 | 코어 루프 외부 메타 | 컷 테이블 최후순위 |
| 승무원 이동 애니메이션 | 공수 대비 가치 | 컷 테이블 5순위 |
| 구축함 격침 | 2막을 '회피'로 순수 검증 | 컷 테이블 4순위 |
| 세부 카메라 흔들림 | 연출 다듬기 영역 | 컷 테이블 2순위 |
| 어군·장식 오브젝트 | 시각 밀도는 게이트 무관 | 컷 테이블 1순위 (부활 최선) |
| 구축함 예측 이동 AI | 3주 내 튜닝 지옥 | 정식 제작 이월 |
| 승무원 식량·사기·개별 관리 / 부상·행동불능 | 세션형 스코프 초과 / 스코프 가드 | 정식 전환 후 재론 |
| 절차 생성 맵 | 핸드메이드 긴장 설계 우선 | 라이브 단계 |
| 폭뢰 신관 2.5초 하한 | 인간 반응 사슬 미달 | 재론 없음 (하한 3.0 고정) |
| 발각 유지 = 실패 조건 | 발각은 실패가 아니라 2막의 시작 | 재론 없음 |
| Unity WebGL | 15MB 게이트 충돌, 이터레이션 저속 | 재론 없음 |
| 멀티플레이(PvP·전용 서버·매치메이킹) | 6차 결의 2로 재확정 제외 | 협동 PvE만 성공 조건부 검토 |
| ~~영구 성장 금지~~ | **6차 결의로 개정 — P2 참조** (영구 성장 도입 + 신 스코프 가드) | 게이트 4문 통과 절차로 개정 완료 |
| 수익화 / 데일리 챌린지 등 라이브 기능 | MVP 무관 | 데모 이후 재론 |
| 촉수 체인 물리·부위 파괴·대량 소환 보스 | 공수 파산 (소회의 결의 5) | 2호기 이후 백로그 |
| 세이브 체크섬·암호화 | 싱글 오프라인 — 조작은 유저 자유 | 재론 없음 (소회의 결의 3) |
| 평판 시스템·유적 퍼즐·개별 장비 손상 | 6차 트리아지 백로그 | MVP 이후 |
| **전 심도 조준(구 심도 전용 규칙 폐기) 조준 / 조준 진입 시 자동 부상·잠망경 심도 자동 이동** | 결의된 적 없는 사양 — 7차 결의 1로 폐기. 심도는 생존 자원이며 조준이 소모하면 안 됨 | **재도입 금지** (문서 회귀 방지 원칙 — 코드·문서·체크리스트에서 삭제) |
| `aimReturnBehavior`(persist 선택지)·관측용 잠망경 | 미구현 선택지는 스키마에도 넣지 않음 (13차 결의 9) | persist는 정식 승인 시 구현·스키마·테스트·문서 동시 추가 / 관측 잠망경은 수면 정찰 게임플레이 필요 시 |

## 스프린트 B 확정 (A+B 통합 회차에서 코드·실측으로 확인)

| 결정 | 근거 | 상태 |
|---|---|---|
| **`FactionId` = `hostile` \| `neutral` \| `patrol` 3종 고정** | 6차 결의 3 · INT-CORE-012. 경비 세력 id는 `patrol`이며 `guard` 별칭을 만들지 않는다 | 확정 — 정적 검사로 고정 |
| **해저 재화는 세력이 아니다** | `object`는 `CombatTargetClass`로 분리 — 세력 규칙표에 넣지 않는다 | 확정 |
| **중립 격침 보상 = 0 (지급하지 않음)** | 12차 결의 3 B3 · 15차 결의 2 단언 테스트 | 확정 — 브라우저 실측 지갑·출항 재화·드롭 전부 불변 |
| **`patrol` 보상 정책 = pending (null)** | 공식 수치 없음. **null을 0으로 확정 해석하지 않는다** | 미확정 — 값 대기 |
| **경비함 = 기존 구축함 AI 재사용, 신규 AI 코드 0** | 15차 결의 2. 재사용은 복사가 아니라 **어댑터**로 | 확정 — production `implements DestroyerAI` 구현체 1개(`DestroyerAIController`), 파일명이 아니라 **내용 기준** 검사 |
| **AI는 transform을 소유하지 않는다** | 판단(리드 AI) / 이동(게임플레이 `SurfaceShipMotionPort`) 분리. pose 정본은 게임플레이 entity 1개 | 확정 — INT-CORE-013 |
| **중복 방지 저장소는 `GuardIncidentLedger` 하나** | 요청·스폰이 같은 원장 공유. 시스템 내부 중복 표 금지 | 확정 — 사건 1건 = 경비함 1척 실측 |
| **스폰 위치에 fallback 없음** | 원점·플레이어 위치로 대체 금지. 자리를 못 찾으면 `noSpawnLocation` | 확정 |
| **방향 마커는 실제 `spawnPosition`만 가리킨다** | 요청의 `incidentPosition`은 경비함 위치가 아니다 | 확정 — INT-RENDER-011 |
| **미식별 상태에서 세력 미노출** | `displayLabelId=null`. 노출하면 B2·B7이 무의미해진다 | 확정 — 실측 확인 |
| **세력 구분은 색 이전에 실루엣·마크 형태로** | 저해상도·원거리에서 색·마크가 사라져도 실루엣 차이가 남는다 | 확정 — 적대 삼각·포탑2 / 중립 사각·포탑0 / 경비 마름모·포탑1 |
| **렌더는 모델·클래스 이름으로 세력을 추측하지 않는다** | 변형 선택은 `FactionId` 값만 소비 | 확정 — 정적 검사 + 런타임 대조 |
| **B6 배율·호위 이탈 거리 = 미확정(null)** | 12차 결의 3 "배율은 튜닝표". 제안값(`SPRINT_B_B6_PROPOSAL.md`)은 승인 수치가 아니다 | 미확정 — **params에 입력하지 않음** |
| **B7 판정은 표본 미달 시 하지 않는다** | 테스터 5명·유효 기회 50회 미만이면 `INSUFFICIENT_SAMPLE`. 참고 비율은 계산해도 **합격·실패 판정에 쓰지 않는다** | 확정 |
| **B7 합성 fixture는 실측 결과가 아니다** | 집계 알고리즘 검증 전용 | 확정 |
| **B 공식 발효 = A 통합 PR 병합** | 15차 결의 1 | 미충족 — B_CORE_COMPLETE=true여도 발효 아님 |
| **C 발효 = B1~B5 통과** | 15차 결의 1. 단, A PR 미병합 상태에서는 **기술 선행개발만** 가능 | B1~B5 통과 — 선행개발 가능, 공식 발효는 불가 |
