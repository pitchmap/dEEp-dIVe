# BRANCHING — 브랜치 전략

> 마스터 플랜 §10.1~10.2 [확정].

## 브랜치

| 브랜치 | 규칙 |
|---|---|
| `main` | **항상 배포 가능 상태. 직접 푸시 금지.** dev→main 병합은 주간 빌드일에만 |
| `dev` | 통합 브랜치. **항상 실행 가능 상태 유지** — dev가 깨진 채 하루를 넘기지 않는다 |
| `feat/*` | 역할별 작업 브랜치. 작업 중 깨진 상태 허용 — 절반짜리 작업은 feat에 두고 dev에 올리지 않는다 |

권장 이름: `feat/gameplay-*`, `feat/graphics-*`, `feat/tooling-*`, `feat/lead-*`, `feat/params-*`.

## 병합 규칙

- **feat → dev:** 1인 리뷰 필수. 리뷰 관점: 로직 정확성, 인터페이스 준수
  (특히 DetectionSystem), 하드코딩 유무, 게이트 태그 유무, 파일 소유권 준수
- **dev → main:** **D+5 / D+10 / D+15 주간 빌드일에만**, 개발 리드 승인 필수.
  병합 후 배포 URL 전사 공유, 24시간 내 디렉터 컷 결정

## 커밋 규칙

- 게이트 수치에 영향 주는 커밋은 메시지에 **`[G1]`~`[G9]` 태그**
  (예: `feat: [G7] 폭뢰 동시 수 4→5 조정`) — 게이트 리뷰에서 "언제 무엇이
  바뀌어 fps가 떨어졌나"를 역추적하기 위함
- params 수치 변경 커밋은 태그 + `docs/templates/TUNING_LOG.md` 갱신이 세트
- 완료 전 `npm run typecheck`·`npm run build` 통과 필수 (CLAUDE.md 규칙 11)

## CI

pull request와 `dev`·`main` push에서 `.github/workflows/ci.yml`이
`npm ci → typecheck → build → check:size`를 실행한다. CI 실패 상태로 병합 금지.
