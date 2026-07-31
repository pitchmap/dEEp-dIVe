# src/render — 렌더링 (그래픽스 파트 소유)

이 디렉터리는 **그래픽스 프로그래머(역할 프롬프트: `prompts/GRAPHICS.md`)의 소유 영역**이다.

## 현재 상태 (D3~D5 회색 박스)

- `Renderer.ts` — WebGLRenderer + PerspectiveCamera 래퍼 (그림자 비활성, 리사이즈 대응)
- `CanyonScene.ts` — 회색 박스 수중 장면: 협곡 블록아웃(단위 박스 스케일 재사용,
  결정적 S자 수로, 벽 상단은 해수면 아래) + 잠수함 대체 오브젝트(캡슐+함교+
  선미 프로펠러) + 기본 수중 포그·배경(수면 위/아래 색·포그 전환) + 블롭 섀도 +
  해수면 + 화물선 + 조명 2개 이내(방향광 1 + 보조 환경광)
- `CameraRig.ts` — 카메라 추적 시각 구조: 선미(+Z) 후방 추적, 궤도 오프셋
  (상하 ±60도 제한), `recenter()`. 입력 바인딩은 게임플레이 소유 —
  `rotate()`/`recenter()` 호출만 연결
- `Propeller.ts` — 선미 프로펠러 표현: 실제 전후 속도(포즈 변화에서 파생)로
  정/역회전, 정지 시 최대 회전의 8% 공회전. 수치는 `renderVisualParams.json`
- `SeaSurface.ts` — 저비용 평면 해수면: 정점 파도 애니메이션, 양면 렌더,
  수중에서 밝은 배경(실루엣 대비). 반사·굴절 없음
- `CargoShipVisual.ts` — 화물선 로우폴리 임시 모델(-Z 선수): 흘수 아래 실루엣,
  명중 폭발(자발광 구체)·기울며 침몰·완료 시 리소스 정리. 판정 없음 —
  상태는 `attachCargoShipSource`로 주입 (INTEGRATION_NOTES #003)
- `renderVisualParams.json` — 렌더 표현 계층 전용 외부 설정 (프로펠러 공회전
  비율 등). 게임플레이 밸런스(`params/*.json`, 기획 소유)와 구분
- `BlobShadow.ts` — 코드 생성 방사형 그라데이션 텍스처 평면 (실시간 그림자 금지 대응)
- `xray/XrayFloodingSpike.ts` — X-ray 반투명 렌더 기술 스파이크 [보호 목록].
  기본 장면과 분리된 모듈, `?xray` URL 플래그로 장착, 실패 시 격리.
  판정 문서: `docs/RENDER_SPIKE_XRAY.md`
- `BootstrapScene.ts` — CanyonScene 별칭 재수출 (core/Game.ts가 이 이름을
  임포트하기 때문 — 임포트 정리는 INTEGRATION_NOTES #002)

### 검증용 URL 플래그 (렌더 QA 전용 — 판정·게임 로직 아님)

- `?xray` — X-ray 스파이크 장착
- `?shipdemo` — 화물선 왕복 항해 + 15초 후 격침 연출 시연
- `?lookup` — 카메라를 앙각으로 젖혀 해수면·실루엣 확인

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
