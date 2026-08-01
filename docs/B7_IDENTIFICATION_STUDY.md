# B7_IDENTIFICATION_STUDY — 적대·중립 오인 사격률 측정 규격

> 근거: 개발 소회의(`meetings/13`) 결의 10 / 7차 대회의(`meetings/12`) 서지우
> 판단 기준 / B·C 실행 체제(`meetings/15`) 결의 3 (병렬 슬롯).
> 구현: `src/tools/b7/` · 검증: `npm run verify:sprint-b` (B7-* 7항목).

## 측정하는 것

**플레이어가 적대와 중립을 구분할 수 있는가.** 전투 숙련도가 아니다.
그래서 분모는 '발사한 어뢰 전체'가 아니라 **식별한 뒤 공격 여부를 결정한
기회**다 [13차 정하늘].

## 계산식 [13차 결의 10]

```text
오인 사격률 =
  중립 선박을 적대 선박으로 오인하여 공격한 횟수
  ÷ 적대·중립 선박을 식별한 뒤 공격 여부를 결정한 전체 유효 기회
  × 100
```

분모에 남는 분류는 `correct` + `misidentification` 두 종뿐이고,
분자는 `misidentification`이다.

## 결과 분류 5종과 제외 규칙

| 분류 | 분모 | 분자 | 설명 |
|---|---|---|---|
| `correct` | ✅ | — | 정답 |
| `misidentification` | ✅ | ✅ | 중립을 적대로 오인해 공격 |
| `intentionalNeutralAttack` | ❌ | ❌ | 중립임을 **알고** 공격 — 오인이 아니므로 제외하되 행동 기록으로는 남긴다 |
| `inputMistake` | ❌ | ❌ | 조작 실수 — 식별 오류가 아니라 입력 오류 |
| `invalidOpportunity` | ❌ | ❌ | 태그 노출 전 발사 등 — 애초에 '식별 후 결정'이 아니었다 |

### 분류 정합성은 기계가 강제한다

검증기가 어긋난 기록을 거부한다. 조용히 통과시키면 비율이 왜곡되기 때문이다.

- `misidentification`은 **중립 표적 + 공격 행동 + '적대로 판단'** 일 때만 성립.
  중립으로 판단하고 공격했다면 오인이 아니다 → `intentionalNeutralAttack`
  또는 `inputMistake`로 분류해야 한다.
- `intentionalNeutralAttack`은 `playerDecision === 'neutral'` 이어야 한다.
- 태그가 노출되지 않은 기록(`identificationTagVisible === false`)은
  `invalidOpportunity` 외의 분류를 가질 수 없다.

## 조작 실수 인정 조건 [13차 서지우·오세진]

사후 진술만으로는 제외하지 않는다. 아래 **3종 중 2종 이상**이 일치할 때만
`inputMistake`로 분류한다.

1. 화면 기록 (`screenRecording`)
2. 입력 로그 (`inputLog`)
3. 즉시 인터뷰 (`immediateInterview`)

근거가 모자란 `inputMistake` 기록은 **거부된다** — 분모에 남기려면 다른
분류로 다시 제출해야 한다. 같은 근거를 두 번 적어 2종으로 위장하는 경로는
없다(중복 제거 후 개수를 센다). 제외가 쉬우면 결과가 왜곡된다.

## 최소 표본 [13차 임찬영]

- 테스터 **5명 이상**
- 유효 식별 기회 **50회 이상**

**둘 다** 충족해야 한다. 하나라도 미달이면 비율을 계산해 참고값으로 출력하되
**합격·실패 판정에는 사용하지 않고** `INSUFFICIENT_SAMPLE`로 기록한다.

## 판정 [12차 서지우]

| 조건 | verdict | 후속 |
|---|---|---|
| 표본 미달 | `INSUFFICIENT_SAMPLE` | 판정 금지, 참고 수치만 |
| 20% 초과 | `REINFORCE_VISUALS` | 아래 우선순위대로 시각 구분 강화 |
| 5% 미만 | `RELAXATION_CANDIDATE` | '구분이 시시하다' 응답과 함께 완화 검토 |
| 5~20% | `WITHIN_TARGET` | 현행 유지 |

**강화 우선순위** — 가장 저비용이면서 직접적인 것부터. 한 번에 모든 요소를
과장하지 않는다.

1. 조준경 식별 태그 가독성
2. 항해등과 색 대비
3. 실루엣 차이
4. 사운드 구분

## 기록 8항목 [13차 보완분 결의 10]

계약 `src/contracts/identification.ts`의 `IdentificationOpportunityLog`.

| 필드 | 값 |
|---|---|
| `anonymousTesterId` | 익명 id (예: `t01`) |
| `opportunityId` | 기회 1건의 id |
| `actualFaction` | `hostile` / `neutral` / `patrol` — 정답 대조용 |
| `identificationTagVisible` | 태그가 실제로 보였는가 |
| `playerDecision` | `hostile` / `neutral` / `unknown` — 자기 보고 |
| `playerAction` | `attack` / `hold` / `disengage` |
| `resultClassification` | 위 5종 |
| `timestamp` | epoch ms 또는 프레임 번호 |
| `notes` (선택) | 판단 근거·인터뷰 요약 |

툴링이 판정에 쓰는 `inputMistakeEvidence`는 **계약에 없다** — 제외 심사는
툴링 판정이므로 계약을 넓히지 않고 수집기 쪽에서만 붙인다.

## 개인정보

**`anonymousTesterId` 외의 식별 정보는 저장하지 않는다.**
검증기가 이메일·전화번호·실명(한글) 형태의 값을 거부하며, 비고 필드에도
같은 검사를 적용한다. 거부는 완벽한 탐지가 목적이 아니라 **실수로 실명을
넣는 것**을 막는 것이 목적이다.

테스터 섭외·인터뷰 원본(이름·연락처)은 기획이 별도 관리하며 저장소·로그·
export 어디에도 들어오지 않는다.

## 도구

| 파일 | 역할 |
|---|---|
| `src/tools/b7/identificationStudy.ts` | 스키마 검증 · 집계 · 판정 · CSV/JSON export |
| `src/tools/b7/IdentificationStudyRecorder.ts` | 계약 `IdentificationLogSink` 구현 — 세션 저장·복원·거부 보존 |
| `src/tools/b7/identificationStudyFixture.ts` | 결정적 픽스처 4종 (집계 로직 검증용) |

### 수집기 동작 규칙

- **저장 실패는 측정을 막지 않는다.** 메모리 누적은 계속되고 개발 콘솔로만
  알린다 — 기록이 목적이지 저장이 목적이 아니다.
- **거부된 기록을 버리지 않는다.** 사유와 함께 별도 목록에 남긴다. 조용히
  사라지면 표본 수가 왜곡된다.
- 같은 `opportunityId`의 재심사 기록은 이전 기록을 **대체**한다. 심사(인터뷰
  결과)는 플레이보다 나중에 오기 때문이다.
- 복원 시 저장분도 같은 검증을 거친다. 손상된 1건 때문에 세션 전체를 버리지
  않는다.

### 픽스처는 측정 결과가 아니다

`identificationStudyFixture.ts`의 데이터는 **집계기가 계산식과 제외 규칙을
제대로 구현했는가**만 확인하기 위한 합성 데이터다. 난수·`Date.now()`를 쓰지
않아 항상 같은 요약을 만든다. **어떤 보고서에도 측정 결과로 실려서는 안 된다.**

## 측정 세션 운영

15차 결의 3: B7은 C 기간 중 **빌드·툴 창의 병렬 슬롯**에서 돈다
(주당 20% 상한, 몰아 쓰기 허용 — 주 1회 병렬 슬롯 데이). 세션 일정은
기획이 병렬 슬롯 데이에 맞춰 잡는다.

측정 시행 조건:

1. 최종 **A+B 통합 브라우저 빌드** (dev 통합 빌드에서만 판정 — 상설 규칙 4)
2. B2 태그 UI 병합 — 태그가 없으면 유효 식별 기회 자체가 성립하지 않는다
3. B1 중립 선박 배치 — 구분할 대상이 있어야 한다

**현재 실측 표본: 테스터 0명 · 유효 기회 0회 → `INSUFFICIENT_SAMPLE`.**
