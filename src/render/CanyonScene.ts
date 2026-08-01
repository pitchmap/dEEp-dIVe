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
import { EnvironmentDressing } from './EnvironmentDressing';
import { LeadShotIndicator } from './LeadShotIndicator';
import { PeriscopeView } from './PeriscopeView';
import { Propeller } from './Propeller';
import { SeaSurface } from './SeaSurface';
import type { SalvageStateSource } from './SalvageVisuals';
import { SalvageVisuals } from './SalvageVisuals';
import { SubmarineVisual } from './SubmarineVisual';
import type { TorpedoStateSource } from './TorpedoVisuals';
import { TorpedoVisuals } from './TorpedoVisuals';
import { XrayFloodingSpike } from './xray/XrayFloodingSpike';
import { EconomyUiQaDemo, parseEconDemoFlag } from '../ui/econUiQaDemo';

/** 수중 배경·포그 톤 — 임시 색상. 심도별 그라데이션·아트 색은 D13 이후 (§3.1) */
const WATER_COLOR = 0x0e3140;
const FOG_NEAR = 12;
const FOG_FAR = 95;

/** 수면 위 배경·포그 — '밝음(수면)→어둠(심해)' 공식 문법의 수면 위 끝단 (§3.1) */
const SKY_COLOR = 0x9cc4d4;
const ABOVE_FOG_NEAR = 60;
const ABOVE_FOG_FAR = 280;

/** 회색 박스 팔레트 (최종 아트 아님) */
const FLOOR_COLOR = 0x3d474d;
const WALL_COLOR = 0x59646c;

/** 포즈 미주입 시 기본 수직 위치 — 스폰 관례(y=0, 순항 구간)와 동일 */
const DEFAULT_SUBMARINE_Y = 0;

/** 조준 카메라 lookAt 재사용 벡터 (프레임당 할당 방지) */
const AIM_LOOK_TARGET = new THREE.Vector3();

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
  private readonly submarine = new SubmarineVisual();
  private readonly propeller = new Propeller();
  private readonly seaSurface: SeaSurface;
  private readonly torpedoVisuals = new TorpedoVisuals();
  private readonly leadIndicator = new LeadShotIndicator();
  private readonly salvageVisuals = new SalvageVisuals();
  private readonly environment: EnvironmentDressing;
  private periscope: PeriscopeView | null = null;
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
  private xraySpike: XrayFloodingSpike | null = null;

  // QA 격리 경로 — 기지 화면 미리보기(?base=1)·보스 분절 스파이크(?bossSpike=1)
  private baseView: BaseSceneView | null = null;
  private bossSpike: BossSegmentSpike | null = null;
  // 경제·성장 UI QA 데모(?econdemo=1) — 실사용 배선 아님 (배지로 구분)
  private econDemo: EconomyUiQaDemo | null = null;
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

    this.scene.background = new THREE.Color(WATER_COLOR);
    this.scene.fog = new THREE.Fog(WATER_COLOR, FOG_NEAR, FOG_FAR);

    // 조명 예산 [확정 §12.2]: 실시간 조명 최대 2개 — 태양 방향광 1개만 사용.
    // 남은 1개는 서치라이트/폭발 겸용으로 비워 둔다. 환경광은 보조 베이스.
    const sun = new THREE.DirectionalLight(0xbfe3f2, 2.0);
    sun.position.set(4, 12, 3);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x1d3a47, 1.4));

    this.buildCanyonFromLayout();
    this.mountSubmarine();

    // 자기 선체(프로펠러·조준 소켓 포함 서브트리)를 전용 레이어에만 둔다.
    // 3인칭 카메라는 이 레이어를 켠 채 시작 — 조준 중에만 끈다 (13차 결의 3).
    this.submarine.root.traverse((node) => node.layers.set(SELF_HULL_LAYER));
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

    this.rig = new CameraRig(this.renderer.camera);
    // 렌더 검증용: ?lookup 플래그 시 카메라를 아래로 내려 해수면·실루엣 확인
    if (new URLSearchParams(window.location.search).has('lookup')) {
      this.rig.rotate(0, -0.62); // 잠수함 아래에서 올려다보는 앙각
    }

    this.shipDemoSnapshot = this.parseShipDemoSnapshot();
    this.mountXraySpikeIfRequested();
    this.mountBossSpikeIfRequested();
    this.mountBaseViewIfRequested();
    this.mountEconDemoIfRequested();

    // `?aimdemo=1` — 어뢰 조준경 **표시 고정** QA 플래그: 조준경·조준 카메라·
    // 선체 레이어 제외를 임의 심도에서 정지 검수한다. 게임플레이 조준 판정
    // (전 심도 진입 — 창2 작업)과 무관한 렌더 검수 전용이며, 정식
    // aimModeChanged 이벤트가 오면 그 상태가 우선한다 (?shipdemo 관례).
    if (new URLSearchParams(window.location.search).get('aimdemo') === '1') {
      this.ensurePeriscope().setAiming(true);
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
      console.info(
        `[CanyonScene] 보스 분절 스파이크 장착 (?bossSpike=1${useFallback ? '&bossMotion=b' : ''}).`,
      );
    } catch (error) {
      this.bossSpike = null;
      console.warn('[CanyonScene] 보스 스파이크 초기화 실패 — 기본 장면은 계속 작동합니다.', error);
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

  /** 게임플레이 포즈 상태(계약 SubmarinePoseSource) 연결점 — 렌더는 소비만 한다 */
  attachPoseSource(source: SubmarinePoseSource): void {
    this.poseSource = source;
  }

  /** 화물선 상태(계약 CargoShipStateSource) 연결점 — composition root가 1회 주입 */
  attachCargoShipSource(source: CargoShipStateSource): void {
    this.cargoShipSource = source;
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
  attachSalvageSource(source: SalvageStateSource, pickupRadiusMeters: number): void {
    this.salvageVisuals.setPickupRadiusMeters(pickupRadiusMeters);
    this.salvageVisuals.attachSource(source);
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
    // 조준경: 게임플레이가 발행한 조준 상태만 소비 — 렌더 독자 전환 없음
    this.unsubscribeAimMode?.();
    this.unsubscribeAimMode = bus.on('aimModeChanged', (payload) => {
      this.ensurePeriscope().setAiming(payload.aiming);
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

  /** 카메라 입력 어댑터(CameraInputAdapter) 연결용 */
  get cameraRig(): CameraRig {
    return this.rig;
  }

  update(deltaSeconds: number): void {
    // 경제 UI QA 데모 — 장면과 무관한 DOM 갱신 (기지 미리보기와도 병행)
    this.econDemo?.update();
    // 기지 화면 미리보기(?base=1) — 협곡 장면 대신 기지 장면만 갱신 (QA 경로)
    if (this.baseView) {
      this.baseView.update(deltaSeconds);
      return;
    }
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
    this.propeller.update(
      deltaSeconds,
      this.poseSource?.forwardSpeedMetersPerSecond ?? 0,
      this.movementParams,
    );

    this.seaSurface.update(deltaSeconds);
    this.environment.update(deltaSeconds);
    this.torpedoVisuals.update(deltaSeconds, this.torpedoSource);
    this.salvageVisuals.update(deltaSeconds);
    this.periscope?.update(deltaSeconds);
    this.updateLeadIndicator();
    this.updateCargoShip(deltaSeconds);
    this.updateFogByCameraDepth();
    this.xraySpike?.update(deltaSeconds);
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

  /** 수면 위/아래에 따른 배경·포그 전환 (반사·굴절 없음 — 색·포그 차이만) */
  private updateFogByCameraDepth(): void {
    const above = this.renderer.camera.position.y > this.layout.seaSurfaceY;
    if (above === this.cameraAboveSurface) return;
    this.cameraAboveSurface = above;

    const fog = this.scene.fog as THREE.Fog;
    if (above) {
      (this.scene.background as THREE.Color).set(SKY_COLOR);
      fog.color.set(SKY_COLOR);
      fog.near = ABOVE_FOG_NEAR;
      fog.far = ABOVE_FOG_FAR;
    } else {
      (this.scene.background as THREE.Color).set(WATER_COLOR);
      fog.color.set(WATER_COLOR);
      fog.near = FOG_NEAR;
      fog.far = FOG_FAR;
    }
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
    // 조준 카메라 레이어 복원 — 장면 수명과 함께 마스크 상태를 남기지 않는다
    this.renderer.camera.layers.enable(SELF_HULL_LAYER);
    this.unsubscribeParamsReload?.();
    this.unsubscribeParamsReload = null;
    this.unsubscribeTorpedoHit?.();
    this.unsubscribeTorpedoHit = null;
    this.unsubscribeAimMode?.();
    this.unsubscribeAimMode = null;
    this.baseView?.dispose();
    this.baseView = null;
    this.econDemo?.dispose();
    this.econDemo = null;
    this.bossSpike?.dispose();
    this.bossSpike = null;
    this.periscope?.dispose();
    this.periscope = null;
    this.xraySpike?.dispose();
    this.xraySpike = null;
    this.cargoShip?.removeAndDispose();
    this.cargoShip = null;
    this.torpedoVisuals.dispose();
    this.salvageVisuals.dispose();
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
    const floorGeometry = new THREE.BoxGeometry(240, 1, 240);
    const floorMaterial = new THREE.MeshLambertMaterial({
      color: FLOOR_COLOR,
      flatShading: true,
    });
    this.disposables.push(floorGeometry, floorMaterial);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = this.layout.floorY - 0.5;
    this.scene.add(floor);

    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const wallMaterial = new THREE.MeshLambertMaterial({
      color: WALL_COLOR,
      flatShading: true,
    });
    this.disposables.push(unitBox, wallMaterial);

    for (const block of this.layout.blocks) {
      const mesh = new THREE.Mesh(unitBox, wallMaterial);
      mesh.scale.set(block.sizeX, block.sizeY, block.sizeZ);
      // 계약 규약: 블록 바닥이 floorY — 중심 Y = floorY + sizeY/2
      mesh.position.set(block.x, this.layout.floorY + block.sizeY / 2, block.z);
      mesh.rotation.y = block.rotationY;
      this.scene.add(mesh);
    }
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
