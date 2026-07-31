# src/systems — 게임플레이 시스템 (게임플레이 파트 소유)

이 디렉터리는 **게임플레이 프로그래머(역할 프롬프트: `prompts/GAMEPLAY.md`)의 소유 영역**이다.

## 여기에 구현될 것 (D3 이후)

`src/contracts/systems.ts`의 인터페이스 구현체:

- `PlayerController` — WASD 이동·관성 (수치: `params/movement.json`)
- `DepthSystem` — 심도 3층 전환 (Shift/Ctrl)
- `DetectionSystem` — 탐지 게이지 (소음×거리×심도, 시스템 허브)
- `TorpedoSystem` — 수동 조준·리드샷·발사 지점 노출
- `DepthChargeSystem` — 폭뢰 3초 신관 판정·밀려남
- `DestroyerAI` — 구축함 상태 기계 (VS는 경계·공격 2상태)
- `HullSystem` — 내구도·침수 (실패 = 내구도 0 단일)

## 규칙

1. 다른 모듈과의 통신은 EventBus(`src/contracts/events.ts`)로만 한다.
   렌더·오디오·UI를 직접 import 하지 않는다.
2. 밸런스 수치는 전부 `params/*.json`에서 주입받는다. 하드코딩 금지.
3. 계약(`src/contracts/*`) 변경이 필요하면 `docs/INTEGRATION_NOTES.md`에
   먼저 제안한다.
4. 제외 범위 기능(`docs/deep_dive_master_plan.md` §6.3)의 파일·클래스·스텁을
   만들지 않는다.
