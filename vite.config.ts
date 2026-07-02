import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5176,
    strictPort: false,
    // 🟠 `npm run dev` 로컬 실행 시 `/api/*` 요청은 실제 배포된 Vercel 함수로 프록시.
    //    Vite dev 서버는 Serverless Function 을 처리 못 하기 때문. 서버리스 함수 자체를
    //    수정 중이면 이 방식으로는 최신 코드가 반영되지 않으므로 `npx vercel dev` 로 전환할 것.
    proxy: {
      '/api': {
        target: 'https://saas-beta-pied.vercel.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
