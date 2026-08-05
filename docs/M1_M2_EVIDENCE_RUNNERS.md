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

저장소 어디에도 `exitPointerLock` 호출이 없다는 정적 사실이 이 blocked의 배경이다.

## Phase B에서 할 일

그래픽스/UI `ControlsHud` PR 병합 후 최신 dev를 **일반 merge**로 수신하고
EC12를 재실행한다. locked path가 **실제 pass**일 때만 검증기를 최종 활성화하고
기존 suite에 연결한다(기존 assertion은 삭제·변경하지 않고 개수만 늘린다).
그때까지 이 PR은 Draft로 두며 default CI에 production gate를 강제로 넣지 않는다.

## 금지 사항 준수

내부 상태 주입 0 — 좌표·체력·재화·장비·업그레이드·boss hull·약점·spawn·save
어느 것도 쓰지 않는다. `__deepDiveDebug`는 **읽기 전용 관측**(이벤트 구독·상태
조회)에만 쓴다. fixture를 production 증거로 쓰지 않는다.
