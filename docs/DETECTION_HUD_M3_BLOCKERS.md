# DetectionHud 처분 — 검증 상태와 M3 후속 blocker

소유: 빌드·툴. 판정 정본: `src/tools/__verification__/verifyRuntimeClosure.ts`의
`judgeDetectionHudDisposition()` · 검사 id `D1-detectionHudDisposition`.

## 1. 왜 이 문서가 있는가

`DetectionHud`가 production에 남아 있다는 사실 하나만으로는 세 가지를 구분할 수
없다. 검증기가 셋을 **서로 다른 상태**로 보고하도록 만든 근거를 여기 남긴다.

| # | 상태 | 관측 | 판정 |
|---|---|---|---|
| ① | 실제로 제거됨 | production 지점 0 + 리드 결정 `removed=true` | `pass` |
| ② | 정보 비동등으로 **M3 공식 이관** | production 존치 + 리드 결정 + SonarScope 배선 | `pass` |
| ③ | 아무 결정 없이 **방치** | production 존치 + 결정 기록 없음 | `blocked` (incomplete) |

## 2. 현재 상태 (이 커밋 기준)

```
DETECTION_HUD_INFORMATION_PARITY     = false
DETECTION_HUD_REMOVED                = false
DETECTION_HUD_REMOVAL_DEFERRED_TO_M3 = false   ← ③ 방치
```

`D1` = `blocked`. **③입니다.** production `src/core/Game.ts`에 DetectionHud가
7곳(import·생성·attach 2·update·setVisible·dispose) 살아 있고, `docs/DECISIONS.md`에
DetectionHud 처분 결정 항목이 없습니다.

②(승인된 M3 이관)로 올리려면 **리드의 정본 결정 기록이 필요합니다.** 툴링은 그
기록을 만들지 않습니다 — 리드 소유 결정이며, 없는 결정을 있는 것처럼 적으면
검증기가 검증하려던 바로 그 위장이 됩니다.

## 3. 이관을 인정하는 조건 (전부 충족해야 `pass`)

1. 리드 정본 결정 기록 존재 (`docs/DECISIONS.md`)
2. `DETECTION_HUD_REMOVED=false` 선언
3. `DETECTION_HUD_REMOVAL_DEFERRED_TO_M3=true` 선언
4. 정보 비동등 사유 명시
5. 후속 마일스톤이 **M3**로 명시
6. `W13-sonarProvider` pass — SonarScope production provider 배선
7. `W14-sonarRender` pass — SonarScope render consumer 배선
8. production DetectionHud가 **계속 존재**하는 사실과 상태 일치

### 결정 기록 기대 형식

검증기는 산문을 추정하지 않고 기계 판독 표식만 읽는다. `docs/DECISIONS.md`의
결정 행에 아래가 모두 있어야 한다:

```
DETECTION_HUD_REMOVED=false
DETECTION_HUD_REMOVAL_DEFERRED_TO_M3=true
DETECTION_HUD_INFORMATION_PARITY=false
후속 마일스톤: M3
정보 비동등 사유: <본문>
```

표식 없이 DetectionHud를 언급만 하면 "산문만으로 이관을 추정하지 않는다"는
사유와 함께 ③으로 남는다.

## 4. 모순 상태는 실패한다 (픽스처 11종으로 자체 증명)

`D0-detectionHudSelfTest`가 매 실행마다 판정 함수를 픽스처로 돌린다 — 리드 결정이
없는 동안에도 ③ 판정을 믿을 수 있는 근거다.

| 케이스 | 기대 |
|---|---|
| `removed=true` 선언 + production 존재 | **fail** (위장) |
| 이관 선언 + 정보 비동등 사유 없음 | **fail** |
| 이관 선언 + 후속 마일스톤 ≠ M3 | **fail** |
| 이관 선언 + W13 미배선 | **fail** |
| 이관 선언 + W14 미배선 | **fail** |
| 이관 선언인데 이미 제거됨 | **fail** (선언·관측 불일치) |
| 결정 없는 방치 / 이관 미선언 | **blocked** (incomplete) |
| 승인된 M3 이관 / 실제 제거 | **pass** |

플래그는 **선언이 아니라 관측에서 파생**한다. 위장 시도가 플래그를 `true`로
만들지 못한다는 것도 자체 테스트가 확인한다.

## 5. M3에서 실제로 제거할 때의 후속 blocker

이번 회차에서는 DetectionHud가 유지되므로 아래를 **수정하지 않았다**. M3에서
제거를 실행할 때 함께 처리해야 한다.

1. **`BossHealthHud` 레이아웃 앵커 교체** — `src/ui/BossHealthHud.ts:199`가
   `document.querySelector('[data-ui-detection-hud]')`로 자기 `top`을 잡는다.
   DetectionHud가 사라지면 예외 없이 `TOP_MARGIN_PX` 폴백으로 **조용히 위치가
   바뀐다.** 검증기가 잡지 못하는 무증상 회귀라 앵커를 먼저 옮겨야 한다.
2. **production DOM 부재 단언** — 출항 중·정비 화면 양쪽에서
   `[data-ui-detection-hud]` 요소 0개를 브라우저에서 단언한다.
   (`scripts/verify-hud.mjs`)
3. **`Game.ts` import·생성·attach·update·dispose 제거 단언** — 정적 스캔으로
   production 지점 0을 단언한다. `D1`의 관측이 이미 이 지점들을 세고 있으므로
   `DETECTION_HUD_REMOVED`가 자동으로 `true`로 전환된다.
4. **SonarScope 정보 동등성 검증** — 탐지 게이지 수치·stage 전이가 SonarScope
   경로로 관측 가능해야 `DETECTION_HUD_INFORMATION_PARITY=true`가 된다.
   동등성 없이 제거하면 플레이어가 읽던 정보가 사라진다.
5. **`sprintCUiFixture.ts` 정리 여부 판단** — fixture는 production 판정에서
   제외되므로 제거 판정을 막지 않는다. 별도 결정 사항.
6. **`DetectionHudView` 계약 존치 여부** — `scripts/verify-sprint-c.mjs:92`가
   계약 타입 존재를 요구한다. 위젯만 제거하고 계약을 남기면 통과하며,
   계약까지 지우려면 그 검사를 함께 개정해야 한다.

## 6. 이번 회차에서 하지 않은 것

- production 코드 무변경 (`Game.ts`·`DetectionHud.ts`·`BossHealthHud.ts`·
  `render/**`·`systems/**`·`contracts/**`·`params/**`)
- `docs/DECISIONS.md` 무변경 — 리드 소유. 파서 실증은 임시 편집 후 복원했고
  커밋하지 않았다
- 테스트 삭제·skip·todo·단언 약화 0 (단언 순증)
