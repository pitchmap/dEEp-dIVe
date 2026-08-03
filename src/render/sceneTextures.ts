/**
 * 장면 공유 텍스처 로더 — 아트 후보(암벽·퇴적물·산업 금속) base color 적용.
 *
 * 설계 원칙:
 *  - **텍스처 3장 = GPU 업로드 3회.** 종류당 `THREE.Texture` 인스턴스를 1개만
 *    만들어 모든 소비 재질이 공유한다 (clone 금지 — clone은 GPU 복제를 만든다).
 *    material 인스턴스는 기존 것을 유지하고 `map`만 뒤에서 채우므로
 *    드로우 콜 수는 변하지 않는다.
 *  - **중립화 albedo × material.color.** 에셋은 오프라인에서 평균을 회색
 *    (~205/255)으로 중립화·조명 저주파 제거·edge 블렌드(이음새 0)를 거쳤다.
 *    최종 색은 기존 아트 팔레트(material.color)가 그대로 결정한다 — 따라서
 *    로딩 실패 시의 단색 fallback과 색 계약이 어긋나지 않는다.
 *  - **로딩 실패 = 기존 단색 유지.** 콜백은 onLoad에서만 실행된다. 실패는
 *    경고 로그만 남기고 재질은 손대지 않는다 (렌더 중단 없음).
 *  - **UV 규약**: wall/floor 지오메트리는 UV가 **월드 미터** 단위로 구성된다
 *    (CanyonScene 참조) → repeat = 1/tileMeters 로 텍스처별 반복 배율을
 *    params에서 독립 조절한다. metal은 기존 0..1 UV 그대로 + repeat 값.
 *  - **압축 포맷**: KTX2/Basis 등 GPU 압축 컨테이너는 도입하지 않는다
 *    (트랜스코더 의존 회피 — 지원되지 않는 형식에 의존 금지). 파일은 모든
 *    대상 브라우저가 디코드하는 WebP, GPU에는 비압축 RGBA + mipmap.
 *  - **품질 사다리**: `?quality=low`면 512 버전, 표준은 텍스처별 지정 크기
 *    (벽·바닥 1024, 금속 512 — 금속은 평활해 512로 충분).
 *
 * 수치(파일명·타일 미터·반복·anisotropy)는 전부 renderVisualParams.json
 * artDirection.textures 소유 — 코드에 복제하지 않는다.
 */

import * as THREE from 'three';
import { parseRenderQuality } from './renderQuality';
import visualParams from './renderVisualParams.json';

const TEX = visualParams.artDirection.textures;

export type SceneTextureKind = 'wall' | 'floor' | 'metal' | 'marks';

interface Slot {
  texture: THREE.Texture | null;
  failed: boolean;
  pending: Array<(texture: THREE.Texture) => void>;
}

const slots: Record<SceneTextureKind, Slot> = {
  wall: { texture: null, failed: false, pending: [] },
  floor: { texture: null, failed: false, pending: [] },
  metal: { texture: null, failed: false, pending: [] },
  marks: { texture: null, failed: false, pending: [] },
};
let initialized = false;

function configure(
  texture: THREE.Texture,
  repeatU: number,
  repeatV: number,
  maxAnisotropy: number,
  wrap: 'repeat' | 'clamp',
): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  if (wrap === 'repeat') {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  } else {
    // 아틀라스 — 셀 밖 샘플링 방지 (기본 clamp 유지 + repeat 1)
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  }
  texture.repeat.set(repeatU, repeatV);
  // mipmap은 기본 활성(LinearMipmapLinear) — PoT 에셋 전제
  texture.anisotropy = Math.max(1, Math.min(TEX.anisotropy, maxAnisotropy));
}

/**
 * 텍스처 로딩 시작 — composition 시점(장면 생성)에 호출한다. 멱등:
 * 첫 호출만 로딩을 시작하고 이후 호출은 무시된다 (장면 재생성·기지 화면
 * 병행 시 재로딩 없음 — 텍스처는 앱 수명 공유 자원).
 */
export function initSceneTextures(maxAnisotropy: number): void {
  if (initialized) return;
  initialized = true;

  const quality = parseRenderQuality(window.location.search);
  const loader = new THREE.TextureLoader();

  const specs: Array<{
    kind: SceneTextureKind;
    file: string;
    sizeStandard: number;
    repeatU: number;
    repeatV: number;
    wrap: 'repeat' | 'clamp';
  }> = [
    {
      kind: 'wall',
      file: TEX.wall.file,
      sizeStandard: TEX.wall.sizeStandard,
      repeatU: 1 / TEX.wall.tileMetersU,
      repeatV: 1 / TEX.wall.tileMetersV,
      wrap: 'repeat',
    },
    {
      kind: 'floor',
      file: TEX.floor.file,
      sizeStandard: TEX.floor.sizeStandard,
      repeatU: 1 / TEX.floor.tileMetersU,
      repeatV: 1 / TEX.floor.tileMetersV,
      wrap: 'repeat',
    },
    {
      kind: 'metal',
      file: TEX.metal.file,
      sizeStandard: TEX.metal.sizeStandard,
      repeatU: TEX.metal.repeatU,
      repeatV: TEX.metal.repeatV,
      wrap: 'repeat',
    },
    {
      // 세력 마크 아틀라스 — UV 셀 규격은 factionMarks.ts(markAtlasCell) 소유
      kind: 'marks',
      file: TEX.marks.file,
      sizeStandard: TEX.marks.sizeStandard,
      repeatU: 1,
      repeatV: 1,
      wrap: 'clamp',
    },
  ];

  for (const spec of specs) {
    const size = quality.textureSizeCap
      ? Math.min(quality.textureSizeCap, spec.sizeStandard)
      : spec.sizeStandard;
    const url = `${import.meta.env.BASE_URL}${TEX.basePath}${spec.file}_${size}.webp`;
    loader.load(
      url,
      (texture) => {
        configure(texture, spec.repeatU, spec.repeatV, maxAnisotropy, spec.wrap);
        const slot = slots[spec.kind];
        slot.texture = texture;
        for (const callback of slot.pending) callback(texture);
        slot.pending.length = 0;
      },
      undefined,
      () => {
        // 실패 격리 — 소비 재질은 기존 단색 그대로 유지된다.
        // 대기 콜백은 폐기한다 (동적 생성 소비자의 콜백 누적 방지).
        const slot = slots[spec.kind];
        slot.failed = true;
        slot.pending.length = 0;
        console.warn(
          `[sceneTextures] '${url}' 로딩 실패 — 단색 material fallback 유지.`,
        );
      },
    );
  }
}

/**
 * 텍스처 도착 구독 — 이미 로딩돼 있으면 즉시 실행, 아니면 도착 시 실행.
 * 로딩이 실패하면 영원히 호출되지 않는다 (= 단색 fallback 경로).
 */
export function onSceneTexture(
  kind: SceneTextureKind,
  callback: (texture: THREE.Texture) => void,
): void {
  const slot = slots[kind];
  if (slot.texture) {
    callback(slot.texture);
    return;
  }
  if (slot.failed) return; // 로딩 실패 확정 — 단색 유지, 콜백 미보관
  slot.pending.push(callback);
}

/** 동기 조회 — 로딩 전·실패 시 null (소비 측 fallback 분기용) */
export function getSceneTexture(kind: SceneTextureKind): THREE.Texture | null {
  return slots[kind].texture;
}

/**
 * BoxGeometry UV를 **월드 미터 단위**로 스케일한다 — 블록 크기와 무관하게
 * 균일한 텍셀 밀도를 만들기 위한 협곡 시각 mesh 전용 유틸.
 * (기존 공유 단위 박스 + scale 방식은 블록마다 텍스처가 늘어나 밀도가
 * 제각각이 된다.) 지오메트리만 바꾼다 — 배치·충돌 데이터 무변경.
 *
 * BoxGeometry 정점 배열은 면당 4정점, 면 순서 +X,-X,+Y,-Y,+Z,-Z 고정.
 * 면별 UV축이 담당하는 월드 치수: ±X면 (z,y) · ±Y면 (x,z) · ±Z면 (x,y).
 */
export function scaleBoxUvsToWorldMeters(
  geometry: THREE.BoxGeometry,
  sizeX: number,
  sizeY: number,
  sizeZ: number,
): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const faceScales: Array<[number, number]> = [
    [sizeZ, sizeY], // +X
    [sizeZ, sizeY], // -X
    [sizeX, sizeZ], // +Y
    [sizeX, sizeZ], // -Y
    [sizeX, sizeY], // +Z
    [sizeX, sizeY], // -Z
  ];
  for (let face = 0; face < 6; face += 1) {
    const scale = faceScales[face]!;
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const i = face * 4 + vertex;
      uv.setXY(i, uv.getX(i) * scale[0], uv.getY(i) * scale[1]);
    }
  }
  uv.needsUpdate = true;
}
