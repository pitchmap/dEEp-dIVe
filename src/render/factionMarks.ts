/**
 * 세력 마크 공유 표현 모듈 — 시안(사각=neutral · 삼각=hostile · 마름모=patrol)
 * 의 **형태 언어**를 DOM(CSS mask)과 WebGL(아틀라스 UV)에서 같은 좌표
 * 데이터로 표현한다.
 *
 * 자산 정렬 규약: `public/marks/*.svg`(원본)·`*.png`(알파)·
 * `public/textures/faction_marks_512.webp`(WebGL 아틀라스)는 모두 아래
 * MARK_PATHS와 **같은 좌표(viewBox 0..100)**에서 생성됐다 — DOM 마스크는
 * 이 좌표로 만든 인라인 SVG data URI를 쓰므로 네트워크 로딩 실패 경로가
 * 없고, 아틀라스와 형태가 항상 일치한다.
 *
 * 표시 규칙 (스프린트 B §10과 합성):
 *  - 형태가 1차 구분자, 색은 보조 — 회색조에서도 사각/삼각/마름모가 남는다.
 *  - 작은 표시 크기(원거리)는 내부 디테일을 제거한 단색 실루엣을 쓴다.
 *  - 미식별(unidentified)에는 세력 마크를 쓰지 않는다 — 기존 ◇ 규칙 유지.
 *
 * 경계: 세력 판정은 게임플레이 소유 — 이 모듈은 `FactionMarkShape`(시각
 * 형태 키)만 다루고 faction 판정을 하지 않는다.
 */

import type { FactionMarkShape } from './factionVisuals';

/** 마크 폴리곤 좌표 (viewBox 0..100) — 에셋 생성 스크립트와 동일 데이터 */
const MARK_PATHS: Readonly<
  Record<FactionMarkShape, { outer: string; holes: readonly string[] }>
> = {
  square: {
    outer: 'M12 12 L88 12 L88 88 L12 88 Z',
    holes: ['M28 42 L72 42 L72 58 L28 58 Z'],
  },
  triangle: {
    outer: 'M50 6 L94 90 L6 90 Z',
    holes: ['M50 42 L66 74 L34 74 Z'],
  },
  diamond: {
    outer: 'M50 4 L96 50 L50 96 L4 50 Z',
    holes: ['M40 30 L40 70 L18 50 Z', 'M60 30 L60 70 L82 50 Z'],
  },
};

function buildMaskDataUri(shape: FactionMarkShape, solid: boolean): string {
  const paths = MARK_PATHS[shape];
  const d = solid ? paths.outer : [paths.outer, ...paths.holes].join(' ');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path d="${d}" fill="%23fff" fill-rule="evenodd"/></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'")}")`;
}

/** data URI 캐시 — 마스크 6종(3형태 × 디테일/솔리드) */
const MASK_URI: Record<string, string> = {};
for (const shape of ['square', 'triangle', 'diamond'] as const) {
  MASK_URI[`${shape}:detail`] = buildMaskDataUri(shape, false);
  MASK_URI[`${shape}:solid`] = buildMaskDataUri(shape, true);
}

let maskSupportCache: boolean | null = null;

/** CSS mask 지원 여부 — 미지원이면 소비 측이 기존 텍스트 기호로 fallback */
export function cssMaskSupported(): boolean {
  if (maskSupportCache === null) {
    maskSupportCache =
      typeof CSS !== 'undefined' &&
      (CSS.supports('mask-image', 'url("data:,")') ||
        CSS.supports('-webkit-mask-image', 'url("data:,")'));
  }
  return maskSupportCache;
}

/**
 * DOM 요소를 세력 마크로 칠한다 — `background: currentColor` + SVG 마스크.
 * 색은 부모의 `color`(보조 정보)를 따르고 형태는 마스크가 결정한다.
 * 호출 전 `cssMaskSupported()` 확인은 소비 측 책임 (fallback 분기).
 */
export function applyMarkMask(
  element: HTMLElement,
  shape: FactionMarkShape,
  solid: boolean,
): void {
  const uri = MASK_URI[`${shape}:${solid ? 'solid' : 'detail'}`]!;
  element.style.backgroundColor = 'currentColor';
  element.style.setProperty('-webkit-mask-image', uri);
  element.style.setProperty('mask-image', uri);
  element.style.setProperty('-webkit-mask-size', 'contain');
  element.style.setProperty('mask-size', 'contain');
  element.style.setProperty('-webkit-mask-repeat', 'no-repeat');
  element.style.setProperty('mask-repeat', 'no-repeat');
  element.style.setProperty('-webkit-mask-position', 'center');
  element.style.setProperty('mask-position', 'center');
}

/**
 * WebGL 아틀라스 셀 규격 — `public/textures/faction_marks_512.webp`
 * (512×256, 셀 128px): 열 0=사각 · 1=삼각 · 2=마름모 (열 3 예비),
 * 행: 텍스처 V 상단(0.5..1.0)=디테일 · 하단(0.0..0.5)=솔리드.
 */
const ATLAS_COLUMN: Readonly<Record<FactionMarkShape, number>> = {
  square: 0,
  triangle: 1,
  diamond: 2,
};
/** 셀 가장자리 블리딩 방지 인셋 (2px/512) */
const ATLAS_INSET = 2 / 512;

export interface MarkAtlasCell {
  readonly uOffset: number;
  readonly uScale: number;
  readonly vOffset: number;
  readonly vScale: number;
}

/** 아틀라스 UV 셀 — PlaneGeometry의 0..1 UV를 `uv*scale+offset`으로 매핑 */
export function markAtlasCell(shape: FactionMarkShape, solid: boolean): MarkAtlasCell {
  const column = ATLAS_COLUMN[shape];
  return {
    uOffset: column * 0.25 + ATLAS_INSET,
    uScale: 0.25 - ATLAS_INSET * 2,
    vOffset: (solid ? 0 : 0.5) + ATLAS_INSET,
    vScale: 0.5 - ATLAS_INSET * 2,
  };
}
