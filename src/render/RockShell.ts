/**
 * 협곡 암벽 시각 셸 — 직육면체 충돌 블록을 자연스러운 저폴리 암벽으로
 * 표현하는 **렌더 전용** 지오메트리 빌더.
 *
 * 경계 [INT-CORE-004]:
 *  - 충돌은 여전히 계약 blocks(축 정렬 박스)를 그대로 쓴다 — 이 모듈은
 *    렌더 메시 형태만 바꾸며 판정에 관여하지 않는다.
 *  - 시각 경계는 충돌 경계에서 최대 ±약 7%(축당 ≤0.7m) 안에 머문다:
 *    통로 안으로 과도하게 돌출하지 않고, 보이지 않는 벽도 만들지 않는다.
 *  - 상단 변위는 **아래 방향만** — 시각 능선이 충돌 상단보다 높아지지 않아
 *    '보이는데 안 막히는' 능선이 생기지 않는다.
 *
 * 형태 규칙 (아트 타깃 — 기울어진 상단·잘린 모서리·비정형 암석 면):
 *  - 서브디비전 박스(2×3×2)에 **위치 기반 결정적 변위**를 건다. 변위가
 *    정점 위치의 순수 함수라 면 사이 중복 정점이 같은 값으로 움직여
 *    균열(crack)이 생기지 않는다.
 *  - 변형 패밀리 4종(시드 = 블록 인덱스 % 4) — 재사용 가능한 형태 언어를
 *    유지하면서 블록마다 크기·UV는 개별(월드 미터 규약).
 *  - 작은 돌 수백 개 금지 — 큰 형태 우선, 블록당 메시 1개(드로우 불변).
 */

import * as THREE from 'three';
import type { CanyonBlockDescriptor } from '../contracts/layout';

/** 결정적 의사 난수 — 시드·좌표의 순수 함수 (Math.random 미사용) */
function hashNoise(x: number, y: number, z: number, seed: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 141.7) * 43758.5453;
  return v - Math.floor(v); // 0..1
}

/** 부드러운 변위 노이즈 (-1..1) — 저주파 sin 합성 (패밀리별 위상) */
function smoothNoise(px: number, py: number, pz: number, seed: number): number {
  return (
    Math.sin(px * 5.1 + seed * 2.3 + pz * 3.7) * 0.55 +
    Math.sin(py * 4.3 + seed * 5.1 + px * 2.9) * 0.3 +
    Math.sin(pz * 6.7 + seed * 3.7 + py * 5.3) * 0.15
  );
}

/**
 * 블록 1개의 암벽 셸 지오메트리 — 호출 측이 dispose를 관리한다.
 * UV는 월드 미터 단위(그룹별 면 치수 스케일) — 텍스처 repeat=1/tileMeters
 * 규약(sceneTextures)과 합치.
 */
export function buildRockShellGeometry(
  block: CanyonBlockDescriptor,
  blockIndex: number,
): THREE.BufferGeometry {
  const family = blockIndex % 4; // 변형 패밀리 4종
  const geometry = new THREE.BoxGeometry(block.sizeX, block.sizeY, block.sizeZ, 2, 3, 2);

  // ── 월드 미터 UV (그룹 = 면 순서 px,nx,py,ny,pz,nz) ──
  const faceScales: Array<[number, number]> = [
    [block.sizeZ, block.sizeY],
    [block.sizeZ, block.sizeY],
    [block.sizeX, block.sizeZ],
    [block.sizeX, block.sizeZ],
    [block.sizeX, block.sizeY],
    [block.sizeX, block.sizeY],
  ];
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const index = geometry.getIndex()!;
  for (let g = 0; g < geometry.groups.length; g += 1) {
    const group = geometry.groups[g]!;
    const scale = faceScales[g]!;
    const seen = new Set<number>();
    for (let i = group.start; i < group.start + group.count; i += 1) {
      const vertex = index.getX(i);
      if (seen.has(vertex)) continue;
      seen.add(vertex);
      uv.setXY(vertex, uv.getX(vertex) * scale[0], uv.getY(vertex) * scale[1]);
    }
  }
  uv.needsUpdate = true;

  // ── 위치 기반 결정적 변위 ──
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  // 수평 변위 상한: 축 크기의 7%·최대 0.7m (충돌 경계와의 시각 오차 상한)
  const maxX = Math.min(block.sizeX * 0.07, 0.7);
  const maxZ = Math.min(block.sizeZ * 0.07, 0.7);
  // 상단 기울기(패밀리별 방향) — 아래로만 깎는다 (충돌 상단 초과 금지)
  const slopeX = Math.cos(family * 1.9 + blockIndex) * 0.9;
  const slopeZ = Math.sin(family * 2.6 + blockIndex * 0.7) * 0.9;
  const topDrop = Math.min(block.sizeY * 0.1, 2.2);

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    // 정규화 좌표 (-0.5..0.5) — 변위는 이 좌표의 순수 함수 (crack 없음)
    const nx = x / block.sizeX;
    const ny = y / block.sizeY;
    const nz = z / block.sizeZ;

    // 측면 요철 — 넓은 비정형 면·후퇴/돌출 (상하로 갈수록 완화)
    const bulge = smoothNoise(nx, ny * 2.2, nz, family);
    let outX = x + bulge * maxX * Math.sign(nx || 1) * (Math.abs(nx) > 0.25 ? 1 : 0.3);
    let outZ = z + smoothNoise(nz, ny * 1.8, nx, family + 7) * maxZ * Math.sign(nz || 1) * (Math.abs(nz) > 0.25 ? 1 : 0.3);

    // 층리형 선반 — 수평 밴드에서 살짝 후퇴 (낮은 수, 텍스처 층리와 합)
    const shelf = Math.sin(ny * Math.PI * 3 + family) > 0.82 ? -0.18 : 0;
    outX += shelf * Math.sign(nx || 1);
    outZ += shelf * Math.sign(nz || 1);

    // 상단 처리 — 기울어진 상단 + 모서리 컷 (아래 방향만)
    let outY = y;
    if (ny > 0.45) {
      const tilt = (nx * slopeX + nz * slopeZ + 1) * 0.5; // 0..1
      const cornerCut = Math.abs(nx) + Math.abs(nz) > 0.7 ? 0.35 : 0;
      const jitter = hashNoise(nx, 0, nz, family) * 0.25;
      outY = y - topDrop * (tilt * 0.75 + cornerCut + jitter);
    }

    position.setXYZ(i, outX, outY, outZ);
  }
  position.needsUpdate = true;
  // flatShading Lambert는 화면 공간 미분 노멀을 쓰므로 노멀 재계산 불필요 —
  // 비-flat 소비 대비 안전값만 갱신한다
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 해저 바닥 시각 지오메트리 — 완만한 굴곡의 서브디비전 평면 (충돌 무관).
 * 굴곡 진폭 ±0.35m — 잠항 하한(floorY + 선체 반경 0.9m)보다 낮아 시각
 * 융기가 이동을 방해하는 것처럼 보이지 않는다. UV는 월드 미터.
 */
export function buildSeabedGeometry(sizeMeters: number): THREE.BufferGeometry {
  const segments = 40;
  const geometry = new THREE.PlaneGeometry(sizeMeters, sizeMeters, segments, segments);
  geometry.rotateX(-Math.PI / 2); // XZ 평면, +Y 위
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    // 저주파 완만 굴곡 + 미세 잔결 — 결정적 (난수 없음)
    const height =
      Math.sin(x * 0.045 + z * 0.03) * 0.22 +
      Math.sin(x * 0.11 - z * 0.07 + 1.7) * 0.09 +
      Math.sin(z * 0.19 + x * 0.05 + 4.2) * 0.04;
    position.setY(i, height);
  }
  position.needsUpdate = true;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * sizeMeters, uv.getY(i) * sizeMeters);
  }
  uv.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
