# SPRINT_B_TEST_PLAN — 스프린트 B 검증 계획

> 실행: `npm run verify:sprint-b`. 인수 기준·현재 상태는
> `docs/SPRINT_B_ACCEPTANCE.md`, B7 측정 규격은 `docs/B7_IDENTIFICATION_STUDY.md`.
> 판정은 각 창 로컬이 아니라 **dev 통합 빌드**에서 한다 (상설 규칙 4).

## 검증 계층

| 계층 | 도구 | 무엇을 본다 |
|---|---|---|
| 계약 규칙 | `verify:sprint-b` (검증기 `.ts`) | 세력 규칙표·식별 상태·보상 정책의 **규칙 자체** |
| params 스키마 | `verify:sprint-b` → `economyMath` | 형식·범위·계약과의 일치·거부 규칙 |
| 저장소 사실 | `verify:sprint-b` (러너 `.mjs` 정적 스캔) | 구현·소비·위반 지점이 **실제로 있는가** |
| 결정적 동작 | `verify:meta` (리드) / `verify:gameplay` (게임플레이) | 중복 방지 경계·판정 로직 |
| 사람 측정 | B7 측정 세션 | 오인 사격률 (자동화 불가) |

**중복 검증하지 않는다.** 중복 방지 원장·경계 로직은 리드 소유이고
`verify:meta`가 결정적으로 검증하므로, `verify:sprint-b`는 그 결과를
참조만 하고 다시 테스트하지 않는다.

## 정적 스캔의 범위와 한계

러너가 `src/` 아래 `.ts`를 스캔하되 **`__verification__`과 `src/contracts/`는
제외**한다 — 검증 코드와 계약 자체는 관측 대상이 아니라 관측 도구다.

| 스캔 | 패턴 | 한계 |
|---|---|---|
| B1 세력 배치 | `faction: 'hostile'\|'neutral'\|'patrol'` 리터럴 배정 | 타입 선언(`faction: FactionId`)은 정의가 아니므로 제외. 런타임에 계산되는 세력은 잡히지 않는다 |
| B2 식별 소스 | `implements ShipIdentificationSource` / 타입 주석 | |
| B2 소비 | `src/render/` 안의 `identificationState`·`identifications` | |
| B2 위반 | `src/render/`·`src/ui/`의 `faction === '...'` 분기 (단, `identificationState` 언급 줄 제외) | 우회 표현(변수 경유 비교)은 잡히지 않는다 |
| B4 발행 | `.emit('neutralShipHit'` | 구독은 제외 |
| B5 원본 | `implements DestroyerAI` | |
| B5 위반 | `class *Guard*(Ai\|AI\|Behavior\|StateMachine\|Brain)` — `GuardShipAdapter.ts` 제외 | 다른 이름의 신규 AI는 사람 리뷰로 잡는다 |
| B6 소비 | `rewardMultiplier`·`highValueTransport` | |

정적 스캔은 **없는 것을 확인**하는 데 강하고, 있는 것의 품질을 판정하지는
못한다. B2 위반·B5 신규 AI는 스캔이 0건이어도 통합 리뷰
(`prompts/INTEGRATION_REVIEW.md`)의 사람 확인을 대체하지 않는다.

## B1~B5 — 통합 빌드에서 확인할 것 (브라우저 수동)

자동 판정이 보류·차단인 항목은 아래 절차로 확인한다. 게임플레이·그래픽스
병합 후, dev 통합 빌드에서만 시행한다.

| # | 시나리오 | 기대 |
|---|---|---|
| 1 | 출항 후 해역에서 선박 관측 | 적대·중립이 **같은 출항에** 존재 |
| 2 | 조준경으로 원거리 선박 조준 | 태그 없음 또는 `unidentified` — **세력이 노출되지 않는다** |
| 3 | 식별 거리까지 접근 | 태그가 적대/중립으로 확정 표시 |
| 4 | 적대 수송선 격침 | 크레딧 드롭 발생 (`cargo-standard` 120) |
| 5 | 중립 선박 격침 | **크레딧 변화 0** — 지갑 불변 확인 |
| 6 | 중립 선박 유효 피격 | 경비함 1척 스폰 (사건 1건 = 1척) |
| 7 | 같은 중립을 연속 피격 | 경비함이 **추가로 늘지 않는다** |
| 8 | 스폰된 경비함 관측 | 세력 `patrol`, 초기 표적 = 플레이어, 행동은 기존 구축함 AI |
| 9 | 빗나간 어뢰 / 조준만 | 경비함 스폰 없음 |

5번(중립 격침 → 크레딧 불변)은 15차 결의 2가 툴링 창 범위로 명시한
단언 테스트다. 게임플레이 판정 경로가 병합되면 `verify:gameplay` 또는
`verify:sprint-b`의 자동 단언으로 승격한다.

## B6 — 배율 확정 후 검증

배율은 아직 공식 수치가 없다(`docs/SPRINT_B_B6_PROPOSAL.md`). 승인 후:

1. `params/economy.json`의 `highValueTransport.rewardMultiplier`와
   `rewardMultiplierRange`에 입력
2. `verify:sprint-b`의 `B6-multiplier`가 `pending` → 자동 판정으로 전환
3. 브라우저: 고가치 수송선 격침 보상 > 일반 수송선 보상 실측 대조
4. 호위함이 이탈 상한 거리 안에서 교전 진입하는지 확인

**B6 독립성은 이미 기계적으로 보장돼 있다** — `B6-independence`가
`highValueTransport` 블록을 통째로 제거해도 B1~B5 관련 스키마·정책이
성립함을 단언한다. B6 미확정이 핵심 게이트를 막지 않는다.

## B7 — 측정 세션

`docs/B7_IDENTIFICATION_STUDY.md` 참조. 요약:

- 시행 조건: A+B 통합 브라우저 빌드 + B2 태그 UI + B1 중립 배치
- 최소 표본: 테스터 5명 **그리고** 유효 기회 50회
- 미달 시 `INSUFFICIENT_SAMPLE` — 참고 수치는 출력, **판정 금지**
- 운영: C 기간 중 빌드·툴 창 병렬 슬롯 (주당 20%, 몰아 쓰기 허용)

## A 회귀 보호

B params 추가가 A 경제 곡선을 바꾸지 않아야 한다. 매 검증에서
`npm run verify:sprint-a`가 아래를 계속 단언한다:

| 항목 | 기대 |
|---|---|
| upgrades 미확정 | 0 |
| equipment 미확정 | 0 |
| economy 미확정 (A 범위) | 0 |
| salvage 배치 | 3종 (희귀 부품 경로 1) |
| 파괴 손실률 | 0.5 |
| 출항 최대 수입 | 245 (수송선 120 + 해저 125) |
| 보스 준비 | 1200크레딧 → 4.9회 (목표 4~6회) |

추가로 `verify:sprint-b`의 `B3-params`가 적대 `cargo-standard` 보상 **120**
유지를 직접 단언한다 — B 확장이 A 수치를 건드리면 즉시 실패한다.

## 실행 순서

```bash
npm ci
npm run typecheck
npm run build
npm run check:size
npm run check:scope
npm run verify:gameplay
npm run verify:meta
npm run verify:tooling
npm run verify:sprint-a
npm run verify:sprint-b
```

`verify:sprint-b`의 실패(`fail`)는 **툴링 소유 영역의 실패**만을 뜻한다.
보류(`manual`)·차단(`blocked`)·대기(`pending`)는 종료 코드에 반영되지 않지만
반드시 목록으로 출력된다 — 숨기지 않으면서, 고칠 수 있는 실패와 남의 영역에서
오는 대기를 분리하기 위한 규칙이다.

---

## A+B 통합 빌드 실행 결과 (통합 관리자 — production 브라우저)

> 위 'B1~B5 — 통합 빌드에서 확인할 것' 9개 시나리오의 실행 결과다.
> 실행 URL `http://localhost:5173/`, 쿼리 플래그 없음, `?bdemo` fixture 미장착.
> 조작은 production 입력만 (Pointer Lock → WASD/Ctrl/Shift → 우클릭 → 좌클릭).

| # | 시나리오 | 결과 |
|---|---|---|
| 1 | 출항 후 선박 관측 | ✅ hostile `id=1` + neutral `id=2` 동시 존재, patrol 0척 |
| 2 | 원거리 조준 | ✅ `unidentified` · `displayLabelId=null` — 세력 미노출 |
| 3 | 식별 거리 접근 | ✅ `hostile`(41m) / `neutral`(23m) 확정 표시 |
| 4 | 적대 격침 | ✅ `cargo-standard` 120 드롭 → 출항 재화 `0 → 120` |
| 5 | 중립 격침 | ✅ 지갑 `1900 → 1900`, 출항 재화 0, 드롭 엔티티 0, `lootDropped` 0건 |
| 6 | 중립 유효 피격 | ✅ 경비함 **1척** 스폰 (`spawned`) |
| 7 | 같은 사건 재처리 | ✅ `duplicateRequest` — 경비함 늘지 않음 |
| 8 | 경비함 관측 | ✅ `patrol` · 초기 표적 `PLAYER_ENTITY_ID(-1)` · production `DestroyerAIController` 위임 (Guard 전용 AI 0) |
| 9 | 조준만 / 빗나감 | ✅ `neutralShipHit` 0건 — 조준·미명중으로는 발행되지 않음 |

5번(중립 격침 → 크레딧 불변)은 15차 결의 2가 지정한 단언이며,
브라우저 실측 + `verify:gameplay` 결정적 검증 양쪽에서 확인됐다.

### 정적 스캔의 한계에 대한 사람 확인 (본 문서 '정적 스캔의 범위와 한계')

- **B2 세력 추측 금지**: 렌더의 세력 변형 선택이 `ShipWorldView.faction`
  값만 소비함을 코드와 런타임 양쪽에서 확인 — 렌더 인스턴스의 variant가
  게임플레이 faction과 1:1 일치(`id=1→hostile`, `id=2→neutral`).
  모델명·클래스명 분기 없음.
- **B5 신규 AI 0**: `implements DestroyerAI` **내용 기반** 판정으로
  production 구현체 1개(`src/core/DestroyerAIController.ts`)만 존재.
  파일명 변경으로 검사를 피할 수 없는 형태이며, 렌더 오버레이
  (`GuardDirectionIndicator`)도 같은 AI 어휘 검사 대상에 포함된다.

### 이 회차에서 자동 단언으로 승격된 항목

`verify:sprint-b`의 `B4-port`가 관측 없는 `blocked` 하드코딩에서
**조립 배선 정적 관측**으로 바뀌었다 (위치 전략 호출 + production AI 팩토리
호출 + `create: () => null` 더미 0건). 관측 결과가 없으면 여전히 `blocked`이며,
실제 개체 생성·이동 판정은 브라우저 실측이 담당한다.
