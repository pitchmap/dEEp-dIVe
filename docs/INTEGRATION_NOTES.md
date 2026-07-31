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
