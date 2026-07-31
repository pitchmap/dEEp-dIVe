# CLAUDE.md — 모든 Claude Code 창의 공통 규칙

이 저장소에서 작업하는 모든 Claude Code 인스턴스는 역할과 무관하게 아래 규칙을
항상 따른다. 역할별 추가 규칙은 `prompts/` 참조.

## 기준과 결정

1. **최상위 기준은 `docs/deep_dive_master_plan.md` 하나뿐이다.**
   회의록(`docs/meetings/`)과 충돌하면 마스터 플랜을 따른다.
2. **최신 결정만 구현한다.** 폐기된 결정(2D 사이드뷰, 자동 조준 우선,
   강화 카드 등 — `docs/DECISIONS.md`의 '구현 금지' 구역)은 구현 근거로
   사용할 수 없다.
3. **새 기능을 임의로 추가하지 않는다.** 마스터 플랜에 없는 기능은 존재하지
   않는 기능이다. 아이디어는 백로그로만 (R13).
4. **제외 범위 기능의 스텁을 만들지 않는다.** 파일·클래스·인터페이스·빈 구조·
   "나중을 위한 자리" 전부 금지 (§6.4). 유일한 예외: 인스턴싱 렌더 경로(공용 기술).

## 수치와 파라미터

5. **모든 밸런스 값은 `params/*.json`에 둔다.**
6. **파라미터 하드코딩 금지.** 코드에 수치를 복제하지 않는다. JSON → 시스템
   단방향 주입만 허용, 코드에서 JSON 역기록 금지.

## 소유권과 계약

7. **자기 역할의 소유 영역 밖 파일을 수정하지 않는다**
   (`docs/FILE_OWNERSHIP.md`). 공통 보호 파일은 리드 승인 없이 변경 금지.
8. **공통 계약(`src/contracts/*`) 변경은 `docs/INTEGRATION_NOTES.md`에 먼저
   제안**하고 개발 리드 결정 후에만 반영한다.

## 작업 절차

9. **작업 전** `docs/CURRENT_STATUS.md`, `docs/FILE_OWNERSHIP.md`,
   `docs/INTERFACES.md`를 읽는다.
10. **작업 후** `docs/CURRENT_STATUS.md`의 자기 역할 구역을 갱신한다.
11. **완료 전** `npm run typecheck`와 `npm run build`를 실행하고 통과를
    확인한다 (빌드 후 `npm run check:size` 권장).
12. **`dev`·`main`을 깨진 상태로 만들지 않는다.** 절반짜리 작업은 `feat/*`에
    남긴다. `main` 직접 푸시 금지 (`docs/BRANCHING.md`).
13. **데이터나 근거 없는 기능·밸런스 변경 금지.** 수치 변경은 관찰 결과 +
    사전 정의된 판단 기준(`docs/templates/TUNING_LOG.md`, 마스터 플랜 §11)에
    근거해야 하며, 커밋에 `[G1]`~`[G9]` 태그를 단다.

## 빠른 참조

```bash
npm run dev / typecheck / build / check:size / status
```

- 이벤트 계약: `src/contracts/events.ts` · 시스템 계약: `src/contracts/systems.ts`
- 파라미터 타입: `src/contracts/params.ts` · 검증: `src/config/validateParams.ts`
- 제외 범위 목록: 마스터 플랜 §6.3 / `docs/DECISIONS.md`
