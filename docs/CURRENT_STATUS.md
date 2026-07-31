# CURRENT_STATUS — 역할별 현재 상태

> 모든 역할은 **작업 시작 전에 이 문서를 읽고, 작업 종료 시 자기 구역을 갱신**한다.
> 형식을 유지할 것: 완료 / 진행 중 / 다음 작업 / 차단 문제 / 변경된 계약 /
> 통합 주의사항 / 마지막 업데이트 / 담당 브랜치.

---

## 개발 리드

- **완료:** D1~D2 환경 구축 검수 — 저장소 구조, core 골격(루프·상태 머신·EventBus·SceneManager), 계약 3종(events/systems/params) 정의
- **진행 중:** 없음
- **다음 작업:** D3 — 상태 머신 전환 조건 골격, DetectionSystem 임시/본 구현 교체 설계, 구축함 AI 착수 준비
- **차단 문제:** 없음
- **변경된 계약:** 초기 정의 (이후 변경은 INTEGRATION_NOTES 경유)
- **통합 주의사항:** `src/contracts/*`는 공통 보호 파일 — 직접 수정 금지, 제안은 INTEGRATION_NOTES로
- **마지막 업데이트:** D2 (저장소 부트스트랩 커밋)
- **담당 브랜치:** `claude/deep-dive-bootstrap-6wrpuw` (부트스트랩) → 이후 `feat/lead-*`

## 게임플레이

- **완료:** D3~D5 조작·심도 — `PlayerController` 구현(`SubmarinePlayerController`: WASD, 잠수함 방향 기준 선회, 정지·가감속 관성, delta time 기반), `DepthSystem` 구현(`LayeredDepthSystem`: 3층 층 단위 이동, Shift/Ctrl, `depthChanged` 발행, 경계 초과 무시), `KeyboardInput`(키 반복 무시·blur/탭 전환 시 키 상태 해제), 조립점 `GameplaySystems`, 결정적 검증 21항목(`src/systems/__verification__/` — `node src/systems/__verification__/run.mjs`, 21/21 통과)
- **진행 중:** 없음
- **다음 작업:** 카메라 조작(회전·리센터·±60도 — 단계 1 잔여분, 이번 창 범위 제외), INTEGRATION_NOTES #002·#003 리드 결정 후 후속 반영, D6 이후 어뢰·탐지(임시)·폭뢰
- **차단 문제:** ① core 조립 연결(#003) 전까지 실제 빌드에서 조작 불가 — 리드 결정 필요 ② 최고 속력·가속 수치가 params에 없어 임시 기본값 선진행 중(R7, `src/systems/provisionalMovement.ts`) — #002 결정 필요
- **변경된 계약:** 없음 (직접 변경 없음 — INTEGRATION_NOTES #002·#003 제안만 등록)
- **통합 주의사항:** 좌표 규약 — heading은 Y축 요(yaw), heading 0 전진 = -Z, 전진 벡터 = (-sin h, -cos h) → 렌더는 `mesh.rotation.y = headingRadians` 그대로 사용 가능. A=heading 증가(좌), D=감소(우), (-π, π] 정규화. 심도 시작 층은 `cruise`(초기 `depthChanged` 이벤트 없음 — 초기값은 `currentLayer`로 읽을 것). 위치·방향·속도는 `player`의 읽기 전용 상태로 매 프레임 폴링
- **마지막 업데이트:** D3~D5 (조작·심도 구현 커밋)
- **담당 브랜치:** `claude/submarine-controls-depth-3wi424` (원격 세션 지정 브랜치 — `feat/gameplay` 역할)

## 그래픽스

- **완료:** 없음 (부트스트랩 장면·렌더러는 환경 구축 산출물)
- **진행 중:** 없음
- **다음 작업:** 1주차 — X-ray 반투명 렌더 기술 스파이크 [최우선, R5], 회색 협곡 블록아웃 수용 준비
- **차단 문제:** 없음
- **변경된 계약:** 없음
- **통합 주의사항:** `BootstrapScene`의 기준 오브젝트는 D3 이후 회색 박스로 교체 예정 — 게임 에셋 아님. 실시간 그림자·반사 금지 (성능 예산 §12)
- **마지막 업데이트:** D2 (초기화)
- **담당 브랜치:** (미생성 — `feat/graphics-*` 예정)

## 빌드·툴

- **완료:** D1~D2 — Vite+TS 프로젝트, 성능 오버레이(FPS·평균·최소·로딩·모드·렌더러), LoadingTimer, GateMetricRecorder(JSON 다운로드), check-build-size(15MB 게이트), print-project-status, CI 워크플로, PR·이슈 템플릿
- **진행 중:** 없음
- **다음 작업:** 정적 배포 파이프라인 연결(배포 URL 확보 — D2 완료 조건의 잔여분), JSON 핫리로드 툴(fetch 기반 파라미터 교체), Web Audio 배관 골격
- **차단 문제:** 배포 대상 호스팅 미정 — 리드/경영 결정 필요
- **변경된 계약:** 없음
- **통합 주의사항:** ParamLoader는 현재 정적 import — 핫리로드 툴 도입 시 ParamLoader 내부만 교체 (인터페이스 유지)
- **마지막 업데이트:** D2 (저장소 부트스트랩 커밋)
- **담당 브랜치:** `claude/deep-dive-bootstrap-6wrpuw` (부트스트랩) → 이후 `feat/tooling-*`

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
| 0. 환경 구축 | D1~D2 | ✅ 저장소·골격·계측 완료 / ⚠ 배포 URL 미확보 |
| 1. 회색 박스 | D3~D5 | 대기 |
| 2. 코어 전투 루프 | D6~D9 | 대기 |
| 3. 은신·탐지 | D10~D12 | 대기 |
| 4. 연출 적용 | D13~D14 | 대기 |
| 5. 통합·게이트 준비 | D15 | 대기 |
