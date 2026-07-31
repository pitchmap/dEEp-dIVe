# CURRENT_STATUS — 역할별 현재 상태

> 모든 역할은 **작업 시작 전에 이 문서를 읽고, 작업 종료 시 자기 구역을 갱신**한다.
> 형식을 유지할 것: 완료 / 진행 중 / 다음 작업 / 차단 문제 / 변경된 계약 /
> 통합 주의사항 / 마지막 업데이트 / 담당 브랜치.

---

## 개발 리드

- **완료:**
  - D1~D2 환경 구축 검수 — 저장소 구조, core 골격(루프·상태 머신·EventBus·SceneManager), 계약 3종(events/systems/params) 정의
  - D3 — 시스템 등록 구조 구현: `GameSystem` 수명주기(id·initialize·update·render?·dispose) + `SystemRegistry`(실행 순서 = 등록 순서, dispose 역순) + `Game.composeSystems()` 등록 지점·프레임 순서 배선 (INTEGRATION_NOTES INT-CORE-001, ARCHITECTURE.md '시스템 실행 순서' 참조)
  - **D+5 회색 박스 통합** — 툴링(`5b33dec`)·코어(`22f2d15`)·게임플레이(`f5b5c1c`)·그래픽스(`9fc32f6`) 4개 브랜치 병합, `composeSystems()`에 `gameplay` → `cameraInput` 순서 등록, `CanyonScene`을 ManagedScene으로 활성화 + `attachPoseSource` 주입, INT-GAME-001·INT-GAME-002·INT-RENDER-001·INT-TOOL-001 리드 결정 완료. 임시 이동 수치 params 이관(`provisionalMovement.ts` 삭제). typecheck·build·check:size(0.53MB/15MB)·결정적 검증 21/21·브라우저 자동화 검증 19/19 통과 (하단 'D+5 통합 검증 결과' 참조)
  - **D+5 리뷰 후속 — 공통 규약 확정 (INT-CORE-002)**: `src/core/conventions.ts` 신규 (로컬 -Z=선수·+Z=선미·+Y=위, `bowDirectionXZ`/`sternDirectionXZ`/`meshYawRadians`/`cameraRecenterYawRadians`/`propellerSpinRatio`), `AimSystem` 계약(마우스·HUD 버튼 공용 진입점 — 별도 전투 시스템 금지) + `aimModeChanged` 이벤트, 프로펠러 공회전 비율 파라미터(`propellerIdleSpinRatio` 0.08, 0~1 검증). ARCHITECTURE.md '공통 공간·방향 규약'·'조준 입력 단일화' 章, INTERFACES.md §1·§2·§3 갱신
- **진행 중:** 없음
- **다음 작업:** D6 — 코어 전투 루프 착수 (화물선·임시 탐지·구축함 AI 2상태·어뢰·폭뢰 — AimSystem 구현 포함), dev PR 검토
- **차단 문제:** 없음
- **변경된 계약:** INT-CORE-002 — `AimSystem` 인터페이스·`aimModeChanged` 이벤트·`MovementParams.propellerIdleSpinRatio` 추가 (리드 승인, INTERFACES.md 동시 갱신). 이전: INT-GAME-001(`maxSpeedMetersPerSecond`·`accelerationSeconds`)
- **통합 주의사항:**
  - 각 파트는 자기 소유 영역에서 `GameSystem`(`src/core/GameSystem.ts`) 구현체를 export하고, 이 문서 자기 구역에 등록 요청을 남긴다. `src/core` 배선은 feat→dev 병합 시 리드가 수행
  - 파트 간 통신은 EventBus만 — 구현체 간 직접 참조(포즈 주입 등)는 composeSystems(composition root)에서만 잇는다
  - 3D 장면(회색 박스 블록아웃)은 시스템이 아니라 `ManagedScene`으로 SceneManager에 등록
  - 상태 전환(GameStateMachine)과 장면 전환(SceneManager)은 분리 — 자동 매핑 없음
  - **축·방향은 `src/core/conventions.ts`만 참조** — 숫자·벡터 복제 금지. 프로펠러 회전은 `propellerSpinRatio`(속도만 입력) 경유, 렌더가 speed를 쓰려면 `SubmarinePoseSource` Pick에 `speed` 추가해 소비 (판정 계산 금지)
  - 조준·발사 입력(마우스·HUD 버튼)은 반드시 동일 `AimSystem` 인스턴스를 호출 — 어댑터 주입은 composeSystems에서만, 카메라 고정·UI는 `aimModeChanged` 구독
- **마지막 업데이트:** D+5 리뷰 후속 (공통 규약 확정 커밋)
- **담당 브랜치:** `claude/deep-dive-core-lead-uyg77p` (리드 세션 — dev 병합분 머지 완료)

## 게임플레이

- **완료:**
  - D3~D5 조작·심도 (D+5 통합 반영) — WASD·관성·심도·`KeyboardInput`·`GameplaySystems`(GameSystem 수명주기)
  - **D+5 리뷰 스프린트 '이동·충돌' (통합 순서 [2])** — ① W 전진 / **S 후진**(상한 = 전진의 50%, `speed`는 부호 있는 전후 속도 — 프로펠러 S7 소비용) ② **Shift/Ctrl 연속 상승·하강**(수직 최고 속력 = 전진의 50%, 키 해제 시 관성 감속) ③ 수면 상한(+12.5)·해저 하한(-5) 이탈 방지 ④ 높이 기반 **심도 3구간 판정**(`LayeredDepthSystem` — 잠망경 ≥8 / 순항 ≥-2 / 심해, `depthChanged` 유지, `requestAscend/Descend` 계약은 프로그래매틱 층 이동으로 존치) ⑤ **정적 충돌**(`src/systems/collision/` — 구·AABB 조합, 선체 = 구 3개 캡슐 근사, 통과 방지·밀어내기만, 피해 없음, 반복 해석으로 끼임·떨림 방지) + 시작 지역 임시 레이아웃(CanyonScene 미러)
  - **어뢰 전투 (통합 순서 [5], INT-CORE-002 계약 소비)** — ① `PeriscopeAimSystem`(계약 `AimSystem` 구현): beginAim(잠망경 심도 전용)/endAim/fireTorpedo **공용 진입점**, `aimModeChanged` 발행(중복 없음), 심도 이탈 시 자동 해제, 자동 락온 없음 ② `StraightRunTorpedoSystem`(계약 `TorpedoSystem` 구현): 선수(-Z, conventions.bowDirectionXZ) 발사 지점 생성, 수평 직선 주행, 최대 사거리 초과 제거, 함선(XZ)·환경(3D, collision 공유 집합) 명중 시 1회만 처리, `torpedoFired` 발행, 재장전·보유량 = combat.json ③ `MouseCombatInput`: 우클릭 홀드 조준·좌클릭 발사(에지 1회=1발), blur·탭 전환 시 해제, 컨텍스트 메뉴 방지 ④ `TargetRegistry`: 표적 위치·속도·hitRadius + `onTorpedoHit`(1회 보장) — 리드샷 보조선 데이터 연결점 ⑤ 결정적 검증 56항목(56/56 통과 — 마우스 vs HUD 경로 동등성 포함)
- **진행 중:** 없음
- **다음 작업:** INT-GAME-004·005·006 리드 결정 후 provisional 3종 이관·레이아웃 단일 소스화·명중 이벤트 배선, 화물선 시스템(경로 항행 표적 — TargetRegistry 등록)·임시 탐지(D6~D9 잔여)
- **차단 문제:** 없음. 단 ① 렌더가 `positionY`를 아직 소비하지 않아 상승·하강이 화면에 안 보임(INT-GAME-005) ② 이동·어뢰 신규 수치는 params 부재로 R7 선진행(`provisionalMovement.ts`·`provisionalWorld.ts`·`provisionalCombat.ts` — INT-GAME-004·006) ③ 함선 명중의 렌더·오디오 통지는 이벤트 미정(INT-GAME-006 — 현재 표적 콜백만)
- **변경된 계약:** 없음 (직접 변경 없음 — 리드 반영분 INT-CORE-002의 `AimSystem`·`aimModeChanged`를 구현·소비. INT-GAME-004·005·006 제안 등록)
- **통합 주의사항:** 좌표 규약 — **잠수함 로컬 -Z가 선수, +Z가 선미** (`src/core/conventions.ts`만 참조). heading은 Y축 요(yaw), heading 0 선수 = 월드 -Z, 렌더는 `mesh.rotation.y = headingRadians` 그대로. **`player.speed`는 부호 있는 값**(음수 = 후진) — 소음 산출 등은 \|speed\| 사용할 것. `player.positionY`(수직)·`verticalSpeed` 추가. 심도 초기 구간은 y=0 → `cruise`(초기 이벤트 없음). **충돌체 집합은 `gameplay.collision.colliders`(읽기 전용) 공유** — 은신 시야 차폐(D10~12)는 이 집합을 재사용할 것(별도 집합 금지). 레벨 교체 시 `collision.clear()` 후 재등록, 렌더 협곡 배치 변경 시 `collision/startingArea.ts` 미러 동시 갱신(단일 소스화 전까지). **전투 입력은 반드시 `gameplay.aim`(계약 AimSystem) 하나로** — HUD 조준·발사 버튼은 composition root에서 `aim.beginAim()/endAim()/fireTorpedo()`를 호출(별도 전투 시스템 금지), UI는 `torpedo.remaining`·`torpedo.reloadRemainingSeconds`·`aim.aiming` 폴링 + `aimModeChanged` 구독. 리드샷 보조선 = `targets.list`(위치·속도) + `torpedo.torpedoSpeedMetersPerSecond` + `player` 포즈로 계산. 렌더 어뢰 항적은 `torpedo.torpedoes`(읽기 전용) 폴링. 화물선 시스템은 `targets.register()`로 표적 등록(콜백 `onTorpedoHit`는 어뢰 1발당 1회 보장)
- **마지막 업데이트:** 어뢰 전투 커밋 (통합 순서 [5])
- **담당 브랜치:** `claude/submarine-controls-depth-3wi424` (원격 세션 지정 브랜치 — `feat/gameplay` 역할, origin/dev + 리드 계약 브랜치 병합 기반)

## 그래픽스

- **완료:** ① D3~D5 회색 박스 장면(`CanyonScene`) — 회색 협곡 블록아웃(단위 박스 재사용, 결정적 S자 수로 + 임시 기둥, 벽 상단은 해수면 아래), 잠수함 대체 오브젝트(캡슐+함교, **-Z 선수/+Z 선미 규약**), 기본 수중 포그·배경, 조명 2개 이내, 블롭 섀도 / 카메라 추적·리센터 구조(`CameraRig`, 선미 후방 뷰, 상하 ±60도) / **X-ray 스파이크 판정: 성공**(`docs/RENDER_SPIKE_XRAY.md`) ② **선미 프로펠러**(`Propeller` — 실제 전후 속도 파생값으로 정/역회전, 정지 시 8% 공회전, 수치는 `renderVisualParams.json` 외부 설정) ③ **해수면**(`SeaSurface` — 정점 파도, 수면 위/아래 배경·포그 전환, 반사·굴절 없음) ④ **화물선 임시 표적**(`CargoShipVisual` — 흘수 실루엣, 명중 폭발·기울며 침몰·완료 시 dispose. 판정 없음, 상태 주입식) ⑤ **정식 계약 소비 교체 (D+5 리뷰 후속)** — 프로펠러: 위치 변화 추정 제거, 정식 signed `speed` + `conventions.propellerSpinRatio()` + `movement.json propellerIdleSpinRatio`(단일 소스) / 잠수함 Y: `poseSource.positionY` 소비(연속 상승·하강 화면 반영, INT-GAME-005 ②) / 리센터: `conventions.cameraRecenterYawRadians` 기준
- **진행 중:** 없음
- **다음 작업:** 레벨 블록아웃 수신 시 임시 협곡 배치 교체(충돌 미러와 단일 소스화 — INT-GAME-005) / 조준 카메라 고정(`aimModeChanged` 구독, EventBus 배선 리드 재논의 후) / 어뢰 항적 표현(`torpedo.torpedoes` 폴링) / 소음 파문 이펙트(D10~12, 인스턴싱) / 심도별 포그·X-ray 본 통합(`floodingChanged` 구독, D13~14) / 모델 임포트(D+8 이후)
- **차단 문제:** 없음. 단 ① `SubmarinePoseSource.positionY`는 계약(PlayerController) 미반영 상태라 **선택 필드로 소비** 중 — INT-GAME-004 승인 시 필수 필드 승격 ② 화물선 정식 시스템·상태 계약 부재(D6~D9 예정) — `attachCargoShipSource` 주입 포트만 준비, INT-RENDER-003 재요청 ③ 렌더 협곡 벽 높이와 충돌 미러 불일치 — INT-RENDER-004로 통합 담당에 보고 (임의 복제 수정 안 함)
- **변경된 계약:** 없음 (`src/contracts/*` 미수정 — INT-CORE-002 반영분 `conventions.ts`·`propellerIdleSpinRatio`를 소비만 함)
- **통합 주의사항:** **프로펠러 회전은 정식 signed speed 소비로 교체됨** — 위치 변화 추정 제거, `conventions.propellerSpinRatio(speed, maxSpeed, idle)` 사용, 공회전 소스는 `params/movement.json propellerIdleSpinRatio` 하나(renderVisualParams.json에서 중복 제거, 핫리로드 반영). 잠수함 Y는 `poseSource.positionY` 소비 — 상승·하강이 화면에 보임(블롭 섀도는 해저 고정 투영 유지). 리센터 후방 뷰는 `conventions.cameraRecenterYawRadians` 기준(선미 뒤쪽 상단→선수 방향 — 카메라 위치는 시선 반대 방향 오프셋으로 환산). 화물선은 상태 주입 대기(미주입 시 정지 표적, `?shipdemo`는 침몰 연출 미리보기만 — 이동 시연 제거). X-ray 선체·해수면 depthWrite:false — 반투명 renderOrder 서열(블롭1<X-ray2<수면3<폭발4) 조율 필요. 실시간 그림자·반사 금지 유지 (§12)
- **마지막 업데이트:** D+5 리뷰 후속 (정식 계약 소비 교체 — signed speed·positionY·conventions·movement.json 공회전, feat/render)
- **담당 브랜치:** `feat/render` (게임플레이 `claude/submarine-controls-depth-3wi424` 병합 기반)

## 빌드·툴

- **완료:** D1~D2 — Vite+TS 프로젝트, 성능 오버레이(FPS·평균·최소·로딩·모드·렌더러), LoadingTimer, GateMetricRecorder(JSON 다운로드), check-build-size(15MB 게이트), print-project-status, CI 워크플로, PR·이슈 템플릿 / **단계 0 잔여분** — Node 버전 고정(.nvmrc `22.22.2` + engines `>=22 <23` + .npmrc engine-strict, CI는 node-version-file로 일원화), 잠금 파일 기준 버전 재현 확인(three 0.185.1 · vite 8.2.0 · typescript 7.0.2), GitHub Pages 배포 워크플로(`.github/workflows/deploy.yml` — main 푸시·수동 실행, 배포 전 typecheck·build·check:size 강제, `docs/DEPLOY.md`), JSON 파라미터 핫리로드(Vite HMR — 리로드·재빌드 없이 반영, 범위 밖 값은 기존 validateParams가 거부·이전 값 유지, `loadParams()` 인터페이스 불변 + `onParamsReloaded()` 구독 추가), 게이트 기록에 초당 FPS 시계열(`fpsSamples`)·빌드 모드 추가(G1 구간별 로그 — 개인정보·고유 식별자 없음), Web Audio 최소 배관(`src/audio/WebAudioSystem.ts` — AudioContext unlock·마스터 버스·패너 연결·카메라 기준 리스너까지만, 판정 타이머 없음)
- **진행 중:** 없음
- **다음 작업:** Pages 활성화 후 첫 배포 URL 확인, D3 이후 AudioSystem을 Game에 조립(리드 승인 경유), 이벤트 구독 기반 사운드 동기화·지연 측정(D+10 사운드 세트 수신 후)
- **차단 문제:** 배포 URL 미확보 — 저장소 관리자가 Settings→Pages에서 Source를 "GitHub Actions"로 1회 설정 후 워크플로 실행 필요 (`docs/DEPLOY.md`). 이 작업 환경에는 해당 권한·인증 정보 없음
- **변경된 계약:** 없음 (INTEGRATION_NOTES INT-TOOL-001 — package.json engines·ParamLoader 내부 교체, 리드 확인 대기)
- **통합 주의사항:** 개발 모드에서 params/*.json 저장 시 페이지 리로드 없이 값이 교체된다 — 시스템은 `loadParams()`를 매번 다시 읽거나 `onParamsReloaded()`로 통지받을 것. 프로덕션 빌드는 번들 값 고정(핫리로드 코드 제거됨). D+5 통합에서 게임플레이가 `onParamsReloaded` 주입 구독으로 연결됨(HMR 적용·범위 밖 거부 브라우저 검증 통과). **WebAudioSystem은 D+5에서도 미조립 — 후속 통합 항목**: 사운드 에셋(D+10)·카메라 리스너 연동이 오기 전에는 조립 실익이 없어 D+5 범위에서 제외, D13~14 사운드 배관 단계에서 리드 승인 경유로 조립 (INT-TOOL-001은 승인 완료, vite base './'는 변경 없음)
- **마지막 업데이트:** D+5 (툴링 산출물 통합 확인 — Node 고정·Pages 워크플로·HMR·게이트 시계열 보존)
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
| 2. 코어 전투 루프 | D6~D9 | 대기 |
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
