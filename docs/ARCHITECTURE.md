# ARCHITECTURE — 시스템 아키텍처

> 기준: `docs/deep_dive_master_plan.md` §7. 이 문서는 코드 관점 요약이다.

## 구성 요소

### 게임 루프 (`src/core/GameLoop.ts`)
`requestAnimationFrame` 기반. delta time(초)을 계산해 `update(dt)` →
`render()`를 분리 호출한다. 탭 복귀 등 프레임 튐은 0.1초로 클램프.
게임 규칙·렌더 내용은 모른다.

### 상태 머신 (`src/core/GameState.ts`, `GameStateMachine.ts`)
`BOOT → DEPARTURE → APPROACH → ATTACK → ESCAPE → RESULT (→ DEPARTURE)`.
허용 전환표(`STATE_TRANSITIONS`) 밖의 전환은 예외를 던진다. 전환 성공 시
`gameStateChanged` 이벤트 발행. 전환 **조건** 판정(게임 규칙)은 D6 이후
시스템들이 담당한다.

### EventBus (`src/core/EventBus.ts` + `src/contracts/events.ts`)
게임플레이·렌더·사운드·UI 간 유일한 통신 경로. 이벤트 이름·페이로드는
`GameEvents` 계약으로 타입 강제된다. 모듈 간 직접 import 참조 금지
(계약·core 제외).

### 시스템 계약 (`src/contracts/systems.ts`)
9개 인터페이스: PlayerController / DepthSystem / DetectionSystem /
TorpedoSystem / DepthChargeSystem / DestroyerAI / HullSystem / AudioSystem /
UISystem. **구현체는 아직 없다** — D3 이후 각 파트 소유 영역에서 구현한다.
목록·소유자·입출력은 `docs/INTERFACES.md` 표 참조.

### 시스템 수명주기·등록 (`src/core/GameSystem.ts`, `SystemRegistry.ts`)
각 파트 구현체는 `GameSystem`(id / `initialize` / `update` / `render?` /
`dispose`)을 구현해 `SystemRegistry`에 등록된다. 호출 규약은 core가 보장한다:

- `initialize(context)` — 루프 시작 전 등록 순서대로 1회. `SystemContext`로
  `bus`(EventBus)·`params`(검증 완료 파라미터)·`stateMachine`을 공급받는다.
  그 외 의존성(렌더러 등)은 등록 지점에서 생성자 주입.
- `update(deltaSeconds)` — 매 프레임 등록 순서대로. 시뮬레이션만, 그리기 금지.
- `render()` — 매 프레임, SceneManager의 3D 장면 렌더 **후** 등록 순서대로.
  화면 표현이 있는 시스템(UI 등)만 선택 구현.
- `dispose()` — 루프 정지 시 등록 **역순** 1회. 구독 해제·자원 정리.

등록 중복 id·초기화 이후 등록·initializeAll 재호출은 예외로 거부한다.
시스템 내부 예외는 삼키지 않고 전파한다 (상태 머신과 동일 원칙).

## 시스템 실행 순서

**실행 순서 = 등록 순서**다. 우선순위 숫자·의존성 그래프는 도입하지 않는다.
유일한 등록 지점은 `Game.composeSystems()`이며, 그룹 순서는 다음을 지킨다:

1. **입력·조작** — PlayerController, DepthSystem, 카메라 (게임플레이, D3~D5)
2. **판정** — 탐지·어뢰·폭뢰·내구도 (게임플레이, D6 이후)
3. **AI** — DestroyerAI (리드, D6 이후)
4. **표현 연동** — 렌더 이펙트·UI·오디오 배관 (이벤트 구독 측)

프레임 전체 순서 (core/Game):
```
update:  registry.update(dt) → sceneManager.update(dt) → 성능 샘플링
render:  sceneManager.render()  [3D 장면] → registry.render()  [UI 계층]
```

`src/core`는 공통 보호 파일이므로 등록 배선 추가는 feat→dev 병합 시
리드가 수행한다. 각 파트는 자기 소유 영역에서 `GameSystem` 구현체를
export하고, CURRENT_STATUS의 자기 구역에 "등록 요청" 형태로 알리면 된다.

## 게임 상태 전환과 장면 전환의 분리

- **게임 상태(국면)** — `GameStateMachine`이 소유. 전환은 허용표 검증 후
  `gameStateChanged` 이벤트 발행. 시스템은 `SystemContext.stateMachine`으로
  전환을 요청한다.
- **장면(Three.js 월드)** — `SceneManager`가 소유. 전환은 조립 수준에서
  `setActive()` 명시 호출로만 일어난다.

상태 전환이 장면 전환을 **자동으로 유발하지 않는다.** 버티컬 슬라이스는
협곡 단일 해역이므로 국면(BOOT→…→RESULT)이 바뀌어도 장면은 하나다 —
BGM·포그·UI 변화는 각 시스템이 `gameStateChanged`를 구독해 처리한다.
상태→장면 자동 매핑 계층은 필요 근거가 생기기 전까지 만들지 않는다.

## 핵심 설계 결정

### DetectionSystem이 시스템 허브다
소음·심도·엄폐·발사 노출을 입력받아 **단일 탐지 게이지**를 산출하고,
구축함 AI 상태 전이와 눈 아이콘 UI를 구동한다. D6~D9에는 임시 구현을
쓰되 인터페이스는 유지하며, D10~D12 본 구현 교체 시 내부만 바뀐다 [확정].

### 소음 값의 삼중 출력
소음 값 하나(`noiseChanged.level`)가 동시에 세 곳으로 분배된다:
① 탐지 게이지 입력 ② 파문 이펙트 크기(렌더) ③ 엔진음 크기(오디오).
시청각 일치 원칙의 구현점이며, 파문 이펙트는 보호 목록이다.

### 폭뢰 판정과 오디오 배관의 책임 분리
'풍덩→3초→폭발'의 **타이밍 주인은 판정 로직(DepthChargeSystem, 게임플레이
소유)**이다. 오디오(툴링 소유 배관)는 `depthChargeEnteredWater`/
`depthChargeExploded` 이벤트에 동기화만 하고, 지연 100ms+ 시 보상 오프셋을
적용한다. 보호 목록 '폭뢰 사운드 동기화'의 책임 경계.

### 파라미터는 단방향
`params/*.json` → `config/ParamLoader`(런타임 범위 검증) → 시스템 주입.
역방향(코드→JSON 기록) 금지. 기획이 params를 직접 커밋한다.
범위를 벗어난 값은 로드 시점에 `ParamValidationError`로 거부된다.

## 구조도

```mermaid
graph TD
    subgraph core [src/core — 리드 소유]
        LOOP[GameLoop<br/>rAF·delta] --> STATE[GameStateMachine<br/>BOOT→…→RESULT]
        LOOP --> SCENE[SceneManager]
        BUS[EventBus<br/>contracts/events.ts]
    end
    subgraph systems [src/systems — 게임플레이 소유, D3 이후]
        PC[PlayerController<br/>WASD·관성] --> NOISE[소음 산출]
        DEPTH[DepthSystem<br/>3층] --> DET
        NOISE --> DET[DetectionSystem ★허브<br/>소음×거리×심도·엄폐·발사 노출]
        TORP[TorpedoSystem<br/>수동 조준·보조선] -->|발사 지점| DET
        DET --> AI[DestroyerAI<br/>순찰-경계-공격-상실]
        AI --> DC[DepthChargeSystem<br/>3초 신관·밀려남]
        DC --> HULL[HullSystem<br/>내구도·침수]
    end
    subgraph render [src/render — 그래픽스 소유]
        RS[협곡·물·포그·파문·블롭 섀도]
        XRAY[X-ray 침수 렌더]
    end
    subgraph audio [src/audio — 툴링 소유 배관]
        AS[Web Audio<br/>카메라 패너·동기화]
    end
    subgraph ui [src/ui]
        UIS[3계층 UI·눈 아이콘]
        PERF[PerformanceOverlay]
    end
    subgraph infra [params + tools]
        PARAM[params/*.json<br/>ParamLoader+검증]
        GATE[GateMetricRecorder<br/>LoadingTimer]
    end
    NOISE -->|파문 크기| RS
    NOISE -->|엔진음 크기| AS
    DC -->|입수·폭발 이벤트| AS
    HULL -->|침수 구획| XRAY
    DET -->|눈 아이콘 단계| UIS
    STATE -->|국면별 BGM| AS
    PARAM -.->|수치 단방향 주입| systems
    LOOP -->|performanceSampled| PERF
    PERF --> GATE
```

## 현재 실제 배선 (D3 기준)

`main.ts` → `Game`: 파라미터 로드·검증 → `Renderer`+`BootstrapScene` 생성 →
오버레이·계측 연결 → `composeSystems()`(시스템 등록 지점 — 현재 등록 0건) →
`registry.initializeAll(context)` → 루프 시작 → 첫 렌더 시 `LoadingTimer`
기록 + `BOOT→DEPARTURE` 전환(상태 머신 검증 겸용).

각 파트 구현체(D3~D5: 조작·심도·카메라·회색 박스 블록아웃)가 feat 브랜치에서
도착하는 대로 composeSystems에 순서대로 배선된다. 3D 장면(블록아웃)은
시스템이 아니라 `ManagedScene`으로 SceneManager에 올린다.
