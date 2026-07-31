# src/render — 렌더링 (그래픽스 파트 소유)

이 디렉터리는 **그래픽스 프로그래머(역할 프롬프트: `prompts/GRAPHICS.md`)의 소유 영역**이다.

## 현재 상태 (D+5 통합 + 리뷰 후속 반영)

- `Renderer.ts` — WebGLRenderer + PerspectiveCamera 래퍼 (그림자 비활성, 리사이즈 대응)
- `CanyonScene.ts` — 회색 박스 수중 장면: 협곡 블록아웃(단위 박스 스케일 재사용,
  결정적 S자 수로, 벽 상단은 해수면 아래 — 충돌 미러와의 차이는 INT-RENDER-004
  보고 참조) + 잠수함 대체 오브젝트(캡슐+함교+선미 프로펠러, `conventions.ts`
  -Z 선수/+Z 선미) + 기본 수중 포그·배경(수면 위/아래 색·포그 전환) +
  블롭 섀도 + 해수면 + 화물선 + 조명 2개 이내(방향광 1 + 보조 환경광)
- `CameraRig.ts` — 카메라 추적 시각 구조: 선미 뒤쪽 상단에서 선수 방향을
  바라보는 후방 뷰(`conventions.cameraRecenterYawRadians` 기준), 궤도 오프셋
  (상하 ±60도 제한), `recenter()`
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
- `CargoShipVisual.ts` — 화물선 로우폴리 임시 모델(-Z 선수): 흘수 아래 실루엣,
  명중 폭발(자발광 구체)·기울며 침몰·완료 시 리소스 정리. 판정·이동 로직
  없음 — 상태는 `attachCargoShipSource`로 주입. 정식 CargoShipSystem은
  게임플레이 D6~D9 예정 (INT-RENDER-003·INT-GAME-006 참조)
- `renderVisualParams.json` — 렌더 표현 계층 전용 외부 설정(해수면 파도·침몰
  연출 시간 등). 게임플레이 밸런스(`params/*.json`, 기획 소유)와 구분.
  프로펠러 공회전 값은 여기서 **제거됨** — movement.json이 단일 소스
- `BlobShadow.ts` — 코드 생성 방사형 그라데이션 텍스처 평면 (실시간 그림자 금지 대응)
- `xray/XrayFloodingSpike.ts` — X-ray 반투명 렌더 기술 스파이크 [보호 목록,
  판정: 성공]. 기본 장면과 분리된 모듈, `?xray` URL 플래그로 장착, 실패 시 격리.
  판정 문서: `docs/RENDER_SPIKE_XRAY.md`

(`BootstrapScene.ts` 별칭은 INT-RENDER-001 승인으로 삭제됨 — core/Game.ts가
`CanyonScene`을 직접 임포트한다.)

### 검증용 URL 플래그 (렌더 QA 전용 — 판정·게임 로직 아님)

- `?xray` — X-ray 스파이크 장착
- `?shipdemo` — 화물선 **침몰 연출 미리보기**(15초 후 1회 발동). 이동·판정
  구동은 없음 — 실제 발동은 정식 화물선 상태/이벤트로만 (INT-RENDER-003)
- `?lookup` — 카메라를 앙각으로 젖혀 해수면·실루엣 확인

## 연결 방식 (판정 계산 금지 원칙)

- 잠수함 포즈: `CanyonScene.attachPoseSource()` — `PlayerController` 계약의
  `positionX/Z`·`headingRadians`·**signed `speed`** + 확장 상태 `positionY`
  (INT-GAME-004 계약 반영 대기 — 반영 전까지 선택 필드로 소비, 미제공 시
  기존 고정 높이 렌더). 주입은 `Game.composeSystems()`(composition root) 1회
- 프로펠러 속도: 포즈 소스의 signed speed만 사용 — 위치 변화 추정 없음,
  A/D 단독 입력 무영향(`propellerSpinRatio` 시그니처가 강제)
- 카메라 입력: `CameraInputAdapter`(렌더 소유)가 `CameraRig.rotate()/recenter()` 호출
- 화물선: `attachCargoShipSource()` 주입 대기 — 정식 시스템(D6~D9) 등장 시
  composition root에서 연결. 미주입 시 정지 표적 렌더
- 협곡 임시 배치는 파이프라인 검증용 — 정식 블록아웃(엄폐 3곳+)은 레벨
  디자인 산출물 수신 후 교체. 충돌 미러(`src/systems/collision/startingArea.ts`)
  와의 현재 차이는 INT-RENDER-004에 보고됨 (단일 소스화 = INT-GAME-005)

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
