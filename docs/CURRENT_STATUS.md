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

- **완료:** 없음 (D1~D2는 환경 구축 단계)
- **진행 중:** 없음
- **다음 작업:** D3~D5 — PlayerController(WASD·관성)·DepthSystem(3층)·카메라 조작, `params/movement.json` 수치 주입 사용
- **차단 문제:** 없음. 수치표 v1(기획, D+3 절대 마감) 미도착 시 현재 params 초기 테스트값으로 선진행 (R7 규칙)
- **변경된 계약:** 없음
- **통합 주의사항:** 시스템 구현은 `src/contracts/systems.ts` 인터페이스를 그대로 구현할 것. 소음 값은 noiseChanged 이벤트로만 외부 전달
- **마지막 업데이트:** D2 (초기화)
- **담당 브랜치:** (미생성 — `feat/gameplay-*` 예정)

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

- **완료:** D1~D2 — Vite+TS 프로젝트, 성능 오버레이(FPS·평균·최소·로딩·모드·렌더러), LoadingTimer, GateMetricRecorder(JSON 다운로드), check-build-size(15MB 게이트), print-project-status, CI 워크플로, PR·이슈 템플릿 / **단계 0 잔여분** — Node 버전 고정(.nvmrc `22.22.2` + engines `>=22 <23` + .npmrc engine-strict, CI는 node-version-file로 일원화), 잠금 파일 기준 버전 재현 확인(three 0.185.1 · vite 8.2.0 · typescript 7.0.2), GitHub Pages 배포 워크플로(`.github/workflows/deploy.yml` — main 푸시·수동 실행, 배포 전 typecheck·build·check:size 강제, `docs/DEPLOY.md`), JSON 파라미터 핫리로드(Vite HMR — 리로드·재빌드 없이 반영, 범위 밖 값은 기존 validateParams가 거부·이전 값 유지, `loadParams()` 인터페이스 불변 + `onParamsReloaded()` 구독 추가), 게이트 기록에 초당 FPS 시계열(`fpsSamples`)·빌드 모드 추가(G1 구간별 로그 — 개인정보·고유 식별자 없음), Web Audio 최소 배관(`src/audio/WebAudioSystem.ts` — AudioContext unlock·마스터 버스·패너 연결·카메라 기준 리스너까지만, 판정 타이머 없음)
- **진행 중:** 없음
- **다음 작업:** Pages 활성화 후 첫 배포 URL 확인, D3 이후 AudioSystem을 Game에 조립(리드 승인 경유), 이벤트 구독 기반 사운드 동기화·지연 측정(D+10 사운드 세트 수신 후)
- **차단 문제:** 배포 URL 미확보 — 저장소 관리자가 Settings→Pages에서 Source를 "GitHub Actions"로 1회 설정 후 워크플로 실행 필요 (`docs/DEPLOY.md`). 이 작업 환경에는 해당 권한·인증 정보 없음
- **변경된 계약:** 없음 (INTEGRATION_NOTES #002 — package.json engines·ParamLoader 내부 교체, 리드 확인 대기)
- **통합 주의사항:** 개발 모드에서 params/*.json 저장 시 페이지 리로드 없이 값이 교체된다 — 시스템은 `loadParams()`를 매번 다시 읽거나 `onParamsReloaded()`로 통지받을 것. 프로덕션 빌드는 번들 값 고정(핫리로드 코드 제거됨). WebAudioSystem은 아직 어디에도 조립되지 않음(스텁 아님 — 계약 구현체, 조립은 D3+)
- **마지막 업데이트:** 단계 0 잔여 작업 완료 (브랜치 `claude/deep-dive-tooling-phase-0-cj6c49`, `feat/tooling` 기반)
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
| 1. 회색 박스 | D3~D5 | 대기 |
| 2. 코어 전투 루프 | D6~D9 | 대기 |
| 3. 은신·탐지 | D10~D12 | 대기 |
| 4. 연출 적용 | D13~D14 | 대기 |
| 5. 통합·게이트 준비 | D15 | 대기 |
