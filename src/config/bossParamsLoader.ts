/**
 * params/boss.json 공인 로더 (Vite JSON import — production composition 전용).
 *
 * 검증은 `bossParams.validateBossParams` 한 곳이다. Node 검증 러너는 이
 * 파일을 import하지 않고 JSON을 직접 읽어 validate에 주입한다
 * (combatParamsLoader / combatParams 분리와 동일 관례).
 */

import bossJson from '../../params/boss.json';
import type { BossParams } from '../contracts/params';
import { validateBossParams } from './bossParams';

let cached: BossParams | null = null;

/** 공인 보스 params 로드 — composition root에서 1회 호출 (캐시) */
export function loadBossParams(): BossParams {
  if (cached === null) cached = validateBossParams(bossJson);
  return cached;
}
