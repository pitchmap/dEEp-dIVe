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

## 2. 현재 상태 (PR #19 병합 후)

```
DETECTION_HUD_INFORMATION_PARITY     = false
DETECTION_HUD_REMOVED                = false
DETECTION_HUD_REMOVAL_DEFERRED_TO_M3 = true    ← ② 승인된 M3 이관
```

`D1` = **`pass`**. **②입니다.** 리드 정본 결정 **M-14**(INT-CORE-023)가 dev에
병합돼(merge `74075c0`) 이관이 공식 승인됐고, 검증기는 그 사실을 관측에서
파생해 읽습니다.

- production `src/core/Game.ts`에 DetectionHud **7곳 존치** — 제거되지 않았고
  제거 완료로 표기하지 않습니다
- `W13-sonarProvider` pass · `W14-sonarRender` pass — 대체 계기가 실제로
  production에 연결돼 있습니다
- 정보 비동등 사유 2건(연속 탐지 게이지 · 함선별 추적 상태)이 결정문에 명시

이 이관은 **M3 착수 승인이 아닙니다** — `M3_START_ALLOWED=false` 유지.

## 3. 이관을 인정하는 조건 (전부 충족해야 `pass`)

1. 리드 정본 결정 기록 존재 (`docs/DECISIONS.md`)
2. `DETECTION_HUD_REMOVED=false` 선언
3. `DETECTION_HUD_REMOVAL_DEFERRED_TO_M3=true` 선언
4. 정보 비동등 사유 명시
5. 후속 마일스톤이 **M3**로 명시
6. `W13-sonarProvider` pass — SonarScope production provider 배선
7. `W14-sonarRender` pass — SonarScope render consumer 배선
8. production DetectionHud가 **계속 존재**하는 사실과 상태 일치

### 결정 기록 파싱 정책

**세 플래그 표식이 명시적으로 선언돼야만 이관 후보가 된다** — 이것이 산문
추론을 막는 관문이다. `docs/DECISIONS.md`의 결정 행에 아래가 모두 있어야 한다:

```
DETECTION_HUD_REMOVED=false
DETECTION_HUD_REMOVAL_DEFERRED_TO_M3=true
DETECTION_HUD_INFORMATION_PARITY=false
```

관문을 통과한 뒤, 이미 선언된 이관의 부속 정보를 읽는다:

- **후속 마일스톤** — `_DEFERRED_TO_M3=true` **키 자체**에서 판정한다(대상
  마일스톤을 이름에 담고 있다). 산문에서 찾지 않는다 — 결정 본문에는
  "M1·M2에서 제거하지 않고"처럼 이관 대상이 아닌 마일스톤이 함께 등장해
  오인된다. 키가 M3가 아니면(`_TO_M4`) 판정이 그대로 거부한다.
- **정보 비동등 사유** — 전용 표식(`정보 비동등 사유:`)이 있으면 그것을,
  없으면 결정문의 **대체 불가·비동등·표현 불가·정보 유실** 서술에서 확인한다.
  해당 어휘가 없으면 null로 남아 판정이 fail이 된다.

표식 없이 DetectionHud를 언급만 하면 "산문만으로 이관을 추정하지 않는다"는
사유와 함께 ③으로 남는다. **일반 산문만으로 이관 자체를 추측하지 않는다.**

## 4. 모순 상태는 실패한다 (픽스처 11종으로 자체 증명)

`D0-detectionHudSelfTest`가 매 실행마다 판정 함수를 픽스처로 돌린다 — 결정이
도착해 `pass`가 된 지금도, 그 `pass`가 '무엇이든 통과시키는 pass'가 아니라는
근거가 된다.

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
   `document.querySelector('[data-ui-detection-hud]')`로 **실제 하단 + 12px**에
   자기 `top`을 잡는다. DetectionHud가 사라지면 예외 없이 상단 12px 폴백으로
   **조용히 위치가 바뀐다.** 검증기가 잡지 못하는 무증상 회귀라 대체 앵커를
   먼저 결정하고 **production 레이아웃 회귀를 실측 검증**해야 한다.
   리드 M-14와 인계표 §7-2-1이 같은 조건을 정본으로 기록했다.
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
- 리드 소유 결정 문서 무변경 — M-14·INT-CORE-023·인계표는 **그대로 수신**했고
  툴링이 내용을 고치지 않았다
- DetectionHud 제거 0 · 제거 완료 위장 0
- farming 및 다른 manual blocker 임의 통과 0
- 테스트 삭제·skip·todo·단언 약화 0
