# FILE_OWNERSHIP — 파일 소유권

> 원칙: 자기 역할의 소유 영역 밖 파일은 수정하지 않는다. 필요하면 소유 파트에
> 요청(`docs/templates/INTEGRATION_REQUEST.md` 양식)하거나 INTEGRATION_NOTES
> 절차를 거친다. 위반 여부는 통합 리뷰(prompts/INTEGRATION_REVIEW.md)에서 확인한다.

## 역할별 소유 영역

| 역할 | 소유 영역 | 비고 |
|---|---|---|
| **개발 리드** (prompts/LEAD.md) | `src/core/`, `src/meta/`(단, `save/` 제외 — PvE 소회의 결의 7), 공통 계약(`src/contracts/`) 최종 승인, 구축함·보스 AI, dev 통합 | 비상 컷 단독 권한 (R-P3 포함) |
| **게임플레이** (prompts/GAMEPLAY.md) | `src/systems/` (`economy/` 포함 — 드롭·손실·Faction 판정) | 판정·탐지·전투 로직의 주인 |
| **그래픽스** (prompts/GRAPHICS.md) | `src/render/`, 렌더 관련 `assets/`(models·textures) | 게임 판정 계산 금지 |
| **빌드·툴** (prompts/TOOLING.md) | `src/tools/`, `scripts/`, `.github/`, `src/audio/`(오디오 배관), `src/ui/`(계측 오버레이), `src/meta/save/`(세이브 시스템 — 버전·이중 슬롯) | 판정 시간 소유권 없음. 세이브 스키마 변경 커밋은 마이그레이션 함수 동반 필수 |
| **기획** | `params/` (`upgrades.json`·`economy.json` 포함 — PvE 확장) | 수치 직접 커밋 가능 — `[Gx]`/`[ECON]` 태그 + 튜닝표 기록 필수 |
| **공통 파일** | 아래 목록 | **리드 승인 없이 변경 금지** |

## 공통 보호 파일 (리드 승인 필수)

```
src/main.ts
src/core/*          (Game, GameLoop, GameState, GameStateMachine, SceneManager, EventBus)
src/contracts/*     (events.ts, systems.ts, params.ts)
package.json
vite.config.ts
tsconfig.json
CLAUDE.md
```

변경 절차: `docs/INTEGRATION_NOTES.md`에 제안 → 리드 결정 → 반영 → 관련 문서
(INTERFACES.md 등) 동시 갱신.

## 회색 지대 판정 기준

- `src/config/` (ParamLoader·validateParams): 계약(`contracts/params.ts`)과 한 몸 —
  **공통 보호에 준함**. 검증 규칙 변경은 리드 승인.
- `src/world/` (공용 데이터 — startingCanyonLayout·torpedoTubeAnchor 등): 렌더·게임플레이가
  같은 인스턴스를 소비하는 데이터 모듈 영역 — **공통 보호에 준함**. 내용 교체
  (정식 블록아웃 반영 등)는 리드 승인 커밋 경유, 로직·시스템 코드 추가 금지
  (INT-CORE-004).
- `src/ui/`: 계측 오버레이(현재)는 툴링 소유. 게임 UI(눈 아이콘·붉은 호 등,
  D6 이후)는 게임플레이 소유로 분리한다.
- `docs/`: 각 역할이 자기 관련 구역 갱신 가능. 단 `deep_dive_master_plan.md`는
  게이트 리뷰 전까지 수정 금지(역사 기록 훼손 방지), `DECISIONS.md`는 리드만.
- `index.html`, `src/styles.css`: 구조 변경은 리드 승인, 스타일 추가는 해당 UI
  소유 파트 자율.

## 병렬 Claude Code 창 운영 규칙

1. 한 창 = 한 역할 = 한 `feat/*` 브랜치. 역할 프롬프트(`prompts/`)를 세션
   시작 시 로드한다.
2. 서로 다른 역할이 같은 파일을 고치게 되는 순간이 통합 충돌 신호다 —
   먼저 INTEGRATION_NOTES에 기록하고 리드 판단을 받는다.
3. 작업 전 `docs/CURRENT_STATUS.md`에서 다른 역할의 '변경된 계약'·'통합
   주의사항'을 확인한다.
