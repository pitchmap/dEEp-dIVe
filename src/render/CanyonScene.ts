/**
 * 회색 박스 수중 장면 (D+10 프로토타입 + 5차 결의 시각·PvE 성장 루프 렌더).
 *
 * 포함: 공유 CanyonLayout 기반 협곡 블록아웃 / 잠수함(SubmarineVisual —
 * 외형 단계 어댑터 + 선미 프로펠러) / 카메라 추적·리센터(CameraRig) / 기본
 * 수중 포그·배경(수면 위/아래 전환) / 해수면(정점 파도) / 블롭 섀도 /
 * 화물선(계약 상태 매핑) / 어뢰 가시화·기포 항적(TorpedoVisuals) /
 * 조준경(PeriscopeView — aimModeChanged 소비) + 리드샷 보조선 /
 * 환경 배치(EnvironmentDressing — 부활 1호) / QA 격리 경로: ?xray ·
 * ?bossSpike=1(보스 분절 스파이크) · ?base=1(기지 화면 미리보기).
 *
 * 성능 예산 (§12 [확정]): 실시간 조명 2개 이내(방향광 1 + 보조 환경광),
 * 실시간 그림자 미사용(블롭 섀도만), 반사·굴절 미사용.
 *
 * 경계 (prompts/GRAPHICS.md — 판정·이동 계산 금지):
 *  - 잠수함 포즈: 계약 `SubmarinePoseSource`(contracts/systems.ts)를
 *    attachPoseSource로 주입받아 소비만 한다. 속도는
 *    forwardSpeedMetersPerSecond 하나 — 위치 차분 재계산 금지 [INT-CORE-003].
 *  - 화물선: 계약 `CargoShipStateSource`를 attachCargoShipSource로 주입받아
 *    상태를 매핑만 한다. 이동·왕복·침몰 타이머를 렌더에서 만들지 않는다.
 *  - 협곡 배치: 공유 CanyonLayout(기본: src/world/startingCanyonLayout —
 *    충돌과 동일 데이터)만 사용한다. 렌더 자체 수식·블록 배열 금지
 *    [INT-CORE-004].
 */

import * as THREE from 'three';
import visualParams from './renderVisualParams.json';
import { loadParams, onParamsReloaded } from '../config/ParamLoader';
import type { GameEvents } from '../contracts/events';
import type { CanyonLayout } from '../contracts/layout';
import type { MovementParams } from '../contracts/params';
import type {
  CargoShipStateSource,
  SubmarinePoseSource,
  TorpedoTubeSocketSource,
} from '../contracts/systems';
import { meshYawRadians } from '../core/conventions';
import type { EventBus, Unsubscribe } from '../core/EventBus';
import type { ManagedScene } from '../core/SceneManager';
import { STARTING_CANYON_LAYOUT } from '../world/startingCanyonLayout';
import type { Renderer } from './Renderer';
import { BaseSceneView } from './BaseSceneView';
import { BlobShadow } from './BlobShadow';
import { BossSegmentSpike } from './boss/BossSegmentSpike';
import { BossMotionFallback } from './boss/BossMotionFallback';
import { SegmentedSwimMotion } from './boss/SegmentedSwimMotion';
import type { BossMotionStyle } from './boss/BossMotionStyle';
import { CameraRig } from './CameraRig';
import { CargoShipVisual } from './CargoShipVisual';
import type { ShipWorldSource, ShipWorldView } from '../systems/faction/ShipWorldSource';
import { EnvironmentDressing } from './EnvironmentDressing';
import { LeadShotIndicator } from './LeadShotIndicator';
import { PeriscopeView } from './PeriscopeView';
import { Propeller } from './Propeller';
import { SeaSurface } from './SeaSurface';
import type { ConvoyPositionSource, ConvoySource } from './ConvoyVisuals';
import { ConvoyVisuals } from './ConvoyVisuals';
import type { GuardSightingSource } from './GuardDirectionIndicator';
import { GuardDirectionIndicator } from './GuardDirectionIndicator';
import type { IdentificationExposureSink } from './IdentificationTags';
import { IdentificationTags } from './IdentificationTags';
import type { ShipIdentificationSource } from '../contracts/identification';
import type { SalvageStateSource } from './SalvageVisuals';
import { SalvageVisuals } from './SalvageVisuals';
import { ClueMarkerVisuals } from './ClueMarkerVisuals';
import { BOSS_PLACEMENT } from '../world/bossPlacement';
import { DriftParticles } from './DriftParticles';
import { PropellerWake } from './PropellerWake';
import { buildRockShellGeometry, buildSeabedGeometry } from './RockShell';
import { parseRenderQuality, type RenderQuality } from './renderQuality';
import { initSceneTextures, onSceneTexture } from './sceneTextures';
import { SonarScope, type SonarScopeSource } from './SonarScope';
import type { BossCoreView } from '../contracts/boss';
import { SubmarineVisual } from './SubmarineVisual';
import type { TorpedoStateSource } from './TorpedoVisuals';
import { TorpedoVisuals } from './TorpedoVisuals';
import { XrayFloodingSpike } from './xray/XrayFloodingSpike';
import { EconomyUiQaDemo, parseEconDemoFlag } from '../ui/econUiQaDemo';
import {
  createSprintBFixture,
  parseSprintBFixtureFlag,
  type SprintBFixture,
} from './sprintBRenderFixture';
import { SprintCUiFixture, parseSprintCFixtureFlag } from '../ui/sprintCUiFixture';

/**
 * 수중 배경·포그·조명 — 아트 디렉션 심도 그레이딩
 * (renderVisualParams.json artDirection.depthGrading).
 * '밝음(수면)→어둠(심해)' 공식 문법(§3.1)을 **구간 stops의 연속 보간**으로
 * 구현한다: 수면(0~20%)·중간(20~55%)·심해(55~85%)·최심부(85~100%)는 렌더
 * 표현 전용 구간이며(게임플레이 심도 층 3층 계약과 무관), stops 사이가
 * 선형 보간이라 경계에서 색이 급변하지 않는다. 완전 검정은 틈·최원경
 * 안개 끝에서만 나타난다.
 */
const ART = visualParams.artDirection;
const GRADING_STOPS = ART.depthGrading.stops.map((stop) => ({
  at: stop.at,
  color: new THREE.Color(stop.color),
  near: stop.near,
  far: stop.far,
  sunScale: stop.sunScale,
  hemiScale: stop.hemiScale,
  driftScale: stop.driftScale,
}));

/** 수면 위 배경·포그 — 수면 위 끝단 (§3.1). 아트 패스 대상 아님 — 기존 유지 */
const SKY_COLOR = 0x9cc4d4;
const ABOVE_FOG_NEAR = 60;
const ABOVE_FOG_FAR = 280;

/** 포즈 미주입 시 기본 수직 위치 — 스폰 관례(y=0, 순항 구간)와 동일 */
const DEFAULT_SUBMARINE_Y = 0;

/** 조준 카메라 lookAt 재사용 벡터 (프레임당 할당 방지) */
const AIM_LOOK_TARGET = new THREE.Vector3();
/** 프로펠러 wake 재사용 벡터 (프레임당 할당 방지) */
const WAKE_ORIGIN = new THREE.Vector3();
const WAKE_DIRECTION = new THREE.Vector3();

/**
 * 자기 선체 전용 렌더 레이어 (13차 결의 3) — 조준 카메라에서 **레이어
 * 마스크로만** 자기 선체를 제외한다. 객체 visible·material 전역 변경 금지:
 * 블롭 섀도·수면·타 카메라(QA·기지 뷰)에는 선체가 그대로 남는다.
 */
const SELF_HULL_LAYER = 1;

/**
 * 미세 조준 각 소스 — 게임플레이 소유 상태의 구조적 소비 인터페이스
 * (13차 결의 4: aiming.json 한계각·감도·복귀는 게임플레이가 판정).
 * 렌더는 결과 각도만 소비하며, 소스 부재 시 0(정면)으로 취급한다.
 * 정식 계약 이관은 INT-RENDER-008 요청.
 */
export interface AimAngleSource {
  /** 소켓 전방축 기준 미세 yaw (rad) — 게임플레이 한계각 적용 후 값 */
  readonly yawRadians: number;
  /** 소켓 전방축 기준 미세 pitch (rad, 양수 = 위) */
  readonly pitchRadians: number;
}

export class CanyonScene implements ManagedScene {
  private readonly scene = new THREE.Scene();
  private readonly layout: CanyonLayout;
  private readonly rig: CameraRig;
  private readonly blobShadow: BlobShadow;
  /** 저사양 fallback 사다리 (?quality=low) — 연출 단계 축소만 담당 */
  private readonly quality: RenderQuality;
  private readonly submarine: SubmarineVisual;
  /** 부유물 파티클 — Points 1드로우, 개수는 quality가 결정 (0이면 미장착) */
  private readonly drift: DriftParticles;
  /** 프로펠러 기포·수류 — InstancedMesh 풀 1드로우, 속도 연동 */
  private readonly propWake: PropellerWake;
  private readonly propeller: Propeller;
  /** 심도 그레이딩 대상 조명 — 기본 강도 × 심도 배율로 매 프레임 조정 */
  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly seaSurface: SeaSurface;
  private readonly torpedoVisuals = new TorpedoVisuals();
  private readonly leadIndicator = new LeadShotIndicator();
  private readonly salvageVisuals = new SalvageVisuals();
  /** 단서 표식 — 배치 데이터 표현 전용 (회수 반영은 interactionCollected 통지) */
  private readonly clueMarkers = new ClueMarkerVisuals();
  private readonly environment: EnvironmentDressing;
  private periscope: PeriscopeView | null = null;
  /** 소나 스코프 — 계기 층 다이제틱 HUD (판정 소비만, SonarScope 참조) */
  private readonly sonarScope: SonarScope;
  // 스프린트 B 표현 — 전부 계약 read model 소비 (판정·스폰 실행 없음)
  private identificationTags: IdentificationTags | null = null;
  private convoyVisuals: ConvoyVisuals | null = null;
  private guardDirection: GuardDirectionIndicator | null = null;
  private identificationSource: ShipIdentificationSource | null = null;
  private convoySource: ConvoySource | null = null;
  private guardSightingSource: GuardSightingSource | null = null;
  private exposureSink: IdentificationExposureSink | null = null;
  private readonly disposables: Array<{ dispose(): void }> = [];

  private poseSource: SubmarinePoseSource | null = null;
  private cargoShipSource: CargoShipStateSource | null = null;
  private torpedoSource: TorpedoStateSource | null = null;
  /**
   * ⚠ 미세각 소스는 더 이상 조준 카메라 계산에 쓰이지 않는다 — 각도는 공식
   * 소켓 rig가 이미 반영한다(스프린트 A 정규화: 렌더 자체 각도 계산 금지).
   * 주입은 QA 호환을 위해 받아만 두고 소비하지 않는다.
   */
  private aimAngleSource: AimAngleSource | null = null;
  /**
   * 공식 발사관 소켓 rig (리드 `TorpedoTubeSocketSource`) — composition root가
   * 게임플레이·렌더에 **같은 인스턴스**를 주입한다. 조준 카메라는 이
   * 소켓의 월드 포즈만 소비하며 자체 앵커·오프셋·각도를 계산하지 않는다.
   */
  private torpedoTubeSocketSource: TorpedoTubeSocketSource | null = null;
  private cargoShip: CargoShipVisual | null = null;
  /**
   * 다중 선박 read source (B1·B5) — 적대·중립 화물선과 경비함이 한 목록으로
   * 온다. 주입되면 단일 화물선 경로(`cargoShipSource`)를 **대체**한다:
   * 같은 개체가 두 경로로 그려지지 않게 하기 위한 것이며, 렌더는 목록에
   * 있는 것만 그린다 (없는 배를 지어내지 않는다).
   */
  private shipWorldSource: ShipWorldSource | null = null;
  /** entityId → 시각 인스턴스 (다중 선박 경로 전용) */
  private readonly shipVisuals = new Map<number, CargoShipVisual>();
  private xraySpike: XrayFloodingSpike | null = null;

  // QA 격리 경로 — 기지 화면 미리보기(?base=1)·보스 분절 스파이크(?bossSpike=1)
  private baseView: BaseSceneView | null = null;
  private bossSpike: BossSegmentSpike | null = null;
  /** 보스 정본 읽기 모델 폴링 소스 — production 조립부 주입 (미주입 = autoDemo/이벤트만) */
  private bossViewSource: { coreView(): BossCoreView | null } | null = null;
  // 경제·성장 UI QA 데모(?econdemo=1) — 실사용 배선 아님 (배지로 구분)
  private econDemo: EconomyUiQaDemo | null = null;
  // 스프린트 B 표시 규칙 UI 단위 검증 fixture(?bdemo=1) — production 아님
  private bFixture: SprintBFixture | null = null;
  // 스프린트 C HUD 표시 규칙 fixture(?cdemo=1) — production 아님
  private cFixture: SprintCUiFixture | null = null;
  /**
   * `?bdemo` 검수 중에는 fixture 표본이 우선한다 — 이후 조립부의 production
   * 주입(현재 식별·호위는 미구현, 경비는 빈 목록)이 표본을 덮어쓰지 않게
   * 한다. **플래그가 없으면 항상 false**라 production 경로는 영향이 없다.
   */
  private bFixtureOverrides = false;
  private bossShakeIntensity = 0;
  private elapsed = 0;

  // 검증 완료된 이동 파라미터 — 프로펠러(공회전 비율·최고 속력)의 소스.
  // 핫리로드 통지로 유효한 새 값만 교체된다 (JSON 역기록 없음).
  private movementParams: MovementParams;
  private unsubscribeParamsReload: (() => void) | null = null;

  // torpedoHit 구독 (폭발 연출 시작 신호 — 침몰 시간축은 상태 소스 소유)
  private unsubscribeTorpedoHit: Unsubscribe | null = null;
  // aimModeChanged 구독 — 조준경 표현은 게임플레이 상태만 소비 (5차 결의 3)
  private unsubscribeAimMode: Unsubscribe | null = null;
  // floodingChanged 구독 — X-ray 침수 표시 구동 (C5, severity 매핑만)
  private unsubscribeFlooding: Unsubscribe | null = null;
  // 보스 통지 이벤트 구독 (phase·weakPoint·defeated — 표현 매핑만)
  private readonly unsubscribeBossEvents: Unsubscribe[] = [];
  /** 침수 X-ray 인스턴스 — severity > 0 최초 수신 시 잠수함에 지연 장착 */
  private floodingXray: XrayFloodingSpike | null = null;

  // 수면 위/아래 포그 전환 상태
  private cameraAboveSurface = false;

  // ?shipdemo — 순수 렌더 QA용 '고정 상태 스냅샷' (이동·타이머·판정 없음).
  // 실제 게임 상태 소스가 주입되면 스냅샷은 무시된다.
  private readonly shipDemoSnapshot: CargoShipStateSource | null;

  constructor(
    private readonly renderer: Renderer,
    layout: CanyonLayout = STARTING_CANYON_LAYOUT,
  ) {
    this.layout = layout;

    // 검증 완료 파라미터 소비 (Game.start에서 이미 로드·검증됨 — 캐시 반환).
    // JSON → 렌더 단방향. 개발 모드 핫리로드는 유효 값 교체 통지만 받는다.
    this.movementParams = loadParams().movement;
    this.unsubscribeParamsReload = onParamsReloaded((params) => {
      this.movementParams = params.movement;
    });

    const surfaceStop = GRADING_STOPS[0]!;
    this.scene.background = new THREE.Color(surfaceStop.color);
    this.scene.fog = new THREE.Fog(surfaceStop.color.getHex(), surfaceStop.near, surfaceStop.far);

    // 조명 예산 [확정 §12.2]: 실시간 조명 최대 2개 — 태양 방향광 1 + 선수
    // 탐조등 SpotLight 1(예약 슬롯 사용, 그림자 없음 — SubmarineVisual 장착).
    // 보조 환경광(HemisphereLight)은 기존 회계대로 예산 외 보조 베이스다.
    // 기본 강도는 심도 그레이딩이 매 프레임 배율 조정한다 (심해 감광).
    this.sunLight = new THREE.DirectionalLight(ART.lights.sunColor, ART.lights.sunIntensity);
    this.sunLight.position.set(4, 12, 3);
    this.scene.add(this.sunLight);
    this.hemiLight = new THREE.HemisphereLight(
      ART.lights.skyColor,
      ART.lights.groundColor,
      ART.lights.hemisphereIntensity,
    );
    this.scene.add(this.hemiLight);

    this.quality = parseRenderQuality(window.location.search);
    if (this.quality.tier !== 'medium') {
      console.info(`[CanyonScene] 품질 단계 ${this.quality.tier} (?quality=${this.quality.tier}).`);
    }
    // base color 텍스처 로딩 시작 (멱등) — 실패 시 아래 단색 재질이 그대로 유지된다
    initSceneTextures(this.renderer.webgl.capabilities.getMaxAnisotropy());
    // `?headlight=0` — 탐조등 렌더 QA 토글 (기본 켜짐, 게임 규칙 아님)
    const headlightEnabled =
      new URLSearchParams(window.location.search).get('headlight') !== '0';
    this.submarine = new SubmarineVisual({
      rimEnabled: this.quality.rimEnabled,
      navGlowEnabled: this.quality.navGlowEnabled,
      headlightEnabled,
      headlightBeamsEnabled: this.quality.headlightBeamsEnabled,
    });
    this.propeller = new Propeller(this.quality.propDiscBlurEnabled);
    this.drift = new DriftParticles(this.quality.driftCount);
    this.scene.add(this.drift.points);
    this.propWake = new PropellerWake(this.quality.wakeMaxBubbles, this.quality.wakeLifeScale);
    this.scene.add(this.propWake.mesh);

    this.buildCanyonFromLayout();
    this.mountSubmarine();

    // 자기 선체(프로펠러·조준 소켓 포함 서브트리)를 전용 레이어에만 둔다.
    // 3인칭 카메라는 이 레이어를 켠 채 시작 — 조준 중에만 끈다 (13차 결의 3).
    this.submarine.root.traverse((node) => node.layers.set(SELF_HULL_LAYER));
    // 탐조등 실광원은 전 레이어 활성 — 조준 카메라(레이어 1 제외)에서도
    // 조명은 유지된다 (렌즈·빔 콘 시각물은 자기 선체와 함께 제외 — 의도).
    this.submarine.headlight?.layers.enableAll();
    this.renderer.camera.layers.enable(SELF_HULL_LAYER);

    this.blobShadow = new BlobShadow(this.layout.floorY);
    this.scene.add(this.blobShadow.mesh);

    this.seaSurface = new SeaSurface(this.layout.seaSurfaceY);
    this.scene.add(this.seaSurface.mesh);

    this.environment = new EnvironmentDressing(this.layout);
    this.scene.add(this.environment.root);
    this.scene.add(this.torpedoVisuals.root);
    this.scene.add(this.leadIndicator.root);
    this.scene.add(this.salvageVisuals.root);
    this.scene.add(this.clueMarkers.root);

    this.rig = new CameraRig(this.renderer.camera);
    // 렌더 검증용: ?lookup 플래그 시 카메라를 아래로 내려 해수면·실루엣 확인
    if (new URLSearchParams(window.location.search).has('lookup')) {
      this.rig.rotate(0, -0.62); // 잠수함 아래에서 올려다보는 앙각
    }

    this.sonarScope = new SonarScope(
      this.renderer.webgl.domElement.parentElement ?? document.body,
    );

    this.shipDemoSnapshot = this.parseShipDemoSnapshot();
    this.mountSonarDemoIfRequested();
    this.mountXraySpikeIfRequested();
    this.mountBossSpikeIfRequested();
    this.mountBaseViewIfRequested();
    this.mountEconDemoIfRequested();
    this.mountSprintBFixtureIfRequested();
    if (parseSprintCFixtureFlag(window.location.search)) {
      const host = this.renderer.webgl.domElement.parentElement ?? document.body;
      this.cFixture = new SprintCUiFixture(host);
      console.info('[CanyonScene] 스프린트 C fixture 장착 (?cdemo=1 — UI 단위 검증 전용).');
    }

    // `?aimdemo=1` — 어뢰 조준경 **표시 고정** QA 플래그: 조준경·조준 카메라·
    // 선체 레이어 제외를 임의 심도에서 정지 검수한다. 게임플레이 조준 판정
    // (전 심도 진입 — 창2 작업)과 무관한 렌더 검수 전용이며, 정식
    // aimModeChanged 이벤트가 오면 그 상태가 우선한다 (?shipdemo 관례).
    if (new URLSearchParams(window.location.search).get('aimdemo') === '1') {
      this.ensurePeriscope().setAiming(true);
      this.ensureBOverlays();
      this.identificationTags?.setAiming(true);
      this.convoyVisuals?.setAiming(true);
      this.setAimCameraActive(true);
      console.info('[CanyonScene] 조준경 표시 고정 (?aimdemo=1 — 렌더 QA 전용).');
    }
  }

  /**
   * 경제·성장 UI QA 데모 — `?econdemo=1` (저장 실패 변형: `?econdemo=savefail`).
   * 실사용 UI(실제 MetaLoop·EquipmentSystem 배선)는 composition root 소관 —
   * 이 경로는 배지 표기된 QA 하네스만 마운트한다 (?shipdemo 관례).
   */
  private mountEconDemoIfRequested(): void {
    const flag = parseEconDemoFlag(window.location.search);
    if (!flag.mount) return;
    try {
      const host =
        this.renderer.webgl.domElement.parentElement ?? document.body;
      this.econDemo = new EconomyUiQaDemo(host, flag.forceSaveFailure);
      console.info('[CanyonScene] 경제 UI QA 데모 장착 (?econdemo — 실사용 배선 아님).');
    } catch (error) {
      this.econDemo = null;
      console.warn('[CanyonScene] 경제 UI QA 데모 초기화 실패 — 기본 장면은 계속 작동합니다.', error);
    }
  }

  /**
   * 보스 분절 스파이크 장착 — `?bossSpike=1` (11차 결의 5, 1주차 판정).
   * `&bossMotion=b`면 B안(이동 곡선·관성·카메라 흔들림) — 기본 비활성.
   * 격리 원칙: 실패해도 기본 장면·빌드는 정상 작동한다.
   */
  private mountBossSpikeIfRequested(): void {
    const query = new URLSearchParams(window.location.search);
    if (query.get('bossSpike') !== '1') return;
    try {
      const spawn = this.layout.submarineSpawn;
      const useFallback = query.get('bossMotion') === 'b';
      let motion: BossMotionStyle;
      if (useFallback) {
        const fallback = new BossMotionFallback(4, this.renderer.camera.position);
        fallback.onNearPass = (intensity) => {
          this.bossShakeIntensity = Math.max(this.bossShakeIntensity, intensity);
        };
        motion = fallback;
      } else {
        motion = new SegmentedSwimMotion(spawn.x, 4, spawn.z - 34);
      }
      this.bossSpike = new BossSegmentSpike(motion, true);
      this.scene.add(this.bossSpike.root);
      // 검수 키 [6]=약점 명중 · [7]=일반 명중 — QA 격리 경로 전용
      // (게임플레이 판정 도착 시 read model 통지가 정본, INT-RENDER-014)
      const onHitKey = (event: KeyboardEvent): void => {
        if (event.code === 'Digit6') this.bossSpike?.notifyWeakpointHit();
        if (event.code === 'Digit7') this.bossSpike?.notifyNormalHit();
      };
      window.addEventListener('keydown', onHitKey);
      this.disposables.push({ dispose: () => window.removeEventListener('keydown', onHitKey) });
      console.info(
        `[CanyonScene] 보스 분절 스파이크 장착 (?bossSpike=1${useFallback ? '&bossMotion=b' : ''} — 검수 키 6/7 = 약점/일반 명중).`,
      );
    } catch (error) {
      this.bossSpike = null;
      console.warn('[CanyonScene] 보스 스파이크 초기화 실패 — 기본 장면은 계속 작동합니다.', error);
    }
  }

  /**
   * production 보스 시각물 지연 장착 — `BossCoreView` 공급자가 처음으로
   * 비-null 뷰를 준 프레임에 1회 장착한다 (INT-CORE-022 소비 마감).
   *
   *  - 위치는 월드 배치 정본 `world/bossPlacement`의 스폰 포즈를 **읽기만**
   *    한다 (묘화 위치 — 인계표 §3 렌더 경계). 자체 순찰·이동 발명 없음:
   *    보스 포즈 read model이 계약에 없으므로 스폰 포즈 고정이 정직한
   *    표현이다 (이동 params는 승인 대기 null — 보스 이동 unwired).
   *  - 상태(phase·telegraph·weakPointOpen·defeated·피격)는 전부
   *    `applyCoreView`·공식 이벤트로만 구동된다. autoDemo 없음, 검수 키
   *    6/7 없음 (fixture 전용 — mountBossSpikeIfRequested 격리).
   */
  private mountProductionBossSpike(): void {
    try {
      const staticSpawnPose: BossMotionStyle = {
        update: (_deltaSeconds: number, root: THREE.Group): void => {
          root.position.set(
            BOSS_PLACEMENT.spawnX, BOSS_PLACEMENT.spawnY, BOSS_PLACEMENT.spawnZ,
          );
          root.rotation.y = meshYawRadians(BOSS_PLACEMENT.headingRadians);
        },
      };
      this.bossSpike = new BossSegmentSpike(staticSpawnPose, false);
      this.scene.add(this.bossSpike.root);
    } catch (error) {
      this.bossSpike = null;
      console.warn('[CanyonScene] 보스 시각물 장착 실패 — 기본 장면은 계속 작동합니다.', error);
    }
  }

  /**
   * 기지 화면 미리보기 — `?base=1` (렌더 QA 전용).
   * 정식 활성화는 리드 메타 루프의 SceneManager 전환(INT-RENDER-007) —
   * 그 전까지 이 위임 경로로 기지 장면·외형 단계를 검수한다.
   */
  private mountBaseViewIfRequested(): void {
    const query = new URLSearchParams(window.location.search);
    if (query.get('base') !== '1') return;
    this.baseView = new BaseSceneView(this.renderer);
    const tiers = query.get('tiers');
    if (tiers) {
      const [hull, weapon] = tiers.split(',').map((v) => Number.parseInt(v, 10));
      this.baseView.applyMetaVisualState({
        hullVisualTier: hull ?? 1,
        weaponVisualTier: weapon ?? 1,
      });
    }
  }

  /**
   * 스프린트 B 표시 규칙 fixture — `?bdemo=1` (UI 단위 검증 전용).
   * production 데이터가 아니며 배지로 구분한다. 경비함 3D 개체는 만들지
   * 않는다 — 방향 마커 좌표 규칙만 검수한다 (§6 가짜 경비함 금지).
   */
  private mountSprintBFixtureIfRequested(): void {
    if (!parseSprintBFixtureFlag(window.location.search)) return;
    const fixture = createSprintBFixture(this.layout.seaSurfaceY);
    this.bFixture = fixture;
    this.identificationSource = fixture.identification;
    this.convoySource = fixture.convoy;
    this.guardSightingSource = fixture.guard;
    this.bFixtureOverrides = true;

    const host = this.renderer.webgl.domElement.parentElement ?? document.body;
    const badge = document.createElement('div');
    badge.setAttribute('data-render-b-fixture-badge', '');
    badge.textContent = 'B fixture — 표시 규칙 검수용 (게임플레이 실제 상태 아님)';
    badge.style.cssText = [
      'position:absolute',
      'left:0.75rem',
      'top:0.75rem',
      'z-index:33',
      'padding:0.25rem 0.5rem',
      'border:1px dashed #ffb347',
      'border-radius:4px',
      'background:rgba(6,16,22,0.85)',
      'color:#ffb347',
      'font:0.7rem system-ui,sans-serif',
    ].join(';');
    host.appendChild(badge);
    // 검수 조작 핸들 — ?bdemo 플래그가 있을 때만 노출되는 QA 경로다
    (globalThis as unknown as Record<string, unknown>)['__deepDiveBFixture'] = fixture;
    console.info('[CanyonScene] 스프린트 B fixture 장착 (?bdemo=1 — UI 단위 검증 전용).');
  }

  /** fixture 검수 조작 핸들 (?bdemo 전용 — production에서는 null) */
  get sprintBFixture(): SprintBFixture | null {
    return this.bFixture;
  }

  /** 게임플레이 포즈 상태(계약 SubmarinePoseSource) 연결점 — 렌더는 소비만 한다 */
  attachPoseSource(source: SubmarinePoseSource): void {
    this.poseSource = source;
  }

  /** 화물선 상태(계약 CargoShipStateSource) 연결점 — composition root가 1회 주입 */
  attachCargoShipSource(source: CargoShipStateSource): void {
    this.cargoShipSource = source;
  }

  /**
   * 다중 선박 상태(`ShipWorldSource`) 연결점 — 적대·중립 화물선 + 경비함을
   * 한 목록으로 받는다 (B1·B5). composition root가 1회 주입한다.
   *
   * 주입되면 단일 화물선 경로를 **대체**한다 — 적대 화물선이 두 경로로
   * 중복 렌더되지 않게 하기 위한 것이다. 세력 변형은 목록이 준 `faction`
   * 값으로만 선택되며 렌더는 모델·클래스 이름으로 세력을 추측하지 않는다.
   */
  attachShipWorldSource(source: ShipWorldSource): void {
    this.shipWorldSource = source;
  }

  /**
   * 어뢰 상태 연결점 — gameplay.torpedo(읽기 전용 스냅샷·어뢰 속력)를
   * composition root가 1회 주입한다 (INT-RENDER-006). 미주입 시 어뢰·항적
   * 미표시(렌더가 상태를 지어내지 않음).
   */
  attachTorpedoSource(source: TorpedoStateSource): void {
    this.torpedoSource = source;
  }

  /**
   * 해저 재화 상태 연결점 — 게임플레이 `EconomySystem.salvageObjects`
   * 읽기 전용 스냅샷을 소비만 한다 (파괴 판정·보상은 게임플레이 소유).
   * 회수 반경도 게임플레이 값을 그대로 받는다 — 렌더가 정의하지 않는다.
   */
  /**
   * B2 식별 read model 연결 — 계약 `ShipIdentificationSource`만 소비한다.
   * 미주입이면 태그를 그리지 않는다 (렌더가 식별 상태를 만들지 않는다).
   */
  attachIdentificationSource(
    source: ShipIdentificationSource,
    exposureSink?: IdentificationExposureSink,
  ): void {
    if (this.bFixtureOverrides) return; // ?bdemo 검수 중 — 표본 유지
    this.identificationSource = source;
    this.exposureSink = exposureSink ?? null;
    if (this.identificationTags) {
      this.identificationTags.attachSource(source);
      if (exposureSink) this.identificationTags.attachExposureSink(exposureSink);
    }
    if (this.convoyVisuals) this.convoyVisuals.attachPositionSource(source);
  }

  /** B6 고가치 수송선·호위 결속 read model (미주입 = 미표시) */
  attachConvoySource(source: ConvoySource): void {
    if (this.bFixtureOverrides) return; // ?bdemo 검수 중 — 표본 유지
    this.convoySource = source;
    this.convoyVisuals?.attachSource(source);
  }

  /**
   * 경비함 스폰 결과 read model — **실제 스폰된 개체만** 담겨야 한다.
   * 스폰이 차단돼 있으면 비워 둔다 (가짜 경비함 표시 금지).
   */
  attachGuardSightingSource(source: GuardSightingSource): void {
    if (this.bFixtureOverrides) return; // ?bdemo 검수 중 — 표본 유지
    this.guardSightingSource = source;
    this.guardDirection?.attachSource(source);
  }

  attachSalvageSource(source: SalvageStateSource, pickupRadiusMeters: number): void {
    this.salvageVisuals.setPickupRadiusMeters(pickupRadiusMeters);
    this.salvageVisuals.attachSource(source);
  }

  /**
   * 소나 스코프 공급자 주입 — 정본 계약 `SonarScopeReadModel`
   * (src/contracts/sonar.ts) 폴링 단면 하나만 받는다. 게임플레이 공급자
   * 도착 시 composition root가 1회 주입 — 미주입 동안 '계기 미연결'.
   */
  attachSonarScopeSource(source: SonarScopeSource): void {
    this.sonarScope.attachSource(source);
  }

  /**
   * 보스 정본 읽기 모델(`BossCoreView`) 폴링 소스 주입 — production 보스
   * 조립 시 composition root가 1회 주입한다. 렌더는 phase·weakPointOpen·
   * telegraph·defeated를 매핑만 한다 (판정·피해·단계 계산 0).
   */
  attachBossViewSource(source: { coreView(): BossCoreView | null }): void {
    this.bossViewSource = source;
  }

  /**
   * 미세 조준 각 소스 연결점 — 게임플레이가 aiming.json 한계각·감도를 적용해
   * 계산한 결과 각을 렌더가 소비만 한다 (렌더 독자 한계각·감도 금지).
   * 미주입 시 조준 카메라는 소켓 정면(미세각 0)을 본다.
   */
  /** 공식 소켓 rig 주입 — composition root 1회 (조준 카메라 = 어뢰와 동일 출처) */
  attachTorpedoTubeSocket(source: TorpedoTubeSocketSource): void {
    this.torpedoTubeSocketSource = source;
  }

  attachAimAngleSource(source: AimAngleSource): void {
    this.aimAngleSource = source;
    void this.aimAngleSource;
  }

  /**
   * 외형 단계(visualTier) 주입 — 리드 메타 루프가 제공하는 명시적 단계만
   * 소비한다 (업그레이드 수치 계산 금지, INT-RENDER-007).
   */
  setSubmarineVisualTiers(hullTier: number, weaponTier: number): void {
    this.submarine.setVisualTiers(hullTier, weaponTier);
    this.baseView?.applyMetaVisualState({
      hullVisualTier: hullTier,
      weaponVisualTier: weaponTier,
    });
  }

  /**
   * 메타 기지 화면 표시 전환 — 조립부가 `metaStateChanged`(BASE 진입/이탈)에
   * 맞춰 호출한다. 렌더는 메타 상태를 스스로 판정하지 않는다.
   *
   * QA 플래그(`?base=1`)와 같은 위임 경로를 재사용하므로 협곡 장면의 GPU
   * 자원은 유지된다 (SceneManager 수준의 정식 장면 교체는 INT-RENDER-007
   * 후속 — 그때 이 메서드가 대체된다).
   */
  setMetaBaseActive(active: boolean, tiers?: { hull: number; weapon: number }): void {
    // 경비함 방향 마커는 해역 전용 — 기지 화면에는 표시하지 않는다 (§10)
    this.guardDirection?.setSuppressed(active);
    if (active) {
      if (!this.baseView) this.baseView = new BaseSceneView(this.renderer);
      if (tiers) {
        this.baseView.applyMetaVisualState({
          hullVisualTier: tiers.hull,
          weaponVisualTier: tiers.weapon,
        });
      }
      return;
    }
    this.baseView?.dispose();
    this.baseView = null;
  }

  /**
   * EventBus 연결점 — torpedoHit(명중 폭발 시작 신호) 구독용.
   * composition root가 1회 주입한다. 중복 주입 시 기존 구독을 해제해
   * 한 명중에 폭발이 여러 번 시작되지 않게 한다.
   */
  attachEventBus(bus: EventBus): void {
    this.unsubscribeTorpedoHit?.();
    this.unsubscribeTorpedoHit = bus.on('torpedoHit', (payload) =>
      this.onTorpedoHit(payload),
    );
    // X-ray 침수 표시 (C5 — 보호 목록): floodingChanged severity만 매핑한다.
    // 렌더 자체 침수 타이머 없음 — 심각도 0이면 다시 투명해진다.
    this.unsubscribeFlooding?.();
    this.unsubscribeFlooding = bus.on('floodingChanged', (payload) => {
      this.applyFloodingSeverity(payload.severity);
    });
    // 보스 통지 이벤트 — 발행 정본(bossPhaseChanged·bossWeakPointChanged·
    // bossDefeated·bossHit)을 표현으로만 매핑한다. 보스 시각물 미장착 시 무시.
    this.unsubscribeBossEvents.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeBossEvents.length = 0;
    this.unsubscribeBossEvents.push(
      bus.on('bossPhaseChanged', ({ phase }) => this.bossSpike?.setPhase(phase)),
      bus.on('bossWeakPointChanged', ({ active }) =>
        this.bossSpike?.setWeakpointActive(active),
      ),
      bus.on('bossDefeated', () => this.bossSpike?.applyCoreViewDefeated()),
      // 보스 피격 통지(INT-CORE-022) — 명중 확정 1건당 1회 수신, kind로
      // 약점/일반 플래시만 분기한다. 피해·배율 재계산 0 (통지 전용 소비).
      // 검수 키 [6]/[7]은 ?bossSpike=1 fixture 경로에만 격리돼 있다.
      bus.on('bossHit', ({ kind }) => {
        if (kind === 'weakPoint') this.bossSpike?.notifyWeakpointHit();
        else this.bossSpike?.notifyNormalHit();
      }),
      // 회수 확정 통지 — 단서 표식 제거 (kind 무관 targetId 대조만, 판정 0)
      bus.on('interactionCollected', ({ targetId }) =>
        this.clueMarkers.markCollected(targetId),
      ),
    );
    // 조준경: 게임플레이가 발행한 조준 상태만 소비 — 렌더 독자 전환 없음
    this.unsubscribeAimMode?.();
    this.unsubscribeAimMode = bus.on('aimModeChanged', (payload) => {
      this.ensurePeriscope().setAiming(payload.aiming);
      this.ensureBOverlays();
      this.identificationTags?.setAiming(payload.aiming);
      this.convoyVisuals?.setAiming(payload.aiming);
      this.setAimCameraActive(payload.aiming);
    });
  }

  /**
   * 조준 카메라 전환 (aimModeChanged 전이에서만 호출 — 렌더 독자 전환 없음).
   *  - 진입: 자기 선체 레이어를 조준 카메라 마스크에서만 끈다 (13차 결의 3 —
   *    그림자·수면·타 카메라 보존, visible·material 전역 변경 없음).
   *  - 해제: 레이어 복원 + 현 카메라 위치에서 3인칭 후방 뷰로 자연 복귀.
   */
  private setAimCameraActive(active: boolean): void {
    const camera = this.renderer.camera;
    if (active) {
      camera.layers.disable(SELF_HULL_LAYER);
      return;
    }
    camera.layers.enable(SELF_HULL_LAYER);
    this.rig.beginReturnFrom(camera.position);
  }

  /** 조준경 오버레이 지연 생성 — 캔버스 부모(#app)에 겹친다 */
  private ensurePeriscope(): PeriscopeView {
    if (!this.periscope) {
      const host =
        this.renderer.webgl.domElement.parentElement ?? document.body;
      this.periscope = new PeriscopeView(this.renderer.camera, host);
    }
    return this.periscope;
  }

  /**
   * 스프린트 B 오버레이 지연 생성 — 조준경과 같은 host에 겹친다.
   * 소스가 이미 주입돼 있으면 생성 시점에 연결한다 (주입 순서 무관).
   */
  /**
   * 침수 심각도 → X-ray 반투명 표시 (C5). severity 값 매핑만 한다 —
   * 침수량·속도 판정은 PlayerHullSystem·FloodingCore 소유다.
   * 잠수함 자식이므로 자기 선체 레이어를 따라 조준 카메라에서는 함께
   * 제외된다 (레이어 마스크 규약 유지).
   */
  private applyFloodingSeverity(severity: number): void {
    if (!this.floodingXray && severity <= 0) return;
    if (!this.floodingXray) {
      try {
        this.floodingXray = new XrayFloodingSpike(false); // 자동 데모 없음
        this.floodingXray.root.position.set(0, 0.2, 0);
        this.floodingXray.root.traverse((node) => node.layers.set(SELF_HULL_LAYER));
        this.submarine.root.add(this.floodingXray.root);
      } catch (error) {
        this.floodingXray = null;
        console.warn('[CanyonScene] 침수 X-ray 장착 실패 — HUD 침수 표시는 유지된다.', error);
        return;
      }
    }
    // 단일 'hull' 구획 심각도를 모든 X-ray 구획에 동일 매핑 (표현만)
    for (let i = 0; i < 4; i += 1) this.floodingXray.setSeverity(i, severity);
  }

  private ensureBOverlays(): void {
    const host = this.renderer.webgl.domElement.parentElement ?? document.body;
    if (!this.identificationTags) {
      this.identificationTags = new IdentificationTags(host);
      if (this.identificationSource) {
        this.identificationTags.attachSource(this.identificationSource);
      }
      if (this.exposureSink) this.identificationTags.attachExposureSink(this.exposureSink);
    }
    if (!this.convoyVisuals) {
      this.convoyVisuals = new ConvoyVisuals(host);
      if (this.convoySource) this.convoyVisuals.attachSource(this.convoySource);
      if (this.identificationSource) {
        this.convoyVisuals.attachPositionSource(
          this.identificationSource as ConvoyPositionSource,
        );
      }
    }
    if (!this.guardDirection) {
      this.guardDirection = new GuardDirectionIndicator(host);
      if (this.guardSightingSource) {
        this.guardDirection.attachSource(this.guardSightingSource);
      }
    }
  }

  /** 카메라 입력 어댑터(CameraInputAdapter) 연결용 */
  get cameraRig(): CameraRig {
    return this.rig;
  }

  update(deltaSeconds: number): void {
    // 경제 UI QA 데모 — 장면과 무관한 DOM 갱신 (기지 미리보기와도 병행)
    this.econDemo?.update();
    this.cFixture?.update(deltaSeconds);
    // 기지 화면 미리보기(?base=1) — 협곡 장면 대신 기지 장면만 갱신 (QA 경로)
    if (this.baseView) {
      this.sonarScope.setVisible(false); // 소나는 해역 전용 계기 (§10 관례)
      this.baseView.update(deltaSeconds);
      return;
    }
    this.sonarScope.setVisible(true);
    this.elapsed += deltaSeconds;

    const spawn = this.layout.submarineSpawn;
    const x = this.poseSource?.positionX ?? spawn.x;
    const y = this.poseSource?.positionY ?? DEFAULT_SUBMARINE_Y;
    const z = this.poseSource?.positionZ ?? spawn.z;
    const heading = this.poseSource?.headingRadians ?? spawn.headingRadians;

    this.submarine.root.position.set(x, y, z);
    this.submarine.root.rotation.y = meshYawRadians(heading);
    this.blobShadow.follow(x, z); // 블롭 섀도는 해저 투영 — 수직 이동과 무관

    if (this.periscope?.isAiming) {
      // 어뢰 조준경 — 선수 발사관 시점. 모든 심도에서 동일 진입(별도 잠망경
      // 심도 카메라 전환 없음): 소켓이 잠수함을 따라가므로 심도별 분기 불필요.
      this.updateAimCamera();
    } else {
      this.rig.update(deltaSeconds, x, y, z, heading);
    }

    // B안 스파이크 전용 — 근접 통과 카메라 흔들림 (지수 감쇠, 기본 0)
    if (this.bossShakeIntensity > 0.001) {
      const camera = this.renderer.camera;
      camera.position.x += Math.sin(this.elapsed * 47) * this.bossShakeIntensity;
      camera.position.y += Math.cos(this.elapsed * 53) * this.bossShakeIntensity * 0.6;
      this.bossShakeIntensity *= Math.exp(-3 * deltaSeconds);
    }

    // 프로펠러: 계약 forwardSpeedMetersPerSecond(+선수/−선미)만 사용 —
    // 위치 차분 재계산 금지. A/D 단독 선회는 이 값에 영향이 없다.
    const signedSpeed = this.poseSource?.forwardSpeedMetersPerSecond ?? 0;
    this.propeller.update(deltaSeconds, signedSpeed, this.movementParams);

    // 프로펠러 기포·수류 — 원판 중심에서 로컬 후방(후진 시 전방)으로 사출.
    // 발생률·사출 속도·wake 길이는 |속도|/최고 속력 비례 (계약 값만 소비).
    this.submarine.root.updateMatrixWorld();
    this.propeller.root.getWorldPosition(WAKE_ORIGIN);
    WAKE_DIRECTION.set(0, 0, signedSpeed >= 0 ? 1 : -1)
      .applyQuaternion(this.submarine.root.quaternion);
    this.propWake.update(
      deltaSeconds,
      WAKE_ORIGIN,
      WAKE_DIRECTION,
      Math.abs(signedSpeed) / Math.max(this.movementParams.maxSpeedMetersPerSecond.value, 1e-3),
    );

    this.seaSurface.update(deltaSeconds);
    this.environment.update(deltaSeconds);
    this.torpedoVisuals.update(deltaSeconds, this.torpedoSource);
    this.salvageVisuals.update(deltaSeconds);
    this.clueMarkers.update(deltaSeconds);
    this.periscope?.update(deltaSeconds);
    // 스프린트 B 오버레이 — 계약 read model → 화면 좌표 매핑만 (판정 없음)
    this.floodingXray?.update(deltaSeconds);
    this.identificationTags?.update(this.renderer.camera);
    this.convoyVisuals?.update(this.renderer.camera);
    this.guardDirection?.update(deltaSeconds, this.renderer.camera);
    this.updateLeadIndicator();
    this.updateCargoShip(deltaSeconds);
    // 소나 스코프 — 정본 read model 폴링만 (월드 좌표 전달 없음)
    this.sonarScope.update(deltaSeconds);
    this.updateFogByCameraDepth();
    // 부유물은 최종 카메라 위치 기준으로 되감는다 (조준 시점 포함)
    this.drift.update(
      deltaSeconds,
      this.renderer.camera.position.x,
      this.renderer.camera.position.y,
      this.renderer.camera.position.z,
    );
    this.xraySpike?.update(deltaSeconds);
    // 보스 정본 읽기 모델 — 주입돼 있으면 매 프레임 매핑 (이벤트와 멱등 병행).
    // production에서는 공급자가 처음으로 비-null 뷰를 준 시점(보스 활성)에
    // 시각물을 지연 장착한다 — fixture(?bossSpike=1)와 이중 장착 없음.
    const bossView = this.bossViewSource?.coreView() ?? null;
    if (bossView && !this.bossSpike) this.mountProductionBossSpike();
    if (bossView && this.bossSpike) this.bossSpike.applyCoreView(bossView);
    this.bossSpike?.update(deltaSeconds);
  }

  /**
   * 어뢰 조준경 카메라 — aimCameraSocket의 월드 위치·방향을 **그대로**
   * 사용한다 (13차 결의 2: 독자 오프셋 계산 금지 — 소켓 정의가 단일 지점).
   * 미세 조준 각은 게임플레이 소스(aimAngleSource)의 결과 값만 소켓 로컬축
   * 기준으로 더한다 — 렌더가 한계각·감도를 판정하지 않는다. 발사 후에도
   * aimModeChanged(false)가 올 때까지 이 시점을 유지한다.
   */
  private updateAimCamera(): void {
    const camera = this.renderer.camera;
    // 공식 소켓 rig(리드 TorpedoTubeSocketRig) — 위치·전방축을 그대로 쓴다.
    // 미세각은 이미 rig가 반영한 값이며, 렌더는 각도를 계산하지 않는다
    // (스프린트 A 정규화: 어뢰 spawn 소켓과 동일 rig = 십자선 = 탄도).
    const socket = this.torpedoTubeSocketSource;
    if (socket) {
      const pose = socket.aimCameraSocket;
      camera.position.set(pose.positionX, pose.positionY, pose.positionZ);
      AIM_LOOK_TARGET.set(
        pose.positionX + pose.forwardX,
        pose.positionY + pose.forwardY,
        pose.positionZ + pose.forwardZ,
      );
      camera.up.set(0, 1, 0);
      camera.lookAt(AIM_LOOK_TARGET);
      return;
    }
    // 소켓 미주입(QA 플래그 단독 검수) — 시각 부모만으로 근사 표시
    const visualSocket = this.submarine.aimCameraSocket;
    this.submarine.root.updateMatrixWorld(true);
    visualSocket.getWorldPosition(camera.position);
    visualSocket.getWorldQuaternion(camera.quaternion);
  }

  /**
   * 리드샷 보조선 — 조준 중에만, 게임플레이 읽기 전용 상태(표적 위치·속도 +
   * 어뢰 속력 + 포즈)로 요격 지점을 표시한다 (판정 복제 아님, 5차 결의 3).
   */
  private updateLeadIndicator(): void {
    const aiming = this.periscope?.isAiming ?? false;
    const target = this.cargoShipSource ?? this.shipDemoSnapshot;
    if (!aiming || !target || target.removed || target.hit) {
      this.leadIndicator.update(false, 0, 0, 0, 0, 0, 0, 0, 0, this.renderer.camera);
      return;
    }
    const spawn = this.layout.submarineSpawn;
    this.leadIndicator.update(
      true,
      this.poseSource?.positionX ?? spawn.x,
      this.poseSource?.positionZ ?? spawn.z,
      target.positionX,
      target.positionY,
      target.positionZ,
      target.velocityX,
      target.velocityZ,
      this.torpedoSource?.torpedoSpeedMetersPerSecond ?? 0,
      this.renderer.camera,
    );
  }

  /**
   * 카메라 심도에 따른 배경·포그 (반사·굴절 없음 — 색·포그 차이만).
   *  - 수면 위: 기존 하늘 톤 고정 (아트 패스 대상 아님).
   *  - 수중: 수면(밝고 긴 가시거리)→해저(어둡고 짧은 가시거리) **연속 보간**
   *    — 전경·중경·후경 명도 분리와 '하강할수록 어두워지는' 공식 문법.
   *    보간 축은 레이아웃의 seaSurfaceY↔floorY라 협곡 데이터와 함께 움직인다
   *    (렌더 독자 심도 수치 없음).
   */
  private updateFogByCameraDepth(): void {
    const camera = this.renderer.camera;
    const above = camera.position.y > this.layout.seaSurfaceY;
    const fog = this.scene.fog as THREE.Fog;
    const background = this.scene.background as THREE.Color;
    // 부유물(마린 스노우)은 수중 전용 — 수면 위에서는 감춘다
    this.drift.points.visible = !above && this.quality.driftCount > 0;

    if (above) {
      if (this.cameraAboveSurface) return; // 수면 위 값은 고정 — 전환 시 1회만
      this.cameraAboveSurface = true;
      background.set(SKY_COLOR);
      fog.color.set(SKY_COLOR);
      fog.near = ABOVE_FOG_NEAR;
      fog.far = ABOVE_FOG_FAR;
      this.sunLight.intensity = ART.lights.sunIntensity;
      this.hemiLight.intensity = ART.lights.hemisphereIntensity;
      return;
    }
    this.cameraAboveSurface = false;

    // 정규화 심도(0=수면, 1=해저) → 그레이딩 stops 구간 선형 보간
    const depthRange = this.layout.seaSurfaceY - this.layout.floorY;
    const depth =
      depthRange > 0
        ? THREE.MathUtils.clamp(
            (this.layout.seaSurfaceY - camera.position.y) / depthRange,
            0,
            1,
          )
        : 1;
    let upper = 1;
    while (upper < GRADING_STOPS.length - 1 && GRADING_STOPS[upper]!.at < depth) upper += 1;
    const a = GRADING_STOPS[upper - 1]!;
    const b = GRADING_STOPS[upper]!;
    const t = THREE.MathUtils.clamp((depth - a.at) / Math.max(b.at - a.at, 1e-6), 0, 1);

    fog.color.copy(a.color).lerp(b.color, t);
    background.copy(fog.color);
    fog.near = THREE.MathUtils.lerp(a.near, b.near, t);
    fog.far = THREE.MathUtils.lerp(a.far, b.far, t);
    // 심해 감광 — 기본 조명이 약해지며 탐조등의 상대 영향이 커진다
    // (탐조등 자체 증폭 없음). 부유물은 깊을수록 조금 더 또렷해진다.
    this.sunLight.intensity =
      ART.lights.sunIntensity * THREE.MathUtils.lerp(a.sunScale, b.sunScale, t);
    this.hemiLight.intensity =
      ART.lights.hemisphereIntensity * THREE.MathUtils.lerp(a.hemiScale, b.hemiScale, t);
    this.drift.setOpacityScale(THREE.MathUtils.lerp(a.driftScale, b.driftScale, t));
  }

  render(): void {
    if (this.baseView) {
      this.baseView.render();
      return;
    }
    this.renderer.render(this.scene);
  }

  resize(_width: number, _height: number): void {
    // 카메라 종횡비·렌더러 크기는 Renderer.resize가 갱신한다 (core/Game 경유).
  }

  dispose(): void {
    for (const visual of this.shipVisuals.values()) visual.removeAndDispose();
    this.shipVisuals.clear();
    // 조준 카메라 레이어 복원 — 장면 수명과 함께 마스크 상태를 남기지 않는다
    this.renderer.camera.layers.enable(SELF_HULL_LAYER);
    this.unsubscribeParamsReload?.();
    this.unsubscribeParamsReload = null;
    this.unsubscribeTorpedoHit?.();
    this.unsubscribeTorpedoHit = null;
    this.unsubscribeAimMode?.();
    this.unsubscribeAimMode = null;
    this.unsubscribeFlooding?.();
    this.unsubscribeFlooding = null;
    this.unsubscribeBossEvents.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeBossEvents.length = 0;
    this.sonarScope.dispose();
    this.floodingXray?.dispose();
    this.floodingXray = null;
    this.baseView?.dispose();
    this.baseView = null;
    this.econDemo?.dispose();
    this.econDemo = null;
    this.cFixture?.dispose();
    this.cFixture = null;
    this.bossSpike?.dispose();
    this.bossSpike = null;
    this.periscope?.dispose();
    this.periscope = null;
    this.identificationTags?.dispose();
    this.identificationTags = null;
    this.convoyVisuals?.dispose();
    this.convoyVisuals = null;
    this.guardDirection?.dispose();
    this.guardDirection = null;
    this.xraySpike?.dispose();
    this.xraySpike = null;
    this.cargoShip?.removeAndDispose();
    this.cargoShip = null;
    this.drift.points.removeFromParent();
    this.drift.dispose();
    this.propWake.dispose();
    this.torpedoVisuals.dispose();
    this.salvageVisuals.dispose();
    this.clueMarkers.dispose();
    this.leadIndicator.dispose();
    this.environment.dispose();
    this.submarine.dispose();
    this.propeller.dispose();
    this.seaSurface.dispose();
    this.blobShadow.dispose();
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
    this.scene.clear();
  }

  /**
   * 협곡 메시 생성 — 공유 CanyonLayout.blocks가 유일한 배치 소스다
   * [INT-CORE-004]. 같은 blocks를 게임플레이가 충돌체로 소비하므로
   * 렌더 메시와 충돌 위치가 정의상 일치한다. 렌더 자체 수식 없음.
   */
  private buildCanyonFromLayout(): void {
    // 해저 바닥 — 완만한 굴곡의 시각 전용 지면 (충돌 무관, RockShell 참조).
    // UV = 월드 미터 (텍스처 repeat = 1/tileMeters — sceneTextures 규약).
    // 미세한 emissive는 안개 속 최원경이 완전 검정으로 뭉개지는 것을 막는다.
    const floorGeometry = buildSeabedGeometry(240);
    const floorMaterial = new THREE.MeshLambertMaterial({
      color: ART.materials.floorColor,
      emissive: ART.materials.floorEmissive,
      flatShading: true,
    });
    this.disposables.push(floorGeometry, floorMaterial);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = this.layout.floorY;
    this.scene.add(floor);

    const wallMaterial = new THREE.MeshLambertMaterial({
      color: ART.materials.wallColor,
      emissive: ART.materials.wallEmissive,
      flatShading: true,
    });
    this.disposables.push(wallMaterial);

    for (let i = 0; i < this.layout.blocks.length; i += 1) {
      const block = this.layout.blocks[i]!;
      // 암벽 시각 셸 — 충돌 박스(계약 blocks)를 감싸는 렌더 전용 저폴리
      // 암벽 형태 (기울어진 상단·잘린 모서리·층리 선반 — RockShell 참조).
      // **배치·회전·충돌 데이터는 계약 blocks 그대로** (블록당 메시 1개,
      // 드로우 수 불변 · 재질 공유 1개).
      const blockGeometry = buildRockShellGeometry(block, i);
      this.disposables.push(blockGeometry);
      const mesh = new THREE.Mesh(blockGeometry, wallMaterial);
      // 계약 규약: 블록 바닥이 floorY — 중심 Y = floorY + sizeY/2
      mesh.position.set(block.x, this.layout.floorY + block.sizeY / 2, block.z);
      mesh.rotation.y = block.rotationY;
      this.scene.add(mesh);
    }

    // 텍스처 도착 시 map 장착 — 실패하면 위 단색이 그대로 남는다 (fallback)
    onSceneTexture('wall', (texture) => {
      wallMaterial.map = texture;
      wallMaterial.needsUpdate = true;
    });
    onSceneTexture('floor', (texture) => {
      floorMaterial.map = texture;
      floorMaterial.needsUpdate = true;
    });
  }

  /**
   * 잠수함 장착 — SubmarineVisual(외형 단계 어댑터) + 선미 프로펠러.
   * 선수·선미 규약: 로컬 -Z = 선수, +Z = 선미 (conventions).
   * 외형 단계는 setVisualTiers 주입만 — QA는 ?tiers=<hull>,<weapon>.
   */
  private mountSubmarine(): void {
    this.propeller.root.position.set(0, 0, this.submarine.sternMountZ);
    this.submarine.root.add(this.propeller.root);
    this.submarine.root.position.y = DEFAULT_SUBMARINE_Y;
    this.scene.add(this.submarine.root);

    const tiers = new URLSearchParams(window.location.search).get('tiers');
    if (tiers) {
      const [hull, weapon] = tiers.split(',').map((v) => Number.parseInt(v, 10));
      this.submarine.setVisualTiers(hull ?? 1, weapon ?? 1);
    }
  }

  /** torpedoHit — 현재 화물선 id와 일치할 때만 폭발 시작 (멱등 처리) */
  private onTorpedoHit(payload: GameEvents['torpedoHit']): void {
    // 다중 선박 경로 — 맞은 개체의 인스턴스에서만 폭발을 시작한다 (멱등).
    const struck = this.shipVisuals.get(payload.targetId);
    if (struck) {
      struck.startHitExplosion();
      return;
    }
    const source = this.cargoShipSource ?? this.shipDemoSnapshot;
    if (!source || payload.targetId !== source.id) return;
    this.cargoShip?.startHitExplosion();
  }

  /**
   * 화물선 상태 소비 — 정식 소스(attachCargoShipSource) 우선, 없으면
   * ?shipdemo 고정 스냅샷(렌더 QA). 둘 다 없으면 표현할 상태가 없으므로
   * 화물선을 그리지 않는다 (렌더가 상태를 지어내지 않는다).
   */
  private updateCargoShip(deltaSeconds: number): void {
    // 다중 선박 소스가 있으면 그쪽이 유일 경로다 (중복 렌더 방지).
    if (this.shipWorldSource) {
      this.updateShipWorld(deltaSeconds);
      return;
    }
    const source = this.cargoShipSource ?? this.shipDemoSnapshot;
    if (!source) return;

    if (source.removed) {
      // 시뮬레이션에서 제거됨 — 시각 자원 정리 (1회)
      this.cargoShip?.removeAndDispose();
      this.cargoShip = null;
      return;
    }

    if (!this.cargoShip) {
      this.cargoShip = new CargoShipVisual();
      this.scene.add(this.cargoShip.root);
    }

    this.cargoShip.applyState(source);
    if (source.hit) {
      // 상태 경로 보조 신호 — torpedoHit 이벤트와 겹쳐도 멱등이라 1회만 시작
      this.cargoShip.startHitExplosion();
    }
    this.cargoShip.update(deltaSeconds);
  }

  /**
   * 다중 선박 렌더 — 목록에 있는 개체마다 시각 인스턴스를 하나 유지한다.
   *
   *  - 새 entityId → 그 세력 변형으로 인스턴스 생성
   *  - 목록에서 사라지거나 `alive=false` → 인스턴스 제거·dispose
   *  - 세력 변형 교체·침몰 매핑은 기존 `applyState`가 그대로 담당한다
   *
   * 렌더는 판정하지 않는다: 위치·세력·생존·침몰 진행 전부 게임플레이
   * 스냅샷 값이고, 여기서는 표현만 매핑한다.
   */
  private updateShipWorld(deltaSeconds: number): void {
    const views = this.shipWorldSource?.shipViews ?? [];
    const seen = new Set<number>();

    for (const view of views) {
      if (!view.alive) continue;
      seen.add(view.entityId);
      let visual = this.shipVisuals.get(view.entityId);
      if (!visual) {
        visual = new CargoShipVisual(view.faction);
        this.scene.add(visual.root);
        this.shipVisuals.set(view.entityId, visual);
      }
      visual.applyState(shipWorldViewAsCargoState(view));
      visual.update(deltaSeconds);
    }

    for (const [entityId, visual] of [...this.shipVisuals]) {
      if (seen.has(entityId)) continue;
      visual.removeAndDispose();
      this.shipVisuals.delete(entityId);
    }
  }

  /**
   * ?shipdemo=<0~1> — 순수 렌더 QA용 고정 상태 스냅샷 (계약 타입 준수).
   * 이동·자동 격침·타이머 없음: sinkProgress를 URL 값으로 고정해 침몰
   * 매핑·폭발(값>0 시 hit=true)을 정지 화면으로 검수한다.
   * 실제 게임 상태를 속이지 않는다 — 정식 소스 주입 시 무시된다.
   */
  private parseShipDemoSnapshot(): CargoShipStateSource | null {
    const raw = new URLSearchParams(window.location.search).get('shipdemo');
    if (raw === null) return null;
    const progress = THREE.MathUtils.clamp(Number.parseFloat(raw) || 0, 0, 1);
    const spawn = this.layout.submarineSpawn;
    return Object.freeze({
      id: -1, // 실제 표적 id와 충돌하지 않는 QA 전용 값
      positionX: spawn.x - 7,
      positionY: this.layout.seaSurfaceY,
      positionZ: spawn.z - 30,
      headingRadians: -Math.PI / 2,
      velocityX: 0,
      velocityZ: 0,
      hit: progress > 0,
      sinkProgress: progress,
      removed: false,
    });
  }

  /**
   * 소나 스코프 **표시 규칙 검수 fixture** — `?sonardemo=1` (production 아님).
   * 게임플레이 공급자가 없는 동안 계약 형태의 표본(`SonarScopeReadModel`)을
   * 시간 순환으로 물려 blip 7종(전투 3 + 탐색 4)·번짐·거리 미상·핑·테두리
   * 3색·소음을 브라우저에서 검수한다. 탐색 4종은 공급 규칙(액티브 핑 노출
   * 중에만)대로 핑 구간에만 표본을 물린다. 배지로 구분하며, 정식 공급자
   * 주입 시(조립부 attachSonarScopeSource) 이 경로는 사용하지 않는다.
   */
  private mountSonarDemoIfRequested(): void {
    if (new URLSearchParams(window.location.search).get('sonardemo') !== '1') return;
    const start = performance.now();
    this.sonarScope.attachSource({
      scopeView: () => {
        const t = (performance.now() - start) / 1000;
        const ring = Math.floor(t / 4) % 3;
        const pingCycle = t % 12;
        return {
          unwired: false,
          noiseFactor: (Math.sin(t * 0.5) + 1) / 2,
          blips: [
            { targetId: 'demo-ship', kind: 'ship', bearingRadians: 0.6 + t * 0.05,
              bearingSpreadRadians: 0.3, distanceMeters: 60, fromActivePing: false },
            { targetId: 'demo-passive', kind: 'ship', bearingRadians: -1.4,
              bearingSpreadRadians: 0.5, distanceMeters: null, fromActivePing: false },
            { targetId: 'demo-torpedo', kind: 'torpedo', bearingRadians: 2.4,
              bearingSpreadRadians: 0.05, distanceMeters: 35, fromActivePing: false },
            { targetId: 'demo-charge', kind: 'depthCharge', bearingRadians: -2.6,
              bearingSpreadRadians: 0.08, distanceMeters: 25, fromActivePing: false },
            ...(pingCycle < 3
              ? [
                  { targetId: 'demo-ping', kind: 'ship' as const, bearingRadians: 1.6,
                    bearingSpreadRadians: 0, distanceMeters: 80, fromActivePing: true },
                  // 탐색 4종 — 계약 공급 규칙대로 액티브 핑 노출 중에만
                  { targetId: 'demo-gold', kind: 'goldCache' as const, bearingRadians: 0.2,
                    bearingSpreadRadians: 0, distanceMeters: 95, fromActivePing: true },
                  { targetId: 'demo-salvage', kind: 'salvage' as const, bearingRadians: -0.7,
                    bearingSpreadRadians: 0, distanceMeters: 55, fromActivePing: true },
                  { targetId: 'demo-clue', kind: 'clue' as const, bearingRadians: 3.0,
                    bearingSpreadRadians: 0, distanceMeters: 70, fromActivePing: true },
                  { targetId: 'demo-deep', kind: 'deepSite' as const, bearingRadians: -1.9,
                    bearingSpreadRadians: 0, distanceMeters: 110, fromActivePing: true },
                ]
              : []),
          ],
          activePingRemainingSeconds: pingCycle < 3 ? 3 - pingCycle : 0,
          cooldownRemainingSeconds: pingCycle >= 3 && pingCycle < 9 ? 9 - pingCycle : 0,
          pingReady: pingCycle >= 9,
          ringState: ring === 0 ? 'safe' : ring === 1 ? 'searching' : 'detected',
        };
      },
    });
    const host = this.renderer.webgl.domElement.parentElement ?? document.body;
    const badge = document.createElement('div');
    badge.setAttribute('data-render-sonar-demo-badge', '');
    badge.textContent = '소나 fixture — 표시 규칙 검수용 (게임플레이 실제 상태 아님)';
    badge.style.cssText =
      'position:absolute;left:0.75rem;top:20vh;z-index:33;padding:0.25rem 0.5rem;border:1px dashed #ffb347;border-radius:4px;background:rgba(6,16,22,0.85);color:#ffb347;font:0.7rem system-ui,sans-serif';
    host.appendChild(badge);
    this.disposables.push({ dispose: () => badge.remove() });
    console.info('[CanyonScene] 소나 fixture 장착 (?sonardemo=1 — 표시 규칙 검수 전용).');
  }

  /**
   * X-ray 스파이크 장착 — `?xray` URL 플래그가 있을 때만.
   * 분리 모듈이 실패해도 기본 장면은 정상 작동해야 한다 —
   * 생성 실패는 격리하고 경고만 남긴다.
   */
  private mountXraySpikeIfRequested(): void {
    if (!new URLSearchParams(window.location.search).has('xray')) return;
    try {
      this.xraySpike = new XrayFloodingSpike(true);
      this.xraySpike.root.position.set(4.5, DEFAULT_SUBMARINE_Y + 1, -4);
      this.xraySpike.root.rotation.y = 0.55; // 선체 길이 방향이 보이도록 비스듬히
      this.scene.add(this.xraySpike.root);
      console.info('[CanyonScene] X-ray 스파이크 장착 (?xray 플래그).');
    } catch (error) {
      this.xraySpike = null;
      console.warn(
        '[CanyonScene] X-ray 스파이크 초기화 실패 — 기본 장면은 계속 작동합니다.',
        error,
      );
    }
  }
}

/**
 * `ShipWorldView` → `CargoShipStateSource` 어댑터 (표현 매핑 전용).
 * `CargoShipVisual.applyState`가 쓰는 필드만 채운다 — 속도·명중 플래그는
 * 이 경로에서 쓰이지 않으므로 0/false로 두고, 폭발은 `torpedoHit`
 * 이벤트가 개체별로 시작한다. 렌더가 값을 지어내지 않는다.
 */
function shipWorldViewAsCargoState(view: ShipWorldView): CargoShipStateSource {
  return {
    id: view.entityId,
    faction: view.faction,
    positionX: view.positionX,
    positionY: view.positionY,
    positionZ: view.positionZ,
    headingRadians: view.headingRadians,
    velocityX: 0,
    velocityZ: 0,
    hit: false,
    sinkProgress: view.sinkProgress,
    removed: !view.alive,
  };
}
