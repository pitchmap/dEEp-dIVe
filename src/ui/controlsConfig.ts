/**
 * 조작 바인딩 단일 데이터 소스.
 *
 * 조작 안내 UI(ControlsHud)의 표기와 HUD가 직접 처리하는 키 코드가
 * 전부 이 배열에서 나온다 — 안내 문구와 실제 입력 처리가 서로 어긋나지
 * 않게 하기 위한 장치다.
 *
 * owner:
 *  - 'gameplay': 조작 자체는 게임플레이 파트 구현(D3+) — 여기서는 표기만
 *  - 'hud':      ControlsHud가 직접 처리 (code 필드가 실제 판정 기준)
 *  - 'browser':  브라우저 기본 동작(Esc의 Pointer Lock 해제 등)에 HUD가 반응
 */

export interface ControlBinding {
  /** 안내 UI에 표시할 키·조작 이름 */
  label: string;
  /** 안내 UI에 표시할 동작 설명 */
  action: string;
  /** HUD가 직접 keydown 판정에 쓰는 KeyboardEvent.code (owner 'hud'만) */
  code?: string;
  owner: 'gameplay' | 'hud' | 'browser';
}

export const CONTROL_BINDINGS: readonly ControlBinding[] = [
  { label: 'W / S', action: '전진 · 후진', owner: 'gameplay' },
  { label: 'A / D', action: '좌우 선회', owner: 'gameplay' },
  // 입력 규칙 확정 (PvE 1차 통합): Ctrl(또는 E) = 상승 / Shift = 하강.
  // 조준은 홀드가 아니라 우클릭 토글이며, 비조준 좌클릭은 카메라 조작이다.
  { label: 'Ctrl / E · Shift', action: '상승 · 하강', owner: 'gameplay' },
  // 입력 키 최종 정책 (M1·M2 인계표 §9 확정): F 홀드 = 상호작용·회수.
  // E는 상승 병행 키로 무변경 보존 — 상승·회수 동시 진행 충돌 제거.
  { label: 'F (홀드)', action: '상호작용 · 회수', owner: 'gameplay' },
  // 액티브 소나 핑 = Q (Runtime Closure 교차 감사 확정 — 표기만, 판정·쿨다운
  // 수치는 게임플레이·params 소유라 여기 싣지 않는다).
  { label: 'Q', action: '액티브 소나 핑', owner: 'gameplay' },
  { label: 'Space', action: '카메라 리센터', owner: 'gameplay' },
  { label: '우클릭', action: '조준경 토글', owner: 'hud' },
  { label: '좌클릭', action: '조준 중 발사 · 비조준 시 카메라', owner: 'hud' },
  { label: 'H', action: '조작 안내 · 화면 버튼 표시/숨김', code: 'KeyH', owner: 'hud' },
  { label: 'Esc', action: 'Pointer Lock 해제 · 일시정지', owner: 'browser' },
];

/** H 토글처럼 HUD가 keydown으로 직접 처리하는 코드 조회 */
export function hudKeyCode(label: string): string {
  const binding = CONTROL_BINDINGS.find((b) => b.label === label && b.code);
  if (!binding?.code) {
    throw new Error(`[controlsConfig] '${label}' 바인딩에 코드가 정의되어 있지 않습니다`);
  }
  return binding.code;
}
