# NEXT_SPRINT — D+5 리뷰 스프린트 결산 → D+10 통합

> 기준 회의: `docs/meetings/07_d5_playtest_review.md`(4차 대회의),
> `08_minor_input_rules.md`(소회의). 게이트 전 마스터 플랜 수정 금지
> 원칙에 따라 **상충 결정은 §5 '마스터 플랜 각주'로 관리**한다.
> 역할별 최신 커밋·검증 현황은 `docs/CURRENT_STATUS.md` 상태 표,
> 계약별 미결·해결은 `docs/INTEGRATION_NOTES.md` 총괄표가 원천이다.
> D+10 통합 절차·검증 항목: `docs/D10_INTEGRATION_CHECKLIST.md`.

## 1. 스프린트 결산 — 구현 완료 (전 파트 브랜치 검증 통과)

4차 대회의 결의와 소회의 결의는 **전부 브랜치 구현 완료** 상태다.
아래 목록이 현재 확정 상태(구현·검증 근거 있음)다.

- **축·규약:** 로컬 -Z 선수 / +Z 선미 (`conventions.ts` 단일 소스)
- **조작:** W/S 전진·후진(후진 상한 = 전진의 50%), Shift/Ctrl 연속
  상승·하강, 높이 기반 3단계 심도 구간 판정, 환경 충돌·밀어내기(피해 없음)
- **월드:** 공유 `STARTING_CANYON_LAYOUT`(`src/world/`) — 렌더·충돌이
  동일 협곡 데이터 사용('보이지 않는 벽' 소멸), 해수면(SeaSurface)
- **카메라:** Space 리센터 = 선미 후방 상단 → 선수 방향
  (INT-CORE-004에서 위치/시선 규약 분리로 이의 해소)
- **프로펠러:** signed speed(`forwardSpeedMetersPerSecond`) 연동
  정/역회전, 정지 시 8% 공회전(`propellerIdleSpinRatio` 단일 소스),
  A/D 단독 입력 무영향
- **전투:** `AimSystem` 단일 진입점 — 우클릭 조준(잠망경 심도 전용)·좌클릭
  발사, PC 화면 조준·발사 버튼(마우스와 동일 인스턴스·동등 판정),
  직선 어뢰(사거리·명중 1회)
- **화물선:** 직선 왕복 항행, `torpedoHit` 이벤트, `sinkProgress` 기반
  침몰(시간축 게임플레이 소유), `removed` 기반 렌더 제거
- **툴링:** 조작 안내 패널·H 토글, Pointer Lock(Esc 일시정지), 입력 계측
  (게이트 기록 JSON 합류)

## 2. 이번 스프린트 잔여 — 통합 대기 (dev 병합 작업)

구현은 끝났고 **dev 통합만 남았다.** 통합 담당(리드) 작업 목록:

| # | 작업 | 근거 | 상태 |
|---|---|---|---|
| 1 | 4개 브랜치 병합 (`c4841cf` → `c46c937` → `c091f30` → 툴링 `a7c3cdf` → 문서 `7186135`) — docs 충돌 전 항목 보존 | D10 체크리스트 §1 | ✅ D+10 통합 브랜치에서 완료 (dev PR 대기) |
| 2 | composition root 배선 채택: HUD `{aim·torpedo}`·bus 주입 (INT-TOOL-002·004) | INT-TOOL-004 코드 예시 | ✅ 완료 |
| 3 | composition root 배선 추가: `scene.attachCargoShipSource(gameplay.cargoShipState)`·`scene.attachEventBus(bus)` (INT-RENDER-005) + STARTING_CANYON_LAYOUT 명시 주입 | INT-RENDER-005 코드 예시 | ✅ 완료 |
| 4 | INT-GAME-004(심도 구간 경계)·006(어뢰)·007(화물선) 수치 이관 결정 — 이관 자체는 백로그 이월 가능, 격침 보상 배선 방식 결정 | INTEGRATION_NOTES 총괄표 | ⏳ |
| 5 | DECISIONS.md·마스터 플랜 각주의 리드 반영 (§5) | 리드만 수정 가능 | ⏳ |
| 6 | 통합 후 D10 체크리스트 전 항목 실행·기록 | `docs/D10_INTEGRATION_CHECKLIST.md` | ✅ 완료 — 실 Chromium 50항목 + 정적·결정적 검사 (체크리스트 결과 주석 참조) |

이미 해소되어 **재작업 불필요**: positionY 렌더 반영(`c091f30`), signed
speed 프로펠러(`c091f30`), 공회전 파라미터 중복 제거(`c091f30` —
renderVisualParams는 순수 연출값만), 렌더-충돌 레이아웃 정합
(`c4841cf`·`c46c937`), CargoShipSystem 정식 구현·렌더 계약 소비
(`b7faf44`·`c091f30`), engines 기준(그래픽 브랜치 vs dev diff 0건 확인).

## 3. 백로그 — 차기 스프린트 (D6~D9 잔여 + 연출)

우선순위는 코어 루프(마스터 플랜 단계 2) > 연출. 스텁 금지 원칙 유지.

| 항목 | 담당(예정) | 비고 |
|---|---|---|
| 탐지(임시 구현·인터페이스 분리) 및 발사 지점 노출 | 게임플레이·리드 | `torpedoFired` → DetectionSystem — 단계 2 필수 |
| 구축함(경계·공격 2상태)·폭뢰(3초 신관)·내구도·탈출 | 리드·게임플레이 | 단계 2 필수 |
| 어뢰 격침 보상 +1 | 게임플레이 | INT-GAME-007 — `torpedoHit` 구독 주체·잔량 증가 경로 리드 결정 |
| 임시 화물선·전투 수치 params 이관 | 기획·게임플레이 | INT-GAME-006·007 (provisionalCombat/Cargo), 심도 구간 경계(INT-GAME-004, provisionalWorld 잔존분) |
| aimModeChanged 기반 조준 카메라 고정 | 그래픽스 | §3.2 조준 뷰 — EventBus 배선 후 |
| 리드샷 보조선 실제 렌더 | 게임플레이(데이터)·그래픽스(표시) | 연결점 준비됨(`targets.list`·`torpedoSpeedMetersPerSecond`·포즈) |
| 어뢰 항적·기포 | 그래픽스 | `torpedo.torpedoes` 폴링 — §5.19 '항적 거품 라인' |
| 방향타·수평타 애니메이션 | 그래픽스 | 연출 (밸런스 무관) |
| 프로펠러 기포 | 그래픽스 | 인스턴싱 경로 재사용 검토 |
| WebAudioSystem 조립 | 툴링 | D13~14 사운드 배관 단계 (torpedoHit 과장 폭발음·aimModeChanged 구독 목록 등록됨) |

## 4. 통합 차단 이력 (구 8건 — 해소 기록)

| # | 차단 사항 (D+7 기록) | 결과 |
|---|---|---|
| 1 | HUD → AimSystem 연결 | 🔍 구현 완료(`2f8b66f`·`a7c3cdf`) — Game.ts 선반영의 **리드 채택만 잔여** (§2-2) |
| 2 | positionY 렌더 반영 | ✅ 해소 — 계약 필수 필드 소비 (`c091f30`) |
| 3 | signed speed → 프로펠러 연결 | ✅ 해소 — `forwardSpeedMetersPerSecond` 소비 (`c091f30`), 계약 `speed` 비부호 정정과 충돌 없음 |
| 4 | 프로펠러 공회전 파라미터 중복 제거 | ✅ 해소 — renderVisualParams에서 idleSpinRatio·fullSpinAtSpeedMps 제거 (`c091f30`) |
| 5 | CargoShipSystem 정식 구현 연결 | ✅ 구현·계약 소비 완료(`b7faf44`·`c091f30`) — composition root 배선 2줄만 잔여 (§2-3) |
| 6 | 화물선 피격 이벤트 | ✅ `torpedoHit` 발행(게임플레이)·구독 폭발(렌더, 멱등) 완료 — 배선(§2-3)·오디오/UI 소비·격침 보상은 백로그 |
| 7 | CanyonScene·collision layout 정합 | ✅ 해소 — 공유 STARTING_CANYON_LAYOUT (`c4841cf`·`c46c937`·`c091f30`), 벽 높이는 그래픽 하향값 채택 |
| 8 | 그래픽 브랜치 engines 기준 | ✅ 확인 완료 — `c091f30` vs dev: package.json/.nvmrc/.npmrc/lock diff 0건 |

## 5. 마스터 플랜 각주 (게이트 전 원문 수정 금지 — 여기서 관리)

| 마스터 플랜 원문 | 4차 대회의 결의 (유효 결정) | 근거 기록 |
|---|---|---|
| §3.3 "W/S 전진·감속" | **S = 후진** (상한 = 전진의 50%) | 07 결의 1, `218ad86` |
| §3.4·DECISIONS #2 "심도 3층 **층 단위 이동**" | **연속 상승·하강 + 높이 기반 3구간 판정** (구간 수 3·탐지 보정·조준 게이트 유지, 풀 6자유도 금지 유지) | 07 결의 2, `218ad86`, INT-GAME-004 ④ |
| §4.1 지형 충돌 "대미지 없음 구간" | 전 구간 **정적 충돌(통과 방지·밀어내기)** — 피해 없음 유지 | 07 결의 3, `218ad86` |
| (기재 없음) 화면 전투 버튼 | PC 화면 조준·발사 버튼 — 단일 AimSystem 경로 강제 | 08 결의 1, INT-CORE-002 |
| §3.2 "Space = 리센터 (잠수함 후방 뷰 복귀)" | 후방 뷰 정밀 정의: **카메라 위치 = 선미 방향 상단, 시선 = 선수 방향** (프로펠러가 카메라 쪽) | 08 결의 4 각주, INT-CORE-004 |

> DECISIONS.md 반영(리드만 수정 가능)은 dev 통합 시 리드가 수행한다.
> 게이트 리뷰(D+21) 때 본 각주를 마스터 플랜 개정안으로 재대조한다(R16).
