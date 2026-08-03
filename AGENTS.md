# AGENTS.md — 이 저장소에서 일하는 모든 에이전트의 진입점

이 파일은 `AGENTS.md` 규약을 읽는 도구(에이전트·CLI)를 위한 **진입점**이다.

> **규칙 본문의 단일 소스는 [`CLAUDE.md`](CLAUDE.md)다.**
> 이 파일은 그 규칙을 요약·안내만 한다. 두 파일이 충돌하면 `CLAUDE.md`를 따르고,
> 규칙을 고칠 때는 `CLAUDE.md`를 고친 뒤 이 파일의 요약을 맞춘다.
> 이 저장소는 "기준 문서는 하나"가 원칙이므로, 여기에 `CLAUDE.md`에 없는 규칙을
> 새로 쓰지 않는다.

---

## 0. 먼저 읽을 것 (순서 고정)

| 순서 | 문서 | 무엇을 얻는가 |
|---|---|---|
| 1 | [`docs/deep_dive_master_plan.md`](docs/deep_dive_master_plan.md) | **유일한 최상위 기준.** 무엇을 만들고 무엇을 안 만드는가 |
| 2 | [`CLAUDE.md`](CLAUDE.md) | 전 역할 공통 규칙 13조 (이 파일의 원본) |
| 3 | [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) | 지금까지 만든 것·다음 것의 서술형 지도 |
| 4 | [`DEEP_DIVE_STATUS_REPORT.md`](DEEP_DIVE_STATUS_REPORT.md) | **계측된** 현재 상태 (브랜치·검증·미결) |
| 5 | `prompts/<자기 역할>.md` | 역할별 추가 규칙 |
| 6 | [`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md) · [`docs/FILE_OWNERSHIP.md`](docs/FILE_OWNERSHIP.md) · [`docs/INTERFACES.md`](docs/INTERFACES.md) | 작업 전 필수 3종 (CLAUDE.md 9조) |

[`docs/meetings/`](docs/meetings/README.md)는 **역사 기록이지 구현 기준이 아니다.**
회의록과 마스터 플랜이 충돌하면 마스터 플랜을 따른다. 폐기된 결의는 구현 근거로
쓸 수 없다 (`docs/DECISIONS.md`의 '구현 금지' 구역).

---

## 1. 하지 말아야 할 것

- **마스터 플랜에 없는 기능을 추가하지 않는다.** 없는 기능은 존재하지 않는
  기능이다. 아이디어는 백로그로만 (R13).
- **제외 범위 기능의 스텁을 만들지 않는다.** 파일·클래스·인터페이스·빈 구조·
  "나중을 위한 자리" 전부 금지 (마스터 플랜 §6.4). 유일한 예외: 인스턴싱 렌더 경로.
- **파라미터를 코드에 하드코딩하지 않는다.** 밸런스 값은 `params/*.json`에만 두고
  JSON → 시스템 **단방향** 주입만 한다. 코드에서 JSON 역기록 금지.
- **자기 소유 영역 밖 파일을 고치지 않는다** (`docs/FILE_OWNERSHIP.md`).
  공통 보호 파일은 리드 승인 없이 변경 금지.
- **`src/contracts/*` 를 임의로 바꾸지 않는다.** `docs/INTEGRATION_NOTES.md`에
  먼저 제안하고 개발 리드 결정 후에만 반영한다.
- **`dev`·`main`을 깨진 상태로 만들지 않는다.** 절반짜리 작업은 `feat/*`에 남긴다.
  `main` 직접 푸시 금지 (`docs/BRANCHING.md`).
- **근거 없는 수치 변경 금지.** 관찰 결과 + 사전 정의된 판단 기준
  (`docs/templates/TUNING_LOG.md`, 마스터 플랜 §11)이 있어야 한다.
- **검증 실패를 우회·은폐하지 않는다.** 고치고 다시 돌린다.
- **확인하지 않은 파일을 덮어쓰지 않는다.**

## 2. 기술 스택 (고정 — 확장 금지)

Three.js · Vite · TypeScript(strict) · 자체 단순 물리 · Web Audio API ·
JSON 파라미터 · 정적 호스팅 · 단일 GitHub 저장소.

물리 엔진·게임 엔진(Unity 등)·다른 3D 라이브러리·프론트 프레임워크·백엔드·DB는
**도입하지 않는다.** 새 런타임 의존성 추가는 리드 승인 사항이다.
Node는 `.nvmrc`로 고정되어 있고 `engine-strict`가 켜져 있다.

## 3. 작업 절차

```bash
npm run dev          # 개발 서버
npm run typecheck    # 완료 전 필수
npm run build        # 완료 전 필수
npm run check:size   # 빌드 후 권장 (용량 게이트)
npm run check:scope  # 스코프 가드
npm run status       # 프로젝트 상태 출력
```

검증 러너 (해당 영역을 건드렸으면 돌린다):

```bash
npm run verify:gameplay   # src/systems
npm run verify:meta       # src/meta
npm run verify:tooling    # src/tools
npm run verify:hud        # 실브라우저 HUD
npm run verify:sprint-a   # 스프린트 A 인수
npm run verify:sprint-b   # 스프린트 B 인수
npm run verify:sprint-c   # 스프린트 C 인수
```

작업 후에는 `docs/CURRENT_STATUS.md`의 **자기 역할 구역**을 갱신한다.
커밋 메시지에는 해당 게이트·영역 태그를 단다 — `[G1]`~`[G9]`, `[LOOP]`,
`[BOSS]`, `[ECON]`, `[COMBAT]`, `[ART]`, `[RENDER]`.

## 4. 브랜치

`docs/BRANCHING.md`가 기준이다. 요약:

- 역할별 작업은 `feat/*` 또는 배정된 작업 브랜치에서 한다.
- 통합은 `dev`로 PR을 통해 들어간다. `main` 직접 푸시 금지.
- **남의 브랜치를 임의로 재작성하지 않는다.** force push·rebase로 남의 이력을
  덮지 않는다.
- 저장소 상태가 예상과 다르면 **작업을 멈추고 상태를 보고한다.**

## 5. 아키텍처 요지

- **`src/core/Game.ts`의 `composeSystems()`가 유일한 조립점이다.** 파트 간 배선은
  여기서만 한다. 시스템 실행 순서 = 등록 순서.
- **파트 간 통신은 `EventBus`와 읽기 전용 상태 소스뿐이다.** 렌더는 판정
  (탐지·피해·타이밍·명중·이동)을 계산하지 않는다.
- **축·방향 규약은 `src/core/conventions.ts`에만 있다.** 숫자·벡터를 복제하지
  않고 반드시 그 함수를 쓴다 (local −Z = 선수, +Z = 선미, world +Y = 위).
- 계약: `src/contracts/{events,systems,params,layout,meta,survival,detection,guard}.ts`
- 협곡 배치는 `src/world/startingCanyonLayout.ts`가 렌더·충돌 **단일 소스**다.

자세한 지도는 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)와
[`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) §3.
