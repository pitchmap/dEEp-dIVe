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

### #004 — [제안만 — 미반영] 조준·발사 요청 이벤트 3종 + 발사 가능 상태 구독 + 이동 파라미터 4종

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴·UI (조작 HUD 작업) |
| 대상 시스템 | `src/contracts/events.ts`(이벤트 추가), TorpedoSystem 구현(게임플레이), `params/movement.json` 계약 |
| 필요한 변경 | ① 이벤트 3종 추가 제안: `aimStartRequested { source: 'mouse' \| 'screenButton' }` / `aimEndRequested { source }` / `torpedoFireRequested { source }` (발행: UI HUD, 구독: 게임플레이 조준·TorpedoSystem. 기존 `torpedoFired`는 "발사 완료" 사실 이벤트라 요청 용도로 재사용하지 않음 — 명명은 기존 과거분사 규칙에 `Requested` 접미) ② TorpedoSystem 구현 후 `remaining`·`reloadRemainingSeconds`를 HUD가 읽어 발사 버튼 비활성화 연결 ③ 새 회의 언급 이동 파라미터 4종 필요: 프로펠러 공회전 속도 0.08, 정지 시 선회 속도 배율 1.0, 후진 최고속도 비율, 상승·하강 속도 — **소비 코드·계약 합의가 없어 이름을 임의로 정하지 않고 기록만** (기획·게임플레이가 params 계약 확정 시 추가) |
| 변경 이유 | 화면 조준·발사 버튼과 마우스 입력이 같은 전투 시스템을 호출해야 함(중복 시스템 금지). 현재 HUD는 내부 `CombatIntentSink`(기본: 계측+개발 로그)로 대기 중 |
| 관련 게이트 | G3 (60초 첫 발사), G7 |
| 영향을 받는 파일 | events.ts, INTERFACES.md, src/ui/ControlsHud.ts(승인 시 sink를 EventBus 발행으로 교체), 게임플레이 신규 구현 |
| 하위 호환 여부 | 이벤트 추가만 — 기존 구독자 영향 없음 |
| 개발 리드 결정 | **대기** — 승인 전까지 계약 파일 미수정. 참고: PC 화면 버튼 자체가 마스터 플랜 §5.18에 없는 신규 회의 결정으로 전달받음 — 리드·기획의 플랜 반영 확인 필요 |
| 적용 커밋 | (미반영) |

### #003 — HUD 조립을 위한 보호 파일 최소 변경 (선반영 — 확인 대기)

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

### #002 — Node 버전 고정(engines)·ParamLoader 핫리로드 내부 교체

| 필드 | 내용 |
|---|---|
| 요청자 | 빌드·툴 (단계 0 잔여 작업 지시) |
| 대상 시스템 | `package.json`(공통 보호 — engines만), `src/config/ParamLoader.ts`(공통 보호에 준함 — 내부만) |
| 필요한 변경 | ① engines `>=20` → `>=22 <23` (.nvmrc `22.22.2`·.npmrc engine-strict와 한 세트) ② ParamLoader에 Vite HMR 기반 params 핫리로드 — `loadParams()` 인터페이스 유지, `onParamsReloaded()` 구독 함수 추가. 검증 규칙(validateParams.ts)은 무변경 |
| 변경 이유 | 단계 0 완료 조건 — 로컬·CI·배포 Node 일원화(재현성), 빌드 없이 params 반영(§10.2 핫리로드) |
| 관련 게이트 | G1·G2 (계측·배포 재현성), 튜닝 루프 전반 |
| 영향을 받는 파일 | package.json, .nvmrc(신규), .npmrc(신규), src/config/ParamLoader.ts, .github/workflows/ci.yml |
| 하위 호환 여부 | 유지 — `loadParams()` 시그니처·검증 동작 불변. Node 20 로컬 환경은 engine-strict로 차단됨(의도) |
| 개발 리드 결정 | **확인 대기** — 작업 지시에 따라 선반영, D+5 통합 리뷰에서 승인 확인 요청 |
| 적용 커밋 | (이 브랜치의 단계 0 툴링 커밋) |

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
