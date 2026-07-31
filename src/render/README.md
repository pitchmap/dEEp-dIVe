# src/render — 렌더링 (그래픽스 파트 소유)

이 디렉터리는 **그래픽스 프로그래머(역할 프롬프트: `prompts/GRAPHICS.md`)의 소유 영역**이다.

## 현재 상태 (D3~D5 회색 박스)

- `Renderer.ts` — WebGLRenderer + PerspectiveCamera 래퍼 (그림자 비활성, 리사이즈 대응)
- `CanyonScene.ts` — 회색 박스 수중 장면: 협곡 블록아웃(단위 박스 스케일 재사용,
  결정적 S자 수로) + 잠수함 대체 오브젝트(캡슐+함교) + 기본 수중 포그·배경 +
  블롭 섀도 + 조명 2개 이내(방향광 1 + 보조 환경광)
- `CameraRig.ts` — 카메라 추적 시각 구조: 후방 추적, 궤도 오프셋(상하 ±60도 제한),
  `recenter()`. 입력 바인딩은 게임플레이 소유 — `rotate()`/`recenter()` 호출만 연결
- `BlobShadow.ts` — 코드 생성 방사형 그라데이션 텍스처 평면 (실시간 그림자 금지 대응)
- `xray/XrayFloodingSpike.ts` — X-ray 반투명 렌더 기술 스파이크 [보호 목록].
  기본 장면과 분리된 모듈, `?xray` URL 플래그로 장착, 실패 시 격리.
  판정 문서: `docs/RENDER_SPIKE_XRAY.md`
- `BootstrapScene.ts` — CanyonScene 별칭 재수출 (core/Game.ts가 이 이름을
  임포트하기 때문 — 임포트 정리는 INTEGRATION_NOTES #002)

## 연결 방식 (판정 계산 금지 원칙)

- 잠수함 위치·방향: `CanyonScene.attachPoseSource()`로 게임플레이의 읽기 전용
  상태(`PlayerController` 계약 부분집합)를 주입받아 소비만 한다. 미주입 시
  원점 정지 렌더. 연결 요청: INTEGRATION_NOTES #002
- 카메라 입력: 게임플레이 측이 `CanyonScene.cameraRig`의 `rotate()`/`recenter()`를
  호출한다 (§5.2 구현 소유 경계 유지)
- 협곡 임시 배치는 파이프라인 검증용 — 정식 블록아웃(엄폐 3곳+)은 레벨
  디자인 산출물(D+5) 수신 후 교체

## 여기에 구현될 것 (D6 이후)

- 물 정점 애니메이션·심도별 그라데이션 포그 (`depthChanged` 구독, D13~14)
- 소음 파문 이펙트 [보호 목록] — 인스턴싱 공용 기술 사용 (D10~12)
- X-ray 본 통합 — `floodingChanged` 구독 자동 발동 (D13~14)
- 모델 임포트 파이프라인 (D+8 산출물)
- 저사양 모드 (희생 순서: ①파티클 ②어군 ③카메라 흔들림 ④포그)

## 규칙

1. 게임 판정 계산(탐지·피해·타이밍)을 여기서 하지 않는다 — 렌더는
   EventBus 이벤트와 시스템의 읽기 전용 상태만 소비한다.
2. 성능 예산(마스터 플랜 §12)을 초과하는 기능 추가 금지: 그림자·반사·굴절 미사용.
3. 계약 변경은 `docs/INTEGRATION_NOTES.md` 절차를 따른다.
