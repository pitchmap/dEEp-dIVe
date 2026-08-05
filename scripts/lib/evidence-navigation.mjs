/**
 * EC12 러너 항해 보조 — **순수 함수**라 단위 테스트로 검증한다.
 *
 * 좌표를 쓰지 않는다. read-only pose를 읽어 **어떤 실제 키를 누를지**만
 * 고른다 — position 직접 쓰기·teleport·transform 변경·강제 spawn·trigger 직접
 * 호출은 이 파일에도, 러너에도 없다.
 */

/**
 * clue 등 컬렉션의 개수를 읽는다.
 *
 * 실제 관측에서 `bossProgress.collected`는 **`Set`**이었다(size 0). 배열·숫자만
 * 지원하면 진짜 3/3 프로필에서도 `collected=null`이 되어
 * `PROFILE_STATE_DOES_NOT_MATCH_PROVENANCE`로 **거짓 차단**된다.
 *
 * 문자열의 `length`나 임의 객체를 개수로 오인하지 않는다 — `size`가 유한한
 * 음이 아닌 숫자일 때만 인정한다.
 */
export function readCollectionCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  if (
    value != null &&
    typeof value === 'object' &&
    typeof value.size === 'number' &&
    Number.isFinite(value.size) &&
    value.size >= 0
  ) {
    return value.size;
  }
  return null;
}

/**
 * 직전 pose와 현재 pose의 **실제 이동 벡터**로 heading을 추정한다.
 * 위치를 쓰지 않고 읽기만 하며, 짧은 전진 입력의 결과를 관측해 방향을 안다.
 */
export function inferHeadingFromMovement(previousPose, currentPose, minimumMovement = 0.35) {
  if (!previousPose || !currentPose) return null;
  const dx = currentPose.x - previousPose.x;
  const dz = currentPose.z - previousPose.z;
  if (!Number.isFinite(dx) || !Number.isFinite(dz)) return null;
  if (Math.hypot(dx, dz) < minimumMovement) return null;
  return Math.atan2(dx, dz);
}

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
  scanStep = 0,
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

  // heading을 모르면 **KeyW만 반복하지 않는다** — 그러면 목표가 뒤에 있어도
  // 영원히 반대로 전진한다(실측: 목표 z=+43인데 z=-12로 이동 후 경계 정지).
  // 실제 마우스 sweep으로 방향을 바꾸고, 짧은 전진의 이동 벡터로 heading을
  // 추정해 다음 회전을 정한다.
  if (headingRadians === null || !Number.isFinite(headingRadians)) {
    const magnitude = 45 + (Math.floor(scanStep / 2) % 3) * 25;
    return {
      keys: [],
      mouseDx: scanStep % 2 === 0 ? magnitude : -magnitude,
      reason: `heading 미관측 — 실제 마우스 sweep으로 방향 탐색 (step ${scanStep})`,
      arrived: false,
    };
  }

  // 목표 방위(+Z 기준).
  const bearing = Math.atan2(target.x - player.x, target.z - player.z);
  let delta = bearing - headingRadians;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  // 상대 마우스 이동으로 시선을 목표 쪽으로 돌린다 (부호만 의미 있음).
  const mouseDx = Math.max(-60, Math.min(60, Math.round(delta * 60)));

  // 목표가 뒤쪽(±90° 밖)이면 전진하지 않고 먼저 돌아선다.
  if (Math.abs(delta) > Math.PI / 2) {
    return {
      keys: [],
      mouseDx,
      reason: `목표가 후방(${((delta * 180) / Math.PI).toFixed(0)}°) — 전진 전에 회전`,
      arrived: false,
    };
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
