# M1·M2 Runtime Closure — 계약·배선·배정 인계표 (INT-CORE-022)

> 작성: 개발 리드. 기준 dev `37afc1c` (foundation PR #9·#10·#11·#12·#8 병합 완료).
> 이 문서는 **통합 관리자와 세 역할 창의 단일 실행 기준**이다. 여기 없는
> 배선·수치·기능은 Runtime Closure 범위가 아니다.
> 게이트 판정 정본: 자동검증 ≠ production 완주. §6 Exit Criteria만 게이트다.

---

## 1. 확정 계약 요약 (이번 리드 PR로 dev에 들어가는 것)

| 계약 | 위치 | 내용 |
|---|---|---|
| 승인 대기 튜닝 수치 | `contracts/params.ts` `NullableTunable` | value: null 허용(미확정), range·unit 필수, null→0 변환 금지, 키 누락 = 로드 거부 |
| 보스 params 4필드 | `params/boss.json` + `config/bossParams.ts` | `movement.moveSpeedMetersPerSecond`·`movement.turnRateRadiansPerSecond`·`patterns.ram.contactDamage`·`patterns.weakPointOpen.hitRadiusMeters` — 전부 **value: null** (승인 대기). 관계 제약: 평상시 속도 ≤ 돌진 속도(로더 강제) |
| 단서 매핑 | `contracts/meta.ts` `ClueIdByInteractableId` | 월드 interactable ID → canonical clueId. 작성 정본 = 월드 배치 모듈. targetId 문자열 조작 금지 |
| 소나 blip kind | `contracts/sonar.ts` | `SonarBlipKind = SonarCombatBlipKind('ship'\|'torpedo'\|'depthCharge') \| SonarExplorationBlipKind(= InteractionTargetKind 4종)`. 탐색 kind는 **액티브 핑 노출 중에만** 공급. 지형은 blip 아님(렌더가 레이아웃 단일 소스로 배경층 묘화) |
| 보스 피격 통지 | `contracts/events.ts` `bossHit { kind: 'weakPoint' \| 'hull' }` | 명중 판정 확정 1건당 1회, 배율 적용 **후** 발행(재배율 금지), 피해량·위치·공격자 비탑재. 발행: **게임플레이**(`BossWeakPointTarget.onHit` 구독 지점). bossHit → bossDefeated 순서 |
| 약점 개방 이벤트 | `contracts/events.ts` 개정 + `core/BossController` | `bossWeakPointChanged` 발행 정본 = **리드 보스 코어**(상태 전이 시에만 1회, 격파 시 false → bossDefeated 순서 — meta 검증 고정). 명중 '판정'은 여전히 게임플레이 소유 |
| BossCoreView | `contracts/boss.ts` (기존 — 변경 없음) | **정식 공유 read model로 확정.** phase·hullRatio·telegraph(4종)·weakPointOpen·defeated — 최종 단계 시각 상태는 `phase === 3` + telegraph 'phaseShift'. 내부 AI 상태·mutable·params 원본 비노출. producer = 리드 `BossController.view()`, consumer = 그래픽스, 주입 = 조립부 `attachBossViewSource` |

## 2. 수치 결정 요청 (기획 승인 대기 — 근거 없는 숫자를 만들지 않았다)

승인 전까지 해당 축은 unwired다(보스 정지·돌진 무피해·약점 명중 불가).
승인 후 **툴링 경로로 value만 입력**한다(스키마·범위는 이미 계약 고정).

```text
항목: patterns.weakPointOpen.hitRadiusMeters   ⚠ M1 완주 직접 차단 항목
필요 단위: m (통짜 캡슐 근사 — 회의 11 결의 5)
기존 코드가 요구하는 범위: > 0 (계약 range [1, 12])
선택 가능한 최소 후보: 6 (구 게임플레이 임시값 — 공식 승격된 적 없음) / 4 / 8
각 후보의 gameplay 영향: 작을수록 약점 개방 창(4s) 내 정밀 조준 요구↑,
  클수록 '약점 노림' 서열(배율 2.0 vs 0.25)의 변별력↓
사용자 또는 기획 승인 필요 여부: 필요 (승인 즉시 M1 격파 경로 성립)
```
```text
항목: patterns.ram.contactDamage
필요 단위: hull (선체 120 스케일)
기존 코드가 요구하는 범위: > 0 (계약 range [5, 60])
선택 가능한 최소 후보: 20 / 30 / 45
각 후보의 gameplay 영향: 기존 서열 near 12 < projectile 18 < direct 45,
  즉사 없음 원칙. 돌진은 회피 가능(측면 기동)한 고위험 패턴이므로
  projectile(18)보다 큰 값이 서열상 자연스러움 — 최종은 기획 판단
사용자 또는 기획 승인 필요 여부: 필요
```
```text
항목: movement.moveSpeedMetersPerSecond / movement.turnRateRadiansPerSecond
필요 단위: m/s / rad/s
기존 코드가 요구하는 범위: > 0, 이동 속도 ≤ 돌진 14 (로더 관계 제약)
선택 가능한 최소 후보: 속도 6~8 (플레이어 10 미만 — 평상시 도주 가능) /
  선회 0.4~0.8 (대형 함체 관성 표현)
각 후보의 gameplay 영향: 플레이어 10 초과 시 상시 도주 불가(돌진과 변별 소멸),
  선회가 빠를수록 측면 회피 무력화
사용자 또는 기획 승인 필요 여부: 필요
```

### M2 params (파일·경로 계약 — 구현 담당 툴링, 수치 기획)

| 항목 | JSON 경로 | 타입/단위 | 범위 | null 정책 | 소비자 | 수치 근거 |
|---|---|---|---|---|---|---|
| `holdSeconds` | `params/interaction.json` **신설** `hold.holdSeconds` | Tunable, s | [1.0, 4.0] | 확정값 있음 — null 불요 | `InteractionSystem` (attachInteractionParams) | **16차 튜닝표 초기값 2.0 — 입력 가능** |
| `interactRadiusMeters` | `params/interaction.json` `hold.interactRadiusMeters` | NullableTunable, m | [2, 12] | null = 회수 unwired | 동일 | 근거 없음 — 기획 승인 대기 (E→F 거리 이탈 논의의 전제 수치) |
| `noiseContribution` | `params/interaction.json` `hold.noiseContribution` | NullableTunable, 0~1 | [0, 1] | null = 가산 소음 0 아님 — **회수 자체 unwired 유지**(소음 없는 회수 금지) | 동일 (기존 소음 경로 가산) | 근거 없음 — 기획 승인 대기 |
| 소나 핑 3종 | `params/sonar.json` **신설** `activePing.{displaySeconds, detectionGaugeRise, cooldownSeconds}` | Tunable | [1,6]/[0.1,0.6]/[10,60] | 확정 절차: 16차 튜닝표 초기값 **3.0 / 0.30 / 25** — 기획 확인 후 입력 | `SonarScopeSystem` (attachSonarScopeParams) | 16차 결의 2-5·튜닝표 |
| `passiveBearingSpreadRadiansAtMaxNoise` | `params/sonar.json` `passive.bearingSpreadRadiansAtMaxNoise` | NullableTunable, rad | [0.1, 1.2] | null = 스코프 unwired | 동일 | 근거 없음 — 기획 승인 대기 |
| `depthChargeOnPassiveScope` | `params/combat.json` (기존 — PR #11) | boolean | — | null 불가(정책) | 동일 (combat 로더 슬라이스) | 확정 false |
| `sectorCapRatioOfCombatAverage` | `params/economy.json` **확장** `farming.sectorCapRatioOfCombatAverage` | Tunable, ratio | [0.20, 0.60] | 확정 절차: 16차 튜닝표 초기값 **0.40** — 기획 확인 후 입력 | `SectorFarmingRewards` | 16차 결의 2-3 |
| `combatRewardAverageCredits` | `params/economy.json` `farming.combatRewardAverageCredits` | NullableTunable, credits | [10, 500] | null = 파밍 무지급 유지 | 동일 | **산식 필요** — 기존 격침 보상표에서 파생(기획이 산식·값 결정. 경제 보상값과 clue 진행은 절대 혼합 금지) |

시각 전용 값(스코프 크기·색·리드로우 Hz·플래시 시간·`finalPhaseCycleScale` 등)은
`renderVisualParams.json`(그래픽스 소유)에 남는다 — 판정 params와 혼합 금지.
권고(차단 아님): SonarScope의 핑 링 애니 정규화 상수(`pingDisplaySeconds`)는
공급자 params 확정 후 read model 잔여/총량 비율로 대체.

## 3. 보스·약점 월드 배치 계약

| 항목 | 확정 |
|---|---|
| canonical boss spawn ID | `boss-abyss-01` (= `params/boss.json id` — 스코프 가드 개체 수 키와 동일 문자열, 새 ID 발명 금지) |
| 보스 구역 ID | `boss-zone-abyss` (배치 모듈이 export — 진입 게이트·연출·검증이 공유하는 유일 문자열) |
| 배치 데이터 구조 | `src/world/bossPlacement.ts` **신설** — `BOSS_PLACEMENT: BossPlacement`(entityId·spawnX/Y/Z·headingRadians), `BOSS_WEAK_POINT_PLACEMENT: BossWeakPointPlacement`(id·x/y/z — 보스 본체 상대 아님, 월드 절대 좌표·스폰 시 본체와 함께 이동은 기존 `syncTo` 경로), `BOSS_ZONE: { id, minX, maxX, minZ, maxZ }`(구역 경계 — 진입 판정 입력) |
| 약점↔본체 연결 | 약점 `id`는 기존 CombatTarget 등록소 규약의 숫자 id. 본체 추적은 `BossWeakPointTarget.syncTo(boss.getPosition())` — 게임플레이 update 경로(기존 구현) |
| 진입 게이트·스폰 순서 | 게임플레이가 구역 경계 판정(플레이어 위치 ∈ BOSS_ZONE) 제공 → 조립부가 `bossProgress.requestEntry()` 호출 → `'granted'`일 때만 `gameplay.spawnBoss()` + 컨트롤러 활성. `'lockedMissingClues'`면 스폰 0 (UI 안내는 후속) |
| sortie당 spawn ≤ 1 | 기존 구현이 이미 보장(`BossEncounter.spawn()` 재호출 무시 + `spawnBoss` 등록 1회) — 조립부는 재호출 방어를 추가로 만들지 않는다(이중 정본 금지) |
| 수명주기 | 격파: `bossDefeated` → 조립부가 `encounter.markRemoved()` + 컨트롤러 dispose (승리 보상·저장은 기존 BossVictoryBridge — 변경 금지). 패배: 기존 sortieFailed 경로 그대로(보스 특례 없음). reset: 기존 `resetForNewSortie` 사슬(보스·약점·파밍·소나 초기화 — PR #12 구현)이 담당, 컨트롤러는 조립부가 파기·재생성 |
| 렌더 경계 | 렌더는 배치·판정 비소유 — `BossCoreView`·이벤트·`BossProjectileView`만 소비. 배치 파일은 렌더가 읽되(묘화 위치) 수정 금지 |

**공용 월드 파일 수정 승인**: 승인 번호 **INT-CORE-022**. 담당 **그래픽스 창**
(SalvagePlacementSource 전례 — INT-CORE-011). 허용 파일: `src/world/bossPlacement.ts`
**신설만**. 허용 변경: 위 3개 export의 좌표·방향·경계 데이터(협곡 내 도달 가능
위치, 기획 승인). 금지 변경: `startingCanyonLayout.ts` 수정, 밸런스 수치 탑재,
판정 로직 탑재, 두 번째 보스·구역 추가.

## 4. canonical clue 매핑 계약

| 항목 | 확정 |
|---|---|
| world targetId | 월드 interactable 고유 ID (형식 자유 — clueId로 해석 금지) |
| canonical clueId | `params/boss.json unlock.clueIds` 3종만: `clue-wreck-salvage`·`clue-deep-survey`·`clue-guard-log` |
| 배치 데이터 정본 | `src/world/bossCluePlacements.ts` **신설** (그래픽스 창 — 승인 INT-CORE-022): 단서 interactable 3개 배치(좌표·targetId) + `CLUE_ID_BY_INTERACTABLE: ClueIdByInteractableId` **같은 파일에서 export** (배치를 만드는 쪽이 매핑을 만든다) |
| 매핑 작성 담당 | 그래픽스 창(월드 배치) + 기획 승인 (어느 대상이 어느 단서인가는 기획 결정) |
| 검증·loader 담당 | 툴링 — 검증기: 매핑 값 전부가 `unlock.clueIds`에 실재·clueId 3종 전부 커버·값 공백 금지 (verify:tooling) |
| gameplay 공급 담당 | 게임플레이 — `attachInteractables`(배치 소비)·발행 어댑터는 기존 그대로(무상태, 매핑 조회만) |
| composition 주입 담당 | 통합 관리자 — `gameplay.attachClueIds(CLUE_ID_BY_INTERACTABLE)` 1줄 (§5 배선표 순서 4) |
| 미지 targetId | 매핑에 없는 clue 대상 = **발행 0** (`unmappedClue` — 성공 위장 금지, `unmappedClueCount` 관측) |
| 미지 clueId | `BossProgressStore.collectClue` → `unknownClue` 거부 (최종 방어 — 3중: 툴링 검증기 / 조립부 대조 / 스토어 거부) |
| 다른 targetId·같은 clueId | 반영 단위는 clueId — 스토어가 중복 1회만 반영 (verify:meta 고정) |
| save 복원 후 재회수 | 스토어 원장이 거부(duplicate) — 대상 단위 재회수는 `InteractionSystem.restoreCollected` (둘 다 기존 구현·변경 금지) |
| BossProgressStore 전달 경로 | `interactionCollected(kind==='clue')` → 조립부 구독 → `collectClue(payload.clueId)` (기존 배선 — 변경 금지) |
| 3/3 → 진입 게이트 | `bossProgress.unlocked`(단조) → `requestEntry()` — §3 스폰 순서 |

## 5. 통합 composition 배선표 (Game.composeSystems — 통합 관리자 실행)

기존 배선(params 4종·combat·boss params 로드, bossProgress 복원·clue 구독·
승리 브리지·SaveBridge)은 **이미 있고 바꾸지 않는다.** 아래는 추가분만,
순서대로. "미도착"= 해당 역할 산출물이 dev에 없는 동안 — 전부 안전 무동작.

| 순서 | producer | contract | consumer | 호출 위치 (Game.ts) | 필수 params | unwired 시 동작 |
|---|---|---|---|---|---|---|
| 1 | `loadBossParams()` (기존 1회 호출 재사용) | `BossParams` (+승인 대기 4필드) | 조립부 | ⓪-b2 기존 지점 | boss.json | null 필드는 그대로 전달 — 변환 금지 |
| 2 | 툴링 `loadInteractionParams()`·`loadSonarParams()`·economy farming 로더 (신설 대기) | 각 params 계약 (§2) | 조립부 | 로더 블록 | 각 JSON | **로더 미존재 동안 이 줄을 쓰지 않는다** — null 주입·자체 파싱 금지 |
| 3 | `world/bossCluePlacements` (신설 대기) | 배치 + `ClueIdByInteractableId` | `gameplay.attachInteractables` + 어댑터 | 게임플레이 attach 블록 | — | 파일 미존재 동안 대상 0·발행 0 |
| 4 | 조립부 | `ClueIdByInteractableId` | `gameplay.attachClueIds(mapping)` | 순서 3 직후 | boss params clueIds와 대조(불일치 = 부팅 오류로 중단) | 미주입 = 단서 발행 0 (`unmappedClue`) |
| 5 | `world/bossPlacement` (신설 대기) | `BossPlacement`·`BossWeakPointPlacement`·`BOSS_ZONE` | 조립부 | 보스 블록 신설 | — | 파일 미존재 동안 6~11 전부 생략 — 보스 없음(현행 유지) |
| 6 | 조립부 | `BossPhasePort` 지연 프록시 | `gameplay.createBoss(placement, weakPointPlacement, phasePortProxy, encounterParams, weakPointParams)` | 보스 블록 | encounterParams = boss params movement·projectile·ram.contactDamage 슬라이스 / weakPointParams = weakPointOpen 배율 2종+`hitRadiusMeters` | null 필드 축만 unwired(이동 0·돌진 무피해·명중 불가) |
| 7 | `gameplay.bossMotionPort`·`bossAttackPort` | `BossMotionPort`·`BossAttackPort` | `new BossController({ motion, attackPort, params: bossParams, playerAlive: playerHull, bus, spawnPosition, entityId, targetEntityId: PLAYER_ENTITY_ID })` + `initialize()` | 순서 6 직후 | boss params | attackPort는 non-null로 생성됐으므로 unwired 아님 — 피해 성립은 params에 달림 |
| 8 | 조립부 | phasePortProxy 해소 | 순서 6의 프록시가 controller.phasePort로 위임 시작 | — | — | controller 생성 전 기본값 phase 1·개방 false |
| 9 | `gameplay.attachBossDamageSink(controller)` | `BossDamageSink` | 리드 보스 체력 원장 | 순서 7 직후 | — | 약점 명중 → 배율 1회 적용값 전달 (재배율 금지) |
| 10 | 게임플레이 (bossHit 발행 — 자기 조립 지점) | `bossHit` | 렌더·오디오 | 게임플레이 코드 (조립부 아님) | — | 보스 미생성 동안 발행 0 |
| 11 | 조립부 | `torpedoFired` → `controller.notifyLastKnownPosition` / 구역 진입 → `requestEntry()` → `gameplay.spawnBoss()` / `bossDefeated` → `encounter.markRemoved()`+controller dispose | 보스 수명주기 | 보스 블록 | — | §3 수명주기 |
| 12 | `gameplay.attachSonarContacts(source)` | `SonarContact[]` (전투 + 탐색 접점) | `SonarScopeSystem` | 소나 블록 신설 | — | 미연결 = 접점 0 |
| 13 | `gameplay.attachSonarScopeParams(...)` | `SonarScopeParams` (sonar.json 슬라이스 + combat `depthChargeOnPassiveScope`) | 동일 | 소나 블록 | sonar.json 로더(순서 2) | null = 스코프 unwired('계기 미연결' 표시 유지) |
| 14 | `gameplay.sonarScopeReadModel` | `SonarScopeReadModel` | `scene.attachSonarScopeSource({ scopeView: () => gameplay.sonarScopeReadModel() })` | Game.ts 기존 주석 지점 (PR #8이 표시) | — | 미배선 = '계기 미연결' |
| 15 | `controller.view()` | `BossCoreView` | `scene.attachBossViewSource({ coreView: () => bossController?.view() ?? null })` | 보스 블록 | — | null = 보스 시각 유휴 |
| 16 | 기존 유지 | `bossDefeated`→BossVictoryBridge / sortieFailed / reset 사슬 | 기존 | 변경 금지 | — | — |

호출 순서 제약: 6→7→8→9는 연속(프록시 해소 전 spawn 금지), 11의 spawnBoss는
반드시 requestEntry 'granted' 이후, 14·15는 언제든 안전(null 반환).

## 6. M1·M2 Exit Criteria (게이트 정본)

**자동검증(전제 조건일 뿐 게이트 아님)**: typecheck·build·check:size·check:scope·
verify:gameplay·meta·tooling·hud·sprint-a/b/c 전부 통과 + 신규 계약 검증 포함.

**production 브라우저 완주(게이트 — fixture·unwired 화면은 증거가 아니다)**:

1. F hold로 canonical clue 3개 회수
2. 같은 clue 중복 진행 0 (다른 targetId 포함)
3. save 후 재접속에도 3/3 유지
4. 3/3 이전 보스 구역 진입 차단 (spawn 0)
5. 3/3 이후 보스 정확히 1회 spawn (재진입·재시도에도 1회)
6. BossController ↔ 이동·공격 포트 실연결 (이동·선회 관측)
7. 기존 어뢰 경로로 일반 본체·약점 타격 성립
8. 약점 배율 정확히 1회 적용 (피해 원장 대조)
9. 보스 단계 1→2→3 순차 전환 관측
10. 모든 공격 전 예고 표시 관측 (telegraph 4종)
11. 일반 피격·약점 피격 시각 구분 (bossHit 경로)
12. 플레이어 패배 시 기존 sortieFailed 경로 그대로
13. 보스 승리 시 기존 승리·보상·저장 경로 정확히 1회 (rarePart+기록 동승)
14. production 소나 provider 표시 (계기 미연결 아님 — wired 상태)
15. exploration blip 4종(goldCache·salvage·clue·deepSite) 확인 (액티브 핑 노출 중에만)
16. provider 연결·확인 후 DetectionHud 정리 (§7 순서 엄수)
17. reset·재출항 후 중복 spawn·보상·이벤트 0
18. 콘솔 오류 0
19. 페이지 오류 0

**M0 분리 기록**: 실기기 GPU 검증(노트북 2대)·기본 품질 결정·INT-RENDER-013
최종 승인은 **병렬 위험 항목**으로 유지한다 — 마스터 플랜이 M1·M2 기능 구현의
전제로 요구하지 않으므로 Runtime Closure를 차단하지 않는다. 단
`M0_FORMALLY_CLOSED=false`가 남아 있는 한 데모 최종 판정(전체 완성 선언)은 불가.

## 7. DetectionHud 제거 순서 (확정)

1. 게임플레이 provider 구현 완료(§8 배정) → 2. 조립부 연결(§5 순서 12~14) →
3. production 브라우저에서 소나 wired 표시 확인(Exit 14) → 4. DetectionHud와
스코프 정보 중복 확인 → 5. **그래픽스가 DetectionHud 제거**(후속 그래픽스 PR —
이번 스프린트 내) → 6. verify:hud 갱신 포함 회귀 검증.
**provider 연결 전 제거 금지.** 그 전까지 이중 표시는 한시 허용.

## 8. 역할별 Runtime Closure 배정 + 파일 소유표

동시 작업 충돌 방지 원칙: **같은 파일을 두 역할이 수정하지 않는다.**
`GameplaySystems.ts`는 게임플레이 전용, `Game.ts`는 통합 관리자 전용,
`params/*.json` 수치 입력은 툴링 전용(승인값만).

### 게임플레이 (`src/systems/**`)
- F hold 적용: `KeyboardInput.interactHold` getter `KeyE`→`KeyF` 1줄 + interact 관련 결정적 검증 갱신 (§9 입력 정책)
- 승인 params 소비: interaction·sonar·farming attach 경로는 기존 — 로더 도착 후 타입 정합만 확인
- 탐색 blip 공급: `SonarScopeSystem` 접점에 interactable 공급(kind 4종 — 액티브 핑 노출 중에만 탐색 kind 방출, 패시브 비노출 규칙 준수), `CANONICAL_BLIP_KIND`의 boss→'ship' 유지
- `bossHit` 발행: `createBoss` 내부 `weakPoint.onHit((kind) => bus.emit('bossHit', { kind }))` — 배율 적용 후 시점, 재배율 금지
- 구역 경계 판정 제공: `BOSS_ZONE` 소비 read (`isPlayerInBossZone(): boolean` 형태 API)
- 승리·패배·reset 경로 재검증(기존 reset 사슬에 보스·소나 포함 확인 — 구현 완료분 유지)
- 결정적 검증: 위 전부 verify:gameplay 추가 (기존 291 유지)

### 그래픽스 (`src/render/**` + 승인된 world 신설 2파일)
- `src/world/bossPlacement.ts`·`src/world/bossCluePlacements.ts` 신설 (승인 INT-CORE-022 — §3·§4 규격, 기획 승인 좌표·매핑. **다른 world 파일 수정 금지**)
- 확장 SonarBlipKind 4종 표시 (kind 재추측 금지 — 받은 값으로만 분기. 색·아이콘은 그래픽스 소유)
- 정식 BossCoreView·`bossHit` 소비 연결 준비 (notifyWeakpointHit/normalHit를 `bossHit` 구독으로 교체 — 검수 키 [6]/[7]는 fixture 전용으로 격리)
- provider 연결 후 DetectionHud 제거 (§7 순서)
- production 브라우저 시각 검증 (Exit 10·11·14·15)

### 빌드·툴 (`src/tools/**`·params 수치 입력·검증 러너)
- `params/interaction.json`·`params/sonar.json` 신설 + `params/economy.json` farming 확장 (§2 규격 — 공식 로더·검증기 동반, C9 관례)
- 승인 수치 입력(기획 승인분만): holdSeconds 2.0, 소나 핑 3종(16차 튜닝표 — 기획 확인 후), farming 비율 0.40(동일). **근거 없는 4종은 null 유지**
- clue 매핑 검증기: `bossCluePlacements` 매핑 ↔ `unlock.clueIds` 대조 (verify:tooling)
- 신규 EventBus 계약 검증: `bossHit`·`bossWeakPointChanged` 발행 규약 회귀 검증(발행 지점 정본 확인)
- composition wiring 검증: §5 배선 존재·순서 정적 검사 (verify:sprint 계열 확장)
- M1·M2 브라우저 자동검증 인프라(Exit 1~19 자동화 가능분) + CI 기록

### 통합 관리자
- `Game.ts` §5 배선표 실행 (순서·조건 엄수, 자의 판단 금지)
- 각 역할 PR 병합 순서: 툴링 params → 게임플레이 → 그래픽스(world 데이터 포함) → 통합 배선 → Exit 실측

### 파일 소유표 (Runtime Closure 스프린트 한정)

| 파일/영역 | 소유 | 비고 |
|---|---|---|
| `src/contracts/*`·`src/core/*`·`src/meta/*`(save 제외)·`config/bossParams*` | 리드 | 이번 PR로 확정 — 스프린트 중 추가 변경은 INTEGRATION_NOTES 절차 |
| `src/systems/**` (GameplaySystems 포함) | 게임플레이 | 툴링·그래픽스 수정 금지 |
| `src/render/**`·`renderVisualParams.json` | 그래픽스 | |
| `src/world/bossPlacement.ts`·`bossCluePlacements.ts` (신설) | 그래픽스 (INT-CORE-022 승인 범위) | 기존 world 파일은 공용 보호 유지 |
| `src/tools/**`·`src/meta/save/**`·`scripts/**` | 툴링 | |
| `params/*.json` | 툴링(입력)+기획(수치 승인) | 스키마 계약은 리드 확정분 |
| `src/core/Game.ts` | 통합 관리자 (§5 배선표 한정) | |
| `src/ui/DetectionHud.ts` 제거 | 그래픽스 (§7 시점) | UI 디렉터리 관례상 제거 PR에 툴링 리뷰 |
| `docs/CURRENT_STATUS.md` | 각 역할 자기 구역 | |

## 9. 입력 키 최종 정책 (확정 — 미결 아님)

| 항목 | 확정 |
|---|---|
| 최종 키 | **E = 상승 병행 키 유지 / F hold = 상호작용·회수** |
| 근거 | 9차 결의 4(12차 부록 2 키맵 확정본)의 E=상승을 **무변경 보존** + 17차 결의 2로 `F`가 미배정 반환됨 — 미배정 키 사용은 키맵 신규 규칙 신설이 아니다. 상승·회수 동시 진행과 3D 거리 이탈 취소(수직 상승) 문제를 최소 변경으로 제거 |
| 변경 지점 | `KeyboardInput.interactHold` getter 1줄 (`KeyE`→`KeyF`) — 게임플레이. `ascend`는 무변경 |
| UI 도움말 | ControlsHud·회수 프롬프트 문구 'E'→'F' — 그래픽스/HUD 담당 (텍스트만) |
| 저장 호환성 | 영향 0 — 키 바인딩은 저장 대상 아님 |
| 접근성 | F는 WASD 오른손 인접(표준 상호작용 키 관례) — 홀드 2.0s 유지, 동시 키 요구 없음. 키 재배정 옵션은 백로그(R13 — 신규 기능이므로 이번 범위 아님) |
| 테스트 수정 범위 | verify:gameplay의 interactHold 입력 단언에서 코드 문자열만 교체(단언 약화 없음) + verify:hud 프롬프트 문구 확인 갱신 |
| 경계 | 게임플레이 = getter·검증 / 그래픽스·HUD = 문구. 서로의 파일 비접촉 |
