/**
 * 저사양 fallback 사다리 (`?quality=low`) — 아트 디렉션 연출의 단계 축소.
 *
 * 축소 대상은 **순수 연출**뿐이다: 부유물 개수 · 림라이트 · 항법등 글로우.
 * 카메라·안개 거리·재질 기본색·게임플레이 표시는 품질과 무관하게 동일하다
 * (판정·가독성 요소는 저사양에서도 유지).
 *
 * 값은 renderVisualParams.json(artDirection.lowSpec)에서만 온다 — 코드에
 * 수치를 복제하지 않는다.
 */

import visualParams from './renderVisualParams.json';

const ART = visualParams.artDirection;

export interface RenderQuality {
  /** `?quality=low` 여부 (표시·로그용) */
  readonly low: boolean;
  /** 부유물 파티클 개수 */
  readonly driftCount: number;
  /** 잠수함 프레넬 림라이트 사용 여부 */
  readonly rimEnabled: boolean;
  /** 항법등(주황 식별 글로우) 사용 여부 */
  readonly navGlowEnabled: boolean;
}

/** URL 쿼리에서 품질 단계 해석 — 기본은 표준(전체 연출) */
export function parseRenderQuality(search: string): RenderQuality {
  const low = new URLSearchParams(search).get('quality') === 'low';
  if (low) {
    return {
      low: true,
      driftCount: ART.lowSpec.driftCount,
      rimEnabled: ART.lowSpec.rimEnabled,
      navGlowEnabled: ART.lowSpec.navGlowEnabled,
    };
  }
  return {
    low: false,
    driftCount: ART.drift.count,
    rimEnabled: true,
    navGlowEnabled: true,
  };
}
