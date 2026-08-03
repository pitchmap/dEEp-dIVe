/**
 * 품질 단계 사다리 (`?quality=low|high`, 기본 = Medium) — 아트 디렉션 연출의
 * 단계 조절.
 *
 * 조절 대상은 **순수 연출**뿐이다: 부유물 개수 · 림라이트 · 항법등 글로우 ·
 * 텍스처 해상도 · 탐조등 빔 콘 · 프로펠러 기포/블러 디스크.
 * 카메라·안개 거리·재질 기본색·게임플레이 표시·실제 광원 수(§12.2 예산)는
 * 품질과 무관하게 동일하다 (판정·가독성 요소는 모든 단계에서 유지).
 *
 * 값은 renderVisualParams.json(artDirection.lowSpec/highSpec)에서만 온다 —
 * 코드에 수치를 복제하지 않는다.
 */

import visualParams from './renderVisualParams.json';

const ART = visualParams.artDirection;

export type RenderQualityTier = 'low' | 'medium' | 'high';

export interface RenderQuality {
  /** 품질 단계 (표시·로그용) */
  readonly tier: RenderQualityTier;
  /** `?quality=low` 여부 (기존 소비 코드 호환) */
  readonly low: boolean;
  /** 부유물 파티클 개수 */
  readonly driftCount: number;
  /** 잠수함 프레넬 림라이트 사용 여부 */
  readonly rimEnabled: boolean;
  /** 항법등(주황 식별 글로우) 사용 여부 */
  readonly navGlowEnabled: boolean;
  /** base color 텍스처 해상도 상한 (null = 텍스처별 표준 크기 사용) */
  readonly textureSizeCap: number | null;
  /** 탐조등 반투명 빔 콘 표시 여부 (실제 광원은 전 단계 동일 1개) */
  readonly headlightBeamsEnabled: boolean;
  /** 프로펠러 기포 풀 상한 */
  readonly wakeMaxBubbles: number;
  /** 기포 수명 배율 (낮으면 wake가 짧아진다) */
  readonly wakeLifeScale: number;
  /** 프로펠러 회전 블러 디스크 사용 여부 */
  readonly propDiscBlurEnabled: boolean;
}

/** URL 쿼리에서 품질 단계 해석 — 기본 Medium (전체 연출·표준 밀도) */
export function parseRenderQuality(search: string): RenderQuality {
  const raw = new URLSearchParams(search).get('quality');
  if (raw === 'low') {
    return {
      tier: 'low',
      low: true,
      driftCount: ART.lowSpec.driftCount,
      rimEnabled: ART.lowSpec.rimEnabled,
      navGlowEnabled: ART.lowSpec.navGlowEnabled,
      textureSizeCap: ART.lowSpec.textureSize,
      headlightBeamsEnabled: ART.lowSpec.headlightBeamsEnabled,
      wakeMaxBubbles: ART.lowSpec.wakeMaxBubbles,
      wakeLifeScale: ART.lowSpec.wakeLifeScale,
      propDiscBlurEnabled: ART.lowSpec.propDiscBlurEnabled,
    };
  }
  if (raw === 'high') {
    return {
      tier: 'high',
      low: false,
      driftCount: ART.highSpec.driftCount,
      rimEnabled: true,
      navGlowEnabled: true,
      textureSizeCap: null,
      headlightBeamsEnabled: true,
      wakeMaxBubbles: ART.highSpec.wakeMaxBubbles,
      wakeLifeScale: 1,
      propDiscBlurEnabled: true,
    };
  }
  return {
    tier: 'medium',
    low: false,
    driftCount: ART.drift.count,
    rimEnabled: true,
    navGlowEnabled: true,
    textureSizeCap: null,
    headlightBeamsEnabled: true,
    wakeMaxBubbles: ART.wake.maxBubbles,
    wakeLifeScale: 1,
    propDiscBlurEnabled: true,
  };
}
