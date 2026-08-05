/**
 * EC12 러너 항해 보조 — **순수 함수**라 단위 테스트로 검증한다.
 *
 * 좌표를 쓰지 않는다. read-only pose를 읽어 **어떤 실제 키를 누를지**만
 * 고른다 — position 직접 쓰기·teleport·transform 변경·강제 spawn·trigger 직접
 * 호출은 이 파일에도, 러너에도 없다.
 */

/** 두 지점의 수평 거리 */
export function horizontalDistance(a, b) {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * 목표를 향해 누를 키를 고른다.
 *
 * `headingRadians`는 플레이어가 바라보는 방향(+Z 기준, 시계 방향). 목표까지의
 * 방위와의 차이로 좌/우 회전을 정하고, 거리로 전진/후진을 정한다.
 *
 * 반환은 **누를 키 목록과 마우스 상대 이동량**뿐이다 — 실제 입력은 러너가
 * Playwright의 실제 keyboard/mouse API로 수행한다.
 */
export function chooseNavigationInput({
  player,
  target,
  headingRadians = null,
  arriveWithin = 12,
  retreatWithin = 4,
}) {
  if (!player || !target) {
    return { keys: [], mouseDx: 0, reason: 'pose 미관측 — 입력 없음', arrived: false };
  }
  const dist = horizontalDistance(player, target);
  if (dist !== null && dist <= arriveWithin && dist > retreatWithin) {
    return { keys: [], mouseDx: 0, reason: `목표 반경 안(${dist.toFixed(1)}m) — 정지`, arrived: true };
  }

  // 목표 방위(+Z 기준). 카메라 heading을 모르면 회전만으로 탐색한다.
  const bearing = Math.atan2(target.x - player.x, target.z - player.z);
  let mouseDx = 0;
  if (headingRadians !== null && Number.isFinite(headingRadians)) {
    let delta = bearing - headingRadians;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    // 상대 마우스 이동으로 시선을 목표 쪽으로 돌린다 (부호만 의미 있음).
    mouseDx = Math.max(-60, Math.min(60, Math.round(delta * 60)));
  }

  const keys = [];
  if (dist !== null && dist <= retreatWithin) {
    keys.push('KeyS'); // 너무 붙었으면 살짝 물러난다
  } else {
    keys.push('KeyW');
  }
  // 깊이 보정 — 목표가 확연히 아래/위면 하강·상승을 함께 누른다.
  if (typeof player.y === 'number' && typeof target.y === 'number') {
    if (target.y < player.y - 2) keys.push('ControlLeft');
    else if (target.y > player.y + 2) keys.push('Space');
  }
  return {
    keys,
    mouseDx,
    reason: `거리 ${dist === null ? '미상' : `${dist.toFixed(1)}m`} — ${keys.join('+')}`,
    arrived: false,
  };
}

/**
 * 신규 피해가 실제로 추가됐는지 판정한다.
 *
 * 누적 수가 0보다 큰지만 보면 **첫 피해 이후 영원히 true**가 되어, idle 타이머가
 * 매 폴링마다 갱신되고 nudge가 영영 발생하지 않는다. 반드시 직전 관측 대비
 * **증가분**으로 판단한다.
 */
export function hasNewDamage(previousCount, currentCount) {
  return Number.isFinite(currentCount) && Number.isFinite(previousCount)
    && currentCount > previousCount;
}
