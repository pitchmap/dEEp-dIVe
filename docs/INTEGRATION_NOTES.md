# INTEGRATION_NOTES — 공통 계약 변경 제안·결정 기록

> 공통 계약(`src/contracts/*`)과 공통 보호 파일의 모든 변경은 **여기에 먼저
> 제안을 기록**하고 개발 리드 결정 후에만 반영한다 (CLAUDE.md 규칙 8).
> 새 제안은 표 맨 위에 추가한다. 간단 요청은 `docs/templates/INTEGRATION_REQUEST.md`
> 양식으로 이슈를 먼저 열어도 된다.

## 기록 양식

| 필드 | 내용 |
|---|---|
| 요청자 | 역할/창 이름 |
| 대상 시스템 | 예: DetectionSystem, events.ts의 특정 이벤트 |
| 필요한 변경 | 추가·수정할 이벤트/필드/메서드 구체 명세 |
| 변경 이유 | 어떤 작업이 막혀 있는가, 데이터·근거 |
| 관련 게이트 | G1~G9 중 해당 항목 |
| 영향을 받는 파일 | 계약 파일 + 구현·구독 측 파일 목록 |
| 하위 호환 여부 | 기존 구현·구독자가 깨지는가 |
| 개발 리드 결정 | 승인 / 반려 / 조건부 (+사유) |
| 적용 커밋 | 반영 커밋 해시 (결정 후 기입) |

---

## 전체 상태 총괄표 (D+7 문서 정리 시점 — 미결·해결 정리)

> 항목 원문은 각 소재 브랜치의 INTEGRATION_NOTES에 있다 (dev 통합 시
> 본문 합류). ✅ = 해결(승인·반영), ⏳ = 미결(리드 결정 대기),
> 🔍 = 선반영·리드 확인 대기, 🔀 = 다른 항목으로 해소, ⛔ = 폐기.

| ID | 제목 | 상태 | 소재·근거 |
|---|---|---|---|
| #001 | 초기 계약 정의 | ✅ 반영 완료 | dev (부트스트랩) |
| INT-CORE-001 | GameSystem·SystemRegistry·composeSystems | ✅ 반영 완료 | dev `d994160` |
| INT-GAME-001 | 이동 수치(최고 속력·가속) params 이관 | ✅ 반영 완료 | dev `6f83268` |
| INT-GAME-002 | gameplay 조립 연결 | ✅ 반영 완료 | dev `6f83268` |
| INT-RENDER-001 | CanyonScene 조립·별칭 정리 | ✅ 반영 완료 | dev `6f83268` |
| INT-TOOL-001 | Node 고정·params HMR (engines `>=22 <23`) | ✅ 반영 완료 | dev `7e9e363` — 그래픽 브랜치 일치 검증 완료(`c091f30` vs dev diff 0건) |
| INT-CORE-002 | 축 규약(conventions)·AimSystem·aimModeChanged·propellerIdleSpinRatio | ✅ 승인·**D+10 통합 완료** | 리드 `b69890b` |
| INT-CORE-003 | SubmarinePoseSource·CargoShipStateSource·torpedoHit·layout.ts·파라미터 단일 소스 | ✅ 승인·**D+10 통합 완료** | 리드 `efd4712` |
| INT-CORE-004 | STARTING_CANYON_LAYOUT(`src/world/`)·벽 높이 확정(렌더 하향값)·리센터 규약 이의 해소(Offset/Look 분리) | ✅ 승인·**D+10 통합 완료** (Game.ts 명시 주입 — 렌더·충돌 단일 인스턴스) | 리드 `c4841cf` |
| INT-GAME-004 | positionY·부호 속도 계약 승격 + 후진·수직 비율·심도 구간 경계 이관 | ⏳ 미결 — 계약 실체는 INT-CORE-003으로 확정, **심도 구간 경계 임시값(provisionalWorld) 이관 잔여** | 게임플레이 `218ad86`~`c46c937` |
| INT-GAME-005 | 협곡 레이아웃 단일 소스화 + positionY 렌더 소비 | 🔀 **INT-CORE-004로 해소** — 미러 삭제(`c46c937`)·렌더 소비(`c091f30`) 완료. 형식 종결만 잔여 | `c4841cf`·`c46c937`·`c091f30` |
| INT-GAME-006 | 어뢰 수치(속력 20·사거리 90) params 이관 + 명중 이벤트 | ⏳ 미결 — 이벤트는 INT-CORE-003 `torpedoHit`로 해소, **수치 이관(provisionalCombat) 잔여** | 게임플레이 `10ef604` |
| INT-GAME-007 | 화물선 수치(속력 4·반경 9·침몰 6s) 이관 + 격침 보상 어뢰 +1 배선 | ⏳ 미결 | 게임플레이 `b7faf44` |
| INT-RENDER-002 | 프로펠러용 전후 부호 속도 (소회의 관리 창 제안) | 🔀 INT-GAME-004 합류 → **INT-CORE-003 `forwardSpeedMetersPerSecond`로 해소** | 회의록 08 |
| INT-RENDER-003 | 화물선 상태 계약 | 🔀 **INT-CORE-003으로 해소** — 렌더 계약 소비 전환 완료(`c091f30`) | `c091f30` |
| INT-RENDER-004 | [보고] 렌더-충돌 벽 높이 불일치 | 🔀 **INT-CORE-004로 해소** — 공유 레이아웃로 '보이지 않는 벽' 소멸 | `c4841cf`·`c46c937` |
| INT-RENDER-005 | Game 조립 배선 요청: cargoShip 상태·EventBus 주입 (2줄, 코드 예시 포함) | ✅ **적용 (D+10 통합)** — composeSystems에 attachCargoShipSource·attachEventBus 배선 | 그래픽 `c091f30` |
| INT-TOOL-002 | HUD 조립 보호 파일 최소 변경 (Game.ts +9줄·params/ui.json) | ✅ **채택 (D+10 통합)** | 툴링 `e0f7609` |
| INT-TOOL-003 | 조준·발사 요청 이벤트 3종 | ⛔ 폐기 — INT-CORE-002 AimSystem 단일 진입점으로 대체 | 툴링 기록 |
| INT-TOOL-004 | HUD 전투 버튼 ↔ AimSystem 배선 (Game.ts 선반영, 배선 코드 예시 포함) | ✅ **채택 (D+10 통합)** — combat {aim·torpedo}·bus 주입 | 툴링 `2f8b66f`·`a7c3cdf` |

**미결 요약 (D+10 통합 후):** INT-GAME-004·006·007 수치 이관·격침 보상
결정만 잔여 — 백로그 이월 (R7 임시값 상태 유지, D+10 게이트 데이터에
'임시 초기 테스트값' 표기). HUD·화물선·EventBus 배선은 D+10 통합에서 채택·적용 완료.

## 제안 목록

### INT-CORE-007 — 상위 메타 루프·업그레이드 배율 레이어 구현과 조립

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (PvE 1단계 — INT-CORE-006 계약의 리드 파트 구현) |
| 대상 시스템 | `src/meta/`(신규 — MetaState·MetaLoop·upgradeMath·settlement·provisionalEconomy·__verification__), `src/core/Game.ts`(메타 루프 등록·세션 포트 어댑터·부트 전환 이동) |
| 필요한 변경 | ① 2계층 상태 머신 상위(BASE→SORTIE_PREP→SORTIE→DEBRIEF, 허용표 밖 throw) — 하위 무수정 포장, 통신 3종 제한 ② 정산: 파괴 시 크레딧 손실(임시 50%)·희귀 즉시 확정·저장 요청 발행 ③ 업그레이드 합연산 순수 함수(effectiveValue·effectiveDurationSeconds·mergeModifiers — params 불변) ④ Game 조립: metaLoop 최선두 등록, BOOT→DEPARTURE 전환을 SortieSessionPort 어댑터로 이동(세션 시작이 상위 루프 경유), 기지 화면 도입 전 임시 자동 출항 ⑤ 결정적 검증 19항목(`node src/meta/__verification__/run.mjs`) |
| 변경 이유 | PvE 소회의 결의 2·4의 리드 담당 구현. 각 파트(경제·저장·기지 UI)가 붙을 골격 선행 제공 |
| 관련 게이트 | PvE D+4(메타 루프에서 세션 시작·정산 전달)·D+9(성장 루프 완주) Exit Criteria |
| 영향을 받는 파일 | src/meta/* (신규), src/core/Game.ts |
| 하위 호환 여부 | 하위 세션 코드 무수정 — 기존 결정적 검증 75/75 유지. 부트 전환 경로만 first render → 포트 어댑터로 이동 (동작 동일) |
| 개발 리드 결정 | 승인 (자기 소유 영역). **R7 임시값 1건**: 파괴 손실률 0.5 [30~70%] — `src/meta/provisionalEconomy.ts` 한 곳, 기획 경제 수치표(D+3 병목) 도착 시 `params/economy.json` 이관·파일 삭제 |
| 적용 커밋 | (본 브랜치 [LOOP] 구현 커밋) |

**각 파트 적용 요청 (INT-CORE-006·007 소비):**
- **게임플레이**: ① `src/systems/economy/` — Faction 태그 부여(화물선 hostile부터), 드롭 테이블, `lootDropped` 발행, 중립 공격 판정 → `guardShipRequested` 발행 ② 세션 리셋 API(재출항 시 전투 세션 초기화 — SortieSessionPort 어댑터가 호출할 진입점) 제공 ③ 세션 종료 판정(파괴·귀환 지점 도달) 시 `MetaLoop.settleSortie` 호출 경로는 리드와 조립 협의 ④ 보스 약점 판정 →`bossWeakPointChanged` 발행 (판정 소유)
- **빌드·툴**: ① `src/meta/save/` — SaveSystem(스키마 버전+마이그레이션 틀+이중 슬롯), `saveRequested` 구독, 저장 데이터는 MetaLoop.wallet 등 스냅숏 주입으로 수신 ② 업그레이드 시뮬레이터 — **`src/meta/upgradeMath.ts` 동일 함수 사용**(계산 복제 금지) ③ 스코프 가드 빌드 경고(upgrades.json 8항목↑) ④ HUD에 중도 귀환 버튼 → `returnToBaseRequested` 발행
- **그래픽스**: 기지 화면(`metaStateChanged` 구독 — BASE에서 표시), 보스 연출은 `bossPhaseChanged`·`bossWeakPointChanged` 구독만(판정 계산 금지), 보스 분절 애니 1주차 스파이크(P13)
- **기획**: `params/economy.json`(손실률 50% [30~70]·드롭량)·`params/upgrades.json`(7항목 단계·비용) 작성 — PvE D+3 절대 마감(병목), [ECON] 태그

**PROJECT_STATE.md 갱신용 사실 목록 (통합 담당 최종 갱신 — 리드 기록):**
① 코드 트랙이 PvE 1단계 착수 상태로 진입 — 상위 메타 루프(src/meta)·PvE 계약(contracts/meta.ts) 반영 ② '아직 없는 것' 목록에 PvE 항목 추가 필요: 기지 화면·저장·업그레이드 화면·economy·보스 ③ 조작표는 유효하나 상단 배너의 "PvE 전환 코드 미반영" 문구는 본 브랜치 병합 시 갱신 대상 ④ 구 세션형 범위 설명(§1 '한눈에 보기'의 세션형 정의)은 회의록 10 결의 1·P1로 대체

### INT-CORE-006 — PvE 전환 선행 계약 (메타 루프·경제·업그레이드·보스)

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (6차 대회의 `meetings/10`·개발팀 소회의 `meetings/11` 결의의 계약 번역 — PvE 1단계 착수 선행분) |
| 대상 시스템 | `src/contracts/meta.ts`(신규), `src/contracts/events.ts`(이벤트 9종 추가), `src/contracts/systems.ts`(CargoShipStateSource.faction 선택 필드) |
| 필요한 변경 | ① 메타 타입: `MetaStateId`(BASE/SORTIE_PREP/SORTIE/DEBRIEF)·`SortieOutcome`(returned/aborted/destroyed)·`SortieReport`·`SortieSettlement`(earned/lost/net/희귀 확정)·`SortieSessionPort`(start/requestReturnToBase — 계층 통신 3종 중 상위→하위) ② 경제: `FactionId`(hostile/neutral/patrol 태그)·`LootSource`·`CurrencyBundle`(크레딧·희귀 부품 이원화) ③ 업그레이드: `UpgradeStatId` 7항목 상한·`UpgradeModifiers`(합연산 — 최종값 = 기준값 × (1+보정 합)) ④ 장비: `EquipmentId` 4종 상한·`EquipmentLoadout` ⑤ 보스: `BossPhase`(1/2/3) ⑥ 이벤트: `metaStateChanged`·`sortieStarted`·`sortieEnded`·`returnToBaseRequested`·`lootDropped`·`guardShipRequested`·`saveRequested`(settlement/rarePart)·`bossPhaseChanged`·`bossWeakPointChanged` |
| 변경 이유 | PvE 전환 작업(게임플레이 Faction·드롭, 툴링 저장·시뮬레이터, 렌더 기지·보스 연출)이 전부 이 계약에 의존 — 각 창이 서로 다른 형태로 임시 정의하기 전에 선행 확정 필요 |
| 관련 게이트 | PvE 트랙 전체 (D+9 성장 루프·D+16 완주 Exit Criteria) |
| 영향을 받는 파일 | 계약 3파일 + INTERFACES.md §1·§2c. 소비 측: src/meta(리드), src/systems/economy(게임플레이), src/meta/save(툴링), 렌더 기지·보스 연출 |
| 하위 호환 여부 | 깨짐 없음 — 전부 추가. `faction`은 선택 필드(미지정 = hostile 과도기 호환, 게임플레이 태그 작업 후 필수 승격 예정) |
| 개발 리드 결정 | 승인 — 신 스코프 가드(업그레이드 7항목·장비 4종)를 유니언 타입 상한으로 기계 강제. 계층 통신 3종 제한을 포트+이벤트로 고정. 저장 이벤트는 `saveRequested` 단일(cause 구분)로 통합 |
| 적용 커밋 | (본 브랜치 선행 계약 커밋) |

### INT-CORE-005 — D+10 통합 배선·검증 핸들 (통합 담당 기록)

| 필드 | 내용 |
|---|---|
| 요청자 | D+10 통합 담당 (통합 지시서) |
| 대상 시스템 | `src/core/Game.ts` (공통 보호 — 통합 배선) |
| 필요한 변경 | ① `CanyonScene`·`GameplaySystems`에 `STARTING_CANYON_LAYOUT` **명시 주입** (기본 인자 의존 제거 — 렌더·충돌 단일 인스턴스 감사 가능화) ② `scene.attachCargoShipSource(gameplay.cargoShipState)`·`scene.attachEventBus(bus)` (INT-RENDER-005 이행) ③ 개발 모드 한정 `__deepDiveDebug` 읽기 전용 검증 핸들 (pose·cargo·aim·torpedo·layout·camera — 실제 인스턴스 노출, 더미 없음, 프로덕션 번들 제외, `__deepDiveInput` 관례 준수) |
| 변경 이유 | D+10 통합 지시서 §5 최종 조립 + 실제 Chromium 플레이테스트(§7)의 상태 관측 요구 |
| 관련 게이트 | G1·G3·G5·G6·G7 (통합 검증 전반) |
| 영향을 받는 파일 | `src/core/Game.ts` |
| 하위 호환 여부 | 깨짐 없음 (주입 명시화·배선 추가·dev 전용 핸들) |
| 개발 리드 결정 | 통합 담당 기록 — dev PR 리뷰에서 리드 최종 확인 |
| 적용 커밋 | (D+10 통합 커밋) |

### INT-TOOL-005 — 입력 모드 2원화 확정: '조준 버튼 = Pointer Lock 진입 겸용' 해석 폐기

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴·UI (화면 버튼·Pointer Lock 실브라우저 최종 검증) |
| 대상 시스템 | `src/ui/ControlsHud.ts`(일시정지 오버레이 — 모드 선택), 회의 결정 해석 |
| 필요한 변경 | **회의 문구 해석 기록** — "조준 버튼은 Pointer Lock 진입 요소도 겸할 수 있음"은 실브라우저 제약과 충돌: Pointer Lock 상태에서는 커서가 없어 DOM 버튼을 클릭할 수 없으므로, 조준 버튼이 잠금을 걸면 그 즉시 발사 버튼을 누를 수 없게 된다. **"플레이어가 마우스 방식과 화면 버튼 방식 중 선택 가능"이라는 핵심 목표를 우선**하여 다음 규칙으로 확정: ① 캔버스 클릭 = Pointer Lock **마우스 모드** 진입(우클릭 조준·좌클릭 발사) ② 화면 조준·발사 버튼 = **잠금 없는 UI 모드**에서 같은 AimSystem의 beginAim()/fireTorpedo() 직접 호출(강제 재잠금 없음, 게임 루프 실행 유지) ③ Esc = 마우스 모드 종료 → 일시정지 오버레이에서 '마우스 모드로 계속(잠금 재진입)' / **'화면 버튼으로 계속(잠금 없음)'** 중 선택 ④ 두 모드는 동일 `gameplay.aim`·잔탄·재장전 상태 공유 |
| 변경 이유 | 실브라우저 검증에서 확인: Esc 해제 시 무조건 일시정지+전체 오버레이라 화면 버튼 모드로 계속할 경로가 없었음(버튼 모드 차단). 오버레이에 잠금 없는 재개 경로 1개를 추가하는 것이 최소 변경(가상 커서·버튼 전용 시스템·잠금 중 DOM 클릭 흉내 전부 배제) |
| 관련 게이트 | G3(60초 첫 발사 — 두 입력 경로 모두), G5 |
| 영향을 받는 파일 | src/ui/ControlsHud.ts(+오버레이 선택 버튼 2개·resumeWithoutLock), src/styles.css(스타일 — 자율 영역). 계약·Game.ts 무변경 |
| 하위 호환 여부 | 유지 — 기존 배경 클릭(마우스 모드 재개)·Esc 일시정지 동작 그대로, 경로 추가만 |
| 개발 리드 결정 | **확인 대기** — 회의 문구와 해석이 다른 지점이므로 리드·기획 확인 요청. 실측 근거: 시나리오 A/B/C 브라우저 검증 20/20 (모드 전환·상태 공유·중복 발사 없음) |
| 적용 커밋 | (이 브랜치의 입력 모드 2원화 커밋) |

### INT-TOOL-004 — HUD 전투 버튼 ↔ AimSystem 배선 (Game.ts 선반영 — 리드 확인 대기)

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴·UI (HUD ↔ AimSystem 연결 작업) |
| 대상 시스템 | `src/core/Game.ts`(공통 보호 — composition root 배선), `src/ui/ControlsHud.ts` |
| 필요한 변경 | ① `composeSystems()`가 `GameplaySystems`를 반환 ② `start()`에서 HUD에 `{ aim: gameplay.aim, torpedo: gameplay.torpedo }`·`bus` 주입 — INT-CORE-002의 "HUD 버튼은 composition root에서 같은 aim 인스턴스 호출" 규칙의 실배선. 정확한 코드는 아래 예시 |
| 변경 이유 | 임시 `CombatIntentSink`(개발 로그) 제거, 화면 버튼이 실제 조준·발사를 수행해야 함. HUD는 게임플레이 구현체를 import하지 않고 계약 단면(`Pick<AimSystem,...>`)만 본다 |
| 관련 게이트 | G3, G7 |
| 영향을 받는 파일 | src/core/Game.ts(+약 12줄), src/ui/ControlsHud.ts(sink 삭제·이벤트 구독) |
| 하위 호환 여부 | 유지 — 계약 무변경, composeSystems 반환 타입만 void→GameplaySystems |
| 개발 리드 결정 | **확인 대기** — 작업 지시에 따라 선반영. feat→dev 병합 시 리드가 이 배선을 채택·재작성 |
| 적용 커밋 | (이 브랜치의 HUD 연결 커밋) |

리드가 dev 병합 시 사용할 배선 코드 (Game.start, composeSystems 뒤):

```ts
const gameplay = this.composeSystems(params, scene); // 반환 타입: GameplaySystems
this.registry.initializeAll({ bus: this.bus, params, stateMachine: this.stateMachine });

this.controlsHud = new ControlsHud(this.container, canvas, {
  setPaused: (paused) => (paused ? this.loop.stop() : this.loop.start()),
  combat: { aim: gameplay.aim, torpedo: gameplay.torpedo },
  bus: this.bus,
});
// stop()에서: this.controlsHud?.dispose(); this.controlsHud = null; (registry.disposeAll 앞)
```

**후속(리드 배선 대기 — 렌더 브랜치 병합 시):** 화물선 상태 주입은 현재
CanyonScene에 `attachCargoShipSource`가 없어(렌더 `cbcbf65` 미병합) 배선
불가 — 더미·캐스팅 없이 보류. 렌더 병합 후 composeSystems의
`scene.attachPoseSource(gameplay.poseSource);` 바로 아래에 한 줄 추가:

```ts
scene.attachCargoShipSource(gameplay.cargoShipState); // CargoShipStateSource 계약 — ARCHITECTURE 'Game 조립 계약'
```

### INT-TOOL-003 — [폐기] 조준·발사 요청 이벤트 3종 제안 (구 #004)

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴·UI (조작 HUD 작업 — 당시 조준 계약 부재) |
| 필요한 변경 | ~~`aimStartRequested`/`aimEndRequested`/`torpedoFireRequested` 이벤트 신설~~ |
| 개발 리드 결정 | **폐기** — INT-CORE-002가 상위 해법으로 대체: 요청 이벤트 대신 `AimSystem` 공용 진입점 직접 호출(배선은 composition root) + 상태 통지는 `aimModeChanged`. 계약 파일은 처음부터 미수정이라 되돌릴 코드 없음. 함께 기록했던 이동 파라미터 4종 중 프로펠러 공회전(0.08)은 INT-CORE-002로, 후진·수직 비율은 INT-GAME-004로 각각 흡수됨 — '정지 시 선회 속도 배율 1.0'만 미이관(소비 코드 없음, 필요 시 기획·게임플레이가 INT-GAME-004 절차에 합류) |
| 적용 커밋 | (해당 없음 — 문서상 폐기) |

### INT-TOOL-002 — HUD 조립을 위한 보호 파일 최소 변경 (구 #003, 선반영 — 확인 대기)

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴·UI (조작 HUD 작업) |
| 대상 시스템 | `src/core/Game.ts`(공통 보호), `params/`(기획 소유 영역에 ui.json 신규) |
| 필요한 변경 | ① Game.start()에서 `ControlsHud` 생성·일시정지를 `GameLoop.stop()/start()`로 연결, stop()에서 dispose — 조립 코드만, 게임 규칙 없음 ② `params/ui.json` 신규(HUD 투명도·표시 기본값·존재감 축소 기준 5종) — GameParams 계약·validateParams는 무변경, 검증·핫리로드는 툴링 소유 `src/ui/uiParams.ts`에서 독립 수행 |
| 변경 이유 | HUD를 화면에 띄우는 유일한 조립 지점이 Game.start()임. 일시정지는 기존 GameLoop 재사용(새 상태 머신 상태 추가 없음) |
| 관련 게이트 | G3~G5 |
| 영향을 받는 파일 | src/core/Game.ts(+9줄), params/ui.json, src/ui/*, src/styles.css(스타일 추가 — 자율 영역) |
| 하위 호환 여부 | 유지 — 기존 계약·이벤트·검증 무변경 |
| 개발 리드 결정 | **확인 대기** — 작업 지시에 따라 선반영. params/ui.json은 기획 파트 통보 필요(밸런스 값 아닌 HUD 표시값) |
| 적용 커밋 | (이 브랜치의 HUD 커밋) |

### INT-RENDER-005 — Game 조립 배선 요청: 화물선 상태·torpedoHit 이벤트 주입 (코드 예시 포함)

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (feat/render — INT-CORE-003·004 적용 완료 분) |
| 대상 시스템 | `src/core/Game.ts` (공통 보호 — composeSystems) |
| 필요한 변경 | 렌더가 준비한 주입 포트 2개를 composition root에서 연결. `composeSystems()`의 기존 `scene.attachPoseSource(gameplay.poseSource);` 다음 줄에:<br>`scene.attachCargoShipSource(gameplay.cargoShip);`<br>`scene.attachEventBus(this.bus);`<br>(레이아웃은 CanyonScene 생성자 기본 인자 `STARTING_CANYON_LAYOUT` — 명시 주입으로 바꾸려면 `new CanyonScene(renderer, STARTING_CANYON_LAYOUT)`) |
| 변경 이유 | 화물선 시각(CargoShipVisual)이 계약 상태를 소비하고 torpedoHit로 폭발을 시작하려면 composition root 연결이 필요. 렌더는 보호 파일을 수정하지 않고 포트만 제공(임시 배선으로 동작 검증 완료 — 항행·명중 폭발·sinkProgress 침몰·removed 정리 실측 스크린샷 확보 후 원복) |
| 관련 게이트 | G3 (명중 피드백), G6·G7 |
| 영향을 받는 파일 | `src/core/Game.ts` 2줄 추가 (렌더 측 변경 불요 — 포트 준비 완료) |
| 하위 호환 여부 | 깨짐 없음 — 미배선 상태에서도 빌드·기본 장면 정상(화물선 미표시, 폭발은 상태 hit 보조 경로) |
| 개발 리드 결정 | 승인 — D+10 통합에서 배선 (attachCargoShipSource는 공식 공개 프로퍼티 `gameplay.cargoShipState` 사용, 캐스팅 없음) |
| 적용 커밋 | (D+10 통합 커밋 — feat(integration) assemble D+10) |

### INT-RENDER-004 — [보고] 렌더 협곡 벽 높이와 충돌 미러 불일치 (INT-GAME-005 후속) — ✅ INT-CORE-004로 해소

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (feat/render) — **통합 담당 보고용** (계약 변경 요청 아님) |
| 대상 시스템 | `src/render/CanyonScene.ts`(렌더 배치) vs `src/systems/collision/startingArea.ts`(충돌 미러) |
| 필요한 변경 | 없음 — 차이 보고. 그래픽스는 D+5 후속에서 수중 해수면·화물선 실루엣 시인성을 위해 벽 높이를 낮췄으나(`11 + 2·sin(i·2.7)` / `12 − 2·sin(i·2.7)`, 이전 `15 + 3·sin` / `16 − 3·sin`), 충돌 미러는 이전 높이 기준이다. **수평 footprint(X 중심·폭·Z·기둥 3개)는 1:1 동일** — 차이는 벽 높이뿐. 효과: 가시 능선 상단(좌 +3~+7 / 우 +4~+8)과 충돌 상단(좌 +6~+12 / 우 +7~+13) 사이 약 4m 구간에서 '보이지 않는 벽' — 연속 상승(수면 상한 +12.5)으로 능선 위를 넘으려 할 때 시각적으로는 통과 가능해 보이나 충돌에 막힘. 임의로 한쪽을 복제 수정하지 않고(렌더 낮춤은 시인성 근거, 충돌 높임은 게임플레이 소유) 리드의 INT-GAME-005 단일 레이아웃 결정에 합류한다. 결정 전 잠정 대응이 필요하면 리드 판단: ⓐ 렌더 벽 높이를 미러 값으로 복원(수면 시인성 후퇴) ⓑ 미러 높이를 렌더 값으로 갱신(게임플레이 창 작업) |
| 변경 이유 | 렌더-충돌 불일치는 G4·G6 관찰을 오염시킬 수 있음 — 통합 전 명시 보고 |
| 관련 게이트 | G4 (심도 조절 이해), G5 (방향 상실), G6 (지형 은신) |
| 영향을 받는 파일 | `src/render/CanyonScene.ts`, `src/systems/collision/startingArea.ts` |
| 하위 호환 여부 | 해당 없음 (보고) |
| 개발 리드 결정 | (대기 — INT-GAME-005와 함께) |
| 적용 커밋 | — |

### INT-RENDER-003 — 화물선 상태 계약 정의 요청 (렌더 소비용, 구 #003 재정리) — ✅ INT-CORE-003으로 해소

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (feat/render) |
| 대상 시스템 | `src/contracts/systems.ts`(화물선 시스템 인터페이스) 또는 `src/contracts/events.ts`(명중·격침 이벤트 — INT-GAME-006 ②와 동일 사안이므로 **합류 결정 요청**) |
| 필요한 변경 | 렌더가 소비할 화물선 읽기 전용 상태: 위치 X/Z(+흘수 기준 Y는 렌더 상수), `headingRadians`, 격침 여부. 현재 렌더는 자체 소비 인터페이스 `CargoShipStateSource`(CanyonScene.ts — positionX/Z·headingRadians·isSunk)를 정의해 두고 `attachCargoShipSource()` 주입 포트로 대기 중. 게임플레이 `TargetRegistry.CombatTarget`(positionX/Y/Z·velocityX/Z·hitRadius·onTorpedoHit)과 형태가 이웃하므로, 화물선 시스템(D6~D9) 설계 시 ⓐ CombatTarget 확장(+heading·격침 상태) ⓑ 별도 상태 인터페이스 ⓒ `torpedoHit`/`shipSunk` 이벤트 중 리드가 결정하면 렌더 측 인터페이스를 그 계약으로 교체한다. 침몰 연출 시작은 결정된 이벤트 또는 상태 전이 1회 통지면 충분 |
| 변경 이유 | 화물선 시각 표현(임시 표적·실루엣·명중 폭발·침몰)은 렌더에 준비 완료됐으나 정식 화물선 시스템·계약이 아직 없음(게임플레이 D6~D9 예정). 렌더에서 이동·판정 로직을 만들지 않는 원칙 유지 |
| 관련 게이트 | G3 (명중 피드백 가독성), G1 |
| 영향을 받는 파일 | `src/contracts/systems.ts` 또는 `events.ts`, `src/render/CanyonScene.ts`, `src/render/CargoShipVisual.ts`, (게임플레이 화물선 시스템 — D6~D9) |
| 하위 호환 여부 | 깨지지 않음 — 미주입 시 정지 표적 렌더. `?shipdemo`는 침몰 연출 미리보기(이동·판정 시연 없음)로 축소됨 |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### INT-CORE-004 — 협곡 레이아웃 단일 데이터 모듈·카메라 리센터 규약 이의(二義) 해소

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (그래픽 INT-RENDER-004·게임플레이 INT-GAME-005 보고 합류 — 통합 차단 2건) |
| 대상 시스템 | `src/world/startingCanyonLayout.ts`(신규 — CanyonLayout 데이터 인스턴스), `src/core/conventions.ts`(카메라 함수 교체) |
| 필요한 변경 | ① `STARTING_CANYON_LAYOUT`: floorY −6·seaSurfaceY 12·spawn (0,0,0)·S자 수로 벽 22개+기둥 3개 — 렌더 `buildCanyonBlockout` 수식과 충돌 `startingArea.ts` 미러의 유일 대체 소스. **벽 높이는 그래픽 하향값(좌 11+2·sin/우 12−2·sin) 확정** — 상단 최대 Y=7 < 해수면 12(시인성), 충돌 동일 데이터 소비로 '보이지 않는 약 4m 벽'(구 15/16±3·sin 미러) 소멸 ② `cameraRecenterYawRadians` **폐기** — '시선 요'와 '위치 오프셋 요' 이중 해석으로 구 CameraRig가 카메라를 선수 쪽에 배치(W 전진 시 화면 바깥쪽 이동). 대체: `cameraRecenterOffsetDirectionXZ`(=선미 방향, 카메라 위치 오프셋)·`cameraRecenterLookDirectionXZ`(=선수 방향, 시선) — 하나의 yaw를 두 의미로 재사용 금지 |
| 변경 이유 | 렌더 벽 하향 후 충돌 미러가 구 높이를 유지해 투명 충돌 벽 발생 보고. 카메라 규약은 그래픽 보고의 이의성 확인 — cbcbf65는 `+π` 보정으로 우회 중이며 규약 자체를 무이의화해야 재발 방지 |
| 관련 게이트 | G1(렌더·충돌 정합), G4·G5(카메라 방향·조작 이해) |
| 영향을 받는 파일 | 신규 데이터 모듈, conventions.ts + docs 4종. 적용 측: 그래픽스(blocks→메시 생성, CameraRig를 오프셋 방향 함수 기준으로 정리 — `+π` 우회 제거), 게임플레이(startingArea 미러 삭제, blocks→충돌체 AABB 변환 — 근사 규칙은 소비측 유지) |
| 하위 호환 여부 | `cameraRecenterYawRadians` 소비자는 cbcbf65 CameraRig 1곳 — 병합 시 새 함수로 교체 필요(동작은 동일 결과: 선미 뒤 배치). 레이아웃 blocks 수치는 그래픽 현행과 1:1이라 시각 변화 없음. 충돌은 벽 높이 4~5m 하향 = 투명 벽 제거(의도) |
| 개발 리드 결정 | 승인 — 데이터 모듈 위치는 `src/world/`(공용 데이터 영역 신설, 공통 보호에 준함 — FILE_OWNERSHIP 회색 지대 갱신). 소비는 composition root 주입 우선. 벽 상단~해수면 개방 수역은 회색 박스 단계 허용, 상층 제약은 레벨 데이터로 후속 |
| 적용 커밋 | `c4841cf` |

### INT-GAME-007 — 화물선 수치 이관 + 격침 보상(어뢰 +1) 배선 결정 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (CargoShipSystem 작업 창) |
| 대상 시스템 | `params/combat.json`+`src/contracts/params.ts`(CombatParams 또는 신규 cargo 구획), CanyonLayout 데이터 모듈(INT-CORE-003 후속), `TorpedoSystem`(보상 지급 경로) |
| 필요한 변경 | ① 화물선 수치 이관 — 항행 속력(임시 4 m/s)·명중 반경(9 m)·침몰 시간(6 s)은 params로, 왕복 경로 끝점·해수면 높이(12 — 렌더 SEA_SURFACE_Y와 정합)는 CanyonLayout 데이터 모듈로. 현재 `src/systems/provisionalCargo.ts`·`provisionalWorld.ts`(PROVISIONAL_SEA_SURFACE_Y) R7 선진행 ② 해수면 정합에 따라 잠수함 수직 상한을 12.5→11(해수면 12 − 선체 반경 1)로 조정함 — 수면 돌출 방지, 레벨 값 확정 시 재검토 ③ 격침 보상 어뢰 +1 [확정 §5.9]: `torpedoHit` 구독으로 지급하는 주체·TorpedoSystem 잔량 증가 경로(메서드 추가 필요 — 계약 변경) 결정 요청 |
| 변경 이유 | CargoShipSystem(직선 왕복·1발 격침·침몰 시간축) 구현 완료 — 수치·레이아웃 값의 정식 소스와 보상 지급 경로만 남음 |
| 관련 게이트 | G3(첫 발사 표적), G6·G7 |
| 영향을 받는 파일 | `params/combat.json`, `src/contracts/params.ts`, `src/config/validateParams.ts`, CanyonLayout 데이터 모듈(위치 미정), `src/systems/CargoShipSystem.ts`, `src/systems/provisionalCargo.ts`(삭제), `src/systems/provisionalWorld.ts`(부분 삭제), `src/contracts/systems.ts`(TorpedoSystem 보상 메서드 — 리드 결정) |
| 하위 호환 여부 | 깨짐 없음 (이관·추가만) |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### INT-CORE-003 — 통합 상태 계약 확정 (포즈·화물선·torpedoHit·레이아웃·파라미터 단일 소스)

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (D6 통합 전 각 파트 구현 보고 종합 — 임시 인터페이스·중복 파라미터 해소) |
| 대상 시스템 | `src/contracts/systems.ts`(SubmarinePoseSource·CargoShipStateSource 추가), `src/contracts/events.ts`(torpedoHit 추가), `src/contracts/layout.ts`(신규 — CanyonLayout·CanyonBlockDescriptor) |
| 필요한 변경 | ① 잠수함 포즈 정식 계약: positionX/Y/Z·headingRadians·forwardSpeedMetersPerSecond(부호: + 선수/− 선미). positionY는 심도 보간 포함 월드 Y ② 프로펠러는 공식 forwardSpeed + `conventions.propellerSpinRatio()`만 사용 — 렌더의 위치 차분 속도 재계산 금지 ③ propellerIdleSpinRatio·최고 속력의 공식 소스는 `params/movement.json` 단일 — renderVisualParams.json의 `idleSpinRatio`·`fullSpinAtSpeedMps` 중복 정의 제거(조립 시 주입으로 대체) ④ 화물선 상태 계약: id·positionX/Y/Z·heading·velocityX/Z·hit·sinkProgress(0~1, 시간축 게임플레이 소유)·removed ⑤ `torpedoHit { targetId, x, z }` 이벤트 ⑥ 렌더·충돌 공용 레이아웃 인터페이스(CanyonLayout — 인터페이스만, 데이터 모듈은 후속) ⑦ composition root 연결 지도 문서화 (ControlsHud→동일 AimSystem, CargoShipSystem→TargetRegistry/CargoShipVisual, pose→장면/프로펠러, torpedoHit→상태·렌더·오디오) |
| 변경 이유 | 게임플레이가 구현한 positionY·부호 있는 속도가 정식 계약에 없어 렌더가 위치 차분으로 재계산 중(판정 복제), 렌더가 공회전 비율을 중복 정의, 화물선 상태·명중 통지가 렌더 로컬 임시 인터페이스(CanyonScene 內 CargoShipStateSource)로만 존재, CanyonScene과 충돌 startingArea가 배치 복제 |
| 관련 게이트 | G1(연출 역추적), G3(조준·발사 경로 단일화), G6·G7(표적·명중 인과) |
| 영향을 받는 파일 | 계약 3파일 + `docs/ARCHITECTURE.md`·`INTERFACES.md`. 적용 측: 게임플레이(poseSource·CargoShipSystem·torpedoHit 발행), 그래픽스(CanyonScene 로컬 타입→계약 import, Propeller 속도 입력 교체, renderVisualParams 중복 키 제거), UI(CombatIntentSink→AimSystem 위임) |
| 하위 호환 여부 | 기존 코드 깨짐 없음 — 전부 추가(기존 PlayerController·이벤트 불변). dev 빌드·검증 21/21 유지. feat/render의 로컬 CargoShipStateSource는 계약과 필드 확장 차이(velocity·hit/sinkProgress/removed 세분화)가 있어 병합 시 계약 쪽으로 교체 필요 |
| 개발 리드 결정 | 승인 — PlayerController 확장 대신 별도 SubmarinePoseSource로 공식화(기존 구현·검증 불파괴). 침몰 시간축은 게임플레이 소유('판정이 타이밍의 주인' 원칙 일관 적용), 렌더 sinkDurationSeconds는 진행률 매핑 상수로만 유지. 레이아웃 데이터 모듈 위치는 후속 결정(제안: 리드 승인 공용 모듈 — 레벨 산출물 반영 시 데이터만 교체) |
| 적용 커밋 | `efd4712` |

### INT-GAME-006 — 어뢰 수치 params 이관 + 명중 통지 이벤트 신설 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (어뢰 전투 작업 창 — 통합 순서 [5]) |
| 대상 시스템 | `params/combat.json`+`src/contracts/params.ts`(CombatParams), `src/contracts/events.ts`(신규 이벤트) |
| 필요한 변경 | ① `CombatParams`에 어뢰 속력(현 임시값 20 m/s)·최대 사거리(현 임시값 90 m) 이관 — `src/systems/provisionalCombat.ts` R7 선진행 중(INT-GAME-001 절차), 조정 범위·판단 기준은 기획 튜닝표 행 추가 후 확정 ② `torpedoHit { x, z, targetId }`(함선 명중)·어뢰 소멸(환경 충돌·사거리 초과) 이벤트 신설 검토 — 현재 명중은 표적 객체의 `onTorpedoHit` 콜백(1회 보장)으로만 통지되어 게임플레이 내부는 충분하나, 렌더 명중 폭발 연출(CargoShipVisual)·오디오 폭발음 동기화가 이벤트 구독을 원할 때 필요. 격침 상태 노출은 화물선 시스템(D6~D9)에서 별도 결정 |
| 변경 이유 | 어뢰 직선 주행·사거리 제거·명중 1회 판정 구현 완료 — 수치 이관과 표현 계층 통지 경로 결정이 남음 |
| 관련 게이트 | G3 (60초 첫 발사), G7 |
| 영향을 받는 파일 | `params/combat.json`, `src/contracts/params.ts`, `src/config/validateParams.ts`, `src/contracts/events.ts`, `src/systems/StraightRunTorpedoSystem.ts`, `src/systems/provisionalCombat.ts`(삭제) |
| 하위 호환 여부 | 깨짐 없음 (필드·이벤트 추가만) |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### INT-CORE-002 — 공통 공간·방향 규약(conventions)·AimSystem 계약·프로펠러 공회전 파라미터

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (D+5 플레이테스트 리뷰·화면 버튼/A/D 프로펠러 입력 소회의 후속) |
| 대상 시스템 | `src/core/conventions.ts`(신규), `src/contracts/systems.ts`(AimSystem 추가), `src/contracts/events.ts`(aimModeChanged 추가), `src/contracts/params.ts`+`src/config/validateParams.ts`+`params/movement.json`(propellerIdleSpinRatio 추가) |
| 필요한 변경 | ① 축 규약 코드화: 로컬 -Z=선수·+Z=선미·월드 +Y=위, `bowDirectionXZ`/`sternDirectionXZ`/`meshYawRadians`/`cameraRecenterYawRadians`(선미 뒤 상단→선수 방향 후방 뷰)/`propellerSpinRatio` ② AimSystem 공용 입력 계약: 마우스·HUD 버튼이 동일 인스턴스의 `beginAim`(잠망경 심도 아니면 false)·`endAim`·`fireTorpedo` 호출, 상태 `aiming` ③ `aimModeChanged { aiming }` 이벤트 (조준 카메라 고정·UI용) ④ 프로펠러 공회전 비율 0.08 기본, FixedNumber(0~1 검증)로 외부 조정 |
| 변경 이유 | 이동·카메라·프로펠러·UI·어뢰가 축 방향·전투 입력 경로를 서로 다르게 구현하는 것을 방지 (D+5 리뷰 결정의 코드화). 프로펠러 회전은 실제 전후 속도만 입력받는 시그니처로 'A/D 단독 입력 무영향'을 강제 |
| 관련 게이트 | G3·G5 (조작·카메라 일관성), 직접 수치 게이트 없음 |
| 영향을 받는 파일 | 위 대상 + `docs/ARCHITECTURE.md`(규약 章)·`docs/INTERFACES.md`(§1·§2·§3 행) |
| 하위 호환 여부 | 기존 구현과 정합(추가만) — 기존 SubmarinePlayerController 전진 벡터·CanyonScene `mesh.rotation.y`·CameraRig `heading+π` 배치와 동일 정의. MovementParams 필드 추가는 JSON·검증 동시 반영으로 로드 깨짐 없음. AimSystem·aimModeChanged는 신규(구현 D6) |
| 개발 리드 결정 | 승인 — 규약 함수는 core 소유로 두고, 조준은 '별도 전투 시스템 금지·AimSystem 단일 진입점'을 계약으로 강제. 프로펠러 최대 각속도(rad/s)는 렌더 연출 상수로 파라미터화하지 않음(밸런스 아님) |
| 적용 커밋 | `b69890b` |

### INT-GAME-005 — 협곡 레이아웃 단일 소스화 + 렌더의 수직 위치 소비

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (D+5 리뷰 스프린트 '이동·충돌' 작업 창) |
| 대상 시스템 | 레벨 레이아웃 데이터 소유 구조(신설 필요 — 리드 결정), `src/render/CanyonScene.ts`(렌더 소유 — 제안만) |
| 필요한 변경 | ① 협곡 배치(벽·기둥)를 렌더·충돌·시야 차폐가 **공유하는 단일 레이아웃 데이터**로 분리 — 현재 게임플레이는 렌더 직접 참조 금지 규칙 때문에 `src/systems/collision/startingArea.ts`에 CanyonScene.buildCanyonBlockout의 결정식을 **미러(임시 중복)**로 유지 중. 정식 레벨 블록아웃(레벨 디자인 D+5 산출물) 수신 시점에 통합 권장 ② CanyonScene이 잠수함 수직 위치를 소비하도록 `SubmarinePoseSource`에 `positionY` 추가 (현재 SUBMARINE_Y=0 고정 렌더 — 연속 상승·하강이 화면에 보이지 않음) |
| 변경 이유 | 연속 심도 이동·충돌이 게임플레이에 들어왔으나 렌더가 y를 소비하지 않으면 D+7 빌드에서 상승·하강이 보이지 않음. 레이아웃 중복은 배치 변경 시 렌더-충돌 불일치 위험 (R12 유사) |
| 관련 게이트 | G4 (심도 조절 이해), G6 (지형 은신 — 시야 차폐가 같은 충돌체 집합 재사용) |
| 영향을 받는 파일 | `src/render/CanyonScene.ts`, `src/systems/collision/startingArea.ts`(교체·삭제), 시야 차폐(D10~12) 설계 |
| 하위 호환 여부 | 렌더 poseSource 필드 추가는 하위 호환. 레이아웃 분리는 렌더 내부 재배선 필요 |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### INT-GAME-004 — PlayerController 수직 상태·부호 속도 계약 반영 + 이동 신규 수치 이관

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (D+5 리뷰 스프린트 '이동·충돌' 작업 창) |
| 대상 시스템 | `src/contracts/systems.ts`의 `PlayerController`·`DepthSystem` 주석 의미, `src/contracts/params.ts`의 `MovementParams`, `params/movement.json`, `docs/DECISIONS.md` #2·`docs/INTERFACES.md` |
| 필요한 변경 | ① `PlayerController`에 `positionY`(수직 위치) 추가, `speed` 주석을 **부호 있는 전후 속도**(양수=전진)로 갱신 — 관리 창 제안 **INT-RENDER-002**(프로펠러 S7용 전후 부호 속도)와 동일 사안이므로 합류 결정 요청 ② `MovementParams`에 후진 비율(0.5)·수직 비율(0.5) 이관 — 현재 `src/systems/provisionalMovement.ts` R7 선진행 (INT-GAME-001과 동일 절차) ③ 수직 상한(12.5)·하한(-5)·심도 구간 경계(잠망경 ≥8 / 순항 ≥-2)는 레벨 값 성격 — params 또는 레벨 데이터로 이관 결정 필요, 현재 `src/systems/provisionalWorld.ts` 선진행 ④ `DepthSystem` 의미 변경 기록: 4차 대회의(D+5 리뷰) 결의에 따라 층 단위 이동 → **연속 이동 + 높이 기반 3구간 판정**. 인터페이스(`currentLayer`·`requestAscend`/`requestDescend`·`depthChanged`)는 유지 — 요청 메서드는 프로그래매틱 층 이동 경로로 존치. 마스터 플랜 §3.4·DECISIONS #2와 상충하므로 **리드의 각주 처리 필요** (마스터 플랜은 게이트 전 수정 금지 — NEXT_SPRINT 방식의 회의록 각주 관리, R16 원본 재대조 대상) |
| 변경 이유 | 스프린트 지시(W 전진/S 후진/Shift·Ctrl 연속 상승 하강/수면·해저 한계/높이 기반 구간 판정) 구현 완료 — 계약·문서 정합과 수치 이관이 남음. 구현은 계약 파일을 건드리지 않고 확장 상태(구현체 프로퍼티)로 선진행 |
| 관련 게이트 | G3, G4, G5, G7 (속도·심도는 소음·탐지·회피의 입력값) |
| 영향을 받는 파일 | `src/contracts/systems.ts`, `src/contracts/params.ts`, `src/config/validateParams.ts`, `params/movement.json`, `src/systems/SubmarinePlayerController.ts`, `src/systems/LayeredDepthSystem.ts`, `src/systems/provisionalMovement.ts`(삭제)·`provisionalWorld.ts`(삭제), `docs/INTERFACES.md`, `docs/DECISIONS.md`(리드만) |
| 하위 호환 여부 | 깨짐 없음 — 인터페이스 추가·주석 갱신. `speed`가 음수를 가질 수 있게 된 점은 소비 측(소음 산출 등)이 \|speed\| 사용 필요 (현재 소비자 없음) |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### INT-GAME-003 — AimSystem 진입점 계약 신설 [종결 — INT-CORE-002로 대체]

| 필드 | 내용 |
|---|---|
| 요청자 | 작업 관리자 (8차 소회의 결의 1 이행 — 실구현 협의는 오세진·임찬영) |
| 대상 시스템 | `src/contracts/systems.ts` — 조준·발사 진입점. 기존 `TorpedoSystem.fire()`와의 관계 정리 필요 |
| 필요한 변경 | 8차 결의 1: 마우스(우클릭 홀드 조준/좌클릭 발사)와 화면 버튼이 **동일한** 조준·발사 시스템을 호출해야 하며, 진입점은 `AimSystem.enter()` / `AimSystem.fire()` 2개만 존재하도록 강제. 선택지: ① TorpedoSystem에 `enterAim()/exitAim()` 추가 ② 별도 AimSystem 인터페이스 신설 후 TorpedoSystem.fire() 위임 — 리드 결정 필요 |
| 변경 이유 | 입력 경로 이원화(마우스/버튼)로 조준 시스템이 갈라지면 밸런스 테스트 2배 (8차 회의 박태현 우려의 원천 차단) |
| 관련 게이트 | G3 (버튼 = 튜토리얼 겸용), G7 |
| 영향을 받는 파일 | `src/contracts/systems.ts`, `docs/INTERFACES.md`, (구현) `src/systems/*`, (버튼) `src/ui/*` |
| 하위 호환 여부 | TorpedoSystem 구현체 아직 없음 — 지금 결정하면 깨짐 없음. **D+7 마감 내 흡수 전제이므로 조기 결정 필요 (스프린트 병목)** |
| 개발 리드 결정 | 종결 — INT-CORE-002가 AimSystem 계약(beginAim/endAim/fireTorpedo 단일 진입점)으로 확정 |
| 적용 커밋 | (INT-CORE-002 참조) |

### INT-RENDER-002 — 전후 부호 있는 속도 노출 [종결 — INT-CORE-003으로 대체]

| 필드 | 내용 |
|---|---|
| 요청자 | 작업 관리자 (8차 소회의 결의 2 이행 — 실소비자는 그래픽스 프로펠러 렌더) |
| 대상 시스템 | `src/contracts/systems.ts`의 `PlayerController` — 현재 `speed`는 부호 규약 미명세 |
| 필요한 변경 | 프로펠러 회전 = "실제 전후 속도값의 함수 (W 정회전 / S 역회전, 하한 공회전)"이므로 렌더가 **부호 있는 전후 속도**를 읽을 수 있어야 함. 선택지: ① `speed`를 부호 있는 값으로 명세 확정 ② `signedSpeed` 별도 노출 — 리드 결정 필요. `A/D`는 이 값에 어떤 항도 추가하지 않음 (8차 결의 2) |
| 변경 이유 | 규약 없는 곳에서 구현자 임의 판단 방지 (8차 회의 개최 사유 그 자체) |
| 관련 게이트 | G5 |
| 영향을 받는 파일 | `src/contracts/systems.ts`, `docs/INTERFACES.md`, `src/systems/SubmarinePlayerController.ts`, (소비) `src/render/*` 프로펠러 |
| 하위 호환 여부 | 현 구현(`SubmarinePlayerController`)의 내부 속도 부호 규약 확인 후 명세화 — 명세만 추가하면 깨짐 없음 |
| 개발 리드 결정 | 종결 — INT-CORE-003이 SubmarinePoseSource.forwardSpeedMetersPerSecond(부호: + 선수/− 선미)로 확정. PlayerController.speed는 비부호 속력 유지 |
| 적용 커밋 | (INT-CORE-003 참조) |

### INT-TOOL-001 — Node 버전 고정(engines)·ParamLoader 핫리로드 내부 교체

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴 (단계 0 잔여 작업 지시) |
| 대상 시스템 | `package.json`(공통 보호 — engines만), `src/config/ParamLoader.ts`(공통 보호에 준함 — 내부만) |
| 필요한 변경 | ① engines `>=20` → `>=22 <23` (.nvmrc `22.22.2`·.npmrc engine-strict와 한 세트) ② ParamLoader에 Vite HMR 기반 params 핫리로드 — `loadParams()` 인터페이스 유지, `onParamsReloaded()` 구독 함수 추가. 검증 규칙(validateParams.ts)은 무변경 |
| 변경 이유 | 단계 0 완료 조건 — 로컬·CI·배포 Node 일원화(재현성), 빌드 없이 params 반영(§10.2 핫리로드) |
| 관련 게이트 | G1·G2 (계측·배포 재현성), 튜닝 루프 전반 |
| 영향을 받는 파일 | package.json, .nvmrc(신규), .npmrc(신규), src/config/ParamLoader.ts, .github/workflows/ci.yml |
| 하위 호환 여부 | 유지 — `loadParams()` 시그니처·검증 동작 불변. Node 20 로컬 환경은 engine-strict로 차단됨(의도) |
| 개발 리드 결정 | 승인 — D+5 통합 리뷰에서 확인. engines·핫리로드 모두 인터페이스 불변, 검증 규칙 무변경 |
| 적용 커밋 | `5b33dec` |

### INT-CORE-001 — 시스템 수명주기(GameSystem)·등록 구조(SystemRegistry) 도입 (기록용)

| 필드 | 내용 |
|---|---|
| 요청자 | 개발 리드 (D3, D+5 회색 박스 통합 준비) |
| 대상 시스템 | `src/core/GameSystem.ts`(신규), `src/core/SystemRegistry.ts`(신규), `src/core/Game.ts`(등록 지점·프레임 순서 배선) |
| 필요한 변경 | 시스템 수명주기 계약(id·initialize·update·render?·dispose)과 등록 구조. 실행 순서 = 등록 순서, 유일한 등록 지점은 `Game.composeSystems()` |
| 변경 이유 | D+5부터 각 파트 구현체를 dev에 병합·조립할 공통 구조 필요. 파트 간 직접 참조 없이(EventBus만) 등록·해제 가능해야 함 |
| 관련 게이트 | 직접 해당 없음 (아키텍처) |
| 영향을 받는 파일 | `src/core/*` (리드 소유·공통 보호). **`src/contracts/*` 변경 없음** — `Updatable`을 상속만 함 |
| 하위 호환 여부 | 기존 계약·구현 영향 없음 (추가만) |
| 개발 리드 결정 | 승인 — 수명주기는 계약이 아닌 core 아키텍처로 두고, 계약 3종은 그대로 유지 |
| 적용 커밋 | `22f2d15` |

### INT-GAME-002 — core/Game에 게임플레이 시스템 조립 연결 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (D3~D5 회색 박스 작업 창) |
| 대상 시스템 | `src/core/Game.ts` (공통 보호 파일 — 게임플레이가 직접 수정 불가) |
| 필요한 변경 | ① `GameplaySystems`(src/systems/GameplaySystems.ts) 인스턴스 생성: `new GameplaySystems(this.bus, params)` ② `update(dt)`에서 `gameplaySystems.update(dt)` 호출 ③ 초기화 시 `gameplaySystems.attachInput(window, document)` 호출 (정리 시 `detachInput()`) |
| 변경 이유 | PlayerController·DepthSystem 구현이 완료되었으나 core 조립점에 연결되지 않으면 빌드에서 동작하지 않음. D+5 회색 박스 빌드의 전제 |
| 관련 게이트 | G3, G4, G5 |
| 영향을 받는 파일 | `src/core/Game.ts` (구현: `src/systems/GameplaySystems.ts` — 변경 불요) |
| 하위 호환 여부 | 깨짐 없음 (추가만) |
| 개발 리드 결정 | 승인 (D+5 통합) — 단 직접 호출 대신 INT-CORE-001 구조를 따른다: `GameplaySystems`가 `GameSystem`(id `gameplay`)을 구현하고 `composeSystems()`에서 registry 등록. 입력 연결·해제는 initialize/dispose 수명주기로 이동 |
| 적용 커밋 | `6f83268` |

### INT-GAME-001 — MovementParams에 최고 속력·가속 수치 추가 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (D3~D5 회색 박스 작업 창) |
| 대상 시스템 | `src/contracts/params.ts`의 `MovementParams`, `params/movement.json`, `src/config/validateParams.ts` |
| 필요한 변경 | `MovementParams`에 ① `maxSpeedMetersPerSecond`(최고 속력, m/s) ② `accelerationSeconds`(정지→최고 속력 도달 시간, 초) 추가. 형식은 기획 판단에 따라 Tunable(범위 포함) 권장 — 조정 범위·판단 기준은 기획(박태현)이 튜닝표(§11.2)에 행 추가 후 확정 |
| 변경 이유 | 이동 구현에 필수인 속도 스케일이 movement.json·튜닝표에 없음. R7 규칙("수치표 지연 → 임시 기본값 선진행")에 따라 현재 `src/systems/provisionalMovement.ts`에 임시값(최고 속력 10 m/s, 가속 3.0초)으로 선진행 중 — 승인·반영 즉시 해당 파일 삭제 및 주입 경로로 교체 예정. 하드코딩 금지 원칙의 예외 상태를 조기 해소해야 함 |
| 관련 게이트 | G3, G5, G7 (속도는 이후 소음·탐지의 입력값) |
| 영향을 받는 파일 | `src/contracts/params.ts`, `params/movement.json`, `src/config/validateParams.ts`, `docs/INTERFACES.md` §3, `src/systems/SubmarinePlayerController.ts`, `src/systems/provisionalMovement.ts`(삭제) |
| 하위 호환 여부 | 깨짐 없음 (필드 추가 — 기존 두 항목 유지) |
| 개발 리드 결정 | 승인 (D+5 통합) — 형식은 `FixedNumber`(양수·유한 검증). 조정 범위(Tunable 전환)는 근거 없는 범위를 만들지 않기 위해 기획(박태현)이 튜닝표 행·판단 기준을 확정한 뒤에 한다. 값 자체는 임시값 그대로 이관(밸런스 변경 아님) — TUNING_LOG 기록 |
| 적용 커밋 | `6f83268` |

### INT-RENDER-001 — 회색 박스 장면 조립·연결 (core/Game.ts 정리 요청)

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (feat/render) |
| 대상 시스템 | `src/core/Game.ts` (공통 보호 파일) — 장면 조립부 |
| 필요한 변경 | ① `BootstrapScene` 임포트를 `CanyonScene`으로 교체하고 `src/render/BootstrapScene.ts`(별칭 재수출) 삭제 ② 게임플레이 `PlayerController` 구현체 완성 시 Game 조립부에서 `scene.attachPoseSource(playerController)` 호출 (렌더는 읽기 전용 포즈 소비만) ③ 카메라 입력(마우스 회전·Space 리센터)은 게임플레이 측이 `scene.cameraRig.rotate()/recenter()`를 호출하는 방식으로 연결 ④ (D6 이후) 장면에 EventBus 접근 경로 제공 — `depthChanged`(심도 포그)·`noiseChanged`(파문)·`floodingChanged`(X-ray 자동 발동) 구독용 |
| 변경 이유 | 렌더는 core를 수정할 수 없어 D3 장면 교체를 임시로 별칭 재수출로 처리 중. 또한 '렌더에서 판정·이동 계산 금지' 원칙상 잠수함 위치·방향은 게임플레이 상태 주입이 필요하나 현재 Game이 장면에 renderer만 전달함 |
| 관련 게이트 | G1 (렌더 성능 역추적), G5 (카메라·리센터) |
| 영향을 받는 파일 | `src/core/Game.ts`, `src/render/BootstrapScene.ts`(삭제 예정), `src/render/CanyonScene.ts`, (②는 게임플레이 구현 파일) |
| 하위 호환 여부 | 깨지지 않음 — 별칭 재수출로 현 시그니처가 유지되고 있어 승인 전에도 빌드·실행 정상. 포즈 미주입 시 잠수함은 원점 정지 렌더 |
| 개발 리드 결정 | 승인 (D+5 통합) — ① CanyonScene 직접 임포트·별칭 파일 삭제 반영 ② `composeSystems()`에서 `attachPoseSource(gameplay.poseSource)` 반영 ③ 카메라 입력 책임은 게임플레이가 아니라 **그래픽스**로 확정 조정: `src/render/CameraInputAdapter.ts`(마우스 회전·Space 리센터)가 rig를 호출한다 — 게임플레이는 Three.js 카메라를 참조하지 않음 ④ EventBus 접근은 D6 이후 필요 시점에 재논의 (지금 배선하지 않음 — 스텁 금지) |
| 적용 커밋 | `6f83268` |

### #001 — 초기 계약 정의 (기록용)

| 필드 | 내용 |
|---|---|
| 요청자 | 부트스트랩 작업 (D1~D2) |
| 대상 시스템 | `src/contracts/events.ts`(이벤트 10종), `systems.ts`(인터페이스 9종), `params.ts`(파라미터 타입) |
| 필요한 변경 | 신규 정의 |
| 변경 이유 | 마스터 플랜 §7.2 아키텍처의 코드화 — 병렬 개발 시작 전 공통 계약 확보 |
| 관련 게이트 | 전체 (G1·G2는 performanceSampled 직접 관련) |
| 영향을 받는 파일 | src/core/*, src/config/*, src/ui/*, src/tools/* |
| 하위 호환 여부 | 해당 없음 (최초 정의) |
| 개발 리드 결정 | 승인 (부트스트랩 범위) |
| 적용 커밋 | 부트스트랩 커밋 |
