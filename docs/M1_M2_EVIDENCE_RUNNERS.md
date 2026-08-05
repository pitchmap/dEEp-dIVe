# M1·M2 Closure production evidence 러너

소유: 빌드·툴. 코드: `scripts/evidence-*.mjs` · `scripts/lib/evidence-harness.mjs` ·
스키마 `src/tools/evidenceSchema.ts` (자체 테스트는 `verify:tooling`).

```bash
npm run evidence:ec12   # EC12 locked-debrief 회귀
npm run evidence:boss   # EC9·EC10·EC13·EC17 + 중어뢰 경제 경로
```

결과 JSON은 `scratchpad/m1-m2-final-evidence/`에 쓴다(저장소에 넣지 않는다).
두 러너 모두 **관측 전용**이라 판정 실패로 CI를 무너뜨리지 않는다.

## 판정 어휘

`pass` / `fail` / `blocked` / `harness` / `notRun` / `manual`.
**충족을 주장하는 상태는 `pass` 하나뿐이다** — `isSatisfied()`가 강제하고
`verify:tooling`이 그 규칙을 자체 테스트한다. 실행하지 않은 항목은 `notRun`으로
남으며 빈 PASS가 되지 않는다.

`fixtureLoaded=true`이거나 진입 URL에 쿼리가 있으면 개별 항목이 pass여도
**production 증거로 승격하지 않는다**.

## 원인 문구 구분 (핵심)

```
production issue:
  DEBRIEF/BASE 전환 시 pointer lock 자동 해제 부재

harness limitation:
  CDP 합성 Escape가 브라우저 UA 기본 Esc 동작을 완전히 재현하지 못함
```

둘을 섞지 않기 위해 EC12 러너는 단계를 쪼개 기록한다. **합성 Escape 실패
자체를 production 버그로 적지 않으며**, 반대로 하네스 한계가 있다는 이유로
production 자동 해제 부재를 정상 처리하지도 않는다.

## Phase A 실측 (dev `a3c2ee3`)

`pass 4 · blocked 7 · harness 1 · notRun 1 · 오류 0`

핵심 관측 3가지:

1. **EC12-2 pass** — 실제 canvas 클릭으로 pointer lock 획득에 성공한다
   (`requestPointerLock()` 직접 호출 없음).
2. **EC12-3a blocked** — 잠금 중에는 실제 마우스 클릭이 전부 canvas로 전달돼
   `귀환` HUD 버튼에 닿지 않는다. **Pointer Lock 사양대로의 동작**이며
   `document.elementFromPoint`는 버튼을 가리키므로 z-order 문제도, 하네스
   결함도 아니다. 게다가 `ControlsHud`에 귀환용 키보드 경로가 없어,
   **자발적 귀환으로는 '잠금 상태의 DEBRIEF 진입'에 도달할 수 없다.**
3. **EC12-3b harness** — 합성 Escape로는 잠금이 풀리지 않는다. 하네스 한계로만
   기록한다.

따라서 **EC12-4(잠금 상태 DEBRIEF 진입 시 자동 해제)는 `blocked`** 다. 잠금
상태의 DEBRIEF 진입은 실제로는 **적 공격에 의한 파괴** 또는 **보스 격파**
경로에서만 발생하는데, 강제 피해·강제 격파를 쓰지 않으므로 판정하지 않는다.
도달하지 못한 것을 pass로 올리지 않고, 동시에 production 자동 해제 부재가
해소됐다고도 적지 않는다.

이 시점(base `a3c2ee3`)에는 저장소 어디에도 `exitPointerLock` 호출이 없었다.
**이 문장은 Phase A 시점의 사실이며 최신 dev에는 더 이상 해당하지 않는다** — 아래 Phase B 참조.

## Phase B 실측 (dev `d825a688` · PR #23 수신)

`npm run evidence:ec12-locked` — `pass 4 · blocked 5 · 오류 0`

| | Phase A base `a3c2ee3` | Phase B base `d825a688` |
|---|---|---|
| `exitPointerLock` production 호출 | **0건** | **존재** — `ControlsHud`에 종료 메타(DEBRIEF·BASE) 자동 해제 배선 |
| EC12 locked terminal transition | `blocked` | **여전히 `blocked`** — 판정 경로 미도달 |

PR #23은 `terminalMetaUnlock` 플래그로 해제 출처를 표시해, 종료 메타 해제가
사용자 Esc로 오인돼 일시정지·재개 오버레이가 결과 화면을 덮는 것을 막는다.
**코드는 들어왔지만 이 러너가 아직 실행 경로에 도달하지 못했다.**

도달 실패 이유: `locked SORTIE → 귀환 클릭 → DEBRIEF`는 Pointer Lock 사양상
성립하지 않으므로(Phase A EC12-3a), 잠금 상태 DEBRIEF는 **실제 파괴** 또는
**실제 보스 격파**로만 진입한다. 헤드리스에서 100초 실제 플레이(W 키·마우스
이동) 동안 피격이 발생하지 않았고, 강제 피해·강제 격파는 금지이므로
`blocked`로 남겼다 — §8-3 진단(hull·위치·boss 상태·이벤트 순서)을 결과 JSON에
싣는다. 저장소에 sortie 시간 제한이 없어 타이머 종료 경로도 없다.

### ⚠️ Phase B 결론 정정 (Phase C 증적으로 교정)

Phase B가 적었던 **"헤드리스에서 실제 피격이 성립하지 않는다"는 잘못된
일반화**였다. 정확한 설명:

> Phase B 초기 러너는 단서 수집·보스 구역 항해를 수행하지 않아 player가 시작
> 지점에 남았고 `bossSpawned=false`였다. 게다가 러너가 **`hullDamaged`를 아예
> 구독하지 않았고**(계약에 없는 `destroyed` 등을 구독) 피해가 나도 0으로
> 보였다. 따라서 당시 blocked는 production의 헤드리스 한계가 아니라
> **runner coverage의 한계**였다.
>
> 실제 clues 3/3 production 프로필과 실제 항해를 사용하면 **headless
> production browser에서도 보스 생성·피해·파괴·locked DEBRIEF가 모두
> 성립한다** (Phase C).

Phase A·B 당시 결과 자체는 역사적 사실이므로 삭제하지 않는다.

## Phase C — EC12 locked defeat **PASS** (외부 production 증적)

```
EVIDENCE_TYPE=HEADLESS_PRODUCTION_BROWSER
EC12_POINTER_LOCKED_PATH=PASS
EC12_POINTER_LOCKED_PATH_VERIFIED_CANDIDATE=true
```

통합 관리자가 production browser에서 locked-defeat 경로를 완주했다.
Playwright의 실제 keyboard/mouse API를 쓴 production browser 증적이며,
DISPLAY·X11/Wayland·`/dev/input`·GPU seat가 없으므로 **물리 입력 증적이
아니다** — `HEADED_MANUAL`·`PHYSICAL_INPUT`·`USER_MANUAL_INPUT`로 표기하지
않는다.

| 항목 | 값 |
|---|---|
| 전투 관측 | 629초 · `hullDamaged` **7회** (18·18·18·18·18·18·12) · 선체 120 → 0 |
| 파괴 | `playerDestroyed` 1 · `sortieFailed` 1 · `destroyedByEntityId=7000` · `damageSource=enemyWeapon` |
| Pointer Lock | 치명 직전 `game-canvas` → 파괴·실패·DEBRIEF 시점 **`null`** · 획득 1 + 해제 1 · 재잠금 0 |
| UI | resume overlay 미표시 · `aiming=false` |
| 확인 클릭 | `BUTTON "확인 (기지로)"` · mousedown/up/click 전부 `isTrusted=true` · DOM click 0 · `dispatchEvent` 0 |
| 결과 | BASE 복귀 · `sortieEnded`/settlement/`saveRequested('settlement')` 각 **1** · 중복 0 · 오류 0 |

**lethal amount 12 해석** — 마지막 `amount=12`는 남은 선체가 12였기 때문에
`PlayerHullSystem.applyDamage()`의 적용량 clamp
(`appliedDamage = min(rawDamage, currentHull)`)로 나온 값이다. **폭뢰 near
12로 분류하지 않는다.** raw 공격이 projectile 18이었는지 ram 30이었는지는
공격 종류의 직접 이벤트가 없어 확정하지 않고
`LETHAL_ENEMY_WEAPON_DAMAGE_CLAMPED_TO_REMAINING_HULL`로 표기한다.

**피해 분류는 반드시 `INFERRED_` 접두사를 붙인다** — 18 →
`INFERRED_PROJECTILE_FROM_DAMAGE_18`, 30 → `INFERRED_RAM_FROM_DAMAGE_30`.
공격 종류 이벤트가 없으므로 추론임을 이름에 박아 둔다.

**trusted click 기준** — `page.mouse.move/down/up`으로만 누르고
`elementFromPoint`가 `BUTTON`이며 세 이벤트 모두 `isTrusted=true`여야 한다.
DOM `click()`·`dispatchEvent`·confirm command 직접 호출은 전부 0이어야 한다.

**raw evidence는 통합 검증 worktree의 scratchpad에 보관되며 git에서 제외된다**
(`.gitignore`의 `scratchpad/`). 이 저장소 worktree에서는 접근할 수 없어,
위 수치는 통합 관리자 최종 보고를 외부 production 증적으로 인용한 것이다.

## EC12와 나머지 EC는 분리한다

EC12 PASS는 **EC9·EC10 phaseShift·EC11·EC13·EC17을 자동으로 PASS로 만들지
않는다.** 각각 실제 보스전 완주가 필요하며 여전히 미검증이다.

## 선행조건 미달 판정

단서 3/3 또는 boss spawn을 확보하지 못한 실행은
**`BLOCKED_RUNNER_PRECONDITION_NOT_REACHED`** 로 판정한다.
`HEADLESS_DAMAGE_UNSUPPORTED`·`EC12_FAILED`·`POINTER_LOCK_FIX_FAILED`로
적지 않는다 — 러너가 경로에 도달하지 못한 것과 production이 깨진 것은 다르다.

## 장시간 러너 운용

`evidence:ec12` · `evidence:ec12-locked` · `evidence:boss`는 **opt-in 명령**이며
default CI에 넣지 않는다. `evidence:ec12-locked` 실행 조건:

- 실제 production clues 3/3 프로필 필요
- boss spawn 후 **정지 전략** 권장 (회피하지 않고 공격 범위에 머문다)
- 무피해 90초 이상일 때만 실제 입력으로 위치 보정
- 장시간 실행 가능 (Phase C 실측 629초)

`DEEP_DIVE_EC12_HUNT_SECONDS`로 관측 시간을 조절한다(**기본 1200초**).
`DEEP_DIVE_EC12_IDLE_NUDGE_SECONDS`(기본 90)는 무피해가 이 시간을 넘을 때만
실제 입력으로 위치를 보정하고 곧바로 모든 입력을 해제한다.

### 판정은 한 벌뿐이다 — 16개 조건 전체 verdict

candidate는 `judgeEc12LockedPath()`의 **전체 verdict**로만 결정한다.
조건 개수는 `EC12_CONDITIONS` 술어 목록 길이(`EC12_CONDITION_COUNT`)에서
생성되므로 문서와 코드가 어긋나지 않는다. **16개 조건** 중 하나라도 못 채우면
PASS가 아니며, 특정 항목(예: 잠금 null) 하나만 보고 candidate를 정하지 않는다.

미관측은 성공으로 위장하지 않는다 — `confirmClickTrusted`·`lockBeforeLethal`·
`lockAfterDebrief`가 `undefined`면 명확한 불충족으로 변환된다.

### 치명 clamp는 절대 선체로만 판정한다

`hullRemaining`은 0~1 **비율**이라 `amount`(절대값)와 직접 비교하면 성립하지
않는다(12 vs 0.10). 각 `hullDamaged`에 `currentHullAfter`·`currentHullBefore`·
`maxHull`·`lastDamageSource`·`isDestroyed`를 함께 기록하고, 절대값으로만
clamp를 판정한다.

## Phase C Profile Handoff — production 프로필 재사용

### worktree와 browser storage는 별개다

`browser.newContext()`는 **매 실행 localStorage·IndexedDB·cookies가 없는 새
컨텍스트**다. 다른 worktree에 실제 clues 3/3 프로필이 있어도 **자동으로
승계되지 않는다.** 그래서 빌드·툴 worktree에서 나온 `clues 0/3` ·
`BLOCKED_RUNNER_PRECONDITION_NOT_REACHED`는 당연한 결과이며, worktree 위치만
바꿔도 해결되지 않는다.

### opt-in 입력

```bash
DEEP_DIVE_EVIDENCE_STORAGE_STATE=/abs/path/production-clues-3of3.storage-state.json \
DEEP_DIVE_EVIDENCE_PROFILE_PROVENANCE=production-f-hold-clues-3of3-unedited \
DEEP_DIVE_EC12_HUNT_SECONDS=1200 \
npm run evidence:ec12-locked
```

Playwright 공식 `storageState` 입력만 쓴다. **`page.evaluate()`로 localStorage를
쓰거나, 앱 save API를 부르거나, 저장 JSON을 수정하거나, clue 값을 수작업으로
만들지 않는다.** 기존 production 플레이 결과를 **재사용**하는 것이지 상태를
주입·조작하는 것이 아니다.

env가 없으면 기존과 동일하게 빈 context로 실행한다 — **default CI 동작 불변**.

### 실행 전 중단 — 조용한 fallback 없음

파일 부재·비일반 파일·JSON 오류·최상위 비객체·`cookies`/`origins` 비배열·
origin 형태 불량·저장소 tracked 파일이면 **`HARNESS_STORAGE_STATE_INVALID`** 로
브라우저 기동 전에 중단한다. 빈 context로 조용히 fallback해서 `clues 0/3
blocked`를 만들지 않는다.

`provenance` 미설정이면 **`HARNESS_STORAGE_STATE_PROVENANCE_MISSING`**.
storage state를 쓰는 production evidence에는 출처가 반드시 필요하다.

### 동일 origin 요구

storageState의 `origins`에 **실행 origin과 같은 값**이 있어야 한다. 포트가
다르면 localStorage가 적용되지 않는다:

```
프로필 origin = http://localhost:5173
실행 origin   = http://localhost:5211   ← 적용 안 됨
```

**origin 문자열을 임의로 수정하지 않는다.** 대신 ⓐ 프로필을 만든 원래 dev URL과
같은 `DEEP_DIVE_DEV_URL`을 쓰거나 ⓑ 동일 origin에서 프로필을 다시 export한다.

### 증적 메타데이터 — raw 값 비노출

envelope에는 아래만 싣는다. **raw cookies·localStorage 값과 전체 경로는 넣지
않으며**, 스키마가 그런 키가 섞이면 거부한다.

```
storageStateLoaded · storageStateSha256 · storageStateFileName
storageStateOriginCount · provenance
```

### 프로필은 fixture가 아니다

```
storageStateLoaded=true
fixtureLoaded=false
```

실제 production 플레이로 생성된 browser save를 불러온 것이므로 fixture가
아니다. 단 production evidence로 인정하려면 **전부** 충족해야 한다 — URL 쿼리
없음 · `fixtureLoaded=false` · provenance 존재 · SHA 기록 · **앱 진입 후 clues
3/3 실측** · `unlocked=true` 실측 · save 수정·localStorage 작성 코드 0.

**프로필이 로드됐다는 이유만으로 clues 3/3을 가정하지 않는다.** 러너는 진입
직후 실측하고 두 실패를 구분한다:

| 상황 | 판정 |
|---|---|
| 프로필 미요청 + clues 0/3 | `BLOCKED_RUNNER_PRECONDITION_NOT_REACHED` |
| 프로필 요청 + 앱 실측 ≠ 3/3 | `PROFILE_STATE_DOES_NOT_MATCH_PROVENANCE` |

### 프로필 export 절차 (scratchpad 전용)

저장소에 export 기능을 넣지 않는다. 실행 중 Playwright context를 정상적으로 열
수 있을 때:

```js
await context.storageState({
  path: '/…/scratchpad/m1-m2-final-evidence/production-clues-3of3.storage-state.json',
});
```

조건: 실제 production 플레이로 생성된 상태 · export 전 `clues=3/3`·
`unlocked=true` 읽기 확인 · 파일 내용 수정 0 · `git add` 0 · SHA-256 기록 ·
scratchpad 아래 저장 · 파일 내용·cookie 값을 PR 본문에 복사하지 않음.

**앱 localStorage 값을 읽어 새 JSON을 수작업으로 조립하면 안 된다.**
raw 프로필은 `.gitignore`의 `scratchpad/`로 git에서 제외된다.

## Navigation phase와 Combat phase는 분리된다

**storageState만으로 보스가 자동 생성되지 않는다.** clues 3/3은 **unlock 조건일
뿐** 보스 구역 진입을 대신하지 않는다 — 보스는 출항 시작 위치에 생기지 않으므로
실제 키·마우스로 **보스 구역까지 항해**해야 `bossSpawned=true`가 된다.

| phase | 기본 제한 | env | 종료 조건 |
|---|---|---|---|
| `EC12B-NAV` 항해 | **300초** | `DEEP_DIVE_EC12_NAV_SECONDS` | `bossSpawned=true` |
| combat hunt | **1200초** | `DEEP_DIVE_EC12_HUNT_SECONDS` | 파괴 → DEBRIEF |

**보스 생성 전 대기 시간은 combat 1200초에 포함하지 않는다.** 항해가 제한 안에
끝나지 않으면 **`BLOCKED_RUNNER_NAVIGATION_DID_NOT_REACH_BOSS_ZONE`** 이며,
`HEADLESS_UNSUPPORTED`·`BOSS_SPAWN_BROKEN`·`EC12_FAILED`로 일반화하지 않는다.

### 순서 — 잠금을 먼저 잡고 항해한다

```
출항 → 실제 canvas 클릭으로 Pointer Lock 획득 → lock 유지한 채 실제 항해
→ bossSpawned=true → 모든 입력 해제 → combat hunt 시작
```

locked path 선행조건을 처음부터 유지한다. 잠금을 얻지 못하면 항해를 계속하지
않고 `harness`로 끝낸다.

항해는 **read-only pose로 누를 키만 고른다**(`chooseNavigationInput`, 순수
함수). position 직접 쓰기·teleport·transform 변경·강제 spawn·trigger 직접
호출은 없다. 목표는 `runtimeClosure`의 보스·구역 값을 우선 쓰고, 없으면 이전
증적에서 관측된 traversal target을 **방향 결정에만** 쓴다(좌표 쓰기 아님).

### 프로필 미달이면 즉시 종료

clues 실측이 미달이면 **출항·Pointer Lock·20분 대기를 하지 않고** envelope만
쓰고 끝낸다. 미달 상태의 장시간 실행은 아무 증거도 만들지 못한다.

### boss spawn 후 정지 · 신규 피해 기준 idle 타이머

`bossSpawned=true`인 순간 모든 이동 키를 해제하고 정지한다. 보정은 **마지막
신규 피해 이후 90초 초과**일 때만 하고, 보정 직후 전부 해제해 회피 기동이
되지 않게 한다. 보정 횟수는 `DEEP_DIVE_EC12_MAX_NUDGES`(기본 10)로 제한하며
매 보정마다 sequence·pose·거리·키·직전 무피해 시간·이후 피해 여부를 남긴다.

⚠️ idle 타이머는 반드시 **신규 피해 증가분**으로 갱신한다. 누적 수가 0보다
큰지만 보면 첫 피해 이후 매 폴링마다 갱신돼 **nudge가 영영 발생하지 않는다**
(이전 구현의 실제 결함).

### `cause`와 damage source는 다르다

`hullDamaged.cause`는 `direct | near`(폭뢰 근접도)이며 **피해 출처가 아니다.**
`direct`를 `enemyWeapon`이라고 쓰지 않는다. 출처는 PlayerHull snapshot의
`lastDamageSource`에서만 읽고, 없으면 `null`로 둔다. hull 상태는
`snapshot()` → `readModel()` → 직접 속성 순으로 읽는다.

## 금지 사항 준수

내부 상태 주입 0 — 좌표·체력·재화·장비·업그레이드·boss hull·약점·spawn·save
어느 것도 쓰지 않는다. `__deepDiveDebug`는 **읽기 전용 관측**(이벤트 구독·상태
조회)에만 쓴다. fixture를 production 증거로 쓰지 않는다.
