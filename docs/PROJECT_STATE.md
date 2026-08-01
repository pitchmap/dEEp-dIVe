# PROJECT_STATE — 지금 어디까지 왔고, 다음은 무엇인가

> ✅ **[PvE MVP 1차 통합 완료 — 2026-08-01]** 네 역할 브랜치(리드 `187536e` ·
> 게임플레이 `fa0dee6` · 그래픽 `66d6cbd` · 툴링 `5a3e5f9`)를 통합하고 조립
> 배선을 완료했다. **D+9 성장 루프가 종단간 성립한다**:
> 기지 → 출항 → 항해·충돌 → 조준경 토글 → 발사 → 화물선 격침 → 크레딧
> 드롭·회수 → 중도 귀환 → 정산 → 저장 → 새로고침 후 유지 → 재출항 →
> 업그레이드 반영 전투 수치.
> 검증: gameplay 100/100 · meta 19/19 · tooling 26/26 · HUD 33/33 ·
> 브라우저 스모크 33/33 · typecheck·build·size(4.1%)·scope 통과.
> **아직 없는 것(완료로 읽지 말 것):** 보스 AI(의도적 미구현 — 분절 렌더는
> QA 스파이크), 경비함 스폰(요청 이벤트만 발행, 소비 AI 없음), 중립 함선
> 배치, 업그레이드 구매 UI·장비 장착 UI, 탐지·폭뢰·내구도.
> 상세: [`PVE_MVP_ACCEPTANCE.md`](PVE_MVP_ACCEPTANCE.md) ·
> [`PVE_MVP_INTEGRATION_MANIFEST.md`](PVE_MVP_INTEGRATION_MANIFEST.md).
> 아래 본문 §2~§6은 D+10 시점 기술 지도로, PvE 배선 이후 사실과 다른 부분은
> 위 두 문서와 `CURRENT_STATUS.md`가 우선한다.
>
> ⚠️ **[방향 전환 공지 — 회의록 09~11]** 아래 본문은 **D+10 통합
> 시점(버티컬 슬라이스 트랙)** 기준이다. 이후 회의에서 큰 결정이 있었다:
> ① 5차 대회의(`meetings/09`) — 2차 플레이테스트 수정 5건 (함선 충돌체 추가,
> 발사=조준 모드 전용+어뢰 가시화, **우클릭 홀드 → 토글 조준경 개편**,
> **Ctrl=상승/Shift=하강 키 스왑**, 파도·에셋 재배치·어군 부활 1호)
> ② 6차 대회의(`meetings/10`) — **D+21 게이트 리뷰 4문 전부 통과** (61fps ·
> 11MB · 접속 2.4초 · 첫 어뢰 평균 48초) 후 정식 제작 방향을
> **싱글 PvE 보스 헌팅(탐사·성장·영구 업그레이드)** 으로 확정 — 1차 결의 1·4
> 개정, 신 스코프 가드(해역 1·보스 1종·업그레이드 7항목·장비 4종) 발효
> ③ 개발팀 소회의(`meetings/11`) — 구현 번역: 2계층 상태 머신(하위 세션
> 무수정 포장), 로컬 저장(버전+이중 슬롯), params 불변+합연산 배율 레이어,
> 보스 강체 4~5분절, 20영업일 4단계 일정, `/src/meta`·`economy`·
> `[LOOP][BOSS][ECON]` 태그 신설.
> **갱신:** 5차 결의 반영분과 PvE 전환 코드는 **이제 반영되어 있다**(PvE MVP
> 1차 통합). 본문 §4 규약 중 "우클릭 홀드 조준"·"Shift 상승/Ctrl 하강"은
> **개편 완료** — 최종 입력 규칙은 `우클릭 = 조준경 토글 / 조준 중 좌클릭 =
> 발사 / 비조준 좌클릭 = 카메라 / Ctrl·E = 상승 / Shift = 하강`이다.

> **최종 갱신: D+10 기본 전투 프로토타입 통합 완료 시점** (통합 커밋 `89de73f`,
> 브랜치 `claude/deep-dive-bootstrap-6wrpuw` — dev PR 대기).
> 새로 합류하거나 다음 작업을 시작하는 개발자는 **이 문서 → `CLAUDE.md` →
> 자기 역할 프롬프트(`prompts/`) → `docs/CURRENT_STATUS.md`** 순서로 읽으면 된다.
> 이 문서는 "현재 상태의 요약 지도"다 — 개별 사실의 원천은 각 절에 링크된 문서이며,
> 충돌 시 원천 문서가 우선한다.

---

## 1. 한눈에 보기

**게임:** UBOAT의 긴장감을, Submarine Attack의 즉각성으로, 바이브세일의 그래픽
비용으로 — 브라우저 세션형(7~10분) 로우폴리 3D 잠수함 서바이벌 액션.
유일한 최상위 기준 문서는 [`deep_dive_master_plan.md`](deep_dive_master_plan.md).

**현재 위치 (15영업일 버티컬 슬라이스 일정 기준):**

```
[✅ 단계 0] 환경 구축 (D1~D2)
[✅ 단계 1] 회색 박스 (D3~D5) — D+5 통합·전사 리뷰 완료
[✅ 번외] D+5 리뷰 스프린트 — S 후진·연속 심도·충돌·어뢰·화물선·HUD 조기 구현
[✅ 번외] D+10 기본 전투 프로토타입 통합 (dev PR 대기)
[🔵 지금] PvE MVP 1차 통합 완료 — 성장 루프 종단간 성립 (보스·경비 AI 제외)
[⏳ 단계 2 잔여] 탐지(임시)·구축함 AI·폭뢰·내구도·탈출 = "죽지 않고 1회 클리어"
[⏳ 단계 3] 은신·탐지 본 구현 (D10~D12)
[⏳ 단계 4] 연출 적용 — 모델·사운드·X-ray 본통합·파문 (D13~D14)
[⏳ 단계 5] 최적화·저사양 모드·빌드 봉인 (D15) → 테스터 세션 → 게이트 리뷰(D+21)
```

**지금 빌드를 실행하면 되는 것** (`npm run dev`):
잠수함 조작(W 전진 / S 후진 / A·D 선회 / Shift·Ctrl 연속 승강) → 협곡 지형
충돌 → 잠망경 심도에서 우클릭(또는 화면 버튼) 조준 → 어뢰 발사 → 왕복 항행
중인 화물선 명중 → 폭발·침몰·제거. 여기까지가 **1막(공격)까지의 전투 루프**다.

**아직 없는 것** (코어 루프 관점): 탐지·은신(눈 아이콘·소음·엄폐), 구축함,
폭뢰 회피(2막), 내구도·침수·실패, 탈출·클리어, 승무원 스킬 4종, 사운드 전체,
소음 파문, X-ray 본통합(스파이크는 성공), 로우폴리 정식 모델.

---

## 2. 개발 타임라인 — 지금까지 한 것

| 시점 | 산출물 | 핵심 커밋 | 검증 |
|---|---|---|---|
| **D1~D2 환경 구축** | Three.js+Vite+TS 골격, core(루프·상태 머신·EventBus·SceneManager), 계약 3종(events/systems/params), params 4종+범위 검증, FPS·로딩 오버레이, 게이트 기록 JSON, 15MB 용량 검사, CI, 문서·프롬프트 체계 | `5fc8b8e` | typecheck·build·브라우저 확인 |
| **D3~D5 회색 박스** | 잠수함 이동+관성·심도(게임플레이), 협곡 블록아웃·카메라·X-ray 스파이크 **성공**(그래픽스), Node 고정·Pages 워크플로·params HMR·Web Audio 최소 배관(툴링), GameSystem/SystemRegistry(리드) | `f5b5c1c` `9fc32f6` `5b33dec` `22f2d15` | 결정적 21/21, 브라우저 19/19 |
| **D+5 통합** | 4개 브랜치 → dev 병합 (PR #1), composeSystems 배선, 임시 이동 수치 params 이관 | dev `d994160` | 전 검사 통과 |
| **D+5 리뷰 스프린트** (4차 대회의 `07` + 입력 소회의 `08` 결의) | 공통 규약 `conventions.ts`(축·카메라·프로펠러·AimSystem 계약), S 후진·연속 승강·높이 기반 3구간 심도·정적 충돌, 직선 어뢰·AimSystem·CargoShipSystem(torpedoHit·sinkProgress·removed), 프로펠러·해수면·화물선 렌더, 조작 HUD·Pointer Lock·화면 전투 버튼·입력 모드 2원화, 공유 `STARTING_CANYON_LAYOUT`(투명 벽 소멸)·카메라 리센터 규약 확정 | `b69890b` `218ad86` `10ef604` `b7faf44` `efd4712` `c4841cf` `c46c937` `c091f30` `e0f7609` `2f8b66f` `a7c3cdf` | 결정적 75/75, HUD 33/33, Chromium 입력 모드 20/20 |
| **D+10 통합 (현재)** | 5개 브랜치 tip merge + Game.ts 최종 조립(레이아웃 명시 주입, 화물선·EventBus 배선, HUD 채택) | `89de73f` | §6 참조 — Chromium 실입력 50항목 전 통과 |

상세 이력: [`CURRENT_STATUS.md`](CURRENT_STATUS.md) (역할별),
[`INTEGRATION_NOTES.md`](INTEGRATION_NOTES.md) (계약 결정 이력),
[`meetings/`](meetings/README.md) (회의 결의).

---

## 3. 코드 지도 — 무엇이 어디에 있나

```
src/core/          [리드 소유 — 공통 보호]
  Game.ts            조립점(composition root). 시스템 등록·파트 간 배선은 여기서만
  GameLoop.ts        rAF 루프, delta 클램프, update/render 분리
  GameState(.Machine) BOOT→DEPARTURE→APPROACH→ATTACK→ESCAPE→RESULT (전환 조건은 미구현)
  EventBus.ts        타입 안전 이벤트 버스 (파트 간 유일한 통신로)
  GameSystem.ts / SystemRegistry.ts   시스템 수명주기(initialize/update/render/dispose)·등록 구조
  conventions.ts     ★축·방향·카메라·프로펠러 규약 (숫자 복제 금지 — 반드시 이 함수 사용)

src/contracts/     [공통 보호 — 변경은 INTEGRATION_NOTES 경유]
  events.ts          이벤트 계약 (aimModeChanged·torpedoHit 포함 12종)
  systems.ts         시스템 10종 + 상태 계약 SubmarinePoseSource·CargoShipStateSource
  params.ts          파라미터 타입 / layout.ts  CanyonLayout 계약

src/world/         [공용 데이터 — 공통 보호에 준함]
  startingCanyonLayout.ts  STARTING_CANYON_LAYOUT — 렌더·충돌이 공유하는 유일한 협곡 데이터

src/systems/       [게임플레이 소유]
  SubmarinePlayerController  WASD·관성·후진·연속 승강·수직 한계
  LayeredDepthSystem         높이 기반 3구간(잠망경/순항/심해) 판정·depthChanged
  PeriscopeAimSystem         AimSystem 구현 — 잠망경 전용 조준, 마우스·버튼 공용 진입점
  StraightRunTorpedoSystem   직선 어뢰·사거리·재장전·잔탄 (fire()가 유일한 발사 로직)
  CargoShipSystem            직선 왕복·1발 격침·torpedoHit 1회·침몰 시간축 소유
  MouseCombatInput / KeyboardInput / TargetRegistry / collision/ (레이아웃 소비 충돌)
  GameplaySystems            게임플레이 조립점 (GameSystem 구현체)
  provisional*.ts            ⚠ R7 임시 수치 4파일 — params 이관 대기 (§7 미결)

src/render/        [그래픽스 소유]
  CanyonScene        장면 — 포즈·화물선 상태·EventBus 주입받아 소비만 (판정 금지)
  Propeller          forwardSpeed 부호로 정/역회전, 공회전 하한 (위치 차분 금지)
  SeaSurface / CargoShipVisual(sinkProgress 매핑) / CameraRig·CameraInputAdapter / BlobShadow
  xray/XrayFloodingSpike     X-ray 스파이크 (성공 판정, ?xray=1 — 본통합은 D13~14)
  renderVisualParams.json    순수 연출값만 (밸런스·movement 값 중복 금지)

src/ui/            ControlsHud(조작 안내·H 토글·화면 전투 버튼·Pointer Lock·모드 오버레이),
                   PerformanceOverlay / src/audio/ WebAudioSystem(배관만 — 아직 미조립)
src/tools/         LoadingTimer·GateMetricRecorder(fpsSamples·input 계측)·InputTelemetry
params/            movement/detection/combat/crew.json — 기획 직접 커밋, 범위 밖 로드 거부
scripts/           check-build-size(15MB 게이트)·print-project-status
```

---

## 4. 반드시 따라야 할 확정 규약 (요약)

원천: [`ARCHITECTURE.md`](ARCHITECTURE.md)·[`INTERFACES.md`](INTERFACES.md)·`src/core/conventions.ts`

1. **축:** 로컬 -Z=선수, +Z=선미, 월드 +Y=위. 이동은 잠수함 기준(카메라 무관).
2. **카메라 리센터:** 위치=선미 방향(`cameraRecenterOffsetDirectionXZ`), 시선=선수
   방향(`...LookDirectionXZ`). ~~cameraRecenterYawRadians~~ 폐기, `+π` 보정 금지.
3. **포즈:** 렌더는 `SubmarinePoseSource`(positionX/Y/Z·heading·부호 있는
   forwardSpeed)만 소비. `PlayerController.speed`는 비부호 — 프로펠러에 쓰지 말 것.
4. **프로펠러:** `conventions.propellerSpinRatio(forwardSpeed, max, idle)` 하나만.
   A/D 단독 입력 무영향, 정지 시 공회전 8%(`params/movement.json` 단일 소스).
5. **레이아웃:** `STARTING_CANYON_LAYOUT` 단일 인스턴스 — 렌더 메시·충돌·해수면·
   스폰 전부 이 데이터. 자체 벽 수식·좌표 미러 금지.
6. **화물선:** `CargoShipStateSource` — 이동·명중·침몰 시간축은 게임플레이 소유,
   렌더는 표현만(자체 타이머·왕복·판정 금지). ~~isSunk~~ 없음.
7. **조준·발사:** 마우스·화면 버튼 모두 **동일 `gameplay.aim` 인스턴스**의
   beginAim/endAim/fireTorpedo만 호출. 잠망경 심도 전용, 자동 락온 없음,
   한 입력 한 발, 잔탄·재장전 공유.
8. **입력 모드 2원화** (`a7c3cdf` 최종): 마우스 모드(캔버스 클릭 Pointer Lock →
   우클릭 조준/좌클릭 발사/Esc 해제) ↔ 화면 버튼 모드(잠금 없음·커서 표시).
   Esc 후 오버레이에서 두 경로 중 선택. ~~"조준 버튼=Pointer Lock 진입 겸용"~~ 폐기.
9. **파라미터:** 밸런스 값은 `params/*.json`만, JSON→시스템 단방향, 하드코딩 금지.
   신규 수치는 R7 절차(임시값 파일 1곳 + INTEGRATION_NOTES 이관 요청).
10. **구조:** 기존 contracts/EventBus/Game/GameSystem/SystemRegistry 사용 —
    새 등록 구조·중복 인스턴스·any 캐스팅·더미 상태 소스 금지. 파트 간 직접
    참조는 `Game.composeSystems()`에서만.
11. **스코프:** 제외 기능(강화 카드·승무원 애니메이션·구축함 격침·자동 조준·어군
    등 — [`DECISIONS.md`](DECISIONS.md) ⛔구역)은 스텁도 만들지 않는다.

⚠ 마스터 플랜과 어긋나 보이는 부분(S 후진, 연속 심도, 정적 충돌, 화면 버튼)은
**4차 대회의·8차 소회의의 유효 결의**다 — 게이트 전 마스터 플랜 수정 금지
원칙에 따라 [`NEXT_SPRINT.md`](NEXT_SPRINT.md) §5 각주로 관리 중.

---

## 5. 조작표 (현재 빌드)

| 입력 | 동작 |
|---|---|
| W / S | 전진 / 후진(전진의 50% 상한) |
| A / D | 좌/우 선회 (정지 상태 제자리 선회 가능 — 인지된 리스크 R15) |
| Shift / Ctrl | 연속 상승 / 하강 (수면−1 ~ 해저+1 클램프) |
| Space | 카메라 리센터 (선미 뒤 상단 → 선수 방향) |
| 마우스 드래그(잠금 밖) · 이동(잠금 중) | 카메라 회전 (상하 ±60°) |
| 캔버스 클릭 | Pointer Lock 진입 (마우스 모드) |
| 우클릭 홀드 / 좌클릭 | 조준(잠망경 심도 전용) / 어뢰 발사 |
| 화면 버튼 (우하단) | 조준·발사 — 마우스와 동일 시스템·잔탄 공유 |
| H | 조작 안내·화면 버튼 표시/숨김 |
| Esc | Pointer Lock 해제 → 일시정지 + 모드 선택 오버레이 |

---

## 6. 검증 현황 (D+10 통합 시점)

| 검사 | 명령 | 결과 |
|---|---|---|
| 타입 | `npm run typecheck` | ✅ |
| 빌드 | `npm run build` | ✅ (dist 0.55MB — 15MB 게이트의 3.7%) |
| 용량 | `npm run check:size` | ✅ |
| 게임플레이 결정적 검증 | `node src/systems/__verification__/run.mjs` | ✅ **75/75** |
| HUD 헤드리스 검증 | (러너 저장소 미포함 — 툴링 `a7c3cdf` 기록) | ✅ 33/33 |
| 실입력 Chromium 플레이테스트 | D+10 지시서 50항목 (실키·실클릭) | ✅ 전 항목 |

**미검증 (실기기·환경 대기):** 실물 Esc 키(자동화는 exitPointerLock 동일 경로),
내장그래픽 노트북 60fps(G1), GitHub Pages 배포 URL(관리자 Pages 설정 1회 필요 —
[`DEPLOY.md`](DEPLOY.md)). 상세: `CURRENT_STATUS.md` 'D+10 통합 검증 결과'.

---

## 7. 다음에 할 일 — 우선순위 로드맵

### 즉시 (통합 마무리)
| 작업 | 담당 | 비고 |
|---|---|---|
| D+10 통합 브랜치 → dev PR·리뷰·병합 | 리드 | fast-forward 가능. INT-CORE-005(Game.ts 배선·디버그 핸들) 최종 확인 |
| DECISIONS.md에 4차·8차 결의 반영 | 리드 | NEXT_SPRINT §5 각주 → 유효 결정 표 |
| INT-GAME-004·006·007 수치 이관 결정 | 리드+기획 | provisional 4파일(movement 비율·combat·cargo·심도 경계) → params. 격침 보상 어뢰 +1 배선 방식 포함 |
| HUD 33항목 러너 저장소 커밋 | 툴링 | 재현성 — 현재 세션 산출물로만 존재 |

### 단계 2 잔여 — "죽지 않고 1회 클리어" (최우선 기능 작업)
| 작업 | 담당 | 연결점 (이미 준비됨) |
|---|---|---|
| 임시 DetectionSystem (인터페이스 분리 의무) + 발사 지점 노출 | 게임플레이 | `torpedoFired` 이벤트 → `DetectionSystem.reportTorpedoLaunch` 계약 존재 |
| 구축함 (경계·공격 2상태, 무적) | 리드 | `DestroyerAI` 계약·`detectionChanged` 트리거·TargetRegistry |
| 폭뢰 (풍덩→3.0초 신관→폭발, 동시 상한) | 게임플레이 | `depthChargeEnteredWater/Exploded` 이벤트·combat.json 수치 존재 |
| 내구도·침수 (실패 = 내구도 0 단일) | 게임플레이 | `HullSystem` 계약·`hullDamaged`/`floodingChanged` 이벤트 |
| 탈출 지점·클리어·상태 머신 전환 조건 | 리드 | STATE_TRANSITIONS 정의 완료 — 전환 조건만 구현 |

### 단계 3~4 (병렬 가능 연출·본구현)
소음 파문(보호 목록, 인스턴싱)·눈 아이콘 UI·침묵 항행 / aimModeChanged 조준
카메라 고정·리드샷 보조선 렌더·어뢰 항적 / X-ray 본통합(`floodingChanged` 구독)
/ WebAudioSystem 조립·사운드 세트(D+10 산출물) 동기화 / 로우폴리 모델 교체(D+8
산출물) / 승무원 스킬 4종(1~4키). 전체 목록·담당: [`NEXT_SPRINT.md`](NEXT_SPRINT.md) §3.

---

## 8. 작업 시작 절차 (모든 역할 공통)

1. **읽기:** 이 문서 → `CLAUDE.md`(공통 규칙 13) → `prompts/<역할>.md` →
   `docs/CURRENT_STATUS.md`(다른 파트 최신 상태·통합 주의사항) →
   `docs/FILE_OWNERSHIP.md`(내 소유 영역) → `docs/INTERFACES.md`(계약표)
2. **브랜치:** 자기 역할 `feat/*` 또는 세션 지정 브랜치에서만 작업. dev·main
   직접 푸시 금지, force push 금지 ([`BRANCHING.md`](BRANCHING.md))
3. **계약 변경이 필요하면:** 코드부터 고치지 말고 `INTEGRATION_NOTES.md`에 제안
   → 리드 결정 → 반영. 남의 소유 영역이 필요하면 통합 요청 양식 사용
4. **완료 전:** `npm run typecheck`·`npm run build`·`npm run check:size` +
   `node src/systems/__verification__/run.mjs`(75/75 유지). 게이트 수치 영향
   커밋은 `[G1]`~`[G9]` 태그
5. **완료 후:** `CURRENT_STATUS.md` 자기 구역 갱신 + 이 문서의 낡은 부분이
   보이면 함께 갱신 (이 문서는 마일스톤마다 최신화한다)

## 9. 문서 인덱스

| 문서 | 내용 |
|---|---|
| [`deep_dive_master_plan.md`](deep_dive_master_plan.md) | **유일한 최상위 기준** (게이트 전 수정 금지) |
| [`CURRENT_STATUS.md`](CURRENT_STATUS.md) | 역할별 실시간 상태·통합 검증 결과 |
| [`NEXT_SPRINT.md`](NEXT_SPRINT.md) | 스프린트 결산·백로그·마스터 플랜 각주 |
| [`INTEGRATION_NOTES.md`](INTEGRATION_NOTES.md) | 계약 변경 제안·리드 결정 이력 (INT-*) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) / [`INTERFACES.md`](INTERFACES.md) | 구조·규약 / 이벤트·시스템·상태·파라미터 계약표 |
| [`DECISIONS.md`](DECISIONS.md) | 유효 결정 + ⛔구현 금지 목록 |
| [`GATES.md`](GATES.md) / [`DEVELOPMENT_WORKFLOW.md`](DEVELOPMENT_WORKFLOW.md) | G1~G9 게이트 / D1~D15 단계·Exit Criteria |
| [`FILE_OWNERSHIP.md`](FILE_OWNERSHIP.md) / [`BRANCHING.md`](BRANCHING.md) | 소유권 / 브랜치·커밋 규칙 |
| [`D10_INTEGRATION_CHECKLIST.md`](D10_INTEGRATION_CHECKLIST.md) | D+10 통합 검증 기록 (완료) |
| [`meetings/`](meetings/README.md) | 회의록 (역사 기록 — 구현 근거는 마스터 플랜+DECISIONS) |
