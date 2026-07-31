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

## 제안 목록

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
| 적용 커밋 | (본 브랜치 커밋) |

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
| 적용 커밋 | (본 브랜치 커밋) |

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
| 적용 커밋 | (본 브랜치 커밋) |

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
