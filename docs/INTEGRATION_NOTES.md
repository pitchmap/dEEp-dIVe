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

### #003 — core/Game에 게임플레이 시스템 조립 연결 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (D3~D5 회색 박스 작업 창) |
| 대상 시스템 | `src/core/Game.ts` (공통 보호 파일 — 게임플레이가 직접 수정 불가) |
| 필요한 변경 | ① `GameplaySystems`(src/systems/GameplaySystems.ts) 인스턴스 생성: `new GameplaySystems(this.bus, params)` ② `update(dt)`에서 `gameplaySystems.update(dt)` 호출 ③ 초기화 시 `gameplaySystems.attachInput(window, document)` 호출 (정리 시 `detachInput()`) |
| 변경 이유 | PlayerController·DepthSystem 구현이 완료되었으나 core 조립점에 연결되지 않으면 빌드에서 동작하지 않음. D+5 회색 박스 빌드의 전제 |
| 관련 게이트 | G3, G4, G5 |
| 영향을 받는 파일 | `src/core/Game.ts` (구현: `src/systems/GameplaySystems.ts` — 변경 불요) |
| 하위 호환 여부 | 깨짐 없음 (추가만) |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### #002 — MovementParams에 최고 속력·가속 수치 추가 요청

| 필드 | 내용 |
|---|---|
| 요청자 | 게임플레이 (D3~D5 회색 박스 작업 창) |
| 대상 시스템 | `src/contracts/params.ts`의 `MovementParams`, `params/movement.json`, `src/config/validateParams.ts` |
| 필요한 변경 | `MovementParams`에 ① `maxSpeedMetersPerSecond`(최고 속력, m/s) ② `accelerationSeconds`(정지→최고 속력 도달 시간, 초) 추가. 형식은 기획 판단에 따라 Tunable(범위 포함) 권장 — 조정 범위·판단 기준은 기획(박태현)이 튜닝표(§11.2)에 행 추가 후 확정 |
| 변경 이유 | 이동 구현에 필수인 속도 스케일이 movement.json·튜닝표에 없음. R7 규칙("수치표 지연 → 임시 기본값 선진행")에 따라 현재 `src/systems/provisionalMovement.ts`에 임시값(최고 속력 10 m/s, 가속 3.0초)으로 선진행 중 — 승인·반영 즉시 해당 파일 삭제 및 주입 경로로 교체 예정. 하드코딩 금지 원칙의 예외 상태를 조기 해소해야 함 |
| 관련 게이트 | G3, G5, G7 (속도는 이후 소음·탐지의 입력값) |
| 영향을 받는 파일 | `src/contracts/params.ts`, `params/movement.json`, `src/config/validateParams.ts`, `docs/INTERFACES.md` §3, `src/systems/SubmarinePlayerController.ts`, `src/systems/provisionalMovement.ts`(삭제) |
| 하위 호환 여부 | 깨짐 없음 (필드 추가 — 기존 두 항목 유지) |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

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
