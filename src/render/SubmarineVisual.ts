/**
 * 잠수함 시각 오브젝트 + 외형 단계 어댑터 (PvE 성장 외형 — 6차·11차 결의).
 *
 * 규칙:
 *  - 외형 단계는 **명시적 visualTier(1~3)를 주입**받아 표현만 한다 —
 *    업그레이드 수치·저장 데이터를 읽거나 계산하지 않는다 (판정·경제는
 *    게임플레이·메타 소유).
 *  - 선체(hull)·주무장(weapon) 단계를 각각 최대 3단계 표현.
 *  - 임시 로우폴리 차이 구현 — **최종 에셋 교체 지점은 buildHullTierParts /
 *    buildWeaponTierParts 두 함수로 격리**되어 있다 (아트 산출물 도착 시
 *    이 두 함수 내부만 교체, setVisualTiers API·부착 규약은 불변).
 *  - 기본형 형상은 **플레이어 잠수함 다중 뷰 레퍼런스 시트** 기준: 이중 도장
 *    압력 선체(상부 청회/하부 네이비) + 갑판 스트립 + 함교(스커트·주황 식별
 *    패널) + 선수 조타면 + 선미 십자 안정판 + 덕트형 단일 프로펠러 + 모듈
 *    부착 하드포인트 패드(기능 없음 — 시각 부착면). 재질군 3개(도장 선체·
 *    어두운 철·주황 액센트), 재질별 지오메트리 병합으로 기본형 메시 3개.
 *  - 선수·선미 규약: 로컬 -Z = 선수, +Z = 선미 (core/conventions).
 *    프로펠러 장착점은 sternMountZ로 노출한다.
 *
 * 단계 부품은 생성 시 전부 만들어 visible 토글로 전환한다 — 런타임 재생성
 * 없음, dispose 1회 일괄.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TORPEDO_TUBE_ANCHOR } from '../world/torpedoTubeAnchor';
import { buildDotTexture } from './DriftParticles';
import { onSceneTexture } from './sceneTextures';
import visualParams from './renderVisualParams.json';

/**
 * 아트 디렉션 팔레트 (renderVisualParams.json 소유 — 코드에 수치 복제 금지):
 * 선체 상부는 한랭 청회색·하부는 어두운 네이비(레퍼런스 시트 이중 도장),
 * 장비·프로펠러는 어두운 철, 식별 액센트는 제한적 주황.
 */
const ART = visualParams.artDirection;
/** 선체 반長 — 프로펠러(선미 +Z) 장착 위치 (시각 상수) */
const SUBMARINE_HALF_LENGTH = 2.8;

/**
 * 선체 재질 셰이더 주입 — 두 효과를 하나의 onBeforeCompile로 합성한다
 * (onBeforeCompile은 재질당 1슬롯 — 나눠 대입하면 마지막 것만 남는다).
 *  - 프레넬 림: 추가 광원·드로우 없이 차가운 윤곽 분리 (아트 타깃 문법).
 *  - 이중 도장(twoTone): 로컬 Y가 분할선 아래면 하부 네이비 틴트를 곱한다 —
 *    레퍼런스 시트의 상/하부 도장 분리를 재질·드로우 추가 없이 표현.
 *    로컬 Y 기준이라 지오메트리는 **루트 원점 좌표로 구운(bake) 것만** 이
 *    재질을 쓴다 (mesh.position 오프셋이 있으면 분할선이 어긋난다).
 */
function applyHullShaderMods(
  material: THREE.MeshLambertMaterial,
  effects: { rim: boolean; twoTone: boolean },
): void {
  if (!effects.rim && !effects.twoTone) return;
  const upper = new THREE.Color(ART.materials.hullColor);
  const lower = new THREE.Color(ART.hullTwoTone.lowerColor);
  // 하부 틴트 = lower/upper (성분별) — diffuse(색×텍스처)에 곱해 텍스처 유지
  const lowerTint = new THREE.Color(
    lower.r / Math.max(upper.r, 1e-3),
    lower.g / Math.max(upper.g, 1e-3),
    lower.b / Math.max(upper.b, 1e-3),
  );
  material.onBeforeCompile = (shader) => {
    if (effects.rim) {
      shader.uniforms['rimColor'] = { value: new THREE.Color(ART.rim.color) };
      shader.uniforms['rimStrength'] = { value: ART.rim.strength };
      shader.uniforms['rimPower'] = { value: ART.rim.power };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          [
            '#include <common>',
            'uniform vec3 rimColor;',
            'uniform float rimStrength;',
            'uniform float rimPower;',
          ].join('\n'),
        )
        .replace(
          '#include <opaque_fragment>',
          [
            'float rimFacing = saturate(dot(normalize(vViewPosition), normalize(normal)));',
            'outgoingLight += rimColor * (rimStrength * pow(1.0 - rimFacing, rimPower));',
            '#include <opaque_fragment>',
          ].join('\n'),
        );
    }
    if (effects.twoTone) {
      shader.uniforms['hullLowerTint'] = { value: lowerTint };
      shader.uniforms['hullSplitY'] = { value: ART.hullTwoTone.splitLocalY };
      shader.uniforms['hullSplitBlend'] = { value: ART.hullTwoTone.blendMeters };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying float vHullLocalY;',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvHullLocalY = position.y;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          [
            '#include <common>',
            'varying float vHullLocalY;',
            'uniform vec3 hullLowerTint;',
            'uniform float hullSplitY;',
            'uniform float hullSplitBlend;',
          ].join('\n'),
        )
        .replace(
          '#include <map_fragment>',
          [
            '#include <map_fragment>',
            'float hullUpperMix = smoothstep(hullSplitY - hullSplitBlend, hullSplitY + hullSplitBlend, vHullLocalY);',
            'diffuseColor.rgb *= mix(hullLowerTint, vec3(1.0), hullUpperMix);',
          ].join('\n'),
        );
    }
  };
}

/** 저사양 fallback용 연출 스위치 — 기본은 전체 연출 (renderQuality가 결정) */
export interface SubmarineVisualOptions {
  readonly rimEnabled?: boolean;
  readonly navGlowEnabled?: boolean;
}

/**
 * 어뢰관 앵커 — 모델이 정의하는 단일 지점 (13차 결의 2: 앵커는 모델 정의,
 * 파생 소켓은 앵커에서만 파생). 로컬 -Z = 선수 규약(core/conventions).
 * 선수 하부 어뢰관 군의 중앙 — 최종 에셋 교체 시 이 값만 갱신한다.
 */
/**
 * 발사관 앵커(로컬) — **공식 정본 `src/world/torpedoTubeAnchor.ts`에서 파생**한다.
 * 렌더가 위치 숫자를 따로 소유하지 않는다 (스프린트 A 정규화: 구 렌더 값
 * {0, -0.5, -2.6}은 정본 {0, 0, -2.8}과 달라 조준 시점과 탄도가 어긋났다).
 * 이 값은 **시각적 부모**(모델 부착점)로만 쓰이며, 조준 카메라의 실제 위치·
 * 방향은 composition root가 주입하는 소켓 rig가 결정한다.
 */
const TORPEDO_TUBE_ANCHOR_LOCAL = Object.freeze({
  x: TORPEDO_TUBE_ANCHOR.localX,
  y: TORPEDO_TUBE_ANCHOR.localY,
  z: TORPEDO_TUBE_ANCHOR.localZ,
});

export type VisualTier = 1 | 2 | 3;

function clampTier(value: number): VisualTier {
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  return 1;
}

export class SubmarineVisual {
  readonly root = new THREE.Group();
  /** 프로펠러 장착 Z (선미) */
  readonly sternMountZ = SUBMARINE_HALF_LENGTH + 0.15;
  /** 어뢰관 앵커 로컬 좌표 — 계약 이관(INT-RENDER-008) 시 참조용 공개 값 */
  readonly torpedoTubeAnchorLocal = TORPEDO_TUBE_ANCHOR_LOCAL;
  /**
   * 조준 카메라 소켓 (13차 결의 2) — 어뢰관 앵커 **정위치**, 전방축은 모델
   * 전방(-Z)과 동일. 별도 오프셋 없음 — 소비 측(조준 카메라)은 이 소켓의
   * 월드 위치·방향을 그대로 사용해야 하며 독자 오프셋 계산 금지.
   */
  readonly aimCameraSocket = new THREE.Object3D();

  private readonly disposables: Array<{ dispose(): void }> = [];
  /** 단계별 부품 그룹 — [0]=2단계 추가분, [1]=3단계 추가분 (1단계 = 기본형) */
  private readonly hullTierParts: THREE.Group[] = [];
  private readonly weaponTierParts: THREE.Group[] = [];

  constructor(options: SubmarineVisualOptions = {}) {
    const material = new THREE.MeshLambertMaterial({
      color: ART.materials.hullColor,
      emissive: ART.materials.hullEmissive,
      flatShading: true,
    });
    const accentMaterial = new THREE.MeshLambertMaterial({
      color: ART.materials.accentColor,
      emissive: ART.materials.accentEmissive,
      flatShading: true,
    });
    const ironMaterial = new THREE.MeshLambertMaterial({
      color: ART.materials.ironColor,
      emissive: ART.materials.ironEmissive,
      flatShading: true,
    });
    const rim = options.rimEnabled ?? true;
    applyHullShaderMods(material, { rim, twoTone: true });
    applyHullShaderMods(accentMaterial, { rim, twoTone: false });
    applyHullShaderMods(ironMaterial, { rim, twoTone: false });
    // 공통 금속 base color (선박·기지와 공유 텍스처 1장 — GPU 업로드 1회).
    // 기능별 슬롯(선체/액센트)은 material 인스턴스 그대로 유지되고 map만
    // 공유한다 — 색·림·emissive 계약 불변, 로딩 실패 시 단색 유지.
    onSceneTexture('metal', (texture) => {
      material.map = texture;
      material.needsUpdate = true;
      accentMaterial.map = texture;
      accentMaterial.needsUpdate = true;
      ironMaterial.map = texture;
      ironMaterial.needsUpdate = true;
    });
    this.disposables.push(material, accentMaterial, ironMaterial);

    // ── 기본형(1단계) — 레퍼런스 시트 대응 로우폴리 (재질군 3개, 메시 3개) ──
    // 모든 변환을 지오메트리에 굽고(bake) 재질별로 병합한다: 드로우 콜 최소화
    // + 이중 도장 셰이더의 로컬 Y 기준 충족. 치수는 기존 실루엣(반長 2.8 ·
    // 반경 0.9)을 유지한다 — 게임 스케일·충돌 캡슐 전제 불변.

    // [선체 재질군] 압력 선체 + 함교 + 갑판 스트립 + 선수 조타면(좌우 관통 1개)
    const hullCapsule = new THREE.CapsuleGeometry(0.9, 3.8, 3, 10);
    hullCapsule.rotateX(Math.PI / 2); // 캡슐 축(Y)을 전후 방향(Z)으로
    const sailBox = new THREE.BoxGeometry(0.7, 0.95, 1.7);
    sailBox.translate(0, 1.17, -0.5);
    const deckStrip = new THREE.BoxGeometry(0.5, 0.12, 3.2);
    deckStrip.translate(0, 0.86, -0.2);
    const bowPlanes = new THREE.BoxGeometry(2.7, 0.08, 0.6);
    bowPlanes.translate(0, 0, -1.5);
    const hullGeometry = mergeGeometries([hullCapsule, sailBox, deckStrip, bowPlanes]);
    hullCapsule.dispose(); sailBox.dispose(); deckStrip.dispose(); bowPlanes.dispose();
    this.disposables.push(hullGeometry);
    this.root.add(new THREE.Mesh(hullGeometry, material));

    // [철 재질군] 함교 스커트 + 선미 십자 안정판 + 프로펠러 덕트 링 +
    // 모듈 부착 하드포인트 패드 3개 (기능 없음 — 시각 부착면만, §6.4 준수:
    // 상위 단계 파츠(buildHull/WeaponTierParts)가 이 위치에 겹쳐 장착된다)
    const sailSkirt = new THREE.BoxGeometry(0.82, 0.2, 1.85);
    sailSkirt.translate(0, 0.72, -0.5);
    const stabVertical = new THREE.BoxGeometry(0.09, 2.3, 0.55);
    stabVertical.translate(0, 0, 2.45);
    const stabHorizontal = new THREE.BoxGeometry(2.3, 0.09, 0.55);
    stabHorizontal.translate(0, 0, 2.45);
    const propDuct = new THREE.TorusGeometry(0.55, 0.075, 6, 16);
    propDuct.translate(0, 0, this.sternMountZ);
    const padSide = new THREE.BoxGeometry(0.06, 0.34, 1.0);
    const padLeft = padSide.clone(); padLeft.translate(-0.88, 0.3, -0.6);
    const padRight = padSide.clone(); padRight.translate(0.88, 0.3, -0.6);
    const padTop = new THREE.BoxGeometry(0.34, 0.05, 1.2);
    padTop.translate(0, 0.9, 0.9);
    const ironGeometry = mergeGeometries([
      sailSkirt, stabVertical, stabHorizontal, propDuct, padLeft, padRight, padTop,
    ]);
    for (const g of [sailSkirt, stabVertical, stabHorizontal, propDuct, padSide, padLeft, padRight, padTop]) g.dispose();
    this.disposables.push(ironGeometry);
    this.root.add(new THREE.Mesh(ironGeometry, ironMaterial));

    // [액센트 재질군] 주황 식별 패널 — 함교 측면(좌우 관통 1개) + 선체 측면
    const sailPanels = new THREE.BoxGeometry(0.74, 0.18, 0.3);
    sailPanels.translate(0, 1.3, -0.15);
    const hullPanels = new THREE.BoxGeometry(1.84, 0.14, 0.26);
    hullPanels.translate(0, 0.15, 0.7);
    const accentGeometry = mergeGeometries([sailPanels, hullPanels]);
    sailPanels.dispose(); hullPanels.dispose();
    this.disposables.push(accentGeometry);
    this.root.add(new THREE.Mesh(accentGeometry, accentMaterial));

    this.aimCameraSocket.position.set(
      TORPEDO_TUBE_ANCHOR_LOCAL.x,
      TORPEDO_TUBE_ANCHOR_LOCAL.y,
      TORPEDO_TUBE_ANCHOR_LOCAL.z,
    );
    this.root.add(this.aimCameraSocket);

    if (options.navGlowEnabled ?? true) {
      this.mountNavGlow();
    }

    this.buildHullTierParts(material, accentMaterial);
    this.buildWeaponTierParts(accentMaterial);
    this.setVisualTiers(1, 1);
  }

  /**
   * 외형 단계 적용 — 메타 상태(리드 제공 visualTier)를 주입받는 유일한 API.
   * 렌더는 단계 값을 계산하지 않는다.
   */
  setVisualTiers(hullTier: number, weaponTier: number): void {
    const hull = clampTier(hullTier);
    const weapon = clampTier(weaponTier);
    this.hullTierParts.forEach((part, index) => {
      part.visible = hull >= index + 2;
    });
    this.weaponTierParts.forEach((part, index) => {
      part.visible = weapon >= index + 2;
    });
  }

  /**
   * 항법등 글로우 — 함교 상단·선미 2점, `THREE.Points` 1개(= 드로우 콜 1)의
   * 가산 스프라이트. 아트 타깃의 '제한적 주황 식별색'을 광원 추가 없이
   * 표현한다 (조명 예산 불변, 실제 bloom 미사용 — emissive·가산 대체).
   */
  private mountNavGlow(): void {
    const positions = new Float32Array([
      0, 1.78, -0.5, // 함교 상단 (레퍼런스 시트 함교 높이 기준)
      0, 0.45, SUBMARINE_HALF_LENGTH - 0.3, // 선미 상부
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const texture = buildDotTexture();
    const material = new THREE.PointsMaterial({
      map: texture,
      color: ART.navGlow.color,
      size: ART.navGlow.sizeMeters,
      transparent: true,
      opacity: ART.navGlow.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.disposables.push(geometry, material, texture);
    const glow = new THREE.Points(geometry, material);
    glow.renderOrder = 3; // 반투명 서열: 수면·부유물과 같은 층
    this.root.add(glow);
  }

  /**
   * [최종 에셋 교체 지점 ①] 선체 외형 단계 임시 로우폴리 —
   * 2단계: 측면 새들 탱크 / 3단계: 선수 보강판 + 상부 장갑 능선.
   */
  private buildHullTierParts(
    material: THREE.Material,
    accentMaterial: THREE.Material,
  ): void {
    const tier2 = new THREE.Group();
    const saddleGeometry = new THREE.CapsuleGeometry(0.28, 2.4, 2, 6);
    saddleGeometry.rotateX(Math.PI / 2);
    this.disposables.push(saddleGeometry);
    for (const side of [-1, 1]) {
      const saddle = new THREE.Mesh(saddleGeometry, material);
      saddle.position.set(side * 0.95, -0.15, 0.2);
      tier2.add(saddle);
    }

    const tier3 = new THREE.Group();
    const bowPlateGeometry = new THREE.BoxGeometry(1.0, 0.7, 0.9);
    const ridgeGeometry = new THREE.BoxGeometry(0.25, 0.3, 2.6);
    this.disposables.push(bowPlateGeometry, ridgeGeometry);
    const bowPlate = new THREE.Mesh(bowPlateGeometry, accentMaterial);
    bowPlate.position.set(0, 0.1, -2.3);
    bowPlate.rotation.x = 0.25;
    tier3.add(bowPlate);
    const ridge = new THREE.Mesh(ridgeGeometry, accentMaterial);
    ridge.position.set(0, 0.85, 0.9);
    tier3.add(ridge);

    this.hullTierParts.push(tier2, tier3);
    this.root.add(tier2, tier3);
  }

  /**
   * [최종 에셋 교체 지점 ②] 주무장 외형 단계 임시 로우폴리 —
   * 2단계: 선수 하부 쌍발 어뢰관 / 3단계: 외장 어뢰 랙 + 관 증설.
   */
  private buildWeaponTierParts(accentMaterial: THREE.Material): void {
    const tubeGeometry = new THREE.CylinderGeometry(0.14, 0.14, 1.1, 8);
    tubeGeometry.rotateX(Math.PI / 2);
    const rackGeometry = new THREE.BoxGeometry(0.5, 0.24, 1.6);
    this.disposables.push(tubeGeometry, rackGeometry);

    const tier2 = new THREE.Group();
    for (const side of [-1, 1]) {
      const tube = new THREE.Mesh(tubeGeometry, accentMaterial);
      tube.position.set(side * 0.38, -0.5, -2.15);
      tier2.add(tube);
    }

    const tier3 = new THREE.Group();
    for (const side of [-1, 1]) {
      const rack = new THREE.Mesh(rackGeometry, accentMaterial);
      rack.position.set(side * 1.0, 0.35, -0.6);
      tier3.add(rack);
      const tube = new THREE.Mesh(tubeGeometry, accentMaterial);
      tube.position.set(side * 0.7, -0.55, -2.0);
      tier3.add(tube);
    }

    this.weaponTierParts.push(tier2, tier3);
    this.root.add(tier2, tier3);
  }

  dispose(): void {
    for (const resource of this.disposables) {
      resource.dispose();
    }
    this.disposables.length = 0;
    this.root.removeFromParent();
    this.root.clear();
  }
}
