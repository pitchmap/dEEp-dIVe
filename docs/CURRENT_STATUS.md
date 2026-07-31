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
- **진행 중:** 없음
- **다음 작업:** D6 — 코어 전투 루프 착수 (화물선·임시 탐지·구축함 AI 2상태·어뢰·폭뢰), dev PR 검토
- **차단 문제:** 없음
- **변경된 계약:** `MovementParams`에 `maxSpeedMetersPerSecond`·`accelerationSeconds`(FixedNumber) 추가 — INT-GAME-001 승인, INTERFACES.md §3 갱신
- **통합 주의사항:**
  - 각 파트는 자기 소유 영역에서 `GameSystem`(`src/core/GameSystem.ts`) 구현체를 export하고, 이 문서 자기 구역에 등록 요청을 남긴다. `src/core` 배선은 feat→dev 병합 시 리드가 수행
  - 파트 간 통신은 EventBus만 — 구현체 간 직접 참조(포즈 주입 등)는 composeSystems(composition root)에서만 잇는다
  - 3D 장면(회색 박스 블록아웃)은 시스템이 아니라 `ManagedScene`으로 SceneManager에 등록
  - 상태 전환(GameStateMachine)과 장면 전환(SceneManager)은 분리 — 자동 매핑 없음
- **마지막 업데이트:** D+5 (회색 박스 통합 커밋)
- **담당 브랜치:** `claude/deep-dive-d5-gray-box-integration-tree5i` (D+5 통합 세션 — dev PR 대기)

## 게임플레이

- **완료:** D3~D5 조작·심도 — `PlayerController` 구현(`SubmarinePlayerController`: WASD, 잠수함 방향 기준 선회, 정지·가감속 관성, delta time 기반), `DepthSystem` 구현(`LayeredDepthSystem`: 3층 층 단위 이동, Shift/Ctrl, `depthChanged` 발행, 경계 초과 무시), `KeyboardInput`(키 반복 무시·blur/탭 전환 시 키 상태 해제), 조립점 `GameplaySystems`, 결정적 검증 21항목(`src/systems/__verification__/` — `node src/systems/__verification__/run.mjs`, 21/21 통과)
- **진행 중:** 없음
- **다음 작업:** D6 이후 어뢰·탐지(임시)·폭뢰. (카메라 조작은 D+5 통합에서 그래픽스 소유 `CameraInputAdapter`로 책임 확정 — 게임플레이 범위에서 제외)
- **차단 문제:** 없음 — D+5 통합에서 해소: ① INT-GAME-002 승인·반영 (`GameplaySystems`가 `GameSystem` 구현, composeSystems 등록·initialize/dispose 수명주기) ② INT-GAME-001 승인·반영 (최고 속력 10m/s·가속 3.0s를 `params/movement.json` 임시 초기 테스트값으로 이관, `provisionalMovement.ts` 삭제, params 핫리로드는 onParamsReloaded 주입 구독으로 대응)
- **변경된 계약:** `MovementParams` 필드 2종 추가 (INT-GAME-001 — 리드 승인 완료)
- **통합 주의사항:** 좌표 규약 — heading은 Y축 요(yaw), heading 0 전진 = -Z, 전진 벡터 = (-sin h, -cos h) → 렌더는 `mesh.rotation.y = headingRadians` 그대로 사용 가능. A=heading 증가(좌), D=감소(우), (-π, π] 정규화. 심도 시작 층은 `cruise`(초기 `depthChanged` 이벤트 없음 — 초기값은 `currentLayer`로 읽을 것). 위치·방향·속도는 `player`의 읽기 전용 상태로 매 프레임 폴링
- **마지막 업데이트:** D3~D5 (조작·심도 구현 커밋)
- **담당 브랜치:** `claude/submarine-controls-depth-3wi424` (원격 세션 지정 브랜치 — `feat/gameplay` 역할)

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
