# SHARED_RULES — 모든 역할 공통 규칙 요약

> 원본: 저장소 루트 `CLAUDE.md` (충돌 시 CLAUDE.md가 우선). 각 역할 프롬프트와
> 함께 세션 시작 시 로드한다.

## 기준

1. 최상위 기준은 `docs/deep_dive_master_plan.md` 하나. 회의록은 역사 기록.
2. 최신 결정만 구현 — 폐기 결정(`docs/DECISIONS.md` ⛔구역)은 구현 근거 불가.
3. 마스터 플랜에 없는 기능은 존재하지 않는 기능 — 임의 추가 금지.
4. 제외 범위 기능의 스텁·빈 구조·"나중용 인터페이스" 생성 금지.

## 수치

5. 모든 밸런스 값은 `params/*.json` — 하드코딩 금지, JSON 역기록 금지.
6. 수치 변경은 관찰 근거 + `[Gx]` 태그 커밋 + TUNING_LOG 갱신 세트.

## 소유권

7. 자기 소유 영역 밖 수정 금지 (`docs/FILE_OWNERSHIP.md`).
8. 공통 계약(`src/contracts/*`)·공통 보호 파일 변경은
   `docs/INTEGRATION_NOTES.md` 제안 → 리드 승인 후에만.

## 절차

9. 작업 전 읽기: `docs/CURRENT_STATUS.md` → `FILE_OWNERSHIP.md` → `INTERFACES.md`
10. 작업 후 `CURRENT_STATUS.md` 자기 구역 갱신.
11. 완료 전 `npm run typecheck` + `npm run build` 통과 확인.
12. dev·main을 깨진 상태로 만들지 않기 — 절반 작업은 `feat/*`에.

## 공통 완료 보고 양식 (모든 역할, 세션 종료 시)

```
### 완료 보고
- 변경 파일:
- 구현한 기능:
- 실행한 검사: (typecheck / build / check:size / 수동 확인 항목)
- 검사 결과:
- 남은 문제:
- 계약 변경 여부: (없음 / INTEGRATION_NOTES #번호)
- 통합 시 주의사항:
- 권장 커밋 메시지: (게이트 영향 시 [Gx] 태그 포함)
```
