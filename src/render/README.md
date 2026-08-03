# src/render — 렌더링 (그래픽스 파트 소유)

이 디렉터리는 **그래픽스 프로그래머(역할 프롬프트: `prompts/GRAPHICS.md`)의 소유 영역**이다.

## 현재 상태 (D+5 통합 + 리뷰 후속 반영)

- `Renderer.ts` — WebGLRenderer + PerspectiveCamera 래퍼 (그림자 비활성, 리사이즈 대응)
- `CanyonScene.ts` — 회색 박스 수중 장면: **공유 CanyonLayout 기반** 협곡
  블록아웃(`src/world/startingCanyonLayout.ts` STARTING_CANYON_LAYOUT —
  렌더 자체 수식 없음, 충돌과 동일 데이터 [INT-CORE-004]) + 잠수함 대체
  오브젝트(캡슐+함교+선미 프로펠러, `conventions.ts` -Z 선수/+Z 선미) +
  기본 수중 포그·배경(수면 위/아래 색·포그 전환 — `layout.seaSurfaceY` 기준) +
  블롭 섀도 + 해수면 + 화물선 + 조명 2개 이내(방향광 1 + 보조 환경광)
- `CameraRig.ts` — 카메라 추적 시각 구조: 선미 뒤쪽 상단에서 선수 방향을
  바라보는 후방 뷰 — 위치 오프셋은 `conventions.cameraRecenterOffsetDirectionXZ`
  (INT-CORE-004, 임의 +π 보정 없음), 시선은 lookAt(잠수함)으로
  `cameraRecenterLookDirectionXZ` 충족. 궤도 오프셋(상하 ±60도), `recenter()`
- `CameraInputAdapter.ts` — 카메라 전용 입력(D+5 통합 결정, 렌더 소유):
  좌클릭 드래그 궤도 회전 + Space 리센터. `GameSystem`으로 등록되며 잠수함
  이동·심도 키와 중복되지 않는다. blur 시 드래그 상태 해제, dispose()에서
  리스너 전부 해제
- `Propeller.ts` — 선미 프로펠러 표현: **정식 signed speed**(포즈 소스
  `speed`)를 `core/conventions.propellerSpinRatio()`에 넣어 회전 비율 산출.
  공회전 비율은 `params/movement.json`의 `propellerIdleSpinRatio`가 유일한
  소스(INT-CORE-002). 최대 각속도(rad/s)·감쇠는 렌더 연출 상수(리드 결정 —
  파라미터화하지 않음)
- `SeaSurface.ts` — 저비용 평면 해수면: 정점 파도 애니메이션, 양면 렌더,
  수중에서 밝은 배경(실루엣 대비). 반사·굴절 없음
- `CargoShipVisual.ts` — 화물선 로우폴리 임시 모델(-Z 선수): 흘수 아래 실루엣.
  **정식 계약 `CargoShipStateSource`(INT-CORE-003)를 `applyState`로 매핑만** —
  이동·왕복·침몰 타이머 없음. `sinkProgress` 0~1 → 기울기·하강 매핑,
  폭발은 `torpedoHit` 이벤트/상태 `hit`로 시작(멱등 — 1회 보장),
  `removed` → `removeAndDispose()`. 상태 공급: 게임플레이 `CargoShipSystem`
- `renderVisualParams.json` — 렌더 표현 계층 전용 외부 설정(해수면 파도·침몰
  연출 시간 등). 게임플레이 밸런스(`params/*.json`, 기획 소유)와 구분.
  프로펠러 공회전 값은 여기서 **제거됨** — movement.json이 단일 소스
- `BlobShadow.ts` — 코드 생성 방사형 그라데이션 텍스처 평면 (실시간 그림자 금지 대응)
- `TorpedoVisuals.ts` — 어뢰 로우폴리 + 기포 항적(풀링·인스턴싱 1드로우).
  `attachTorpedoSource` 주입(INT-RENDER-006 배선 대기) — 판정 없음
- `PeriscopeView.ts` — 어뢰 조준경(5차 결의 3·13차 결의 1): 동일 카메라 +
  원형 마스크(DOM) + FOV 보간 + 십자선·눈금 + **하단 2D 발사관 프레임**
  (관 내부 어둠·관구 림·좌우 관벽 — 마스크와 일체, 십자선·눈금·보조선 뒤
  레이어). `aimModeChanged` 소비만 — 렌더 독자 전환 없음. 관측용 잠망경은
  백로그(구현 금지) — 조준경 명칭은 '어뢰 조준경'
- `LeadShotIndicator.ts` — 조준경 내 리드샷 보조선(요격 지점 링) — 표적
  위치·속도·어뢰 속력의 읽기 전용 소비 표현
- `EnvironmentDressing.ts` — 부활 1호(5차 결의 5): 산호 3종·어군 2종
  (인스턴싱)·침몰선 잔해·원경 실루엣. 연안 한정, 밀도 캡 기록, 보스 전장은
  이 예산 재배분(11차 결의 1)
- `SubmarineVisual.ts` — 잠수함 + 외형 단계 어댑터(선체·주무장 각 3단계,
  visualTier 주입만). 최종 에셋 교체 지점 2함수 격리. **어뢰관 앵커·조준
  카메라 소켓**(13차 결의 2): `torpedoTubeAnchorLocal`(모델 정의 단일 지점)
  + `aimCameraSocket`(앵커 정위치·전방축 -Z 동일 — 소비 측 독자 오프셋 금지)
- 조준 카메라(CanyonScene): 조준 중 `aimCameraSocket` 월드 위치·방향 그대로
  사용(전 심도 동일 — 심도 카메라 전환 없음, 발사 후 유지), 미세 조준각은
  `attachAimAngleSource`(게임플레이 소스, 부재 시 0), 자기 선체는 **layer 1
  마스크로만** 제외(visible·material 전역 변경 금지 — 그림자·수면·타 카메라
  보존), 해제 시 layer 복원 + `CameraRig.beginReturnFrom` 자연 복귀
- `BaseSceneView.ts` — 기지 화면 경량 3D 배경 — 메타 시각 상태 소비 전용
  (상점·구매·저장 판정 없음, INT-RENDER-007 배선 대기)
- `DriftParticles.ts` — 부유물(마린 스노우) — `THREE.Points` 1드로우, 결정적
  분포·카메라 상자 되감기(생성·소멸 0)·코드 생성 도트 텍스처. 수중 전용
  (수면 위 숨김), 판정 무관 순수 연출
- `renderQuality.ts` — 저사양 fallback 사다리(`?quality=low`): 부유물 개수
  축소·림라이트 off·항법등 글로우 off. 값은 `renderVisualParams.json`
  `artDirection.lowSpec` 소유 — 안개·재질 기본색·HUD는 품질 무관 동일
- 아트 디렉션(`renderVisualParams.json artDirection`): 연속 심도 안개
  (수면↔해저 보간 — 전경·중경·후경 명도 분리), HemisphereLight 보조 환경광
  (조명 예산 2등 불변 — AmbientLight 재도입 금지), 벽/바닥/선체 팔레트+미세
  emissive, 프레넬 림라이트(Lambert onBeforeCompile — 추가 광원·드로우 0),
  항법등 가산 글로우(주황 식별색), ACES 톤 매핑(Renderer — 후처리 패스 0).
  실제 스크린 스페이스 bloom은 §12 예산상 미도입(emissive·가산으로 대체)
- `boss/` — 보스 분절 애니 스파이크(강체 5분절 계층 트랜스폼 + 사인파,
  스켈레탈·스키닝·관절 물리 없음, 충돌은 게임플레이 단일 캡슐 전제).
  A안 `SegmentedSwimMotion` / B안 `BossMotionFallback`(기본 비활성) —
  `BossMotionStyle` 경계. 판정 문서: `docs/RENDER_SPIKE_BOSS.md`
- `xray/XrayFloodingSpike.ts` — X-ray 반투명 렌더 기술 스파이크 [보호 목록,
  판정: 성공]. 기본 장면과 분리된 모듈, `?xray` URL 플래그로 장착, 실패 시 격리.
  판정 문서: `docs/RENDER_SPIKE_XRAY.md`

(`BootstrapScene.ts` 별칭은 INT-RENDER-001 승인으로 삭제됨 — core/Game.ts가
`CanyonScene`을 직접 임포트한다.)

### 검증용 URL 플래그 (렌더 QA 전용 — 판정·게임 로직 아님)

- `?xray` — X-ray 스파이크 장착
- `?shipdemo=<0~1>` — 화물선 **고정 상태 스냅샷**(계약 타입 준수, 이동·타이머·
  자동 격침 없음): sinkProgress를 URL 값으로 고정해 침몰 매핑·폭발(값>0)을
  정지 화면으로 검수. 정식 상태 소스가 주입되면 무시된다
- `?lookup` — 카메라를 앙각으로 젖혀 해수면·실루엣 확인
- `?bossSpike=1` — 보스 분절 스파이크 (`&bossMotion=b` = B안, 기본 비활성)
- `?base=1` — 기지 화면 미리보기 (메타 루프 배선 전 QA 경로)
- `?tiers=<hull>,<weapon>` — 외형 단계(각 1~3) 시연 주입
- `?aimdemo=1` — 어뢰 조준경 표시 고정: 조준 시점·선체 레이어 제외·발사관
  프레임을 임의 심도에서 정지 검수 (게임플레이 조준 판정과 무관, 정식
  aimModeChanged 수신 시 그 상태 우선)
- `?econdemo=1` (변형 `?econdemo=savefail`) — 경제·성장 UI QA 데모
  (`src/ui/econUiQaDemo.ts` — 'QA 데모' 배지 표기, 수치는 공식 가격 아님.
  실사용 배선은 INT-RENDER-008)

## 연결 방식 (판정 계산 금지 원칙)

- 잠수함 포즈: `CanyonScene.attachPoseSource()` — **정식 계약
  `SubmarinePoseSource`**(contracts/systems.ts): `positionX/Y/Z`·
  `headingRadians`·`forwardSpeedMetersPerSecond`(전 필드 필수). 주입은
  `Game.composeSystems()` 1회(반영됨). 미주입 시 layout.submarineSpawn 정지 렌더
- 프로펠러 속도: `forwardSpeedMetersPerSecond`만 사용 — 위치 변화 추정 없음,
  A/D 단독 입력 무영향(`conventions.propellerSpinRatio` 시그니처가 강제)
- 카메라 입력: `CameraInputAdapter`(렌더 소유)가 `CameraRig.rotate()/recenter()` 호출
- 화물선: `attachCargoShipSource(gameplay.cargoShip)` — composition root 배선
  요청(INT-RENDER-005, 리드 D6 통합). 미주입 시 화물선을 그리지 않는다
  (렌더가 상태를 지어내지 않음 — `?shipdemo` 스냅샷은 QA 전용)
- torpedoHit 폭발: `attachEventBus(bus)` — composition root 배선 요청
  (INT-RENDER-005). 배선 전에도 상태 `hit` 경로로 폭발이 동작한다(멱등)
- 협곡 배치는 STARTING_CANYON_LAYOUT이 렌더·충돌 단일 소스 —
  게임플레이 `collision/startingArea.ts`의 구 미러 삭제는 게임플레이 적용분
  (리드 INT-CORE-004 적용 요청) 대기

## 여기에 구현될 것 (D6 이후)

- 심도별 그라데이션 포그 (`depthChanged` 구독, D13~14)
- 조준 뷰 카메라 고정 (`aimModeChanged` 구독 — EventBus 배선은 리드 재논의 후)
- 소음 파문 이펙트 [보호 목록] — 인스턴싱 공용 기술 사용 (D10~12)
- X-ray 본 통합 — `floodingChanged` 구독 자동 발동 (D13~14)
- 어뢰 항적 표현 — `torpedo.torpedoes` 읽기 전용 상태 폴링 (D6~D9)
- 모델 임포트 파이프라인 (D+8 산출물)
- 저사양 모드 (희생 순서: ①파티클 ②어군 ③카메라 흔들림 ④포그)

## 규칙

1. 게임 판정 계산(탐지·피해·타이밍·명중·이동)을 여기서 하지 않는다 — 렌더는
   EventBus 이벤트와 시스템의 읽기 전용 상태만 소비한다.
2. 축·방향은 `src/core/conventions.ts`만 참조한다 — 숫자·벡터 복제 금지.
3. 성능 예산(마스터 플랜 §12)을 초과하는 기능 추가 금지: 그림자·반사·굴절 미사용.
4. 계약 변경은 `docs/INTEGRATION_NOTES.md` 절차를 따른다.
