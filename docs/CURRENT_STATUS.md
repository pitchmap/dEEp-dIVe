# CURRENT_STATUS — 역할별 현재 상태

> 모든 역할은 **작업 시작 전에 이 문서를 읽고, 작업 종료 시 자기 구역을 갱신**한다.
> 형식을 유지할 것: 완료 / 진행 중 / 다음 작업 / 차단 문제 / 변경된 계약 /
> 통합 주의사항 / 마지막 업데이트 / 담당 브랜치.

---

## 스프린트 A 최종 판정 (통합 관리자 — 조준 rig 단일화 수정 후)

> 상세·근거: `docs/SPRINT_A_ACCEPTANCE.md` '최종 재판정' /
> 절차·미해소: `docs/SPRINT_A_INTEGRATION_MANIFEST.md`.
> 브랜치: `claude/deep-dive-d5-gray-box-integration-tree5i` (dev 미병합).

| 구분 | 결과 |
|---|---|
| 조준 카메라 결함 | ✅ **해소** — 런타임 rig 1개, `scene.attachTorpedoTubeSocket()` 1회, 조준 카메라 forwardY = 어뢰 directionY 실측 일치 |
| 자동 검증 | typecheck·build·size(4.3%)·scope ✅ / gameplay 128/128 · meta 35/35 · tooling 26/26 · HUD 34/34 ✅ / **verify:sprint-a 자동 23/24 (A8 실패)** |
| 브라우저 실측 | ✅ **21/21** (dev 수치 단언 + production 표시, 콘솔 0건) — 3심도 조준·Y 불변·pitch 일치·선체 레이어·그림자·수면 유지 |
| A1 / A2 / A3 / A7 | ✅ |
| A4 | ❌ 경제 UI가 composition root에 미배선 (QA 데모 전용) |
| A5 / A6 | ⚠ 부분 — T1~T6·저장 롤백 ✅ / UI 경로 미판정 (A4와 동일 원인) |
| A8 | ❌ 공식 경제 params 미확정 필드 114개 · provisional 4파일 |
| **B_READY** | ❌ **false** |

**B 차단 항목:** ① A8 공식 경제 수치표(기획) ② 경제·구매 UI 배선(이중 저장
정리 선행) ③ A 통합 PR 생성·dev 병합(발효 유일 방아쇠).

---

## PvE MVP 1차 통합 결과 (통합 담당, 통합 커밋 `ee2022a` 이후)

> 판정 근거: `docs/PVE_MVP_ACCEPTANCE.md` · 절차·충돌 기록:
> `docs/PVE_MVP_INTEGRATION_MANIFEST.md` · 계약 이름 확정: `docs/DECISIONS.md` I1~I8.

### 병합된 역할 브랜치

| 역할 | 브랜치 | tip | 병합 순서 | 자동 검증(통합 후) |
|---|---|---|---|---|
| 개발 리드 | `claude/deep-dive-core-lead-uyg77p` | `187536e` | 1 | meta 19/19 |
| 게임플레이 | `claude/submarine-controls-depth-3wi424` | `fa0dee6` | 2 | gameplay 100/100 |
| 그래픽스 | `feat/render` | `66d6cbd` | 3 | (게임플레이 기준 100/100로 회귀 확인) |
| 빌드·툴 | `claude/deep-dive-tooling-phase-0-cj6c49` | `5a3e5f9` | 4 | tooling 26/26 · HUD 33/33 |

### 조립 배선 완료 (composition root + `src/core/PveIntegration.ts`)

- **메타·경제**: 드롭 회수 → `lootDropped` → 메타 출항 재화 집계 →
  귀환·파괴 정산. 중도 귀환은 `returnToBaseRequested` 경로. 크레딧 손실은
  `destroyed`에만, 희귀 부품은 즉시 확정·보존
- **저장**: `saveRequested`(리드) → `defaultSaveStore`(툴링) 어댑터.
  부팅 시 지갑·업그레이드 복원(`MetaLoop.restoreWallet`). 주기 저장 없음.
  저장 코드는 메타 상태 머신을 조작하지 않는다
- **업그레이드**: 저장 단계 → 공식 `UpgradeModifiers` → 유효 파라미터 파생
  복사본 주입(`params` 원본 불변) + 장비 배율 주입. 계산식은 리드 단일 구현
- **렌더**: `attachTorpedoSource`(실제 어뢰), `setSubmarineVisualTiers`(계산된
  단계만), `metaStateChanged` → 기지 화면. 조준경은 `aimModeChanged` 구독
- **세션**: 재출항 시 `resetSortieSession` — 위치·잔탄·조준·화물선·드롭 초기화,
  확정 재화·업그레이드는 유지
- **오디오**: `WebAudioSystem`+`AudioCueRouter`를 GameSystem 어댑터로 등록

### 미완료 (완료로 표시하지 않는다)

| 항목 | 상태 |
|---|---|
| 보스 AI·포즈 연결 | **의도적 미구현** (지시). 분절 렌더는 `?bossSpike=1` QA 스파이크로 유지, 약점 판정(게임플레이)은 구현·검증됨 |
| 경비함 스폰 | `guardShipRequested` 발행 경로만 완성 — **소비자(구축함 AI) 없음**. 새 경비함 AI 클래스는 복제하지 않는다 |
| 중립 함선 배치 | 해역에 중립 세력 함선이 배치돼 있지 않아 경비 요청을 실제로 유발하지 못함 |
| 업그레이드 구매 UI·장비 장착 UI | 미구현 — 단계는 저장 데이터 주입으로만 반영 |
| 탐지·폭뢰·내구도 | 미착수 (버티컬 슬라이스 단계 2 잔여) |
| R7 임시값 4종 | `provisionalEconomy`(메타·경제)·`provisionalEquipment`·`provisionalCombat`·`provisionalCargo` — `params/economy.json` 이관 대기 |

---

## 역할별 작업표 — 다음 스프린트 (작업 관리자 갱신, 근거: docs/NEXT_SPRINT.md)

> S번호는 `docs/NEXT_SPRINT.md` §1의 작업 ID. 각 역할은 작업 착수·완료 시
> 아래 '브랜치·커밋·테스트 기록표'에 자기 행을 갱신한다.

| 역할 | 이번 스프린트 작업 | 선행 조건 | 상태 |
|---|---|---|---|
| 개발 리드 | ① INT-GAME-003(AimSystem 진입점)·INT-RENDER-002(속도 부호) 결정 — **전체 병목** ② 공통 규약 정리 ③ 통합 순서대로 feat→dev 병합·통합 플레이테스트 | 없음 | 대기 |
| 게임플레이 | 이동·충돌 보완(전후 부호 속도 확정 포함) → 어뢰(우클릭 홀드 조준·좌클릭 발사, `AimSystem.enter/fire` — S1, D+7 내 흡수) | 리드 계약 결정 | 대기 |
| 그래픽스 | 카메라 수정 / 프로펠러(회전=전후 속도 함수·공회전 하한 8% — S7·S8) / 해수면·화물선 렌더 | 게임플레이 이동·속도 노출 | 대기 |
| 빌드·툴 | HUD·화면 조준/발사 버튼(반투명·소형·H 숨김·존재감 자동 축소 — S2~S4, 0.5일) / Pointer Lock 진입(S3) / 버튼 사용률 계측(S5) | AimSystem 진입점(게임플레이 어뢰) | 대기 |
| 기획 | 튜닝표 신규 3행 확인(관리자 대행 반영분 — 프로펠러 공회전·정지 선회 배율·버튼 사용률), '정지 시 선회 배율' params 반영 여부 결정(S10) | 없음 | 대기 (확인 요) |
| 아트 | 공회전 속도 아트 판정(S8), 버튼 반투명·축소 사양(S4) | 그래픽스 프로펠러 구현 | 대기 |

## 역할별 브랜치·커밋·테스트 기록표

> 각 역할이 스프린트 작업을 커밋·푸시할 때마다 자기 행을 갱신한다.
> '최근 커밋'은 D+5 통합 시점 기준 초기값.

| 역할 | 담당 브랜치 | 최근 커밋 | dev 반영 | 테스트 결과 (마지막 실행 기준) |
|---|---|---|---|---|
| 개발 리드 | `claude/deep-dive-core-lead-uyg77p` (통합: `claude/deep-dive-d5-gray-box-integration-tree5i`) | `22f2d15` (통합 `291c613`) | ✅ PR #1로 dev 병합 | typecheck·build·check:size(0.53MB)·결정적 21/21·브라우저 19/19 |
| 게임플레이 | `claude/submarine-controls-depth-3wi424` (`feat/gameplay` 역할) | `f5b5c1c` | ✅ | 결정적 검증 21/21 (`node src/systems/__verification__/run.mjs`) |
| 그래픽스 | `feat/render` | `9fc32f6` | ✅ | X-ray 스파이크 성공 판정, `?xray=1` 브라우저 검증 |
| 빌드·툴 | `claude/deep-dive-tooling-phase-0-cj6c49` (`feat/tooling` 사본) | `5b33dec` | ✅ | HMR 적용·범위 밖 거부 브라우저 검증, Pages 배포는 관리자 설정 대기 |
| 기획 | (미생성 — params 커밋 브랜치 규칙 리드와 협의) | — | — | — |
| 작업 관리자 (문서) | `claude/deep-dive-bootstrap-6wrpuw` | (본 커밋) | dev 병합 대기 (문서만) | typecheck·build·check:size (문서 변경 후 재확인) |

## 작업 의존성과 권장 통합 순서 (dev 병합 순서)

```
[1] 리드: 공통 규약 (INT-GAME-003·INT-RENDER-002 결정) ← 병목, 최우선
 └→ [2] 게임플레이: 이동·충돌
      ├→ [3] 그래픽스: 카메라 수정        ┐ 상호 독립,
      ├→ [4] 그래픽스: 프로펠러·해수면·화물선 ┘ 병렬 가능
      └→ [5] 게임플레이: 어뢰 (AimSystem)
           └→ [6] 빌드·툴: HUD·화면 버튼·Pointer Lock·계측
                └→ [7] 리드: 통합 플레이테스트 (dev)
```

- 병합은 계약 커밋 → 계약 소비 커밋 순서 (BRANCHING.md). [6]은 [5]의
  진입점을 호출하는 껍데기이므로 반드시 [5] 이후.
- 상세 근거·결의 대조: `docs/NEXT_SPRINT.md`

---

## 개발 리드

- **완료:**
  - D1~D2 환경 구축 검수 — 저장소 구조, core 골격(루프·상태 머신·EventBus·SceneManager), 계약 3종(events/systems/params) 정의
  - D3 — 시스템 등록 구조 구현: `GameSystem` 수명주기(id·initialize·update·render?·dispose) + `SystemRegistry`(실행 순서 = 등록 순서, dispose 역순) + `Game.composeSystems()` 등록 지점·프레임 순서 배선 (INTEGRATION_NOTES INT-CORE-001, ARCHITECTURE.md '시스템 실행 순서' 참조)
  - **D+5 회색 박스 통합** — 툴링(`5b33dec`)·코어(`22f2d15`)·게임플레이(`f5b5c1c`)·그래픽스(`9fc32f6`) 4개 브랜치 병합, `composeSystems()`에 `gameplay` → `cameraInput` 순서 등록, `CanyonScene`을 ManagedScene으로 활성화 + `attachPoseSource` 주입, INT-GAME-001·INT-GAME-002·INT-RENDER-001·INT-TOOL-001 리드 결정 완료. 임시 이동 수치 params 이관(`provisionalMovement.ts` 삭제). typecheck·build·check:size(0.53MB/15MB)·결정적 검증 21/21·브라우저 자동화 검증 19/19 통과 (하단 'D+5 통합 검증 결과' 참조)
  - **D+5 리뷰 후속 — 공통 규약 확정 (INT-CORE-002)**: `src/core/conventions.ts` 신규 (로컬 -Z=선수·+Z=선미·+Y=위, `bowDirectionXZ`/`sternDirectionXZ`/`meshYawRadians`/`cameraRecenterYawRadians`/`propellerSpinRatio`), `AimSystem` 계약(마우스·HUD 버튼 공용 진입점 — 별도 전투 시스템 금지) + `aimModeChanged` 이벤트, 프로펠러 공회전 비율 파라미터(`propellerIdleSpinRatio` 0.08, 0~1 검증). ARCHITECTURE.md '공통 공간·방향 규약'·'조준 입력 단일화' 章, INTERFACES.md §1·§2·§3 갱신
  - **D6 통합 전 상태 계약 확정 (INT-CORE-003)**: `SubmarinePoseSource`(positionX/Y/Z·heading·부호 있는 forwardSpeed — 렌더의 위치 차분 재계산 금지), `CargoShipStateSource`(id·pose·velocity·hit·sinkProgress·removed — 침몰 시간축 게임플레이 소유), `torpedoHit { targetId, x, z }` 이벤트, `contracts/layout.ts`(CanyonLayout — 렌더·충돌 공용 단일 소스, 인터페이스만), 파라미터 단일 소스 확정(renderVisualParams의 idleSpinRatio·fullSpinAtSpeedMps 중복 제거 지시), Game 조립 연결 지도(ARCHITECTURE 'Game 조립 계약') 문서화
  - **통합 차단 2건 해소 (INT-CORE-004)**: ① `src/world/startingCanyonLayout.ts` — CanyonLayout 단일 데이터 인스턴스(`STARTING_CANYON_LAYOUT`), 벽 높이는 그래픽 하향값(11/12±2·sin, 상단≤7<해수면 12) 최종 확정 — 구 충돌 미러(15/16±3·sin)의 '보이지 않는 약 4m 벽' 소멸 ② 카메라 리센터 이의 해소 — `cameraRecenterYawRadians` 폐기, `cameraRecenterOffsetDirectionXZ`(위치=선미 방향)·`cameraRecenterLookDirectionXZ`(시선=선수 방향) 분리 (하나의 yaw 재사용 금지, 검증 기준: 프로펠러가 카메라 쪽·W 전진 시 화면 안쪽)
  - **PvE 전환 착수 (트랙 전환 — 회의록 10·11 반영):**
    - **선행 계약 (INT-CORE-006, 커밋 `dcc6f7d`)** — `contracts/meta.ts`(Faction·재화 이원화·MetaState·SortieOutcome/Report/Settlement·SortieSessionPort·UpgradeStatId 7항목 상한·EquipmentId 4종 상한·BossPhase) + 이벤트 9종(metaStateChanged·sortieStarted/Ended·returnToBaseRequested·lootDropped·guardShipRequested·saveRequested·bossPhaseChanged·bossWeakPointChanged) + CargoShipStateSource.faction(선택→추후 필수)
    - **[LOOP] 상위 메타 루프·업그레이드 배율 레이어 (INT-CORE-007)** — `src/meta/` 신규: MetaLoop(BASE→SORTIE_PREP→SORTIE→DEBRIEF, 하위 무수정 포장·통신 3종 제한), settlement(파괴 시 크레딧 손실·희귀 즉시 확정), upgradeMath(합연산 순수 함수 — params 불변, 툴 공용), provisionalEconomy(⚠ R7 손실률 50% 임시 — economy.json 이관 대기), 결정적 검증 19항목. Game 조립: metaLoop 최선두 등록, 세션 시작(BOOT→DEPARTURE)을 SortieSessionPort 어댑터로 이동 — 기지 화면 도입 전 임시 자동 출항
    - **DECISIONS.md 개정** — PvE 결정 P1~P16 표 신설(1차 결의 1·4 개정·신 스코프 가드), 폐기 표 정리(영구 성장 금지 → P2 대체). FILE_OWNERSHIP: src/meta(리드, save/는 툴링)·systems/economy(게임플레이)·params 확장(기획)
  - **스프린트 A 리드 창 (창 1 — 계약 생산자, 회의 12~14 반영):**
    - **선행 계약 (INT-CORE-008, 커밋 `2542c7b`)** — TorpedoTubeSocketSource(앵커·2소켓, 십자선=탄도, 오프셋 단일 지점)·FineAimSource·AimingParams 4종(양수 크기, aimReturnBehavior 없음)·구매 불가 5종·TransactionResult·판정/지갑/단계/저장 포트·EquipmentChangeRequest·BaseScreenPort·saveRequested sortieLaunch. **AimSystem 계약에서 '전 심도 조준(구 심도 전용 규칙 폐기)' 폐기 규칙 삭제**(전 심도·심도 불변·해제 reset). conventions에 공용 클램프·aimForwardDirection
    - **구현 (INT-CORE-009)** — world/torpedoTubeAnchor(안전 오프셋 0.55 단일 정의)·core/TorpedoTubeSocketRig·meta/PurchaseTransaction·EquipmentTransaction(스냅샷→재검증→차감→적용→저장→commit/rollback, 예외 무전파)·MetaLoop WalletTransactionPort+출항 직전 저장·UpgradeState UpgradeLevelsPort. Game 조립: tubeSockets rig 배선. 결정적 검증 **35/35**(트랜잭션·소켓·클램프 16항목 신규)
- **진행 중:** 없음
- **다음 작업:** ① 게임플레이(조준 재작성·판정 포트) 병합 후 트랜잭션·BaseScreenPort·attachFineAimSource 실배선 (INT-CORE-009 스니펫) ② 병합 순서 리드→게임플레이→그래픽스→툴링, dev 통합 빌드에서 A1~A8 판정 ③ 보스 AI는 스프린트 C(C1~C9) 통과 후 본개발 — 스프린트 B·C·어뢰 캠은 착수 금지 상태(14차 결의 1)
- **차단 문제:** 없음 (병목: 기획 경제 데이터 — ID·단계·가격·배율·장비 비용 확정이 그래픽스 UI 4종의 선행 조건, 7차 결의 4)
- **변경된 계약:** INT-CORE-008(스프린트 A 선행 계약)·INT-CORE-009(리드 구현·조립 기준). 이전: INT-CORE-006·007, INT-CORE-004·003·002, INT-GAME-001
- **통합 주의사항:**
  - 각 파트는 자기 소유 영역에서 `GameSystem`(`src/core/GameSystem.ts`) 구현체를 export하고, 이 문서 자기 구역에 등록 요청을 남긴다. `src/core` 배선은 feat→dev 병합 시 리드가 수행
  - 파트 간 통신은 EventBus만 — 구현체 간 직접 참조(포즈 주입 등)는 composeSystems(composition root)에서만 잇는다
  - 3D 장면(회색 박스 블록아웃)은 시스템이 아니라 `ManagedScene`으로 SceneManager에 등록
  - 상태 전환(GameStateMachine)과 장면 전환(SceneManager)은 분리 — 자동 매핑 없음
  - **축·방향은 `src/core/conventions.ts`만 참조** — 숫자·벡터 복제 금지. 프로펠러 회전은 `propellerSpinRatio`(속도만 입력) 경유, 렌더가 speed를 쓰려면 `SubmarinePoseSource` Pick에 `speed` 추가해 소비 (판정 계산 금지)
  - 조준·발사 입력(마우스·HUD 버튼)은 반드시 동일 `AimSystem` 인스턴스를 호출 — 어댑터 주입은 composeSystems에서만, 카메라 고정·UI는 `aimModeChanged` 구독. HUD의 CombatIntentSink는 AimSystem 위임 어댑터로만 구현
  - **[INT-CORE-003 적용 요청 — 게임플레이]** poseSource 타입을 `SubmarinePoseSource` 계약으로 노출(positionY·forwardSpeed 포함), CargoShipSystem 상태를 `CargoShipStateSource`로 노출 + TargetRegistry 등록, 명중 판정 1곳에서 `torpedoHit` 발행·hit/sinkProgress/removed 갱신
  - **[INT-CORE-004 적용 요청 — 게임플레이]** `collision/startingArea.ts`의 자체 수식 미러 삭제 → 주입받은 `CanyonLayout.blocks` 순회로 충돌체 생성(회전 블록의 AABB 외접 근사 규칙은 소비측 유지). 스폰은 layout.submarineSpawn 사용
  - **[INT-CORE-003 적용 요청 — 그래픽스]** CanyonScene 로컬 `SubmarinePoseSource` Pick·`CargoShipStateSource`를 계약 import로 교체, Propeller 속도 입력을 poseSource.forwardSpeed로 교체(위치 차분 재계산 삭제), renderVisualParams.json의 `idleSpinRatio`·`fullSpinAtSpeedMps` 삭제(조립 주입으로 대체), 잠수함 Y는 poseSource.positionY 사용
  - **[INT-CORE-004 적용 요청 — 그래픽스]** `buildCanyonBlockout` 자체 수식 삭제 → 주입받은 `CanyonLayout.blocks`로 메시 생성 (수치는 현행 그래픽과 1:1 — 시각 변화 없음). CameraRig의 `cameraRecenterYawRadians(h) + π` 우회를 `cameraRecenterOffsetDirectionXZ` 기준 배치로 교체 (결과 동일: 선미 뒤 상단 → 선수 방향)
  - **[INT-CORE-003 적용 요청 — 빌드·툴]** 오디오 배관은 `torpedoHit`(과장 폭발음)·`aimModeChanged` 구독 항목을 사운드 세트(D+10) 배선 목록에 추가
  - **[PvE 적용 요청 — 전 파트]** INT-CORE-007 하단 '각 파트 적용 요청' 참조: 게임플레이(economy·Faction·세션 리셋 API·약점 판정), 툴링(src/meta/save·시뮬레이터는 upgradeMath 동일 함수·가드 빌드 경고·중도 귀환 버튼), 그래픽스(기지 화면 metaStateChanged 구독·보스 연출 이벤트 소비·분절 애니 스파이크), 기획(economy.json·upgrades.json — PvE D+3 병목)
  - **계층 경계 [확정]:** 상위(src/meta)가 하위 세션 내부 상태를 읽는 코드, 하위가 메타 상태를 참조하는 코드는 리뷰 반려 대상 — 통신은 SortieSessionPort + 이벤트 3종뿐
- **마지막 업데이트:** PvE 1단계 착수 (선행 계약 + [LOOP] 메타 루프 커밋)
- **담당 브랜치:** `claude/deep-dive-core-lead-uyg77p` (리드 세션 — D+10 통합분 `6e62356` 머지 완료)

## 게임플레이

- **완료:**
  - D3~D5 조작·심도 (D+5 통합 반영) — WASD·관성·심도·`KeyboardInput`·`GameplaySystems`(GameSystem 수명주기)
  - **D+5 리뷰 스프린트 '이동·충돌' (통합 순서 [2])** — ① W 전진 / **S 후진**(상한 = 전진의 50%, `speed`는 부호 있는 전후 속도 — 프로펠러 S7 소비용) ② **Shift/Ctrl 연속 상승·하강**(수직 최고 속력 = 전진의 50%, 키 해제 시 관성 감속) ③ 수면 상한(+12.5)·해저 하한(-5) 이탈 방지 ④ 높이 기반 **심도 3구간 판정**(`LayeredDepthSystem` — 잠망경 ≥8 / 순항 ≥-2 / 심해, `depthChanged` 유지, `requestAscend/Descend` 계약은 프로그래매틱 층 이동으로 존치) ⑤ **정적 충돌**(`src/systems/collision/` — 구·AABB 조합, 선체 = 구 3개 캡슐 근사, 통과 방지·밀어내기만, 피해 없음, 반복 해석으로 끼임·떨림 방지) + 시작 지역 임시 레이아웃(CanyonScene 미러)
  - **어뢰 전투 (통합 순서 [5], INT-CORE-002 계약 소비)** — ① 조준 시스템(계약 `AimSystem` 구현): beginAim/endAim/fireTorpedo **공용 진입점**, `aimModeChanged` 발행(중복 없음), 자동 락온 없음 ② `StraightRunTorpedoSystem`(계약 `TorpedoSystem` 구현): 선수 발사 지점 생성, 직선 주행, 최대 사거리 초과 제거, 함선(박스)·환경(3D, collision 공유 집합) 명중 시 1회만 처리, `torpedoFired` 발행, 재장전·보유량 = combat.json ③ `MouseCombatInput`: 우클릭 조준·좌클릭 발사(에지 1회=1발), blur·탭 전환 시 해제, 컨텍스트 메뉴 방지 ④ `TargetRegistry`: 표적 위치·속도·hitRadius + `onTorpedoHit`(1회 보장) — 리드샷 보조선 데이터 연결점 ※ 당시의 '전 심도 조준(구 심도 전용 규칙 폐기) 조준'은 7차 개정판으로 **폐기**됨 (아래 스프린트 A 항목 참조)
  - **화물선 + 상태 계약 적용 (INT-CORE-003 계약 소비)** — ① `SubmarinePlayerController`가 `SubmarinePoseSource` 계약 구현: `positionY`·부호 있는 `forwardSpeedMetersPerSecond`(+선수/−선미) 제공, 계약 `speed`는 비부호 크기로 정정 — `poseSource`는 계약 타입으로 노출 ② `CargoShipSystem`(계약 `CargoShipStateSource`·`CombatTarget` 구현): 1척, 해수면 흘수선 유지, 직선 왕복(끝점 반전 잔여 이월 — dt 불변), TargetRegistry 등록, 첫 명중에서 `torpedoHit {targetId,x,z}` 1회 발행 + 표적 즉시 해제(중복 침몰 불가) + hit 고정, sinkProgress 0→1(시간축 게임플레이 소유) 후 removed=true, dispose 시 등록·참조 정리 ③ `TargetRegistry` id를 계약 체계(number)로 정렬
  - **공유 CanyonLayout 소비 (INT-CORE-004 적용)** — ① `collision/startingArea.ts` 자체 좌표·높이 수식 미러 **삭제** → 주입받은 `CanyonLayout.blocks` 순회로 충돌체 생성(블록 1개 = AABB 1개, 회전은 외접 근사 — 소비측 규칙 유지), `blockToColliderBounds` 검증 헬퍼 제공 ② `provisionalWorld.ts`의 중복 해수면 값 삭제, 잠수함 수직 상한/하한을 `layout.seaSurfaceY ± 선체 반경`에서 **파생** ③ `CargoShipSystem` 흘수선 = `layout.seaSurfaceY` ④ `GameplaySystems`가 레이아웃 주입 지원(기본 `STARTING_CANYON_LAYOUT`, 스폰 = `layout.submarineSpawn`) + `layout` 읽기 전용 노출 ⑤ 결정적 검증 75항목(75/75 — 기존 71 유지 + 블록↔충돌체 수·경계 정합, 상한 파생, 화물선 흘수선 정합 4)
  - **스프린트 A — 창 2(게임플레이) 범위 (`[LOOP]`·`[ECON]`)**
    - **전 심도 조준**: 조준 심도 제한 **폐기**. `SubmarineAimSystem`(구 PeriscopeAimSystem)은 심도·이동 시스템을 **참조하지 않는다** — 조준 진입·해제가 Y·속도·심도를 쓸 경로가 구조적으로 없다(자동 부상·심도 보정 제거). 조준 중 W/S 전후진·A/D 선회·Ctrl/E 상승·Shift 하강 모두 기존 물리 규칙 그대로 허용. 우클릭 토글 유지, 발사 후 조준 유지, 비조준 발사 금지(+`aimRequiredCount`) 유지
    - **마우스 미세 조준**: yaw ±15°·pitch 상 10°/하 15°·감도 0.5 — 제한·부호는 `aimGeometry.clampAimAngles` **단일 계산 함수**(양수 크기 저장 → 계산에서만 하향 부호). 잠수함 **로컬 기준**(선체 선회 시 함께 회전), 해제 시 yaw·pitch **reset**(persist 미구현·스키마 없음), 범위 밖 clamp
    - **소켓 기반 탄도**: `collision/torpedoTubeSocket.ts` — `torpedoTubeAnchor`/`aimCameraSocket`/`torpedoSpawnSocket`. **안전 오프셋 단일 정의**, TorpedoSystem의 자체 spawn offset 상수 삭제. 어뢰 초기 방향 = 조준 카메라 forward(단일 출처, 3D — pitch 반영), 생성 직후 자기 충돌 없음, 리드샷 보조선 속력 = 실제 어뢰 속력
    - **업그레이드 구매 판정**(`economy/UpgradePurchaseSystem`): 스냅샷→재검증→차감→단계 변경→저장→확정/롤백 원자 트랜잭션. 조건 실패 5종(insufficientCredits·insufficientRareParts·maxLevelReached·slotFull·alreadyEquipped)과 **저장 실패(saveFailed)를 카테고리로 구분**, 롤백 후 지갑·단계가 구매 전과 동일하며 재구매 가능. 테크 트리 없음, 8번째 항목 런타임 거부, params 원본 불변
    - **장비 장착·교체·해제**(`EquipmentSystem`): equipItem/replaceItem/unequipItem + 슬롯 제한·중복 규칙, 저장 포트 연결 시 **저장 실패 = 이전 loadout 롤백**, 변경이 전투 유효 파라미터(속력·피해)에 즉시 반영. 장비 4종 유지(5번째 금지)
    - 결정적 검증 **128항목**(128/128) — 기존 100항목 유지·조준 규칙 변경분 갱신 + 신규 28
  - **PvE 전환 1·2단계 게임플레이 (회의 09·11 반영 — [ECON][LOOP][BOSS])** — ① 플레이테스트 수정 5건 중 게임플레이 소유분: 함선 충돌체(잠수함-함선 통과 방지·밀어냄만, 어뢰 명중과 `hullBox` 박스 근사 공유 — `collision/shipHullBox.ts`), 비조준 발사 절대 차단 + `aimRequiredCount` 안내 신호, **우클릭 토글 조준경**(`toggleAim` — 재입력 해제, blur에도 토글 유지), 조준 상태에서만 좌클릭 발사(비조준 좌클릭 = 카메라 전용), **Ctrl=상승/Shift=하강 + E 상승 병행 키** ② **Faction 태그 + 드롭 테이블**(hostile/neutral/guard + object — 클래스 복제 없음), `src/systems/economy/`: 드롭 생성(EconomySystem)·월드 픽업(CreditDropField)·획득 반영(RunEconomy) 3단 분리, 적대 파괴→크레딧 드롭→접근 자동 회수, 중립 공격→크레딧 없음+경비함 출현 요청 큐(`consumeGuardSpawnRequests` — 구축함 AI 재사용은 리드), 해저 재화 '부순다'(SalvageObject — 기존 어뢰 표적 경로 재사용) / '줍는다'(자동 회수), 일반 크레딧·희귀 부품 분리 + 희귀 부품 즉시 저장 신호(onRarePartAcquired), 손실 페널티(settleDefeat — 손실률 파라미터, 희귀 부품·확정분 보존, 정산 데이터 반환) ③ **장비 4종**(기본/고속/중어뢰/디코이 — 상위호환 없음, 슬롯 2 제한, 단일 fire 경로 유지, 디코이 = 가짜 음향 표적 상태 노출), 업그레이드 **합연산** 배율 주입점 `setUpgradeModifiers`(EffectiveParams 동등 인터페이스) → 발사 어뢰 속력·피해에 실반영 ④ **보스 약점 판정**(BossWeakPointTarget — BossPhasePort 계약만 소비, 활성=약점/비활성=일반 피격 구분·배율 누적·그래픽스 구독용 상태·onHit) ⑤ 결정적 검증 100항목(100/100 — 기존 75 유지·결의 반영 갱신 + 신규 25)
  - **스프린트 A 마감 — production 배선 (`[ECON]`·`[LOOP]`)**
    - **공식 경제 카탈로그 어댑터**(`economy/officialEconomyCatalog.ts`): `params/upgrades.json`·`equipment.json`만 읽는다. 공식 ID(업그레이드 7·장비 4) 밖은 **런타임 거부**, `null`·음수 가격은 비용을 산출하지 않는다(임의 대입 금지)
    - **구매 판정**(`UpgradePurchaseSystem` = 계약 `UpgradePurchaseJudgePort`+`UpgradeLevelsPort`): 사유 산출(insufficientCredits/RareParts·maxLevelReached), 가격·희귀 부품 요구량, 후보 단계 적용(`applyPurchasedLevel`), rollback용 `snapshotLevels`/`restoreLevels`. **가격이 null이면 구매 불가**(UI에는 `nextCost=null` 동시 노출 — 전용 사유 신설은 INT-GAME-010 결정 대기)
    - **장비 판정**(`EquipmentSystem` = 계약 `EquipmentChangeJudgePort`): catalog·loadout 읽기, equip/replace(= 점유 슬롯 대상 equip)/unequip, 슬롯 제한·중복·동일 장비 판정, `snapshotLoadout`/`restoreLoadout`으로 이전 loadout 복원. 공식 `slotCapacity` 확정 시 반영, null이면 구조 기본값 유지
    - **출항 중 획득량**: `sortiePendingCredits`·`sortiePendingRareParts` — 실제 loot 회수·정산 상태에서만 파생(임시 숫자 없음), EconomyHud read-only source
    - **출항 준비 판정**: `sortieReadiness(isBaseState)` → `{ inBase, loadoutValid, upgradesValid, ready, blockers }`. **저장·화면 전환·메타 상태 전이는 하지 않는다**(리드 Departure command가 소비)
    - **저장 직접 호출 0회**: `EquipmentSystem.attachSavePort`·`economy/purchaseTypes.ts`·`economy/provisionalUpgradeCost.ts` **삭제** — 저장·롤백 순서는 리드 트랜잭션 단일 소유
    - **provisional 정리**: 가격 임시 경로 제거(삭제). 남은 3종(`economy/provisionalEconomy`·`provisionalCargo`·`provisionalEquipment`)은 공식 소스 부재·공식 파일의 위임 때문에 유지하되 `economy/pendingOfficialData.ts`에 **감사 목록**으로 명시
    - 결정적 검증 **133항목**(133/133)
- **진행 중:** 없음
- **다음 작업:** INT-GAME-004·006·007 리드 결정 후 provisional 이관(심도 구간 경계·비율·어뢰·화물선 수치), 격침 보상 어뢰 +1 배선(§5.9 — torpedoHit 구독), 임시 탐지·폭뢰·내구도(D6~D9 잔여)
- **차단 문제:** **의존성 대기 2건** — ① 리드 창의 스프린트 A 계약(앵커·2소켓·구매 트랜잭션·지갑/저장 포트)이 원격에 아직 없어, 계약 복제 없이 게임플레이 쪽 **단일 소비 지점**으로 선진행함(도착 시 어댑터로 축소·삭제) ② 툴링 창의 `params/aiming.json`·경제 가격 params 미도착 → `provisionalAiming`·`provisionalUpgradeCost` R7 선진행. 그 외 ① 화물선 속력·반경·침몰 시간·경로와 심도 구간 경계·비율·어뢰 수치는 R7 선진행(`provisionalCargo/`, `provisionalMovement/`, `provisionalCombat/`, `provisionalWorld` 구간 경계 — INT-GAME-004·006·007) ② 격침 보상(어뢰 +1)은 TorpedoSystem 잔량 증가 경로(계약 메서드) 리드 결정 대기(INT-GAME-007)
- **변경된 계약:** 없음 (직접 변경 없음 — INT-GAME-008 제안 등록. aimRequired·경비 요청·희귀 부품 저장·보스 피격은 계약 확정 전까지 읽기 전용 상태·consume API·콜백으로 제공)
- **통합 주의사항:** 좌표 규약 — **잠수함 로컬 -Z가 선수, +Z가 선미** (`src/core/conventions.ts`만 참조). heading은 Y축 요(yaw), heading 0 선수 = 월드 -Z, 렌더는 `mesh.rotation.y = headingRadians` 그대로. 속도 소비 규칙(INT-CORE-003): 프로펠러 등 부호가 필요하면 `poseSource.forwardSpeedMetersPerSecond`(+전진/−후진), 소음 산출 등 크기만 필요하면 계약 `player.speed`(비부호). 렌더 잠수함 Y는 `poseSource.positionY`. **화물선 상태는 `gameplay.cargoShipState`(계약 CargoShipStateSource)** — composition root가 CargoShipVisual에 주입, `hit`/`sinkProgress`(시간축 게임플레이 소유)/`removed`를 매핑만 할 것, 명중 연출·오디오는 `torpedoHit` 구독. 심도 초기 구간은 y=0 → `cruise`(초기 이벤트 없음). **충돌체 집합은 `gameplay.collision.colliders`(읽기 전용) 공유** — 은신 시야 차폐(D10~12)는 이 집합을 재사용할 것(별도 집합 금지). **협곡 배치의 유일 소스는 `src/world/startingCanyonLayout.ts`** — 렌더·충돌 모두 `CanyonLayout.blocks` 소비(미러 소멸), 레벨 교체 = 새 레이아웃을 `GameplaySystems` 생성자에 주입(또는 데이터 모듈 교체), 소비 중 레이아웃은 `gameplay.layout`으로 확인. **전투 입력은 반드시 `gameplay.aim`(계약 AimSystem) 하나로** — HUD 조준·발사 버튼은 composition root에서 `aim.beginAim()/endAim()/fireTorpedo()`를 호출(별도 전투 시스템 금지), UI는 `torpedo.remaining`·`torpedo.reloadRemainingSeconds`·`aim.aiming` 폴링 + `aimModeChanged` 구독. 리드샷 보조선 = `targets.list`(위치·속도) + `torpedo.torpedoSpeedMetersPerSecond` + `player` 포즈로 계산. 렌더 어뢰 항적은 `torpedo.torpedoes`(읽기 전용) 폴링. 화물선 시스템은 `targets.register()`로 표적 등록(콜백 `onTorpedoHit`는 어뢰 1발당 1회 보장)
- **마지막 업데이트:** 스프린트 A 마감 (기지 어댑터·공식 카탈로그·pending 재화·출항 준비)
- **담당 브랜치:** `claude/submarine-controls-depth-3wi424` (원격 세션 지정 브랜치 — `feat/gameplay` 역할, origin/dev + 리드 계약 브랜치 병합 기반)

## 그래픽스

- **완료:**
  - (D+10까지) 회색 박스 장면·프로펠러·해수면·화물선·X-ray 스파이크 성공·정식 계약(INT-CORE-003·004) 소비 — 이력: PROJECT_STATE §2
  - **[LOOP] 5차 결의 시각 이행** — ① 어뢰 로우폴리+기포 항적(`TorpedoVisuals` — 풀링·인스턴싱 1드로우, 리드샷 학습 피드백 P1) ② 조준경(`PeriscopeView` — 동일 카메라+원형 마스크(DOM)+FOV 보간+십자선·눈금, `aimModeChanged` 소비만) ③ 조준경 내 리드샷 보조선(`LeadShotIndicator`) ④ 해수면 정점 파도 확인(기존 구현 유효 — 변경 없음) ⑤ 환경 부활 1호(`EnvironmentDressing` — 산호 3종 18개소·어군 2종 인스턴싱·침몰선 잔해 1·원경 실루엣 1겹, 연안 한정·밀도 캡 기록·드로우 +10)
  - **[LOOP] PvE 성장 루프 시각** — 기지 화면(`BaseSceneView` — 경량 3D 독, 메타 상태 소비 전용) + 외형 단계 어댑터(`SubmarineVisual` — 선체·주무장 각 3단계, visualTier 주입만, 최종 에셋 교체 지점 격리)
  - **[BOSS] 분절 애니 스파이크 판정: 성공(조건부)** — 강체 5분절 계층 트랜스폼+사인파 위상차, 스켈레탈·스키닝·관절 물리 0, 충돌 단일 캡슐 전제 유지. 위협감 실측 충족, 최종 모션 리뷰(리드·아트) 1건 잔여. B안(`BossMotionFallback` — 대시·관성·카메라 흔들림 훅) 경계 준비, 기본 비활성. `docs/RENDER_SPIKE_BOSS.md`
  - 약점·단계 연출 연결점 — `setWeakpointActive`(발광·점멸·턱 개방)·`setPhase`(체색 전환)·`onPhaseTransition` 시임. 활성·단계 판정은 게임플레이 소유
  - **[LOOP][ECON] Sprint A 조준 시각·성장 UI (13·14차 창3)** — ① **선수 발사관 조준 카메라**: `SubmarineVisual.aimCameraSocket`(어뢰관 앵커 정위치·전방축 동일 — 13차 결의 2, 모델 소유 단일 지점) + `CanyonScene.updateAimCamera`(소켓 월드 위치·방향 그대로, 독자 오프셋 0, 전 심도 동일·심도 카메라 전환 없음, 발사 후 유지), 미세 조준각은 `attachAimAngleSource` 게임플레이 소스 소비(부재 시 0), 해제 시 `CameraRig.beginReturnFrom`으로 3인칭 자연 복귀 ② **자기 선체 레이어 제외**: 선체 서브트리를 layer 1에 두고 조준 중 조준 카메라 마스크에서만 disable — visible·material 전역 변경 없음(블롭 섀도·수면·타 카메라 보존), 해제·dispose 시 복원 ③ **2D 발사관 프레임**: `PeriscopeView` 하단 관 내부 어둠+관구 림 호+좌우 관벽(DOM, 마스크 overflow 일체화, 십자선·눈금·보조선 뒤 레이어) ④ **재화 HUD**(`EconomyHud` — 기지·해역, MetaLoop 실지갑 소비·내부 지갑 없음, 확정 vs 이번 출항(미확정) 구분, 집계 getter 부재 시 '배선 대기' 표기) ⑤ **출항 준비 화면**(`SortiePrepScreen` — 업그레이드 이름/단계/효과/가격/구매, 장비 4종 역할·장착/해제/교체, 출항 버튼, sticky 결과 피드백) — 전부 포트(`metaEconomyPorts`) 소비·command 호출·결과 코드 표시만, 불가 5종+저장 실패 지정 문구, 공식 가격 부재 시 '가격 데이터 대기' 비활성(가격 발명 금지) ⑥ Playwright 실측: 실경로 조준(잠망경 심도 화면 버튼)·발사 후 유지·해제 복귀·심도별 조준 시점·실지갑/실카탈로그/실장비 TEMP-WIRING 왕복(원복 완료) — 스크린샷 docs/screenshots/sprintA_*
- **진행 중:** 없음
- **다음 작업:** INT-RENDER-008 리드 결정 후 실배선(UI 마운트·구매 트랜잭션 포트 교체·출항 저장) / 게임플레이 전 심도 조준·미세 조준각 소스 합류 시 `attachAimAngleSource` 배선 확인 / 보스 모션 리뷰(실기 60fps)
- **차단 문제:** 없음. 단 ① 경제·성장 UI 실사용 마운트는 INT-RENDER-008 리드 배선 대기(QA `?econdemo`로 검수 가능) ② 공식 경제 params·구매 트랜잭션 부재 — production 가격 미표시 상태 유지 ③ 이번 출항 획득 집계 getter 부재 — '집계 배선 대기' 표기 ④ 전 심도 조준은 게임플레이 잠망경 게이트 제거 대기(렌더는 심도 무관 완료)
- **변경된 계약:** 없음 (`src/contracts/*` 미수정 — INT-RENDER-008 제안만. UI 포트는 `src/ui/metaEconomyPorts.ts` 구조적 인터페이스)
- **통합 주의사항:** 조준경은 `aimModeChanged`만 소비(홀드→토글 개편에도 렌더 무변경). 어뢰 소비 인터페이스(`TorpedoStateSource`)는 StraightRunTorpedoSystem이 구조적 충족. 환경 밀도는 renderVisualParams.environment가 상한 — 보스 전장 데코는 '추가'가 아니라 '이동'(11차 결의 1). 반투명 renderOrder 서열: 블롭1<X-ray2<수면3=기포3<폭발4<보조선5. 신규 모듈 전부 dispose 일괄 관리(geometry·material·InstancedMesh). **자기 선체 layer 1은 조준 카메라 전용 규약 — 다른 시스템이 layer 1을 쓰면 조준 중 함께 사라진다.** 기지 화면 UI 배선 시 자동 출항 2줄과 ControlsHud `launchSortie` 중복 진입점 정리 필요(INT-RENDER-008 ①). z-index 서열: 준비 화면 25 < 조준경 30 < 재화 HUD 32 < HUD 버튼 90. QA 플래그: `?xray` `?shipdemo` `?lookup` `?bossSpike=1(&bossMotion=b)` `?base=1` `?tiers=h,w` `?aimdemo=1` `?econdemo=1|savefail`
- **마지막 업데이트:** Sprint A — 조준 시각과 성장 UI (feat/render)
- **담당 브랜치:** `feat/render` (dev `c5987a2` PvE MVP 1차 통합 병합 기반)

## 빌드·툴

- **완료:** D1~D2 — Vite+TS 프로젝트, 성능 오버레이(FPS·평균·최소·로딩·모드·렌더러), LoadingTimer, GateMetricRecorder(JSON 다운로드), check-build-size(15MB 게이트), print-project-status, CI 워크플로, PR·이슈 템플릿 / **단계 0 잔여분** — Node 버전 고정(.nvmrc `22.22.2` + engines `>=22 <23` + .npmrc engine-strict, CI는 node-version-file로 일원화), 잠금 파일 기준 버전 재현 확인(three 0.185.1 · vite 8.2.0 · typescript 7.0.2), GitHub Pages 배포 워크플로(`.github/workflows/deploy.yml` — main 푸시·수동 실행, 배포 전 typecheck·build·check:size 강제, `docs/DEPLOY.md`), JSON 파라미터 핫리로드(Vite HMR — 리로드·재빌드 없이 반영, 범위 밖 값은 기존 validateParams가 거부·이전 값 유지, `loadParams()` 인터페이스 불변 + `onParamsReloaded()` 구독 추가), 게이트 기록에 초당 FPS 시계열(`fpsSamples`)·빌드 모드 추가(G1 구간별 로그 — 개인정보·고유 식별자 없음), Web Audio 최소 배관(`src/audio/WebAudioSystem.ts` — AudioContext unlock·마스터 버스·패너 연결·카메라 기준 리스너까지만, 판정 타이머 없음)
- **완료(추가):** 조작 HUD — 조작 안내 패널(좌측, `controlsConfig.ts` 단일 소스), H 토글(안내+버튼 동시 숨김·복원), Pointer Lock(캔버스 클릭 진입 → Esc 해제 시 GameLoop 정지로 일시정지 + 재진입 안내 오버레이, 진입 직후 250ms 입력 무시), 우클릭 컨텍스트 메뉴 방지, PC 화면 조준·발사 버튼(우하단 반투명 소형, 마우스 조준 3회 이상 시 존재감 축소), 입력 계측(`InputTelemetry` — 마우스/버튼별 조준·발사 횟수, Pointer Lock 진입·해제, 첫 발사 요청 시각 → 게이트 기록 JSON `input` 구역 합류, 개발 콘솔 `__deepDiveInput()`), HUD 파라미터 `params/ui.json`(툴링 소유 `uiParams.ts`에서 검증·핫리로드)
- **완료(추가 2):** HUD ↔ 실제 AimSystem 연결 — 게임플레이 브랜치(어뢰 전투 `10ef604`)·리드 계약(INT-CORE-002 `b69890b`)을 이 브랜치에 병합. 임시 `CombatIntentSink` 삭제, 화면 조준·발사 버튼이 composition root에서 주입받은 `gameplay.aim`(계약 `AimSystem`)의 `beginAim()/endAim()/fireTorpedo()`를 직접 호출(마우스 경로 `MouseCombatInput`과 같은 인스턴스·같은 판정). 조준 버튼 활성 표시 = `aimModeChanged` 구독(로컬 상태 아님 — 잠망경 심도 거부·자동 해제 반영). 발사 버튼 = `torpedo.remaining`·`reloadRemainingSeconds` 200ms 폴링 + `torpedoFired` 구독으로 잔량·재장전 표시·비활성화. 캔버스 마우스는 **게이트키퍼**로 재편: 전투 클릭은 window의 MouseCombatInput으로 통과(HUD가 aim 이중 호출 금지), 잠금 진입 클릭·진입 직후 250ms·비잠금·일시정지 클릭은 stopPropagation으로 소비(이중 발사·유령 발사 방지). 잠금 해제 시 `endAim()` 보장 후 일시정지
- **진행 중:** 없음
- **다음 작업:** Pages 활성화 후 첫 배포 URL 확인, D13~14 사운드 배관 단계에서 WebAudioSystem 조립(리드 승인 경유) + `depthChargeEnteredWater`/`aimModeChanged` 오디오 연동
- **차단 문제:** 배포 URL 미확보 — 저장소 관리자가 Settings→Pages에서 Source를 "GitHub Actions"로 1회 설정 후 워크플로 실행 필요 (`docs/DEPLOY.md`). 이 작업 환경에는 해당 권한·인증 정보 없음
- **변경된 계약:** 없음 — 계약 파일 직접 수정 없음 (INT-CORE-002의 `AimSystem`·`aimModeChanged`를 소비만). INT-TOOL-001 승인 완료(리드 D+5). INT-TOOL-002(HUD 조립 선반영)·INT-TOOL-004(HUD 전투 배선 선반영) 확인 대기, INT-TOOL-003(구 #004 요청 이벤트 3종)은 **폐기**
- **통합 주의사항:** ① **전투 마우스 입력의 소유자는 게임플레이(MouseCombatInput)** — HUD는 캔버스 mousedown을 계측+게이트키핑만 하고 aim을 호출하지 않는다. 전투로 가면 안 되는 클릭(잠금 진입·진입 직후 250ms·비잠금·일시정지)은 HUD가 stopPropagation으로 소비하므로, MouseCombatInput을 window보다 안쪽(캔버스 자체)에 부착하도록 바꾸면 이 차단이 깨진다 — 부착 지점 변경 시 툴링과 협의 필요 ② 일시정지(잠금 해제)는 GameLoop 정지 방식 — 게임플레이 update가 멈추므로 HUD가 잠금 해제 시 `aim.endAim()`을 보장 호출한다. 일시정지 중 쌓일 수 있는 클릭은 오버레이가 소비 ③ Esc·H는 HUD가 선점(Esc=잠금 해제·일시정지, 조준 취소 키 아님) — 새 키 추가 시 `controlsConfig.ts` 단일 소스에 등록 ④ 개발 모드 params/*.json(ui.json 포함) 저장 시 리로드 없이 반영 ⑤ WebAudioSystem은 미조립 유지(D13~14 조립 — 리드 D+5 결정) ⑥ PC 화면 버튼은 INT-CORE-002로 리드 승인 확인됨(별도 전투 시스템 금지 계약)
- **완료(추가 3):** 최신 리드(`c4841cf` — CanyonLayout 단일 데이터·카메라 리센터 규약)·게임플레이(`b7faf44` — CargoShipSystem·INT-CORE-003 포즈/화물선 계약) 병합 후 HUD 재검증 — Game.ts 충돌 없음(병합 양측 모두 미수정, 기존 배선 그대로 유효), `torpedoHit` 이벤트 추가에도 EventBus 타입 무영향, `poseSource`의 `SubmarinePoseSource` 계약 전환과 구조 호환 확인. HUD 헤드리스 33/33 + 게임플레이 결정적 검증 71/71 통과(버튼·마우스 실발사, 재장전·잔탄 동등, 중복 발사 없음)
- **완료(추가 4):** 입력 모드 2원화 + 실브라우저 최종 검증 — 게임플레이 `c46c937`(공유 CanyonLayout 소비, `gameplay.layout` 노출) 병합. **발견 문제**: Esc로 Pointer Lock 해제 시 무조건 일시정지+전체 오버레이여서 '화면 버튼 방식으로 계속' 경로가 없었음(잠금 상태에선 커서가 없어 DOM 버튼 클릭 자체가 불가 — 버튼 모드가 사실상 차단). **수정(최소 변경)**: 일시정지 오버레이에 '마우스 모드로 계속(잠금 재진입)' / '화면 버튼으로 계속(잠금 없음 — resumeWithoutLock)' 선택 버튼 추가. '조준 버튼 = 잠금 진입 겸용' 해석은 모드 선택 목표 우선으로 폐기(INT-TOOL-005, 리드 확인 대기). 검증: HUD 33/33 + 시나리오 A(마우스)/B(화면 버튼)/C(모드 전환·상태 공유·잔탄 0 비활성) 20/20 + 결정적 검증 75/75, 스크린샷 4장
- **완료(PvE 전환 — 회의록 10·11 위임분):** ① **세이브 시스템** `src/meta/save/` — schemaVersion(v1)·이중 슬롯(current+직전 정상 backup)·버전별 마이그레이션 틀·복구 경로(current 손상→백업→안전 초기 상태, 전 경로 부팅 불차단)·체크섬/암호화 없음 [확정], 저장 범위 = 크레딧·희귀 부품·업그레이드 단계·장착 장비·진행·안내 플래그, 문서 `docs/SAVE_SYSTEM.md` ② **업그레이드 시뮬레이터** — `params/upgrades.json`(7항목, R-P2 임시값 선진행) + 공용 순수 계산기 `src/tools/upgradeMath.ts`(합연산: 최종값 = 기준값 × (1+보정 합) — 시뮬레이터·게임플레이 공용, 복제 금지) + 개발 오버레이 패널(단계 선택·기준값(paramRef 해석/수동 입력)·보정 합·최종값 표시·JSON 복사, params 원본 불변, 핫리로드) ③ **신 스코프 가드** `scripts/check-scope-guard.mjs` — 업그레이드 ≤7·장비 ≤4·보스 ≤1·해역 ≤1, 기본 경고/CI --strict 실패 + 로더 차원 8개 거부 ④ **Keyboard Lock** `src/tools/KeyboardLockManager.ts` — 크로미움 전체화면에서 lock 요청(Ctrl/W/Shift), 미지원(파이어폭스)·거부 전부 무예외 폴백, 창 모드·미지원 시 병행 키 E 1회 안내(세이브 영속 플래그), Ctrl+W 차단 비보장 전제 ⑤ **오디오 배관** — `AudioCueRouter`(조준경 진입·해제음 aimModeChanged 구독 완료, 크레딧·희귀 부품·기지 전환 큐는 이벤트 계약 제안 대기), WebAudioSystem 음악 버스·침묵 전환 배관(호출 판정은 보스 상태 머신 소유) ⑥ **검증** — `verify:tooling` 26항목(세이브 10·업그레이드 5·가드 3·KeyboardLock 5·오디오 2+미지원 1), HUD 33항목 러너 저장소 반입(`scripts/verify-hud.mjs` — 스크래치패드 의존 해소), CI에 스코프 가드·결정적 검증 단계 추가
- **완료(스프린트 A — 창 4 범위, 회의 14 결의 2):** ① **`params/aiming.json` + 검증기** — yaw 15 / 상향 10 / 하향 15 / 감도 0.5, 상·하향 모두 양수 크기 저장(부호는 `aimingMath.pitchLimitsDegrees()` 단일 지점에서만 적용 — 이중 부호 오류 차단), 음수·0·범위 밖·`aimReturnBehavior` 전부 로드 거부(보완분 결의 8·9). 카메라·게임플레이 공용 로더 `src/tools/aimingParams.ts` ② **공식 경제·장비 params 구조** — upgrades.json을 단계 배열 구조(단계 상한·단계별 가격·희귀 부품·효과 배율)로 전환, equipment.json 신설(4종 가격·희귀 부품·슬롯). 검증기 `economyMath`가 7항목·4종 초과·음수 가격·미존재 paramRef·단계 배열 누락·계약 밖 id를 거부. **수치는 전부 null = 기획 경제 수치표 미도착 — 임의 값 발명 없음** ③ **계산 정본 일원화** — 툴링 중복 `upgradeMath` 삭제, 시뮬레이터가 리드 `src/meta/upgradeMath.ts` 직접 사용(INT-CORE-007 이행). 시뮬레이터에 총비용·'보스까지 출항 4~6회' 판정 추가(미확정 시 판정 보류) ④ **저장 실패 주입 어댑터** `FaultInjectingStorage`(쓰기·백업 쓰기·quota 유사·직렬화 4종, 프로덕션 경로 미경유) + **원자적 변경·저장** `atomicSave`(스냅샷→변경→저장→실패 시 전부 롤백, `saveFailed`/`rejected` 타입 분리, 고정 안내 문구·내부 예외 비노출) ⑤ **스프린트 A 러너** `npm run verify:sprint-a` — A1~A8 + A5-T1~T6 + 문서 회귀(§8) 자동 판정 24항목, 타 창 병합 대기 항목 5건은 '수동 확인' 구역으로 분리 출력(가짜 초록불 금지) ⑥ 저장 시점 5종 개정 문서화(`docs/SAVE_SYSTEM.md`), 인수 기준 문서 `docs/SPRINT_A_ACCEPTANCE.md` 신설
- **차단 문제(A 통과 불가 2건 — 툴링 소유 밖):** ① **§8 문서 회귀 7건** — '전 심도 조준(구 심도 전용 규칙 폐기)/에서만'이 게임플레이 코드 2곳(`PeriscopeAimSystem.ts:9`, `verifyGameplay.ts:670`)과 상태 문서 5곳(CURRENT_STATUS 게임플레이 구역, PROJECT_STATE ×2, NEXT_SPRINT, D10_INTEGRATION_CHECKLIST)에 잔존. 7차 결의 1-⑦ 미이행 → 해당 창이 제거해야 A 통과 ② **A8 이관 미완** — 미확정 필드 114개(기획 경제 수치표 PvE D+3 미도착), 잔여 provisional 2건(`src/meta/provisionalEconomy.ts`·`src/systems/provisionalCargo.ts`). 상세: INTEGRATION_NOTES INT-TOOL-008
- **마지막 업데이트:** 스프린트 A 창 4 산출 완료 (aiming params·경제 validator·저장 실패 주입·A1~A8 러너·문서 회귀 확인). 리드 계약 `187536e` 병합 기준
- **담당 브랜치:** `claude/deep-dive-tooling-phase-0-cj6c49` (`feat/tooling`의 세션 사본)

## 기획

- **완료:** params 4종 초기 테스트값 등록 (movement/detection/combat/crew — 마스터 플랜 §11.2 튜닝표 값 그대로)
- **진행 중:** 수치표 v1 검토 (D+3 절대 마감 — 전체 병목 R7)
- **다음 작업:** D+5 회색 박스 리뷰에서 관성 1차 튜닝, TUNING_LOG 기록 개시
- **차단 문제:** 없음
- **변경된 계약:** 없음
- **통합 주의사항:** 수치 변경 커밋에는 `[Gx]` 태그 + `docs/templates/TUNING_LOG.md` 갱신 필수. range 밖 값은 로드 시 거부됨
- **마지막 업데이트:** D2 (초기화)
- **담당 브랜치:** (미생성 — `feat/params-*` 또는 dev 직접 커밋 규칙은 리드와 협의)

---

## 전체 마일스톤 현황

| 단계 | 기간 | 상태 |
|---|---|---|
| 0. 환경 구축 | D1~D2 | ✅ 저장소·골격·계측·핫리로드·배포 워크플로 완료 / ⚠ 배포 URL 미확보 (관리자 Pages 1회 설정 대기 — docs/DEPLOY.md) |
| 1. 회색 박스 | D3~D5 | ✅ **D+5 통합 완료** — 조작·심도·카메라·협곡 블록아웃·X-ray 스파이크(성공) 통합, 전 검사 통과. 잔여: 레벨 디자인 정식 블록아웃(엄폐 3곳+) 수신 시 임시 협곡 교체, 팀 전원 조작 테스트·관성 1차 튜닝(§11 판단 기준 1차 적용)은 전사 리뷰에서 |
| 2. 코어 전투 루프 | D6~D9 | 🔄 선행분 브랜치 구현 완료 (어뢰·화물선·조작 개편·공유 레이아웃 — 구 차단 8건 중 6건 해소, NEXT_SPRINT §4) — **dev 병합·배선만 잔여**. 탐지·구축함·폭뢰·내구도는 백로그 |
| 3. 은신·탐지 | D10~D12 | 대기 |
| 4. 연출 적용 | D13~D14 | 대기 |
| 5. 통합·게이트 준비 | D15 | 대기 |

---

## D+5 통합 검증 결과 (통합 리드 기록)

- **정적 검사:** `npm ci`·`npm run typecheck`·`npm run build` 통과, `npm run check:size` 통과 (dist 0.53MB / 상한 15MB, 3.5%)
- **게임플레이 결정적 검증:** `node src/systems/__verification__/run.mjs` — 21/21 통과 (params 이관 후 재실행 확인)
- **브라우저 자동화 검증 (Vite dev 서버 + Chromium):** 19/19 통과
  - 기본 실행: WebGL 캔버스·회색 협곡·잠수함 대체 오브젝트·성능 오버레이(FPS/평균/최소/로딩/모드/렌더러) 표시, 콘솔 오류 0건
  - 조작: W 전진 / S 감속 정지 / A·D 선회 / 무입력 관성 감속 정지 / Shift·Ctrl 심도 3층(경계 초과 무시) / 이동 중 카메라 추적 / 좌클릭 드래그 카메라 회전 / Space 리센터(회전 전 시점 복귀 확인) / 창 blur 후 키 고착 없음
  - X-ray: `?xray=1`로 스파이크 장착 로그·반투명 선체 내 수위 판독(스크린샷)·수위 순환 데모 작동, 기본·X-ray 장면 모두 콘솔 오류 0건
  - 계측·HMR: FPS·로딩 계측 작동(헤드리스 SW 렌더링 환경으로 FPS 절대값은 참고치), movement.json 유효 변경 → "핫리로드 적용 완료", 범위 밖 값(9.9) → "핫리로드 거부 — 기존 값 유지" 확인 후 원복
- **미검증(환경 제약):** GitHub Pages 실제 배포 URL(관리자 Pages 설정 대기), 실기기 60fps(내장그래픽 노트북 — 게이트 리뷰 항목)

---

## D+5 리뷰 스프린트 결산 — 역할별 최신 브랜치·커밋 상태 표 (문서 정리 시점 기준)

> 기준 회의: `docs/meetings/07_d5_playtest_review.md`·`08_minor_input_rules.md`.
> 스프린트 결산·백로그: `docs/NEXT_SPRINT.md`. 계약별 미결·해결:
> `docs/INTEGRATION_NOTES.md` 총괄표. D+10 통합 절차·검증:
> `docs/D10_INTEGRATION_CHECKLIST.md`. 각 역할 구역 본문은 해당 브랜치
> 쪽이 최신이다 — dev 병합 시 이 표와 함께 갱신할 것.

### 역할별 최신 커밋 상태 표

| 역할 | 브랜치 | 최신 커밋 | 구현 완료 | 자동 검증 | 수동 검증 | 통합 대기 사항 |
|---|---|---|---|---|---|---|
| 개발 리드 | `claude/deep-dive-core-lead-uyg77p` | `c4841cf` | INT-CORE-002(축 규약 `conventions.ts`·AimSystem·aimModeChanged·공회전 파라미터) / INT-CORE-003(SubmarinePoseSource·CargoShipStateSource·torpedoHit·layout 계약·파라미터 단일 소스) / INT-CORE-004(`src/world/STARTING_CANYON_LAYOUT`·벽 높이 확정·리센터 규약 위치/시선 분리) | typecheck·build·check:size, 게임플레이 검증 21/21 유지 | — (계약·데이터 변경) | dev 병합 실행 + Game.ts 배선 채택(INT-TOOL-002·004, INT-RENDER-005) + INT-GAME-004·006·007 결정 |
| 게임플레이 | `claude/submarine-controls-depth-3wi424` | `c46c937` | W/S 전진·후진, Shift/Ctrl 연속 상승·하강, 3단계 심도 구간 판정, 정적 충돌·밀어내기, AimSystem 구현(잠망경 전용 조준·좌클릭 발사), 직선 어뢰, CargoShipSystem(직선 왕복·torpedoHit 1회·sinkProgress·removed), 공유 CanyonLayout 전환(미러 삭제) | 결정적 검증 **75/75** (블록↔충돌체 1:1 정합·수직 상한 파생·흘수선 포함) | — (헤드리스 로직 검증 위주) | provisional 잔존분 이관 결정(심도 구간 경계·어뢰·화물선 수치 — INT-GAME-004·006·007), 격침 보상 +1 배선 |
| 그래픽스 | `feat/render` | `c091f30` | 프로펠러 signed speed 연동(정/역회전·8% 공회전·A/D 무영향), 해수면, 화물선 계약 소비(`applyState` 매핑만)·torpedoHit 폭발(멱등)·sinkProgress 침몰·removed 제거, 공유 STARTING_CANYON_LAYOUT 렌더, positionY 반영, 리센터 신규약 적용 | typecheck·build·check:size(3.7%), 게임플레이 검증 71/71 | **Playwright 실입력 실측** — 리센터·전/후진·A 단독 공회전·Shift/Ctrl 수직·화물선 왕복·폭발·침몰·제거·벽 충돌 정지 (스크린샷 확보) | composition root 배선 2줄(INT-RENDER-005 — cargoShip 상태·EventBus 주입) |
| 빌드·툴 | `claude/deep-dive-tooling-phase-0-cj6c49` | `a7c3cdf` (입력 모드 2원화 — 최종 검증 커밋) | 조작 안내 패널·H 토글, Pointer Lock(Esc 일시정지·250ms 가드), PC 화면 조준·발사 버튼 ↔ 실제 AimSystem(마우스와 동일 인스턴스·동등 판정), 입력 계측(게이트 JSON 합류), `params/ui.json`, 리드 `c4841cf`·게임플레이 `b7faf44` 병합 재검증 | typecheck·build·check:size(3.7%), HUD 헤드리스 **33/33**, 게임플레이 검증 75/75, **실제 Chromium 입력 모드 테스트 20/20** | 실발사·재장전·잔탄 동등·중복 발사 없음, 입력 모드 2원화(마우스/화면 버튼) 확인 | ✅ D+10 통합에서 채택 완료 (INT-TOOL-002·004) — ui.json 기획 통보만 잔여 |

### 구분: 완료 / 통합 대기 / 백로그

- **완료 (브랜치 구현·검증 통과):** 확정 상태 전체 — 로컬 -Z 선수/+Z 선미, W/S 전진·후진, Shift/Ctrl 연속 상승·하강, 3단계 심도 구간, 공유 `STARTING_CANYON_LAYOUT`(렌더·충돌 동일 데이터), Space 선미 후방 상단 리센터, 환경 충돌·밀어내기, 프로펠러 signed speed·8% 공회전·A/D 무영향, 해수면, 직선 왕복 화물선, AimSystem(우클릭 조준·좌클릭 발사·PC 화면 버튼), 직선 어뢰, torpedoHit, sinkProgress 침몰, removed 렌더 제거, 조작 안내·H 토글, Pointer Lock, 입력 계측
- **통합 대기 (구현 없음 — dev 병합·배선 작업만):** 4개 브랜치 dev 병합(NEXT_SPRINT §2 순서), composition root 배선(HUD aim·torpedo / cargoShip 상태·EventBus), INT-GAME-004·006·007 리드 결정, DECISIONS·각주 반영, D10 체크리스트 실행
- **백로그 (차기 스프린트):** aimModeChanged 조준 카메라 고정 / 리드샷 보조선 실제 렌더 / 어뢰 항적·기포 / 방향타·수평타 애니메이션 / 프로펠러 기포 / 어뢰 격침 보상 +1 / 임시 화물선·전투 수치 params 이관 / WebAudioSystem 조립 / 탐지·발사 지점 노출 / 구축함·폭뢰 (상세·담당: NEXT_SPRINT §3)

---

## D+10 통합 검증 결과 (통합 담당 기록)

- **통합 브랜치:** `claude/deep-dive-bootstrap-6wrpuw` (통합 세션 전용 — dev PR 대기)
- **병합:** 리드 `c4841cf` → 게임플레이 `c46c937` → 그래픽 `c091f30` → 툴링 `a7c3cdf` → 문서 `7186135` (원격 tip merge, cherry-pick 없음)
- **충돌:** `docs/INTEGRATION_NOTES.md` 3회(항목 ID 기준 전 항목 보존·중복 제거), `docs/NEXT_SPRINT.md`·`docs/meetings/07`·`meetings/README` (문서 브랜치 결산본 채택, 회의록 08은 원문 유지·재구성 중복본 제거). **코드 파일 충돌 0건**
- **Game.ts 최종 조립:** GameplaySystems(레이아웃 명시 주입)·CameraInputAdapter·ControlsHud(aim·torpedo·bus)·CanyonScene(동일 레이아웃)·attachPoseSource·attachCargoShipSource·attachEventBus — 시스템별 단일 인스턴스
- **정적 검사:** `npm ci`·typecheck·build·`check:size`(0.55MB/15MB, 3.7%) 전부 통과
- **게임플레이 결정적 검증:** 75/75 통과
- **HUD 자동 검증:** 툴링 `a7c3cdf` 기록 33/33 (러너는 툴링 세션 산출물 — 저장소 미포함. 본 통합에서는 아래 Chromium 실입력 27~44번 항목으로 동등 검증)
- **실제 Chromium 실입력 플레이테스트:** 지시서 50항목 전 항목 PASS (실키·실클릭 — H 토글/이동·선회·수직/A/D 프로펠러 무영향/Space 리센터·선미 카메라/충돌·관통 없음·능선 위 통과/해수면·화물선 왕복/Pointer Lock 마우스 모드 조준·발사/화면 버튼 모드·재장전 비활성·잔탄 공유/모드 전환·잔탄 유지/명중·torpedoHit·sinkProgress 침몰·removed 제거/콘솔 오류 0건). 보조 검사: `?xray=1` 콘솔 0건, 일시정지 시 조준 자동 해제, 우클릭 컨텍스트 메뉴 억제, 입력 계측 카운터 작동
- **수동 확인 필요 (자동화 환경 한계):** ① 실물 키보드 Esc의 Pointer Lock 해제 (자동화는 `exitPointerLock()` 동일 경로로 검증 — 브라우저 예약 동작이라 실기기에서 사실상 보장) ② 실기기 60fps(G1 — 헤드리스 SW 렌더 FPS는 참고치) ③ GitHub Pages 배포 URL(관리자 설정 대기)
- **남은 버그:** 발견 0건 (콘솔 오류 0)
- **백로그:** NEXT_SPRINT §3 유지 + INT-GAME-004·006·007 수치 이관(R7 임시값 표기), 격침 보상 +1 배선, ui.json 기획 통보

---

## 스프린트 A 통합 결과 (통합 관리자 창)

> 상세: `docs/SPRINT_A_INTEGRATION_MANIFEST.md` · 판정: `docs/SPRINT_A_ACCEPTANCE.md`

- **병합(전부 `--no-ff` tip merge, 이력 보존):** dev(`c5987a2`) → 리드(`c3c9cb9`)
  → 게임플레이(`f61b1e8`) → 그래픽스(`51ad7c7`) → 빌드·툴(`946692b`)
- **정규화:** 발사관 소켓 단일화(정본 `world/torpedoTubeAnchor` +
  `core/TorpedoTubeSocketRig` — 게임플레이·렌더 자체 정의 삭제, 생성 거리
  4.35 m/3.35 m 불일치 해소) · 구매 트랜잭션 단일화(리드 정본, 게임플레이는
  판정 포트로 축소·저장소 미접근) · 렌더 조준 카메라의 소켓 소비 전환
- **최소 수정:** `PurchaseTransaction` 롤백을 지갑·단계 독립 복원으로 분리,
  `UpgradeState`를 공식 경제 카탈로그 소비로 전환(null은 보정 미생성)
- **문서 회귀:** 구 '심도 전용 조준'·'자동 부상' 표현 **위반 0** (회의록 제외)
- **회귀:** typecheck·build·size(4.3%)·scope 통과, gameplay 128/128 ·
  meta 35/35 · tooling 26/26 · HUD 34/34
- **차단:** A8 미확정 114필드(기획 경제 수치표 대기) · 툴링 교차 승인 대기 ·
  구매/장비 UI(BaseScreenPort) 배선 미완 → **dev PR 금지, B 발효 불가**
