# D+10 통합 테스트 체크리스트

> 대상: D+5 리뷰 스프린트 산출물의 dev 통합 빌드 (리드 `c4841cf` +
> 게임플레이 `c46c937` + 그래픽 `c091f30` + 툴링 최신 커밋).
> 통합 담당이 병합·배선 후 전 항목을 실행하고 결과를
> `docs/CURRENT_STATUS.md`에 기록한다. 실패 항목은 원인 커밋을 특정해
> 소유 파트에 반려한다 (prompts/INTEGRATION_REVIEW.md).

> **✅ D+10 통합 실행 결과 (통합 브랜치 `claude/deep-dive-bootstrap-6wrpuw`):**
> 전 항목 실행 완료 — 정적 검사·결정적 75/75·Chromium 실입력 50항목 PASS.
> 예외(실기기 수동 확인): 실물 Esc 키(자동화는 exitPointerLock 동일 경로),
> 내장그래픽 60fps(G1 — 게이트 리뷰 실기기 항목), Pages 배포 URL(관리자 설정).
> HUD 헤드리스 33/33은 툴링 `a7c3cdf` 기록 인용 — 러너 미포함으로 본 통합은
> Chromium 실입력(버튼·마우스 실발사/재장전·잔탄 동등/중복 발사 없음)으로 동등 검증.
> 상세: `docs/CURRENT_STATUS.md` 'D+10 통합 검증 결과'.

## 1. 병합·배선 절차

- [x] 병합 순서: 리드(`c4841cf`) → 게임플레이(`c46c937`) → 그래픽(`c091f30`) → 툴링(최신) — 계약 생산 → 소비 순서
- [x] docs 충돌(CURRENT_STATUS·INTEGRATION_NOTES)은 전 항목 보존·역할 ID 유지
- [x] composition root 배선: HUD `{aim, torpedo}`·`bus` 주입 (INT-TOOL-004 코드 예시 채택)
- [x] composition root 배선: `scene.attachCargoShipSource(gameplay.cargoShipState)` + `scene.attachEventBus(bus)` (INT-RENDER-005)
- [x] `SystemRegistry` 등록 순서 = 입력·조작(gameplay) → 카메라 입력 → (표현·계측), 시스템 중복 생성 없음
- [x] 각 병합 단계마다: `npm ci` · `npm run typecheck` · `npm run build` · `npm run check:size`

## 2. 자동 검증

- [x] 게임플레이 결정적 검증 `node src/systems/__verification__/run.mjs` — **75/75** (레이아웃 정합 4항목 포함)
- [x] HUD 헤드리스 검증(툴링) — **33/33** (버튼·마우스 실발사, 재장전·잔탄 동등, 중복 발사 없음)
- [x] `npm run check:size` — dist 15MB 이하 (직전 기준 ~3.7%)
- [x] 콘솔 오류 0건 (기본 장면·`?xray=1` 각각)

## 3. 브라우저 수동/자동화 검증 — 조작·이동

- [x] W 전진 / S **후진** (후진 최고 속력 = 전진의 50%, 관성 감속)
- [x] A/D 선회 (잠수함 기준, 정지 상태 제자리 선회 포함)
- [x] Shift 연속 상승 / Ctrl 연속 하강 (키 해제 시 관성 감속)
- [x] 수면 상한(해수면 − 선체 반경)·해저 하한 이탈 불가, 수면 돌출 없음
- [x] 심도 3구간 판정 — 잠망경/순항/심해 `depthChanged` 정상 (정확히 3구간)
- [x] 협곡 벽·기둥 충돌 시 통과 없이 밀어내기 정지, 끼임·떨림 없음
- [x] **렌더-충돌 정합**: 보이는 벽 = 막히는 벽 (공유 STARTING_CANYON_LAYOUT — '보이지 않는 벽' 없음, 능선 위 개방 수역은 허용 사양)
- [x] 창 포커스 상실(blur)·탭 전환 후 키 고착 없음

## 4. 카메라·표현

- [x] 마우스 카메라 회전, 상하 ±60도 제한
- [x] Space 리센터 = **선미 후방 상단 → 선수 방향** (프로펠러가 카메라 가까운 쪽, W 전진 시 잠수함이 화면 안쪽으로 진행)
- [x] 프로펠러: 전진 정회전 / 후진 역회전 (signed speed 연동)
- [x] 프로펠러: 정지 시 8% 공회전 (`propellerIdleSpinRatio` — movement.json 값 변경 시 HMR 반영)
- [x] 프로펠러: **A/D 단독 입력 시 회전 변화 없음** (공회전 유지)
- [x] 해수면 표시 — 수면 위/아래 배경·포그 전환, 수중에서 수면·화물선 실루엣 시인
- [x] 잠수함 상승·하강이 화면에 반영 (positionY 소비), 블롭 섀도 해저 투영 유지

## 5. 전투·화물선

- [x] 우클릭 홀드 조준 — **전 심도에서 (구 심도 제한 규칙 폐기)** 진입, 심도 이탈 시 자동 해제
- [x] 좌클릭 발사 — 클릭 1회 = 어뢰 1발, 연타 중복 발사 없음
- [x] PC 화면 조준·발사 버튼 — 마우스와 **동일 인스턴스·동등 판정** (재장전·잔량 공유), 이중 발사 없음
- [x] 직선 어뢰 — 선수(-Z) 발사, 수평 직선 주행, 최대 사거리 초과 시 제거, 환경(벽) 명중 시 소멸
- [x] 화물선 직선 왕복 항행 (해수면 흘수선 유지, 끝점 반전)
- [x] 명중 시 `torpedoHit` 정확히 1회 → 렌더 폭발 발동(멱등), 추가 어뢰로 중복 침몰 없음
- [x] `sinkProgress` 기반 기울며 침몰 → 완료 시 `removed` → 렌더 오브젝트 제거·dispose
- [x] 어뢰 잔량·재장전 표시(HUD) = combat.json 값과 일치, 잔탄 0·재장전 중 발사 불가

## 6. 툴링·계측·HMR

- [x] 조작 안내 패널 표시, H 토글로 화면 버튼과 함께 숨김·복원
- [x] Pointer Lock: 캔버스 클릭 진입(발사 아님), Esc 해제 → 일시정지 + 재진입 안내, 진입 직후 250ms 입력 무시 (⚠ 실물 Esc 키만 실기기 수동 확인 — 자동화는 exitPointerLock 동일 경로)
- [x] 일시정지(잠금 해제) 시 조준 자동 해제(`endAim`) — 조준 고착 없음
- [x] 우클릭 컨텍스트 메뉴 미표시 (게임 중)
- [x] 입력 계측: 마우스/버튼별 조준·발사 횟수·첫 발사 시각이 게이트 기록 JSON `input` 구역에 기록
- [x] FPS·로딩 계측·FPS 시계열(fpsSamples) 작동
- [x] params/*.json (ui.json 포함) HMR — 유효 값 즉시 반영, 범위 밖 값 거부·기존 값 유지
- [x] `?xray=1` 스파이크 표시 — 반투명 선체 수위 판독, 기본 장면과 실패 격리

## 7. 회귀·기록

- [x] D+5 검증 통과 항목 재확인 (X-ray·오버레이·리사이즈)
- [x] R7 임시값 잔존 목록 기록 (provisionalCombat·provisionalCargo·심도 구간 경계 — 게이트 데이터에 '임시 초기 테스트값' 표기)
- [x] 결과를 CURRENT_STATUS '통합 검증 결과' 구역에 기록, 스크린샷 보관
- [x] DECISIONS.md·NEXT_SPRINT §5 각주 반영 여부 확인 (리드)
