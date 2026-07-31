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
  - **D6 통합 전 상태 계약 확정 (INT-CORE-003)**: `SubmarinePoseSource`(positionX/Y/Z·heading·부호 있는 forwardSpeed — 렌더의 위치 차분 재계산 금지), `CargoShipStateSource`(id·pose·velocity·hit·sinkProgress·removed — 침몰 시간축 게임플레이 소유), `torpedoHit { targetId, x, z }` 이벤트, `contracts/layout.ts`(CanyonLayout — 렌더·충돌 공용 단일 소스, 인터페이스만), 파라미터 단일 소스 확정(renderVisualParams의 idleSpinRatio·fullSpinAtSpeedMps 중복 제거 지시), Game 조립 연결 지도(ARCHITECTURE 'Game 조립 계약') 문서화
  - **통합 차단 2건 해소 (INT-CORE-004)**: ① `src/world/startingCanyonLayout.ts` — CanyonLayout 단일 데이터 인스턴스(`STARTING_CANYON_LAYOUT`), 벽 높이는 그래픽 하향값(11/12±2·sin, 상단≤7<해수면 12) 최종 확정 — 구 충돌 미러(15/16±3·sin)의 '보이지 않는 약 4m 벽' 소멸 ② 카메라 리센터 이의 해소 — `cameraRecenterYawRadians` 폐기, `cameraRecenterOffsetDirectionXZ`(위치=선미 방향)·`cameraRecenterLookDirectionXZ`(시선=선수 방향) 분리 (하나의 yaw 재사용 금지, 검증 기준: 프로펠러가 카메라 쪽·W 전진 시 화면 안쪽)
- **진행 중:** 없음
- **다음 작업:** D6 통합 — 각 파트 INT-CORE-003·004 적용분(게임플레이 b7faf44·그래픽 cbcbf65·툴링 2f8b66f) feat→dev 병합 리뷰 + composeSystems 배선(AimSystem·CargoShipSystem·레이아웃 주입), 구축함 AI 착수
- **차단 문제:** 없음
- **변경된 계약:** INT-CORE-004 — `startingCanyonLayout` 데이터 모듈 신설(src/world/ 공용 영역, FILE_OWNERSHIP 갱신), conventions 카메라 함수 교체(`cameraRecenterYawRadians` 폐기 → Offset/Look 분리). 이전: INT-CORE-003(SubmarinePoseSource·CargoShipStateSource·torpedoHit·layout.ts), INT-CORE-002, INT-GAME-001
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
- **마지막 업데이트:** D+5 리뷰 후속 (공통 규약 확정 커밋)
- **담당 브랜치:** `claude/deep-dive-core-lead-uyg77p` (리드 세션 — dev 병합분 머지 완료)

## 게임플레이

- **완료:**
  - D3~D5 조작·심도 (D+5 통합 반영) — WASD·관성·심도·`KeyboardInput`·`GameplaySystems`(GameSystem 수명주기)
  - **D+5 리뷰 스프린트 '이동·충돌' (통합 순서 [2])** — ① W 전진 / **S 후진**(상한 = 전진의 50%, `speed`는 부호 있는 전후 속도 — 프로펠러 S7 소비용) ② **Shift/Ctrl 연속 상승·하강**(수직 최고 속력 = 전진의 50%, 키 해제 시 관성 감속) ③ 수면 상한(+12.5)·해저 하한(-5) 이탈 방지 ④ 높이 기반 **심도 3구간 판정**(`LayeredDepthSystem` — 잠망경 ≥8 / 순항 ≥-2 / 심해, `depthChanged` 유지, `requestAscend/Descend` 계약은 프로그래매틱 층 이동으로 존치) ⑤ **정적 충돌**(`src/systems/collision/` — 구·AABB 조합, 선체 = 구 3개 캡슐 근사, 통과 방지·밀어내기만, 피해 없음, 반복 해석으로 끼임·떨림 방지) + 시작 지역 임시 레이아웃(CanyonScene 미러)
  - **어뢰 전투 (통합 순서 [5], INT-CORE-002 계약 소비)** — ① `PeriscopeAimSystem`(계약 `AimSystem` 구현): beginAim(잠망경 심도 전용)/endAim/fireTorpedo **공용 진입점**, `aimModeChanged` 발행(중복 없음), 심도 이탈 시 자동 해제, 자동 락온 없음 ② `StraightRunTorpedoSystem`(계약 `TorpedoSystem` 구현): 선수(-Z, conventions.bowDirectionXZ) 발사 지점 생성, 수평 직선 주행, 최대 사거리 초과 제거, 함선(XZ)·환경(3D, collision 공유 집합) 명중 시 1회만 처리, `torpedoFired` 발행, 재장전·보유량 = combat.json ③ `MouseCombatInput`: 우클릭 홀드 조준·좌클릭 발사(에지 1회=1발), blur·탭 전환 시 해제, 컨텍스트 메뉴 방지 ④ `TargetRegistry`: 표적 위치·속도·hitRadius + `onTorpedoHit`(1회 보장) — 리드샷 보조선 데이터 연결점
  - **화물선 + 상태 계약 적용 (INT-CORE-003 계약 소비)** — ① `SubmarinePlayerController`가 `SubmarinePoseSource` 계약 구현: `positionY`·부호 있는 `forwardSpeedMetersPerSecond`(+선수/−선미) 제공, 계약 `speed`는 비부호 크기로 정정 — `poseSource`는 계약 타입으로 노출 ② `CargoShipSystem`(계약 `CargoShipStateSource`·`CombatTarget` 구현): 1척, 해수면(12 — 렌더 SEA_SURFACE_Y 정합) 흘수선 유지, 직선 왕복(끝점 반전 잔여 이월 — dt 불변), TargetRegistry 등록, 첫 명중에서 `torpedoHit {targetId,x,z}` 1회 발행 + 표적 즉시 해제(중복 침몰 불가) + hit 고정, sinkProgress 0→1(시간축 게임플레이 소유) 후 removed=true, dispose 시 등록·참조 정리 ③ `TargetRegistry` id를 계약 체계(number)로 정렬 ④ 잠수함 수직 상한 12.5→11 조정(해수면 12 − 선체 반경 — 수면 돌출 방지) ⑤ 결정적 검증 71항목(71/71 — 기존 56 유지 + 포즈 계약·화물선 15)
- **진행 중:** 없음
- **다음 작업:** INT-GAME-004·005·006·007 리드 결정 후 provisional 4종 이관·레이아웃 단일 소스화, 격침 보상 어뢰 +1 배선(§5.9 — torpedoHit 구독), 임시 탐지·폭뢰·내구도(D6~D9 잔여)
- **차단 문제:** 없음. 단 ① 화물선 수치·경로·해수면은 R7 선진행(`provisionalCargo.ts`·`provisionalWorld.ts` — INT-GAME-007) ② 격침 보상(어뢰 +1)은 TorpedoSystem 잔량 증가 경로(계약 메서드) 리드 결정 대기(INT-GAME-007) ③ 렌더의 positionY·CargoShipStateSource 소비는 그래픽스 적용분(INT-CORE-003 적용 요청) 병합 시 연결
- **변경된 계약:** 없음 (직접 변경 없음 — 리드 반영분 INT-CORE-003의 `SubmarinePoseSource`·`CargoShipStateSource`·`torpedoHit`을 구현·발행·소비. INT-GAME-007 제안 등록)
- **통합 주의사항:** 좌표 규약 — **잠수함 로컬 -Z가 선수, +Z가 선미** (`src/core/conventions.ts`만 참조). heading은 Y축 요(yaw), heading 0 선수 = 월드 -Z, 렌더는 `mesh.rotation.y = headingRadians` 그대로. 속도 소비 규칙(INT-CORE-003): 프로펠러 등 부호가 필요하면 `poseSource.forwardSpeedMetersPerSecond`(+전진/−후진), 소음 산출 등 크기만 필요하면 계약 `player.speed`(비부호). 렌더 잠수함 Y는 `poseSource.positionY`. **화물선 상태는 `gameplay.cargoShipState`(계약 CargoShipStateSource)** — composition root가 CargoShipVisual에 주입, `hit`/`sinkProgress`(시간축 게임플레이 소유)/`removed`를 매핑만 할 것, 명중 연출·오디오는 `torpedoHit` 구독. 심도 초기 구간은 y=0 → `cruise`(초기 이벤트 없음). **충돌체 집합은 `gameplay.collision.colliders`(읽기 전용) 공유** — 은신 시야 차폐(D10~12)는 이 집합을 재사용할 것(별도 집합 금지). 레벨 교체 시 `collision.clear()` 후 재등록, 렌더 협곡 배치 변경 시 `collision/startingArea.ts` 미러 동시 갱신(단일 소스화 전까지). **전투 입력은 반드시 `gameplay.aim`(계약 AimSystem) 하나로** — HUD 조준·발사 버튼은 composition root에서 `aim.beginAim()/endAim()/fireTorpedo()`를 호출(별도 전투 시스템 금지), UI는 `torpedo.remaining`·`torpedo.reloadRemainingSeconds`·`aim.aiming` 폴링 + `aimModeChanged` 구독. 리드샷 보조선 = `targets.list`(위치·속도) + `torpedo.torpedoSpeedMetersPerSecond` + `player` 포즈로 계산. 렌더 어뢰 항적은 `torpedo.torpedoes`(읽기 전용) 폴링. 화물선 시스템은 `targets.register()`로 표적 등록(콜백 `onTorpedoHit`는 어뢰 1발당 1회 보장)
- **마지막 업데이트:** 어뢰 전투 커밋 (통합 순서 [5])
- **담당 브랜치:** `claude/submarine-controls-depth-3wi424` (원격 세션 지정 브랜치 — `feat/gameplay` 역할, origin/dev + 리드 계약 브랜치 병합 기반)

## 그래픽스

- **완료:** D3~D5 회색 박스 장면(`CanyonScene`) — 회색 협곡 블록아웃(단위 박스 재사용, 결정적 S자 수로 + 임시 기둥), 잠수함 대체 오브젝트(캡슐+함교), 기본 수중 포그·배경, 조명 2개 이내(방향광 1+보조 환경광), 블롭 섀도(`BlobShadow`) / 카메라 추적·리센터 구조(`CameraRig`, 상하 ±60도 제한) / **X-ray 반투명 렌더 스파이크 판정: 성공** (`src/render/xray/`, `?xray` 플래그 — `docs/RENDER_SPIKE_XRAY.md`, 대체 경로 발동 불필요)
- **진행 중:** 없음
- **다음 작업:** 레벨 블록아웃(D+5) 수신 시 임시 협곡 배치 교체 / 소음 파문 이펙트(D10~12, 인스턴싱) / 물 정점 애니메이션·심도별 포그·X-ray 본 통합(`floodingChanged` 구독, D13~14) / 모델 임포트(D+8 이후)
- **차단 문제:** 없음 — INT-RENDER-001 승인·반영 완료 (D+5 통합): `Game.ts`가 `CanyonScene` 직접 임포트, `BootstrapScene.ts` 별칭 삭제, `attachPoseSource`를 composition root에서 주입. **X-ray 스파이크는 성공으로 확정** — `?xray=1` 플래그로 반투명 선체 안 수위 판독 가능(브라우저 검증 스크린샷 확인), 기본 장면 실패와 격리, 대체 경로(아이콘 점멸 이관) 발동 불필요. 자동 수위 순환은 렌더 검증용 데모 유지 — 실제 침수 이벤트(`floodingChanged`) 연결은 D13~14 범위
- **변경된 계약:** 없음 (`src/contracts/*` 미수정)
- **통합 주의사항:** 카메라 입력 책임은 D+5 통합에서 **그래픽스로 확정** — `CameraInputAdapter`(신규, 렌더 소유)가 좌클릭 드래그 회전·Space 리센터를 `CameraRig`에 전달, 잠수함 이동키와 중복 없음, blur 시 드래그 해제, dispose에서 리스너 전부 해제. X-ray 선체가 depthWrite:false이므로 이후 반투명 오브젝트(파문 등)와 renderOrder 조율 필요. 실시간 그림자·반사 금지 유지 (성능 예산 §12)
- **마지막 업데이트:** D+5 (회색 박스 통합 — 카메라 입력 어댑터 추가는 통합 리드가 렌더 소유 영역에 배선 대행, INT-RENDER-001 결정 기록)
- **담당 브랜치:** `feat/render` (D+5 통합분은 `claude/deep-dive-d5-gray-box-integration-tree5i`)

## 빌드·툴

- **완료:** D1~D2 — Vite+TS 프로젝트, 성능 오버레이(FPS·평균·최소·로딩·모드·렌더러), LoadingTimer, GateMetricRecorder(JSON 다운로드), check-build-size(15MB 게이트), print-project-status, CI 워크플로, PR·이슈 템플릿 / **단계 0 잔여분** — Node 버전 고정(.nvmrc `22.22.2` + engines `>=22 <23` + .npmrc engine-strict, CI는 node-version-file로 일원화), 잠금 파일 기준 버전 재현 확인(three 0.185.1 · vite 8.2.0 · typescript 7.0.2), GitHub Pages 배포 워크플로(`.github/workflows/deploy.yml` — main 푸시·수동 실행, 배포 전 typecheck·build·check:size 강제, `docs/DEPLOY.md`), JSON 파라미터 핫리로드(Vite HMR — 리로드·재빌드 없이 반영, 범위 밖 값은 기존 validateParams가 거부·이전 값 유지, `loadParams()` 인터페이스 불변 + `onParamsReloaded()` 구독 추가), 게이트 기록에 초당 FPS 시계열(`fpsSamples`)·빌드 모드 추가(G1 구간별 로그 — 개인정보·고유 식별자 없음), Web Audio 최소 배관(`src/audio/WebAudioSystem.ts` — AudioContext unlock·마스터 버스·패너 연결·카메라 기준 리스너까지만, 판정 타이머 없음)
- **완료(추가):** 조작 HUD — 조작 안내 패널(좌측, `controlsConfig.ts` 단일 소스), H 토글(안내+버튼 동시 숨김·복원), Pointer Lock(캔버스 클릭 진입 → Esc 해제 시 GameLoop 정지로 일시정지 + 재진입 안내 오버레이, 진입 직후 250ms 입력 무시), 우클릭 컨텍스트 메뉴 방지, PC 화면 조준·발사 버튼(우하단 반투명 소형, 마우스 조준 3회 이상 시 존재감 축소), 입력 계측(`InputTelemetry` — 마우스/버튼별 조준·발사 횟수, Pointer Lock 진입·해제, 첫 발사 요청 시각 → 게이트 기록 JSON `input` 구역 합류, 개발 콘솔 `__deepDiveInput()`), HUD 파라미터 `params/ui.json`(툴링 소유 `uiParams.ts`에서 검증·핫리로드)
- **완료(추가 2):** HUD ↔ 실제 AimSystem 연결 — 게임플레이 브랜치(어뢰 전투 `10ef604`)·리드 계약(INT-CORE-002 `b69890b`)을 이 브랜치에 병합. 임시 `CombatIntentSink` 삭제, 화면 조준·발사 버튼이 composition root에서 주입받은 `gameplay.aim`(계약 `AimSystem`)의 `beginAim()/endAim()/fireTorpedo()`를 직접 호출(마우스 경로 `MouseCombatInput`과 같은 인스턴스·같은 판정). 조준 버튼 활성 표시 = `aimModeChanged` 구독(로컬 상태 아님 — 잠망경 심도 거부·자동 해제 반영). 발사 버튼 = `torpedo.remaining`·`reloadRemainingSeconds` 200ms 폴링 + `torpedoFired` 구독으로 잔량·재장전 표시·비활성화. 캔버스 마우스는 **게이트키퍼**로 재편: 전투 클릭은 window의 MouseCombatInput으로 통과(HUD가 aim 이중 호출 금지), 잠금 진입 클릭·진입 직후 250ms·비잠금·일시정지 클릭은 stopPropagation으로 소비(이중 발사·유령 발사 방지). 잠금 해제 시 `endAim()` 보장 후 일시정지
- **진행 중:** 없음
- **다음 작업:** Pages 활성화 후 첫 배포 URL 확인, D13~14 사운드 배관 단계에서 WebAudioSystem 조립(리드 승인 경유) + `depthChargeEnteredWater`/`aimModeChanged` 오디오 연동
- **차단 문제:** 배포 URL 미확보 — 저장소 관리자가 Settings→Pages에서 Source를 "GitHub Actions"로 1회 설정 후 워크플로 실행 필요 (`docs/DEPLOY.md`). 이 작업 환경에는 해당 권한·인증 정보 없음
- **변경된 계약:** 없음 — 계약 파일 직접 수정 없음 (INT-CORE-002의 `AimSystem`·`aimModeChanged`를 소비만). INT-TOOL-001 승인 완료(리드 D+5). INT-TOOL-002(HUD 조립 선반영)·INT-TOOL-004(HUD 전투 배선 선반영) 확인 대기, INT-TOOL-003(구 #004 요청 이벤트 3종)은 **폐기**
- **통합 주의사항:** ① **전투 마우스 입력의 소유자는 게임플레이(MouseCombatInput)** — HUD는 캔버스 mousedown을 계측+게이트키핑만 하고 aim을 호출하지 않는다. 전투로 가면 안 되는 클릭(잠금 진입·진입 직후 250ms·비잠금·일시정지)은 HUD가 stopPropagation으로 소비하므로, MouseCombatInput을 window보다 안쪽(캔버스 자체)에 부착하도록 바꾸면 이 차단이 깨진다 — 부착 지점 변경 시 툴링과 협의 필요 ② 일시정지(잠금 해제)는 GameLoop 정지 방식 — 게임플레이 update가 멈추므로 HUD가 잠금 해제 시 `aim.endAim()`을 보장 호출한다. 일시정지 중 쌓일 수 있는 클릭은 오버레이가 소비 ③ Esc·H는 HUD가 선점(Esc=잠금 해제·일시정지, 조준 취소 키 아님) — 새 키 추가 시 `controlsConfig.ts` 단일 소스에 등록 ④ 개발 모드 params/*.json(ui.json 포함) 저장 시 리로드 없이 반영 ⑤ WebAudioSystem은 미조립 유지(D13~14 조립 — 리드 D+5 결정) ⑥ PC 화면 버튼은 INT-CORE-002로 리드 승인 확인됨(별도 전투 시스템 금지 계약)
- **마지막 업데이트:** HUD ↔ AimSystem 실연결 (게임플레이·리드 브랜치 병합 포함)
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
