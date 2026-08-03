# DEEP_DIVE_STATUS_REPORT — 저장소 실측 상태 보고서

> **이 문서의 성격 (먼저 읽을 것)**
> 이 보고서는 **저장소를 직접 계측해서 생성한 문서**다. 회의록 16·17차가 인용한
> "상태 보고서"는 저장소 밖에서 작성된 문서이며 이 저장소의 어떤 커밋에도
> 존재한 적이 없다(`git log --all --diff-filter=A` 확인). 따라서 이 파일은
> **그 원본의 복원본이 아니다.** 원본이 확보되면 대조 후 교체·병합한다.
>
> 여기에 적힌 모든 수치는 아래 §0의 명령을 그대로 실행해 재현할 수 있다.
> 재현되지 않는 값이 있으면 이 문서가 낡은 것이니 문서를 고친다.
>
> **이 문서는 기준 문서가 아니다.** 최상위 기준은
> [`docs/deep_dive_master_plan.md`](docs/deep_dive_master_plan.md) 하나뿐이다.
> 이 문서는 "지금 저장소가 실제로 어떤 상태인가"만 말한다.

---

## 0. 측정 기준

| 항목 | 값 |
|---|---|
| 측정 대상 브랜치 | `dev` |
| 측정 시점 커밋 | `971be90` (2026-08-03 18:01 UTC) |
| `dev` 총 커밋 수 | 232 (최초 `5fc8b8e`, 2026-07-31) |
| Node | `.nvmrc` 고정 (`engine-strict` 활성) |
| 미병합 브랜치 조사 시점 | `origin` fetch 2026-08-03 (§2·§4의 "미병합 진행분") |

⚠️ **§1의 검증 수치는 `dev` 기준이다.** M0~M2 작업이 여러 브랜치에서 **동시
진행 중**이라 미병합 브랜치의 상태는 이 값과 다르다. 어떤 항목이 어느 브랜치에
있는지는 §4의 "미병합 진행분" 열을 본다. 브랜치 상황은 빠르게 바뀌므로 판단
전에 `git fetch origin --prune`으로 다시 확인할 것.

재현 명령:

```bash
git checkout dev && npm ci
npm run typecheck && npm run build && npm run check:size && npm run check:scope
npm run verify:gameplay && npm run verify:meta && npm run verify:tooling
npm run verify:hud && npm run verify:sprint-a && npm run verify:sprint-b && npm run verify:sprint-c
```

---

## 1. 검증 결과 (전부 실행함)

| 검사 | 결과 | 비고 |
|---|---|---|
| `typecheck` | ✅ 통과 | exit 0 |
| `build` | ✅ 통과 | 청크 500KB 초과 경고 1건 (빌드 실패 아님) |
| `check:size` | ✅ 통과 | **상한 대비 6.7% 사용** |
| `check:scope` | ✅ 통과 | 장비 정의 4/4. `params/boss.json`·`params/sectors.json`은 **파일 없음**(0/1, 상한 이내이므로 통과) |
| `verify:gameplay` | ✅ **242/242** | 게임플레이 production 42파일에 AI 코어 신규 추가 0건 확인 포함 |
| `verify:meta` | ✅ **128/128** | 생존 코어 밸런스 상수 발명 0건 확인 포함 |
| `verify:tooling` | ✅ **26/26** | 스코프 가드 `--strict` 동작 확인 포함 |
| `verify:hud` | ✅ **34 통과 / 0 실패** | 실브라우저, 페이지 오류 없음 |
| `verify:sprint-a` | ✅ 자동 전 항목 통과 | **수동 판정 5건 잔여** |
| `verify:sprint-b` | ✅ 자동 **22/22** | **보류 1 · 차단 1 · 대기 4** |
| `verify:sprint-c` | ✅ 툴링 소유 영역 전 항목 통과 | 보류·대기 항목은 C 통합 미완료분 |

**해석 주의:** 자동 검증 통과는 "구현이 끝났다"가 아니라 "규칙 위반이 없다"이다.
수동·보류·대기 항목은 위 표대로 남아 있고, `dev` 통합 빌드에서 판정해야 한다.

---

## 2. 브랜치 현황

원격 12개. `docs/meetings/` 아카이브는 **12개 전부 동일**(트리 `5142463f`, 회의록 17건).

| 브랜치 | dev 대비 | 상태 |
|---|---|---|
| `dev` | — | 통합 기준선. PR #1~#7 전부 병합 완료 |
| `feat/gameplay-m2-interaction` | **+3커밋** | ⚠️ 미병합 — `InteractionSystem` 신규 (§4) |
| `feat/render` | **+2커밋** | ⚠️ 미병합 — 소나 스코프·보스 피격/페이즈 상태·GPU 계측 문서. PR #7분은 병합 완료 |
| `claude/deep-dive-tooling-phase-0-cj6c49` | **+2커밋** | ⚠️ 미병합 — 폭뢰 lifecycle 이벤트 발행·사운드 배선·M0 계측 산출물 이관 |
| `claude/deep-dive-d5-gray-box-integration-tree5i` | +1 (dev −11) | 병합됨 (PR #6), 이후 문서만 |
| `claude/sprint-c-runtime-closeout` | +0 (dev −13) | 병합됨 (PR #5) |
| `claude/deep-dive-bootstrap-6wrpuw` | +1 (dev −164) | 병합됨 (PR #2), 이후 문서만 |
| `claude/deep-dive-core-lead-uyg77p` | +0 (dev −44) | 정리됨 |
| `claude/submarine-controls-depth-3wi424` | +0 (dev −42) | 정리됨 |
| `feat/core` · `feat/gameplay` · `feat/tooling` | +0 (dev −227) | **2026-07-31 이후 방치.** 초기 역할 브랜치 |

*(위 "+N커밋"은 회의록 동기화 커밋 1건을 제외한 실작업 커밋 수다.)*

`main` 브랜치는 원격에 **존재하지 않는다.** 현재 통합 종점은 `dev`다.

### PR

7건 전부 **merged**. **열린 PR 0건.**

| PR | 제목 | head → base | 병합 |
|---|---|---|---|
| #7 | expand underwater art direction and environment visuals | `feat/render` → `dev` | 2026-08-03 |
| #6 | Sprint C production evidence screenshots | 통합 브랜치 → `dev` | 2026-08-03 |
| #5 | Sprint C detection, survival and depth-charge runtime | `claude/sprint-c-runtime-closeout` → `dev` | 2026-08-03 |
| #4 | Sprint A/B core integration | 통합 브랜치 → `dev` | 2026-08-01 |
| #3 | PvE D+9 성장 루프 통합 | 통합 브랜치 → `dev` | 2026-08-01 |
| #2 | D+10 잠수함 기본 전투 프로토타입 통합 | `claude/deep-dive-bootstrap-6wrpuw` → `dev` | 2026-08-01 |
| #1 | D+5 회색 박스 빌드 통합 | 통합 브랜치 → `dev` | 2026-07-31 |

> **17차 회의 안건 1(M0) 대비:** "PR #7 병합"은 **이미 완료**(2026-08-03).
> 남은 M0 항목인 `docs/measurements/M0_gpu_baseline.md`는 **`dev`에 아직 없고**,
> `feat/render`와 `claude/deep-dive-tooling-phase-0-cj6c49` **두 브랜치에 각각**
> 만들어져 있다(§5-4). 따라서 M0는 **병합 기준으로는 미완료**다.

---

## 3. 코드 규모 (dev, 검증 파일 제외)

TypeScript production 파일 **148개**.

| 영역 | 파일 수 | 소유 |
|---|---|---|
| `src/systems` | 42 | 게임플레이 |
| `src/render` | 31 | 그래픽스 |
| `src/core` | 17 | 리드 (공통 보호) |
| `src/tools` | 15 | 빌드·툴 |
| `src/ui` | 13 | 툴링/UI |
| `src/contracts` | 11 | 공통 보호 |
| `src/meta` | 11 | 메타 루프 |
| `src/world` | 3 | 공용 데이터 |
| `src/audio` · `src/config` | 2 · 2 | — |

`params/` 10파일: `aiming` `cargo` `combat` `crew` `detection` `economy`
`equipment` `movement` `ui` `upgrades`.
`docs/screenshots/` 123장 (검증 증적).

---

## 4. 회의 결의 대비 구현 상태 (M0·M1 항목)

16·17차가 지시한 항목을 `dev` 코드에서 직접 확인한 결과다.

| 항목 | 근거 결의 | `dev` 실측 상태 | 미병합 진행분 |
|---|---|---|---|
| `InteractionSystem` (E 2초 홀드 회수) | 16차 2-4 / 17차 결의 3 창 2 **선행** | ❌ 없음 | 🟡 `feat/gameplay-m2-interaction` — `src/systems/interaction/InteractionSystem.ts` 314줄 + 검증 265줄 |
| 소나 스코프 (`SonarScopeReadModel`) | 16차 2-5 / 17차 결의 4 | ❌ 없음 | 🟡 `feat/render` — `src/render/SonarScope.ts` 신설, 좌상단 배치 정합 커밋(`6c13a9b`)까지 진행 |
| 보스 AI (3단계 × 4패턴) | 11차 결의 5 / 16차 1-3 / 17차 결의 3 창 1 | ❌ AI 없음. 렌더 스파이크(`src/render/boss/` 4파일)와 `src/systems/BossWeakPointTarget.ts`뿐 | 🟡 `feat/render` — 보스 피격·페이즈 **상태**(`845897a`). 패턴 4종 AI는 아직 확인되지 않음 |
| 침묵 항행 | 16차 / 17차 결의 3 창 2 (완주 판정 직후) | 🟡 **판정 경로만, 토글 없음.** `SilentRunningSource`와 `silentRunningNoiseMultiplier`는 있고 `SubmarineDetectionSystem`이 소비하지만 **소스 주입 토글이 없어 항상 false** (코드 주석에도 명시) | — |
| 폭뢰 lifecycle 이벤트 발행자 | 17차 결의 4 | ❌ `src/contracts/events.ts` 83·86행 **선언만**, production 발행자 **0건** | ✅ `claude/deep-dive-tooling-phase-0-cj6c49` — `DepthChargeRunSystem`에서 발행 + 사운드 배선(`3fd22db`) |
| `params.depthChargeOnPassiveScope` | 17차 결의 4 (초기값 false) | ❌ 파라미터 없음 | 미확인 |
| 어뢰 추적 캠 | 16차 2-1 / 17차 결의 2 | ❌ 미구현 (M3 앞머리 — 17차에서 오늘 범위 밖으로 명시) | — |
| 화면 전투 버튼 제거 + Alt 프리룩 | 16차 2-2 (8차 결의 1 폐지) | ❌ 미이행. `.hud-buttons`가 `src/ui/ControlsHud.ts:99`에 남아 있음 (M3 앞머리) | — |
| 보스 분절 애니 스파이크 | 11차 / 17차 결의 3 창 3 | ✅ **A안·B안 둘 다 존재**, 판정 문서 `docs/RENDER_SPIKE_BOSS.md` | — |
| M0 GPU 계측 문서 | 17차 결의 1 | ❌ `docs/measurements/` 없음 | 🟡 두 브랜치에 각각 존재 — `feat/render`(`M0_gpu_baseline.md`) / 툴링 브랜치(`M0_gpu_baseline.md` + `m0-measurement.json`, 미실시 항목 명시). **두 산출물의 정합은 병합 시 확인 필요** |

**읽는 법:** `dev` 열이 이 프로젝트의 "합의된 현재"다. "미병합 진행분"은
아직 통합 판정을 받지 않았으므로 **완료로 세지 않는다** (17차 결의 3 창 5 —
완주 판정은 dev 통합 빌드에서 수행).

---

## 5. 미결·차단 목록

1. **`params/economy.json`에 `null` 10건** — 공식 기획 수치 미확정. 임의로 채우면 안 된다.
   ```
   salvageSpawns[0].rarePartId          salvageSpawns[1].rarePartId
   highValueTransport.rewardMultiplier  highValueTransport.rewardMultiplierRange
   highValueTransport.escortMaximumDistanceMeters
   guardSpawn.minDistanceFromPlayerMeters   guardSpawn.maxDistanceFromIncidentMeters
   guardSpawn.candidateCount                guardSpawn.worldBoundsPaddingMeters
   guardSpawn.spawnRetryCount
   ```
   (다른 9개 `params/*.json`은 `null` 0건.)
2. **`params/boss.json`·`params/sectors.json` 미존재** — 스코프 가드는 통과하지만
   보스·해역 정의가 아직 데이터로 없다. M1 착수 전제.
3. **M1 작업이 세 브랜치에 흩어져 있고 전부 `dev` 미병합** — 17차 결의 3 창 5의
   병합 순서(`InteractionSystem` → 보스 코어 → 병렬 2건 → 완주 판정)를 적용하려면
   **`feat/gameplay-m2-interaction`(선행)이 먼저** 들어가야 한다.
   현재 미병합: `feat/gameplay-m2-interaction`(InteractionSystem) ·
   `feat/render`(소나 스코프·보스 상태·GPU 계측) ·
   `claude/deep-dive-tooling-phase-0-cj6c49`(폭뢰 이벤트 발행·사운드·GPU 계측).
4. **`docs/measurements/M0_gpu_baseline.md`가 두 브랜치에 각각 존재** — 서로 다른
   세션이 같은 경로에 산출물을 만들었다. **병합 시 충돌·수치 불일치 확인 필요.**
   `dev`에는 아직 없으므로 17차 결의 1의 기본 품질(low/medium) 자동 결정은
   **아직 확정되지 않았다.**
5. **수동 판정 잔여** — sprint-a 수동 5건, sprint-b 보류 1·차단 1·대기 4.
   자동 검증으로는 닫을 수 없고 `dev` 통합 빌드에서 사람이 판정해야 한다.
6. **침묵 항행 토글 부재** — 판정 경로는 있으나 소스 주입이 없어 항상 false다.
   17차 결의 3 기준 완주 판정 직후 연결 예정이며 아직 착수 흔적이 없다.

---

## 6. 이 문서를 갱신하는 방법

§0의 명령을 실행하고 §1·§3·§5의 수치를 바꾼다. **수치를 손으로 추정해서 쓰지
않는다.** 실행하지 않았으면 "미측정"이라고 적는다.

관련 문서: [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) (서술형 지도) ·
[`docs/CURRENT_STATUS.md`](docs/CURRENT_STATUS.md) (역할별 진행) ·
[`docs/INTEGRATION_NOTES.md`](docs/INTEGRATION_NOTES.md) (계약 결정 이력) ·
[`docs/meetings/README.md`](docs/meetings/README.md) (회의 결의 17건).
