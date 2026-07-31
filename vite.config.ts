import { defineConfig } from 'vite';

// 정적 호스팅(하위 경로 배포 포함) 대응을 위해 상대 경로 base 사용.
// 서버·백엔드 없음 — 순수 정적 빌드만 산출한다.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
