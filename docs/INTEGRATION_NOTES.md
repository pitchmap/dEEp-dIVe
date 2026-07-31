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

### #003 — 화물선 상태 계약 정의 요청 (렌더 소비용)

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (feat/render) |
| 대상 시스템 | `src/contracts/systems.ts` (화물선 시스템 인터페이스 신설) 또는 `src/contracts/events.ts` (격침 이벤트) — 리드 판단 |
| 필요한 변경 | 화물선의 읽기 전용 상태(수평 위치 X/Z, 방향, 격침 여부)를 렌더가 소비할 계약. 현재 렌더는 임시로 자체 소비 인터페이스 `CargoShipStateSource`(CanyonScene.ts)를 정의해 두었고, 게임플레이 구현체가 생기면 `scene.attachCargoShipSource(...)`로 주입하는 구조다. 계약 확정 시 렌더 측 인터페이스를 계약 타입으로 교체한다. 격침 통지는 이벤트(`shipSunk` 등)로 정의해도 무방 — 렌더는 통지 1회만 필요 |
| 변경 이유 | §5.9 화물선 격침의 시각 표현(임시 표적·실루엣·명중·침몰 연출)을 D3~D5에 선구현했으나, 공통 계약에 화물선 상태·이벤트가 없어 이동·피격 상태를 정식으로 받을 경로가 없음. 렌더에서 전투 판정을 만들지 않는 원칙 유지 목적 |
| 관련 게이트 | G1 (렌더 성능), G3 (명중 피드백 가독성) |
| 영향을 받는 파일 | `src/contracts/systems.ts` 또는 `events.ts`, `src/render/CanyonScene.ts`, `src/render/CargoShipVisual.ts`, (게임플레이 화물선 구현 파일) |
| 하위 호환 여부 | 깨지지 않음 — 소스 미주입 시 정지 표적으로 렌더되며 빌드·실행 정상. `?shipdemo` URL 플래그는 렌더 검증용 시연 구동일 뿐 판정이 아님 |
| 개발 리드 결정 | (대기) |
| 적용 커밋 | — |

### #002 — 회색 박스 장면 조립·연결 (core/Game.ts 정리 요청)

| 필드 | 내용 |
|---|---|
| 요청자 | 그래픽스 (feat/render) |
| 대상 시스템 | `src/core/Game.ts` (공통 보호 파일) — 장면 조립부 |
| 필요한 변경 | ① `BootstrapScene` 임포트를 `CanyonScene`으로 교체하고 `src/render/BootstrapScene.ts`(별칭 재수출) 삭제 ② 게임플레이 `PlayerController` 구현체 완성 시 Game 조립부에서 `scene.attachPoseSource(playerController)` 호출 (렌더는 읽기 전용 포즈 소비만) ③ 카메라 입력(마우스 회전·Space 리센터)은 게임플레이 측이 `scene.cameraRig.rotate()/recenter()`를 호출하는 방식으로 연결 ④ (D6 이후) 장면에 EventBus 접근 경로 제공 — `depthChanged`(심도 포그)·`noiseChanged`(파문)·`floodingChanged`(X-ray 자동 발동) 구독용 |
| 변경 이유 | 렌더는 core를 수정할 수 없어 D3 장면 교체를 임시로 별칭 재수출로 처리 중. 또한 '렌더에서 판정·이동 계산 금지' 원칙상 잠수함 위치·방향은 게임플레이 상태 주입이 필요하나 현재 Game이 장면에 renderer만 전달함 |
| 관련 게이트 | G1 (렌더 성능 역추적), G5 (카메라·리센터) |
| 영향을 받는 파일 | `src/core/Game.ts`, `src/render/BootstrapScene.ts`(삭제 예정), `src/render/CanyonScene.ts`, (②는 게임플레이 구현 파일) |
| 하위 호환 여부 | 깨지지 않음 — 별칭 재수출로 현 시그니처가 유지되고 있어 승인 전에도 빌드·실행 정상. 포즈 미주입 시 잠수함은 원점 정지 렌더 |
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
