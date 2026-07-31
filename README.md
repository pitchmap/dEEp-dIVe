# 딥 다이브 (가제)

> UBOAT의 긴장감을, Submarine Attack의 즉각성으로, 바이브세일의 그래픽 비용으로 —
> 브라우저에서 바로 실행되는 세션형(7~10분) 로우폴리 3D 잠수함 서바이벌 액션.

**현재 단계: 15영업일 버티컬 슬라이스 (D1~D2 환경 구축 완료).**
모든 작업·논쟁·판정의 유일한 기준 문서는 [`docs/deep_dive_master_plan.md`](docs/deep_dive_master_plan.md)이다.

## 기술 스택

| 영역 | 선택 |
|---|---|
| 렌더링 | Three.js |
| 빌드 | Vite |
| 언어 | TypeScript |
| 물리 | 자체 간이 물리 (구 충돌 + 밀려남 벡터) |
| 오디오 | Web Audio API (카메라 기준 패너) |
| 파라미터 | JSON 외부 파일 (`params/*.json`) |
| 배포 | 정적 호스팅 (서버·DB 없음) |
| 저장소 | GitHub 단일 리포 |

Unity·Babylon.js·React·백엔드·물리엔진은 도입하지 않는다 (마스터 플랜 §7.1).

## 설치 및 실행

```bash
npm install        # 의존성 설치 (Node 20+)
npm run dev        # 개발 서버 (기본 http://localhost:5173)
npm run typecheck  # TypeScript 타입 검사
npm run build      # 프로덕션 빌드 → dist/
npm run check:size # dist 용량 검사 (15MB 게이트, G2)
npm run status     # 브랜치·빌드·현황 요약 출력
```

## 폴더 구조

```
src/
  core/       게임 루프·상태 머신·이벤트 버스·장면 관리 (개발 리드 소유)
  contracts/  이벤트·시스템·파라미터 계약 (공통 보호 파일)
  config/     파라미터 로더·런타임 검증
  systems/    게임플레이 시스템 (D3 이후 — 게임플레이 파트 소유)
  render/     렌더러·장면 (그래픽스 파트 소유)
  audio/      Web Audio 배관 (툴링 파트 소유)
  ui/         성능 오버레이 등 UI
  tools/      로딩 타이머·게이트 계측 기록
params/       밸런스 수치 JSON — 기획 직접 커밋 영역, 하드코딩 금지
assets/       모델(D+8)·사운드(D+10)·텍스처
scripts/      빌드 용량 검사, 상태 출력
docs/         마스터 플랜·아키텍처·규칙·회의록·템플릿
prompts/      역할별 Claude Code 프롬프트
.github/      CI·PR/이슈 템플릿
```

## 주요 문서

- [마스터 플랜 (유일한 최상위 기준)](docs/deep_dive_master_plan.md)
- [아키텍처](docs/ARCHITECTURE.md) · [인터페이스 계약표](docs/INTERFACES.md)
- [파일 소유권](docs/FILE_OWNERSHIP.md) · [현재 상태](docs/CURRENT_STATUS.md)
- [브랜치 규칙](docs/BRANCHING.md) · [개발 워크플로](docs/DEVELOPMENT_WORKFLOW.md)
- [게이트 G1~G9](docs/GATES.md) · [유효 결정 목록](docs/DECISIONS.md)
- [통합 노트(계약 변경 절차)](docs/INTEGRATION_NOTES.md)
- [Claude Code 공통 규칙](CLAUDE.md) · [역할 프롬프트](prompts/)

## 브랜치 규칙 요약

- `main` — 항상 배포 가능. 직접 푸시 금지. `dev`→`main`은 D+5/D+10/D+15에만
- `dev` — 통합 브랜치, 항상 실행 가능 상태 유지. `feat`→`dev`는 1인 리뷰
- `feat/*` — 역할별 작업 브랜치
- 게이트 수치에 영향 주는 커밋은 `[G1]`~`[G9]` 태그

상세: [docs/BRANCHING.md](docs/BRANCHING.md)

## 현재 구현 범위 (D1~D2)

- 실행 가능한 Three.js 부트스트랩 장면 (전체 화면 캔버스, 포그, 기준 오브젝트)
- 게임 루프 (rAF, delta time, update/render 분리)
- 게임 상태 타입·전환 구조 (BOOT/DEPARTURE/APPROACH/ATTACK/ESCAPE/RESULT)
- 타입 안전 이벤트 버스 + 이벤트 계약 10종
- 시스템 인터페이스 계약 9종 (구현체 없음 — D3 이후)
- 파라미터 JSON 4종 + 타입 + 런타임 범위 검증
- 성능 오버레이(FPS·로딩·렌더러 정보), 로딩 타이머, 게이트 계측 JSON 다운로드
- 빌드 용량 검사 스크립트 (15MB 게이트)

## 제외 범위 [확정 — 스텁도 금지]

강화 카드 / 승무원 이동 애니메이션 / 구축함 격침 / 자동 조준·페이드아웃 /
복잡한 카메라 흔들림 / 어군·장식 오브젝트 / 멀티플레이 / 영구 성장 / 수익화 /
추가 해역 / 라이브 서비스 (마스터 플랜 §6.3~6.4)
