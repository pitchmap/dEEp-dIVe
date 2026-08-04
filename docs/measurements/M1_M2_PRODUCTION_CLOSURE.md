# M1·M2 Runtime Closure — production composition 실측

> 기준 dev: `9df73dd6f01c3ef8908a68909749a50229f1dd0d`
> composition 커밋: `16b88d5` · verifier 산출물: `bda3f14`
> 관측 경로: **플래그·쿼리 없는 production 진입**(`http://localhost:5173/`).
> 입력은 실제 production 키 경로(W/A/D/E/Shift/Ctrl/F/Q/좌클릭)만 사용했다 —
> fixture·demo 화면·텔레포트·좌표 직접 변경 **0건**.

## 1. composition 배선 (정적 — `verify:runtime-closure`)

```
pass 32 · fail 0 · unwired 0 · blocked 0 · blockedByNullParam 0 · blockers 0
WIRING_2~16 전부 production pass · C1-clueMapping pass · Q1-activePingKey pass
```

## 2. production 브라우저 실측 — 완료 항목

| # | 항목 | 실측값 |
|---|---|---|
| S1 | 부팅 상태 | `fixtureLoaded=false` · `bossSpawned=false` · **BossCoreView `null`**(spawn 전 보스 시각물 0) · clues 0/3 · unlocked=false |
| S2 | SonarScope production provider | `scope.unwired=**false**` — '계기 미연결'이 아니라 실제 read model 표시. passive blip `[ship, ship]` · `pingReady=true` · `ringState=safe` |
| S3 | 출항 | `meta=SORTIE` · pose (0,0,0) · bossSpawned=false · BossCoreView null |
| S4 | **E 상승 / Shift 하강** | E 1.4s 홀드 → y `0 → 0.55`(+0.55m) · Shift 1.4s → `0.32`(−0.23m). E는 상승 유지, F로 이관되지 않았다 |
| S5 | **F hold** | 대상 없는 위치에서 F 2.6s 홀드 → 발행 **0건** · `interaction.unwired=false`(params 2.0/6.0/0.15 주입됨) · candidate null |
| S6 | **Q press 1회 → ping 1회** | press 전 `ping=0s ready=true` → 후 **`ping=2.8s`**(표시 3.0s) · `ready=false` · **`cd=24.8s`**(쿨다운 25) |
| S7 | **active ping 중 exploration 표시** | blips `[ship,ship,**goldCache**,**salvage**,**salvage**,**clue**,**clue**,**clue**]` — 전부 `fromActivePing=true` |
| S8 | **passive exploration 0** | passive 목록 `[]` — exploration kind 포함 **0건** |
| S9 | **지형 blip 0** | kind 집합 `[ship, goldCache, salvage, clue]` · `terrain` **0건** |
| S10 | **Q hold·repeat 추가 ping 0** | Q 2.0s 홀드(OS repeat 포함) → cd `24.8 → 23.0s` 단조 감소, 쿨다운 리셋 **0** = 추가 ping 0 |
| S11 | **cooldown 중 거부** | 잔여 22.8s에서 `requestActivePing()` → 거부, ping 잔여 변화 없음(1.0→0.8 자연 감소) |
| S13 | **clue 진행 ↔ farming reward 혼합 0** | 회수 이벤트 0 · `lootDropped=[]` · 지갑 0. clue kind는 `PAYABLE_KINDS(['gold','salvage'])` 밖이라 구조적으로 `noReward` |
| S14 | **save → 재접속 왕복** | reload 후 clues 0/3 · unlocked=false · ids `[]` · bossSpawned=false · fixtureLoaded=false — 상태 왕복 무결 |
| S15 | **콘솔·페이지 오류** | 콘솔 **0건** · 페이지 **0건** |

증적: `docs/screenshots/m1m2int_active_ping.png`(액티브 핑 노출) ·
`m1m2int_after_reload.png`(재접속 직후 production 화면).

**S7이 composition contact source가 실제로 작동함을 증명한다** — `goldCache`는
`economy.salvageObjects`(chest), `salvage`는 같은 소스의 잔해, `clue` 3건은
`BOSS_CLUE_PLACEMENTS`, `ship`은 `shipWorldSource`에서 왔다. 지형은 blip이
아니며 fixture 접점은 하나도 없다.

## 3. 미실측 — 스크립트 항법 한계 (blocked)

아래 항목은 **보스 구역(z 44~60)·단서 지점(z 4 / −38 / −52, y −18.8)** 도달이
전제다. 스크립트 자동 항법을 3회(직진 → 경유점 → 전방주시 순항) 시도했으나
S자 협곡 지형에서 매번 벽에 정체해 목표 좌표에 도달하지 못했다
(최선 도달: z=31.06, x=−15.72 / 수로 중심 x≈6.9).

**실패한 주행은 증거로 쓰지 않았고 그 스크린샷은 삭제했다.**

| 항목 | 상태 | 전제 |
|---|---|---|
| F hold 단서 3종 회수 · 중복 진행 0 | **미실측** | 단서 좌표 도달 |
| 저장 후 재접속 3/3 유지 · 복원 marker 재표시 0 | **미실측** | 3/3 달성 |
| 3/3 이전 boss spawn 0 | **미실측** | 구역 진입 |
| 3/3 이후 밖→안 spawn 1 · 체류 중 중복 spawn 0 | **미실측** | 3/3 + 구역 진입 |
| spawn 후 보스 시각물 1 · 이동 · 공격 패턴 · 단계 전환 | **미실측** | spawn |
| bossHit hull·weakPoint · 약점 경로 · 격파 | **미실측** | spawn |
| reset 후 잔여 update·공격·시각물 0 · 두 번째 sortie 재생성 | **미실측** | spawn |
| victory·defeat 회귀 | **미실측** | spawn |

이 항목들은 **사용자의 로컬 실기기 수동 플레이 검수**가 가장 확실한 경로다
(그래픽스 창도 PR #16에서 수동 주행으로 구역·단서 지점에 도달했다).

## 4. farming reward 데이터 blocker

| 항목 | 사실 |
|---|---|
| 요구 타입 | `FarmingRewardEntry { readonly interactableId: string; readonly credits: number }` |
| 주입 API | `gameplay.attachFarmingRewards(readonly FarmingRewardEntry[] \| null)` |
| 현재 production farming 대상 | **0개.** `attachInteractables`가 공급하는 대상은 clue 3종이며 `PAYABLE_KINDS = ['gold','salvage']`에 clue는 없다 |
| 검색 경로 | `src/**` · `params/**` · `docs/**` 전수 — `FarmingRewardEntry` 참조는 정의 1 + 주입 API 2뿐, production 호출 **0**. `params/`에 `interactableId` 키 **0**, `src/world/`에 `credits` **0** |
| 주입한 것 | 상한 params만 — `sectorCapRatioOfCombatAverage=0.40` · `combatRewardAverageCredits=120` → 파생 cap **48** |
| 지급 결과 | `noReward` 유지 — 임의 보상표·임의 credits·fallback **생성 0** |
| Exit 29(cap 48) | **blocked** — 지급 대상이 0개라 상한 도달을 관측할 수 없다 |
| 소유자 | **기획(금액·산식) + 월드(대상 배치)**. HANDOFF §2가 `combatRewardAverageCredits`를 "산식 필요 — 기획이 산식·값 결정"으로 지정 |
| 결정 필요 | **예** — ① gold/salvage 회수형 interactable을 production에 둘지 ② 대상별 credits 표를 어디에 둘지(`params/economy.json` 확장 vs `src/world/`) |

## 5. DetectionHud

이 PR에서 **제거하지 않았다**(HANDOFF §7 순서). 제거 전제인 Exit 14(소나
provider wired 표시)는 S2에서 확인됐으나, 정보 중복 판정과 제거는 그래픽스
소유 후속 PR 몫이다. `DETECTION_HUD_REMOVED=false`.

## 6. DEV debug handle

- `import.meta.env.DEV` 블록 **내부에서만** 노출 — production 빌드 0
- 신규 fixture command **0** (관측 getter와 기존 `requestActivePing` 위임뿐)
- `fixtureLoaded=false`는 **dev-mode 실제 관측값**
- production-preview harness의 `fixtureState=unknown`은 **그대로 유지** —
  두 관측값은 서로 다른 진입 경로의 값이며 덮어쓰지 않는다
- 기기 식별자·개인정보 **0**

## 7. enforce-exit

```
npm run verify:runtime-closure -- --enforce-exit → exit 1
EXIT_INCOMPLETE 14 · MANUAL_EVIDENCE_MISSING 3 · FIXTURE_STATE_UNKNOWN 2
WIRING 실패 0 · UNWIRED 실패 0 · C1 실패 0 · Q1 실패 0
```

남은 실패는 전부 **실제 미실측 manual evidence · production-preview fixture
판정 불가 · 위 §3 항법 미도달**이며, 배선 누락에서 오는 실패는 하나도 없다.
