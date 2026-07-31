# DEPLOY — 정적 호스팅 배포 (빌드·툴 소유)

> 마스터 플랜 §7.1 [확정]: **정적 호스팅 + CDN, 서버 없음.** 백엔드·DB·사용자
> 추적 도구는 도입하지 않는다.

## 선택한 방식: GitHub Pages (GitHub Actions 배포)

| 항목 | 내용 |
|---|---|
| 방식 | `.github/workflows/deploy.yml` — 빌드 후 `dist/`를 Pages로 업로드 |
| 선택 이유 | 저장소가 이미 GitHub 단일 리포(§10) — 추가 계정·토큰·외부 서비스 불필요. CDN 포함, 순수 정적 |
| 트리거 | `main` 푸시 (= 주간 빌드일 dev→main 병합, §10.4) + 수동 실행(workflow_dispatch) |
| 배포 전 검증 | `npm ci` → `typecheck` → `build` → `check:size`(15MB 게이트) 전부 통과해야 배포 |
| 예상 URL | `https://pitchmap.github.io/dEEp-dIVe/` (Pages 활성화 후 Actions 로그·Settings에서 확인) |
| 하위 경로 대응 | `vite.config.ts`의 `base: './'` — 이미 상대 경로라 추가 설정 불필요 |

## 사용자(저장소 관리자)가 해야 하는 1회 수동 설정

자동화가 대신할 수 없는 부분이다 — 이 설정 전에는 워크플로가 Pages 승인
단계에서 실패한다.

1. GitHub 저장소 → **Settings → Pages**
2. **Build and deployment → Source**를 **"GitHub Actions"**로 변경
3. (조직 정책에 따라) Settings → Actions에서 워크플로 실행 허용 확인

이후 주간 빌드일에 dev→main 병합(리드 승인)이 일어나면 자동 배포된다.
첫 배포는 main 병합 전이라도 Actions 탭에서 `Deploy (GitHub Pages)`를
수동 실행(workflow_dispatch)해 빈 씬 URL을 확보할 수 있다.

## 현재 차단 문제 (D2 완료 조건의 잔여분)

- 이 작업 환경에는 Pages 설정 권한·배포 인증 정보가 없어 **실제 배포 URL은
  아직 미확보**다. 위 1회 설정 + 워크플로 1회 실행이 필요하다.
- 실패 시 강등 경로(마스터 플랜 단계 0 규칙): `npm run build` 산출물
  `dist/`를 임의 정적 호스팅에 수동 업로드 → D+5 전 재자동화.

## 운영 메모

- 배포는 빌드 산출물만 올린다 — 서버 코드·API·수집 스크립트 없음.
- `?debug=1`을 붙이면 프로덕션 빌드에서도 계측 오버레이가 켜진다
  (G1·G2 측정: 지정 노트북에서 이 URL로 접속해 게이트 기록 JSON 다운로드).
