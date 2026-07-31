# NEXT_SPRINT — D+5 리뷰 스프린트 → D6 통합 현황

> 기준 회의: `docs/meetings/07_d5_playtest_review.md`(4차 대회의),
> `08_hud_buttons_ad_propeller.md`(소회의). 구현 기준은 여전히 마스터 플랜
> 하나이며, 게이트 전 마스터 플랜 수정 금지 원칙에 따라 **상충 결정은 이
> 문서의 '마스터 플랜 각주'로 관리**한다. dev 병합 여부는
> `docs/CURRENT_STATUS.md` 역할별 커밋 표가 원천이다.

## 1. 스프린트 목표

D+5 회색 박스(dev `d994160`)에 4차 대회의 결의를 반영해 **D+7 조작
개선 빌드**를 만들고, D6~D9 코어 전투 루프의 선행분(어뢰·화물선)을
당겨 통합한다.

## 2. 통합 순서와 현재 위치

| 순서 | 작업 | 담당 | 브랜치 커밋 | 상태 |
|---|---|---|---|---|
| [1] | 공통 규약·조준 계약 (INT-CORE-002) | 리드 | `b69890b` | ✅ 완료 — **dev 통합 대기** |
| [2] | 이동·충돌 개편 (S 후진·연속 심도·정적 충돌) | 게임플레이 | `218ad86` | ✅ 완료 (검증 39/39) — **dev 통합 대기** |
| [3] | 프로펠러·해수면·화물선 연출 | 그래픽스 | `383f257` | ✅ 완료 — **dev 통합 대기** |
| [4] | 조작 HUD·Pointer Lock·화면 전투 버튼 | 빌드·툴 | `e0f7609` | ✅ 완료 — **dev 통합 대기** |
| [5] | 어뢰 전투 (AimSystem 구현·직선 어뢰) | 게임플레이 | `10ef604` | ✅ 완료 (검증 56/56) — **dev 통합 대기** |
| [6] | 통합 상태 계약 (INT-CORE-003) | 리드 | `efd4712` | ✅ 완료 — **dev 통합 대기** |
| [7] | 화물선 시스템 (INT-CORE-003 소비) | 게임플레이 | `b7faf44` | ✅ 완료 (검증 71/71) — **dev 통합 대기** |
| [8] | 렌더 정식 계약 소비 교체 | 그래픽스 | `cbcbf65` (병합 커밋) | ✅ 완료 — **dev 통합 대기** (단, `b7faf44` 미포함 기반) |
| [9] | HUD ↔ AimSystem 실연결 | 빌드·툴 | `2f8b66f` (병합 커밋) | ✅ 완료 (헤드리스 33/33) — **dev 통합 대기** |
| [10] | **dev 통합 (본 스프린트 마감)** | 통합 담당 | — | ⛔ **미착수 — §4 차단 사항 해소 필요** |

## 3. 다음 스프린트 범위 (D6~D9 잔여)

- 임시 탐지(인터페이스 분리 의무)·발사 지점 노출 배선 (`torpedoFired` → DetectionSystem)
- 리드샷 보조선 (`targets.list` + `torpedoSpeedMetersPerSecond` + 포즈 — 연결점은 준비됨)
- 구축함 등장(경계·공격 2상태)·폭뢰·내구도·탈출·클리어
- 격침 보상 어뢰 +1 배선 (INT-GAME-007 — `torpedoHit` 구독 주체·TorpedoSystem 잔량 증가 경로 리드 결정)
- provisional 4종(`provisionalMovement/World/Combat/Cargo`) params·레이아웃 이관 (INT-GAME-004·006·007)
- CanyonLayout 데이터 모듈 위치 확정·렌더-충돌 단일 소스화 (INT-GAME-005·INT-RENDER-004)

## 4. 통합 차단 사항 (해소 전 dev 병합 금지)

| # | 차단 사항 | 관련 기록 | 해소 조건 |
|---|---|---|---|
| 1 | **HUD → AimSystem 연결** — 툴링 브랜치가 Game.ts(공통 보호)에 선반영한 배선(INT-TOOL-002·004, 배선 코드 예시 포함)을 리드가 채택·재작성해야 함 | INT-TOOL-004 | 리드가 dev 병합 시 composition root 배선 확정 |
| 2 | **positionY 렌더 반영** — 렌더는 `SubmarinePoseSource.positionY`를 **선택 필드**로 소비 중. 계약(PlayerController/포즈) 필수 승격 없이는 타 구현체에서 누락 가능 | INT-GAME-004 ①, INT-CORE-003 ① | INT-GAME-004 승인 → 렌더 선택 필드를 필수로 승격 |
| 3 | **signed speed → 프로펠러 연결** — 정식 입력은 `forwardSpeedMetersPerSecond`(INT-CORE-003)이나, 렌더 `cbcbf65`는 `poseSource.speed`(구 부호 의미) 기반. 게임플레이 `b7faf44`가 계약 `speed`를 **비부호로 정정**했으므로 그대로 합치면 후진 시 프로펠러 역회전이 사라짐 | INT-CORE-003 ①②, INT-GAME-004 | 렌더 소비 필드를 `forwardSpeedMetersPerSecond`로 교체 후 병합 |
| 4 | **프로펠러 공회전 파라미터 중복 제거** — `movement.json propellerIdleSpinRatio`가 단일 소스. `renderVisualParams.json`의 공회전·속도 매핑 잔여 키(`fullSpinAtSpeedMps` 등) 제거 완료 확인 필요 | INT-CORE-003 ③ | 렌더 브랜치에서 중복 키 0건 확인 |
| 5 | **CargoShipSystem 정식 구현 연결** — 구현(`b7faf44`)은 존재하나 렌더 `cbcbf65`가 이를 포함하지 않은 기반 — `attachCargoShipSource` 주입 포트가 로컬 인터페이스 대기 상태 | INT-RENDER-003, INT-CORE-003 ④ | 렌더가 계약 `CargoShipStateSource`로 교체 + composition root에서 주입 |
| 6 | **화물선 피격 이벤트** — `torpedoHit {targetId,x,z}` 발행은 게임플레이에 있으나 소비(렌더 폭발·침몰 트리거, 오디오 과장 폭발음, UI 격침 기록, 격침 보상)가 미배선 | INT-CORE-003 ⑤, INT-GAME-006 ②, INT-GAME-007 ③ | 소비 측 구독 배선 + 격침 보상 경로 리드 결정 |
| 7 | **CanyonScene과 collision layout 정합** — 수평 footprint는 1:1이나 **벽 높이 불일치**(렌더 11/12±2·sin vs 충돌 미러 15/16±3·sin) — 능선 위 약 4m '보이지 않는 벽'. 연속 상승과 결합 시 G4·G6 관찰 오염 | INT-RENDER-004, INT-GAME-005 | 단일 레이아웃(CanyonLayout 데이터 모듈) 결정 또는 리드 잠정 지시(ⓐ렌더 복원/ⓑ미러 갱신) |
| 8 | **그래픽 브랜치 engines 기준 확인** — `cbcbf65`는 "dev 기준 engines `>=22 <23` 채택(INT-TOOL-001 승인분)"이라 기록 — 병합 전 feat/render의 package.json·잠금 파일이 실제로 dev 기준과 일치하는지 확인 | INT-TOOL-001, cbcbf65 커밋 기록 | 병합 시 package.json/.nvmrc/.npmrc diff 0건 확인 |

## 5. 계약 현황 — 정식 vs 임시

### 정식 계약 (리드 승인 완료)

| 계약 | 내용 | 승인 | dev 반영 |
|---|---|---|---|
| INT-CORE-001 | GameSystem 수명주기·SystemRegistry·composeSystems | 승인 | ✅ (`d994160`) |
| INT-GAME-001·002, INT-RENDER-001, INT-TOOL-001 | 이동 수치 이관·gameplay 등록·CanyonScene 조립·Node 고정/HMR | 승인 | ✅ (`d994160`) |
| INT-CORE-002 | `conventions.ts` 축 규약·`AimSystem`·`aimModeChanged`·`propellerIdleSpinRatio` | 승인 | ⏳ 통합 대기 (`b69890b`) |
| INT-CORE-003 | `SubmarinePoseSource`·`CargoShipStateSource`·`torpedoHit`·`contracts/layout.ts`·파라미터 단일 소스 | 승인 | ⏳ 통합 대기 (`efd4712`) |

### 임시 계약·선반영·제안 (정식 아님 — 리드 결정 대기 또는 폐기)

| 항목 | 성격 | 상태 |
|---|---|---|
| INT-GAME-004 (positionY·부호 속도 계약 승격, 후진·수직 비율 이관, DepthSystem 의미 각주) | 제안 | 대기 — INT-RENDER-002(소회의 관리 창 제안, 프로펠러용 부호 속도)와 합류, 실체는 INT-CORE-003이 선반영 |
| INT-GAME-005 (레이아웃 단일 소스화) | 제안 | 대기 — 인터페이스는 INT-CORE-003 `layout.ts`로 확정, **데이터 모듈 위치 미정** |
| INT-GAME-006 (어뢰 수치 이관·명중 이벤트) | 제안 | 대기 — 이벤트는 INT-CORE-003 `torpedoHit`로 확정, **수치 이관 잔여** |
| INT-GAME-007 (화물선 수치 이관·격침 보상 배선) | 제안 | 대기 |
| INT-RENDER-003 (화물선 상태 계약) | 제안 | 사실상 INT-CORE-003 ④로 해소 — 렌더 측 교체 작업만 잔여 |
| INT-RENDER-004 (벽 높이 불일치) | 보고 | 대기 — 차단 사항 #7 |
| INT-TOOL-002·004 (Game.ts HUD 조립·전투 배선 선반영) | 선반영 | **리드 확인 대기** — 차단 사항 #1 |
| INT-TOOL-003 (조준·발사 요청 이벤트 3종) | 폐기 | INT-CORE-002가 상위 해법으로 대체 |
| 임시 구현물: `provisionalMovement/World/Combat/Cargo.ts`(R7 선진행), `collision/startingArea.ts`(CanyonScene 미러), 렌더 로컬 화물선 인터페이스, HUD Game.ts 선반영 +α줄 | 코드 | 각 이관·단일화 결정 후 삭제 예정 |

## 6. 마스터 플랜 각주 (게이트 전 원문 수정 금지 — 여기서 관리)

| 마스터 플랜 원문 | 4차 대회의 결의 (유효 결정) | 근거 기록 |
|---|---|---|
| §3.3 "W/S 전진·감속" | **S = 후진** (상한 = 전진의 50%) | 07 결의 1, `218ad86` |
| §3.4·DECISIONS #2 "심도 3층 **층 단위 이동**" | **연속 상승·하강 + 높이 기반 3구간 판정** (구간 수 3·탐지 보정·조준 게이트는 유지, 풀 6자유도 금지 유지) | 07 결의 2, `218ad86`, INT-GAME-004 ④ |
| §4.1 지형 충돌 "대미지 없음 구간" | 전 구간 **정적 충돌(통과 방지·밀어내기)** 도입 — 피해 없음은 유지 | 07 결의 3, `218ad86` |
| (기재 없음) 화면 전투 버튼 | PC 화면 조준·발사 버튼 — 단일 AimSystem 경로 강제 | 08 결의 1, INT-CORE-002 |

> DECISIONS.md 반영(리드만 수정 가능)은 dev 통합 시 리드가 수행한다.
> 게이트 리뷰(D+21) 때 본 각주를 마스터 플랜 개정안으로 재대조한다(R16).
