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
